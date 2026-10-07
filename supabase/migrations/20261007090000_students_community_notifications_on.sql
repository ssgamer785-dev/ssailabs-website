-- ============================================================================
-- Students Community posts notify the Admin and every activated Student.
--
-- Until now a new Students Community post told only members whose preferences
-- row said community_posts = true. The category was opt-in (column default
-- false, and false in notification_wanted() for a member without a row), so in
-- practice almost nobody heard about a post: not the Admin, not the Students.
--
-- From now on a new Students Community post notifies the Admin and every
-- activated Student except its author, unless that member's preferences row
-- says community_posts = false:
--   no preferences row         -> notified (the default is ON)
--   community_posts = true     -> notified
--   community_posts = false    -> not notified (kept exactly as it is)
--
-- Additive and idempotent. No row is written or rewritten: preferences,
-- notifications, posts, comments, messages and devices are untouched. An
-- existing community_posts = false stays false, even where it may only be the
-- old default (the app saves only the switch a member changes, so a row made by
-- changing another switch picked up false), because the database cannot tell
-- that apart from a choice.
--
--   1. notify_new_student_post(): the recipients above. As before: the wording,
--      the name from the post's own snapshot ("Unknown User" on an anonymous
--      post), no actor on the row, and one notification per person per post
--      (notifications_post_once_idx + ON CONFLICT DO NOTHING).
--   2. notification_wanted(): community_posts is ON for a member without a row.
--   3. New preferences rows start with community_posts = true.
--
-- Rollback: supabase/rollbacks/20261007090000_students_community_notifications_on.rollback.sql
-- ============================================================================

-- 1. Who hears about a new Students Community post.
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
      from public.profiles p
      left join public.notification_preferences np on np.user_id = p.id
     where p.id is distinct from new.author_id
       and (p.role = 'admin' or p.activated_at is not null)
       and (np.user_id is null or np.community_posts)
    on conflict do nothing;
  end if;
  return new;
exception when others then
  raise warning 'notify_new_student_post failed for post %: %', new.id, sqlerrm;
  return new;
end;
$$;

-- A trigger function is never called by a client.
revoke execute on function public.notify_new_student_post() from public, anon, authenticated;

-- 2. The one place a preference is looked up: Students Community posts are ON
--    for a member without a row. Every other category is as before.
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
    p_category in ('direct_messages', 'official_announcements', 'community_posts', 'comments', 'replies', 'system')
  );
$$;

revoke execute on function public.notification_wanted(uuid, text) from public, anon, authenticated;
grant execute on function public.notification_wanted(uuid, text) to service_role;

-- 3. New preferences rows: Students Community posts ON. Existing rows keep their values.
alter table public.notification_preferences alter column community_posts set default true;

comment on table public.notification_preferences is
  'A member''s notification choices. One toggle per category covers both the in-app list and push; a device is enabled separately. No row = the defaults (likes off, everything else on).';
