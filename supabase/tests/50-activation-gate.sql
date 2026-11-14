-- ============================================================================
-- The activation gate, exercised as the users themselves.
--
-- Every check runs inside a transaction that sets role `authenticated` and
-- impersonates a real profile id, so the privilege grants, the RLS policies
-- and the SECURITY DEFINER bodies decide the outcome exactly as they would for
-- a request from that person's browser.
--
-- Fixture 1111… (admin) comes from 10-chat-media-quota.sql. Two students are
-- created here rather than reused, so activating them cannot disturb the
-- chat/community suites that share this database.
--
-- The concurrent-redemption race needs two real connections and so cannot live
-- in a single psql script; it is 51-activation-race.sh, run by run.sh.
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
    raise notice 'PASS  % (%)', p_label, left(sqlerrm, 90);
  else
    raise exception 'FAIL: % — refused for the wrong reason: %', p_label, sqlerrm;
  end if;
end $$;

create or replace function pg_temp.check(p_ok boolean, p_label text, p_detail text default '')
returns void language plpgsql as $$
begin
  if p_ok then raise notice 'PASS  % %', p_label, p_detail;
  else raise exception 'FAIL: % %', p_label, p_detail;
  end if;
end $$;

-- Fixtures: two fresh students.
insert into auth.users (id, email) values
  ('44444444-4444-4444-4444-444444444444', 'activate-a@test.local'),
  ('55555555-5555-5555-5555-555555555555', 'activate-b@test.local')
on conflict (id) do nothing;

-- handle_new_user() already made the profiles; make sure they are students and
-- un-activated whatever the trigger defaulted to.
update public.profiles set role = 'student', activated_at = null, activation_attempts = 0
 where id in ('44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555');

-- ----------------------------------------------------------------------------
\echo '--- 1. A fresh user is NOT activated'
select pg_temp.check(
  public.is_activated('44444444-4444-4444-4444-444444444444') = false,
  '1. fresh user is gated');

\echo '--- 2. The admin is activated without ever redeeming a code'
select pg_temp.check(
  public.is_activated('11111111-1111-1111-1111-111111111111') = true,
  '2. admin bypasses the gate');

-- ----------------------------------------------------------------------------
\echo '--- 3. A student cannot create an activation code'
begin;
set local role authenticated;
set local app.current_user_id = '44444444-4444-4444-4444-444444444444';
select pg_temp.must_fail(
  $$select public.create_activation_code()$$,
  'Only an admin', '3. student calling create_activation_code()');
rollback;

\echo '--- 4. A student cannot reach the activation_codes table at all'
begin;
set local role authenticated;
set local app.current_user_id = '44444444-4444-4444-4444-444444444444';
select pg_temp.must_fail(
  $$select count(*) from public.activation_codes$$,
  'permission denied', '4. direct SELECT on activation_codes');
rollback;

begin;
set local role authenticated;
set local app.current_user_id = '44444444-4444-4444-4444-444444444444';
select pg_temp.must_fail(
  $$insert into public.activation_codes (code_hash, code_hint, created_by, expires_at)
    values ('deadbeef', 'BEEF', '44444444-4444-4444-4444-444444444444', now() + interval '1 day')$$,
  'permission denied', '4b. direct INSERT of a code');
rollback;

\echo '--- 5. A student cannot self-activate by writing to their own profile'
-- profiles_update_own_or_admin lets them update their own row and does not
-- restrict columns, so without profiles_guard_activation this PATCH is the
-- whole gate defeated. This is the check that the trigger exists.
begin;
set local role authenticated;
set local app.current_user_id = '44444444-4444-4444-4444-444444444444';
select pg_temp.must_fail(
  $$update public.profiles set activated_at = now()
     where id = '44444444-4444-4444-4444-444444444444'$$,
  'not by writing to a profile', '5. self-granting activated_at');
select pg_temp.must_fail(
  $$update public.profiles set activation_code_id = gen_random_uuid()
     where id = '44444444-4444-4444-4444-444444444444'$$,
  'not by writing to a profile', '5b. self-granting activation_code_id');
rollback;

\echo '--- 5c. ...and an un-activated user can read no app content'
begin;
set local role authenticated;
set local app.current_user_id = '44444444-4444-4444-4444-444444444444';
select pg_temp.check((select count(*) from public.posts) = 0,        '5c. posts are invisible');
select pg_temp.check((select count(*) from public.comments) = 0,     '5d. comments are invisible');
select pg_temp.check((select count(*) from public.messages) = 0,     '5e. messages are invisible');
select pg_temp.check((select count(*) from public.notifications) = 0,'5f. notifications are invisible');
rollback;

