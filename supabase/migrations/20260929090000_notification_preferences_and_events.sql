-- ============================================================================
-- The Traders Planet — notification preferences, complete event coverage, and
-- per-device push metadata.
--
-- ADDITIVE. Nothing is dropped, no row is rewritten, no existing policy or
-- privilege changes, and the running app keeps working before, during and after
-- this file: the previous client only ever reads the columns it already knows,
-- and every notification row this file makes uses one of the ORIGINAL six
-- `notification_kind` values, so an older client (or a rollback) never meets a
-- kind it cannot draw. Rolling the database back is
-- supabase/rollbacks/20260929090000_notification_preferences_and_events.rollback.sql.
--
-- What it adds
--   1. notification_preferences   one row per member, RLS: own row only. No row
--                                 means the defaults below, so no backfill.
--   2. notifications.category / link / actor_id   (nullable)
--   3. push_subscriptions.environment / platform  (nullable; server-written)
--   4. notification_wanted()      the one place a preference is looked up.
--   5. Trigger functions, replaced in place (same names, same triggers):
--        chat message (per-kind wording, sender name, opt-out, once per message)
--        official post (per-type wording, opt-out)
--        comment on my post (opt-out, once per comment)
--        like on my post (opt-IN, once per person per post)
--      and four new events that already exist in the app but never notified:
--        a Students Community post (opt-IN)
--        an admin removing a member's post or comment (moderation)
--        a new membership request (to admins)
--        a member activating their account (to admins)
--   6. mark_related_notifications_read()   opening a chat or post clears its
--                                          notifications, so the badge is true.
--   7. Unique indexes so one event can never notify the same person twice.
--
-- Every notification trigger is non-blocking: if creating a notification ever
-- fails, the member's message, post or comment is still saved. The failure is a
-- WARNING in the Postgres log, never a lost message.
--
-- Defaults (a member with no row): direct messages, official announcements,
-- comments and system notices ON; Students Community posts and likes OFF.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Preferences
-- ----------------------------------------------------------------------------

create table if not exists public.notification_preferences (
  user_id               uuid primary key references public.profiles (id) on delete cascade,
  direct_messages       boolean not null default true,
  official_announcements boolean not null default true,
  community_posts       boolean not null default false,
  comments              boolean not null default true,
  likes                 boolean not null default false,
  system                boolean not null default true,
  updated_at            timestamptz not null default now()
);

comment on table public.notification_preferences is
  'A member''s notification choices. One toggle per category covers both the in-app list and push; a device is enabled separately. No row = the defaults (likes and community posts off).';

alter table public.notification_preferences enable row level security;

drop policy if exists "notification_preferences_select_own" on public.notification_preferences;
create policy "notification_preferences_select_own"
  on public.notification_preferences for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "notification_preferences_insert_own" on public.notification_preferences;
create policy "notification_preferences_insert_own"
  on public.notification_preferences for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "notification_preferences_update_own" on public.notification_preferences;
create policy "notification_preferences_update_own"
  on public.notification_preferences for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Nothing here is ever deleted by a client (rows go with the profile). Start from
-- nothing, so no default grant (delete, truncate, …) survives whatever the
-- project's default privileges are.
revoke all on public.notification_preferences from public, anon, authenticated;
grant select, insert, update on public.notification_preferences to authenticated;
grant all on public.notification_preferences to service_role;

drop trigger if exists notification_preferences_set_updated_at on public.notification_preferences;
create trigger notification_preferences_set_updated_at
  before update on public.notification_preferences
  for each row execute function public.set_updated_at();

-- Only members who opted in to Students Community posts are ever scanned when
-- one is published.
create index if not exists notification_preferences_community_idx
  on public.notification_preferences (user_id) where community_posts;

-- ----------------------------------------------------------------------------
-- 2. What a notification is about, and where it leads
-- ----------------------------------------------------------------------------

alter table public.notifications
  add column if not exists category text,
  add column if not exists link     text,
  add column if not exists actor_id uuid references public.profiles (id) on delete set null;

comment on column public.notifications.category is
  'Preference category: direct_messages, official_announcements, community_posts, comments, likes or system. NULL on rows made before this column existed.';
comment on column public.notifications.link is
  'In-app path for events that are not a chat or a post (e.g. /admin/membership-requests). Only ever set by the triggers below.';
