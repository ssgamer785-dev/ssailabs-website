import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import app from './app';
import { profileMediaRouter } from './profile-media';
import { resetClientsForTests } from './r2';

/**
 * The answers Production's logs show for /api/profile/avatar-url, pinned
 * against the real route: 401 without (or with a rejected) session, 404
 * "Profile picture not found." for a member without a photo, 200 with a
 * signed URL for a member with one, and Express's own 404 for a route that
 * does not exist. Local only: none of this is exercised against Production.
 */
const STUDENT = '11111111-1111-4111-8111-111111111111';
const ADMIN = '22222222-2222-4222-8222-222222222222';
const NO_PHOTO = '33333333-3333-4333-8333-333333333333';
const AVATARS: Record<string, string | null> = {
  [STUDENT]: null,
  [ADMIN]: `avatars/${ADMIN}/1790000000000-0f8fad5b-d9cb-469f-a165-70867728950e.bin`,
  [NO_PHOTO]: null,
};
const servers: Server[] = [];
const envKeys = ['SUPABASE_URL', 'VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'] as const;
const savedEnv: Record<string, string | undefined> = {};
for (const key of envKeys) savedEnv[key] = process.env[key];

async function listen(server: express.Express): Promise<string> {
  const instance = await new Promise<Server>(resolve => { const s = server.listen(0, '127.0.0.1', () => resolve(s)); });
  servers.push(instance);
  return `http://127.0.0.1:${(instance.address() as AddressInfo).port}`;
}

async function fakeSupabase(): Promise<string> {
  const fake = express();
  fake.get('/auth/v1/user', (req, res) => {
    const token = req.get('authorization')?.replace(/^Bearer /, '');
    const id = token === 'student-token' ? STUDENT : token === 'admin-token' ? ADMIN : null;
    if (!id) return res.status(401).json({ message: 'invalid JWT' });
    return res.json({ id, email: `${id}@example.test`, app_metadata: {}, user_metadata: {} });
  });
  fake.get('/rest/v1/profiles', (req, res) => {
    const params = new URL(req.originalUrl, 'http://fake').searchParams;
    const id = params.get('id')?.replace(/^eq\./, '') ?? '';
    const row = id in AVATARS
      ? { role: id === ADMIN ? 'admin' : 'student', activated_at: '2026-01-01T00:00:00Z', avatar_key: AVATARS[id] }
      : null;
    const single = (req.get('accept') ?? '').includes('vnd.pgrst.object');
    if (single) {
      if (!row) return res.status(406).json({ code: 'PGRST116', message: 'no rows' });
      return res.set('Content-Type', 'application/vnd.pgrst.object+json').json(row);
    }
    return res.json(row ? [row] : []);
  });
  return listen(fake);
}

async function avatarApi(): Promise<string> {
  const server = express();
  server.use('/api/profile', profileMediaRouter());
  return listen(server);
}

beforeEach(async () => {
  resetClientsForTests();
  const url = await fakeSupabase();
  process.env.SUPABASE_URL = url;
  process.env.VITE_SUPABASE_URL = url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-fixture';
  process.env.R2_ACCOUNT_ID = 'account-fixture';
  process.env.R2_ACCESS_KEY_ID = 'access-fixture';
  process.env.R2_SECRET_ACCESS_KEY = 'secret-fixture';
  process.env.R2_BUCKET = 'bucket-fixture';
});
afterEach(() => {
  for (const key of envKeys) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  resetClientsForTests();
});
afterAll(() => { for (const server of servers) server.close(); });

const get = (base: string, query: string, token?: string) =>
  fetch(`${base}/api/profile/avatar-url?${query}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

describe('GET /api/profile/avatar-url', () => {
  test('401 without a session: the route exists and refuses (this is what the curl probe saw)', async () => {
    const api = await avatarApi();
    const res = await get(api, `userId=${NO_PHOTO}`);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Not authenticated.' });
  });

  test('401 for a rejected (expired or revoked) token', async () => {
    const api = await avatarApi();
    expect((await get(api, `userId=${NO_PHOTO}`, 'expired-token')).status).toBe(401);
  });

  test('400 for a malformed user id, before any lookup', async () => {
    const api = await avatarApi();
    expect((await get(api, 'userId=not-a-uuid', 'student-token')).status).toBe(400);
  });

  test('404 "Profile picture not found." for a signed-in viewer asking about a member with no photo', async () => {
    const api = await avatarApi();
    const res = await get(api, `userId=${NO_PHOTO}`, 'student-token');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Profile picture not found.' });
  });

  test('200 with a short-lived signed URL for a member who has a photo (student viewing the admin)', async () => {
    const api = await avatarApi();
    const res = await get(api, `userId=${ADMIN}`, 'student-token');
    expect(res.status).toBe(200);
    const body = await res.json() as { url: string; expiresIn: number };
    expect(body.expiresIn).toBe(3600);
    expect(body.url).toContain(`/avatars/${ADMIN}/`);
    expect(body.url).toContain('X-Amz-Signature=');
  });
});

describe('the deployed app surface', () => {
  test('a route that does not exist is Express\'s 404 (what the second curl probe saw)', async () => {
    const base = await listen(app);
    const res = await fetch(`${base}/api/profile/route-that-does-not-exist`);
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('Cannot GET /api/profile/route-that-does-not-exist');
  });
});
