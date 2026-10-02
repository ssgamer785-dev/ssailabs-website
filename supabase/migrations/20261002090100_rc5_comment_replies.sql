-- ============================================================================
-- RC5 — replies to comments, in both communities.
--
-- Threading model: ONE level, like most chat apps. Every reply hangs off a
-- top-level comment (its thread root). Replying to a reply is allowed; the
-- reply is attached to the same root and remembers whom it answered:
--   parent_comment_id    the thread root (NULL = a top-level comment)
--   reply_to_comment_id  the comment actually answered (root or a reply)
--   reply_to_name        the answered comment's public display name at reply
--                        time — "Unknown User" when that comment is anonymous,
--                        so the label never reveals an anonymous author.
-- All three are set by the database from parent_comment_id alone; a client
-- cannot write the other two.
--
-- Additive: three nullable columns, one index, one new trigger, one new read
-- function. Existing comments are untouched and stay top-level. The existing
-- post_comments() is NOT changed, so RC3/RC4 clients keep working (they show
-- replies as ordinary comments). Deleting a comment never deletes other
-- people's replies: they keep their text and "replying to" label and simply
-- become top-level (ON DELETE SET NULL).
--
-- Notifications: the author of the comment answered gets "replied to your
-- comment" (new category 'replies', on by default, can be turned off); the
-- post author still gets "commented on your post" (category 'comments'). One
-- notification per person per comment; never to the person who wrote it.
-- ============================================================================

-- 1. Columns
alter table public.comments
  add column if not exists parent_comment_id   uuid references public.comments (id) on delete set null,
  add column if not exists reply_to_comment_id uuid references public.comments (id) on delete set null,
  add column if not exists reply_to_name       text;

comment on column public.comments.parent_comment_id is
  'Thread root for a reply (one level); NULL = top-level comment. A client sets it to the comment it answers; comments_thread_reply moves it to that comment''s root.';
comment on column public.comments.reply_to_comment_id is
  'The comment this reply answered (may itself be a reply). Set by comments_thread_reply; not client-writable.';
comment on column public.comments.reply_to_name is
  'Public display name of the answered comment at reply time ("Unknown User" when anonymous). Set by comments_thread_reply; not client-writable.';

create index if not exists comments_parent_idx
  on public.comments (parent_comment_id, created_at)
  where parent_comment_id is not null;

-- 2. Thread a reply (runs as owner: an anonymous comment's row is invisible
--    to other students, yet they may answer it).
create or replace function public.thread_comment_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target record;
begin
  if new.parent_comment_id is null then
    new.reply_to_comment_id := null;
    new.reply_to_name := null;
    return new;
  end if;

  select c.id, c.post_id, c.parent_comment_id, c.display_name
    into v_target
    from public.comments c
   where c.id = new.parent_comment_id;

  if not found then
    raise exception 'The comment you replied to has been removed' using errcode = '23503';
  end if;
  if v_target.post_id is distinct from new.post_id then
    raise exception 'A reply must be on the same post as the comment it answers' using errcode = '22023';
  end if;

  new.reply_to_comment_id := v_target.id;
  new.reply_to_name := v_target.display_name;
  new.parent_comment_id := coalesce(v_target.parent_comment_id, v_target.id);
  return new;
end;
$$;

revoke all on function public.thread_comment_reply() from public, anon, authenticated;

drop trigger if exists comments_thread_reply on public.comments;
create trigger comments_thread_reply
  before insert on public.comments
  for each row execute function public.thread_comment_reply();

-- 3. Preference: replies (on by default)
alter table public.notification_preferences
  add column if not exists replies boolean not null default true;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'notifications_category_check' and conrelid = 'public.notifications'::regclass)
     and not exists (select 1 from pg_constraint where conname = 'notifications_category_check'
                       and conrelid = 'public.notifications'::regclass
                       and pg_get_constraintdef(oid) like '%replies%') then
    alter table public.notifications drop constraint notifications_category_check;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'notifications_category_check' and conrelid = 'public.notifications'::regclass) then
    alter table public.notifications add constraint notifications_category_check
      check (category is null or category in
        ('direct_messages', 'official_announcements', 'community_posts', 'comments', 'replies', 'likes', 'system'));
  end if;
end $$;

comment on column public.notifications.category is
  'Preference category: direct_messages, official_announcements, community_posts, comments, replies, likes or system. NULL on rows made before this column existed.';

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
              when 'replies'                then np.replies
              when 'likes'                  then np.likes
              when 'system'                 then np.system
            end
       from public.notification_preferences np
      where np.user_id = p_user),
    p_category in ('direct_messages', 'official_announcements', 'comments', 'replies', 'system')
  );
