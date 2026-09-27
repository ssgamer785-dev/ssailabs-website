import { Router } from 'express';
import { asyncRoute, authenticate, getAdmin } from './r2.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Notification rows are written by database triggers and the existing RLS
 * intentionally has no client DELETE policy. These routes verify the caller's
 * Supabase access token, then constrain every service-role delete to that
 * verified user id. They never cascade into posts, comments, or messages.
 */
export function notificationsRouter(): Router {
  const router = Router();

  router.delete('/', asyncRoute(async (req, res) => {
    const caller = await authenticate(req);
    if (!caller) return res.status(401).json({ error: 'Sign in to manage notifications.' });
    const db = getAdmin();
    if (!db) return res.status(503).json({ error: 'Notifications are temporarily unavailable.' });

    const { error } = await db.from('notifications').delete().eq('user_id', caller.userId);
    if (error) throw error;
    return res.json({ ok: true });
  }));

  router.delete('/:id', asyncRoute(async (req, res) => {
    const caller = await authenticate(req);
    if (!caller) return res.status(401).json({ error: 'Sign in to manage notifications.' });
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'Invalid notification id.' });
    const db = getAdmin();
    if (!db) return res.status(503).json({ error: 'Notifications are temporarily unavailable.' });

    const { data, error } = await db.from('notifications')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', caller.userId)
      .select('id');
    if (error) throw error;
    if (!data?.length) return res.status(404).json({ error: 'Notification not found.' });
    return res.json({ ok: true });
  }));

  return router;
}
