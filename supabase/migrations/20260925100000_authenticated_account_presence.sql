-- Account-scoped private Supabase Realtime Presence.
--
-- This is additive: it creates no application rows, changes no app tables, and
-- does not modify chat/community retention or storage-cap behavior. The client
-- uses private topics named `tp:presence:admin` and
-- `tp:presence:student:<auth.uid()>`.
--
-- Students may read only their own status and the Admin status. Admins may read
-- student status. Writes are restricted to the publisher's own topic, so a
-- signed-in client cannot publish a presence claim on behalf of another user.
-- The topic is authoritative; tracked payloads contain only a heartbeat time.

create policy "tp_account_presence_read"
  on realtime.messages
  for select
  to authenticated
  using (
    extension = 'presence'
    and (
      realtime.topic() = 'tp:presence:admin'
      or realtime.topic() = 'tp:presence:student:' || (select auth.uid())::text
      or (
        (select public.is_admin())
        and realtime.topic() like 'tp:presence:student:%'
      )
    )
  );

-- RESTRICTIVE companions make the account boundary hold even if another
-- permissive Realtime policy is later added for a different feature. They
-- leave non-Presence broadcast traffic untouched.
create policy "tp_account_presence_read_boundary"
  on realtime.messages
  as restrictive
  for select
  to authenticated
  using (
    extension <> 'presence'
    or (
      realtime.topic() = 'tp:presence:admin'
      or realtime.topic() = 'tp:presence:student:' || (select auth.uid())::text
      or (
        (select public.is_admin())
        and realtime.topic() like 'tp:presence:student:%'
      )
    )
  );

create policy "tp_account_presence_write_own_topic"
  on realtime.messages
  for insert
  to authenticated
  with check (
    extension = 'presence'
    and (
      (realtime.topic() = 'tp:presence:admin' and (select public.is_admin()))
      or realtime.topic() = 'tp:presence:student:' || (select auth.uid())::text
    )
  );

create policy "tp_account_presence_write_boundary"
  on realtime.messages
  as restrictive
  for insert
  to authenticated
  with check (
    extension <> 'presence'
    or (
      (realtime.topic() = 'tp:presence:admin' and (select public.is_admin()))
      or realtime.topic() = 'tp:presence:student:' || (select auth.uid())::text
    )
  );
