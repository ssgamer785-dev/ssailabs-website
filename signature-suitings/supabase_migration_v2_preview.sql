-- =====================================================================
-- SIGNATURE SUITINGS — MIGRATION v2 PREVIEW (READ ONLY)
--
-- Run this FIRST, before supabase_migration_v2.sql.
-- It changes NOTHING. It only reports what the migration would do, so you
-- can see the exact rows affected before anything is written.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Duplicate attendance rows that the migration will DELETE.
--    One row per worker per day is kept (the most recently created).
--    Everything listed here is what would be removed.
--    An empty result means the migration deletes nothing at all.
-- ---------------------------------------------------------------------
WITH keyed AS (
  SELECT
    id, "workerId", date, status, created_at,
    'att_' || regexp_replace(COALESCE("workerId", 'unknown'), '[^a-zA-Z0-9_-]', '', 'g')
           || '_' || regexp_replace(COALESCE(date, ''), '[^0-9-]', '', 'g') AS canonical_id
  FROM attendance
),
ranked AS (
  SELECT
    keyed.*,
    row_number() OVER (
      PARTITION BY canonical_id
      ORDER BY COALESCE(created_at, 'epoch'::timestamptz) DESC, id DESC
    ) AS rn,
    count(*)   OVER (PARTITION BY canonical_id) AS copies
  FROM keyed
)
SELECT
  'WILL BE DELETED' AS action,
  id AS attendance_id,
  "workerId",
  date,
  status,
  created_at,
  copies AS rows_for_this_worker_day
FROM ranked
WHERE rn > 1
ORDER BY "workerId", date;

-- ---------------------------------------------------------------------
-- 2. Attendance rows whose id will be RENAMED to the canonical form.
--    The row and all of its data are kept; only the id text changes.
--    Nothing in the database references attendance.id, so this is safe.
-- ---------------------------------------------------------------------
WITH keyed AS (
  SELECT
    id, "workerId", date, status,
    'att_' || regexp_replace(COALESCE("workerId", 'unknown'), '[^a-zA-Z0-9_-]', '', 'g')
           || '_' || regexp_replace(COALESCE(date, ''), '[^0-9-]', '', 'g') AS canonical_id
  FROM attendance
)
SELECT
  'ID WILL BE RENAMED' AS action,
  id   AS current_id,
  canonical_id AS new_id,
  "workerId",
  date,
  status
FROM keyed
WHERE id IS DISTINCT FROM canonical_id
ORDER BY "workerId", date;

-- ---------------------------------------------------------------------
-- 3. Summary: totals before the migration, and what changes.
-- ---------------------------------------------------------------------
WITH keyed AS (
  SELECT
    id,
    'att_' || regexp_replace(COALESCE("workerId", 'unknown'), '[^a-zA-Z0-9_-]', '', 'g')
           || '_' || regexp_replace(COALESCE(date, ''), '[^0-9-]', '', 'g') AS canonical_id
  FROM attendance
)
SELECT
  (SELECT count(*) FROM customers)                                         AS customers_kept,
  (SELECT count(*) FROM orders)                                            AS orders_kept,
  (SELECT count(*) FROM invoices)                                          AS invoices_kept,
  (SELECT count(*) FROM measurements)                                      AS measurements_kept,
  (SELECT count(*) FROM workers)                                           AS workers_kept,
  (SELECT count(*) FROM advances)                                          AS advances_kept,
  (SELECT count(*) FROM salaries)                                          AS salaries_kept,
  (SELECT count(*) FROM attendance)                                        AS attendance_before,
  (SELECT count(DISTINCT canonical_id) FROM keyed)                         AS attendance_after,
  (SELECT count(*) - count(DISTINCT canonical_id) FROM keyed)              AS attendance_rows_deleted;

-- ---------------------------------------------------------------------
-- 4. Does the realtime publication exist? If this returns 0 rows the
--    migration skips the realtime step instead of failing.
-- ---------------------------------------------------------------------
SELECT pubname AS realtime_publication_found
FROM pg_publication
WHERE pubname = 'supabase_realtime';
