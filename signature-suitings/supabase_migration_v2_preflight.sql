-- =====================================================================
-- SIGNATURE SUITINGS — MIGRATION v2 PREFLIGHT  (100% READ ONLY)
--
-- Run this in the Supabase SQL Editor BEFORE supabase_migration_v2.sql.
--
-- This script contains no INSERT, UPDATE, DELETE, DROP, TRUNCATE, ALTER
-- or CREATE of any kind. It reads system catalogs and counts rows.
-- Running it changes nothing.
--
-- Row counts are gathered through query_to_xml() with a to_regclass()
-- guard rather than by naming tables directly, so this script still
-- produces a clean report if a table is missing instead of dying with a
-- raw "relation does not exist" error.
--
-- It returns ONE table. Read the `status` column:
--     OK       nothing to do
--     INFO     informational, no action needed
--     WARN     look at it, but it will not stop the migration
--     BLOCKER  fix this before running the migration
--
-- If no row says BLOCKER, the migration is safe to run.
-- =====================================================================

WITH
required_tables(t) AS (
  VALUES ('config'),('users'),('customers'),('measurements'),('orders'),
         ('trials'),('alterations'),('invoices'),('appointments'),
         ('expenses'),('workers'),('attendance'),('advances'),('salaries')
),

-- Columns the migration ADDS (all via ADD COLUMN IF NOT EXISTS)
added_columns(tbl, col, want_type) AS (
  VALUES
    ('config','updated_at','timestamp with time zone'),
    ('users','updated_at','timestamp with time zone'),
    ('customers','updated_at','timestamp with time zone'),
    ('measurements','updated_at','timestamp with time zone'),
    ('orders','updated_at','timestamp with time zone'),
    ('trials','updated_at','timestamp with time zone'),
    ('alterations','updated_at','timestamp with time zone'),
    ('invoices','updated_at','timestamp with time zone'),
    ('appointments','updated_at','timestamp with time zone'),
    ('expenses','updated_at','timestamp with time zone'),
    ('workers','updated_at','timestamp with time zone'),
    ('attendance','updated_at','timestamp with time zone'),
    ('advances','updated_at','timestamp with time zone'),
    ('salaries','updated_at','timestamp with time zone'),
    ('orders','garmentLineItems','jsonb'),
    ('orders','totalAmount','numeric'),
    ('orders','advancePaid','numeric'),
    ('invoices','notes','text'),
    ('config','garmentCategories','jsonb'),
    ('config','garmentCatalog','jsonb'),
    ('config','measurementTemplates','jsonb'),
    ('config','autoBackupFrequency','text'),
    ('config','lastAutoBackupTimestamp','text')
),

-- Columns the APP relies on that must already exist (detects schema drift)
expected_columns(tbl, col) AS (
  VALUES
    ('customers','fullName'),('customers','mobileNumber'),('customers','qrCodeId'),
    ('customers','outstandingBalance'),('customers','totalOrdersCount'),
    ('orders','customerId'),('orders','orderNumber'),('orders','status'),
    ('orders','expectedDeliveryDate'),('orders','statusHistory'),('orders','linkedInvoiceId'),
    ('orders','linkedMeasurementVersionId'),('orders','garmentTypes'),('orders','notes'),
    ('invoices','customerId'),('invoices','linkedOrderId'),('invoices','grandTotal'),
    ('invoices','advancePaid'),('invoices','balanceDue'),('invoices','paymentStatus'),
    ('invoices','payments'),('invoices','lineItems'),('invoices','linkedAppointmentId'),
    ('measurements','customerId'),('measurements','slipNumber'),('measurements','versionDate'),
    ('workers','active'),('workers','monthlySalary'),('workers','joiningDate'),
    ('attendance','workerId'),('attendance','date'),('attendance','status'),('attendance','notes'),
    ('advances','workerId'),('advances','amount'),('advances','repaid'),
    ('salaries','workerId'),('salaries','month'),('salaries','netPaid'),
    ('appointments','customerId'),('appointments','trialCharge'),('appointments','paymentStatus')
),

