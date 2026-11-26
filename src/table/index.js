// @ts-check
import { createWakeLock } from '../ui/wake-lock.js';

/**
 * @param {HTMLElement} el
 * @param {Record<string,string>} _params
 * @returns {() => void}
 */
export function mount(el, _params) {
  el.innerHTML = `
<div class="door">
  <div class="hero">
    <h1 class="title" tabindex="-1">Table</h1>
    <p class="lede">Run drills at a real table. Until the new drill screens ship, drills open the current version.</p>
  </div>
  <div class="grid">
    <a class="panel navcard" href="legacy/index.html#drills"><h2 class="sub">Table Drills</h2>
      <ul>
        <li>Stop-Shot Ladder</li>
        <li>Up-and-Down Speed Control</li>
        <li>Wagon Wheel</li>
        <li>Progressive Ghost</li>
        <li>Key-Ball End Game</li>
        <li>Insurance Breakout</li>
        <li>Hide-Behind-Target</li>
        <li>Line-of-Balls Mirror Kick</li>
      </ul>
      <p class="note">Logs in the current version last for this visit only.</p></a>
    <section class="panel"><h2 class="sub">Wake lock check</h2><p class="note">Keeps the screen on while you're at the table.</p><p style="margin:12px 0 0"><button id="wl" class="btn">Start wake-lock test</button></p><p id="wl-status" class="hint" role="status"></p></section>
  </div>
</div>`;
  const wlBtn = /** @type {HTMLButtonElement} */ (el.querySelector('#wl'));
  const wlStatus = /** @type {HTMLElement} */ (el.querySelector('#wl-status'));
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
  return () => { wakeLock.stop(); };
}
