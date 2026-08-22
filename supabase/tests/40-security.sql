-- ============================================================================
-- Security boundaries, exercised as the users themselves.
--
-- Every check runs inside a transaction that sets role `authenticated` and
-- impersonates a real profile id, so RLS and the guard triggers decide the
-- outcome exactly as they would for a request from that person's browser.
--
-- Fixtures come from 10-chat-media-quota.sql:
--   1111… admin        2222… student Rahul (conversation aaaa…0001)
--   3333… student Other (conversation aaaa…0002)
-- ============================================================================
\pset pager off
set client_min_messages = notice;

-- A helper so each check reads as "this must be refused".
create or replace function pg_temp.must_fail(p_sql text, p_expect text, p_label text)
returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FAIL: % — the statement was allowed', p_label;
exception when others then
  if sqlerrm like 'FAIL:%' then
    raise;
  elsif p_expect = '' or position(p_expect in sqlerrm) > 0 then
    raise notice 'PASS  % (%)', p_label, left(sqlerrm, 90);
  else
    raise exception 'FAIL: % — refused for the wrong reason: %', p_label, sqlerrm;
  end if;
end $$;

\echo '--- 1. Student A cannot send a message into Student B''s conversation'
begin;
set local role authenticated;
set local app.current_user_id = '22222222-2222-2222-2222-222222222222';
-- RLS gives no error text of its own on a refused INSERT; it raises a policy
-- violation, which is what we assert on.
select pg_temp.must_fail(
  $$insert into public.messages (conversation_id, sender_id, kind, body)
    values ('aaaaaaaa-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','text','intruding')$$,
  'row-level security', '1. cross-conversation insert');
rollback;

\echo '--- 2. Student A cannot impersonate the admin as sender'
begin;
set local role authenticated;
set local app.current_user_id = '22222222-2222-2222-2222-222222222222';
select pg_temp.must_fail(
  $$insert into public.messages (conversation_id, sender_id, kind, body)
    values ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','text','I am the admin')$$,
  'row-level security', '2. forged sender_id');
rollback;

\echo '--- 3. Student A cannot mark Student B''s messages read (no visibility at all)'
begin;
set local role authenticated;
set local app.current_user_id = '22222222-2222-2222-2222-222222222222';
with touched as (
  update public.messages set read_at = now()
  where conversation_id = 'aaaaaaaa-0000-0000-0000-000000000002'
  returning 1
)
select case when count(*) = 0 then 'PASS' else 'FAIL: updated ' || count(*) || ' foreign rows' end as t3
from touched;
rollback;

\echo '--- 4. Student A cannot delete Student B''s messages'
begin;
set local role authenticated;
set local app.current_user_id = '22222222-2222-2222-2222-222222222222';
with removed as (
  delete from public.messages
  where conversation_id = 'aaaaaaaa-0000-0000-0000-000000000002'
  returning 1
)
select case when count(*) = 0 then 'PASS' else 'FAIL: deleted ' || count(*) || ' foreign rows' end as t4
from removed;
rollback;

\echo '--- 5. A student cannot post to the Official channel'
begin;
set local role authenticated;
set local app.current_user_id = '22222222-2222-2222-2222-222222222222';
select pg_temp.must_fail(
  $$insert into public.posts (author_id, channel, body)
    values ('22222222-2222-2222-2222-222222222222','official','fake signal')$$,
  'Only admins', '5. student posting to Official');
rollback;

\echo '--- 6. A student cannot promote themselves to admin'
begin;
set local role authenticated;
set local app.current_user_id = '22222222-2222-2222-2222-222222222222';
select pg_temp.must_fail(
  $$update public.profiles set role = 'admin' where id = '22222222-2222-2222-2222-222222222222'$$,
  '', '6. self-promotion to admin');
rollback;

\echo '--- 7. A student cannot fake headroom by rewriting the media counter'
begin;
set local role authenticated;
set local app.current_user_id = '22222222-2222-2222-2222-222222222222';
with rewritten as (
  update public.conversations set media_bytes_used = 0
  where id = 'aaaaaaaa-0000-0000-0000-000000000001'
  returning 1
)
select case when count(*) = 0 then 'PASS' else 'FAIL: rewrote the quota counter' end as t7
from rewritten;
rollback;

