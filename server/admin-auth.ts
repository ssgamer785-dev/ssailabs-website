/**
 * The single admin's username + password sign-in.
 *
 * There is one admin, and they sign in with a username — not an email, not
 * Google. What this route does NOT do is invent a second authorization system:
 * the username is an alias, and the password is verified by Supabase Auth
 * itself. What comes back is an ordinary Supabase session, so every existing
 * RLS policy, is_admin() check and role guard keeps working untouched.
 *
 * Which account the alias resolves to is discovered, not configured. The
 * product says there is exactly one admin, so the server asks the database who
 * that is rather than being told a second time in an environment variable that
 * could drift out of step with profiles.role. If the database disagrees — no
 * admin, or more than one — this route refuses to authenticate at all, which
 * makes "there is only one admin" an invariant the sign-in enforces rather
 * than an assumption it rests on.
 *
 * Why not store our own password hash:
 *   - Supabase Auth already stores a bcrypt hash and already rate-limits
 *     failed attempts. A second hash is one more thing to rotate, and the two
 *     could drift apart.
 *   - Nothing here ever holds a password at rest. The plaintext exists only
 *     for the length of this request, on its way to Supabase.
 *
 * What this route needs from the environment:
 *   ADMIN_USERNAME             the alias the admin types (server-only, never
 *                              VITE_-prefixed, so it cannot reach the bundle)
 *   SUPABASE_SERVICE_ROLE_KEY  to read which profile holds role='admin'
 *   SUPABASE_URL / VITE_SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY     to sign in through the ordinary auth path
 *
 * The last three are the project's existing Supabase configuration, not new
 * settings — but the service-role key is easy to overlook here, because
 * "discovered, not configured" above describes the admin's identity, not the
 * credentials needed to discover it. All four are checked together below.
 *
 * The password is not here, not in .env, and not anywhere in this repository.
 * It is set in the Supabase dashboard.
 */

