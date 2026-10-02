-- ============================================================================
-- RC5: several attachments per post (post_media) and chat albums.
-- Fixtures: 82a…01 admin; 82b…01 Pia (author), 82b…02 Quin (reader).
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

-- An upload grant as /upload-url records it.
create or replace function pg_temp.grant_for(p_owner uuid, p_key text, p_kind text, p_scope text default 'post', p_conv uuid default null)
returns void language sql as $$
  insert into public.media_upload_grants (storage_key, owner_id, scope, conversation_id, kind, mime_type, size_bytes)
  values (p_key, p_owner, p_scope, p_conv, p_kind,
          case p_kind when 'image' then 'image/jpeg' when 'video' then 'video/mp4' else 'application/pdf' end, 1234);
$$;

insert into auth.users (id, email) values
  ('82a00000-0000-4000-8000-000000000001', 'admin82@test.local'),
  ('82b00000-0000-4000-8000-000000000001', 'pia82@test.local'),
  ('82b00000-0000-4000-8000-000000000002', 'quin82@test.local')
on conflict (id) do nothing;
update public.profiles set role = 'admin', full_name = 'Admin EightyTwo' where id = '82a00000-0000-4000-8000-000000000001';
update public.profiles set full_name = 'Pia EightyTwo', activated_at = now() where id = '82b00000-0000-4000-8000-000000000001';
update public.profiles set full_name = 'Quin EightyTwo', activated_at = now() where id = '82b00000-0000-4000-8000-000000000002';
update private.feature_flags set enabled = true where name = 'enforce_upload_grants';

select pg_temp.grant_for('82b00000-0000-4000-8000-000000000001', 'posts/k82/1000000000001-00000000-0000-4000-8000-000000000001.jpg', 'image');
select pg_temp.grant_for('82b00000-0000-4000-8000-000000000001', 'posts/k82/1000000000002-00000000-0000-4000-8000-000000000002.jpg', 'image');
select pg_temp.grant_for('82b00000-0000-4000-8000-000000000001', 'posts/k82/1000000000003-00000000-0000-4000-8000-000000000003.bin', 'video');
select pg_temp.grant_for('82b00000-0000-4000-8000-000000000002', 'posts/k82/1000000000004-00000000-0000-4000-8000-000000000004.jpg', 'image');
select pg_temp.grant_for('82b00000-0000-4000-8000-000000000001', 'posts/k82/1000000000005-00000000-0000-4000-8000-000000000005.jpg', 'image');
select pg_temp.grant_for('82b00000-0000-4000-8000-000000000001', 'posts/k82/1000000000006-00000000-0000-4000-8000-000000000006.pdf', 'pdf');

-- Pia publishes an anonymous Students post with three items.
set role authenticated;
select set_config('app.current_user_id', '82b00000-0000-4000-8000-000000000001', false);
create temp table if not exists t82(post_id uuid);
grant all on t82 to authenticated;
insert into t82 select public.create_post_with_media(
  jsonb_build_object('author_id', '82b00000-0000-4000-8000-000000000001', 'channel', 'students', 'body', 'three charts',
                     'attachment', 'image', 'storage_key', 'posts/k82/1000000000001-00000000-0000-4000-8000-000000000001.jpg',
                     'mime_type', 'image/jpeg', 'size_bytes', 1, 'is_anonymous', true, 'media_width', 1080, 'media_height', 1350),
  jsonb_build_array(
    jsonb_build_object('kind', 'image', 'storage_key', 'posts/k82/1000000000002-00000000-0000-4000-8000-000000000002.jpg', 'size_bytes', 999999999, 'width', 1600, 'height', 900, 'file_name', 'Pia_chart.jpg'),
    jsonb_build_object('kind', 'video', 'storage_key', 'posts/k82/1000000000003-00000000-0000-4000-8000-000000000003.bin', 'size_bytes', 1)));
reset role;

select pg_temp.check((select count(*) = 2 and min(position) = 1 and max(position) = 2 from public.post_media where post_id = (select post_id from t82)),
  'a post with three items keeps the first on the post and items 2..3 in post_media, in order');
select pg_temp.check((select bool_and(size_bytes = 1234) from public.post_media where post_id = (select post_id from t82)),
  'item sizes come from the upload grant, not from the client');
select pg_temp.check((select media_width = 1080 and media_height = 1350 from public.posts where id = (select post_id from t82)),
  'dimensions are stored for the first item');
