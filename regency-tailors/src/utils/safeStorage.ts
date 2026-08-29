/**
 * Fault-tolerant localStorage access for the Regency Tailor showroom database.
 *
 * The whole application persists to localStorage. Before this module, a single
 * corrupted key, a non-array payload, or a full storage quota threw during React
 * render/commit and left the showroom staring at a blank white screen with no way
 * back. Every read and write now fails soft and reports the problem instead.
 */

export type StorageFailure = {
  key: string;
  reason: 'read' | 'write';
  message: string;
};

type Listener = (failure: StorageFailure) => void;

const listeners = new Set<Listener>();

/** Subscribe to read/write failures so the UI can warn the user. */
export function onStorageFailure(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function report(failure: StorageFailure) {
  console.error(`[RegencyStorage] ${failure.reason} failed for "${failure.key}": ${failure.message}`);
  listeners.forEach(l => {
    try {
      l(failure);
    } catch {
      // a broken listener must never take the app down
    }
  });
}

function rawGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch (err: any) {
    report({ key, reason: 'read', message: err?.message || 'localStorage unavailable' });
    return null;
  }
}

/**
 * Reads a JSON array from storage. Returns `fallback` when the key is missing,
 * unparsable, or holds something that is not an array — the corrupt value is
 * preserved under a `__corrupt` key so nothing is silently destroyed.
 */
export function readArray<T>(key: string, fallback: T[]): T[] {
  const raw = rawGet(key);
  if (raw === null || raw === '') return fallback;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: any) {
    quarantine(key, raw);
    report({ key, reason: 'read', message: `corrupt JSON — ${err?.message || 'parse error'}` });
    return fallback;
  }

  if (!Array.isArray(parsed)) {
    quarantine(key, raw);
    report({ key, reason: 'read', message: 'expected a list but found ' + typeof parsed });
    return fallback;
  }

  return parsed as T[];
}

/**
 * Reads a JSON object from storage, falling back when missing or unusable.
 */
export function readObject<T extends object>(key: string, fallback: T): T {
  const raw = rawGet(key);
  if (raw === null || raw === '') return fallback;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      quarantine(key, raw);
      report({ key, reason: 'read', message: 'expected an object' });
      return fallback;
    }
    return { ...fallback, ...(parsed as T) };
  } catch (err: any) {
    quarantine(key, raw);
    report({ key, reason: 'read', message: `corrupt JSON — ${err?.message || 'parse error'}` });
    return fallback;
  }
}

/** Moves an unreadable value aside so support can recover it later. */
function quarantine(key: string, raw: string) {
  try {
    localStorage.setItem(`${key}__corrupt`, raw);
  } catch {
    // storage may be full or unavailable; losing the quarantine copy is acceptable
  }
}

/** Writes JSON, returning false (and notifying listeners) instead of throwing. */
export function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err: any) {
    const isQuota =
      err?.name === 'QuotaExceededError' ||
      err?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      err?.code === 22;
    report({
      key,
      reason: 'write',
      message: isQuota
        ? 'browser storage is full — recent changes could not be saved'
        : err?.message || 'localStorage unavailable'
    });
    return false;
  }
}

export function readRaw(key: string): string | null {
  return rawGet(key);
}

export function writeRaw(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err: any) {
    report({ key, reason: 'write', message: err?.message || 'localStorage unavailable' });
    return false;
  }
}
