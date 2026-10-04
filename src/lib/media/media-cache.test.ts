import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

let sessionUser: string | null = 'user-a';
mock.module('../supabase', () => ({
  supabase: { auth: {
    getSession: async () => ({ data: { session: sessionUser ? { access_token: `token-${sessionUser}`, user: { id: sessionUser } } : null } }),
    refreshSession: async () => ({ data: { session: null }, error: new Error('no') }),
  } },
}));

const cache = await import('./media-cache');
const { mediaStats, resetMediaStats } = await import('./media-metrics');

/** Just enough Web Storage for the cache's per-account hints. */
class MemoryStorage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
  removeItem(k: string) { this.map.delete(k); }
  clear() { this.map.clear(); }
  keys() { return [...this.map.keys()]; }
}

const local = new MemoryStorage();
const session = new MemoryStorage();
const g = globalThis as unknown as { window?: unknown; fetch: typeof fetch };
const realFetch = g.fetch;
const realWindow = g.window;

interface Call { path: string; keys?: string[] }
let calls: Call[];
/** key -> status the fake server refuses it with (default: signed). */
let refuse: Record<string, number>;
let batchRoute: boolean;
let expiresIn: number;

function fakeServer() {
  g.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (path.endsWith('/media-urls')) {
      const keys = JSON.parse(String(init?.body)).keys as string[];
      calls.push({ path, keys });
      if (!batchRoute) return new Response('not found', { status: 404 });
      const urls: Record<string, { url: string; expiresIn: number }> = {};
      const failed: Record<string, number> = {};
      for (const key of keys) {
        if (refuse[key]) failed[key] = refuse[key];
        else urls[key] = { url: `https://r2.example.test/${key}?sig=${calls.length}`, expiresIn };
      }
      return Response.json({ urls, failed });
    }
    const key = new URL(path, 'https://app.example.test').searchParams.get('key') ?? '';
    calls.push({ path, keys: [key] });
    if (refuse[key]) return new Response('{}', { status: refuse[key] });
    return Response.json({ url: `https://r2.example.test/${key}?single=${calls.length}`, expiresIn });
  }) as typeof fetch;
}

beforeEach(() => {
  local.clear(); session.clear();
  local.setItem('tp:remember-session', 'on');
  g.window = { localStorage: local, sessionStorage: session, isSecureContext: false };
  (globalThis as unknown as { localStorage: unknown }).localStorage = local;
  calls = []; refuse = {}; batchRoute = true; expiresIn = 900; sessionUser = 'user-a';
  fakeServer();
  cache.resetMediaCacheForTests();
  resetMediaStats();
});

afterEach(() => {
  g.fetch = realFetch;
  g.window = realWindow;
});

const flushTimers = () => new Promise(resolve => setTimeout(resolve, 30));

