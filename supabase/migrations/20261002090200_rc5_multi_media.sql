-- ============================================================================
-- RC5 — several photos, videos and files in one post or one chat send.
--
-- Additive only. Nothing existing is rewritten, nothing is deleted.
--
-- Posts: the FIRST item stays in the post's own attachment columns, exactly as
-- before, so RC3/RC4 apps keep showing it; items 2..n go in public.post_media.
-- A post and all its items are written in one transaction
-- (create_post_with_media), so no reader ever sees half a post. Every item is
-- bound to its server-issued upload grant (private.claim_upload_grant), like
-- the first item always was, and carries no author id in its key.
--
-- Chat: every item stays its own message (each keeps its own resumable,
-- retryable upload); items sent together share messages.album_id and are shown
-- as one album. The recipient gets ONE notification per album ("sent you 5
-- photos"), not one per photo.
--
-- Width/height (posts, post_media, messages) let the app reserve the right
-- space before a picture loads. Display hints only; NULL on everything older.
-- ============================================================================

-- 1. Dimensions
alter table public.posts
  add column if not exists media_width  integer,
  add column if not exists media_height integer;
alter table public.messages
  add column if not exists media_width  integer,
  add column if not exists media_height integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'posts_media_size_check' and conrelid = 'public.posts'::regclass) then
    alter table public.posts add constraint posts_media_size_check
      check ((media_width is null or media_width between 1 and 20000) and (media_height is null or media_height between 1 and 20000));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'messages_media_size_check' and conrelid = 'public.messages'::regclass) then
    alter table public.messages add constraint messages_media_size_check
      check ((media_width is null or media_width between 1 and 20000) and (media_height is null or media_height between 1 and 20000));
  end if;
end $$;

-- 2. Chat albums
alter table public.messages
  add column if not exists album_id    uuid,
  add column if not exists album_index smallint,
  add column if not exists album_size  smallint,
  add column if not exists album_kind  text;

comment on column public.messages.album_id is
  'Messages sent together share an album id and are shown as one album; NULL for a single message.';
comment on column public.messages.album_kind is
  'What the album holds, for its one notification: photos, videos, media (photos and videos) or files.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'messages_album_check' and conrelid = 'public.messages'::regclass) then
    alter table public.messages add constraint messages_album_check check (
      (album_id is null and album_index is null and album_size is null and album_kind is null)
      or (album_id is not null and album_size between 2 and 50 and album_index between 0 and album_size - 1
          and album_kind in ('photos', 'videos', 'media', 'files'))
    );
  end if;
end $$;

create index if not exists messages_album_idx on public.messages (album_id) where album_id is not null;

-- One notification per album. The first item of an album to become ready
-- notifies, naming the whole album; the rest find it and stay quiet. An
-- advisory lock makes two items finishing at the same instant take turns.
create or replace function public.notify_message_recipients(
  p_conversation_id uuid, p_sender_id uuid, p_body text, p_message_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student uuid;
  v_kind    public.message_kind;
  v_album   uuid;
  v_size    smallint;
  v_akind   text;
  v_phrase  text;
  v_sender  text;
  v_body    text := nullif(btrim(p_body), '');
begin
  select student_id into v_student from public.conversations where id = p_conversation_id;
  select kind, album_id, album_size, album_kind into v_kind, v_album, v_size, v_akind
    from public.messages where id = p_message_id;

  if v_album is not null then
    perform pg_advisory_xact_lock(hashtextextended('tp-album:' || v_album::text, 0));
    if exists (select 1 from public.notifications n
                where n.kind = 'chat'
                  and n.related_message_id in (select m.id from public.messages m where m.album_id = v_album)) then
      return;
    end if;
    v_phrase := v_size::text || ' ' || case v_akind
      when 'photos' then 'photos' when 'videos' then 'videos' when 'media' then 'photos and videos' else 'files' end;
  else
    v_phrase := public.notification_message_phrase(coalesce(v_kind, 'text'));
  end if;

  if public.is_admin(p_sender_id) then
    if v_student is not null
       and p_sender_id is distinct from v_student
       and public.notification_wanted(v_student, 'direct_messages') then
      insert into public.notifications
        (user_id, kind, category, title, body, related_conversation_id, related_message_id)
      values
        (v_student, 'chat', 'direct_messages', 'Admin sent you ' || v_phrase, v_body, p_conversation_id, p_message_id)
      on conflict do nothing;
    end if;
  else
    select coalesce(nullif(btrim(full_name), ''), 'A student') into v_sender
      from public.profiles where id = p_sender_id;
    insert into public.notifications
      (user_id, kind, category, title, body, related_conversation_id, related_message_id)
    select p.id, 'chat', 'direct_messages',
           coalesce(v_sender, 'A student') || ' sent you ' || v_phrase,
           v_body, p_conversation_id, p_message_id
      from public.profiles p
     where p.role = 'admin'
       and p.id <> p_sender_id
       and public.notification_wanted(p.id, 'direct_messages')
    on conflict do nothing;
  end if;
exception when others then
  raise warning 'notify_message_recipients failed for message %: %', p_message_id, sqlerrm;
end;
$$;

revoke execute on function public.notify_message_recipients(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.notify_message_recipients(uuid, uuid, text, uuid) to service_role;

-- 3. Post media (items 2..n of a post)
create table if not exists public.post_media (
  id                uuid primary key default gen_random_uuid(),
  post_id           uuid not null references public.posts (id) on delete cascade,
  position          smallint not null check (position between 1 and 49),
  kind              public.attachment_kind not null check (kind in ('image', 'video', 'pdf', 'file')),
  storage_key       text not null unique,
  poster_key        text unique,
  mime_type         text,
  size_bytes        bigint check (size_bytes is null or size_bytes > 0),
  poster_size_bytes bigint check (poster_size_bytes is null or poster_size_bytes > 0),
  file_name         text,
  width             integer check (width is null or width between 1 and 20000),
  height            integer check (height is null or height between 1 and 20000),
  media_purged      boolean not null default false,
  created_at        timestamptz not null default now(),
  unique (post_id, position)
);

comment on table public.post_media is
  'Attachments 2..n of a post (the first stays in posts.storage_key so older apps still show it). Same visibility as the post; keys are server-issued upload grants.';

create index if not exists post_media_post_idx on public.post_media (post_id, position);

alter table public.post_media enable row level security;
revoke all on public.post_media from anon;
grant select, insert, delete on public.post_media to authenticated;
grant all on public.post_media to service_role;

-- Seen exactly when the post is: activated members, and for an anonymous post
-- only its author and admins (others read the items through post_media_for()).
drop policy if exists post_media_select on public.post_media;
create policy post_media_select on public.post_media
  for select to authenticated
  using (
    public.is_activated()
    and exists (select 1 from public.posts p
                 where p.id = post_media.post_id
                   and (not p.is_anonymous or p.author_id = auth.uid() or public.is_admin()))
  );

drop policy if exists post_media_insert_own on public.post_media;
create policy post_media_insert_own on public.post_media
  for insert to authenticated
  with check (
    public.is_activated()
    and exists (select 1 from public.posts p where p.id = post_media.post_id and p.author_id = auth.uid())
  );

drop policy if exists post_media_delete_own_or_admin on public.post_media;
create policy post_media_delete_own_or_admin on public.post_media
  for delete to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.posts p where p.id = post_media.post_id and p.author_id = auth.uid())
  );