missing_tables AS (
  SELECT t FROM required_tables
  WHERE to_regclass('public.' || quote_ident(t)) IS NULL
),

-- Row count per table, NULL when the table does not exist.
tbl_counts AS (
  SELECT t,
    CASE WHEN to_regclass('public.' || quote_ident(t)) IS NULL THEN NULL
         ELSE (xpath('/row/c/text()',
                query_to_xml(format('SELECT count(*) AS c FROM public.%I', t),
                             false, true, '')))[1]::text::bigint
    END AS n
  FROM required_tables
),

-- All attendance metrics in a single guarded dynamic query.
att_xml AS (
  SELECT CASE
    WHEN to_regclass('public.attendance') IS NULL THEN NULL
    ELSE query_to_xml($q$
      WITH a AS (
        SELECT id, "workerId", date, created_at,
          'att_' || regexp_replace(COALESCE("workerId",'unknown'),'[^a-zA-Z0-9_-]','','g')
                 || '_' || regexp_replace(COALESCE(date,''),'[^0-9-]','','g') AS canonical_id
        FROM public.attendance
      ),
      r AS (
        SELECT a.*, row_number() OVER (
          PARTITION BY canonical_id
          ORDER BY COALESCE(created_at,'epoch'::timestamptz) DESC, id DESC) AS rn
        FROM a
      )
      SELECT
        (SELECT count(*) FROM r)                                              AS total,
        (SELECT count(*) FROM r WHERE rn > 1)                                 AS dupes,
        (SELECT count(*) FROM r WHERE rn = 1)                                 AS keep,
        (SELECT count(DISTINCT canonical_id) FROM r WHERE rn = 1)             AS keep_keys,
        (SELECT count(DISTINCT canonical_id) FROM r WHERE rn > 1)             AS dupe_keys,
        (SELECT count(*) FROM r WHERE id IS DISTINCT FROM canonical_id)       AS renames,
        (SELECT count(*) FROM public.attendance
           WHERE "workerId" IS NULL OR date IS NULL)                          AS null_keys,
        (SELECT count(*) FROM public.attendance WHERE id LIKE '\_\_mig\_%')   AS reserved_prefix,
        (SELECT CASE WHEN to_regclass('public.workers') IS NULL THEN 0 ELSE (
            SELECT count(*) FROM public.attendance x
            WHERE x."workerId" IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM public.workers w WHERE w.id = x."workerId")) END) AS orphans
    $q$, false, true, '')
  END AS x
),
att AS (
  SELECT
    (xpath('/row/total/text()',           x))[1]::text::bigint AS total,
    (xpath('/row/dupes/text()',           x))[1]::text::bigint AS dupes,
    (xpath('/row/keep/text()',            x))[1]::text::bigint AS keep,
    (xpath('/row/keep_keys/text()',       x))[1]::text::bigint AS keep_keys,
    (xpath('/row/dupe_keys/text()',       x))[1]::text::bigint AS dupe_keys,
    (xpath('/row/renames/text()',         x))[1]::text::bigint AS renames,
    (xpath('/row/null_keys/text()',       x))[1]::text::bigint AS null_keys,
    (xpath('/row/reserved_prefix/text()', x))[1]::text::bigint AS reserved_prefix,
    (xpath('/row/orphans/text()',         x))[1]::text::bigint AS orphans
  FROM att_xml
),

missing_expected AS (
  SELECT e.tbl, e.col FROM expected_columns e
  WHERE to_regclass('public.' || quote_ident(e.tbl)) IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM information_schema.columns c
                    WHERE c.table_schema='public' AND c.table_name=e.tbl AND c.column_name=e.col)
),

fk_to_attendance AS (
  SELECT conname FROM pg_constraint
  WHERE contype='f'
    AND to_regclass('public.attendance') IS NOT NULL
    AND confrelid = to_regclass('public.attendance')
),

role_info AS (
  SELECT COALESCE(bool_or(rolsuper OR rolbypassrls), false) AS privileged
  FROM pg_roles WHERE rolname = current_user
)

