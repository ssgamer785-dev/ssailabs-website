-- ---------------------------------------------------------------------------
-- Phase 1 (1 of 2): a 'file' member for attachment_kind.
--
-- Alone in its own migration on purpose. Postgres will not let a value added
-- by ALTER TYPE ... ADD VALUE be USED in the same transaction that added it,
-- and the Supabase CLI runs each migration file in one transaction. Splitting
-- it off means the next file — which references the enum freely — is running
-- in a transaction where 'file' already exists and is committed.
--
-- Additive only. Nothing is dropped, nothing is rewritten, and every existing
-- row keeps the value it has.
-- ---------------------------------------------------------------------------

alter type public.attachment_kind add value if not exists 'file';
