# Runout Lab Stage 1a — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build everything in Stage 1 that does not depend on the visual look. That covers the repo restructure (legacy app kept live, offline and self-hosted fonts), a true-scale physics engine, geometry, safety evaluation, a search worker, seeded validated deals, offline/update plumbing, session store and wake-lock logic, a performance harness and the owner acceptance checklist.

**Architecture:** Static ES modules with no build step, served by GitHub Pages from the repo root. The pure, deterministic layers stack upward: `engine` ← `geometry` ← `eval` ← `search` ← `deal`. They run unchanged in node tests and inside a module Web Worker. The browser glue (service worker, registration, wake lock, session store) takes its platform objects as injected dependencies so node can test it with stubs.

**Tech Stack:** Vanilla JS (ES2022 modules, `// @ts-check` + JSDoc), `node --test` (Node ≥ 22; dev machine v26.8.2), Web Worker (`type: 'module'`), Service Worker (`type: 'module'`), Cache Storage, Screen Wake Lock API, localStorage. No runtime or dev dependencies.

**Spec:** `/Users/reubenpatterson/pool_drills/runout-lab/docs/superpowers/specs/2026-11-24-runout-lab-rebuild-design.md` (§§8–10, 13, 15, 18a, 20).

## Global Constraints

1. Table playing surface is 100 × 50 in. Coordinates: x points right (0→100), y points down (0→50), units are inches. Ball R = 1.125 in. Corner mouth 4.5 in, side mouth 5.0 in.
2. `aimDeg`: 0 = +x, 90 = +y (down the screen). `spin.x` > 0 = right english. `spin.y` > 0 = follow, < 0 = draw. |spin| ≤ 1; larger values are scaled to the unit disk. `speed` = initial cue-ball speed in in/s, clamped to [1, 250].
3. Every `.js` file is an ES module whose first line is `// @ts-check`. The exception is `sw.js`, where it is line 2 because line 1 is the version line. No TypeScript, no build step, no dependencies.
4. `package.json` is exactly `{"name":"runout-lab","private":true,"type":"module","scripts":{"test":"node --test \"test/**/*.test.js\""}}`.
5. `src/engine`, `src/geometry`, `src/eval`, `src/search`, `src/deal` never use DOM, `window`, `Math.random` or `Date`. The same inputs always give identical outputs.
6. "Shipped" means every file except: paths with any segment starting with `.`; the top-level dirs `test/`, `docs/`, `scripts/`, `bench/`, `node_modules/`; and the top-level files `package.json`, `package-lock.json`, `README.md`, `CLAUDE.md`, `LICENSE`. Every shipped file appears in `FILES` in `src/precache.js`.
7. After changing any shipped file, run `node scripts/stamp.js`, then `npm test`. Both must be green before every commit.
8. Offline: cache name `runout-lab-v<VERSION>`; cache-first; old `runout-lab-v*` caches deleted on activate. Update prompt text is exactly `New version available — tap to reload`.
9. Safety score runs 0–100; a "good safety" is total ≥ 70. Robustness grid: speed ×{0.92, 1, 1.08} × aim {−0.4, 0, +0.4}°.
10. Deals: at most 25 attempts, then a fixed layout. Bands come from the share of the difficulty grid with score ≥ 70: easy > 0.15, medium 0.04–0.15, hard < 0.04. A session is 10 deals: 3 easy, 4 medium, 3 hard, shuffled. Fallback rate < 1% over 500 seeds per family.
11. Budgets under desktop Chrome with 4× CPU throttle: `findDeal` ≤ 1500 ms and `suggest` ≤ 1500 ms. Zero main-thread long tasks (> 50 ms) during search. In the app, search runs only in the worker.
12. No Google Fonts and no other third-party origin anywhere. Fonts are self-hosted in `fonts/` under OFL 1.1.
13. Escalation: if a pinned test or budget fails after following this plan exactly (tolerances, validity rates, fixed-layout validation, bench), stop and report the measured numbers to the caller. Do not retune constants, weights, grids or generator ranges.
14. Work on branch `stage-1a`. Every commit: `git commit -m "<subject>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.

## Review Focus

1. Balls frozen together or frozen to a rail at true scale (zero-gap contacts, Newton's-cradle chains, a frozen ball driven into a rail). Pinned in Task 6, `test/engine-physics.test.js` "RF1".
2. Simultaneous collisions (cue reaching two balls at the same instant; a frozen triangle). Must settle, stay deterministic, and not hit the zero-time cascade cap. Pinned in Task 6 "RF2".
3. A ball exactly at a pocket jaw (rolling frozen along the rail into a corner, head-on into a jaw point, shallow side-pocket approach, a layout ball past a mouth line). Pinned in Task 7 "RF3" and Task 4.
4. The deal generator placing overlapping, off-table or in-pocket balls (500 seeds × 8 families × 3 bands). Pinned in Task 12 "RF4".
5. A service worker stuck on an old version (waiting worker at load, single reload on `controllerchange`, old caches deleted, `sw.js` version line in step with `VERSION`). Pinned in Task 3 "RF5".

## Core data shapes (`src/types.js`, defined once and imported via JSDoc everywhere)

```js
// @ts-check
/** @typedef {{id: string, x: number, y: number}} Ball */
/** @typedef {{kind: 'designated'|'8ball'|'9ball', legalIds: string[], opponentIds?: string[]}} Rules */
/** @typedef {{balls: Ball[], cueId: string, rules: Rules}} Layout */
/** @typedef {{aimDeg: number, speed: number, spin: {x: number, y: number}}} Shot */
/** @typedef {{t: number, type: 'ball'|'cushion'|'jaw'|'pocket'|'roll'|'stop', a: string, b?: string|number, x: number, y: number, va?: {x:number,y:number}, vb?: {x:number,y:number}}} SimEvent */
/** @typedef {{trajectories: Record<string, {t:number,x:number,y:number}[]>, events: SimEvent[], final: Ball[], firstContactId: string|null, railsAfterContact: number, cueRailsBeforeContact: number, pocketed: string[], scratch: boolean, duration: number, settled: boolean}} SimResult */
/** @typedef {{rails: 0|1|2|3, n1: number, w1: number, n2: number, w2: number, K: number}} KickInfo */
/** @typedef {'scratch'|'wrong-ball-first'|'no-rail'|'ob-pocketed'} Gate */
/** @typedef {{total: number, gate?: Gate, V: number, directThreat: number, kick: KickInfo, cueRestriction: number, robustness: {scores: number[], sd: number}, label: 'Forgiving'|'Touchy'|null}} SafetyScore */
/** @typedef {'easy'|'medium'|'hard'} Band */
/** @typedef {{shot: Shot, score: SafetyScore}} Scored */
/** @typedef {{best: Scored|null, cheapCount: number, shareGe70: number}} SuggestResult */
/** @typedef {{ok: boolean, best: Scored|null, share: number, band: Band}} Validation */
/** @typedef {{family: number, seed: number, requestedBand: Band, band: Band, layout: Layout, validation: Validation, attempts: number, fallback: boolean, fixedName?: string}} DealResult */
export {};
```

Event `b` meaning: for `ball` events it is the other ball's id; for `cushion` the cushion index (0–5); for `jaw` the jaw index (0–11); for `pocket` the pocket index (0–5). `x, y` is ball `a`'s centre. `va`/`vb` (ball events only) are post-impact velocities.

## File Structure

| Path (repo root `/Users/reubenpatterson/pool_drills/runout-lab/`) | Responsibility |
|---|---|
| `index.html` | Placeholder home: links to every legacy module, manifest, SW registration, update button, wake-lock check |
| `runout-lab.html` | Redirect stub to `./` |
| `legacy/index.html` | Current app (moved), self-hosted fonts, `#<tab>` deep links, SW registration |
| `fonts/fonts.css`, `fonts/*.woff2` (4), `fonts/OFL-*.txt` (3) | Self-hosted Oswald, Archivo, Space Mono plus their licences |
| `manifest.webmanifest`, `icons/*.png` (4) | Install metadata and icons |
| `sw.js` | Module service worker wiring (line 1 = version) |
| `src/precache.js` | `VERSION`, `HASH`, `CACHE_PREFIX`, `FILES` |
| `src/sw-core.js` | Testable install/activate/fetch/skipWaiting logic |
| `src/sw-register.js` | Registration plus waiting-worker → update signal |
| `src/home.js` | Placeholder-home glue (update button, wake-lock check) |
| `src/types.js` | Shared JSDoc typedefs |
| `src/engine/constants.js` | Table, ball, friction, cushion and loop constants |
| `src/engine/table.js` | Cushion segments, jaws, pockets, `mouthDistance` |
| `src/engine/layout.js` | `validateLayout` |
| `src/engine/motion.js` | `strike`, `advanceBall` (sliding → rolling → stopped, analytic) |
| `src/engine/cushion.js` | `cushionRebound` (speed- and english-dependent) |
| `src/engine/simulate.js` | Event-driven fixed-step `simulate` |
| `src/geometry/clearance.js` | `segmentPointDistance`, `clearance` |
| `src/geometry/visibility.js` | `firstBallOnRay`, `visibility` (V) |
| `src/geometry/kick-lanes.js` | `mirrorLanes` (cheap), `lanesFromSamples` |
| `src/eval/kick.js` | `kickLanes` (engine sweep) |
| `src/eval/position.js` | `kickEase`, `combineScore`, `directThreat`, `cueRestriction`, `scorePosition` |
| `src/eval/safety.js` | `gateFor`, `opponentTargets`, `aggregate`, `scoreSafety`, `ROBUST_GRID` |
| `src/search/grid.js` | `SUGGEST_GRID`, `DIFFICULTY_GRID`, `linspace`, `candidateShots` |
| `src/search/search.js` | `runSearch`, `suggest`, `validateDeal`, `classify`, `K_FULL` |
| `src/search/handle.js`, `worker.js`, `client.js` | Worker protocol, worker shim, main-thread client |
| `src/deal/prng.js` | `mulberry32`, `hashSeed`, `shuffle` |
| `src/deal/families.js` | `BANDS`, `FAMILIES`, `unitBalls`, `generate`, `dealSeedFor`, `parseDealSeed`, `dealFromSeed` |
| `src/deal/fixed.js` | `FIXED_LAYOUTS` (legacy SCEN at true scale) |
| `src/deal/deal.js` | `findDeal`, `sessionPlan`, `MAX_ATTEMPTS` |
| `src/ui/session-store.js`, `src/ui/wake-lock.js` | Session persistence; wake lock with fallback signal |
| `scripts/shipped.js`, `scripts/stamp.js`, `scripts/make-icons.js`, `scripts/bench.js` | Shipped-file list and hash; stamping; icon PNG generator; node bench |
| `bench/index.html`, `bench/bench.js`, `bench/workloads.js` | Browser perf harness (run under 4× throttle) |
| `docs/acceptance-checklist.md` | Owner hand-off checklist |
| `package.json` | Test script only |
| `test/*.test.js`, `test/helpers.js`, `test/deal-500/*` | Tests (never shipped) |

---

### Task 1: Repo restructure — legacy move, self-hosted fonts, placeholder home, redirect

**Files:**
- Create: `legacy/index.html` (via `git mv index.html legacy/index.html`), `index.html`, `fonts/fonts.css`, `fonts/oswald-latin.woff2`, `fonts/archivo-latin.woff2`, `fonts/spacemono-400-latin.woff2`, `fonts/spacemono-700-latin.woff2`, `fonts/OFL-Oswald.txt`, `fonts/OFL-Archivo.txt`, `fonts/OFL-SpaceMono.txt`, `package.json`
- Modify: `runout-lab.html` (replaced by the stub), `legacy/index.html` (3 edits)
- Test: `test/site.test.js`

**Interfaces:**
- Produces: the deep-link contract `legacy/index.html#<id>` with `<id>` ∈ `plan, position, closer, safety, escape, decide, drills` (the legacy `TABS` ids).

- [ ] **Step 0: Snapshot and branch.** Run `tar -czf ~/runout-lab-snapshot-2026-11-24.tgz -C /Users/reubenpatterson/pool_drills runout-lab && cd /Users/reubenpatterson/pool_drills/runout-lab && git checkout -b stage-1a`.
- [ ] **Step 1: Write the failing test** `test/site.test.js`:

```js
// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const IDS = ['plan', 'position', 'closer', 'safety', 'escape', 'decide', 'drills'];

test('home links every legacy module in one tap', () => {
  const html = read('index.html');
  for (const id of IDS) assert.ok(html.includes(`href="legacy/index.html#${id}"`), id);
  assert.ok(!/user-scalable=no|maximum-scale/.test(html));
});
test('legacy page is the old app, self-hosted fonts, deep links', () => {
  const html = read('legacy/index.html');
  assert.ok(html.includes("const TABS=[['plan','Diagnosis']"));
  assert.ok(!/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(html));
  assert.ok(html.includes('<link rel="stylesheet" href="../fonts/fonts.css">'));
  assert.ok(html.includes('function showFromHash()'));
});
test('runout-lab.html is a redirect stub to ./', () => {
  const html = read('runout-lab.html');
  assert.ok(html.length < 1000);
  assert.ok(html.includes("location.replace('./')") && html.includes('url=./'));
});
test('fonts are woff2 with OFL licences', () => {
  for (const f of ['oswald-latin', 'archivo-latin', 'spacemono-400-latin', 'spacemono-700-latin']) {
    const buf = readFileSync(new URL(`fonts/${f}.woff2`, root));
    assert.equal(buf.subarray(0, 4).toString('latin1'), 'wOF2'); assert.ok(buf.length > 5000);
    assert.ok(read('fonts/fonts.css').includes(`url("${f}.woff2")`));
  }
  for (const n of ['Oswald', 'Archivo', 'SpaceMono']) assert.match(read(`fonts/OFL-${n}.txt`), /SIL Open Font License/i);
});
test('package.json holds only the test script', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.deepEqual(Object.keys(pkg.scripts), ['test']);
  assert.ok(!pkg.dependencies && !pkg.devDependencies);
});
```

