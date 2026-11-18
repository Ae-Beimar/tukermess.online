// Service worker de tukermes: permite abrir la caja (vender.html) sin señal.
// Estrategia: red primero; si no hay red, lo último guardado. Las llamadas a Supabase y
// los mosaicos del mapa nunca se guardan (las ventas se guardan aparte, en la cola del celular).
const CACHE = 'tukermes-v26';

const PRECACHE = [
  './vender.html',
  './ventas.html',
  './panel.html',
  './gestionar.html',
  './js/gestionar.js',
  './entregar.html',
  './js/entregar.js',
  './css/styles.css',
  './js/tailwindConfig.js',
  './js/vender.js',
  './js/panel.js',
  './js/supabaseConfig.js',
  './js/services/salesService.js',
  './js/services/reservationService.js',
  './js/ui/ticket.js',
  './reservas.html',
  './js/reservas.js',
  './js/services/organizerService.js',
  './js/services/authService.js',
  './js/services/demoBackend.js',
  './js/services/storageService.js',
  './js/utils/format.js',
  './js/utils/icons.js',
  './js/ui/feedback.js',
  './js/ui/fluid.js',
  './assets/img/favicon.svg',
  './assets/img/logo.svg',
  './manifest.webmanifest',
  './assets/img/app-icon-192.png',
  './js/ui/installApp.js',
  './assets/img/placeholder-kermes.svg',
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm',
  'https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800&display=swap',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => Promise.all(
      PRECACHE.map((url) => cache.add(new Request(url, { mode: url.startsWith('http') ? 'no-cors' : 'same-origin' })).catch(() => null))
    )).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function neverCache(url) {
  return url.hostname.endsWith('supabase.co')
    || url.hostname.endsWith('tile.openstreetmap.org')
    || url.hostname === 'nominatim.openstreetmap.org';
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (neverCache(url)) return;

  // Archivos propios: siempre revalidar con el servidor para no mostrar una versión vieja
  const fresh = url.origin === self.location.origin
    ? fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' })
    : fetch(request);
  event.respondWith(
    fresh
      .then((response) => {
        if (response && (response.ok || response.type === 'opaque')) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request, { ignoreSearch: request.mode === 'navigate' });
        if (cached) return cached;
        if (request.mode === 'navigate') return caches.match('./vender.html', { ignoreSearch: true });
        return Response.error();
      })
  );
});
