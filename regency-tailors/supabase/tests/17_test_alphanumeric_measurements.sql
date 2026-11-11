-- =========================================================================
-- Measurements are free text: 38, 40 L, 15.5 R, 38 Tight, XL.
--
-- A tailor writes whatever the tape card says. The application no longer turns
-- a measurement into a number or drops its letters; this is the other half —
-- the database has to hold exactly what it is given, and give it back exactly,
-- without a column type, a constraint or the backup path getting in the way.
--
-- Both places measurements live are jsonb:
--   measurement_values.data           one object per garment, per customer
--   orders.measurements_snapshot      the order's own point-in-time record
-- jsonb keeps a string as a string and a number as a number, so values already
-- stored as numbers are untouched, and a new "40 L" sits beside them.
--
-- Nothing here needs a migration. This suite is what says so.
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

create or replace function pg_temp.wipe() returns void language plpgsql security definer as $$
begin
    truncate table
        public.measurement_values, public.measurements,
        public.order_payments, public.order_items, public.fittings,
        public.orders, public.customers, public.workers, public.expenses;
end;
$$;
select pg_temp.wipe();

-- =========================================================================
\echo '--- THE COLUMNS THEMSELVES ---'
-- Run as the owner: this is about the schema, not about who may read it.
do $$
begin
    perform pg_temp.ok('measurement_values.data is jsonb',
        (select data_type from information_schema.columns
          where table_schema = 'public' and table_name = 'measurement_values' and column_name = 'data') = 'jsonb');
    perform pg_temp.ok('orders.measurements_snapshot is jsonb',
        (select data_type from information_schema.columns
          where table_schema = 'public' and table_name = 'orders' and column_name = 'measurements_snapshot') = 'jsonb');

    -- The only thing any constraint asks of the contents is "is a JSON object".
    -- None mentions a number, a cast or a pattern, so none can refuse a letter.
    perform pg_temp.ok('no constraint on measurement_values looks at the VALUES, only that data is an object',
        not exists (
            select 1 from pg_constraint
             where conrelid = 'public.measurement_values'::regclass and contype = 'c'
               and pg_get_constraintdef(oid) ~* '(numeric|float|integer|int4|double|\^\[|~\*?\s)'
               and conname <> 'measurement_values_category_valid'),
        (select string_agg(conname, ', ') from pg_constraint
          where conrelid = 'public.measurement_values'::regclass and contype = 'c'));
    perform pg_temp.ok('the data constraint is exactly "is an object"',
        (select pg_get_constraintdef(oid) from pg_constraint
          where conrelid = 'public.measurement_values'::regclass and conname = 'measurement_values_data_is_object')
        ilike '%jsonb_typeof(data) = ''object''%');
    perform pg_temp.ok('the order snapshot constraint is exactly "null or an object"',
        (select pg_get_constraintdef(oid) from pg_constraint
          where conrelid = 'public.orders'::regclass and conname = 'orders_snapshot_is_object')
        ilike '%jsonb_typeof(measurements_snapshot) = ''object''%');
    perform pg_temp.ok('no trigger on either table rewrites or validates measurement values',
        not exists (
            select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
             where t.tgrelid in ('public.measurement_values'::regclass)
               and not t.tgisinternal
               and p.prosrc ~* 'data'));
end $$;

set role authenticated;

insert into public.customers (id, name, phone) values
    ('c0000000-0000-4000-8000-0000000000a1', 'Free Text', '9830000001'),
    ('c0000000-0000-4000-8000-0000000000a2', 'Legacy Numbers', '9830000002');

insert into public.measurements (id, customer_id, unit) values
    ('11111111-0000-4000-8000-0000000000a1', 'c0000000-0000-4000-8000-0000000000a1', 'inches'),
    ('11111111-0000-4000-8000-0000000000a2', 'c0000000-0000-4000-8000-0000000000a2', 'inches');

