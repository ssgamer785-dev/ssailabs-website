/**
 * Pictures ready before they are needed, for community posts and chat alike.
 *
 * Three layers, fastest first:
 *  1. This page's memory: pictures already shown or prepared (fetched and
 *     decoded), and signed addresses that are still valid.
 *  2. This device (community pictures and video posters only): the picture
 *     itself, kept by its storage key in a bounded Cache Storage of this
 *     account, so a reopened app shows it without signing or downloading
 *     anything. Reading a picture into it needs the storage bucket to let this
 *     site read it (its CORS rule); where it does not — a Preview address — the
 *     layer turns itself off and the next one does the work.
 *  3. The network: signed addresses fetched in batches (one request for a
 *     screen of pictures), then the picture.
 *
 * Private chat media never reaches layer 2: it is kept in this page's memory
 * only. Signed addresses are kept on the device only for community media, only
 * while they are valid, and only where the session itself is remembered.
 * Everything is per account, and all of it is emptied on sign-out.
 */
import { supabase } from '../supabase';
import { rememberSession } from '../remember-session';
import { authorizedFetch, fetchSignedUrl, mediaErrorFor } from './fetchSignedUrl';
import { noteDeviceCache, notePrefetched, noteSigning, noteSource, type MediaSource } from './media-metrics';

export type MediaScope = 'post' | 'chat';

const API: Record<MediaScope, string> = { post: '/api/posts', chat: '/api/chat' };
/** The server's own limit for one batch. */
const BATCH_MAX = 40;
/** Requests made in the same moment (one screen's pictures) go out as one. */
const BATCH_WINDOW_MS = 8;
/** An address is re-signed a minute before it lapses, so nothing is shown with one about to expire. */
const EXPIRY_MARGIN_MS = 60_000;

const URLS_PREFIX = 'tp:media-urls:v1:';
const SIZES_PREFIX = 'tp:media-sizes:v1:';
const INDEX_PREFIX = 'tp:media-index:v1:';
const CORS_KEY = 'tp:media-cors:v2';
const CACHE_PREFIX = 'tp-media-v1-';
const MAX_PERSISTED_URLS = 150;
const MAX_SIZES = 300;
const MAX_SHOWN = 160;
const MAX_DECODED = 40;
const MAX_OBJECT_URLS = 120;
/** Pictures kept on the device per account: the newest-used first, never older than a week. */
export const DEVICE_LIMITS = { entries: 80, bytes: 50 * 1024 * 1024, ageMs: 7 * 24 * 60 * 60 * 1000, itemBytes: 8 * 1024 * 1024 };
/** After the bucket refuses this site, the device layer stays off for this long before trying again. */
const CORS_RETRY_MS = 6 * 60 * 60 * 1000;
/** How long a "the bucket lets this site read pictures" answer is trusted: as long as the pictures it allowed are kept. */
const CORS_OK_MS = 7 * 24 * 60 * 60 * 1000;
/** After a screen opens, start-up preparation waits this long before its next download, so the screen has the link. */
const SCREEN_QUIET_MS = 1500;

interface Signed { url: string; expiresAt: number }
interface Shown { src: string; decoded: boolean; expiresAt: number }

let account: string | null = null;
const signed = new Map<string, Signed>();
const signing = new Map<string, Promise<string>>();
const shown = new Map<string, Shown>();
const decodedImages = new Map<string, HTMLImageElement>();
const objectUrls = new Map<string, string>();
let persistedUrls = new Map<string, Signed>();
let sizes = new Map<string, [number, number]>();

const id = (scope: MediaScope, key: string) => `${scope}|${key}`;
const fresh = <T extends { expiresAt: number }>(entry: T | undefined): T | null => (entry && entry.expiresAt > Date.now() ? entry : null);

function touch<V>(map: Map<string, V>, key: string, value: V, max: number, onEvict?: (key: string, value: V) => boolean): void {
  map.delete(key);
  map.set(key, value);
  if (map.size <= max) return;
  for (const [oldKey, oldValue] of map) {
    if (map.size <= max) break;
    if (onEvict && !onEvict(oldKey, oldValue)) continue;
    map.delete(oldKey);
  }
}

// ---- storage on this device --------------------------------------------------

/** Where per-account hints live: next to the session, as the "remember me" choice put it. */
function hintStore(): Storage | null {
  try { return rememberSession() ? window.localStorage : window.sessionStorage; } catch { return null; }
}
function allStores(): Storage[] {
  const out: Storage[] = [];
  try { out.push(window.localStorage); } catch { /* unavailable */ }
  try { out.push(window.sessionStorage); } catch { /* unavailable */ }
  return out;
}
function readJson<T>(key: string): T | null {
  for (const store of allStores()) {
    try { const raw = store.getItem(key); if (raw) return JSON.parse(raw) as T; } catch { /* a bad entry is ignored */ }
  }
  return null;
}
function writeJson(key: string, value: unknown): void {
  const target = hintStore();
  for (const store of allStores()) {
    try { if (store !== target) store.removeItem(key); } catch { /* ignore */ }
  }
  try { target?.setItem(key, JSON.stringify(value)); } catch { /* full or blocked: memory still works */ }
}
function removeMatching(prefix: string, keep?: string): void {
  for (const store of allStores()) {
    try {
      const doomed: string[] = [];
      for (let i = 0; i < store.length; i++) { const k = store.key(i); if (k && k.startsWith(prefix) && k !== keep) doomed.push(k); }
      for (const k of doomed) store.removeItem(k);
    } catch { /* ignore */ }
  }
}

