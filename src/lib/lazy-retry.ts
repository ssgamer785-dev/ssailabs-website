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

/** React.lazy that survives a brief network drop while a screen's code loads. */
export function lazyWithRetry<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(() => importWithRetry(factory));
}
