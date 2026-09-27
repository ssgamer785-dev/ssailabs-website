-- ============================================================================
-- The Traders Planet App — Phase 2E: media posters, upload tracking,
-- pre-upload FIFO quota enforcement.
--
-- Builds on 20260819090100_chat_production.sql and
-- 20260819140000_community_production.sql. Additive only: new columns,
-- functions and triggers. No existing row is dropped or rewritten.
--
-- Three things change:
--   1. Media messages and posts can carry a poster (thumbnail) object, so a
--      video renders without downloading the video itself.
--   2. A chat media row is written BEFORE its bytes are uploaded, so the
--      database always knows about every object in the bucket. That closes the
--      orphan hole where a client died mid-PUT and nothing referenced the key.
--   3. Quota accounting includes poster bytes, and purge selection can be
--      asked to make room for an incoming file rather than only reacting once
--      the cap has already been passed.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- messages: poster object + upload lifecycle
-- ----------------------------------------------------------------------------

alter table public.messages
  -- R2 key of a small JPEG first frame. Null for everything except video.
  add column if not exists poster_key text,
  add column if not exists poster_size_bytes bigint,
  -- 'pending' between the row being written and the R2 PUT completing.
  -- 'ready' once the bytes are actually in the bucket.
  add column if not exists upload_status text not null default 'ready';

alter table public.messages drop constraint if exists messages_upload_status_check;
alter table public.messages add constraint messages_upload_status_check
  check (upload_status in ('pending', 'ready'));

comment on column public.messages.voice_duration_seconds is
  'Clip length in whole seconds. Set for voice notes and for video messages; '
  'null for every other kind. Kept under its original name so existing rows '
  'and clients stay valid.';

comment on column public.messages.poster_key is
  'R2 key of the poster frame for a video message. Purged alongside the video.';

-- The stale-upload sweep walks pending rows oldest-first; the partial index
-- keeps that cheap while the table is overwhelmingly 'ready'.
create index if not exists messages_pending_uploads_idx
  on public.messages (created_at)
  where upload_status = 'pending';

-- ----------------------------------------------------------------------------
-- Update guard
--
-- Replaces the Phase 2C version. Same rule — senders may soft-delete, everyone
-- else may only set read_at — plus the new upload lifecycle: a sender may flip
-- their own row from pending to ready and attach its poster, and nobody else
-- may touch those columns.
-- ----------------------------------------------------------------------------

create or replace function public.guard_message_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() is null only outside an end-user request (service-role calls,
  -- migrations, the SQL editor) — that is our own server doing maintenance
  -- such as FIFO media purging, which must not be blocked here.
  if auth.uid() is null then
    return new;
  end if;

  if new.sender_id = auth.uid() then
    -- Sender: may soft-delete, and may complete their own upload.
    if new.body is distinct from old.body
       or new.kind is distinct from old.kind
       or new.storage_key is distinct from old.storage_key
       or new.media_url is distinct from old.media_url then
      raise exception 'Messages cannot be edited';
    end if;
    -- One-way: ready never goes back to pending.
    if old.upload_status = 'ready' and new.upload_status = 'pending' then
      raise exception 'An upload cannot be reopened';
    end if;
  else
    -- Recipient: read receipts only.
    if new.deleted_at is distinct from old.deleted_at
       or new.body is distinct from old.body
       or new.kind is distinct from old.kind
       or new.storage_key is distinct from old.storage_key
       or new.poster_key is distinct from old.poster_key
       or new.poster_size_bytes is distinct from old.poster_size_bytes
       or new.upload_status is distinct from old.upload_status
       or new.media_url is distinct from old.media_url
       or new.sender_id is distinct from old.sender_id then
      raise exception 'You can only mark another participant''s message as read';
    end if;
  end if;
  return new;
end;
$$;

-- Soft delete also drops the poster reference.
create or replace function public.scrub_deleted_message()
returns trigger
language plpgsql
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    new.body := null;
    new.media_url := null;
    new.file_name := null;
    new.poster_key := null;
    new.poster_size_bytes := 0;
  end if;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Notifications follow the bytes, not the row