function loadUrls(userId: string): Map<string, Signed> {
  const raw = readJson<Record<string, [string, number]>>(URLS_PREFIX + userId) ?? {};
  const now = Date.now();
  return new Map(Object.entries(raw).filter(([, v]) => Array.isArray(v) && typeof v[0] === 'string' && v[1] > now)
    .map(([k, v]) => [k, { url: v[0], expiresAt: v[1] }]));
}
let urlsTimer: ReturnType<typeof setTimeout> | null = null;
function saveUrlsSoon(): void {
  if (urlsTimer || !account) return;
  const forAccount = account;
  urlsTimer = setTimeout(() => {
    urlsTimer = null;
    if (account !== forAccount) return;
    const now = Date.now();
    const live = [...persistedUrls].filter(([, v]) => v.expiresAt > now).sort((a, b) => b[1].expiresAt - a[1].expiresAt).slice(0, MAX_PERSISTED_URLS);
    writeJson(URLS_PREFIX + forAccount, Object.fromEntries(live.map(([k, v]) => [k, [v.url, v.expiresAt]])));
  }, 400);
}

function loadSizes(userId: string): Map<string, [number, number]> {
  const raw = readJson<Record<string, [number, number]>>(SIZES_PREFIX + userId) ?? {};
  return new Map(Object.entries(raw).filter(([, v]) => Array.isArray(v) && v[0] > 0 && v[1] > 0));
}
let sizesTimer: ReturnType<typeof setTimeout> | null = null;
function saveSizesSoon(): void {
  if (sizesTimer || !account) return;
  const forAccount = account;
  sizesTimer = setTimeout(() => {
    sizesTimer = null;
    if (account === forAccount) writeJson(SIZES_PREFIX + forAccount, Object.fromEntries([...sizes].slice(-MAX_SIZES)));
  }, 600);
}

// ---- the device layer (Cache Storage, community pictures only) -------------

interface DeviceEntry { at: number; used: number; size: number }
interface Device { name: string; tag: string; index: Map<string, DeviceEntry> }
let device: Promise<Device | null> = Promise.resolve(null);
/**
 * Whether the bucket lets this site read pictures (its CORS rule), learned by
 * background preparation and remembered per site. A screen never waits on it:
 * until it is known, a screen loads its pictures directly.
 */
let cors: 'unknown' | 'ok' | 'blocked' = 'unknown';
const corsRule = () => cors;
let quietUntil = 0;
const hashes = new Map<string, string>();

function deviceSupported(): boolean {
  try {
    return typeof caches !== 'undefined' && typeof crypto !== 'undefined' && !!crypto.subtle && window.isSecureContext === true;
  } catch { return false; }
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
async function hashOf(key: string): Promise<string> {
  let hash = hashes.get(key);
  if (!hash) { hash = await sha256(key); hashes.set(key, hash); }
  return hash;
}
const entryUrl = (hash: string) => `${location.origin}/__tp-media/${hash}`;

function knownCors(): 'unknown' | 'ok' | 'blocked' {
  const state = readJsonLocal<{ state: 'ok' | 'blocked'; at: number; origin: string }>(CORS_KEY);
  if (!state || typeof location === 'undefined' || state.origin !== location.origin) return 'unknown';
  const age = Date.now() - state.at;
  return (state.state === 'ok' && age < CORS_OK_MS) || (state.state === 'blocked' && age < CORS_RETRY_MS) ? state.state : 'unknown';
}
function readJsonLocal<T>(key: string): T | null {
  try { const raw = window.localStorage.getItem(key); return raw ? JSON.parse(raw) as T : null; } catch { return null; }
}
function learnCors(state: 'ok' | 'blocked'): void {
  if (cors === state) return;
  cors = state;
  noteDeviceCache(state === 'ok' ? 'on' : 'blocked');
  try { window.localStorage.setItem(CORS_KEY, JSON.stringify({ state, at: Date.now(), origin: location.origin })); } catch { /* ignore */ }
}

/** A screen just opened: start-up preparation holds its next downloads for a moment, so the screen has the link. */
export function screenOpened(): void { quietUntil = Date.now() + SCREEN_QUIET_MS; }

/** The longest a screen's other pictures wait for its top one to arrive (it usually takes well under a second). */
const URGENT_WAIT_MS = 8_000;
const URGENT_WAIT_SLOW_MS = 20_000;
const urgentWait = () => (slowLink() ? URGENT_WAIT_SLOW_MS : URGENT_WAIT_MS);
let urgentLoads = 0;
let urgentWaiters: (() => void)[] = [];

/**
 * The top picture of a screen is loading: until it has arrived, the screen's
 * other pictures wait for it (pictures already prepared never wait), so it is
 * not sharing the link with them. Returns the call that says it has arrived
 * (or gave up).
 */
export function urgentLoadStarted(): () => void {
  urgentLoads += 1;
  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    clearTimeout(timer);
    urgentLoads = Math.max(0, urgentLoads - 1);
    if (!urgentLoads) { const waiting = urgentWaiters; urgentWaiters = []; for (const go of waiting) go(); }
  };
  const timer = setTimeout(end, urgentWait());
  return end;
}

function afterUrgentLoads(): Promise<void> {
  if (!urgentLoads) return Promise.resolve();
  return new Promise(resolve => { urgentWaiters.push(resolve); setTimeout(resolve, urgentWait()); });
}

/** A screen's next picture never waits longer than this behind one that stalls. */
const TURN_WAIT_MS = 15_000;
let screenTurn: Promise<unknown> = Promise.resolve();

/**
 * On a slow link a screen's pictures arrive one by one, in the order it asked
 * for them: sharing the link, every one of them would arrive late. On a link
 * that is not slow they load together.
 */
