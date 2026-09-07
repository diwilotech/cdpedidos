/* ============================================================================
   sw.js — Service Worker (para instalar la app en el teléfono)
   ----------------------------------------------------------------------------
   Estrategia:
     · /api/*            -> SOLO red (nunca se cachea: login, sesión, datos)
     · navegación (HTML)  -> red primero, si no hay señal usa la copia cacheada
     · resto (js/css/svg) -> stale-while-revalidate: responde al toque desde
                             cache y actualiza en segundo plano
   Al cambiar de versión (CACHE) se borran las cachés viejas.
   ========================================================================== */
const CACHE = 'cdp-v1';
const APP_SHELL = ['/', '/index.html', '/404.html', '/manifest.webmanifest', '/assets/css/styles.css'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;         // CDNs: los maneja el navegador

  if (url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(req));                         // datos y sesión: siempre red
    return;
  }

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => caches.match('/index.html').then((r) => r || caches.match('/')))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((cacheado) => {
      const red = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copia = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copia));
          }
          return res;
        })
        .catch(() => cacheado);
      return cacheado || red;
    })
  );
});
