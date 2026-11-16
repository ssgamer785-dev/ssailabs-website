-- Rollback for 20261116090000_trading_journal.sql
--
-- The journal is new and nothing else depends on it, but its table holds what
-- members have logged. So by default this only switches the feature off at
-- the database (the summary function goes; the table and every trade stay,
-- readable only by their owners as before). Run the commented block at the end
-- only after deciding the trades themselves may be destroyed — and remove the
-- R2 objects under journal/ separately if so.
begin;

drop function if exists public.journal_summary();

notify pgrst, 'reload schema';
commit;

-- Optional, DESTRUCTIVE (deletes every logged trade), NOT run by default:
-- begin;
-- drop trigger if exists journal_trades_guard on public.journal_trades;
-- drop function if exists public.guard_journal_trade();
-- drop table if exists public.journal_trades;
-- notify pgrst, 'reload schema';
-- commit;