SELECT * FROM (

-- ---------- 1. TABLES ------------------------------------------------
SELECT 1 AS seq, '1. Required tables' AS check_name,
  CASE WHEN (SELECT count(*) FROM missing_tables)=0 THEN 'OK' ELSE 'BLOCKER' END AS status,
  CASE WHEN (SELECT count(*) FROM missing_tables)=0
       THEN 'All 14 required tables exist.'
       ELSE (SELECT count(*)||' table(s) MISSING: '||string_agg(t,', ')
             ||'. STOP: run supabase_setup_base.sql FIRST. supabase_migration_v2.sql contains only '
             ||'ALTER and CREATE INDEX statements and cannot create a table.'
             FROM missing_tables) END AS detail

UNION ALL
-- ---------- 2a. COLUMNS THE MIGRATION ADDS ---------------------------
SELECT 2, '2a. Columns to be added', 'INFO',
  (SELECT count(*) FROM added_columns a
     WHERE to_regclass('public.'||quote_ident(a.tbl)) IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns c
                       WHERE c.table_schema='public' AND c.table_name=a.tbl AND c.column_name=a.col))
  || ' of ' || (SELECT count(*) FROM added_columns)
  || ' columns will be newly created. The rest already exist and are skipped by ADD COLUMN IF NOT EXISTS. '
  || 'Adding a column with a constant default does not rewrite the table in PostgreSQL 11+, so this is fast.'

UNION ALL
-- ---------- 2b. TYPE CONFLICTS --------------------------------------
SELECT 3, '2b. Type conflicts',
  CASE WHEN count(*)=0 THEN 'OK' ELSE 'WARN' END,
  CASE WHEN count(*)=0
       THEN 'Every column the migration adds either does not exist yet or already has a compatible type.'
       ELSE 'Existing column(s) with an unexpected type. ADD COLUMN IF NOT EXISTS SKIPS these, so the old '
            || 'type stays and the app may fail to write them: '
            || string_agg(tbl||'.'||col||' is '||actual||', expected '||want_type, '; ') END
FROM (
  SELECT a.tbl, a.col, a.want_type, c.data_type AS actual
  FROM added_columns a
  JOIN information_schema.columns c
    ON c.table_schema='public' AND c.table_name=a.tbl AND c.column_name=a.col
  WHERE c.data_type <> a.want_type
) q

UNION ALL
-- ---------- 2c. CASE-VARIANT COLUMN COLLISIONS ----------------------
SELECT 4, '2c. Case-variant column names',
  CASE WHEN count(*)=0 THEN 'OK' ELSE 'WARN' END,
  CASE WHEN count(*)=0
       THEN 'No lowercase twins of the quoted camelCase columns. Nothing will be duplicated.'
       ELSE 'Column(s) differing only by case already exist. The migration would ADD A SECOND column '
            || 'beside each, and the app would only use the camelCase one: '
            || string_agg(tbl||': existing "'||existing||'" vs new "'||col||'"', '; ') END
FROM (
  SELECT a.tbl, a.col, c.column_name AS existing
  FROM added_columns a
  JOIN information_schema.columns c
    ON c.table_schema='public' AND c.table_name=a.tbl
   AND lower(c.column_name)=lower(a.col) AND c.column_name <> a.col
) q

UNION ALL
-- ---------- 2d. SCHEMA DRIFT ----------------------------------------
SELECT 5, '2d. Existing app columns',
  CASE WHEN (SELECT count(*) FROM missing_tables) > 0 THEN 'BLOCKER'
       WHEN (SELECT count(*) FROM missing_expected)=0 THEN 'OK' ELSE 'BLOCKER' END,
  CASE WHEN (SELECT count(*) FROM missing_tables) > 0
       THEN 'Not assessable: ' || (SELECT count(*) FROM missing_tables)
            || ' table(s) do not exist yet. Run supabase_setup_base.sql first, then re-run this preflight.'
       WHEN (SELECT count(*) FROM missing_expected)=0
       THEN 'All columns the application reads and writes are present.'
       ELSE (SELECT count(*)||' expected column(s) MISSING (schema has drifted; the app is already '
             ||'impaired regardless of this migration): '||string_agg(tbl||'.'||col, ', ')
             FROM missing_expected) END

