-- Rollback for 20261115090000_rc6_poll_image_member_deletion_chat_replies.sql
--
-- Removes the RC6 functions and triggers. It does NOT drop data-bearing
-- columns or the audit log by default:
--   - messages.reply_to_id holds which message answers which;
--   - profiles.deleted_at / deleted_by mark members who were deleted (without
--     them a deleted member's profile would look like an ordinary inactive one,
--     and the re-activation lock would be gone);
--   - admin_audit_events is the record of those deletions.
-- Poll pictures already published stay as post_media items (the app before
-- RC6 ignores them on a poll). Run the commented block at the end only if you
-- deliberately want those columns and the log gone as well.
begin;

drop trigger if exists messages_guard_reply on public.messages;
drop function if exists public.guard_message_reply();

revoke all on function public.admin_delete_member(uuid, uuid) from service_role;
drop function if exists public.admin_delete_member(uuid, uuid);

drop function if exists public.create_poll_post_with_image(public.post_channel, text, text[], boolean, jsonb);

-- The profile guard stays only if members were deleted: it is what keeps them
-- deleted. With no deleted member it is removed too.
do $$
begin
  if not exists (select 1 from public.profiles where deleted_at is not null) then
    drop trigger if exists profiles_guard_deletion on public.profiles;
    drop function if exists public.guard_profile_deletion_columns();
  end if;
end $$;

notify pgrst, 'reload schema';
commit;

-- Optional, destructive, NOT run by default:
-- begin;
-- drop trigger if exists profiles_guard_deletion on public.profiles;
-- drop function if exists public.guard_profile_deletion_columns();
-- drop index if exists public.messages_reply_to_idx;
-- alter table public.messages drop column if exists reply_to_id;
-- alter table public.profiles drop column if exists deleted_at, drop column if exists deleted_by;
-- drop table if exists public.admin_audit_events;
-- commit;
