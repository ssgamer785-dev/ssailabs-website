import { generateKeyPairSync } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

mock.module('../supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: session ? { access_token: 'token-1' } : null } }) } },
}));
let session = true;

const { PushSetupError, decodeApplicationServerKey, pushAvailability, pushErrorMessage, pushHealthMessage, subscribePush } = await import('./push');

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
/** A real P-256 public key in the base64url form /api/push/public-key returns. */
const PUBLIC_KEY = (() => {
  const jwk = generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  return Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]).toString('base64url');
})();

type FakeSubscription = { options: { applicationServerKey: ArrayBuffer | null }; unsubscribed: boolean; unsubscribe: () => Promise<boolean>; toJSON: () => object };
const saved = globalThis as Record<string, unknown>;
const originals = { window: saved.window, navigator: saved.navigator, Notification: saved.Notification, fetch: saved.fetch };
let calls: string[];

/** An installed iPhone Home Screen app, with switches for each failure stage. */
function installApp(options: {
  permission?: NotificationPermission;
  activeWorker?: 'now' | 'after-ready' | 'never';
  existing?: FakeSubscription | null;
  subscribeError?: string;
  publicKeyStatus?: number;
  saveStatuses?: number[];
}) {
  calls = [];
  const subscriptions: FakeSubscription[] = [];
  const makeSubscription = (key: ArrayBuffer | null): FakeSubscription => {
    const sub: FakeSubscription = {
      options: { applicationServerKey: key }, unsubscribed: false,
      unsubscribe: async () => { sub.unsubscribed = true; calls.push('unsubscribe'); return true; },
      toJSON: () => ({ endpoint: 'https://web.push.apple.com/device', keys: { p256dh: 'p'.repeat(87), auth: 'a'.repeat(22) } }),
    };
    subscriptions.push(sub);
    return sub;
  };
  const pushManager = {
    getSubscription: async () => options.existing ?? null,
    subscribe: async ({ applicationServerKey }: { applicationServerKey: Uint8Array }) => {
      calls.push('subscribe');
      if (!registration.active) throw Object.assign(new Error('Subscribing for push requires an active service worker'), { name: 'InvalidStateError' });
      if (options.subscribeError) throw Object.assign(new Error('rejected'), { name: options.subscribeError });
      return makeSubscription(applicationServerKey.buffer as ArrayBuffer);
    },
  };
  const registration = { active: options.activeWorker === 'now' || !options.activeWorker ? {} : null, installing: {}, waiting: null, pushManager };
  const ready = options.activeWorker === 'never'
    ? new Promise(() => {})
    : Promise.resolve().then(() => { registration.active = {}; return registration; });
  saved.window = { isSecureContext: true, matchMedia: () => ({ matches: true }), PushManager: {}, Notification: {} };
  saved.navigator = {
    userAgent: IPHONE, platform: 'iPhone', maxTouchPoints: 5, standalone: true,
    serviceWorker: { register: async () => { calls.push('register'); return registration; }, ready },
  };
  saved.Notification = { permission: options.permission ?? 'granted', requestPermission: async () => 'granted' };
  const saveStatuses = [...(options.saveStatuses ?? [200])];
  saved.fetch = async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    if (url === '/api/push/public-key') {
      const status = options.publicKeyStatus ?? 200;
      return new Response(JSON.stringify(status === 200 ? { publicKey: PUBLIC_KEY } : { error: 'Push notifications are not configured.' }), { status });
    }
    return new Response('{}', { status: saveStatuses.shift() ?? 200 });
  };
  return { subscriptions, makeSubscription };
}

beforeEach(() => { session = true; });
afterEach(() => { Object.assign(saved, originals); });

