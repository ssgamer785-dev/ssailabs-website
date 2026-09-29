-- ============================================================================
-- Notification preferences and event coverage (20260929090000).
--
-- Real Postgres: the triggers, RLS and privileges decide every outcome. Actions
-- that a member takes run as that member (role `authenticated` plus their id);
-- fixtures and the "server" side run as the database owner.
--
-- Fixtures (own ids, so earlier suites are unaffected):
--   7a…01, 7a…02  two admins
--   7b…01 Sam, 7b…02 Tia, 7b…03 Uma   activated students (Sam has a conversation)
--   7d…01 Dana                          UNACTIVATED student
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
  if sqlerrm like 'FAIL:%' then
    raise;
  elsif p_expect = '' or position(p_expect in sqlerrm) > 0 then
    raise notice 'PASS  % (%)', p_label, left(sqlerrm, 80);
  else
    raise exception 'FAIL: % — refused for the wrong reason: %', p_label, sqlerrm;
  end if;
end $$;

-- Notifications for one of the fixture members, optionally by category.
create or replace function pg_temp.notes(p_user uuid, p_category text default null)
returns bigint language sql as $$
  select count(*) from public.notifications
   where user_id = p_user and (p_category is null or category = p_category);
$$;

insert into auth.users (id, email) values
  ('7a000000-0000-4000-8000-000000000001', 'admin70a@test.local'),
  ('7a000000-0000-4000-8000-000000000002', 'admin70b@test.local'),
  ('7b000000-0000-4000-8000-000000000001', 'sam70@test.local'),
  ('7b000000-0000-4000-8000-000000000002', 'tia70@test.local'),
  ('7b000000-0000-4000-8000-000000000003', 'uma70@test.local'),
  ('7d000000-0000-4000-8000-000000000001', 'dana70@test.local')
on conflict (id) do nothing;
update public.profiles set role = 'admin', full_name = 'Admin Seventy A' where id = '7a000000-0000-4000-8000-000000000001';
update public.profiles set role = 'admin', full_name = 'Admin Seventy B' where id = '7a000000-0000-4000-8000-000000000002';
update public.profiles set full_name = 'Sam Seventy', activated_at = now() where id = '7b000000-0000-4000-8000-000000000001';
update public.profiles set full_name = 'Tia Seventy', activated_at = now() where id = '7b000000-0000-4000-8000-000000000002';
update public.profiles set full_name = 'Uma Seventy', activated_at = now() where id = '7b000000-0000-4000-8000-000000000003';
update public.profiles set full_name = 'Dana Seventy', activated_at = null where id = '7d000000-0000-4000-8000-000000000001';
insert into public.conversations (id, student_id) values
  ('7c000000-0000-4000-8000-0000000000a1', '7b000000-0000-4000-8000-000000000001')
on conflict do nothing;
-- Activating the three fixture students above correctly told the admins (section L tests that on purpose).
-- Clear those notices so sections A-K count only what they cause themselves.
delete from public.notifications where title = 'A member activated their account';

-- ---------------------------------------------------------------------------
\echo '--- A. Preferences: defaults, RLS and privileges'
select pg_temp.check(
  public.notification_wanted('7b000000-0000-4000-8000-000000000001', 'direct_messages')
  and public.notification_wanted('7b000000-0000-4000-8000-000000000001', 'official_announcements')
  and public.notification_wanted('7b000000-0000-4000-8000-000000000001', 'comments')
  and public.notification_wanted('7b000000-0000-4000-8000-000000000001', 'system')
  and not public.notification_wanted('7b000000-0000-4000-8000-000000000001', 'community_posts')
  and not public.notification_wanted('7b000000-0000-4000-8000-000000000001', 'likes'),
  'A1. with no row: messages, announcements, comments and system ON; community posts and likes OFF');
select pg_temp.check(not public.notification_wanted('7b000000-0000-4000-8000-000000000001', 'nonsense'),
  'A1b. an unknown category is never "wanted"');

begin;
set local role authenticated;
set local app.current_user_id = '7b000000-0000-4000-8000-000000000001';
insert into public.notification_preferences (user_id, likes) values ('7b000000-0000-4000-8000-000000000001', true);
select pg_temp.check((select count(*) = 1 and bool_and(likes) and bool_and(direct_messages) and not bool_or(community_posts) from public.notification_preferences),
  'A2. a member can create their own row; unset columns take the defaults');
update public.notification_preferences set likes = false, direct_messages = false where user_id = '7b000000-0000-4000-8000-000000000001';
select pg_temp.check((select not likes and not direct_messages and updated_at is not null from public.notification_preferences),
  'A3. and change it');
select pg_temp.must_fail($$insert into public.notification_preferences (user_id) values ('7b000000-0000-4000-8000-000000000002')$$,
  'row-level security', 'A4. cannot create a row for someone else');
