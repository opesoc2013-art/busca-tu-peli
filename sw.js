// Service worker: permite instalar la app y que funcione sin internet
// con lo último que viste. Si cambiás archivos, subí el número de VERSION.
const VERSION = 'v1';
const SHELL = 'btp-shell-' + VERSION;
const IMGS = 'btp-img';
const API = 'btp-api';

const SHELL_FILES = [
  './', 'index.html', 'css/style.css', 'js/app.js', 'config.js', 'manifest.json',
  'img/icon-192.png', 'img/icon-512.png', 'img/favicon.svg', 'img/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL, IMGS, API].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

// Primero internet; si no hay, lo guardado
async function networkFirst(req, cacheName, max) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) { cache.put(req, res.clone()); if (max) trim(cacheName, max); }
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
    if (hit) return hit;
    if (req.mode === 'navigate') return cache.match('index.html');
    throw err;
  }
}

// Primero lo guardado; si no está, internet (para pósters)
async function cacheFirst(req) {
  const cache = await caches.open(IMGS);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') { cache.put(req, res.clone()); trim(IMGS, 250); }
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) e.respondWith(networkFirst(req, SHELL));
  else if (url.hostname === 'image.tmdb.org') e.respondWith(cacheFirst(req));
  else if (url.hostname === 'api.themoviedb.org') e.respondWith(networkFirst(req, API, 120));
  // lo demás (YouTube, etc.) va directo a internet
});
