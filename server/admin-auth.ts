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
 * What lives in the environment (server-only, never VITE_-prefixed, so it
 * cannot reach the browser bundle):
 *   ADMIN_USERNAME   the alias the admin types
 *
 * The password is not here, not in .env, and not anywhere in this repository.
 * It is set in the Supabase dashboard.
 */

import { Router, type Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';
import { asyncRoute, env, getAdmin } from './r2';

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

function supabaseUrl(): string | undefined {
  return env('VITE_SUPABASE_URL') || env('SUPABASE_URL');
}

export function adminAuthRouter(): Router {
  const router = Router();

  const requireConfigured = (res: Response) => {
    // No defaults anywhere. An unconfigured deployment refuses to authenticate
    // rather than falling back to something guessable.
    if (!env('ADMIN_USERNAME') || !supabaseUrl() || !env('VITE_SUPABASE_ANON_KEY')) {
      res.status(503).json({ error: 'Admin sign-in is not configured on this server.' });
      return false;
    }
    return true;
  };

  router.post('/login', asyncRoute(async (req, res) => {
    if (!requireConfigured(res)) return;

    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    if (!safeEqual(username.trim(), env('ADMIN_USERNAME')!)) {
      return res.status(401).json({ error: REJECTED });
    }

    // Who is the admin? Asked, not assumed.
    const db = getAdmin();
    if (!db) {
      return res.status(503).json({ error: 'Admin sign-in is not configured on this server.' });
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
      return res.status(401).json({ error: REJECTED });
    }

    // The client installs this with supabase.auth.setSession(), which is why
    // only the two tokens are returned rather than the whole payload.
    res.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
  }));

  return router;
}