select pg_temp.check((select count(*) = 0 from public.notification_preferences where user_id <> '7b000000-0000-4000-8000-000000000001'),
  'A5. cannot read anyone else''s row');
select pg_temp.must_fail($$update public.notification_preferences set user_id = '7b000000-0000-4000-8000-000000000002'$$,
  'row-level security', 'A6. cannot hand their row to someone else');
select pg_temp.must_fail($$delete from public.notification_preferences$$, 'permission denied', 'A7. a client cannot delete preferences');
select pg_temp.must_fail($$select public.notification_wanted('7b000000-0000-4000-8000-000000000002', 'likes')$$,
  'permission denied', 'A8. the lookup function is not callable by a member (it would reveal others'' choices)');
rollback;

begin;
set local role anon;
select pg_temp.must_fail($$select * from public.notification_preferences$$, 'permission denied', 'A9. anonymous clients cannot reach the table');
rollback;

-- ---------------------------------------------------------------------------
\echo '--- B. Chat: one notification per incoming message, whatever it carries'
insert into public.messages (id, conversation_id, sender_id, kind, body, upload_status) values
  ('7e000000-0000-4000-8000-000000000001', '7c000000-0000-4000-8000-0000000000a1', '7b000000-0000-4000-8000-000000000001', 'text',  'hello admin', 'ready'),
  ('7e000000-0000-4000-8000-000000000002', '7c000000-0000-4000-8000-0000000000a1', '7b000000-0000-4000-8000-000000000001', 'image', 'caption', 'ready'),
  ('7e000000-0000-4000-8000-000000000003', '7c000000-0000-4000-8000-0000000000a1', '7b000000-0000-4000-8000-000000000001', 'voice', 'v', 'ready'),
  ('7e000000-0000-4000-8000-000000000004', '7c000000-0000-4000-8000-0000000000a1', '7b000000-0000-4000-8000-000000000001', 'video', 'v', 'ready'),
  ('7e000000-0000-4000-8000-000000000005', '7c000000-0000-4000-8000-0000000000a1', '7b000000-0000-4000-8000-000000000001', 'pdf',   'v', 'ready'),
  ('7e000000-0000-4000-8000-000000000006', '7c000000-0000-4000-8000-0000000000a1', '7b000000-0000-4000-8000-000000000001', 'file',  'v', 'ready');
select pg_temp.check(
  (select array_agg(title order by related_message_id) from public.notifications
    where user_id = '7a000000-0000-4000-8000-000000000001' and kind = 'chat'
      and related_conversation_id = '7c000000-0000-4000-8000-0000000000a1')
  = array['Sam Seventy sent you a message', 'Sam Seventy sent you a photo', 'Sam Seventy sent you a voice message',
          'Sam Seventy sent you a video message', 'Sam Seventy sent you a PDF', 'Sam Seventy sent you a file'],
  'B1. a message, photo, voice message, circular video, PDF and file each make exactly one notification, worded for what it is');
select pg_temp.check(
  (select count(*) = 6 and bool_and(category = 'direct_messages') and bool_and(related_message_id is not null)
     from public.notifications where user_id = '7a000000-0000-4000-8000-000000000002' and kind = 'chat'
      and related_conversation_id = '7c000000-0000-4000-8000-0000000000a1'),
  'B2. every admin gets them, with the category and the exact message to open');
select pg_temp.check(
  (select body from public.notifications where related_message_id = '7e000000-0000-4000-8000-000000000001' and user_id = '7a000000-0000-4000-8000-000000000001') = 'hello admin',
  'B3. the in-app row keeps the text for the recipient (the push never carries it; see the server tests)');
select pg_temp.check(pg_temp.notes('7b000000-0000-4000-8000-000000000001', 'direct_messages') = 0,
  'B4. the sender is never notified about their own message');

-- Admin replies to Sam.
insert into public.messages (id, conversation_id, sender_id, kind, body, upload_status) values
  ('7e000000-0000-4000-8000-000000000007', '7c000000-0000-4000-8000-0000000000a1', '7a000000-0000-4000-8000-000000000001', 'voice', 'v', 'ready');
select pg_temp.check(
  (select count(*) = 1 and min(title) = 'Admin sent you a voice message' from public.notifications
    where user_id = '7b000000-0000-4000-8000-000000000001' and related_message_id = '7e000000-0000-4000-8000-000000000007'),
  'B5. an admin''s message reaches the student, as one notification');
select pg_temp.check(pg_temp.notes('7a000000-0000-4000-8000-000000000002', 'direct_messages') = 6 and pg_temp.notes('7a000000-0000-4000-8000-000000000001', 'direct_messages') = 6,
  'B6. and no other admin, and not the sending admin, is notified about it');

-- Uploads: nothing while pending, one when ready, none more on later updates.
insert into public.messages (id, conversation_id, sender_id, kind, body, upload_status) values
  ('7e000000-0000-4000-8000-000000000008', '7c000000-0000-4000-8000-0000000000a1', '7b000000-0000-4000-8000-000000000001', 'image', 'up', 'pending');
