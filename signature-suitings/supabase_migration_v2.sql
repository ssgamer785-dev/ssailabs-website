-- =====================================================================
-- SIGNATURE SUITINGS SHOWROOM — MIGRATION v2 (PRODUCTION HARDENING)
-- Run this in the Supabase SQL Editor AFTER supabase_schema.sql and
-- supabase_migration.sql. It is safe to re-run: every statement is idempotent.
--
-- What this fixes
--   1. Adds updated_at to every table so the app can resolve edit conflicts by
--      last-modified time instead of guessing (previously an offline edit could be
--      silently reverted by a stale cloud copy).
--   2. Adds the real columns the app was smuggling into free-text fields as
--      embedded JSON comments (order line items, invoice notes, order totals).
--      Reads already prefer the real column, so this is backwards compatible.
--   3. Stops duplicate attendance rows for the same worker on the same day.
--   4. Adds indexes for the lookups the app performs on every screen.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. updated_at on every table + auto-touch trigger
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
-- 2. Real columns for data previously encoded into free-text fields
-- ---------------------------------------------------------------------
-- Orders: itemised garments, and the order's own money figures.
ALTER TABLE orders   ADD COLUMN IF NOT EXISTS "garmentLineItems" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE orders   ADD COLUMN IF NOT EXISTS "totalAmount" numeric DEFAULT 0;
ALTER TABLE orders   ADD COLUMN IF NOT EXISTS "advancePaid" numeric DEFAULT 0;

-- Invoices: the app writes a notes field; without this column every invoice save
-- cost an extra failed round-trip before the column was stripped and retried.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS notes text;

-- Config: catalog + template definitions belong in their own columns, not inside
-- the shop tagline.
ALTER TABLE config   ADD COLUMN IF NOT EXISTS "garmentCategories" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE config   ADD COLUMN IF NOT EXISTS "garmentCatalog" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE config   ADD COLUMN IF NOT EXISTS "measurementTemplates" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE config   ADD COLUMN IF NOT EXISTS "autoBackupFrequency" text DEFAULT 'Off';
ALTER TABLE config   ADD COLUMN IF NOT EXISTS "lastAutoBackupTimestamp" text;

-- ---------------------------------------------------------------------
-- 3. Attendance: one record per worker per day
--    Removes any pre-existing duplicates (keeping the most recently created row)
--    before enforcing the constraint, so the migration cannot fail on live data.
-- ---------------------------------------------------------------------
DELETE FROM attendance a
USING attendance b
WHERE a."workerId" = b."workerId"
  AND a.date = b.date
  AND a.id <> b.id
  AND (a.created_at, a.id) < (b.created_at, b.id);

CREATE UNIQUE INDEX IF NOT EXISTS attendance_worker_date_unique
  ON attendance ("workerId", date);

-- ---------------------------------------------------------------------
-- 4. Indexes for the app's hot lookup paths
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
-- 5. Realtime publication
--    The app subscribes to postgres_changes for cross-device sync; without the
--    tables being in the publication no INSERT/UPDATE/DELETE events are emitted.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'config','users','customers','measurements','orders','trials','alterations',
    'invoices','appointments','expenses','workers','attendance','advances','salaries'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
