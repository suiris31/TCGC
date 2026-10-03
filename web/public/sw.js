// Service worker : l'interface et les visuels de cartes restent disponibles même si le PC répond lentement.
// Les données (/api) passent toujours par le réseau.
const SHELL = 'tcgc-shell-v1';
const IMAGES = 'tcgc-images-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/', '/manifest.webmanifest', '/icon.svg'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((k) => k !== SHELL && k !== IMAGES).map((k) => caches.delete(k)),
  )));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

  // Visuels et fichiers versionnés : cache d'abord
  if (url.pathname.startsWith('/img/') || url.pathname.startsWith('/assets/')) {
    const cacheName = url.pathname.startsWith('/img/') ? IMAGES : SHELL;
    event.respondWith(caches.open(cacheName).then(async (cache) => {
      const hit = await cache.match(event.request);
      if (hit) return hit;
      const res = await fetch(event.request);
      if (res.ok) cache.put(event.request, res.clone());
      return res;
    }));
    return;
  }

  // Pages : réseau d'abord, cache en secours
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then((res) => {
      caches.open(SHELL).then((c) => c.put('/', res.clone()));
      return res;
    }).catch(() => caches.match('/')));
  }
});