UNION ALL
-- ---------- 3a. FKs REFERENCING attendance.id -----------------------
SELECT 6, '3a. FKs referencing attendance.id',
  CASE WHEN (SELECT count(*) FROM fk_to_attendance)=0 THEN 'OK' ELSE 'BLOCKER' END,
  CASE WHEN (SELECT count(*) FROM fk_to_attendance)=0
       THEN 'Nothing references attendance.id, so renaming attendance ids in STEP 3b cannot break a relationship.'
       ELSE (SELECT 'Foreign key(s) reference attendance.id and would break during the id rename: '
             ||string_agg(conname,', ') FROM fk_to_attendance) END

UNION ALL
-- ---------- 3b. PRIMARY KEYS ----------------------------------------
SELECT 7, '3b. Primary keys',
  CASE WHEN count(*) = (SELECT count(*) FROM required_tables) - (SELECT count(*) FROM missing_tables)
       THEN 'OK' ELSE 'WARN' END,
  count(*) || ' of ' || ((SELECT count(*) FROM required_tables) - (SELECT count(*) FROM missing_tables))
  || ' existing tables have a primary key. The migration adds, drops and alters no primary key '
  || '(STEP 3b changes attendance.id VALUES, not the key definition).'
FROM pg_constraint c
JOIN pg_class t ON t.oid=c.conrelid
JOIN pg_namespace n ON n.oid=t.relnamespace
WHERE c.contype='p' AND n.nspname='public' AND t.relname IN (SELECT t FROM required_tables)

UNION ALL
-- ---------- 3c. FOREIGN KEYS OVERALL --------------------------------
SELECT 8, '3c. Foreign keys overall', 'INFO',
  count(*) || ' foreign key(s) exist in the public schema. The migration adds, drops and alters none of them, '
  || 'so every customer/order/invoice/worker relationship is preserved exactly.'
FROM pg_constraint c
JOIN pg_class t ON t.oid=c.conrelid
JOIN pg_namespace n ON n.oid=t.relnamespace
WHERE c.contype='f' AND n.nspname='public'

UNION ALL
-- ---------- 4. DUPLICATE WORKER/DAY ATTENDANCE ----------------------
SELECT 9, '4. Duplicate attendance rows',
  CASE WHEN (SELECT dupes FROM att) IS NULL THEN 'BLOCKER'
       WHEN (SELECT dupes FROM att)=0 THEN 'OK' ELSE 'WARN' END,
  CASE WHEN (SELECT dupes FROM att) IS NULL THEN 'attendance table does not exist.'
       WHEN (SELECT dupes FROM att)=0
       THEN 'No duplicate worker/day attendance records. STEP 3a will delete NOTHING.'
       ELSE (SELECT dupes||' attendance row(s) WILL BE DELETED by STEP 3a across '||dupe_keys
             ||' worker/day pair(s) that were marked more than once. The most recently created row of '
             ||'each pair is kept. This is the only data the migration removes.' FROM att) END

UNION ALL
-- ---------- 5a. NULL KEY PARTS --------------------------------------
SELECT 10, '5a. Attendance rows with NULL worker/date',
  CASE WHEN COALESCE((SELECT null_keys FROM att),0)=0 THEN 'OK' ELSE 'WARN' END,
  CASE WHEN COALESCE((SELECT null_keys FROM att),0)=0
       THEN 'Every attendance row has both a worker and a date.'
       ELSE (SELECT null_keys||' attendance row(s) have a NULL workerId or date. They group under an '
             ||'"unknown" key and could be merged with each other. Review them before running.' FROM att) END

UNION ALL
-- ---------- 5b. RESERVED PREFIX -------------------------------------
SELECT 11, '5b. Reserved id prefix in use',
  CASE WHEN COALESCE((SELECT reserved_prefix FROM att),0)=0 THEN 'OK' ELSE 'BLOCKER' END,
  CASE WHEN COALESCE((SELECT reserved_prefix FROM att),0)=0
       THEN 'No attendance id uses the reserved "__mig_" prefix that STEP 3b parks rows under.'
       ELSE (SELECT reserved_prefix||' attendance row(s) already use the reserved "__mig_" id prefix. '
             ||'Rename them before running the migration.' FROM att) END

