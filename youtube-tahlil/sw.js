/* YouTube Tahlil — oddiy service worker: avval internetdan oladi (har doim eng yangi versiya),
   internet bo'lmasa saqlangan sahifani ko'rsatadi. Boshqa saytlarga (YouTube API) aralashmaydi. */
const C = 'ytt-shell-v1';
const SHELL = ['./', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(C).then(c => c.addAll(SHELL)).catch(() => {}));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== location.origin || !u.pathname.startsWith('/youtube-tahlil/') || u.pathname.includes('/data/')) return;
  const nav = r.mode === 'navigate';
  e.respondWith(
    fetch(r).then(res => {
      if (res.ok && (nav || SHELL.some(s => u.pathname.endsWith(s.slice(1))))) {
        const cp = res.clone();
        caches.open(C).then(c => c.put(nav ? './' : r, cp)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(nav ? './' : r).then(m => m || Response.error()))
  );
});
