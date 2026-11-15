-- ============================================================================
-- RC6: a picture on a poll, deleting a member, replying to a chat message.
-- Fixtures: 83a…01 admin, 83a…02 second admin; 83b…01 Dana (deleted),
-- 83b…02 Eli, 83b…03 Fay (members who stay).
-- ============================================================================
\pset pager off
set client_min_messages = notice;

create or replace function pg_temp.check(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if coalesce(p_ok, false) then raise notice 'PASS  %', p_label;
  else raise exception 'FAIL: %', p_label; end if;
end $$;

create or replace function pg_temp.must_fail(p_sql text, p_expect text, p_label text)
returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FAIL: % — the statement was allowed', p_label;
exception when others then
  if sqlerrm like 'FAIL:%' then raise;
  elsif position(p_expect in sqlerrm) > 0 then raise notice 'PASS  % (%)', p_label, left(sqlerrm, 70);
  else raise exception 'FAIL: % — refused for the wrong reason: %', p_label, sqlerrm; end if;
end $$;

create or replace function pg_temp.grant_for(p_owner uuid, p_key text, p_mime text default 'image/jpeg', p_kind text default 'image')
returns void language sql as $$
  insert into public.media_upload_grants (storage_key, owner_id, scope, kind, mime_type, size_bytes)
  values (p_key, p_owner, 'post', p_kind, p_mime, 4321);
$$;

insert into auth.users (id, email) values
  ('83a00000-0000-4000-8000-000000000001', 'admin83@test.local'),
  ('83a00000-0000-4000-8000-000000000002', 'admin83b@test.local'),
  ('83b00000-0000-4000-8000-000000000001', 'dana83@test.local'),
  ('83b00000-0000-4000-8000-000000000002', 'eli83@test.local'),
  ('83b00000-0000-4000-8000-000000000003', 'fay83@test.local')
on conflict (id) do nothing;
update public.profiles set role = 'admin', full_name = 'Admin EightyThree' where id = '83a00000-0000-4000-8000-000000000001';
update public.profiles set role = 'admin', full_name = 'Second Admin' where id = '83a00000-0000-4000-8000-000000000002';
update public.profiles set full_name = 'Dana Eightythree', phone = '+910000000083', avatar_key = 'avatars/83b00000-0000-4000-8000-000000000001/me.jpg', activated_at = now()
 where id = '83b00000-0000-4000-8000-000000000001';
update public.profiles set full_name = 'Eli Eightythree', activated_at = now() where id = '83b00000-0000-4000-8000-000000000002';
update public.profiles set full_name = 'Fay Eightythree', activated_at = now() where id = '83b00000-0000-4000-8000-000000000003';
update private.feature_flags set enabled = true where name = 'enforce_upload_grants';

create temp table t83(name text primary key, id uuid);
grant all on t83 to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. A picture on a poll
-- ---------------------------------------------------------------------------
select pg_temp.grant_for('83b00000-0000-4000-8000-000000000002', 'posts/k83/1000000000001-00000000-0000-4000-8000-000000000001.bin');
select pg_temp.grant_for('83b00000-0000-4000-8000-000000000002', 'posts/k83/1000000000002-00000000-0000-4000-8000-000000000002.bin', 'image/gif');
select pg_temp.grant_for('83b00000-0000-4000-8000-000000000003', 'posts/k83/1000000000003-00000000-0000-4000-8000-000000000003.bin');
select pg_temp.grant_for('83b00000-0000-4000-8000-000000000002', 'posts/k83/1000000000004-00000000-0000-4000-8000-000000000004.bin', 'image/webp');

set role authenticated;
select set_config('app.current_user_id', '83b00000-0000-4000-8000-000000000002', false);
insert into t83 values ('poll', public.create_poll_post_with_image('students', 'Gold or silver this week?', array['Gold', 'Silver', ''], true,
  '{"storage_key":"posts/k83/1000000000001-00000000-0000-4000-8000-000000000001.bin","width":1200,"height":900}'::jsonb));
reset role;

select pg_temp.check((select attachment = 'poll' and is_anonymous from public.posts where id = (select id from t83 where name = 'poll')),
  'poll with a picture: the post is still a poll (and keeps its anonymity choice)');
select pg_temp.check((select count(*) = 2 from public.poll_options where post_id = (select id from t83 where name = 'poll')),
  'poll with a picture: its options are created as before (blank ones dropped)');
select pg_temp.check((select count(*) = 1 and bool_and(position = 1 and kind = 'image' and size_bytes = 4321 and mime_type = 'image/jpeg' and width = 1200)
                        from public.post_media where post_id = (select id from t83 where name = 'poll')),
  'poll with a picture: one image item, with type and size taken from the upload grant');

set role authenticated;
select set_config('app.current_user_id', '83b00000-0000-4000-8000-000000000002', false);
select pg_temp.must_fail($$select public.create_poll_post_with_image('students', 'gif poll', array['a','b'], false,
  '{"storage_key":"posts/k83/1000000000002-00000000-0000-4000-8000-000000000002.bin"}'::jsonb)$$,
  'JPEG, PNG or WebP', 'a GIF is refused as a poll picture');
select pg_temp.must_fail($$select public.create_poll_post_with_image('students', 'foreign poll', array['a','b'], false,
  '{"storage_key":"posts/k83/1000000000003-00000000-0000-4000-8000-000000000003.bin"}'::jsonb)$$,
  'not uploaded through the app', 'someone else''s upload is refused as a poll picture');
select pg_temp.must_fail($$select public.create_poll_post_with_image('students', 'reuse poll', array['a','b'], false,
  '{"storage_key":"posts/k83/1000000000001-00000000-0000-4000-8000-000000000001.bin"}'::jsonb)$$,
  '', 'a picture already used by another post is refused');
select pg_temp.must_fail($$select public.create_poll_post_with_image('students', 'no picture', array['a','b'], false, null)$$,
  'picture is missing', 'the picture variant needs a picture');
select pg_temp.must_fail($$select public.create_poll_post_with_image('students', 'one option', array['a',''], false,
  '{"storage_key":"posts/k83/1000000000004-00000000-0000-4000-8000-000000000004.bin"}'::jsonb)$$,
  'at least two options', 'the poll rules still apply with a picture');
insert into t83 values ('webp', public.create_poll_post_with_image('students', 'webp poll', array['a','b'], false,
  '{"storage_key":"posts/k83/1000000000004-00000000-0000-4000-8000-000000000004.bin"}'::jsonb));
insert into t83 values ('plain', public.create_poll_post('students', 'Plain poll', array['Yes', 'No'], false));
reset role;
select pg_temp.check((select count(*) = 0 from public.posts where body in ('gif poll', 'foreign poll', 'reuse poll', 'no picture', 'one option')),
  'a refused poll picture leaves no half-made poll behind');
select pg_temp.check((select used_at is null from public.media_upload_grants where storage_key = 'posts/k83/1000000000002-00000000-0000-4000-8000-000000000002.bin'),
  'and does not use up the upload it tried');
select pg_temp.check((select count(*) = 1 from public.post_media where post_id = (select id from t83 where name = 'webp')),
  'a WebP picture is accepted');
select pg_temp.check((select count(*) = 0 from public.post_media where post_id = (select id from t83 where name = 'plain')),
  'a poll without a picture is created exactly as before');

-- Another member sees the anonymous poll's picture (keys carry no author id), and votes as before.
set role authenticated;
select set_config('app.current_user_id', '83b00000-0000-4000-8000-000000000003', false);
select pg_temp.check((select count(*) = 1 and bool_and(storage_key is not null) from public.post_media_for(array[(select id from t83 where name = 'poll')]) where position = 1),
  'another member gets the anonymous poll''s picture through post_media_for');
select pg_temp.check((select (public.cast_poll_vote((select id from t83 where name = 'poll'),
                        (select id from public.poll_options where post_id = (select id from t83 where name = 'poll') and label = 'Gold'))) ->> 'ok' = 'true'),
  'voting on a poll with a picture works as before');
select set_config('app.current_user_id', '83b00000-0000-4000-8000-000000000001', false);
select public.cast_poll_vote((select id from t83 where name = 'poll'),
                             (select id from public.poll_options where post_id = (select id from t83 where name = 'poll') and label = 'Silver'));
select pg_temp.check((select string_agg(label || '=' || vote_count, ',' order by sort_order) = 'Gold=1,Silver=1'
                        from public.poll_results((select id from t83 where name = 'poll'))),
  'poll_results gives the number of votes per option');
reset role;

-- ---------------------------------------------------------------------------
-- 2. Deleting a member
-- ---------------------------------------------------------------------------
-- Dana's footprint: a named post with Eli's comment on it, an anonymous post, a
-- comment Eli replies to, a like, a poll vote (above), a bookmark, a device,
-- notification settings, her chat with the admin, and notifications.
insert into public.posts (id, author_id, channel, body) values
  ('83c00000-0000-4000-8000-000000000001', '83b00000-0000-4000-8000-000000000001', 'students', 'Dana named post');
insert into public.posts (id, author_id, channel, body, is_anonymous) values
  ('83c00000-0000-4000-8000-000000000002', '83b00000-0000-4000-8000-000000000001', 'students', 'Dana anonymous post', true);
insert into public.comments (id, post_id, author_id, body) values
  ('83d00000-0000-4000-8000-000000000001', '83c00000-0000-4000-8000-000000000001', '83b00000-0000-4000-8000-000000000002', 'Eli on Dana''s post'),
  ('83d00000-0000-4000-8000-000000000002', '83c00000-0000-4000-8000-000000000001', '83b00000-0000-4000-8000-000000000001', 'Dana''s own comment');
set role authenticated;
select set_config('app.current_user_id', '83b00000-0000-4000-8000-000000000002', false);
insert into public.comments (id, post_id, author_id, body, parent_comment_id) values
  ('83d00000-0000-4000-8000-000000000003', '83c00000-0000-4000-8000-000000000001', '83b00000-0000-4000-8000-000000000002', 'Eli replies to Dana', '83d00000-0000-4000-8000-000000000002');
reset role;
insert into public.likes (post_id, user_id) values ('83c00000-0000-4000-8000-000000000001', '83b00000-0000-4000-8000-000000000003'),
                                                  ('83c00000-0000-4000-8000-000000000001', '83b00000-0000-4000-8000-000000000001');
insert into public.bookmarks (post_id, user_id) values ('83c00000-0000-4000-8000-000000000001', '83b00000-0000-4000-8000-000000000001');
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth_key, environment)
values ('83b00000-0000-4000-8000-000000000001', 'https://push.example.test/dana83', 'p', 'a', 'production');
insert into public.notification_preferences (user_id, likes) values ('83b00000-0000-4000-8000-000000000001', true);
insert into public.conversations (id, student_id) values ('83e00000-0000-4000-8000-000000000001', '83b00000-0000-4000-8000-000000000001');
insert into public.messages (id, conversation_id, sender_id, kind, body, upload_status) values
  ('83f00000-0000-4000-8000-000000000001', '83e00000-0000-4000-8000-000000000001', '83b00000-0000-4000-8000-000000000001', 'text', 'Hello admin', 'ready'),
  ('83f00000-0000-4000-8000-000000000002', '83e00000-0000-4000-8000-000000000001', '83a00000-0000-4000-8000-000000000001', 'text', 'Hello Dana', 'ready');
