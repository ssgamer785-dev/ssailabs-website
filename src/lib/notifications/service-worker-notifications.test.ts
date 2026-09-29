import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'bun:test';

const SOURCE = readFileSync(new URL('../../../public/sw.js', import.meta.url), 'utf8');
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const ORIGIN = 'https://www.thetradersplanet.in';

type Shown = { title: string; options: { tag: string; body: string; renotify: boolean; data: { url: string; id: string; tag: string } }; closed: boolean; data: { url: string; id: string; tag: string } };

/** Runs the real public/sw.js against a fake ServiceWorkerGlobalScope. */
function worker(userAgent = ANDROID, opened: { visible?: boolean; windows?: FakeClient[]; badgeApi?: boolean } = {}) {
  const handlers: Record<string, (event: never) => void> = {};
  const shown: Shown[] = [];
  const badges: string[] = [];
  const openedUrls: string[] = [];
  const subscribed: unknown[] = [];
  const windows = opened.windows ?? (opened.visible ? [new FakeClient(`${ORIGIN}/home`, 'visible')] : []);
  const self = {
    navigator: { userAgent, ...(opened.badgeApi === false ? {} : { setAppBadge: async (n: number) => { badges.push(`set ${n}`); }, clearAppBadge: async () => { badges.push('clear'); } }) },
    location: { origin: ORIGIN },
    addEventListener: (type: string, handler: (event: never) => void) => { handlers[type] = handler; },
    skipWaiting: () => {},
    clients: { matchAll: async () => windows, openWindow: async (url: string) => { openedUrls.push(url); } },
    registration: {
      showNotification: async (title: string, options: Shown['options']) => {
        for (const old of shown.filter(item => item.options.tag === options.tag)) old.closed = true;   // same tag replaces
        shown.push({ title, options, closed: false, data: options.data });
      },
      getNotifications: async ({ tag }: { tag: string }) => shown.filter(item => item.options.tag === tag && !item.closed)
        .map(item => ({ data: item.data, close: () => { item.closed = true; } })),
      pushManager: { subscribe: async (options: unknown) => { subscribed.push(options); return {}; } },
    },
  };
  new Function('self', 'caches', SOURCE)(self, {});
  const push = async (payload: unknown) => {
    let work: Promise<unknown> = Promise.resolve();
    handlers.push({ data: { json: () => payload }, waitUntil: (p: Promise<unknown>) => { work = p; } } as never);
    await work;
  };
  const click = async (data: unknown) => {
    let work: Promise<unknown> = Promise.resolve();
    let closed = false;
    handlers.notificationclick({ notification: { data, close: () => { closed = true; } }, waitUntil: (p: Promise<unknown>) => { work = p; } } as never);
    await work;
    return closed;
  };
  const change = async (oldSubscription: unknown) => {
    let work: Promise<unknown> = Promise.resolve();
    handlers.pushsubscriptionchange({ oldSubscription, waitUntil: (p: Promise<unknown>) => { work = p; } } as never);
    await work;
  };
  return { push, click, change, shown, badges, openedUrls, subscribed, windows };
}

class FakeClient {
  messages: { message: unknown; ack: boolean }[] = [];
  focused = 0;
  navigated: string[] = [];
  constructor(public url: string, public visibilityState: 'visible' | 'hidden', private behaviour: 'ack' | 'silent' | 'throws' = 'ack', private canNavigate = true) {}
  async focus() { this.focused++; return this; }
  postMessage(message: unknown, transfer?: MessagePort[]) {
    if (this.behaviour === 'throws') throw new Error('gone');
    const ack = this.behaviour === 'ack';
    this.messages.push({ message, ack });
    if (ack && transfer?.[0]) transfer[0].postMessage('ok');
  }
  get navigate() { return this.canNavigate ? async (url: string) => { this.navigated.push(url); } : undefined; }
}

const chat = { v: 2, id: 'n1', title: 'The Traders Planet', body: 'Rahul sent you a voice message', url: '/chat/admin?c=abc', tag: 'tp-chat-abc', count: 1, unread: 3 };

describe('a push arriving while the app is closed or in the background', () => {
  it('shows one banner with the words, the tag, and the destination in its data', async () => {
    const sw = worker(ANDROID);
    await sw.push(chat);
    expect(sw.shown).toHaveLength(1);
    expect(sw.shown[0].title).toBe('The Traders Planet');
    expect(sw.shown[0].options).toMatchObject({ body: 'Rahul sent you a voice message', tag: 'tp-chat-abc', renotify: false, data: { url: '/chat/admin?c=abc', id: 'n1', tag: 'tp-chat-abc' } });
  });

  it('a further message in the same conversation replaces the banner, says how many, and alerts again', async () => {
    const sw = worker(ANDROID);
    await sw.push(chat);
    await sw.push({ ...chat, id: 'n2', body: 'Rahul sent you 2 new messages', count: 2 });
    await sw.push({ ...chat, id: 'n3', body: 'Rahul sent you 3 new messages', count: 3 });
    const live = sw.shown.filter(item => !item.closed);
    expect(live).toHaveLength(1);
    expect(live[0].options).toMatchObject({ body: 'Rahul sent you 3 new messages', renotify: true });
  });

  it('a different conversation gets its own banner', async () => {
    const sw = worker(ANDROID);
    await sw.push(chat);
    await sw.push({ ...chat, id: 'n9', tag: 'tp-chat-xyz', body: 'Sam sent you a photo' });
    expect(sw.shown.filter(item => !item.closed)).toHaveLength(2);
  });

  it('the same push delivered twice (a retry after no answer) is one banner', async () => {
    const sw = worker(ANDROID);
    await sw.push(chat);
    await sw.push(chat);
    expect(sw.shown).toHaveLength(1);
  });

  it('a push with no usable tag or an unsafe link falls back to safe values', async () => {
    const sw = worker(ANDROID);
    await sw.push({ ...chat, tag: 'has spaces & symbols!', url: '//evil.example/x' });
    expect(sw.shown[0].options.tag).toBe('tp-n1');
    expect(sw.shown[0].options.data.url).toBe('/notifications');
    const other = worker(ANDROID);
    await other.push({ ...chat, url: 'https://evil.example/' });
    expect(other.shown[0].options.data.url).toBe('/notifications');
  });

  it('never fails the push for a payload with missing fields', async () => {
    const sw = worker(ANDROID);
    await sw.push({ id: 'bare' });
    expect(sw.shown[0]).toMatchObject({ title: 'The Traders Planet', options: { body: '', tag: 'tp-bare' } });
  });
});

