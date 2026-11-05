/* global self */
// Keep the former registration URL available so installed full-product workers
// can update and retire. Lite requires network access. Cached/local user data is
// deliberately retained; no cache, IndexedDB, draft or queue is deleted.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  await self.clients.claim();
  await self.registration.unregister();
})()));
// No fetch/message listener: never serve the former offline full-product shell.
