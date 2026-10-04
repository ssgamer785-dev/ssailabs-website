/**
 * The "remember me" choice: whether this device keeps the session (and what
 * travels with it) after the browser closes. Its own module so anything that
 * follows the choice can read it without the Supabase client.
 */
const REMEMBER_KEY = 'tp:remember-session';

export function setRememberSession(remember: boolean): void {
  try { localStorage.setItem(REMEMBER_KEY, remember ? 'on' : 'off'); }
  catch { /* The current tab still works if browser storage is unavailable. */ }
}

export function rememberSession(): boolean {
  try { return localStorage.getItem(REMEMBER_KEY) !== 'off'; }
  catch { return true; }
}