\echo '--- 8. ...and the counter is a trigger''s to maintain, not a client''s'
-- Even service-role writes are corrected by the next recalculation, so the
-- limit cannot be bypassed by editing the number.
select public.recalc_conversation_media_usage('aaaaaaaa-0000-0000-0000-000000000001');
select case when media_bytes_used = (
    select coalesce(sum(coalesce(size_bytes,0) + coalesce(poster_size_bytes,0)), 0)
    from public.messages
    where conversation_id = 'aaaaaaaa-0000-0000-0000-000000000001'
      and storage_key is not null and not media_purged)
  then 'PASS' else 'FAIL: counter disagrees with stored media' end as t8
from public.conversations where id = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '--- 9. A student cannot read another student''s profile row'
begin;
set local role authenticated;
set local app.current_user_id = '22222222-2222-2222-2222-222222222222';
select case when count(*) = 0 then 'PASS' else 'FAIL: leaked a profile' end as t9
from public.profiles where id = '33333333-3333-3333-3333-333333333333';
\echo '--- 10. ...but can read their own'
select case when count(*) = 1 then 'PASS' else 'FAIL' end as t10
from public.profiles where id = '22222222-2222-2222-2222-222222222222';
rollback;

\echo '--- 11. An admin can reach every student conversation'
begin;
set local role authenticated;
set local app.current_user_id = '11111111-1111-1111-1111-111111111111';
select case when count(*) = 2 then 'PASS' else 'FAIL: admin sees ' || count(*) || ' of 2' end as t11
from public.conversations;
\echo '--- 12. ...and can post to the Official channel'
insert into public.posts (id, author_id, channel, body)
values ('dddddddd-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','official','admin signal');
select case when count(*) = 1 then 'PASS' else 'FAIL' end as t12
from public.posts where id = 'dddddddd-0000-0000-0000-000000000001';
rollback;

\echo '--- 13. Anonymous students stay anonymous to other students'
begin;
set local role authenticated;
set local app.current_user_id = '33333333-3333-3333-3333-333333333333';
insert into public.posts (id, author_id, channel, body, is_anonymous)
values ('dddddddd-0000-0000-0000-000000000002','33333333-3333-3333-3333-333333333333','students','my anonymous setup', true);
commit;

begin;
set local role authenticated;
set local app.current_user_id = '22222222-2222-2222-2222-222222222222';
select case when author_name = 'Unknown User' then 'PASS' else 'FAIL: student saw ' || author_name end as t13
from public.posts_feed('students') where id = 'dddddddd-0000-0000-0000-000000000002';
rollback;

\echo '--- 14. ...but an admin still sees who wrote it'
begin;
set local role authenticated;
set local app.current_user_id = '11111111-1111-1111-1111-111111111111';
-- The name itself comes from the profile (the signup trigger sets it); what
-- matters is that the admin is NOT handed the anonymous placeholder.
select case
  when author_name <> 'Unknown User'
   and author_name = (select full_name from public.profiles where id = '33333333-3333-3333-3333-333333333333')
  then 'PASS (admin sees "' || author_name || '")'
  else 'FAIL: admin saw ' || author_name
end as t14
from public.posts_feed('students') where id = 'dddddddd-0000-0000-0000-000000000002';
rollback;

\echo '--- 15. A student cannot edit another student''s post'
begin;
set local role authenticated;
set local app.current_user_id = '22222222-2222-2222-2222-222222222222';
with edited as (
  update public.posts set body = 'hijacked'
  where id = 'dddddddd-0000-0000-0000-000000000002'
  returning 1
)
select case when count(*) = 0 then 'PASS' else 'FAIL: edited a foreign post' end as t15
from edited;
\echo '--- 16. ...nor delete it'
with removed_post as (
  delete from public.posts where id = 'dddddddd-0000-0000-0000-000000000002' returning 1
)
select case when count(*) = 0 then 'PASS' else 'FAIL: deleted a foreign post' end as t16
from removed_post;
rollback;
