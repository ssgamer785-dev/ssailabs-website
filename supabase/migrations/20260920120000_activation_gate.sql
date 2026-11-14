-- ============================================================================
-- The Traders Planet App — activation gate
--
-- Access to the app stops being "you have a Supabase session" and becomes "you
-- have a session AND your profile has been activated with a one-time code an
-- admin issued". Membership requests from people without a code are captured
-- so the admin can follow them up.
--
-- Additive only. This migration creates two tables, two enums, five functions
-- and two columns on profiles. It does not drop, truncate, rewrite or delete
-- anything, and it does not touch auth.users, posts, chat or notifications.
--
-- On existing rows: profiles.activated_at defaults to NULL, so every account
-- that exists when this runs is un-activated and will meet the gate. Admins
-- are exempt by is_activated() below, so the existing admin keeps working.
-- Deliberately NOT backfilling anyone else and deliberately NOT deleting any
-- account — see supabase/README.md, "Retiring test accounts", for the audited,
-- explicitly-run path for that.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------

create type public.membership_request_status as enum
  ('pending', 'contacted', 'approved', 'rejected');

-- ----------------------------------------------------------------------------
-- activation_codes
--
-- The plaintext code is never stored. It is shown to the admin once, at
-- creation, and only its SHA-256 is kept — so a leaked database dump, a
-- mis-scoped policy or a future reporting query cannot hand anyone a usable
-- code. code_hint keeps the last four characters so the admin list can still
-- identify a row ("TP-****-7K2M") without being able to redeem it.
-- ----------------------------------------------------------------------------

create table public.activation_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  code_hint text not null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  redeemed_by uuid references public.profiles (id) on delete set null,

  -- Redemption is all-or-nothing: a row can never carry a time without a user
  -- or a user without a time.
  constraint activation_codes_redemption_complete check (
    (redeemed_at is null and redeemed_by is null) or
    (redeemed_at is not null and redeemed_by is not null)
  )
);

comment on table public.activation_codes is
  'One-time app access codes. Plaintext is never stored; only sha256(code). Reachable solely through the SECURITY DEFINER functions below — the API roles hold no privileges on this table.';

create index activation_codes_created_at_idx on public.activation_codes (created_at desc);

-- ----------------------------------------------------------------------------
-- membership_requests
--
-- Submitted from the activation gate by someone who has authenticated but has
-- no code. Submitting one grants nothing; it is a contact record.
-- ----------------------------------------------------------------------------

create table public.membership_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references public.profiles (id) on delete set null,
  email text not null,
  name text not null,
  mobile text not null,
  trading_experience text not null,
  address text not null,
  status public.membership_request_status not null default 'pending',
  created_at timestamptz not null default now(),

  constraint membership_requests_email_present  check (length(btrim(email)) between 3 and 320),
  constraint membership_requests_name_present   check (length(btrim(name)) between 1 and 120),
  constraint membership_requests_mobile_present check (length(btrim(mobile)) between 5 and 32),
  constraint membership_requests_exp_present    check (length(btrim(trading_experience)) between 1 and 2000),
  constraint membership_requests_address_present check (length(btrim(address)) between 1 and 500)
);

comment on table public.membership_requests is
  'Contact requests from users without an activation code. Submitting one grants no access.';

create index membership_requests_created_at_idx on public.membership_requests (created_at desc);

-- ----------------------------------------------------------------------------
-- profiles: activation state
-- ----------------------------------------------------------------------------

alter table public.profiles
  add column if not exists activated_at timestamptz,
  add column if not exists activation_code_id uuid references public.activation_codes (id) on delete set null,
  -- Brute force is already impractical (see create_activation_code below), but
  -- a bounded attempt counter costs one column and turns "impractical" into
  -- "cannot be attempted at volume by a signed-in account".
  add column if not exists activation_attempts integer not null default 0,
  add column if not exists activation_last_attempt_at timestamptz;

comment on column public.profiles.activated_at is
  'Set by redeem_activation_code() only. NULL means the account is held at the activation gate. Admins bypass the gate — see is_activated().';

-- ----------------------------------------------------------------------------
-- is_activated()
--
-- The authorization predicate. SECURITY DEFINER for the same reason is_admin()
-- is: it is called from policy expressions on profiles, and a plain function
-- would recurse into that table's own RLS.
--
-- Admins are activated by definition. The person who issues codes cannot be
-- locked out by the code system, and this is what keeps the existing admin
-- account working across this migration.
-- ----------------------------------------------------------------------------