function inTurn<T>(work: () => Promise<T>): Promise<T> {
  if (!slowLink()) return work();
  const previous = Promise.race([screenTurn, new Promise(resolve => setTimeout(resolve, TURN_WAIT_MS))]);
  const mine = previous.then(work, work);
  screenTurn = mine.catch(() => undefined);
  return mine;
}

/** Opens this account's picture store and drops any other account's. Off where the session is not remembered. */
async function openDevice(userId: string): Promise<Device | null> {
  if (!deviceSupported() || !rememberSession()) {
    noteDeviceCache('unavailable');
    await dropDeviceStores().catch(() => {});
    return null;
  }
  try {
    const tag = (await sha256(`tp-media:${userId}`)).slice(0, 24);
    const name = CACHE_PREFIX + tag;
    // One account's pictures never sit beside another's: whoever signed in before is gone from this device.
    for (const other of await caches.keys()) if (other.startsWith(CACHE_PREFIX) && other !== name) await caches.delete(other);
    removeMatching(INDEX_PREFIX, INDEX_PREFIX + tag);
    const raw = readJsonLocal<Record<string, [number, number, number]>>(INDEX_PREFIX + tag) ?? {};
    const index = new Map(Object.entries(raw).map(([h, v]) => [h, { at: v[0], used: v[1], size: v[2] }]));
    cors = knownCors();
    noteDeviceCache(cors === 'ok' ? 'on' : cors === 'blocked' ? 'blocked' : 'unknown');
    const opened = { name, tag, index };
    void prune(opened);
    return opened;
  } catch {
    noteDeviceCache('unavailable');
    return null;
  }
}

let indexTimer: ReturnType<typeof setTimeout> | null = null;
function saveIndexSoon(d: Device): void {
  if (indexTimer) return;
  indexTimer = setTimeout(() => {
    indexTimer = null;
    try { window.localStorage.setItem(INDEX_PREFIX + d.tag, JSON.stringify(Object.fromEntries([...d.index].map(([h, e]) => [h, [e.at, e.used, e.size]])))); }
    catch { /* the cache still works; it is pruned from scratch next time */ }
  }, 500);
}

/** Keeps the store within its limits: drops the oldest pictures, then the least recently used. */
async function prune(d: Device): Promise<void> {
  const now = Date.now();
  const doomed = new Set<string>();
  for (const [h, e] of d.index) if (now - e.at > DEVICE_LIMITS.ageMs) doomed.add(h);
  const live = [...d.index].filter(([h]) => !doomed.has(h)).sort((a, b) => b[1].used - a[1].used);
  let bytes = 0;
  live.forEach(([h, e], i) => { bytes += e.size; if (i >= DEVICE_LIMITS.entries || bytes > DEVICE_LIMITS.bytes) doomed.add(h); });
  if (!doomed.size) return;
  const cache = await caches.open(d.name);
  for (const h of doomed) { d.index.delete(h); await cache.delete(entryUrl(h)); }
  saveIndexSoon(d);
}

async function deviceGet(key: string): Promise<Blob | null> {
  // Nothing is ever kept unless the bucket let this site read it: no need to open the store to find out.
  if (cors !== 'ok') return null;
  const d = await device;
  if (!d) return null;
  const h = await hashOf(key);
  const entry = d.index.get(h);
  if (!entry) return null;
  const cache = await caches.open(d.name);
  if (Date.now() - entry.at > DEVICE_LIMITS.ageMs) { d.index.delete(h); await cache.delete(entryUrl(h)); saveIndexSoon(d); return null; }
  const hit = await cache.match(entryUrl(h));
  if (!hit) { d.index.delete(h); saveIndexSoon(d); return null; }
  entry.used = Date.now();
  saveIndexSoon(d);
  return hit.blob();
}

async function devicePut(d: Device, key: string, blob: Blob): Promise<void> {
  if (blob.size > DEVICE_LIMITS.itemBytes) return;
  const h = await hashOf(key);
  const cache = await caches.open(d.name);
  await cache.put(entryUrl(h), new Response(blob, { headers: { 'Content-Type': blob.type || 'application/octet-stream' } }));
  const now = Date.now();
  d.index.set(h, { at: now, used: now, size: blob.size });
  saveIndexSoon(d);
  await prune(d);
}

async function deviceForget(key: string): Promise<void> {
  const d = await device;
  if (!d) return;
  const h = await hashOf(key);
  d.index.delete(h);
  saveIndexSoon(d);
  await (await caches.open(d.name)).delete(entryUrl(h));
}

async function dropDeviceStores(): Promise<void> {
  removeMatching(INDEX_PREFIX);
  if (typeof caches === 'undefined') return;
  for (const name of await caches.keys()) if (name.startsWith(CACHE_PREFIX)) await caches.delete(name);
}

const deviceFetches = new Map<string, Promise<Blob | null>>();

/**
 * One download per picture, however many screens and warm-ups ask for it at
 * the same moment. Background preparation asks at low priority, so a screen
 * the member is actually looking at gets the link first.
 */
function fetchForDevice(key: string, url: string, background = false): Promise<Blob | null> {
  const pending = deviceFetches.get(key);
  if (pending) return pending;
  const work = readIntoDevice(key, url, background).finally(() => deviceFetches.delete(key));
  deviceFetches.set(key, work);
  return work;
}

/**
 * While one download is finding out whether the bucket lets this site read
 * pictures, the others wait for its answer — which comes with its first
 * bytes, one round trip — instead of each asking again.
 */
let corsAnswer: Promise<void> | null = null;