comment on column public.notifications.actor_id is
  'Who did it, for likes only (so one person cannot notify twice for one post). Never set for comments, whose author may be anonymous.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'notifications_category_check' and conrelid = 'public.notifications'::regclass) then
    alter table public.notifications add constraint notifications_category_check
      check (category is null or category in
        ('direct_messages', 'official_announcements', 'community_posts', 'comments', 'likes', 'system'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'notifications_link_check' and conrelid = 'public.notifications'::regclass) then
    alter table public.notifications add constraint notifications_link_check
      check (link is null or (link ~ '^/[A-Za-z0-9/_?=&%.-]{0,200}$' and link !~ '^//'));
  end if;
end $$;

create index if not exists notifications_unread_idx
  on public.notifications (user_id) where read_at is null;

-- One event, one notification per person. Guarded: if a database somehow
-- already holds duplicates the index is skipped (with a notice) rather than
-- failing the whole file; the triggers' ON CONFLICT DO NOTHING is then simply
-- a no-op, exactly as before.
do $$
begin
  if exists (select 1 from public.notifications where kind = 'chat' and related_message_id is not null
             group by user_id, related_message_id having count(*) > 1) then
    raise notice 'skipped notifications_chat_once_idx: duplicate chat notifications already exist';
  else
    create unique index if not exists notifications_chat_once_idx
      on public.notifications (user_id, related_message_id)
      where kind = 'chat' and related_message_id is not null;
  end if;

  if exists (select 1 from public.notifications where kind = 'comment' and related_comment_id is not null
             group by user_id, related_comment_id having count(*) > 1) then
    raise notice 'skipped notifications_comment_once_idx: duplicate comment notifications already exist';
  else
    create unique index if not exists notifications_comment_once_idx
      on public.notifications (user_id, related_comment_id)
      where kind = 'comment' and related_comment_id is not null;
  end if;

  if exists (select 1 from public.notifications where kind = 'signal' and related_post_id is not null
             group by user_id, related_post_id having count(*) > 1) then
    raise notice 'skipped notifications_post_once_idx: duplicate post notifications already exist';
  else
    create unique index if not exists notifications_post_once_idx
      on public.notifications (user_id, related_post_id)
      where kind = 'signal' and related_post_id is not null;
  end if;
end $$;

-- New rows only carry actor_id, so this can never clash with an old row.
create unique index if not exists notifications_like_once_idx
  on public.notifications (user_id, related_post_id, actor_id)
  where kind = 'like' and actor_id is not null;

-- ----------------------------------------------------------------------------
-- 3. Which environment registered a push device
--
-- A Vercel Preview shares this database. Without a marker, a phone that
-- subscribed through a Preview would receive production pushes (and the other
-- way round). The server writes it from Vercel's own VERCEL_ENV, never from the
-- request. NULL = registered before this column existed = production.
-- ----------------------------------------------------------------------------

alter table public.push_subscriptions
  add column if not exists environment text,
  add column if not exists platform    text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'push_subscriptions_environment_check' and conrelid = 'public.push_subscriptions'::regclass) then
    alter table public.push_subscriptions add constraint push_subscriptions_environment_check
      check (environment is null or environment in ('production', 'preview', 'development'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'push_subscriptions_platform_check' and conrelid = 'public.push_subscriptions'::regclass) then
    alter table public.push_subscriptions add constraint push_subscriptions_platform_check
      check (platform is null or platform in ('ios', 'android', 'desktop', 'other'));
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 4. Preference lookup — the only place the defaults are written down
-- ----------------------------------------------------------------------------

create or replace function public.notification_wanted(p_user uuid, p_category text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select case p_category
              when 'direct_messages'        then np.direct_messages
              when 'official_announcements' then np.official_announcements
              when 'community_posts'        then np.community_posts
              when 'comments'               then np.comments
              when 'likes'                  then np.likes
              when 'system'                 then np.system
            end
       from public.notification_preferences np
      where np.user_id = p_user),
    p_category in ('direct_messages', 'official_announcements', 'comments', 'system')
  );
$$;

revoke execute on function public.notification_wanted(uuid, text) from public, anon, authenticated;
grant execute on function public.notification_wanted(uuid, text) to service_role;

-- How a chat message is described: "Rahul sent you <this>."
create or replace function public.notification_message_phrase(p_kind public.message_kind)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_kind
    when 'image' then 'a photo'
    when 'video' then 'a video message'
    when 'voice' then 'a voice message'
    when 'pdf'   then 'a PDF'
    when 'file'  then 'a file'
    else 'a message'
  end;
$$;

revoke execute on function public.notification_message_phrase(public.message_kind) from public, anon, authenticated;
grant execute on function public.notification_message_phrase(public.message_kind) to service_role;

-- ----------------------------------------------------------------------------
-- 5a. Chat: one notification per incoming message, whatever it carries.
--     Same function names and signatures as before, so the two triggers that
--     call them (messages_notify, messages_notify_upload_complete) are untouched.
-- ----------------------------------------------------------------------------

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
  v_phrase  text;
  v_sender  text;
  v_body    text := nullif(btrim(p_body), '');