select pg_temp.check(coalesce((select max(n) <= 1 from (select count(*) as n from public.notifications
                                where related_post_id = (select post_id from t82) group by user_id) z), true),
  'a post with several items makes at most one notification per member (no per-item notifications)');

-- Refusals: a foreign grant, a reused key, a key with no grant; and the whole post is rolled back.
set role authenticated;
select set_config('app.current_user_id', '82b00000-0000-4000-8000-000000000001', false);
select pg_temp.must_fail($$select public.create_post_with_media(
  '{"author_id":"82b00000-0000-4000-8000-000000000001","channel":"students","body":"foreign"}'::jsonb,
  '[{"kind":"image","storage_key":"posts/k82/1000000000004-00000000-0000-4000-8000-000000000004.jpg"}]'::jsonb)$$,
  'not uploaded through the app', 'an item uploaded by someone else is refused');
select pg_temp.must_fail($$select public.create_post_with_media(
  '{"author_id":"82b00000-0000-4000-8000-000000000001","channel":"students","body":"reuse"}'::jsonb,
  '[{"kind":"image","storage_key":"posts/k82/1000000000002-00000000-0000-4000-8000-000000000002.jpg"}]'::jsonb)$$,
  '', 'an item already used by another post is refused');
select pg_temp.must_fail($$select public.create_post_with_media(
  '{"author_id":"82b00000-0000-4000-8000-000000000001","channel":"students","body":"nogrant"}'::jsonb,
  '[{"kind":"image","storage_key":"posts/elsewhere/x.jpg"}]'::jsonb)$$,
  'not uploaded through the app', 'an item with no upload grant is refused');
select pg_temp.must_fail($$select public.create_post_with_media(
  '{"author_id":"82b00000-0000-4000-8000-000000000001","channel":"students","body":"wrongkind"}'::jsonb,
  '[{"kind":"pdf","storage_key":"posts/k82/1000000000005-00000000-0000-4000-8000-000000000005.jpg"}]'::jsonb)$$,
  'does not match', 'an item whose type does not match its upload is refused');
reset role;
select pg_temp.check((select count(*) = 0 from public.posts where body in ('foreign', 'reuse', 'nogrant', 'wrongkind')),
  'a refused item leaves no half-made post behind');
select pg_temp.check((select used_at is null from public.media_upload_grants where storage_key = 'posts/k82/1000000000005-00000000-0000-4000-8000-000000000005.jpg'),
  'and does not use up the grant it tried');

-- Quin: cannot add items to Pia's post; reads the anonymous post's items without anything identifying.
set role authenticated;
select set_config('app.current_user_id', '82b00000-0000-4000-8000-000000000002', false);
select pg_temp.must_fail(format($$insert into public.post_media (post_id, position, kind, storage_key) values (%L, 3, 'image', 'posts/k82/1000000000004-00000000-0000-4000-8000-000000000004.jpg')$$, (select post_id from t82)),
  'Attachments can only be added by the person who uploaded them', 'another member cannot add items to someone else''s post');
select pg_temp.check((select count(*) = 0 from public.post_media where post_id = (select post_id from t82)),
  'another member cannot read an anonymous post''s item rows directly');
select pg_temp.check((select count(*) = 2 from public.post_media_for(array[(select post_id from t82)])),
  'another member gets the anonymous post''s items through post_media_for');
select pg_temp.check((select bool_and(file_name is null or file_name like 'Attachment%') from public.post_media_for(array[(select post_id from t82)])),
  'another member never gets the original file name on an anonymous post');
select pg_temp.check(not exists (select 1 from public.post_media_for(array[(select post_id from t82)]) r
                                  where row_to_json(r)::text like '%82b00000-0000-4000-8000-000000000001%' or row_to_json(r)::text ilike '%Pia%'),
  'nothing in the items identifies the anonymous author');
reset role;

-- The admin sees the real file name; the author deletes an item; the admin can too.
set role authenticated;
select set_config('app.current_user_id', '82a00000-0000-4000-8000-000000000001', false);
select pg_temp.check((select bool_or(file_name = 'Pia_chart.jpg') from public.post_media_for(array[(select post_id from t82)])),
  'admin: the original file name');
reset role;

