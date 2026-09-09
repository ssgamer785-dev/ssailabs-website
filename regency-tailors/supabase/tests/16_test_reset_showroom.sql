-- =========================================================================
-- "Reset All Data" — what it empties, what it must never touch.
--
-- The dashboard can now empty the showroom's books. The whole safety of that
-- rests on three things, and each is asserted here rather than assumed: a
-- stranger cannot call it, a mis-click cannot fire it, and everything that
-- makes the application work is still there afterwards.
-- =========================================================================
\set ON_ERROR_STOP on
\set QUIET on
\pset pager off

create or replace function pg_temp.ok(p_label text, p_cond boolean, p_detail text default '')
returns void language plpgsql as $$
begin
    if p_cond then raise notice 'PASS  %  %', p_label, p_detail;
    else raise exception 'FAIL  %  %', p_label, p_detail; end if;
end;
$$;

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111','owner@example.com')
    on conflict (id) do nothing;
insert into auth.users (id, email) values ('22222222-2222-2222-2222-222222222222','stranger@example.com')
    on conflict (id) do nothing;
select public.authorize_admin('owner@example.com','Showroom Owner');

create or replace function pg_temp.sign_in(p_uid uuid, p_email text)
returns void language plpgsql as $$
begin
    perform set_config('request.jwt.claims',
        json_build_object('sub', p_uid, 'email', p_email, 'role','authenticated')::text, false);
end;
$$;

/* ------------------------------------------------------------ seed a shop */
select pg_temp.sign_in('11111111-1111-1111-1111-111111111111','owner@example.com');
do $$
declare c uuid; o uuid; m uuid;
begin
    for i in 1..3 loop
        insert into public.customers (name, phone) values ('Client '||i, '98100000'||(10+i))
        returning id into c;
        insert into public.orders (customer_id, customer_name, customer_phone, order_date, delivery_date)
        values (c,'Client '||i,'98100000'||(10+i), current_date, current_date + 7) returning id into o;
        insert into public.order_items (order_id, position, garment_type, quantity, price)
        values (o, 1, '3 Piece Suit', 1, 0);
        insert into public.order_payments (order_id, paid_on, amount, method)
        values (o, current_date, 100, 'Cash');
        insert into public.measurements (customer_id) values (c) returning id into m;
        insert into public.measurement_values (measurement_id, garment_category, data)
        values (m, 'waistcoat', '{"length":"25"}'::jsonb);
    end loop;
end;
$$;

/* ----------------------------------------------- a stranger cannot call it */
do $$
declare v_blocked boolean := false; v_before bigint; v_after bigint;
begin
    -- Earlier suites share this database and leave rows of their own, so the
    -- assertion is that nothing changed, not that some absolute count holds.
    select count(*) into v_before from public.customers;

    perform pg_temp.sign_in('22222222-2222-2222-2222-222222222222','stranger@example.com');
    begin
        perform public.reset_showroom_data('RESET ALL DATA');
    exception when insufficient_privilege then
        v_blocked := true;
    end;
    perform pg_temp.ok('a signed-in stranger cannot reset the showroom', v_blocked);

    -- Count as the admin: RLS hides every row from the stranger, so counting
    -- as them would read 0 whether or not the reset had run.
    perform pg_temp.sign_in('11111111-1111-1111-1111-111111111111','owner@example.com');
    select count(*) into v_after from public.customers;
    perform pg_temp.ok('and nothing of theirs was emptied', v_after = v_before,
        format('%s before, %s after', v_before, v_after));
end;
$$;

/* ------------------------------------------- the wrong phrase does nothing */
do $$
declare v_blocked boolean := false;
begin
    perform pg_temp.sign_in('11111111-1111-1111-1111-111111111111','owner@example.com');
    foreach v_blocked in array array[false] loop end loop;
    begin
        perform public.reset_showroom_data('reset all data');   -- wrong case
    exception when others then
        v_blocked := true;
    end;
    perform pg_temp.ok('the confirmation phrase is exact', v_blocked);
    perform pg_temp.ok('and the books are still there',
        (select count(*) from public.orders) > 0);
end;
$$;

do $$
declare v_blocked boolean := false;
begin
    begin
        perform public.reset_showroom_data(null);
    exception when others then
        v_blocked := true;
    end;
    perform pg_temp.ok('a null confirmation is refused', v_blocked);
