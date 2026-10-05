/**
 * How fast pictures appear, measured on the device itself.
 *
 * For every screen opened it records, from the tap that opened it:
 *   B — the screen's text on screen,
 *   C — the first picture on screen,
 *   D — the signing requests made meanwhile (and the keys they signed),
 *   E — where pictures came from: already in memory, kept on this device,
 *       an address already signed, or the network.
 * Device diagnostics prints it, so a run on the real Preview can be read back
 * instead of guessed. Counts and timings only: no keys, addresses or names.
 */
export type MediaSource = 'memory' | 'device' | 'url' | 'network';

export interface ScreenVisit {
  screen: string;
  /** performance.now() of the tap (or of the navigation when there was no tap). */
  tapAt: number;
  textMs: number | null;
  mediaMs: number | null;
  signRequests: number;
  signedKeys: number;
  sources: Record<MediaSource, number>;
}

const MAX_VISITS = 12;
/** A visit stops collecting this long after its tap. */
const VISIT_WINDOW_MS = 20_000;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const emptySources = (): Record<MediaSource, number> => ({ memory: 0, device: 0, url: 0, network: 0 });

const visits: ScreenVisit[] = [];
let lastTap = -Infinity;
const totals = {
  signRequests: 0,
  batchRequests: 0,
  signedKeys: 0,
  sources: emptySources(),
  prefetched: 0,
  prefetchedBytes: 0,
  /** Pictures drawn from their display copy, or (no copy yet) from the full original. */
  copies: { copy: 0, original: 0 },
  deviceCache: 'unknown' as 'unknown' | 'on' | 'unavailable' | 'blocked',
};

function current(): ScreenVisit | null {
  const visit = visits[visits.length - 1];
  return visit && now() - visit.tapAt < VISIT_WINDOW_MS ? visit : null;
}

/** A tap anywhere: the start of whatever screen it opens. */
export function noteTap(at = now()): void { lastTap = at; }

/** A screen (or a tab of one) was opened. */
export function noteScreen(screen: string): void {
  const at = now();
  const tapAt = at - lastTap < 1500 ? lastTap : at;
  visits.push({ screen, tapAt, textMs: null, mediaMs: null, signRequests: 0, signedKeys: 0, sources: emptySources() });
  while (visits.length > MAX_VISITS) visits.shift();
}

/** The open screen's own text is on screen. */
export function noteText(): void {
  const visit = current();
  if (visit && visit.textMs == null) visit.textMs = Math.round(now() - visit.tapAt);
}

/** A picture became visible on the open screen. */
export function noteMediaShown(): void {
  const visit = current();
  if (visit && visit.mediaMs == null) visit.mediaMs = Math.round(now() - visit.tapAt);
}

export function noteSigning(keys: number, batched: boolean): void {
  totals.signRequests += 1;
  if (batched) totals.batchRequests += 1;
  totals.signedKeys += keys;
  const visit = current();
  if (visit) { visit.signRequests += 1; visit.signedKeys += keys; }
}

export function noteSource(source: MediaSource): void {
  totals.sources[source] += 1;
  const visit = current();
  if (visit) visit.sources[source] += 1;
}

export function notePrefetched(bytes: number): void {
  totals.prefetched += 1;
  totals.prefetchedBytes += bytes;
}

export function noteDeviceCache(state: typeof totals.deviceCache): void { totals.deviceCache = state; }

export function noteCopy(kind: 'copy' | 'original'): void { totals.copies[kind] += 1; }

export function mediaStats() {
  return { ...totals, sources: { ...totals.sources }, copies: { ...totals.copies }, visits: visits.map(v => ({ ...v, sources: { ...v.sources } })) };
}

export function resetMediaStats(): void {
  visits.length = 0;
  Object.assign(totals, { signRequests: 0, batchRequests: 0, signedKeys: 0, sources: emptySources(), prefetched: 0, prefetchedBytes: 0, copies: { copy: 0, original: 0 } });
}

const ms = (value: number | null) => (value == null ? '—' : `${value} ms`);

/** The lines Device diagnostics prints. */
export function mediaLogLines(): string[] {
  const s = totals.sources;
  return [
    `media: device cache ${totals.deviceCache} · prepared ${totals.prefetched} (${Math.round(totals.prefetchedBytes / 1024)} KB) · signing ${totals.signRequests} request(s) for ${totals.signedKeys} key(s) (${totals.batchRequests} batched) · shown from memory ${s.memory} / device ${s.device} / signed address ${s.url} / network ${s.network} · display copies ${totals.copies.copy} / full originals ${totals.copies.original}`,
    ...visits.map(v => `media ${v.screen}: text ${ms(v.textMs)} · first picture ${ms(v.mediaMs)} · signing ${v.signRequests} (${v.signedKeys} keys) · memory ${v.sources.memory} / device ${v.sources.device} / address ${v.sources.url} / network ${v.sources.network}`),
  ];
}

// Read by the automated timing runs and by anyone checking on a device.
if (typeof window !== 'undefined') {
  (window as unknown as { __tpMedia?: unknown }).__tpMedia = { stats: mediaStats, resetStats: resetMediaStats, log: mediaLogLines };
}
