// @ts-check
import { registerServiceWorker } from '../sw-register.js';

/**
 * @param {HTMLButtonElement} btn
 * @param {typeof registerServiceWorker} [register]
 * @returns {Promise<ServiceWorkerRegistration|null>}
 */
export function initUpdateBanner(btn, register = registerServiceWorker) {
  return register({ onUpdateReady(apply) { btn.hidden = false; btn.onclick = apply; } });
}
