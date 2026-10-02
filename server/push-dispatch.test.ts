import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import webpush from 'web-push';
import app from './app';
import { resetClientsForTests } from './r2';
import { setPushRetryDelayForTests } from './push';
import { buildPayload, categoryOf, deliveryOptions, destinationOf, groupOf, platformFromUserAgent, pushEnvironment } from './push-payload';
import { notificationDestination } from '../src/lib/notifications/destination';
import { startFakeSupabase, type FakeSupabase, type Row } from './testing/fake-supabase';

/**
 * Push delivery, end to end through the real Express app with an in-memory
 * Supabase and a recorded push service: who is sent what, and what a lock
 * screen can read.
 */
const ADMIN = '11111111-1111-4111-8111-111111111111';
const STUDENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const NEWCOMER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CONV = 'c0000000-0000-4000-8000-00000000000a';
const OTHER_CONV = 'c0000000-0000-4000-8000-00000000000b';
const POST = 'd0000000-0000-4000-8000-00000000000a';
const MSG = 'e0000000-0000-4000-8000-00000000000a';
const TOKENS = { 'admin-token': ADMIN, 'student-token': STUDENT, 'other-token': OTHER, 'newcomer-token': NEWCOMER };
const u = (n: number) => `0f0f0f0f-0000-4000-8000-${String(n).padStart(12, '0')}`;

type Sent = { endpoint: string; payload: Record<string, unknown>; raw: string; options: Record<string, unknown> };
const sent: Sent[] = [];
/** Statuses the fake push service answers, per call, in order; undefined = accept, 0 = no answer. */
let answers: (number | undefined)[] = [];
let fake: FakeSupabase;
let server: Server;
let base: string;
let originalSend: typeof webpush.sendNotification;

const envKeys = ['SUPABASE_URL', 'VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY',
  'VAPID_SUBJECT', 'PUSH_WEBHOOK_SECRET', 'VERCEL_ENV', 'PUSH_ENVIRONMENT'] as const;
const savedEnv: Record<string, string | undefined> = {};
for (const key of envKeys) savedEnv[key] = process.env[key];

const device = (id: string, user: string, over: Row = {}): Row =>
  ({ id, user_id: user, endpoint: `https://push.example.test/${id}`, p256dh: 'B'.repeat(87), auth_key: 'A'.repeat(22), environment: 'production', ...over });
const note = (id: string, user: string, over: Row = {}): Row => ({
  id, user_id: user, kind: 'chat', category: 'direct_messages', title: 'Rahul Kumar sent you a voice message', body: 'private text: my account number is 1234',
  related_post_id: null, related_conversation_id: CONV, related_message_id: MSG, related_comment_id: null, link: null, read_at: null,
  created_at: new Date(Date.now() - 5_000).toISOString(), ...over,
});

beforeAll(() => {
  setPushRetryDelayForTests(0);
  originalSend = webpush.sendNotification;
  (webpush as { sendNotification: unknown }).sendNotification = async (subscription: { endpoint: string }, payload: string, options: Record<string, unknown>) => {
    const answer = answers.shift();
    if (answer !== undefined) throw Object.assign(new Error('push service refused'), { statusCode: answer || undefined, headers: {}, body: answer === 403 ? '{"reason":"BadJwtToken"}' : '' });
    sent.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload), raw: payload, options });
    return { statusCode: 201, body: '', headers: {} };
  };
});
afterAll(() => { webpush.sendNotification = originalSend; });

