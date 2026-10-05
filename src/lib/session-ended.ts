/**
 * Telling a member why they are looking at the sign-in screen.
 *
 * The app itself never signs anyone out: only the member (Log out, or after
 * choosing a new password), or the auth server refusing a session for good —
 * revoked, or its refresh credentials rejected once they were the only ones
 * left. A failed profile read, a network loss, an app update, a route change
 * or time in the background never ends a session. When the server does end
 * one, the sign-in screen says so plainly instead of simply appearing.
 */
const KEY = 'tp:session-ended';
/** Written where the member signs out: the app's other open tabs hear of that sign-out too, and it is theirs there as well. */
const MEMBER_SIGNED_OUT = 'tp:member-signed-out';
const ELSEWHERE_WINDOW_MS = 15_000;
let expected = false;
/** The last sign-out by the member this tab has already accounted for. */
let seen: string | null = null;

/** The member asked to sign out: the next SIGNED_OUT is theirs, not the server's — in every open tab. */
export function expectSignOut(): void {
  expected = true;
  try { localStorage.setItem(MEMBER_SIGNED_OUT, `${Date.now()} ${Math.random().toString(36).slice(2)}`); } catch { /* other tabs may then explain it */ }
}

/** The member signed out just now in another tab of this app (each such sign-out counts once). */
function signedOutElsewhere(): boolean {
  let mark: string | null = null;
  try { mark = localStorage.getItem(MEMBER_SIGNED_OUT); } catch { return false; }
  if (!mark || mark === seen) return false;
  seen = mark;
  return Date.now() - Number.parseInt(mark, 10) < ELSEWHERE_WINDOW_MS;
}

/** Called for every SIGNED_OUT; remembers an unexpected one (for this tab) so the sign-in screen can explain it. */
export function noteSignedOut(hadSession: boolean): void {
  const ours = signedOutElsewhere() || expected;
  expected = false;
  if (ours || !hadSession) return;
  try { sessionStorage.setItem(KEY, String(Date.now())); } catch { /* the sign-in screen just shows no notice */ }
}

/** The notice, once: read by the sign-in screen and then forgotten. */
export function takeSessionEndedNotice(): string | null {
  try {
    const at = sessionStorage.getItem(KEY);
    if (!at) return null;
    sessionStorage.removeItem(KEY);
    return 'Your session has expired. Please sign in again.';
  } catch {
    return null;
  }
}