describe('signed addresses', () => {
  test('pictures asked for in the same moment are signed in one request, then come from memory', async () => {
    const urls = await Promise.all(['posts/a.bin', 'posts/b.bin', 'posts/c.bin'].map(k => cache.signedUrl('post', k)));
    expect(calls).toEqual([{ path: '/api/posts/media-urls', keys: ['posts/a.bin', 'posts/b.bin', 'posts/c.bin'] }]);
    expect(urls[0]).toContain('posts/a.bin');
    expect(await cache.signedUrl('post', 'posts/b.bin')).toBe(urls[1]);
    expect(calls.length).toBe(1);
    expect(mediaStats().signRequests).toBe(1);
    expect(mediaStats().batchRequests).toBe(1);
  });

  test('chat and community go to their own routes; a refused key fails alone, with the words /media-url uses', async () => {
    refuse['chat/c1/x.bin'] = 403;
    const results = await Promise.allSettled([cache.signedUrl('chat', 'chat/c1/ok.bin'), cache.signedUrl('chat', 'chat/c1/x.bin'), cache.signedUrl('post', 'posts/p.bin')]);
    expect(calls.map(c => c.path).sort()).toEqual(['/api/chat/media-urls', '/api/posts/media-urls']);
    expect(results[0].status).toBe('fulfilled');
    expect((results[1] as PromiseRejectedResult).reason.message).toBe('You do not have access to this attachment.');
    expect(results[2].status).toBe('fulfilled');
  });

  test('an API without the batch route is asked one key at a time, as before', async () => {
    batchRoute = false;
    const url = await cache.signedUrl('post', 'posts/a.bin');
    expect(url).toContain('single=');
    expect(calls.map(c => c.path)).toEqual(['/api/posts/media-urls', '/api/posts/media-url?key=posts%2Fa.bin']);
    await cache.signedUrl('post', 'posts/b.bin', true);
    expect(calls.at(-1)!.path).toBe('/api/posts/media-url?key=posts%2Fb.bin');
  });

  test('force always signs afresh (a download, a retry)', async () => {
    const first = await cache.signedUrl('post', 'posts/a.bin');
    const second = await cache.signedUrl('post', 'posts/a.bin', true);
    expect(second).not.toBe(first);
    expect(calls.length).toBe(2);
  });

  test('an address is never used, nor kept, past its life (re-signed a minute early)', async () => {
    expiresIn = 30; // shorter than the one-minute margin: already "expired" for reuse
    await cache.signedUrl('post', 'posts/a.bin');
    await cache.signedUrl('post', 'posts/a.bin');
    expect(calls.length).toBe(2);
    await flushTimers();
    await new Promise(resolve => setTimeout(resolve, 450));
    const kept = JSON.parse(local.getItem('tp:media-urls:v1:user-a') ?? '{}');
    expect(Object.keys(kept)).toEqual([]);
  });
});

describe('what is kept on the device', () => {
  test('community addresses are kept (with their expiry) for the next launch; chat addresses never leave memory', async () => {
    await Promise.all([cache.signedUrl('post', 'posts/a.bin'), cache.signedUrl('chat', 'chat/c1/private.bin')]);
    await new Promise(resolve => setTimeout(resolve, 450));
    const all = [...local.keys(), ...session.keys()].map(k => `${k}=${local.getItem(k) ?? session.getItem(k)}`).join('\n');
    expect(all).toContain('posts/a.bin');
    expect(all).not.toContain('chat/c1');
    const kept = JSON.parse(local.getItem('tp:media-urls:v1:user-a')!) as Record<string, [string, number]>;
    expect(kept['posts/a.bin'][1]).toBeGreaterThan(Date.now());
    expect(kept['posts/a.bin'][1]).toBeLessThanOrEqual(Date.now() + 900_000);

    // The next launch reuses it without asking.
    cache.resetMediaCacheForTests();
    calls = [];
    expect(await cache.signedUrl('post', 'posts/a.bin')).toContain('posts/a.bin');
    expect(calls).toEqual([]);
  });

  test('where the session is not remembered, hints live only as long as the browser session', async () => {
    local.setItem('tp:remember-session', 'off');
    await cache.signedUrl('post', 'posts/a.bin');
    await new Promise(resolve => setTimeout(resolve, 450));
    expect(local.getItem('tp:media-urls:v1:user-a')).toBeNull();
    expect(session.getItem('tp:media-urls:v1:user-a')).toContain('posts/a.bin');
  });

  test('one account never sees another\'s: memory is emptied and the other account\'s hints removed on a switch', async () => {
    await cache.signedUrl('post', 'posts/a.bin');
    cache.rememberMediaSize('posts/a.bin', 1080, 2340);
    await new Promise(resolve => setTimeout(resolve, 700));
    expect(local.getItem('tp:media-urls:v1:user-a')).not.toBeNull();

    sessionUser = 'user-b';
    cache.setMediaAccount('user-b');
    expect(cache.peekSignedUrl('post', 'posts/a.bin')).toBeNull();
    expect(cache.mediaSize('posts/a.bin')).toBeNull();
    expect(local.getItem('tp:media-urls:v1:user-a')).toBeNull();
    expect(local.getItem('tp:media-sizes:v1:user-a')).toBeNull();
    calls = [];
    await cache.signedUrl('post', 'posts/a.bin');
    expect(calls.length).toBe(1);
  });

  test('sign-out removes every kept address and size, for every account', async () => {
    await cache.signedUrl('post', 'posts/a.bin');
    cache.rememberMediaSize('posts/a.bin', 10, 20);
    await new Promise(resolve => setTimeout(resolve, 700));
    local.setItem('tp:media-urls:v1:someone-else', '{}');
    await cache.clearMediaCaches();
    expect(local.keys().filter(k => k.startsWith('tp:media-'))).toEqual([]);
    expect(cache.peekSignedUrl('post', 'posts/a.bin')).toBeNull();
    expect(local.getItem('tp:remember-session')).toBe('on');
  });

  test('a peek shows a still-valid address at once; nothing at all before an account is known', async () => {
    expect(cache.peekMedia('post', 'posts/a.bin')).toBeNull();
    const url = await cache.signedUrl('post', 'posts/a.bin');
    expect(cache.peekMedia('post', 'posts/a.bin')).toEqual({ src: url, ready: false });
    cache.markShown('post', 'posts/a.bin', url);
    expect(cache.peekMedia('post', 'posts/a.bin')).toEqual({ src: url, ready: true });
    // Someone else's local preview is never taken for a prepared picture.
    cache.markShown('post', 'posts/b.bin', 'blob:https://app.example.test/upload-preview');
    expect(cache.peekMedia('post', 'posts/b.bin')).toBeNull();
  });
});

