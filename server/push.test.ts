import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import express from 'express';
import webpush from 'web-push';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { pushRouter } from './push';
import { resetClientsForTests } from './r2';

const STUDENT_ID = '11111111-1111-4111-8111-111111111111';
const NEW_USER_ID = '33333333-3333-4333-8333-333333333333';
const ADMIN_ID = '22222222-2222-4222-8222-222222222222';
const servers: Server[] = [];
const envKeys = ['SUPABASE_URL', 'VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'] as const;
const savedEnv: Record<string, string | undefined> = {};
for (const key of envKeys) savedEnv[key] = process.env[key];

async function listen(app: express.Express): Promise<string> {
  const server = await new Promise<Server>(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/** Auth + profiles + push_subscriptions, recording which account each device query was scoped to. */
async function fakeSupabase(): Promise<{ url: string; subscriptionQueries: (string | null)[] }> {
  const app = express();
  const subscriptionQueries: (string | null)[] = [];
  app.get('/auth/v1/user', (req, res) => {
    const token = req.get('authorization')?.replace(/^Bearer /, '');
    const id = token === 'student-token' ? STUDENT_ID : token === 'new-user-token' ? NEW_USER_ID : token === 'admin-token' ? ADMIN_ID : null;
    if (!id) return res.status(401).json({ message: 'invalid token' });
    return res.json({ id, email: `${id}@example.test`, app_metadata: {}, user_metadata: {} });
  });
  app.get('/rest/v1/profiles', (req, res) => {
    const id = new URL(req.originalUrl, 'http://fake').searchParams.get('id')?.replace(/^eq\./, '');
    return res.status(200).set('Content-Type', 'application/vnd.pgrst.object+json')
      .json({ role: id === ADMIN_ID ? 'admin' : 'student', activated_at: id === STUDENT_ID ? '2026-01-01T00:00:00Z' : null });
  });
  app.get('/rest/v1/push_subscriptions', (req, res) => {
    subscriptionQueries.push(new URL(req.originalUrl, 'http://fake').searchParams.get('user_id'));
    return res.json([]);
  });
  return { url: await listen(app), subscriptionQueries };
}

async function pushApi(): Promise<string> {
  const app = express();
  app.use(express.json());
  app.use('/api/push', pushRouter());
  return listen(app);
}

function configure(url: string, subject = 'mailto:support@example.test') {
  const keys = webpush.generateVAPIDKeys();
  process.env.SUPABASE_URL = url;
  process.env.VITE_SUPABASE_URL = url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-fixture';
  process.env.VAPID_PUBLIC_KEY = keys.publicKey;
  process.env.VAPID_PRIVATE_KEY = keys.privateKey;
  process.env.VAPID_SUBJECT = subject;
}

beforeEach(() => resetClientsForTests());
afterEach(() => {
  for (const key of envKeys) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  resetClientsForTests();
});
afterAll(() => { for (const server of servers) server.close(); });

const sendTest = (api: string, token?: string) => fetch(`${api}/api/push/test`, {
  method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {},
});

describe('test notification endpoint', () => {
  test('requires a verified session and an activated account', async () => {
    const fake = await fakeSupabase();
    configure(fake.url);
    const api = await pushApi();
    expect((await sendTest(api)).status).toBe(401);
    expect((await sendTest(api, 'new-user-token')).status).toBe(403);
    expect(fake.subscriptionQueries).toEqual([]);
  });

  test("only ever reads the caller's own devices, and reports none registered", async () => {
    const fake = await fakeSupabase();
    configure(fake.url);
    const api = await pushApi();
    const response = await sendTest(api, 'student-token');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ attempted: 0, delivered: 0, statuses: [], reasons: [] });
    expect(fake.subscriptionQueries).toEqual([`eq.${STUDENT_ID}`]);
  });

  test('is rate limited per account', async () => {
    const fake = await fakeSupabase();
    configure(fake.url);
    const api = await pushApi();
    // The previous test already used this account's window.
    expect((await sendTest(api, 'student-token')).status).toBe(429);
  });

  test('names a VAPID misconfiguration without echoing any key', async () => {
    const fake = await fakeSupabase();
    configure(fake.url, 'not-a-mailto-or-https-subject');
    const api = await pushApi();
    const response = await sendTest(api, 'admin-token');
    const body = await response.json() as { error: string };
    expect(response.status).toBe(503);
    expect(body.error).toMatch(/misconfigured/i);
    expect(body.error).not.toContain(process.env.VAPID_PRIVATE_KEY!);
    expect(body.error).not.toContain(process.env.VAPID_PUBLIC_KEY!);
    expect(fake.subscriptionQueries).toEqual([]);
  });
});

describe('public key endpoint', () => {
  test('serves only the public key', async () => {
    const fake = await fakeSupabase();
    configure(fake.url);
    const api = await pushApi();
    const body = await (await fetch(`${api}/api/push/public-key`)).json();
    expect(body).toEqual({ publicKey: process.env.VAPID_PUBLIC_KEY });
    expect(JSON.stringify(body)).not.toContain(process.env.VAPID_PRIVATE_KEY!);
  });

  test('answers 503 when push is not configured', async () => {
    const fake = await fakeSupabase();
    configure(fake.url);
    delete process.env.VAPID_PRIVATE_KEY;
    const api = await pushApi();
    expect((await fetch(`${api}/api/push/public-key`)).status).toBe(503);
  });
});