-- ----------------------------------------------------------------------------
\echo '--- 6. The admin creates a code; it comes back once, in plaintext'
set role authenticated;
set app.current_user_id = '11111111-1111-1111-1111-111111111111';
select public.create_activation_code() as created \gset
reset role;
reset app.current_user_id;
select pg_temp.check(
  (:'created'::jsonb ->> 'code') ~ '^TP-[A-Z2-9]{4}-[A-Z2-9]{4}$',
  '6. format is TP-XXXX-XXXX', :'created'::jsonb ->> 'code');

select pg_temp.check(
  ((:'created'::jsonb ->> 'expires_at')::timestamptz - now())
    between interval '14 minutes' and interval '15 minutes',
  '6b. expires in exactly 15 minutes');

\echo '--- 7. The plaintext code is NOT stored anywhere'
select pg_temp.check(
  not exists (
    select 1 from public.activation_codes
     where code_hash = replace(:'created'::jsonb ->> 'code', '-', '')
        or code_hint = replace(:'created'::jsonb ->> 'code', '-', '')),
  '7. only the hash is persisted');

select pg_temp.check(
  (select code_hash from public.activation_codes where id = (:'created'::jsonb ->> 'id')::uuid)
    = encode(digest(public.normalise_activation_code(:'created'::jsonb ->> 'code'), 'sha256'), 'hex'),
  '7b. stored hash is sha256 of the normalised code');

-- ----------------------------------------------------------------------------
\echo '--- 8. A random / invalid code is rejected'
begin;
set local role authenticated;
set local app.current_user_id = '44444444-4444-4444-4444-444444444444';
select pg_temp.check(
  (public.redeem_activation_code('TP-ZZZZ-ZZZZ') ->> 'ok') = 'false',
  '8. guessed code refused');
rollback;

\echo '--- 9. A valid code activates the user, in whatever spelling it arrives'
begin;
set local role authenticated;
set local app.current_user_id = '44444444-4444-4444-4444-444444444444';
-- Lower-cased and stripped of its dashes: the same code.
select pg_temp.check(
  (public.redeem_activation_code(
     lower(replace(:'created'::jsonb ->> 'code', '-', ''))) ->> 'ok') = 'true',
  '9. redeemed with a differently-spelled code');
select pg_temp.check(
  public.is_activated('44444444-4444-4444-4444-444444444444') = true,
  '9b. user is now activated');
commit;

select pg_temp.check(
  (select redeemed_by from public.activation_codes where id = (:'created'::jsonb ->> 'id')::uuid)
    = '44444444-4444-4444-4444-444444444444',
  '9c. the code is tied to the user who redeemed it');

-- ----------------------------------------------------------------------------
\echo '--- 9d. ...and content becomes readable the moment they are'
begin;
set local role authenticated;
set local app.current_user_id = '44444444-4444-4444-4444-444444444444';
select pg_temp.check((select count(*) from public.posts) > 0,
  '9d. posts are visible once activated');
rollback;

\echo '--- 10. The same code cannot be redeemed by a second user'
begin;
set local role authenticated;
set local app.current_user_id = '55555555-5555-5555-5555-555555555555';
select pg_temp.check(
  (public.redeem_activation_code(:'created'::jsonb ->> 'code') ->> 'ok') = 'false',
  '10. replay by a second user refused');
select pg_temp.check(
  public.is_activated('55555555-5555-5555-5555-555555555555') = false,
  '10b. second user is still gated');
rollback;

\echo '--- 11. An expired code is rejected'
set role authenticated;
set app.current_user_id = '11111111-1111-1111-1111-111111111111';
select public.create_activation_code() as expiring \gset
reset role;
reset app.current_user_id;
-- Age it past its window. Done as the owner, which is the only way it can be
-- done: no client role can write this table.
update public.activation_codes
   set expires_at = now() - interval '1 second'
 where id = (:'expiring'::jsonb ->> 'id')::uuid;

begin;
set local role authenticated;
set local app.current_user_id = '55555555-5555-5555-5555-555555555555';
select pg_temp.check(
  (public.redeem_activation_code(:'expiring'::jsonb ->> 'code') ->> 'ok') = 'false',
  '11. expired code refused');
rollback;

\echo '--- 12. Every failure reports the same reason (no oracle for a guesser)'
begin;
set local role authenticated;
set local app.current_user_id = '55555555-5555-5555-5555-555555555555';
select pg_temp.check(
  (public.redeem_activation_code('TP-AAAA-AAAA') ->> 'reason')
    = (public.redeem_activation_code(:'expiring'::jsonb ->> 'code') ->> 'reason'),
  '12. never-existed and expired are indistinguishable');