--
-- A media row now exists before its upload finishes. Notifying then would
-- announce a message that cannot be opened yet — and would leave a stale
-- notification behind if the upload failed. So: notify on insert only for rows
-- that are already complete, and on the pending -> ready transition otherwise.
-- ----------------------------------------------------------------------------

create or replace function public.notify_message_recipients(
  p_conversation_id uuid,
  p_sender_id uuid,
  p_body text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid;
begin
  select student_id into v_student from public.conversations where id = p_conversation_id;

  if public.is_admin(p_sender_id) then
    if p_sender_id is distinct from v_student then
      insert into public.notifications (user_id, kind, title, body, related_conversation_id)
      values (v_student, 'chat', 'Admin sent you a message', coalesce(p_body, 'New message'), p_conversation_id);
    end if;
  else
    insert into public.notifications (user_id, kind, title, body, related_conversation_id)
    select p.id, 'chat', 'New message from a student', coalesce(p_body, 'New message'), p_conversation_id
    from public.profiles p
    where p.role = 'admin';
  end if;
end;
$$;

create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.upload_status = 'ready' then
    perform public.notify_message_recipients(new.conversation_id, new.sender_id, new.body);
  end if;
  return new;
end;
$$;

create or replace function public.notify_completed_upload()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.upload_status = 'pending' and new.upload_status = 'ready'
     and new.deleted_at is null then
    perform public.notify_message_recipients(new.conversation_id, new.sender_id, new.body);
  end if;
  return new;
end;
$$;

drop trigger if exists messages_notify_upload_complete on public.messages;
create trigger messages_notify_upload_complete
  after update of upload_status on public.messages
  for each row execute function public.notify_completed_upload();

-- ----------------------------------------------------------------------------
-- Media accounting
--
-- Poster bytes are real bytes in the bucket, so they count. Pending rows count
-- too: their space is reserved from the moment the row is written, which is
-- what stops two concurrent uploads from each thinking they fit.
-- ----------------------------------------------------------------------------

create or replace function public.recalc_conversation_media_usage(p_conversation_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total bigint;
begin
  select coalesce(sum(coalesce(size_bytes, 0) + coalesce(poster_size_bytes, 0)), 0)
    into v_total
  from public.messages
  where conversation_id = p_conversation_id
    and storage_key is not null
    and not media_purged;

  update public.conversations set media_bytes_used = v_total where id = p_conversation_id;
  return v_total;
end;
$$;

drop trigger if exists messages_sync_media_usage on public.messages;
create trigger messages_sync_media_usage
  after insert or delete or update of size_bytes, poster_size_bytes, media_purged, storage_key
  on public.messages
  for each row execute function public.sync_conversation_media_usage();

-- ----------------------------------------------------------------------------
-- FIFO purge, now able to make room ahead of an upload
--
-- p_incoming_bytes is what the caller is about to add. Passing 0 reproduces
-- the old behaviour (react to an over-cap conversation); passing the size of
-- the pending file frees space before its bytes are ever sent.
--
-- Returns oldest-first, and never nominates a row whose own upload is still in
-- flight — deleting the object out from under a running PUT would leave the
-- row pointing at nothing.
-- ----------------------------------------------------------------------------

drop function if exists public.select_chat_media_to_purge(uuid, bigint);

create or replace function public.select_chat_media_to_purge(
  p_conversation_id uuid,
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
  v_freed bigint;
begin
  v_used := public.recalc_conversation_media_usage(p_conversation_id);

  if v_used + coalesce(p_incoming_bytes, 0) <= p_limit_bytes then
    return;
  end if;

  for v_row in
    select m.id, m.storage_key, m.poster_key,
           coalesce(m.size_bytes, 0) + coalesce(m.poster_size_bytes, 0) as total_bytes
    from public.messages m
    where m.conversation_id = p_conversation_id
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
      poster_key = null,
      size_bytes = 0,
      poster_size_bytes = 0
  where id = any (p_message_ids);

  if v_conversation_id is not null then
    perform public.recalc_conversation_media_usage(v_conversation_id);
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- Stale upload sweep
--
-- A row that has been 'pending' for an hour belongs to a client that died
-- mid-upload. Its bytes may or may not have reached R2; either way nothing
-- will ever reference them, so the server deletes the objects and then drops
-- the rows. Same two-phase shape as the quota purge: the database nominates,
-- the server deletes from R2, the database forgets.
-- ----------------------------------------------------------------------------

create or replace function public.select_stale_pending_uploads(p_older_than interval default interval '1 hour')
returns table (id uuid, storage_key text, poster_key text)
language sql
security definer
set search_path = public
as $$
  select m.id, m.storage_key, m.poster_key
  from public.messages m
  where m.upload_status = 'pending'
    and m.created_at < now() - p_older_than;
$$;

create or replace function public.delete_stale_pending_uploads(p_message_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_message_ids is null or array_length(p_message_ids, 1) is null then
    return 0;
  end if;
  -- Belt and braces: only ever removes rows that are still pending.
  delete from public.messages
  where id = any (p_message_ids) and upload_status = 'pending';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ----------------------------------------------------------------------------
-- Community posts: poster object
--
-- Same idea as chat, minus the quota — Community is bounded by the existing
-- 6-month retention rule instead.
-- ----------------------------------------------------------------------------

alter table public.posts
  add column if not exists poster_key text,
  add column if not exists poster_size_bytes bigint;

comment on column public.posts.poster_key is
  'R2 key of the poster frame for a video attachment. Removed with the video.';

-- Return type changes, so the old signature has to go first.
drop function if exists public.posts_feed(public.post_channel, timestamptz, int);

create or replace function public.posts_feed(
  p_channel public.post_channel,
  p_before timestamptz default null,
  p_limit int default 20
)
returns table (
  id uuid,
  author_id uuid,
  channel public.post_channel,
  title text,
  body text,
  instrument text,
  entry_price numeric,
  stop_loss numeric,
  take_profit numeric,
  attachment public.attachment_kind,
  storage_key text,
  poster_key text,
  mime_type text,
  size_bytes bigint,
  file_name text,
  media_purged boolean,
  chart_seed int,
  is_anonymous boolean,
  display_name text,
  created_at timestamptz,
  updated_at timestamptz,
  author_name text,
  author_role public.user_role,
  is_mine boolean,
  like_count bigint,
  comment_count bigint,
  liked_by_me boolean
)
language sql
stable
set search_path = public
as $$
  select
    p.id, p.author_id, p.channel, p.title, p.body,
    p.instrument, p.entry_price, p.stop_loss, p.take_profit,
    p.attachment, p.storage_key, p.poster_key, p.mime_type, p.size_bytes,
    p.file_name, p.media_purged,
    p.chart_seed, p.is_anonymous, p.display_name, p.created_at, p.updated_at,
    -- Admins always see the real name, even on an anonymous post; everyone
    -- else gets the snapshotted display_name. Matches the Phase 2A model.
    case when public.is_admin() then coalesce(pr.full_name, p.display_name) else p.display_name end,
    pr.role,
    p.author_id = auth.uid(),
    (select count(*) from public.likes l where l.post_id = p.id),
    (select count(*) from public.comments c where c.post_id = p.id),
    exists (select 1 from public.likes l where l.post_id = p.id and l.user_id = auth.uid())
  from public.posts p
  left join public.profiles pr on pr.id = p.author_id
  where p.channel = p_channel
    and (p_before is null or p.created_at < p_before)
  order by p.created_at desc, p.id desc
  limit least(coalesce(p_limit, 20), 50);
$$;

-- Retention sweep has to clear posters too, or the bucket keeps paying for
-- thumbnails whose posts are long gone.
drop function if exists public.select_expired_post_media();

create or replace function public.select_expired_post_media()
returns table (id uuid, storage_key text, poster_key text)
language sql
security definer
set search_path = public
as $$
  select p.id, p.storage_key, p.poster_key
  from public.posts p
  where p.created_at < public.community_retention_cutoff()
    and p.storage_key is not null
    and not p.media_purged;
$$;

create or replace function public.mark_post_media_purged(p_post_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_post_ids is null or array_length(p_post_ids, 1) is null then
    return;
  end if;
  update public.posts
  set media_purged = true,
      storage_key = null,
      poster_key = null,
      size_bytes = 0,
      poster_size_bytes = 0
  where id = any (p_post_ids);
end;
$$;
