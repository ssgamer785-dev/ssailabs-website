-- =========================================================================
-- REGENCY TAILOR — BACKUP: SHOWROOM SETTINGS + AUDIT HISTORY
--
-- Two corrections to the backup pair, both additive. Nothing about business
-- data retention changes: there is still no expiry, no scheduled purge and no
-- automatic deletion anywhere in this database.
--
--   1. showroom_settings was exported but never restored, so restoring onto a
--      fresh project silently left the showroom's own name, address and phone
--      at whatever the seed migration wrote. It is now restored with the rest
--      of the dataset, inside the same transaction.
--
--   2. audit_log was neither exported nor restored. It is now EXPORTED, so a
--      backup preserves the showroom's history, and it is still deliberately
--      NOT RESTORED. See the note on restore_backup below.
-- =========================================================================

-- -------------------------------------------------------------------------
-- Export the complete business dataset as the application's backup payload.
-- Runs as the caller, so RLS applies: an unauthorised account gets nothing.
--
-- audit_log is included so the record of who did what survives a disaster.
-- It is exported for preservation only; restore_backup never writes it back.
-- -------------------------------------------------------------------------
create or replace function public.export_backup()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
    v_payload jsonb;
begin
    if not public.is_authorized_admin() then
        raise exception 'Not authorised to export showroom data'
            using errcode = '42501';
    end if;

    select jsonb_build_object(
        'customers',    coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at)  from public.customers c), '[]'::jsonb),
        'orders',       coalesce((select jsonb_agg(to_jsonb(o) order by o.order_number) from public.orders o),   '[]'::jsonb),
        'order_items',  coalesce((select jsonb_agg(to_jsonb(i) order by i.order_id, i.position) from public.order_items i), '[]'::jsonb),
        'order_payments', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at) from public.order_payments p), '[]'::jsonb),
        'measurements', coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at)  from public.measurements m), '[]'::jsonb),
        'measurement_values', coalesce((select jsonb_agg(to_jsonb(v) order by v.measurement_id) from public.measurement_values v), '[]'::jsonb),
        'fittings',     coalesce((select jsonb_agg(to_jsonb(f) order by f.scheduled_date) from public.fittings f), '[]'::jsonb),
        'workers',      coalesce((select jsonb_agg(to_jsonb(w) order by w.created_at)  from public.workers w),  '[]'::jsonb),
        'expenses',     coalesce((select jsonb_agg(to_jsonb(e) order by e.spent_on)    from public.expenses e), '[]'::jsonb),
        -- Preserved in the file, never written back by a restore.
        'audit_log',    coalesce((select jsonb_agg(to_jsonb(a) order by a.id)          from public.audit_log a), '[]'::jsonb),
        'showroom_settings', (select to_jsonb(s) from public.showroom_settings s limit 1),
        'order_sequence', (select last_value from public.order_number_seq)
    ) into v_payload;

    return v_payload;
end;
$$;

revoke all on function public.export_backup() from public, anon;
grant execute on function public.export_backup() to authenticated;

comment on function public.export_backup() is
  'Complete business dataset for the .regency.backup file, including '
  'soft-deleted rows and the audit history. Business data only — no keys, '
  'tokens or credentials. Security invoker, so RLS applies and an '
  'unauthorised account exports nothing.';

-- -------------------------------------------------------------------------
-- Replace the entire dataset from a validated payload, atomically.
--
-- On audit_log: the payload carries it, and this function deliberately does
-- not read it. The audit trail is append-only by grant (no UPDATE, no DELETE
-- for anyone) and letting a file overwrite it would make it worthless as a
-- record — anyone able to restore could rewrite who did what. Existing audit
-- rows therefore survive a restore untouched, and the restore itself appends
-- one more row saying it happened.
--
-- On showroom_settings: restored when the payload carries them, left exactly
-- as they are when it does not, so an older backup taken before settings were
-- exported cannot blank the showroom's own address.
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

    -- Settings, when present, must be a JSON object. A malformed value is
    -- rejected here rather than part-way through the replacement.
    if v_settings is not null and jsonb_typeof(v_settings) not in ('object', 'null') then
        raise exception 'Backup payload showroom_settings must be a JSON object';
    end if;

    -- Every order must name a customer present in the same payload, or the
    -- restore would produce orphans that the app cannot render.
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

    -- 3. Safety copy of what is about to be replaced.
    insert into public.backup_snapshots (taken_by, reason, payload)
    values (auth.uid(), p_reason, public.export_backup())
    returning id into v_snapshot_id;

    -- 4. Replace. Children first; FKs cascade but explicit is clearer.
    delete from public.measurement_values;
    delete from public.measurements;
    delete from public.order_payments;
    delete from public.order_items;
    delete from public.fittings;
    delete from public.orders;
    delete from public.customers;
    delete from public.workers;
    delete from public.expenses;

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
  'Atomic full-dataset restore. Validates first, snapshots current data to '
  'backup_snapshots, then replaces everything in one transaction. Any error '
  'rolls the whole restore back — production is never partially overwritten. '
  'Showroom settings are restored when the payload carries them and left '
  'untouched when it does not. The audit log is never restored: it is '
  'append-only and a file must not be able to rewrite who did what.';