/** The page is being reloaded or closed: downloads cut off now say nothing about the bucket. */
let leavingPage = false;
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('pagehide', () => { leavingPage = true; });
  window.addEventListener('pageshow', () => { leavingPage = false; });
}

/** Whether storage answers at all (an answer this page cannot read still counts): tells a refusal from a lost connection. */
async function storageReachable(url: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  try {
    await fetch(url, { method: 'HEAD', mode: 'no-cors', credentials: 'omit', cache: 'no-store' });
    return true;
  } catch {
    return false;
  }
}

/** The picture itself, read with CORS so it can be kept; null (and the layer off) where the bucket refuses this site. */
async function readIntoDevice(key: string, url: string, background: boolean): Promise<Blob | null> {
  // The store of the account that asked: a download that finishes after a sign-out or a switch is dropped.
  const forAccount = account;
  const d = await device;
  if (cors === 'blocked' || !d) return null;
  let answered = null as (() => void) | null;
  if (cors === 'unknown' && !corsAnswer) corsAnswer = new Promise<void>(resolve => { answered = resolve; });
  let response: Response | null = null;
  const started = Date.now();
  try {
    response = await fetch(url, { mode: 'cors', credentials: 'omit', ...(background ? { priority: 'low' } : {}) } as RequestInit);
    // Any answer this page can read means the rule lets this site read pictures.
    learnCors('ok');
  } catch {
    // A refusal by the bucket's CORS rule looks exactly like a lost connection, or a download cut off because the
    // page is being reloaded or closed. Only a refusal turns the layer off: the bucket is asked once more, without
    // reading the answer — if that gets through, the connection is fine and it was the rule.
    if (!leavingPage && await storageReachable(url) && !leavingPage) learnCors('blocked');
  } finally {
    if (answered) { corsAnswer = null; answered(); }
  }
  if (!response?.ok) return null;
  const blob = await response.blob();
  noteTransfer(blob.size, Date.now() - started);
  if (!/^image\//i.test(blob.type) || account !== forAccount) return null;
  await devicePut(d, key, blob).catch(() => {});
  return blob;
}

// ---- account -------------------------------------------------------------------

function revokeAll(): void {
  for (const url of objectUrls.values()) { try { URL.revokeObjectURL(url); } catch { /* ignore */ } }
  objectUrls.clear();
}
function rejectQueued(): void {
  for (const scope of ['post', 'chat'] as MediaScope[]) {
    const timer = timers[scope];
    if (timer) clearTimeout(timer);
    timers[scope] = null;
    for (const waiters of queues[scope].values()) for (const w of waiters) w.reject(new Error('Your session has ended. Please sign in again.'));
    queues[scope].clear();
  }
}
function resetMemory(): void {
  rejectQueued();
  deviceFetches.clear();
  decoding.clear();
  signed.clear();
  signing.clear();
  shown.clear();
  decodedImages.clear();
  revokeAll();
}

/** Called whenever the signed-in account is known (or gone). Another account's memory never carries over. */
export function setMediaAccount(userId: string | null): void {
  if (userId === account) return;
  resetMemory();
  account = userId;
  persistedUrls = userId ? loadUrls(userId) : new Map();
  sizes = userId ? loadSizes(userId) : new Map();
  if (userId) removeMatching(URLS_PREFIX, URLS_PREFIX + userId);
  if (userId) removeMatching(SIZES_PREFIX, SIZES_PREFIX + userId);
  cors = userId ? knownCors() : 'unknown';
  device = userId ? openDevice(userId) : Promise.resolve(null);
}

/** Sign-out: every picture, address and hint this app kept for any account on this device is removed. */
export async function clearMediaCaches(): Promise<void> {
  resetMemory();
  account = null;
  persistedUrls = new Map();
  sizes = new Map();
  device = Promise.resolve(null);
  removeMatching(URLS_PREFIX);
  removeMatching(SIZES_PREFIX);
  await dropDeviceStores().catch(() => {});
}

async function sessionUser(): Promise<string> {
  // The auth context keeps the account current; asking the auth client again only waits behind its lock.
  if (account) return account;
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new Error('Your session has ended. Please sign in again.');
  if (userId !== account) setMediaAccount(userId);
  return userId;
}

// ---- signed addresses -----------------------------------------------------------

type Waiter = { resolve: (signedUrl: Signed) => void; reject: (error: Error) => void };
const queues: Record<MediaScope, Map<string, Waiter[]>> = { post: new Map(), chat: new Map() };
const timers: Record<MediaScope, ReturnType<typeof setTimeout> | null> = { post: null, chat: null };
const batchRoute: Record<MediaScope, boolean> = { post: true, chat: true };

function queueSignature(scope: MediaScope, key: string): Promise<Signed> {
  return new Promise((resolve, reject) => {
    const queue = queues[scope];
    const waiters = queue.get(key);
    if (waiters) waiters.push({ resolve, reject }); else queue.set(key, [{ resolve, reject }]);
    if (queue.size >= BATCH_MAX) void flush(scope);
    else if (!timers[scope]) timers[scope] = setTimeout(() => void flush(scope), BATCH_WINDOW_MS);
  });
}

class BatchRouteMissing extends Error {}

async function signBatch(scope: MediaScope, keys: string[]): Promise<Map<string, Signed | Error>> {
  const response = await authorizedFetch(`${API[scope]}/media-urls`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keys }),
  });
  if (response.status === 404 || response.status === 405) throw new BatchRouteMissing();
  if (!response.ok) throw new Error(mediaErrorFor(response.status));
  noteSigning(keys.length, true);
  const body = await response.json() as { urls?: Record<string, { url: string; expiresIn: number }>; failed?: Record<string, number> };
  const issued = Date.now();
  return new Map(keys.map(key => {
    const hit = body.urls?.[key];
    return [key, hit ? { url: hit.url, expiresAt: issued + hit.expiresIn * 1000 - EXPIRY_MARGIN_MS } : new Error(mediaErrorFor(body.failed?.[key] ?? 404))];
  }));
}

