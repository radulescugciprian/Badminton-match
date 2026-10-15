// Network-first so updates show up on the next load; the cache is only the offline fallback for the app shell.
// Other origins (Supabase API, the supabase-js CDN) are never touched.
const V = 'badminton';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone();
    caches.open(V).then(c => c.put(e.request, copy));
    return r;
  }).catch(() => caches.match(e.request)));
});