insert into public.notifications (user_id, kind, category, title, actor_id, related_post_id) values
  ('83b00000-0000-4000-8000-000000000003', 'like', 'likes', 'Dana Eightythree liked your post', '83b00000-0000-4000-8000-000000000001', '83c00000-0000-4000-8000-000000000001');

create temp table t83_before as
  select (select count(*) from public.posts where author_id = '83b00000-0000-4000-8000-000000000001') as posts,
         (select count(*) from public.comments where post_id = '83c00000-0000-4000-8000-000000000001') as comments,
         (select count(*) from public.likes where post_id = '83c00000-0000-4000-8000-000000000001') as likes,
         (select count(*) from public.messages where conversation_id = '83e00000-0000-4000-8000-000000000001') as messages,
         (select count(*) from public.notifications where user_id = '83b00000-0000-4000-8000-000000000001') as dana_notes,
         (select count(*) from public.profiles where deleted_at is null) as live_profiles;
select pg_temp.check((select dana_notes > 0 from t83_before), 'fixture: Dana has notifications of her own before the deletion');

-- Only the server may call it.
set role authenticated;
select set_config('app.current_user_id', '83a00000-0000-4000-8000-000000000001', false);
select pg_temp.must_fail($$select public.admin_delete_member('83a00000-0000-4000-8000-000000000001', '83b00000-0000-4000-8000-000000000001')$$,
  'permission denied', 'a signed-in admin cannot call admin_delete_member directly (server only)');
