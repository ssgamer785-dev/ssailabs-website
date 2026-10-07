-- ============================================================================
-- Rollback of 20261007090000_students_community_notifications_on.sql
--
-- Puts back exactly what was there before it:
--   * notify_new_student_post() as in 20260929090000 (only members whose
--     preferences row says community_posts = true are told about a post);
--   * notification_wanted() as in 20261002090100 (RC5: community posts OFF for
--     a member without a row);
--   * new preferences rows starting with community_posts = false.
--
-- Nothing is deleted. Notifications already created stay; preferences rows
-- made while the hotfix was in place keep the values they were saved with.
--
-- Run as ONE script (a single transaction).
-- ============================================================================
begin;
set local lock_timeout = '5s';

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

alter table public.notification_preferences alter column community_posts set default false;

comment on table public.notification_preferences is
  'A member''s notification choices. One toggle per category covers both the in-app list and push; a device is enabled separately. No row = the defaults (likes and community posts off).';

commit;
