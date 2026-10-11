// Service worker : le site continue de fonctionner hors ligne en classe.
// Pages et données : le réseau d'abord (toujours à jour), le cache en secours.
// Styles, scripts et images : le cache d'abord, mis à jour en arrière-plan.

const CACHE = 'aventure-vie-v3';
const CORE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'data/evolution_tree.json',
  'css/style.css', 'css/timeline.css', 'css/games.css', 'css/journey.css', 'css/story.css', 'css/treeviz.css',
  'js/app.js', 'js/utils.js', 'js/validate.js', 'js/card.js', 'js/tree.js', 'js/treeviz.js', 'js/level.js',
  'js/tooltip.js', 'js/speech.js', 'js/story.js', 'js/timeline.js', 'js/clock.js', 'js/journey.js',
  'js/whofirst.js', 'js/quiz.js', 'js/scale.js',
  'images/favicon.svg', 'images/stars.svg', 'images/icon-192.png', 'images/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.allSettled(CORE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    return (await cache.match(request, { ignoreSearch: true })) || (await cache.match('index.html')) || Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const update = fetch(request)
    .then((response) => {
      if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || update;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com');
  if (!sameOrigin && !isFont) return;

  if (request.mode === 'navigate' || url.pathname.endsWith('.json')) {
    event.respondWith(networkFirst(request));
  } else {
    event.respondWith(staleWhileRevalidate(request));
  }
});