begin
  select student_id into v_student from public.conversations where id = p_conversation_id;
  select kind into v_kind from public.messages where id = p_message_id;
  v_phrase := public.notification_message_phrase(coalesce(v_kind, 'text'));

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

-- ----------------------------------------------------------------------------
-- 5b. Official posts: the intended audience is activated students who have not
--     turned announcements off. The wording says what kind of post it is.
-- ----------------------------------------------------------------------------

create or replace function public.notify_new_official_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label text;
  v_title text;
  v_post  text := nullif(btrim(new.title), '');
begin
  if new.channel = 'official' then
    v_label := case new.attachment::text
      when 'image' then 'image'
      when 'video' then 'video'
      when 'pdf'   then 'PDF'
      when 'file'  then 'file'
      when 'voice' then 'voice note'
      when 'poll'  then 'poll'
      when 'chart' then 'chart'
      else null
    end;
    v_title := case when v_label is null then 'New official announcement' else 'New official ' || v_label end
               || case when v_post is null then '' else ': ' || left(v_post, 90) end;

    insert into public.notifications (user_id, kind, category, title, body, related_post_id)
    select p.id, 'signal', 'official_announcements', v_title, coalesce(new.body, ''), new.id
      from public.profiles p
     where p.role = 'student'
       and p.activated_at is not null
       and public.notification_wanted(p.id, 'official_announcements')
    on conflict do nothing;
  end if;
  return new;
exception when others then
  raise warning 'notify_new_official_post failed for post %: %', new.id, sqlerrm;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5c. Students Community posts: opt-in only. The name is the post's own
--     snapshot, which is "Unknown User" for an anonymous post.
-- ----------------------------------------------------------------------------

create or replace function public.notify_new_student_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.channel = 'students' then
    insert into public.notifications (user_id, kind, category, title, body, related_post_id)
    select p.id, 'signal', 'community_posts',
           new.display_name || ' posted in the Students Community',
           left(coalesce(nullif(btrim(new.title), ''), nullif(btrim(new.body), ''), ''), 200),
           new.id
      from public.notification_preferences np
      join public.profiles p on p.id = np.user_id
     where np.community_posts
       and p.id is distinct from new.author_id
       and (p.role = 'admin' or p.activated_at is not null)
    on conflict do nothing;
  end if;
  return new;
exception when others then
  raise warning 'notify_new_student_post failed for post %: %', new.id, sqlerrm;
  return new;
end;
$$;

-- A trigger function is never called by a client; take away the default right anyway.
revoke execute on function public.notify_new_student_post() from public, anon, authenticated;

drop trigger if exists posts_notify_students on public.posts;
create trigger posts_notify_students
  after insert on public.posts
  for each row when (new.channel = 'students')
  execute function public.notify_new_student_post();

-- ----------------------------------------------------------------------------
-- 5d. Comments and likes on my post
-- ----------------------------------------------------------------------------

create or replace function public.notify_new_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author uuid;
begin
  select author_id into v_author from public.posts where id = new.post_id;
  if v_author is not null
     and v_author is distinct from new.author_id
     and public.notification_wanted(v_author, 'comments') then
    insert into public.notifications
      (user_id, kind, category, title, body, related_post_id, related_comment_id)
    values
      (v_author, 'comment', 'comments', new.display_name || ' commented on your post',
       coalesce(new.body, 'Sent a voice note'), new.post_id, new.id)
    on conflict do nothing;
  end if;
  return new;
exception when others then
  raise warning 'notify_new_comment failed for comment %: %', new.id, sqlerrm;
  return new;
end;
$$;

create or replace function public.notify_new_like()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author      uuid;
  v_liker_name  text;
begin
  select author_id into v_author from public.posts where id = new.post_id;
  if v_author is not null
     and v_author is distinct from new.user_id
     and public.notification_wanted(v_author, 'likes') then
    select full_name into v_liker_name from public.profiles where id = new.user_id;
    insert into public.notifications
      (user_id, kind, category, title, body, related_post_id, actor_id)
    values
      (v_author, 'like', 'likes', coalesce(v_liker_name, 'Someone') || ' liked your post', '', new.post_id, new.user_id)
    on conflict do nothing;
  end if;
  return new;
exception when others then
  raise warning 'notify_new_like failed for post %: %', new.post_id, sqlerrm;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5e. Moderation: an admin removes a member's post or comment.
--
-- Only when the person doing it is an admin acting through the app
-- (auth.uid() is theirs) and the content was somebody else's. Not for the
-- author deleting their own, not for the six-month retention sweep or the SQL
-- editor (no auth.uid()), and not for comments that disappear because their
-- post did.
-- ----------------------------------------------------------------------------

create or replace function public.notify_content_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid := auth.uid();
  v_snippet text;
  v_title   text;
