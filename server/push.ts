import { Router } from 'express';
import { timingSafeEqual } from 'crypto';
import webpush from 'web-push';
import { asyncRoute, authenticate, env, getAdmin } from './r2.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[A-Za-z0-9_-]{16,256}$/;

function configured(): boolean {
  return !!(env('VAPID_PUBLIC_KEY') && env('VAPID_PRIVATE_KEY') && env('VAPID_SUBJECT') && getAdmin());
}

function validEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}

function sameSecret(actual: unknown, expected: string): boolean {
  if (typeof actual !== 'string') return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function destination(row: { kind: string; related_post_id: string | null; related_conversation_id: string | null; related_message_id?: string | null; related_comment_id?: string | null }): string {
  if (row.kind === 'chat' && row.related_conversation_id && UUID.test(row.related_conversation_id)) {
    const message = row.related_message_id && UUID.test(row.related_message_id) ? `&m=${encodeURIComponent(row.related_message_id)}` : '';
    return `/chat/admin?c=${encodeURIComponent(row.related_conversation_id)}${message}`;
  }
  if (row.related_post_id && UUID.test(row.related_post_id)) {
    const comment = row.related_comment_id && UUID.test(row.related_comment_id) ? `&comment=${encodeURIComponent(row.related_comment_id)}` : '';
    return `/post?post=${encodeURIComponent(row.related_post_id)}${comment}`;
  }
  return '/notifications';
}

export function pushRouter(): Router {
  const router = Router();

  router.get('/public-key', (_req, res) => {
    if (!configured()) return res.status(503).json({ error: 'Push notifications are not configured.' });
    res.json({ publicKey: env('VAPID_PUBLIC_KEY') });
  });

  router.post('/subscribe', asyncRoute(async (req, res) => {
    if (!configured()) return res.status(503).json({ error: 'Push notifications are not configured.' });
    const caller = await authenticate(req);
    if (!caller) return res.status(401).json({ error: 'Not authenticated.' });
    const { endpoint, keys } = req.body ?? {};
    if (!validEndpoint(endpoint) || !KEY.test(keys?.p256dh ?? '') || !KEY.test(keys?.auth ?? '')) {
      return res.status(400).json({ error: 'Invalid push subscription.' });
    }
    const { error } = await getAdmin()!.from('push_subscriptions').upsert({
      endpoint, user_id: caller.userId, p256dh: keys.p256dh, auth_key: keys.auth,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: 'endpoint' });
    if (error) throw error;
    res.json({ ok: true });
  }));

  router.delete('/subscribe', asyncRoute(async (req, res) => {
    const caller = await authenticate(req);
    if (!caller) return res.status(401).json({ error: 'Not authenticated.' });
    const { endpoint } = req.body ?? {};
    if (!validEndpoint(endpoint)) return res.status(400).json({ error: 'Invalid push subscription.' });
    const { error } = await getAdmin()!.from('push_subscriptions')
      .delete().eq('endpoint', endpoint).eq('user_id', caller.userId);
    if (error) throw error;
    res.json({ ok: true });
  }));

  // Called only by a Supabase Database Webhook on notifications INSERT.
  router.post('/dispatch', asyncRoute(async (req, res) => {
    const secret = env('PUSH_WEBHOOK_SECRET');
    if (!secret || !configured()) return res.status(503).json({ error: 'Push delivery is not configured.' });
    if (!sameSecret(req.get('x-push-webhook-secret'), secret)) return res.status(401).json({ error: 'Unauthorized.' });
    const id = req.body?.record?.id;
    if (req.body?.type !== 'INSERT' || req.body?.table !== 'notifications' || typeof id !== 'string' || !UUID.test(id)) {
      return res.status(400).json({ error: 'Invalid notification event.' });
    }
    const db = getAdmin()!;
    const { data: row, error: rowError } = await db.from('notifications')
      .select('*')
      .eq('id', id).single();
    if (rowError || !row) return res.status(404).json({ error: 'Notification not found.' });
    const { data: subscriptions, error: subError } = await db.from('push_subscriptions')
      .select('id,endpoint,p256dh,auth_key').eq('user_id', row.user_id);
    if (subError) throw subError;

    webpush.setVapidDetails(env('VAPID_SUBJECT')!, env('VAPID_PUBLIC_KEY')!, env('VAPID_PRIVATE_KEY')!);
    const payload = JSON.stringify({ id: row.id, title: row.title, body: row.body ?? '', url: destination(row) });
    let failed = 0;
    for (const sub of subscriptions ?? []) {
      const { error: claimError } = await db.from('push_deliveries').insert({
        notification_id: row.id, subscription_id: sub.id,
      });
      if (claimError?.code === '23505') continue;
      if (claimError) throw claimError;
      try {
        await webpush.sendNotification({
          endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key },
        }, payload, { TTL: 3600, urgency: ['chat', 'signal', 'target', 'session'].includes(row.kind) ? 'normal' : 'low' });
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await db.from('push_subscriptions').delete().eq('id', sub.id);
        } else {
          failed++;
          // Keep the claim when delivery is uncertain. A webhook retry must
          // never turn one notification into a repeated device alert.
          console.error('[push] delivery failed:', status ?? 'transport error');
        }
      }
    }
    res.json({ ok: true, attempted: (subscriptions ?? []).length, uncertainFailures: failed });
  }));

  return router;
}