select pg_temp.check(pg_temp.notes('7a000000-0000-4000-8000-000000000001') = 6, 'B7. a pending upload announces nothing yet');
update public.messages set upload_status = 'ready' where id = '7e000000-0000-4000-8000-000000000008';
select pg_temp.check(pg_temp.notes('7a000000-0000-4000-8000-000000000001') = 7, 'B8. it notifies once when the upload completes');
update public.messages set upload_status = 'pending' where id = '7e000000-0000-4000-8000-000000000008';
update public.messages set upload_status = 'ready' where id = '7e000000-0000-4000-8000-000000000008';
select public.notify_message_recipients('7c000000-0000-4000-8000-0000000000a1', '7b000000-0000-4000-8000-000000000001', 'x', '7e000000-0000-4000-8000-000000000008');
select pg_temp.check(pg_temp.notes('7a000000-0000-4000-8000-000000000001') = 7, 'B9. replaying the same event never notifies twice (unique per message and person)');

-- Opt-out.
insert into public.notification_preferences (user_id, direct_messages) values ('7a000000-0000-4000-8000-000000000002', false)
  on conflict (user_id) do update set direct_messages = false;
insert into public.messages (id, conversation_id, sender_id, kind, body, upload_status) values
  ('7e000000-0000-4000-8000-000000000009', '7c000000-0000-4000-8000-0000000000a1', '7b000000-0000-4000-8000-000000000001', 'text', 'again', 'ready');
select pg_temp.check(pg_temp.notes('7a000000-0000-4000-8000-000000000001') = 8 and pg_temp.notes('7a000000-0000-4000-8000-000000000002') = 7,
  'B10. an admin who turned direct messages off gets nothing; the other admin still does');
insert into public.notification_preferences (user_id, direct_messages) values ('7b000000-0000-4000-8000-000000000001', false)
  on conflict (user_id) do update set direct_messages = false;
insert into public.messages (id, conversation_id, sender_id, kind, body, upload_status) values
  ('7e000000-0000-4000-8000-00000000000a', '7c000000-0000-4000-8000-0000000000a1', '7a000000-0000-4000-8000-000000000001', 'text', 'reply', 'ready');
select pg_temp.check(pg_temp.notes('7b000000-0000-4000-8000-000000000001', 'direct_messages') = 1,
  'B11. a student who turned direct messages off gets no new one (their earlier voice reply stays)');
delete from public.notification_preferences where user_id in ('7a000000-0000-4000-8000-000000000002', '7b000000-0000-4000-8000-000000000001');

-- ---------------------------------------------------------------------------
\echo '--- C. Official announcements reach the intended audience only'
insert into public.notification_preferences (user_id, official_announcements) values ('7b000000-0000-4000-8000-000000000003', false);
-- The Official channel accepts only a signed-in admin, so post as one. The
-- attachment rows are written by the owner (the client-write guards that demand
-- a server-issued upload apply to the `authenticated` role and are covered in
-- suite 60); what is under test here is the notification the insert causes.
begin;
set local app.current_user_id = '7a000000-0000-4000-8000-000000000001';
insert into public.posts (id, author_id, channel, title, body, attachment) values
  ('7f000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000001', 'official', 'Weekly plan', 'body text', 'none'),
  ('7f000000-0000-4000-8000-000000000002', '7a000000-0000-4000-8000-000000000001', 'official', 'Levels',      null,        'pdf'),
  ('7f000000-0000-4000-8000-000000000003', '7a000000-0000-4000-8000-000000000001', 'official', null,          null,        'video'),
  ('7f000000-0000-4000-8000-000000000004', '7a000000-0000-4000-8000-000000000001', 'official', 'Chart',       null,        'image');
commit;
select pg_temp.check(
  (select array_agg(title order by related_post_id) from public.notifications
    where user_id = '7b000000-0000-4000-8000-000000000001' and category = 'official_announcements')
  = array['New official announcement: Weekly plan', 'New official PDF: Levels', 'New official video', 'New official image: Chart'],
  'C1. announcements, PDFs, videos and images are each described for what they are');
select pg_temp.check(pg_temp.notes('7b000000-0000-4000-8000-000000000003', 'official_announcements') = 0,
  'C2. a student who turned announcements off gets none');
select pg_temp.check(pg_temp.notes('7d000000-0000-4000-8000-000000000001') = 0,
  'C3. an unactivated account gets none');
select pg_temp.check(pg_temp.notes('7a000000-0000-4000-8000-000000000001', 'official_announcements') = 0
                 and pg_temp.notes('7a000000-0000-4000-8000-000000000002', 'official_announcements') = 0,
  'C4. admins are not the audience of their own announcements');
