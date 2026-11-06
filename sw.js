self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(fetch(r).then(res => {
    const c = res.clone();
    caches.open('sklad').then(ch => ch.put(r, c)).catch(() => {});
    return res;
  }).catch(() => caches.match(r)));
});

// ===== Push-уведомления (напоминание отсканировать QR) =====
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'LT Склад', {
    body: d.body || '',
    icon: 'icon-192-1.png',
    badge: 'icon-192-1.png',
    tag: d.tag || 'lt-qr',
    renotify: true,
    requireInteraction: false,
    vibrate: [200, 100, 200],
    data: { url: d.url || './' }
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if ('focus' in c) return c.focus(); }
    return clients.openWindow(url);
  }));
});
