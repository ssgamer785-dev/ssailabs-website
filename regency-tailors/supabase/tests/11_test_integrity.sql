-- =========================================================================
-- Schema integrity: constraints, derived columns, triggers, order numbering.
-- All statements run as an authorised Admin.
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

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'owner@example.com')
on conflict do nothing;
select public.authorize_admin('owner@example.com', 'Showroom Owner');

set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","email":"owner@example.com"}';

-- ------------------------------------------------------- order numbering
do $$
declare a bigint; b bigint; c bigint; v_cust uuid;
begin
    insert into public.customers (name, phone) values ('Numbering Client', '9000000001') returning id into v_cust;

    insert into public.orders (customer_id, customer_name, customer_phone, delivery_date)
    values (v_cust, 'Numbering Client', '9000000001', current_date + 7) returning order_number into a;
    insert into public.orders (customer_id, customer_name, customer_phone, delivery_date)
    values (v_cust, 'Numbering Client', '9000000001', current_date + 7) returning order_number into b;

    perform pg_temp.ok('order numbers are sequential', b = a + 1, format('%s then %s', a, b));

    -- Hard-delete the newest order: its number must never come back.
    delete from public.orders where order_number = b;
    insert into public.orders (customer_id, customer_name, customer_phone, delivery_date)
    values (v_cust, 'Numbering Client', '9000000001', current_date + 7) returning order_number into c;

    perform pg_temp.ok('a deleted order number is never re-issued', c > b, format('deleted %s, next issued %s', b, c));
end;
$$;

do $$
declare v_dup boolean := false; v_cust uuid;
begin
    select id into v_cust from public.customers where phone = '9000000001';
    begin
        insert into public.orders (customer_id, customer_name, customer_phone, delivery_date, order_number)
        values (v_cust, 'X', '9000000001', current_date, 1);
    exception when unique_violation then
        v_dup := true;
    end;
    perform pg_temp.ok('duplicate order numbers are rejected by the database', v_dup);
end;
$$;

-- --------------------------------------------------- duplicate customers
do $$
declare v_blocked boolean := false;
begin
    begin
        -- Same person, differently formatted number.
        insert into public.customers (name, phone) values ('Numbering Client Again', '+91 90000 00001');
    exception when unique_violation then
        v_blocked := true;
    end;
    perform pg_temp.ok('a second live customer cannot share a phone number', v_blocked,
                       '(normalised to the last 10 digits)');
end;
$$;

do $$
declare v_ok boolean;
begin
    update public.customers set deleted_at = now() where phone = '9000000001';
    insert into public.customers (name, phone) values ('Reused Number', '9000000001');
    v_ok := true;
    -- Clear the replacement before reinstating the original, or the two would
    -- momentarily both be live and trip the constraint under test.
    delete from public.customers where name = 'Reused Number';
    update public.customers set deleted_at = null where phone = '9000000001' and name = 'Numbering Client';
    perform pg_temp.ok('a phone number frees up once its record is retired', v_ok);
exception when unique_violation then
    perform pg_temp.ok('a phone number frees up once its record is retired', false);
end;
$$;

-- ------------------------------------------------------- money integrity
do $$
declare v_cust uuid; v_order uuid; v_balance numeric; v_advance numeric;
begin
    insert into public.customers (name, phone) values ('Money Client', '9000000002') returning id into v_cust;
    insert into public.orders (customer_id, customer_name, customer_phone, delivery_date, total_amount)
    values (v_cust, 'Money Client', '9000000002', current_date + 7, 18000) returning id into v_order;

    select balance_due into v_balance from public.orders where id = v_order;
    perform pg_temp.ok('balance due is derived from the total', v_balance = 18000, '(₹' || v_balance || ')');

    insert into public.order_payments (order_id, amount, method) values (v_order, 8000, 'Cash');
    select advance_paid, balance_due into v_advance, v_balance from public.orders where id = v_order;
    perform pg_temp.ok('recording a payment updates the advance', v_advance = 8000, '(₹' || v_advance || ')');
    perform pg_temp.ok('recording a payment updates the balance', v_balance = 10000, '(₹' || v_balance || ')');

    insert into public.order_payments (order_id, amount, method) values (v_order, 10000, 'UPI / GPay');
    select advance_paid, balance_due into v_advance, v_balance from public.orders where id = v_order;
    perform pg_temp.ok('a second payment settles the order', v_advance = 18000 and v_balance = 0);

    perform pg_temp.ok('the bill reports Paid once settled',
        (select status from public.invoices where order_id = v_order) = 'Paid');

    delete from public.order_payments where order_id = v_order and amount = 10000;
    select advance_paid into v_advance from public.orders where id = v_order;
    perform pg_temp.ok('reversing a payment restores the advance', v_advance = 8000, '(₹' || v_advance || ')');
end;
$$;

do $$
declare v_blocked boolean := false; v_order uuid;
begin
    select id into v_order from public.orders where customer_name = 'Money Client' limit 1;
    begin
        insert into public.order_payments (order_id, amount) values (v_order, -500);
    exception when check_violation then
        v_blocked := true;
    end;
    perform pg_temp.ok('a negative payment is rejected', v_blocked);
end;
$$;