describe('where pictures are kept on this device', () => {
  test('a community picture is read from the device, never re-fetched through a kept address; chat is unaffected', async () => {
    const g2 = globalThis as unknown as { location?: { origin: string } };
    const before = g2.location;
    g2.location = { origin: 'https://app.example.test' };
    try {
      local.setItem('tp:media-cors:v2', JSON.stringify({ state: 'ok', at: Date.now(), origin: 'https://app.example.test' }));
      cache.resetMediaCacheForTests();
      cache.setMediaAccount('user-a');
      await Promise.all([cache.signedUrl('post', 'posts/a.bin'), cache.signedUrl('chat', 'chat/c1/x.bin')]);
      expect(cache.peekMedia('post', 'posts/a.bin')).toBeNull();
      expect(cache.peekMedia('chat', 'chat/c1/x.bin')?.src).toContain('chat/c1/x.bin');
    } finally {
      g2.location = before;
    }
  });
});

describe('what the link allows', () => {
  const withConnection = (connection: unknown, run: () => void) => {
    const nav = globalThis.navigator as unknown as { connection?: unknown };
    const before = Object.getOwnPropertyDescriptor(nav, 'connection');
    Object.defineProperty(nav, 'connection', { configurable: true, value: connection });
    try { run(); } finally { if (before) Object.defineProperty(nav, 'connection', before); else delete nav.connection; }
  };
  test('Save-Data and 2G: addresses only, no picture downloaded', () => {
    withConnection({ saveData: true }, () => expect(cache.prefetchPlan()).toEqual({ fetchBytes: false, budgetBytes: 0, concurrency: 1 }));
    withConnection({ effectiveType: 'slow-2g' }, () => expect(cache.prefetchPlan().fetchBytes).toBe(false));
    withConnection({ effectiveType: '2g' }, () => expect(cache.prefetchPlan().fetchBytes).toBe(false));
  });
  test('3G: a small budget; otherwise a screen\'s worth', () => {
    withConnection({ effectiveType: '3g' }, () => expect(cache.prefetchPlan()).toEqual({ fetchBytes: true, budgetBytes: 5 * 1024 * 1024, concurrency: 2 }));
    withConnection({ effectiveType: '4g' }, () => expect(cache.prefetchPlan()).toEqual({ fetchBytes: true, budgetBytes: 16 * 1024 * 1024, concurrency: 2 }));
    // A browser's start-up guess at the link speed is not trusted to cut preparation short.
    withConnection({ effectiveType: '4g', downlink: 1.45 }, () => expect(cache.prefetchPlan().budgetBytes).toBe(16 * 1024 * 1024));
  });
  test('on Save-Data a warm-up signs the first screen in one request and downloads nothing', async () => {
    await cache.prefetchMedia([{ scope: 'post', key: 'posts/a.bin' }, { scope: 'post', key: 'posts/b.bin' }, { scope: 'chat', key: 'chat/c1/x.bin' }],
      { fetchBytes: false, budgetBytes: 0, concurrency: 1 });
    expect(calls.map(c => c.path).sort()).toEqual(['/api/chat/media-urls', '/api/posts/media-urls']);
    expect(mediaStats().prefetched).toBe(0);
  });
});

