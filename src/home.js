// @ts-check
import { registerServiceWorker } from './sw-register.js';

const btn = /** @type {HTMLButtonElement} */ (document.getElementById('update'));
registerServiceWorker({ onUpdateReady(apply) { btn.hidden = false; btn.onclick = apply; } });