rollback;

\echo '--- 13. Redemption attempts are throttled'
begin;
set local role authenticated;
set local app.current_user_id = '55555555-5555-5555-5555-555555555555';
do $$
declare i int; r jsonb;
begin
  for i in 1..10 loop
    r := public.redeem_activation_code('TP-BBBB-BBBB');
  end loop;
  r := public.redeem_activation_code('TP-BBBB-BBBB');
  if r ->> 'reason' <> 'too_many_attempts' then
    raise exception 'FAIL: 13. attempt 11 was not throttled (got %)', r ->> 'reason';
  end if;
  raise notice 'PASS  13. throttled after 10 attempts in the window';
end $$;
rollback;

-- ----------------------------------------------------------------------------
\echo '--- 14. A student sees nothing through the admin read functions'
begin;
set local role authenticated;
set local app.current_user_id = '55555555-5555-5555-5555-555555555555';
select pg_temp.check(
  (select count(*) from public.admin_activation_codes(50)) = 0,
  '14. admin_activation_codes() is empty for a student');
rollback;

begin;
set local role authenticated;
set local app.current_user_id = '11111111-1111-1111-1111-111111111111';
select pg_temp.check(
  (select count(*) from public.admin_activation_codes(50)) >= 2,
  '14b. ...and populated for the admin');
select pg_temp.check(
  (select status from public.admin_activation_codes(50)
    where id = (:'created'::jsonb ->> 'id')::uuid) = 'USED',
  '14c. the redeemed code reads USED');
select pg_temp.check(
  (select status from public.admin_activation_codes(50)
    where id = (:'expiring'::jsonb ->> 'id')::uuid) = 'EXPIRED',
  '14d. the aged code reads EXPIRED');
rollback;

-- ----------------------------------------------------------------------------
\echo '--- 15. Membership requests: a user may lodge one for themselves only'
begin;
set local role authenticated;
set local app.current_user_id = '55555555-5555-5555-5555-555555555555';
insert into public.membership_requests (requested_by, email, name, mobile, trading_experience, address)
values ('55555555-5555-5555-5555-555555555555', 'b@test.local', 'B Trader', '+910000000000', '2 years swing trading', 'Somewhere');
select pg_temp.check(true, '15. own request accepted');

select pg_temp.must_fail(
  $$insert into public.membership_requests (requested_by, email, name, mobile, trading_experience, address)
    values ('44444444-4444-4444-4444-444444444444','x@test.local','X','+910000000001','none','nowhere')$$,
  'row-level security', '15b. request forged for another user refused');
commit;

\echo '--- 16. A user cannot read membership requests; the admin can'
begin;
set local role authenticated;
set local app.current_user_id = '55555555-5555-5555-5555-555555555555';
select pg_temp.check(
  (select count(*) from public.membership_requests) = 0,
  '16. student reads none');
rollback;

begin;
set local role authenticated;
set local app.current_user_id = '11111111-1111-1111-1111-111111111111';
select pg_temp.check(
  (select count(*) from public.admin_membership_requests(100)) >= 1,
  '16b. admin reads them');
rollback;

\echo '--- 17. Submitting a request grants nothing'
select pg_temp.check(
  public.is_activated('55555555-5555-5555-5555-555555555555') = false,
  '17. requester is still gated');

\echo '--- 18. A student cannot change a membership request status'
begin;
set local role authenticated;
set local app.current_user_id = '55555555-5555-5555-5555-555555555555';
select pg_temp.must_fail(
  $$select public.admin_set_membership_status(
      (select id from public.membership_requests limit 1), 'approved')$$,
  'Only an admin', '18. student calling admin_set_membership_status()');
rollback;

\echo '--- 19. Redemption is idempotent for an already-activated user'
begin;
set local role authenticated;
set local app.current_user_id = '44444444-4444-4444-4444-444444444444';
select pg_temp.check(
  (public.redeem_activation_code('TP-CCCC-CCCC') ->> 'reason') = 'already_activated',
  '19. no second code is burned');
rollback;

\echo '--- 20. An unauthenticated caller cannot redeem'
begin;
set local role authenticated;
-- app.current_user_id unset => auth.uid() is null
select pg_temp.check(
  (public.redeem_activation_code('TP-DDDD-DDDD') ->> 'reason') = 'unauthenticated',
  '20. anonymous redemption refused');
rollback;