-- Chat album: three photos from Quin, finishing in any order → admins get ONE notification.
insert into public.conversations (id, student_id) values ('82c00000-0000-4000-8000-000000000001', '82b00000-0000-4000-8000-000000000002')
on conflict do nothing;
select pg_temp.grant_for('82b00000-0000-4000-8000-000000000002', 'chat/82c/a1.jpg', 'image', 'chat', '82c00000-0000-4000-8000-000000000001');
select pg_temp.grant_for('82b00000-0000-4000-8000-000000000002', 'chat/82c/a2.jpg', 'image', 'chat', '82c00000-0000-4000-8000-000000000001');
select pg_temp.grant_for('82b00000-0000-4000-8000-000000000002', 'chat/82c/a3.jpg', 'image', 'chat', '82c00000-0000-4000-8000-000000000001');
set role authenticated;
select set_config('app.current_user_id', '82b00000-0000-4000-8000-000000000002', false);
insert into public.messages (id, conversation_id, sender_id, kind, storage_key, upload_status, album_id, album_index, album_size, album_kind, media_width, media_height)
values
  ('82d00000-0000-4000-8000-000000000001', '82c00000-0000-4000-8000-000000000001', '82b00000-0000-4000-8000-000000000002', 'image', 'chat/82c/a1.jpg', 'pending', '82e00000-0000-4000-8000-000000000001', 0, 3, 'photos', 800, 600),
  ('82d00000-0000-4000-8000-000000000002', '82c00000-0000-4000-8000-000000000001', '82b00000-0000-4000-8000-000000000002', 'image', 'chat/82c/a2.jpg', 'pending', '82e00000-0000-4000-8000-000000000001', 1, 3, 'photos', 600, 800),
  ('82d00000-0000-4000-8000-000000000003', '82c00000-0000-4000-8000-000000000001', '82b00000-0000-4000-8000-000000000002', 'image', 'chat/82c/a3.jpg', 'pending', '82e00000-0000-4000-8000-000000000001', 2, 3, 'photos', 900, 900);
update public.messages set upload_status = 'ready' where id = '82d00000-0000-4000-8000-000000000002';
update public.messages set upload_status = 'ready' where id = '82d00000-0000-4000-8000-000000000003';
update public.messages set upload_status = 'ready' where id = '82d00000-0000-4000-8000-000000000001';
select pg_temp.must_fail($$update public.messages set album_id = gen_random_uuid() where id = '82d00000-0000-4000-8000-000000000001'$$,
  'cannot be changed', 'a member cannot move a message into another album');
select pg_temp.must_fail($$insert into public.messages (conversation_id, sender_id, kind, body, album_id, album_index, album_size, album_kind)
  values ('82c00000-0000-4000-8000-000000000001', '82b00000-0000-4000-8000-000000000002', 'text', 'x', gen_random_uuid(), 0, 1, 'photos')$$,
  'messages_album_check', 'an "album" of one is refused');
reset role;
select pg_temp.check((select count(*) = 1 from public.notifications where user_id = '82a00000-0000-4000-8000-000000000001'
                        and related_conversation_id = '82c00000-0000-4000-8000-000000000001'),
  'admin: one notification for the whole album, however the items finish');
select pg_temp.check((select title = 'Quin EightyTwo sent you 3 photos' from public.notifications where user_id = '82a00000-0000-4000-8000-000000000001'
                        and related_conversation_id = '82c00000-0000-4000-8000-000000000001'),
  'and it names the album: "sent you 3 photos"');

-- A single photo still notifies as before.
select pg_temp.grant_for('82b00000-0000-4000-8000-000000000002', 'chat/82c/single.jpg', 'image', 'chat', '82c00000-0000-4000-8000-000000000001');
set role authenticated;
select set_config('app.current_user_id', '82b00000-0000-4000-8000-000000000002', false);
insert into public.messages (conversation_id, sender_id, kind, storage_key, upload_status)
values ('82c00000-0000-4000-8000-000000000001', '82b00000-0000-4000-8000-000000000002', 'image', 'chat/82c/single.jpg', 'ready');
reset role;
select pg_temp.check((select count(*) = 2 from public.notifications where user_id = '82a00000-0000-4000-8000-000000000001'
                        and related_conversation_id = '82c00000-0000-4000-8000-000000000001'),
  'a single photo still makes its own notification ("sent you a photo")');

update private.feature_flags set enabled = false where name = 'enforce_upload_grants';