select pg_temp.check(
  (select count(*) = 4 and bool_and(kind = 'signal') from public.notifications
    where user_id = '7b000000-0000-4000-8000-000000000002' and category = 'official_announcements'),
  'C5. one per post per student (kind stays "signal" for older clients)');

-- ---------------------------------------------------------------------------
\echo '--- D. Students Community posts are opt-in'
insert into public.posts (id, author_id, channel, title, body) values
  ('7f000000-0000-4000-8000-000000000010', '7b000000-0000-4000-8000-000000000001', 'students', 'Gold idea', 'long above 2300');
select pg_temp.check((select count(*) = 0 from public.notifications where category = 'community_posts'),
  'D1. by default nobody is notified about a student post');
insert into public.notification_preferences (user_id, community_posts) values
  ('7b000000-0000-4000-8000-000000000002', true), ('7a000000-0000-4000-8000-000000000001', true),
  ('7b000000-0000-4000-8000-000000000001', true), ('7d000000-0000-4000-8000-000000000001', true)
  on conflict (user_id) do update set community_posts = true;
insert into public.posts (id, author_id, channel, title, body) values
  ('7f000000-0000-4000-8000-000000000011', '7b000000-0000-4000-8000-000000000001', 'students', 'Silver idea', 'short');
select pg_temp.check(
  (select array_agg(user_id::text order by user_id) from public.notifications where category = 'community_posts' and related_post_id = '7f000000-0000-4000-8000-000000000011')
  = array['7a000000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-000000000002'],
  'D2. opted-in members (a student and an admin) are notified; not the author; not an unactivated account; not members who did not opt in');
select pg_temp.check(
  (select title = 'Sam Seventy posted in the Students Community' and body = 'Silver idea' from public.notifications
    where user_id = '7b000000-0000-4000-8000-000000000002' and related_post_id = '7f000000-0000-4000-8000-000000000011'),
  'D3. it names the poster, and the in-app row shows the post');
insert into public.posts (id, author_id, channel, title, body, is_anonymous) values
  ('7f000000-0000-4000-8000-000000000012', '7b000000-0000-4000-8000-000000000001', 'students', 'Hidden hand', 'x', true);
select pg_temp.check(
  (select title = 'Unknown User posted in the Students Community' and actor_id is null from public.notifications
    where user_id = '7b000000-0000-4000-8000-000000000002' and related_post_id = '7f000000-0000-4000-8000-000000000012'),
  'D4. an anonymous post never reveals its author, not even to admins'' notification rows');

-- ---------------------------------------------------------------------------
\echo '--- E. Comments on my post'
begin;
set local role authenticated;
set local app.current_user_id = '7b000000-0000-4000-8000-000000000002';
insert into public.comments (id, post_id, author_id, body) values
  ('70000000-0000-4000-8000-000000000001', '7f000000-0000-4000-8000-000000000010', '7b000000-0000-4000-8000-000000000002', 'nice');
commit;
select pg_temp.check(
  (select count(*) = 1 and min(title) = 'Tia Seventy commented on your post' and min(category) = 'comments'
          and min(related_comment_id::text) = '70000000-0000-4000-8000-000000000001' and bool_and(actor_id is null)
     from public.notifications where user_id = '7b000000-0000-4000-8000-000000000001' and kind = 'comment'),
  'E1. the post''s author is told, with the comment to open; nobody''s identity is stored');
begin;
set local role authenticated;
set local app.current_user_id = '7b000000-0000-4000-8000-000000000001';
insert into public.comments (id, post_id, author_id, body) values
  ('70000000-0000-4000-8000-000000000002', '7f000000-0000-4000-8000-000000000010', '7b000000-0000-4000-8000-000000000001', 'thanks');
commit;
select pg_temp.check(pg_temp.notes('7b000000-0000-4000-8000-000000000001', 'comments') = 1, 'E2. commenting on your own post notifies no one');
begin;
set local role authenticated;
set local app.current_user_id = '7b000000-0000-4000-8000-000000000002';
insert into public.comments (id, post_id, author_id, body, is_anonymous) values
  ('70000000-0000-4000-8000-000000000003', '7f000000-0000-4000-8000-000000000010', '7b000000-0000-4000-8000-000000000002', 'psst', true);
commit;
select pg_temp.check(
  (select title from public.notifications where related_comment_id = '70000000-0000-4000-8000-000000000003') = 'Unknown User commented on your post',
  'E3. an anonymous comment stays anonymous');
insert into public.notification_preferences (user_id, comments) values ('7b000000-0000-4000-8000-000000000001', false)
  on conflict (user_id) do update set comments = false;
begin;
set local role authenticated;
set local app.current_user_id = '7b000000-0000-4000-8000-000000000002';
insert into public.comments (id, post_id, author_id, body) values
  ('70000000-0000-4000-8000-000000000004', '7f000000-0000-4000-8000-000000000010', '7b000000-0000-4000-8000-000000000002', 'and more');