/** A picture element as preparation and screens use it: decoded after `delay` ms (per address, or the default). */
class FakeImage {
  static created: FakeImage[] = [];
  static active = 0;
  /** How many were downloading at once, each time one started. */
  static startedWith: number[] = [];
  static delay: (src: string) => number = () => 15;
  decoding = 'auto';
  fetchPriority?: string;
  naturalWidth = 0;
  naturalHeight = 0;
  src = '';
  constructor() { FakeImage.created.push(this); }
  decode(): Promise<void> {
    FakeImage.active += 1;
    FakeImage.startedWith.push(FakeImage.active);
    return new Promise(resolve => setTimeout(() => { FakeImage.active -= 1; this.naturalWidth = 400; this.naturalHeight = 300; resolve(); }, FakeImage.delay(this.src)));
  }
}

describe('one download per picture, the first one alone', () => {
  const gi = globalThis as unknown as { Image?: unknown };
  const realImage = gi.Image;
  const plan = { fetchBytes: true, budgetBytes: 16 * 1024 * 1024, concurrency: 2 };
  const post = (key: string, bytes = 512 * 1024) => ({ scope: 'post' as const, key, bytes });
  const until = async (check: () => boolean) => { for (let i = 0; i < 200 && !check(); i++) await new Promise(r => setTimeout(r, 5)); };
  beforeEach(() => {
    FakeImage.created = []; FakeImage.active = 0; FakeImage.startedWith = []; FakeImage.delay = () => 15;
    gi.Image = FakeImage;
  });
  afterEach(() => { gi.Image = realImage; });

  test('a screen opening while its picture is being prepared waits for that download instead of starting another', async () => {
    FakeImage.delay = () => 80;
    const preparing = cache.prefetchMedia([post('posts/top.bin')], plan);
    await until(() => FakeImage.created.length === 1);
    const shown = await cache.displaySource('post', 'posts/top.bin', { urgent: true });
    await preparing;
    expect(FakeImage.created.length).toBe(1);
    expect(FakeImage.created[0].fetchPriority).toBe('low');
    expect(shown.src).toBe(FakeImage.created[0].src);
    // Drawn whole from memory from now on.
    expect(cache.peekMedia('post', 'posts/top.bin')).toEqual({ src: shown.src, ready: true });
  });

  test('preparation never fetches again what a screen is already loading', async () => {
    FakeImage.delay = () => 60;
    const screen = cache.displaySource('post', 'posts/a.bin', { urgent: true });
    await until(() => FakeImage.created.length === 1);
    expect(FakeImage.created[0].fetchPriority).toBe('high');
    await cache.prefetchMedia([post('posts/a.bin'), post('posts/b.bin')], plan);
    await screen;
    expect(FakeImage.created.map(i => i.src.split('?')[0].split('/').pop())).toEqual(['a.bin', 'b.bin']);
  });

  test('the first download has the link to itself; a link measured fast then takes two at a time', async () => {
    FakeImage.delay = () => 25; // 512 KB in 25 ms: fast
    await cache.prefetchMedia(['a', 'b', 'c', 'd', 'e'].map(k => post(`posts/${k}.bin`)), plan);
    expect(FakeImage.created.length).toBe(5);
    expect(FakeImage.startedWith[0]).toBe(1);
    expect(FakeImage.startedWith[1]).toBe(1);
    expect(Math.max(...FakeImage.startedWith)).toBe(2);
  });

  test('a link measured slow goes one at a time and stops at a 3G budget — every screen\'s top picture still prepared', async () => {
    FakeImage.delay = () => 300; // 96 KB in 300 ms: about 2.6 Mbit/s
    // Two screens' top pictures, then one that fits a 16 MB budget but not a 3G one.
    const items = [post('posts/s1.bin', 96 * 1024), post('posts/s2.bin', 96 * 1024), post('posts/big.bin', 4.9 * 1024 * 1024)];
    await cache.prefetchMedia(items, { ...plan, alwaysFirst: 2 });
    expect(FakeImage.created.map(i => i.src.split('?')[0].split('/').pop())).toEqual(['s1.bin', 's2.bin']);
    expect(Math.max(...FakeImage.startedWith)).toBe(1);
  });

  test('on a slow link a screen\'s other pictures wait for its top one, then come one at a time in the order asked', async () => {
    cache.setLinkRateForTests(100);
    FakeImage.delay = () => 40;
    const order: string[] = [];
    const name = (src: string) => src.split('?')[0].split('/').pop()!;
    const arrived = cache.urgentLoadStarted();
    const top = cache.displaySource('post', 'posts/top.bin', { urgent: true }).then(r => { order.push(name(r.src)); arrived(); });
    const rest = ['a', 'b', 'c'].map(k => cache.displaySource('post', `posts/${k}.bin`).then(r => order.push(name(r.src))));
    await Promise.all([top, ...rest]);
    expect(order).toEqual(['top.bin', 'a.bin', 'b.bin', 'c.bin']);
    expect(Math.max(...FakeImage.startedWith)).toBe(1);
  });

  test('on a link that is not slow they load together once the top one is on its way', async () => {
    cache.setLinkRateForTests(5000);
    FakeImage.delay = () => 40;
    const arrived = cache.urgentLoadStarted();
    const top = cache.displaySource('post', 'posts/top.bin', { urgent: true }).then(() => arrived());
    await Promise.all([top, ...['a', 'b', 'c'].map(k => cache.displaySource('post', `posts/${k}.bin`))]);
    expect(Math.max(...FakeImage.startedWith)).toBe(3);
  });

  test('on a link already known to be slow, the screens\' top pictures are prepared even past the budget, nothing more', async () => {
    cache.setLinkRateForTests(100);
    const big = (k: string) => post(`posts/${k}.bin`, 3 * 1024 * 1024);
    await cache.prefetchMedia([big('official-top'), big('students-top'), big('next')], { ...plan, alwaysFirst: 2 });
    expect(FakeImage.created.map(i => i.src.split('?')[0].split('/').pop())).toEqual(['official-top.bin', 'students-top.bin']);
    // …and with a fast link, everything within the budget, two at a time from the start.
    cache.resetMediaCacheForTests();
    FakeImage.created = []; FakeImage.startedWith = [];
    cache.setLinkRateForTests(5000);
    await cache.prefetchMedia([big('official-top'), big('students-top'), big('next')], { ...plan, alwaysFirst: 2 });
    expect(FakeImage.created.length).toBe(3);
    expect(FakeImage.startedWith[1]).toBe(2);
  });
});

