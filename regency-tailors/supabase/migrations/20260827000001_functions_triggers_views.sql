-- =========================================================================
-- REGENCY TAILOR — FUNCTIONS, TRIGGERS AND DERIVED VIEWS
--
-- Every SECURITY DEFINER function below pins search_path. An unpinned
-- search_path on a SECURITY DEFINER function is a privilege-escalation
-- vector: a caller can shadow a referenced object and have it executed with
-- the definer's rights.
-- =========================================================================

-- -------------------------------------------------------------------------
-- ACCESS GATE
--
-- The single authorisation predicate for the whole application. Signing in
-- with Google produces an authenticated JWT for *any* Google account; that
-- on its own grants nothing. Access requires an active staff_profiles row.
--
-- Matched on user_id OR the verified email claim, so an account authorised
-- after it first signed in still works without re-linking.
-- -------------------------------------------------------------------------
create or replace function public.is_authorized_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select exists (
        select 1
        from public.staff_profiles sp
        where sp.is_active
          and (
                (auth.uid() is not null and sp.user_id = auth.uid())
             or (nullif(auth.jwt() ->> 'email', '') is not null
                 and sp.email = lower(auth.jwt() ->> 'email'))
          )
    );
$$;

comment on function public.is_authorized_admin() is
  'True only for an active account in staff_profiles. Every RLS policy in the '
  'application delegates to this. Never trust a client-supplied role.';

