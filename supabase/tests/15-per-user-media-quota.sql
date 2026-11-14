\set ON_ERROR_STOP on
\pset pager off
set client_min_messages = warning;

-- The 100 MB allowance belongs to a user, not to a thread. These checks cover
-- the case the per-conversation version got wrong: a student's thread also
-- holds the admin's uploads, so evicting "the thread's oldest media" could
-- delete the other party's file.
--
-- Runs after 10-, in the same database, so every id here is distinct from that
-- suite's fixtures.

-- ---------------------------------------------------------------- fixtures
insert into auth.users (id, email) values
  ('55555555-5555-5555-5555-555555555555', 'quota-admin@tp.test'),
  ('66666666-6666-6666-6666-666666666666', 'quota-a@tp.test'),
  ('77777777-7777-7777-7777-777777777777', 'quota-b@tp.test');

insert into public.profiles (id, full_name, role) values
  ('55555555-5555-5555-5555-555555555555', 'Quota Admin', 'admin'),
  ('66666666-6666-6666-6666-666666666666', 'Student A', 'student'),
  ('77777777-7777-7777-7777-777777777777', 'Student B', 'student')
on conflict (id) do update set role = excluded.role;

insert into public.conversations (id, student_id) values
  ('cccccccc-0000-0000-0000-00000000000a', '66666666-6666-6666-6666-666666666666'),
  ('cccccccc-0000-0000-0000-00000000000b', '77777777-7777-7777-7777-777777777777');

\echo '--- 1. usage is attributed to the sender, not to the thread'
-- Student A's thread: 40 MB from A, 30 MB from the admin.
insert into public.messages (id, conversation_id, sender_id, kind, storage_key, size_bytes, upload_status, created_at) values
  ('dddddddd-0000-0000-0000-00000000000a','cccccccc-0000-0000-0000-00000000000a','66666666-6666-6666-6666-666666666666','image','chat/a/a1.bin', 40000000,'ready', now() - interval '10 days'),
  ('dddddddd-0000-0000-0000-00000000000b','cccccccc-0000-0000-0000-00000000000a','55555555-5555-5555-5555-555555555555','pdf','chat/a/adm1.pdf', 30000000,'ready', now() - interval '9 days');
select case when (select media_bytes_used from public.profiles where id = '66666666-6666-6666-6666-666666666666') = 40000000
            and (select media_bytes_used from public.profiles where id = '55555555-5555-5555-5555-555555555555') = 30000000
            and (select media_bytes_used from public.conversations where id = 'cccccccc-0000-0000-0000-00000000000a') = 70000000
       then 'PASS (A=40MB, admin=30MB, thread=70MB)'
       else 'FAIL A=' || (select media_bytes_used from public.profiles where id = '66666666-6666-6666-6666-666666666666')
            || ' admin=' || (select media_bytes_used from public.profiles where id = '55555555-5555-5555-5555-555555555555') end as t1;

\echo '--- 2. a user''s usage spans every thread they upload into'
insert into public.messages (id, conversation_id, sender_id, kind, storage_key, size_bytes, upload_status, created_at) values
  ('dddddddd-0000-0000-0000-00000000000c','cccccccc-0000-0000-0000-00000000000b','55555555-5555-5555-5555-555555555555','image','chat/b/adm2.bin', 25000000,'ready', now() - interval '8 days');
select case when media_bytes_used = 55000000 then 'PASS (admin 30MB + 25MB across two threads)'
            else 'FAIL ' || media_bytes_used end as t2
from public.profiles where id = '55555555-5555-5555-5555-555555555555';

\echo '--- 3. THE REGRESSION: making room for Student A never nominates the admin''s file'
-- A is at 40 MB and wants 70 MB more. The thread's oldest row overall is A's,
-- but the admin's 30 MB row sits in the same thread — it must not be eligible.
select case when count(*) filter (where storage_key like 'chat/a/adm%') = 0
       then 'PASS (no admin-owned victim)'
       else 'FAIL nominated ' || string_agg(storage_key, ',') end as t3
from public.select_user_media_to_purge('66666666-6666-6666-6666-666666666666', 104857600, 70000000);

\echo '--- 4. ...and the admin''s stored bytes are untouched by A''s purge'
select case when media_bytes_used = 55000000 then 'PASS (admin still 55MB)'
            else 'FAIL ' || media_bytes_used end as t4
from public.profiles where id = '55555555-5555-5555-5555-555555555555';

