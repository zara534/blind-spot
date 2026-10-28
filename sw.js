/* Blind Spot service worker: whole game cached for offline bot matches.
   Online multiplayer (PeerJS) uses WebSockets/WebRTC, which are never touched here. */
const CACHE = 'blindspot-v1';
const CORE = ['./', './index.html', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png'];
const PEER_URLS = ['https://cdnjs.cloudflare.com/ajax/libs/peerjs/1.5.4/peerjs.min.js',
  'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(CORE);
    // Save the multiplayer library too so online works after install. Fine if offline right now.
    for (const u of PEER_URLS) { try { const r = await fetch(u, { mode: 'no-cors' }); await c.put(u, r); break } catch (_) {} }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (PEER_URLS.includes(req.url)) {            // multiplayer library: cache first, refresh quietly
    e.respondWith((async () => {
      const c = await caches.open(CACHE), hit = await c.match(req.url);
      const net = fetch(req).then(r => { c.put(req.url, r.clone()); return r }).catch(() => null);
      return hit || (await net) || Response.error();
    })());
    return;
  }
  if (url.origin !== location.origin) return;   // everything else (signaling etc.) goes straight to network

  if (req.mode === 'navigate') {                // app open / invite links: serve the cached game, update in background
    e.respondWith((async () => {
      const c = await caches.open(CACHE), hit = await c.match('./index.html');
      const net = fetch('./index.html').then(r => { if (r.ok) c.put('./index.html', r.clone()); return r }).catch(() => null);
      return hit || (await net) || Response.error();
    })());
    return;
  }
  e.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try { const r = await fetch(req); if (r.ok) (await caches.open(CACHE)).put(req, r.clone()); return r } catch (_) { return Response.error() }
  })());
});
