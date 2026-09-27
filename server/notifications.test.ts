import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { notificationsRouter } from './notifications';
import { resetClientsForTests } from './r2';

const STUDENT_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_ID = '22222222-2222-4222-8222-222222222222';
const OWN_NOTIFICATION = '33333333-3333-4333-8333-333333333333';
const OTHER_NOTIFICATION = '44444444-4444-4444-8444-444444444444';
const servers: Server[] = [];
const envKeys = ['SUPABASE_URL', 'VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const;
const savedEnv: Record<string, string | undefined> = {};
for (const key of envKeys) savedEnv[key] = process.env[key];

interface DeleteRequest {
  id: string | null;
  userId: string | null;
}

async function listen(app: express.Express): Promise<string> {
  const server = await new Promise<Server>(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function fakeSupabase(): Promise<{ url: string; deletions: DeleteRequest[] }> {
  const app = express();
  const deletions: DeleteRequest[] = [];
  app.use(express.json());

  app.get('/auth/v1/user', (req, res) => {
    const token = req.get('authorization')?.replace(/^Bearer /, '');
    const id = token === 'student-token' ? STUDENT_ID : token === 'admin-token' ? ADMIN_ID : null;
    if (!id) return res.status(401).json({ message: 'invalid token' });
    return res.json({ id, email: `${id}@example.test`, app_metadata: {}, user_metadata: {} });
  });

  app.get('/rest/v1/profiles', (req, res) => {
    const id = new URL(req.originalUrl, 'http://fake').searchParams.get('id')?.replace(/^eq\./, '');
    return res.status(200).set('Content-Type', 'application/vnd.pgrst.object+json')
      .json({ role: id === ADMIN_ID ? 'admin' : 'student', activated_at: '2026-01-01T00:00:00Z' });
  });

  app.delete('/rest/v1/notifications', (req, res) => {
    const params = new URL(req.originalUrl, 'http://fake').searchParams;
    const id = params.get('id')?.replace(/^eq\./, '') ?? null;
    const userId = params.get('user_id')?.replace(/^eq\./, '') ?? null;
    deletions.push({ id, userId });
    if (!userId) return res.status(400).json({ message: 'missing owner filter' });
    if (id === OTHER_NOTIFICATION) return res.json([]);
    if (id) return res.json([{ id }]);
    return res.status(204).end();
  });

  return { url: await listen(app), deletions };
}

async function notificationApi(): Promise<string> {
  const app = express();
  app.use(express.json());
  app.use('/api/notifications', notificationsRouter());
  return listen(app);
}

function configure(url: string) {
  process.env.SUPABASE_URL = url;
  process.env.VITE_SUPABASE_URL = url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-fixture';
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

describe('notification deletion authorization', () => {
  test('requires a verified Supabase session', async () => {
    const fake = await fakeSupabase();
    configure(fake.url);
    const api = await notificationApi();
    const response = await fetch(`${api}/api/notifications`, { method: 'DELETE' });
    expect(response.status).toBe(401);
    expect(fake.deletions).toEqual([]);
  });

  test('a student can delete one of their notifications, scoped to their auth uid', async () => {
    const fake = await fakeSupabase();
    configure(fake.url);
    const api = await notificationApi();
    const response = await fetch(`${api}/api/notifications/${OWN_NOTIFICATION}`, {
      method: 'DELETE', headers: { Authorization: 'Bearer student-token' },
    });
    expect(response.status).toBe(200);
    expect(fake.deletions).toEqual([{ id: OWN_NOTIFICATION, userId: STUDENT_ID }]);
  });

  test('a student cannot delete another user notification', async () => {
    const fake = await fakeSupabase();
    configure(fake.url);
    const api = await notificationApi();
    const response = await fetch(`${api}/api/notifications/${OTHER_NOTIFICATION}`, {
      method: 'DELETE', headers: { Authorization: 'Bearer student-token' },
    });
    expect(response.status).toBe(404);
    expect(fake.deletions).toEqual([{ id: OTHER_NOTIFICATION, userId: STUDENT_ID }]);
  });

  test('clear all is constrained to the authenticated admin account', async () => {
    const fake = await fakeSupabase();
    configure(fake.url);
    const api = await notificationApi();
    const response = await fetch(`${api}/api/notifications`, {
      method: 'DELETE', headers: { Authorization: 'Bearer admin-token' },
    });
    expect(response.status).toBe(200);
    expect(fake.deletions).toEqual([{ id: null, userId: ADMIN_ID }]);
  });

  test('rejects malformed ids before issuing a delete', async () => {
    const fake = await fakeSupabase();
    configure(fake.url);
    const api = await notificationApi();
    const response = await fetch(`${api}/api/notifications/not-a-uuid`, {
      method: 'DELETE', headers: { Authorization: 'Bearer student-token' },
    });
    expect(response.status).toBe(400);
    expect(fake.deletions).toEqual([]);
  });
});
