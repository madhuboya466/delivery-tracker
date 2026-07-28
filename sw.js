// Change 'v1' to 'v2', 'v3', etc., whenever you deploy an update
const CACHE_NAME = 'routeledger-v2'; 

const ASSETS = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/css/style.css',
  '/js/storage.js',
  '/js/app.js',
  '/js/dashboard.js',
  '/js/config.js'
];

// Install Event
self.addEventListener('install', (e) => {
  self.skipWaiting(); // Force new service worker to activate immediately
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Activate Event: Delete old caches automatically
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('Deleting old cache:', key);
            return caches.delete(key); // Clear old cache version
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => response || fetch(e.request))
  );
});