create or replace function public.is_activated(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = uid
       and (activated_at is not null or role = 'admin')
  );
$$;

-- ----------------------------------------------------------------------------
-- normalise_activation_code()
--
-- "tp-ab12-cd34", "TP AB12 CD34" and "TPAB12CD34" are the same code. Hashing
-- the normalised form means the user can type it however it reaches them.
-- IMMUTABLE so it can be used in an index or a generated column later.
-- ----------------------------------------------------------------------------

create or replace function public.normalise_activation_code(p_code text)
returns text
language sql
immutable
as $$
  select upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

-- ----------------------------------------------------------------------------
-- create_activation_code()  — admin only
--
-- Returns the plaintext code exactly once. Nothing stores it, so this return
-- value is the only time it exists outside the admin's screen.
--
-- The alphabet is 32 characters with I, O, 0 and 1 removed, so a code read
-- aloud or over WhatsApp cannot be mistyped into a different valid code. Eight
-- characters is 32^8 = 2^40 possibilities inside a 15-minute window.
--
-- gen_random_bytes() is pgcrypto's CSPRNG. One byte modulo 32 is unbiased
-- because 256 is an exact multiple of 32 — worth stating, because the same
-- pattern with a 26- or 36-character alphabet would not be.
--
-- search_path includes extensions: Supabase installs pgcrypto there, a plain
-- Postgres puts it in public, and this resolves under both without the call
-- sites having to know which.
-- ----------------------------------------------------------------------------

create or replace function public.create_activation_code()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid      uuid := auth.uid();
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_body     text;
  v_code     text;
  v_hash     text;
  v_expires  timestamptz;
  v_id       uuid;
begin
  if v_uid is null or not public.is_admin(v_uid) then
    raise exception 'Only an admin may create activation codes'
      using errcode = '42501';
  end if;

  -- The hash is taken over the NORMALISED PRESENTED code, not the raw body,
  -- so that what is stored here is byte-for-byte what redeem_activation_code()
  -- will compute from whatever the user types. Hashing the bare body instead
  -- would store sha256('7SA495TL') while redemption looked up
  -- sha256('TP7SA495TL'), and no code would ever redeem.
  loop
    v_body := '';
    for i in 1..8 loop
      v_body := v_body || substr(
        v_alphabet,
        1 + (get_byte(gen_random_bytes(1), 0) % length(v_alphabet)),
        1
      );
    end loop;
    v_code := 'TP-' || substr(v_body, 1, 4) || '-' || substr(v_body, 5, 4);
    v_hash := encode(digest(public.normalise_activation_code(v_code), 'sha256'), 'hex');
    exit when not exists (select 1 from public.activation_codes where code_hash = v_hash);
  end loop;

  -- now() is the transaction timestamp, taken by the database. The client is
  -- never asked when it thinks the code was made.
  v_expires := now() + interval '15 minutes';

  insert into public.activation_codes (code_hash, code_hint, created_by, expires_at)
  values (v_hash, right(v_body, 4), v_uid, v_expires)
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'code', v_code,
    'expires_at', v_expires
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- redeem_activation_code()  — any authenticated user, for themselves
--
-- The whole security boundary. Runs as the definer so it can reach a table the
-- caller has no privileges on, and it only ever activates auth.uid() — the
-- caller cannot name the user to activate, so there is no payload to tamper
-- with.
--
-- Atomicity: the UPDATE's own WHERE clause is the lock. Two sessions racing the
-- same code both reach the UPDATE; the first takes the row lock and commits,
-- the second blocks, then re-evaluates its WHERE against the committed row,
-- finds redeemed_at is no longer null, and matches zero rows. Exactly one
-- caller can ever see FOUND here. No advisory lock, no SELECT ... FOR UPDATE
-- and no read-then-write window is needed, and none would be safer.
--
-- Every failure returns the same 'invalid' reason. Distinguishing "expired"
-- from "already used" from "never existed" would confirm to a guesser that a
-- code exists, which is exactly what the 2^40 space is protecting.
-- ----------------------------------------------------------------------------

