import { supabase } from '../supabase';

/**
 * Where enabling push notifications stopped. Each stage fails for different
 * reasons and needs a different fix, so the UI and diagnostics report it
 * instead of one generic "could not be enabled".
 */
export type PushStage =
  | 'unsupported'        // no service worker / PushManager / Notification here
  | 'install-required'   // iPhone or iPad browser tab: web push needs the Home Screen app
  | 'insecure-context'
  | 'permission-denied'  // blocked in device or browser settings
  | 'permission-dismissed'
  | 'service-worker'     // registration or activation failed
  | 'public-key'         // /api/push/public-key unreachable or not configured
  | 'invalid-public-key' // the server's VAPID key is not a P-256 public key
  | 'subscribe'          // pushManager.subscribe() rejected
  | 'session'            // not signed in, or the session expired
  | 'save';              // the server did not store this device

export class PushSetupError extends Error {
  readonly stage: PushStage;
  /** Browser error name (e.g. InvalidStateError) or HTTP status, for the stage reference. */
  readonly code: string;
  constructor(stage: PushStage, code: string, message: string) {
    super(message);
    this.name = 'PushSetupError';
    this.stage = stage;
    this.code = code;
  }
  /** Short, non-sensitive reference a person can read back from the screen. */
  get reference(): string { return `${this.stage}${this.code ? `:${this.code}` : ''}`; }
}

type Trace = (event: string, detail?: string) => void;

export function supportsPush(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext
    && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    && typeof Notification.requestPermission === 'function';
}

/**
 * iPhone/iPad (Safari, Chrome and every other iOS browser share WebKit).
 * Only used to choose guidance AFTER capability detection has said no;
 * iPadOS reports a Mac user agent, hence the touch check.
 */
export function isAppleMobileWebKit(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isInstalledApp(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export type PushAvailability = 'supported' | 'install-required' | 'insecure' | 'unsupported';

/** Capability first; the Apple check only decides which explanation an unsupported tab gets. */
export function pushAvailability(): PushAvailability {
  if (typeof window === 'undefined') return 'unsupported';
  if (!window.isSecureContext) return 'insecure';
  if (supportsPush()) return 'supported';
  return isAppleMobileWebKit() && !isInstalledApp() ? 'install-required' : 'unsupported';
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64url.replace(/-/g, '+').replace(/_/g, '/')
    .padEnd(Math.ceil(base64url.length / 4) * 4, '='));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** An uncompressed P-256 point: 65 bytes starting 0x04 — what subscribe() requires. */
export function decodeApplicationServerKey(value: unknown): Uint8Array<ArrayBuffer> {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{80,100}$/.test(value)) {
    throw new PushSetupError('invalid-public-key', 'format', 'The server returned a malformed notification key.');
  }
  let bytes: Uint8Array<ArrayBuffer>;
  try { bytes = keyBytes(value); } catch {
    throw new PushSetupError('invalid-public-key', 'base64', 'The server returned a malformed notification key.');
  }
  if (bytes.length !== 65 || bytes[0] !== 0x04) {
    throw new PushSetupError('invalid-public-key', `len${bytes.length}`, 'The server returned a notification key that is not a P-256 public key.');
  }
  return bytes;
}

function sameKey(existing: ArrayBuffer | null | undefined, wanted: Uint8Array): boolean {
  if (!existing) return true;            // not exposed by this browser: nothing to compare
  const current = new Uint8Array(existing);
  return current.length === wanted.length && current.every((byte, i) => byte === wanted[i]);
}

async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new PushSetupError('session', 'no-session', 'Sign in again to enable notifications.');
  return token;
}

export async function registerWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !window.isSecureContext || !('serviceWorker' in navigator)) return null;
  return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

/** A registration with an ACTIVE worker: subscribe() rejects with InvalidStateError without one. */
async function activeRegistration(trace: Trace): Promise<ServiceWorkerRegistration> {
  let registration: ServiceWorkerRegistration | null;
  try { registration = await registerWorker(); }
  catch (error) {
    const name = (error as Error)?.name || 'Error';
    trace('push-stage', `service-worker register-failed ${name}`);
    throw new PushSetupError('service-worker', name, "The app's background service could not start.");
  }
  if (!registration) throw new PushSetupError('service-worker', 'none', "The app's background service is not available.");
  if (registration.active) return registration;
  trace('push-stage', `service-worker waiting-for-activation ${registration.installing ? 'installing' : registration.waiting ? 'waiting' : 'none'}`);
  const ready = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>(resolve => setTimeout(() => resolve(null), 10_000)),
  ]);
  if (!ready?.active) throw new PushSetupError('service-worker', 'not-active', "The app's background service did not finish starting.");
  return ready;
}

