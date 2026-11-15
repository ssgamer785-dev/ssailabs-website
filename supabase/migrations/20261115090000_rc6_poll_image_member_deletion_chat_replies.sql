-- ============================================================================
-- RC6 — a picture on a poll, deleting a member, replying to a chat message.
--
-- Additive only. No existing row is changed by this migration, no existing
-- function is replaced, nothing is dropped. Every object is created with
-- IF NOT EXISTS / OR REPLACE on a NEW name, so the file can be re-run.
--
-- 1. Poll image
--    create_poll_post_with_image() makes a poll (through the existing
--    create_poll_post(), unchanged) and attaches ONE picture as its
--    post_media item 1, in one transaction. The picture goes through the
--    existing post_media guard: it must be this author's own server-issued
--    upload of kind 'image'. Only JPEG, PNG and WebP are accepted.
--
-- 2. Deleting a member
--    profiles.deleted_at / deleted_by, an admin audit log, and
--    admin_delete_member(), which only the server (service_role) can call.
--    It never deletes a profile, post, comment, like, poll vote or chat
--    message: a cascade from profiles would take other members' comments,
--    poll results and the admin's own chat history with it. Instead it
--      - closes the account in the app (activation cleared, role student,
--        name "Deleted member", phone and picture removed),
--      - removes the member's private records (devices, notifications,
--        notification settings, bookmarks),
--      - relabels their non-anonymous posts and comments "Deleted member",
--    and refuses self-deletion and the deletion of the last admin. The
--    server then closes the sign-in itself (Supabase Auth soft delete:
--    sessions revoked, email and password removed).
--    A deleted profile is locked: it can never be re-activated, promoted,
--    restored or edited by a member again.
--
-- 3. Chat replies
--    messages.reply_to_id: the message a message answers. Set once, at
--    insert, and only to a message of the SAME conversation. No foreign key:
--    a quoted message that is ever removed shows "Original message
--    unavailable" instead of blocking the removal.
--
-- Rollback: supabase/rollbacks/20261115090000_rc6_poll_image_member_deletion_chat_replies.rollback.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Poll image
-- ---------------------------------------------------------------------------

