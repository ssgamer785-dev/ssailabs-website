-- ============================================================================
-- RC5: replies to comments (one-level threads) and their notifications.
-- Fixtures: 81a…01 admin; 81b…01 Ann (post author), 81b…02 Ben, 81b…03 Cy.
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

create or replace function pg_temp.notes(p_user uuid, p_category text)
returns bigint language sql as $$
  select count(*) from public.notifications where user_id = p_user and category = p_category;
$$;

insert into auth.users (id, email) values
  ('81a00000-0000-4000-8000-000000000001', 'admin81@test.local'),
  ('81b00000-0000-4000-8000-000000000001', 'ann81@test.local'),
  ('81b00000-0000-4000-8000-000000000002', 'ben81@test.local'),
  ('81b00000-0000-4000-8000-000000000003', 'cy81@test.local')
on conflict (id) do nothing;
update public.profiles set role = 'admin', full_name = 'Admin EightyOne' where id = '81a00000-0000-4000-8000-000000000001';
update public.profiles set full_name = 'Ann EightyOne', activated_at = now() where id = '81b00000-0000-4000-8000-000000000001';
update public.profiles set full_name = 'Ben EightyOne', activated_at = now() where id = '81b00000-0000-4000-8000-000000000002';
update public.profiles set full_name = 'Cy EightyOne',  activated_at = now() where id = '81b00000-0000-4000-8000-000000000003';

insert into public.posts (id, author_id, channel, body) values
  ('81c00000-0000-4000-8000-000000000001', '81b00000-0000-4000-8000-000000000001', 'students', 'Ann asks'),
  ('81c00000-0000-4000-8000-000000000002', '81b00000-0000-4000-8000-000000000001', 'students', 'another post');

-- Ben comments anonymously on Ann's post.
set role authenticated;
select set_config('app.current_user_id', '81b00000-0000-4000-8000-000000000002', false);
insert into public.comments (id, post_id, author_id, body, is_anonymous)
values ('81e00000-0000-4000-8000-000000000001', '81c00000-0000-4000-8000-000000000001', '81b00000-0000-4000-8000-000000000002', 'Ben (hidden) answers', true);
reset role;

-- Cy replies to Ben's anonymous comment.
set role authenticated;
select set_config('app.current_user_id', '81b00000-0000-4000-8000-000000000003', false);
insert into public.comments (id, post_id, author_id, body, parent_comment_id, reply_to_name)
values ('81e00000-0000-4000-8000-000000000002', '81c00000-0000-4000-8000-000000000001', '81b00000-0000-4000-8000-000000000003',
        'Cy replies', '81e00000-0000-4000-8000-000000000001', 'Ben EightyOne');
reset role;
select pg_temp.check((select parent_comment_id = '81e00000-0000-4000-8000-000000000001' and reply_to_comment_id = '81e00000-0000-4000-8000-000000000001'
                        and reply_to_name = 'Unknown User'
                        from public.comments where id = '81e00000-0000-4000-8000-000000000002'),
  'a reply hangs off the comment, and its label says "Unknown User" for an anonymous comment (a forged name is ignored)');

-- Ann replies to Cy's reply: still one level, under the same root, labelled Cy.
set role authenticated;
select set_config('app.current_user_id', '81b00000-0000-4000-8000-000000000001', false);
insert into public.comments (id, post_id, author_id, body, parent_comment_id)
values ('81e00000-0000-4000-8000-000000000003', '81c00000-0000-4000-8000-000000000001', '81b00000-0000-4000-8000-000000000001',
        'Ann replies to Cy', '81e00000-0000-4000-8000-000000000002');
select pg_temp.must_fail($$insert into public.comments (post_id, author_id, body, parent_comment_id)
  values ('81c00000-0000-4000-8000-000000000002', '81b00000-0000-4000-8000-000000000001', 'wrong post', '81e00000-0000-4000-8000-000000000001')$$,
  'same post', 'a reply on a different post is refused');