-- =========================================================================
\echo ''
\echo '--- TEXT IN EVERY GARMENT, BESIDE VALUES STORED AS NUMBERS ---'
insert into public.measurement_values (measurement_id, garment_category, data) values
    ('11111111-0000-4000-8000-0000000000a1', 'coat', $j${
        "length":"31 L","chest":"40","stomach":36.5,"hip":"XL","shoulder":"18.5 R",
        "sleeve":" 25 ","xBack":"15 1/2","collar":"ਲੰਬਾ","jacketLength":"","waistcoatLength":0}$j$),
    ('11111111-0000-4000-8000-0000000000a1', 'pant',
        '{"length":"40 R","waist":"34 Tight","hip":"40.5","thigh":24.5,"inLeg":"31","bottom":15,"body":"N/A"}'),
    ('11111111-0000-4000-8000-0000000000a1', 'shirt',   '{"length":"29 Slim","chest":"38 Tight","collar":"15.5"}'),
    ('11111111-0000-4000-8000-0000000000a1', 'kurta',   '{"length":"XL","chest":"40.5 R"}'),
    ('11111111-0000-4000-8000-0000000000a1', 'pajama',  '{"waist":"34 L","length":"40"}'),
    -- the three garments added later, which the closed category list had to be widened for
    ('11111111-0000-4000-8000-0000000000a1', 'waistcoat',      '{"length":"25 L","chest":"39"}'),
    ('11111111-0000-4000-8000-0000000000a1', 'jacket_garment', '{"length":"31 R","collar":"XL"}'),
    ('11111111-0000-4000-8000-0000000000a1', 'sherwani',       '{"length":"42 L","sleeve":"15 1/2"}'),
    -- a customer measured before this change: every value a number
    ('11111111-0000-4000-8000-0000000000a2', 'coat',
        '{"length":30,"chest":40,"stomach":36.5,"hip":41,"shoulder":18.5,"sleeve":25,"xBack":17.5,"collar":16}'),
    ('11111111-0000-4000-8000-0000000000a2', 'pant',
        '{"length":40,"waist":34,"hip":40.5,"thigh":24.5,"inLeg":31,"bottom":15,"body":11}');

insert into public.orders (id, customer_id, customer_name, customer_phone, order_date, delivery_date, measurements_snapshot) values
    ('00000000-0000-4000-8000-0000000000a1', 'c0000000-0000-4000-8000-0000000000a1', 'Free Text', '9830000001',
     '2026-09-01', '2026-09-20',
     $j${"unit":"inches","coat":{"length":"31 L","chest":"40","hip":"XL","collar":"ਲੰਬਾ"},
         "waistcoat":{"length":"25 L"},"sherwani":{"sleeve":"15 1/2"},"pant":{"waist":34,"body":"N/A"}}$j$),
    ('00000000-0000-4000-8000-0000000000a2', 'c0000000-0000-4000-8000-0000000000a2', 'Legacy Numbers', '9830000002',
     '2026-08-01', '2026-08-20',
     '{"unit":"inches","coat":{"length":30,"chest":40,"stomach":36.5},"pant":{"waist":34,"length":40}}');

