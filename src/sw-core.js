// @ts-check
/**
 * @param {{version: number, files: string[], prefix: string, base: string, origin: string, caches: CacheStorage, fetch: (r: Request) => Promise<Response>, skipWaiting: () => void, claim: () => Promise<void>}} deps
 */
export function makeHandlers(deps) {
  const { version, files, prefix, base, origin, caches } = deps;
  const current = prefix + version;
  return {
    async install() {
      const cache = await caches.open(current);
      await cache.addAll(files.map((f) => new Request(new URL(f, base).href, { cache: 'reload' })));
    },
    async activate() {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith(prefix) && k !== current).map((k) => caches.delete(k)));
      await deps.claim();
    },
    /** @param {Request} req @returns {Promise<Response>|null} */
    respond(req) {
      if (req.method !== 'GET' || new URL(req.url).origin !== origin) return null;
      return (async () => {
        const cache = await caches.open(current);
        const hit = await cache.match(req, { ignoreSearch: true });
        if (hit) return hit;
        try {
          return await deps.fetch(req);
        } catch (err) {
          if (req.mode === 'navigate') {
            const fallback = await cache.match(new URL('index.html', base).href);
            if (fallback) return fallback;
          }
          throw err;
        }
      })();
    },
    skipWaiting() { deps.skipWaiting(); },
  };
}
