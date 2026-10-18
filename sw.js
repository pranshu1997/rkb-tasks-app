// Bump CACHE and APP_VERSION (js/config.js) together on every deploy.
const CACHE = 'rkb-tasks-v5';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/config.js', 'js/store.js', 'js/queue.js', 'js/sort.js', 'js/strings.js', 'js/ui.js', 'js/tasks.js', 'js/detail.js', 'js/settings.js', 'js/team.js', 'js/recur.js', 'js/push.js', 'js/voice.js', 'js/photos.js', 'js/repeat.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png',
];
const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(async c => { await c.addAll(SHELL); await c.add(LIB).catch(() => {}); }).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin && url.pathname.endsWith('manifest.webmanifest')) {
    // Network first: Chrome reads the app id from here when deciding whether the app is installed.
    e.respondWith(fetch(req).catch(() => caches.match(req, { ignoreSearch: true })));
  } else if (url.origin === location.origin) {
    const key = req.mode === 'navigate' ? 'index.html' : req;
    e.respondWith(caches.match(key, { ignoreSearch: true }).then(hit => hit || fetch(req)));
  } else if (url.hostname === 'cdn.jsdelivr.net') {
    // Stale-while-revalidate: the library is kept after first use, so the app opens offline.
    e.respondWith(caches.open(CACHE).then(async c => {
      const hit = await c.match(req);
      const fresh = fetch(req).then(res => (res.ok && c.put(req, res.clone()), res)).catch(() => hit);
      return hit || fresh;
    }));
  }
  // Supabase API: network only. Failed writes go to the app's queue (js/store.js).
});

self.addEventListener('push', e => {
  const d = e.data?.json() ?? {};
  e.waitUntil(self.registration.showNotification(d.title || 'RKB Tasks', {
    body: d.body || '', tag: d.tag, renotify: true, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png',
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(list => (list.length ? list[0].focus() : self.clients.openWindow('./'))));
});
