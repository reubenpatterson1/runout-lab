// @ts-check
import { createSearchClient } from '../src/search/client.js';

const outEl = /** @type {HTMLElement} */ (document.getElementById('out'));
/** @param {string} s */
const print = (s) => { outEl.textContent += s + '\n'; };
/** @param {number} x */
const f1 = (x) => x.toFixed(1);
/** @param {number[]} a */
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const n = s.length;
  return n === 0 ? 0 : n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};

let longTasks = 0;
let longTaskSupported = false;
if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
  longTaskSupported = true;
  new PerformanceObserver((list) => { longTasks += list.getEntries().length; }).observe({ type: 'longtask', buffered: true });
} else {
  print('longtask API unsupported');
}

let maxGap = 0;
let tracking = true;
let lastFrame = performance.now();
/** @param {number} now */
const frame = (now) => {
  maxGap = Math.max(maxGap, now - lastFrame);
  lastFrame = now;
  if (tracking) requestAnimationFrame(frame);
};

async function main() {
  const c = createSearchClient();
  requestAnimationFrame((now) => { lastFrame = now; requestAnimationFrame(frame); });
  let t = performance.now();
  const info = await c.info();
  const loadMs = performance.now() - t;
  const fetchMs = info.timing ? info.timing.fetchMs : 0;
  const parseMs = info.timing ? info.timing.parseMs : 0;

  const firstId = (await c.sample(1))[0].id;
  /** @type {number[]} */ const rt = [];
  for (let i = 0; i < 20; i++) {
    t = performance.now();
    await c.byId(firstId);
    rt.push(performance.now() - t);
  }

  const cases = await c.sample(2);
  /** @type {number[]} */ const seeded = [];
  /** @type {number[]} */ const unseeded = [];
  let below = 0;
  for (const e of cases) {
    t = performance.now();
    const r = await c.suggest(e.layout, e.best);
    const sMs = performance.now() - t;
    seeded.push(sMs);
    if (r.best.score.total < e.best.score.total) below++;
    t = performance.now();
    await c.suggest(e.layout);
    const uMs = performance.now() - t;
    unseeded.push(uMs);
    print(`${e.family} ${e.band} ${e.id} seeded ${f1(sMs)} total ${r.best.score.total} (stored ${e.best.score.total}) unseeded ${f1(uMs)}`);
  }
  tracking = false;
  c.terminate();

  const seededMax = seeded.length ? Math.max(...seeded) : 0;
  const unseededMax = unseeded.length ? Math.max(...unseeded) : 0;
  print(`bank load ${f1(loadMs)} (fetch ${f1(fetchMs)}, parse ${f1(parseMs)} in worker)`);
  print(`worker round trip median ${f1(median(rt))} max ${f1(Math.max(...rt))}`);
  print(`seeded suggest max ${f1(seededMax)} ≤ 1500: ${seededMax <= 1500 ? 'PASS' : 'FAIL'}`);
  print(`seeded suggest below stored: ${below} (must be 0): ${below === 0 ? 'PASS' : 'FAIL'}`);
  print(`unseeded suggest median ${f1(median(unseeded))} max ${f1(unseededMax)} (report only)`);
  if (longTaskSupported) print(`main-thread long tasks: ${longTasks} (must be 0): ${longTasks === 0 ? 'PASS' : 'FAIL'}`);
  else print('main-thread long tasks: n/a (must be 0): FAIL');
  print(`max rAF gap ${f1(maxGap)}`);
  print('DONE');
}

main().catch((err) => { print(`ERROR ${err && err.message}`); print('DONE'); });
