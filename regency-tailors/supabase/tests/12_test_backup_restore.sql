-- =========================================================================
-- Backup export / restore: authorisation, validation, and the guarantee that
-- a failed restore never partially overwrites production data.
-- =========================================================================
\set ON_ERROR_STOP on

create or replace function pg_temp.ok(p_label text, p_condition boolean, p_detail text default '')
returns void language plpgsql as $$
begin
    if p_condition then
        raise notice 'PASS  %  %', p_label, p_detail;
    else
        raise exception 'FAIL  %  %', p_label, p_detail;
    end if;
end;
$$;

insert into auth.users (id, email) values
    ('11111111-1111-1111-1111-111111111111', 'owner@example.com'),
    ('22222222-2222-2222-2222-222222222222', 'stranger@example.com')
on conflict do nothing;
select public.authorize_admin('owner@example.com', 'Showroom Owner');

set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","email":"owner@example.com"}';

-- Start from a known-empty dataset: this file asserts on exact row counts and
-- the runner shares one cluster across all test files.
delete from public.measurement_values;
delete from public.measurements;
delete from public.order_payments;
delete from public.order_items;
delete from public.fittings;
delete from public.orders;
delete from public.customers;
delete from public.backup_snapshots;

-- ------------------------------------------------------- live production
do $$
declare v_cust uuid; v_order uuid;
begin
    insert into public.customers (id, name, phone)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 'Production Client', '9700000001') returning id into v_cust;

    insert into public.orders (id, customer_id, customer_name, customer_phone, delivery_date, total_amount)
    values ('cccccccc-0000-0000-0000-000000000001', v_cust, 'Production Client', '9700000001', current_date + 9, 25000)
    returning id into v_order;

    -- 'Full Coat Pant' is deliberate: the showroom no longer sells a combined
    -- coat-and-pant garment, but orders placed before the split still carry it.
    -- garment_type is free text with no enum behind it, so nothing had to be
    -- migrated -- this row proves such an order still survives a backup and
    -- restore intact rather than being dropped or rewritten.
    insert into public.order_items (order_id, position, garment_type, price, quantity, remarks)
    values (v_order, 1, 'Full Coat Pant', 20000, 1, 'Peak lapel'),
           (v_order, 2, 'Shirt', 2500, 2, 'French cuff');

    insert into public.order_payments (order_id, amount, method) values (v_order, 10000, 'Cash');
end;
$$;

-- ------------------------------------------------------------ export
do $$
declare v_payload jsonb;
begin
    v_payload := public.export_backup();
    perform pg_temp.ok('export contains every collection',
        v_payload ? 'customers' and v_payload ? 'orders' and v_payload ? 'order_items'
        and v_payload ? 'order_payments' and v_payload ? 'measurements'
        and v_payload ? 'measurement_values' and v_payload ? 'order_sequence');
    perform pg_temp.ok('export carries the order-number high-water mark',
        (v_payload ->> 'order_sequence')::bigint > 0,
        '(seq: ' || (v_payload ->> 'order_sequence') || ')');
    perform pg_temp.ok('export preserves per-garment remarks',
        v_payload::text like '%Peak lapel%' and v_payload::text like '%French cuff%');
end;
$$;

-- ------------------------------------- an unauthorised account cannot export
reset role;
do $$
declare v_denied boolean := false;
begin
    begin
        set local role authenticated;
        set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","email":"stranger@example.com"}';
        perform public.export_backup();
    exception when insufficient_privilege then
        v_denied := true;
    end;
    reset role;
    perform pg_temp.ok('an unauthorised account cannot export the database', v_denied);
end;
$$;

do $$
declare v_denied boolean := false;
begin
    begin
        set local role authenticated;
        set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","email":"stranger@example.com"}';
        perform public.restore_backup('{"customers":[],"orders":[]}'::jsonb, 'attack');
    exception when insufficient_privilege then
        v_denied := true;
    end;
    reset role;
    perform pg_temp.ok('an unauthorised account cannot restore over the database', v_denied);
end;
$$;

set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","email":"owner@example.com"}';

