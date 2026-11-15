-- After RC6: use each feature once, the way the app does.
\set ON_ERROR_STOP 1
-- 1. a poll with a picture, by a student
insert into public.media_upload_grants (storage_key, owner_id, scope, kind, mime_type, size_bytes)
values ('posts/rh/1000000000001-00000000-0000-4000-8000-000000000001.bin', 'b0000000-0000-4000-8000-000000000002', 'post', 'image', 'image/png', 4321);
set role authenticated;
select set_config('app.current_user_id', 'b0000000-0000-4000-8000-000000000002', false);
select public.create_poll_post_with_image('students', 'Up or down?', array['Up', 'Down'], false,
  '{"storage_key": "posts/rh/1000000000001-00000000-0000-4000-8000-000000000001.bin", "width": 800, "height": 600}') is not null as poll_with_picture_created;
-- 2. a reply in chat, by the student
select set_config('app.current_user_id', 'b0000000-0000-4000-8000-000000000001', false);
insert into public.messages (conversation_id, sender_id, kind, body, reply_to_id) values
  ('e0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'text', 'Answering you', 'f0000000-0000-4000-8000-000000000002');
reset role;
select set_config('app.current_user_id', '', false);
-- 3. the admin deletes student three (the server calls this as service_role)
set role service_role;
select public.admin_delete_member('a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000003') ->> 'ok' as member_deleted;
reset role;
select (select count(*) from public.post_media pm join public.posts p on p.id = pm.post_id where p.attachment::text = 'poll') as poll_pictures,
       (select count(*) from public.messages where reply_to_id is not null) as replies,
       (select count(*) from public.profiles where deleted_at is not null) as deleted_members,
       (select count(*) from public.likes where user_id = 'b0000000-0000-4000-8000-000000000003') as deleted_members_likes_kept;