- [ ] **Step 2: Run** `node --test test/site.test.js`. Expected: FAIL (`legacy/index.html` missing).
- [ ] **Step 3: Implement.**
  1. Move the app: `git mv index.html legacy/index.html`.
  2. In `legacy/index.html`, replace the three lines `<link rel="preconnect" href="https://fonts.googleapis.com">`, `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` and the `fonts.googleapis.com/css2?...` stylesheet line with one line: `<link rel="stylesheet" href="../fonts/fonts.css">`.
  3. In `legacy/index.html`, insert this between the final `};` (which closes `INIT.drills`) and the final `</script>`:
     ```js
     /* deep links from the new home: legacy/index.html#<tab id> */
     function showFromHash(){var id=location.hash.slice(1);if(TABS.some(function(t){return t[0]===id;}))show(id);}
     showFromHash();window.addEventListener('hashchange',showFromHash);
     ```
     No other legacy edits.
  4. Download the fonts and licences (sizes verified 2026-11-24: 28456, 34940, 9464 and 9552 bytes):
     ```
     mkdir -p fonts
     curl -fsSL -o fonts/oswald-latin.woff2 https://fonts.gstatic.com/s/oswald/v57/TK3iWkUHHAIjg752GT8Gl-1PKw.woff2
     curl -fsSL -o fonts/archivo-latin.woff2 https://fonts.gstatic.com/s/archivo/v25/k3kPo8UDI-1M0wlSV9XAw6lQkqWY8Q82sLydOxKsv4Rn.woff2
     curl -fsSL -o fonts/spacemono-400-latin.woff2 https://fonts.gstatic.com/s/spacemono/v17/i7dPIFZifjKcF5UAWdDRYEF8RXi4EwQ.woff2
     curl -fsSL -o fonts/spacemono-700-latin.woff2 https://fonts.gstatic.com/s/spacemono/v17/i7dMIFZifjKcF5UAWdDRaPpZUFWaHi6WZ3Q.woff2
     curl -fsSL -o fonts/OFL-Oswald.txt https://raw.githubusercontent.com/google/fonts/main/ofl/oswald/OFL.txt
     curl -fsSL -o fonts/OFL-Archivo.txt https://raw.githubusercontent.com/google/fonts/main/ofl/archivo/OFL.txt
     curl -fsSL -o fonts/OFL-SpaceMono.txt https://raw.githubusercontent.com/google/fonts/main/ofl/spacemono/OFL.txt
     ```
  5. Create `fonts/fonts.css` with four `@font-face` rules, all `font-style:normal; font-display:swap`:
     - `"Oswald"`, weight `300 700`, `url("oswald-latin.woff2") format("woff2")`
     - `"Archivo"`, weight `400 700`, `font-stretch:100%`, `url("archivo-latin.woff2")`
     - `"Space Mono"`, weight `400`, `url("spacemono-400-latin.woff2")`
     - `"Space Mono"`, weight `700`, `url("spacemono-700-latin.woff2")`
  6. Create `index.html`:
     - `<!DOCTYPE html>`, `lang="en"`, UTF-8, `<meta name="viewport" content="width=device-width, initial-scale=1">`, `<title>Runout Lab</title>`, `<meta name="theme-color" content="#0a0e0c">`.
     - Inline `<style>`: `body{font-family:system-ui,sans-serif;max-width:40rem;margin:0 auto;padding:1rem;line-height:1.5} a{display:inline-block;min-height:44px;padding:10px 0}`.
     - `<main>`:
       - `<h1>Runout Lab</h1>`
       - `<p>The new app is being built. Every module below opens the current version.</p>`
       - `<h2>Study</h2>` with a list of links `legacy/index.html#plan` "Diagnosis", `#position` "Position Lab", `#closer` "The Closer", `#safety` "Safety Studio", `#escape` "Escape Trainer", `#decide` "Run or Safe?"
       - `<h2>Table</h2>` with one link `legacy/index.html#drills` "Table Drills"
  7. Overwrite `runout-lab.html`:
     ```html
     <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Runout Lab</title><meta http-equiv="refresh" content="0; url=./"><script>location.replace('./');</script></head><body><p><a href="./">Runout Lab has moved. Open it here.</a></p></body></html>
     ```
  8. Write `package.json` exactly as in Global Constraint 4.
- [ ] **Step 4: Run** `node --test test/site.test.js`. Expected: PASS. Manual check: run `npx serve -l 3000 .`, then open `http://localhost:3000/legacy/index.html#safety`. The Safety Studio tab should be active, and the DevTools Network panel should show no `googleapis`/`gstatic` requests.
- [ ] **Step 5: Commit.** `git add index.html legacy/index.html runout-lab.html fonts package.json test/site.test.js && git commit -m "Move app to legacy/, self-host fonts, placeholder home, redirect stub" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 2: Install metadata, icons, precache list and stamp

**Files:**
- Create: `manifest.webmanifest`, `scripts/make-icons.js`, `icons/icon-192.png`, `icons/icon-512.png`, `icons/icon-maskable-512.png`, `icons/apple-touch-icon-180.png`, `scripts/shipped.js`, `scripts/stamp.js`, `src/precache.js`
- Modify: `index.html` (head links)
- Test: `test/precache.test.js`

**Interfaces:**
- Produces:
  - `scripts/shipped.js`:
    - `listShipped(root: string): string[]` — sorted POSIX relative paths
    - `contentHash(root: string, files?: string[]): string` — sha256 hex
  - `scripts/stamp.js`: `stamp(root: string, opts?: {write?: boolean}): {changed: boolean, version: number, hash: string}`
  - `src/precache.js`: `VERSION: number`, `HASH: string`, `CACHE_PREFIX = 'runout-lab-v'`, `FILES: string[]`

- [ ] **Step 1: Write the failing test** `test/precache.test.js`:

```js
// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { listShipped, contentHash } from '../scripts/shipped.js';
import { stamp } from '../scripts/stamp.js';
import { VERSION, HASH, FILES, CACHE_PREFIX } from '../src/precache.js';
const root = fileURLToPath(new URL('../', import.meta.url));

