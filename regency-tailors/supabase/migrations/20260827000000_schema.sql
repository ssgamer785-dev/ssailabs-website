-- =========================================================================
-- REGENCY TAILOR — PRODUCTION SCHEMA (Admin-only access model)
--
-- Supersedes 20260825_security_and_rls.sql, which was never applied to any
-- database and contained an anonymous data-exfiltration RPC
-- (get_client_portal_data, GRANT EXECUTE TO anon).
--
-- Design notes that are easy to get wrong later:
--   * There is exactly one application role: Admin. Anyone with a row in
--     staff_profiles is an Admin. There is no role column and no second tier.
--   * Deletion is soft (deleted_at) so foreign keys never orphan and issued
--     order numbers are never recycled. The trash_items view reproduces the
--     shape the existing Trash screen already consumes.
--   * Derived money (customer totals, invoices) lives in views, never in
--     stored counters — the columns that drifted in the localStorage build.
--   * orders.measurements_snapshot stays JSONB on purpose: it is an immutable
--     point-in-time record so a slip reprinted next year shows what was
--     measured that day, not the current ledger.
-- =========================================================================

create extension if not exists pgcrypto;

-- -------------------------------------------------------------------------
-- 1. AUTHORISED STAFF
--
-- Keyed by email so the owner's Google account can be authorised *before*
-- it has ever signed in. user_id is linked on first sign-in by a trigger.
-- No role column: a row here means full access, its absence means none.
-- -------------------------------------------------------------------------
create table if not exists public.staff_profiles (
    email       text primary key,
    user_id     uuid unique references auth.users(id) on delete set null,
    full_name   text,
    is_active   boolean not null default true,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    constraint staff_profiles_email_lowercase check (email = lower(email))
);

comment on table public.staff_profiles is
  'Allowlist of authorised Admin accounts. Google sign-in alone grants nothing; '
  'an active row here is what RLS checks.';

-- -------------------------------------------------------------------------
-- 2. SHOWROOM SETTINGS (single row)
-- -------------------------------------------------------------------------
create table if not exists public.showroom_settings (
    id          boolean primary key default true,
    name        text not null default 'REGENCY TAILOR',
    subtitle    text not null default 'Bespoke Showroom & Tailoring Suite',
    city        text,
    address_line1 text,
    address_line2 text,
    phone       text,
    email       text,
    gstin       text,
    updated_at  timestamptz not null default now(),
    updated_by  uuid references auth.users(id) on delete set null,
    constraint showroom_settings_singleton check (id)
);