commit;
select pg_temp.check(pg_temp.notes('7b000000-0000-4000-8000-000000000001', 'comments') = 2, 'E4. a member who turned comments off gets no new ones');
update public.notification_preferences set comments = true where user_id = '7b000000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
\echo '--- F. Likes are opt-in, and once per person per post'
begin;
set local role authenticated;
set local app.current_user_id = '7b000000-0000-4000-8000-000000000002';
insert into public.likes (post_id, user_id) values ('7f000000-0000-4000-8000-000000000010', '7b000000-0000-4000-8000-000000000002');
commit;
select pg_temp.check(pg_temp.notes('7b000000-0000-4000-8000-000000000001', 'likes') = 0, 'F1. by default a like notifies no one');
update public.notification_preferences set likes = true where user_id = '7b000000-0000-4000-8000-000000000001';
begin;
set local role authenticated;
set local app.current_user_id = '7b000000-0000-4000-8000-000000000002';
delete from public.likes where post_id = '7f000000-0000-4000-8000-000000000010' and user_id = '7b000000-0000-4000-8000-000000000002';
insert into public.likes (post_id, user_id) values ('7f000000-0000-4000-8000-000000000010', '7b000000-0000-4000-8000-000000000002');
commit;
select pg_temp.check((select count(*) = 1 and min(title) = 'Tia Seventy liked your post' and min(actor_id::text) = '7b000000-0000-4000-8000-000000000002'
                        from public.notifications where user_id = '7b000000-0000-4000-8000-000000000001' and kind = 'like'),
  'F2. opted in: one notification, naming the person');
begin;
set local role authenticated;
set local app.current_user_id = '7b000000-0000-4000-8000-000000000002';
delete from public.likes where post_id = '7f000000-0000-4000-8000-000000000010' and user_id = '7b000000-0000-4000-8000-000000000002';
insert into public.likes (post_id, user_id) values ('7f000000-0000-4000-8000-000000000010', '7b000000-0000-4000-8000-000000000002');
commit;
select pg_temp.check(pg_temp.notes('7b000000-0000-4000-8000-000000000001', 'likes') = 1,
  'F3. unliking and liking again does not notify again (no way to spam an author)');
begin;
set local role authenticated;
set local app.current_user_id = '7b000000-0000-4000-8000-000000000001';
insert into public.likes (post_id, user_id) values ('7f000000-0000-4000-8000-000000000010', '7b000000-0000-4000-8000-000000000001');
commit;
select pg_temp.check(pg_temp.notes('7b000000-0000-4000-8000-000000000001', 'likes') = 1, 'F4. liking your own post notifies no one');

-- ---------------------------------------------------------------------------
\echo '--- G. Moderation: an admin removing a member''s content'
insert into public.posts (id, author_id, channel, title, body) values
  ('7f000000-0000-4000-8000-000000000020', '7b000000-0000-4000-8000-000000000001', 'students', 'Remove me', 'spam spam');
insert into public.comments (id, post_id, author_id, body) values
  ('70000000-0000-4000-8000-000000000020', '7f000000-0000-4000-8000-000000000020', '7b000000-0000-4000-8000-000000000002', 'a reply on the doomed post'),
  ('70000000-0000-4000-8000-000000000021', '7f000000-0000-4000-8000-000000000011', '7b000000-0000-4000-8000-000000000002', 'a comment to remove');
begin;
set local role authenticated;
set local app.current_user_id = '7a000000-0000-4000-8000-000000000001';
delete from public.posts where id = '7f000000-0000-4000-8000-000000000020';
commit;
select pg_temp.check(
  (select count(*) = 1 and min(title) = 'An admin removed your post' and min(body) = 'Remove me' and min(link) = '/community'
          and min(kind::text) = 'session' and min(category) = 'system'
     from public.notifications where user_id = '7b000000-0000-4000-8000-000000000001' and category = 'system'),
  'G1. an admin deleting a member''s post tells its author (in-app path, original kind)');
select pg_temp.check(
  (select count(*) = 0 from public.notifications where user_id = '7b000000-0000-4000-8000-000000000002' and category = 'system'),
  'G2. comments that vanish because their post was removed are not reported as moderation');
begin;
set local role authenticated;
set local app.current_user_id = '7a000000-0000-4000-8000-000000000002';
delete from public.comments where id = '70000000-0000-4000-8000-000000000021';
commit;
select pg_temp.check(
  (select count(*) = 1 and min(title) = 'An admin removed your comment' from public.notifications
    where user_id = '7b000000-0000-4000-8000-000000000002' and category = 'system'),
  'G3. an admin deleting a comment on a live post tells its author');
