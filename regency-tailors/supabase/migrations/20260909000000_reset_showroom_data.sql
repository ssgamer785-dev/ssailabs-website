-- =========================================================================
-- Regency Tailor — "Reset All Data", from inside the dashboard
--
-- The showroom needs to start its live books empty. Until now that meant
-- pasting a script into the Supabase SQL Editor, which is a place the owner
-- should never have to go: one careless edit there and the schema, the admin
-- allowlist or another project's data is gone.
--
-- So the reset lives here, as one function the dashboard can call. What makes
-- that safe is what the function refuses to do:
--
--   It decides authorisation itself, through is_authorized_admin(), so a
--   signed-in browser cannot reach it by knowing its name.
--
--   It takes no table name, no predicate and no SQL from the caller. There is
--   no dynamic SQL in it at all. The only argument is a typed confirmation
--   phrase, so a mis-click or a stray fetch cannot fire it.
--
--   It is one function body, so it is one transaction: every table is emptied
--   or none is.
--
-- WHAT IT REMOVES        customers, orders, order_items, order_payments,
--                        measurements, measurement_values, fittings, audit_log
--
-- WHAT IT KEEPS          auth.users, staff_profiles (the admin allowlist),
--                        showroom_settings, workers, expenses,
--                        backup_snapshots, and every table, constraint,
--                        index, policy, grant and function in the database
--
-- The order-number sequence is returned to 1 as the last step, so the first
-- order placed afterwards is #1. `false` means the value has not been used
-- yet, which is what makes it 1 rather than 2.
-- =========================================================================

create or replace function public.reset_showroom_data(p_confirmation text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_counts jsonb := '{}'::jsonb;
    v_n      bigint;
begin
    -- 1. Authorisation, decided here rather than by the caller.
    if not public.is_authorized_admin() then
        raise exception 'Not authorised to reset showroom data'
            using errcode = '42501';
    end if;

    -- 2. The phrase is typed by a person. It is not a password — the check
    --    above is what protects the data — but it is what stops a stray click
    --    or a repeated request from emptying the showroom's books.
    if p_confirmation is distinct from 'RESET ALL DATA' then
        raise exception 'Type RESET ALL DATA exactly to confirm'
            using errcode = '22023';
    end if;

    -- 3. Children before parents. orders.customer_id is ON DELETE RESTRICT,
    --    so a customer cannot go while an order still points at them.
    delete from public.order_payments    where order_id is not null;
    get diagnostics v_n = row_count;  v_counts := v_counts || jsonb_build_object('order_payments', v_n);

    delete from public.order_items       where order_id is not null;
    get diagnostics v_n = row_count;  v_counts := v_counts || jsonb_build_object('order_items', v_n);

    delete from public.fittings          where order_id is not null;
    get diagnostics v_n = row_count;  v_counts := v_counts || jsonb_build_object('fittings', v_n);

    delete from public.measurement_values where measurement_id is not null;
    get diagnostics v_n = row_count;  v_counts := v_counts || jsonb_build_object('measurement_values', v_n);

    delete from public.measurements      where customer_id is not null;
    get diagnostics v_n = row_count;  v_counts := v_counts || jsonb_build_object('measurements', v_n);

    delete from public.orders            where id is not null;
    get diagnostics v_n = row_count;  v_counts := v_counts || jsonb_build_object('orders', v_n);

    delete from public.customers         where id is not null;
    get diagnostics v_n = row_count;  v_counts := v_counts || jsonb_build_object('customers', v_n);

    delete from public.audit_log         where id is not null;
    get diagnostics v_n = row_count;  v_counts := v_counts || jsonb_build_object('audit_log', v_n);

    -- 4. Back to #1. This is the only order counter that exists: the column
    --    defaults to nextval() and the application never sends a number, so
    --    no browser or desktop copy can disagree with it.
    perform setval('public.order_number_seq', 1, false);

    return v_counts || jsonb_build_object('next_order_number', 1);
end;
$$;

revoke all on function public.reset_showroom_data(text) from public, anon;
grant execute on function public.reset_showroom_data(text) to authenticated;

comment on function public.reset_showroom_data(text) is
    'Empties the showroom''s business records and returns order numbering to #1. '
    'Admin only, checked inside the function. Keeps auth, the admin allowlist, '
    'showroom settings, workers, expenses, backups and the whole schema.';