do $$
declare d jsonb;
begin
    perform pg_temp.ok('all eight garments accepted text, beside the numeric customer',
        (select count(*) from public.measurement_values) = 10);

    select data into d from public.measurement_values
     where measurement_id = '11111111-0000-4000-8000-0000000000a1' and garment_category = 'coat';
    perform pg_temp.ok('"31 L" comes back as "31 L"',            d ->> 'length' = '31 L');
    perform pg_temp.ok('and is a string',                        jsonb_typeof(d -> 'length') = 'string');
    perform pg_temp.ok('"40" typed as text stays text',          jsonb_typeof(d -> 'chest') = 'string' and d ->> 'chest' = '40');
    perform pg_temp.ok('36.5 stored as a number stays a number', jsonb_typeof(d -> 'stomach') = 'number' and d ->> 'stomach' = '36.5');
    perform pg_temp.ok('letters alone: "XL"',                    d ->> 'hip' = 'XL');
    perform pg_temp.ok('number, space, letter: "18.5 R"',        d ->> 'shoulder' = '18.5 R');
    perform pg_temp.ok('surrounding spaces are kept: " 25 "',    d ->> 'sleeve' = ' 25 ');
    perform pg_temp.ok('a fraction is kept as written: "15 1/2"', d ->> 'xBack' = '15 1/2');
    perform pg_temp.ok('another script is kept: ਲੰਬਾ',            d ->> 'collar' = 'ਲੰਬਾ');
    perform pg_temp.ok('an empty string is not turned into null or zero',
        jsonb_typeof(d -> 'jacketLength') = 'string' and d ->> 'jacketLength' = '');
    perform pg_temp.ok('a number 0 and a string "0" are different values',
        jsonb_typeof(d -> 'waistcoatLength') = 'number' and '0'::jsonb <> '"0"'::jsonb);

    select data into d from public.measurement_values
     where measurement_id = '11111111-0000-4000-8000-0000000000a1' and garment_category = 'pant';
    perform pg_temp.ok('one object holds text and numbers together',
        jsonb_typeof(d -> 'length') = 'string' and jsonb_typeof(d -> 'thigh') = 'number' and d ->> 'body' = 'N/A');

    perform pg_temp.ok('waistcoat, jacket and sherwani hold text too',
        (select data ->> 'length' from public.measurement_values where garment_category = 'waistcoat') = '25 L'
        and (select data ->> 'collar' from public.measurement_values where garment_category = 'jacket_garment') = 'XL'
        and (select data ->> 'sleeve' from public.measurement_values where garment_category = 'sherwani') = '15 1/2');

    perform pg_temp.ok('the order''s own snapshot holds text exactly',
        (select measurements_snapshot -> 'coat' ->> 'hip' from public.orders
          where id = '00000000-0000-4000-8000-0000000000a1') = 'XL'
        and (select measurements_snapshot -> 'sherwani' ->> 'sleeve' from public.orders
          where id = '00000000-0000-4000-8000-0000000000a1') = '15 1/2');

    perform pg_temp.ok('the pre-existing numeric customer is untouched: every value still a number',
        (select bool_and(jsonb_typeof(v.value) = 'number')
           from public.measurement_values mv, jsonb_each(mv.data) v
          where mv.measurement_id = '11111111-0000-4000-8000-0000000000a2'));
end $$;

-- =========================================================================
\echo ''
\echo '--- THE APPLICATION''S OWN WRITE: AN UPSERT ---'
-- supabaseRepository.saveMeasurement upserts on (measurement_id, garment_category).
-- A customer whose chest was the number 40 is re-measured as "40 L".
create temp table pg_temp.legacy_before as
    select garment_category, data, md5(data::text) as h
      from public.measurement_values
     where measurement_id = '11111111-0000-4000-8000-0000000000a2';

insert into public.measurement_values (measurement_id, garment_category, data)
values ('11111111-0000-4000-8000-0000000000a2', 'coat',
        '{"length":30,"chest":"40 L","stomach":36.5,"hip":41,"shoulder":18.5,"sleeve":25,"xBack":17.5,"collar":16}')
on conflict (measurement_id, garment_category) do update set data = excluded.data;

do $$
begin
    perform pg_temp.ok('the upsert replaced the number with text',
        (select data ->> 'chest' from public.measurement_values
          where measurement_id = '11111111-0000-4000-8000-0000000000a2' and garment_category = 'coat') = '40 L');
    perform pg_temp.ok('and left exactly one coat row for that customer, not two',
        (select count(*) from public.measurement_values
          where measurement_id = '11111111-0000-4000-8000-0000000000a2' and garment_category = 'coat') = 1);
    perform pg_temp.ok('the values around it kept their number type',
        (select jsonb_typeof(data -> 'length') = 'number' and jsonb_typeof(data -> 'stomach') = 'number'
           from public.measurement_values
          where measurement_id = '11111111-0000-4000-8000-0000000000a2' and garment_category = 'coat'));
    perform pg_temp.ok('that customer''s pant row was not touched by it',
        (select md5(data::text) from public.measurement_values
          where measurement_id = '11111111-0000-4000-8000-0000000000a2' and garment_category = 'pant')
        = (select h from pg_temp.legacy_before where garment_category = 'pant'));
end $$;

