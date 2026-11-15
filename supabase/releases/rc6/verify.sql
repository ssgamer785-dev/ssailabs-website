-- ============================================================================
-- RC6 VERIFY — READ ONLY. Run right AFTER applying the RC6 migration.
--
-- One SELECT. It writes nothing and its output has no names, e-mails, phone
-- numbers or ids. (It calls admin_delete_member once with two random ids that
-- belong to nobody: the function refuses at its first check, before any
-- write, which proves it is installed and guarded.)
--
-- Where: Supabase Dashboard -> SQL Editor, role selector left on "postgres".
--
-- Pass = every check row says OK, every fp_* row is IDENTICAL to the
-- preflight's, and no count_* row is lower than in the preflight.
-- If anything is off: run supabase/rollbacks/20261115090000_rc6_….rollback.sql
-- and do not promote the new deployment.
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
  fn(sig, oid) as (
    select s, to_regprocedure(s) from (values
      ('public.create_poll_post_with_image(public.post_channel, text, text[], boolean, jsonb)'),
      ('public.admin_delete_member(uuid, uuid)'),
      ('public.guard_profile_deletion_columns()'),
      ('public.guard_message_reply()')
    ) v(s)
  ),
  checks(ord, check_name, result, detail) as (
    select 1, 'functions_installed',
           case when count(*) filter (where oid is null) = 0 then 'OK' else 'FAIL' end,
           coalesce('missing: ' || string_agg(sig, ', ') filter (where oid is null), 'all 4 present')
      from fn
    union all
    select 2, 'admin_delete_member_security',
           case when p.prosecdef and p.proconfig @> array['search_path=""'] then 'OK' else 'FAIL' end,
           'SECURITY DEFINER with an empty search_path'
      from pg_proc p where p.oid = to_regprocedure('public.admin_delete_member(uuid, uuid)')
    union all
    select 3, 'admin_delete_member_server_only',
           case when not has_function_privilege('anon', 'public.admin_delete_member(uuid, uuid)', 'EXECUTE')
                 and not has_function_privilege('authenticated', 'public.admin_delete_member(uuid, uuid)', 'EXECUTE')
                 and has_function_privilege('service_role', 'public.admin_delete_member(uuid, uuid)', 'EXECUTE')
                then 'OK' else 'FAIL' end,
           'only service_role (the server) may call it; anon and signed-in members may not'
    union all
    select 4, 'admin_delete_member_refuses_strangers',
           case when public.admin_delete_member(gen_random_uuid(), gen_random_uuid()) ->> 'reason' = 'not_admin' then 'OK' else 'FAIL' end,
           'an unknown caller is refused before anything is written'
    union all
    select 5, 'poll_image_function_access',
           case when not p.prosecdef
                 and has_function_privilege('authenticated', p.oid, 'EXECUTE')
                 and not has_function_privilege('anon', p.oid, 'EXECUTE') then 'OK' else 'FAIL' end,
           'runs as the signed-in member (their own rules apply); not callable signed out'
      from pg_proc p where p.oid = to_regprocedure('public.create_poll_post_with_image(public.post_channel, text, text[], boolean, jsonb)')
    union all
    select 6, 'reply_guard_runs_as_sender',
           case when not p.prosecdef then 'OK' else 'FAIL' end,
           'the reply check runs as the sender, so it can only see messages they can read'
      from pg_proc p where p.oid = to_regprocedure('public.guard_message_reply()')
    union all
    select 7, 'new_columns',
           case when (select format_type(atttypid, atttypmod) from pg_attribute where attrelid = 'public.profiles'::regclass and attname = 'deleted_at' and not attisdropped) = 'timestamp with time zone'
                 and (select format_type(atttypid, atttypmod) from pg_attribute where attrelid = 'public.profiles'::regclass and attname = 'deleted_by' and not attisdropped) = 'uuid'
                 and (select format_type(atttypid, atttypmod) from pg_attribute where attrelid = 'public.messages'::regclass and attname = 'reply_to_id' and not attisdropped) = 'uuid'
                then 'OK' else 'FAIL' end,
           'profiles.deleted_at, profiles.deleted_by, messages.reply_to_id (all nullable, no default)'
    union all
    select 8, 'triggers_enabled',
           case when (select count(*) from pg_trigger
                       where (tgrelid, tgname) in (('public.profiles'::regclass, 'profiles_guard_deletion'), ('public.messages'::regclass, 'messages_guard_reply'))
                         and tgenabled = 'O') = 2 then 'OK' else 'FAIL' end,
           'profiles_guard_deletion, messages_guard_reply'
    union all
    select 9, 'reply_index',
           case when to_regclass('public.messages_reply_to_idx') is not null then 'OK' else 'FAIL' end,
           'messages_reply_to_idx'
    union all
    select 10, 'audit_log_locked_down',
           case when c.relrowsecurity
                 and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'admin_audit_events' and policyname = 'admin_audit_events_select_admin')
                 and not has_table_privilege('anon', c.oid, 'SELECT')
                 and not has_table_privilege('authenticated', c.oid, 'INSERT')
                 and not has_table_privilege('authenticated', c.oid, 'UPDATE')
                 and not has_table_privilege('authenticated', c.oid, 'DELETE')
                 and has_table_privilege('service_role', c.oid, 'INSERT')
                then 'OK' else 'FAIL' end,
           'RLS on; only admins can read it; only the server can write it'
      from pg_class c where c.oid = to_regclass('public.admin_audit_events')
    union all
    select 11, 'no_member_deleted_yet',
           case when (select count(*) from public.profiles where deleted_at is not null) = 0 then 'OK' else 'CHECK' end,
           (select count(*) from public.profiles where deleted_at is not null)::text || ' deleted profile(s) — 0 expected right after applying'
    union all
    select 12, 'no_row_changed',
           case when (select count(*) from public.messages where reply_to_id is not null) = 0
                 and (select count(*) from public.admin_audit_events) = 0 then 'OK' else 'CHECK' end,
           'no message has a reply link and the audit log is empty (expected right after applying)'
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
