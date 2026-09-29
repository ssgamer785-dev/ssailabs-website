import { generateKeyPairSync } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

mock.module('../supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'token-1' } } }) } } }));
mock.module('../auth-context', () => ({ useAuth: () => ({ user: { id: USER }, isActivated: true }) }));
mock.module('../audio/refresh-diagnostics', () => ({ traceRefreshAudio: () => {} }));
mock.module('../useNotificationSound', () => ({ unlockNotificationAudio: () => {} }));

const USER = 'user-1';
const { ensureSubscribed, pushDisabledOnDevice, pushStatusFor, resetPushSetupForTests, validatePushRegistration } = await import('./usePushSetup');
const { pushAvailability } = await import('./push');

const PUBLIC_KEY = (() => {
  const jwk = generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  return Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]).toString('base64url');
})();
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

const saved = globalThis as Record<string, unknown>;
const originals = { window: saved.window, navigator: saved.navigator, Notification: saved.Notification, fetch: saved.fetch, localStorage: saved.localStorage };
let calls: string[];
let store: Map<string, string>;
let subscription: { endpoint: string } | null;
let serverHasDevice: boolean;
let statusResponse: 'ok' | 'error' | 'offline';
let subscribeResponse: number;
let devices: number;

function install(options: { permission?: NotificationPermission; userAgent?: string; standalone?: boolean; pushManager?: boolean; secure?: boolean } = {}) {
  calls = [];
  store = new Map();
  subscription = { endpoint: 'https://push.example.test/device-a' };
  serverHasDevice = true;
  statusResponse = 'ok';
  subscribeResponse = 200;
  devices = 1;
  let n = 0;
  const view = (current: { endpoint: string }) => ({
    endpoint: current.endpoint, options: { applicationServerKey: null },
    toJSON: () => ({ endpoint: current.endpoint, keys: { p256dh: 'p'.repeat(87), auth: 'a'.repeat(22) } }), unsubscribe: async () => true,
  });
  const pushManager = {
    getSubscription: async () => (subscription ? view(subscription) : null),
    subscribe: async () => { calls.push('subscribe'); subscription = { endpoint: `https://push.example.test/device-${++n}-new` }; return view(subscription); },
  };
  const registration = { active: {}, installing: null, waiting: null, pushManager };
  const window: Record<string, unknown> = {
    isSecureContext: options.secure !== false, matchMedia: () => ({ matches: options.standalone !== false }),
    Notification: {}, dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {},
  };
  if (options.pushManager !== false) window.PushManager = {};
  saved.window = window;
  saved.navigator = {
    userAgent: options.userAgent ?? ANDROID, platform: 'Linux', maxTouchPoints: 5, standalone: options.standalone !== false,
    serviceWorker: { register: async () => registration, ready: Promise.resolve(registration), getRegistration: async () => registration },
  };
  saved.Notification = { permission: options.permission ?? 'granted', requestPermission: async () => 'granted' };
  saved.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
  saved.fetch = async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    if (url === '/api/push/public-key') return new Response(JSON.stringify({ publicKey: PUBLIC_KEY }), { status: 200 });
    if (url === '/api/push/subscribe') return new Response('{}', { status: subscribeResponse });
    if (url === '/api/push/status') {
      if (statusResponse === 'offline') throw new TypeError('network down');
      if (statusResponse === 'error') return new Response('{}', { status: 503 });
      return new Response(JSON.stringify({ registered: serverHasDevice, devices, serverConfigured: true }), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  };
}

beforeEach(() => { resetPushSetupForTests(); install(); });
afterEach(() => { Object.assign(saved, originals); });

const registeredKey = () => `tp:push-registered:${USER}`;

describe('the status of push on this device', () => {
  it('reads what the browser and the account say, and never calls permission alone "on"', () => {
    install({ permission: 'default' });
    expect(pushStatusFor(pushAvailability(), USER)).toBe('ask');
    install({ permission: 'denied' });
    expect(pushStatusFor(pushAvailability(), USER)).toBe('denied');
    install({ permission: 'granted' });
    expect(pushStatusFor(pushAvailability(), USER)).toBe('needs-retry');      // allowed, but never stored
    store.set(registeredKey(), String(Date.now()));
    expect(pushStatusFor(pushAvailability(), USER)).toBe('on');
  });

  it('explains an iPhone browser tab, an insecure page and a browser without push', () => {
    install({ userAgent: IPHONE, standalone: false, pushManager: false });
    expect(pushStatusFor(pushAvailability(), USER)).toBe('install-required');
    install({ secure: false });
    expect(pushStatusFor(pushAvailability(), USER)).toBe('insecure');
    install({ pushManager: false });
    expect(pushStatusFor(pushAvailability(), USER)).toBe('unsupported');
  });

  it('a device the member turned off reads "off" and is not registered again', async () => {
    store.set(registeredKey(), String(Date.now()));
    store.set(`tp:push-disabled:${USER}`, '1');
    expect(pushDisabledOnDevice(USER)).toBe(true);
    expect(pushStatusFor(pushAvailability(), USER)).toBe('off');
    await validatePushRegistration(USER, true);
    expect(calls).toEqual([]);
  });
});

describe('checking the device each time the app opens', () => {
  it('stays on when the browser and the server both hold the device, and learns how many devices there are', async () => {
    store.set(registeredKey(), String(Date.now()));
    devices = 3;
    await validatePushRegistration(USER, true);
    expect(calls).toEqual(['POST /api/push/status']);
    expect(pushStatusFor(pushAvailability(), USER)).toBe('on');
  });

  it('says "expired" when the browser no longer holds a subscription', async () => {
    store.set(registeredKey(), String(Date.now()));
    subscription = null;
    await validatePushRegistration(USER, true);
    expect(pushStatusFor(pushAvailability(), USER)).toBe('expired');
    expect(store.has(registeredKey())).toBe(false);
    expect(calls).toEqual([]);            // nothing asked of the server, nothing re-subscribed without the member
  });

  it('registers again, quietly, when the server has forgotten the device', async () => {
    store.set(registeredKey(), String(Date.now()));
    serverHasDevice = false;
    await validatePushRegistration(USER, true);
    expect(calls).toContain('POST /api/push/subscribe');
    expect(pushStatusFor(pushAvailability(), USER)).toBe('on');
  });

  it('registers again when the browser rotated the endpoint', async () => {
    store.set(registeredKey(), String(Date.now()));
    store.set(`tp:push-endpoint:${USER}`, '0000000000000000');   // the endpoint remembered from before
    await validatePushRegistration(USER, true);
    expect(calls).toContain('POST /api/push/subscribe');
    expect(store.get(`tp:push-endpoint:${USER}`)).not.toBe('0000000000000000');
  });

  it('claims nothing new while the server cannot be reached', async () => {
    store.set(registeredKey(), String(Date.now()));
    statusResponse = 'offline';
    await validatePushRegistration(USER, true);
    statusResponse = 'error';
    await validatePushRegistration(USER, true);
    expect(calls.filter(c => c.includes('subscribe'))).toEqual([]);
    expect(pushStatusFor(pushAvailability(), USER)).toBe('on');
  });

  it('asks the server at most once a minute unless told to', async () => {
    store.set(registeredKey(), String(Date.now()));
    await validatePushRegistration(USER);
    await validatePushRegistration(USER);
    await validatePushRegistration(USER);
    expect(calls.filter(c => c === 'POST /api/push/status')).toHaveLength(1);
    await validatePushRegistration(USER, true);
    expect(calls.filter(c => c === 'POST /api/push/status')).toHaveLength(2);
  });

  it('does nothing without permission, and never asks for it', async () => {
    install({ permission: 'default' });
    await validatePushRegistration(USER, true);
    install({ permission: 'denied' });
    await validatePushRegistration(USER, true);
    expect(calls).toEqual([]);
  });

  it('reads "unavailable" when the server cannot register the device just now', async () => {
    store.set(registeredKey(), String(Date.now()));
    serverHasDevice = false;
    subscribeResponse = 503;
    await validatePushRegistration(USER, true);
    expect(pushStatusFor(pushAvailability(), USER)).toBe('unavailable');
  });
});

describe('registering a device', () => {
  it('stores it, remembers the endpoint, and shares one attempt between concurrent callers', async () => {
    await Promise.all([ensureSubscribed(USER), ensureSubscribed(USER), ensureSubscribed(USER)]);
    expect(calls.filter(c => c === 'POST /api/push/subscribe')).toHaveLength(1);
    expect(store.has(registeredKey())).toBe(true);
    expect(store.get(`tp:push-endpoint:${USER}`)).toMatch(/^[0-9a-f]{16}$/);
    expect(pushStatusFor(pushAvailability(), USER)).toBe('on');
  });

  it('does not keep the endpoint itself, only a fingerprint', async () => {
    await ensureSubscribed(USER);
    expect([...store.values()].join(' ')).not.toContain('push.example.test');
  });

  it('a permission grant without a stored subscription is not "on"', async () => {
    subscribeResponse = 500;
    await expect(ensureSubscribed(USER)).rejects.toBeTruthy();
    expect(pushStatusFor(pushAvailability(), USER)).not.toBe('on');
    expect(store.has(registeredKey())).toBe(false);
  });
});
