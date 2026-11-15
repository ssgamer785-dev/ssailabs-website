-- A small stand-in for Production as it is today (before RC6).
insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000001', 'admin@rehearsal.local'),
  ('b0000000-0000-4000-8000-000000000001', 's1@rehearsal.local'),
  ('b0000000-0000-4000-8000-000000000002', 's2@rehearsal.local'),
  ('b0000000-0000-4000-8000-000000000003', 's3@rehearsal.local');
update public.profiles set role = 'admin', full_name = 'Admin' where id = 'a0000000-0000-4000-8000-000000000001';
update public.profiles set full_name = 'Student One', phone = '+910000000001', activated_at = now() where id = 'b0000000-0000-4000-8000-000000000001';
update public.profiles set full_name = 'Student Two', activated_at = now() where id = 'b0000000-0000-4000-8000-000000000002';
update public.profiles set full_name = 'Student Three', activated_at = now() where id = 'b0000000-0000-4000-8000-000000000003';

-- A poll made the normal way, by the admin, with votes.
set role authenticated;
select set_config('app.current_user_id', 'a0000000-0000-4000-8000-000000000001', false);
select public.create_poll_post('official', 'Gold or silver?', array['Gold', 'Silver'], false) as poll_id \gset
reset role;
insert into public.poll_votes (post_id, option_id, voter_id)
select :'poll_id', o.id, u.id
  from (select id from public.poll_options where post_id = :'poll_id' order by sort_order limit 1) o
  cross join (values ('b0000000-0000-4000-8000-000000000001'::uuid), ('b0000000-0000-4000-8000-000000000002'::uuid)) u(id);

insert into public.posts (id, author_id, channel, body) values
  ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'students', 'A named post');
insert into public.comments (id, post_id, author_id, body) values
  ('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'A comment');
insert into public.likes (post_id, user_id) values ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000003');
insert into public.bookmarks (post_id, user_id) values ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001');
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth_key, environment)
values ('b0000000-0000-4000-8000-000000000001', 'https://push.example.test/s1', 'p', 'a', 'production'),
       ('a0000000-0000-4000-8000-000000000001', 'https://push.example.test/admin', 'p', 'a', 'production');
insert into public.conversations (id, student_id) values ('e0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001');
insert into public.messages (id, conversation_id, sender_id, kind, body, upload_status) values
  ('f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'text', 'Hello admin', 'ready'),
  ('f0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'text', 'Hello', 'ready');
