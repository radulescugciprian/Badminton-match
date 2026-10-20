// Network-first, revalidated every time (no-cache), so updates show up on the next load instead of after the browser's 10-minute cache; the cache is only the offline fallback for the app shell.
// Other origins (Supabase API, the supabase-js CDN) are never touched.
const V = 'badminton';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => {
    const copy = r.clone();
    caches.open(V).then(c => c.put(e.request, copy));
    return r;
  }).catch(() => caches.match(e.request)));
});
// play-day and chat notifications (sent by supabase/functions/remind); a tap opens the app (the chat for a message)
self.addEventListener('push', e => {
  const m = e.data ? e.data.json() : {};
  e.waitUntil(self.registration.showNotification(m.title || 'Badminton', { body: m.body, icon: 'icon-192.png', badge: 'icon-192.png', tag: 'badminton-' + (m.kind || ''), data: m }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = self.registration.scope + ((e.notification.data || {}).kind === 'chat' ? '?chat' : '');
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    const w = ws.find(x => x.url.startsWith(self.registration.scope));
    return w ? w.navigate(url).then(x => (x || w).focus()) : clients.openWindow(url);
  }));
});
