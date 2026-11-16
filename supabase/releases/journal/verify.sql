-- ============================================================================
-- TRADING JOURNAL VERIFY — READ ONLY. Run right AFTER applying the journal migration.
--
-- One SELECT. It writes nothing and its output has no names, e-mails, phone
-- numbers or ids. (It calls journal_summary() once: as postgres it has no
-- member of its own, so it reads nothing and answers zero.)
--
-- Where: Supabase Dashboard -> SQL Editor, role selector left on "postgres".
--
-- Pass = every check row says OK, every fp_* row is IDENTICAL to the
-- preflight's, and no count_* row is lower than in the preflight.
-- If anything is off: do not promote the new deployment; send both outputs.
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
  expected_checks(name) as (
    values ('journal_trades_date_sane'), ('journal_trades_symbol_len'), ('journal_trades_direction'), ('journal_trades_rr_range'),
           ('journal_trades_result'), ('journal_trades_pnl_pair'), ('journal_trades_pnl_currency'), ('journal_trades_pnl_sign'),
           ('journal_trades_pnl_range'), ('journal_trades_strategy_len'), ('journal_trades_mistakes_known'), ('journal_trades_plan_answer'),
           ('journal_trades_notes_len'), ('journal_trades_screenshot_own'), ('journal_trades_screenshot_mime'), ('journal_trades_screenshot_size'),
           ('journal_trades_screenshot_whole')
  ),
  checks(ord, check_name, result, detail) as (
    select 1, 'journal_table',
           case when (select count(*) from pg_attribute where attrelid = to_regclass('public.journal_trades') and attnum > 0 and not attisdropped) = 19 then 'OK' else 'FAIL' end,
           'public.journal_trades with its 19 columns'
    union all
    select 2, 'journal_rules',
           case when count(*) filter (where c.conname is null) = 0 then 'OK' else 'FAIL' end,
           coalesce('missing: ' || string_agg(e.name, ', ') filter (where c.conname is null), 'all 17 data rules in place')
      from expected_checks e
      left join pg_constraint c on c.conrelid = to_regclass('public.journal_trades') and c.conname = e.name and c.contype = 'c'
    union all
    select 3, 'owner_link',
           case when exists (select 1 from pg_constraint where conrelid = to_regclass('public.journal_trades') and contype = 'f'
                               and confrelid = 'public.profiles'::regclass and confdeltype = 'c') then 'OK' else 'FAIL' end,
           'each trade belongs to a profile (and goes with it)'
    union all
    select 4, 'private_to_owner',
           case when c.relrowsecurity
                 and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'journal_trades') = 4
                 and (select bool_and(coalesce(qual, '') ~ 'auth\.uid\(\)' or coalesce(with_check, '') ~ 'auth\.uid\(\)')
                        from pg_policies where schemaname = 'public' and tablename = 'journal_trades')
                 and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'journal_trades' and coalesce(qual, '') ~* 'is_admin')
                then 'OK' else 'FAIL' end,
           'RLS on; 4 policies, every one tied to the signed-in owner; no admin or open access'
      from pg_class c where c.oid = to_regclass('public.journal_trades')
    union all
    select 5, 'grants',
           case when not has_table_privilege('anon', 'public.journal_trades', 'SELECT')
                 and not has_table_privilege('anon', 'public.journal_trades', 'INSERT')
                 and has_table_privilege('authenticated', 'public.journal_trades', 'SELECT')
                 and has_table_privilege('authenticated', 'public.journal_trades', 'INSERT')
                 and not has_table_privilege('authenticated', 'public.journal_trades', 'TRUNCATE')
                 and has_table_privilege('service_role', 'public.journal_trades', 'DELETE')
                then 'OK' else 'FAIL' end,
           'signed-out visitors: nothing; members: through RLS only; the server: full'
    union all
    select 6, 'guard_trigger',
           case when exists (select 1 from pg_trigger where tgrelid = to_regclass('public.journal_trades') and tgname = 'journal_trades_guard' and tgenabled = 'O')
                then 'OK' else 'FAIL' end,
           'a trade keeps its owner and creation time; edits record their time'
    union all
    select 7, 'indexes',
           case when to_regclass('public.journal_trades_owner_date_idx') is not null and to_regclass('public.journal_trades_screenshot_key_idx') is not null
                then 'OK' else 'FAIL' end,
           'journal_trades_owner_date_idx, journal_trades_screenshot_key_idx (one picture, one trade)'
    union all
    select 8, 'summary_function',
           case when p.oid is not null and not p.prosecdef
                 and has_function_privilege('authenticated', p.oid, 'EXECUTE') and not has_function_privilege('anon', p.oid, 'EXECUTE')
                 and (public.journal_summary() ->> 'total')::int = 0
                then 'OK' else 'FAIL' end,
           'journal_summary(): runs as the member (RLS applies), not callable signed out, answers zero for no one'
      from (select to_regprocedure('public.journal_summary()') as oid) f left join pg_proc p on p.oid = f.oid
    union all
    select 9, 'no_trades_yet',
           case when (select count(*) from public.journal_trades) = 0 then 'OK' else 'CHECK' end,
           (select count(*) from public.journal_trades)::text || ' trade(s) — 0 expected right after applying'
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