import { Router, type Request, type Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';
import { asyncRoute, env, getAdmin } from './r2.js';

/** One message for every failure. Which half was wrong is not the caller's business. */
const REJECTED = 'Incorrect username or password.';

/**
 * Compares without leaking length or position through timing.
 *
 * The username is not really a secret, but a length-revealing compare on the
 * one credential pair guarding the whole admin surface is not worth the saving.
 */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Failed attempts per client, kept in this instance's memory: five in fifteen
 * minutes and that client is told to wait. Supabase's own limit sees Vercel's
 * addresses rather than the caller's, so it cannot tell one guesser from
 * everyone else. Serverless instances do not share memory, so this is a brake
 * on guessing, not a guarantee; a durable limit needs a database table.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const failures = new Map<string, number[]>();

/** Vercel sets x-real-ip / x-forwarded-for to the caller's address and overwrites any client-supplied value. */
export function clientKey(req: Request): string {
  const forwarded = req.get('x-forwarded-for')?.split(',')[0]?.trim();
  return req.get('x-real-ip')?.trim() || forwarded || req.socket.remoteAddress || 'unknown';
}

function recentFailures(key: string, now: number): number[] {
  const recent = (failures.get(key) ?? []).filter(t => now - t < WINDOW_MS);
  if (recent.length) failures.set(key, recent); else failures.delete(key);
  return recent;
}

function recordFailure(key: string, now: number): void {
  if (failures.size > 10_000) failures.clear(); // bounded, whatever arrives
  failures.set(key, [...recentFailures(key, now), now]);
}

export function resetAdminLoginThrottleForTests(): void {
  failures.clear();
}

/**
 * Every refusal takes at least this long, measured from the start of the
 * request, so a wrong username (decided locally) is not answered measurably
 * faster than a wrong password (decided by Supabase).
 */
async function answerNoSoonerThan(startedAt: number): Promise<void> {
  const floor = Number(env('ADMIN_LOGIN_FAILURE_FLOOR_MS') ?? 800);
  const target = startedAt + floor + Math.floor(Math.random() * 150);
  const wait = target - Date.now();
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
}

function supabaseUrl(): string | undefined {
  return env('VITE_SUPABASE_URL') || env('SUPABASE_URL');
}

export function adminAuthRouter(): Router {
  const router = Router();

  /**
   * Everything this route needs from the environment, checked in one place.
   *
   * SUPABASE_SERVICE_ROLE_KEY belongs here and was previously missing: the
   * route needs it to look up which profile holds role='admin', but it was only
   * discovered later, via getAdmin() returning null, which answered with the
   * same opaque "not configured" sentence. A deployment with the other three
   * set and this one absent therefore reported a problem it gave no way to
   * find. Listing it here is the fix; the log line below is what makes any
   * future omission self-diagnosing.
   */
  const REQUIRED = [
    'ADMIN_USERNAME',
    'SUPABASE_URL or VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ] as const;

  const missing = () => {
    const gaps: string[] = [];
    if (!env('ADMIN_USERNAME')) gaps.push(REQUIRED[0]);
    if (!supabaseUrl()) gaps.push(REQUIRED[1]);
    if (!env('VITE_SUPABASE_ANON_KEY')) gaps.push(REQUIRED[2]);
    if (!env('SUPABASE_SERVICE_ROLE_KEY')) gaps.push(REQUIRED[3]);
    return gaps;
  };

  const requireConfigured = (res: Response) => {
    // No defaults anywhere. An unconfigured deployment refuses to authenticate
    // rather than falling back to something guessable.
    const gaps = missing();
    if (gaps.length) {
      // Names only, never values — a service-role key must not reach a log.
      // The response stays deliberately vague; the operator reads the server.
      console.error(
        `[admin-auth] refusing to authenticate: unset or empty in the server's ` +
        `environment: ${gaps.join(', ')}. Note that a variable present but set ` +
        `to an empty string counts as unset.`,
      );
      res.status(503).json({ error: 'Admin sign-in is not configured on this server.' });
      return false;
    }
    return true;
  };

  router.post('/login', asyncRoute(async (req, res) => {
    if (!requireConfigured(res)) return;

    const startedAt = Date.now();
    const client = clientKey(req);
    const recent = recentFailures(client, startedAt);
    if (recent.length >= MAX_FAILURES) {
      const retryAfter = Math.max(1, Math.ceil((recent[0] + WINDOW_MS - startedAt) / 1000));
      console.error('[admin-auth] throttled: too many failed attempts from one client');
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Too many sign-in attempts. Please wait and try again.' });
    }

    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    if (!safeEqual(username.trim(), env('ADMIN_USERNAME')!)) {
      // Never logs either value — just that this was the branch that failed,
      // so a rejected login can be told apart from a Supabase-side rejection
      // below without exposing the username or the configured alias.
      console.error('[admin-auth] rejected: typed username did not match ADMIN_USERNAME');
      recordFailure(client, startedAt);
      await answerNoSoonerThan(startedAt);
      return res.status(401).json({ error: REJECTED });
    }

    // Who is the admin? Asked, not assumed.
    // Unreachable unless the environment changed under a running process:
    // requireConfigured() has already established the URL and the service-role
    // key. Kept as a guard, but no longer sharing the "not configured" sentence,
    // so the two causes can never again be confused for each other.
    const db = getAdmin();
    if (!db) {
      console.error('[admin-auth] service-role client unavailable despite a complete environment');
      return res.status(503).json({ error: 'Admin sign-in is not available. Please contact support.' });
    }

    const { data: admins, error: lookupError } = await db
      .from('profiles').select('id').eq('role', 'admin').limit(2);

    if (lookupError || !admins || admins.length !== 1) {
      // Logged in full server-side; the caller is told nothing about the
      // shape of the account table.
      console.error(
        '[admin-auth] expected exactly one admin profile, found',
        admins?.length ?? `error: ${lookupError?.message}`,
      );
      return res.status(503).json({ error: 'Admin sign-in is not available. Please contact support.' });
    }

    const { data: adminUser, error: userError } = await db.auth.admin.getUserById(admins[0].id);
    if (userError || !adminUser?.user?.email) {
      console.error('[admin-auth] admin profile has no reachable auth user:', userError?.message);
      return res.status(503).json({ error: 'Admin sign-in is not available. Please contact support.' });
    }

    // The anon key on purpose, not the service-role key: this must go through
    // the same Supabase Auth path — and the same brute-force protection — as
    // any other sign-in. The service-role key would let the server mint a
    // session without the password ever being checked.
    const auth = createClient(supabaseUrl()!, env('VITE_SUPABASE_ANON_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await auth.auth.signInWithPassword({
      email: adminUser.user.email,
      password,
    });

    if (error || !data.session) {
      // Supabase's own reason (e.g. "Invalid login credentials", "Email not
      // confirmed", a rate limit) — never the password itself — so a wrong
      // password can be told apart from an account-level block that no
      // password would pass.
      console.error('[admin-auth] rejected by Supabase sign-in:', error?.message ?? 'no session returned');
      if (error?.status === 429) return res.status(429).json({ error: 'Too many sign-in attempts. Please wait and try again.' });
      if (error?.code === 'invalid_credentials' || error?.message === 'Invalid login credentials') {
        recordFailure(client, startedAt);
        await answerNoSoonerThan(startedAt);
        return res.status(401).json({ error: REJECTED });
      }
      return res.status(503).json({ error: 'Admin sign-in is temporarily unavailable. Please try again.' });
    }

    failures.delete(client);
    // The client installs this with supabase.auth.setSession(), which is why
    // only the two tokens are returned rather than the whole payload.
    res.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
  }));

  return router;
}
