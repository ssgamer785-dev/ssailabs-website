import { Router } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID, timingSafeEqual } from 'crypto';
import webpush from 'web-push';
import { asyncRoute, authenticate, env, getAdmin } from './r2.js';
import {
  UNREAD_SCAN_LIMIT, buildPayload, deliveryOptions, deviceMatchesEnvironment, platformFromUserAgent,
  pushEnvironment, type NotificationRow, type PushEnvironment, type UnreadRow,
} from './push-payload.js';

export { destinationOf as destination } from './push-payload.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[A-Za-z0-9_-]{16,256}$/;

function configured(): boolean {
  return !!(env('VAPID_PUBLIC_KEY') && env('VAPID_PRIVATE_KEY') && env('VAPID_SUBJECT') && getAdmin());
}

/**
 * A push endpoint is a URL the SERVER will later POST to, so it must look like a
 * public push service: https on the standard port, a real hostname. Never an
 * address, a bare or local name, or one with credentials in it, so a member
 * cannot aim the server at a machine inside its own network. (Any public host
 * is still accepted: the push services differ by browser and change.)
 */
export function validEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    if (url.port && url.port !== '443') return false;
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (!host.includes('.') || host.includes(':') || host.startsWith('[')) return false;   // a bare name or an IPv6 address
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;                                  // an IPv4 address
    return !/(^|\.)(localhost|local|internal|localdomain|home|lan)$/.test(host);
  } catch { return false; }
}

function sameSecret(actual: unknown, expected: string): boolean {
  if (typeof actual !== 'string') return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** One test per account per window: enough to verify a device, useless for spamming it. */
const TEST_INTERVAL_MS = 20_000;
const lastTest = new Map<string, number>();

/** web-push's errors describe configuration (bad subject, wrong key length) without containing keys. */
function vapidProblem(): string | null {
  try {
    webpush.setVapidDetails(env('VAPID_SUBJECT')!, env('VAPID_PUBLIC_KEY')!, env('VAPID_PRIVATE_KEY')!);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message.slice(0, 160) : 'invalid VAPID configuration';
  }
}

/** Apple and FCM name a rejection ("BadJwtToken", "InvalidRegistration") without secrets. */
function rejectionReason(error: unknown): string | undefined {
  return String((error as { body?: unknown }).body ?? '').match(/"reason"\s*:\s*"([A-Za-z]+)"/)?.[1];
}

/** PostgREST / Postgres answers for a column the database does not have yet (migration not applied). */
function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === '42703' || error.code === 'PGRST204' || /column .* does not exist|Could not find the '.*' column/i.test(error.message ?? ''));
}

interface DeviceRow { id: string; endpoint: string; p256dh: string; auth_key: string; environment?: string | null }

/**
 * The account's devices that belong to THIS deployment. A Preview shares the
 * database with Production; without this a phone registered through one would
 * receive the other's pushes.
 */
async function devicesFor(db: SupabaseClient, userId: string, environment: PushEnvironment): Promise<DeviceRow[]> {
  const read = (columns: string) => db.from('push_subscriptions').select(columns).eq('user_id', userId);
  let result = await read('id,endpoint,p256dh,auth_key,environment');
  // Before the migration there is no marker: every device is production's.
  if (isMissingColumn(result.error)) result = await read('id,endpoint,p256dh,auth_key');
  if (result.error) throw result.error;
  return ((result.data ?? []) as unknown as DeviceRow[]).filter(device => deviceMatchesEnvironment(device, environment));
}

// ---------------------------------------------------------------------------
// Sending, with bounded retries.
// ---------------------------------------------------------------------------

/** Each attempt gives up after this long, so one hung push service cannot hold the function. */
const SEND_TIMEOUT_MS = 3000;
/** No new attempt is started once this much time has gone. */
const RETRY_BUDGET_MS = 5000;
let retryDelaysMs = [400, 1200];
export function setPushRetryDelayForTests(ms: number): void { retryDelaysMs = [ms, ms]; }

export type SendOutcome =
  | { outcome: 'sent'; attempts: number }
  | { outcome: 'expired'; status: number }
  | { outcome: 'failed'; status: number | null; reason?: string; attempts: number };