$$;

revoke execute on function public.notification_wanted(uuid, text) from public, anon, authenticated;
grant execute on function public.notification_wanted(uuid, text) to service_role;

-- 4. Comment notifications, now aware of replies
create or replace function public.notify_new_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post_author   uuid;
  v_target_author uuid;
begin
  -- The person answered first, so they get the more specific notification;
  -- the one-per-person-per-comment index makes the post author's insert a
  -- no-op when it is the same person.
  if new.reply_to_comment_id is not null then
    select author_id into v_target_author from public.comments where id = new.reply_to_comment_id;
    -- private.feature_flags 'rc5_reply_notifications' = false holds these back
    -- while a server that prints notification bodies on lock screens is still
    -- live (the release package sets it, and releases it after promotion).
    -- No flag row means on.
    if v_target_author is not null
       and v_target_author is distinct from new.author_id
       and coalesce((select f.enabled from private.feature_flags f where f.name = 'rc5_reply_notifications'), true)
       and public.notification_wanted(v_target_author, 'replies') then
      insert into public.notifications
        (user_id, kind, category, title, body, related_post_id, related_comment_id)
      values
        (v_target_author, 'comment', 'replies', new.display_name || ' replied to your comment',
         coalesce(new.body, 'Sent a voice note'), new.post_id, new.id)
      on conflict do nothing;
    end if;
  end if;

  select author_id into v_post_author from public.posts where id = new.post_id;
  if v_post_author is not null
     and v_post_author is distinct from new.author_id
     and public.notification_wanted(v_post_author, 'comments') then
    insert into public.notifications
      (user_id, kind, category, title, body, related_post_id, related_comment_id)
    values
      (v_post_author, 'comment', 'comments', new.display_name || ' commented on your post',
       coalesce(new.body, 'Sent a voice note'), new.post_id, new.id)
    on conflict do nothing;
  end if;
  return new;
exception when others then
  raise warning 'notify_new_comment failed for comment %: %', new.id, sqlerrm;
  return new;
end;
$$;

revoke execute on function public.notify_new_comment() from public, anon, authenticated;

-- 5. Read a post's comments as threads: a page of top-level comments (newest
--    first) with ALL their replies (oldest first), so a reply never arrives
--    without the comment it belongs to. Same anonymity rules as post_comments:
--    an anonymous author's id and the target author's real name reach only the
--    author and admins.
create or replace function public.post_comment_threads(
  p_post_id uuid,
  p_before timestamptz default null,
  p_limit integer default 20
)
returns table(
  id uuid, post_id uuid, author_id uuid, body text,
  is_anonymous boolean, display_name text, created_at timestamptz,
  author_name text, is_mine boolean,
  parent_comment_id uuid, reply_to_comment_id uuid, reply_to_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  with viewer as (
    select auth.uid() as uid, public.is_admin() as admin, public.is_activated() as activated
  ),
  roots as (
    select c.id
      from viewer v
      join public.comments c on v.activated
     where c.post_id = p_post_id
       and c.parent_comment_id is null
       and (p_before is null or c.created_at < p_before)
     order by c.created_at desc, c.id desc
     limit least(coalesce(p_limit, 20), 50)
  )
  select
    c.id, c.post_id,
    case when c.is_anonymous and not v.admin and c.author_id is distinct from v.uid then null else c.author_id end,
    c.body,
    c.is_anonymous, c.display_name, c.created_at,
    case when v.admin then coalesce(pr.full_name, c.display_name) else c.display_name end,
    c.author_id = v.uid,
    c.parent_comment_id, c.reply_to_comment_id,
    case when v.admin then coalesce(tp.full_name, c.reply_to_name) else c.reply_to_name end
  from viewer v
  join public.comments c on v.activated
  left join public.profiles pr on pr.id = c.author_id
  left join public.comments t on t.id = c.reply_to_comment_id
  left join public.profiles tp on tp.id = t.author_id
  where c.post_id = p_post_id
    and (c.id in (select id from roots) or c.parent_comment_id in (select id from roots))
  order by coalesce(c.parent_comment_id, c.id), c.parent_comment_id nulls first, c.created_at, c.id;
$$;

revoke all on function public.post_comment_threads(uuid, timestamptz, integer) from public, anon;
grant execute on function public.post_comment_threads(uuid, timestamptz, integer) to authenticated, service_role;