describe('push setup stages', () => {
  it('waits for the service worker to become active instead of failing subscribe() with InvalidStateError', async () => {
    installApp({ activeWorker: 'after-ready' });
    await subscribePush();
    expect(calls).toEqual(['register', 'GET /api/push/public-key', 'subscribe', 'POST /api/push/subscribe']);
  });

  it('reports a service worker that never activates as the service-worker stage', async () => {
    installApp({ activeWorker: 'never' });
    const original = globalThis.setTimeout;
    globalThis.setTimeout = ((fn: () => void) => original(fn, 0)) as typeof setTimeout;   // skip the 10 s wait
    try {
      await expect(subscribePush()).rejects.toMatchObject({ stage: 'service-worker', code: 'not-active' });
    } finally { globalThis.setTimeout = original; }
  });

  it('replaces a subscription made with a different server key instead of storing a dead one', async () => {
    const app = installApp({});
    const stale = app.makeSubscription(new Uint8Array(65).fill(9).buffer);
    installApp({ existing: stale });
    await subscribePush();
    expect(stale.unsubscribed).toBe(true);
    expect(calls).toContain('subscribe');
  });

  it('reuses a valid existing subscription without subscribing again', async () => {
    const app = installApp({});
    const current = app.makeSubscription(decodeApplicationServerKey(PUBLIC_KEY).buffer as ArrayBuffer);
    installApp({ existing: current });
    await subscribePush();
    expect(calls).not.toContain('subscribe');
    expect(calls).toContain('POST /api/push/subscribe');
  });

  it('names an unconfigured server (503 from /api/push/public-key)', async () => {
    installApp({ publicKeyStatus: 503 });
    const error = await subscribePush().catch(e => e);
    expect(error).toBeInstanceOf(PushSetupError);
    expect(error.reference).toBe('public-key:503');
    expect(pushErrorMessage(error)).toContain('not configured on the server');
  });

  it('separates a rejected subscribe() from a blocked permission', async () => {
    installApp({ subscribeError: 'AbortError' });
    expect((await subscribePush().catch(e => e)).reference).toBe('subscribe:AbortError');
    installApp({ subscribeError: 'NotAllowedError' });
    expect((await subscribePush().catch(e => e)).stage).toBe('permission-denied');
  });

  it('retries a failed save once, then reports "allowed but not registered"', async () => {
    installApp({ saveStatuses: [503, 200] });
    await subscribePush();
    expect(calls.filter(call => call === 'POST /api/push/subscribe')).toHaveLength(2);

    installApp({ saveStatuses: [500, 500] });
    const error = await subscribePush().catch(e => e);
    expect(error.reference).toBe('save:500');
    expect(pushErrorMessage(error)).toContain('allowed, but this device could not be registered');
  });

  it('reports an expired session as the session stage', async () => {
    installApp({ saveStatuses: [401] });
    expect((await subscribePush().catch(e => e)).stage).toBe('session');
    installApp({});
    session = false;
    expect((await subscribePush().catch(e => e)).stage).toBe('session');
  });

  it('never subscribes without granted permission', async () => {
    installApp({ permission: 'denied' });
    expect((await subscribePush().catch(e => e)).stage).toBe('permission-denied');
    expect(calls).toEqual([]);
  });
});

describe('where push can work at all', () => {
  it('an iPhone browser tab (no PushManager/Notification) gets install guidance, not an attempt', async () => {
    installApp({});
    saved.window = { isSecureContext: true, matchMedia: () => ({ matches: false }) };
    saved.Notification = undefined;
    (saved.navigator as Record<string, unknown>).standalone = false;
    expect(pushAvailability()).toBe('install-required');
    const error = await subscribePush().catch(e => e);
    expect(error.stage).toBe('install-required');
    expect(pushErrorMessage(error)).toContain('Add to Home Screen');
    expect(calls).toEqual([]);
  });

  it('the installed iPhone app is supported; denied permission points at iPhone Settings', () => {
    installApp({});
    expect(pushAvailability()).toBe('supported');
    expect(pushErrorMessage(new PushSetupError('permission-denied', '', ''))).toContain('iPhone Settings');
  });

  it('validates the server key before handing it to subscribe()', () => {
    expect(decodeApplicationServerKey(PUBLIC_KEY)).toHaveLength(65);
    expect(() => decodeApplicationServerKey('not a key')).toThrow(PushSetupError);
    expect(() => decodeApplicationServerKey(Buffer.alloc(64, 4).toString('base64url') + 'AAAAAAAAAAAAAAAAAAAA')).toThrow(/P-256|malformed/);
  });
});

describe('admin delivery check wording', () => {
  const base = { devices: 3, recentNotifications: 5, recentDispatched: 0 };
  it('names the webhook when nothing recent was dispatched', () => {
    expect(pushHealthMessage({ ...base, verdict: 'webhook-not-delivering' })).toContain('webhook');
  });
  it('reports how many were sent when delivery works', () => {
    expect(pushHealthMessage({ ...base, recentDispatched: 5, verdict: 'delivering' })).toContain('5 of the last 5');
  });
  it('explains how to produce something to check', () => {
    expect(pushHealthMessage({ ...base, recentNotifications: 0, verdict: 'no-recent-notifications' })).toContain('wait a minute');
  });
});