select pg_temp.must_fail($$update public.profiles set deleted_at = now() where id = '83b00000-0000-4000-8000-000000000001'$$,
  'managed by the app', 'an admin cannot mark a member deleted by writing to the profile');
select set_config('app.current_user_id', '83b00000-0000-4000-8000-000000000002', false);
select pg_temp.must_fail($$update public.profiles set deleted_at = now() where id = '83b00000-0000-4000-8000-000000000002'$$,
  'managed by the app', 'a member cannot mark their own profile deleted');
reset role;

select set_config('app.current_user_id', '', false);
set role service_role;
select pg_temp.check((public.admin_delete_member('83b00000-0000-4000-8000-000000000002', '83b00000-0000-4000-8000-000000000001')) ->> 'reason' = 'not_admin',
  'a student cannot delete a member, even through the server');
select pg_temp.check((public.admin_delete_member('83a00000-0000-4000-8000-000000000001', '83a00000-0000-4000-8000-000000000001')) ->> 'reason' = 'self',
  'an admin cannot delete their own account');
select pg_temp.check((public.admin_delete_member('83a00000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000ff')) ->> 'reason' = 'not_found',
  'an unknown member is reported, not invented');
create temp table t83_result as select public.admin_delete_member('83a00000-0000-4000-8000-000000000001', '83b00000-0000-4000-8000-000000000001') as r;
reset role;