-- ------------------------------------------------- garment line integrity
do $$
declare v_order uuid; v_blocked boolean := false; v_total numeric;
begin
    select id into v_order from public.orders where customer_name = 'Money Client' limit 1;

    insert into public.order_items (order_id, position, garment_type, price, quantity)
    values (v_order, 1, 'Coat', 12000, 1),
           (v_order, 2, 'Shirt', 3000, 2);

    select line_total into v_total from public.order_items where order_id = v_order and position = 2;
    perform pg_temp.ok('line total is price x quantity', v_total = 6000, '(₹' || v_total || ')');

    begin
        insert into public.order_items (order_id, position, garment_type) values (v_order, 1, 'Duplicate Position');
    exception when unique_violation then
        v_blocked := true;
    end;
    perform pg_temp.ok('two garments cannot share a slip position', v_blocked,
                       '(keeps #1..#n stable on the production slip)');

    v_blocked := false;
    begin
        insert into public.order_items (order_id, position, garment_type, quantity) values (v_order, 9, 'Bad Qty', 0);
    exception when check_violation then
        v_blocked := true;
    end;
    perform pg_temp.ok('a garment quantity below one is rejected', v_blocked);
end;
$$;

-- ---------------------------------------------- per-garment measurements
do $$
declare v_cust uuid; v_meas uuid; v_coat jsonb; v_shirt jsonb;
begin
    select id into v_cust from public.customers where phone = '9000000002';
    insert into public.measurements (customer_id, unit) values (v_cust, 'inches') returning id into v_meas;

    insert into public.measurement_values (measurement_id, garment_category, data)
    values (v_meas, 'coat',  '{"chest":"41","length":"30.5"}'::jsonb),
           (v_meas, 'pant',  '{"waist":"34"}'::jsonb);

    -- A later shirt-only order upserts one row and must not touch the others.
    insert into public.measurement_values (measurement_id, garment_category, data)
    values (v_meas, 'shirt', '{"chest":"40"}'::jsonb)
    on conflict (measurement_id, garment_category) do update set data = excluded.data;

    select data into v_coat  from public.measurement_values where measurement_id = v_meas and garment_category = 'coat';
    select data into v_shirt from public.measurement_values where measurement_id = v_meas and garment_category = 'shirt';

    perform pg_temp.ok('a shirt-only update leaves coat measurements intact', v_coat ->> 'chest' = '41');
    perform pg_temp.ok('the shirt measurement is stored separately', v_shirt ->> 'chest' = '40');
    perform pg_temp.ok('all three garment categories coexist',
        (select count(*) from public.measurement_values where measurement_id = v_meas) = 3);
end;
$$;

do $$
declare v_blocked boolean := false; v_meas uuid;
begin
    select id into v_meas from public.measurements limit 1;
    begin
        insert into public.measurement_values (measurement_id, garment_category, data)
        values (v_meas, 'sherwani', '{}'::jsonb);
    exception when check_violation then
        v_blocked := true;
    end;
    perform pg_temp.ok('an unknown garment category is rejected', v_blocked);
end;
$$;

-- ------------------------------------------------------ referential rules
do $$
declare v_blocked boolean := false; v_cust uuid;
begin
    select id into v_cust from public.customers where phone = '9000000002';
    begin
        delete from public.customers where id = v_cust;
    exception when foreign_key_violation then
        v_blocked := true;
    end;
    perform pg_temp.ok('a customer with orders cannot be hard-deleted', v_blocked,
                       '(deletion is soft, so history is never orphaned)');
end;
$$;

do $$
declare v_order uuid; v_items int;
begin
    insert into public.orders (customer_id, customer_name, customer_phone, delivery_date)
    select id, 'Cascade Client', phone, current_date + 5 from public.customers where phone = '9000000002'
    returning id into v_order;
    insert into public.order_items (order_id, position, garment_type) values (v_order, 1, 'Shirt');
    delete from public.orders where id = v_order;
    select count(*) into v_items from public.order_items where order_id = v_order;
    perform pg_temp.ok('deleting an order removes its garment lines', v_items = 0);
end;
$$;

-- --------------------------------------------------------- derived views
do $$
declare v_total int; v_spend numeric;
begin
    select total_orders, lifetime_spend into v_total, v_spend
    from public.customers_with_stats where phone = '9000000002';
    perform pg_temp.ok('customer totals are derived, not stored', v_total >= 1, '(orders: ' || v_total || ')');
    perform pg_temp.ok('lifetime spend is derived from orders', v_spend >= 18000, '(₹' || v_spend || ')');
end;
$$;

do $$
declare v_items jsonb;
begin
    select items into v_items from public.invoices where customer_name = 'Money Client' limit 1;
    perform pg_temp.ok('the bill reads its lines from the order', jsonb_array_length(v_items) = 2,
                       '(lines: ' || jsonb_array_length(v_items) || ')');
end;
$$;

-- --------------------------------------------------------- soft deletion
do $$
declare v_trash int; v_live int;
begin
    update public.customers set deleted_at = now(), deleted_by = auth.uid() where phone = '9000000002';
    select count(*) into v_trash from public.trash_items where item_type = 'Customer';
    select count(*) into v_live  from public.customers where phone = '9000000002' and deleted_at is null;
    perform pg_temp.ok('a soft-deleted customer appears in trash', v_trash >= 1);
    perform pg_temp.ok('a soft-deleted customer is no longer live', v_live = 0);

    update public.customers set deleted_at = null, deleted_by = null where phone = '9000000002';
    select count(*) into v_live from public.customers where phone = '9000000002' and deleted_at is null;
    perform pg_temp.ok('restoring from trash brings the record back', v_live = 1);
end;
$$;

do $$
declare v_events int;
begin
    select count(*) into v_events from public.audit_log
    where action in ('soft_delete','restore') and entity_type = 'customers';
    perform pg_temp.ok('deletes and restores are written to the audit log', v_events >= 2,
                       '(events: ' || v_events || ')');
end;
$$;

reset role;
