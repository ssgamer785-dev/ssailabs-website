-- ============================================================================
-- Deployment inventory.
--
-- The behaviour suites prove the logic works. This one proves the migration
-- chain actually *deploys* everything that logic depends on: RLS turned on and
-- policed, the RPCs the client calls, the indexes its queries assume, Realtime
-- publication membership and replica identity, the triggers, and the two
-- constants the product is specified in terms of.
--
-- Every check prints PASS or FAIL and names what is missing.
-- ============================================================================
\pset pager off
set client_min_messages = warning;

\echo '--- 1. RLS is enabled on every public table'
select case when count(*) = 0 then 'PASS' else 'FAIL: ' || string_agg(tablename, ', ') end as rls_enabled
from pg_tables where schemaname = 'public' and not rowsecurity;

\echo '--- 2. every table is actually policed (RLS on with no policy denies all)'
select case when count(*) = 0 then 'PASS' else 'FAIL: no policies on ' || string_agg(tablename, ', ') end as policed
from pg_tables t
where t.schemaname = 'public'
  and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t.tablename);

\echo '--- 3. the tables the app expects all exist'
with expected(name) as (values
  ('profiles'), ('posts'), ('comments'), ('likes'), ('bookmarks'),
  ('conversations'), ('messages'), ('notifications'))
select case when count(*) = 0 then 'PASS' else 'FAIL missing: ' || string_agg(name, ', ') end as tables_present
from expected e
where not exists (select 1 from pg_tables t where t.schemaname = 'public' and t.tablename = e.name);

\echo '--- 4. every RPC the client calls is deployed'
with expected(name) as (values
  -- community + notifications
  ('posts_feed'), ('post_comments'), ('my_unread_notification_count'), ('mark_all_notifications_read'),
  -- chat
  ('get_or_create_my_conversation'), ('mark_conversation_read'), ('my_chat_overview'),
  -- chat media quota (server, service-role)
  ('select_chat_media_to_purge'), ('mark_chat_media_purged'), ('recalc_conversation_media_usage'),
  ('select_stale_pending_uploads'), ('delete_stale_pending_uploads'),
  -- community retention (server, service-role)
  ('community_retention_cutoff'), ('select_expired_post_media'), ('purge_expired_posts'), ('mark_post_media_purged'),
  -- role helper used throughout the policies
  ('is_admin'))
select case when count(*) = 0 then 'PASS' else 'FAIL missing: ' || string_agg(name, ', ') end as rpcs_present
from expected e
where not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = e.name);

\echo '--- 5. the indexes the paging queries assume are deployed'
with expected(name) as (values
  ('messages_conversation_paging_idx'),   -- keyset paging in a thread
  ('messages_client_id_key'),             -- idempotent sends
  ('messages_pending_uploads_idx'),       -- stale-upload sweep
  ('posts_channel_paging_idx'),           -- feed + Home paging
  ('comments_post_paging_idx'),           -- comment paging
  ('comments_client_id_key'))
select case when count(*) = 0 then 'PASS' else 'FAIL missing: ' || string_agg(name, ', ') end as indexes_present
from expected e
where not exists (select 1 from pg_indexes i where i.schemaname = 'public' and i.indexname = e.name);

\echo '--- 6. Realtime publishes exactly the tables the app subscribes to'
with expected(name) as (values ('messages'), ('posts'), ('comments'), ('likes'), ('notifications'))
select case when count(*) = 0 then 'PASS' else 'FAIL missing: ' || string_agg(name, ', ') end as realtime_published
from expected e
where not exists (
  select 1 from pg_publication_tables pt
  where pt.pubname = 'supabase_realtime' and pt.tablename = e.name);

\echo '--- 7. private tables are NOT published to Realtime'
with private_tables(name) as (values ('bookmarks'), ('profiles'), ('conversations'))
select case when count(*) = 0 then 'PASS' else 'FAIL leaking: ' || string_agg(name, ', ') end as realtime_scope
from private_tables p
where exists (
  select 1 from pg_publication_tables pt
  where pt.pubname = 'supabase_realtime' and pt.tablename = p.name);

\echo '--- 8. replica identity full where UPDATE/DELETE events need the old row'
with expected(name) as (values ('messages'), ('posts'), ('comments'), ('likes'))
select case when count(*) = 0 then 'PASS' else 'FAIL: ' || string_agg(name, ', ') end as replica_identity
from expected e
join pg_class c on c.relname = e.name
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where c.relreplident <> 'f';

\echo '--- 9. the guard and bookkeeping triggers are attached'
with expected(name) as (values
  ('messages_guard_update'),          -- who may change what on a message
  ('messages_scrub_deleted'),         -- soft delete really clears content
  ('messages_sync_media_usage'),      -- the 100 MB counter
  ('messages_notify'),                -- chat notification on a complete row
  ('messages_notify_upload_complete'),-- ...and on pending -> ready
  ('posts_guard_channel'),            -- only admins post to Official
  ('posts_snapshot_display_name'),    -- the Unknown User model
  ('comments_snapshot_display_name'),
  ('profiles_guard_role'))            -- no self-promotion to admin
select case when count(*) = 0 then 'PASS' else 'FAIL missing: ' || string_agg(name, ', ') end as triggers_present
from expected e
where not exists (
  select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not t.tgisinternal and t.tgname = e.name);

\echo '--- 10. message kinds cover every attachment the chat can send'
with expected(label) as (values ('text'), ('image'), ('pdf'), ('voice'), ('video'))
select case when count(*) = 0 then 'PASS' else 'FAIL missing: ' || string_agg(label, ', ') end as message_kinds
from expected e
where not exists (
  select 1 from pg_type t join pg_enum en on en.enumtypid = t.oid
  where t.typname = 'message_kind' and en.enumlabel = e.label);

\echo '--- 11. the retention window is 6 months, unchanged'
select case
  when (now() - public.community_retention_cutoff()) between interval '179 days' and interval '185 days'
  then 'PASS (' || (now() - public.community_retention_cutoff())::text || ')'
  else 'FAIL: window is ' || (now() - public.community_retention_cutoff())::text
end as retention_window;

\echo '--- 12. the media quota columns the 100 MB rule is enforced through'
with expected(tbl, col) as (values
  ('conversations', 'media_bytes_used'),
  ('messages', 'size_bytes'), ('messages', 'poster_size_bytes'),
  ('messages', 'storage_key'), ('messages', 'poster_key'),
  ('messages', 'media_purged'), ('messages', 'upload_status'),
  ('posts', 'storage_key'), ('posts', 'poster_key'), ('posts', 'media_purged'))
select case when count(*) = 0 then 'PASS' else 'FAIL missing: ' || string_agg(tbl || '.' || col, ', ') end as quota_columns
from expected e
where not exists (
  select 1 from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = e.tbl and c.column_name = e.col);

\echo '--- 13. upload_status is constrained to the two states the flow uses'
select case when count(*) = 1 then 'PASS' else 'FAIL: constraint missing' end as upload_status_check
from pg_constraint
where conrelid = 'public.messages'::regclass and conname = 'messages_upload_status_check';

\echo '--- 14. every SECURITY DEFINER function pins its search_path'
select case when count(*) = 0 then 'PASS' else 'FAIL: ' || string_agg(proname, ', ') end as definer_search_path
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
  and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%');
