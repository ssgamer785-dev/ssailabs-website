-- =====================================================================
-- SIGNATURE SUITINGS SHOWROOM — STEP 1 of 2: BASE SCHEMA
--
-- RUN THIS FIRST, before supabase_migration_v2.sql.
--
-- This creates the 14 application tables the showroom needs. It is the
-- authoritative base schema: supabase_migration_v2.sql contains only
-- ALTER/CREATE INDEX statements and cannot create a table, so it can
-- never stand in for this file.
--
-- ---------------------------------------------------------------------
-- DESTRUCTIVE OPERATIONS: NONE.
--
-- There is no DROP, no TRUNCATE, no DELETE and no UPDATE anywhere in
-- this file. Every table uses CREATE TABLE IF NOT EXISTS and every
-- column uses ADD COLUMN IF NOT EXISTS, so a table or column that
-- already exists is left exactly as it is, with all of its data. No
-- demo, sample or test row is inserted.
--
-- Safe to re-run. The original supabase_schema.sql was NOT: its 18
-- CREATE POLICY statements have no IF NOT EXISTS, so a second run
-- aborted with "policy already exists" and — because the SQL Editor
-- wraps a pasted script in a transaction — rolled the whole thing back.
-- Here every policy is created only if absent, which also means a policy
-- you have customised is never overwritten.
--
-- The whole file runs inside BEGIN/COMMIT: any failure rolls everything
-- back and leaves the database untouched.
-- ---------------------------------------------------------------------
--
-- Order of work:
--   1. supabase_setup_base.sql        <- this file
--   2. supabase_migration_v2.sql      <- hardening: updated_at, extra
--                                        columns, attendance unique
--                                        index, lookup indexes, realtime
--
-- Verify with supabase_migration_v2_preflight.sql between the two.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Extensions and the 14 application tables
--    Taken verbatim from supabase_schema.sql. CREATE TABLE IF NOT EXISTS
--    means an existing table keeps its current definition and rows.
-- ---------------------------------------------------------------------
-- Enable extensions
create extension if not exists "uuid-ossp";

