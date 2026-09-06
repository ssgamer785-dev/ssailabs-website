-- =========================================================================
-- Backup round trip, in full.
--
-- The showroom could not import their own file at all:
--
--   Failed to restore backup: Could not restore the backup:
--   DELETE requires a WHERE clause
--
-- because restore_backup cleared its nine tables with bare DELETEs and
-- Supabase preloads pg_safeupdate, which refuses them. A plain PostgreSQL
-- cluster runs them happily, which is exactly why the suite that already
-- exercised restore end to end never saw it — that half of the fix is pinned
-- by src/utils/__tests__/migrationSafety.test.ts, which reads the SQL rather
-- than running it.
--
-- What is checked here is everything the corrected statement has to keep
-- doing: a complete tree out and back with its relationships, its identity,
-- its soft-delete state and its sequence intact, and nothing half-written
-- when a payload is bad.
-- =========================================================================
\set ON_ERROR_STOP on
\set QUIET on
\pset pager off

create or replace function pg_temp.ok(p_label text, p_cond boolean, p_detail text default '')
returns void language plpgsql as $$
begin
    if p_cond then
        raise notice 'PASS  %  %', p_label, p_detail;
    else
        raise exception 'FAIL  %  %', p_label, p_detail;
    end if;
end;
$$;

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'owner@example.com')
    on conflict (id) do nothing;
select public.authorize_admin('owner@example.com', 'Showroom Owner');
select set_config('request.jwt.claims',
    json_build_object('sub', '11111111-1111-1111-1111-111111111111',
                      'email', 'owner@example.com', 'role', 'authenticated')::text, false);
-- The fixture is built as the owner: `authenticated` deliberately has no
-- TRUNCATE grant, which is asserted at the end of this file. This helper is
-- created here, before the role switch, so it is owned by the same role.
create or replace function pg_temp.wipe() returns void language plpgsql security definer as $$
begin
    truncate table
        public.measurement_values, public.measurements,
        public.order_payments, public.order_items, public.fittings,
        public.orders, public.customers, public.workers, public.expenses;
end;
$$;

truncate table
    public.measurement_values, public.measurements,
    public.order_payments, public.order_items, public.fittings,
    public.orders, public.customers, public.workers, public.expenses;

set role authenticated;

insert into public.customers (id, name, phone, email, address, city, notes) values
    ('c0000000-0000-4000-8000-00000000000a', 'Round Trip A', '9820000001', 'a@example.com', 'Bootan Mandi', 'Jalandhar', 'prefers slim'),
    ('c0000000-0000-4000-8000-00000000000b', 'Round Trip B', '9820000002', null, 'Model Town', 'Jalandhar', null);
-- One customer already in the trash: the soft-delete state must survive too.
update public.customers set deleted_at = '2026-09-01T10:00:00Z'
 where id = 'c0000000-0000-4000-8000-00000000000b';

insert into public.orders (id, customer_id, customer_name, customer_phone, customer_address,
                           order_date, delivery_date, special_instructions, status, production_status) values
    ('00000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-00000000000a', 'Round Trip A', '9820000001', 'Bootan Mandi, Jalandhar', '2026-09-01', '2026-09-20', 'contrast buttons', 'Fabric Cutting', 'In Production'),
    ('00000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-00000000000a', 'Round Trip A', '9820000001', 'Bootan Mandi, Jalandhar', '2026-09-02', '2026-09-25', null, 'New', 'New'),
    ('00000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-00000000000b', 'Round Trip B', '9820000002', 'Model Town, Jalandhar', '2026-09-03', '2026-09-28', null, 'New', 'New');
update public.orders set deleted_at = '2026-09-04T10:00:00Z'
 where id = '00000000-0000-4000-8000-000000000003';

insert into public.order_items (order_id, position, garment_type, quantity, price, remarks) values
    ('00000000-0000-4000-8000-000000000001', 1, 'Coat',  4, 0, 'Peak lapel'),
    ('00000000-0000-4000-8000-000000000001', 2, 'Pant',  4, 0, null),
    ('00000000-0000-4000-8000-000000000001', 3, 'Shirt', 3, 0, 'French cuff'),
    ('00000000-0000-4000-8000-000000000001', 4, 'Kurta Pajama', 3, 0, null),
    ('00000000-0000-4000-8000-000000000002', 1, 'Coat',  1, 0, null),
    ('00000000-0000-4000-8000-000000000003', 1, 'Shirt', 2, 0, null);

insert into public.order_payments (order_id, amount, method, note) values
    ('00000000-0000-4000-8000-000000000001', 7500, 'UPI', 'advance');