-- -------------------------------------------------------------------------
-- 3. CUSTOMERS
--
-- phone_normalized is generated and unique: the duplicate-customer defect
-- found in the Stage 1 audit becomes structurally impossible.
-- -------------------------------------------------------------------------
create table if not exists public.customers (
    id                uuid primary key default gen_random_uuid(),
    legacy_id         text unique,
    name              text not null,
    phone             text not null,
    phone_normalized  text generated always as (
                        right(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 10)
                      ) stored,
    email             text,
    address           text,
    city              text,
    notes             text,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),
    created_by        uuid references auth.users(id) on delete set null,
    deleted_at        timestamptz,
    deleted_by        uuid references auth.users(id) on delete set null,
    constraint customers_name_not_blank check (length(btrim(name)) > 0),
    constraint customers_phone_has_digits check (length(regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g')) >= 10)
);

-- Two live customers may not share a phone number. Soft-deleted rows are
-- excluded so a number can be reused after a record is retired.
create unique index if not exists customers_phone_unique_live
    on public.customers (phone_normalized)
    where deleted_at is null;

create index if not exists customers_live_idx on public.customers (created_at desc) where deleted_at is null;

-- -------------------------------------------------------------------------
-- 4. ORDER NUMBERING
--
-- A plain sequence. Collision-safe across sessions and devices by
-- construction; no advisory lock is needed and none is used (the superseded
-- migration serialised every order creation for no benefit). Gaps from
-- rolled-back transactions are correct: a number handed out is retired.
-- -------------------------------------------------------------------------
create sequence if not exists public.order_number_seq as bigint start with 1 increment by 1;

-- -------------------------------------------------------------------------
-- 5. ORDERS
-- -------------------------------------------------------------------------
create table if not exists public.orders (
    id                    uuid primary key default gen_random_uuid(),
    legacy_id             text unique,
    order_number          bigint not null unique default nextval('public.order_number_seq'),
    customer_id           uuid not null references public.customers(id) on delete restrict,

    -- Point-in-time copy of who placed the order. Not duplication: a bill
    -- reprinted after the client changes address must show the old one.
    customer_name         text not null,
    customer_phone        text not null,
    customer_email        text,
    customer_address      text,

    order_date            date not null default current_date,
    trial_date            date,
    trial_time            text,
    trial_required        boolean not null default false,
    trial_charge          numeric(10,2) not null default 0,
    delivery_date         date not null,
    delivery_time         text,
    delivery_type         text,

    status                text not null default 'New',
    production_status     text not null default 'New',
    production_notes      text,
    priority              text not null default 'Normal',
    salesperson           text,
    special_instructions  text,
    fitting_notes         text,
    notes                 text,
    urgent                boolean not null default false,

    subtotal              numeric(12,2) not null default 0,
    discount              numeric(10,2) not null default 0,
    tax_amount            numeric(10,2) not null default 0,
    total_amount          numeric(12,2) not null default 0,
    advance_paid          numeric(12,2) not null default 0,
    balance_due           numeric(12,2) generated always as (greatest(total_amount - advance_paid, 0)) stored,
    payment_method        text,

    measurements_snapshot jsonb,

    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now(),
    created_by            uuid references auth.users(id) on delete set null,
    deleted_at            timestamptz,
    deleted_by            uuid references auth.users(id) on delete set null,

    constraint orders_status_valid check (status in (
        'New','Measurement Taken','Fabric Cutting','Master Stitching',
        'First Trial','Final Fitting','Ready for Pickup','Delivered')),
    constraint orders_production_status_valid check (production_status in (
        'New','In Production','Ready','Completed')),
    constraint orders_money_not_negative check (
        subtotal >= 0 and discount >= 0 and tax_amount >= 0
        and total_amount >= 0 and advance_paid >= 0),
    constraint orders_snapshot_is_object check (
        measurements_snapshot is null or jsonb_typeof(measurements_snapshot) = 'object')
);

create index if not exists orders_customer_idx on public.orders (customer_id) where deleted_at is null;
create index if not exists orders_delivery_idx on public.orders (delivery_date) where deleted_at is null;
create index if not exists orders_number_idx   on public.orders (order_number desc);

-- -------------------------------------------------------------------------
-- 6. ORDER ITEMS (garments)
--
-- position is stable and unique per order so the production slip's #1..#n
-- garment badges never renumber.
-- -------------------------------------------------------------------------
create table if not exists public.order_items (
    id                   uuid primary key default gen_random_uuid(),
    legacy_id            text,
    order_id             uuid not null references public.orders(id) on delete cascade,
    position             integer not null,
    garment_type         text not null,
    fabric_code          text,
    fabric_name          text,
    notes                text,
    style_notes          text,
    special_instructions text,
    remarks              text,
    price                numeric(10,2) not null default 0,
    quantity             integer not null default 1,
    line_total           numeric(12,2) generated always as (price * quantity) stored,
    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now(),

    constraint order_items_position_positive check (position >= 1),
    constraint order_items_quantity_positive check (quantity >= 1),
    constraint order_items_price_not_negative check (price >= 0),
    constraint order_items_garment_not_blank check (length(btrim(garment_type)) > 0),
    unique (order_id, position)
);

create index if not exists order_items_order_idx on public.order_items (order_id, position);

-- -------------------------------------------------------------------------
-- 7. ORDER PAYMENTS
--
-- The source of truth for money received. orders.advance_paid is kept in
-- step by trigger, so the counter that drifted in the localStorage build
-- can no longer disagree with the payment history.
-- -------------------------------------------------------------------------
create table if not exists public.order_payments (
    id          uuid primary key default gen_random_uuid(),
    legacy_id   text,
    order_id    uuid not null references public.orders(id) on delete cascade,
    paid_on     date not null default current_date,
    amount      numeric(12,2) not null,
    method      text,
    note        text,
    created_at  timestamptz not null default now(),
    created_by  uuid references auth.users(id) on delete set null,
    constraint order_payments_amount_positive check (amount > 0)
);

create index if not exists order_payments_order_idx on public.order_payments (order_id, paid_on);

-- -------------------------------------------------------------------------
-- 8. MEASUREMENTS
--
-- One ledger row per customer for the shared attributes, plus one row per
-- garment category for the numbers themselves. Splitting the categories is
-- deliberate: a shirt-only order upserts a single row and is structurally
-- incapable of blanking a client's coat or pant measurements — the exact
-- defect the Stage 1 audit reproduced.
-- -------------------------------------------------------------------------
create table if not exists public.measurements (
    id              uuid primary key default gen_random_uuid(),
    legacy_id       text unique,
    customer_id     uuid not null unique references public.customers(id) on delete cascade,
    last_order_id   uuid references public.orders(id) on delete set null,
    unit            text not null default 'inches',
    fit_preference  text,
    posture_notes   text,
    fitting_notes   text,
    garment_remarks jsonb,
    last_updated    date not null default current_date,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    deleted_at      timestamptz,
    deleted_by      uuid references auth.users(id) on delete set null,
    constraint measurements_unit_valid check (unit in ('inches','cm')),
    constraint measurements_remarks_is_object check (
        garment_remarks is null or jsonb_typeof(garment_remarks) = 'object')
);

create table if not exists public.measurement_values (
    id               uuid primary key default gen_random_uuid(),
    measurement_id   uuid not null references public.measurements(id) on delete cascade,
    garment_category text not null,
    data             jsonb not null default '{}'::jsonb,
    updated_at       timestamptz not null default now(),
    constraint measurement_values_category_valid check (
        garment_category in ('coat','pant','shirt','kurta','pajama')),
    constraint measurement_values_data_is_object check (jsonb_typeof(data) = 'object'),
    unique (measurement_id, garment_category)
);

-- -------------------------------------------------------------------------
-- 9. FITTINGS
-- -------------------------------------------------------------------------
create table if not exists public.fittings (
    id               uuid primary key default gen_random_uuid(),
    legacy_id        text unique,
    order_id         uuid not null references public.orders(id) on delete cascade,
    garment          text,
    trial_stage      text not null default 'First Trial',
    scheduled_date   date not null,
    scheduled_time   text,
    status           text not null default 'Scheduled',
    adjustment_notes text,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    constraint fittings_stage_valid  check (trial_stage in ('First Trial','Second Trial','Final Polish')),
    constraint fittings_status_valid check (status in ('Scheduled','Completed','Re-Trial Needed','Cancelled'))
);

create index if not exists fittings_order_idx on public.fittings (order_id);
create index if not exists fittings_date_idx  on public.fittings (scheduled_date);

-- -------------------------------------------------------------------------
-- 10. WORKERS & EXPENSES
-- -------------------------------------------------------------------------
create table if not exists public.workers (
    id                            uuid primary key default gen_random_uuid(),
    legacy_id                     text unique,
    name                          text not null,
    role                          text,
    phone                         text,
    type                          text not null default 'Piece-Rate',
    rate_per_garment              numeric(10,2) not null default 0,
    monthly_salary                numeric(10,2) not null default 0,
    garments_completed_this_month integer not null default 0,
    total_earned                  numeric(12,2) not null default 0,
    advance_taken                 numeric(12,2) not null default 0,
    balance_payout                numeric(12,2) generated always as (greatest(total_earned - advance_taken, 0)) stored,
    status                        text not null default 'Active',
    created_at                    timestamptz not null default now(),
    updated_at                    timestamptz not null default now(),
    deleted_at                    timestamptz,
    deleted_by                    uuid references auth.users(id) on delete set null,
    constraint workers_status_valid check (status in ('Active','On Leave'))
);

create table if not exists public.expenses (
    id          uuid primary key default gen_random_uuid(),
    legacy_id   text unique,
    spent_on    date not null default current_date,
    category    text not null,
    description text,
    amount      numeric(12,2) not null,
    paid_to     text,
    created_at  timestamptz not null default now(),
    created_by  uuid references auth.users(id) on delete set null,
    constraint expenses_amount_not_negative check (amount >= 0)
);

-- -------------------------------------------------------------------------
-- 11. AUDIT LOG (append-only) & BACKUP SNAPSHOTS
-- -------------------------------------------------------------------------
create table if not exists public.audit_log (
    id          bigserial primary key,
    at          timestamptz not null default now(),
    actor_id    uuid references auth.users(id) on delete set null,
    actor_email text,
    action      text not null,
    entity_type text,
    entity_id   text,
    details     jsonb
);

create index if not exists audit_log_at_idx on public.audit_log (at desc);

-- Automatic safety copy taken immediately before a backup restore, so a
-- restore can itself be undone.
create table if not exists public.backup_snapshots (
    id          uuid primary key default gen_random_uuid(),
    taken_at    timestamptz not null default now(),
    taken_by    uuid references auth.users(id) on delete set null,
    reason      text not null,
    payload     jsonb not null
);

create index if not exists backup_snapshots_taken_idx on public.backup_snapshots (taken_at desc);
