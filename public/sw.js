/*
 * FocusDesk minimal service worker for PWA installability.
 * 
 * Strategy:
 *  - Bypasses cache entirely for all requests to ensure fresh Supabase data.
 */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Pass through all requests directly to the network
  return;
});
