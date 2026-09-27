/** Temporary, local-only refresh-audio trace. No account, URL or media data. */
export type RefreshAudioDiagnostic = { at: number; event: string; detail?: string };

const ENABLE_KEY = 'tp:refresh-audio-diagnostics';
/**
 * The trace itself. A silent refresh is only diagnosable next to the audible
 * ones before it, and a reload (or iOS reloading the tab) must not erase that.
 */
const LOG_KEY = 'tp:refresh-audio-diagnostics:log';
const EVENT_NAME = 'tp:refresh-audio-diagnostic';
/** ~18 events per refresh: room for ~30 refreshes, so the audible→silent transition survives. */
const MAX_EVENTS = 600;
let events: readonly RefreshAudioDiagnostic[] = [];
let restored = false;
let persistTimer: ReturnType<typeof setTimeout> | undefined;

export function refreshAudioDiagnosticsEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const choice = new URLSearchParams(window.location.search).get('audioDebug');
    if (choice === '1') sessionStorage.setItem(ENABLE_KEY, '1');
    if (choice === '0') sessionStorage.removeItem(ENABLE_KEY);
    return sessionStorage.getItem(ENABLE_KEY) === '1';
  } catch { return false; }
}

/** Epoch-based, so times from before a reload line up with the ones after it. */
function now(): number {
  return typeof performance.timeOrigin === 'number' ? performance.timeOrigin + performance.now() : Date.now();
}

function restore(): void {
  if (restored) return;
  restored = true;
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(LOG_KEY) ?? '[]');
    if (!Array.isArray(saved)) return;
    const valid = saved.filter((item): item is RefreshAudioDiagnostic =>
      typeof item?.at === 'number' && typeof item?.event === 'string');
    if (valid.length) events = [...valid, { at: now(), event: 'log-restored', detail: `${valid.length} events from before this page load` }].slice(-MAX_EVENTS);
  } catch { /* A corrupt or blocked store starts a fresh trace. */ }
}

function persistNow(): void {
  if (persistTimer !== undefined) clearTimeout(persistTimer);
  persistTimer = undefined;
  try { sessionStorage.setItem(LOG_KEY, JSON.stringify(events)); } catch { /* Keep the in-memory trace. */ }
}

// Never serialise inside the touch-end task that is starting the sound; once
// the page is hiding there is no later task to rely on, so write through.
function persistSoon(event: string): void {
  if (event === 'pagehide' || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) {
    persistNow();
    return;
  }
  if (persistTimer === undefined) persistTimer = setTimeout(persistNow, 400);
}

if (refreshAudioDiagnosticsEnabled()) restore();

/** Leaves diagnostic mode. The stored trace is kept (Clear wipes it), so a stray tap cannot lose it. */
export function stopRefreshAudioDiagnostics(): void {
  persistNow();
  try { sessionStorage.removeItem(ENABLE_KEY); } catch { /* Storage can be disabled. */ }
  const address = new URL(window.location.href);
  address.searchParams.delete('audioDebug');
  window.history.replaceState(window.history.state, '', address);
  window.dispatchEvent(new Event(EVENT_NAME));
}

/** Start a clean run without leaving diagnostic mode. */
export function clearRefreshAudioDiagnostics(): void {
  events = [];
  persistNow();
  window.dispatchEvent(new Event(EVENT_NAME));
}

/** The number the next `refresh-fire` gets; continues across reloads with the stored trace. */
export function nextRefreshNumber(trace: readonly RefreshAudioDiagnostic[]): number {
  for (let i = trace.length - 1; i >= 0; i--) {
    const match = trace[i].event === 'refresh-fire' ? /^#(\d+)/.exec(trace[i].detail ?? '') : null;
    if (match) return Number(match[1]) + 1;
  }
  return 1;
}

export function traceRefreshAudio(event: string, detail?: string): void {
  if (!refreshAudioDiagnosticsEnabled()) return;
  restore();
  if (event === 'refresh-fire') detail = `#${nextRefreshNumber(events)}${detail ? ` ${detail}` : ''}`;
  events = [...events, { at: now(), event, detail }].slice(-MAX_EVENTS);
  persistSoon(event);
  window.dispatchEvent(new Event(EVENT_NAME));
}

/**
 * Whether this task holds a user activation. A context created per gesture
 * needs one to leave "suspended" on iOS, so the refresh trace records it.
 */
export function userActivationSnapshot(): string {
  if (typeof navigator === 'undefined') return 'n/a';
  const activation = (navigator as Navigator & { userActivation?: { isActive: boolean; hasBeenActive: boolean } }).userActivation;
  if (!activation) return 'n/a';
  if (activation.isActive) return 'active';
  return activation.hasBeenActive ? 'expired' : 'none';
}

/** One line of counts so the pasted log shows where audible turned silent. */
export function summarizeRefreshAudioDiagnostics(trace: readonly RefreshAudioDiagnostic[]): string {
  const count = (test: (item: RefreshAudioDiagnostic) => boolean) => trace.filter(test).length;
  let refresh = 0;
  let firstSilentAfter: number | null = null;
  let lastHeardAfter: number | null = null;
  for (const item of trace) {
    const match = item.event === 'refresh-fire' ? /^#(\d+)/.exec(item.detail ?? '') : null;
    if (match) refresh = Number(match[1]);
    if (item.event === 'heard: yes') lastHeardAfter = refresh;
    if (item.event === 'heard: silent' && firstSilentAfter === null) firstSilentAfter = refresh;
  }
  return [
    `refreshes ${count(item => item.event === 'refresh-fire')}`,
    `heard yes/silent/delayed ${count(item => item.event === 'heard: yes')}/${count(item => item.event === 'heard: silent')}/${count(item => item.event === 'heard: delayed')}`,
    `last heard after #${lastHeardAfter ?? '-'}, first silent after #${firstSilentAfter ?? '-'}`,
    `ctx created/closed ${count(item => item.event === 'ctx-created')}/${count(item => item.event === 'ctx-statechange' && / closed/.test(item.detail ?? ''))}`,
    `interrupted ${count(item => item.event.endsWith('statechange') && /\binterrupted\b/.test(item.detail ?? ''))}`,
    `deadline ${count(item => item.event === 'start-deadline')}`,
    `stalled ${count(item => / STALLED/.test(item.detail ?? ''))}`,
    `watchdog ${count(item => item.event === 'source-watchdog')}`,
  ].join(' · ');
}

export function getRefreshAudioDiagnostics(): readonly RefreshAudioDiagnostic[] {
  return events;
}

export function subscribeRefreshAudioDiagnostics(listener: () => void): () => void {
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}
