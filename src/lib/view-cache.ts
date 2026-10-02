/**
 * The last copy of what a screen showed, so coming back to it renders at once
 * and refreshes quietly behind (stale-while-revalidate), and data warmed in the
 * background after sign-in is there on the first visit.
 *
 * Memory only (nothing written to disk), keyed by account so one person never
 * sees another's copy in the same tab, bounded so it cannot grow without end,
 * and emptied on sign-out. Freshness is never assumed: every screen still
 * re-reads on open; this only decides what is on screen while it does.
 */
const MAX_ENTRIES = 40;
const store = new Map<string, { value: unknown; at: number }>();
const pending = new Map<string, Promise<unknown>>();

export function readView<T>(key: string): T | undefined {
  const hit = store.get(key);
  if (!hit) return undefined;
  // Most recently used last, so the oldest is what gets dropped.
  store.delete(key);
  store.set(key, hit);
  return hit.value as T;
}

export function writeView<T>(key: string, value: T, now = Date.now()): void {
  store.delete(key);
  store.set(key, { value, at: now });
  while (store.size > MAX_ENTRIES) store.delete(store.keys().next().value as string);
}

/** Fetches once (concurrent callers share the request) and keeps the answer. */
export function warmView<T>(key: string, load: () => Promise<T>): Promise<T> {
  const inFlight = pending.get(key);
  if (inFlight) return inFlight as Promise<T>;
  const request = load().then(value => { writeView(key, value); return value; })
    .finally(() => { pending.delete(key); });
  pending.set(key, request);
  return request;
}

export function clearViews(): void {
  store.clear();
  pending.clear();
}

export function viewCacheSize(): number {
  return store.size;
}
