-- ============================================================================
-- RC6 PREFLIGHT — READ ONLY. Run BEFORE applying the RC6 migration.
--
-- One SELECT. It writes nothing, locks nothing beyond ordinary reads, and its
-- output has no names, e-mails, phone numbers or ids: only checks, counts and
-- fingerprints (md5 hashes of the schema).
--
-- Where: Supabase Dashboard -> SQL Editor, role selector left on "postgres".
-- Keep the whole output (Download CSV or copy it): the fp_* rows must match
-- verify.sql exactly after the migration, and no count_* row may go down.
--
-- Go ahead only if no row says STOP. A CHECK row needs a human look first.
-- ============================================================================
with
  -- Fingerprints of everything this release must NOT change. Identical before
  -- and after: compare the "fp_*" rows of preflight.sql and verify.sql.
  fp as (
    select
      (select md5(coalesce(string_agg(p.oid::regprocedure::text || '=' || md5(pg_get_functiondef(p.oid)), ',' order by p.oid::regprocedure::text), ''))
         from pg_proc p
        where p.pronamespace = 'public'::regnamespace and p.prokind in ('f', 'p')
          and p.proname not in ('create_poll_post_with_image', 'admin_delete_member', 'guard_profile_deletion_columns', 'guard_message_reply')
          and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')) as functions,
      (select md5(coalesce(string_agg(format('%s.%s.%s.%s.%s.%s', tablename, policyname, cmd, roles::text, coalesce(qual, ''), coalesce(with_check, '')), ',' order by tablename, policyname), ''))
         from pg_policies where schemaname = 'public' and tablename <> 'admin_audit_events') as policies,
      (select md5(coalesce(string_agg(pg_get_triggerdef(t.oid), ',' order by t.tgrelid::regclass::text, t.tgname), ''))
         from pg_trigger t join pg_class c on c.oid = t.tgrelid
        where c.relnamespace = 'public'::regnamespace and not t.tgisinternal
          and t.tgname not in ('profiles_guard_deletion', 'messages_guard_reply')) as triggers,
      (select md5(coalesce(string_agg(format('%s.%s.%s.%s.%s', table_name, column_name, data_type, is_nullable, coalesce(column_default, '')), ',' order by table_name, ordinal_position), ''))
         from information_schema.columns
        where table_schema = 'public' and table_name <> 'admin_audit_events'
          and (table_name, column_name) not in (('profiles', 'deleted_at'), ('profiles', 'deleted_by'), ('messages', 'reply_to_id'))) as columns,
      (select md5(coalesce(string_agg(format('%s.%s.%s', table_name, grantee, privilege_type), ',' order by table_name, grantee, privilege_type), ''))
         from information_schema.role_table_grants
        where table_schema = 'public' and table_name <> 'admin_audit_events') as table_grants,
      (select md5(coalesce(string_agg(format('%s.%s', indexrelid::regclass::text, pg_get_indexdef(indexrelid)), ',' order by indexrelid::regclass::text), ''))
         from pg_index i join pg_class c on c.oid = i.indrelid
        where c.relnamespace = 'public'::regnamespace and c.relname <> 'admin_audit_events'
          and indexrelid::regclass::text not in ('messages_reply_to_idx', 'public.messages_reply_to_idx')) as indexes
  ),
  -- Row counts only: no names, e-mails, phone numbers or ids. Live members can
  -- add rows between the two runs; nothing should ever go DOWN.
  counts as (
    select * from (values
      ('count_profiles',               (select count(*) from public.profiles)),
      ('count_admins',                 (select count(*) from public.profiles where role = 'admin')),
      ('count_activated_profiles',     (select count(*) from public.profiles where activated_at is not null)),
      ('count_posts',                  (select count(*) from public.posts)),
      ('count_poll_posts',             (select count(*) from public.posts where attachment::text = 'poll')),
      ('count_poll_votes',             (select count(*) from public.poll_votes)),
      ('count_post_media',             (select count(*) from public.post_media)),
      ('count_comments',               (select count(*) from public.comments)),
      ('count_likes',                  (select count(*) from public.likes)),
      ('count_conversations',          (select count(*) from public.conversations)),
      ('count_messages',               (select count(*) from public.messages)),
      ('count_push_subscriptions',     (select count(*) from public.push_subscriptions)),
      ('count_notifications',          (select count(*) from public.notifications)),
      ('count_notification_prefs',     (select count(*) from public.notification_preferences)),
      ('count_bookmarks',              (select count(*) from public.bookmarks)),
      ('count_membership_requests',    (select count(*) from public.membership_requests)),
      ('count_auth_users',             (select count(*) from auth.users))
    ) v(k, n)
  ),
  req_tables(t) as (
    values ('profiles'), ('posts'), ('comments'), ('likes'), ('poll_votes'), ('poll_options'), ('post_media'),
           ('conversations'), ('messages'), ('push_subscriptions'), ('notifications'),
           ('notification_preferences'), ('bookmarks'), ('media_upload_grants'), ('membership_requests')
  ),
  req_columns(t, c) as (
    values ('profiles', 'role'), ('profiles', 'activated_at'), ('profiles', 'full_name'), ('profiles', 'phone'),
           ('profiles', 'avatar_key'), ('profiles', 'avatar_url'), ('profiles', 'reveal_identity'),
           ('posts', 'author_id'), ('posts', 'display_name'), ('posts', 'is_anonymous'),
           ('comments', 'author_id'), ('comments', 'display_name'), ('comments', 'is_anonymous'),
           ('comments', 'reply_to_name'), ('comments', 'reply_to_comment_id'),
           ('notifications', 'user_id'), ('notifications', 'actor_id'), ('notifications', 'title'),
           ('notification_preferences', 'user_id'), ('bookmarks', 'user_id'), ('push_subscriptions', 'user_id'),
           ('messages', 'id'), ('messages', 'conversation_id'),
           ('post_media', 'post_id'), ('post_media', 'position'), ('post_media', 'kind'), ('post_media', 'storage_key'),
           ('post_media', 'width'), ('post_media', 'height'), ('post_media', 'mime_type')
  ),
  checks(ord, check_name, result, detail) as (
    select 1, 'database', 'INFO', 'PostgreSQL ' || current_setting('server_version') || case when pg_is_in_recovery() then ' (READ REPLICA)' else ' (primary)' end
    union all
    select 2, 'run_as_postgres', case when current_user = 'postgres' and not pg_is_in_recovery() then 'OK' else 'STOP' end,
           'running as ' || current_user || ' — the migration must be applied as postgres on the primary'
    union all
    select 3, 'required_tables',
           case when count(*) filter (where to_regclass('public.' || t) is null) = 0 then 'OK' else 'STOP' end,
           coalesce('missing: ' || string_agg(t, ', ') filter (where to_regclass('public.' || t) is null), 'all ' || count(*) || ' present')
      from req_tables
    union all
    select 4, 'required_columns',
           case when count(*) filter (where a.attname is null) = 0 then 'OK' else 'STOP' end,
           coalesce('missing: ' || string_agg(r.t || '.' || r.c, ', ') filter (where a.attname is null), 'all ' || count(*) || ' present')
      from req_columns r
      left join pg_attribute a on a.attrelid = to_regclass('public.' || r.t) and a.attname = r.c and not a.attisdropped
    union all
    select 5, 'required_functions',
           case when to_regprocedure('public.create_poll_post(public.post_channel, text, text[], boolean)') is not null
                 and to_regprocedure('public.is_admin(uuid)') is not null
                 and to_regprocedure('auth.uid()') is not null then 'OK' else 'STOP' end,
           'create_poll_post(post_channel, text, text[], boolean), is_admin(uuid), auth.uid()'
    union all
    select 6, 'post_media_upload_guard',
           case when exists (select 1 from pg_trigger where tgrelid = to_regclass('public.post_media') and tgname = 'post_media_guard_insert' and tgenabled <> 'D')
                then 'OK' else 'STOP' end,
           'poll pictures rely on the existing post_media_guard_insert trigger (own, server-issued uploads only)'
    union all
    select 7, 'previous_release_applied',
           case when to_regprocedure('public.notify_new_student_post()') is not null
                 and to_regprocedure('public.notification_wanted(uuid, text)') is not null then 'OK' else 'STOP' end,
           'RC5 and the 2026-10-07 notification migration are present (the base RC6 is written against)'
    union all
    select 8, 'exactly_one_admin',
           case when (select count(*) from public.profiles where role = 'admin') = 1 then 'OK' else 'CHECK' end,
           (select count(*) from public.profiles where role = 'admin')::text || ' admin profile(s); the app expects exactly one'
    union all
    select 9, 'new_column_profiles_deleted_at',
           case when a.attname is null then 'OK' when format_type(a.atttypid, a.atttypmod) = 'timestamp with time zone' then 'INFO' else 'STOP' end,
           case when a.attname is null then 'absent — will be added' else 'already present (' || format_type(a.atttypid, a.atttypmod) || ')' end
      from (select 1) one left join pg_attribute a on a.attrelid = 'public.profiles'::regclass and a.attname = 'deleted_at' and not a.attisdropped
    union all
    select 10, 'new_column_profiles_deleted_by',
           case when a.attname is null then 'OK' when format_type(a.atttypid, a.atttypmod) = 'uuid' then 'INFO' else 'STOP' end,
           case when a.attname is null then 'absent — will be added' else 'already present (' || format_type(a.atttypid, a.atttypmod) || ')' end
      from (select 1) one left join pg_attribute a on a.attrelid = 'public.profiles'::regclass and a.attname = 'deleted_by' and not a.attisdropped
    union all
    select 11, 'new_column_messages_reply_to_id',
           case when a.attname is null then 'OK' when format_type(a.atttypid, a.atttypmod) = 'uuid' then 'INFO' else 'STOP' end,
           case when a.attname is null then 'absent — will be added' else 'already present (' || format_type(a.atttypid, a.atttypmod) || ')' end
      from (select 1) one left join pg_attribute a on a.attrelid = 'public.messages'::regclass and a.attname = 'reply_to_id' and not a.attisdropped
    union all
    select 12, 'new_table_admin_audit_events',
           case when to_regclass('public.admin_audit_events') is null then 'OK'
                when (select count(*) from pg_attribute where attrelid = to_regclass('public.admin_audit_events')
                        and attname in ('id', 'created_at', 'actor_id', 'action', 'target_id', 'details') and not attisdropped) = 6 then 'INFO'
                else 'STOP' end,
           case when to_regclass('public.admin_audit_events') is null then 'absent — will be created'
                else 'already present — the migration ran before; re-running it is safe' end
    union all
    select 13, 'new_functions',
           case when count(*) = 0 then 'OK' else 'INFO' end,
           case when count(*) = 0 then 'none present yet — will be created'
                else count(*) || ' already present (' || string_agg(proname, ', ') || ') — re-running replaces them with the same code' end
      from pg_proc where pronamespace = 'public'::regnamespace
       and proname in ('create_poll_post_with_image', 'admin_delete_member', 'guard_profile_deletion_columns', 'guard_message_reply')
    union all
    select 14, 'long_running_transactions',
           case when count(*) = 0 then 'OK' else 'CHECK' end,
           count(*) || ' other session(s) with a transaction open for over 60 s (they could make the migration wait for its locks; it gives up after 5 s and changes nothing)'
      from pg_stat_activity where pid <> pg_backend_pid() and xact_start < now() - interval '60 seconds' and backend_type = 'client backend'
  )
select check_name, result, detail
  from (
    select ord, check_name, result, detail from checks
    union all select 100, 'fp_functions',    'INFO', functions    from fp
    union all select 101, 'fp_policies',     'INFO', policies     from fp
    union all select 102, 'fp_triggers',     'INFO', triggers     from fp
    union all select 103, 'fp_columns',      'INFO', columns      from fp
    union all select 104, 'fp_table_grants', 'INFO', table_grants from fp
    union all select 105, 'fp_indexes',      'INFO', indexes      from fp
    union all select 200, k, 'INFO', n::text from counts
  ) x
 order by ord, check_name;