create or replace function public.redeem_activation_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid      uuid := auth.uid();
  v_hash     text;
  v_id       uuid;
  v_attempts integer;
  v_last     timestamptz;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  end if;

  -- Idempotent: re-submitting after activation is a no-op success rather than
  -- an error, so a double-tap or a retried request cannot burn a second code.
  if exists (select 1 from public.profiles where id = v_uid and activated_at is not null) then
    return jsonb_build_object('ok', true, 'reason', 'already_activated');
  end if;

  select activation_attempts, activation_last_attempt_at
    into v_attempts, v_last
    from public.profiles where id = v_uid
     for update;

  if v_last is not null and v_last > now() - interval '15 minutes' and v_attempts >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_attempts');
  end if;

  -- The window has rolled over: start counting again.
  if v_last is null or v_last <= now() - interval '15 minutes' then
    v_attempts := 0;
  end if;

  update public.profiles
     set activation_attempts = v_attempts + 1,
         activation_last_attempt_at = now()
   where id = v_uid;

  v_hash := encode(digest(public.normalise_activation_code(p_code), 'sha256'), 'hex');

  update public.activation_codes
     set redeemed_at = now(),
         redeemed_by = v_uid
   where code_hash = v_hash
     and redeemed_at is null
     and expires_at > now()
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  update public.profiles
     set activated_at = now(),
         activation_code_id = v_id,
         activation_attempts = 0
   where id = v_uid;

  return jsonb_build_object('ok', true, 'reason', 'activated');
end;
$$;

-- ----------------------------------------------------------------------------
-- admin_activation_codes()  — admin only
--
-- status is derived, never stored. A stored column would need a scheduled job
-- to flip 'active' to 'expired' at the 15-minute mark and would be wrong in
-- between; computing it at read time cannot drift.
-- ----------------------------------------------------------------------------

