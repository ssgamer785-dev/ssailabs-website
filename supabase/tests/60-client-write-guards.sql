-- ============================================================================
-- Client write guards, anonymous reads and activation on writes
-- (20260928090000). Every check runs as the member themselves: role
-- `authenticated` plus their id, so RLS and the triggers decide the outcome.
--
-- Fixtures (own ids, so earlier suites are unaffected):
--   1111… admin (from 10-chat-media-quota.sql)
--   6a… Alice  activated student, conversation 6c…a1
--   6b… Bob    activated student, conversation 6c…b1
--   6d… Dana   UNACTIVATED student
-- ============================================================================
\pset pager off
set client_min_messages = notice;

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

create or replace function pg_temp.check(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if coalesce(p_ok, false) then raise notice 'PASS  %', p_label;
  else raise exception 'FAIL: %', p_label; end if;
end $$;

-- Fixtures, written as the database owner.
insert into auth.users (id, email) values
  ('6aaaaaaa-0000-4000-8000-000000000001', 'alice60@test.local'),
  ('6bbbbbbb-0000-4000-8000-000000000001', 'bob60@test.local'),
  ('6ddddddd-0000-4000-8000-000000000001', 'dana60@test.local')
on conflict (id) do nothing;
update public.profiles set full_name = 'Alice Sixty', activated_at = now(), activation_attempts = 7, media_bytes_used = 123
 where id = '6aaaaaaa-0000-4000-8000-000000000001';
update public.profiles set full_name = 'Bob Sixty', activated_at = now()
 where id = '6bbbbbbb-0000-4000-8000-000000000001';
update public.profiles set full_name = 'Dana Sixty', activated_at = null
 where id = '6ddddddd-0000-4000-8000-000000000001';
insert into public.conversations (id, student_id) values
  ('6ccccccc-0000-4000-8000-0000000000a1', '6aaaaaaa-0000-4000-8000-000000000001'),
  ('6ccccccc-0000-4000-8000-0000000000b1', '6bbbbbbb-0000-4000-8000-000000000001')
on conflict do nothing;

-- Server-issued grants (what /upload-url records).
insert into public.media_upload_grants (storage_key, owner_id, scope, conversation_id, kind, mime_type, size_bytes, poster_key, poster_size_bytes, created_at) values
  ('chat/6ccccccc-0000-4000-8000-0000000000a1/1790000000001-11111111-1111-4111-8111-111111111111.bin', '6aaaaaaa-0000-4000-8000-000000000001', 'chat', '6ccccccc-0000-4000-8000-0000000000a1', 'image', 'image/png', 4096, null, null, now()),
  ('chat/6ccccccc-0000-4000-8000-0000000000a1/1790000000002-22222222-2222-4222-8222-222222222222.bin', '6aaaaaaa-0000-4000-8000-000000000001', 'chat', '6ccccccc-0000-4000-8000-0000000000a1', 'video', 'video/mp4', 900000, 'chat/6ccccccc-0000-4000-8000-0000000000a1/1790000000002-22222222-2222-4222-8222-222222222222-poster.jpg', 5000, now()),
  ('chat/6ccccccc-0000-4000-8000-0000000000b1/1790000000003-33333333-3333-4333-8333-333333333333.bin', '6bbbbbbb-0000-4000-8000-000000000001', 'chat', '6ccccccc-0000-4000-8000-0000000000b1', 'image', 'image/png', 4096, null, null, now()),
  ('chat/6ccccccc-0000-4000-8000-0000000000a1/1790000000004-44444444-4444-4444-8444-444444444444.bin', '6aaaaaaa-0000-4000-8000-000000000001', 'chat', '6ccccccc-0000-4000-8000-0000000000a1', 'image', 'image/png', 4096, null, null, now() - interval '25 hours'),
  ('posts/6aaaaaaa-0000-4000-8000-000000000001/1790000000005-55555555-5555-4555-8555-555555555555.bin', '6aaaaaaa-0000-4000-8000-000000000001', 'post', null, 'image', 'image/jpeg', 70000, null, null, now()),
  ('posts/11111111-1111-1111-1111-111111111111/1790000000006-66666666-6666-4666-8666-666666666666.bin', '11111111-1111-1111-1111-111111111111', 'post', null, 'image', 'image/png', 80000, null, null, now())
on conflict do nothing;

-- ---------------------------------------------------------------------------
\echo '--- A. Chat media rows must match a grant the sender owns'
begin;
set local role authenticated;
set local app.current_user_id = '6aaaaaaa-0000-4000-8000-000000000001';
select pg_temp.must_fail($$insert into public.messages (conversation_id, sender_id, kind, storage_key, mime_type, size_bytes, upload_status)
  values ('6ccccccc-0000-4000-8000-0000000000a1','6aaaaaaa-0000-4000-8000-000000000001','image','posts/11111111-1111-1111-1111-111111111111/official.bin','image/png',10,'pending')$$,
  'not uploaded through the app', 'A1. a row naming an Official object is refused');
select pg_temp.must_fail($$insert into public.messages (conversation_id, sender_id, kind, storage_key, mime_type, size_bytes, upload_status)
  values ('6ccccccc-0000-4000-8000-0000000000a1','6aaaaaaa-0000-4000-8000-000000000001','image','chat/6ccccccc-0000-4000-8000-0000000000b1/1790000000003-33333333-3333-4333-8333-333333333333.bin','image/png',10,'pending')$$,
  'not uploaded through the app', 'A2. another member''s granted key is refused');
select pg_temp.must_fail($$insert into public.messages (conversation_id, sender_id, kind, storage_key, mime_type, size_bytes, upload_status)
  values ('6ccccccc-0000-4000-8000-0000000000a1','6aaaaaaa-0000-4000-8000-000000000001','image','chat/6ccccccc-0000-4000-8000-0000000000a1/1790000000004-44444444-4444-4444-8444-444444444444.bin','image/png',10,'pending')$$,
  'not uploaded through the app', 'A3. an expired grant is refused');
select pg_temp.must_fail($$insert into public.messages (conversation_id, sender_id, kind, storage_key, mime_type, size_bytes, upload_status)
  values ('6ccccccc-0000-4000-8000-0000000000a1','6aaaaaaa-0000-4000-8000-000000000001','pdf','chat/6ccccccc-0000-4000-8000-0000000000a1/1790000000001-11111111-1111-4111-8111-111111111111.bin','application/pdf',10,'pending')$$,
  'does not match its upload', 'A4. a kind other than the granted one is refused');
select pg_temp.must_fail($$insert into public.messages (conversation_id, sender_id, kind, storage_key, mime_type, size_bytes, upload_status, poster_key, poster_size_bytes)
  values ('6ccccccc-0000-4000-8000-0000000000a1','6aaaaaaa-0000-4000-8000-000000000001','video','chat/6ccccccc-0000-4000-8000-0000000000a1/1790000000002-22222222-2222-4222-8222-222222222222.bin','video/mp4',10,'pending','avatars/6bbbbbbb-0000-4000-8000-000000000001/x.bin',10)$$,
  'preview image does not match', 'A5. a poster other than the granted one is refused');
-- The legitimate send: the client lies about size and type; the grant wins.
insert into public.messages (id, conversation_id, sender_id, kind, storage_key, mime_type, size_bytes, upload_status, created_at, media_purged)
  values ('6e000000-0000-4000-8000-000000000001','6ccccccc-0000-4000-8000-0000000000a1','6aaaaaaa-0000-4000-8000-000000000001','image',
          'chat/6ccccccc-0000-4000-8000-0000000000a1/1790000000001-11111111-1111-4111-8111-111111111111.bin','text/html',1,'pending', now() + interval '1 year', true);
select pg_temp.check((select size_bytes = 4096 and mime_type = 'image/png' and not media_purged and created_at <= now()
                        from public.messages where id = '6e000000-0000-4000-8000-000000000001'),
  'A6. own granted upload accepted; size, type, date and purge flag come from the server');
select pg_temp.must_fail($$insert into public.messages (conversation_id, sender_id, kind, storage_key, mime_type, size_bytes, upload_status)
  values ('6ccccccc-0000-4000-8000-0000000000a1','6aaaaaaa-0000-4000-8000-000000000001','image','chat/6ccccccc-0000-4000-8000-0000000000a1/1790000000001-11111111-1111-4111-8111-111111111111.bin','image/png',4096,'pending')$$,
  'already attached', 'A7. one upload cannot back two rows');
insert into public.messages (id, conversation_id, sender_id, kind, body, created_at)
  values ('6e000000-0000-4000-8000-000000000002','6ccccccc-0000-4000-8000-0000000000a1','6aaaaaaa-0000-4000-8000-000000000001','text','hello', '2000-01-01');
select pg_temp.check((select created_at > now() - interval '1 minute' and upload_status = 'ready' from public.messages where id = '6e000000-0000-4000-8000-000000000002'),
  'A8. a text message is accepted with a server date');
select pg_temp.must_fail($$insert into public.messages (conversation_id, sender_id, kind, body, media_url)
  values ('6ccccccc-0000-4000-8000-0000000000a1','6aaaaaaa-0000-4000-8000-000000000001','image','x', null)$$,
  'needs an attachment', 'A9. a media kind without an uploaded object is refused');
commit;

-- ---------------------------------------------------------------------------
\echo '--- B. After sending, sizes, names, dates and purge flags are fixed'
begin;
set local role authenticated;
set local app.current_user_id = '6aaaaaaa-0000-4000-8000-000000000001';
select pg_temp.must_fail($$update public.messages set size_bytes = 0 where id = '6e000000-0000-4000-8000-000000000001'$$, 'cannot be edited', 'B1. sender cannot zero the size');
select pg_temp.must_fail($$update public.messages set media_purged = true where id = '6e000000-0000-4000-8000-000000000001'$$, 'cannot be edited', 'B2. sender cannot mark media purged');
select pg_temp.must_fail($$update public.messages set file_name = 'x.pdf' where id = '6e000000-0000-4000-8000-000000000001'$$, 'cannot be edited', 'B3. sender cannot rename the file');
select pg_temp.must_fail($$update public.messages set read_at = now() where id = '6e000000-0000-4000-8000-000000000001'$$, 'Only the recipient', 'B4. sender cannot mark own message read');
update public.messages set upload_status = 'ready' where id = '6e000000-0000-4000-8000-000000000001';
select pg_temp.check((select upload_status = 'ready' from public.messages where id = '6e000000-0000-4000-8000-000000000001'), 'B5. sender completes own upload');
select pg_temp.must_fail($$update public.messages set upload_status = 'pending' where id = '6e000000-0000-4000-8000-000000000001'$$, 'cannot be reopened', 'B6. ready cannot be reopened');
update public.messages set deleted_at = now() where id = '6e000000-0000-4000-8000-000000000002';
select pg_temp.check((select deleted_at is not null and body is null from public.messages where id = '6e000000-0000-4000-8000-000000000002'), 'B7. sender soft-deletes own message');
select pg_temp.must_fail($$update public.messages set deleted_at = null where id = '6e000000-0000-4000-8000-000000000002'$$, 'cannot be restored', 'B8. a deleted message cannot be restored');
commit;

\echo '--- C. The other participant may only set read_at'
insert into public.messages (id, conversation_id, sender_id, kind, body) values
  ('6e000000-0000-4000-8000-000000000003','6ccccccc-0000-4000-8000-0000000000a1','11111111-1111-1111-1111-111111111111','text','from the admin');
begin;
set local role authenticated;
set local app.current_user_id = '6aaaaaaa-0000-4000-8000-000000000001';
select pg_temp.must_fail($$update public.messages set file_name = 'Refund form.pdf' where id = '6e000000-0000-4000-8000-000000000003'$$, 'cannot be edited', 'C1. recipient cannot rename the admin''s attachment');
select pg_temp.must_fail($$update public.messages set created_at = now() + interval '1 year' where id = '6e000000-0000-4000-8000-000000000003'$$, 'cannot be edited', 'C2. recipient cannot re-date it');
select pg_temp.must_fail($$update public.messages set mime_type = 'text/html' where id = '6e000000-0000-4000-8000-000000000003'$$, 'cannot be edited', 'C3. recipient cannot re-type it');
select pg_temp.must_fail($$update public.messages set deleted_at = now() where id = '6e000000-0000-4000-8000-000000000003'$$, 'only mark another', 'C4. recipient cannot delete it');
select public.mark_conversation_read('6ccccccc-0000-4000-8000-0000000000a1');
select pg_temp.check((select read_at is not null from public.messages where id = '6e000000-0000-4000-8000-000000000003'), 'C5. recipient marks it read');
rollback;

-- ---------------------------------------------------------------------------
\echo '--- D. Posts: media from grants only; only the text can change'
begin;
set local role authenticated;
set local app.current_user_id = '6aaaaaaa-0000-4000-8000-000000000001';
select pg_temp.must_fail($$insert into public.posts (author_id, channel, body, attachment, storage_key, mime_type, size_bytes)
  values ('6aaaaaaa-0000-4000-8000-000000000001','students','x','image','posts/11111111-1111-1111-1111-111111111111/1790000000006-66666666-6666-4666-8666-666666666666.bin','image/png',1)$$,
  'not uploaded through the app', 'D1. a post naming the admin''s object is refused');
select pg_temp.must_fail($$insert into public.posts (author_id, channel, body, attachment, storage_key, mime_type, size_bytes)
  values ('6aaaaaaa-0000-4000-8000-000000000001','students','x','image','chat/6ccccccc-0000-4000-8000-0000000000a1/1790000000002-22222222-2222-4222-8222-222222222222.bin','image/png',1)$$,
  'not uploaded through the app', 'D2. a chat grant cannot back a post');
select pg_temp.must_fail($$insert into public.posts (author_id, channel, body, attachment) values ('6aaaaaaa-0000-4000-8000-000000000001','students','x','image')$$,
  'needs its uploaded object', 'D3. a media post without an upload is refused');
insert into public.posts (id, author_id, channel, body, attachment, storage_key, mime_type, size_bytes, created_at, display_name, is_anonymous)
  values ('6f000000-0000-4000-8000-000000000001','6aaaaaaa-0000-4000-8000-000000000001','students','my chart','image',
          'posts/6aaaaaaa-0000-4000-8000-000000000001/1790000000005-55555555-5555-4555-8555-555555555555.bin','text/html',1, now() + interval '5 years', 'The Traders Planet', false);
select pg_temp.check((select size_bytes = 70000 and mime_type = 'image/jpeg' and created_at <= now() and display_name = 'Alice Sixty'
                        from public.posts where id = '6f000000-0000-4000-8000-000000000001'),
  'D4. own granted post accepted; size, type, date and label are the server''s');
select pg_temp.must_fail($$update public.posts set storage_key = 'posts/11111111-1111-1111-1111-111111111111/1790000000006-66666666-6666-4666-8666-666666666666.bin' where id = '6f000000-0000-4000-8000-000000000001'$$,
  'Only the text', 'D5. the media key of a post cannot be repointed');
select pg_temp.must_fail($$update public.posts set created_at = now() + interval '5 years' where id = '6f000000-0000-4000-8000-000000000001'$$, 'Only the text', 'D6. a post cannot be re-dated');
select pg_temp.must_fail($$update public.posts set media_purged = true where id = '6f000000-0000-4000-8000-000000000001'$$, 'Only the text', 'D7. purge flag cannot be set by a member');
update public.posts set display_name = 'The Traders Planet', body = 'my chart (edited)' where id = '6f000000-0000-4000-8000-000000000001';
select pg_temp.check((select display_name = 'Alice Sixty' and body = 'my chart (edited)' from public.posts where id = '6f000000-0000-4000-8000-000000000001'),
  'D8. the text is editable; a relabel attempt is ignored');
update public.posts set is_anonymous = true where id = '6f000000-0000-4000-8000-000000000001';
select pg_temp.check((select is_anonymous and display_name = 'Unknown User' from public.posts where id = '6f000000-0000-4000-8000-000000000001'),
  'D9. the author switches her own post to anonymous');
commit;

begin;
set local role authenticated;
set local app.current_user_id = '11111111-1111-1111-1111-111111111111';
select pg_temp.must_fail($$update public.posts set is_anonymous = false where id = '6f000000-0000-4000-8000-000000000001'$$,
  'Only the author', 'D10. the admin cannot unmask a member''s post');
insert into public.posts (id, author_id, channel, title, body, attachment, storage_key, mime_type, size_bytes, is_anonymous)
  values ('6f000000-0000-4000-8000-0000000000a0','11111111-1111-1111-1111-111111111111','official','EURUSD','Sell below 1.0850','image',
          'posts/11111111-1111-1111-1111-111111111111/1790000000006-66666666-6666-4666-8666-666666666666.bin','image/png',80000, true);
select pg_temp.check((select not is_anonymous from public.posts where id = '6f000000-0000-4000-8000-0000000000a0'), 'D11. the admin posts Official media; Official is never anonymous');
update public.posts set body = 'Sell below 1.0840' where id = '6f000000-0000-4000-8000-0000000000a0';
select pg_temp.check((select body = 'Sell below 1.0840' from public.posts where id = '6f000000-0000-4000-8000-0000000000a0'), 'D12. the admin edits the Official text');
commit;

\echo '--- E. Official signals notify activated students only'
select pg_temp.check((select count(*) = 1 from public.notifications where related_post_id = '6f000000-0000-4000-8000-0000000000a0' and user_id = '6aaaaaaa-0000-4000-8000-000000000001'), 'E1. activated Alice is notified');
select pg_temp.check((select count(*) = 0 from public.notifications where related_post_id = '6f000000-0000-4000-8000-0000000000a0' and user_id = '6ddddddd-0000-4000-8000-000000000001'), 'E2. unactivated Dana is not');

-- ---------------------------------------------------------------------------
\echo '--- F. Anonymous posts and comments do not reveal their author'
insert into public.comments (id, post_id, author_id, body, is_anonymous) values
  ('6f000000-0000-4000-8000-0000000000c1','6f000000-0000-4000-8000-0000000000a0','6aaaaaaa-0000-4000-8000-000000000001','I lost on this', true);
begin;
set local role authenticated;
set local app.current_user_id = '6bbbbbbb-0000-4000-8000-000000000001';
select pg_temp.check((select count(*) = 0 from public.posts where id = '6f000000-0000-4000-8000-000000000001'), 'F1. Bob cannot read the anonymous post row directly');
select pg_temp.check((select count(*) = 0 from public.comments where id = '6f000000-0000-4000-8000-0000000000c1'), 'F2. ...nor the anonymous comment row');
select pg_temp.check((select author_id is null and author_role is null and not is_mine and display_name = 'Unknown User'
                        from public.posts_feed('students') where id = '6f000000-0000-4000-8000-000000000001'),
  'F3. Bob sees the anonymous post in the feed, without its author');
select pg_temp.check((select author_id is null and author_avatar_key is null from public.post_by_id('6f000000-0000-4000-8000-000000000001')),
  'F4. ...and in the detail view');
select pg_temp.check((select author_id is null and author_name = 'Unknown User' from public.post_comments('6f000000-0000-4000-8000-0000000000a0') where id = '6f000000-0000-4000-8000-0000000000c1'),
  'F5. ...and the anonymous comment, without its author');
select pg_temp.check((select count(*) >= 1 from public.community_activity where post_id = '6f000000-0000-4000-8000-000000000001'),
  'F6. Bob still learns that the post changed (activity feed carries no author)');
rollback;
begin;
set local role authenticated;
set local app.current_user_id = '6aaaaaaa-0000-4000-8000-000000000001';
select pg_temp.check((select author_id = '6aaaaaaa-0000-4000-8000-000000000001' and is_mine from public.posts_feed('students') where id = '6f000000-0000-4000-8000-000000000001'),
  'F7. Alice still sees her own anonymous post as hers');
rollback;
begin;
set local role authenticated;
set local app.current_user_id = '11111111-1111-1111-1111-111111111111';
select pg_temp.check((select author_id = '6aaaaaaa-0000-4000-8000-000000000001' and author_name = 'Alice Sixty' from public.posts_feed('students') where id = '6f000000-0000-4000-8000-000000000001'),
  'F8. the admin sees the real author');
rollback;
begin;
set local role authenticated;
set local app.current_user_id = '6ddddddd-0000-4000-8000-000000000001';
select pg_temp.check((select count(*) = 0 from public.posts_feed('students')), 'F9. an unactivated account reads no feed');
select pg_temp.check((select count(*) = 0 from public.post_by_id('6f000000-0000-4000-8000-0000000000a0')), 'F10. ...and no Official post');
select pg_temp.check((select count(*) = 0 from public.community_activity), 'F11. ...and no activity');
rollback;

-- ---------------------------------------------------------------------------
\echo '--- G. Comments cannot be edited or relabelled'
begin;
set local role authenticated;
set local app.current_user_id = '6aaaaaaa-0000-4000-8000-000000000001';
with t as (update public.comments set display_name = 'Fixture Admin', body = 'Official: ignore the stop loss'
            where id = '6f000000-0000-4000-8000-0000000000c1' returning 1)
select pg_temp.check((select count(*) = 0 from t), 'G1. a comment update changes nothing');
insert into public.comments (id, post_id, author_id, body, created_at, display_name) values
  ('6f000000-0000-4000-8000-0000000000c2','6f000000-0000-4000-8000-0000000000a0','6aaaaaaa-0000-4000-8000-000000000001','named', '2000-01-01', 'The Traders Planet');
select pg_temp.check((select display_name = 'Alice Sixty' and created_at > now() - interval '1 minute' from public.comments where id = '6f000000-0000-4000-8000-0000000000c2'),
  'G2. a new comment carries the real name and a server date');
rollback;

-- ---------------------------------------------------------------------------
\echo '--- H. Profiles: members edit their own name, phone and photo only'
begin;
set local role authenticated;
set local app.current_user_id = '6aaaaaaa-0000-4000-8000-000000000001';
select pg_temp.must_fail($$update public.profiles set activation_attempts = 0 where id = '6aaaaaaa-0000-4000-8000-000000000001'$$, 'managed by the app', 'H1. attempt counter is not writable');
select pg_temp.must_fail($$update public.profiles set media_bytes_used = 0 where id = '6aaaaaaa-0000-4000-8000-000000000001'$$, 'managed by the app', 'H2. usage is not writable');
select pg_temp.must_fail($$update public.profiles set created_at = '2000-01-01' where id = '6aaaaaaa-0000-4000-8000-000000000001'$$, 'managed by the app', 'H3. created_at is not writable');
select pg_temp.must_fail($$update public.profiles set avatar_key = 'avatars/6bbbbbbb-0000-4000-8000-000000000001/1790000000000-x.bin' where id = '6aaaaaaa-0000-4000-8000-000000000001'$$, 'one this account uploaded', 'H4. another member''s photo cannot be used');
select pg_temp.must_fail($$update public.profiles set full_name = 'The Traders Planet' where id = '6aaaaaaa-0000-4000-8000-000000000001'$$, 'different name', 'H5. a member cannot take the brand''s name');
select pg_temp.must_fail($$update public.profiles set full_name = ' ADMIN ' where id = '6aaaaaaa-0000-4000-8000-000000000001'$$, 'different name', 'H6. ...or the admin''s');
update public.profiles set full_name = 'Alice S.', phone = '+911234567890', reveal_identity = true,
       avatar_key = 'avatars/6aaaaaaa-0000-4000-8000-000000000001/1790000000000-0f8fad5b-d9cb-469f-a165-70867728950e.bin'
 where id = '6aaaaaaa-0000-4000-8000-000000000001';
select pg_temp.check((select full_name = 'Alice S.' and reveal_identity and avatar_key like 'avatars/6aaaaaaa-%' from public.profiles where id = '6aaaaaaa-0000-4000-8000-000000000001'),
  'H7. name, phone, preference and own photo are editable');
rollback;

-- ---------------------------------------------------------------------------
\echo '--- I. An unactivated account cannot write to the community or chat'
begin;
set local role authenticated;
set local app.current_user_id = '6ddddddd-0000-4000-8000-000000000001';
select pg_temp.must_fail($$insert into public.posts (author_id, channel, body) values ('6ddddddd-0000-4000-8000-000000000001','students','spam')$$, 'row-level security', 'I1. no posts');
select pg_temp.must_fail($$insert into public.comments (post_id, author_id, body) values ('6f000000-0000-4000-8000-0000000000a0','6ddddddd-0000-4000-8000-000000000001','spam')$$, 'row-level security', 'I2. no comments');
select pg_temp.must_fail($$insert into public.likes (post_id, user_id) values ('6f000000-0000-4000-8000-0000000000a0','6ddddddd-0000-4000-8000-000000000001')$$, 'row-level security', 'I3. no likes');
select pg_temp.must_fail($$insert into public.bookmarks (post_id, user_id) values ('6f000000-0000-4000-8000-0000000000a0','6ddddddd-0000-4000-8000-000000000001')$$, 'row-level security', 'I4. no bookmarks');
select pg_temp.must_fail($$select public.create_poll_post('students', 'Q?', array['a','b'])$$, 'row-level security', 'I5. no polls');
select pg_temp.must_fail($$select public.get_or_create_my_conversation()$$, 'row-level security', 'I6. no chat thread');
insert into public.membership_requests (requested_by, email, name, mobile, trading_experience, address, status)
  values ('6ddddddd-0000-4000-8000-000000000001','dana60@test.local','Dana','+9112345','none','Pune','approved');
select pg_temp.check((select count(*) = 0 from public.membership_requests where requested_by = '6ddddddd-0000-4000-8000-000000000001' and status <> 'pending'),
  'I7. a membership request is accepted, always as pending');
select pg_temp.must_fail($$insert into public.membership_requests (requested_by, email, name, mobile, trading_experience, address)
  values ('6ddddddd-0000-4000-8000-000000000001','dana60@test.local','Dana','+9112345','none','Pune')$$, 'already have a membership request', 'I8. a second open request is refused');
rollback;

-- ---------------------------------------------------------------------------
\echo '--- J. Poll options are fixed once voting starts'
begin;
set local role authenticated;
set local app.current_user_id = '6aaaaaaa-0000-4000-8000-000000000001';
select public.create_poll_post('students', 'Gold up or down?', array['Up','Down']) as poll_id \gset
select id as option_id from public.poll_options where post_id = :'poll_id' and label = 'Up' \gset
insert into public.poll_options (post_id, sort_order, label) values (:'poll_id', 2, 'Sideways');
select pg_temp.check(true, 'J1. the author may still add an option before anyone votes');
set local app.current_user_id = '6bbbbbbb-0000-4000-8000-000000000001';
select public.cast_poll_vote(:'poll_id', :'option_id');
set local app.current_user_id = '6aaaaaaa-0000-4000-8000-000000000001';
select pg_temp.must_fail(format($$delete from public.poll_options where id = %L$$, :'option_id'), 'after voting has started', 'J2. a voted option cannot be deleted');
select pg_temp.must_fail(format($$insert into public.poll_options (post_id, sort_order, label) values (%L, 3, 'Late')$$, :'poll_id'), 'after voting has started', 'J3. no options are added after voting');
delete from public.posts where id = :'poll_id';
select pg_temp.check((select count(*) = 0 from public.poll_options where post_id = :'poll_id'), 'J4. the author can still delete the whole poll');
rollback;

-- ---------------------------------------------------------------------------
\echo '--- K. The retention cutoff is re-evaluated on every call'
select pg_temp.check((select provolatile = 's' from pg_proc where proname = 'community_retention_cutoff'), 'K1. community_retention_cutoff() is STABLE');

-- ---------------------------------------------------------------------------
\echo '--- L. Realtime topics'
insert into realtime.messages (topic, extension, payload) values
  ('tp:presence:admin', 'presence', '{}'),
  ('chat:6ccccccc-0000-4000-8000-0000000000a1', 'broadcast', '{"typing":true}');
begin;
set local role authenticated;
set local app.current_user_id = '6ddddddd-0000-4000-8000-000000000001';
set local realtime.topic = 'tp:presence:admin';
select pg_temp.check((select count(*) = 0 from realtime.messages where topic = 'tp:presence:admin'), 'L1. an unactivated account cannot watch the admin''s presence');
set local app.current_user_id = '6aaaaaaa-0000-4000-8000-000000000001';
select pg_temp.check((select count(*) = 1 from realtime.messages where topic = 'tp:presence:admin'), 'L2. an activated member can');
set local realtime.topic = 'chat:6ccccccc-0000-4000-8000-0000000000a1';
select pg_temp.check((select count(*) = 1 from realtime.messages where topic = 'chat:6ccccccc-0000-4000-8000-0000000000a1'), 'L3. Alice may read her own chat topic');
set local app.current_user_id = '6bbbbbbb-0000-4000-8000-000000000001';
select pg_temp.check((select count(*) = 0 from realtime.messages where topic = 'chat:6ccccccc-0000-4000-8000-0000000000a1'), 'L4. Bob may not read Alice''s chat topic');
rollback;

-- ---------------------------------------------------------------------------
\echo '--- M. The server (service role) still maintains these fields'
begin;
set local role service_role;
update public.messages set size_bytes = 5000, media_purged = true where id = '6e000000-0000-4000-8000-000000000001';
select pg_temp.check((select size_bytes = 5000 and media_purged from public.messages where id = '6e000000-0000-4000-8000-000000000001'), 'M1. the service role corrects sizes and purge flags');
rollback;