-- Server-owned fields come from the upload grant, whatever the client sent.
create or replace function public.guard_post_media_insert()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_grant  public.media_upload_grants;
  v_author uuid;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  select author_id into v_author from public.posts where id = new.post_id;
  new.created_at := now();
  new.media_purged := false;

  v_grant := private.claim_upload_grant(new.storage_key, v_author, 'post', null);
  if v_grant.storage_key is null then
    raise exception 'This attachment was not uploaded through the app' using errcode = '42501';
  end if;
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

drop trigger if exists post_media_guard_insert on public.post_media;
create trigger post_media_guard_insert
  before insert on public.post_media
  for each row execute function public.guard_post_media_insert();

-- A post with all its items, in one transaction. Runs as the caller, so every
-- guard and policy on posts and post_media applies exactly as for a direct
-- insert. p_media is an array of {kind, storage_key, poster_key,
-- poster_size_bytes, mime_type, size_bytes, file_name, width, height} for
-- items 2..n, in order.
create or replace function public.create_post_with_media(p_post jsonb, p_media jsonb)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_id   uuid;
  v_item jsonb;
  v_pos  smallint := 0;
begin
  if jsonb_typeof(coalesce(p_media, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_media, '[]'::jsonb)) > 49 then
    raise exception 'A post can hold at most 50 attachments' using errcode = '22023';
  end if;

  insert into public.posts (
    author_id, channel, title, body, attachment, storage_key, poster_key, poster_size_bytes,
    mime_type, size_bytes, file_name, is_anonymous, media_width, media_height
  ) values (
    (p_post ->> 'author_id')::uuid,
    (p_post ->> 'channel')::public.post_channel,
    p_post ->> 'title',
    p_post ->> 'body',
    coalesce(p_post ->> 'attachment', 'none')::public.attachment_kind,
    p_post ->> 'storage_key',
    p_post ->> 'poster_key',
    (p_post ->> 'poster_size_bytes')::bigint,
    p_post ->> 'mime_type',
    (p_post ->> 'size_bytes')::bigint,
    p_post ->> 'file_name',
    coalesce((p_post ->> 'is_anonymous')::boolean, false),
    (p_post ->> 'media_width')::integer,
    (p_post ->> 'media_height')::integer
  ) returning id into v_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_media, '[]'::jsonb)) loop
    v_pos := v_pos + 1;
    insert into public.post_media (post_id, position, kind, storage_key, poster_key, poster_size_bytes,
                                   mime_type, size_bytes, file_name, width, height)
    values (v_id, v_pos, (v_item ->> 'kind')::public.attachment_kind, v_item ->> 'storage_key', v_item ->> 'poster_key',
            (v_item ->> 'poster_size_bytes')::bigint, v_item ->> 'mime_type', (v_item ->> 'size_bytes')::bigint,
            v_item ->> 'file_name', (v_item ->> 'width')::integer, (v_item ->> 'height')::integer);
  end loop;
  return v_id;
