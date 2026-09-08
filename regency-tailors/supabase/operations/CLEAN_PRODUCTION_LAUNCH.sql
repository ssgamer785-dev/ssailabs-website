-- =========================================================================
-- REGENCY TAILOR — CLEAN PRODUCTION LAUNCH
--
-- Empties the showroom's business records so the client starts from nothing,
-- and returns order numbering to #1. Everything that makes the application
-- work is left exactly as it is.
--
-- THIS IS NOT A MIGRATION. It lives outside supabase/migrations on purpose:
-- migrations run themselves, and this must never run itself. Paste it into
-- the Supabase SQL Editor, deliberately, once, when the showroom is ready to
-- go live — and not before the QA on the new garments has passed.
--
-- IT DELETES REAL CUSTOMER RECORDS AND CANNOT BE UNDONE from inside the
-- database. Take a backup first (see step 0).
--
-- ---------------------------------------------------------------- REMOVED
--   customers            every customer
--   orders               every order, and its number history
--   order_items          every garment line
--   order_payments       every recorded payment
--   measurements         every measurement profile
--   measurement_values   every recorded measurement
--   fittings             every fitting record
--   audit_log            the record of the above having existed
--
-- ---------------------------------------------------------------- UNTOUCHED
--   auth.users           the Google account that signs in
--   staff_profiles       the admin allowlist — sign-in fails without it
--   showroom_settings    business name, address, bill footer, preferences
--   every table, column, constraint, index, function, trigger, view
--   every RLS policy and grant
--   the measurement and garment definitions (they live in the application,
--                                            not as rows)
--
-- ------------------------------------------------------------- DECIDE FIRST
--   workers   the karigars on the payroll. Kept by default: they are staff,
--             not order data. Uncomment in step 3 to clear them.
--   expenses  the shop's own spending. Kept by default for the same reason.
--   backup_snapshots  previous backups. Kept by default — clearing them
--             throws away the only copy of what this script deletes.
-- =========================================================================


-- -------------------------------------------------------------------------
-- STEP 0 — BACK UP FIRST. Run this alone, and save the result somewhere off
--          the database. It is the same payload the application's Backup
--          screen produces, so it can be restored through Backup & Recovery.
-- -------------------------------------------------------------------------
-- select public.export_backup();


-- -------------------------------------------------------------------------
-- STEP 1 — SEE WHAT WILL GO. Run this alone and read it before step 2.
-- -------------------------------------------------------------------------
select 'customers'          as table_name, count(*) as rows_to_delete from public.customers
union all select 'orders',            count(*) from public.orders
union all select 'order_items',       count(*) from public.order_items
union all select 'order_payments',    count(*) from public.order_payments
union all select 'measurements',      count(*) from public.measurements
union all select 'measurement_values',count(*) from public.measurement_values
union all select 'fittings',          count(*) from public.fittings
union all select 'audit_log',         count(*) from public.audit_log
union all select '-- KEPT: staff_profiles',   count(*) from public.staff_profiles
union all select '-- KEPT: showroom_settings',count(*) from public.showroom_settings
union all select '-- KEPT: workers',          count(*) from public.workers
union all select '-- KEPT: expenses',         count(*) from public.expenses
order by 1;


-- -------------------------------------------------------------------------
-- STEP 2 — THE RESET.
--
-- One transaction: it all happens or none of it does, so a failure halfway
-- cannot leave orders without their customers.
--
-- The order of the deletes is not arbitrary. orders.customer_id is ON DELETE
-- RESTRICT, so a customer cannot go while any order still points at them —
-- children first, parents last. The cascades would handle most of it, but
-- naming every table means this script says exactly what it removes rather
-- than leaving it to be inferred.
--
-- Each statement carries a WHERE clause that is deliberately always true, so
-- that the intent is explicit and no statement can be copied elsewhere and
-- silently empty a table by accident.
-- -------------------------------------------------------------------------
begin;

    -- Order children.
    delete from public.order_payments where order_id is not null;
    delete from public.order_items    where order_id is not null;
    delete from public.fittings       where order_id is not null;

    -- Measurement children, then the profiles.
    delete from public.measurement_values where measurement_id is not null;
    delete from public.measurements       where customer_id is not null;

    -- Nothing else points at an order by now: measurements.last_order_id is
    -- the only other reference and those rows are already gone.
    -- Orders, then the customers they belonged to.
    delete from public.orders    where id is not null;
    delete from public.customers where id is not null;

    -- The history of the records just removed.
    delete from public.audit_log where id is not null;

    -- STEP 3 — OPTIONAL. Uncomment only what the showroom wants cleared.
    -- delete from public.workers          where id is not null;
    -- delete from public.expenses         where id is not null;
    -- delete from public.backup_snapshots where id is not null;

    -- -------------------------------------------------------------------
    -- Order numbering back to the start.
    --
    -- `false` as the third argument means "this value has not been used
    -- yet", so the very next nextval() returns 1 and the first order the
    -- showroom places is #1. With `true` it would return 2 and the first
    -- order would be #2.
    --
    -- This is the only counter there is. The number is a column default of
    -- nextval() and the application never sends one, so nothing in the
    -- browser, in Electron, or in local storage has a copy of it to disagree
    -- with.
    -- -------------------------------------------------------------------
    select setval('public.order_number_seq', 1, false);

commit;


-- -------------------------------------------------------------------------
-- STEP 4 — CONFIRM. Every count zero, the admin still present, the next
--          number 1.
-- -------------------------------------------------------------------------
select
    (select count(*) from public.customers)          as customers,
    (select count(*) from public.orders)             as orders,
    (select count(*) from public.order_items)        as order_items,
    (select count(*) from public.measurements)       as measurements,
    (select count(*) from public.measurement_values) as measurement_values,
    (select count(*) from public.staff_profiles)     as admins_kept,
    (select count(*) from public.showroom_settings)  as settings_kept,
    (select last_value from public.order_number_seq) as sequence_at,
    (select is_called from public.order_number_seq)  as sequence_used;
-- Expected: the first five 0, admins_kept and settings_kept unchanged,
-- sequence_at 1 and sequence_used false — so the next order is #1.
