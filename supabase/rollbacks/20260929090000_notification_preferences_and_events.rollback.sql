-- ============================================================================
-- Rollback of 20260929090000_notification_preferences_and_events.sql
--
-- Puts the notification triggers back exactly as release/rc3 (Production
-- 4619d17) had them and removes what the migration added. Run it ONLY if the
-- migration has to be undone; the migration is additive and compatible with
-- the previous app, so a rollback of the app alone does not need this.
--
-- What is lost by running it: members' saved notification preferences, the
-- category / link / actor_id values on notifications made since the migration,
-- and the environment / platform marks on push devices. Notification rows,
-- push devices, messages, posts and comments themselves are kept.
--
-- Run as ONE script (a single transaction).
-- ============================================================================
begin;

drop trigger if exists profiles_notify_activated on public.profiles;
drop trigger if exists membership_requests_notify on public.membership_requests;
drop trigger if exists comments_notify_removed    on public.comments;
drop trigger if exists posts_notify_removed       on public.posts;
drop trigger if exists posts_notify_students      on public.posts;

drop function if exists public.notify_member_activated();
drop function if exists public.notify_new_membership_request();
drop function if exists public.notify_content_removed();
drop function if exists public.notify_new_student_post();
drop function if exists public.mark_related_notifications_read(uuid, uuid);

-- The four functions the migration replaced, as they were in release/rc3.
CREATE OR REPLACE FUNCTION public.notify_message_recipients(p_conversation_id uuid, p_sender_id uuid, p_body text, p_message_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_student uuid;
begin
  select student_id into v_student from public.conversations where id = p_conversation_id;
  if public.is_admin(p_sender_id) then
    if p_sender_id is distinct from v_student then
      insert into public.notifications (user_id, kind, title, body, related_conversation_id, related_message_id)
      values (v_student, 'chat', 'Admin sent you a message', coalesce(p_body, 'New message'), p_conversation_id, p_message_id);
    end if;
  else
    insert into public.notifications (user_id, kind, title, body, related_conversation_id, related_message_id)
    select p.id, 'chat', 'New message from a student', coalesce(p_body, 'New message'), p_conversation_id, p_message_id
    from public.profiles p where p.role = 'admin';
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_new_official_post()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.notify_new_comment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_author uuid;
begin
  select author_id into v_author from public.posts where id = new.post_id;
  if v_author is distinct from new.author_id then
    insert into public.notifications (user_id, kind, title, body, related_post_id, related_comment_id)
    values (v_author, 'comment', new.display_name || ' commented on your post', coalesce(new.body, 'Sent a voice note'), new.post_id, new.id);
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_new_like()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_author uuid;
  v_liker_name text;
begin
  select author_id into v_author from public.posts where id = new.post_id;
  if v_author is distinct from new.user_id then
    select full_name into v_liker_name from public.profiles where id = new.user_id;
    insert into public.notifications (user_id, kind, title, body, related_post_id)
    values (v_author, 'like', coalesce(v_liker_name, 'Someone') || ' liked your post', '', new.post_id);
  end if;
  return new;
end;
$function$
;

drop function if exists public.notification_message_phrase(public.message_kind);
drop function if exists public.notification_wanted(uuid, text);

drop index if exists public.notifications_chat_once_idx;
drop index if exists public.notifications_comment_once_idx;
drop index if exists public.notifications_post_once_idx;
drop index if exists public.notifications_like_once_idx;
drop index if exists public.notifications_unread_idx;
drop index if exists public.notification_preferences_community_idx;

alter table public.notifications
  drop constraint if exists notifications_category_check,
  drop constraint if exists notifications_link_check,
  drop column if exists category,
  drop column if exists link,
  drop column if exists actor_id;

alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_environment_check,
  drop constraint if exists push_subscriptions_platform_check,
  drop column if exists environment,
  drop column if exists platform;

drop table if exists public.notification_preferences;

notify pgrst, 'reload schema';
commit;