-- ------------------------- a failed restore must not touch production data
do $$
declare v_before jsonb; v_customers int; v_orders int; v_items int; v_failed boolean := false;
begin
    v_before := public.export_backup();

    -- Orders referencing a customer that is not in the file: rejected.
    begin
        perform public.restore_backup(jsonb_build_object(
            'customers', '[]'::jsonb,
            'orders', jsonb_build_array(jsonb_build_object(
                'id', 'dddddddd-0000-0000-0000-000000000001',
                'customer_id', 'eeeeeeee-0000-0000-0000-000000000001',
                'customer_name', 'Ghost', 'customer_phone', '9000000000',
                'delivery_date', current_date::text, 'order_number', 9001))
        ), 'inconsistent file');
    exception when others then
        v_failed := true;
    end;

    select count(*) into v_customers from public.customers;
    select count(*) into v_orders    from public.orders;
    select count(*) into v_items     from public.order_items;

    perform pg_temp.ok('an inconsistent backup is rejected', v_failed);
    perform pg_temp.ok('production customers survive a rejected restore', v_customers = 1, '(rows: ' || v_customers || ')');
    perform pg_temp.ok('production orders survive a rejected restore',    v_orders = 1,    '(rows: ' || v_orders || ')');
    perform pg_temp.ok('production garment lines survive a rejected restore', v_items = 2, '(rows: ' || v_items || ')');
end;
$$;

do $$
declare v_failed boolean := false; v_orders int;
begin
    -- A payload that passes shape validation but violates a constraint
    -- mid-insert must still roll the whole restore back.
    begin
        perform public.restore_backup(jsonb_build_object(
            'customers', jsonb_build_array(
                jsonb_build_object('id','ffffffff-0000-0000-0000-000000000001','name','Valid','phone','9600000001'),
                jsonb_build_object('id','ffffffff-0000-0000-0000-000000000002','name','','phone','123')
            ),
            'orders', '[]'::jsonb
        ), 'constraint violation mid-restore');
    exception when others then
        v_failed := true;
    end;

    select count(*) into v_orders from public.orders;
    perform pg_temp.ok('a constraint violation mid-restore aborts the whole restore', v_failed);
    perform pg_temp.ok('no partial data is left behind after the abort',
        v_orders = 1 and (select count(*) from public.customers where name = 'Valid') = 0,
        '(orders still ' || v_orders || ')');
end;
$$;

-- ------------------------------------------------------- a good restore
do $$
declare v_payload jsonb; v_result jsonb; v_orders int; v_items int; v_advance numeric; v_seq bigint;
begin
    v_payload := public.export_backup();

    -- Wipe as a "clear only the test dataset" would, then restore.
    delete from public.order_payments;
    delete from public.order_items;
    delete from public.orders;
    delete from public.customers;
    perform pg_temp.ok('database is empty before the restore',
        (select count(*) from public.orders) = 0);

    v_result := public.restore_backup(v_payload, 'round trip test');

    select count(*) into v_orders from public.orders;
    select count(*) into v_items  from public.order_items;
    select advance_paid into v_advance from public.orders limit 1;
    v_seq := (select last_value from public.order_number_seq);

    perform pg_temp.ok('the order is restored', v_orders = 1);
    perform pg_temp.ok('every garment line is restored', v_items = 2, '(rows: ' || v_items || ')');
    perform pg_temp.ok('recorded payments are restored', v_advance = 10000, '(₹' || v_advance || ')');
    perform pg_temp.ok('remarks survive the round trip',
        (select remarks from public.order_items where position = 1) = 'Peak lapel');
    perform pg_temp.ok('the order-number sequence resumes correctly',
        v_seq >= (select max(order_number) from public.orders),
        '(seq ' || v_seq || ')');
    perform pg_temp.ok('a safety snapshot was taken before overwriting',
        (v_result ->> 'snapshot_id') is not null);
end;
$$;

do $$
declare v_snapshots int;
begin
    select count(*) into v_snapshots from public.backup_snapshots;
    perform pg_temp.ok('pre-restore snapshots are retained for rollback', v_snapshots >= 1,
                       '(snapshots: ' || v_snapshots || ')');
end;
$$;

-- -------------------------------------------------- malformed payloads
do $$
declare v_rejected int := 0;
begin
    begin perform public.restore_backup('[]'::jsonb, 't');            exception when others then v_rejected := v_rejected + 1; end;
    begin perform public.restore_backup('"a string"'::jsonb, 't');    exception when others then v_rejected := v_rejected + 1; end;
    begin perform public.restore_backup(
        '{"customers":"not-an-array","orders":[]}'::jsonb, 't');       exception when others then v_rejected := v_rejected + 1; end;
    perform pg_temp.ok('malformed payloads are all rejected', v_rejected = 3, '(rejected ' || v_rejected || '/3)');
end;
$$;

do $$
declare v_orders int;
begin
    select count(*) into v_orders from public.orders;
    perform pg_temp.ok('production data is intact after every malformed attempt', v_orders = 1);
end;
$$;

reset role;
