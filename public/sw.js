const CACHE = 'tp-shell-v1';

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => Promise.allSettled(
    ['/', '/site.webmanifest', '/icon-192.png', '/icon-512.png'].map(url => cache.add(url)),
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

self.addEventListener('push', event => {
  let data;
  try { data = event.data?.json(); } catch { data = null; }
  if (!data || typeof data.id !== 'string') return;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (windows.some(client => client.visibilityState === 'visible')) return;
    const path = typeof data.url === 'string' && data.url.startsWith('/') && !data.url.startsWith('//')
      ? data.url : '/notifications';
    await self.registration.showNotification(String(data.title || 'The Traders Planet'), {
      body: String(data.body || ''),
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: `tp-${data.id}`,
      renotify: false,
      data: { url: path },
    });
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