create or replace function public.create_poll_post_with_image(
  p_channel      public.post_channel,
  p_question     text,
  p_options      text[],
  p_is_anonymous boolean,
  p_image        jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_id   uuid;
  v_mime text;
begin
  if p_image is null or jsonb_typeof(p_image) <> 'object' or coalesce(p_image ->> 'storage_key', '') = '' then
    raise exception 'The poll picture is missing' using errcode = '22023';
  end if;

  -- The poll itself, exactly as without a picture.
  v_id := public.create_poll_post(p_channel, p_question, p_options, p_is_anonymous);

  -- The picture: item 1 of the post. post_media_guard_insert binds it to the
  -- caller's own upload grant and takes type and size from the grant.
  insert into public.post_media (post_id, position, kind, storage_key, width, height)
  values (
    v_id, 1, 'image', p_image ->> 'storage_key',
    nullif(p_image ->> 'width', '')::integer,
    nullif(p_image ->> 'height', '')::integer
  )
  returning mime_type into v_mime;

  if lower(coalesce(v_mime, '')) not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'A poll picture must be a JPEG, PNG or WebP image' using errcode = '22023';
  end if;

  return v_id;
end;
$$;

revoke all on function public.create_poll_post_with_image(public.post_channel, text, text[], boolean, jsonb) from public, anon;
grant execute on function public.create_poll_post_with_image(public.post_channel, text, text[], boolean, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Deleting a member
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid;

comment on column public.profiles.deleted_at is
  'Set when an admin deleted this member (admin_delete_member). The profile is kept, anonymised and locked, so their posts, comments and poll votes stay intact for everyone else.';

-- Members never set or clear these themselves.
create or replace function public.guard_profile_deletion_columns()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.deleted_at is distinct from old.deleted_at or new.deleted_by is distinct from old.deleted_by then
      raise exception 'This part of a profile is managed by the app' using errcode = '42501';
    end if;
    if old.deleted_at is not null then
      raise exception 'This account was deleted' using errcode = '42501';
    end if;
  end if;
  -- Whoever is writing: a deleted account stays deleted and inactive.
  if old.deleted_at is not null
     and (new.deleted_at is null or new.activated_at is not null or new.role = 'admin') then
    raise exception 'This account was deleted and cannot be restored or re-activated' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_deletion on public.profiles;
create trigger profiles_guard_deletion
  before update on public.profiles
  for each row execute function public.guard_profile_deletion_columns();

-- The admin audit log: who did what to which account, and when. Counts only;
-- no names, e-mails or phone numbers.
create table if not exists public.admin_audit_events (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  actor_id   uuid not null,
  action     text not null check (action in ('member_deleted', 'member_sign_in_closed', 'member_sign_in_close_failed')),
  target_id  uuid,
  details    jsonb not null default '{}'::jsonb
);

comment on table public.admin_audit_events is
  'Admin actions on member accounts. Written only by the server and admin_delete_member(); readable by admins.';

create index if not exists admin_audit_events_target_idx on public.admin_audit_events (target_id, created_at desc);

alter table public.admin_audit_events enable row level security;
revoke all on public.admin_audit_events from public, anon, authenticated;
grant select on public.admin_audit_events to authenticated;
grant all on public.admin_audit_events to service_role;

drop policy if exists admin_audit_events_select_admin on public.admin_audit_events;
create policy admin_audit_events_select_admin on public.admin_audit_events
  for select to authenticated
  using (public.is_admin());

/**
 * Deletes a member, as an admin. Called only by the server, after it has
 * verified that p_actor is the signed-in caller and an admin; checked again
 * here. Idempotent: deleting an already-deleted member returns ok with
 * already = true, so the server can retry closing their sign-in.
 */
create or replace function public.admin_delete_member(p_actor uuid, p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   public.profiles;
  v_target  public.profiles;
  v_devices int;
  v_notes   int;
  v_prefs   int;
  v_marks   int;
  v_posts   int;
  v_comments int;
  v_replies int;
  v_titles  int;
begin
  -- One deletion at a time, so two admins can never remove each other as the
  -- "other" admin at the same moment.
  perform pg_advisory_xact_lock(hashtext('public.admin_delete_member'));

  select * into v_actor from public.profiles where id = p_actor;
  if not found or v_actor.role <> 'admin' or v_actor.deleted_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'not_admin');
  end if;
  if p_target = p_actor then
    return jsonb_build_object('ok', false, 'reason', 'self');
  end if;

  select * into v_target from public.profiles where id = p_target for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_target.deleted_at is not null then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  if v_target.role = 'admin'
     and not exists (select 1 from public.profiles
                      where role = 'admin' and id <> p_target and deleted_at is null) then
    return jsonb_build_object('ok', false, 'reason', 'last_admin');
  end if;

  -- Private records: theirs alone.
  delete from public.push_subscriptions where user_id = p_target;
  get diagnostics v_devices = row_count;
  delete from public.notifications where user_id = p_target;
  get diagnostics v_notes = row_count;
  delete from public.notification_preferences where user_id = p_target;
  get diagnostics v_prefs = row_count;
  delete from public.bookmarks where user_id = p_target;
  get diagnostics v_marks = row_count;

  -- Shared content stays, under a neutral label. Anonymous items already say
  -- "Unknown User" and keep saying it.
  update public.posts set display_name = 'Deleted member'
   where author_id = p_target and not is_anonymous and display_name is distinct from 'Deleted member';
  get diagnostics v_posts = row_count;
  update public.comments set display_name = 'Deleted member'
   where author_id = p_target and not is_anonymous and display_name is distinct from 'Deleted member';
  get diagnostics v_comments = row_count;
  update public.comments set reply_to_name = 'Deleted member'
   where reply_to_comment_id in (select c.id from public.comments c where c.author_id = p_target and not c.is_anonymous)
     and reply_to_name is distinct from 'Deleted member';
  get diagnostics v_replies = row_count;
  -- Other members' notifications that name them ("<name> commented on your post").
  update public.notifications
     set title = 'Deleted member' || substr(title, char_length(v_target.full_name) + 1)
   where actor_id = p_target
     and char_length(coalesce(v_target.full_name, '')) > 0
     and left(title, char_length(v_target.full_name)) = v_target.full_name;
  get diagnostics v_titles = row_count;

  -- The account: closed in the app, and no longer personal.
  update public.profiles
     set deleted_at   = now(),
         deleted_by   = p_actor,
         activated_at = null,
         role         = 'student',
         full_name    = 'Deleted member',
         phone        = null,
         avatar_key   = null,
         avatar_url   = null,
         reveal_identity = false
   where id = p_target;

  insert into public.admin_audit_events (actor_id, action, target_id, details)
  values (p_actor, 'member_deleted', p_target, jsonb_build_object(
    'was_admin', v_target.role = 'admin',
    'was_activated', v_target.activated_at is not null,
    'devices_removed', v_devices,
    'notifications_removed', v_notes,
    'notification_settings_removed', v_prefs,
    'bookmarks_removed', v_marks,
    'posts_relabelled', v_posts,
    'comments_relabelled', v_comments,
    'reply_labels_relabelled', v_replies,
    'notification_titles_relabelled', v_titles
  ));

  return jsonb_build_object(
    'ok', true,
    'already', false,
    'avatar_key', v_target.avatar_key,
    'counts', jsonb_build_object(
      'devices', v_devices, 'notifications', v_notes, 'bookmarks', v_marks,
      'posts', v_posts, 'comments', v_comments
    )
  );
end;
$$;

revoke all on function public.admin_delete_member(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_delete_member(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Chat replies
-- ---------------------------------------------------------------------------

alter table public.messages add column if not exists reply_to_id uuid;

comment on column public.messages.reply_to_id is
  'The message this one answers (same conversation only). Set at insert; never changed.';

create index if not exists messages_reply_to_idx on public.messages (reply_to_id) where reply_to_id is not null;

-- Runs as the sender (RLS applies), so a member can only point at a message
-- they can already read, and only in the conversation they are writing to.
create or replace function public.guard_message_reply()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    if new.reply_to_id is not null
       and not exists (select 1 from public.messages m
                        where m.id = new.reply_to_id and m.conversation_id = new.conversation_id) then
      raise exception 'You can only reply to a message in this conversation' using errcode = '22023';
    end if;
    return new;
  end if;
  if current_user in ('authenticated', 'anon') and new.reply_to_id is distinct from old.reply_to_id then
    raise exception 'Messages cannot be edited' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_guard_reply on public.messages;
create trigger messages_guard_reply
  before insert or update of reply_to_id on public.messages
  for each row execute function public.guard_message_reply();

notify pgrst, 'reload schema';
