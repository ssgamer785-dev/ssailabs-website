const CACHE = 'tp-shell-v1';

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
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response => {
      if (response.ok) caches.open(CACHE).then(cache => cache.put('/', response.clone()));
      return response;
    }).catch(() => caches.match('/')));
  }
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
