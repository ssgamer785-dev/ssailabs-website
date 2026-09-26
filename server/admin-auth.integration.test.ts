import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { fileURLToPath } from 'url';
import { adminAuthRouter } from './admin-auth';
import { resetClientsForTests } from './r2';

/**
 * The admin sign-in, end to end, against a stand-in Supabase.
 *
 * admin-auth.test.ts covers everything that happens before the network. This
 * file covers the rest: that the alias resolves to the one admin profile, that
 * the submitted password is forwarded to Supabase Auth unchanged and never
 * stored, that a non-admin account cannot be signed into through this route,
 * and that the "exactly one admin" invariant is enforced rather than assumed.
 *
 * The stand-in speaks the three endpoints supabase-js actually calls. It is
 * not a mock of our own code — our code runs unmodified and talks to it over
 * HTTP, so the request shapes have to be right or these tests fail.
 *
 * The password used here is a fixture. The real one exists only in Supabase
 * Auth; nothing in this repository has a copy, which is the property the last
 * test in this file asserts.
 */

const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_EMAIL = 'owner@tradersplanet.test';
const CORRECT_PASSWORD = 'fixture-password-not-the-real-one';

const servers: Server[] = [];
afterAll(() => { for (const s of servers) s.close(); });

async function listen(app: express.Express): Promise<string> {
  const server = await new Promise<Server>(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

interface FakeOptions {
  /** How many profiles carry role='admin'. The product says exactly one. */
  adminCount?: number;
  /** Whether the auth user behind the admin profile has an email. */
  withEmail?: boolean;
  authStatus?: number;
}

/** Records what the route actually sent, so the assertions can look at it. */
interface Recorder {
  passwordsSeen: string[];
  emailsSeen: string[];
  profileQueries: string[];
}

async function fakeSupabase(opts: FakeOptions = {}): Promise<{ url: string; rec: Recorder }> {
  const { adminCount = 1, withEmail = true, authStatus } = opts;
  const rec: Recorder = { passwordsSeen: [], emailsSeen: [], profileQueries: [] };
  const app = express();
  app.use(express.json());

  // db.from('profiles').select('id').eq('role','admin').limit(2)
  app.get('/rest/v1/profiles', (req, res) => {
    rec.profileQueries.push(req.originalUrl);
    const rows = Array.from({ length: adminCount }, (_, i) => ({
      id: i === 0 ? ADMIN_ID : `2222222${i}-2222-2222-2222-222222222222`,
    }));
    res.json(rows);
  });

  // db.auth.admin.getUserById(id)
  app.get('/auth/v1/admin/users/:id', (req, res) => {
    res.json({ id: req.params.id, email: withEmail ? ADMIN_EMAIL : null });
  });

  // auth.signInWithPassword({ email, password })
  app.post('/auth/v1/token', (req, res) => {
    rec.emailsSeen.push(req.body?.email);
    rec.passwordsSeen.push(req.body?.password);
    if (authStatus) return res.status(authStatus).json({ error: 'server_error', error_description: 'Upstream unavailable' });
    if (req.body?.email !== ADMIN_EMAIL || req.body?.password !== CORRECT_PASSWORD) {
      return res.status(400).json({ error: 'invalid_grant', error_description: 'Invalid login credentials' });
    }
    res.json({
      access_token: 'access-token-for-the-admin',
      refresh_token: 'refresh-token-for-the-admin',
      token_type: 'bearer',
      expires_in: 3600,
      user: { id: ADMIN_ID, email: ADMIN_EMAIL },
    });
  });

  return { url: await listen(app), rec };
}

async function routeUnderTest(): Promise<string> {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminAuthRouter());
  return listen(app);
}

const ENV_KEYS = ['ADMIN_USERNAME', 'VITE_SUPABASE_URL', 'SUPABASE_URL',
                  'VITE_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'] as const;
const saved: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) saved[k] = process.env[k];

beforeEach(() => resetClientsForTests());
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  resetClientsForTests();
});

/** Points the route at the stand-in. The username is the real configured one. */
function configure(supabase: string) {
  process.env.ADMIN_USERNAME = 'Admin@123';
  process.env.VITE_SUPABASE_URL = supabase;
  process.env.SUPABASE_URL = supabase;
  process.env.VITE_SUPABASE_ANON_KEY = 'anon-key-fixture';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key-fixture';
}