async function start(over: { rejectColumns?: Record<string, string[]>; failWrites?: Record<string, 'missing' | 'error'> } = {}) {
  sent.length = 0;
  answers = [];
  fake = await startFakeSupabase({
    tokens: TOKENS,
    uniqueKeys: { push_deliveries: ['notification_id', 'subscription_id'] },
    rejectColumns: over.rejectColumns,
    failWrites: over.failWrites,
    tables: {
      profiles: [
        { id: ADMIN, role: 'admin', activated_at: null },
        { id: STUDENT, role: 'student', activated_at: '2026-09-01T00:00:00Z' },
        { id: OTHER, role: 'student', activated_at: '2026-09-01T00:00:00Z' },
        { id: NEWCOMER, role: 'student', activated_at: null },
      ],
      notifications: [], push_subscriptions: [], push_deliveries: [],
    },
  });
  const vapid = webpush.generateVAPIDKeys();
  Object.assign(process.env, {
    SUPABASE_URL: fake.url, VITE_SUPABASE_URL: fake.url, SUPABASE_SERVICE_ROLE_KEY: 'service-role-fixture',
    VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey, VAPID_SUBJECT: 'mailto:support@example.test',
    PUSH_WEBHOOK_SECRET: 'webhook-secret-fixture',
  });
  delete process.env.VERCEL_ENV;
  delete process.env.PUSH_ENVIRONMENT;
  resetClientsForTests();
  server = await new Promise<Server>(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

beforeEach(() => start());
afterEach(() => {
  server.close();
  fake.close();
  for (const key of envKeys) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  resetClientsForTests();
});

async function call(path: string, token: string | null, body?: unknown, method = 'POST', headers: Record<string, string> = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, body: json };
}
const dispatch = (id: string, extra: Record<string, unknown> = {}) =>
  call('/api/push/dispatch', null, { type: 'INSERT', table: 'notifications', record: { id, ...extra } }, 'POST', { 'x-push-webhook-secret': 'webhook-secret-fixture' });

describe('what a lock screen can read', () => {
  test('a chat push says who sent what, never what the message says', async () => {
    fake.tables.push_subscriptions.push(device(u(1), ADMIN));
    fake.tables.notifications.push(note(u(11), ADMIN));
    const res = await dispatch(u(11));
    expect(res.body).toMatchObject({ ok: true, attempted: 1, sent: 1, failed: 0 });
    expect(sent).toHaveLength(1);
    expect(sent[0].payload).toMatchObject({
      v: 2, id: u(11), kind: 'chat', category: 'direct_messages', title: 'The Traders Planet',
      body: 'Rahul Kumar sent you a voice message', url: `/chat/admin?c=${CONV}&m=${MSG}`, tag: `tp-chat-${CONV}`, count: 1, unread: 1,
    });
    expect(sent[0].raw).not.toContain('account number');
    expect(sent[0].raw).not.toContain('private text');
  });

  test('a comment push never carries the comment', async () => {
    fake.tables.push_subscriptions.push(device(u(2), STUDENT));
    fake.tables.notifications.push(note(u(12), STUDENT, {
      kind: 'comment', category: 'comments', title: 'Tia commented on your post', body: 'call me on 98765 43210',
      related_conversation_id: null, related_message_id: null, related_post_id: POST, related_comment_id: u(99),
    }));
    await dispatch(u(12));
    expect(sent[0].payload).toMatchObject({ body: 'Tia commented on your post', url: `/post?post=${POST}&comment=${u(99)}`, tag: `tp-comments-${POST}` });
    expect(sent[0].raw).not.toContain('98765');
  });

  test('control characters and over-long text are cleaned before they reach a banner', async () => {
    fake.tables.push_subscriptions.push(device(u(3), STUDENT));
    fake.tables.notifications.push(note(u(13), STUDENT, { kind: 'signal', category: 'official_announcements', title: `New official video:\n\u0007 ${'x'.repeat(400)}`, related_conversation_id: null, related_post_id: POST }));
    await dispatch(u(13));
    const body = String(sent[0].payload.body);
    expect(body).not.toMatch(/[\u0000-\u001f]/);
    expect(body.length).toBeLessThanOrEqual(120);
  });

  test('rows made before categories existed are still placed and worded', async () => {
    fake.tables.push_subscriptions.push(device(u(4), STUDENT));
    const legacy = note(u(14), STUDENT, { title: 'Admin sent you a message' });
    delete legacy.category; delete legacy.link;
    fake.tables.notifications.push(legacy);
    await dispatch(u(14));
    expect(sent[0].payload).toMatchObject({ category: 'direct_messages', body: 'Admin sent you a message' });
  });

  test('an in-app link (a membership request) is the destination, and only a safe one', async () => {
    fake.tables.push_subscriptions.push(device(u(5), ADMIN));
    fake.tables.notifications.push(note(u(15), ADMIN, { kind: 'session', category: 'system', title: 'New membership request', related_conversation_id: null, related_message_id: null, link: '/admin/membership-requests' }));
    fake.tables.notifications.push(note(u(16), ADMIN, { kind: 'session', category: 'system', title: 'Sneaky', related_conversation_id: null, related_message_id: null, link: '//evil.example/x' }));
    await dispatch(u(15));
    await dispatch(u(16));
    expect(sent.map(s => s.payload.url)).toEqual(['/admin/membership-requests', '/notifications']);
  });
});

describe('grouping and the badge number', () => {
  test('rapid messages from one conversation become one banner that counts them', async () => {
    fake.tables.push_subscriptions.push(device(u(6), ADMIN));
    fake.tables.notifications.push(
      note(u(21), ADMIN), note(u(22), ADMIN), note(u(23), ADMIN),
      note(u(24), ADMIN, { related_conversation_id: OTHER_CONV }),
      note(u(25), ADMIN, { read_at: new Date().toISOString() }),
      note(u(26), ADMIN, { kind: 'comment', category: 'comments', title: 'x commented on your post', related_conversation_id: null, related_post_id: POST }),
    );
    await dispatch(u(23));
    expect(sent[0].payload).toMatchObject({ body: 'Rahul Kumar sent you 3 new messages', count: 3, tag: `tp-chat-${CONV}`, unread: 5 });
  });

  test('every push of a group shares its tag and its Topic; unrelated ones stand alone', () => {
    const chatA = { ...note(u(31), ADMIN), kind: 'chat' } as never;
    const chatB = { ...note(u(32), ADMIN), kind: 'chat' } as never;
    expect(groupOf(chatA).tag).toBe(groupOf(chatB).tag);
    expect(deliveryOptions(chatA).topic).toBe(deliveryOptions(chatB).topic);
    expect(deliveryOptions(chatA).topic).toMatch(/^[A-Za-z0-9_-]{1,32}$/);
    const official = { ...note(u(33), STUDENT), kind: 'signal', category: 'official_announcements', related_conversation_id: null, related_post_id: POST } as never;
    expect(groupOf(official).tag).toBe(`tp-${u(33)}`);
    expect(deliveryOptions(official).topic).toBeUndefined();
  });

  test('the badge number is the recipient\'s unread total, capped', () => {
    const unread = Array.from({ length: 100 }, () => ({ kind: 'signal', related_conversation_id: null, related_post_id: null }));
    expect(buildPayload({ ...note(u(34), STUDENT), kind: 'signal' } as never, unread).unread).toBe(99);
    expect(buildPayload({ ...note(u(35), STUDENT), kind: 'signal' } as never, []).unread).toBe(1);
  });

  test('urgency and lifetime follow the category', () => {
    expect(deliveryOptions(note(u(36), ADMIN) as never)).toMatchObject({ TTL: 86400, urgency: 'high' });
    expect(deliveryOptions({ ...note(u(37), STUDENT), kind: 'signal', category: 'official_announcements' } as never)).toMatchObject({ TTL: 86400, urgency: 'normal' });
    expect(deliveryOptions({ ...note(u(38), STUDENT), kind: 'like', category: 'likes', related_conversation_id: null, related_post_id: POST } as never)).toMatchObject({ TTL: 3600, urgency: 'low' });
    expect(deliveryOptions({ ...note(u(39), STUDENT), kind: 'signal', category: 'community_posts' } as never)).toMatchObject({ TTL: 3600, urgency: 'low' });
  });
});

describe('deployments never send to each other\'s devices', () => {
  test('Production sends to production and legacy (unmarked) devices only', async () => {
    fake.tables.push_subscriptions.push(
      device(u(41), STUDENT, { environment: 'production' }),
      device(u(42), STUDENT, { environment: null }),
      device(u(43), STUDENT, { environment: 'preview' }),
      device(u(44), STUDENT, { environment: 'development' }),
    );
    fake.tables.notifications.push(note(u(51), STUDENT));
    expect((await dispatch(u(51))).body).toMatchObject({ attempted: 2, sent: 2 });
    expect(sent.map(s => s.endpoint).sort()).toEqual([`https://push.example.test/${u(41)}`, `https://push.example.test/${u(42)}`]);
  });

  test('a Preview sends only to devices registered through a Preview', async () => {
    process.env.VERCEL_ENV = 'preview';
    fake.tables.push_subscriptions.push(device(u(45), STUDENT, { environment: 'production' }), device(u(46), STUDENT, { environment: null }), device(u(47), STUDENT, { environment: 'preview' }));
    fake.tables.notifications.push(note(u(52), STUDENT));
    expect((await dispatch(u(52))).body).toMatchObject({ attempted: 1, sent: 1 });
    expect(sent.map(s => s.endpoint)).toEqual([`https://push.example.test/${u(47)}`]);
  });

  test('the environment comes from the deployment, not from the request', async () => {
    const asPreview = await call('/api/push/subscribe', 'student-token', { endpoint: 'https://push.example.test/from-preview', keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) }, environment: 'preview' });
    expect(asPreview.status).toBe(200);
    expect(fake.tables.push_subscriptions[0].environment).toBe('production');
    process.env.VERCEL_ENV = 'preview';
    await call('/api/push/subscribe', 'other-token', { endpoint: 'https://push.example.test/real-preview', keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) } });
    expect(fake.tables.push_subscriptions.find(r => r.user_id === OTHER)?.environment).toBe('preview');
    expect(pushEnvironment()).toBe('preview');
  });

  test('the test push reaches only the caller\'s own devices of this deployment', async () => {
    fake.tables.push_subscriptions.push(device(u(48), STUDENT), device(u(49), STUDENT, { environment: 'preview' }), device(u(50), OTHER));
    const res = await call('/api/push/test', 'student-token');
    expect(res.body).toMatchObject({ attempted: 1, delivered: 1 });
    expect(sent.map(s => s.endpoint)).toEqual([`https://push.example.test/${u(48)}`]);
    expect(sent[0].payload).toMatchObject({ v: 2, test: true, tag: 'tp-test' });
  });
});

