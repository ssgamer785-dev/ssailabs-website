-- Server-issued media, row guards and activation on every client write.
--
-- Deployment order: the API that records upload grants (server/upload-grants.ts)
-- must be live BEFORE this migration runs; until then, rows that name a
-- storage object have no grant to match and are refused. Nothing below
-- deletes or rewrites existing rows: every check applies to new inserts and
-- to future updates only.
--
-- Convention for "is this a direct client write?": guard functions that must
-- tell clients apart from our own SECURITY DEFINER routines are SECURITY
-- INVOKER and test current_user (as prevent_activation_self_grant already
-- does). A definer routine runs as its owner, the API's service key runs as
-- service_role; only a signed-in or anonymous caller runs as
-- authenticated/anon.

-- ---------------------------------------------------------------------------
-- 1. Upload grants: the API records every object key it signs an upload for.
-- ---------------------------------------------------------------------------

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create table if not exists public.media_upload_grants (
  storage_key       text primary key,
  owner_id          uuid not null references auth.users(id) on delete cascade,
  scope             text not null check (scope in ('chat', 'post')),
  conversation_id   uuid references public.conversations(id) on delete cascade,
  kind              text not null check (kind in ('image', 'video', 'pdf', 'file', 'voice')),
  mime_type         text not null,
  size_bytes        bigint not null check (size_bytes > 0),
  poster_key        text,
  poster_size_bytes bigint check (poster_size_bytes is null or poster_size_bytes > 0),
  created_at        timestamptz not null default now(),
  used_at           timestamptz,
  constraint media_upload_grants_scope_target
    check ((scope = 'chat') = (conversation_id is not null)),
  constraint media_upload_grants_poster_pair
    check ((poster_key is null) = (poster_size_bytes is null))
);

create index if not exists media_upload_grants_created_idx on public.media_upload_grants (created_at);

alter table public.media_upload_grants enable row level security;
-- No policies: only the service role (API) and definer routines touch it.
revoke all on public.media_upload_grants from anon, authenticated;
grant select, insert, update, delete on public.media_upload_grants to service_role;

comment on table public.media_upload_grants is
  'One row per object key the API signed an upload for. A client row may only name an object through an unused grant it owns; size and type are copied from the grant.';

-- Grants older than this cannot be claimed (the signed PUT expires in minutes;
-- the allowance covers an offline client inserting its row later).
create or replace function private.claim_upload_grant(
  p_storage_key text,
  p_owner uuid,
  p_scope text,
  p_conversation_id uuid
)
returns public.media_upload_grants
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grant public.media_upload_grants;
begin
  if p_owner is null or p_owner is distinct from auth.uid() then
    raise exception 'Attachments can only be added by the person who uploaded them'
      using errcode = '42501';
  end if;

  select * into v_grant
    from public.media_upload_grants g
   where g.storage_key = p_storage_key
   for update;

  if not found
     or v_grant.owner_id <> p_owner
     or v_grant.scope <> p_scope
     or v_grant.conversation_id is distinct from p_conversation_id
     or v_grant.created_at < now() - interval '24 hours' then
    raise exception 'This attachment was not uploaded through the app'
      using errcode = '42501';
  end if;

  if v_grant.used_at is not null then
    -- The same key on a second row: report it as the duplicate it is, so a
    -- client retrying an insert that already landed sees a conflict.
    raise exception 'This attachment is already attached to a message or post'
      using errcode = '23505';
  end if;

  update public.media_upload_grants set used_at = now() where storage_key = p_storage_key;
  return v_grant;
end;
$$;