begin;
set local role authenticated;
set local app.current_user_id = '7b000000-0000-4000-8000-000000000001';
delete from public.comments where id = '70000000-0000-4000-8000-000000000002';
delete from public.posts where id = '7f000000-0000-4000-8000-000000000012';
commit;
select pg_temp.check(pg_temp.notes('7b000000-0000-4000-8000-000000000001', 'system') = 1, 'G4. deleting your own content notifies no one');
insert into public.posts (id, author_id, channel, title, body) values
  ('7f000000-0000-4000-8000-000000000021', '7b000000-0000-4000-8000-000000000001', 'students', 'Swept', 'x');
delete from public.posts where id = '7f000000-0000-4000-8000-000000000021';
select pg_temp.check(pg_temp.notes('7b000000-0000-4000-8000-000000000001', 'system') = 1,
  'G5. the retention sweep / SQL editor (no signed-in user) notifies no one');
insert into public.notification_preferences (user_id, system) values ('7b000000-0000-4000-8000-000000000002', false)
  on conflict (user_id) do update set system = false;
insert into public.comments (id, post_id, author_id, body) values
  ('70000000-0000-4000-8000-000000000022', '7f000000-0000-4000-8000-000000000011', '7b000000-0000-4000-8000-000000000002', 'another');
begin;
set local role authenticated;
set local app.current_user_id = '7a000000-0000-4000-8000-000000000001';
delete from public.comments where id = '70000000-0000-4000-8000-000000000022';
commit;
select pg_temp.check(pg_temp.notes('7b000000-0000-4000-8000-000000000002', 'system') = 1, 'G6. a member who turned system notices off gets none');
update public.notification_preferences set system = true where user_id = '7b000000-0000-4000-8000-000000000002';

-- ---------------------------------------------------------------------------
\echo '--- H. A new membership request tells the admins'
begin;
set local role authenticated;
set local app.current_user_id = '7d000000-0000-4000-8000-000000000001';
insert into public.membership_requests (requested_by, email, name, mobile, trading_experience, address)
  values ('7d000000-0000-4000-8000-000000000001', 'dana70@test.local', 'Dana Seventy', '9999999999', 'two years', 'Pune');
commit;
select pg_temp.check(
  (select count(*) = 2 and bool_and(title = 'New membership request') and bool_and(link = '/admin/membership-requests')
          and bool_and(category = 'system') and bool_and(body = 'Dana Seventy')
     from public.notifications
    where title = 'New membership request'
      and user_id in ('7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000002')),
  'H1. every admin is told, with the screen to open');
select pg_temp.check((select count(*) = 0 from public.notifications where title = 'New membership request'
                       and user_id in ('7b000000-0000-4000-8000-000000000001', '7d000000-0000-4000-8000-000000000001')),
  'H2. no member, and not the requester, is told');
-- The database already allows one waiting request per person, so a request form
-- cannot be used to flood an admin: the second is refused before any notice.
begin;
set local role authenticated;
set local app.current_user_id = '7d000000-0000-4000-8000-000000000001';
select pg_temp.must_fail($$insert into public.membership_requests (requested_by, email, name, mobile, trading_experience, address)
  values ('7d000000-0000-4000-8000-000000000001', 'dana70@test.local', 'Dana Seventy', '9999999999', 'again', 'Pune')$$,
  'already have a membership request', 'H3. a second waiting request is refused, so it cannot notify again');
rollback;
insert into public.notification_preferences (user_id, system) values ('7a000000-0000-4000-8000-000000000002', false)
  on conflict (user_id) do update set system = false;
update public.membership_requests set status = 'contacted' where requested_by = '7d000000-0000-4000-8000-000000000001';
begin;
set local role authenticated;
set local app.current_user_id = '7d000000-0000-4000-8000-000000000001';
insert into public.membership_requests (requested_by, email, name, mobile, trading_experience, address)
  values ('7d000000-0000-4000-8000-000000000001', 'dana70@test.local', 'Dana Seventy', '9999999999', 'once more', 'Pune');
commit;
select pg_temp.check(
  (select count(*) filter (where user_id = '7a000000-0000-4000-8000-000000000001') = 2
      and count(*) filter (where user_id = '7a000000-0000-4000-8000-000000000002') = 1
     from public.notifications where title = 'New membership request'),
  'H4. an admin who turned system notices off is not told; the other admin is');
update public.notification_preferences set system = true where user_id = '7a000000-0000-4000-8000-000000000002';

-- ---------------------------------------------------------------------------
\echo '--- I. Opening a chat or post clears its notifications'
select pg_temp.check((select count(*) > 0 from public.notifications where user_id = '7a000000-0000-4000-8000-000000000001' and kind = 'chat' and read_at is null),
  'I0. the admin has unread chat notifications to clear');
begin;
set local role authenticated;
set local app.current_user_id = '7a000000-0000-4000-8000-000000000001';
select pg_temp.check(public.mark_related_notifications_read('7c000000-0000-4000-8000-0000000000a1', null) >= 6, 'I1. clears the conversation''s chat notifications for the caller');
select pg_temp.check((select count(*) = 0 from public.notifications where user_id = '7a000000-0000-4000-8000-000000000001' and kind = 'chat' and read_at is null),
  'I2. none left unread');
