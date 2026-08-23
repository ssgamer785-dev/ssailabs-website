-- ============================================================================
-- The Traders Planet App — API role privileges
--
-- The earlier migrations create every table, policy and function but never
-- issue a GRANT. On a real Supabase project that is not enough: the default
-- ACLs give anon/authenticated/service_role only REFERENCES, TRIGGER and
-- TRUNCATE on new tables in `public`, so PostgREST answers every client query
-- with `42501 permission denied` before RLS is ever consulted.
--
-- Grants are the outer gate, RLS is the inner one. A role needs the privilege
-- to reach a table at all; the policy then decides which rows it sees. Without
-- the grant the policies are unreachable, not stricter.
--
-- `anon` is deliberately not granted anything. All 23 policies are
-- `to authenticated`, and every route in the app sits behind RequireAuth, so
-- anonymous clients have no reason to reach a table. This is tighter than the
-- stock Supabase template, which grants anon as well.
--
-- Additive only: no table, row, policy or privilege is removed.
-- ============================================================================

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema public to authenticated, service_role;

-- Anything a later migration adds inherits the same privileges, so this file
-- does not have to be re-run every time the schema grows.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to authenticated, service_role;