insert into public.fittings (order_id, scheduled_date, status) values
    ('00000000-0000-4000-8000-000000000001', '2026-09-15', 'Scheduled');

insert into public.measurements (id, customer_id, unit, last_order_id, fit_preference) values
    ('11111111-0000-4000-8000-00000000000a', 'c0000000-0000-4000-8000-00000000000a', 'inches', '00000000-0000-4000-8000-000000000001', 'Slim'),
    ('11111111-0000-4000-8000-00000000000b', 'c0000000-0000-4000-8000-00000000000b', 'inches', null, null);

insert into public.measurement_values (measurement_id, garment_category, data) values
    ('11111111-0000-4000-8000-00000000000a', 'coat',
     '{"length":"31.5","chest":"40","stomach":"36","hip":"41","shoulder":"18.5","sleeve":"25","xBack":"17.5","collar":"16","jacketLength":"30","waistcoatLength":"25"}'),
    ('11111111-0000-4000-8000-00000000000a', 'pant',
     '{"length":"40","waist":"34","hip":"40.5","thigh":"24.5","inLeg":"31","bottom":"15","body":"11"}'),
    ('11111111-0000-4000-8000-00000000000b', 'shirt', '{"length":"29","chest":"38"}');

insert into public.workers (name, role, phone, type) values ('Master Ji', 'Tailor', '9820000003', 'Per Garment');
insert into public.expenses (spent_on, category, description, amount, paid_to) values ('2026-09-01', 'Fabric', 'wool', 12000, 'Mill');

-- =========================================================================
\echo ''
\echo '--- EXPORT ---'
create table if not exists pg_temp.captured (payload jsonb, audit_before int, seq_before bigint);
do $$
declare v jsonb := public.export_backup();
begin
    insert into pg_temp.captured values (v, (select count(*) from public.audit_log),
                                            (select last_value from public.order_number_seq));

    perform pg_temp.ok('the export carries both customers, trashed one included',
        (select count(*) from jsonb_array_elements(v -> 'customers')) = 2);
    perform pg_temp.ok('all three orders, trashed one included',
        (select count(*) from jsonb_array_elements(v -> 'orders')) = 3);
    perform pg_temp.ok('every garment line',
        (select count(*) from jsonb_array_elements(v -> 'order_items')) = 6);
    perform pg_temp.ok('the payment',
        (select count(*) from jsonb_array_elements(v -> 'order_payments')) = 1);
    perform pg_temp.ok('both measurement profiles',
        (select count(*) from jsonb_array_elements(v -> 'measurements')) = 2);
    perform pg_temp.ok('every measurement value row',
        (select count(*) from jsonb_array_elements(v -> 'measurement_values')) = 3);
    perform pg_temp.ok('the fitting, the artisan and the expense',
        (select count(*) from jsonb_array_elements(v -> 'fittings')) = 1
        and (select count(*) from jsonb_array_elements(v -> 'workers')) = 1
        and (select count(*) from jsonb_array_elements(v -> 'expenses')) = 1);
    perform pg_temp.ok('the showroom settings', v -> 'showroom_settings' is not null);
    perform pg_temp.ok('the order sequence', (v ->> 'order_sequence') is not null);

    perform pg_temp.ok('and no key, token or credential of any kind',
        v::text !~* '(service_role|sb_secret|anon_key|access_token|refresh_token|jwt_secret|password|client_secret)');
end;
$$;

-- =========================================================================
\echo ''
\echo '--- WIPE AND RESTORE ---'
do $$
declare v_result jsonb;
begin
    perform pg_temp.wipe();
    perform pg_temp.ok('the database is empty before the import',
        (select count(*) from public.customers) = 0 and (select count(*) from public.orders) = 0);

    v_result := public.restore_backup((select payload from pg_temp.captured), 'round trip');
    perform pg_temp.ok('the restore reports the customers it wrote', (v_result ->> 'customers')::int = 2, v_result::text);
    perform pg_temp.ok('and takes a pre-restore snapshot',           (v_result ->> 'snapshot_id') is not null);
    perform pg_temp.ok('and says it did not restore the audit log',  (v_result ->> 'audit_log_restored') = 'false');
end;
$$;

-- ------------------------------------------------------ identity is kept --
select pg_temp.ok('customer A came back under the same uuid',
    exists (select 1 from public.customers where id='c0000000-0000-4000-8000-00000000000a' and name='Round Trip A'));
select pg_temp.ok('with their phone, address, city and notes',
    (select phone||'|'||address||'|'||city||'|'||notes from public.customers where id='c0000000-0000-4000-8000-00000000000a')
      = '9820000001|Bootan Mandi|Jalandhar|prefers slim');
