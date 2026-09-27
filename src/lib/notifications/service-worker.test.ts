import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'bun:test';

const SOURCE = readFileSync(new URL('../../../public/sw.js', import.meta.url), 'utf8');
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';

/** Runs the real public/sw.js against a fake ServiceWorkerGlobalScope and delivers one push. */
async function deliverPush(userAgent: string, appVisible: boolean, extra: Record<string, unknown> = {}) {
  const handlers: Record<string, (event: unknown) => void> = {};
  const shown: { tag: string; closed: boolean }[] = [];
  const self = {
    navigator: { userAgent },
    location: { origin: 'https://www.thetradersplanet.in' },
    addEventListener: (type: string, handler: (event: unknown) => void) => { handlers[type] = handler; },
    skipWaiting: () => {},
    clients: { matchAll: async () => (appVisible ? [{ visibilityState: 'visible', url: 'https://www.thetradersplanet.in/home' }] : []) },
    registration: {
      showNotification: async (_title: string, options: { tag: string }) => { shown.push({ tag: options.tag, closed: false }); },
      getNotifications: async ({ tag }: { tag: string }) => shown.filter(item => item.tag === tag)
        .map(item => ({ close: () => { item.closed = true; } })),
    },
  };
  new Function('self', 'caches', SOURCE)(self, {});
  let work: Promise<unknown> = Promise.resolve();
  handlers.push({
    data: { json: () => ({ id: 'n1', title: 'THE TRADERS PLANET', body: 'New message', url: '/chat/admin', ...extra }) },
    waitUntil: (promise: Promise<unknown>) => { work = promise; },
  });
  await work;
  return shown;
}

describe('service worker push delivery', () => {
  it('always calls showNotification on iPhone, so WebKit never revokes push for a silent push', async () => {
    expect(await deliverPush(IPHONE, true)).toEqual([{ tag: 'tp-n1', closed: true }]);
  });

  it('leaves the banner up on iPhone when the app is not on screen', async () => {
    expect(await deliverPush(IPHONE, false)).toEqual([{ tag: 'tp-n1', closed: false }]);
  });

  it('keeps Chrome/Android behaviour: no OS banner while the app is visible, a banner otherwise', async () => {
    expect(await deliverPush(ANDROID_CHROME, true)).toEqual([]);
    expect(await deliverPush(ANDROID_CHROME, false)).toEqual([{ tag: 'tp-n1', closed: false }]);
  });

  it('keeps a test notification on screen even while the app is open (it has no in-app notice)', async () => {
    expect(await deliverPush(IPHONE, true, { test: true })).toEqual([{ tag: 'tp-n1', closed: false }]);
    expect(await deliverPush(ANDROID_CHROME, true, { test: true })).toEqual([{ tag: 'tp-n1', closed: false }]);
  });
});