async function fetchPublicKey(trace: Trace): Promise<Uint8Array<ArrayBuffer>> {
  let res: Response;
  try { res = await fetch('/api/push/public-key', { cache: 'no-store' }); }
  catch { throw new PushSetupError('public-key', 'network', 'Could not reach the server.'); }
  trace('push-stage', `public-key ${res.status}`);
  if (!res.ok) {
    throw new PushSetupError('public-key', String(res.status), res.status === 503
      ? 'Notifications are not configured on this server.'
      : 'The server did not provide a notification key.');
  }
  const body = await res.json().catch(() => null) as { publicKey?: unknown } | null;
  return decodeApplicationServerKey(body?.publicKey);
}

async function saveSubscription(subscription: PushSubscription, trace: Trace): Promise<void> {
  const body = JSON.stringify(subscription.toJSON());
  for (let attempt = 1; ; attempt++) {
    const token = await accessToken();
    let res: Response;
    try {
      res = await fetch('/api/push/subscribe', {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body,
      });
    } catch {
      if (attempt < 2) continue;         // one retry for a dropped connection
      throw new PushSetupError('save', 'network', 'Could not reach the server.');
    }
    trace('push-stage', `save ${res.status}`);
    if (res.ok) return;
    if (res.status === 401) throw new PushSetupError('session', '401', 'Your session expired. Sign in again to enable notifications.');
    if (res.status >= 500 && attempt < 2) continue;
    throw new PushSetupError('save', String(res.status), 'This device could not be registered for notifications.');
  }
}

/**
 * Creates (or repairs) this device's push subscription and stores it for the
 * signed-in account. Permission must already be granted: the prompt itself has
 * to be the first await of the tap that asked for it (WebKit consumes the
 * tap's user activation in Notification.requestPermission).
 */
export async function subscribePush(trace: Trace = () => {}): Promise<void> {
  const availability = pushAvailability();
  if (availability === 'install-required') throw new PushSetupError('install-required', '', 'Install the app to enable notifications.');
  if (availability === 'insecure') throw new PushSetupError('insecure-context', '', 'Notifications need a secure (https) connection.');
  if (availability !== 'supported') throw new PushSetupError('unsupported', '', 'This browser does not support notifications.');
  if (Notification.permission === 'denied') throw new PushSetupError('permission-denied', '', 'Notifications are blocked for this app.');
  if (Notification.permission !== 'granted') throw new PushSetupError('permission-dismissed', '', 'Notification permission was not granted.');

  const registration = await activeRegistration(trace);
  const key = await fetchPublicKey(trace);

  let subscription: PushSubscription | null = null;
  try { subscription = await registration.pushManager.getSubscription(); }
  catch (error) { trace('push-stage', `get-subscription failed ${(error as Error)?.name}`); }
  if (subscription && !sameKey(subscription.options?.applicationServerKey, key)) {
    // The server's key changed: a subscription made with the old key can never
    // be delivered to, so replace it rather than store it again.
    trace('push-stage', 'subscription key mismatch: replacing');
    await subscription.unsubscribe().catch(() => false);
    subscription = null;
  }
  if (!subscription) {
    try {
      subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    } catch (error) {
      const name = (error as Error)?.name || 'Error';
      trace('push-stage', `subscribe failed ${name}: ${String((error as Error)?.message ?? '').slice(0, 120)}`);
      if (name === 'NotAllowedError') throw new PushSetupError('permission-denied', name, 'Notifications are blocked for this app.');
      throw new PushSetupError('subscribe', name, 'This device could not subscribe to notifications.');
    }
    trace('push-stage', 'subscribed');
  } else trace('push-stage', 'existing subscription reused');

  await saveSubscription(subscription, trace);
}

