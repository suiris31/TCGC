// Service worker : l'interface et les visuels de cartes restent disponibles même si le serveur répond lentement.
// Les données (api/) passent toujours par le réseau. Il affiche aussi les notifications envoyées par le serveur.
// BASE = chemin de l'appli ("/" ou un sous-dossier comme "/tcgc/"), déduit de l'emplacement du service worker.
const BASE = new URL(self.registration.scope).pathname;
const SHELL = 'tcgc-shell-v2';
const IMAGES = 'tcgc-images-v2';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll([BASE, `${BASE}manifest.webmanifest`, `${BASE}icon.svg`])));
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
  if (event.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith(`${BASE}api/`)) return;

  // Visuels (img/, img-fr/, img-fr-hd/) et fichiers versionnés : cache d'abord
  const isImage = url.pathname.startsWith(`${BASE}img`);
  if (isImage || url.pathname.startsWith(`${BASE}assets/`)) {
    event.respondWith(caches.open(isImage ? IMAGES : SHELL).then(async (cache) => {
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
      caches.open(SHELL).then((c) => c.put(BASE, res.clone()));
      return res;
    }).catch(() => caches.match(BASE)));
  }
});

// Notification reçue : { title, body, url (ex. "#collection/wishlist"), tag }
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data?.text() }; }
  event.waitUntil(self.registration.showNotification(data.title || 'TCGC', {
    body: data.body || '',
    icon: `${BASE}icon-192.png`,
    tag: data.tag,
    data: { hash: data.url || '' },
  }));
});

// Appui sur la notification : l'appli s'ouvre (ou revient au premier plan) sur la bonne page
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const hash = event.notification.data?.hash || '';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    const client = clients.find((c) => c.url.startsWith(self.registration.scope));
    if (client) {
      client.postMessage({ type: 'tcgc:navigate', hash });
      return client.focus();
    }
    return self.clients.openWindow(`${BASE}${hash}`);
  }));
});
