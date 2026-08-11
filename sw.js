// 1. INCREMENT THIS VERSION NAME FOR EVERY NEW DEPLOYMENT (e.g. v1 -> v2 -> v3)
const CACHE_NAME = 'routeledger-v1.0.2';

const ASSETS = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/login.html',
  '/css/style.css',
  '/css/login.css',
  '/js/storage.js',
  '/js/app.js',
  '/js/dashboard.js',
  '/js/login.js',
  '/js/config.js'
];

// Install Event: Skip waiting and install immediately
self.addEventListener('install', (e) => {
  self.skipWaiting(); // Force active activation
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Activate Event: Wipe out all old cache stores
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('Clearing old cache:', key);
            return caches.delete(key); // Deletes old versions
          }
        })
      );
    }).then(() => self.clients.claim()) // Take control of all pages instantly
  );
});

// Fetch Event: Try network first, fall back to cache for offline support
self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request)
      .then((response) => {
        // Clone and update cache with latest network copy
        const resClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, resClone));
        return response;
      })
      .catch(() => caches.match(e.request)) // Fall back to cache if offline
  );
});