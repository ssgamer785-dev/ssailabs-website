-- ============================================================================
-- The Traders Planet App — take EXECUTE on the maintenance functions back off
-- the client roles.
--
-- 20260823120000_api_grants.sql fixed a real problem (no role could reach any
-- table) with too broad a brush: `grant execute on all functions in schema
-- public to authenticated` handed every signed-in student the storage and
-- retention machinery as well. Those functions are SECURITY DEFINER — they run
-- as the owner and bypass RLS — so a student could call purge_expired_posts()
-- and delete every community post past the six-month cutoff, mark another
-- user's media purged, read any conversation's media list, or write
-- notifications addressed to anyone.
--
-- Confirmed against production during the Admin+Student E2E: a real student
-- session reached select_expired_post_media(), select_stale_pending_uploads()
-- and select_chat_media_to_purge(). Only the absence of six-month-old posts
-- kept purge_expired_posts() from doing damage.
--
-- The server calls all nine with the service-role key. No client path uses any
-- of them, so `authenticated` loses EXECUTE and `service_role` keeps it.
--
-- Nothing else changes: no table, no row, no RLS policy, no function body.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The nine server-only functions.
--
-- Revoked from PUBLIC as well as the API roles. CREATE FUNCTION grants EXECUTE
-- to PUBLIC by default, and `authenticated` is a member of PUBLIC, so revoking
-- only the named roles would leave the door open.
-- ----------------------------------------------------------------------------

revoke execute on function public.purge_expired_posts()                                        from public, anon, authenticated;
revoke execute on function public.select_expired_post_media()                                  from public, anon, authenticated;
revoke execute on function public.mark_post_media_purged(uuid[])                               from public, anon, authenticated;
revoke execute on function public.select_chat_media_to_purge(uuid, bigint, bigint)             from public, anon, authenticated;
revoke execute on function public.mark_chat_media_purged(uuid[])                               from public, anon, authenticated;
revoke execute on function public.select_stale_pending_uploads(interval)                       from public, anon, authenticated;
revoke execute on function public.delete_stale_pending_uploads(uuid[])                         from public, anon, authenticated;
revoke execute on function public.recalc_conversation_media_usage(uuid)                        from public, anon, authenticated;
revoke execute on function public.notify_message_recipients(uuid, uuid, text)                  from public, anon, authenticated;

-- The server still needs them. Granted explicitly, because the PUBLIC revoke
-- above would otherwise strand service_role too.
grant execute on function public.purge_expired_posts()                                         to service_role;
grant execute on function public.select_expired_post_media()                                   to service_role;
grant execute on function public.mark_post_media_purged(uuid[])                                to service_role;
grant execute on function public.select_chat_media_to_purge(uuid, bigint, bigint)              to service_role;
grant execute on function public.mark_chat_media_purged(uuid[])                                to service_role;
grant execute on function public.select_stale_pending_uploads(interval)                        to service_role;
grant execute on function public.delete_stale_pending_uploads(uuid[])                          to service_role;
grant execute on function public.recalc_conversation_media_usage(uuid)                         to service_role;
grant execute on function public.notify_message_recipients(uuid, uuid, text)                   to service_role;

-- ----------------------------------------------------------------------------
-- 2. What the client legitimately calls.
--
-- Seven RPCs invoked from src/ plus is_admin(), which is not called directly by
-- any screen but appears inside the RLS policy expressions on every table. A
-- policy's function runs as the querying role, so revoking it would make each
-- policy fail with "permission denied for function is_admin" and lock the app
-- out of its own data.
--
-- Re-granted explicitly rather than left to inheritance, so this file states
-- the whole client surface in one place.
-- ----------------------------------------------------------------------------

grant execute on function public.posts_feed(public.post_channel, timestamptz, int)             to authenticated;
grant execute on function public.post_comments(uuid, timestamptz, int)                         to authenticated;
grant execute on function public.my_unread_notification_count()                                to authenticated;
grant execute on function public.mark_all_notifications_read()                                 to authenticated;
grant execute on function public.get_or_create_my_conversation()                               to authenticated;
grant execute on function public.mark_conversation_read(uuid)                                  to authenticated;
grant execute on function public.my_chat_overview()                                            to authenticated;
grant execute on function public.is_admin(uuid)                                                to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Stop the hole reopening on its own.
--
-- Two defaults would otherwise re-grant every future function: Postgres's own
-- EXECUTE-to-PUBLIC, and the blanket default privilege the previous migration
-- added for `authenticated`. Both go, so a new function starts closed and has
-- to be opened deliberately. service_role keeps its default, since every
-- server-side helper needs it.
-- ----------------------------------------------------------------------------

alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from authenticated;
alter default privileges in schema public grant execute on functions to service_role;
