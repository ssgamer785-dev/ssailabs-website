import { lazy, type ComponentType } from 'react';

/**
 * True for the errors browsers raise when a code chunk could not be fetched:
 * a dropped connection, or a tab still running a build whose chunks a newer
 * deployment has replaced. Everything else is a real bug and is not retried.
 */
export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? '');
  return /dynamically imported module|importing a module script failed|error loading dynamically imported module|unable to preload css|chunkloaderror|failed to fetch/i.test(message);
}

type Wait = (attempt: number) => Promise<void>;

const waitForRetry: Wait = attempt => new Promise(resolve => setTimeout(resolve, 400 * (attempt + 1)));
const browserOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/**
 * Retries a brief blip with a short back-off. When the device is known to be
 * offline it gives up at once instead: the screen's error boundary then says
 * so plainly and reopens the screen when the connection returns, which beats
 * a spinner that silently waits.
 */
export async function importWithRetry<T>(
  factory: () => Promise<T>,
  attempts = 3,
  wait: Wait = waitForRetry,
  offline: () => boolean = browserOffline,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await factory();
    } catch (error) {
      lastError = error;
      if (!isChunkLoadError(error) || attempt === attempts - 1 || offline()) break;
      await wait(attempt);
    }
  }
  throw lastError;
}

export type PreloadableComponent<T extends ComponentType<any>> = ReturnType<typeof lazy<T>> & {
  /** Starts fetching the screen's code now; safe to call any number of times. */
  preload: () => Promise<unknown>;
};

/**
 * React.lazy that survives a brief network drop while a screen's code loads,
 * and can be fetched ahead of time. The import is shared: a screen preloaded
 * while the member is still on Home renders at once when they open it, instead
 * of waiting for its chunk.
 */
export function lazyWithRetry<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>): PreloadableComponent<T> {
  let pending: Promise<{ default: T }> | null = null;
  const load = () => {
    if (!pending) {
      pending = importWithRetry(factory);
      // A failed fetch must not be remembered: the next attempt tries the network again.
      pending.catch(() => { pending = null; });
    }
    return pending;
  };
  const component = lazy(load) as PreloadableComponent<T>;
  component.preload = () => load().catch(() => undefined);
  return component;
}
