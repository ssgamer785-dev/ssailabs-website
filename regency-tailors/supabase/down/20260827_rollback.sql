-- =========================================================================
-- REGENCY TAILOR — ROLLBACK for the 20260827 migration set
--
-- Destructive: drops every business table and all data in them. Only run
-- against a database you intend to discard, and only after taking a dump:
--
--     pg_dump "$DATABASE_URL" > pre-rollback.sql
--
-- The application keeps working on the localStorage path throughout
-- (VITE_PERSISTENCE=local), so rolling the database back does not strand
-- the showroom.
-- =========================================================================

drop trigger if exists on_auth_user_created on auth.users;

drop view if exists public.trash_items;
drop view if exists public.invoices;
drop view if exists public.customers_with_stats;

drop function if exists public.restore_backup(jsonb, text);
drop function if exists public.export_backup();
drop function if exists public.authorize_admin(text, text);
drop function if exists public.audit_soft_delete();
drop function if exists public.sync_order_advance();
drop function if exists public.touch_updated_at();
drop function if exists public.link_staff_profile();
drop function if exists public.is_authorized_admin();

drop table if exists public.backup_snapshots;
drop table if exists public.audit_log;
drop table if exists public.expenses;
drop table if exists public.workers;
drop table if exists public.fittings;
drop table if exists public.measurement_values;
drop table if exists public.measurements;
drop table if exists public.order_payments;
drop table if exists public.order_items;
drop table if exists public.orders;
drop table if exists public.customers;
drop table if exists public.showroom_settings;
drop table if exists public.staff_profiles;

drop sequence if exists public.order_number_seq;