/**
 * One device, one notification. A subscription the push service has forgotten
 * (404/410) is expired and gets cleaned up. A push it did not accept (429,
 * 5xx) or could not be reached for is tried again after a short wait, up to
 * three attempts. A rare duplicate from re-sending an unanswered attempt is
 * harmless: every push carries a stable id and tag, and the device replaces
 * (not adds to) a banner with the same tag. Anything else (401/403 VAPID,
 * 400/413) is a configuration problem and is reported, not repeated.
 */
export async function sendToDevice(
  device: Pick<DeviceRow, 'endpoint' | 'p256dh' | 'auth_key'>, payload: string, options: webpush.RequestOptions,
): Promise<SendOutcome> {
  const started = Date.now();
  for (let attempt = 1; ; attempt++) {
    try {
      await webpush.sendNotification({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth_key } }, payload, { ...options, timeout: SEND_TIMEOUT_MS });
      return { outcome: 'sent', attempts: attempt };
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) return { outcome: 'expired', status };
      const retryable = status === undefined || status === 429 || status >= 500;
      if (!retryable || attempt > retryDelaysMs.length || Date.now() - started > RETRY_BUDGET_MS) {
        return { outcome: 'failed', status: status ?? null, reason: rejectionReason(error), attempts: attempt };
      }
      const retryAfter = Number((error as { headers?: Record<string, string> }).headers?.['retry-after']);
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 2000) : retryDelaysMs[attempt - 1];
      await new Promise(resolve => setTimeout(resolve, wait));
    }
  }
}