describe('the number on the app icon', () => {
  it('is set from the push even when the app is on screen and no banner is shown', async () => {
    const sw = worker(ANDROID, { visible: true });
    await sw.push(chat);
    expect(sw.shown).toHaveLength(0);
    expect(sw.badges).toEqual(['set 3']);
  });
  it('is cleared when nothing is unread, and left alone when the push does not say', async () => {
    const sw = worker(ANDROID);
    await sw.push({ ...chat, unread: 0 });
    await sw.push({ ...chat, id: 'n2', unread: undefined });
    expect(sw.badges).toEqual(['clear']);
  });
  it('a device without the Badging API still shows the banner', async () => {
    const sw = worker(ANDROID, { badgeApi: false });
    await sw.push(chat);
    expect(sw.shown).toHaveLength(1);
    expect(sw.badges).toEqual([]);
  });
});

describe('foreground and background do not double up', () => {
  it('Chrome shows no banner while the app is on screen (the app has its own notice)', async () => {
    const sw = worker(ANDROID, { visible: true });
    await sw.push(chat);
    expect(sw.shown).toHaveLength(0);
  });
  it('iPhone shows the banner and closes it at once while the app is on screen (WebKit needs a shown notification)', async () => {
    const sw = worker(IPHONE, { visible: true });
    await sw.push(chat);
    expect(sw.shown).toHaveLength(1);
    expect(sw.shown[0].closed).toBe(true);
  });
  it('a background push is shown and stays', async () => {
    for (const ua of [ANDROID, IPHONE]) {
      const sw = worker(ua);
      await sw.push(chat);
      expect(sw.shown[0].closed).toBe(false);
    }
  });
});

describe('tapping a notification', () => {
  it('opens a new window at the destination when the app is closed', async () => {
    const sw = worker(ANDROID);
    const closed = await sw.click({ url: '/chat/admin?c=abc' });
    expect(closed).toBe(true);
    expect(sw.openedUrls).toEqual([`${ORIGIN}/chat/admin?c=abc`]);
  });

  it('asks a running app to open it, without reloading, when the app answers', async () => {
    const app = new FakeClient(`${ORIGIN}/home`, 'hidden', 'ack');
    const sw = worker(ANDROID, { windows: [app] });
    await sw.click({ url: '/post?post=p1&comment=c1' });
    expect(app.focused).toBe(1);
    expect(app.messages).toEqual([{ message: { type: 'tp:open', url: '/post?post=p1&comment=c1' }, ack: true }]);
    expect(app.navigated).toEqual([]);
    expect(sw.openedUrls).toEqual([]);
  });

  it('navigates the window itself when the app cannot be messaged', async () => {
    const app = new FakeClient(`${ORIGIN}/home`, 'hidden', 'throws');
    const sw = worker(ANDROID, { windows: [app] });
    await sw.click({ url: '/notifications' });
    expect(app.navigated).toEqual([`${ORIGIN}/notifications`]);
  });

  it('opens a new window when the running window can neither answer nor navigate', async () => {
    const app = new FakeClient(`${ORIGIN}/home`, 'hidden', 'throws', false);
    const sw = worker(ANDROID, { windows: [app] });
    await sw.click({ url: '/notifications' });
    expect(sw.openedUrls).toEqual([`${ORIGIN}/notifications`]);
  });

  it('ignores a window of another origin, and never opens an off-site destination', async () => {
    const stranger = new FakeClient('https://evil.example/', 'visible', 'ack');
    const sw = worker(ANDROID, { windows: [stranger] });
    await sw.click({ url: '//evil.example/steal' });
    expect(stranger.messages).toEqual([]);
    expect(sw.openedUrls).toEqual([`${ORIGIN}/notifications`]);
  });

  it('falls back to the notifications screen when a notification carries no destination', async () => {
    const sw = worker(ANDROID);
    await sw.click(undefined);
    expect(sw.openedUrls).toEqual([`${ORIGIN}/notifications`]);
  });
});

describe('the browser replacing this device\'s subscription', () => {
  it('subscribes again with the same key, and tells an open app to register it', async () => {
    const app = new FakeClient(`${ORIGIN}/home`, 'visible');
    const sw = worker(ANDROID, { windows: [app] });
    const key = new Uint8Array([4, 1, 2, 3]).buffer;
    await sw.change({ options: { applicationServerKey: key } });
    expect(sw.subscribed).toEqual([{ userVisibleOnly: true, applicationServerKey: key }]);
    expect(app.messages[0].message).toEqual({ type: 'tp:push-resync', resubscribed: true });
  });

  it('still tells the app when it cannot subscribe (no old key)', async () => {
    const app = new FakeClient(`${ORIGIN}/home`, 'visible');
    const sw = worker(ANDROID, { windows: [app] });
    await sw.change(null);
    expect(sw.subscribed).toEqual([]);
    expect(app.messages[0].message).toEqual({ type: 'tp:push-resync', resubscribed: false });
  });
});
