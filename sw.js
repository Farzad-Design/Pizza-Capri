const CACHE_VERSION = 'pizzeria-capri-v2';
const CACHE_NAMES = {
  static:  `${CACHE_VERSION}-static`,
  images:  `${CACHE_VERSION}-images`,
  dynamic: `${CACHE_VERSION}-dynamic`
};

// Bilder werden nicht vorab gecacht (nur bei Bedarf, siehe Fetch-Handler unten),
// um die Erstinstallation des Service Workers schnell zu halten.
const STATIC_ASSETS = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAMES.static).then(c => c.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => !Object.values(CACHE_NAMES).includes(k)).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if(e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // Bilder: cache first
  if(e.request.destination === 'image'){
    e.respondWith(
      caches.open(CACHE_NAMES.images).then(cache =>
        cache.match(e.request).then(cached =>
          cached || fetch(e.request).then(res => { cache.put(e.request, res.clone()); return res; })
        )
      )
    );
    return;
  }

  // Icons / Schriften: cache first
  if(url.pathname.match(/\.(png|ico|woff2?)$/)){
    e.respondWith(
      caches.match(e.request).then(cached =>
        cached || fetch(e.request).then(res => {
          caches.open(CACHE_NAMES.static).then(c => c.put(e.request, res.clone()));
          return res;
        })
      )
    );
    return;
  }

  // HTML & Rest: network first, Fallback auf Cache (offline-fähig)
  e.respondWith(
    fetch(e.request)
      .then(res => { caches.open(CACHE_NAMES.dynamic).then(c => c.put(e.request, res.clone())); return res; })
      .catch(() => caches.match(e.request).then(c => c || caches.match('/index.html')))
  );
});