select pg_temp.ok('phone_normalized is recomputed by the generated column',
    (select phone_normalized from public.customers where id='c0000000-0000-4000-8000-00000000000a') = '9820000001');
select pg_temp.ok('the trashed customer came back still trashed',
    (select deleted_at from public.customers where id='c0000000-0000-4000-8000-00000000000b') is not null);
select pg_temp.ok('the trashed order came back still trashed',
    (select deleted_at from public.orders where id='00000000-0000-4000-8000-000000000003') is not null);
select pg_temp.ok('and the live orders came back live',
    (select count(*) from public.orders where deleted_at is null) = 2);

-- ------------------------------------------------------- relationships ----
select pg_temp.ok('every order still points at its own customer',
    (select customer_id from public.orders where id='00000000-0000-4000-8000-000000000001') = 'c0000000-0000-4000-8000-00000000000a'
    and (select customer_id from public.orders where id='00000000-0000-4000-8000-000000000003') = 'c0000000-0000-4000-8000-00000000000b');
select pg_temp.ok('no order is orphaned',
    not exists (select 1 from public.orders o where not exists (select 1 from public.customers c where c.id=o.customer_id)));
select pg_temp.ok('no garment line is orphaned',
    not exists (select 1 from public.order_items i where not exists (select 1 from public.orders o where o.id=i.order_id)));
select pg_temp.ok('no payment is orphaned',
    not exists (select 1 from public.order_payments p where not exists (select 1 from public.orders o where o.id=p.order_id)));
select pg_temp.ok('no measurement profile is orphaned',
    not exists (select 1 from public.measurements m where not exists (select 1 from public.customers c where c.id=m.customer_id)));
select pg_temp.ok('no measurement value is orphaned',
    not exists (select 1 from public.measurement_values v where not exists (select 1 from public.measurements m where m.id=v.measurement_id)));
select pg_temp.ok('no fitting is orphaned',
    not exists (select 1 from public.fittings f where not exists (select 1 from public.orders o where o.id=f.order_id)));
select pg_temp.ok('the measurement profile still names the order it was taken for',
    (select last_order_id from public.measurements where id='11111111-0000-4000-8000-00000000000a') = '00000000-0000-4000-8000-000000000001');

-- ------------------------------------------------------------ contents ----
select pg_temp.ok('order 1 has its four garment lines in position order',
    (select string_agg(garment_type || 'x' || quantity, ' ' order by position)
       from public.order_items where order_id='00000000-0000-4000-8000-000000000001')
    = 'Coatx4 Pantx4 Shirtx3 Kurta Pajamax3');
select pg_temp.ok('remarks survive, including the blank ones',
    (select remarks from public.order_items where order_id='00000000-0000-4000-8000-000000000001' and position=1) = 'Peak lapel'
    and (select remarks from public.order_items where order_id='00000000-0000-4000-8000-000000000001' and position=2) is null);
select pg_temp.ok('the payment is restored and the order advance follows it',
    (select amount from public.order_payments limit 1) = 7500
    and (select advance_paid from public.orders where id='00000000-0000-4000-8000-000000000001') = 7500);
select pg_temp.ok('all ten coat measurements came back exactly',
    (select data from public.measurement_values
      where measurement_id='11111111-0000-4000-8000-00000000000a' and garment_category='coat')
    = '{"hip":"41","chest":"40","collar":"16","length":"31.5","sleeve":"25","xBack":"17.5","stomach":"36","shoulder":"18.5","jacketLength":"30","waistcoatLength":"25"}'::jsonb);
select pg_temp.ok('all seven pant measurements came back exactly',
    (select jsonb_object_keys_count from (
        select count(*) as jsonb_object_keys_count from jsonb_object_keys(
            (select data from public.measurement_values
              where measurement_id='11111111-0000-4000-8000-00000000000a' and garment_category='pant'))) q) = 7);
select pg_temp.ok('the artisan and the expense came back',
    (select count(*) from public.workers) = 1 and (select count(*) from public.expenses) = 1);
select pg_temp.ok('the showroom address is intact',
    (select address_line2 from public.showroom_settings) like '%144003%');

-- ------------------------------------------------------------ sequence ----
select pg_temp.ok('the next order number is past every restored one',
    (select last_value from public.order_number_seq) >= (select max(order_number) from public.orders));
