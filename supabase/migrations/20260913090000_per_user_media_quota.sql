-- ============================================================================
-- The Traders Planet App — move the 100 MB media quota from the conversation
-- onto the user who actually uploaded the bytes.
--
-- What was wrong
-- --------------
-- 20260821090000_chat_media_polish.sql accounts for media per *conversation*:
-- recalc_conversation_media_usage() sums every message in a thread, and
-- select_chat_media_to_purge() evicts that thread's oldest media regardless of
-- who sent it. A student's thread holds the admin's uploads too, so:
--
--   * an admin sending charts into a student's thread consumes the student's
--     budget, and pushes the thread over the cap on the student's behalf;
--   * the FIFO eviction that follows takes whichever row is oldest — which can
--     be the *other* party's media. One user's upload deletes another user's
--     file. That is the case the requirement rules out outright.
--
-- It also means an admin has no bound at all: their media is spread across N
-- threads, each with its own separate 100 MB.
--
-- What this migration does
-- ------------------------
-- Usage and eviction are keyed on messages.sender_id instead of
-- conversation_id, so every user carries their own independent 100 MB and a
-- purge can only ever nominate rows that user uploaded themselves.
--
-- The per-conversation counter stays: conversations.media_bytes_used is still
-- maintained, because the thread-level figure is still the useful one to show
-- inside a thread. It is no longer what the cap is enforced against.
--
-- Not changed: no RLS policy, no grant to a client role, no message/post row is
-- deleted, no R2 key convention. Every function here is SECURITY DEFINER and
-- server-only, matching 20260824120000_restrict_server_only_functions.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Per-user counter
--
-- Mirrors conversations.media_bytes_used: a cached total kept in step by
-- trigger, so the common path reads one column instead of aggregating.
-- ----------------------------------------------------------------------------

alter table public.profiles
  add column if not exists media_bytes_used bigint not null default 0;

comment on column public.profiles.media_bytes_used is
  'Bytes this user currently stores in R2 (chat media, including poster frames). '
  'Maintained by trigger; the 100 MB quota is enforced against this figure.';

-- ----------------------------------------------------------------------------
-- 2. Usage for one user
--
-- Same eligibility rule the conversation version uses: a row counts while it
-- holds a storage key and has not been purged. Pending rows count from the
-- moment they are written, which is what stops two uploads started together
-- from each believing they fit.
-- ----------------------------------------------------------------------------