revoke all on function private.claim_upload_grant(text, uuid, text, uuid) from public;
grant execute on function private.claim_upload_grant(text, uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Messages: what a client may write.
-- ---------------------------------------------------------------------------

create or replace function public.guard_message_insert()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_grant public.media_upload_grants;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- Server-owned fields start from known values, whatever the client sent.
  new.created_at := now();
  new.read_at := null;
  new.deleted_at := null;
  new.media_purged := false;
  new.media_url := null;

  if new.storage_key is null then
    if new.poster_key is not null or new.size_bytes is not null or new.poster_size_bytes is not null then
      raise exception 'An attachment needs its uploaded object' using errcode = '22023';
    end if;
    if new.kind not in ('text') then
      raise exception 'This kind of message needs an attachment' using errcode = '22023';
    end if;
    new.upload_status := 'ready';
    return new;
  end if;

  v_grant := private.claim_upload_grant(new.storage_key, new.sender_id, 'chat', new.conversation_id);

  if new.kind::text <> v_grant.kind then
    raise exception 'The attachment type does not match its upload' using errcode = '22023';
  end if;
  if new.poster_key is distinct from v_grant.poster_key then
    raise exception 'The preview image does not match its upload' using errcode = '22023';
  end if;

  new.size_bytes := v_grant.size_bytes;
  new.poster_size_bytes := v_grant.poster_size_bytes;
  new.mime_type := v_grant.mime_type;
  if new.file_name is not null then
    new.file_name := left(new.file_name, 255);
  end if;
  return new;
end;
$$;

drop trigger if exists messages_guard_insert on public.messages;
create trigger messages_guard_insert
  before insert on public.messages
  for each row execute function public.guard_message_insert();

-- Replaces the 20260821090000 version: senders may soft-delete and complete
-- their own upload; the other participant may set read_at. Nothing else a
-- client sends is accepted, including sizes, purge flags, names and dates.
create or replace function public.guard_message_update()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.id                     is distinct from old.id
     or new.conversation_id     is distinct from old.conversation_id
     or new.sender_id           is distinct from old.sender_id
     or new.kind                is distinct from old.kind
     or new.body                is distinct from old.body
     or new.media_url           is distinct from old.media_url
     or new.storage_key         is distinct from old.storage_key
     or new.poster_key          is distinct from old.poster_key
     or new.size_bytes          is distinct from old.size_bytes
     or new.poster_size_bytes   is distinct from old.poster_size_bytes
     or new.mime_type           is distinct from old.mime_type
     or new.file_name           is distinct from old.file_name
     or new.media_purged        is distinct from old.media_purged
     or new.created_at          is distinct from old.created_at
     or new.client_id           is distinct from old.client_id
     or new.voice_duration_seconds is distinct from old.voice_duration_seconds then
    raise exception 'Messages cannot be edited' using errcode = '42501';
  end if;

  if new.sender_id = auth.uid() then
    if new.read_at is distinct from old.read_at then
      raise exception 'Only the recipient marks a message as read' using errcode = '42501';
    end if;
    if old.deleted_at is not null and new.deleted_at is distinct from old.deleted_at then
      raise exception 'A deleted message cannot be restored' using errcode = '42501';
    end if;
    if new.upload_status is distinct from old.upload_status
       and not (old.upload_status = 'pending' and new.upload_status = 'ready') then
      raise exception 'An upload cannot be reopened' using errcode = '42501';
    end if;
  else
    if new.deleted_at is distinct from old.deleted_at
       or new.upload_status is distinct from old.upload_status then
      raise exception 'You can only mark another participant''s message as read' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Posts: server-issued media, fixed dates, author-only anonymity switch.
-- ---------------------------------------------------------------------------

create or replace function public.guard_post_insert()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_grant public.media_upload_grants;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  new.created_at := now();
  new.updated_at := now();
  new.media_purged := false;
  new.attachment_url := null;
  if new.channel = 'official' then
    new.is_anonymous := false;
  end if;

  if new.storage_key is null then
    if new.poster_key is not null or new.size_bytes is not null or new.poster_size_bytes is not null then
      raise exception 'An attachment needs its uploaded object' using errcode = '22023';
    end if;
    if new.attachment in ('image', 'video', 'pdf', 'file', 'voice') then
      raise exception 'This attachment needs its uploaded object' using errcode = '22023';
    end if;
    return new;
  end if;

  v_grant := private.claim_upload_grant(new.storage_key, new.author_id, 'post', null);

  if new.attachment::text <> v_grant.kind then
    raise exception 'The attachment type does not match its upload' using errcode = '22023';
  end if;
  if new.poster_key is distinct from v_grant.poster_key then
    raise exception 'The preview image does not match its upload' using errcode = '22023';
  end if;

  new.size_bytes := v_grant.size_bytes;
  new.poster_size_bytes := v_grant.poster_size_bytes;
  new.mime_type := v_grant.mime_type;
  if new.file_name is not null then
    new.file_name := left(new.file_name, 255);
  end if;
  return new;
end;
$$;

drop trigger if exists posts_guard_insert on public.posts;
create trigger posts_guard_insert
  before insert on public.posts
  for each row execute function public.guard_post_insert();

create or replace function public.guard_post_update()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.id                  is distinct from old.id
     or new.author_id        is distinct from old.author_id
     or new.channel          is distinct from old.channel
     or new.created_at       is distinct from old.created_at
     or new.attachment       is distinct from old.attachment
     or new.attachment_url   is distinct from old.attachment_url
     or new.storage_key      is distinct from old.storage_key
     or new.poster_key       is distinct from old.poster_key
     or new.mime_type        is distinct from old.mime_type
     or new.size_bytes       is distinct from old.size_bytes
     or new.poster_size_bytes is distinct from old.poster_size_bytes
     or new.file_name        is distinct from old.file_name
     or new.media_purged     is distinct from old.media_purged
     or new.chart_seed       is distinct from old.chart_seed then
    raise exception 'Only the text of a post can be edited' using errcode = '42501';
  end if;

  -- The label is derived, never written: a client value is discarded here,
  -- and posts_snapshot_display_name (which fires after this trigger) derives
  -- it afresh when the anonymity switch is part of the update.
  new.display_name := old.display_name;

  if new.is_anonymous is distinct from old.is_anonymous then
    if old.author_id is distinct from auth.uid() then
      raise exception 'Only the author can change how a post is signed' using errcode = '42501';
    end if;
    if new.channel = 'official' and new.is_anonymous then
      raise exception 'Official posts are never anonymous' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists posts_guard_update on public.posts;
create trigger posts_guard_update
  before update on public.posts
  for each row execute function public.guard_post_update();


-- ---------------------------------------------------------------------------
-- 4. Comments: fixed dates and names; no client edits (the app has none).
-- ---------------------------------------------------------------------------

create or replace function public.guard_comment_insert()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.created_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists comments_guard_insert on public.comments;
create trigger comments_guard_insert
  before insert on public.comments
  for each row execute function public.guard_comment_insert();

drop policy if exists comments_update_own_or_admin on public.comments;

-- ---------------------------------------------------------------------------
-- 5. Profiles: members edit their own name, phone, name preference and photo.
-- ---------------------------------------------------------------------------

create or replace function public.guard_profile_update()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.id                           is distinct from old.id
     or new.created_at                is distinct from old.created_at
     or new.media_bytes_used          is distinct from old.media_bytes_used
     or new.activation_attempts       is distinct from old.activation_attempts
     or new.activation_last_attempt_at is distinct from old.activation_last_attempt_at
     or new.avatar_url                is distinct from old.avatar_url then
    raise exception 'This part of a profile is managed by the app' using errcode = '42501';
  end if;

  -- A member's name labels their posts and comments: it may not pose as the
  -- brand or the admin. Admin accounts are exempt.
  if new.full_name is distinct from old.full_name
     and new.role <> 'admin'
     and (
       char_length(btrim(new.full_name)) > 80
       or regexp_replace(lower(new.full_name), '[^a-z]', '', 'g')
          in ('thetradersplanet', 'tradersplanet', 'admin', 'administrator', 'official', 'moderator', 'support')
     ) then
    raise exception 'Please choose a different name' using errcode = '22023';
  end if;

  if new.avatar_key is distinct from old.avatar_key
     and new.avatar_key is not null
     and new.avatar_key !~ ('^avatars/' || new.id::text || '/[A-Za-z0-9][A-Za-z0-9._-]{0,200}$') then
    raise exception 'A profile picture must be one this account uploaded' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_update on public.profiles;
create trigger profiles_guard_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------------------------------------------------------------------------
-- 6. Activation: the gate covers writes as well as reads.
-- ---------------------------------------------------------------------------

drop policy if exists posts_insert_own on public.posts;
create policy posts_insert_own on public.posts
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and public.is_activated()
    and (channel = 'students' or public.is_admin())
  );

