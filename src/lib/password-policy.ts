/**
 * One password rule for sign-up and reset (they used to disagree: 6 vs 8),
 * and the marker that a password reset really came from the emailed link.
 */
export const MIN_PASSWORD_LENGTH = 8;

export function validateNewPassword(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password !== confirm) return 'Passwords do not match.';
  return null;
}

const RECOVERY_KEY = 'tp-password-recovery-at';
const RECOVERY_TTL_MS = 60 * 60 * 1000;

type SessionStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const defaultStore = (): SessionStore | null => { try { return window.sessionStorage; } catch { return null; } };

/**
 * Supabase reports PASSWORD_RECOVERY when the emailed reset link is opened.
 * Only then may /reset-password set a new password: an ordinary signed-in
 * session (a borrowed phone, an unlocked laptop) could otherwise change the
 * password without knowing the current one.
 */
export function markPasswordRecovery(store: SessionStore | null = defaultStore(), now = Date.now()): void {
  store?.setItem(RECOVERY_KEY, String(now));
}

export function hasPasswordRecovery(store: SessionStore | null = defaultStore(), now = Date.now()): boolean {
  const at = Number(store?.getItem(RECOVERY_KEY) ?? 0);
  return at > 0 && now - at < RECOVERY_TTL_MS;
}

export function clearPasswordRecovery(store: SessionStore | null = defaultStore()): void {
  store?.removeItem(RECOVERY_KEY);
}
