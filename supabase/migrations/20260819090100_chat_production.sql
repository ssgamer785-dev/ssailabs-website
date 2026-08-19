-- ============================================================================
-- The Traders Planet App — production Student <-> Admin chat
--
-- Builds on 20260818120000_backend_foundation.sql. Additive only: adds columns,
-- indexes, functions, triggers and policies. No existing data is dropped or
-- rewritten.
--
-- Covers: idempotent sends, soft-delete of your own messages, read receipts,
-- attachment metadata for Cloudflare R2 objects, per-student media accounting
-- with a 100 MB cap, and FIFO purging of the oldest media past that cap.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- messages: attachment metadata, client-side idempotency, soft delete
-- ----------------------------------------------------------------------------

alter table public.messages
  -- Client-generated uuid. Lets an optimistic bubble be reconciled with the
  -- row that comes back over Realtime, and makes a retried send idempotent
  -- instead of producing a duplicate.
  add column if not exists client_id text,
  add column if not exists deleted_at timestamptz,
  -- R2 object key. The bucket is private, so the client never holds a durable
  -- URL — it asks the server for a short-lived signed GET when it needs one.
  add column if not exists storage_key text,
  add column if not exists mime_type text,
  add column if not exists size_bytes bigint,
  add column if not exists file_name text,
  -- Set when FIFO quota enforcement has removed the underlying R2 object.
  -- The message row survives so the thread keeps its shape.
  add column if not exists media_purged boolean not null default false;

-- One row per (conversation, client_id): a retry of the same send collides
-- instead of inserting a second copy.
create unique index if not exists messages_client_id_key
  on public.messages (conversation_id, client_id)
  where client_id is not null;

-- Keyset pagination walks backwards from newest.
create index if not exists messages_conversation_paging_idx
  on public.messages (conversation_id, created_at desc, id desc);

-- The original constraint required body or media on every row. Two new states
-- legitimately have neither: a soft-deleted message, and one whose attachment
-- FIFO purging has reclaimed. Widen it to allow both.
alter table public.messages drop constraint if exists messages_body_or_media;
alter table public.messages add constraint messages_body_or_media
  check (
    deleted_at is not null
    or media_purged
    or body is not null
    or media_url is not null
    or storage_key is not null
  );

-- ----------------------------------------------------------------------------
-- Update guard
--
-- The backend-foundation policy lets any conversation participant UPDATE any
-- message in that conversation, which is too broad once messages can be
-- deleted: it would let either side rewrite or delete the other's messages.
-- RLS can't express "only these columns", so a trigger draws the line:
--   * the sender may soft-delete their own message
--   * anyone else in the thread may only touch read_at (the read receipt)
-- ----------------------------------------------------------------------------

create or replace function public.guard_message_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() is null only outside an end-user request (service-role calls,
  -- migrations, the SQL editor). Every messages policy is `to authenticated`,
  -- so that can't be an anonymous client — it's our own server doing
  -- maintenance such as FIFO media purging, which must not be blocked here.
  if auth.uid() is null then
    return new;
  end if;

  if new.sender_id = auth.uid() then
    -- Sender: may soft-delete. Content stays immutable (no editing).
    if new.body is distinct from old.body
       or new.kind is distinct from old.kind
       or new.storage_key is distinct from old.storage_key
       or new.media_url is distinct from old.media_url then
      raise exception 'Messages cannot be edited';
    end if;
  else
    -- Recipient: read receipts only.
    if new.deleted_at is distinct from old.deleted_at
       or new.body is distinct from old.body
       or new.kind is distinct from old.kind
       or new.storage_key is distinct from old.storage_key
       or new.media_url is distinct from old.media_url
       or new.sender_id is distinct from old.sender_id then
      raise exception 'You can only mark another participant''s message as read';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists messages_guard_update on public.messages;
create trigger messages_guard_update
  before update on public.messages
  for each row execute function public.guard_message_update();

-- Clear content on soft delete so the body is gone from the row, not just
-- hidden by the client.
create or replace function public.scrub_deleted_message()
returns trigger
language plpgsql
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    new.body := null;
    new.media_url := null;
    new.file_name := null;
  end if;
  return new;
end;
$$;

drop trigger if exists messages_scrub_deleted on public.messages;
create trigger messages_scrub_deleted
  before update of deleted_at on public.messages
  for each row execute function public.scrub_deleted_message();

-- ----------------------------------------------------------------------------
-- Per-student media accounting
--
-- conversations are 1:1 with students, so the conversation row is the natural
-- place to keep the running total that the 100 MB cap is checked against.
-- ----------------------------------------------------------------------------

alter table public.conversations
  add column if not exists media_bytes_used bigint not null default 0;