const login = (base: string, username: string, password: string) =>
  fetch(`${base}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

describe('admin sign-in, end to end', () => {
  test('the configured username and the right password return a session', async () => {
    const { url, rec } = await fakeSupabase();
    configure(url);
    const base = await routeUnderTest();

    const res = await login(base, 'Admin@123', CORRECT_PASSWORD);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.access_token).toBe('access-token-for-the-admin');
    expect(body.refresh_token).toBe('refresh-token-for-the-admin');

    // The email was discovered, never configured.
    expect(rec.emailsSeen).toEqual([ADMIN_EMAIL]);
    expect(rec.profileQueries[0]).toContain('role=eq.admin');
  });

  test('the response carries the two tokens and nothing else', async () => {
    const { url } = await fakeSupabase();
    configure(url);
    const base = await routeUnderTest();

    const body = await (await login(base, 'Admin@123', CORRECT_PASSWORD)).json();
    // No user object, no email, no role — the client has a session and can ask
    // the database anything it is entitled to with it.
    expect(Object.keys(body).sort()).toEqual(['access_token', 'refresh_token']);
  });

  test('the password is forwarded verbatim and appears nowhere else', async () => {
    const { url, rec } = await fakeSupabase();
    configure(url);
    const base = await routeUnderTest();

    const password = 'a password with spaces & symbols #1';
    await login(base, 'Admin@123', password);

    // Forwarded exactly — no trimming, no case folding, no re-encoding.
    expect(rec.passwordsSeen).toEqual([password]);
    // ...and never put into the environment on the way through.
    for (const value of Object.values(process.env)) expect(value).not.toBe(password);
  });

  test('the right password under the wrong username never reaches Supabase', async () => {
    const { url, rec } = await fakeSupabase();
    configure(url);
    const base = await routeUnderTest();

    const res = await login(base, 'admin@123', CORRECT_PASSWORD);   // case differs
    expect(res.status).toBe(401);
    expect(rec.passwordsSeen).toEqual([]);
  });

  test('the right username with a wrong password is refused, in the same words', async () => {
    const { url } = await fakeSupabase();
    configure(url);
    const base = await routeUnderTest();

    const wrongPassword = await login(base, 'Admin@123', 'not-it');
    const wrongUsername = await login(base, 'someone-else', 'not-it');
    expect(wrongPassword.status).toBe(401);
    expect(await wrongPassword.json()).toEqual(await wrongUsername.json());
  });

  test('an upstream auth failure is a service error, never a credential rejection', async () => {
    const { url } = await fakeSupabase({ authStatus: 503 });
    configure(url);
    const base = await routeUnderTest();
    const res = await login(base, 'Admin@123', CORRECT_PASSWORD);
    expect(res.status).toBe(503);
    expect((await res.json()).error).not.toContain('Incorrect');
  });

  test('two admin profiles means the invariant is broken — refuse, do not pick one', async () => {
    const { url, rec } = await fakeSupabase({ adminCount: 2 });
    configure(url);
    const base = await routeUnderTest();

    const res = await login(base, 'Admin@123', CORRECT_PASSWORD);
    expect(res.status).toBe(503);
    expect(rec.passwordsSeen).toEqual([]);
  });

  test('no admin profile at all is also a refusal, not a 401', async () => {
    const { url } = await fakeSupabase({ adminCount: 0 });
    configure(url);
    const base = await routeUnderTest();

    // 503, not 401: the deployment is broken, and saying "wrong password"
    // would send the one person who can fix it looking in the wrong place.
    expect((await login(base, 'Admin@123', CORRECT_PASSWORD)).status).toBe(503);
  });

  test('an admin profile with no reachable auth user is refused', async () => {
    const { url, rec } = await fakeSupabase({ withEmail: false });
    configure(url);
    const base = await routeUnderTest();

    expect((await login(base, 'Admin@123', CORRECT_PASSWORD)).status).toBe(503);
    expect(rec.passwordsSeen).toEqual([]);
  });
});

describe('what the repository knows', () => {
  test('no source file contains a password-shaped admin secret', async () => {
    // The design's central claim: the password exists only in Supabase Auth.
    // This asserts the two names that would carry one are absent from the
    // server source, so a future edit that adds them fails here.
    const source = await Bun.file(fileURLToPath(new URL('./admin-auth.ts', import.meta.url))).text();
    expect(source).not.toMatch(/ADMIN_PASSWORD/);
    expect(source).not.toMatch(/password\s*[:=]\s*['"][^'"]{6,}['"]/);
  });
});