create or replace function public.recalc_user_media_usage(p_user_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total bigint;
begin
  if p_user_id is null then
    return 0;
  end if;

  select coalesce(sum(coalesce(size_bytes, 0) + coalesce(poster_size_bytes, 0)), 0)
    into v_total
  from public.messages
  where sender_id = p_user_id
    and storage_key is not null
    and not media_purged;

  update public.profiles set media_bytes_used = v_total where id = p_user_id;
  return v_total;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. Keep both counters in step
--
-- Replaces the conversation-only trigger function. A single row change can
-- touch two conversations and two senders (an UPDATE that moves either), so
-- both sides of the row are recalculated.
-- ----------------------------------------------------------------------------

create or replace function public.sync_conversation_media_usage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recalc_conversation_media_usage(coalesce(new.conversation_id, old.conversation_id));
  if tg_op = 'UPDATE' and new.conversation_id is distinct from old.conversation_id then
    perform public.recalc_conversation_media_usage(old.conversation_id);
  end if;

  perform public.recalc_user_media_usage(coalesce(new.sender_id, old.sender_id));
  if tg_op = 'UPDATE' and new.sender_id is distinct from old.sender_id then
    perform public.recalc_user_media_usage(old.sender_id);
  end if;

  return null;
end;
$$;

drop trigger if exists messages_sync_media_usage on public.messages;
create trigger messages_sync_media_usage
  after insert or delete or update of
    size_bytes, poster_size_bytes, media_purged, storage_key, sender_id, conversation_id
  on public.messages
  for each row execute function public.sync_conversation_media_usage();

-- ----------------------------------------------------------------------------
-- 4. Per-user FIFO eviction
--
-- Oldest first, across every thread the user has uploaded into, and restricted
-- to rows whose sender_id is that user — so this can never nominate anyone
-- else's media. Rows still uploading (upload_status <> 'ready') are never
-- nominated: deleting the object under a running PUT would leave the row
-- pointing at nothing.
--
-- p_incoming_bytes is what the caller is about to add, so room is freed before
-- the bytes are sent rather than after the cap is already breached.
--
-- The running total is decremented in the loop, so the caller is handed the
-- smallest oldest-first set that brings the user back under the cap — one item
-- at a time, in order, stopping as soon as it fits.
-- ----------------------------------------------------------------------------

create or replace function public.select_user_media_to_purge(
  p_user_id uuid,
  p_limit_bytes bigint,
  p_incoming_bytes bigint default 0
)
returns table (id uuid, storage_key text, poster_key text, size_bytes bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used bigint;
  v_row record;
begin
  if p_user_id is null then
    return;
  end if;

  v_used := public.recalc_user_media_usage(p_user_id);

  if v_used + coalesce(p_incoming_bytes, 0) <= p_limit_bytes then
    return;
  end if;

  for v_row in
    select m.id, m.storage_key, m.poster_key,
           coalesce(m.size_bytes, 0) + coalesce(m.poster_size_bytes, 0) as total_bytes
    from public.messages m
    where m.sender_id = p_user_id
      and m.storage_key is not null
      and not m.media_purged
      and m.upload_status = 'ready'
    order by m.created_at asc, m.id asc
  loop
    exit when v_used + coalesce(p_incoming_bytes, 0) <= p_limit_bytes;
    id := v_row.id;
    storage_key := v_row.storage_key;
    poster_key := v_row.poster_key;
    size_bytes := v_row.total_bytes;
    v_used := v_used - v_row.total_bytes;
    return next;
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Purge bookkeeping across every affected owner
--
-- The previous version read conversation_id from the first id in the array and
-- recalculated only that thread. A per-user purge legitimately spans threads,
-- so every conversation and every sender touched is refreshed. The message row
-- itself survives, stripped of its media — the thread keeps its shape.
-- ----------------------------------------------------------------------------

create or replace function public.mark_chat_media_purged(p_message_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversations uuid[];
  v_senders uuid[];
  v_id uuid;
begin
  if p_message_ids is null or array_length(p_message_ids, 1) is null then
    return;
  end if;

  select array_agg(distinct conversation_id), array_agg(distinct sender_id)
    into v_conversations, v_senders
  from public.messages
  where id = any (p_message_ids);

  update public.messages
  set media_purged = true,
      storage_key = null,
      poster_key = null,
      size_bytes = 0,
      poster_size_bytes = 0
  where id = any (p_message_ids);

  foreach v_id in array coalesce(v_conversations, '{}'::uuid[]) loop
    perform public.recalc_conversation_media_usage(v_id);
  end loop;

  foreach v_id in array coalesce(v_senders, '{}'::uuid[]) loop
    perform public.recalc_user_media_usage(v_id);
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. Backfill
--
-- Every existing profile gets its true figure, so the cap is accurate from the
-- first upload after this migration rather than from the first purge.
-- ----------------------------------------------------------------------------

update public.profiles p
set media_bytes_used = coalesce((
  select sum(coalesce(m.size_bytes, 0) + coalesce(m.poster_size_bytes, 0))
  from public.messages m
  where m.sender_id = p.id
    and m.storage_key is not null
    and not m.media_purged
), 0);

-- ----------------------------------------------------------------------------
-- 7. Privileges
--
-- Server-only, exactly like every other maintenance function. EXECUTE is
-- revoked from PUBLIC as well as the API roles, because CREATE FUNCTION grants
-- it to PUBLIC by default and `authenticated` inherits that.
-- ----------------------------------------------------------------------------

revoke execute on function public.recalc_user_media_usage(uuid)                     from public, anon, authenticated;
revoke execute on function public.select_user_media_to_purge(uuid, bigint, bigint)  from public, anon, authenticated;

grant execute on function public.recalc_user_media_usage(uuid)                      to service_role;
grant execute on function public.select_user_media_to_purge(uuid, bigint, bigint)   to service_role;

-- Re-created above, so their grants are restated rather than assumed.
revoke execute on function public.mark_chat_media_purged(uuid[])                    from public, anon, authenticated;
grant execute on function public.mark_chat_media_purged(uuid[])                     to service_role;
