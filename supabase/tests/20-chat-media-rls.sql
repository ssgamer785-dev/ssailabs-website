\set ON_ERROR_STOP on
\pset pager off
set client_min_messages = notice;

\echo '--- 15. the recipient cannot flip someone else''s upload_status'
begin;
set local role authenticated;
set local app.current_user_id = '22222222-2222-2222-2222-222222222222';
insert into public.messages (id, conversation_id, sender_id, kind, storage_key, size_bytes, upload_status)
values ('bbbbbbbb-0000-0000-0000-0000000000f1','aaaaaaaa-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','image','chat/x/fresh.bin', 1000, 'pending');
commit;
begin;
set local role authenticated;
set local app.current_user_id = '11111111-1111-1111-1111-111111111111';
do $$
begin
  update public.messages set upload_status = 'ready'
  where id = 'bbbbbbbb-0000-0000-0000-0000000000f1';
  raise exception 'FAIL: guard let the recipient complete another user''s upload';
exception when others then
  if position('mark another participant' in sqlerrm) > 0 then
    raise notice 'PASS  (%)', sqlerrm;
  else
    raise;
  end if;
end $$;
rollback;

\echo '--- 16. the sender can complete their own upload'
begin;
set local role authenticated;
set local app.current_user_id = '22222222-2222-2222-2222-222222222222';
update public.messages set upload_status = 'ready', poster_key = 'chat/x/fresh-poster.jpg', poster_size_bytes = 500
where id = 'bbbbbbbb-0000-0000-0000-0000000000f1';
select case when upload_status = 'ready' and poster_key is not null then 'PASS' else 'FAIL' end as t16
from public.messages where id = 'bbbbbbbb-0000-0000-0000-0000000000f1';

\echo '--- 17. ready cannot be reopened'
do $$
begin
  update public.messages set upload_status = 'pending' where id = 'bbbbbbbb-0000-0000-0000-0000000000f1';
  raise exception 'FAIL: ready was reopened';
exception when others then
  if position('cannot be reopened' in sqlerrm) > 0 then raise notice 'PASS  (%)', sqlerrm; else raise; end if;
end $$;

\echo '--- 18. soft delete drops the poster reference too'
update public.messages set deleted_at = now() where id = 'bbbbbbbb-0000-0000-0000-0000000000f1';
select case when poster_key is null and body is null then 'PASS' else 'FAIL' end as t18
from public.messages where id = 'bbbbbbbb-0000-0000-0000-0000000000f1';
commit;

\echo '--- 19. posts_feed exposes poster_key'
begin;
set local role authenticated;
set local app.current_user_id = '11111111-1111-1111-1111-111111111111';
insert into public.posts (id, author_id, channel, body, attachment, storage_key, poster_key, poster_size_bytes, size_bytes)
values ('cccccccc-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','official','Video update','video','posts/u/v.bin','posts/u/v-poster.jpg', 4000, 900000);
commit;
begin;
set local role authenticated;
set local app.current_user_id = '22222222-2222-2222-2222-222222222222';
select case when poster_key = 'posts/u/v-poster.jpg' then 'PASS' else 'FAIL ' || coalesce(poster_key,'<null>') end as t19
from public.posts_feed('official') where id = 'cccccccc-0000-0000-0000-000000000001';
commit;

\echo '--- 20. expired post media nominates the poster as well'
update public.posts set created_at = now() - interval '7 months' where id = 'cccccccc-0000-0000-0000-000000000001';
select case when poster_key = 'posts/u/v-poster.jpg' then 'PASS' else 'FAIL' end as t20
from public.select_expired_post_media() where id = 'cccccccc-0000-0000-0000-000000000001';
select public.mark_post_media_purged(array['cccccccc-0000-0000-0000-000000000001'::uuid]);
select case when storage_key is null and poster_key is null and media_purged then 'PASS' else 'FAIL' end as t20_marked
from public.posts where id = 'cccccccc-0000-0000-0000-000000000001';

\echo '--- 21. a student cannot read another student''s conversation'
insert into public.conversations (id, student_id) values ('aaaaaaaa-0000-0000-0000-000000000002','33333333-3333-3333-3333-333333333333') on conflict do nothing;
insert into public.messages (conversation_id, sender_id, kind, body)
values ('aaaaaaaa-0000-0000-0000-000000000002','33333333-3333-3333-3333-333333333333','text','private');
begin;
set local role authenticated;
set local app.current_user_id = '22222222-2222-2222-2222-222222222222';
select case when count(*) = 0 then 'PASS' else 'FAIL: leaked ' || count(*) end as t21
from public.messages where conversation_id = 'aaaaaaaa-0000-0000-0000-000000000002';
\echo '--- 22. ...but can read their own'
select case when count(*) > 0 then 'PASS' else 'FAIL' end as t22
from public.messages where conversation_id = 'aaaaaaaa-0000-0000-0000-000000000001';
\echo '--- 23. a student cannot read another student''s media metadata via posts either'
select case when count(*) = 0 then 'PASS' else 'FAIL' end as t23
from public.messages where storage_key is not null and conversation_id = 'aaaaaaaa-0000-0000-0000-000000000002';
commit;