end;
$$;

/* ------------------------------------------------------- what it preserves */
do $$
declare v_admins bigint; v_settings bigint; v_users bigint; v_policies bigint; v_tables bigint;
begin
    select count(*) into v_admins   from public.staff_profiles;
    select count(*) into v_settings from public.showroom_settings;
    select count(*) into v_users    from auth.users;
    select count(*) into v_policies from pg_policies where schemaname = 'public';
    select count(*) into v_tables   from information_schema.tables where table_schema = 'public';
    perform set_config('test.admins',   v_admins::text,   false);
    perform set_config('test.settings', v_settings::text, false);
    perform set_config('test.users',    v_users::text,    false);
    perform set_config('test.policies', v_policies::text, false);
    perform set_config('test.tables',   v_tables::text,   false);
end;
$$;

/* ------------------------------------------------------------- the reset */
do $$
declare v_result jsonb;
begin
    perform pg_temp.sign_in('11111111-1111-1111-1111-111111111111','owner@example.com');
    v_result := public.reset_showroom_data('RESET ALL DATA');

    perform pg_temp.ok('it reports what it removed',
        (v_result ->> 'orders')::int >= 3 and (v_result ->> 'customers')::int >= 3,
        v_result::text);

    perform pg_temp.ok('customers are gone',          (select count(*) from public.customers) = 0);
    perform pg_temp.ok('orders are gone',             (select count(*) from public.orders) = 0);
    perform pg_temp.ok('order lines are gone',        (select count(*) from public.order_items) = 0);
    perform pg_temp.ok('payments are gone',           (select count(*) from public.order_payments) = 0);
    perform pg_temp.ok('measurements are gone',       (select count(*) from public.measurements) = 0);
    perform pg_temp.ok('measurement values are gone', (select count(*) from public.measurement_values) = 0);
    perform pg_temp.ok('fittings are gone',           (select count(*) from public.fittings) = 0);
    perform pg_temp.ok('the audit log is gone',       (select count(*) from public.audit_log) = 0);

    perform pg_temp.ok('the admin allowlist survived',
        (select count(*) from public.staff_profiles) = current_setting('test.admins')::bigint);
    perform pg_temp.ok('showroom settings survived',
        (select count(*) from public.showroom_settings) = current_setting('test.settings')::bigint);
    perform pg_temp.ok('auth users survived',
        (select count(*) from auth.users) = current_setting('test.users')::bigint);
    perform pg_temp.ok('every RLS policy survived',
        (select count(*) from pg_policies where schemaname = 'public')
          = current_setting('test.policies')::bigint);
    perform pg_temp.ok('every table survived',
        (select count(*) from information_schema.tables where table_schema = 'public')
          = current_setting('test.tables')::bigint);
    perform pg_temp.ok('the admin can still be recognised', public.is_authorized_admin());
end;
$$;

/* ------------------------------------------- the first order afterwards is #1 */
do $$
declare c uuid; v_first bigint;
begin
    insert into public.customers (name, phone) values ('First After Reset','9700000001') returning id into c;
    insert into public.orders (customer_id, customer_name, customer_phone, order_date, delivery_date)
    values (c,'First After Reset','9700000001', current_date, current_date + 7)
    returning order_number into v_first;
    perform pg_temp.ok('the first order after the reset is #1', v_first = 1, format('#%s', v_first));
end;
$$;

/* ---------------------------------------- and it can be run again, cleanly */
do $$
declare v_result jsonb; c uuid; v_first bigint;
begin
    v_result := public.reset_showroom_data('RESET ALL DATA');
    perform pg_temp.ok('resetting an already-empty showroom is not an error',
        (v_result ->> 'customers')::int >= 0, v_result::text);

    insert into public.customers (name, phone) values ('Second Launch','9700000002') returning id into c;
    insert into public.orders (customer_id, customer_name, customer_phone, order_date, delivery_date)
    values (c,'Second Launch','9700000002', current_date, current_date + 7)
    returning order_number into v_first;
    perform pg_temp.ok('and numbering starts at #1 again', v_first = 1, format('#%s', v_first));
end;
$$;

do $$ begin perform pg_temp.ok('reset suite completed', true); end; $$;
