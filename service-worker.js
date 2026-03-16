/**
 * Wheel of Terror — Service Worker
 *
 * Strategy: cache-first for all same-origin assets, network-only for CDN.
 *
 * HOW TO UPDATE: bump CACHE_NAME whenever you deploy a new version.
 * The activate handler deletes every cache whose name doesn't match, so
 * users transparently receive the fresh files on their next page load.
 *
 * OFFLINE BEHAVIOUR:
 *   - All pre-cached local assets load instantly from the cache.
 *   - CDN resources (GSAP, Google Fonts) are NOT cached here; they are
 *     unavailable offline. The app handles this gracefully:
 *       • gsap.js falls back to click-to-spin when Draggable is undefined.
 *       • Google Fonts falls back to system fonts defined in style.css.
 *   - The wheel canvas, spin logic, and winner popup all work offline.
 */

'use strict';

// ── Version ────────────────────────────────────────────────────────────────
// Bump this string on every deployment to invalidate the old cache.
const CACHE_NAME = 'wof-cache-v1';

// ── Pre-cache manifest ─────────────────────────────────────────────────────
// All local assets that must be available offline.
// Version query strings must match exactly what index.html requests.
const PRECACHE_URLS = [
  './',
  './index.html',
  './site.webmanifest',
  './css/style.css?ver=1.1.0',
  './js/app.js?ver=1.1.0',
  './js/gsap.js',
  './favicon.ico',
  './favicon.svg',
  './favicon-96x96.png',
  './apple-touch-icon.png',
  './web-app-manifest-192x192.png',
  './web-app-manifest-512x512.png',
];

// ── Install ────────────────────────────────────────────────────────────────
// Pre-cache every local asset. If any URL fails, installation is aborted so
// the browser retries on the next page load rather than serving partial assets.
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(function (cache) { return cache.addAll(PRECACHE_URLS); })
      .then(function () { return self.skipWaiting(); }) // activate immediately
  );
});

// ── Activate ───────────────────────────────────────────────────────────────
// Remove any stale caches left behind by a previous version.
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (key) { return key !== CACHE_NAME; })
            .map(function (key) { return caches.delete(key); })
        );
      })
      .then(function () { return self.clients.claim(); }) // take over open tabs
  );
});

// ── Fetch ──────────────────────────────────────────────────────────────────
// Cache-first: serve from cache when available, otherwise fetch from network
// and add the response to the cache for future visits.
// Cross-origin requests (CDN scripts, Google Fonts) are passed straight
// through without caching — their absence when offline is handled gracefully
// by the application code.
self.addEventListener('fetch', function (event) {
  // Only intercept GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Let CDN / external requests reach the network unmodified
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then(function (cached) {
      // Cache hit — return immediately (cache-first)
      if (cached) return cached;

      // Cache miss — fetch from network, then cache the fresh response
      return fetch(event.request)
        .then(function (response) {
          // Only cache successful, same-origin responses
          if (!response || !response.ok || response.type === 'error') {
            return response;
          }
          var toCache = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(event.request, toCache);
          });
          return response;
        })
        .catch(function () {
          // Network unavailable and nothing in cache.
          // For full-page navigations return the cached app shell so the
          // user sees the wheel rather than the browser's offline page.
          if (event.request.destination === 'document') {
            return caches.match('./index.html');
          }
          // For other resource types (images, scripts) just fail silently;
          // the browser handles missing sub-resources gracefully.
        });
    })
  );
});
