// @ts-check

/**
 * @param {{nav?: Navigator, doc?: Document, onFallback?: (reason: 'unsupported'|'denied'|'released') => void}} [deps]
 */
export function createWakeLock(deps = {}) {
  const nav = deps.nav ?? globalThis.navigator;
  const doc = deps.doc ?? globalThis.document;
  const supported = typeof nav?.wakeLock?.request === 'function';
  let active = false, sent = false;
  /** @type {any} */
  let sentinel = null;
  /** @type {Promise<boolean> | null} */
  let pending = null;

  /** @param {'unsupported'|'denied'|'released'} reason */
  function signal(reason) {
    if (sent) return;
    sent = true;
    if (deps.onFallback) deps.onFallback(reason);
  }

  function acquire() {
    if (pending) return pending;
    pending = doAcquire().finally(() => { pending = null; });
    return pending;
  }

  async function doAcquire() {
    if (!supported) { signal('unsupported'); return false; }
    if (doc.visibilityState !== 'visible') return false;
    try {
      const s = await nav.wakeLock.request('screen');
      if (!active) { s.release().catch(() => {}); return false; }
      sentinel = s;
      s.addEventListener('release', () => {
        if (sentinel === s) sentinel = null;
        if (active && doc.visibilityState === 'visible') signal('released');
      });
      return true;
    } catch {
      signal('denied');
      return false;
    }
  }

  function onVisibility() {
    if (active && doc.visibilityState === 'visible' && !sentinel) acquire();
  }

  return {
    supported,
    async start() {
      if (active && sentinel) return true;
      active = true; sent = false;
      doc.addEventListener('visibilitychange', onVisibility);
      return acquire();
    },
    async stop() {
      active = false;
      doc.removeEventListener('visibilitychange', onVisibility);
      const s = sentinel;
      sentinel = null;
      if (s) { try { await s.release(); } catch { /* swallow */ } }
    },
    held() { return sentinel != null; },
  };
}