describe('pictures kept on this device: found out with the first download', () => {
  const gi = globalThis as unknown as { Image?: unknown; caches?: unknown; location?: { origin: string } };
  const realImage = gi.Image;
  const realCaches = gi.caches;
  const realLocation = gi.location;
  let stores: Map<string, Map<string, Response>>;
  let storageReads: { key: string; mode?: string }[];
  let bucketAllowsSite: boolean;
  let connectionUp: boolean;
  const plan = { fetchBytes: true, budgetBytes: 16 * 1024 * 1024, concurrency: 2 };

  beforeEach(() => {
    FakeImage.created = []; FakeImage.active = 0; FakeImage.startedWith = []; FakeImage.delay = () => 10;
    gi.Image = FakeImage;
    stores = new Map();
    gi.caches = {
      keys: async () => [...stores.keys()],
      delete: async (name: string) => stores.delete(name),
      open: async (name: string) => {
        let store = stores.get(name);
        if (!store) { store = new Map(); stores.set(name, store); }
        const s = store;
        return {
          put: async (url: string, response: Response) => { s.set(String(url), response); },
          match: async (url: string) => s.get(String(url))?.clone(),
          delete: async (url: string) => s.delete(String(url)),
        };
      },
    };
    gi.location = { origin: 'https://app.example.test' };
    (g.window as { isSecureContext?: boolean }).isSecureContext = true;
    storageReads = [];
    bucketAllowsSite = true;
    connectionUp = true;
    const api = g.fetch;
    g.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!url.startsWith('https://r2.example.test/')) return api(input, init);
      storageReads.push({ key: url.split('?')[0].slice('https://r2.example.test/'.length), mode: init?.mode });
      if (!connectionUp) throw new TypeError('Failed to fetch');
      // An answer the page may not read (no-cors) always gets through; a readable one only where the rule allows this site.
      if (init?.mode === 'no-cors') return new Response(null, { status: 200 });
      if (!bucketAllowsSite) throw new TypeError('Failed to fetch');
      return new Response(new Blob([new Uint8Array(200 * 1024)], { type: 'image/png' }));
    }) as typeof fetch;
    cache.resetMediaCacheForTests();
    cache.setMediaAccount('user-a');
  });
  afterEach(() => { gi.Image = realImage; gi.caches = realCaches; gi.location = realLocation; });

  const items = [{ scope: 'post' as const, key: 'posts/a.bin' }, { scope: 'post' as const, key: 'posts/b.bin' }, { scope: 'chat' as const, key: 'chat/c1/x.bin' }];
  const entries = () => [...stores.values()].reduce((n, s) => n + s.size, 0);

  test('where the bucket allows this site, community pictures are kept from the very first download (chat never is)', async () => {
    await cache.prefetchMedia(items, plan);
    expect(storageReads).toEqual([{ key: 'posts/a.bin', mode: 'cors' }, { key: 'posts/b.bin', mode: 'cors' }]);
    expect(entries()).toBe(2);
    expect(JSON.parse(local.getItem('tp:media-cors:v2')!).state).toBe('ok');
    expect(FakeImage.created.some(i => i.src.includes('chat/c1/x.bin'))).toBe(true);

    // The next launch (a refresh): drawn from the device, no signing and no download.
    await new Promise(resolve => setTimeout(resolve, 600));
    cache.resetMediaCacheForTests();
    cache.setMediaAccount('user-a');
    calls = []; storageReads = [];
    const shown = await cache.displaySource('post', 'posts/b.bin');
    expect(shown.source).toBe('device');
    expect(calls).toEqual([]);
    expect(storageReads).toEqual([]);
  });

  test('where it does not (a Preview address), one refused read turns the layer off and pictures load through their addresses', async () => {
    bucketAllowsSite = false;
    await cache.prefetchMedia(items, plan);
    // The refused read, then one unread check that storage answers at all: it does, so it was the rule.
    expect(storageReads).toEqual([{ key: 'posts/a.bin', mode: 'cors' }, { key: 'posts/a.bin', mode: 'no-cors' }]);
    expect(entries()).toBe(0);
    expect(JSON.parse(local.getItem('tp:media-cors:v2')!).state).toBe('blocked');
    expect(FakeImage.created.map(i => i.src.split('?')[0].split('/').pop()).sort()).toEqual(['a.bin', 'b.bin', 'x.bin']);
  });

  test('a lost connection (or a download cut off by a reload) never turns the layer off', async () => {
    connectionUp = false;
    await cache.prefetchMedia(items, plan);
    expect(local.getItem('tp:media-cors:v2')).toBeNull();
    // Back online: the first download finds out, and the pictures are kept.
    connectionUp = true;
    cache.resetMediaCacheForTests();
    cache.setMediaAccount('user-a');
    await cache.prefetchMedia(items, plan);
    expect(JSON.parse(local.getItem('tp:media-cors:v2')!).state).toBe('ok');
    expect(entries()).toBe(2);
  });

  test('sign-out empties the device store', async () => {
    await cache.prefetchMedia(items, plan);
    expect(entries()).toBe(2);
    await cache.clearMediaCaches();
    expect(stores.size).toBe(0);
  });
});