describe('device registration and status', () => {
  const sub = (name: string) => ({ endpoint: `https://push.example.test/${name}`, keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) } });

  test('a device is stored with its environment and platform, once per endpoint, per account', async () => {
    await call('/api/push/subscribe', 'student-token', sub('phone'));
    await call('/api/push/subscribe', 'student-token', sub('phone'));
    await call('/api/push/subscribe', 'student-token', sub('laptop'));
    await call('/api/push/subscribe', 'other-token', sub('tablet'));
    expect(fake.tables.push_subscriptions).toHaveLength(3);
    expect(fake.tables.push_subscriptions.every(row => row.environment === 'production')).toBe(true);
  });

  test('registration still works before the notification migration is applied', async () => {
    server.close(); fake.close();
    await start({ rejectColumns: { push_subscriptions: ['environment', 'platform'] } });
    expect((await call('/api/push/subscribe', 'student-token', sub('phone'))).status).toBe(200);
    expect(fake.tables.push_subscriptions).toHaveLength(1);
    expect('environment' in fake.tables.push_subscriptions[0]).toBe(false);
    // ...and delivery treats such devices as production's.
    fake.tables.notifications.push(note(u(60), STUDENT));
    expect((await dispatch(u(60))).body).toMatchObject({ sent: 1 });
  });

  test('status says whether the server holds THIS device, and only counts the caller\'s', async () => {
    fake.tables.push_subscriptions.push(device(u(61), STUDENT), device(u(62), STUDENT), device(u(63), OTHER));
    const mine = await call('/api/push/status', 'student-token', { endpoint: `https://push.example.test/${u(61)}` });
    expect(mine.body).toMatchObject({ registered: true, devices: 2, environment: 'production', serverConfigured: true });
    const notMine = await call('/api/push/status', 'student-token', { endpoint: `https://push.example.test/${u(63)}` });
    expect(notMine.body).toMatchObject({ registered: false, devices: 2 });
    const forgotten = await call('/api/push/status', 'student-token', { endpoint: 'https://push.example.test/forgotten' });
    expect(forgotten.body).toMatchObject({ registered: false });
    expect(JSON.stringify(mine.body)).not.toContain('push.example.test');
  });

  test('status requires a session and a well-formed endpoint', async () => {
    expect((await call('/api/push/status', null, { endpoint: 'https://x.example/y' })).status).toBe(401);
    expect((await call('/api/push/status', 'student-token', { endpoint: 'http://insecure.example/y' })).status).toBe(400);
  });

  test('an endpoint the server would later POST to must look like a public push service', async () => {
    const real = [
      'https://fcm.googleapis.com/fcm/send/abc123', 'https://updates.push.services.mozilla.com/wpush/v2/abc123',
      'https://web.push.apple.com/QAbc-123', 'https://wns2-par02p.notify.windows.com/w/?token=abc', 'https://push.example.test/x',
    ];
    for (const endpoint of real) expect((await call('/api/push/subscribe', 'student-token', { endpoint, keys: sub('x').keys })).status).toBe(200);
    const aimed = [
      'https://127.0.0.1/x', 'https://10.0.0.5/x', 'https://169.254.169.254/latest/meta-data', 'https://2130706433/x', 'https://0x7f000001/x',
      'https://[::1]/x', 'https://localhost/x', 'https://localhost./x', 'https://intranet/x', 'https://metadata.google.internal/x',
      'https://printer.local/x', 'https://push.example.test:8443/x', 'http://push.example.test/x', 'https://user:pass@push.example.test/x',
      'ftp://push.example.test/x', 'not a url', `https://push.example.test/${'a'.repeat(2100)}`,
    ];
    for (const endpoint of aimed) {
      const res = await call('/api/push/subscribe', 'student-token', { endpoint, keys: sub('x').keys });
      expect({ endpoint: endpoint.slice(0, 40), status: res.status }).toEqual({ endpoint: endpoint.slice(0, 40), status: 400 });
    }
    expect(fake.tables.push_subscriptions).toHaveLength(real.length);
    expect((await call('/api/push/status', 'student-token', { endpoint: 'https://127.0.0.1/x' })).status).toBe(400);
  });

  test('the platform is a hint read from the user agent', () => {
    expect(platformFromUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15')).toBe('ios');
    expect(platformFromUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/129')).toBe('android');
    expect(platformFromUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/129')).toBe('desktop');
    expect(platformFromUserAgent(undefined)).toBe('other');
  });
});

describe('recipients, authorization and idempotency', () => {
  test('the caller of the webhook cannot choose the recipient, the text or the destination', async () => {
    fake.tables.push_subscriptions.push(device(u(71), STUDENT), device(u(72), OTHER));
    fake.tables.notifications.push(note(u(81), STUDENT));
    await dispatch(u(81), { user_id: OTHER, title: 'Send your password', url: 'https://evil.example', related_conversation_id: OTHER_CONV });
    expect(sent.map(s => s.endpoint)).toEqual([`https://push.example.test/${u(71)}`]);
    expect(sent[0].payload.body).toBe('Rahul Kumar sent you a voice message');
    expect(sent[0].payload.url).toContain(CONV);
  });

  test('the shared secret is required, and an unknown notification is a 404', async () => {
    expect((await call('/api/push/dispatch', null, { type: 'INSERT', table: 'notifications', record: { id: u(82) } }, 'POST', { 'x-push-webhook-secret': 'nope' })).status).toBe(401);
    expect((await call('/api/push/dispatch', 'student-token', { type: 'INSERT', table: 'notifications', record: { id: u(82) } })).status).toBe(401);
    expect((await dispatch(u(82))).status).toBe(404);
    expect((await call('/api/push/dispatch', null, { type: 'UPDATE', table: 'notifications', record: { id: u(82) } }, 'POST', { 'x-push-webhook-secret': 'webhook-secret-fixture' })).status).toBe(400);
  });

  test('running the same notification twice sends it once per device', async () => {
    fake.tables.push_subscriptions.push(device(u(73), STUDENT), device(u(74), STUDENT));
    fake.tables.notifications.push(note(u(83), STUDENT));
    expect((await dispatch(u(83))).body).toMatchObject({ sent: 2, duplicates: 0 });
    expect((await dispatch(u(83))).body).toMatchObject({ sent: 0, duplicates: 2 });
    expect(sent).toHaveLength(2);
  });

  test('on Vercel the webhook is answered at once and the sending finishes after the response (RC5)', async () => {
    const key = Symbol.for('@vercel/request-context');
    const pending: Promise<unknown>[] = [];
    (globalThis as Record<symbol, unknown>)[key] = { get: () => ({ waitUntil: (p: Promise<unknown>) => { pending.push(p); } }) };
    try {
      fake.tables.push_subscriptions.push(device(u(76), STUDENT), device(u(77), STUDENT));
      fake.tables.notifications.push(note(u(86), STUDENT));
      const answer = await dispatch(u(86));
      expect(answer.status).toBe(202);
      expect(answer.body).toMatchObject({ ok: true, accepted: true });
      expect(pending).toHaveLength(1);
      await Promise.all(pending);
      expect(sent.map(s => s.endpoint).sort()).toEqual([`https://push.example.test/${u(76)}`, `https://push.example.test/${u(77)}`]);
      // A repeated webhook event for the same notification sends nothing more.
      await dispatch(u(86));
      await Promise.all(pending);
      expect(sent).toHaveLength(2);
    } finally {
      delete (globalThis as Record<symbol, unknown>)[key];
    }
  });

  test('a member with no device, or an unactivated one, is skipped without sending', async () => {
    fake.tables.notifications.push(note(u(84), STUDENT), note(u(85), NEWCOMER));
    expect((await dispatch(u(84))).body).toMatchObject({ attempted: 0, skipped: 'no-devices' });
    fake.tables.push_subscriptions.push(device(u(75), NEWCOMER));
    expect((await dispatch(u(85))).body).toMatchObject({ attempted: 0, skipped: 'recipient-not-activated' });
    expect(sent).toHaveLength(0);
  });
});

describe('reliability', () => {
  test('a forgotten device (410) is removed with its claim; the account\'s other devices still get the push', async () => {
    fake.tables.push_subscriptions.push(device(u(91), STUDENT), device(u(92), STUDENT));
    fake.tables.notifications.push(note(u(101), STUDENT));
    answers = [410];
    const res = await dispatch(u(101));
    expect(res.body).toMatchObject({ attempted: 2, sent: 1, expired: 1, failed: 0 });
    expect(fake.tables.push_subscriptions).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });

  test('a throttled push (429) or an outage (5xx) is retried; the third answer is accepted', async () => {
    fake.tables.push_subscriptions.push(device(u(93), STUDENT));
    fake.tables.notifications.push(note(u(102), STUDENT));
    answers = [429, 503];
    expect((await dispatch(u(102))).body).toMatchObject({ sent: 1, failed: 0 });
    expect(sent).toHaveLength(1);
  });

  test('a rejected VAPID key (403) is reported, not repeated, and named without secrets', async () => {
    fake.tables.push_subscriptions.push(device(u(94), STUDENT));
    fake.tables.notifications.push(note(u(103), STUDENT));
    answers = [403, undefined, undefined];
    const res = await dispatch(u(103));
    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({ ok: false, failed: 1, sent: 0 });
    expect(answers).toHaveLength(2);
    expect(JSON.stringify(res.body)).not.toContain('BadJwt');
    expect(fake.tables.push_deliveries).toEqual([]);
  });

  test('one device failing does not stop the others, and only the failed one is given back for retry', async () => {
    fake.tables.push_subscriptions.push(device(u(95), STUDENT), device(u(96), STUDENT));
    fake.tables.notifications.push(note(u(104), STUDENT));
    answers = [400];
    const res = await dispatch(u(104));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ attempted: 2, sent: 1, failed: 1 });
    expect(fake.tables.push_deliveries).toHaveLength(1);
  });

  test('a database that cannot record the delivery claim is a failure for that device, not a crash, and nothing is sent unrecorded', async () => {
    server.close(); fake.close();
    await start({ failWrites: { push_deliveries: 'error' } });
    fake.tables.push_subscriptions.push(device(u(97), STUDENT));
    fake.tables.notifications.push(note(u(105), STUDENT));
    const res = await dispatch(u(105));
    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({ ok: false, sent: 0, failed: 1 });
    expect(sent).toHaveLength(0);
  });
});