-- -------------------------------------------------------------------------
-- Link a Google account to its allowlist row on first sign-in.
-- -------------------------------------------------------------------------
create or replace function public.link_staff_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    update public.staff_profiles
       set user_id = new.id,
           full_name = coalesce(full_name, new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
           updated_at = now()
     where email = lower(new.email)
       and (user_id is null or user_id = new.id);
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.link_staff_profile();

-- -------------------------------------------------------------------------
-- Authorise an Admin account by email. Idempotent.
-- Run once by the owner with their real Google address; never seeded with a
-- made-up address, because an invented allowlist entry is a live account.
-- -------------------------------------------------------------------------
create or replace function public.authorize_admin(p_email text, p_full_name text default null)
returns public.staff_profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_row public.staff_profiles;
begin
    if p_email is null or position('@' in p_email) = 0 then
        raise exception 'A valid email address is required';
    end if;

    insert into public.staff_profiles (email, full_name, is_active)
    values (lower(btrim(p_email)), p_full_name, true)
    on conflict (email) do update
        set is_active  = true,
            full_name  = coalesce(excluded.full_name, public.staff_profiles.full_name),
            updated_at = now()
    returning * into v_row;

    -- Link immediately if that account has already signed in.
    update public.staff_profiles sp
       set user_id = u.id, updated_at = now()
      from auth.users u
     where sp.email = v_row.email
       and sp.user_id is null
       and lower(u.email) = v_row.email;

    -- Re-read rather than using UPDATE ... RETURNING: the update matches no
    -- rows when the account is already linked, which would null out v_row.
    select * into v_row from public.staff_profiles where email = v_row.email;

    return v_row;
end;
$$;

revoke all on function public.authorize_admin(text, text) from public, anon, authenticated;

-- -------------------------------------------------------------------------
-- updated_at maintenance
-- -------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

do $$
declare t text;
begin
    foreach t in array array[
        'staff_profiles','showroom_settings','customers','orders','order_items',
        'measurements','fittings','workers'
    ] loop
        execute format('drop trigger if exists touch_%1$s on public.%1$s', t);
        execute format(
            'create trigger touch_%1$s before update on public.%1$s
             for each row execute function public.touch_updated_at()', t);
    end loop;
end;
$$;

-- -------------------------------------------------------------------------
-- Keep orders.advance_paid equal to the sum of its payments.
-- -------------------------------------------------------------------------
create or replace function public.sync_order_advance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_order uuid := coalesce(new.order_id, old.order_id);
begin
    update public.orders o
       set advance_paid = coalesce(
             (select sum(p.amount) from public.order_payments p where p.order_id = v_order), 0)
     where o.id = v_order;
    return coalesce(new, old);
end;
$$;

drop trigger if exists sync_advance_on_payment on public.order_payments;
create trigger sync_advance_on_payment
    after insert or update or delete on public.order_payments
    for each row execute function public.sync_order_advance();

-- -------------------------------------------------------------------------
-- Record soft deletes and restores in the append-only audit log.
-- -------------------------------------------------------------------------
create or replace function public.audit_soft_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if old.deleted_at is distinct from new.deleted_at then
        insert into public.audit_log (actor_id, actor_email, action, entity_type, entity_id, details)
        values (
            auth.uid(),
            nullif(auth.jwt() ->> 'email', ''),
            case when new.deleted_at is null then 'restore' else 'soft_delete' end,
            tg_table_name,
            new.id::text,
            jsonb_build_object('deleted_at', new.deleted_at)
        );
    end if;
    return new;
end;
$$;

do $$
declare t text;
begin
    foreach t in array array['customers','orders','measurements','workers'] loop
        execute format('drop trigger if exists audit_delete_%1$s on public.%1$s', t);
        execute format(
            'create trigger audit_delete_%1$s after update of deleted_at on public.%1$s
             for each row execute function public.audit_soft_delete()', t);
    end loop;
end;
$$;

-- =========================================================================
-- DERIVED VIEWS
--
-- security_invoker = true is mandatory. Without it a view executes with the
-- *owner's* rights and silently bypasses RLS on its base tables, which would
-- turn every view below into an unauthenticated data leak.
-- =========================================================================

-- Customer totals derived from orders. These were stored counters in the
-- localStorage build and drifted; deriving them removes the failure mode.
create or replace view public.customers_with_stats
with (security_invoker = true) as
select
    c.*,
    coalesce(o.total_orders, 0)   as total_orders,
    coalesce(o.lifetime_spend, 0) as lifetime_spend,
    coalesce(o.last_visit_date, c.created_at::date) as last_visit_date
from public.customers c
left join lateral (
    select count(*)                     as total_orders,
           sum(ord.total_amount)        as lifetime_spend,
           max(ord.order_date)          as last_visit_date
    from public.orders ord
    where ord.customer_id = c.id
      and ord.deleted_at is null
) o on true;

-- Bills are computed, never stored. The localStorage build kept a parallel
-- copy of the line items on each invoice and it drifted from the order.
create or replace view public.invoices
with (security_invoker = true) as
select
    'INV-' || o.order_number::text as id,
    o.id                           as order_id,
    o.order_number,
    o.customer_name,
    o.customer_phone,
    o.order_date                   as date,
    coalesce(items.items, '[]'::jsonb) as items,
    o.subtotal,
    o.tax_amount                   as gst_amount,
    o.discount,
    o.total_amount                 as grand_total,
    o.advance_paid                 as amount_paid,
    o.balance_due                  as balance_remaining,
    coalesce(o.payment_method, (
        select p.method from public.order_payments p
        where p.order_id = o.id order by p.paid_on, p.created_at limit 1
    ))                             as payment_mode,
    case
        when o.advance_paid > 0 and o.balance_due = 0 then 'Paid'
        when o.advance_paid > 0                       then 'Partial'
        else 'Outstanding'
    end                            as status
from public.orders o
left join lateral (
    select jsonb_agg(
             jsonb_build_object(
               'description', i.garment_type || coalesce(' (' || nullif(i.fabric_name,'') || ')', ''),
               'qty',    i.quantity,
               'rate',   i.price,
               'amount', i.line_total
             ) order by i.position
           ) as items
    from public.order_items i
    where i.order_id = o.id
) items on true
where o.deleted_at is null;

-- The Trash screen's existing shape, assembled from soft-deleted rows.
create or replace view public.trash_items
with (security_invoker = true) as
select
    'TRASH-CUSTOMER-' || c.id::text as id,
    'Customer'                      as item_type,
    'Client Profile: ' || c.name || ' (' || c.phone || ')' as title,
    c.id::text                      as entity_id,
    c.deleted_at,
    c.deleted_by
from public.customers c where c.deleted_at is not null
union all
select
    'TRASH-ORDER-' || o.id::text,
    'Order',
    'Bespoke Order ' || o.order_number::text || ' (' || o.customer_name || ')',
    o.id::text,
    o.deleted_at,
    o.deleted_by
from public.orders o where o.deleted_at is not null
union all
select
    'TRASH-MEASUREMENT-' || m.id::text,
    'Measurement',
    'Measurement Spec: ' || coalesce(c.name, 'Unknown Client'),
    m.id::text,
    m.deleted_at,
    m.deleted_by
from public.measurements m
join public.customers c on c.id = m.customer_id
where m.deleted_at is not null
union all
select
    'TRASH-WORKER-' || w.id::text,
    'Worker',
    'Artisan: ' || w.name,
    w.id::text,
    w.deleted_at,
    w.deleted_by
from public.workers w where w.deleted_at is not null;