select pg_temp.check((select (r ->> 'ok')::boolean and not (r ->> 'already')::boolean and r ->> 'avatar_key' like 'avatars/83b%' from t83_result),
  'the admin deletes Dana: ok, and the server is told which profile picture to remove');
select pg_temp.check((select deleted_at is not null and deleted_by = '83a00000-0000-4000-8000-000000000001' and activated_at is null and role = 'student'
                             and full_name = 'Deleted member' and phone is null and avatar_key is null
                        from public.profiles where id = '83b00000-0000-4000-8000-000000000001'),
  'Dana''s profile is kept but closed: not activated, no name, phone or picture');
select pg_temp.check((select count(*) = (select posts from t83_before) from public.posts where author_id = '83b00000-0000-4000-8000-000000000001'),
  'her posts are kept');
select pg_temp.check((select display_name = 'Deleted member' from public.posts where id = '83c00000-0000-4000-8000-000000000001')
                     and (select display_name = 'Unknown User' from public.posts where id = '83c00000-0000-4000-8000-000000000002'),
  'her named post now says "Deleted member"; her anonymous post still says "Unknown User"');
select pg_temp.check((select count(*) = (select comments from t83_before) from public.comments where post_id = '83c00000-0000-4000-8000-000000000001'),
  'every comment on her post (Eli''s included) is kept');
select pg_temp.check((select reply_to_name = 'Deleted member' from public.comments where id = '83d00000-0000-4000-8000-000000000003'),
  'Eli''s reply to her no longer shows her name');
select pg_temp.check((select count(*) = (select likes from t83_before) from public.likes where post_id = '83c00000-0000-4000-8000-000000000001'),
  'likes are kept');
set role authenticated;
select set_config('app.current_user_id', '83b00000-0000-4000-8000-000000000002', false);
select pg_temp.check((select string_agg(label || '=' || vote_count, ',' order by sort_order) = 'Gold=1,Silver=1'
                        from public.poll_results((select id from t83 where name = 'poll'))),
  'her poll vote is kept: the results do not change');
reset role;
select pg_temp.check((select count(*) = (select messages from t83_before) from public.messages where conversation_id = '83e00000-0000-4000-8000-000000000001'),
  'the chat with the admin is kept for the admin''s records');
select pg_temp.check((select count(*) = 0 from public.notifications where user_id = '83b00000-0000-4000-8000-000000000001')
                     and (select count(*) = 0 from public.push_subscriptions where user_id = '83b00000-0000-4000-8000-000000000001')
                     and (select count(*) = 0 from public.notification_preferences where user_id = '83b00000-0000-4000-8000-000000000001')
                     and (select count(*) = 0 from public.bookmarks where user_id = '83b00000-0000-4000-8000-000000000001'),
  'her own notifications, devices, notification settings and bookmarks are removed');
select pg_temp.check((select title = 'Deleted member liked your post' from public.notifications
                        where user_id = '83b00000-0000-4000-8000-000000000003' and actor_id = '83b00000-0000-4000-8000-000000000001'),
  'Fay''s notification about Dana is kept but no longer names her');
select pg_temp.check((select count(*) = (select live_profiles from t83_before) - 1 from public.profiles where deleted_at is null),
  'exactly one profile is deleted; nobody else is touched');
select pg_temp.check((select count(*) = 1 and bool_and(actor_id = '83a00000-0000-4000-8000-000000000001' and (details ->> 'devices_removed')::int = 1)
                        from public.admin_audit_events where target_id = '83b00000-0000-4000-8000-000000000001' and action = 'member_deleted'),
  'one audit event records who deleted whom, with counts');
