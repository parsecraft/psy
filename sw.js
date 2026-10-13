const V = 'psy-v1';
const SHELL = ['./', 'index.html', 'styles.css', 'search.js', 'favicon.svg', 'manifest.webmanifest', 'videos.json', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => self.clients.claim())));
const save = (req, res) => { if (res && (res.ok || res.type === 'opaque')) caches.open(V).then(c => c.put(req, res.clone())); return res; };
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin === location.origin) {
    // pages + videos.json: network first (new videos show up), cache when offline
    if (r.mode === 'navigate' || u.pathname.endsWith('/videos.json')) {
      e.respondWith(fetch(r).then(res => save(r.mode === 'navigate' ? new Request('index.html') : r, res)).catch(() => caches.match(r.mode === 'navigate' ? 'index.html' : r, { ignoreSearch: true })));
    } else e.respondWith(fetch(r).then(res => save(r, res)).catch(() => caches.match(r))); // network first: updates show up at once, cache when offline
  } else if (u.hostname === 'i.ytimg.com') { // thumbnails: cache first
    e.respondWith(caches.match(r).then(hit => hit || fetch(r).then(res => save(r, res))));
  }
});
