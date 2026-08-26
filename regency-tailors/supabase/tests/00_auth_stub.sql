-- =========================================================================
-- Local-only reproduction of the Supabase auth surface.
--
-- On Supabase these objects are provided by GoTrue and PostgREST: PostgREST
-- sets the `role` and the `request.jwt.claims` GUC per request, and auth.uid()
-- / auth.jwt() read from it. Recreating them lets the schema, policies and
-- RPCs be tested against a real PostgreSQL server without Docker.
--
-- This file is NEVER applied to a Supabase project — the migrations in
-- supabase/migrations/ are.
-- =========================================================================

create schema if not exists auth;

create table if not exists auth.users (
    id                  uuid primary key default gen_random_uuid(),
    email               text unique,
    raw_user_meta_data  jsonb default '{}'::jsonb,
    created_at          timestamptz default now()
);

create or replace function auth.jwt() returns jsonb
language sql stable as $$
    select coalesce(
        nullif(current_setting('request.jwt.claims', true), '')::jsonb,
        '{}'::jsonb
    );
$$;

create or replace function auth.uid() returns uuid
language sql stable as $$
    select nullif(auth.jwt() ->> 'sub', '')::uuid;
$$;

create or replace function auth.role() returns text
language sql stable as $$
    select coalesce(auth.jwt() ->> 'role', 'anon');
$$;

-- PostgREST connects as one of these roles depending on the request's token.
do $$
begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then
        create role anon nologin;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin;
    end if;
end;
$$;

grant usage on schema auth to anon, authenticated;
grant execute on function auth.jwt(), auth.uid(), auth.role() to anon, authenticated;
grant select on auth.users to authenticated;