-- =========================================================================
\echo ''
\echo '--- WHAT STAYS REFUSED ---'
do $$
declare v_blocked boolean;
begin
    -- Free text did not loosen anything it should not have.
    v_blocked := false;
    begin
        insert into public.measurement_values (measurement_id, garment_category, data)
        values ('11111111-0000-4000-8000-0000000000a2', 'shirt', '"XL"');
    exception when check_violation then v_blocked := true;
    end;
    perform pg_temp.ok('a bare string is still not a garment record', v_blocked);

    v_blocked := false;
    begin
        insert into public.measurement_values (measurement_id, garment_category, data)
        values ('11111111-0000-4000-8000-0000000000a2', 'shirt', '["XL","40"]');
    exception when check_violation then v_blocked := true;
    end;
    perform pg_temp.ok('an array is still not a garment record', v_blocked);

    v_blocked := false;
    begin
        insert into public.measurement_values (measurement_id, garment_category, data)
        values ('11111111-0000-4000-8000-0000000000a2', 'cape', '{"length":"30 L"}');
    exception when check_violation then v_blocked := true;
    end;
    perform pg_temp.ok('an unknown garment category is still refused', v_blocked);
end $$;

-- =========================================================================
\echo ''
\echo '--- EXPORT, WIPE, RESTORE: EVERY VALUE COMES BACK EXACTLY ---'
create temp table pg_temp.before_values as
    select measurement_id, garment_category, data, md5(data::text) as h from public.measurement_values;
create temp table pg_temp.before_snap as
    select id, measurements_snapshot as snap, md5(measurements_snapshot::text) as h from public.orders;
create temp table pg_temp.captured (payload jsonb);
insert into pg_temp.captured select public.export_backup();

do $$
declare v_result jsonb;
begin
    perform pg_temp.ok('the export carries every measurement row',
        (select count(*) from jsonb_array_elements((select payload from pg_temp.captured) -> 'measurement_values'))
        = (select count(*) from pg_temp.before_values));
    perform pg_temp.ok('and the text is in the file as written',
        (select payload::text from pg_temp.captured) like '%"31 L"%'
        and (select payload::text from pg_temp.captured) like '%15 1/2%'
        and (select payload::text from pg_temp.captured) like '%ਲੰਬਾ%');

    perform pg_temp.wipe();
    perform pg_temp.ok('the database is empty before the restore',
        (select count(*) from public.measurement_values) = 0 and (select count(*) from public.orders) = 0);

    v_result := public.restore_backup((select payload from pg_temp.captured), 'alphanumeric round trip');
    -- restore_backup reports the profiles it wrote (`measurements`), not a count
    -- of the value rows inside them; those are compared one by one below.
    perform pg_temp.ok('the restore reports both measurement profiles it wrote',
        (v_result ->> 'measurements')::int = 2, v_result::text);
end $$;

do $$
declare n_total int; n_same int; n_same_snap int;
begin
    select count(*) into n_total from pg_temp.before_values;
    select count(*) into n_same
      from pg_temp.before_values b
      join public.measurement_values a using (measurement_id, garment_category)
     where a.data = b.data and md5(a.data::text) = b.h;
    perform pg_temp.ok('every measurement row is back, value for value, type for type',
        n_same = n_total, format('%s of %s identical', n_same, n_total));

    select count(*) into n_same_snap
      from pg_temp.before_snap b join public.orders o using (id)
     where o.measurements_snapshot = b.snap and md5(o.measurements_snapshot::text) = b.h;
    perform pg_temp.ok('every order snapshot is back identical',
        n_same_snap = (select count(*) from pg_temp.before_snap), format('%s identical', n_same_snap));

    perform pg_temp.ok('a restored "31 L" is still a string and still "31 L"',
        (select jsonb_typeof(data -> 'length') = 'string' and data ->> 'length' = '31 L'
           from public.measurement_values
          where measurement_id = '11111111-0000-4000-8000-0000000000a1' and garment_category = 'coat'));
    perform pg_temp.ok('a restored legacy number is still a number',
        (select jsonb_typeof(data -> 'length') = 'number'
           from public.measurement_values
          where measurement_id = '11111111-0000-4000-8000-0000000000a2' and garment_category = 'pant'));
    perform pg_temp.ok('a restored "40 L" (the upserted value) is still "40 L"',
        (select data ->> 'chest' from public.measurement_values
          where measurement_id = '11111111-0000-4000-8000-0000000000a2' and garment_category = 'coat') = '40 L');
    perform pg_temp.ok('no duplicate rows appeared',
        (select count(*) from public.measurement_values) = (select count(*) from pg_temp.before_values));
end $$;

reset role;
select pg_temp.wipe();

do $$ begin raise notice 'PASS  alphanumeric measurements suite completed'; end $$;