drop policy if exists posts_update_own_or_admin on public.posts;
create policy posts_update_own_or_admin on public.posts
  for update to authenticated
  using ((author_id = auth.uid() and public.is_activated()) or public.is_admin())
  with check ((author_id = auth.uid() and public.is_activated()) or public.is_admin());

drop policy if exists comments_insert_own on public.comments;
create policy comments_insert_own on public.comments
  for insert to authenticated
  with check (author_id = auth.uid() and public.is_activated());

drop policy if exists likes_insert_own on public.likes;
create policy likes_insert_own on public.likes
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_activated());

drop policy if exists likes_select_authenticated on public.likes;
create policy likes_select_authenticated on public.likes
  for select to authenticated
  using (public.is_activated());

drop policy if exists bookmarks_insert_own on public.bookmarks;
create policy bookmarks_insert_own on public.bookmarks
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_activated());

drop policy if exists conversations_insert_own on public.conversations;
create policy conversations_insert_own on public.conversations
  for insert to authenticated
  with check (student_id = auth.uid() and public.is_activated());

drop policy if exists messages_insert_participant on public.messages;
create policy messages_insert_participant on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_activated()
    and (
      public.is_admin()
      or exists (
        select 1 from public.conversations c
         where c.id = messages.conversation_id and c.student_id = auth.uid()
      )
    )
  );

