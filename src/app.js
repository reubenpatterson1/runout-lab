// @ts-check
import { matchRoute } from './ui/router.js';
import { initUpdateBanner } from './ui/update-banner.js';
import * as study from './study/index.js';
import * as table from './table/index.js';

/**
 * @param {HTMLElement} el
 * @param {Record<string,string>} _params
 * @returns {() => void}
 */
function mountHome(el, _params) {
  el.innerHTML = `
<div class="hero">
  <div class="kicker">Training hub</div>
  <h1 class="title" tabindex="-1">Close the rack.<br><em>Win the safety battle.</em></h1>
  <p class="lede">Safety Studio is rebuilt. The other modules open the current version.</p>
</div>
<div class="grid g2">
  <a class="panel navcard" href="#/study"><h2 class="sub">Study</h2><p class="note">Simulated drills and theory at a desk or on your phone.</p></a>
  <a class="panel navcard" href="#/table"><h2 class="sub">Table</h2><p class="note">Run drills at a real table and log what happened.</p></a>
</div>`;
  return () => {};
}
const home = { mount: mountHome };

const SCREENS = { home, study, safety: home, table };

/** @type {() => void} */
let unmount = () => {};

/** @param {boolean} focus */
function show(focus) {
  const el = /** @type {HTMLElement} */ (document.getElementById('app'));
  const r = matchRoute(location.hash);
  if (!r.known) history.replaceState(null, '', '#/');
  unmount();
  el.replaceChildren();
  unmount = SCREENS[r.screen].mount(el, r.params);
  for (const a of document.querySelectorAll('nav.tabs a')) {
    if (r.screen === 'safety' && a.getAttribute('href') === '#/study/safety') {
      a.setAttribute('aria-current', 'page');
      a.classList.add('active');
    } else {
      a.removeAttribute('aria-current');
      a.classList.remove('active');
    }
  }
  if (focus) {
    scrollTo(0, 0);
    /** @type {HTMLElement|null} */ (el.querySelector('h1[tabindex="-1"]'))?.focus();
  }
}

show(false);
addEventListener('hashchange', () => show(true));
initUpdateBanner(/** @type {HTMLButtonElement} */ (document.getElementById('update')));
