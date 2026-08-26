-- =========================================================================
-- REGENCY TAILORS — ROW LEVEL SECURITY (Admin-only)
--
-- One access model, one predicate: public.is_authorized_admin().
-- There are no role tiers, no per-column masking and no policies granting
-- anything to anon.
--
-- Layered on purpose:
--   1. anon holds no table privileges at all — it is refused before RLS is
--      even consulted.
--   2. authenticated holds table privileges but every row is gated by an
--      active staff_profiles entry, so a Google account that is not on the
--      allowlist authenticates successfully and still sees nothing.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Strip anonymous access to everything, now and in future.
-- -------------------------------------------------------------------------
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

-- -------------------------------------------------------------------------
-- 2. Enable RLS everywhere.
--
-- FORCE applies the policies to the table owner too, so a mistaken or
-- compromised SECURITY DEFINER routine cannot read around them.
--
-- staff_profiles is deliberately NOT forced: is_authorized_admin() is
-- SECURITY DEFINER and reads that table, and forcing RLS on it would make
-- the policy recurse into the function that evaluates the policy.
-- -------------------------------------------------------------------------
alter table public.staff_profiles    enable row level security;

do $$
declare t text;
begin
    foreach t in array array[
        'showroom_settings','customers','orders','order_items','order_payments',
        'measurements','measurement_values','fittings','workers','expenses',
        'audit_log','backup_snapshots'
    ] loop
        execute format('alter table public.%I enable row level security', t);
        execute format('alter table public.%I force  row level security', t);
    end loop;
end;
$$;

-- -------------------------------------------------------------------------
-- 3. Table privileges for the authenticated role.
-- -------------------------------------------------------------------------
grant usage on schema public to authenticated;

do $$
declare t text;
begin
    foreach t in array array[
        'staff_profiles','showroom_settings','customers','orders','order_items',
        'order_payments','measurements','measurement_values','fittings','workers',
        'expenses','backup_snapshots'
    ] loop
        execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    end loop;
end;
$$;

-- The audit trail is append-only: no UPDATE, no DELETE, for anyone.
grant select, insert on public.audit_log to authenticated;
grant usage, select on sequence public.audit_log_id_seq to authenticated;
grant usage, select on sequence public.order_number_seq to authenticated;

grant select on public.customers_with_stats, public.invoices, public.trash_items to authenticated;

-- -------------------------------------------------------------------------
-- 4. Policies — one per table, all delegating to the same gate.
-- -------------------------------------------------------------------------
do $$
declare t text;
begin
    foreach t in array array[
        'showroom_settings','customers','orders','order_items','order_payments',
        'measurements','measurement_values','fittings','workers','expenses',
        'backup_snapshots'
    ] loop
        execute format('drop policy if exists admin_full_access on public.%I', t);
        execute format(
            'create policy admin_full_access on public.%I
             for all to authenticated
             using (public.is_authorized_admin())
             with check (public.is_authorized_admin())', t);
    end loop;
end;
$$;

-- Audit log: readable and appendable by an authorised Admin, never mutable.
drop policy if exists audit_read   on public.audit_log;
drop policy if exists audit_append on public.audit_log;

create policy audit_read on public.audit_log
    for select to authenticated
    using (public.is_authorized_admin());

create policy audit_append on public.audit_log
    for insert to authenticated
    with check (public.is_authorized_admin());

-- Staff allowlist: an authorised Admin manages accounts; an authenticated
-- account that is not on the list may read only its own row, so the app can
-- tell the difference between "not signed in" and "not authorised".
drop policy if exists staff_admin_manage on public.staff_profiles;
drop policy if exists staff_read_self    on public.staff_profiles;

create policy staff_admin_manage on public.staff_profiles
    for all to authenticated
    using (public.is_authorized_admin())
    with check (public.is_authorized_admin());

create policy staff_read_self on public.staff_profiles
    for select to authenticated
    using (
        (auth.uid() is not null and user_id = auth.uid())
        or (nullif(auth.jwt() ->> 'email', '') is not null and email = lower(auth.jwt() ->> 'email'))
    );

-- -------------------------------------------------------------------------
-- 5. Function privileges
-- -------------------------------------------------------------------------
revoke all on function public.is_authorized_admin() from public, anon;
grant execute on function public.is_authorized_admin() to authenticated;