test('every shipped file is listed and every listed file exists', () => {
  assert.equal(FILES[0], './'); assert.equal(new Set(FILES).size, FILES.length);
  const listed = FILES.slice(1);
  assert.deepEqual([...listed].sort(), listShipped(root));
  for (const f of listed) assert.ok(existsSync(root + f) && statSync(root + f).isFile(), f);
});
test('content hash is not stale (run node scripts/stamp.js)', () => {
  assert.equal(HASH, contentHash(root)); assert.equal(stamp(root, { write: false }).changed, false);
});
test('cache prefix and version', () => { assert.equal(CACHE_PREFIX, 'runout-lab-v'); assert.ok(Number.isInteger(VERSION) && VERSION >= 1); });
test('manifest is installable and icons are real PNGs', () => {
  const m = JSON.parse(readFileSync(root + 'manifest.webmanifest', 'utf8'));
  assert.equal(m.start_url, './'); assert.equal(m.scope, './'); assert.equal(m.display, 'standalone');
  const sizes = { 'icons/icon-192.png': 192, 'icons/icon-512.png': 512, 'icons/icon-maskable-512.png': 512, 'icons/apple-touch-icon-180.png': 180 };
  for (const [p, s] of Object.entries(sizes)) {
    const b = readFileSync(root + p);
    assert.equal(b.subarray(1, 4).toString('latin1'), 'PNG'); assert.equal(b.readUInt32BE(16), s); assert.equal(b.readUInt32BE(20), s);
  }
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
});
test('listShipped excludes non-shipped paths', () => {
  const s = listShipped(root);
  assert.ok(!s.some((p) => /^(test|docs|scripts|bench|node_modules)\//.test(p) || p.split('/').some((x) => x.startsWith('.')) || p === 'package.json'));
});
```

- [ ] **Step 2: Run** `node --test test/precache.test.js`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement.**
  1. **`scripts/shipped.js`.**
     - `listShipped` walks `root` recursively with `readdirSync(withFileTypes)`. It skips any entry whose name starts with `.`. At top level it also skips the dirs `test`, `docs`, `scripts`, `bench`, `node_modules` and the files `package.json`, `package-lock.json`, `README.md`, `CLAUDE.md`, `LICENSE`. It returns POSIX paths sorted with default JS `sort()`.
     - `contentHash` uses `createHash('sha256')`. For each file in order except `src/precache.js` it does `update(path)`, `update('\0')`, `update(bytes)`, `update('\0')`. For `sw.js` the bytes are everything after the first `\n`.
  2. **`scripts/stamp.js`.** `stamp` reads `src/precache.js` and parses `export const VERSION = (\d+);` and `export const HASH = '([0-9a-f]*)';`.
     - If the hash differs from `contentHash(root)`: increment `VERSION`, replace `HASH`, and (when `write !== false`) write the file.
     - Always (when writing and `sw.js` exists): replace line 1 of `sw.js` with `// runout-lab sw v${VERSION}`.
     - Returns `{changed, version, hash}`.
     - When run as main (`import.meta.url === pathToFileURL(process.argv[1]).href`) it calls `stamp(<repo root>)` and logs `stamped v<N>` or `up to date v<N>`.
  3. **`src/precache.js`.** First line `// @ts-check`, then a comment saying "edited only by node scripts/stamp.js", then `export const VERSION = 0;`, `export const HASH = '';`, `export const CACHE_PREFIX = 'runout-lab-v';` and `export const FILES = ['./', ...]`. FILES lists, sorted: `fonts/OFL-Archivo.txt`, `fonts/OFL-Oswald.txt`, `fonts/OFL-SpaceMono.txt`, `fonts/archivo-latin.woff2`, `fonts/fonts.css`, `fonts/oswald-latin.woff2`, `fonts/spacemono-400-latin.woff2`, `fonts/spacemono-700-latin.woff2`, `icons/apple-touch-icon-180.png`, `icons/icon-192.png`, `icons/icon-512.png`, `icons/icon-maskable-512.png`, `index.html`, `legacy/index.html`, `manifest.webmanifest`, `runout-lab.html`, `src/precache.js`.
  4. **`scripts/make-icons.js`** (node, uses `zlib.deflateSync`).
     - It writes the 4 PNGs at the sizes above as RGBA 8-bit. Rows use filter byte 0. Chunks are IHDR (colour type 6), IDAT and IEND, each with a CRC-32 from a standard table.
     - Design: background `#0f3122`; centred disc `#f2eedd` with radius 0.34·S (maskable: 0.26·S); centred dot `#cf4631` with radius 0.12 × the disc radius. Supersample 4×4 per pixel.
     - Run `node scripts/make-icons.js`.
  5. **`manifest.webmanifest`:** `{"name":"Runout Lab","short_name":"Runout Lab","description":"Close the rack. Win the safety battle.","start_url":"./","scope":"./","display":"standalone","background_color":"#0a0e0c","theme_color":"#0a0e0c","icons":[{"src":"icons/icon-192.png","sizes":"192x192","type":"image/png","purpose":"any"},{"src":"icons/icon-512.png","sizes":"512x512","type":"image/png","purpose":"any"},{"src":"icons/icon-maskable-512.png","sizes":"512x512","type":"image/png","purpose":"maskable"}]}`.
  6. **`index.html` head:** add `<link rel="manifest" href="manifest.webmanifest">`, `<link rel="apple-touch-icon" href="icons/apple-touch-icon-180.png">`, `<meta name="apple-mobile-web-app-capable" content="yes">` and `<meta name="apple-mobile-web-app-title" content="Runout Lab">`.
  7. Run `node scripts/stamp.js` (sets VERSION 1).
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit.** `git add manifest.webmanifest icons scripts/make-icons.js scripts/shipped.js scripts/stamp.js src/precache.js index.html test/precache.test.js && git commit -m "Add manifest, icons, precache list and content-hash stamp" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 3: Service worker and update signal (Review Focus 5)

**Files:**
- Create: `src/sw-core.js`, `sw.js`, `src/sw-register.js`, `src/home.js`
- Modify: `index.html`, `legacy/index.html`, `src/precache.js` (FILES), `test/precache.test.js`
- Test: `test/sw.test.js`

**Interfaces:**
- Consumes: `VERSION`, `FILES`, `CACHE_PREFIX`.
- Produces:
  - `makeHandlers(deps: {version: number, files: string[], prefix: string, base: string, origin: string, caches: CacheStorage, fetch: (r: Request) => Promise<Response>, skipWaiting: () => void, claim: () => Promise<void>}): {install(): Promise<void>, activate(): Promise<void>, respond(req: Request): Promise<Response>|null, skipWaiting(): void}`
  - `registerServiceWorker(opts: {nav?: Navigator, url?: string, scope?: string, onUpdateReady: (apply: () => void) => void, reload?: () => void}): Promise<ServiceWorkerRegistration|null>`

- [ ] **Step 1: Write the failing test** `test/sw.test.js`. Fakes: `caches` is a Map of name → cache, where a cache is a Map url → Response and has `addAll(reqs)`, `match(req, opts)`, `put`. `nav` is built on `EventTarget`.

```js
// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeHandlers } from '../src/sw-core.js';
import { registerServiceWorker } from '../src/sw-register.js';
function fakeCaches(names = []) { /* Map-backed CacheStorage: open, keys, delete; each cache records addAll Requests */ }
const base = 'https://x.test/app/sw.js', origin = 'https://x.test';
const mk = (caches, fetch = async () => new Response('net')) => makeHandlers({ version: 7, files: ['./', 'index.html'], prefix: 'runout-lab-v', base, origin, caches, fetch, skipWaiting() {}, claim: async () => {} });

test('install precaches every file with cache:reload into runout-lab-v7', async () => {
  const c = fakeCaches(); await mk(c).install();
  const reqs = c.added('runout-lab-v7');
  assert.deepEqual(reqs.map((r) => r.url), ['https://x.test/app/', 'https://x.test/app/index.html']);
  assert.ok(reqs.every((r) => r.cache === 'reload'));
});
test('RF5 activate deletes old versioned caches only', async () => {
  const c = fakeCaches(['runout-lab-v6', 'runout-lab-v7', 'other']); await mk(c).activate();
  assert.deepEqual(await c.keys(), ['runout-lab-v7', 'other']);
});
test('respond: cache-first, GET same-origin only, navigate offline falls back to index.html', async () => {
  /* hit → cached body, fetch not called; miss → fetch; POST → null; cross-origin → null;
     navigate miss with fetch rejecting → cached index.html */
});
test('RF5 waiting worker at load → update signal → SKIP_WAITING → exactly one reload', async () => {
  /* nav.serviceWorker.controller set; register resolves reg with waiting={postMessage spy};
     onUpdateReady called once; apply() posts {type:'SKIP_WAITING'};
     dispatch 'controllerchange' twice → reload called once */
});
test('RF5 controllerchange without apply does not reload; first install (no controller) does not signal', async () => {});
test('RF5 updatefound → installed with controller → signal', async () => {});
test('no serviceWorker support or register rejection resolves null', async () => {});
```

  Add one test to `test/precache.test.js`: `'RF5 sw.js line 1 matches VERSION'`, asserting `readFileSync(root + 'sw.js','utf8').split('\n')[0] === \`// runout-lab sw v${VERSION}\``.
- [ ] **Step 2: Run** `node --test test/sw.test.js test/precache.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  1. **`src/sw-core.js`.** All URLs resolve via `new URL(f, base).href`; `current = prefix + version`.
     - `install`: open `current`, then `addAll(files.map(f => new Request(new URL(f, base).href, {cache: 'reload'})))`.
     - `activate`: delete every key that starts with `prefix` and is not `current`, then `claim()`.
     - `respond(req)`: return `null` unless `req.method === 'GET'` and `new URL(req.url).origin === origin`. Otherwise return a promise: `cache.match(req, {ignoreSearch: true})` → hit, or else `fetch(req)`. If that fetch rejects and `req.mode === 'navigate'`, return `cache.match(new URL('index.html', base).href)`; any other rejection propagates.
     - `skipWaiting()` calls `deps.skipWaiting()`.
  2. **`sw.js`.** Line 1: `// runout-lab sw v0`. Line 2: `// @ts-check`. Then import from `./src/precache.js` and `./src/sw-core.js` and call `makeHandlers` with:
     - `{version: VERSION, files: FILES, prefix: CACHE_PREFIX, base: self.location.href, origin: self.location.origin, caches: self.caches, fetch: (r) => self.fetch(r), skipWaiting: () => self.skipWaiting(), claim: () => self.clients.claim()}`.

     Wire the events:
     - `install` → `e.waitUntil(h.install())`
     - `activate` → `e.waitUntil(h.activate())`
     - `fetch` → `const r = h.respond(e.request); if (r) e.respondWith(r)`
     - `message` with `data.type === 'SKIP_WAITING'` → `h.skipWaiting()`

     No automatic `skipWaiting` on install.
  3. **`src/sw-register.js`.**
     - Without `nav.serviceWorker`, return `null`.
     - Call `reg = await nav.serviceWorker.register(url ?? './sw.js', {type: 'module', scope: scope ?? './', updateViaCache: 'none'})`; on rejection return `null`.
     - Define `offer(w)`, which calls `onUpdateReady(() => { applying = true; w.postMessage({type: 'SKIP_WAITING'}); })`.
     - If `reg.waiting && nav.serviceWorker.controller`, call `offer(reg.waiting)`.
     - On `updatefound`, watch `reg.installing` for `statechange`. When its state is `'installed'` and `nav.serviceWorker.controller` is set, call `offer`.
     - On `controllerchange`: if `applying && !reloaded`, set `reloaded = true` and call `reload()`. The default `reload` is `() => location.reload()`.
     - Return `reg`.
  4. **`src/home.js`.** Call `registerServiceWorker({onUpdateReady(apply) { btn.hidden = false; btn.onclick = apply; }})`, where `btn = document.getElementById('update')`.
  5. **`index.html`.** Add `<button id="update" hidden>New version available — tap to reload</button>` as the first child of `<main>`, and `<script type="module" src="src/home.js"></script>` before `</body>`.
  6. **`legacy/index.html`.** After the final `</script>`, add `<script>if('serviceWorker' in navigator){navigator.serviceWorker.register('../sw.js',{type:'module',scope:'../',updateViaCache:'none'}).catch(function(){});}</script>`.
  7. Add `sw.js`, `src/home.js`, `src/sw-core.js`, `src/sw-register.js` to FILES (sorted), then run `node scripts/stamp.js`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS. Manual check: with `npx serve -l 3000 .`, the DevTools Application panel shows the SW activated, cache `runout-lab-vN` holds all FILES, and the manifest is installable.
- [ ] **Step 5: Commit.** `git add sw.js src/sw-core.js src/sw-register.js src/home.js src/precache.js index.html legacy/index.html test/sw.test.js test/precache.test.js && git commit -m "Service worker: versioned cache-first precache with update signal" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 4: Engine foundation — types, constants, table geometry, layout validation

**Files:**
- Create: `src/types.js`, `src/engine/constants.js`, `src/engine/table.js`, `src/engine/layout.js`
- Modify: `src/precache.js`
- Test: `test/engine-table.test.js`

**Interfaces:**
- Produces:
  - `src/engine/constants.js` exports:
    - Table and ball: `W=100, H=50, R=1.125, CORNER_MOUTH=4.5, SIDE_MOUTH=5.0, G=386.09`
    - Friction and collisions: `MU_SLIDE=0.2, MU_ROLL=0.01, SPIN_DECAY=20` (in/s² on wz), `E_BALL=1`, `TIP=1.25` (spin velocity factor)
    - Loop limits and tolerances: `DT=0.01, MAX_T=60, MAX_EVENTS=5000, MAX_ZERO_TIME=100, EPS_V=1e-9, EPS_D=1e-9, EPS_LAYOUT=0.01, POCKET_NEAR=8`
    - Speed and cushion: `SPEED_MIN=1, SPEED_MAX=250, V_REST=0.5, CUSHION={E_HI:0.92,E_SLOPE:0.0012,E_MIN:0.70,TAU_HI:0.97,TAU_SLOPE:0.004,TAU_MIN:0.55,ENGLISH:0.2,SPIN_KEEP:0.5}`
  - `src/engine/table.js` (with `a = CORNER_MOUTH/√2 = 3.181980515339464`):
    - `CUSHIONS: {ax,ay,bx,by,nx,ny}[]`, 6 entries, `n` = outward normal pointing into the cushion, in this order:
      1. top (a,0)→(47.5,0), n (0,−1)
      2. top (52.5,0)→(100−a,0), n (0,−1)
      3. bottom (a,50)→(47.5,50), n (0,1)
      4. bottom (52.5,50)→(100−a,50), n (0,1)
      5. left (0,a)→(0,50−a), n (−1,0)
      6. right (100,a)→(100,50−a), n (1,0)
    - `JAWS: {x,y}[]`, 12 entries in pocket order:
      - TL: (a,0), (0,a)
      - TS: (47.5,0), (52.5,0)
      - TR: (100−a,0), (100,a)
      - BL: (0,50−a), (a,50)
      - BS: (47.5,50), (52.5,50)
      - BR: (100−a,50), (100,50−a)
    - `POCKETS: {x,y,kind:'corner'|'side',jaws:[number,number],out:{x,y}}[]` in order TL, TS, TR, BL, BS, BR. `x,y` = midpoint of the two jaws. `out` = unit outward normal of the mouth line: TL (−1,−1)/√2, TS (0,−1), TR (1,−1)/√2, BL (−1,1)/√2, BS (0,1), BR (1,1)/√2.
    - `mouthDistance(x, y, i): number` = `((x,y) − POCKETS[i])·out`; positive means past the mouth.
  - `src/engine/layout.js`: `validateLayout(layout: Layout): {ok: true} | {ok: false, reason: 'missing-cue'|'duplicate-id'|'unknown-legal-id'|'off-table'|'in-pocket'|'overlap'}`. Checks run in this order:
    1. Cue id present.
    2. Ids unique.
    3. Every id in `legalIds` (and in `opponentIds` if present) exists.
    4. `off-table` if x ∉ [0,W] or y ∉ [0,H], or the distance from the centre to any CUSHIONS segment (finite segment, endpoints included) is < R − EPS_LAYOUT.
    5. `in-pocket` if `mouthDistance > 0` for any pocket within POCKET_NEAR.
    6. `overlap` if any pair distance is < 2R − EPS_LAYOUT.

- [ ] **Step 1: Write the failing test** `test/engine-table.test.js`:

```js
// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { R, W, H, CORNER_MOUTH, SIDE_MOUTH } from '../src/engine/constants.js';
import { CUSHIONS, JAWS, POCKETS, mouthDistance } from '../src/engine/table.js';
import { validateLayout } from '../src/engine/layout.js';
const L = (balls, legalIds = ['ob']) => ({ balls, cueId: 'cue', rules: { kind: 'designated', legalIds } });
test('true-scale 9 ft table', () => { assert.equal(R, 1.125); assert.equal(W, 100); assert.equal(H, 50); assert.equal(CORNER_MOUTH, 4.5); assert.equal(SIDE_MOUTH, 5.0); });
test('pocket mouths are 4.5 in (corner) and 5.0 in (side)', () => {
  assert.equal(CUSHIONS.length, 6); assert.equal(JAWS.length, 12);
  for (const p of POCKETS) { const [i, j] = p.jaws; const m = Math.hypot(JAWS[i].x - JAWS[j].x, JAWS[i].y - JAWS[j].y);
    assert.ok(Math.abs(m - (p.kind === 'corner' ? 4.5 : 5.0)) < 1e-9); }
  assert.ok(Math.abs(JAWS[0].x - 3.181980515339464) < 1e-12);
});
test('mouthDistance sign', () => { assert.ok(mouthDistance(1, 1, 0) > 0); assert.ok(mouthDistance(5, 5, 0) < 0); assert.ok(mouthDistance(50, -0.1, 1) > 0); });
test('validateLayout accepts frozen pair and rail-frozen ball, tolerates 0.005 overlap', () => {
  assert.deepEqual(validateLayout(L([{ id: 'cue', x: R, y: 25 }, { id: 'ob', x: 50, y: 25 }, { id: 'b1', x: 50 + 2 * R, y: 25 }])), { ok: true });
  assert.deepEqual(validateLayout(L([{ id: 'cue', x: 20, y: 25 }, { id: 'ob', x: 20 + 2 * R - 0.005, y: 25 }])), { ok: true });
});
test('validateLayout rejections', () => {
  const r = (balls, legal) => validateLayout(L(balls, legal)).reason;
  assert.equal(r([{ id: 'ob', x: 50, y: 25 }]), 'missing-cue');
  assert.equal(r([{ id: 'cue', x: 20, y: 25 }, { id: 'cue', x: 60, y: 25 }], []), 'duplicate-id');
  assert.equal(r([{ id: 'cue', x: 20, y: 25 }], ['ob']), 'unknown-legal-id');
  assert.equal(r([{ id: 'cue', x: 0.5, y: 25 }], []), 'off-table');
  assert.equal(r([{ id: 'cue', x: 1.2, y: 1.2 }], []), 'in-pocket');
  assert.equal(r([{ id: 'cue', x: 20, y: 25 }, { id: 'ob', x: 20 + 2 * R - 0.02, y: 25 }]), 'overlap');
});
```

- [ ] **Step 2: Run** `node --test test/engine-table.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the four files exactly as in Interfaces (`src/types.js` = the Core data shapes block). Add `src/types.js`, `src/engine/constants.js`, `src/engine/layout.js`, `src/engine/table.js` to FILES, then run `node scripts/stamp.js`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit.** `git add src/types.js src/engine/constants.js src/engine/table.js src/engine/layout.js src/precache.js test/engine-table.test.js && git commit -m "Engine: true-scale table geometry and layout validation" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 5: Engine motion (slide → roll → stop) and cushion response

**Files:**
- Create: `src/engine/motion.js`, `src/engine/cushion.js`
- Modify: `src/precache.js`
- Test: `test/engine-motion.test.js`

**Interfaces:**
- Produces:
  - `/** @typedef {{id:string,x:number,y:number,vx:number,vy:number,wx:number,wy:number,wz:number,state:'stopped'|'sliding'|'rolling'|'pocketed'}} BallState */` (in `motion.js`). `w = (wx,wy)` is the spin's contact-free "rolling velocity" in in/s, so the ball is rolling iff v = w. `wz` is side spin in in/s, positive = right english, counter-clockwise viewed from above.
  - `strike(shot: Shot): {vx,vy,wx,wy,wz,state}`, defined as:
    - d = (cos aimDeg, sin aimDeg); v = clamp(speed, SPEED_MIN, SPEED_MAX)·d
    - spin scaled into the unit disk; w = TIP·speed·spin.y·d; wz = TIP·speed·spin.x
    - state = |v−w| < 1e-9 ? 'rolling' : 'sliding'
  - `advanceBall(b: BallState, dt: number): {roll?: number, stop?: number}` mutates `b` analytically and returns the offsets within `dt` at which the ball began rolling or stopped. Physics:
    - Sliding: u = v − w; dv/dt = −μs·g·û; dw/dt = +2.5·μs·g·û; position p += v·τ − ½μs·g·û·τ². The ball rolls after t_r = |u|/(3.5·μs·g); at that moment set w := v exactly.
    - Rolling: dv/dt = −μr·g·v̂ with w = v; stops after |v|/(μr·g), then v = w = 0 and state 'stopped'.
    - wz → sign(wz)·max(0, |wz| − SPIN_DECAY·τ) in every state.
  - `cushionRebound(c: {vn: number, vt: number, wz: number}): {vn: number, vt: number, wz: number}`. Input vn > 0 means moving into the cushion. If vn < V_REST, return `{vn: 0, vt, wz}`. Otherwise:
    - e = clamp(E_HI − E_SLOPE·vn, E_MIN, E_HI); τ = clamp(TAU_HI − TAU_SLOPE·vn, TAU_MIN, TAU_HI)
    - return `{vn: −e·vn, vt: τ·vt − ENGLISH·wz, wz: SPIN_KEEP·wz}`

    Frame convention (used by simulate): n = outward normal; t̂ = (n.y, −n.x); vt = v·t̂. Positive wz moves the contact point along +t̂, so english is running iff sign(wz) = −sign(vt).

- [ ] **Step 1: Write the failing test** `test/engine-motion.test.js`:

```js
// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strike, advanceBall } from '../src/engine/motion.js';
import { cushionRebound } from '../src/engine/cushion.js';
const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const outDeg = (r) => (Math.atan2(Math.abs(r.vt), Math.abs(r.vn)) * 180) / Math.PI;
const at45 = (s, wz = 0) => cushionRebound({ vn: s * Math.SQRT1_2, vt: s * Math.SQRT1_2, wz });

test('strike: centre ball slides, 0.8 follow is natural roll, english sets wz', () => {
  const c = strike({ aimDeg: 0, speed: 50, spin: { x: 0, y: 0 } }); assert.equal(c.state, 'sliding'); near(c.vx, 50, 1e-12); near(c.wx, 0, 1e-12);
  assert.equal(strike({ aimDeg: 0, speed: 50, spin: { x: 0, y: 0.8 } }).state, 'rolling');
  near(strike({ aimDeg: 0, speed: 50, spin: { x: 1, y: 0 } }).wz, 62.5, 1e-9);
  near(strike({ aimDeg: 0, speed: 50, spin: { x: 0, y: -1 } }).wx, -62.5, 1e-9);
  near(Math.hypot(strike({ aimDeg: 0, speed: 40, spin: { x: 1, y: 1 } }).wz, strike({ aimDeg: 0, speed: 40, spin: { x: 1, y: 1 } }).wx), 50, 1e-9);
});
test('sliding centre-ball reaches 5/7 speed at t_r = |u|/(3.5 mu g), then rolls to a stop', () => {
  const b = { id: 'cue', x: 10, y: 25, state: 'sliding', ...strike({ aimDeg: 0, speed: 50, spin: { x: 0, y: 0 } }) };
  const tr = 50 / (3.5 * 0.2 * 386.09); const r = advanceBall(b, tr + 1e-9);
  near(r.roll, tr, 1e-6); assert.equal(b.state, 'rolling'); near(Math.hypot(b.vx, b.vy), (5 / 7) * 50, 1e-4);
  const s = advanceBall(b, 30); assert.equal(b.state, 'stopped'); near(s.stop, ((5 / 7) * 50) / (0.01 * 386.09), 1e-4);
  near(b.x, 10 + (50 * tr - 0.5 * 77.218 * tr * tr) + ((5 / 7) * 50) ** 2 / (2 * 3.8609), 1e-3);
});
test('side spin decays at 20 in/s^2 and never moves a stopped ball', () => {
  const b = { id: 'o', x: 30, y: 30, vx: 0, vy: 0, wx: 0, wy: 0, wz: 30, state: 'stopped' };
  advanceBall(b, 1); near(b.wz, 10, 1e-9); assert.equal(b.x, 30); advanceBall(b, 1); assert.equal(b.wz, 0);
});
test('Cushions: soft spinless near mirror (within 2 deg)', () => { near(outDeg(at45(10)), 45, 2); });
test('Cushions: harder rebounds shorter (at least 5 deg short at 150 in/s)', () => { assert.ok(outDeg(at45(150)) <= 40); assert.ok(outDeg(at45(150)) < outDeg(at45(10))); });
test('Cushions: running english lengthens, reverse shortens (>= 3 deg)', () => {
  const none = outDeg(at45(40)); assert.ok(outDeg(at45(40, -30)) >= none + 3); assert.ok(outDeg(at45(40, 30)) <= none - 3);
});
test('Cushions: below V_REST the ball does not bounce', () => { assert.equal(cushionRebound({ vn: 0.3, vt: 5, wz: 0 }).vn, 0); });
```

- [ ] **Step 2: Run** `node --test test/engine-motion.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** per Interfaces; within a single `advanceBall` call, apply phase transitions in order: slide, then roll, then stop. Add `src/engine/cushion.js` and `src/engine/motion.js` to FILES, then run `node scripts/stamp.js`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit.** `git add src/engine/motion.js src/engine/cushion.js src/precache.js test/engine-motion.test.js && git commit -m "Engine: analytic slide-roll-stop motion and speed/english cushion model" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 6: Engine simulate — event loop, ball and cushion collisions, §15 physics (RF1, RF2)

**Files:**
- Create: `src/engine/simulate.js`, `test/helpers.js`
- Modify: `src/precache.js`
- Test: `test/engine-physics.test.js`

**Interfaces:**
- Consumes: `strike`, `advanceBall`, `cushionRebound`, `CUSHIONS`, `JAWS`, `validateLayout`, constants.
- Produces: `simulate(layout: Layout, shot: Shot, opts?: {record?: boolean, stopAtFirstContact?: boolean, maxCushions?: number}): SimResult`. It throws `Error('invalid layout: <reason>')` when `validateLayout` fails. In this task `pocketed` is `[]` and `scratch` is `false` (capture comes in Task 7).
- `test/helpers.js` exports:
  - Layout builders: `B(id,x,y)`, `L(balls, legalIds=['ob'], kind='designated', opponentIds?)` (cueId `'cue'`)
  - Angles: `deg(rad)`, `aimAt(a,b)`, `fullnessAim(cue, ob, f, side=1)` = `aimAt + side·deg(asin(2R(1−f)/|ob−cue|))`, `angleDeg(u,v)`
  - Queries: `ev(sim, pred)`, `polylineDistance(points, p)`
  - Randomness: `mulberry(seed)` (test-only copy of mulberry32), `randomLayout(seed, n)` (cue plus `o1..o(n−1)` uniform in [5,95]×[5,45] with centre distance ≥ 2R+0.1, legal `['o1']`)

- [ ] **Step 1: Write the failing test** `test/engine-physics.test.js`. Throughout, "first cue stop after contact" means `ev(sim, e => e.type === 'stop' && e.a === 'cue' && e.t > contact.t)`.

```js
// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../src/engine/simulate.js';
import { validateLayout } from '../src/engine/layout.js';
import { R, MAX_T, MAX_EVENTS } from '../src/engine/constants.js';
import { B, L, aimAt, fullnessAim, angleDeg, ev, polylineDistance, mulberry, randomLayout } from './helpers.js';
const shot = (aimDeg, speed, x = 0, y = 0) => ({ aimDeg, speed, spin: { x, y } });
const contactOf = (s, id = 'ob') => ev(s, (e) => e.type === 'ball' && (e.a === 'cue' || e.b === 'cue') && (e.a === id || e.b === id));
const stopAfter = (s, t) => ev(s, (e) => e.type === 'stop' && e.a === 'cue' && e.t > t);
const rollAfter = (s, t) => ev(s, (e) => e.type === 'roll' && e.a === 'cue' && e.t > t);

test('Stop shot: straight-in stun stops within 0.25 ball-widths of contact', () => {
  const s = simulate(L([B('cue', 45.5, 25), B('ob', 50, 25)]), shot(0, 80));
  const c = contactOf(s), st = stopAfter(s, c.t); assert.ok(Math.hypot(st.x - c.x, st.y - c.y) <= 0.25 * 2 * R);
});
test('Stun cut: cue leaves along the tangent line within 2 deg', () => {
  const cue = B('cue', 40, 25), ob = B('ob', 46, 25), s = simulate(L([cue, ob]), shot(fullnessAim(cue, ob, 0.5), 80));
  const c = contactOf(s), p = s.trajectories.cue.find((q) => q.t >= c.t + 0.1);
  const n = { x: ob.x - c.x, y: ob.y - c.y }, tan = { x: -n.y, y: n.x }, d = { x: p.x - c.x, y: p.y - c.y };
  assert.ok(Math.min(angleDeg(d, tan), angleDeg(d, { x: -tan.x, y: -tan.y })) <= 2);
});
test('30 deg rule: rolling half-ball 30±4, quarter and three-quarter 27–36', () => {
  for (const [f, lo, hi] of [[0.5, 26, 34], [0.25, 27, 36], [0.75, 27, 36]]) {
    const cue = B('cue', 20, 25), ob = B('ob', 40, 25), aim = fullnessAim(cue, ob, f);
    const s = simulate(L([cue, ob]), shot(aim, 20, 0, 0.8)), c = contactOf(s), r = rollAfter(s, c.t), st = stopAfter(s, r.t);
    const a = angleDeg({ x: Math.cos((aim * Math.PI) / 180), y: Math.sin((aim * Math.PI) / 180) }, { x: st.x - r.x, y: st.y - r.y });
    assert.ok(a >= lo && a <= hi, `f=${f} a=${a}`);
  }
});
test('Draw: twice the distance comes back measurably less', () => {
  const back = (x0) => { const s = simulate(L([B('cue', x0, 25), B('ob', 52, 25)]), shot(0, 50, 0, -1)); const c = contactOf(s); return c.x - stopAfter(s, c.t).x; };
  const d10 = back(42), d20 = back(32); assert.ok(d10 > 2 * R); assert.ok(d20 < d10 - 2 * R);
});
test('Cushions (engine): running english lengthens off the top rail', () => {
  const xAt = (sx) => { const s = simulate(L([B('cue', 30, 30)], []), shot(-45, 60, sx, 0)); const k = ev(s, (e) => e.type === 'cushion' && e.a === 'cue');
    return s.trajectories.cue.find((q) => q.t >= k.t + 0.3).x; };
  assert.ok(xAt(0.8) > xAt(0) && xAt(0) > xAt(-0.8));
});
test('Kicks: firm one-rail mirror kick misses the mirror target by more than one ball-width', () => {
  const target = { x: 75, y: 15 }, aim = aimAt({ x: 25, y: 15 }, { x: 75, y: 2 * (50 - R) - 15 });
  const s = simulate(L([B('cue', 25, 15)], []), shot(aim, 120)), k = ev(s, (e) => e.type === 'cushion' && e.a === 'cue');
  assert.ok(polylineDistance(s.trajectories.cue.filter((q) => q.t >= k.t), target) > 2 * R);
});
test('Blockers in the path get hit and move', () => {
  const s = simulate(L([B('cue', 20, 25), B('b1', 40, 25), B('ob', 60, 25)]), shot(0, 60));
  assert.equal(s.firstContactId, 'b1'); const b1 = s.final.find((b) => b.id === 'b1'); assert.ok(Math.hypot(b1.x - 40, b1.y - 25) > 2);
});
test('RF1 frozen pair: Newton cradle in one instant', () => {
  const s = simulate(L([B('cue', 30, 25), B('ob', 50, 25), B('b1', 50 + 2 * R, 25)]), shot(0, 40));
  const e1 = contactOf(s), e2 = ev(s, (e) => e.type === 'ball' && [e.a, e.b].sort().join() === 'b1,ob');
  assert.ok(Math.abs(e2.t - e1.t) < 1e-9); const f = Object.fromEntries(s.final.map((b) => [b.id, b]));
  assert.ok(Math.hypot(f.ob.x - 50, f.ob.y - 25) < 1); assert.ok(f.b1.x - (50 + 2 * R) > 5);
});
test('RF1 rail-frozen ball driven into the rail rebounds in the same instant', () => {
  const s = simulate(L([B('cue', 30, 40), B('ob', 30, 50 - R)]), shot(90, 30)), c = contactOf(s);
  assert.ok(ev(s, (e) => e.type === 'cushion' && e.a === 'ob' && Math.abs(e.t - c.t) < 1e-9)); assert.ok(s.settled);
  assert.ok(validateLayout({ ...L(s.final), rules: { kind: 'designated', legalIds: ['ob'] } }).ok);
});
test('RF1 ball rolling frozen along a rail makes no cushion events', () => {
  const s = simulate(L([B('cue', 20, R)], []), shot(0, 30)); assert.equal(s.events.filter((e) => e.type === 'cushion').length, 0);
  assert.ok(Math.abs(s.final[0].y - R) < 1e-9);
});
test('RF2 simultaneous two-ball contact: both hit at one instant, settles, deterministic', () => {
  const lay = L([B('cue', 20, 25), B('ob', 40, 25 - 1.2), B('b1', 40, 25 + 1.2)]), a = simulate(lay, shot(0, 50));
  const ta = contactOf(a, 'ob').t, tb = contactOf(a, 'b1').t; assert.ok(Math.abs(ta - tb) < 1e-9); assert.ok(a.settled);
  assert.deepEqual(simulate(lay, shot(0, 50)), a);
});
test('RF2 frozen triangle break settles in bounded events', () => {
  const c = { x: 60, y: 25 }, rr = (2 * R) / Math.sqrt(3), tri = [0, 120, 240].map((k, i) => B(['ob', 'b1', 'b2'][i], c.x + rr * Math.cos(((180 + k) * Math.PI) / 180), c.y + rr * Math.sin(((180 + k) * Math.PI) / 180)));
  const s = simulate(L([B('cue', 30, 25), ...tri]), shot(0, 120)); assert.ok(s.settled); assert.ok(s.events.length < 200);
});
test('Determinism and termination: 200 random shots settle in bounded time', () => {
  const rnd = mulberry(42);
  for (let i = 0; i < 200; i++) {
    const lay = randomLayout(1000 + i, 6), sh = { aimDeg: rnd() * 360, speed: 10 + rnd() * 150, spin: { x: rnd() * 1.2 - 0.6, y: rnd() * 2 - 1 } };
    const s = simulate(lay, sh); assert.ok(s.settled && s.duration < MAX_T && s.events.length < MAX_EVENTS);
    if (i < 20) assert.deepEqual(simulate(lay, sh), s);
  }
});
```

- [ ] **Step 2: Run** `node --test test/engine-physics.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement `simulate`** (algorithm pinned here; the tests do not determine it):
  1. **Setup.** Validate the layout. Build `BallState[]` in layout order: the cue gets `strike(shot)`, every other ball is `'stopped'`. Set `t = 0`, `events = []`, `trajectories` (when `record !== false`, each ball starts with `{t:0,x,y}`; otherwise `{}`). Initialise `firstContactId = null`, `firstContactT = Infinity`, `railsAfterContact = 0`, `cueRails = 0` (merged count), `lastCueCushion = {idx:null, t:-1}`, `zeroRun = 0`.
  2. **Outer loop.** While some ball is `'sliding'` or `'rolling'`, `t < MAX_T` and `events.length < MAX_EVENTS`: set `rem = DT`, then run the inner loop while `rem > 1e-12`:
     1. For each moving ball, compute its analytic end state over `rem` (on a copy, via `advanceBall`) and its chord velocity `c = (end − start)/rem`. Stopped balls have `c = 0`.
     2. Find the earliest τ ∈ [0, rem] over these candidates:
        - **Ball pair** (at least one moving): Δp = pb − pa, Δc = cb − ca, approaching iff Δp·Δc < −EPS_V. Solve |Δp + Δc·τ| = 2R for the smaller root; if |Δp| ≤ 2R + EPS_D and approaching, τ = 0.
        - **Cushion segment** (moving ball): s = (A − p)·n, rate `cn = c·n`. Valid if `cn > EPS_V`; τ = max(0, (s − R)/cn), and the projection of p + cτ on the segment must lie strictly inside the open span.
        - **Jaw point:** |p + cτ − J| = R with (p − J)·c < −EPS_V; if the distance is already ≤ R + EPS_D and approaching, τ = 0.
     3. Break ties (|Δτ| ≤ 1e-12) by type order pocket < ball < cushion < jaw, then the lower ball index, then the lower partner index.
     4. **No event:** call `advanceBall(b, rem)` on every ball and push `roll`/`stop` events at `t + offset` with the ball's position at that instant (compute it with a second `advanceBall` on a copy for `offset`). Then set `t += rem` and break.
     5. **Event at τ:** advance all balls by τ the same way and set `t += τ, rem −= τ`. Resolve the one event:
        - **Ball:** n̂ = unit(pb − pa); rel = (va − vb)·n̂; Δ = (1+E_BALL)/2·rel; va −= Δn̂; vb += Δn̂; spins unchanged. Both balls become `'sliding'`, or `'rolling'` if |v − w| < 1e-9. Push `{type:'ball', a, b, x, y, va, vb}`, where `a` is the lower index. If `firstContactId === null` and one side is the cue, set `firstContactId` to the other id and `firstContactT = t`.
        - **Cushion/jaw:** n = segment normal, or unit(J − p) for a jaw; t̂ = (n.y, −n.x). Call `cushionRebound({vn: v·n, vt: v·t̂, wz})`, then set v = vt'·t̂ + vn'·n and wz = wz'. `w` is unchanged. The state becomes `'sliding'`, or `'rolling'` if |v−w| < 1e-9. Push `{type: 'cushion'|'jaw', a, b: index, x, y}`. If `t ≥ firstContactT`, increment `railsAfterContact`. If this is the cue and `firstContactId === null`, increment `cueRails` unless it is the same index as `lastCueCushion.idx` within 0.1 s; then update `lastCueCushion`.
     6. If τ ≤ 1e-12, increment `zeroRun`, else reset it to 0. If `zeroRun > MAX_ZERO_TIME`, stop with `settled = false`.
     7. Early stops: if `opts.stopAtFirstContact` and `firstContactId` was just set, stop with `settled = false`. If `cueRails > (opts.maxCushions ?? Infinity)`, stop with `settled = false`.
  3. **Recording.** When recording, append `{t,x,y}` after every outer step for every ball that was moving during it, and at every event for the balls it involves.
  4. **Finish.** `settled` = no ball moving and not stopped early. Append a final sample per ball. Stable-sort `events` by `t`. Return `{trajectories, events, final: on-table balls as {id,x,y} in layout order, firstContactId, railsAfterContact, cueRailsBeforeContact: cueRails, pocketed: [], scratch: false, duration: t, settled}`.
  5. Write `test/helpers.js` per Interfaces. Add `src/engine/simulate.js` to FILES, then run `node scripts/stamp.js`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS. If a §15 tolerance fails, apply Global Constraint 13 (report; do not retune).
- [ ] **Step 5: Commit.** `git add src/engine/simulate.js src/precache.js test/helpers.js test/engine-physics.test.js && git commit -m "Engine: event-driven fixed-step simulate with §15 physics tests" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 7: Engine pockets — mouth capture, scratch, jaw behaviour (RF3)

**Files:**
- Modify: `src/engine/simulate.js`, `src/precache.js` (stamp)
- Test: `test/engine-pockets.test.js`

**Interfaces:**
- Consumes: `POCKETS`, `mouthDistance`.
- Produces: `simulate` now fills `pocketed` (ids in capture order) and `scratch` (cue pocketed). Pocketed balls are removed from all later checks and from `final`.

- [ ] **Step 1: Write the failing test** `test/engine-pockets.test.js` (uses `B`, `L`, `aimAt` from helpers; `a = 4.5/Math.SQRT2`):

```js
// @ts-check
test('ball into the corner along the diagonal is pocketed; cue → scratch', () => {
  const s = simulate(L([B('cue', 8, 8)], []), { aimDeg: 225, speed: 30, spin: { x: 0, y: 0 } });
  assert.ok(s.scratch); assert.deepEqual(s.pocketed, ['cue']); assert.equal(ev(s, (e) => e.type === 'pocket').b, 0);
});
test('RF3 ball rolling frozen along the rail into the corner drops (jaw grazing is not a hit)', () => {
  const s = simulate(L([B('cue', 20, R)], []), { aimDeg: 180, speed: 40, spin: { x: 0, y: 0 } });
  assert.deepEqual(s.pocketed, ['cue']); assert.equal(s.events.filter((e) => e.type === 'jaw').length, 0);
});
test('RF3 head-on into a jaw point rebounds and stays on the table', () => {
  const s = simulate(L([B('cue', a, 10)], []), { aimDeg: 270, speed: 30, spin: { x: 0, y: 0 } });
  assert.equal(ev(s, (e) => e.type === 'jaw').b, 0); assert.deepEqual(s.pocketed, []); assert.ok(s.settled);
});
test('RF3 straight into the side pocket drops; 10-degree shallow approach hits the cushion first', () => {
  assert.deepEqual(simulate(L([B('cue', 50, 25)], []), { aimDeg: 270, speed: 40, spin: { x: 0, y: 0 } }).pocketed, ['cue']);
  const s = simulate(L([B('cue', 20, 30 * Math.tan(Math.PI / 18))], []), { aimDeg: -10, speed: 50, spin: { x: 0, y: 0 } });
  const first = s.events.find((e) => e.a === 'cue' && e.type !== 'roll' && e.type !== 'stop'); assert.equal(first.type, 'cushion'); assert.equal(first.b, 0);
});
test('object ball pocketed is reported, not scratch', () => {
  const s = simulate(L([B('cue', 80, 20), B('ob', 93, 7)]), { aimDeg: -45, speed: 60, spin: { x: 0, y: -1 } });
  assert.ok(s.pocketed.includes('ob')); assert.equal(s.scratch, false);
});
```

- [ ] **Step 2: Run** `node --test test/engine-pockets.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** Add a **mouth** candidate to the event search for each moving ball within POCKET_NEAR of `POCKETS[i]`. With m(τ) = `mouthDistance(p0) + (c·out)·τ`, the event fires when m0 ≤ 0, c·out > EPS_V and τ = −m0/(c·out) ≤ rem; it has the top tie priority. Resolve it as follows: state `'pocketed'`, v = w = 0, wz = 0; push `{type:'pocket', a: id, b: i, x, y}`; append the id to `pocketed`; set `scratch = true` if it is the cue. Pocketed balls are skipped by every later check and are left out of `final`. Run `node scripts/stamp.js`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit.** `git add src/engine/simulate.js src/precache.js test/engine-pockets.test.js && git commit -m "Engine: pocket capture by mouth geometry and approach, scratch" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 8: Geometry — clearance, visibility V, mirror kick lanes

**Files:**
- Create: `src/geometry/clearance.js`, `src/geometry/visibility.js`, `src/geometry/kick-lanes.js`
- Modify: `src/precache.js`
- Test: `test/geometry.test.js`

**Interfaces:**
- Produces:
  - `segmentPointDistance(p, a, b): number`
  - `clearance(a, b, balls: Ball[], excludeIds: string[]): number` = min over non-excluded balls of (segment distance − 2R); `Infinity` if there are none. Replaces the three legacy copies.
  - `firstBallOnRay(from: {x,y}, dir: {x,y} /*unit*/, balls: Ball[], excludeIds: string[]): {id: string, t: number} | null`. It sweeps a circle of radius 2R against ball centres and takes the smallest t ≥ 0. A ball already within 2R + 1e-9 with `dir·(B − from) > 0` hits at t = 0. If two balls are within 1e-9 of each other in t, return the non-target-agnostic lower layout index; `visibility` treats such a tie as blocked.
  - `V_SAMPLES = 32`. `visibility(from, target: Ball, balls, excludeIds): number` = hits/32. Sample i ∈ 0..31 uses offset b_i = 2R·(−1 + (2i+1)/32) and direction = rotate(unit(target − from), asin(clamp(b_i/L, −1, 1))) with L = |target − from|. A sample is a hit iff `firstBallOnRay` returns the target id and no other ball is within 1e-9 of the same t.
  - `lanesFromSamples(samples: (0|1|2)[], stepDeg: number): {n1, w1, n2, w2}`. It finds maximal circular runs of equal non-zero values (index 359 is adjacent to 0). n_r = number of runs with value r; w_r = longest run length × stepDeg (0 if none). An all-r array is one run.
  - `mirrorLanes(from, balls, targetIds: string[], excludeIds: string[]): {n1, w1, n2, w2}`, the cheap approximation:
    - **Reflection lines:** x = R, x = 100−R, y = R, y = 50−R.
    - **One-rail candidates:** each (rail, target). Image T′ = reflect(T); bounce P = intersection of from→T′ with the rail line.
    - **Two-rail candidates:** each ordered pair of distinct rails (12) × target. T2 = reflect(T, rail2); T12 = reflect(T2, rail1); P1 = intersect(from→T12, rail1); P2 = intersect(P1→T2, rail2).
    - **Validity:** each bounce lies inside the rail's cushion span shrunk by R at each end (top/bottom x ∈ [a+R, 47.5−R] ∪ [52.5+R, 100−a−R]; left/right y ∈ [a+R, 50−a−R]). Every leg has `clearance ≥ 0`, excluding `excludeIds`; the final leg also excludes the target.
    - **Width:** w = 2·deg(asin(min(1, 2R/L))), with L = |from − image|.
    - **Result:** n = count of valid candidates, w = max width.

- [ ] **Step 1: Write the failing test** `test/geometry.test.js`:

```js
// @ts-check
test('clearance', () => {
  const a = { x: 0, y: 0 }, b = { x: 10, y: 0 };
  assert.equal(clearance(a, b, [B('k', 5, 0)], []), -2 * R); near(clearance(a, b, [B('k', 5, 3 * R)], []), R, 1e-12);
  assert.equal(clearance(a, b, [B('k', 5, 0)], ['k']), Infinity);
});
test('visibility: open 1, hooked 0, half-blocked ~0.5, frozen-to-blocker 0', () => {
  const cue = B('cue', 30, 25), ob = B('ob', 60, 25), V = (blk) => visibility(cue, ob, [cue, ob, blk], ['cue']);
  assert.equal(visibility(cue, ob, [cue, ob], ['cue']), 1); assert.equal(V(B('b1', 36, 25)), 0);
  const h = V(B('b1', 36, 22.75)); assert.ok(h >= 0.4 && h <= 0.6, String(h)); assert.equal(V(B('b1', 30 + 2 * R, 25)), 0);
});
test('lanesFromSamples wraps circularly', () => {
  assert.deepEqual(lanesFromSamples([1, 1, 0, 0, 1], 1), { n1: 1, w1: 3, n2: 0, w2: 0 });
  assert.deepEqual(lanesFromSamples([2, 0, 2, 2, 0], 1), { n1: 0, w1: 0, n2: 2, w2: 2 });
});
test('mirrorLanes: open table has top, bottom and head-rail one-rail lanes; a blocker removes one', () => {
  const cue = B('cue', 30, 25), ob = B('ob', 60, 25);
  assert.equal(mirrorLanes(cue, [cue, ob], ['ob'], ['cue']).n1, 3);
  assert.equal(mirrorLanes(cue, [cue, ob, B('b1', 45, 2.5)], ['ob'], ['cue']).n1, 2);
});
```

- [ ] **Step 2: Run** `node --test test/geometry.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** per Interfaces (imports `R`, `W`, `H`, `CORNER_MOUTH` only). Add the three files to FILES, then run `node scripts/stamp.js`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit.** `git add src/geometry src/precache.js test/geometry.test.js && git commit -m "Geometry: clearance, visibility sweep, mirror kick lanes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 9: Evaluation — engine kick lanes and position scoring (fixtures 1–4)

**Files:**
- Create: `src/eval/kick.js`, `src/eval/position.js`
- Modify: `src/precache.js`
- Test: `test/eval-position.test.js`

**Interfaces:**
- Consumes: `simulate`, `visibility`, `firstBallOnRay`, `clearance`, `mirrorLanes`, `lanesFromSamples`, `POCKETS`.
- Produces:
  - `KICK_SPEED = 60`, `KICK_STEP_DEG = 1`.
  - `kickLanes(balls, cueId, targetIds): {n1, w1, n2, w2}`. For k = 0..359 with dir = (cos k°, sin k°):
    - Ray check: if `firstBallOnRay(cue, dir, balls, [cueId])` hits before the centre reaches a rail line, the sample is 0 with no simulation.
    - Otherwise run `simulate({balls, cueId, rules: {kind: 'designated', legalIds: targetIds}}, {aimDeg: k, speed: KICK_SPEED, spin: {x:0, y:0}}, {record: false, stopAtFirstContact: true, maxCushions: 2})`. The sample is `r = cueRailsBeforeContact` when r ∈ {1,2}, `!scratch` and `targetIds.includes(firstContactId)`; otherwise 0.
    - Return `lanesFromSamples(samples, 1)`.
  - `kickEase({n1,w1,n2,w2}): number`, with g(w) = clamp(w/6, 0, 1):
    - if n1 ≥ 1: min(0.85, 0.40 + 0.40·g(w1) + 0.05·(min(n1,3) − 1))
    - else if n2 ≥ 1: min(0.30, 0.10 + 0.15·g(w2) + 0.025·(min(n2,3) − 1))
    - else 0
  - `combineScore({V, D, K, Q}): number` = 100·clamp(0.55·H + 0.25·K·H + 0.20·Q − 0.60·D, 0, 1), with H = 1 − V (unrounded).
  - `cueRestriction(cue): number` = clamp(1 − railD/(4R), 0, 1), with railD = max(0, min(x−R, 100−R−x, y−R, 50−R−y)).
  - `directThreat(cue, target, balls, cueId, V): number`:
    - 0 if V = 0.
    - For each pocket p in POCKETS: u = unit(p − T); ghost G = T − 2R·u; cut = angle between (G − cue) and u.
    - Skip the pocket if cut > 75°; or `clearance(T, p, balls, [cueId, T.id]) < 0`; or `clearance(cue, G, balls, [cueId, T.id]) < 0`; or (side pocket and the angle between u and `p.out` > 60°).
    - ease_p = cos(cut)·f(|G − cue|)·f(|p − T|), where f(d) = clamp(1.1 − d/60, 0.15, 1).
    - D = V·(0.1 + 0.9·max ease_p), with max = 0 if no pocket qualifies.
  - `scorePosition(balls, cueId, targetIds, opts?: {cheap?: boolean, kick?: {n1,w1,n2,w2}}): {score, V, D, Q, kick: KickInfo}`:
    - V = max over targets of `visibility(cue, t, balls, [cueId])`; D = max over targets of `directThreat(…, V_t)`; Q = `cueRestriction(cue)`.
    - Lanes: if V === 1, all-zero lanes with K = 0; else `opts.kick ?? (cheap ? mirrorLanes(...) : kickLanes(...))`.
    - K = 1 − kickEase (0 when V === 1); rails = V > 0 ? 0 : n1 ? 1 : n2 ? 2 : 3.
    - score = `combineScore`.

- [ ] **Step 1: Write the failing test** `test/eval-position.test.js`:

```js
// @ts-check
test('fixture formula: full hook, frozen, no one-rail lane (worst two-rail case) ≥ 90', () => {
  const K = 1 - kickEase({ n1: 0, w1: 0, n2: 3, w2: 12 }); assert.ok(combineScore({ V: 0, D: 0, K, Q: 1 }) >= 90);
});
test('fixture formula: full hook, mid-table, one wide one-rail lane in 55–80', () => {
  for (const lanes of [{ n1: 1, w1: 6, n2: 0, w2: 0 }, { n1: 1, w1: 1, n2: 0, w2: 0 }, { n1: 3, w1: 6, n2: 2, w2: 6 }]) {
    const s = combineScore({ V: 0, D: 0, K: 1 - kickEase(lanes), Q: 0 }); assert.ok(s >= 55 && s <= 80, String(s)); }
});
test('Fixture 1 (layout): ringed OB, cue frozen on the head rail → ≥ 90, no one-rail lane', () => {
  const ring = [0, 1, 2, 3, 4, 5].map((k) => B(`b${k}`, 60 + 2 * R * Math.cos((k * Math.PI) / 3), 25 + 2 * R * Math.sin((k * Math.PI) / 3)));
  const p = scorePosition([B('cue', R, 25), B('ob', 60, 25), ...ring], 'cue', ['ob']);
  assert.equal(p.V, 0); assert.equal(p.kick.n1, 0); assert.ok(p.score >= 90);
});
test('Fixture 2 (layout): full hook mid-table with open one-rail lanes → 55–80', () => {
  const p = scorePosition([B('cue', 30, 25), B('b1', 36, 25), B('ob', 60, 25)], 'cue', ['ob']);
  assert.equal(p.V, 0); assert.ok(p.kick.n1 >= 1); assert.ok(p.score >= 55 && p.score <= 80, String(p.score));
});
test('Fixture 3: half-visible OB scores ≥ 30 below the same layout fully hooked', () => {
  const hooked = scorePosition([B('cue', 30, 25), B('b1', 36, 25), B('ob', 60, 25)], 'cue', ['ob']);
  const half = scorePosition([B('cue', 30, 25), B('b1', 36, 22.75), B('ob', 60, 25)], 'cue', ['ob']);
  assert.ok(half.V >= 0.4 && half.V <= 0.6); assert.ok(hooked.score - half.score >= 30);
});
test('Fixture 4: open OB near a pocket at short range ≤ 25', () => {
  const p = scorePosition([B('cue', 80, 20), B('ob', 93, 7)], 'cue', ['ob']); assert.equal(p.V, 1); assert.ok(p.score <= 25);
});
test('cue restriction is 100% when frozen and 0 mid-table', () => { assert.equal(cueRestriction({ x: R, y: 25 }), 1); assert.equal(cueRestriction({ x: 50, y: 25 }), 0); });
```

- [ ] **Step 2: Run** `node --test test/eval-position.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** per Interfaces. Add `src/eval/kick.js` and `src/eval/position.js` to FILES, then run `node scripts/stamp.js`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit.** `git add src/eval/kick.js src/eval/position.js src/precache.js test/eval-position.test.js && git commit -m "Eval: engine kick lanes and position scoring; fixtures 1-4" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 10: Evaluation — `scoreSafety`, gates, family rules, robustness (fixture 5)

**Files:**
- Create: `src/eval/safety.js`
- Modify: `src/precache.js`
- Test: `test/eval-safety.test.js`

**Interfaces:**
- Consumes: `simulate`, `scorePosition`.
- Produces:
  - `ROBUST_GRID: {speedF: number, aimOff: number}[]` = speedF ∈ [0.92, 1, 1.08] (outer loop) × aimOff ∈ [−0.4, 0, 0.4] (inner loop); nominal is index 4.
  - `gateFor(sim: SimResult, layout: Layout): Gate|null`. Checks in order:
    1. `'scratch'` if `sim.scratch`
    2. `'wrong-ball-first'` if `firstContactId` is null or not in `rules.legalIds`
    3. `'ob-pocketed'` if any non-cue id is in `pocketed`
    4. `'no-rail'` if `railsAfterContact === 0`
    5. otherwise `null`
  - `opponentTargets(rules: Rules, balls: Ball[], cueId: string): string[]`:
    - designated: `(opponentIds ?? legalIds)` filtered to balls on the table
    - `'8ball'`: `opponentIds` on the table; if none remain, `['8']` if the 8 is on the table, else `[]`
    - `'9ball'`: the lowest numeric id (`Number(id)`) among non-cue balls on the table
  - `aggregate(scores: number[], nominalGate: Gate|null): {total, sd, label}`. If `nominalGate` is set, return `{total: 0, sd, label: null}`. Otherwise total = round(mean); sd = population standard deviation; label = sd ≤ 12 ? 'Forgiving' : 'Touchy'.
  - `scoreSafety(layout: Layout, shot: Shot): SafetyScore`:
    - **Nominal run first:** `simulate(layout, shot, {record: false})`, then `gateFor`. If gated, return `{total: 0, gate, V: 0, directThreat: 0, cueRestriction: 0, kick: {rails: 3, n1: 0, w1: 0, n2: 0, w2: 0, K: 0}, robustness: {scores: [0,0,0,0,0,0,0,0,0], sd: 0}, label: null}`.
    - **Remaining 8 runs** use `{aimDeg: aim + aimOff, speed: speed·speedF, spin}`. A gated run scores 0; otherwise its score is `scorePosition(final, cueId, opponentTargets(...)).score`.
    - **Kick reuse:** pass `{kick: nominalLanes}` when the run's cue final and every target final are within 2.25 in of the nominal's and the target set is equal; otherwise compute the full kick lanes.
    - **Return:** the V, D, Q and kick of the nominal run, `robustness: {scores, sd}` (scores in ROBUST_GRID order), plus `aggregate` total and label.

- [ ] **Step 1: Write the failing test** `test/eval-safety.test.js`:

```js
// @ts-check
const sh = (aimDeg, speed, x = 0, y = 0) => ({ aimDeg, speed, spin: { x, y } });
test('Fixture 5: no rail after contact is always 0, shown as a foul', () => {
  const s = scoreSafety(L([B('cue', 40, 25), B('ob', 46, 25)]), sh(0, 12)); assert.equal(s.total, 0); assert.equal(s.gate, 'no-rail'); assert.equal(s.label, null);
});
test('gates: scratch, wrong ball first, ob pocketed', () => {
  assert.equal(scoreSafety(L([B('cue', 90, 40), B('ob', 20, 10)]), sh(aimAt({ x: 90, y: 40 }, { x: 100 - 4.5 / Math.SQRT2 / 2, y: 50 - 4.5 / Math.SQRT2 / 2 }), 40)).gate, 'scratch');
  assert.equal(scoreSafety(L([B('cue', 20, 25), B('b1', 40, 25), B('ob', 60, 25)]), sh(0, 40)).gate, 'wrong-ball-first');
  assert.equal(scoreSafety(L([B('cue', 80, 20), B('ob', 93, 7)]), sh(-45, 60, 0, -1)).gate, 'ob-pocketed');
});
test('aggregate: nominal gate forces 0 even when other runs score', () => {
  assert.equal(aggregate([80, 80, 80, 80, 0, 80, 80, 80, 80], 'no-rail').total, 0);
  const a = aggregate([70, 72, 74, 70, 72, 74, 70, 72, 74], null); assert.equal(a.total, 72); assert.equal(a.label, 'Forgiving');
  assert.equal(aggregate([0, 100, 0, 100, 50, 100, 0, 100, 0], null).label, 'Touchy');
});
test('opponent targets per family rules', () => {
  const balls = [B('cue', 10, 10), B('3', 20, 20), B('10', 30, 30), B('9', 40, 40), B('8', 50, 25)];
  assert.deepEqual(opponentTargets({ kind: 'designated', legalIds: ['ob'] }, [B('cue', 1, 1), B('ob', 9, 9)], 'cue'), ['ob']);
  assert.deepEqual(opponentTargets({ kind: '8ball', legalIds: ['3'], opponentIds: ['9', '10', '11'] }, balls, 'cue'), ['10', '9']);
  assert.deepEqual(opponentTargets({ kind: '8ball', legalIds: ['3'], opponentIds: ['11'] }, balls, 'cue'), ['8']);
  assert.deepEqual(opponentTargets({ kind: '9ball', legalIds: ['3'] }, balls, 'cue'), ['3']);
});
test('robustness: nine runs on the 3x3 grid, total is their rounded mean', () => {
  const s = scoreSafety(L([B('cue', 30, 25), B('ob', 50, 20)]), sh(fullnessAim(B('cue', 30, 25), B('ob', 50, 20), 0.5), 40));
  assert.equal(ROBUST_GRID.length, 9); assert.deepEqual(ROBUST_GRID[4], { speedF: 1, aimOff: 0 });
  assert.equal(s.robustness.scores.length, 9);
  if (!s.gate) { assert.equal(s.total, Math.round(s.robustness.scores.reduce((a, b) => a + b, 0) / 9)); assert.ok(['Forgiving', 'Touchy'].includes(s.label)); }
});
```

- [ ] **Step 2: Run** `node --test test/eval-safety.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** per Interfaces. Add `src/eval/safety.js` to FILES, then run `node scripts/stamp.js`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit.** `git add src/eval/safety.js src/precache.js test/eval-safety.test.js && git commit -m "Eval: scoreSafety with hard gates, family rules, 3x3 robustness" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 11: Search — grids, cheap-then-full strategy, `suggest`, `validateDeal`

**Files:**
- Create: `src/search/grid.js`, `src/search/search.js`
- Modify: `src/precache.js`
- Test: `test/search.test.js`

**Interfaces:**
- Consumes: `simulate`, `gateFor`, `opponentTargets`, `scorePosition`, `scoreSafety`, `visibility`.
- Produces:
  - `linspace(a, b, n): number[]`, where element i = a + (b − a)·i/(n − 1).
  - `SPINS9` = y ∈ [−0.8, 0, 0.8] (outer) × x ∈ [−0.5, 0, 0.5] (inner), as `{x, y}`.
  - `SUGGEST_GRID = {offsets: linspace(−0.92, 0.92, 13), offsets2: linspace(−0.92, 0.92, 9), speeds: [16, 22, 30, 40, 52, 66, 84, 106, 134], spins: SPINS9}`.
  - `DIFFICULTY_GRID = {offsets: linspace(−0.92, 0.92, 9), offsets2: linspace(−0.92, 0.92, 5), speeds: [20, 36, 60, 100], spins: [{x:0, y:−0.8}, {x:0, y:0}, {x:0, y:0.8}]}`. It is coarser than Suggest's (§18a.3c).
  - `candidateShots(layout, grid): Shot[]`:
    - Targets = legal balls with shooter `visibility ≥ 0.25`, sorted by V descending then id ascending, capped at 2.
    - Use `offsets` for one target and `offsets2` for two.
    - Loop order: target → offset f → speed → spin.
    - aimDeg = deg(atan2(T − C)) + deg(asin(clamp(2R·f/|T − C|, −1, 1))).
  - `K_FULL = 3`.
  - `runSearch(layout, grid, opts?: {seedShots?: Shot[]}): SuggestResult`:
    - **Stage A (cheap):** for every candidate, call `simulate(record: false)`. A gated candidate scores cheap = 0. Otherwise cheap = `scorePosition(final, cueId, opponentTargets(...), {cheap: true}).score`, which is the nominal run only with mirror lanes.
    - **Share:** `shareGe70 = count(cheap ≥ 70)/candidates.length`, or 0 if there are no candidates.
    - **Full set:** the `seedShots`, then the top `K_FULL` ungated candidates by cheap score (descending, grid index ascending), skipping any that deep-equal a seed.
    - **Stage B (full):** run `scoreSafety` on each. The best is the highest total; on a tie the first one wins.
    - **Return:** `{best, cheapCount: candidates.length, shareGe70}`.
  - `suggest(layout, opts) = runSearch(layout, SUGGEST_GRID, opts)`.
  - `classify(share): Band` returns `'easy'` if share > 0.15, `'medium'` if 0.04 ≤ share ≤ 0.15, else `'hard'`.
  - `validateDeal(layout): Validation` runs `runSearch(layout, DIFFICULTY_GRID)` and returns `{ok: !!best && best.score.total >= 70, best, share, band: classify(share)}`.

- [ ] **Step 1: Write the failing test** `test/search.test.js`:

```js
// @ts-check
const lay = L([B('cue', 30, 25), B('ob', 50, 20), B('b1', 58, 30), B('b2', 58 + 2 * R, 30)]);
test('grids: difficulty grid is coarser than suggest; sizes pinned', () => {
  assert.equal(candidateShots(lay, DIFFICULTY_GRID).length, 108); assert.equal(candidateShots(lay, SUGGEST_GRID).length, 1053);
  const first = candidateShots(lay, DIFFICULTY_GRID)[0];
  near(first.aimDeg, aimAt(B('cue', 30, 25), B('ob', 50, 20)) + (Math.asin((2 * R * -0.92) / Math.hypot(20, 5)) * 180) / Math.PI, 1e-9);
  assert.deepEqual([first.speed, first.spin], [20, { x: 0, y: -0.8 }]);
});
test('classify thresholds', () => { assert.equal(classify(0.16), 'easy'); assert.equal(classify(0.15), 'medium'); assert.equal(classify(0.04), 'medium'); assert.equal(classify(0.0399), 'hard'); });
test('validateDeal is consistent and deterministic', () => {
  const v = validateDeal(lay); assert.equal(v.ok, !!v.best && v.best.score.total >= 70); assert.equal(v.band, classify(v.share));
  assert.ok(v.share >= 0 && v.share <= 1); assert.deepEqual(validateDeal(lay), v);
});
test('suggest never returns less than a seeded shot', () => {
  const v = validateDeal(lay); if (!v.best) return;
  assert.ok(suggest(lay, { seedShots: [v.best.shot] }).best.score.total >= v.best.score.total);
});
test('a shooter with no direct look at the legal ball gets no candidates', () => {
  const hooked = L([B('cue', 30, 25), B('b1', 36, 25), B('ob', 60, 25)]);
  assert.equal(candidateShots(hooked, DIFFICULTY_GRID).length, 0); assert.equal(validateDeal(hooked).ok, false);
});
```

- [ ] **Step 2: Run** `node --test test/search.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** per Interfaces. Add `src/search/grid.js` and `src/search/search.js` to FILES, then run `node scripts/stamp.js`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit.** `git add src/search/grid.js src/search/search.js src/precache.js test/search.test.js && git commit -m "Search: cheap-then-full suggest and deal validation" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 12: Deals — seeded PRNG, 8 family generators, fixed layouts (RF4)

**Files:**
- Create: `src/deal/prng.js`, `src/deal/families.js`, `src/deal/fixed.js`
- Modify: `src/precache.js`
- Test: `test/deal-generate.test.js`

**Interfaces:**
- Produces:
  - `src/deal/prng.js`:
    - `mulberry32(seed): () => number` (standard mulberry32)
    - `hashSeed(...ints): number` uses FNV-1a 32 over each int's 4 little-endian bytes (h = 2166136261, `Math.imul(h, 16777619)`), then fmix32 (`h ^= h>>>16; h = imul(h, 0x85ebca6b); h ^= h>>>13; h = imul(h, 0xc2b2ae35); h ^= h>>>16`) and returns `>>> 0`.
    - `shuffle(arr, rng)`: Fisher–Yates on a copy, i from n−1 down to 1, j = floor(rng()·(i+1)).
  - `src/deal/families.js`:
    - `BANDS = ['easy', 'medium', 'hard']`
    - `FAMILIES: {id: 1..8, name}[]` with names, in order: "Hook behind a blocker", "Rail tuck or freeze", "Stop/stun hide", "Thin cut, OB long to a rail", "Length-of-table lag", "8-ball: hide from the group", "9-ball: lowest ball in clutter", "Behind your own balls or a cluster"
    - `unitBalls(center, axisDeg, kind: 'single'|'pair'|'triangle'|'line3'): {x,y}[]`:
      - `single` = [center]
      - `pair` = center ± R·(cos(axis+90°), sin(axis+90°))
      - `triangle` = center + (2R/√3)·(cos(axis+k·120°), sin(axis+k·120°)) for k = 0, 1, 2
      - `line3` = center + j·2R·(cos(axis+90°), sin(axis+90°)) for j = −1, 0, 1
    - `generate(family, seed, band): Layout|null`
    - `dealSeedFor(family, band, h)` = h − (h % 24) + (family − 1) + 8·BANDS.indexOf(band), with h < 2³¹
    - `parseDealSeed(seed)` = `{family: 1 + seed % 8, band: BANDS[Math.floor((seed % 24)/8)]}`
    - `dealFromSeed(seed)` = `{...parseDealSeed(seed), layout: generate(family, seed, band)}`
  - `src/deal/fixed.js`: `FIXED_LAYOUTS: {name: string, layout: Layout}[]`, all designated with legal `['ob']`. Each legacy blocker becomes a `pair` unit (true-scale balls side by side, perpendicular to cue→OB, keeping the old 4.9 in shadow), ids `b1..`:
    - **"open hook":** cue (26,25), ob (64,25), pairs at (42,18) and (46,32).
    - **"rail tuck":** cue (40,12), ob (78,40), pair at (52,30).
    - **"behind the 8":** cue (22,25), ob (54,25), single at (42,29). The legacy (42,25) fully hooks the shooter at any scale, so it is offset 4 in to keep a direct shot.
- Generator algorithm:
  - **Setup.** rng = mulberry32(seed). Helpers draw in this order:
    - `u(a, b)` = a + (b−a)·rng()
    - `pt(x0, x1, y0, y1)`: x first, then y
    - `polar(o, d0, d1, a0, a1)`: distance first, then angle in degrees
    - `sgn()` = rng() < 0.5 ? −1 : 1
    - `ang(p, q)` = deg(atan2(q − p))
  - **Unit kind by band:** easy 'triangle', medium 'pair', hard 'single'. Family 8 instead uses easy 'line3', medium 'triangle', hard 'pair'.
  - **Retries.** Up to 40 internal tries, consuming rng continuously. A try succeeds when `validateLayout` is ok and max over `legalIds` of shooter `visibility(cue, t, balls, [cueId])` ≥ 0.5; otherwise return `null`.
  - **Ids and rules.** Families 1–5 and 8: cue `'cue'`, OB `'ob'`, blockers `b1..` in unit order, designated legal `['ob']`.
  - **Families:**
    1. ob = pt(55,85,10,40); cue = polar(ob,25,45,150,210); θ = ang(ob,cue); s = sgn(); uc = polar(ob,9,15,θ+70s,θ+110s); unit(uc, ang(ob,uc)).
    2. ob = pt(30,70,15,35); cue = polar(ob,20,35,0,360); top = rng()<0.5; ux = ob.x + u(−15,15); yr = top ? R : 50−R. Balls: single [(ux,yr)]; pair [(ux−R,yr),(ux+R,yr)]; triangle = pair + (ux, yr + (top ? 1 : −1)·√3·R).
    3. cue = pt(15,40,12,38); ob = polar(cue,12,24,−25,25); d = unit(ob−cue); s = sgn(); gap = u(0.3,1.5); back = u(0,2); uc = ob + s·(−d.y, d.x)·(2R + gap + (kind === 'triangle' ? R/√3 : 0)) − d·back; unit(uc, ang(ob,uc)).
    4. ob = pt(75,90,12,38); cue = polar(ob,18,30,160,200); θ = ang(cue,ob); s = sgn(); uc = polar(cue,6,10,θ+80s,θ+100s); unit(uc, ang(cue,uc)).
    5. ob = pt(88,95,8,42); cue = pt(65,80,10,40); uc = pt(7,14,12,38); unit(uc, 0).
    6. Rules `'8ball'`, legal `['1','2','3']`, opponentIds = the placed subset of `['9','10','11']`, in id order.
       - Opponent balls: '9' = pt(20,80,8,42); '10' = polar('9', 2R+0.5, 6, 0, 360); '11' = polar('9', 2R+0.5, 8, 0, 360), placed only if band ≠ 'easy'.
       - Shooter balls and cue: '1' = pt(20,80,8,42); cue = polar('1',18,35,0,360); '2' = polar('9',4,7,0,360); '3' = polar('9',4,7,0,360).
       - '8' = pt(10,90,6,44).
       - Placement order: 9, 10, 11, 1, cue, 2, 3, 8.
    7. Rules `'9ball'`, legal `['2']`. '2' = pt(25,75,10,40); clutter '4', '5' (and '6' if easy) = polar('2', 2R+0.2, 6, 0, 360); '7' = pt(10,90,6,44); '9' = pt(10,90,6,44); cue = polar('2',20,40,0,360).
    8. ob = pt(55,85,10,40); cue = polar(ob,22,40,150,210); θ = ang(ob,cue); s = sgn(); uc = polar(ob,10,16,θ+60s,θ+120s); unit(uc, ang(ob,uc)).
  - **Ball order in the layout:** cue first, then the order listed.

- [ ] **Step 1: Write the failing test** `test/deal-generate.test.js`:

```js
// @ts-check
test('PRNG and hash vectors', () => {
  const r = mulberry32(1); assert.deepEqual([r(), r(), r()], [0.6270739405881613, 0.002735721180215478, 0.5274470399599522]);
  assert.equal(hashSeed(0), 1234692987); assert.equal(hashSeed(1, 2), 541715573);
});
test('deal seeds encode family and band', () => {
  for (let f = 1; f <= 8; f++) for (const b of BANDS) assert.deepEqual(parseDealSeed(dealSeedFor(f, b, hashSeed(f, 9) >>> 1)), { family: f, band: b });
});
test('RF4 500 seeds × 8 families × 3 bands: valid, non-overlapping, shooter can see the legal ball', () => {
  for (let f = 1; f <= 8; f++) { let nulls = 0;
    for (const band of BANDS) for (let k = 0; k < 500; k++) {
      const lay = generate(f, hashSeed(f, k) >>> 1, band); if (!lay) { nulls++; continue; }
      assert.deepEqual(validateLayout(lay), { ok: true });
      for (let i = 0; i < lay.balls.length; i++) for (let j = i + 1; j < lay.balls.length; j++)
        assert.ok(Math.hypot(lay.balls[i].x - lay.balls[j].x, lay.balls[i].y - lay.balls[j].y) >= 2 * R - 1e-6);
      const cue = lay.balls.find((b) => b.id === 'cue');
      assert.ok(Math.max(...lay.rules.legalIds.map((id) => visibility(cue, lay.balls.find((b) => b.id === id), lay.balls, ['cue']))) >= 0.5);
    }
    assert.ok(nulls / 1500 < 0.05, `family ${f} nulls ${nulls}`); }
});
test('family rules: 8-ball groups and 9-ball lowest ball', () => {
  const e = generate(6, 11, 'easy'), m = generate(6, 11, 'medium'), n = generate(7, 11, 'medium');
  assert.equal(e.rules.kind, '8ball'); assert.deepEqual(e.rules.legalIds, ['1', '2', '3']); assert.deepEqual(e.rules.opponentIds, ['9', '10']);
  assert.deepEqual(m.rules.opponentIds, ['9', '10', '11']);
  assert.equal(n.rules.kind, '9ball'); assert.deepEqual(n.rules.legalIds, [String(Math.min(...n.balls.filter((b) => b.id !== 'cue').map((b) => Number(b.id))))]);
});
test('generate is deterministic; fixed layouts are valid and named', () => {
  assert.deepEqual(generate(3, 77, 'hard'), generate(3, 77, 'hard'));
  assert.deepEqual(FIXED_LAYOUTS.map((f) => f.name), ['open hook', 'rail tuck', 'behind the 8']);
  for (const f of FIXED_LAYOUTS) assert.ok(validateLayout(f.layout).ok);
});
```

  (The `generate(6, 11, …)` / `generate(7, 11, …)` assertions require non-null; if seed 11 returns null, the test uses the first k ≥ 11 that returns a layout. Write it as a small loop.)
- [ ] **Step 2: Run** `node --test test/deal-generate.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** per Interfaces. Add the three files to FILES, then run `node scripts/stamp.js`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit.** `git add src/deal/prng.js src/deal/families.js src/deal/fixed.js src/precache.js test/deal-generate.test.js && git commit -m "Deals: seeded PRNG, 8 family generators, true-scale fixed layouts" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 13: Deals — validation loop, fallback, difficulty bands, session mix, 500-seed test

**Files:**
- Create: `src/deal/deal.js`, `test/deal-500/run.js`, `test/deal-500/family-1.test.js` … `test/deal-500/family-8.test.js`
- Modify: `src/precache.js`
- Test: `test/deal-find.test.js`

**Interfaces:**
- Consumes: `generate`, `dealSeedFor`, `BANDS`, `FIXED_LAYOUTS`, `hashSeed`, `mulberry32`, `shuffle`, `validateDeal`.
- Produces:
  - `MAX_ATTEMPTS = 25`.
  - `findDeal(family, band, baseSeed, opts?: {matchBand?: boolean /*default true*/, validate?: (l: Layout) => Validation}): DealResult`:
    - **Attempts:** for j = 0..24, s_j = `dealSeedFor(family, band, hashSeed(baseSeed, j) >>> 1)`; layout = `generate(family, s_j, band)`. A null layout or `!v.ok` is a rejection.
    - **Return early:** if the deal is valid and (`!matchBand` or `v.band === band`), return `{family, seed: s_j, requestedBand: band, band: v.band, layout, validation: v, attempts: j + 1, fallback: false}`.
    - **Backup:** otherwise keep the first valid result.
    - **After the loop:** return the backup if there is one (attempts 25). Else take `FIXED_LAYOUTS[hashSeed(baseSeed) % 3]` and return `{family, seed: baseSeed, requestedBand: band, band: v.band, layout, validation: validate(fixed.layout), attempts: 25, fallback: true, fixedName}`.
  - `sessionPlan(sessionSeed): {family: number, band: Band}[]`:
    - rng = mulberry32(hashSeed(sessionSeed, 7))
    - families = [...shuffle([1..8]), ...shuffle([1..8])].slice(0, 10)
    - bands = shuffle(['easy','easy','easy','medium','medium','medium','medium','hard','hard','hard'])
    - slot i = {family: families[i], band: bands[i]}
    - Callers use baseSeed `hashSeed(sessionSeed, 100 + i)` for slot i.
  - `test/deal-500/run.js`: `runFamily(family)` registers one test. n = `process.env.RUNOUT_FULL === '1' ? 500 : 20`. For k < n it calls `findDeal(family, BANDS[k % 3], hashSeed(family, k), {matchBand: false})` and asserts `validation.ok && validation.best.score.total >= 70`. It counts fallbacks and asserts `fallbacks/500 < 0.01` (full run) or `fallbacks <= 1` (smoke). It logs `family N: fallbacks X/n`. Each `family-N.test.js` is `import { runFamily } from './run.js'; runFamily(N);` (separate files so `node --test` runs them in parallel).

- [ ] **Step 1: Write the failing test** `test/deal-find.test.js`, then the run/family files:

```js
// @ts-check
const okV = (band) => () => ({ ok: true, best: { shot: { aimDeg: 0, speed: 1, spin: { x: 0, y: 0 } }, score: { total: 80 } }, share: 0.1, band });
test('25 rejected deals → fixed layout fallback', () => {
  const r = findDeal(1, 'easy', 5, { validate: () => ({ ok: false, best: null, share: 0, band: 'hard' }) });
  assert.equal(r.fallback, true); assert.equal(r.attempts, 25); assert.ok(FIXED_LAYOUTS.some((f) => f.name === r.fixedName));
});
test('band mismatch keeps searching, then uses the first valid deal', () => {
  const r = findDeal(2, 'easy', 5, { validate: okV('hard') }); assert.equal(r.fallback, false); assert.equal(r.band, 'hard'); assert.equal(r.attempts, 25);
  assert.deepEqual(r.layout, generate(2, r.seed, 'easy'));
});
test('band match returns immediately and the seed replays the layout', () => {
  const r = findDeal(3, 'medium', 5, { validate: okV('medium') }); assert.equal(r.attempts, 1);
  assert.deepEqual(dealFromSeed(r.seed).layout, r.layout);
});
test('session mixes 3 easy, 4 medium, 3 hard across families, deterministic', () => {
  const p = sessionPlan(123); assert.equal(p.length, 10);
  assert.deepEqual(['easy', 'medium', 'hard'].map((b) => p.filter((s) => s.band === b).length), [3, 4, 3]);
  assert.ok(p.every((s) => s.family >= 1 && s.family <= 8)); assert.deepEqual(sessionPlan(123), p);
  assert.ok([1, 2, 3, 4, 5].some((s) => JSON.stringify(sessionPlan(s)) !== JSON.stringify(p)));
});
test('every fixed layout has a safety scoring ≥ 70 at true scale', () => {
  for (const f of FIXED_LAYOUTS) { const v = validateDeal(f.layout); assert.ok(v.ok, `${f.name}: ${v.best && v.best.score.total}`); }
});
```

- [ ] **Step 2: Run** `node --test test/deal-find.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** `src/deal/deal.js` and the `test/deal-500` files per Interfaces. Add `src/deal/deal.js` to FILES, then run `node scripts/stamp.js`.
- [ ] **Step 4: Run** `npm test` (smoke, 20 seeds per family). Expected: PASS. Then run `RUNOUT_FULL=1 node --test "test/deal-500/*.test.js"`. Expected: PASS, and record each family's fallback count in the commit body. If a fixed layout fails validation or any family's fallback rate is ≥ 1%, apply Global Constraint 13.
- [ ] **Step 5: Commit.** `git add src/deal/deal.js src/precache.js test/deal-find.test.js test/deal-500 && git commit -m "Deals: validated dealing with fallback, bands, 3/4/3 session; 500-seed test" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 14: Search Web Worker — protocol, shim, client

**Files:**
- Create: `src/search/handle.js`, `src/search/worker.js`, `src/search/client.js`
- Modify: `src/precache.js`
- Test: `test/search-worker.test.js`

**Interfaces:**
- Consumes: `suggest`, `validateDeal`, `findDeal`.
- Produces:
  - **Requests:** `{id: number, type: 'suggest', layout: Layout, seedShots?: Shot[]}` | `{id, type: 'validate', layout}` | `{id, type: 'deal', family: number, band: Band, seed: number}`.
  - **Responses:** `{id, type: 'result', result}` | `{id, type: 'error', message: string}`.
  - `handleRequest(msg): Response` is pure. Unknown type gives the error `unknown request type: <type>`; thrown errors give `{type: 'error', message: err.message}`.
  - `worker.js`: `// @ts-check`, then `import { handleRequest } from './handle.js'; self.onmessage = (e) => { self.postMessage(handleRequest(e.data)); };`.
  - `createSearchClient(factory?: () => Worker): {suggest(layout, seedShots?): Promise<SuggestResult>, validate(layout): Promise<Validation>, deal(family, band, seed): Promise<DealResult>, terminate(): void}`:
    - The default factory is `() => new Worker(new URL('./worker.js', import.meta.url), {type: 'module'})`.
    - Ids increment from 1; pending requests live in a Map; the client sets `worker.onmessage`.
    - An error response rejects that request with `new Error(message)`. `worker.onerror` rejects all pending requests.
    - `terminate()` calls `worker.terminate()` and rejects pending requests with `new Error('terminated')`.
    - The worker answers FIFO, which lets Plan 1b pre-validate the next deal while the current one is being played (§18a.3).

- [ ] **Step 1: Write the failing test** `test/search-worker.test.js`:

```js
// @ts-check
const lay = L([B('cue', 30, 25), B('ob', 50, 20), B('b1', 58, 30)]);
const fakeWorker = () => { const w = { onmessage: null, onerror: null, terminated: false,
  postMessage(m) { queueMicrotask(() => w.onmessage({ data: handleRequest(m) })); }, terminate() { w.terminated = true; } }; return w; };
test('handleRequest mirrors the pure entry points', () => {
  assert.deepEqual(handleRequest({ id: 1, type: 'validate', layout: lay }), { id: 1, type: 'result', result: validateDeal(lay) });
  assert.deepEqual(handleRequest({ id: 2, type: 'nope' }), { id: 2, type: 'error', message: 'unknown request type: nope' });
  assert.equal(handleRequest({ id: 3, type: 'validate', layout: { balls: [], cueId: 'cue', rules: { kind: 'designated', legalIds: [] } } }).type, 'error');
});
test('client resolves by id, rejects errors, terminate rejects pending', async () => {
  const c = createSearchClient(fakeWorker); const [v, d] = await Promise.all([c.validate(lay), c.deal(1, 'medium', 9)]);
  assert.equal(typeof v.ok, 'boolean'); assert.equal(d.family, 1);
  await assert.rejects(c.validate({ balls: [], cueId: 'cue', rules: { kind: 'designated', legalIds: [] } }));
  const p = c.suggest(lay); c.terminate(); await assert.rejects(p, /terminated/);
});
```

- [ ] **Step 2: Run** `node --test test/search-worker.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** per Interfaces. (`terminate` rejects synchronously before the fake's microtask resolves; the client ignores responses for ids it no longer has.) Add the three files to FILES, then run `node scripts/stamp.js`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit.** `git add src/search/handle.js src/search/worker.js src/search/client.js src/precache.js test/search-worker.test.js && git commit -m "Search: module Web Worker protocol and client" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 15: UI logic — session store and wake lock (plus home wake-lock check)

**Files:**
- Create: `src/ui/session-store.js`, `src/ui/wake-lock.js`
- Modify: `src/home.js`, `index.html`, `src/precache.js`
- Test: `test/ui.test.js`

**Interfaces:**
- Produces:
  - `createSessionStore(name: string, initial: T, deps?: {storage?: Storage}): {load(): T, save(value: T): boolean, clear(): void}`:
    - key = `'runout-lab:session:' + name`; payload is `JSON.stringify({v: 1, data})`; storage defaults to `globalThis.localStorage`.
    - `load` order: the in-memory value if set this instance; else stored data whose payload is valid with `v === 1`; else `structuredClone(initial)`. Storage exceptions are swallowed. The result is always a clone.
    - `save` keeps a clone in memory and returns `true` only if `setItem` succeeded.
    - `clear` drops the memory copy and calls `removeItem`, swallowing errors. The caller shows the confirmation (§12).
  - `createWakeLock(deps?: {nav?: Navigator, doc?: Document, onFallback?: (reason: 'unsupported'|'denied'|'released') => void}): {supported: boolean, start(): Promise<boolean>, stop(): Promise<void>, held(): boolean}`:
    - `supported` = `typeof nav?.wakeLock?.request === 'function'`.
    - `start()` sets active, resets the fallback-sent flag, adds a `visibilitychange` listener, and returns `acquire()`.
    - `acquire()`:
      - If unsupported: signal `'unsupported'` and return false.
      - If not visible: return false; the lock is acquired on the next visible.
      - Otherwise `sentinel = await nav.wakeLock.request('screen')` and listen for `release`. On rejection, signal `'denied'` and return false.
    - On `release`: clear the sentinel; if active and `doc.visibilityState === 'visible'`, signal `'released'` (no immediate re-acquire).
    - On `visibilitychange`: if active, visible and no sentinel, call `acquire()`.
    - `stop()` clears active, removes the listener, and releases the sentinel.
    - `signal` calls `onFallback` at most once per `start()`.
  - **Home:** add `<section><h2>Wake lock check</h2><button id="wl">Start wake-lock test</button> <span id="wl-status" role="status"></span></section>` after the Table list in `index.html`. In `src/home.js`, toggling the button calls `start()`/`stop()`:
    - Button labels: "Start wake-lock test" / "Stop wake-lock test".
    - Status text when held: `Held — the screen should stay on.`
    - Status text from `onFallback`: `Wake lock not available (<reason>). Set Auto-Lock to Never: Settings → Display & Brightness → Auto-Lock.`

- [ ] **Step 1: Write the failing test** `test/ui.test.js`. `mapStorage()` is a Map-backed `getItem`/`setItem`/`removeItem`. The fake `nav.wakeLock.request` returns an `EventTarget` sentinel with `release()` (which dispatches `release`) and counts its calls. The fake `doc` is an `EventTarget` with a mutable `visibilityState`.

```js
// @ts-check
test('session survives refresh, clears, tolerates corrupt data and quota errors', () => {
  const st = mapStorage(), a = createSessionStore('table', { logs: [] }, { storage: st });
  a.save({ logs: ['Hooked'] }); assert.deepEqual(createSessionStore('table', { logs: [] }, { storage: st }).load(), { logs: ['Hooked'] });
  a.clear(); assert.deepEqual(createSessionStore('table', { logs: [] }, { storage: st }).load(), { logs: [] });
  st.setItem('runout-lab:session:table', '{bad'); assert.deepEqual(createSessionStore('table', { logs: [] }, { storage: st }).load(), { logs: [] });
  st.setItem('runout-lab:session:table', JSON.stringify({ v: 2, data: 1 })); assert.deepEqual(createSessionStore('table', { logs: [] }, { storage: st }).load(), { logs: [] });
  const q = createSessionStore('t', { n: 0 }, { storage: { getItem: () => null, setItem() { throw new Error('quota'); }, removeItem() {} } });
  assert.equal(q.save({ n: 3 }), false); assert.deepEqual(q.load(), { n: 3 });
  const init = { n: 0 }, s = createSessionStore('x', init, { storage: mapStorage() }); s.load().n = 9; assert.equal(init.n, 0);
});
test('wake lock: unsupported → fallback once', async () => { /* start() → false; onFallback calls === ['unsupported'] */ });
test('wake lock: acquire, normal hide/show re-acquires with no tip', async () => {
  /* start() → true, held(); doc hidden + sentinel.release() → no fallback, !held();
     doc visible + dispatch visibilitychange → request called twice, held() */
});
test('wake lock: released while visible → tip; deduped', async () => { /* two releases while visible → onFallback called once with 'released' */ });
test('wake lock: request rejects → denied; stop removes listener', async () => { /* reject → 'denied'; after stop, visibilitychange does not call request */ });
```

- [ ] **Step 2: Run** `node --test test/ui.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** per Interfaces. Add `src/ui/session-store.js` and `src/ui/wake-lock.js` to FILES, then run `node scripts/stamp.js`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit.** `git add src/ui/session-store.js src/ui/wake-lock.js src/home.js index.html src/precache.js test/ui.test.js && git commit -m "UI logic: session store and wake lock with Auto-Lock fallback signal" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 16: Performance harness

**Files:**
- Create: `bench/workloads.js`, `bench/index.html`, `bench/bench.js`, `scripts/bench.js`
- Test: `test/bench.test.js`

**Interfaces:**
- Consumes: `findDeal`, `suggest`, `FIXED_LAYOUTS`, `hashSeed`, `BANDS`, `createSearchClient`.
- Produces:
  - `bench/workloads.js`: `DEAL_CASES` = for family 1..8 and k 0..2, `{family, band: BANDS[k], seed: hashSeed(9000, family, k)}` (24 cases).
  - `scripts/bench.js`: `runBench(opts?: {cases?: typeof DEAL_CASES, fixed?: boolean}): {deal: Stats, suggest: Stats}`, where `Stats = {n, median, p95, max}` in ms measured with `performance.now()`.
    - For each case: time `findDeal`, then time `suggest(layout, {seedShots: best ? [best.shot] : []})`.
    - If `fixed !== false`, also time `suggest` on each fixed layout.
    - When run as main, it prints `JSON.stringify(result, null, 2)`.
  - **Bench page:**
    - `bench/index.html` contains a `<pre id="out">` and `<script type="module" src="./bench.js">`.
    - `bench/bench.js` runs the same workload through `createSearchClient()` (the worker), timing each awaited call.
    - Long tasks: it observes `new PerformanceObserver(..).observe({type: 'longtask', buffered: true})`, or prints `longtask API unsupported` where unavailable (Safari). It also tracks the maximum `requestAnimationFrame` gap.
    - Output: a table plus three lines, `deal max <ms> ≤ 1500: PASS|FAIL`, `suggest max <ms> ≤ 1500: PASS|FAIL`, `main-thread long tasks: <count> (must be 0): PASS|FAIL`.
    - If deal fails but the median per-attempt time passes, it adds `→ consider background pre-validation (§18a.3)` (informational; Global Constraint 13 applies).

- [ ] **Step 1: Write the failing test** `test/bench.test.js`:

```js
// @ts-check
import { DEAL_CASES } from '../bench/workloads.js';
import { runBench } from '../scripts/bench.js';
test('bench runs a workload and reports stats', () => {
  assert.equal(DEAL_CASES.length, 24);
  const r = runBench({ cases: DEAL_CASES.slice(0, 1), fixed: false });
  assert.equal(r.deal.n, 1); assert.equal(r.suggest.n, 1); assert.ok(r.deal.max >= 0 && r.suggest.max >= 0);
});
```

- [ ] **Step 2: Run** `node --test test/bench.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** per Interfaces. (No precache change: `bench/` and `scripts/` are not shipped.)
- [ ] **Step 4: Run** `npm test`. Expected: PASS. Then run `node scripts/bench.js` (unthrottled reference) and, in Chrome, `npx serve -l 3000 .` → `http://localhost:3000/bench/` with DevTools Performance CPU set to 4× slowdown. Record both outputs for Task 17.
- [ ] **Step 5: Commit.** `git add bench scripts/bench.js test/bench.test.js && git commit -m "Perf harness: worker bench page and node bench" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 17: Owner acceptance checklist and final verification

**Files:**
- Create: `docs/acceptance-checklist.md`

**Interfaces:**
- Consumes: the bench outputs from Task 16 and the `RUNOUT_FULL=1` counts from Task 13.

- [ ] **Step 1: Write the doc.** `docs/acceptance-checklist.md` has the sections below, in order. Each item has Steps, Expected, a Result checkbox, and fields for Notes, Device and OS version.
  1. **Wake lock in the installed iPad app (do this first).**
     - Install: Safari → Share → Add to Home Screen. Open from the home screen.
     - Set Auto-Lock to 2 minutes, tap "Start wake-lock test", leave it for 3 minutes.
     - Expected: the screen stays on and the status reads "Held".
     - Lock and unlock, reopen: the lock is re-acquired.
     - If the tip appears instead, record the reason and the iPadOS version (Settings → General → About). From then on, use Auto-Lock → Never at the table.
  2. **Offline cold start in airplane mode.**
     - Open the app online once and wait 10 s (precache). Force-quit, enable airplane mode, launch from the home screen.
     - Expected: the home loads and Table Drills (legacy) opens with correct fonts.
     - After Plan 1b: play one Safety Studio session.
  3. **Suggest and deal time on device.**
     - Online, open `/bench/` on the iPad and the phone (iPhone 12 / Pixel 6a class).
     - Expected: deal max ≤ 1500 ms, suggest max ≤ 1500 ms.
     - Include a table for desktop Chrome 4× proxy results with the numbers from Task 16.
  4. **Frame rate (after Plan 1b).** The animation player holds a steady 60 fps (DevTools / Safari timeline); no main-thread task over 50 ms.
  5. **Update flow.** After a new deploy, reopen the app. Expected: "New version available — tap to reload" appears; tapping reloads into the new version.
  6. **Install check.** The Chrome DevTools Application panel reports the manifest installable.

  End with a "Build-time results" table holding the per-family fallback counts from the 500-seed run and the bench numbers.
- [ ] **Step 2: Final verification.** Run `npm test` (PASS), `RUNOUT_FULL=1 npm test` (PASS), and `node scripts/stamp.js` (prints `up to date`). Then `git status` should show no unstaged shipped files.
- [ ] **Step 3: Commit.** `git add docs/acceptance-checklist.md && git commit -m "Add owner acceptance checklist for Stage 1a" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

## Architectural choices and rejected alternatives

- **Engine loop.** Fixed 10 ms steps. Each ball's state is advanced analytically, which is exact because sliding and rolling are constant-acceleration phases. Collision times come from continuous detection on each step's chord, and events are resolved one at a time.
  - Rejected: full analytic event prediction (quartic roots as in pooltool). It is error-prone and its speed gain doesn't matter at these ball counts.
  - Rejected: plain Euler. It tunnels at speed and drifts the 30° rule.
- **Ball–ball restitution `E_BALL = 1`.** The ¼/¾-ball 30° rule (theory 27.27° and 27.63°, against a 27° floor) and the ±2° stun-cut tangent both fail with any realistic e < 0.98. Throw and inelasticity are out of scope (§9).
- **Cushion model.** It is phenomenological: the restitution e(vn) and the tangential retention τ(vn) fall with speed, and english adds −λ·wz. Post-rail curve comes from preserved topspin plus table friction, so the realistic kick errors (§5 anti-goal) emerge from the physics rather than being scripted.
  - Rejected: a Coulomb cushion. It is scale-invariant, so it can't produce "harder is shorter".
- **Scoring weights.** Weights 0.55·H + 0.25·K·H + 0.20·Q − 0.60·D were chosen to pass all five fixtures with margin. The fixtures are tested at both the formula level (guaranteed) and the layout level (end to end).
  - Rejected: per-target min-of-scores for 8-ball. The spec says to use "best ball", so V and D take the max over the group.
- **Search.** Stage A runs a cheap model (one run, mirror lanes) over the whole grid; Stage B runs the full model (9 runs with engine lanes, plus a kick-reuse rule) on the top 3 plus seed shots. This is §18a.3(b), and difficulty uses the coarser grid (§18a.3c). Suggest is seeded with the validation's best shot, so a shown deal's Suggest is always ≥ 70.
  - Rejected: the full model on every candidate (about 100× over budget).
- **Deal identity.** A single uint31 seed encodes family and band hint (`seed % 24`), so `#/study/safety?deal=<seed>` replays exactly. Redeals keep the family.
- **Module service worker** that imports `src/precache.js`, so the list exists only once. Its line-1 version comment forces update detection. Rejected: a classic SW with an inlined list (two copies of the list).
- **500-seed test** split into 8 files (parallel node processes) and gated by `RUNOUT_FULL=1`. The default run uses 20 seeds per family so `npm test` stays fast.
- **Fonts.** Google's latin-subset woff2 (variable Oswald and Archivo, static Space Mono 400/700) plus the OFL texts from `google/fonts`. Rejected: converting TTF to woff2 locally (needs a tool dependency).

## Risks and edge cases

1. Generator validity rates and fixed-layout validation at true scale are unknown until Task 13 runs. True-scale hides are tighter than the legacy 2.45 in balls. Escalate per Global Constraint 13.
2. The budget is uncertain. The kick sweep (up to 360 short simulations) dominates full scoring. The bench decides, and the spec's fallback ladder (background pre-validation, then a looser deal budget, then the seed bank only with owner approval) is the caller's call.
3. With this formula, a mid-table hook with any open one-rail lane tops out around 68. A score of ≥ 70 needs the cue near a rail, no one-rail lanes, or 2+ rails. This matches §10's intent but lowers validity rates for families 1, 3, 4 and 8.
4. Bands come from the cheap model, so the actual 3/4/3 mix can deviate when no band-matching deal appears in 25 attempts (the first valid deal is used and labelled with its measured band).
5. Rail chatter, where topspin drags a ball back into a rail: handled by `V_REST` plus merged rail counting. `MAX_ZERO_TIME`/`MAX_EVENTS` are hard backstops that set `settled = false`.
6. Chord-vs-analytic contact error is ≤ about 1e-3 in. `EPS_LAYOUT = 0.01` lets settled positions be re-simulated (robustness, kick sweeps) without false "overlap" rejections.
7. Module service workers need iOS/Safari 15+ and Chrome 91+. Elsewhere, registration fails silently and the site still works online.
8. The latin font subset lacks a few legacy glyphs (→, ✓). The browser falls back per glyph, which is a minor visual change in the legacy page only.
9. Wake lock in iOS home-screen apps before 18.4 may release while visible. This is detected and shown as the Auto-Lock tip; checklist item 1 verifies it.
10. GitHub Pages caches `sw.js` for 10 minutes; `updateViaCache: 'none'` bypasses that for update checks.

## Self-review

- **Spec coverage:**
  - §8 restructure and legacy reachability: Tasks 1 and 3.
  - §9 items 1–8: Tasks 5–7, 11 and 16.
  - §10 gates, V, threat, kick, cue restriction, robustness and fixtures: Tasks 8–10.
  - §11 validation, redeal ≤ 25, fallback, bands, 3/4/3 mix, families and fixed SCEN: Tasks 12–13.
  - §12 store and wake lock: Task 15.
  - §13 manifest, icons, versioned cache-first SW, old-cache deletion, precache tests, stamp, update signal: Tasks 2–3.
  - §15 physics, evaluation, deals, offline and continuity: Tasks 1–3, 6–7, 9–13 and 17; performance: Task 16.
  - §18a.2–6: Global Constraints, Tasks 1, 11, 16 and 17.
  - §20 table, ball and mouth sizes and runtime wake-lock detection: Tasks 4 and 15.
- **Name consistency:** `simulate`, `validateLayout`, `scorePosition`, `scoreSafety`, `kickLanes`, `mirrorLanes`, `runSearch`/`suggest`/`validateDeal`/`classify`, `generate`/`dealSeedFor`/`findDeal`/`sessionPlan`, `handleRequest`/`createSearchClient`, `createSessionStore`/`createWakeLock`, `makeHandlers`/`registerServiceWorker` and `listShipped`/`contentHash`/`stamp` match between Interfaces and tests. Shapes come only from `src/types.js`.
- **Review Focus tests:** RF1 and RF2 in Task 6, RF3 in Tasks 4 and 7, RF4 in Task 12, RF5 in Task 3.
- **Live site:** working at every commit; Task 1 delivers the legacy move, home and redirect together.

Sources:
- [ServiceWorker API: Support for ECMAScript modules (caniuse)](https://caniuse.com/mdn-api_serviceworker_ecmascript_modules)
- [JavaScript modules in service workers (web-features explorer)](https://web-platform-dx.github.io/web-features-explorer/features/js-modules-service-workers)