\echo '--- 5. oldest-first within the user, stopping as soon as it fits'
insert into public.messages (id, conversation_id, sender_id, kind, storage_key, size_bytes, upload_status, created_at) values
  ('dddddddd-0000-0000-0000-00000000000d','cccccccc-0000-0000-0000-00000000000a','66666666-6666-6666-6666-666666666666','image','chat/a/a2.bin', 30000000,'ready', now() - interval '7 days'),
  ('dddddddd-0000-0000-0000-00000000000e','cccccccc-0000-0000-0000-00000000000a','66666666-6666-6666-6666-666666666666','image','chat/a/a3.bin', 30000000,'ready', now() - interval '6 days');
-- A now stores 100 MB exactly.
-- Freeing 35 MB needs only the single oldest row (40 MB), so the selection
-- must stop there rather than offering everything the user owns.
select case when string_agg(storage_key, ' -> ' order by ord) = 'chat/a/a1.bin'
            then 'PASS (oldest only: chat/a/a1.bin)'
            else 'FAIL ' || coalesce(string_agg(storage_key, ' -> ' order by ord), '<none>') end as t5
from (select row_number() over () as ord, storage_key
      from public.select_user_media_to_purge('66666666-6666-6666-6666-666666666666', 104857600, 35000000)) s;

\echo '--- 6. nothing is nominated while the user fits'
select case when count(*) = 0 then 'PASS' else 'FAIL ' || count(*) end as t6
from public.select_user_media_to_purge('77777777-7777-7777-7777-777777777777', 104857600, 1000);

\echo '--- 7. an in-flight upload reserves space but is never a victim'
insert into public.messages (id, conversation_id, sender_id, kind, storage_key, size_bytes, upload_status, created_at) values
  ('dddddddd-0000-0000-0000-00000000000f','cccccccc-0000-0000-0000-00000000000b','77777777-7777-7777-7777-777777777777','image','chat/b/b-pending.bin', 90000000,'pending', now() - interval '1 minute');
select case when (select media_bytes_used from public.profiles where id = '77777777-7777-7777-7777-777777777777') = 90000000
            and (select count(*) from public.select_user_media_to_purge('77777777-7777-7777-7777-777777777777', 104857600, 30000000)
                 where storage_key = 'chat/b/b-pending.bin') = 0
       then 'PASS (reserved, not evictable)'
       else 'FAIL' end as t7;

\echo '--- 8. purging recalculates every thread and every owner it touched'
-- Two of A's rows, deliberately from the same thread as the admin's file.
select public.mark_chat_media_purged(array[
  'dddddddd-0000-0000-0000-00000000000a'::uuid,
  'dddddddd-0000-0000-0000-00000000000d'::uuid]);
select case when (select media_bytes_used from public.profiles where id = '66666666-6666-6666-6666-666666666666') = 30000000
            and (select media_bytes_used from public.conversations where id = 'cccccccc-0000-0000-0000-00000000000a') = 60000000
            and (select media_bytes_used from public.profiles where id = '55555555-5555-5555-5555-555555555555') = 55000000
       then 'PASS (A=30MB, thread=60MB, admin untouched at 55MB)'
       else 'FAIL A=' || (select media_bytes_used from public.profiles where id = '66666666-6666-6666-6666-666666666666')
            || ' thread=' || (select media_bytes_used from public.conversations where id = 'cccccccc-0000-0000-0000-00000000000a')
            || ' admin=' || (select media_bytes_used from public.profiles where id = '55555555-5555-5555-5555-555555555555') end as t8;

\echo '--- 9. the purged rows survive as messages, only their media is gone'
select case when count(*) = 2 and count(*) filter (where storage_key is null and media_purged) = 2
       then 'PASS (rows kept, media stripped)' else 'FAIL' end as t9
from public.messages
where id in ('dddddddd-0000-0000-0000-00000000000a','dddddddd-0000-0000-0000-00000000000d');

\echo '--- 10. text messages are never eligible'
insert into public.messages (conversation_id, sender_id, kind, body, created_at)
values ('cccccccc-0000-0000-0000-00000000000a','66666666-6666-6666-6666-666666666666','text','still here', now() - interval '5 days');
select case when (select media_bytes_used from public.profiles where id = '66666666-6666-6666-6666-666666666666') = 30000000
            and (select count(*) from public.select_user_media_to_purge('66666666-6666-6666-6666-666666666666', 104857600, 100000000)
                 where storage_key is null) = 0
       then 'PASS' else 'FAIL' end as t10;

\echo '--- 11. the maintenance functions stay server-only'
select case when has_function_privilege('authenticated', p.oid, 'EXECUTE') then 'FAIL ' || p.proname else 'PASS ' || p.proname end as t11
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('recalc_user_media_usage', 'select_user_media_to_purge', 'mark_chat_media_purged')
order by p.proname;
