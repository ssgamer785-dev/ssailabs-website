const CACHE = 'tp-shell-v1';
// Build output under /assets/ carries a content hash in its name, so a cached
// copy can never be stale: a new release simply asks for new names. Kept so
// a repeat launch (and an offline one) does not depend on the HTTP cache,
// which iOS clears aggressively for Home Screen apps (TP-042).
const ASSETS = 'tp-assets-v1';
const MAX_ASSETS = 120;
const HASHED_ASSET = /^\/assets\/[^/]+-[A-Za-z0-9_-]{8}\.[a-z0-9]+$/;

async function trimAssets(cache) {
  const keys = await cache.keys();
  if (keys.length > MAX_ASSETS) await Promise.all(keys.slice(0, keys.length - MAX_ASSETS).map(key => cache.delete(key)));
}

async function cacheAsset(cache, request) {
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
  return response;
}

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => Promise.allSettled(
    ['/', '/site.webmanifest', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png'].map(url => cache.add(url)),
  )));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('tp-shell-') && key !== CACHE).map(key => caches.delete(key)))),
    self.clients.claim(),
  ]));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) return;
  // Range requests (media seeking) go straight to the network.
  if (HASHED_ASSET.test(url.pathname) && !event.request.headers.has('range')) {
    event.respondWith(caches.open(ASSETS).then(async cache => {
      const hit = await cache.match(event.request);
      if (hit) return hit;
      const response = await cacheAsset(cache, event.request);
      event.waitUntil(trimAssets(cache));
      return response;
    }));
    return;
  }
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response => {
      if (response.ok) caches.open(CACHE).then(cache => cache.put('/', response.clone()));
      return response;
    }).catch(() => caches.match('/')));
  }
});

// The page lists the build files it loaded before this worker controlled it
// (a first visit), so the next launch can start without the network.
self.addEventListener('message', event => {
  const urls = event.data && event.data.type === 'cache-assets' && Array.isArray(event.data.urls) ? event.data.urls : [];
  const wanted = urls.map(value => { try { return new URL(value, self.location.origin); } catch { return null; } })
    .filter(url => url && url.origin === self.location.origin && HASHED_ASSET.test(url.pathname))
    .slice(0, MAX_ASSETS);
  if (!wanted.length) return;
  event.waitUntil(caches.open(ASSETS).then(async cache => {
    for (const url of wanted) {
      if (!(await cache.match(url.href))) await cacheAsset(cache, url.href).catch(() => {});
    }
    await trimAssets(cache);
  }));
});

// WebKit counts every push that ends without showNotification() and, past a
// small limit, deletes all of this site's push subscriptions (webpushd's
// maxSilentPushCount). Chrome exempts a visible page; Apple's engine does not,
// so skipping the banner while the app is open silently disabled iPhone push.
const APPLE_WEBKIT = /AppleWebKit/.test(self.navigator.userAgent)
  && !/Chrome|Chromium|CriOS|Edg|Android/.test(self.navigator.userAgent);

self.addEventListener('push', event => {
  let data;
  try { data = event.data?.json(); } catch { data = null; }
  if (!data || typeof data.id !== 'string') {
    // Unreadable payload: WebKit still counts it, so it still gets a banner.
    if (APPLE_WEBKIT) {
      event.waitUntil(self.registration.showNotification('The Traders Planet', {
        body: 'You have a new notification.', icon: '/icon-192.png', badge: '/icon-192.png',
        tag: 'tp-unreadable', data: { url: '/notifications' },
      }));
    }
    return;
  }
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const visible = windows.some(client => client.visibilityState === 'visible');
    // The open app already chimes and shows its own in-app notice. A test push
    // has no in-app counterpart, so it is always shown.
    const test = data.test === true;
    if (visible && !APPLE_WEBKIT && !test) return;
    const tag = `tp-${data.id}`;
    const path = typeof data.url === 'string' && data.url.startsWith('/') && !data.url.startsWith('//')
      ? data.url : '/notifications';
    await self.registration.showNotification(String(data.title || 'The Traders Planet'), {
      body: String(data.body || ''),
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag,
      renotify: false,
      data: { url: path },
    });
    // Shown only to keep WebKit's subscription; the app on screen has it covered.
    if (visible && !test) (await self.registration.getNotifications({ tag })).forEach(shown => shown.close());
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const path = event.notification.data?.url || '/notifications';
  const url = new URL(path, self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const app = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (app) {
      await app.focus();
      try { if (app.navigate) await app.navigate(url); else await self.clients.openWindow(url); }
      catch { await self.clients.openWindow(url); }
    } else {
      await self.clients.openWindow(url);
    }
  })());
});