-- 1. CONFIG TABLE (Shop settings)
create table if not exists config (
    id text primary key default 'global_config',
    "shopName" text not null,
    tagline text,
    address text,
    phone1 text,
    phone2 text,
    "logoUrl" text,
    "gstEnabled" boolean default false,
    "gstNumber" text,
    "gstPercent" numeric default 18,
    "currencySymbol" text default '₹',
    "garmentTypesConfig" jsonb default '[]'::jsonb,
    "measurementFieldsConfig" jsonb default '{}'::jsonb,
    updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- 2. USERS TABLE
create table if not exists users (
    id text primary key,
    name text not null,
    role text not null check (role in ('Admin', 'Staff')),
    email text,
    phone text,
    active boolean default true,
    "photoUrl" text,
    created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 3. CUSTOMERS TABLE
create table if not exists customers (
    id text primary key,
    "fullName" text not null,
    "mobileNumber" text not null,
    "alternateNumber" text,
    address text,
    email text,
    dob text,
    "preferredFabricBrands" jsonb default '[]'::jsonb,
    "generalNotes" text,
    "customerSince" text not null,
    "totalOrdersCount" integer default 0,
    "outstandingBalance" numeric default 0,
    "qrCodeId" text unique not null,
    "photoUrl" text,
    "memoryNotes" jsonb default '[]'::jsonb,
    "preferenceTags" jsonb default '[]'::jsonb,
    created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 4. MEASUREMENTS TABLE
create table if not exists measurements (
    id text primary key,
    "customerId" text not null references customers(id) on delete cascade,
    "versionDate" text not null,
    "slipNumber" text not null,
    "tryOnDate" text,
    "deliveryDate" text,
    "coatIndoWestern" jsonb default '{}'::jsonb,
    pent jsonb default '{}'::jsonb,
    vest jsonb default '{}'::jsonb,
    "shirtKurta" jsonb default '{}'::jsonb,
    "designNotes" text,
    "fabricSelected" text,
    "liningChoice" text,
    remarks text,
    "createdBy" text,
    "changesSincePrevious" jsonb default '[]'::jsonb,
    created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 5. ORDERS TABLE
create table if not exists orders (
    id text primary key,
    "customerId" text not null references customers(id) on delete cascade,
    "orderNumber" text unique not null,
    "orderDate" text not null,
    "garmentTypes" jsonb default '[]'::jsonb,
    "linkedMeasurementVersionId" text references measurements(id) on delete set null,
    "fabricDetails" text,
    "expectedDeliveryDate" text not null,
    "actualDeliveryDate" text,
    status text not null,
    "statusHistory" jsonb default '[]'::jsonb,
    "assignedTailor" text,
    "linkedInvoiceId" text,
    notes text,
    created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 6. TRIALS TABLE
create table if not exists trials (
    id text primary key,
    "orderId" text not null references orders(id) on delete cascade,
    "customerId" text not null references customers(id) on delete cascade,
    "trialDate" text not null,
    feedback text,
    "alterationRequired" boolean default false,
    "conductedBy" text,
    created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 7. ALTERATIONS TABLE
create table if not exists alterations (
    id text primary key,
    "orderId" text not null references orders(id) on delete cascade,
    "customerId" text not null references customers(id) on delete cascade,
    "alterationDate" text not null,
    description text not null,
    "beforeNotes" text,
    "afterNotes" text,
    "handledBy" text,
    created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 8. INVOICES TABLE
create table if not exists invoices (
    id text primary key,
    "customerId" text not null references customers(id) on delete cascade,
    "invoiceNumber" text unique not null,
    "invoiceDate" text not null,
    "linkedOrderId" text references orders(id) on delete set null,
    "lineItems" jsonb default '[]'::jsonb,
    subtotal numeric default 0,
    discount numeric default 0,
    "taxPercent" numeric default 18,
    "taxAmount" numeric default 0,
    "grandTotal" numeric default 0,
    "advancePaid" numeric default 0,
    "balanceDue" numeric default 0,
    "paymentStatus" text not null,
    payments jsonb default '[]'::jsonb,
    "linkedAppointmentId" text,
    created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 9. APPOINTMENTS TABLE
create table if not exists appointments (
    id text primary key,
    "customerId" text not null references customers(id) on delete cascade,
    type text not null,
    "dateTime" text not null,
    status text not null,
    notes text,
    "orderId" text,
    "appointmentType" text,
    "appointmentDate" text,
    "appointmentTime" text,
    "trialCharge" numeric,
    "paymentStatus" text,
    "linkedInvoiceId" text,
    "clothDropOffDate" text,
    "fittingPickupDate" text,
    "pickupDate" text,
    "pickupTime" text,
    "readyDate" text,
    "readyTime" text,
    "trialStatus" text,
    "completedStatus" text,
    created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 10. EXPENSES TABLE
create table if not exists expenses (
    id text primary key,
    category text not null,
    amount numeric not null,
    date text not null,
    notes text,
    supplier text,
    "paymentMethod" text,
    created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 11. WORKERS TABLE
create table if not exists workers (
    id text primary key,
    name text not null,
    "mobileNumber" text not null,
    address text,
    role text not null,
    "dailyWages" numeric default 0,
    "monthlySalary" numeric default 0,
    active boolean default true,
    "joiningDate" text not null,
    "photoUrl" text,
    created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 12. ATTENDANCE TABLE
create table if not exists attendance (
    id text primary key,
    "workerId" text not null references workers(id) on delete cascade,
    date text not null,
    status text not null,
    notes text,
    created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 13. ADVANCES TABLE
create table if not exists advances (
    id text primary key,
    "workerId" text not null references workers(id) on delete cascade,
    amount numeric not null,
    date text not null,
    notes text,
    repaid boolean default false,
    "repayDate" text,
    created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 14. SALARIES TABLE
create table if not exists salaries (
    id text primary key,
    "workerId" text not null references workers(id) on delete cascade,
    month text not null,
    "calculatedSalary" numeric default 0,
    presents integer default 0,
    "halfDays" integer default 0,
    absents integer default 0,
    "paidLeavesUsed" integer default 0,
    "advanceDeductions" numeric default 0,
    bonus numeric default 0,
    "netPaid" numeric default 0,
    "paymentDate" text not null,
    notes text,
    created_at timestamp with time zone default timezone('utc'::text, now())
);

-- =====================================================================

-- ---------------------------------------------------------------------
-- 2. Columns added after the original schema shipped
--    No-ops on a fresh database; they backfill databases created from an
--    older version of the schema. ADD COLUMN IF NOT EXISTS never touches
--    an existing column or its data.
-- ---------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS "photoUrl" text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "orderId" text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "appointmentType" text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "appointmentDate" text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "appointmentTime" text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "trialCharge" numeric;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "paymentStatus" text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "linkedInvoiceId" text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "clothDropOffDate" text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "fittingPickupDate" text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "pickupDate" text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "pickupTime" text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "readyDate" text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "readyTime" text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "trialStatus" text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "completedStatus" text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "linkedAppointmentId" text;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS "address" text;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS "photoUrl" text;

-- ---------------------------------------------------------------------
-- 3. Row Level Security
--    ENABLE ROW LEVEL SECURITY is idempotent, so this is safe to re-run.
-- ---------------------------------------------------------------------
ALTER TABLE config ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE trials ENABLE ROW LEVEL SECURITY;
ALTER TABLE alterations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE salaries ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 4. Access policies
--
--    The showroom app talks to Supabase with the anon key and has no
--    per-user data ownership model, so each table gets one permissive
--    policy. This matches how the application is built today.
--
--    SECURITY NOTE: "USING (true) WITH CHECK (true)" means anyone holding
--    your anon key can read and write every business record. That is
--    acceptable for a single-showroom deployment on a private network,
--    but it is NOT suitable if the anon key is ever exposed publicly.
--    Tightening it is a separate piece of work from this migration.
--
--    Created only when absent, so a policy you have customised survives.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['config','users','customers','measurements','orders','trials','alterations','invoices','appointments','expenses','workers','attendance','advances','salaries']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
        AND policyname = 'Allow all operations for everyone'
    ) THEN
      EXECUTE format(
        'CREATE POLICY "Allow all operations for everyone" ON public.%I FOR ALL USING (true) WITH CHECK (true)', t);
    END IF;
  END LOOP;
END $$;


-- ---------------------------------------------------------------------
-- 5. Storage bucket for customer and worker photos
--    The bucket row uses ON CONFLICT DO NOTHING, and each policy is
--    created only if missing. Skips with a notice if this role may not
--    manage storage objects, rather than failing the whole script.
-- ---------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('images', 'images', true)
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
  names  text[] := ARRAY['Allow Public Read Access on images',
                         'Allow Authorized Uploads on images',
                         'Allow Authorized Updates on images',
                         'Allow Authorized Deletions on images'];
  verbs  text[] := ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
  quals  text[] := ARRAY['USING (bucket_id = ''images'')',
                         'WITH CHECK (bucket_id = ''images'')',
                         'USING (bucket_id = ''images'')',
                         'USING (bucket_id = ''images'')'];
  i int;
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'storage.objects not found — skipping storage policies.';
    RETURN;
  END IF;

  FOR i IN 1 .. array_length(names, 1) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = names[i]
    ) THEN
      BEGIN
        EXECUTE format('CREATE POLICY %I ON storage.objects FOR %s %s', names[i], verbs[i], quals[i]);
      EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
        RAISE NOTICE 'Skipped storage policy "%" (insufficient privilege). Create it from the Storage dashboard.', names[i];
      END;
    END IF;
  END LOOP;
END $$;

COMMIT;


-- ---------------------------------------------------------------------
-- 6. Report
-- ---------------------------------------------------------------------
SELECT
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      AND table_name IN ('config','users','customers','measurements','orders','trials','alterations','invoices','appointments','expenses','workers','attendance','advances','salaries')) AS app_tables_present,
  14 AS app_tables_required,
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public') AS public_policies,
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relrowsecurity) AS rls_enabled_tables,
  'Now run supabase_migration_v2_preflight.sql, then supabase_migration_v2.sql' AS next_step;
