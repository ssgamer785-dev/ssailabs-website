-- ============================================================================
-- TRADING JOURNAL PREFLIGHT — READ ONLY. Run BEFORE applying the journal migration
-- (supabase/migrations/20261116090000_trading_journal.sql).
--
-- One SELECT. It writes nothing and its output has no names, e-mails, phone
-- numbers or ids: only checks, counts and fingerprints (md5 hashes of the schema).
--
-- Where: Supabase Dashboard -> SQL Editor, role selector left on "postgres".
-- Keep the whole output (Download CSV): the fp_* rows must match verify.sql
-- exactly after the migration, and no count_* row may go down.
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
          and p.proname not in ('guard_journal_trade', 'journal_summary')
          and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')) as functions,
      (select md5(coalesce(string_agg(format('%s.%s.%s.%s.%s.%s', tablename, policyname, cmd, roles::text, coalesce(qual, ''), coalesce(with_check, '')), ',' order by tablename, policyname), ''))
         from pg_policies where schemaname = 'public' and tablename <> 'journal_trades') as policies,
      (select md5(coalesce(string_agg(pg_get_triggerdef(t.oid), ',' order by t.tgrelid::regclass::text, t.tgname), ''))
         from pg_trigger t join pg_class c on c.oid = t.tgrelid
        where c.relnamespace = 'public'::regnamespace and not t.tgisinternal
          and c.relname <> 'journal_trades') as triggers,
      (select md5(coalesce(string_agg(format('%s.%s.%s.%s.%s', table_name, column_name, data_type, is_nullable, coalesce(column_default, '')), ',' order by table_name, ordinal_position), ''))
         from information_schema.columns
        where table_schema = 'public' and table_name <> 'journal_trades') as columns,
      (select md5(coalesce(string_agg(format('%s.%s.%s', table_name, grantee, privilege_type), ',' order by table_name, grantee, privilege_type), ''))
         from information_schema.role_table_grants
        where table_schema = 'public' and table_name <> 'journal_trades') as table_grants,
      (select md5(coalesce(string_agg(format('%s.%s', indexrelid::regclass::text, pg_get_indexdef(indexrelid)), ',' order by indexrelid::regclass::text), ''))
         from pg_index i join pg_class c on c.oid = i.indrelid
        where c.relnamespace = 'public'::regnamespace and c.relname <> 'journal_trades') as indexes
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
      ('count_deleted_members',        (select count(*) from public.profiles where deleted_at is not null)),
      ('count_admin_audit_events',     (select count(*) from public.admin_audit_events)),
      ('count_auth_users',             (select count(*) from auth.users))
    ) v(k, n)
  ),
  checks(ord, check_name, result, detail) as (
    select 1, 'database', 'INFO', 'PostgreSQL ' || current_setting('server_version') || case when pg_is_in_recovery() then ' (READ REPLICA)' else ' (primary)' end
    union all
    select 2, 'run_as_postgres', case when current_user = 'postgres' and not pg_is_in_recovery() then 'OK' else 'STOP' end,
           'running as ' || current_user || ' — the migration must be applied as postgres on the primary'
    union all
    select 3, 'profiles_table', case when to_regclass('public.profiles') is not null
                                       and exists (select 1 from pg_attribute where attrelid = 'public.profiles'::regclass and attname = 'id' and atttypid = 'uuid'::regtype)
                                     then 'OK' else 'STOP' end,
           'public.profiles(id uuid): the journal belongs to a profile'
    union all
    select 4, 'required_functions',
           case when to_regprocedure('public.is_activated(uuid)') is not null and to_regprocedure('auth.uid()') is not null then 'OK' else 'STOP' end,
           'is_activated(uuid), auth.uid()'
    union all
    select 5, 'previous_release_applied',
           case when to_regprocedure('public.admin_delete_member(uuid, uuid)') is not null
                 and exists (select 1 from pg_attribute where attrelid = 'public.messages'::regclass and attname = 'reply_to_id' and not attisdropped)
                then 'OK' else 'STOP' end,
           'RC6 (poll pictures, Delete member, chat replies) is in place: the base this release is written against'
    union all
    select 6, 'journal_table',
           case when to_regclass('public.journal_trades') is null then 'OK'
                when (select count(*) from pg_attribute where attrelid = to_regclass('public.journal_trades') and not attisdropped and attnum > 0
                        and attname in ('id', 'user_id', 'trade_date', 'symbol', 'direction', 'risk_reward', 'result', 'pnl_amount', 'pnl_currency',
                                        'strategy', 'mistakes', 'followed_plan', 'notes', 'screenshot_key', 'screenshot_mime', 'screenshot_width',
                                        'screenshot_height', 'created_at', 'updated_at')) = 19 then 'INFO'
                else 'STOP' end,
           case when to_regclass('public.journal_trades') is null then 'absent — will be created'
                else 'already present — the migration ran before; re-running it is safe' end
    union all
    select 7, 'journal_functions',
           case when count(*) = 0 then 'OK' else 'INFO' end,
           case when count(*) = 0 then 'none present yet — will be created'
                else count(*) || ' already present (' || string_agg(proname, ', ') || ') — re-running replaces them with the same code' end
      from pg_proc where pronamespace = 'public'::regnamespace and proname in ('guard_journal_trade', 'journal_summary')
    union all
    select 8, 'long_running_transactions',
           case when count(*) = 0 then 'OK' else 'CHECK' end,
           count(*) || ' other session(s) with a transaction open for over 60 s (the new table''s link to profiles briefly locks profiles; the migration gives up after 5 s and changes nothing)'
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
