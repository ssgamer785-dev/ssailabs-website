/**
 * Deleting a member, as the admin.
 *
 * The browser only asks; everything is decided here and in the database. The
 * caller's token is verified with Supabase Auth and their role read from the
 * database (authenticate), the request must carry the typed confirmation, and
 * admin_delete_member() checks the same rules again under a lock: never your
 * own account, never the last admin.
 *
 * What a deletion does, in this order:
 *   1. admin_delete_member() closes the account in the app in one transaction:
 *      activation cleared, name, phone and picture removed, devices,
 *      notifications, notification settings and bookmarks removed. Their posts,
 *      comments, likes, poll votes and chat with the admin are KEPT, labelled
 *      "Deleted member", so nobody else's comments, replies or poll results
 *      change. From this moment row-level security refuses the account
 *      everything, even with a token that has not expired yet.
 *   2. Supabase Auth soft-deletes the sign-in: every session and refresh token
 *      is revoked and the email and password are removed, so the account can
 *      never sign in again.
 *   3. Their profile picture is removed from storage.
 * Each step is recorded in admin_audit_events (ids and counts, no personal
 * details). A failure at step 2 is reported and can be retried: step 1 is
 * idempotent.
 */

import { Router } from 'express';
import { asyncRoute, authenticate, bucket, deleteObjects, getAdmin, getS3 } from './r2.js';
import { avatarObjectKey } from './profile-media.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What the browser must send: the word the admin typed in the second confirmation. */
export const DELETE_CONFIRMATION = 'DELETE';

interface DeleteResult {
  ok?: boolean;
  reason?: string;
  already?: boolean;
  avatar_key?: string | null;
  counts?: Record<string, number>;
}

const REFUSED: Record<string, [number, string]> = {
  not_admin: [403, 'Only an admin can delete members.'],
  self: [409, 'You cannot delete your own account.'],
  not_found: [404, 'That member no longer exists.'],
  last_admin: [409, 'The last admin account cannot be deleted.'],
};

function isMissingFunction(error: { code?: string; message?: string }): boolean {
  return error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(error.message ?? '');
}

export function memberAdminRouter(): Router {
  const router = Router();

  router.post('/:id/delete', asyncRoute(async (req, res) => {
    const caller = await authenticate(req);
    if (!caller) return res.status(401).json({ error: 'Not authenticated.' });
    if (!caller.isAdmin) return res.status(403).json({ error: 'Only an admin can delete members.' });

    const target = String(req.params.id ?? '');
    if (!UUID.test(target)) return res.status(400).json({ error: 'Invalid member.' });
    if (req.body?.confirm !== DELETE_CONFIRMATION) {
      return res.status(400).json({ error: `Type ${DELETE_CONFIRMATION} to confirm.` });
    }
    if (target === caller.userId) return res.status(409).json({ error: REFUSED.self[1], reason: 'self' });

    const db = getAdmin();
    if (!db) return res.status(503).json({ error: 'Server is missing Supabase service credentials.' });

    // 1. The account, closed in the app.
    const { data, error } = await db.rpc('admin_delete_member', { p_actor: caller.userId, p_target: target });
    if (error) {
      if (isMissingFunction(error)) return res.status(503).json({ error: 'Deleting members needs the latest database update.' });
      throw error;
    }
    const result = (data ?? {}) as DeleteResult;
    if (!result.ok) {
      const [status, message] = REFUSED[result.reason ?? ''] ?? [500, 'The member could not be deleted.'];
      return res.status(status).json({ error: message, reason: result.reason });
    }

    // 2. The sign-in, closed for good. An account Auth no longer knows is already closed.
    const { error: authError } = await db.auth.admin.deleteUser(target, true);
    const closed = !authError || authError.status === 404 || /not.?found/i.test(authError.message ?? '');
    if (!closed) {
      console.error('[members] closing the sign-in failed:', authError?.status ?? 'no status', String(authError?.message ?? '').slice(0, 120));
      await db.from('admin_audit_events').insert({
        actor_id: caller.userId, action: 'member_sign_in_close_failed', target_id: target,
        details: { status: authError?.status ?? null },
      });
      return res.status(502).json({
        error: 'The member was removed from the app, but their sign-in could not be closed. Tap Delete again to finish.',
        stage: 'sign-in', removedFromApp: true,
      });
    }
    await db.from('admin_audit_events').insert({ actor_id: caller.userId, action: 'member_sign_in_closed', target_id: target, details: {} });

    // 3. Their profile picture. Best effort: nothing points at it any more.
    const avatar = avatarObjectKey(result.avatar_key);
    const s3 = getS3();
    const bucketName = bucket();
    if (avatar && avatar.startsWith(`avatars/${target}/`) && s3 && bucketName) {
      await deleteObjects(s3, bucketName, [{ Key: avatar }])
        .catch(cause => console.warn('[members] profile picture not removed:', cause instanceof Error ? cause.message.slice(0, 120) : 'unknown'));
    }

    res.json({ ok: true, already: !!result.already, counts: result.counts ?? null });
  }, 'Member management is temporarily unavailable. Please try again.'));

  return router;
}
