// @ts-check
/**
 * @param {{nav?: Navigator, url?: string, scope?: string, onUpdateReady: (apply: () => void) => void, reload?: () => void}} opts
 * @returns {Promise<ServiceWorkerRegistration|null>}
 */
export async function registerServiceWorker(opts) {
  const nav = opts.nav ?? navigator;
  const reload = opts.reload ?? (() => location.reload());
  const sw = nav.serviceWorker;
  if (!sw) return null;
  let reg;
  try {
    reg = await sw.register(opts.url ?? './sw.js', { type: 'module', scope: opts.scope ?? './', updateViaCache: 'none' });
  } catch {
    return null;
  }
  let applying = false, reloaded = false;
  /** @param {ServiceWorker} w */
  const offer = (w) => opts.onUpdateReady(() => { applying = true; w.postMessage({ type: 'SKIP_WAITING' }); });
  if (reg.waiting && sw.controller) offer(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const w = reg.installing;
    if (!w) return;
    w.addEventListener('statechange', () => {
      if (w.state === 'installed' && sw.controller) offer(w);
    });
  });
  sw.addEventListener('controllerchange', () => {
    if (applying && !reloaded) { reloaded = true; reload(); }
  });
  return reg;
}
