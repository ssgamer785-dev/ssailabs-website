\set ON_ERROR_STOP on
\pset pager off
set client_min_messages = warning;

-- ---------------------------------------------------------------- fixtures
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'admin@tp.test'),
  ('22222222-2222-2222-2222-222222222222', 'student@tp.test'),
  ('33333333-3333-3333-3333-333333333333', 'other@tp.test');

insert into public.profiles (id, full_name, role) values
  ('11111111-1111-1111-1111-111111111111', 'The Admin', 'admin'),
  ('22222222-2222-2222-2222-222222222222', 'Rahul S', 'student'),
  ('33333333-3333-3333-3333-333333333333', 'Other Student', 'student')
on conflict (id) do update set role = excluded.role;

insert into public.conversations (id, student_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222');

\echo '--- 1. poster bytes count toward media usage'
insert into public.messages (id, conversation_id, sender_id, kind, storage_key, size_bytes, poster_key, poster_size_bytes, created_at)
values ('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','video','chat/x/v1.bin', 10000000, 'chat/x/v1-poster.jpg', 50000, now() - interval '10 days');
select case when media_bytes_used = 10050000 then 'PASS' else 'FAIL ' || media_bytes_used end as t1
from public.conversations where id = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '--- 2. text messages do not count'
insert into public.messages (conversation_id, sender_id, kind, body, created_at)
values ('aaaaaaaa-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','text','hello', now() - interval '9 days');
select case when media_bytes_used = 10050000 then 'PASS' else 'FAIL ' || media_bytes_used end as t2
from public.conversations where id = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '--- 3. fill to 92 MB, then ask room for a 20 MB video (the brief example)'
-- existing 10.05 MB + three more so total is ~92 MB
insert into public.messages (id, conversation_id, sender_id, kind, storage_key, size_bytes, created_at) values
  ('bbbbbbbb-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','image','chat/x/i2.bin', 30000000, now() - interval '8 days'),
  ('bbbbbbbb-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','pdf','chat/x/d3.pdf', 25000000, now() - interval '7 days'),
  ('bbbbbbbb-0000-0000-0000-000000000004','aaaaaaaa-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','voice','chat/x/a4.webm', 31400000, now() - interval '6 days');
select case when media_bytes_used between 96000000 and 97000000 then 'PASS (' || media_bytes_used || ')' else 'FAIL ' || media_bytes_used end as t3_usage
from public.conversations where id = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '--- 4. purge selection is oldest-first and stops as soon as it fits'
select string_agg(storage_key, ' -> ' order by ord) as victims_in_order
from (select row_number() over () as ord, storage_key
      from public.select_chat_media_to_purge('aaaaaaaa-0000-0000-0000-000000000001', 104857600, 20000000)) s;

\echo '--- 5. the poster of a purged video is nominated with it'
select case when poster_key = 'chat/x/v1-poster.jpg' then 'PASS' else 'FAIL ' || coalesce(poster_key,'<null>') end as t5
from public.select_chat_media_to_purge('aaaaaaaa-0000-0000-0000-000000000001', 104857600, 20000000) limit 1;

\echo '--- 6. marking purged clears both objects and recalculates'
select public.mark_chat_media_purged(array(
  select id from public.select_chat_media_to_purge('aaaaaaaa-0000-0000-0000-000000000001', 104857600, 20000000)));
select case when media_bytes_used + 20000000 <= 104857600 then 'PASS (' || media_bytes_used || ' + 20MB fits)' else 'FAIL ' || media_bytes_used end as t6
from public.conversations where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select case when storage_key is null and poster_key is null and size_bytes = 0 and poster_size_bytes = 0 and media_purged
            then 'PASS' else 'FAIL' end as t6_row
from public.messages where id = 'bbbbbbbb-0000-0000-0000-000000000001';

\echo '--- 7. text messages survived the purge untouched'
select case when count(*) = 1 then 'PASS' else 'FAIL ' || count(*) end as t7
from public.messages where conversation_id = 'aaaaaaaa-0000-0000-0000-000000000001' and kind = 'text' and body = 'hello';

\echo '--- 8. nothing is purged while the conversation fits'
select case when count(*) = 0 then 'PASS' else 'FAIL ' || count(*) end as t8
from public.select_chat_media_to_purge('aaaaaaaa-0000-0000-0000-000000000001', 104857600, 0);

\echo '--- 9. an in-flight (pending) upload is never chosen as a victim'
insert into public.messages (id, conversation_id, sender_id, kind, storage_key, size_bytes, upload_status, created_at)
values ('bbbbbbbb-0000-0000-0000-000000000009','aaaaaaaa-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','video','chat/x/inflight.bin', 40000000, 'pending', now() - interval '100 days');
select case when count(*) = 0 then 'PASS' else 'FAIL: pending row nominated' end as t9
from public.select_chat_media_to_purge('aaaaaaaa-0000-0000-0000-000000000001', 104857600, 90000000) where id = 'bbbbbbbb-0000-0000-0000-000000000009';

\echo '--- 10. pending bytes still reserve quota space'
select case when media_bytes_used > 40000000 then 'PASS (' || media_bytes_used || ')' else 'FAIL ' || media_bytes_used end as t10
from public.conversations where id = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '--- 11. stale pending uploads are swept'
select case when count(*) = 1 then 'PASS' else 'FAIL ' || count(*) end as t11_selected
from public.select_stale_pending_uploads();
select case when public.delete_stale_pending_uploads(array(select id from public.select_stale_pending_uploads())) = 1
            then 'PASS' else 'FAIL' end as t11_deleted;
select case when count(*) = 0 then 'PASS' else 'FAIL' end as t11_gone
from public.messages where id = 'bbbbbbbb-0000-0000-0000-000000000009';

\echo '--- 12. a fresh pending upload is NOT swept'
insert into public.messages (id, conversation_id, sender_id, kind, storage_key, size_bytes, upload_status)
values ('bbbbbbbb-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','image','chat/x/fresh.bin', 1000, 'pending');
select case when count(*) = 0 then 'PASS' else 'FAIL' end as t12 from public.select_stale_pending_uploads();

\echo '--- 13. notification fires on completion, not on the pending insert'
delete from public.notifications;
insert into public.messages (id, conversation_id, sender_id, kind, storage_key, size_bytes, upload_status)
values ('bbbbbbbb-0000-0000-0000-00000000000b','aaaaaaaa-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','image','chat/x/n.bin', 1000, 'pending');
select case when count(*) = 0 then 'PASS' else 'FAIL: notified too early' end as t13_pending from public.notifications;
update public.messages set upload_status = 'ready' where id = 'bbbbbbbb-0000-0000-0000-00000000000b';
select case when count(*) = 1 then 'PASS' else 'FAIL ' || count(*) end as t13_ready from public.notifications;

\echo '--- 14. a plain text message still notifies immediately'
delete from public.notifications;
insert into public.messages (conversation_id, sender_id, kind, body)
values ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','text','from admin');
select case when count(*) = 1 then 'PASS' else 'FAIL ' || count(*) end as t14 from public.notifications;

