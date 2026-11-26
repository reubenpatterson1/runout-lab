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
/** @type {PerformanceObserver | null} */
let observer = null;
if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
  longTaskSupported = true;
  observer = new PerformanceObserver((list) => { longTasks += list.getEntries().length; });
  observer.observe({ type: 'longtask', buffered: true });
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
  /** @type {number[]} */ const replay = [];
  /** @type {number[]} */ const scoreMs = [];
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
    t = performance.now();
    await c.simulate(e.layout, e.best.shot);
    replay.push(performance.now() - t);
    t = performance.now();
    await c.score(e.layout, e.best.shot);
    scoreMs.push(performance.now() - t);
    print(`${e.family} ${e.band} ${e.id} seeded ${f1(sMs)} total ${r.best.score.total} (stored ${e.best.score.total}) unseeded ${f1(uMs)}`);
  }
  await new Promise((res) => requestAnimationFrame(() => res(undefined)));
  tracking = false;
  c.terminate();

  const seededMax = seeded.length ? Math.max(...seeded) : 0;
  const replayMax = replay.length ? Math.max(...replay) : 0;
  const scoreMax = scoreMs.length ? Math.max(...scoreMs) : 0;
  const unseededMax = unseeded.length ? Math.max(...unseeded) : 0;
  if (info.timing) print(`bank load ${f1(loadMs)} (fetch ${f1(fetchMs)}, parse ${f1(parseMs)} in worker)`);
  else print(`bank load ${f1(loadMs)} (fetch n/a, parse n/a in worker)`);
  print(`worker round trip median ${f1(median(rt))} max ${f1(Math.max(...rt))}`);
  print(`hint replay round trip median ${f1(median(replay))} max ${f1(replayMax)} ≤ 250: ${replayMax <= 250 ? 'PASS' : 'FAIL'}`);
  print(`score round trip median ${f1(median(scoreMs))} max ${f1(scoreMax)} (report only)`);
  print(`seeded suggest median ${f1(median(seeded))} max ${f1(seededMax)} (report only; hints use the stored best since 2026-11-25)`);
  print(`seeded suggest below stored: ${below} (must be 0): ${below === 0 ? 'PASS' : 'FAIL'}`);
  print(`unseeded suggest median ${f1(median(unseeded))} max ${f1(unseededMax)} (report only)`);
  if (longTaskSupported && observer) longTasks += observer.takeRecords().length;
  if (longTaskSupported) print(`main-thread long tasks: ${longTasks} (must be 0): ${longTasks === 0 ? 'PASS' : 'FAIL'}`);
  else print('main-thread long tasks: n/a (longtask API unsupported; use max rAF gap)');
  print(`max rAF gap ${f1(maxGap)}`);
  print('DONE');
}

main().catch((err) => { print(`ERROR ${err && err.message}`); print('DONE'); });