drop policy if exists poll_options_write_author on public.poll_options;
create policy poll_options_write_author on public.poll_options
  for insert to authenticated
  with check (
    public.is_activated()
    and exists (
      select 1 from public.posts p
       where p.id = poll_options.post_id and p.author_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 7. Anonymous content: rows are private to author and admin; everyone else
--    reads them through the feed functions, which omit the author.
-- ---------------------------------------------------------------------------

drop policy if exists posts_select_authenticated on public.posts;
create policy posts_select_authenticated on public.posts
  for select to authenticated
  using (
    public.is_activated()
    and (not is_anonymous or author_id = auth.uid() or public.is_admin())
  );

drop policy if exists comments_select_authenticated on public.comments;
create policy comments_select_authenticated on public.comments
  for select to authenticated
  using (
    public.is_activated()
    and (not is_anonymous or author_id = auth.uid() or public.is_admin())
  );

-- The feed functions now run as their owner so they can list anonymous rows,
-- and apply the same activation rule the table policies apply. For anonymous
-- rows, author_id, the author's role and picture are withheld from everyone
-- but the author and admins.
create or replace function public.posts_feed(
  p_channel public.post_channel,
  p_before timestamptz default null,
  p_limit integer default 20
)
returns table(
  id uuid, author_id uuid, channel public.post_channel, title text, body text,
  instrument text, entry_price numeric, stop_loss numeric, take_profit numeric,
  attachment public.attachment_kind, storage_key text, poster_key text, mime_type text,
  size_bytes bigint, file_name text, media_purged boolean, chart_seed integer,
  is_anonymous boolean, display_name text, created_at timestamptz, updated_at timestamptz,
  author_name text, author_role public.user_role, is_mine boolean,
  like_count bigint, comment_count bigint, liked_by_me boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with viewer as (
    select auth.uid() as uid, public.is_admin() as admin, public.is_activated() as activated
  )
  select
    p.id,
    case when p.is_anonymous and not v.admin and p.author_id is distinct from v.uid then null else p.author_id end,
    p.channel, p.title, p.body,
    p.instrument, p.entry_price, p.stop_loss, p.take_profit,
    p.attachment, p.storage_key, p.poster_key, p.mime_type, p.size_bytes,
    p.file_name, p.media_purged,
    p.chart_seed, p.is_anonymous, p.display_name, p.created_at, p.updated_at,
    case when v.admin then coalesce(pr.full_name, p.display_name) else p.display_name end,
    case when p.is_anonymous and not v.admin and p.author_id is distinct from v.uid then null else pr.role end,
    p.author_id = v.uid,
    (select count(*) from public.likes l where l.post_id = p.id),
    (select count(*) from public.comments c where c.post_id = p.id),
    exists (select 1 from public.likes l where l.post_id = p.id and l.user_id = v.uid)
  from viewer v
  join public.posts p on v.activated
  left join public.profiles pr on pr.id = p.author_id
  where p.channel = p_channel
    and (p_before is null or p.created_at < p_before)
  order by p.created_at desc, p.id desc
  limit least(coalesce(p_limit, 20), 50);
$$;

create or replace function public.post_by_id(p_post_id uuid)
returns table(
  id uuid, author_id uuid, channel public.post_channel, title text, body text,
  instrument text, entry_price numeric, stop_loss numeric, take_profit numeric,
  attachment public.attachment_kind, storage_key text, poster_key text, mime_type text,
  size_bytes bigint, file_name text, media_purged boolean, chart_seed integer,
  is_anonymous boolean, display_name text, created_at timestamptz, updated_at timestamptz,
  author_name text, author_role public.user_role, author_avatar_key text, is_mine boolean,
  like_count bigint, comment_count bigint, liked_by_me boolean, bookmarked_by_me boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with viewer as (
    select auth.uid() as uid, public.is_admin() as admin, public.is_activated() as activated
  )
  select
    p.id,
    case when p.is_anonymous and not v.admin and p.author_id is distinct from v.uid then null else p.author_id end,
    p.channel, p.title, p.body,
    p.instrument, p.entry_price, p.stop_loss, p.take_profit,
    p.attachment, p.storage_key, p.poster_key, p.mime_type, p.size_bytes,
    p.file_name, p.media_purged,
    p.chart_seed, p.is_anonymous, p.display_name, p.created_at, p.updated_at,
    case when v.admin then coalesce(pr.full_name, p.display_name) else p.display_name end,
    case when p.is_anonymous and not v.admin and p.author_id is distinct from v.uid then null else pr.role end,
    case when p.is_anonymous and not v.admin then null else pr.avatar_key end,
    p.author_id = v.uid,
    (select count(*) from public.likes l where l.post_id = p.id),
    (select count(*) from public.comments c where c.post_id = p.id),
    exists (select 1 from public.likes l where l.post_id = p.id and l.user_id = v.uid),
    exists (select 1 from public.bookmarks b where b.post_id = p.id and b.user_id = v.uid)
  from viewer v
  join public.posts p on v.activated
  left join public.profiles pr on pr.id = p.author_id
  where p.id = p_post_id;
$$;

create or replace function public.post_comments(
  p_post_id uuid,
  p_before timestamptz default null,
  p_limit integer default 20
)
returns table(
  id uuid, post_id uuid, author_id uuid, body text, voice_url text,
  voice_duration_seconds integer, is_anonymous boolean, display_name text,
  created_at timestamptz, author_name text, is_mine boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with viewer as (
    select auth.uid() as uid, public.is_admin() as admin, public.is_activated() as activated
  )
  select
    c.id, c.post_id,
    case when c.is_anonymous and not v.admin and c.author_id is distinct from v.uid then null else c.author_id end,
    c.body, c.voice_url, c.voice_duration_seconds,
    c.is_anonymous, c.display_name, c.created_at,
    case when v.admin then coalesce(pr.full_name, c.display_name) else c.display_name end,
    c.author_id = v.uid
  from viewer v
  join public.comments c on v.activated
  left join public.profiles pr on pr.id = c.author_id
  where c.post_id = p_post_id
    and (p_before is null or c.created_at < p_before)
  order by c.created_at desc, c.id desc
  limit least(coalesce(p_limit, 20), 50);
$$;

revoke all on function public.posts_feed(public.post_channel, timestamptz, integer) from public, anon;
revoke all on function public.post_by_id(uuid) from public, anon;
revoke all on function public.post_comments(uuid, timestamptz, integer) from public, anon;
grant execute on function public.posts_feed(public.post_channel, timestamptz, integer) to authenticated, service_role;
grant execute on function public.post_by_id(uuid) to authenticated, service_role;
grant execute on function public.post_comments(uuid, timestamptz, integer) to authenticated, service_role;

-- Anonymous rows no longer reach other members through table realtime, so
-- feeds listen here instead: which post changed, never who changed it.
create table if not exists public.community_activity (
  id          bigint generated always as identity primary key,
  post_id     uuid not null,
  channel     public.post_channel not null,
  subject     text not null check (subject in ('post', 'comment')),
  op          text not null check (op in ('INSERT', 'UPDATE', 'DELETE')),
  created_at  timestamptz not null default now()
);

create index if not exists community_activity_created_idx on public.community_activity (created_at);

alter table public.community_activity enable row level security;
revoke all on public.community_activity from anon, authenticated;
grant select on public.community_activity to authenticated;
grant select, insert, delete on public.community_activity to service_role;

drop policy if exists community_activity_select_activated on public.community_activity;
create policy community_activity_select_activated on public.community_activity
  for select to authenticated
  using (public.is_activated());

create or replace function public.record_community_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post_id uuid;
  v_channel public.post_channel;
  v_subject text;
begin
  if tg_table_name = 'posts' then
    v_subject := 'post';
    v_post_id := coalesce(new.id, old.id);
    v_channel := coalesce(new.channel, old.channel);
  else
    v_subject := 'comment';
    v_post_id := coalesce(new.post_id, old.post_id);
    select p.channel into v_channel from public.posts p where p.id = v_post_id;
    if v_channel is null then
      return null; -- the post itself is being deleted; its own event covers it
    end if;
  end if;

  insert into public.community_activity (post_id, channel, subject, op)
  values (v_post_id, v_channel, v_subject, tg_op);

  -- Keep the log short; it only has to outlive a reconnect.
  if random() < 0.01 then
    delete from public.community_activity where created_at < now() - interval '1 day';
  end if;
  return null;
end;
$$;

revoke all on function public.record_community_activity() from public, anon, authenticated;

drop trigger if exists posts_record_activity on public.posts;
create trigger posts_record_activity
  after insert or update or delete on public.posts
  for each row execute function public.record_community_activity();

drop trigger if exists comments_record_activity on public.comments;
create trigger comments_record_activity
  after insert or delete on public.comments
  for each row execute function public.record_community_activity();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'community_activity'
     ) then
    alter publication supabase_realtime add table public.community_activity;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Official signals notify activated students only.
-- ---------------------------------------------------------------------------

create or replace function public.notify_new_official_post()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.channel = 'official' then
    insert into public.notifications (user_id, kind, title, body, related_post_id)
    select p.id, 'signal', coalesce(new.title, 'New Official Update posted'), coalesce(new.body, ''), new.id
    from public.profiles p
    where p.role = 'student'
      and p.activated_at is not null;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Retention cutoff is evaluated per call, never folded into a plan.
-- ---------------------------------------------------------------------------

create or replace function public.community_retention_cutoff()
returns timestamptz
language sql
stable
as $$
  select (now() - interval '6 months')::timestamptz;
$$;

-- ---------------------------------------------------------------------------
-- 10. Poll options are fixed once anyone has voted.
-- ---------------------------------------------------------------------------

create or replace function public.guard_poll_options()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post_id uuid := coalesce(new.post_id, old.post_id);
begin
  -- Cascades from deleting the whole poll post are not option edits.
  if pg_trigger_depth() > 1
     or not exists (select 1 from public.posts p where p.id = v_post_id) then
    return coalesce(new, old);
  end if;
  if auth.uid() is not null
     and exists (select 1 from public.poll_votes v where v.post_id = v_post_id) then
    raise exception 'A poll''s options cannot change after voting has started' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists poll_options_guard on public.poll_options;
create trigger poll_options_guard
  before insert or delete on public.poll_options
  for each row execute function public.guard_poll_options();

-- ---------------------------------------------------------------------------
-- 11. One open membership request per account.
-- ---------------------------------------------------------------------------

create or replace function public.guard_membership_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.requested_by is null or auth.uid() is null then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('membership_request:' || new.requested_by::text, 0));
  if exists (
    select 1 from public.membership_requests r
     where r.requested_by = new.requested_by and r.status = 'pending'
  ) then
    raise exception 'You already have a membership request waiting for review' using errcode = '23505';
  end if;
  new.status := 'pending';
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists membership_requests_guard on public.membership_requests;
create trigger membership_requests_guard
  before insert on public.membership_requests
  for each row execute function public.guard_membership_request();

-- ---------------------------------------------------------------------------
-- 12. Realtime: the admin's presence is for activated members; chat typing
--     signals may move to a private topic scoped to the conversation.
-- ---------------------------------------------------------------------------

drop policy if exists "tp_account_presence_read" on realtime.messages;
create policy "tp_account_presence_read"
  on realtime.messages
  for select
  to authenticated
  using (
    extension = 'presence'
    and (
      (realtime.topic() = 'tp:presence:admin' and (select public.is_activated()))
      or realtime.topic() = 'tp:presence:student:' || (select auth.uid())::text
      or (
        (select public.is_admin())
        and realtime.topic() like 'tp:presence:student:%'
      )
    )
  );

drop policy if exists "tp_account_presence_read_boundary" on realtime.messages;
create policy "tp_account_presence_read_boundary"
  on realtime.messages
  as restrictive
  for select
  to authenticated
  using (
    extension <> 'presence'
    or (
      (realtime.topic() = 'tp:presence:admin' and (select public.is_activated()))
      or realtime.topic() = 'tp:presence:student:' || (select auth.uid())::text
      or (
        (select public.is_admin())
        and realtime.topic() like 'tp:presence:student:%'
      )
    )
  );

-- Additive: used only once the chat client joins its typing topic as a
-- private channel. Participants of the conversation, activated, only.
drop policy if exists "tp_chat_typing_read" on realtime.messages;
create policy "tp_chat_typing_read"
  on realtime.messages
  for select
  to authenticated
  using (
    extension = 'broadcast'
    and realtime.topic() like 'chat:%'
    and (select public.is_activated())
    and exists (
      select 1 from public.conversations c
       where c.id::text = substr(realtime.topic(), 6)
         and (c.student_id = (select auth.uid()) or (select public.is_admin()))
    )
  );

drop policy if exists "tp_chat_typing_write" on realtime.messages;
create policy "tp_chat_typing_write"
  on realtime.messages
  for insert
  to authenticated
  with check (
    extension = 'broadcast'
    and realtime.topic() like 'chat:%'
    and (select public.is_activated())
    and exists (
      select 1 from public.conversations c
       where c.id::text = substr(realtime.topic(), 6)
         and (c.student_id = (select auth.uid()) or (select public.is_admin()))
    )
  );
