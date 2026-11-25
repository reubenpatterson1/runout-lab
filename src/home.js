// @ts-check
import { registerServiceWorker } from './sw-register.js';
import { createWakeLock } from './ui/wake-lock.js';

const btn = /** @type {HTMLButtonElement} */ (document.getElementById('update'));
registerServiceWorker({ onUpdateReady(apply) { btn.hidden = false; btn.onclick = apply; } });

const wlBtn = /** @type {HTMLButtonElement} */ (document.getElementById('wl'));
const wlStatus = /** @type {HTMLElement} */ (document.getElementById('wl-status'));
const wakeLock = createWakeLock({
  onFallback(reason) {
    wlStatus.textContent = `Wake lock not available (${reason}). Set Auto-Lock to Never: Settings → Display & Brightness → Auto-Lock.`;
  },
});
let wlOn = false;
wlBtn.onclick = async () => {
  if (!wlOn) {
    wlOn = true;
    wlBtn.textContent = 'Stop wake-lock test';
    wlStatus.textContent = '';
    if (await wakeLock.start()) wlStatus.textContent = 'Held — the screen should stay on.';
  } else {
    wlOn = false;
    wlBtn.textContent = 'Start wake-lock test';
    wlStatus.textContent = '';
    await wakeLock.stop();
  }
};