describe('server and client agree on where a notification leads', () => {
  const rows: Row[] = [
    note(u(111), ADMIN),
    note(u(112), STUDENT, { related_message_id: null }),
    note(u(113), STUDENT, { kind: 'comment', related_conversation_id: null, related_message_id: null, related_post_id: POST, related_comment_id: u(199) }),
    note(u(114), STUDENT, { kind: 'signal', related_conversation_id: null, related_message_id: null, related_post_id: POST }),
    note(u(119), STUDENT, { kind: 'comment', related_conversation_id: null, related_message_id: null, related_post_id: POST, related_comment_id: null }),
    note(u(115), ADMIN, { kind: 'session', related_conversation_id: null, related_message_id: null, link: '/admin/membership-requests' }),
    note(u(116), ADMIN, { kind: 'session', related_conversation_id: null, related_message_id: null, link: '//evil.example' }),
    note(u(117), ADMIN, { kind: 'session', related_conversation_id: null, related_message_id: null }),
    note(u(118), STUDENT, { related_conversation_id: 'not-a-uuid', related_message_id: null }),
  ];
  test('the same destination from the same row', () => {
    for (const row of rows) {
      const client = notificationDestination({
        id: String(row.id), kind: row.kind as never, title: String(row.title), body: null, relatedPostId: row.related_post_id as string | null,
        relatedConversationId: row.related_conversation_id as string | null, relatedMessageId: (row.related_message_id ?? null) as string | null,
        relatedCommentId: (row.related_comment_id ?? null) as string | null, readAt: null, createdAt: '', category: categoryOf(row as never), link: (row.link ?? null) as string | null, actorId: null,
      });
      expect(destinationOf(row as never)).toBe(client);
    }
  });
});