async function signOne(scope: MediaScope, key: string): Promise<Signed> {
  const issued = Date.now();
  const { url, expiresIn } = await fetchSignedUrl(`${API[scope]}/media-url?key=${encodeURIComponent(key)}`);
  noteSigning(1, false);
  return { url, expiresAt: issued + expiresIn * 1000 - EXPIRY_MARGIN_MS };
}

async function flush(scope: MediaScope): Promise<void> {
  const timer = timers[scope];
  if (timer) clearTimeout(timer);
  timers[scope] = null;
  const queue = queues[scope];
  if (!queue.size) return;
  const batch = [...queue.entries()].slice(0, BATCH_MAX);
  for (const [key] of batch) queue.delete(key);
  if (queue.size) timers[scope] = setTimeout(() => void flush(scope), 0);
  const settle = (key: string, result: Signed | Error) => {
    for (const waiter of batch.find(([k]) => k === key)?.[1] ?? []) {
      if (result instanceof Error) waiter.reject(result); else waiter.resolve(result);
    }
  };
  if (batchRoute[scope]) {
    try {
      const results = await signBatch(scope, batch.map(([key]) => key));
      for (const [key, result] of results) settle(key, result);
      return;
    } catch (error) {
      if (!(error instanceof BatchRouteMissing)) {
        for (const [key] of batch) settle(key, error instanceof Error ? error : new Error('Could not load attachment. Please retry.'));
        return;
      }
      // An API without the batch route: sign one by one, as before.
      batchRoute[scope] = false;
    }
  }
  await Promise.all(batch.map(async ([key]) => {
    try { settle(key, await signOne(scope, key)); } catch (error) { settle(key, error instanceof Error ? error : new Error('Could not load attachment.')); }
  }));
}

function knownSigned(scope: MediaScope, key: string): Signed | null {
  const hit = fresh(signed.get(id(scope, key)));
  if (hit) return hit;
  if (scope !== 'post') return null;
  const kept = fresh(persistedUrls.get(key));
  if (kept) signed.set(id(scope, key), kept);
  return kept;
}

function rememberSigned(scope: MediaScope, key: string, value: Signed): void {
  touch(signed, id(scope, key), value, 400);
  if (scope === 'post') { persistedUrls.set(key, value); saveUrlsSoon(); }
}

/**
 * A signed address for one object: from memory when still valid, otherwise
 * signed together with every other request made in the same moment. `force`
 * always asks for a fresh one (a download, or a retry after a failed load).
 */
export async function signedUrl(scope: MediaScope, key: string, force = false): Promise<string> {
  await sessionUser();
  const entry = id(scope, key);
  if (force) {
    signed.delete(entry);
    if (scope === 'post' && persistedUrls.delete(key)) saveUrlsSoon();
  } else {
    const hit = knownSigned(scope, key);
    if (hit) return hit.url;
  }
  const pending = signing.get(entry);
  if (pending && !force) return pending;
  if (pending) await pending.catch(() => {});
  const forAccount = account;
  const work = queueSignature(scope, key).then(result => {
    if (account === forAccount) rememberSigned(scope, key, result);
    return result.url;
  });
  signing.set(entry, work);
  try { return await work; } finally { if (signing.get(entry) === work) signing.delete(entry); }
}

/** A still-valid signed address already known, without asking anyone. */
export function peekSignedUrl(scope: MediaScope, key: string | null | undefined): string | null {
  if (!key || !account) return null;
  return knownSigned(scope, key)?.url ?? null;
}

// ---- what to show ----------------------------------------------------------------

function objectUrlFor(entry: string, blob: Blob): string {
  const existing = objectUrls.get(entry);
  if (existing) return existing;
  const url = URL.createObjectURL(blob);
  touch(objectUrls, entry, url, MAX_OBJECT_URLS, (oldEntry, oldUrl) => {
    // A picture still on screen keeps its address.
    try { if (document.querySelector(`img[src="${CSS.escape(oldUrl)}"],video[poster="${CSS.escape(oldUrl)}"]`)) return false; } catch { /* evict */ }
    try { URL.revokeObjectURL(oldUrl); } catch { /* ignore */ }
    if (shown.get(oldEntry)?.src === oldUrl) shown.delete(oldEntry);
    return true;
  });
  return url;
}

export interface MediaPeek {
  src: string;
  /** Already fetched and decoded: it can be drawn in the first frame. */
  ready: boolean;
}

/** What can be shown right now, without waiting: a prepared picture, or at least a valid address to start loading. */
export function peekMedia(scope: MediaScope, key: string | null | undefined): MediaPeek | null {
  if (!key || !account) return null;
  const entry = id(scope, key);
  const ready = shown.get(entry);
  if (ready && ready.expiresAt > Date.now()) { touch(shown, entry, ready, MAX_SHOWN); return { src: ready.src, ready: ready.decoded }; }
  // Being fetched right now (ahead of this screen, or for another one): the screen joins that download, never starts a second.
  if (decoding.has(entry) || (scope === 'post' && deviceFetches.has(key))) return null;
  // Where community pictures are kept on this device, one not yet prepared is read from there in a moment —
  // never fetched again through an address (the browser's own cache cannot serve it: storage answers vary by origin).
  if (scope === 'post' && cors === 'ok') return null;
  const url = knownSigned(scope, key)?.url;
  return url ? { src: url, ready: false } : null;
}