select pg_temp.check((select details::text not ilike '%dana%' and details::text not like '%+91%' from public.admin_audit_events
                        where target_id = '83b00000-0000-4000-8000-000000000001'),
  'the audit event holds no name, e-mail or phone number');

select set_config('app.current_user_id', '', false);
set role service_role;
select pg_temp.check((public.admin_delete_member('83a00000-0000-4000-8000-000000000001', '83b00000-0000-4000-8000-000000000001')) ->> 'already' = 'true',
  'deleting her again is harmless (the server can retry closing her sign-in)');
reset role;
select pg_temp.check((select count(*) = 1 from public.admin_audit_events where target_id = '83b00000-0000-4000-8000-000000000001' and action = 'member_deleted'),
  'and records no second deletion');

-- The admin's member list and the app gates.
set role authenticated;
select set_config('app.current_user_id', '83a00000-0000-4000-8000-000000000001', false);
select pg_temp.check((select count(*) = 0 from public.admin_conversations() where student_id = '83b00000-0000-4000-8000-000000000001')
                     and (select count(*) = 2 from public.admin_conversations() where student_id in ('83b00000-0000-4000-8000-000000000002', '83b00000-0000-4000-8000-000000000003')),
  'the admin''s member list drops Dana and keeps everyone else');
select pg_temp.check((select count(*) = 1 from public.admin_audit_events where target_id = '83b00000-0000-4000-8000-000000000001'),
  'the admin can read the audit log');
select set_config('app.current_user_id', '83b00000-0000-4000-8000-000000000002', false);
select pg_temp.check((select count(*) = 0 from public.admin_audit_events), 'a member cannot read the audit log');
-- Dana, with an access token that has not expired yet:
select set_config('app.current_user_id', '83b00000-0000-4000-8000-000000000001', false);
select pg_temp.check(not public.is_activated(), 'Dana is no longer activated');
select pg_temp.check((select count(*) = 0 from public.posts) and (select count(*) = 0 from public.messages),
  'Dana can no longer read posts or her chat');
select pg_temp.must_fail($$insert into public.posts (author_id, channel, body) values ('83b00000-0000-4000-8000-000000000001', 'students', 'I am back')$$,
  '', 'Dana cannot post');
select pg_temp.must_fail($$update public.profiles set full_name = 'Dana again' where id = '83b00000-0000-4000-8000-000000000001'$$,
  'was deleted', 'Dana cannot put her name back on the profile');
reset role;
select pg_temp.must_fail($$update public.profiles set activated_at = now() where id = '83b00000-0000-4000-8000-000000000001'$$,
  'cannot be restored or re-activated', 'nothing (an activation code, an operator) can re-activate a deleted member');
select pg_temp.must_fail($$update public.profiles set deleted_at = null where id = '83b00000-0000-4000-8000-000000000001'$$,
  'cannot be restored or re-activated', 'a deleted member cannot be restored by clearing deleted_at');

-- Admins: another admin can be deleted while one remains; the last one never.
select set_config('app.current_user_id', '', false);
set role service_role;
select pg_temp.check((public.admin_delete_member('83a00000-0000-4000-8000-000000000001', '83a00000-0000-4000-8000-000000000002')) ->> 'ok' = 'true',
  'an admin can delete another admin while at least one admin remains');
select pg_temp.check((public.admin_delete_member('83a00000-0000-4000-8000-000000000002', '83a00000-0000-4000-8000-000000000001')) ->> 'reason' = 'not_admin',
  'a deleted admin can no longer delete anyone');
reset role;
select pg_temp.check((select role = 'student' and deleted_at is not null from public.profiles where id = '83a00000-0000-4000-8000-000000000002')
                     and (select count(*) >= 1 from public.profiles where role = 'admin' and deleted_at is null),
  'the deleted admin lost admin rights; an admin remains');

-- ---------------------------------------------------------------------------
-- 3. Chat replies
-- ---------------------------------------------------------------------------
insert into public.conversations (id, student_id) values
  ('83e00000-0000-4000-8000-000000000002', '83b00000-0000-4000-8000-000000000002'),
  ('83e00000-0000-4000-8000-000000000003', '83b00000-0000-4000-8000-000000000003');
