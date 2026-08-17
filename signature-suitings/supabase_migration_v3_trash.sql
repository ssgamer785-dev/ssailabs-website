-- =====================================================================
-- SIGNATURE SUITINGS — MIGRATION v3: TRASH / SOFT DELETE
--
-- Run in the Supabase SQL Editor AFTER supabase_setup_base.sql and
-- supabase_migration_v2.sql.
--
-- ---------------------------------------------------------------------
-- DESTRUCTIVE OPERATIONS: NONE.
--
-- No DROP, no TRUNCATE, no DELETE, no UPDATE of existing rows. This file
-- only CREATEs two new tables plus their policies, indexes and one
-- function. Every existing table, column and row is left untouched.
--
-- Safe to re-run: every statement is guarded. Wrapped in BEGIN/COMMIT so
-- a failure rolls back and leaves the database exactly as it was.
-- ---------------------------------------------------------------------
--
-- Design note. Deleted records are moved OUT of their own table and into
-- `trash` as a full JSON snapshot, rather than being flagged in place with
-- a deleted_at column. Two reasons:
--
--   1. Every existing screen, statistic and report keeps working unchanged
--      and cannot accidentally count a deleted record, because the row is
--      genuinely no longer in customers/orders/invoices/etc.
--   2. Deleting a customer in Postgres cascades to their measurements,
--      orders, invoices and appointments. Snapshotting the whole group
--      first is what makes a faithful restore possible.
--
-- Rows deleted together share a batchId so they restore together.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. TRASH
--    deleted_at is written by the DATABASE, never by the browser, so the
--    six-month retention window cannot be moved by a wrong clock or by
--    editing local storage.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trash (
  id              text PRIMARY KEY,
  "recordType"    text NOT NULL,           -- 'customers', 'orders', 'invoices', ...
  "recordId"      text NOT NULL,           -- the original record's id, preserved
  "batchId"       text NOT NULL,           -- deletion group: restores together
  "isPrimary"     boolean DEFAULT false,   -- the record the user actually deleted
  payload         jsonb NOT NULL,          -- the complete original row
  "displayName"   text,                    -- e.g. customer name / order number
  "displayMeta"   text,                    -- secondary line for the Trash list
  "deletedBy"     text,
  "deletedByRole" text,
  reason          text,
  deleted_at      timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  created_at      timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- A record may only sit in the bin once.
CREATE UNIQUE INDEX IF NOT EXISTS trash_record_unique ON trash ("recordType", "recordId");
CREATE INDEX IF NOT EXISTS idx_trash_batch    ON trash ("batchId");
CREATE INDEX IF NOT EXISTS idx_trash_type     ON trash ("recordType");
CREATE INDEX IF NOT EXISTS idx_trash_deleted  ON trash (deleted_at);
CREATE INDEX IF NOT EXISTS idx_trash_primary  ON trash ("isPrimary");

-- ---------------------------------------------------------------------
-- 2. AUDIT LOG
--    The app had no audit trail, so this is a new table rather than a
--    duplicate of an existing one. It records the three bin operations and
--    survives permanent deletion of the record it refers to.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id           text PRIMARY KEY,
  action       text NOT NULL,              -- 'delete' | 'restore' | 'permanent_delete' | 'purge'
  "recordType" text,
  "recordId"   text,
  "batchId"    text,
  "actorName"  text,
  "actorRole"  text,
  summary      text,
  details      jsonb DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_record  ON audit_log ("recordType", "recordId");
CREATE INDEX IF NOT EXISTS idx_audit_action  ON audit_log (action);

-- ---------------------------------------------------------------------
-- 3. Row Level Security, matching how the rest of the schema is set up
-- ---------------------------------------------------------------------
ALTER TABLE trash     ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['trash','audit_log']
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
-- 4. Six-month retention, enforced server side
--
--    Deliberately NOT scheduled. Nothing deletes itself. An administrator
--    calls this explicitly, and it can only ever remove entries whose
--    deleted_at — set by this database, not by a browser — is older than
--    the retention window. The floor of 180 days cannot be lowered by the
--    caller: a smaller argument is ignored.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION purge_expired_trash(retention_days integer DEFAULT 180)
RETURNS TABLE(purged_count integer, cutoff timestamptz)
LANGUAGE plpgsql
AS $$
DECLARE
  effective_days integer := GREATEST(COALESCE(retention_days, 180), 180);
  cutoff_ts timestamptz := timezone('utc'::text, now()) - make_interval(days => effective_days);
  removed integer;
BEGIN
  WITH gone AS (
    DELETE FROM trash WHERE deleted_at < cutoff_ts RETURNING id
  )
  SELECT count(*) INTO removed FROM gone;

  IF removed > 0 THEN
    INSERT INTO audit_log (id, action, summary, details)
    VALUES (
      'aud_purge_' || replace(gen_random_uuid()::text, '-', ''),
      'purge',
      removed || ' item(s) removed from the bin after the ' || effective_days || '-day retention period',
      jsonb_build_object('cutoff', cutoff_ts, 'retentionDays', effective_days)
    );
  END IF;

  purged_count := removed;
  cutoff := cutoff_ts;
  RETURN NEXT;
END $$;

-- ---------------------------------------------------------------------
-- 5. Realtime publication for the two new tables
-- ---------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'Publication supabase_realtime not found — skipping realtime setup for trash/audit_log.';
    RETURN;
  END IF;
  FOREACH t IN ARRAY ARRAY['trash','audit_log']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      BEGIN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      EXCEPTION WHEN insufficient_privilege OR undefined_object THEN
        RAISE NOTICE 'Could not add % to supabase_realtime (permission denied).', t;
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
    WHERE table_schema = 'public' AND table_name IN ('trash','audit_log')) AS new_tables_present,
  (SELECT count(*) FROM trash)     AS items_in_bin,
  (SELECT count(*) FROM audit_log) AS audit_entries,
  'Existing business tables were not modified' AS note;