begin
  if v_actor is null
     or old.author_id is not distinct from v_actor
     or not public.is_admin(v_actor)
     or not public.notification_wanted(old.author_id, 'system') then
    return old;
  end if;
  -- Separate branches, not one CASE: plpgsql plans each statement on its own,
  -- so the branch that does not apply never looks up a column this row lacks.
  if tg_table_name = 'comments' then
    if not exists (select 1 from public.posts where id = old.post_id) then
      return old;
    end if;
    v_snippet := left(coalesce(nullif(btrim(old.body), ''), ''), 80);
    v_title := 'An admin removed your comment';
  else
    v_snippet := left(coalesce(nullif(btrim(old.title), ''), nullif(btrim(old.body), ''), ''), 80);
    v_title := 'An admin removed your post';
  end if;

  insert into public.notifications (user_id, kind, category, title, body, link)
  values (old.author_id, 'session', 'system', v_title, v_snippet, '/community');
  return old;
exception when others then
  raise warning 'notify_content_removed failed for %: %', tg_table_name, sqlerrm;
  return old;
end;
$$;

-- A trigger function is never called by a client; take away the default right anyway.
revoke execute on function public.notify_content_removed() from public, anon, authenticated;

drop trigger if exists posts_notify_removed on public.posts;
create trigger posts_notify_removed
  after delete on public.posts
  for each row execute function public.notify_content_removed();

drop trigger if exists comments_notify_removed on public.comments;
create trigger comments_notify_removed
  after delete on public.comments
  for each row execute function public.notify_content_removed();

-- ----------------------------------------------------------------------------
-- 5f. A new membership request tells the admins. The database already allows
--     only one waiting request per person (guard_membership_request), so a
--     request form cannot be used to flood an admin's phone.
-- ----------------------------------------------------------------------------

create or replace function public.notify_new_membership_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (user_id, kind, category, title, body, link)
  select p.id, 'session', 'system', 'New membership request', left(new.name, 80), '/admin/membership-requests'
    from public.profiles p
   where p.role = 'admin'
     and public.notification_wanted(p.id, 'system');
  return new;
exception when others then
  raise warning 'notify_new_membership_request failed for request %: %', new.id, sqlerrm;
  return new;
end;
$$;

-- A trigger function is never called by a client; take away the default right anyway.
revoke execute on function public.notify_new_membership_request() from public, anon, authenticated;

drop trigger if exists membership_requests_notify on public.membership_requests;
create trigger membership_requests_notify
  after insert on public.membership_requests
  for each row execute function public.notify_new_membership_request();

-- ----------------------------------------------------------------------------
-- 5g. A member redeeming their activation code tells the admins. It fires once,
--     on the change from "not activated" to "activated" (redeem_activation_code
--     is the only writer), and never for an admin, who is activated by
--     definition.
-- ----------------------------------------------------------------------------

create or replace function public.notify_member_activated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The lock-screen line is the title, so the member's name stays in the body (in-app only),
  -- exactly as for a membership request.
  insert into public.notifications (user_id, kind, category, title, body, link)
  select p.id, 'session', 'system', 'A member activated their account',
         left(coalesce(nullif(btrim(new.full_name), ''), 'A new member'), 80), '/admin/activation-codes'
    from public.profiles p
   where p.role = 'admin'
     and p.id <> new.id
     and public.notification_wanted(p.id, 'system');
  return new;
exception when others then
  raise warning 'notify_member_activated failed for member %: %', new.id, sqlerrm;
  return new;
end;
$$;

-- A trigger function is never called by a client; take away the default right anyway.
revoke execute on function public.notify_member_activated() from public, anon, authenticated;

drop trigger if exists profiles_notify_activated on public.profiles;
create trigger profiles_notify_activated
  after update of activated_at on public.profiles
  for each row
  when (old.activated_at is null and new.activated_at is not null and new.role <> 'admin')
  execute function public.notify_member_activated();

-- ----------------------------------------------------------------------------
-- 6. Opening a conversation or a post clears the notifications about it.
--    SECURITY INVOKER: it can only touch the caller's own rows (RLS).
-- ----------------------------------------------------------------------------

create or replace function public.mark_related_notifications_read(
  p_conversation_id uuid default null,
  p_post_id uuid default null
)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.notifications
     set read_at = now()
   where user_id = auth.uid()
     and read_at is null
     and (
       (p_conversation_id is not null and kind = 'chat' and related_conversation_id = p_conversation_id)
       or (p_post_id is not null and related_post_id = p_post_id)
     );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.mark_related_notifications_read(uuid, uuid) from public, anon;
grant execute on function public.mark_related_notifications_read(uuid, uuid) to authenticated, service_role;

-- PostgREST picks up new tables, columns and functions on its own after DDL;
-- this only makes sure it does so now.
notify pgrst, 'reload schema';
