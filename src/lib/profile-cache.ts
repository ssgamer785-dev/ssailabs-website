/**
 * The signed-in member's own profile, kept on this device so a launch can
 * render the app at once and re-read the profile quietly in the background.
 *
 * Without it every cold start waited for a network read before any screen
 * could decide where the member belongs, behind a full-screen "Loading your
 * account…" — and a failed read made an activated member look un-activated.
 *
 * Routing only, never authorization: the database still decides what every
 * query returns (RLS, is_activated(), is_admin()), so an edited cache entry
 * moves nobody past anything. It lives next to the session itself: the same
 * storage the "remember me" choice picked, and it is removed on sign-out.
 */
const KEY = 'tp:profile:v1';
/** Older than this, the entry is ignored and the launch waits for the network. */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface Entry<P> { userId: string; savedAt: number; profile: P }

function stores(remember: boolean): { write: StorageLike | null; all: StorageLike[] } {
  const all: StorageLike[] = [];
  let local: StorageLike | null = null;
  let session: StorageLike | null = null;
  try { local = window.localStorage; all.push(local); } catch { /* unavailable */ }
  try { session = window.sessionStorage; all.push(session); } catch { /* unavailable */ }
  return { write: remember ? local : session, all };
}

export function readCachedProfile<P extends { id: string }>(userId: string, now = Date.now(), from?: StorageLike[]): P | null {
  for (const store of from ?? stores(true).all) {
    try {
      const raw = store.getItem(KEY);
      if (!raw) continue;
      const entry = JSON.parse(raw) as Entry<P>;
      if (entry?.userId !== userId || entry.profile?.id !== userId) continue;
      if (!(now - entry.savedAt < MAX_AGE_MS)) continue;
      return entry.profile;
    } catch { /* a corrupt entry is simply not used */ }
  }
  return null;
}

export function writeCachedProfile<P extends { id: string }>(profile: P, remember: boolean, now = Date.now(), target?: { write: StorageLike | null; all: StorageLike[] }): void {
  const { write, all } = target ?? stores(remember);
  const value = JSON.stringify({ userId: profile.id, savedAt: now, profile } satisfies Entry<P>);
  for (const store of all) {
    try { if (store !== write) store.removeItem(KEY); } catch { /* ignore */ }
  }
  try { write?.setItem(KEY, value); } catch { /* full or blocked: the app simply reads from the network */ }
}

export function clearCachedProfile(from?: StorageLike[]): void {
  for (const store of from ?? stores(true).all) {
    try { store.removeItem(KEY); } catch { /* ignore */ }
  }
}