select pg_temp.check((select count(*) > 0 from public.notifications where user_id = '7a000000-0000-4000-8000-000000000001' and title = 'New membership request' and read_at is null),
  'I3. other notifications are untouched');
rollback;
select pg_temp.check((select count(*) > 0 from public.notifications where user_id = '7a000000-0000-4000-8000-000000000002' and kind = 'chat' and read_at is null),
  'I4. and another admin''s copies were never touched');
begin;
set local role authenticated;
set local app.current_user_id = '7b000000-0000-4000-8000-000000000001';
select pg_temp.check(public.mark_related_notifications_read(null, '7f000000-0000-4000-8000-000000000010') >= 1, 'I5. opening a post clears the notifications about it');
select pg_temp.check((select count(*) = 0 from public.notifications where user_id = '7b000000-0000-4000-8000-000000000001' and related_post_id = '7f000000-0000-4000-8000-000000000010' and read_at is null),
  'I6. all of them');
select pg_temp.check(public.mark_related_notifications_read(null, null) = 0, 'I7. with no target it clears nothing');
rollback;
begin;
set local role anon;
select pg_temp.must_fail($$select public.mark_related_notifications_read(null, null)$$, 'permission denied', 'I8. not callable anonymously');
rollback;

-- ---------------------------------------------------------------------------
\echo '--- J. A failing notification never blocks the member''s own action'
create or replace function pg_temp.explode() returns trigger language plpgsql as $$
begin raise exception 'simulated notification failure'; end $$;
create trigger zz_explode before insert on public.notifications for each row execute function pg_temp.explode();
insert into public.messages (id, conversation_id, sender_id, kind, body, upload_status) values
  ('7e000000-0000-4000-8000-00000000000b', '7c000000-0000-4000-8000-0000000000a1', '7b000000-0000-4000-8000-000000000001', 'text', 'still saved', 'ready');
begin;
set local role authenticated;
set local app.current_user_id = '7a000000-0000-4000-8000-000000000001';
insert into public.posts (id, author_id, channel, title, body) values
  ('7f000000-0000-4000-8000-000000000030', '7a000000-0000-4000-8000-000000000001', 'official', 'Still posted', 'x');
commit;
select pg_temp.check((select count(*) = 1 from public.messages where id = '7e000000-0000-4000-8000-00000000000b')
                  and (select count(*) = 1 from public.posts where id = '7f000000-0000-4000-8000-000000000030'),
  'J1. the message and the post are saved even though creating their notifications failed');
drop trigger zz_explode on public.notifications;

-- ---------------------------------------------------------------------------
\echo '--- K. What a notification may contain'
select pg_temp.must_fail($$insert into public.notifications (user_id, kind, title, category) values ('7b000000-0000-4000-8000-000000000001', 'chat', 't', 'billing')$$,
  'notifications_category_check', 'K1. an unknown category is refused');
select pg_temp.must_fail($$insert into public.notifications (user_id, kind, title, link) values ('7b000000-0000-4000-8000-000000000001', 'session', 't', '//evil.example/x')$$,
  'notifications_link_check', 'K2. a protocol-relative link is refused');
select pg_temp.must_fail($$insert into public.notifications (user_id, kind, title, link) values ('7b000000-0000-4000-8000-000000000001', 'session', 't', 'javascript:alert(1)')$$,
  'notifications_link_check', 'K3. a script link is refused');
select pg_temp.must_fail($$insert into public.notifications (user_id, kind, title, link) values ('7b000000-0000-4000-8000-000000000001', 'session', 't', 'https://evil.example/')$$,
  'notifications_link_check', 'K4. an absolute URL is refused');
select pg_temp.check((select array_agg(distinct kind::text order by kind::text) <@ array['signal','chat','like','comment','target','session']
                        from public.notifications where created_at >= now() - interval '1 hour'),
  'K5. every notification this suite made uses one of the original six kinds');
select pg_temp.must_fail($$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth_key, environment)
  values ('7b000000-0000-4000-8000-000000000001', 'https://push.example/x', 'k', 'a', 'staging')$$,
  'push_subscriptions_environment_check', 'K6. a device can only be marked production, preview or development');
select pg_temp.check((select bool_and(has_table_privilege(r, 'public.push_subscriptions', 'select')) = false from unnest(array['anon', 'authenticated']) r),
  'K7. push device rows are still unreachable by clients');