/** A picture finished loading on screen: the next screen that shows it draws it at once. */
export function markShown(scope: MediaScope, key: string, src: string): void {
  if (!account) return;
  const isObject = src.startsWith('blob:');
  // Only object addresses this cache owns (an upload's local preview, or one already revoked, never counts).
  if (isObject && objectUrls.get(id(scope, key)) !== src) return;
  const expiresAt = isObject ? Infinity : (knownSigned(scope, key)?.expiresAt ?? Date.now() + 5 * 60_000);
  touch(shown, id(scope, key), { src, decoded: true, expiresAt }, MAX_SHOWN);
}

/** A kept picture that would not load: forget it everywhere, so the next attempt fetches it afresh. */
export function forgetMedia(scope: MediaScope, key: string): void {
  const entry = id(scope, key);
  shown.delete(entry);
  decodedImages.delete(entry);
  const url = objectUrls.get(entry);
  if (url) { objectUrls.delete(entry); try { URL.revokeObjectURL(url); } catch { /* ignore */ } }
  if (scope === 'post') void deviceForget(key).catch(() => {});
}

/**
 * Waits for a download of this picture already under way — started ahead of
 * the screen, or by another screen showing the same picture — and returns
 * what to draw once it has arrived. Null when there is none, or it failed.
 */
async function joinInFlight(scope: MediaScope, key: string, forAccount: string): Promise<string | null> {
  const entry = id(scope, key);
  const pending = decoding.get(entry);
  if (pending && await pending.done) return pending.src;
  const download = scope === 'post' ? deviceFetches.get(key) : undefined;
  if (!download) return null;
  const blob = await download.catch(() => null);
  return blob && account === forAccount ? objectUrlFor(entry, blob) : null;
}

/**
 * Where to load a picture from, best first: already prepared in memory; kept
 * on this device (community only); already on its way (joined, never fetched
 * twice); otherwise the network, through a batched signature — read into the
 * device store when the bucket allows this site, or fetched and decoded here
 * so it is drawn whole. `fresh` skips every kept copy (a retry after a failed load).
 */
export async function displaySource(scope: MediaScope, key: string, options: { fresh?: boolean; urgent?: boolean; bytes?: number | null } = {}): Promise<{ src: string; source: MediaSource }> {
  const forAccount = await sessionUser();
  const entry = id(scope, key);
  const sameAccount = () => { if (account !== forAccount) throw new Error('Your session has ended. Please sign in again.'); };
  const joined = async (source: MediaSource) => {
    const pending = decoding.get(entry);
    if (pending && !pending.bytes && options.bytes) pending.bytes = options.bytes;
    const src = await joinInFlight(scope, key, forAccount);
    sameAccount();
    if (!src) return null;
    noteSource(source);
    return { src, source };
  };
  if (!options.fresh) {
    const ready = shown.get(entry);
    if (ready && ready.expiresAt > Date.now()) { noteSource('memory'); return { src: ready.src, source: 'memory' }; }
    if (scope === 'post') {
      const blob = await deviceGet(key).catch(() => null);
      sameAccount();
      if (blob) { noteSource('device'); return { src: objectUrlFor(entry, blob), source: 'device' }; }
    }
    const early = await joined('url');
    if (early) return early;
  } else {
    forgetMedia(scope, key);
  }
  const source: MediaSource = !options.fresh && knownSigned(scope, key) ? 'url' : 'network';
  const url = await signedUrl(scope, key, options.fresh === true);
  sameAccount();
  // Signed together with the rest of the screen; loaded after the screen's top picture.
  if (!options.urgent) { await afterUrgentLoads(); sameAccount(); }
  // Started elsewhere while this one was being signed: still one download.
  if (!options.fresh) { const late = await joined(source); if (late) return late; }
  // The screen's top picture goes at once; on a slow link the others follow it one by one.
  const turn = <T>(work: () => Promise<T>) => (options.urgent ? work() : inTurn(work));
  // Kept on the device as it is fetched — only once the bucket is known to allow it; a screen never waits to find out.
  if (scope === 'post' && cors === 'ok') {
    const blob = await turn(() => fetchForDevice(key, url).catch(() => null));
    sameAccount();
    if (blob) { noteSource(source); return { src: objectUrlFor(entry, blob), source }; }
  }
  // Fetched and decoded here, then drawn whole; anything else asking for it meanwhile shares this one download.
  await turn(() => decodeInto(scope, key, url, knownSigned(scope, key)?.expiresAt ?? Date.now() + 5 * 60_000, options.urgent ? 'high' : 'auto', options.bytes));
  sameAccount();
  noteSource(source);
  return { src: url, source };
}

// ---- picture sizes ---------------------------------------------------------------

/** A picture's own size as seen on this device before: lets its space be reserved even without the RC5 columns. */
export function mediaSize(key: string | null | undefined): { width: number; height: number } | null {
  const hit = key ? sizes.get(key) : undefined;
  return hit ? { width: hit[0], height: hit[1] } : null;
}

export function rememberMediaSize(key: string, width: number, height: number): void {
  if (!account || !(width > 0 && height > 0)) return;
  const known = sizes.get(key);
  if (known && known[0] === width && known[1] === height) return;
  touch(sizes, key, [Math.round(width), Math.round(height)], MAX_SIZES);
  saveSizesSoon();
}

// ---- preparing ahead ---------------------------------------------------------------

export interface PrefetchItem {
  scope: MediaScope;
  key: string;
  /** Size from the row, when known: counts against the budget before anything is fetched. */
  bytes?: number | null;
}

