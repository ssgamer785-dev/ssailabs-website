/**
 * Where the signed-in session is kept: on this device (remembered) or in this
 * tab only (not), as the member chose at sign-in.
 */
import { rememberSession } from './remember-session';

/** Only what browser storage refused to hold (private mode, storage switched off): this page's last resort. */
const memory = new Map<string, string>();

/** This app's own hints that are rebuilt on their own (signed media addresses, sizes): dropped first when storage is full. */
const REBUILDABLE = ['tp:media-urls:', 'tp:media-sizes:', 'tp:media-copies:'];

function write(store: Storage, other: Storage, key: string, value: string): boolean {
  try {
    store.setItem(key, value);
    try { other.removeItem(key); } catch { /* the copy elsewhere is simply older */ }
    return true;
  } catch {
    return false;
  }
}

function dropRebuildable(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && REBUILDABLE.some(prefix => k.startsWith(prefix))) localStorage.removeItem(k);
    }
  } catch { /* nothing more to free */ }
}

/**
 * Where the session is kept: this device (remembered) or this tab (not), as
 * the member chose. A write never silently lands in memory only — that would
 * sign the member out at the next reload: when storage is full, this app's
 * rebuildable hints make room first, and a remembered session that still does
 * not fit is at least kept for this tab.
 */
export const authStorage = {
  getItem(key: string): string | null {
    try {
      const stored = sessionStorage.getItem(key) ?? localStorage.getItem(key);
      if (stored !== null) return stored;
    } catch { /* storage unavailable: memory below */ }
    return memory.get(key) ?? null;
  },
  setItem(key: string, value: string): void {
    memory.delete(key);
    let local: Storage, session: Storage;
    try { local = localStorage; session = sessionStorage; } catch { memory.set(key, value); return; }
    const [store, other] = rememberSession() ? [local, session] : [session, local];
    if (write(store, other, key, value)) return;
    dropRebuildable();
    if (write(store, other, key, value)) return;
    if (store === local && write(session, local, key, value)) return;
    console.warn('[auth] browser storage refused the session; it is kept for this page only');
    memory.set(key, value);
  },
  removeItem(key: string): void {
    memory.delete(key);
    try { sessionStorage.removeItem(key); } catch { /* private mode */ }
    try { localStorage.removeItem(key); } catch { /* private mode */ }
  },
};