/** How far back the delivery check looks, and how recent a notification may be before it counts. */
const HEALTH_WINDOW_MS = 24 * 3600 * 1000;
const HEALTH_SETTLE_MS = 60 * 1000;

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
    // Push carries the same content as the in-app notifications list, which
    // only activated members can read.
    if (!caller.isActivated) return res.status(403).json({ error: 'Activate your account first.' });
    const { endpoint, keys } = req.body ?? {};
    if (!validEndpoint(endpoint) || !KEY.test(keys?.p256dh ?? '') || !KEY.test(keys?.auth ?? '')) {
      return res.status(400).json({ error: 'Invalid push subscription.' });
    }
    const row = {
      endpoint, user_id: caller.userId, p256dh: keys.p256dh, auth_key: keys.auth,
      last_seen_at: new Date().toISOString(),
      // Written by the server from its own deployment, never taken from the request.
      environment: pushEnvironment(),
      platform: platformFromUserAgent(req.get('user-agent')),
    };
    const db = getAdmin()!;
    let { error } = await db.from('push_subscriptions').upsert(row, { onConflict: 'endpoint' });
    if (isMissingColumn(error)) {
      // The notification migration is not applied yet: register without the markers.
      const { environment: _environment, platform: _platform, ...legacy } = row;
      ({ error } = await db.from('push_subscriptions').upsert(legacy, { onConflict: 'endpoint' }));
    }
    if (error) throw error;
    res.json({ ok: true });
  }, 'Notifications are temporarily unavailable. Please try again.'));

  router.delete('/subscribe', asyncRoute(async (req, res) => {
    const caller = await authenticate(req);
    if (!caller) return res.status(401).json({ error: 'Not authenticated.' });
    const { endpoint } = req.body ?? {};
    if (!validEndpoint(endpoint)) return res.status(400).json({ error: 'Invalid push subscription.' });
    const { error } = await getAdmin()!.from('push_subscriptions')
      .delete().eq('endpoint', endpoint).eq('user_id', caller.userId);
    if (error) throw error;
    res.json({ ok: true });
  }, 'Notifications are temporarily unavailable. Please try again.'));

  /**
   * Does the server still hold THIS device for the caller? The browser can
   * keep a subscription the server has since dropped (an expired one is
   * cleaned up on the first refusal), so "on" is only true when both agree.
   * Also says how many devices the account has here; never their endpoints.
   */
  router.post('/status', asyncRoute(async (req, res) => {
    const caller = await authenticate(req);
    if (!caller) return res.status(401).json({ error: 'Not authenticated.' });
    const { endpoint } = req.body ?? {};
    if (endpoint !== undefined && !validEndpoint(endpoint)) return res.status(400).json({ error: 'Invalid push subscription.' });
    const environment = pushEnvironment();
    const devices = await devicesFor(getAdmin()!, caller.userId, environment);
    res.json({
      registered: endpoint !== undefined && devices.some(device => device.endpoint === endpoint),
      devices: devices.length,
      environment,
      serverConfigured: configured(),
    });
  }, 'Notifications are temporarily unavailable. Please try again.'));

  /**
   * Sends a test notification to the CALLER's own devices only (the query is
   * keyed to the verified user id and to this deployment), reporting each push
   * service status: 201 delivered, 403 VAPID rejected (e.g. mismatched key
   * pair), 404/410 expired. It bypasses the database webhook, so a test that
   * arrives while real notifications do not points at the webhook, not the
   * device.
   */
  router.post('/test', asyncRoute(async (req, res) => {
    if (!configured()) return res.status(503).json({ error: 'Push notifications are not configured.' });
    const caller = await authenticate(req);
    if (!caller) return res.status(401).json({ error: 'Not authenticated.' });
    if (!caller.isActivated) return res.status(403).json({ error: 'Activate your account first.' });
    const now = Date.now();
    if (now - (lastTest.get(caller.userId) ?? 0) < TEST_INTERVAL_MS) {
      return res.status(429).json({ error: 'Wait a few seconds before sending another test.' });
    }
    lastTest.set(caller.userId, now);
    const problem = vapidProblem();
    if (problem) return res.status(503).json({ error: `Push is misconfigured on the server: ${problem}` });

    const db = getAdmin()!;
    const devices = await devicesFor(db, caller.userId, pushEnvironment());
    const payload = JSON.stringify({
      v: 2, id: `test-${randomUUID()}`, test: true, kind: 'system', category: 'system', title: 'The Traders Planet',
      body: 'Test notification: delivery to this device works.', url: '/notifications', tag: 'tp-test', count: 1,
    });
    const statuses: number[] = [];
    const reasons: string[] = [];
    let delivered = 0;
    for (const device of devices) {
      const result = await sendToDevice(device, payload, { TTL: 300, urgency: 'high' });
      if (result.outcome === 'sent') { statuses.push(201); delivered++; continue; }
      statuses.push(result.outcome === 'expired' ? result.status : result.status ?? 0);
      if (result.outcome === 'failed' && result.reason) reasons.push(result.reason);
      if (result.outcome === 'expired') await db.from('push_subscriptions').delete().eq('id', device.id);
    }
    res.json({ attempted: devices.length, delivered, statuses, reasons });
  }, 'Notifications are temporarily unavailable. Please try again.'));

  /**
   * Called only by a Supabase Database Webhook on notifications INSERT, with a
   * shared secret. The notification row is read from the database here, never
   * taken from the request: the caller cannot choose a recipient, a title or a
   * destination. Sending is idempotent per (notification, device).
   */
  router.post('/dispatch', asyncRoute(async (req, res) => {
    const secret = env('PUSH_WEBHOOK_SECRET');
    if (!secret || !configured()) return res.status(503).json({ error: 'Push delivery is not configured.' });
    if (!sameSecret(req.get('x-push-webhook-secret'), secret)) return res.status(401).json({ error: 'Unauthorized.' });
    const id = req.body?.record?.id;
    if (req.body?.type !== 'INSERT' || req.body?.table !== 'notifications' || typeof id !== 'string' || !UUID.test(id)) {
      return res.status(400).json({ error: 'Invalid notification event.' });
    }
    const db = getAdmin()!;
    const { data: row, error: rowError } = await db.from('notifications').select('*').eq('id', id).single();
    if (rowError || !row) return res.status(404).json({ error: 'Notification not found.' });
    const notification = row as NotificationRow;

    const devices = await devicesFor(db, notification.user_id, pushEnvironment());
    if (!devices.length) return res.json({ ok: true, attempted: 0, sent: 0, expired: 0, failed: 0, skipped: 'no-devices' });

    // Delivered only to accounts that could read this notification in the app.
    const { data: recipient, error: recipientError } = await db.from('profiles')
      .select('role, activated_at').eq('id', notification.user_id).maybeSingle();
    if (recipientError) throw recipientError;
    if (!recipient || (recipient.role !== 'admin' && !recipient.activated_at)) {
      return res.json({ ok: true, attempted: 0, sent: 0, expired: 0, failed: 0, skipped: 'recipient-not-activated' });
    }

    // One read gives both the badge number and the size of this banner's group.
    const { data: unread, error: unreadError } = await db.from('notifications')
      .select('kind,related_conversation_id,related_post_id')
      .eq('user_id', notification.user_id).is('read_at', null)
      .order('created_at', { ascending: false }).limit(UNREAD_SCAN_LIMIT);
    if (unreadError) throw unreadError;

    webpush.setVapidDetails(env('VAPID_SUBJECT')!, env('VAPID_PUBLIC_KEY')!, env('VAPID_PRIVATE_KEY')!);
    const payload = JSON.stringify(buildPayload(notification, (unread ?? []) as UnreadRow[]));
    const options = deliveryOptions(notification);

    let sent = 0, expired = 0, failed = 0, duplicates = 0;
    await Promise.all(devices.map(async device => {
      try {
        const { error: claimError } = await db.from('push_deliveries').insert({ notification_id: notification.id, subscription_id: device.id });
        if (claimError?.code === '23505') { duplicates++; return; }   // already delivered to this device
        if (claimError) throw claimError;
        const result = await sendToDevice(device, payload, options);
        if (result.outcome === 'sent') { sent++; return; }
        if (result.outcome === 'expired') {
          expired++;
          await db.from('push_subscriptions').delete().eq('id', device.id);   // its claims go with it
          return;
        }
        failed++;
        console.error('[push] delivery failed:', result.status ?? 'no answer', result.reason ?? '', `after ${result.attempts} attempts`);
        // Not delivered: give the claim back, so running this notification through
        // /dispatch again sends it to this device instead of skipping it.
        await db.from('push_deliveries').delete().eq('notification_id', notification.id).eq('subscription_id', device.id);
      } catch (error) {
        failed++;
        console.error('[push] delivery failed:', (error as { code?: string }).code ?? 'unexpected error');
      }
    }));
    // Every device failed: say so (the database webhook's log shows the status).
    if (failed > 0 && sent === 0 && expired === 0) {
      return res.status(502).json({ ok: false, attempted: devices.length, sent, expired, failed, error: 'The push service did not accept the notification.' });
    }
    res.json({ ok: true, attempted: devices.length, sent, expired, failed, duplicates });
  }, 'Notifications are temporarily unavailable. Please try again.'));

  /**
   * Admin-only delivery check, from aggregate counts (no member data): of the
   * latest notifications for members who have a registered device, how many
   * did /dispatch pick up? None means the database webhook is not calling it.
   */
  router.get('/health', asyncRoute(async (req, res) => {
    const caller = await authenticate(req);
    if (!caller) return res.status(401).json({ error: 'Not authenticated.' });
    if (!caller.isAdmin) return res.status(403).json({ error: 'Admins only.' });
    const vapid = configured() ? vapidProblem() : 'VAPID keys or subject missing';
    const webhookSecret = !!env('PUSH_WEBHOOK_SECRET');
    const db = getAdmin();
    if (!db) return res.status(503).json({ error: 'Server is missing Supabase service credentials.' });

    const { data: devices, error: deviceError } = await db.from('push_subscriptions').select('user_id').limit(5000);
    if (deviceError) throw deviceError;
    const members = [...new Set((devices ?? []).map(d => d.user_id as string))];
    let recent = 0;
    let delivered = 0;
    if (members.length) {
      const now = Date.now();
      const { data: notes, error: noteError } = await db.from('notifications').select('id')
        .in('user_id', members.slice(0, 500))
        .gt('created_at', new Date(now - HEALTH_WINDOW_MS).toISOString())
        .lt('created_at', new Date(now - HEALTH_SETTLE_MS).toISOString())
        .order('created_at', { ascending: false }).limit(20);
      if (noteError) throw noteError;
      const ids = (notes ?? []).map(n => n.id as string);
      recent = ids.length;
      if (ids.length) {
        const { data: claims, error: claimError } = await db.from('push_deliveries').select('notification_id').in('notification_id', ids);
        if (claimError) throw claimError;
        delivered = new Set((claims ?? []).map(c => c.notification_id)).size;
      }
    }
    const verdict = vapid || !webhookSecret ? 'server-not-configured'
      : !members.length ? 'no-devices'
      : !recent ? 'no-recent-notifications'
      : delivered === 0 ? 'webhook-not-delivering'
      : 'delivering';
    res.json({ verdict, vapidConfigured: !vapid, webhookSecretConfigured: webhookSecret, devices: (devices ?? []).length, recentNotifications: recent, recentDispatched: delivered });
  }, 'Notifications are temporarily unavailable. Please try again.'));

  return router;
}