insert into public.messages (id, conversation_id, sender_id, kind, body, upload_status) values
  ('83f00000-0000-4000-8000-000000000011', '83e00000-0000-4000-8000-000000000002', '83a00000-0000-4000-8000-000000000001', 'text', 'Admin to Eli', 'ready'),
  ('83f00000-0000-4000-8000-000000000012', '83e00000-0000-4000-8000-000000000003', '83a00000-0000-4000-8000-000000000001', 'text', 'Admin to Fay (private)', 'ready');

set role authenticated;
select set_config('app.current_user_id', '83b00000-0000-4000-8000-000000000002', false);
insert into public.messages (id, conversation_id, sender_id, kind, body, reply_to_id) values
  ('83f00000-0000-4000-8000-000000000013', '83e00000-0000-4000-8000-000000000002', '83b00000-0000-4000-8000-000000000002', 'text', 'Eli answers', '83f00000-0000-4000-8000-000000000011');
select pg_temp.check((select reply_to_id = '83f00000-0000-4000-8000-000000000011' from public.messages where id = '83f00000-0000-4000-8000-000000000013'),
  'a member replies to a message in their own conversation');
select pg_temp.must_fail($$insert into public.messages (conversation_id, sender_id, kind, body, reply_to_id) values
  ('83e00000-0000-4000-8000-000000000002', '83b00000-0000-4000-8000-000000000002', 'text', 'quoting Fay''s chat', '83f00000-0000-4000-8000-000000000012')$$,
  'only reply to a message in this conversation', 'a member cannot quote a message from someone else''s conversation');
select pg_temp.must_fail($$insert into public.messages (conversation_id, sender_id, kind, body, reply_to_id) values
  ('83e00000-0000-4000-8000-000000000002', '83b00000-0000-4000-8000-000000000002', 'text', 'quoting nothing', '00000000-0000-4000-8000-0000000000ee')$$,
  'only reply to a message in this conversation', 'a reply to a message that does not exist is refused');
select pg_temp.must_fail($$update public.messages set reply_to_id = null where id = '83f00000-0000-4000-8000-000000000013'$$,
  'cannot be edited', 'a reply cannot be re-pointed or detached afterwards');
-- A reply with an attachment: the reply link rides on the same insert as the upload.
reset role;
select pg_temp.grant_for('83b00000-0000-4000-8000-000000000002', 'chat/83e/reply.jpg');
update public.media_upload_grants set scope = 'chat', conversation_id = '83e00000-0000-4000-8000-000000000002' where storage_key = 'chat/83e/reply.jpg';
set role authenticated;
select set_config('app.current_user_id', '83b00000-0000-4000-8000-000000000002', false);
insert into public.messages (conversation_id, sender_id, kind, storage_key, upload_status, reply_to_id) values
  ('83e00000-0000-4000-8000-000000000002', '83b00000-0000-4000-8000-000000000002', 'image', 'chat/83e/reply.jpg', 'pending', '83f00000-0000-4000-8000-000000000011');
select pg_temp.check((select count(*) = 1 from public.messages where storage_key = 'chat/83e/reply.jpg' and reply_to_id = '83f00000-0000-4000-8000-000000000011'),
  'a photo can be sent as a reply');
update public.messages set upload_status = 'ready' where storage_key = 'chat/83e/reply.jpg';
select pg_temp.check((select upload_status = 'ready' from public.messages where storage_key = 'chat/83e/reply.jpg'),
  'finishing the upload of a reply still works');
reset role;

-- The admin deletes the quoted message: the reply stays, the quote shows nothing of it.
set role authenticated;
select set_config('app.current_user_id', '83a00000-0000-4000-8000-000000000001', false);
update public.messages set deleted_at = now() where id = '83f00000-0000-4000-8000-000000000011';
select pg_temp.check((select reply_to_id = '83f00000-0000-4000-8000-000000000011' from public.messages where id = '83f00000-0000-4000-8000-000000000013')
                     and (select body is null and deleted_at is not null from public.messages where id = '83f00000-0000-4000-8000-000000000011'),
  'deleting the original keeps the reply and erases the original''s text');
reset role;

-- Fay cannot read Eli's thread, so a reply id there tells her nothing.
set role authenticated;
select set_config('app.current_user_id', '83b00000-0000-4000-8000-000000000003', false);
select pg_temp.check((select count(*) = 0 from public.messages where id in ('83f00000-0000-4000-8000-000000000011', '83f00000-0000-4000-8000-000000000013')),
  'another member cannot read a reply or what it quotes');
reset role;

update private.feature_flags set enabled = false where name = 'enforce_upload_grants';