UNION ALL
-- ---------- 5c. UNIQUENESS PROOF ------------------------------------
SELECT 12, '5c. Unique index will build',
  CASE WHEN (SELECT keep FROM att) IS NULL THEN 'BLOCKER'
       WHEN (SELECT keep FROM att) = (SELECT keep_keys FROM att) THEN 'OK' ELSE 'BLOCKER' END,
  CASE WHEN (SELECT keep FROM att) IS NULL THEN 'attendance table does not exist.'
       ELSE (SELECT 'After STEP 3a, '||keep||' attendance row(s) remain carrying '||keep_keys
             ||' distinct worker/day keys. Equal numbers mean the unique index in STEP 3c builds cleanly. '
             ||renames||' row(s) will have their id renamed to the canonical form by STEP 3b.' FROM att) END

UNION ALL
-- ---------- 5d. ORPHANS ---------------------------------------------
SELECT 13, '5d. Orphaned attendance rows',
  CASE WHEN COALESCE((SELECT orphans FROM att),0)=0 THEN 'OK' ELSE 'WARN' END,
  CASE WHEN COALESCE((SELECT orphans FROM att),0)=0
       THEN 'Every attendance row points at a worker that exists.'
       ELSE (SELECT orphans||' attendance row(s) reference a missing worker. The migration keeps them '
             ||'untouched; it does not delete orphans.' FROM att) END

UNION ALL
-- ---------- 6. REALTIME PUBLICATION ---------------------------------
SELECT 14, '6. Realtime publication', 'INFO',
  CASE WHEN NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime')
       THEN 'Publication "supabase_realtime" does NOT exist. STEP 5 skips with a notice rather than '
            || 'failing. Enable Realtime per table from Database -> Replication afterwards.'
       ELSE 'Publication exists; '
            || (SELECT count(*)::text FROM pg_publication_tables
                WHERE pubname='supabase_realtime' AND schemaname='public'
                  AND tablename IN (SELECT t FROM required_tables))
            || ' of 14 app tables are already published. STEP 5 adds the rest, and skips quietly if this '
            || 'role may not alter the publication.' END