create or replace function public.recalc_conversation_media_usage(p_conversation_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total bigint;
begin
  select coalesce(sum(size_bytes), 0) into v_total
  from public.messages
  where conversation_id = p_conversation_id
    and storage_key is not null
    and not media_purged;

  update public.conversations set media_bytes_used = v_total where id = p_conversation_id;
  return v_total;
end;
$$;

create or replace function public.sync_conversation_media_usage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recalc_conversation_media_usage(coalesce(new.conversation_id, old.conversation_id));
  return null;
end;
$$;

drop trigger if exists messages_sync_media_usage on public.messages;
create trigger messages_sync_media_usage
  after insert or delete or update of size_bytes, media_purged, storage_key on public.messages
  for each row execute function public.sync_conversation_media_usage();

-- ----------------------------------------------------------------------------
-- FIFO quota enforcement
--
-- Two halves, because the R2 object and the database row live in different
-- systems and only the server holds R2 credentials:
--   1. the server asks which objects to drop (oldest first, until under cap)
--   2. the server deletes them from R2, then reports back what it removed
-- Both are SECURITY DEFINER and are called with the service-role key.
-- ----------------------------------------------------------------------------

create or replace function public.select_chat_media_to_purge(
  p_conversation_id uuid,
  p_limit_bytes bigint
)
returns table (id uuid, storage_key text, size_bytes bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used bigint;
  v_row record;
begin
  v_used := public.recalc_conversation_media_usage(p_conversation_id);

  if v_used <= p_limit_bytes then
    return;
  end if;

  -- Oldest first: keep dropping until the running total fits under the cap.
  for v_row in
    select m.id, m.storage_key, m.size_bytes
    from public.messages m
    where m.conversation_id = p_conversation_id
      and m.storage_key is not null
      and not m.media_purged
    order by m.created_at asc, m.id asc
  loop
    exit when v_used <= p_limit_bytes;
    id := v_row.id;
    storage_key := v_row.storage_key;
    size_bytes := v_row.size_bytes;
    v_used := v_used - coalesce(v_row.size_bytes, 0);
    return next;
  end loop;
end;
$$;

create or replace function public.mark_chat_media_purged(p_message_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_id uuid;
begin
  if p_message_ids is null or array_length(p_message_ids, 1) is null then
    return;
  end if;

  select conversation_id into v_conversation_id
  from public.messages where id = p_message_ids[1];

  update public.messages
  set media_purged = true,
      storage_key = null,
      size_bytes = 0
  where id = any (p_message_ids);

  if v_conversation_id is not null then
    perform public.recalc_conversation_media_usage(v_conversation_id);
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- Conversation helpers used by the client
-- ----------------------------------------------------------------------------

-- A student opening Chat needs their thread whether or not it exists yet.
-- SECURITY INVOKER on purpose: RLS still applies, so a student can only ever
-- resolve their own conversation.
create or replace function public.get_or_create_my_conversation()
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.conversations where student_id = auth.uid();
  if v_id is not null then
    return v_id;
  end if;

  insert into public.conversations (student_id)
  values (auth.uid())
  on conflict (student_id) do update set student_id = excluded.student_id
  returning id into v_id;

  return v_id;
end;
$$;

-- Bulk "mark everything the other side sent as read". Runs as the caller so
-- the messages update policy + guard trigger still apply.
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.messages
  set read_at = now()
  where conversation_id = p_conversation_id
    and sender_id <> auth.uid()
    and read_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Unread count + last-message preview, for the chat list row.
create or replace function public.my_chat_overview()
returns table (
  conversation_id uuid,
  unread_count bigint,
  last_message_at timestamptz,
  last_message_preview text
)
language sql
stable
set search_path = public
as $$
  select
    c.id,
    (
      select count(*) from public.messages m
      where m.conversation_id = c.id
        and m.sender_id <> auth.uid()
        and m.read_at is null
        and m.deleted_at is null
    ),
    c.last_message_at,
    (
      select case
        when m.deleted_at is not null then 'This message was deleted'
        when m.kind = 'text' then m.body
        when m.kind = 'voice' then 'Voice message'
        when m.kind = 'image' then 'Photo'
        when m.kind = 'video' then 'Video'
        when m.kind = 'pdf' then coalesce(m.file_name, 'PDF')
        else 'Attachment'
      end
      from public.messages m
      where m.conversation_id = c.id
      order by m.created_at desc, m.id desc
      limit 1
    )
  from public.conversations c
  where c.student_id = auth.uid() or public.is_admin();
$$;

-- ----------------------------------------------------------------------------
-- The last_message_at trigger from the foundation migration ignored soft
-- deletes; leave it as-is (a delete shouldn't reorder the thread) but make
-- sure Realtime carries enough of the old row to reconcile updates.
-- ----------------------------------------------------------------------------

alter table public.messages replica identity full;
