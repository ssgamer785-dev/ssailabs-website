-- =====================================================================
-- SIGNATURE SUITINGS SHOWROOM — MIGRATION v2 (PRODUCTION HARDENING)
--
-- Run in the Supabase SQL Editor AFTER supabase_schema.sql and
-- supabase_migration.sql. Safe to re-run as many times as you like.
--
-- RUN supabase_migration_v2_preview.sql FIRST to see exactly what changes.
--
-- ---------------------------------------------------------------------
-- DESTRUCTIVE OPERATIONS IN THIS SCRIPT — there is exactly one:
--
--   STEP 3a deletes duplicate ATTENDANCE rows, keeping one row per worker
--   per day (the most recently created). If a worker was marked twice for
--   the same date, the older mark is removed. Nothing else is deleted.
--
--   No other table is touched destructively. No column is dropped, no
--   table is dropped, no customer, order, invoice, payment, measurement,
--   worker, advance or salary row is deleted or modified anywhere in this
--   script. STEP 3b renames attendance ids (the row and its data are
--   kept; only the id text changes; nothing in the database references
--   attendance.id).
--
-- The script is wrapped in an explicit BEGIN/COMMIT, so if any statement
-- fails, everything rolls back and your database is left exactly as it
-- was. (Do not rely on the client to do this for you — the Supabase SQL
-- Editor wraps a pasted script in an implicit transaction, but psql -f
-- runs each statement in its own autocommit transaction and would leave a
-- half-applied migration behind.)
-- ---------------------------------------------------------------------
--
-- What this migration fixes
--   1. Adds updated_at everywhere so the app resolves edit conflicts by
--      last-modified time instead of guessing (an offline edit could
--      previously be reverted by a stale cloud copy).
--   2. Adds real columns for data the app was encoding into free-text
--      fields, and the invoices.notes column whose absence made every
--      invoice save cost a wasted failed round-trip.
--   3. Makes attendance one row per worker per day, and aligns existing
--      ids with the ids the application now generates.
--   4. Adds indexes for the lookups the app runs on every screen.
--   5. Ensures the tables are published for realtime.
-- =====================================================================


BEGIN;

-- ---------------------------------------------------------------------
-- STEP 1. updated_at on every table                      [NON-DESTRUCTIVE]
--
-- Adding a column with a non-volatile default does not rewrite the table
-- in PostgreSQL 11+, so this is fast even on large tables.
-- ---------------------------------------------------------------------
ALTER TABLE config       ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT timezone('utc'::text, now());
ALTER TABLE users        ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT timezone('utc'::text, now());
ALTER TABLE customers    ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT timezone('utc'::text, now());
ALTER TABLE measurements ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT timezone('utc'::text, now());
ALTER TABLE orders       ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT timezone('utc'::text, now());
ALTER TABLE trials       ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT timezone('utc'::text, now());
ALTER TABLE alterations  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT timezone('utc'::text, now());
ALTER TABLE invoices     ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT timezone('utc'::text, now());
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT timezone('utc'::text, now());
ALTER TABLE expenses     ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT timezone('utc'::text, now());
ALTER TABLE workers      ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT timezone('utc'::text, now());
ALTER TABLE attendance   ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT timezone('utc'::text, now());
ALTER TABLE advances     ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT timezone('utc'::text, now());
ALTER TABLE salaries     ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT timezone('utc'::text, now());


-- ---------------------------------------------------------------------
-- STEP 2. Columns for data previously packed into text  [NON-DESTRUCTIVE]
--
-- New columns start empty. Existing reads fall back to the old encoded
-- copy, so nothing breaks before or after this step.
-- ---------------------------------------------------------------------
ALTER TABLE orders   ADD COLUMN IF NOT EXISTS "garmentLineItems" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE orders   ADD COLUMN IF NOT EXISTS "totalAmount" numeric DEFAULT 0;
ALTER TABLE orders   ADD COLUMN IF NOT EXISTS "advancePaid" numeric DEFAULT 0;

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE config   ADD COLUMN IF NOT EXISTS "garmentCategories" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE config   ADD COLUMN IF NOT EXISTS "garmentCatalog" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE config   ADD COLUMN IF NOT EXISTS "measurementTemplates" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE config   ADD COLUMN IF NOT EXISTS "autoBackupFrequency" text DEFAULT 'Off';
ALTER TABLE config   ADD COLUMN IF NOT EXISTS "lastAutoBackupTimestamp" text;


-- ---------------------------------------------------------------------
-- STEP 3a. Remove duplicate attendance rows                  [DESTRUCTIVE]
--
-- >>> THIS IS THE ONLY STATEMENT IN THIS SCRIPT THAT DELETES DATA. <<<
--
-- Keeps one row per worker per day — the most recently created — and
-- removes the extra copies. Run the preview script first to see the exact
-- list. If you have no duplicates this deletes nothing.
--
-- created_at is coalesced because a row created with an explicit NULL
-- timestamp would otherwise compare as NULL, leave the duplicate in
-- place, and make STEP 3c fail.
-- ---------------------------------------------------------------------
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY
        'att_' || regexp_replace(COALESCE("workerId", 'unknown'), '[^a-zA-Z0-9_-]', '', 'g')
               || '_' || regexp_replace(COALESCE(date, ''), '[^0-9-]', '', 'g')
      ORDER BY COALESCE(created_at, 'epoch'::timestamptz) DESC, id DESC
    ) AS rn
  FROM attendance
)
DELETE FROM attendance
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);