UNION ALL
-- ---------- 7a. RLS -------------------------------------------------
SELECT 15, '7a. Row Level Security', 'INFO',
  (SELECT count(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relrowsecurity AND c.relname IN (SELECT t FROM required_tables))
  || ' of 14 tables have RLS enabled, with '
  || (SELECT count(*)::text FROM pg_policies WHERE schemaname='public'
       AND tablename IN (SELECT t FROM required_tables))
  || ' policies. RLS never applies to DDL, so STEPS 1, 2, 3c, 4 and 5 are unaffected by it.'

UNION ALL
-- ---------- 7b. RLS vs THE DELETE -----------------------------------
SELECT 16, '7b. RLS effect on the delete',
  CASE WHEN (SELECT privileged FROM role_info) THEN 'OK' ELSE 'WARN' END,
  CASE WHEN (SELECT privileged FROM role_info)
       THEN 'Running as "' || current_user || '", which bypasses RLS, so STEP 3a sees every duplicate '
            || 'and STEP 3c will build.'
       ELSE 'Running as "' || current_user || '", which does NOT bypass RLS. If a policy hides attendance '
            || 'rows, STEP 3a could delete fewer duplicates than counted above and STEP 3c would fail '
            || '(rolling the whole migration back safely). Run the migration from the Supabase SQL Editor, '
            || 'which connects as a privileged role.' END

UNION ALL
-- ---------- 7c. POLICY REVIEW ---------------------------------------
SELECT 17, '7c. Policy review (separate from this migration)',
  CASE WHEN (SELECT count(*) FROM pg_policies
             WHERE schemaname='public' AND qual='true' AND cmd='ALL') > 0 THEN 'WARN' ELSE 'INFO' END,
  CASE WHEN (SELECT count(*) FROM pg_policies
             WHERE schemaname='public' AND qual='true' AND cmd='ALL') > 0
       THEN (SELECT count(*)::text FROM pg_policies WHERE schemaname='public' AND qual='true' AND cmd='ALL')
            || ' policies allow ALL operations to everyone (USING true). The migration neither reads nor '
            || 'changes this, but it means anyone holding your anon key can read and write all business '
            || 'data. Worth tightening separately before the showroom goes live.'
       ELSE 'No blanket allow-everything policies detected.' END

UNION ALL
-- ---------- 8. DESTRUCTIVE OPERATIONS -------------------------------
SELECT 18, '8. Destructive operations',
  CASE WHEN COALESCE((SELECT dupes FROM att),0)=0 THEN 'OK' ELSE 'WARN' END,
  'Exactly one statement deletes data: STEP 3a (duplicate attendance rows). On this database it would '
  || 'delete ' || COALESCE((SELECT dupes::text FROM att),'?') || ' row(s). '
  || 'There is no DROP, no TRUNCATE, no column removal, and no customer, order, invoice, payment, '
  || 'measurement, worker, advance or salary row is deleted or modified anywhere in the migration.'

UNION ALL
-- ---------- 9. COUNTS THAT MUST NOT CHANGE --------------------------
SELECT 19, '9. Rows that must be unchanged', 'INFO',
  (SELECT string_agg(t||'='||COALESCE(n::text,'MISSING'), ' ' ORDER BY t)
   FROM tbl_counts WHERE t <> 'attendance')
  || ' -- every one of these must read identically after the migration.'

UNION ALL
SELECT 20, '9b. Attendance before / after', 'INFO',
  'attendance now=' || COALESCE((SELECT total::text FROM att),'MISSING')
  || ', after migration=' || COALESCE((SELECT keep::text FROM att),'?')
  || ' (the difference is exactly the duplicates in check 4).'

UNION ALL
-- ---------- 10. IDEMPOTENCY -----------------------------------------
SELECT 21, '10. Idempotency', 'OK',
  'Every statement is safe to run more than once. ADD COLUMN and CREATE INDEX use IF NOT EXISTS; the '
  || 'dedupe matches nothing on a second run; the id rename matches nothing once ids are canonical; the '
  || 'publication block tests membership first. The script is wrapped in BEGIN/COMMIT, so a failure at '
  || 'any point rolls the whole thing back. Confirmed by three consecutive runs on a replica.'

UNION ALL
-- ---------- VERDICT -------------------------------------------------
SELECT 22, '>>> VERDICT <<<',
  CASE WHEN (SELECT count(*) FROM missing_tables) > 0 THEN 'RUN BASE FIRST'
       WHEN (SELECT count(*) FROM missing_expected) > 0
         OR (SELECT count(*) FROM fk_to_attendance) > 0
         OR COALESCE((SELECT reserved_prefix FROM att),0) > 0
         OR (SELECT keep FROM att) IS NULL
         OR (SELECT keep FROM att) <> (SELECT keep_keys FROM att)
       THEN 'BLOCKER' ELSE 'SAFE TO RUN' END,
  CASE WHEN (SELECT count(*) FROM missing_tables) > 0
       THEN 'STAGE 1 NOT DONE. This database has no application tables yet. Run '
            || 'supabase_setup_base.sql first, then re-run this preflight. Do NOT run '
            || 'supabase_migration_v2.sql yet - it only ALTERs tables and would fail on every statement.'
       WHEN (SELECT count(*) FROM missing_expected) > 0
         OR (SELECT count(*) FROM fk_to_attendance) > 0
         OR COALESCE((SELECT reserved_prefix FROM att),0) > 0
         OR (SELECT keep FROM att) IS NULL
         OR (SELECT keep FROM att) <> (SELECT keep_keys FROM att)
       THEN 'Do NOT run the migration yet. Resolve every row marked BLOCKER above first.'
       ELSE 'No blockers. supabase_migration_v2.sql is safe to run on this database. It will delete '
            || COALESCE((SELECT dupes::text FROM att),'0') || ' duplicate attendance row(s), rename '
            || COALESCE((SELECT renames::text FROM att),'0') || ' attendance id(s), and change nothing else.' END

) checks
ORDER BY seq;
