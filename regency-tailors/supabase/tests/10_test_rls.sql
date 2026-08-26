-- =========================================================================
-- RLS: only an authorised Admin account may reach business data.
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

-- ---------------------------------------------------------------- fixtures
insert into auth.users (id, email) values
    ('11111111-1111-1111-1111-111111111111', 'owner@example.com'),
    ('22222222-2222-2222-2222-222222222222', 'stranger@example.com'),
    ('33333333-3333-3333-3333-333333333333', 'revoked@example.com');

select public.authorize_admin('owner@example.com', 'Showroom Owner');
select public.authorize_admin('revoked@example.com', 'Former Staff');
update public.staff_profiles set is_active = false where email = 'revoked@example.com';

insert into public.customers (id, name, phone)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'Arjun Mehta', '9876543210');

insert into public.orders (customer_id, customer_name, customer_phone, delivery_date, total_amount)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'Arjun Mehta', '9876543210', current_date + 10, 18000);

-- ------------------------------------------------- the owner links on seed
select pg_temp.ok(
    'authorize_admin links an account that already signed in',
    (select user_id from public.staff_profiles where email = 'owner@example.com')
      = '11111111-1111-1111-1111-111111111111');

-- --------------------------------------------------------- anon: no access
do $$
declare v_denied boolean := false;
begin
    begin
        set local role anon;
        perform 1 from public.customers;
    exception when insufficient_privilege then
        v_denied := true;
    end;
    reset role;
    perform pg_temp.ok('anon cannot read customers', v_denied, '(no table privilege at all)');
end;
$$;

do $$
declare v_denied boolean := false;
begin
    begin
        set local role anon;
        insert into public.customers (name, phone) values ('Injected', '9999999999');
    exception when insufficient_privilege then
        v_denied := true;
    end;
    reset role;
    perform pg_temp.ok('anon cannot write customers', v_denied);
end;
$$;

do $$
declare v_denied boolean := false;
begin
    begin
        set local role anon;
        perform 1 from public.invoices;
    exception when insufficient_privilege then
        v_denied := true;
    end;
    reset role;
    perform pg_temp.ok('anon cannot read the invoices view', v_denied,
                       '(security_invoker stops the view leaking around RLS)');
end;
$$;

-- ------------------------------- authenticated but NOT on the allowlist
do $$
declare v_customers int; v_orders int; v_invoices int;
begin
    set local role authenticated;
    set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","email":"stranger@example.com"}';
    select count(*) into v_customers from public.customers;
    select count(*) into v_orders    from public.orders;
    select count(*) into v_invoices  from public.invoices;
    reset role;
    perform pg_temp.ok('unauthorised Google account sees no customers', v_customers = 0, '(rows: ' || v_customers || ')');
    perform pg_temp.ok('unauthorised Google account sees no orders',    v_orders = 0,    '(rows: ' || v_orders || ')');
    perform pg_temp.ok('unauthorised Google account sees no invoices',  v_invoices = 0,  '(rows: ' || v_invoices || ')');
end;
$$;

do $$
declare v_blocked boolean := false;
begin
    begin
        set local role authenticated;
        set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","email":"stranger@example.com"}';
        insert into public.customers (name, phone) values ('Unauthorised Write', '9111111111');
    exception when insufficient_privilege then
        v_blocked := true;
    end;
    reset role;
    perform pg_temp.ok('unauthorised Google account cannot insert', v_blocked);
end;
$$;

-- --------------------------------------------- de-activated staff account
do $$
declare v_rows int;
begin
    set local role authenticated;
    set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","email":"revoked@example.com"}';
    select count(*) into v_rows from public.customers;
    reset role;
    perform pg_temp.ok('de-activated account sees no customers', v_rows = 0, '(rows: ' || v_rows || ')');
end;
$$;

-- ------------------------------------------------- authorised Admin: full
do $$
declare v_customers int; v_orders int; v_invoices int;
begin
    set local role authenticated;
    set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","email":"owner@example.com"}';
    select count(*) into v_customers from public.customers;
    select count(*) into v_orders    from public.orders;
    select count(*) into v_invoices  from public.invoices;
    reset role;
    perform pg_temp.ok('authorised Admin reads customers', v_customers = 1);
    perform pg_temp.ok('authorised Admin reads orders',    v_orders = 1);
    perform pg_temp.ok('authorised Admin reads invoices',  v_invoices = 1);
end;
$$;

do $$
declare v_id uuid;
begin
    set local role authenticated;
    set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","email":"owner@example.com"}';
    insert into public.customers (name, phone) values ('Vikram Malhotra', '9876500001') returning id into v_id;
    delete from public.customers where id = v_id;
    reset role;
    perform pg_temp.ok('authorised Admin has full write and delete', v_id is not null);
end;
$$;

-- ------------------------- an authenticated token with no email/sub claim
do $$
declare v_rows int;
begin
    set local role authenticated;
    set local request.jwt.claims = '{"role":"authenticated"}';
    select count(*) into v_rows from public.customers;
    reset role;
    perform pg_temp.ok('token with no subject or email sees nothing', v_rows = 0, '(rows: ' || v_rows || ')');
end;
$$;

-- ------------------------------------------- client-supplied role is inert
do $$
declare v_rows int;
begin
    set local role authenticated;
    -- A forged claim naming itself admin must change nothing: authorisation
    -- comes from staff_profiles, never from the token's contents.
    set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","email":"stranger@example.com","user_role":"Admin","is_admin":true}';
    select count(*) into v_rows from public.customers;
    reset role;
    perform pg_temp.ok('forged admin claim in the JWT grants nothing', v_rows = 0, '(rows: ' || v_rows || ')');
end;
$$;

-- --------------------------------------------- audit log is append-only
do $$
declare v_blocked boolean := false;
begin
    set local role authenticated;
    set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","email":"owner@example.com"}';
    insert into public.audit_log (action, entity_type) values ('test', 'unit');
    begin
        delete from public.audit_log;
    exception when insufficient_privilege then
        v_blocked := true;
    end;
    reset role;
    perform pg_temp.ok('audit log cannot be deleted, even by an Admin', v_blocked);
end;
$$;

-- ------------------------------------ a stranger may read only its own row
do $$
declare v_rows int; v_own int;
begin
    set local role authenticated;
    set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","email":"stranger@example.com"}';
    select count(*) into v_rows from public.staff_profiles;
    select count(*) into v_own  from public.staff_profiles where email = 'stranger@example.com';
    reset role;
    perform pg_temp.ok('unauthorised account cannot enumerate the allowlist', v_rows = 0 and v_own = 0,
                       '(rows: ' || v_rows || ')');
end;
$$;
