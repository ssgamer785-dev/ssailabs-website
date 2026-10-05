import { beforeEach, describe, expect, it } from 'bun:test';
import { authStorage } from './auth-storage';
import { expectSignOut, noteSignedOut, takeSessionEndedNotice } from './session-ended';

/** Web Storage with a size limit, throwing as browsers do when it is full. */
class LimitedStorage {
  map = new Map<string, string>();
  constructor(public limit = Infinity, public broken = false) {}
  get length() { return this.map.size; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  getItem(k: string) { if (this.broken) throw new Error('SecurityError'); return this.map.get(k) ?? null; }
  setItem(k: string, v: string) {
    if (this.broken) throw new Error('SecurityError');
    const used = [...this.map].filter(([key]) => key !== k).reduce((n, [key, val]) => n + key.length + val.length, 0);
    if (used + k.length + v.length > this.limit) throw Object.assign(new Error('QuotaExceededError'), { name: 'QuotaExceededError' });
    this.map.set(k, v);
  }
  removeItem(k: string) { if (this.broken) throw new Error('SecurityError'); this.map.delete(k); }
}

const g = globalThis as unknown as { localStorage: LimitedStorage; sessionStorage: LimitedStorage };
const KEY = 'sb-project-auth-token';
const SESSION = JSON.stringify({ access_token: 'a'.repeat(900), refresh_token: 'r1' });
const quiet = <T>(run: () => T): T => { const warn = console.warn; console.warn = () => {}; try { return run(); } finally { console.warn = warn; } };

beforeEach(() => {
  g.localStorage = new LimitedStorage();
  g.sessionStorage = new LimitedStorage();
  authStorage.removeItem(KEY);
});

describe('where the session is kept', () => {
  it('remembered: on this device; not remembered: in this tab only — never both', () => {
    authStorage.setItem(KEY, SESSION);
    expect(g.localStorage.getItem(KEY)).toBe(SESSION);
    g.localStorage.setItem('tp:remember-session', 'off');
    authStorage.setItem(KEY, SESSION);
    expect([g.localStorage.getItem(KEY), g.sessionStorage.getItem(KEY)]).toEqual([null, SESSION]);
    expect(authStorage.getItem(KEY)).toBe(SESSION);
  });

  it('a full device store makes room by dropping only this app\'s rebuildable media hints, then keeps the session there', () => {
    g.localStorage = new LimitedStorage(3000);
    g.localStorage.setItem('tp:theme', 'dark');
    g.localStorage.setItem('tp:media-urls:v1:user', 'x'.repeat(1200));
    g.localStorage.setItem('tp:media-sizes:v1:user', 'y'.repeat(800));
    authStorage.setItem(KEY, SESSION);
    expect(g.localStorage.getItem(KEY)).toBe(SESSION);
    expect(g.localStorage.getItem('tp:theme')).toBe('dark');
    expect(g.localStorage.getItem('tp:media-urls:v1:user')).toBeNull();
  });

  it('a device store that still cannot hold it keeps the session for this tab: a reload does not sign the member out', () => {
    g.localStorage = new LimitedStorage(10);
    quiet(() => authStorage.setItem(KEY, SESSION));
    expect(g.sessionStorage.getItem(KEY)).toBe(SESSION);
    expect(authStorage.getItem(KEY)).toBe(SESSION);
  });

  it('only where the browser refuses all storage is it held in memory — and still read back, and removed on sign-out', () => {
    g.localStorage = new LimitedStorage(Infinity, true);
    g.sessionStorage = new LimitedStorage(Infinity, true);
    quiet(() => authStorage.setItem(KEY, SESSION));
    expect(authStorage.getItem(KEY)).toBe(SESSION);
    authStorage.removeItem(KEY);
    expect(authStorage.getItem(KEY)).toBeNull();
  });

  it('a newer session written to storage replaces one held in memory', () => {
    g.localStorage = new LimitedStorage(Infinity, true);
    g.sessionStorage = new LimitedStorage(Infinity, true);
    quiet(() => authStorage.setItem(KEY, SESSION));
    g.localStorage = new LimitedStorage();
    g.sessionStorage = new LimitedStorage();
    authStorage.setItem(KEY, 'newer');
    g.localStorage.removeItem(KEY);
    // Gone from storage (another tab signed out): the old copy in memory is not brought back.
    expect(authStorage.getItem(KEY)).toBeNull();
  });
});

describe('telling the member why they see the sign-in screen', () => {
  it('a sign-out the member asked for says nothing', () => {
    expectSignOut();
    noteSignedOut(true);
    expect(takeSessionEndedNotice()).toBeNull();
  });
  it('a session the server ended is explained once', () => {
    noteSignedOut(true);
    expect(takeSessionEndedNotice()).toBe('Your session has expired. Please sign in again.');
    expect(takeSessionEndedNotice()).toBeNull();
  });
  it('no session before (a first visit) says nothing', () => {
    noteSignedOut(false);
    expect(takeSessionEndedNotice()).toBeNull();
  });
  it('a sign-out the member made in another open tab says nothing here either; a later unexpected one still does', () => {
    // What that other tab wrote when the member pressed Log out there.
    g.localStorage.setItem('tp:member-signed-out', `${Date.now()} other-tab`);
    noteSignedOut(true);
    expect(takeSessionEndedNotice()).toBeNull();
    noteSignedOut(true);
    expect(takeSessionEndedNotice()).not.toBeNull();
  });
  it('an old sign-out elsewhere does not hide a session the server ends now', () => {
    g.localStorage.setItem('tp:member-signed-out', `${Date.now() - 60_000} long-ago`);
    noteSignedOut(true);
    expect(takeSessionEndedNotice()).not.toBeNull();
  });
  it('the next unexpected sign-out after an expected one is still explained', () => {
    expectSignOut();
    noteSignedOut(true);
    noteSignedOut(true);
    expect(takeSessionEndedNotice()).not.toBeNull();
  });
});
