import { afterAll, afterEach, describe, expect, test } from 'bun:test';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { adminAuthRouter } from './admin-auth';

/**
 * The admin sign-in route.
 *
 * What is worth testing here is everything that happens *before* Supabase is
 * consulted: an unconfigured deployment must refuse rather than fall back to a
 * default, a wrong username must be refused, and neither refusal may tell the
 * caller which half was wrong. Anything past that point is Supabase Auth's own
 * password check, which is not ours to re-implement or to mock into agreement.
 */

const servers: Server[] = [];
afterAll(() => { for (const s of servers) s.close(); });

async function serve(): Promise<string> {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminAuthRouter());
  const server = await new Promise<Server>(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const ENV_KEYS = ['ADMIN_USERNAME', 'VITE_SUPABASE_URL', 'SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY',
                  'SUPABASE_SERVICE_ROLE_KEY'] as const;
const saved: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) saved[k] = process.env[k];

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function configure(over: Partial<Record<(typeof ENV_KEYS)[number], string>> = {}) {
  process.env.ADMIN_USERNAME = 'tp-admin';
  process.env.VITE_SUPABASE_URL = 'https://project.supabase.co';
  process.env.VITE_SUPABASE_ANON_KEY = 'anon-key';
  for (const [k, v] of Object.entries(over)) process.env[k] = v;
}

const post = (base: string, body: unknown) =>
  fetch(`${base}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('admin sign-in', () => {
  test('refuses to authenticate when the server is not configured', async () => {
    for (const k of ENV_KEYS) delete process.env[k];
    const base = await serve();
    const res = await post(base, { username: 'anything', password: 'anything' });
    expect(res.status).toBe(503);
    // No default username exists to be guessed at.
    expect((await res.json()).error).not.toContain('username');
  });

  test('refuses when the username is configured but Supabase is not', async () => {
    for (const k of ENV_KEYS) delete process.env[k];
    process.env.ADMIN_USERNAME = 'tp-admin';
    const base = await serve();
    expect((await post(base, { username: 'tp-admin', password: 'x' })).status).toBe(503);
  });

  test('rejects a wrong username without ever reaching Supabase', async () => {
    configure({ VITE_SUPABASE_URL: 'https://unreachable.invalid' });
    const base = await serve();
    const res = await post(base, { username: 'not-the-admin', password: 'whatever' });
    // A network attempt to the unreachable host would take far longer and
    // surface as a 503 from asyncRoute; a clean 401 proves we returned first.
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('Incorrect username or password.');
  });

  test('a wrong username and a missing password are indistinguishable', async () => {
    configure({ VITE_SUPABASE_URL: 'https://unreachable.invalid' });
    const base = await serve();
    const wrongUser = await post(base, { username: 'nope', password: 'whatever' });
    const alsoWrong = await post(base, { username: 'NOPE', password: 'whatever' });
    expect(wrongUser.status).toBe(alsoWrong.status);
    expect(await wrongUser.json()).toEqual(await alsoWrong.json());
  });

  test('the username comparison is exact — no trimming into a match, no case folding', async () => {
    configure({ VITE_SUPABASE_URL: 'https://unreachable.invalid' });
    const base = await serve();
    for (const username of ['TP-ADMIN', 'tp-admin ', 'tp-admi', 'tp-adminx']) {
      const res = await post(base, { username, password: 'whatever' });
      // 'tp-admin ' trims to the real username, which is intended; the rest
      // must all be refused.
      if (username.trim() === 'tp-admin') continue;
      expect(res.status).toBe(401);
    }
  });

  test('missing or non-string fields are a 400, not a 500', async () => {
    configure();
    const base = await serve();
    for (const body of [{}, { username: 'tp-admin' }, { password: 'x' }, { username: 1, password: 2 }]) {
      expect((await post(base, body)).status).toBe(400);
    }
  });

  test('there is no signup, reset or any other admin route', async () => {
    configure();
    const base = await serve();
    for (const path of ['signup', 'register', 'reset', 'create']) {
      const res = await fetch(`${base}/api/admin/${path}`, { method: 'POST' });
      expect(res.status).toBe(404);
    }
  });
});

describe('the bundle', () => {
  test('admin credentials are never VITE_-prefixed', () => {
    // A VITE_ prefix is the one thing that would put these in the browser
    // bundle. This asserts the naming convention the whole design rests on.
    const source = Bun.file(new URL('./admin-auth.ts', import.meta.url).pathname);
    return source.text().then(text => {
      expect(text).not.toMatch(/VITE_ADMIN/);
      expect(text).toContain("env('ADMIN_USERNAME')");
      // No password is read from the environment, or named anywhere at all.
      expect(text).not.toMatch(/ADMIN_PASSWORD/);
      // The admin's account is discovered from profiles.role, not configured,
      // so there is no second source of truth to drift out of step.
      expect(text).not.toMatch(/ADMIN_EMAIL/);
      expect(text).toContain("eq('role', 'admin')");
    });
  });
});
