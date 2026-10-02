-- ============================================================================
-- RC5: "Post with my real name" defaults ON; explicit choices are recorded;
-- admins always see the real name; other students never receive it.
--
-- Fixtures: 8a…01 admin, 8b…01 Rae (anonymous author), 8b…02 Sol (reader).
-- (The Option A backfill of EXISTING accounts is rehearsed by the release
-- package against a copy of the production schema with real-shaped data.)
-- ============================================================================
\pset pager off
set client_min_messages = notice;

create or replace function pg_temp.check(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if coalesce(p_ok, false) then raise notice 'PASS  %', p_label;
  else raise exception 'FAIL: %', p_label; end if;
end $$;

insert into auth.users (id, email) values
  ('8a000000-0000-4000-8000-000000000001', 'admin80@test.local'),
  ('8b000000-0000-4000-8000-000000000001', 'rae80@test.local'),
  ('8b000000-0000-4000-8000-000000000002', 'sol80@test.local')
on conflict (id) do nothing;

select pg_temp.check((select reveal_identity from public.profiles where id = '8b000000-0000-4000-8000-000000000001'),
  'a new account starts with "post with my real name" ON');
select pg_temp.check((select reveal_identity_chosen_at is null from public.profiles where id = '8b000000-0000-4000-8000-000000000001'),
  'a new account has made no choice yet');

update public.profiles set role = 'admin', full_name = 'Admin Eighty' where id = '8a000000-0000-4000-8000-000000000001';
update public.profiles set full_name = 'Rae Eighty', activated_at = now() where id = '8b000000-0000-4000-8000-000000000001';
update public.profiles set full_name = 'Sol Eighty', activated_at = now() where id = '8b000000-0000-4000-8000-000000000002';
select pg_temp.check((select reveal_identity_chosen_at is null from public.profiles where id = '8b000000-0000-4000-8000-000000000001'),
  'a server-side change (activation, rename by the owner role) is not recorded as the member''s choice');

-- Rae turns it OFF herself.
set role authenticated;
select set_config('app.current_user_id', '8b000000-0000-4000-8000-000000000001', false);
update public.profiles set reveal_identity = false where id = '8b000000-0000-4000-8000-000000000001';
reset role;
select pg_temp.check((select not reveal_identity and reveal_identity_chosen_at is not null from public.profiles where id = '8b000000-0000-4000-8000-000000000001'),
  'turning it OFF herself is recorded as an explicit choice');

-- A client cannot forge or erase the choice record.
set role authenticated;
update public.profiles set reveal_identity_chosen_at = null, phone = '+911234567890' where id = '8b000000-0000-4000-8000-000000000001';
reset role;
select pg_temp.check((select reveal_identity_chosen_at is not null from public.profiles where id = '8b000000-0000-4000-8000-000000000001'),
  'a member cannot clear the choice record');

-- Rae posts anonymously in the Students Community, and comments anonymously.
set role authenticated;
insert into public.posts (id, author_id, channel, body, is_anonymous)
values ('8c000000-0000-4000-8000-000000000001', '8b000000-0000-4000-8000-000000000001', 'students', 'anonymous question', true);
insert into public.comments (id, post_id, author_id, body, is_anonymous)
values ('8e000000-0000-4000-8000-000000000001', '8c000000-0000-4000-8000-000000000001', '8b000000-0000-4000-8000-000000000001', 'anonymous follow-up', true);
reset role;

-- Sol (another student) reads everything a student can.
set role authenticated;
select set_config('app.current_user_id', '8b000000-0000-4000-8000-000000000002', false);
select pg_temp.check((select author_id is null and author_name = 'Unknown User' and display_name = 'Unknown User' and author_role is null
                        from public.post_by_id('8c000000-0000-4000-8000-000000000001')),
  'another student: the anonymous post carries no author id, role or name');
select pg_temp.check((select bool_and(author_id is null and author_name = 'Unknown User')
                        from public.posts_feed('students') where id = '8c000000-0000-4000-8000-000000000001'),
  'another student: the feed carries no author id or name');
select pg_temp.check((select bool_and(author_id is null and author_name = 'Unknown User')
                        from public.post_comments('8c000000-0000-4000-8000-000000000001')),
  'another student: the anonymous comment carries no author id or name');
select pg_temp.check((select count(*) = 0 from public.posts where id = '8c000000-0000-4000-8000-000000000001'),
  'another student: the anonymous post row itself is not readable (so realtime does not deliver it either)');
select pg_temp.check((select count(*) = 0 from public.comments where id = '8e000000-0000-4000-8000-000000000001'),
  'another student: the anonymous comment row itself is not readable');
select pg_temp.check(not exists (
    select 1 from public.post_by_id('8c000000-0000-4000-8000-000000000001') r
     where row_to_json(r)::text ilike '%Rae%' or row_to_json(r)::text like '%8b000000-0000-4000-8000-000000000001%'),
  'another student: nothing in the post payload names or identifies the author');
select pg_temp.check(not exists (
    select 1 from public.post_comments('8c000000-0000-4000-8000-000000000001') r
     where row_to_json(r)::text ilike '%Rae%' or row_to_json(r)::text like '%8b000000-0000-4000-8000-000000000001%'),
  'another student: nothing in the comment payload names or identifies the author');
reset role;

-- The admin always sees who it is.
set role authenticated;
select set_config('app.current_user_id', '8a000000-0000-4000-8000-000000000001', false);
select pg_temp.check((select author_id = '8b000000-0000-4000-8000-000000000001' and author_name = 'Rae Eighty'
                        from public.post_by_id('8c000000-0000-4000-8000-000000000001')),
  'admin: the anonymous post shows the real author');
select pg_temp.check((select bool_and(author_name = 'Rae Eighty') from public.post_comments('8c000000-0000-4000-8000-000000000001')),
  'admin: the anonymous comment shows the real author');
reset role;
