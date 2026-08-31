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

-- ================================================================
-- Showroom settings: exported, restored, and never blanked by an
-- older backup that predates settings being carried at all.
-- ================================================================
do $$
declare v_payload jsonb;
begin
    update public.showroom_settings
       set name = 'REGENCY TAILOR', city = 'JALANDHAR',
           address_line1 = 'BOOTAN MANDI,', address_line2 = 'JALANDHAR, PUNJAB 144003',
           phone = '99887 71631', gstin = null
     where id;

    v_payload := public.export_backup();
    perform pg_temp.ok('the export carries showroom settings',
        v_payload ? 'showroom_settings' and v_payload -> 'showroom_settings' <> 'null'::jsonb);
    perform pg_temp.ok('the exported settings hold the real showroom address',
        v_payload #>> '{showroom_settings,address_line2}' = 'JALANDHAR, PUNJAB 144003',
        '(' || coalesce(v_payload #>> '{showroom_settings,address_line2}', 'null') || ')');
end;
$$;

do $$
declare v_payload jsonb; v_addr text; v_name text; v_restored boolean;
begin
    -- Take a backup of the correct settings, then damage the live row and
    -- restore: the settings must come back with everything else.
    v_payload := public.export_backup();

    update public.showroom_settings
       set name = 'WRONG NAME', address_line2 = 'WRONG ADDRESS', phone = '00000 00000'
     where id;

    select (public.restore_backup(v_payload, 'settings restore test') ->> 'showroom_settings_restored')::boolean
      into v_restored;

    select name, address_line2 into v_name, v_addr from public.showroom_settings where id;
    perform pg_temp.ok('the restore reports that settings were restored', v_restored);
    perform pg_temp.ok('the showroom name is restored', v_name = 'REGENCY TAILOR', '(' || v_name || ')');
    perform pg_temp.ok('the showroom address is restored',
        v_addr = 'JALANDHAR, PUNJAB 144003', '(' || v_addr || ')');
end;
$$;

do $$
declare v_payload jsonb; v_addr text; v_restored boolean;
begin
    -- An older file that carries no settings at all must leave the showroom's
    -- own address alone rather than blanking what prints on every bill.
    v_payload := public.export_backup() - 'showroom_settings';
    perform pg_temp.ok('the test payload really has no settings', not (v_payload ? 'showroom_settings'));

    select (public.restore_backup(v_payload, 'legacy payload test') ->> 'showroom_settings_restored')::boolean
      into v_restored;

    select address_line2 into v_addr from public.showroom_settings where id;
    perform pg_temp.ok('a backup without settings reports none restored', not v_restored);
    perform pg_temp.ok('a backup without settings preserves the existing address',
        v_addr = 'JALANDHAR, PUNJAB 144003', '(' || coalesce(v_addr, 'null') || ')');
end;
$$;

do $$
declare v_rejected boolean := false;
begin
    begin
        perform public.restore_backup(
            jsonb_build_object('customers', '[]'::jsonb, 'orders', '[]'::jsonb,
                               'order_items', '[]'::jsonb, 'measurements', '[]'::jsonb,
                               'showroom_settings', '"not an object"'::jsonb), 't');
    exception when others then v_rejected := true;
    end;
    perform pg_temp.ok('malformed showroom settings are rejected', v_rejected);
end;
$$;

-- ================================================================
-- Audit log: preserved in the export, never written back by a restore.
-- Append-only means a backup file must not be able to rewrite history.
-- ================================================================
do $$
declare v_payload jsonb; v_count int;
begin
    select count(*) into v_count from public.audit_log;
    perform pg_temp.ok('the showroom has audit history to preserve', v_count > 0, '(rows: ' || v_count || ')');

    v_payload := public.export_backup();
    perform pg_temp.ok('the export carries the audit log', v_payload ? 'audit_log');
    perform pg_temp.ok('the exported audit log holds every row',
        jsonb_array_length(v_payload -> 'audit_log') = v_count,
        '(' || jsonb_array_length(v_payload -> 'audit_log') || ' of ' || v_count || ')');
end;
$$;

do $$
declare
    v_payload jsonb;
    v_before int;
    v_after int;
    v_result jsonb;
    v_forged_present int;
begin
    select count(*) into v_before from public.audit_log;

    -- A file claiming a fabricated history. The restore must ignore it
    -- entirely: nothing from the file may enter the audit trail.
    v_payload := public.export_backup();
    v_payload := jsonb_set(v_payload, '{audit_log}', jsonb_build_array(
        jsonb_build_object(
            'id', 999999, 'actor_email', 'forged@example.com',
            'action', 'FORGED_ENTRY', 'entity_type', 'database',
            'details', '{}'::jsonb, 'created_at', now())));

    v_result := public.restore_backup(v_payload, 'audit log test');

    perform pg_temp.ok('the restore states it did not restore the audit log',
        (v_result ->> 'audit_log_restored')::boolean = false);

    select count(*) into v_forged_present from public.audit_log where action = 'FORGED_ENTRY';
    perform pg_temp.ok('a forged audit entry from a backup file is never written',
        v_forged_present = 0, '(found ' || v_forged_present || ')');

    -- The genuine history survives, and the restore appends its own record.
    select count(*) into v_after from public.audit_log;
    perform pg_temp.ok('existing audit history survives the restore untouched',
        v_after >= v_before, '(' || v_before || ' -> ' || v_after || ')');
    perform pg_temp.ok('the restore itself is recorded in the audit log',
        exists (select 1 from public.audit_log where action = 'restore_backup'));
end;
$$;

-- ================================================================
-- The sequence still cannot re-issue a printed order number after the
-- settings and audit changes.
-- ================================================================
do $$
declare v_max bigint; v_next bigint;
begin
    select coalesce(max(order_number), 0) into v_max from public.orders;
    select nextval('public.order_number_seq') into v_next;
    perform pg_temp.ok('the next order number is beyond every restored one',
        v_next > v_max, '(next ' || v_next || ' vs max ' || v_max || ')');
end;
$$;

reset role;
