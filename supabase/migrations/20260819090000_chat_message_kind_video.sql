-- ============================================================================
-- Adds 'video' to the message_kind enum.
--
-- This is deliberately a separate migration from 20260819090100_chat_production:
-- Postgres will not let a newly added enum value be *used* inside the same
-- transaction that adds it, and the Supabase CLI runs each migration file in
-- its own transaction. Splitting it means the next migration can reference
-- 'video' freely.
-- ============================================================================

alter type public.message_kind add value if not exists 'video';
