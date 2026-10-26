// Offline support: cache the app shell and libraries; sheet data is cached by the page itself.
const CACHE = 'outreach-v4';
const SHELL = [
  './',
  './index.html',
  '../unibox-core.js?v=4',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];
const CDN = ['https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    await Promise.all(CDN.map((url) => fetch(url, { mode: 'cors' }).then((res) => cache.put(url, res)).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Live data always goes to the network.
  if (url.hostname === 'sheets.googleapis.com') return;

  // Pages: network first so updates show up, cached copy when offline.
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put('./index.html', copy));
      return res;
    }).catch(() => caches.match('./index.html')));
    return;
  }

  // The app's own files: network first, so a page and its scripts always come from the same version.
  if (url.origin === self.location.origin) {
    event.respondWith(fetch(req).then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req)));
    return;
  }

  // Libraries and fonts (versioned, rarely change): stale-while-revalidate.
  const cacheable = url.hostname === 'cdnjs.cloudflare.com'
    || url.hostname === 'fonts.googleapis.com'
    || url.hostname === 'fonts.gstatic.com';
  if (!cacheable) return;
  event.respondWith(caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(req);
    const network = fetch(req).then((res) => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    }).catch(() => cached);
    return cached || network;
  }));
});
