/** Temporary, local-only refresh-audio trace. No account, URL or media data. */
export type RefreshAudioDiagnostic = { at: number; event: string; detail?: string };

const ENABLE_KEY = 'tp:refresh-audio-diagnostics';
const EVENT_NAME = 'tp:refresh-audio-diagnostic';
const MAX_EVENTS = 80;
let events: readonly RefreshAudioDiagnostic[] = [];

export function refreshAudioDiagnosticsEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const choice = new URLSearchParams(window.location.search).get('audioDebug');
    if (choice === '1') sessionStorage.setItem(ENABLE_KEY, '1');
    if (choice === '0') sessionStorage.removeItem(ENABLE_KEY);
    return sessionStorage.getItem(ENABLE_KEY) === '1';
  } catch { return false; }
}

export function stopRefreshAudioDiagnostics(): void {
  try { sessionStorage.removeItem(ENABLE_KEY); } catch { /* Storage can be disabled. */ }
  const address = new URL(window.location.href);
  address.searchParams.delete('audioDebug');
  window.history.replaceState(window.history.state, '', address);
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function traceRefreshAudio(event: string, detail?: string): void {
  if (!refreshAudioDiagnosticsEnabled()) return;
  events = [...events, { at: performance.now(), event, detail }].slice(-MAX_EVENTS);
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function getRefreshAudioDiagnostics(): readonly RefreshAudioDiagnostic[] {
  return events;
}

export function subscribeRefreshAudioDiagnostics(listener: () => void): () => void {
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}