export interface PrefetchPlan {
  /** False on Save-Data or a 2G link: addresses are prepared, pictures are not downloaded. */
  fetchBytes: boolean;
  budgetBytes: number;
  /** Downloads at a time once the link has shown it is not slow (the first one always has the link to itself). */
  concurrency: number;
  /** Start-up preparation: hold the next download while a screen the member just opened is loading. */
  yieldToScreens?: boolean;
  /** Download only the first N pictures (the rest are signed only): a screen being opened loads its own, in order. */
  fetchFirst?: number;
  /** The first N pictures — every screen's top one — are prepared even past the budget. */
  alwaysFirst?: number;
}

/** What the link allows: never the whole history, and nothing heavy where the member asked to save data. */
export function prefetchPlan(): PrefetchPlan {
  const connection = typeof navigator === 'undefined' ? undefined
    : (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string; downlink?: number } }).connection;
  if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType ?? '')) return { fetchBytes: false, budgetBytes: 0, concurrency: 1 };
  if (connection?.effectiveType === '3g') return { fetchBytes: true, budgetBytes: SLOW_BUDGET, concurrency: 2 };
  // (navigator.connection.downlink is deliberately not used: browsers report a low guess before they have
  // measured anything, which would starve preparation exactly at start-up. Preparation measures the link
  // with its own first download instead — which also works where the browser reports nothing, like Safari.)
  return { fetchBytes: true, budgetBytes: 16 * 1024 * 1024, concurrency: 2 };
}

const ESTIMATE_BYTES = 700 * 1024;
/** What a slow link (or 3G) gets: every screen's top picture, then this much more. */
const SLOW_BUDGET = 5 * 1024 * 1024;
/** Below this, as preparation's own downloads measured it (bytes per ms: about 3 Mbit/s), the link is slow. */
const SLOW_LINK = (400 * 1024) / 1000;
/** The link's speed as preparation's own downloads found it; null until one has finished. */
let linkRate: number | null = null;
const slowLink = () => linkRate !== null && linkRate < SLOW_LINK;

function noteTransfer(bytes: number | null, ms: number): void {
  // Too small, or too quick (a cached copy), to say anything about the link.
  if (!bytes || bytes < 64 * 1024 || ms < 20) return;
  const rate = bytes / ms;
  linkRate = linkRate === null ? rate : linkRate * 0.4 + rate * 0.6;
}

interface InFlight {
  src: string;
  done: Promise<boolean>;
  started: number;
  /** The picture's size when anyone asking for it knows it (from its row): the download then measures the link. */
  bytes: number | null;
}
/**
 * Pictures being fetched and decoded right now through their address — ahead
 * of a screen, or by one: whoever else wants the same picture waits for that
 * download (the browser does not reliably share one between an element and a
 * picture being prepared).
 */
const decoding = new Map<string, InFlight>();

/** Somebody is already fetching this picture (a screen, or other preparation): no second download is started. */
function underway(scope: MediaScope, key: string): boolean {
  return decoding.has(id(scope, key)) || (scope === 'post' && deviceFetches.has(key));
}

/** The download of this picture already under way, when there is one this module can wait for. */
function downloadUnderway(scope: MediaScope, key: string): Promise<unknown> | null {
  const pending = decoding.get(id(scope, key));
  if (pending) return pending.done;
  return (scope === 'post' ? deviceFetches.get(key) : undefined) ?? null;
}

/** Fetches and decodes one picture — once, however many ask for it at the same time. */
function decodeInto(scope: MediaScope, key: string, src: string, expiresAt: number, priority: 'low' | 'high' | 'auto', bytes?: number | null): Promise<boolean> {
  const entry = id(scope, key);
  const pending = decoding.get(entry);
  if (pending && pending.src === src) {
    if (!pending.bytes && bytes) pending.bytes = bytes;
    return pending.done;
  }
  const flight: InFlight = { src, started: Date.now(), bytes: bytes ?? null, done: Promise.resolve(false) };
  flight.done = decodeNow(scope, key, src, expiresAt, priority).catch(() => false).then(ok => {
    // A download from storage (not a local copy) of a known size: how fast the link is.
    if (ok && !src.startsWith('blob:') && flight.bytes) noteTransfer(flight.bytes, Date.now() - flight.started);
    return ok;
  }).finally(() => {
    if (decoding.get(entry) === flight) decoding.delete(entry);
  });
  if (!src.startsWith('blob:')) decoding.set(entry, flight);
  return flight.done;
}

async function decodeNow(scope: MediaScope, key: string, src: string, expiresAt: number, priority: 'low' | 'high' | 'auto'): Promise<boolean> {
  const forAccount = account;
  const img = new Image();
  img.decoding = 'async';
  // Preparation never competes with the screen in front of the member; that screen's top picture goes first.
  if (priority !== 'auto') (img as HTMLImageElement & { fetchPriority?: string }).fetchPriority = priority;
  img.src = src;
  try { await img.decode(); } catch { return false; }
  if (account !== forAccount) return false;
  if (img.naturalWidth > 0) rememberMediaSize(key, img.naturalWidth, img.naturalHeight);
  touch(shown, id(scope, key), { src, decoded: true, expiresAt }, MAX_SHOWN);
  // Holding the element keeps the decoded picture in memory, so the screen draws it in its first frame.
  touch(decodedImages, id(scope, key), img, MAX_DECODED);
  return true;
}

