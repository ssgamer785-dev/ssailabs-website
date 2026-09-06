-- =========================================================================
-- Regency Tailor — permanent deletion, and a restore that Supabase accepts
--
-- Two production failures, both raised by the database and both reported to
-- the counter hand as a red banner they could do nothing about.
--
--   Trash → permanent delete of a customer
--     update or delete on table "customers" violates foreign key constraint
--     "orders_customer_id_fkey" on table "orders"
--
--   Backup & Recovery → import
--     DELETE requires a WHERE clause
--
-- Nothing here weakens a constraint, a policy or a grant to make either go
-- away. `orders.customer_id` stays ON DELETE RESTRICT, every table keeps Row
-- Level Security, and the guard that rejects an unqualified DELETE keeps
-- rejecting one.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. PERMANENT DELETION
--
-- The Trash screen deleted the parent row straight from the browser:
--
--     from('customers').delete().eq('id', …).not('deleted_at','is',null)
--
-- `orders.customer_id` is ON DELETE RESTRICT — deliberately, so that a
-- customer with orders on the books cannot be erased by a stray request — so
-- Postgres refused, and any customer who had ever placed an order could not
-- be emptied from the trash at all. RESTRICT is right; deleting only the
-- parent row was the mistake. Permanent deletion has to remove the whole
-- tree the record owns, in an order the foreign keys allow, or nothing.
--
-- What a record owns, read off the schema rather than assumed:
--
--   customers  ←  orders.customer_id            restrict
--              ←  measurements.customer_id      cascade, unique per customer
--   orders     ←  order_items.order_id          cascade
--              ←  order_payments.order_id       cascade
--              ←  fittings.order_id             cascade
--              ←  measurements.last_order_id    set null
--   measurements ← measurement_values.measurement_id  cascade
--
-- The cascades would carry most of this on their own. They are spelled out
-- anyway: an explicit delete says what is being removed, is visible in the
-- returned counts, and does not change meaning if a cascade rule is ever
-- edited. `measurements.last_order_id` is the one pointer that is not
-- ownership — a measurement profile belongs to the customer, one row each,
-- and is only tagged with the last order it was taken for. Purging an order
-- clears that tag; it never deletes the profile, which the customer's other
-- orders still need.
-- -------------------------------------------------------------------------
create or replace function public.purge_trash_entry(p_entity_type text, p_entity_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_title   text;
    v_counts  jsonb := '{}'::jsonb;
    v_n       bigint;
begin
    -- Authorisation is decided here, inside the definer function, never by the
    -- caller. An account that is not the showroom admin gets nothing done.
    if not public.is_authorized_admin() then
        raise exception 'Not authorised to permanently delete showroom records'
            using errcode = '42501';
    end if;

    if p_entity_id is null then
        raise exception 'A record id is required to delete permanently'
            using errcode = '22004';
    end if;

    -- An allow-list of four entity types, checked against literals. No table
    -- name, column name or predicate ever comes from the caller, and there is
    -- no dynamic SQL in this function at all.
    if p_entity_type is null or p_entity_type not in ('Customer', 'Order', 'Measurement', 'Worker') then
        raise exception 'Unknown record type "%" — nothing was deleted',
            coalesce(p_entity_type, '(none)') using errcode = '22023';
    end if;

    -- ---------------------------------------------------------------- customer
    if p_entity_type = 'Customer' then
        select c.name into v_title
          from public.customers c
         where c.id = p_entity_id and c.deleted_at is not null;
        if v_title is null then
            raise exception 'That customer is not in the trash, so nothing was deleted'
                using errcode = 'P0002';
        end if;

        delete from public.measurement_values mv
         using public.measurements m
         where mv.measurement_id = m.id and m.customer_id = p_entity_id;
        get diagnostics v_n = row_count;
        v_counts := v_counts || jsonb_build_object('measurement_values', v_n);

        delete from public.measurements m where m.customer_id = p_entity_id;
        get diagnostics v_n = row_count;
        v_counts := v_counts || jsonb_build_object('measurements', v_n);

        delete from public.order_payments p
         using public.orders o
         where p.order_id = o.id and o.customer_id = p_entity_id;
        get diagnostics v_n = row_count;
        v_counts := v_counts || jsonb_build_object('order_payments', v_n);

        delete from public.order_items i
         using public.orders o
         where i.order_id = o.id and o.customer_id = p_entity_id;
        get diagnostics v_n = row_count;
        v_counts := v_counts || jsonb_build_object('order_items', v_n);

        delete from public.fittings f
         using public.orders o
         where f.order_id = o.id and o.customer_id = p_entity_id;
        get diagnostics v_n = row_count;
        v_counts := v_counts || jsonb_build_object('fittings', v_n);

        delete from public.orders o where o.customer_id = p_entity_id;
        get diagnostics v_n = row_count;
        v_counts := v_counts || jsonb_build_object('orders', v_n);

        delete from public.customers c
         where c.id = p_entity_id and c.deleted_at is not null;
        get diagnostics v_n = row_count;
        v_counts := v_counts || jsonb_build_object('customers', v_n);

    -- ------------------------------------------------------------------- order
    elsif p_entity_type = 'Order' then
        select 'Order ' || o.order_number::text into v_title
          from public.orders o
         where o.id = p_entity_id and o.deleted_at is not null;
        if v_title is null then
            raise exception 'That order is not in the trash, so nothing was deleted'
                using errcode = 'P0002';
        end if;

        -- The measurement profile belongs to the customer and stays. Only the
        -- "measured for this order" tag is cleared.
        update public.measurements m
           set last_order_id = null
         where m.last_order_id = p_entity_id;
        get diagnostics v_n = row_count;
        v_counts := v_counts || jsonb_build_object('measurements_untagged', v_n);

        delete from public.order_payments p where p.order_id = p_entity_id;
        get diagnostics v_n = row_count;
        v_counts := v_counts || jsonb_build_object('order_payments', v_n);

        delete from public.order_items i where i.order_id = p_entity_id;
        get diagnostics v_n = row_count;
        v_counts := v_counts || jsonb_build_object('order_items', v_n);

        delete from public.fittings f where f.order_id = p_entity_id;
        get diagnostics v_n = row_count;
        v_counts := v_counts || jsonb_build_object('fittings', v_n);

        delete from public.orders o
         where o.id = p_entity_id and o.deleted_at is not null;
        get diagnostics v_n = row_count;
        v_counts := v_counts || jsonb_build_object('orders', v_n);

    -- ------------------------------------------------------------- measurement
    elsif p_entity_type = 'Measurement' then
        select 'Measurement profile' into v_title
          from public.measurements m
         where m.id = p_entity_id and m.deleted_at is not null;
        if v_title is null then
            raise exception 'That measurement profile is not in the trash, so nothing was deleted'
                using errcode = 'P0002';
        end if;

        delete from public.measurement_values mv where mv.measurement_id = p_entity_id;
        get diagnostics v_n = row_count;
        v_counts := v_counts || jsonb_build_object('measurement_values', v_n);

        delete from public.measurements m
         where m.id = p_entity_id and m.deleted_at is not null;
        get diagnostics v_n = row_count;
        v_counts := v_counts || jsonb_build_object('measurements', v_n);

    -- ------------------------------------------------------------------ worker
    else
        select w.name into v_title
          from public.workers w
         where w.id = p_entity_id and w.deleted_at is not null;
        if v_title is null then
            raise exception 'That artisan record is not in the trash, so nothing was deleted'
                using errcode = 'P0002';
        end if;

        delete from public.workers w
         where w.id = p_entity_id and w.deleted_at is not null;
        get diagnostics v_n = row_count;
        v_counts := v_counts || jsonb_build_object('workers', v_n);
    end if;

    v_counts := v_counts || jsonb_build_object('entity_type', p_entity_type,
                                               'entity_id', p_entity_id,
                                               'title', v_title);

    -- The audit trail records who erased what. It is append-only by grant and
    -- is never itself deleted here.
    insert into public.audit_log (actor_id, actor_email, action, entity_type, entity_id, details)
    values (auth.uid(), nullif(auth.jwt() ->> 'email', ''), 'permanent_delete',
            p_entity_type, p_entity_id::text, v_counts);

    return v_counts;
end;
$$;

revoke all on function public.purge_trash_entry(text, uuid) from public, anon;
grant execute on function public.purge_trash_entry(text, uuid) to authenticated;

comment on function public.purge_trash_entry(text, uuid) is
  'Permanently removes one trashed record and everything it exclusively owns, '
  'in foreign-key order, in a single transaction: all of it or none of it. '
  'Only records already in the trash can be purged, the entity type is checked '
  'against a four-value allow-list, there is no dynamic SQL, and authorisation '
  'is decided inside the function by is_authorized_admin(). Purging an order '
  'never deletes its customer; purging a measurement never deletes either.';

-- -------------------------------------------------------------------------
-- 2. RESTORE
--
-- `restore_backup` cleared the business tables with nine bare statements:
--
--     delete from public.measurement_values;
--     delete from public.measurements;
--     …
--
-- Supabase preloads pg_safeupdate for the role PostgREST connects as, which
-- rejects any DELETE or UPDATE with no WHERE clause — including one inside a
-- function body — with exactly the message the showroom saw. The local test
-- cluster has no such extension, which is why a suite that exercises restore
-- end to end never caught it.
--
-- The fix is not a WHERE clause that means "all rows anyway". A restore
-- replaces the whole business dataset — export_backup() reads every row of
-- exactly these nine tables, and the payload that comes back is the complete
-- state to put in their place — so the honest statement for it is TRUNCATE,
-- which says "every row of the tables I have named" and cannot be read as
-- anything narrower.
--
-- Every table holding a foreign key into a truncated one is named in the same
-- statement, and CASCADE is deliberately absent: if a future migration adds a
-- table that references customers or orders and does not add it here, this
-- fails loudly at restore time instead of quietly emptying it. TRUNCATE is
-- transactional in PostgreSQL, so the rollback guarantee below is unchanged:
-- an error anywhere after this point leaves production exactly as it was.
--
-- Everything else about the function — the authorisation check, the shape and
-- relationship validation, the pre-restore snapshot, the explicit column
-- lists, the settings handling, the sequence reset, and the audit log being
-- exported but never restored — is carried over unchanged.
-- -------------------------------------------------------------------------
create or replace function public.restore_backup(p_payload jsonb, p_reason text default 'manual restore')
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_customers    jsonb := coalesce(p_payload -> 'customers', '[]'::jsonb);
    v_orders       jsonb := coalesce(p_payload -> 'orders', '[]'::jsonb);
    v_items        jsonb := coalesce(p_payload -> 'order_items', '[]'::jsonb);
    v_payments     jsonb := coalesce(p_payload -> 'order_payments', '[]'::jsonb);
    v_measurements jsonb := coalesce(p_payload -> 'measurements', '[]'::jsonb);
    v_values       jsonb := coalesce(p_payload -> 'measurement_values', '[]'::jsonb);
    v_fittings     jsonb := coalesce(p_payload -> 'fittings', '[]'::jsonb);
    v_workers      jsonb := coalesce(p_payload -> 'workers', '[]'::jsonb);
    v_expenses     jsonb := coalesce(p_payload -> 'expenses', '[]'::jsonb);
    v_settings     jsonb := p_payload -> 'showroom_settings';
    v_seq          bigint;
    v_snapshot_id  uuid;
    v_counts       jsonb;
    v_settings_restored boolean := false;
begin
    -- 1. Authorisation, checked inside the definer function itself.
    if not public.is_authorized_admin() then
        raise exception 'Not authorised to restore showroom data'
            using errcode = '42501';
    end if;

    -- 2. Shape validation before a single row is touched.
    if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
        raise exception 'Backup payload must be a JSON object';
    end if;

    if jsonb_typeof(v_customers) <> 'array' or jsonb_typeof(v_orders) <> 'array'
       or jsonb_typeof(v_items) <> 'array' or jsonb_typeof(v_measurements) <> 'array' then
        raise exception 'Backup payload collections must be JSON arrays';
    end if;

    if v_settings is not null and jsonb_typeof(v_settings) not in ('object', 'null') then
        raise exception 'Backup payload showroom_settings must be a JSON object';
    end if;

    if exists (
        select 1
        from jsonb_array_elements(v_orders) o
        where not exists (
            select 1 from jsonb_array_elements(v_customers) c
            where c ->> 'id' = o ->> 'customer_id'
        )
    ) then
        raise exception 'Backup is inconsistent: one or more orders reference a customer that is not in the file';
    end if;

    -- Children must name a parent that is in the same file, for the same
    -- reason orders must: a restore that leaves rows pointing at nothing is
    -- not a restore. Checked before anything is cleared, so a bad file costs
    -- the showroom nothing.
    if exists (
        select 1 from jsonb_array_elements(v_items) i
        where not exists (select 1 from jsonb_array_elements(v_orders) o where o ->> 'id' = i ->> 'order_id')
    ) then
        raise exception 'Backup is inconsistent: one or more garment lines reference an order that is not in the file';
    end if;

    if exists (
        select 1 from jsonb_array_elements(v_measurements) m
        where not exists (select 1 from jsonb_array_elements(v_customers) c where c ->> 'id' = m ->> 'customer_id')
    ) then
        raise exception 'Backup is inconsistent: one or more measurement profiles reference a customer that is not in the file';
    end if;

    if exists (
        select 1 from jsonb_array_elements(v_values) v
        where not exists (select 1 from jsonb_array_elements(v_measurements) m where m ->> 'id' = v ->> 'measurement_id')
    ) then
        raise exception 'Backup is inconsistent: one or more measurement values reference a profile that is not in the file';
    end if;

    -- 3. Safety copy of what is about to be replaced.
    insert into public.backup_snapshots (taken_by, reason, payload)
    values (auth.uid(), p_reason, public.export_backup())
    returning id into v_snapshot_id;

    -- 4. Clear the nine business tables the payload replaces. Named in full,
    --    no CASCADE, and audit_log, backup_snapshots, staff_profiles and
    --    showroom_settings are deliberately not among them.
    truncate table
        public.measurement_values,
        public.measurements,
        public.order_payments,
        public.order_items,
        public.fittings,
        public.orders,
        public.customers,
        public.workers,
        public.expenses;

    -- Columns are listed explicitly rather than `select *` for two reasons:
    -- generated columns (phone_normalized, balance_due, line_total,
    -- balance_payout) cannot be written to, and an explicit list means a
    -- backup taken under an older schema still restores instead of failing on
    -- column order.
    insert into public.customers (
        id, legacy_id, name, phone, email, address, city, notes,
        created_at, updated_at, created_by, deleted_at, deleted_by)
    select id, legacy_id, name, phone, email, address, city, notes,
        created_at, updated_at, created_by, deleted_at, deleted_by
    from jsonb_populate_recordset(null::public.customers, v_customers);

    insert into public.orders (
        id, legacy_id, order_number, customer_id,
        customer_name, customer_phone, customer_email, customer_address,
        order_date, trial_date, trial_time, trial_required, trial_charge,
        delivery_date, delivery_time, delivery_type,
        status, production_status, production_notes, priority, salesperson,
        special_instructions, fitting_notes, notes, urgent,
        subtotal, discount, tax_amount, total_amount, advance_paid, payment_method,
        measurements_snapshot, created_at, updated_at, created_by, deleted_at, deleted_by)
    select
        id, legacy_id, order_number, customer_id,
        customer_name, customer_phone, customer_email, customer_address,
        order_date, trial_date, trial_time, trial_required, trial_charge,
        delivery_date, delivery_time, delivery_type,
        status, production_status, production_notes, priority, salesperson,
        special_instructions, fitting_notes, notes, urgent,
        subtotal, discount, tax_amount, total_amount, advance_paid, payment_method,
        measurements_snapshot, created_at, updated_at, created_by, deleted_at, deleted_by
    from jsonb_populate_recordset(null::public.orders, v_orders);

    insert into public.order_items (
        id, legacy_id, order_id, position, garment_type, fabric_code, fabric_name,
        notes, style_notes, special_instructions, remarks, price, quantity,
        created_at, updated_at)
    select
        id, legacy_id, order_id, position, garment_type, fabric_code, fabric_name,
        notes, style_notes, special_instructions, remarks, price, quantity,
        created_at, updated_at
    from jsonb_populate_recordset(null::public.order_items, v_items);

    insert into public.order_payments (
        id, legacy_id, order_id, paid_on, amount, method, note, created_at, created_by)
    select id, legacy_id, order_id, paid_on, amount, method, note, created_at, created_by
    from jsonb_populate_recordset(null::public.order_payments, v_payments);

    insert into public.measurements (
        id, legacy_id, customer_id, last_order_id, unit, fit_preference,
        posture_notes, fitting_notes, garment_remarks, last_updated,
        created_at, updated_at, deleted_at, deleted_by)
    select
        id, legacy_id, customer_id, last_order_id, unit, fit_preference,
        posture_notes, fitting_notes, garment_remarks, last_updated,
        created_at, updated_at, deleted_at, deleted_by
    from jsonb_populate_recordset(null::public.measurements, v_measurements);

    insert into public.measurement_values (id, measurement_id, garment_category, data, updated_at)
    select id, measurement_id, garment_category, data, updated_at
    from jsonb_populate_recordset(null::public.measurement_values, v_values);

    insert into public.fittings (
        id, legacy_id, order_id, garment, trial_stage, scheduled_date, scheduled_time,
        status, adjustment_notes, created_at, updated_at)
    select
        id, legacy_id, order_id, garment, trial_stage, scheduled_date, scheduled_time,
        status, adjustment_notes, created_at, updated_at
    from jsonb_populate_recordset(null::public.fittings, v_fittings);

    insert into public.workers (
        id, legacy_id, name, role, phone, type, rate_per_garment, monthly_salary,
        garments_completed_this_month, total_earned, advance_taken, status,
        created_at, updated_at, deleted_at, deleted_by)
    select
        id, legacy_id, name, role, phone, type, rate_per_garment, monthly_salary,
        garments_completed_this_month, total_earned, advance_taken, status,
        created_at, updated_at, deleted_at, deleted_by
    from jsonb_populate_recordset(null::public.workers, v_workers);

    insert into public.expenses (
        id, legacy_id, spent_on, category, description, amount, paid_to, created_at, created_by)
    select id, legacy_id, spent_on, category, description, amount, paid_to, created_at, created_by
    from jsonb_populate_recordset(null::public.expenses, v_expenses);

    -- 4b. The showroom's own details. Updated in place rather than deleted and
    -- re-inserted: the table is a singleton guarded by a check constraint, and
    -- a backup without settings must leave the existing row alone rather than
    -- blank the address that prints on every customer bill.
    if v_settings is not null and jsonb_typeof(v_settings) = 'object' then
        update public.showroom_settings s
           set name          = coalesce(nullif(v_settings ->> 'name', ''), s.name),
               subtitle      = coalesce(nullif(v_settings ->> 'subtitle', ''), s.subtitle),
               city          = v_settings ->> 'city',
               address_line1 = v_settings ->> 'address_line1',
               address_line2 = v_settings ->> 'address_line2',
               phone         = v_settings ->> 'phone',
               email         = v_settings ->> 'email',
               gstin         = v_settings ->> 'gstin',
               updated_at    = now(),
               updated_by    = auth.uid()
         where s.id;
        v_settings_restored := true;
    end if;

    -- 5. Never re-issue an order number that exists in the restored data.
    v_seq := greatest(
        coalesce((p_payload ->> 'order_sequence')::bigint, 0),
        coalesce((select max(order_number) from public.orders), 0),
        1
    );
    perform setval('public.order_number_seq', v_seq);

    -- 6. The restore has to leave the database in a state the app can read.
    --    Checked before the transaction commits, so a payload that would
    --    produce an unusable database rolls back with production intact.
    if exists (select 1 from public.orders o
                where not exists (select 1 from public.customers c where c.id = o.customer_id)) then
        raise exception 'Restore aborted: the restored data left orders without a customer';
    end if;

    v_counts := jsonb_build_object(
        'customers',    (select count(*) from public.customers),
        'orders',       (select count(*) from public.orders),
        'order_items',  (select count(*) from public.order_items),
        'measurements', (select count(*) from public.measurements),
        'snapshot_id',  v_snapshot_id,
        'order_sequence', v_seq,
        'showroom_settings_restored', v_settings_restored,
        -- Stated in the result so the caller can see it was a deliberate
        -- omission rather than a silent drop.
        'audit_log_restored', false
    );

    insert into public.audit_log (actor_id, actor_email, action, entity_type, details)
    values (auth.uid(), nullif(auth.jwt() ->> 'email', ''), 'restore_backup', 'database', v_counts);

    return v_counts;
end;
$$;

revoke all on function public.restore_backup(jsonb, text) from public, anon;
grant execute on function public.restore_backup(jsonb, text) to authenticated;

comment on function public.restore_backup(jsonb, text) is
  'Atomic full-dataset restore. Validates the payload and its parent/child '
  'relationships first, snapshots current data to backup_snapshots, then '
  'clears exactly the nine business tables it replaces with a single named '
  'TRUNCATE (no CASCADE) and re-inserts. Any error rolls the whole restore '
  'back — production is never partially overwritten. Showroom settings are '
  'restored when the payload carries them and left untouched when it does '
  'not. The audit log is never restored: it is append-only and a file must '
  'not be able to rewrite who did what.';
