-- =========================================================================
-- Permanent deletion from the Trash screen.
--
-- The showroom could not empty a customer from the bin at all:
--
--   update or delete on table "customers" violates foreign key constraint
--   "orders_customer_id_fkey" on table "orders"
--
-- because the browser deleted the parent row and nothing else, and
-- orders.customer_id is ON DELETE RESTRICT. These assertions pin what
-- permanent deletion has to mean instead: the whole tree the record owns,
-- nothing that belongs to anyone else, all of it or none of it.
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

-- ------------------------------------------------------------- sign in ----
insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'owner@example.com')
    on conflict (id) do nothing;
insert into auth.users (id, email) values ('22222222-2222-2222-2222-222222222222', 'stranger@example.com')
    on conflict (id) do nothing;
select public.authorize_admin('owner@example.com', 'Showroom Owner');

create or replace function pg_temp.sign_in(p_uid uuid, p_email text)
returns void language plpgsql as $$
begin
    perform set_config('request.jwt.claims',
        json_build_object('sub', p_uid, 'email', p_email, 'role', 'authenticated')::text, false);
end;
$$;

select pg_temp.sign_in('11111111-1111-1111-1111-111111111111', 'owner@example.com');

-- --------------------------------------------------------- the fixture ----
-- Customer A: two orders, garment lines, a payment, a fitting, and a
-- measurement profile tagged to order A1.
-- Customer B: one order. Must survive everything done to A.
-- security definer so the fixture may TRUNCATE: `authenticated` deliberately
-- has no TRUNCATE grant, which is asserted below.
create or replace function pg_temp.seed() returns void language plpgsql security definer as $$
begin
    -- Cleared with the same named TRUNCATE the restore uses, rather than a
    -- `where true` that means "everything" without saying so.
    truncate table
        public.measurement_values, public.measurements,
        public.order_payments, public.order_items, public.fittings,
        public.orders, public.customers;

    insert into public.customers (id, name, phone, city) values
        ('aaaaaaaa-0000-4000-8000-00000000000a', 'Customer A', '9810000001', 'Jalandhar'),
        ('bbbbbbbb-0000-4000-8000-00000000000b', 'Customer B', '9810000002', 'Jalandhar');

    insert into public.orders (id, customer_id, customer_name, customer_phone, delivery_date) values
        ('a1a1a1a1-0000-4000-8000-00000000000a', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Customer A', '9810000001', '2026-10-01'),
        ('a2a2a2a2-0000-4000-8000-00000000000a', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Customer A', '9810000001', '2026-10-02'),
        ('b1b1b1b1-0000-4000-8000-00000000000b', 'bbbbbbbb-0000-4000-8000-00000000000b', 'Customer B', '9810000002', '2026-10-03');

    insert into public.order_items (order_id, position, garment_type, quantity, price) values
        ('a1a1a1a1-0000-4000-8000-00000000000a', 1, 'Coat',  2, 0),
        ('a1a1a1a1-0000-4000-8000-00000000000a', 2, 'Pant',  2, 0),
        ('a2a2a2a2-0000-4000-8000-00000000000a', 1, 'Shirt', 3, 0),
        ('b1b1b1b1-0000-4000-8000-00000000000b', 1, 'Kurta Pajama', 1, 0);

    insert into public.order_payments (order_id, amount, method) values
        ('a1a1a1a1-0000-4000-8000-00000000000a', 5000, 'Cash'),
        ('b1b1b1b1-0000-4000-8000-00000000000b', 1500, 'UPI');

    insert into public.fittings (order_id, scheduled_date, status) values
        ('a1a1a1a1-0000-4000-8000-00000000000a', '2026-09-20', 'Scheduled');

    insert into public.measurements (id, customer_id, unit, last_order_id) values
        ('acacacac-0000-4000-8000-00000000000a', 'aaaaaaaa-0000-4000-8000-00000000000a', 'inches', 'a1a1a1a1-0000-4000-8000-00000000000a'),
        ('bcbcbcbc-0000-4000-8000-00000000000b', 'bbbbbbbb-0000-4000-8000-00000000000b', 'inches', 'b1b1b1b1-0000-4000-8000-00000000000b');

    insert into public.measurement_values (measurement_id, garment_category, data) values
        ('acacacac-0000-4000-8000-00000000000a', 'coat', '{"chest":"40","waistcoatLength":"25"}'),
        ('acacacac-0000-4000-8000-00000000000a', 'pant', '{"waist":"34"}'),
        ('bcbcbcbc-0000-4000-8000-00000000000b', 'kurta', '{"chest":"38"}');
end;
$$;

-- =========================================================================
-- TEST 1 — permanently delete CUSTOMER A
-- =========================================================================
\echo ''
\echo '--- TEST 1: permanent delete of a customer takes the whole tree ---'
set role authenticated;
select pg_temp.seed();

-- The old client-side statement, kept here as the regression this replaces.
update public.customers set deleted_at = now() where id = 'aaaaaaaa-0000-4000-8000-00000000000a';
do $$
declare v_failed boolean := false;
begin
    begin
        delete from public.customers where id = 'aaaaaaaa-0000-4000-8000-00000000000a' and deleted_at is not null;
    exception when foreign_key_violation then
        v_failed := true;
    end;
    perform pg_temp.ok('deleting only the parent row is still refused by the foreign key', v_failed,
        '(orders_customer_id_fkey — the reported production error)');
end;
$$;

do $$
declare v jsonb;
begin
    v := public.purge_trash_entry('Customer', 'aaaaaaaa-0000-4000-8000-00000000000a');
    perform pg_temp.ok('the purge reports the customer row removed', (v ->> 'customers')::int = 1, v::text);
    perform pg_temp.ok('both of that customer''s orders removed', (v ->> 'orders')::int = 2);
    perform pg_temp.ok('their garment lines removed',             (v ->> 'order_items')::int = 3);
    perform pg_temp.ok('their payment removed',                   (v ->> 'order_payments')::int = 1);
    perform pg_temp.ok('their fitting removed',                   (v ->> 'fittings')::int = 1);
    perform pg_temp.ok('their measurement profile removed',       (v ->> 'measurements')::int = 1);
    perform pg_temp.ok('their measurement values removed',        (v ->> 'measurement_values')::int = 2);
end;
$$;

select pg_temp.ok('customer A is gone',            not exists (select 1 from public.customers where id='aaaaaaaa-0000-4000-8000-00000000000a'));
select pg_temp.ok('order A1 is gone',              not exists (select 1 from public.orders where id='a1a1a1a1-0000-4000-8000-00000000000a'));
select pg_temp.ok('order A2 is gone',              not exists (select 1 from public.orders where id='a2a2a2a2-0000-4000-8000-00000000000a'));
select pg_temp.ok('no orphan garment line remains',
    not exists (select 1 from public.order_items i where not exists (select 1 from public.orders o where o.id = i.order_id)));
select pg_temp.ok('no orphan payment remains',
    not exists (select 1 from public.order_payments p where not exists (select 1 from public.orders o where o.id = p.order_id)));
select pg_temp.ok('no orphan fitting remains',
    not exists (select 1 from public.fittings f where not exists (select 1 from public.orders o where o.id = f.order_id)));
select pg_temp.ok('no orphan measurement remains',
    not exists (select 1 from public.measurements m where not exists (select 1 from public.customers c where c.id = m.customer_id)));
select pg_temp.ok('no orphan measurement value remains',
    not exists (select 1 from public.measurement_values v where not exists (select 1 from public.measurements m where m.id = v.measurement_id)));
select pg_temp.ok('the entry has left the trash view',
    not exists (select 1 from public.trash_items where entity_id = 'aaaaaaaa-0000-4000-8000-00000000000a'));

select pg_temp.ok('customer B untouched',  exists (select 1 from public.customers where id='bbbbbbbb-0000-4000-8000-00000000000b'));
select pg_temp.ok('order B1 untouched',    exists (select 1 from public.orders    where id='b1b1b1b1-0000-4000-8000-00000000000b'));
select pg_temp.ok('B''s garment line untouched',   (select count(*) from public.order_items    where order_id='b1b1b1b1-0000-4000-8000-00000000000b') = 1);
select pg_temp.ok('B''s payment untouched',        (select count(*) from public.order_payments where order_id='b1b1b1b1-0000-4000-8000-00000000000b') = 1);
select pg_temp.ok('B''s measurements untouched',   (select count(*) from public.measurement_values where measurement_id='bcbcbcbc-0000-4000-8000-00000000000b') = 1);
select pg_temp.ok('showroom settings untouched',   (select count(*) from public.showroom_settings) = 1);
select pg_temp.ok('the deletion is recorded in the audit log',
    exists (select 1 from public.audit_log where action='permanent_delete' and entity_id='aaaaaaaa-0000-4000-8000-00000000000a'));

-- =========================================================================
-- TEST 2 — permanently delete ORDER B1; customer B must remain
-- =========================================================================
\echo ''
\echo '--- TEST 2: permanent delete of an order never deletes its customer ---'
select pg_temp.seed();
update public.orders set deleted_at = now() where id = 'b1b1b1b1-0000-4000-8000-00000000000b';
do $$
declare v jsonb;
begin
    v := public.purge_trash_entry('Order', 'b1b1b1b1-0000-4000-8000-00000000000b');
    perform pg_temp.ok('the order row is removed',        (v ->> 'orders')::int = 1, v::text);
    perform pg_temp.ok('its garment line is removed',     (v ->> 'order_items')::int = 1);
    perform pg_temp.ok('its payment is removed',          (v ->> 'order_payments')::int = 1);
    perform pg_temp.ok('the measurement profile is untagged, not deleted', (v ->> 'measurements_untagged')::int = 1);
end;
$$;
select pg_temp.ok('order B1 is gone',        not exists (select 1 from public.orders where id='b1b1b1b1-0000-4000-8000-00000000000b'));
select pg_temp.ok('customer B still exists', exists (select 1 from public.customers where id='bbbbbbbb-0000-4000-8000-00000000000b'));
select pg_temp.ok('customer B keeps their measurement profile',
    exists (select 1 from public.measurements where id='bcbcbcbc-0000-4000-8000-00000000000b'));
select pg_temp.ok('and its values',  (select count(*) from public.measurement_values where measurement_id='bcbcbcbc-0000-4000-8000-00000000000b') = 1);
select pg_temp.ok('the profile no longer points at the deleted order',
    (select last_order_id from public.measurements where id='bcbcbcbc-0000-4000-8000-00000000000b') is null);
select pg_temp.ok('customer A''s orders are untouched', (select count(*) from public.orders where customer_id='aaaaaaaa-0000-4000-8000-00000000000a') = 2);

-- =========================================================================
-- TEST 3 — permanently delete a MEASUREMENT profile
-- =========================================================================
\echo ''
\echo '--- TEST 3: permanent delete of a measurement keeps customer and order ---'
select pg_temp.seed();
update public.measurements set deleted_at = now() where id = 'acacacac-0000-4000-8000-00000000000a';
do $$
declare v jsonb;
begin
    v := public.purge_trash_entry('Measurement', 'acacacac-0000-4000-8000-00000000000a');
    perform pg_temp.ok('the profile is removed',    (v ->> 'measurements')::int = 1, v::text);
    perform pg_temp.ok('its values are removed',    (v ->> 'measurement_values')::int = 2);
end;
$$;
select pg_temp.ok('the profile is gone',          not exists (select 1 from public.measurements where id='acacacac-0000-4000-8000-00000000000a'));
select pg_temp.ok('its values are gone',          (select count(*) from public.measurement_values where measurement_id='acacacac-0000-4000-8000-00000000000a') = 0);
select pg_temp.ok('customer A still exists',      exists (select 1 from public.customers where id='aaaaaaaa-0000-4000-8000-00000000000a'));
select pg_temp.ok('customer A''s orders still exist', (select count(*) from public.orders where customer_id='aaaaaaaa-0000-4000-8000-00000000000a') = 2);
select pg_temp.ok('customer B''s profile still exists', exists (select 1 from public.measurements where id='bcbcbcbc-0000-4000-8000-00000000000b'));

-- =========================================================================
-- TEST 4 — nothing partial: a refused purge leaves everything in place
-- =========================================================================
\echo ''
\echo '--- TEST 4: a refused purge deletes nothing at all ---'
select pg_temp.seed();

-- A record that is NOT in the trash must be refused outright.
do $$
declare v_refused boolean := false;
begin
    begin
        perform public.purge_trash_entry('Customer', 'aaaaaaaa-0000-4000-8000-00000000000a');
    exception when others then
        v_refused := true;
    end;
    perform pg_temp.ok('a customer that is not in the trash is refused', v_refused);
end;
$$;
select pg_temp.ok('and nothing of theirs was deleted',
    (select count(*) from public.orders where customer_id='aaaaaaaa-0000-4000-8000-00000000000a') = 2
    and (select count(*) from public.order_items) = 4
    and (select count(*) from public.measurement_values) = 3);

-- A type outside the allow-list is refused before any statement runs.
do $$
declare v_refused boolean := false;
begin
    begin
        perform public.purge_trash_entry('audit_log', 'aaaaaaaa-0000-4000-8000-00000000000a');
    exception when others then
        v_refused := true;
    end;
    perform pg_temp.ok('an entity type outside the allow-list is refused', v_refused);
end;
$$;

-- A dependency that cannot be removed must abort the whole purge. A row in a
-- table the function does not know about, pointing at one of the orders,
-- stands in for that: the order delete fails and the customer must survive.
select pg_temp.seed();
reset role;
create table if not exists public.dependency_probe (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references public.orders(id) on delete restrict
);
insert into public.dependency_probe (order_id) values ('a1a1a1a1-0000-4000-8000-00000000000a');
set role authenticated;
update public.customers set deleted_at = now() where id = 'aaaaaaaa-0000-4000-8000-00000000000a';
do $$
declare v_failed boolean := false;
begin
    begin
        perform public.purge_trash_entry('Customer', 'aaaaaaaa-0000-4000-8000-00000000000a');
    exception when others then
        v_failed := true;
    end;
    perform pg_temp.ok('a dependency that cannot be removed aborts the purge', v_failed);
end;
$$;
select pg_temp.ok('ROLLBACK: the customer is still there',        exists (select 1 from public.customers where id='aaaaaaaa-0000-4000-8000-00000000000a'));
select pg_temp.ok('ROLLBACK: both orders are still there',        (select count(*) from public.orders where customer_id='aaaaaaaa-0000-4000-8000-00000000000a') = 2);
select pg_temp.ok('ROLLBACK: every garment line is still there',  (select count(*) from public.order_items) = 4);
select pg_temp.ok('ROLLBACK: the measurement profile is still there', exists (select 1 from public.measurements where id='acacacac-0000-4000-8000-00000000000a'));
select pg_temp.ok('ROLLBACK: its values are still there',         (select count(*) from public.measurement_values where measurement_id='acacacac-0000-4000-8000-00000000000a') = 2);
reset role;
drop table public.dependency_probe;
set role authenticated;

-- =========================================================================
-- TEST 5 — authorisation
-- =========================================================================
\echo ''
\echo '--- TEST 5: only the authorised admin can permanently delete ---'
select pg_temp.seed();
update public.customers set deleted_at = now() where id = 'aaaaaaaa-0000-4000-8000-00000000000a';

select pg_temp.sign_in('22222222-2222-2222-2222-222222222222', 'stranger@example.com');
do $$
declare v_refused boolean := false;
begin
    begin
        perform public.purge_trash_entry('Customer', 'aaaaaaaa-0000-4000-8000-00000000000a');
    exception when insufficient_privilege then
        v_refused := true;
    when others then
        v_refused := true;
    end;
    perform pg_temp.ok('an unauthorised signed-in account is refused', v_refused);
end;
$$;
select pg_temp.sign_in('11111111-1111-1111-1111-111111111111', 'owner@example.com');
select pg_temp.ok('and it deleted nothing', exists (select 1 from public.customers where id='aaaaaaaa-0000-4000-8000-00000000000a'));

reset role;
select pg_temp.ok('anon cannot execute the purge function',
    not has_function_privilege('anon', 'public.purge_trash_entry(text, uuid)', 'execute'));
select pg_temp.ok('authenticated can execute it',
    has_function_privilege('authenticated', 'public.purge_trash_entry(text, uuid)', 'execute'));
select pg_temp.ok('foreign keys are still enabled on orders',
    exists (select 1 from pg_constraint where conname = 'orders_customer_id_fkey' and contype = 'f'));
select pg_temp.ok('orders.customer_id is still ON DELETE RESTRICT',
    (select confdeltype from pg_constraint where conname = 'orders_customer_id_fkey') = 'r');
select pg_temp.ok('row level security is still enabled on customers',
    (select relrowsecurity from pg_class where oid = 'public.customers'::regclass));

-- =========================================================================
-- TEST 6 — a backup taken after a purge does not carry the deleted records
-- =========================================================================
\echo ''
\echo '--- TEST 6: the purged tree is absent from a later export ---'
set role authenticated;
select pg_temp.seed();
update public.customers set deleted_at = now() where id = 'aaaaaaaa-0000-4000-8000-00000000000a';
select public.purge_trash_entry('Customer', 'aaaaaaaa-0000-4000-8000-00000000000a');
do $$
declare v jsonb := public.export_backup();
begin
    perform pg_temp.ok('the export no longer contains the customer',
        not exists (select 1 from jsonb_array_elements(v -> 'customers') c
                    where c ->> 'id' = 'aaaaaaaa-0000-4000-8000-00000000000a'));
    perform pg_temp.ok('nor either of their orders',
        not exists (select 1 from jsonb_array_elements(v -> 'orders') o
                    where o ->> 'customer_id' = 'aaaaaaaa-0000-4000-8000-00000000000a'));
    perform pg_temp.ok('nor their measurement values',
        (select count(*) from jsonb_array_elements(v -> 'measurement_values')) = 1);
    perform pg_temp.ok('and customer B is still in it',
        exists (select 1 from jsonb_array_elements(v -> 'customers') c
                where c ->> 'id' = 'bbbbbbbb-0000-4000-8000-00000000000b'));
    perform pg_temp.ok('the audit history survived the purge',
        (select count(*) from jsonb_array_elements(v -> 'audit_log')) > 0);
end;
$$;

reset role;
\echo ''