export async function unsubscribePush(): Promise<void> {
  if (!supportsPush()) return;
  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  try {
    const token = await accessToken().catch(() => null);
    if (token) {
      await fetch('/api/push/subscribe', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
    }
  } finally {
    // The local endpoint must stop receiving this account's private alerts
    // even if the server is temporarily unreachable during sign-out.
    await subscription.unsubscribe();
  }
}

/** Sends a test notification to the signed-in account's own devices; reports per-device results. */
export async function sendTestPush(): Promise<{ attempted: number; delivered: number; statuses: number[] }> {
  const token = await accessToken();
  const res = await fetch('/api/push/test', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json().catch(() => ({})) as { attempted?: number; delivered?: number; statuses?: number[]; error?: string };
  if (!res.ok) throw new PushSetupError('save', String(res.status), body.error || 'The test notification could not be sent.');
  return { attempted: body.attempted ?? 0, delivered: body.delivered ?? 0, statuses: body.statuses ?? [] };
}

export type PushHealth = {
  verdict: 'delivering' | 'webhook-not-delivering' | 'no-recent-notifications' | 'no-devices' | 'server-not-configured';
  devices: number; recentNotifications: number; recentDispatched: number;
};

/** Admin only: whether recent notifications actually reached the push dispatcher. */
export async function checkPushHealth(): Promise<PushHealth> {
  const token = await accessToken();
  const res = await fetch('/api/push/health', { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json().catch(() => ({})) as Partial<PushHealth> & { error?: string };
  if (!res.ok || !body.verdict) throw new Error(body.error || 'The delivery check could not run. Try again.');
  return { verdict: body.verdict, devices: body.devices ?? 0, recentNotifications: body.recentNotifications ?? 0, recentDispatched: body.recentDispatched ?? 0 };
}

/** Plain-language result of the admin delivery check. */
export function pushHealthMessage(health: PushHealth): string {
  switch (health.verdict) {
    case 'delivering':
      return `Working: ${health.recentDispatched} of the last ${health.recentNotifications} notifications for members with notifications turned on were sent to their devices.`;
    case 'webhook-not-delivering':
      return `Not working: none of the last ${health.recentNotifications} notifications were sent to devices. The Supabase database webhook that sends new notifications to /api/push/dispatch is missing or failing.`;
    case 'no-recent-notifications':
      return 'Nothing recent to check. Send a chat message to a member who has notifications turned on, wait a minute, then check again.';
    case 'no-devices':
      return 'No one has turned on notifications on a device yet.';
    default:
      return 'Push is not fully configured on the server (keys or webhook secret missing).';
  }
}

/** What a person should read for a failure: accurate, actionable, no internals. */
export function pushErrorMessage(error: unknown): string {
  const stage = error instanceof PushSetupError ? error.stage : null;
  const reference = error instanceof PushSetupError ? ` (ref: ${error.reference})` : '';
  const apple = isAppleMobileWebKit();
  switch (stage) {
    case 'install-required':
      return 'On iPhone, notifications work only in the installed app: tap Share, then "Add to Home Screen", and open The Traders Planet from your Home Screen.';
    case 'unsupported':
      return 'This browser does not support notifications. Use Chrome, Edge, Firefox or Safari, or the installed app.';
    case 'insecure-context':
      return 'Notifications need a secure (https) connection.';
    case 'permission-denied':
      return apple
        ? 'Notifications are turned off for this app. Open iPhone Settings → Notifications → The Traders Planet and turn on Allow Notifications.'
        : "Notifications are blocked for this site. Allow them in your browser's site settings, then tap Retry.";
    case 'permission-dismissed':
      return 'Notifications were not allowed. Tap Allow again when you want them.';
    case 'service-worker':
      return `The app's background service did not start. Close and reopen the app, then try again${reference}.`;
    case 'public-key':
      return error instanceof PushSetupError && error.code === '503'
        ? `Notifications are not configured on the server yet. Please contact support${reference}.`
        : `Could not reach the server. Check your connection and try again${reference}.`;
    case 'invalid-public-key':
      return `Notifications are not configured correctly on the server. Please contact support${reference}.`;
    case 'subscribe':
      return `This device could not subscribe to notifications. Close and reopen the app, then try again${reference}.`;
    case 'session':
      return 'Your session expired. Sign in again, then enable notifications.';
    case 'save':
      return `Notifications are allowed, but this device could not be registered. Tap Retry${reference}.`;
    default:
      return 'Notifications could not be enabled. Please try again.';
  }
}