-- ---------------------------------------------------------------------
-- STEP 3b. Align attendance ids with the application     [NON-DESTRUCTIVE]
--
-- The app now derives an attendance id from worker + date so two devices
-- marking the same day produce the same id instead of two rows. Existing
-- rows carry older random ids. Without this step, the unique index added
-- below would reject every future save for a worker/day that already has
-- a row under a legacy id, and those saves would fail permanently.
--
-- Rows and their data are preserved; only the id text changes. Nothing in
-- the database has a foreign key to attendance.id, so this is safe.
-- STEP 3a guarantees the new ids are unique.
-- ---------------------------------------------------------------------
UPDATE attendance
SET id = 'att_' || regexp_replace(COALESCE("workerId", 'unknown'), '[^a-zA-Z0-9_-]', '', 'g')
                || '_' || regexp_replace(COALESCE(date, ''), '[^0-9-]', '', 'g')
WHERE id IS DISTINCT FROM (
  'att_' || regexp_replace(COALESCE("workerId", 'unknown'), '[^a-zA-Z0-9_-]', '', 'g')
         || '_' || regexp_replace(COALESCE(date, ''), '[^0-9-]', '', 'g')
);


-- ---------------------------------------------------------------------
-- STEP 3c. One attendance record per worker per day      [NON-DESTRUCTIVE]
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS attendance_worker_date_unique
  ON attendance ("workerId", date);


-- ---------------------------------------------------------------------
-- STEP 4. Lookup indexes                                 [NON-DESTRUCTIVE]
--
-- Index builds take a brief lock that blocks writes to that table. These
-- tables are showroom-sized, so each completes in milliseconds.
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_customers_mobile      ON customers ("mobileNumber");
CREATE INDEX IF NOT EXISTS idx_measurements_customer ON measurements ("customerId");
CREATE INDEX IF NOT EXISTS idx_orders_customer       ON orders ("customerId");
CREATE INDEX IF NOT EXISTS idx_orders_status         ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_delivery       ON orders ("expectedDeliveryDate");
CREATE INDEX IF NOT EXISTS idx_invoices_customer     ON invoices ("customerId");
CREATE INDEX IF NOT EXISTS idx_invoices_order        ON invoices ("linkedOrderId");
CREATE INDEX IF NOT EXISTS idx_appointments_customer ON appointments ("customerId");
CREATE INDEX IF NOT EXISTS idx_appointments_date     ON appointments ("appointmentDate");
CREATE INDEX IF NOT EXISTS idx_attendance_worker     ON attendance ("workerId");
CREATE INDEX IF NOT EXISTS idx_attendance_date       ON attendance (date);
CREATE INDEX IF NOT EXISTS idx_advances_worker       ON advances ("workerId");
CREATE INDEX IF NOT EXISTS idx_salaries_worker       ON salaries ("workerId");
CREATE INDEX IF NOT EXISTS idx_trials_order          ON trials ("orderId");
CREATE INDEX IF NOT EXISTS idx_alterations_order     ON alterations ("orderId");


-- ---------------------------------------------------------------------
-- STEP 5. Realtime publication                           [NON-DESTRUCTIVE]
--
-- The app subscribes to postgres_changes for cross-device sync; tables
-- not in the publication emit no events.
--
-- Skips quietly if the publication does not exist or if this role is not
-- allowed to alter it, rather than aborting the whole migration. If it is
-- skipped you can still enable Realtime per table from the Supabase
-- dashboard under Database -> Replication.
--
-- Replica identity is left at the default (primary key). That is enough:
-- the app only needs the id from a DELETE event, and REPLICA IDENTITY
-- FULL would add write-ahead-log overhead for no benefit.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'Publication supabase_realtime not found — skipping realtime setup. Enable Realtime per table in the Supabase dashboard.';
    RETURN;
  END IF;

  FOREACH t IN ARRAY ARRAY[
    'config','users','customers','measurements','orders','trials','alterations',
    'invoices','appointments','expenses','workers','attendance','advances','salaries'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      BEGIN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      EXCEPTION WHEN insufficient_privilege OR undefined_object THEN
        RAISE NOTICE 'Could not add % to supabase_realtime (permission denied) — enable it from the dashboard.', t;
      END;
    END IF;
  END LOOP;
END $$;


COMMIT;


-- ---------------------------------------------------------------------
-- STEP 6. Post-migration report
-- ---------------------------------------------------------------------
SELECT
  (SELECT count(*) FROM customers)    AS customers,
  (SELECT count(*) FROM orders)       AS orders,
  (SELECT count(*) FROM invoices)     AS invoices,
  (SELECT count(*) FROM measurements) AS measurements,
  (SELECT count(*) FROM workers)      AS workers,
  (SELECT count(*) FROM attendance)   AS attendance,
  (SELECT count(*) FROM advances)     AS advances,
  (SELECT count(*) FROM salaries)     AS salaries,
  (SELECT count(*) FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public') AS realtime_tables;