select pg_temp.check((select array_agg(p order by p) filter (where has_table_privilege('authenticated', 'public.notification_preferences', p)) = array['insert', 'select', 'update']
                        from unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']) p),
  'K7b. a member holds exactly select, insert and update on preferences: no delete, truncate, references or trigger');
select pg_temp.check((select count(*) = 0 from pg_policies where schemaname = 'public' and tablename = 'notifications' and cmd in ('INSERT', 'DELETE')),
  'K8. members still cannot insert or delete notification rows');
select pg_temp.check((select count(*) = 7 and bool_and(not has_function_privilege('anon', p.oid, 'execute') and not has_function_privilege('authenticated', p.oid, 'execute'))
                        from pg_proc p where p.pronamespace = 'public'::regnamespace
                         and p.proname in ('notify_new_student_post', 'notify_content_removed', 'notify_new_membership_request', 'notify_member_activated',
                                           'notification_wanted', 'notification_message_phrase', 'notify_message_recipients')
                         and (p.proname <> 'notify_message_recipients' or pg_get_function_identity_arguments(p.oid) like '%uuid, p_sender_id uuid, p_body text, p_message_id uuid')),
  'K9. none of the new notification functions can be called by a client');

-- ---------------------------------------------------------------------------
\echo '--- L. A member activating their account tells the admins'
insert into auth.users (id, email) values
  ('7d000000-0000-4000-8000-000000000002', 'eve70@test.local'),
  ('7d000000-0000-4000-8000-000000000003', 'fay70@test.local'),
  ('7d000000-0000-4000-8000-000000000004', 'gus70@test.local')
on conflict (id) do nothing;
update public.profiles set full_name = 'Eve Seventy', activated_at = null where id = '7d000000-0000-4000-8000-000000000002';
update public.profiles set full_name = 'Fay Seventy', activated_at = null where id = '7d000000-0000-4000-8000-000000000003';
update public.profiles set full_name = 'Gus Seventy', role = 'admin', activated_at = null where id = '7d000000-0000-4000-8000-000000000004';

-- redeem_activation_code is SECURITY DEFINER and runs this exact statement as the owner
update public.profiles set activated_at = now() where id = '7d000000-0000-4000-8000-000000000001';
select pg_temp.check((select count(*) = 2 and bool_and(title = 'A member activated their account' and body = 'Dana Seventy' and category = 'system' and kind = 'session'
                                              and link = '/admin/activation-codes' and read_at is null)
                        from public.notifications where title = 'A member activated their account' and body = 'Dana Seventy'
                         and user_id in ('7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000002')),
  'L1. both admins are told, as a system notice that leads to the activation codes screen; the name is in the body, not in the lock-screen title');
select pg_temp.check((select count(*) = 0 from public.notifications n where n.title = 'A member activated their account' and n.body = 'Dana Seventy'
                         and not exists (select 1 from public.profiles a where a.id = n.user_id and a.role = 'admin')),
  'L2. only admins are told: no student, and not the member who activated, hears about it');
update public.profiles set full_name = 'Dana Seventy', activation_attempts = 0 where id = '7d000000-0000-4000-8000-000000000001';
update public.profiles set activated_at = now() where id = '7d000000-0000-4000-8000-000000000001';
select pg_temp.check((select count(*) = 2 from public.notifications where title = 'A member activated their account' and body = 'Dana Seventy'
                         and user_id in ('7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000002')),
  'L3. touching the profile again, or re-writing an existing activation, never tells them twice');

-- an admin who turned system notices off is skipped
insert into public.notification_preferences (user_id, system) values ('7a000000-0000-4000-8000-000000000002', false)
  on conflict (user_id) do update set system = false;
update public.profiles set activated_at = now() where id = '7d000000-0000-4000-8000-000000000002';
select pg_temp.check((select count(*) filter (where user_id = '7a000000-0000-4000-8000-000000000001') = 1
                        and count(*) filter (where user_id = '7a000000-0000-4000-8000-000000000002') = 0
                        from public.notifications where title = 'A member activated their account' and body = 'Eve Seventy'),
  'L4. an admin who turned "System and account" off is not notified; the other admin is');
delete from public.notification_preferences where user_id = '7a000000-0000-4000-8000-000000000002';

-- an admin never triggers it
update public.profiles set activated_at = now() where id = '7d000000-0000-4000-8000-000000000004';
select pg_temp.check((select count(*) = 0 from public.notifications where title = 'A member activated their account' and body = 'Gus Seventy'),
  'L5. an admin account being marked activated tells nobody');

-- and a failing notification never blocks the activation itself
create or replace function pg_temp.explode_l() returns trigger language plpgsql as $$
begin raise exception 'simulated notification failure'; end $$;
create trigger zz_explode_l before insert on public.notifications for each row execute function pg_temp.explode_l();
update public.profiles set activated_at = now() where id = '7d000000-0000-4000-8000-000000000003';
drop trigger zz_explode_l on public.notifications;
select pg_temp.check((select activated_at is not null from public.profiles where id = '7d000000-0000-4000-8000-000000000003')
                 and (select count(*) = 0 from public.notifications where title = 'A member activated their account' and body = 'Fay Seventy'),
  'L6. the activation is saved even though creating its notification failed');

\echo '--- done'