/**
 * Prepares pictures before their screen opens, in the order given: kept ones
 * from this device first (no network at all), then one signing request per
 * scope for the rest, then the pictures themselves — fetched and decoded
 * within the plan's budget. The first download has the link to itself and
 * measures it: on a link that is not slow the rest go a few at a time, on a
 * slow one they go one by one and stop at a 3G budget (every screen's top
 * picture still prepared). Nothing already on its way is fetched again.
 */
export async function prefetchMedia(items: PrefetchItem[], plan: PrefetchPlan, signal?: AbortSignal): Promise<void> {
  let forAccount: string;
  try { forAccount = await sessionUser(); } catch { return; }
  const stopped = () => signal?.aborted || account !== forAccount;
  const seen = new Set<string>();
  const list = items.filter(item => {
    const entry = id(item.scope, item.key);
    if (!item.key || seen.has(entry)) return false;
    seen.add(entry);
    return !fresh(shown.get(entry));
  });
  if (!list.length) return;

  const fromDevice = await Promise.all(list.map(async item => {
    if (item.scope !== 'post') return false;
    const blob = await deviceGet(item.key).catch(() => null);
    if (!blob || stopped()) return false;
    return decodeInto(item.scope, item.key, objectUrlFor(id(item.scope, item.key), blob), Infinity, 'low');
  }));
  const rest = list.filter((_, i) => !fromDevice[i]);
  if (!rest.length || stopped()) return;

  const urls = await Promise.all(rest.map(item => signedUrl(item.scope, item.key).catch(() => null)));
  if (!plan.fetchBytes || stopped()) return;

  const store = await device;
  const always = Math.max(1, plan.alwaysFirst ?? 1);
  let spent = 0;
  let next = 0;
  let widened = false;

  const prepare = async (item: PrefetchItem, url: string): Promise<void> => {
    let src = url;
    let expiresAt = knownSigned(item.scope, item.key)?.expiresAt ?? Date.now() + 5 * 60_000;
    let bytes = item.bytes && item.bytes > 0 ? item.bytes : null;
    // Community pictures go into this device's store where the bucket allows this site. Until that is known, the
    // first one fetched finds out (the answer comes with its first bytes) and the others wait for that round trip.
    if (item.scope === 'post' && store && cors !== 'blocked') {
      if (cors === 'unknown' && corsAnswer) await corsAnswer;
      if (stopped()) return;
      // (Read again: the answer may have just arrived.)
      if (corsRule() !== 'blocked') {
        const blob = await fetchForDevice(item.key, url, true).catch(() => null);
        if (stopped()) return;
        if (blob) { src = objectUrlFor(id(item.scope, item.key), blob); expiresAt = Infinity; bytes = blob.size; }
      }
    }
    // (A copy read into this device was measured as it arrived; a download through its address is measured here.)
    if (await decodeInto(item.scope, item.key, src, expiresAt, 'low', src === url ? bytes : null)) notePrefetched(bytes ?? ESTIMATE_BYTES);
  };

  await new Promise<void>(finished => {
    let running = 0;
    const spawn = () => {
      running += 1;
      void work().catch(() => {}).finally(() => { running -= 1; if (!running) finished(); });
    };
    // After the first download: a link that is not slow takes the rest a few at a time.
    const widen = () => {
      if (widened) return;
      widened = true;
      if (!slowLink()) for (let i = 1; i < plan.concurrency; i++) spawn();
    };
    const work = async () => {
      while (next < rest.length && !stopped()) {
        const index = next++;
        const item = rest[index];
        const url = urls[index];
        if (!url || fresh(shown.get(id(item.scope, item.key)))) continue;
        if (plan.fetchFirst !== undefined && index >= plan.fetchFirst) { next = rest.length; return; }
        // Already on its way (a screen showing it, or another preparation): never a second download of it. Before
        // the link is measured, that download is the one running: wait for it rather than start another beside it.
        if (underway(item.scope, item.key)) {
          // (Its size is known here: when that download arrives, it tells how fast the link is.)
          const pending = decoding.get(id(item.scope, item.key));
          if (pending && !pending.bytes && item.bytes) pending.bytes = item.bytes;
          const ahead = widened ? null : downloadUnderway(item.scope, item.key);
          if (ahead) await ahead.catch(() => {});
          continue;
        }
        const estimate = item.bytes && item.bytes > 0 ? item.bytes : ESTIMATE_BYTES;
        const budget = slowLink() ? Math.min(plan.budgetBytes, SLOW_BUDGET) : plan.budgetBytes;
        if (index >= always && spent + estimate > budget) { next = rest.length; return; }
        spent += estimate;
        while (plan.yieldToScreens && Date.now() < quietUntil && !stopped()) await new Promise(r => setTimeout(r, 120));
        if (stopped()) return;
        if (underway(item.scope, item.key) || fresh(shown.get(id(item.scope, item.key)))) continue;
        await prepare(item, url);
        widen();
      }
    };
    // A link already measured and not slow starts a few at a time; otherwise the first download goes alone.
    const initial = linkRate !== null && !slowLink() ? Math.max(1, plan.concurrency) : 1;
    widened = initial > 1;
    for (let i = 0; i < initial; i++) spawn();
  });
}

/** For tests: what preparation has measured about the link (bytes per ms), or null for nothing yet. */
export function setLinkRateForTests(rate: number | null): void { linkRate = rate; }

/** For tests: the state a fresh page starts with. */
export function resetMediaCacheForTests(): void {
  resetMemory();
  account = null;
  persistedUrls = new Map();
  sizes = new Map();
  device = Promise.resolve(null);
  cors = 'unknown';
  corsAnswer = null;
  linkRate = null;
  screenTurn = Promise.resolve();
  quietUntil = 0;
  batchRoute.post = true;
  batchRoute.chat = true;
}