do $$
declare v_next bigint;
begin
    insert into public.orders (customer_id, customer_name, customer_phone, delivery_date)
    values ('c0000000-0000-4000-8000-00000000000a', 'Round Trip A', '9820000001', '2026-10-10')
    returning order_number into v_next;
    perform pg_temp.ok('and a new order after the restore does not reuse one',
        v_next > (select max(order_number) from public.orders where id <> (select id from public.orders order by created_at desc limit 1)),
        '(issued ' || v_next || ')');
    delete from public.orders where order_number = v_next;
end;
$$;

-- ----------------------------------------------------------- audit log ----
do $$
declare v_before int := (select audit_before from pg_temp.captured);
begin
    perform pg_temp.ok('the audit history was not wiped by the restore',
        (select count(*) from public.audit_log) > v_before,
        '(' || v_before || ' -> ' || (select count(*) from public.audit_log) || ')');
    perform pg_temp.ok('and the restore recorded itself',
        exists (select 1 from public.audit_log where action = 'restore_backup'));
end;
$$;

-- =========================================================================
\echo ''
\echo '--- A BAD PAYLOAD CHANGES NOTHING ---'
do $$
declare v_before jsonb; v_rejected int := 0; v_after jsonb;
begin
    v_before := public.export_backup();

    -- A garment line whose order is not in the file.
    begin
        perform public.restore_backup(jsonb_build_object(
            'customers', '[]'::jsonb, 'orders', '[]'::jsonb,
            'order_items', jsonb_build_array(jsonb_build_object(
                'id','99999999-0000-4000-8000-000000000001',
                'order_id','99999999-0000-4000-8000-000000000009',
                'position',1,'garment_type','Coat','quantity',1)),
            'measurements', '[]'::jsonb), 'bad items');
    exception when others then v_rejected := v_rejected + 1; end;

    -- A measurement profile whose customer is not in the file.
    begin
        perform public.restore_backup(jsonb_build_object(
            'customers', '[]'::jsonb, 'orders', '[]'::jsonb, 'order_items', '[]'::jsonb,
            'measurements', jsonb_build_array(jsonb_build_object(
                'id','99999999-0000-4000-8000-000000000002',
                'customer_id','99999999-0000-4000-8000-000000000009','unit','inches'))), 'bad measurements');
    exception when others then v_rejected := v_rejected + 1; end;

    -- A measurement value whose profile is not in the file.
    begin
        perform public.restore_backup(jsonb_build_object(
            'customers', '[]'::jsonb, 'orders', '[]'::jsonb, 'order_items', '[]'::jsonb,
            'measurements', '[]'::jsonb,
            'measurement_values', jsonb_build_array(jsonb_build_object(
                'id','99999999-0000-4000-8000-000000000003',
                'measurement_id','99999999-0000-4000-8000-000000000009',
                'garment_category','coat','data','{}'::jsonb))), 'bad values');
    exception when others then v_rejected := v_rejected + 1; end;

    perform pg_temp.ok('every payload with a dangling reference is rejected', v_rejected = 3,
        '(rejected ' || v_rejected || '/3)');

    v_after := public.export_backup();
    perform pg_temp.ok('ROLLBACK: the customers are untouched',
        (select count(*) from jsonb_array_elements(v_after -> 'customers'))
        = (select count(*) from jsonb_array_elements(v_before -> 'customers')));
    perform pg_temp.ok('ROLLBACK: the orders are untouched',
        (select count(*) from jsonb_array_elements(v_after -> 'orders'))
        = (select count(*) from jsonb_array_elements(v_before -> 'orders')));
    perform pg_temp.ok('ROLLBACK: every garment line is untouched',
        (select count(*) from jsonb_array_elements(v_after -> 'order_items'))
        = (select count(*) from jsonb_array_elements(v_before -> 'order_items')));
    perform pg_temp.ok('ROLLBACK: every measurement value is untouched',
        (select count(*) from jsonb_array_elements(v_after -> 'measurement_values'))
        = (select count(*) from jsonb_array_elements(v_before -> 'measurement_values')));
end;
$$;

-- A backup file that would leave orders without a customer is caught by the
-- closing integrity check even if it slips past the payload validation.
select pg_temp.ok('the restore refuses to commit a database with orphan orders',
    (select count(*) from public.orders o
      where not exists (select 1 from public.customers c where c.id = o.customer_id)) = 0);

select pg_temp.ok('a signed-in client cannot TRUNCATE a business table itself',
    not has_table_privilege('authenticated', 'public.customers', 'truncate')
    and not has_table_privilege('authenticated', 'public.orders', 'truncate')
    and not has_table_privilege('authenticated', 'public.measurement_values', 'truncate'));
select pg_temp.ok('the restore does it inside a definer function instead',
    (select prosecdef from pg_proc where proname = 'restore_backup'));

reset role;
\echo ''