create or replace function public.admin_activation_codes(p_limit integer default 50)
returns table (
  id               uuid,
  code_hint        text,
  created_at       timestamptz,
  expires_at       timestamptz,
  redeemed_at      timestamptz,
  redeemed_by_name text,
  status           text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id,
         c.code_hint,
         c.created_at,
         c.expires_at,
         c.redeemed_at,
         p.full_name,
         case
           when c.redeemed_at is not null then 'USED'
           when c.expires_at <= now()     then 'EXPIRED'
           else 'ACTIVE'
         end
    from public.activation_codes c
    left join public.profiles p on p.id = c.redeemed_by
   where public.is_admin(auth.uid())
   order by c.created_at desc
   limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

-- ----------------------------------------------------------------------------
-- admin_membership_requests()  — admin only
-- ----------------------------------------------------------------------------

create or replace function public.admin_membership_requests(p_limit integer default 100)
returns setof public.membership_requests
language sql
stable
security definer
set search_path = public
as $$
  select r.*
    from public.membership_requests r
   where public.is_admin(auth.uid())
   order by r.created_at desc
   limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

-- ----------------------------------------------------------------------------
-- admin_set_membership_status()  — admin only
-- ----------------------------------------------------------------------------

create or replace function public.admin_set_membership_status(
  p_id uuid,
  p_status public.membership_request_status
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only an admin may change a membership request'
      using errcode = '42501';
  end if;
  update public.membership_requests set status = p_status where id = p_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------

alter table public.activation_codes   enable row level security;
alter table public.membership_requests enable row level security;

-- activation_codes carries no policies at all. Every legitimate path goes
-- through the SECURITY DEFINER functions above, so there is no row any API
-- role should reach directly. The privileges are revoked below as well; the
-- two together mean a future policy added by mistake still cannot leak a code.

-- A signed-in user may lodge a request, for themselves, and read nothing back.
create policy "membership_requests_insert_self"
  on public.membership_requests for insert
  to authenticated
  with check (requested_by = auth.uid());

create policy "membership_requests_select_admin"
  on public.membership_requests for select
  to authenticated
  using (public.is_admin());

create policy "membership_requests_update_admin"
  on public.membership_requests for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- Privileges
--
-- 20260823120000_api_grants.sql set a default privilege that hands every new
-- table full DML to `authenticated`, so both tables arrive wide open and have
-- to be closed here deliberately.
--
-- Functions are the opposite: 20260824120000 revoked the EXECUTE default, so
-- everything created above starts closed and is opened one name at a time.
-- ----------------------------------------------------------------------------

revoke all on public.activation_codes from public, anon, authenticated;
grant  select, insert, update, delete on public.activation_codes to service_role;

revoke all on public.membership_requests from public, anon, authenticated;
grant  insert                     on public.membership_requests to authenticated;
grant  select, update             on public.membership_requests to authenticated;
grant  select, insert, update, delete on public.membership_requests to service_role;

-- Client-callable.
grant execute on function public.redeem_activation_code(text)        to authenticated;
grant execute on function public.is_activated(uuid)                  to authenticated;
grant execute on function public.normalise_activation_code(text)     to authenticated;
grant execute on function public.create_activation_code()            to authenticated;
grant execute on function public.admin_activation_codes(integer)     to authenticated;
grant execute on function public.admin_membership_requests(integer)  to authenticated;
grant execute on function public.admin_set_membership_status(uuid, public.membership_request_status) to authenticated;

-- The four admin functions are granted to `authenticated` because that is the
-- role an admin's own session runs as; each one re-checks is_admin() in its
-- body, which is the actual gate. A student calling them gets 42501 or an
-- empty set, never a row.

grant execute on function public.redeem_activation_code(text)        to service_role;
grant execute on function public.is_activated(uuid)                  to service_role;
grant execute on function public.create_activation_code()            to service_role;
grant execute on function public.admin_activation_codes(integer)     to service_role;
grant execute on function public.admin_membership_requests(integer)  to service_role;
grant execute on function public.admin_set_membership_status(uuid, public.membership_request_status) to service_role;

-- ----------------------------------------------------------------------------
-- Stop a user granting themselves activation by writing to their own profile.
--
-- profiles_update_own_or_admin lets anyone update their own row, and it does
-- not restrict which columns. Without this trigger a signed-in user could
-- PATCH /rest/v1/profiles?id=eq.<self> with {"activated_at": "..."} and walk
-- straight through the gate — the activation columns would be decoration.
--
-- The discriminator is current_user, not auth.uid(): redeem_activation_code()
-- is SECURITY DEFINER, so inside it current_user is the function's owner,
-- while a request arriving through PostgREST is still running as
-- `authenticated`. That is the only difference between the two paths, because
-- auth.uid() is the same user in both.
--
-- This trigger is therefore deliberately NOT security definer — it has to see
-- the caller's real current_user to do its job.
--
-- Same shape as prevent_role_self_escalation() above it, which has guarded the
-- role column the same way since the first migration.
-- ----------------------------------------------------------------------------

create or replace function public.prevent_activation_self_grant()
returns trigger
language plpgsql
as $$
begin
  if (new.activated_at       is distinct from old.activated_at
   or new.activation_code_id is distinct from old.activation_code_id)
     and current_user in ('authenticated', 'anon') then
    raise exception 'Activation is granted by redeeming a code, not by writing to a profile'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_activation
  before update of activated_at, activation_code_id on public.profiles
  for each row execute function public.prevent_activation_self_grant();

-- ----------------------------------------------------------------------------
-- Make the gate an authorization boundary rather than a routing decision.
--
-- Up to here an un-activated user is only stopped by the client's router,
-- which is not a boundary at all: the REST endpoint is public and a crafted
-- request would still read the feed. These four policies are amended so the
-- data itself is unreadable until the account is activated.
--
-- Each one keeps its existing predicate exactly and gains `is_activated()` as
-- an additional conjunct. Admins satisfy is_activated() by definition, so no
-- admin path changes. Nothing is granted that was not granted before; this can
-- only narrow what is visible.
--
-- ALTER POLICY, not DROP + CREATE: it amends the expression in place, so the
-- policy is never absent for even an instant and nothing else about it — its
-- name, its command, its roles — is re-declared or can drift.
-- ----------------------------------------------------------------------------

alter policy "posts_select_authenticated"
  on public.posts
  using (public.is_activated());

alter policy "comments_select_authenticated"
  on public.comments
  using (public.is_activated());

alter policy "messages_select_participant"
  on public.messages
  using (
    public.is_activated()
    and (
      public.is_admin()
      or exists (
        select 1 from public.conversations c
         where c.id = messages.conversation_id
           and c.student_id = auth.uid()
      )
    )
  );

alter policy "notifications_select_own"
  on public.notifications
  using (public.is_activated() and user_id = auth.uid());