describe('replies (RC5)', () => {
  const post = '11111111-2222-4333-8444-555555555555';
  const reply = { id: 'r1', user_id: 'u1', kind: 'comment', category: 'replies', title: 'Unknown User replied to your comment',
    body: 'secret reply text', related_post_id: post, related_conversation_id: null, related_comment_id: '66666666-7777-4888-8999-000000000000' };
  test('are their own category and their own banner group, apart from comments on the post', () => {
    expect(categoryOf(reply)).toBe('replies');
    expect(groupOf(reply as never).tag).toBe(`tp-replies-${post}`);
    const unread = [
      { kind: 'comment', category: 'replies', related_post_id: post, related_conversation_id: null },
      { kind: 'comment', category: 'replies', related_post_id: post, related_conversation_id: null },
      { kind: 'comment', category: 'comments', related_post_id: post, related_conversation_id: null },
    ];
    const payload = buildPayload(reply as never, unread);
    expect(payload.count).toBe(2);
    expect(payload.body).toBe('2 new replies to your comments');
    expect(payload.url).toBe(`/post?post=${post}&comment=66666666-7777-4888-8999-000000000000`);
  });
  test('never put the reply text on the lock screen', () => {
    const payload = buildPayload(reply as never, []);
    expect(JSON.stringify(payload)).not.toContain('secret reply text');
    expect(payload.body).toBe('Unknown User replied to your comment');
  });
});

describe('dispatch latency (RC5)', () => {
  test('created → first claim per notification, summarised as p50 / p95 / max', async () => {
    const { dispatchLatencies, summarise } = await import('./push');
    const notes = [
      { id: 'a', created_at: '2026-10-02T10:00:00.000Z' },
      { id: 'b', created_at: '2026-10-02T10:00:00.000Z' },
      { id: 'c', created_at: '2026-10-02T10:00:00.000Z' },   // never claimed
    ];
    const claims = [
      { notification_id: 'a', claimed_at: '2026-10-02T10:00:00.400Z' },
      { notification_id: 'a', claimed_at: '2026-10-02T10:00:00.300Z' },   // the first claim counts
      { notification_id: 'b', claimed_at: '2026-10-02T10:00:02.000Z' },
    ];
    const values = dispatchLatencies(notes, claims);
    expect(values.sort((x, y) => x - y)).toEqual([300, 2000]);
    expect(summarise(values)).toEqual({ samples: 2, p50: 300, p95: 2000, max: 2000 });
    expect(summarise([])).toEqual({ samples: 0, p50: null, p95: null, max: null });
  });
});