end;
$$;

revoke all on function public.create_post_with_media(jsonb, jsonb) from public, anon;
grant execute on function public.create_post_with_media(jsonb, jsonb) to authenticated;

-- Items 2..n of the given posts, for every member who can see the post, with
-- the same withholding rules the feed applies to the first item: on an
-- anonymous post, a key that contains the author's id and the original file
-- name never reach other members. A row at position 0 carries only the first
-- item's dimensions (its keys come from the feed, which already applies the
-- rules), so the app can size every picture before it loads.
create or replace function public.post_media_for(p_post_ids uuid[])
returns table(
  id uuid, post_id uuid, "position" smallint, kind public.attachment_kind,
  storage_key text, poster_key text, mime_type text, size_bytes bigint,
  file_name text, width integer, height integer, media_purged boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with viewer as (
    select auth.uid() as uid, public.is_admin() as admin, public.is_activated() as activated
  )
  select m.id, m.post_id, m.position, m.kind,
    case when p.is_anonymous and not v.admin and p.author_id is distinct from v.uid
              and (position(p.author_id::text in m.storage_key) > 0 or position(p.author_id::text in coalesce(m.poster_key, '')) > 0)
         then null else m.storage_key end,
    case when p.is_anonymous and not v.admin and p.author_id is distinct from v.uid
              and (position(p.author_id::text in m.storage_key) > 0 or position(p.author_id::text in coalesce(m.poster_key, '')) > 0)
         then null else m.poster_key end,
    m.mime_type, m.size_bytes,
    case when p.is_anonymous and not v.admin and p.author_id is distinct from v.uid and m.file_name is not null
         then 'Attachment' || coalesce(lower(substring(m.file_name from '(\.[A-Za-z0-9]{1,5})$')), '')
         else m.file_name end,
    m.width, m.height, m.media_purged
  from viewer v
  join public.post_media m on v.activated
  join public.posts p on p.id = m.post_id
  where m.post_id = any (p_post_ids)
  union all
  select null::uuid, p.id, 0::smallint, p.attachment, null, null, null, null, null, p.media_width, p.media_height, p.media_purged
  from viewer v
  join public.posts p on v.activated
  where p.id = any (p_post_ids)
    and p.media_width is not null and p.media_height is not null
  order by 2, 3
  limit 2500;
$$;

revoke all on function public.post_media_for(uuid[]) from public, anon;
grant execute on function public.post_media_for(uuid[]) to authenticated, service_role;

-- Storage housekeeping for items 2..n (the existing functions keep covering
-- the first item, unchanged, so a server that predates RC5 still works).
create or replace function public.select_expired_post_media_items()
returns table (id uuid, post_id uuid, storage_key text, poster_key text)
language sql
security definer
set search_path = ''
as $$
  select m.id, m.post_id, m.storage_key, m.poster_key
    from public.post_media m
    join public.posts p on p.id = m.post_id
   where p.created_at < public.community_retention_cutoff()
     and not m.media_purged;
$$;

create or replace function public.mark_post_media_items_purged(p_item_ids uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.post_media
     set media_purged = true, size_bytes = null, poster_size_bytes = null
   where id = any (p_item_ids);
$$;

revoke all on function public.select_expired_post_media_items() from public, anon, authenticated;
revoke all on function public.mark_post_media_items_purged(uuid[]) from public, anon, authenticated;
grant execute on function public.select_expired_post_media_items() to service_role;
grant execute on function public.mark_post_media_items_purged(uuid[]) to service_role;

-- 4. The new columns are written once, at insert. A member cannot move a
--    message into someone else's album or change the size hints afterwards.
--    (A separate guard, so the existing ones stay exactly as reviewed.)
create or replace function public.freeze_rc5_media_columns()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.media_width is distinct from old.media_width or new.media_height is distinct from old.media_height then
    raise exception 'This part of the post or message cannot be changed' using errcode = '42501';
  end if;
  -- Through jsonb, because a post row has no album columns to name.
  if tg_table_name = 'messages' then
    if (to_jsonb(new) -> 'album_id', to_jsonb(new) -> 'album_index', to_jsonb(new) -> 'album_size', to_jsonb(new) -> 'album_kind')
       is distinct from
       (to_jsonb(old) -> 'album_id', to_jsonb(old) -> 'album_index', to_jsonb(old) -> 'album_size', to_jsonb(old) -> 'album_kind') then
      raise exception 'This part of the message cannot be changed' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists messages_freeze_rc5_columns on public.messages;
create trigger messages_freeze_rc5_columns
  before update on public.messages
  for each row execute function public.freeze_rc5_media_columns();

drop trigger if exists posts_freeze_rc5_columns on public.posts;
create trigger posts_freeze_rc5_columns
  before update on public.posts
  for each row execute function public.freeze_rc5_media_columns();
