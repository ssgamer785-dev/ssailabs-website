/**
 * What a person is told when something fails. Raw library text ("TypeError:
 * Failed to fetch", PostgREST policy errors) used to reach the screen (TP-026).
 * The raw error is still logged by the caller.
 */
export const OFFLINE_MESSAGE = "You're offline. Check your connection and try again.";
export const TIMEOUT_MESSAGE = 'This is taking too long. Check your connection and try again.';

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export function isNetworkError(error: unknown): boolean {
  const e = error as { message?: string; name?: string; code?: string } | null;
  const text = `${e?.name ?? ''} ${e?.message ?? String(error ?? '')} ${e?.code ?? ''}`;
  // "Load failed" is all Safari says about a fetch that got no answer; \b keeps
  // our own "Upload failed …" sentences from being read as a lost connection.
  return /failed to fetch|networkerror|network request failed|\bload failed\b|fetch_error|err_internet|err_network|the network connection was lost/i.test(text);
}

/** An error whose message was written for people; shown as it is. */
export class ReadableError extends Error {
  constructor(message: string) { super(message); this.name = 'ReadableError'; }
}

/**
 * Sentences our own database guards raise (see 20260928090000) are written
 * for people and pass through; anything that reads like internals does not.
 */
function isReadableRefusal(error: unknown): string | null {
  const e = error as { message?: string; code?: string } | null;
  const message = e?.message?.trim();
  if (!message || !e?.code || !['42501', '22023', '23505', 'P0001'].includes(e.code)) return null;
  if (/row-level security|violates|relation|column|syntax|constraint|duplicate key|function|permission denied/i.test(message)) return null;
  return message;
}

export function friendlyError(error: unknown, fallback: string): string {
  if (error && (error as { name?: string }).name === 'TimeoutError') return TIMEOUT_MESSAGE;
  if (error instanceof ReadableError) return error.message;
  if (isNetworkError(error) || isOffline()) return OFFLINE_MESSAGE;
  return isReadableRefusal(error) ?? fallback;
}

export class TimeoutError extends Error {
  constructor() { super('timed out'); this.name = 'TimeoutError'; }
}

/** Rejects with a TimeoutError if `promise` has not settled within `ms`. */
export function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError()), ms);
    Promise.resolve(promise).then(v => { clearTimeout(timer); resolve(v); }, e => { clearTimeout(timer); reject(e); });
  });
}