reset role;
select pg_temp.check((select parent_comment_id = '81e00000-0000-4000-8000-000000000001' and reply_to_comment_id = '81e00000-0000-4000-8000-000000000002'
                        and reply_to_name = 'Cy EightyOne'
                        from public.comments where id = '81e00000-0000-4000-8000-000000000003'),
  'a reply to a reply stays one level deep and names whom it answered');

-- Notifications
select pg_temp.check(pg_temp.notes('81b00000-0000-4000-8000-000000000002', 'replies') = 1,
  'Ben (anonymous comment author) is told someone replied to his comment');
select pg_temp.check(pg_temp.notes('81b00000-0000-4000-8000-000000000003', 'replies') = 1,
  'Cy is told Ann replied to her reply');
select pg_temp.check((select count(*) from public.notifications where user_id = '81b00000-0000-4000-8000-000000000001'
                        and related_comment_id = '81e00000-0000-4000-8000-000000000003') = 0,
  'Ann is never notified about her own reply');
select pg_temp.check(pg_temp.notes('81b00000-0000-4000-8000-000000000001', 'comments') = 2,
  'Ann (post author) gets one notification for each comment by someone else');
select pg_temp.check(not exists (select 1 from public.notifications where title ilike '%Ben EightyOne%'),
  'no notification text names the anonymous author');

-- Ben turns replies off; Cy replies again.
insert into public.notification_preferences (user_id, replies) values ('81b00000-0000-4000-8000-000000000002', false)
on conflict (user_id) do update set replies = false;
set role authenticated;
select set_config('app.current_user_id', '81b00000-0000-4000-8000-000000000003', false);
insert into public.comments (post_id, author_id, body, parent_comment_id)
values ('81c00000-0000-4000-8000-000000000001', '81b00000-0000-4000-8000-000000000003', 'again', '81e00000-0000-4000-8000-000000000001');
reset role;
select pg_temp.check(pg_temp.notes('81b00000-0000-4000-8000-000000000002', 'replies') = 1,
  'with replies turned off, no new reply notification');

-- Reading threads: another student vs the admin
set role authenticated;
select set_config('app.current_user_id', '81b00000-0000-4000-8000-000000000003', false);
select pg_temp.check((select count(*) = 4 from public.post_comment_threads('81c00000-0000-4000-8000-000000000001')),
  'a thread page returns the top-level comment with all its replies');
select pg_temp.check(not exists (select 1 from public.post_comment_threads('81c00000-0000-4000-8000-000000000001') r
                                  where row_to_json(r)::text like '%81b00000-0000-4000-8000-000000000002%' or row_to_json(r)::text ilike '%Ben EightyOne%'),
  'another student: nothing in the thread names or identifies the anonymous author, including reply labels');
reset role;
set role authenticated;
select set_config('app.current_user_id', '81a00000-0000-4000-8000-000000000001', false);
select pg_temp.check((select reply_to_name = 'Ben EightyOne' and author_name = 'Cy EightyOne'
                        from public.post_comment_threads('81c00000-0000-4000-8000-000000000001') where id = '81e00000-0000-4000-8000-000000000002'),
  'admin: the reply label shows the real name of the anonymous author');
select pg_temp.check((select author_name = 'Ben EightyOne' from public.post_comment_threads('81c00000-0000-4000-8000-000000000001')
                        where id = '81e00000-0000-4000-8000-000000000001'),
  'admin: the anonymous comment shows its real author');
reset role;

-- Deleting a comment keeps other people's replies.
delete from public.comments where id = '81e00000-0000-4000-8000-000000000001';
select pg_temp.check((select count(*) = 3 and bool_and(reply_to_name is not null) from public.comments
                       where post_id = '81c00000-0000-4000-8000-000000000001'),
  'deleting a comment never deletes the replies to it (they keep their label)');

-- Older clients still work: post_comments is unchanged and lists replies too.
set role authenticated;
select set_config('app.current_user_id', '81b00000-0000-4000-8000-000000000002', false);
select pg_temp.check((select count(*) = 3 from public.post_comments('81c00000-0000-4000-8000-000000000001')),
  'the RC3/RC4 comment reader still returns every comment');
reset role;
