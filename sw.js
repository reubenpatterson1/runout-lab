// runout-lab sw v8
// @ts-check
import { VERSION, FILES, CACHE_PREFIX } from './src/precache.js';
import { makeHandlers } from './src/sw-core.js';

const h = makeHandlers({
  version: VERSION, files: FILES, prefix: CACHE_PREFIX,
  base: self.location.href, origin: self.location.origin,
  caches: self.caches,
  fetch: (r) => self.fetch(r),
  skipWaiting: () => self.skipWaiting(),
  claim: () => self.clients.claim(),
});

self.addEventListener('install', (e) => e.waitUntil(h.install()));
self.addEventListener('activate', (e) => e.waitUntil(h.activate()));
self.addEventListener('fetch', (e) => { const r = h.respond(e.request); if (r) e.respondWith(r); });
self.addEventListener('message', (e) => { if (e.data && e.data.type === 'SKIP_WAITING') h.skipWaiting(); });
