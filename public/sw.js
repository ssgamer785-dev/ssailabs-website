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

const SAFE_TAG = /^[A-Za-z0-9_-]{1,120}$/;

/** Only an in-app path ever leaves this worker as a destination. */
function safePath(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/notifications';
}

/** The number on the installed app's icon, kept right even when no banner is shown. Best effort. */
async function setBadge(unread) {
  const count = Number(unread);
  if (!Number.isFinite(count) || count < 0) return;
  try {
    if (count > 0 && self.navigator.setAppBadge) await self.navigator.setAppBadge(Math.floor(count));
    else if (self.navigator.clearAppBadge) await self.navigator.clearAppBadge();
  } catch { /* No permission, or the platform declined: no badge. */ }
}

async function showPush(data) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const visible = windows.some(client => client.visibilityState === 'visible');
  // The open app already chimes and shows its own in-app notice. A test push
  // has no in-app counterpart, so it is always shown.
  const test = data.test === true;
  await setBadge(data.unread);
  if (visible && !APPLE_WEBKIT && !test) return;

  // Pushes about one thing share a tag, so a new one REPLACES the banner on the
  // device instead of stacking beside it; the count says how many there are.
  const tag = typeof data.tag === 'string' && SAFE_TAG.test(data.tag) ? data.tag : `tp-${data.id}`;
  const count = Number.isInteger(data.count) && data.count > 1 ? data.count : 1;
  const path = safePath(data.url);
  // The same push delivered twice (a retry after no answer) is one banner.
  const already = (await self.registration.getNotifications({ tag })).some(shown => shown.data && shown.data.id === data.id);
  if (!already) {
    await self.registration.showNotification(String(data.title || 'The Traders Planet'), {
      body: String(data.body || ''),
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag,
      // A further message in a group alerts again; a lone notification has nothing to replace.
      renotify: count > 1,
      data: { url: path, id: data.id, tag },
    });
  }
  // Shown only to keep WebKit's subscription; the app on screen has it covered.
  if (visible && !test) (await self.registration.getNotifications({ tag })).forEach(shown => shown.close());
}

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
  event.waitUntil(showPush(data));
});

/**
 * Asks a running app window to open the destination itself (no reload, its
 * state kept). The page answers "ok" on the channel; a page that does not
 * answer, or an engine without messaging, falls back to navigating it.
 */
function askAppToOpen(client, path) {
  return new Promise(resolve => {
    let done = false;
    const finish = value => { if (!done) { done = true; clearTimeout(timer); resolve(value); } };
    const timer = setTimeout(() => finish(false), 1500);
    try {
      const channel = new MessageChannel();
      channel.port1.onmessage = message => finish(message.data === 'ok');
      client.postMessage({ type: 'tp:open', url: path }, [channel.port2]);
    } catch { finish(false); }
  });
}

async function openDestination(destination) {
  // Sanitised here as well as at the caller: nothing but an in-app path is ever opened or navigated to.
  const path = safePath(destination);
  const url = new URL(path, self.location.origin).href;
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const app = windows.find(client => new URL(client.url).origin === self.location.origin);
  if (!app) { await self.clients.openWindow(url); return; }
  try { await app.focus(); } catch { /* Focus can be refused; the routing below still applies. */ }
  if (await askAppToOpen(app, path)) return;
  try { if (app.navigate) { await app.navigate(url); return; } } catch { /* Fall through. */ }
  await self.clients.openWindow(url);
}

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(openDestination(safePath(event.notification.data?.url)));
});

// The browser replaced or dropped this device's subscription (an expired or
// rotated one). Make a new one with the same key so the device can receive
// again, and tell any open app to register it: this worker has no sign-in.
// With no app open, the next launch notices the change and registers it.
self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil((async () => {
    let resubscribed = false;
    try {
      const key = event.oldSubscription && event.oldSubscription.options && event.oldSubscription.options.applicationServerKey;
      if (key) {
        await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        resubscribed = true;
      }
    } catch { /* The app re-subscribes on its next launch. */ }
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    windows.forEach(client => { try { client.postMessage({ type: 'tp:push-resync', resubscribed }); } catch { /* Gone. */ } });
  })());
});
