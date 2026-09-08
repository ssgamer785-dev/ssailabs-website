-- =========================================================================
-- Order numbers: issued by the database, never re-issued, never rewritten.
--
-- The number is the customer-facing identity printed on the bill and the
-- workshop slip. Three things have to hold, and none of them can be enforced
-- in a browser:
--
--   Two counter hands saving at the same moment get different numbers.
--   Editing an order leaves its number exactly as it was.
--   Deleting an order does not hand its number to the next one.
--
-- The application never sends order_number — orderToWizardRow omits it, so an
-- insert takes nextval() and an edit is an UPDATE that does not mention the
-- column. These assertions hold the database to its half of that.
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

-- A customer to hang the orders on.
do $$
declare v_cust uuid;
begin
    -- phone_normalized is generated; the database fills it.
    insert into public.customers (name, phone)
    values ('Numbering Client', '9500000001')
    returning id into v_cust;
    perform set_config('test.cust', v_cust::text, false);
end;
$$;

/* ------------------------------------------ the sequence issues the number */
do $$
declare v_cust uuid := current_setting('test.cust')::uuid; a bigint; b bigint; c bigint;
begin
    insert into public.orders (customer_id, customer_name, customer_phone, order_date, delivery_date)
    values (v_cust, 'Numbering Client', '9500000001', current_date, current_date + 7)
    returning order_number into a;
    insert into public.orders (customer_id, customer_name, customer_phone, order_date, delivery_date)
    values (v_cust, 'Numbering Client', '9500000001', current_date, current_date + 7)
    returning order_number into b;
    insert into public.orders (customer_id, customer_name, customer_phone, order_date, delivery_date)
    values (v_cust, 'Numbering Client', '9500000001', current_date, current_date + 7)
    returning order_number into c;

    perform pg_temp.ok('an insert that names no number still gets one', a is not null, a::text);
    perform pg_temp.ok('numbers advance', b = a + 1 and c = b + 1, format('%s, %s, %s', a, b, c));
    perform set_config('test.a', a::text, false);
    perform set_config('test.c', c::text, false);
end;
$$;

/* -------------------------------------------- two at once are never the same */
do $$
declare v_cust uuid := current_setting('test.cust')::uuid; x bigint; y bigint;
begin
    -- Two allocations interleaved the way two devices would interleave them.
    -- nextval is exempt from transaction isolation precisely so this is safe;
    -- max(order_number)+1 in the browser is what would collide here.
    x := nextval('public.order_number_seq');
    y := nextval('public.order_number_seq');
    perform pg_temp.ok('two allocations never collide', x <> y, format('%s vs %s', x, y));
    perform pg_temp.ok('and neither is reused by the next insert',
        (select count(*) from public.orders where order_number in (x, y)) = 0);
end;
$$;

/* ------------------------------------------------- editing keeps the number */
do $$
declare v_cust uuid := current_setting('test.cust')::uuid; v_id uuid; v_before bigint; v_after bigint;
begin
    select id, order_number into v_id, v_before
      from public.orders where customer_id = v_cust order by order_number limit 1;

    -- Everything the wizard can change on an edit, in one update. The column
    -- is absent from the statement, which is the point.
    update public.orders
       set customer_name = 'Renamed Client',
           customer_phone = '9500000002',
           delivery_date = current_date + 30,
           production_notes = 'edited',
           status = 'Measurement Taken',
           subtotal = 1234
     where id = v_id;

    select order_number into v_after from public.orders where id = v_id;
    perform pg_temp.ok('editing an order does not change its number',
        v_after = v_before, format('#%s stayed #%s', v_before, v_after));
    perform pg_temp.ok('and it is still one order, not two',
        (select count(*) from public.orders where customer_id = v_cust) = 3);
end;
$$;

/* ------------------------------- a deleted number is not handed to the next */
do $$
declare v_cust uuid := current_setting('test.cust')::uuid; v_gone bigint; v_next bigint;
begin
    select order_number into v_gone
      from public.orders where customer_id = v_cust order by order_number desc limit 1;
    delete from public.order_items where order_id in
      (select id from public.orders where customer_id = v_cust and order_number = v_gone);
    delete from public.orders where customer_id = v_cust and order_number = v_gone;

    insert into public.orders (customer_id, customer_name, customer_phone, order_date, delivery_date)
    values (v_cust, 'Numbering Client', '9500000001', current_date, current_date + 7)
    returning order_number into v_next;

    perform pg_temp.ok('a deleted number is not re-issued',
        v_next > v_gone, format('deleted #%s, next was #%s', v_gone, v_next));
end;
$$;

/* --------------------------------- the number column refuses a duplicate */
do $$
declare v_cust uuid := current_setting('test.cust')::uuid; v_taken bigint; v_blocked boolean := false;
begin
    select order_number into v_taken from public.orders where customer_id = v_cust limit 1;
    begin
        insert into public.orders (customer_id, customer_name, customer_phone,
                                   order_date, delivery_date, order_number)
        values (v_cust, 'Duplicate', '9500000003', current_date, current_date + 7, v_taken);
    exception when unique_violation then
        v_blocked := true;
    end;
    perform pg_temp.ok('the database refuses a duplicate order number', v_blocked, format('#%s', v_taken));
end;
$$;

/* ------------------------------------- what the clean-launch reset must do */
do $$
declare v_cust uuid := current_setting('test.cust')::uuid; v_first bigint;
begin
    -- Exactly the statements the reset runs, against this throwaway cluster.
    delete from public.order_items;
    delete from public.order_payments;
    delete from public.orders;
    perform setval('public.order_number_seq', 1, false);

    insert into public.orders (customer_id, customer_name, customer_phone, order_date, delivery_date)
    values (v_cust, 'First After Reset', '9500000009', current_date, current_date + 7)
    returning order_number into v_first;

    perform pg_temp.ok('the first order after a reset is #1', v_first = 1, format('#%s', v_first));
end;
$$;

do $$
begin
    perform pg_temp.ok('order numbering suite completed', true);
end;
$$;
