# Runout Lab Stage 1b: Shell, Safety Studio UI, Table Door Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the tested Stage 1a engine, worker and layout bank into a playable app: a Study/Table shell with hash routing, a rebuilt Safety Studio wired to the worker and bank (session scoring, reroll "no alternative" state, instant stored-best hints, edited-layout Suggest with Cancel), a Table door, an update prompt, and the §14 accessibility fixes.

**Architecture:** `index.html` is the shell (header, nav, update banner, `<main id="app">`, one module script `src/app.js`). Every decision the UI makes lives in a DOM-free pure module that node tests directly: `src/ui/router.js`, `src/ui/aim.js`, the pure halves of `src/ui/spin-pad.js`, `src/ui/speed.js`, `src/ui/table-view.js`, `src/ui/player.js`, `src/ui/ball-drag.js`, and `src/study/safety-session.js`, `safety-copy.js`, `safety-state.js`. DOM glue (`src/app.js`, the `mount` functions, the `create*` components) stays thin and only wires events to those functions. Every simulation, score and search runs in the existing module Web Worker; the worker gains `simulate` and `score` requests.

**Tech Stack:** Vanilla JS (ES2022 modules, `// @ts-check` + JSDoc), `node --test` (Node v26.8.2 on the dev machine), Canvas 2D, Pointer Events, ResizeObserver, Web Worker (`type: 'module'`), Service Worker, localStorage, Screen Wake Lock, Clipboard API. No dependencies.

**Spec:** `/Users/reubenpatterson/pool_drills/runout-lab/docs/superpowers/specs/2026-11-25-stage1b-ui-design.md` (primary), plus `/Users/reubenpatterson/pool_drills/runout-lab/docs/superpowers/specs/2026-11-24-runout-lab-rebuild-design.md` §§11–15 and §21 item 5 (owner decisions 2026-11-25: legacy look adopted, mockup round skipped; bank deals and examples show the stored best instantly and Suggest runs only for edited layouts; every other stage1b-ui open question takes its stated default).

**Base:** branch `specs-stage2`, HEAD `10d0594`. Work on a new branch `stage-1b` created from it.

## Ambiguities found and the rulings this plan assumes

| # | Spec point | Ruling |
|---|---|---|
| B1 | §9.3 drops only the Robustness row for a gated shot. A gated `SafetyScore` carries placeholder values (`V: 0`, `kick.rails: 3`, `cueRestriction: 0`), so the other rows would read "Hidden: 100%" for a scratch. | `breakdownRows` returns `[]` for a gated score. The gate line is the whole explanation. |
| B2 | §9.3 `<n1> lane(s)` | Pluralised: `1 lane`, `2 lanes`. |
| B3 | §9.4 "Retry returns to the aiming state on the dealt layout" predates editing (§9.7). | Retry restores the layout the shot was taken from (the working layout: the dealt one unless edited). **Restore layout** is the way back to the dealt layout. |
| B4 | §8 shows **Next layout** only in the result state. A refresh after a scored first shot resumes in the aiming state. | In session mode the aiming row's secondary button is **New layout** before the slot's first shot and **Next layout** (or **Finish session** on slot 10) after it. |
| B5 | §5 "`deal` is valid only if it matches `/^\d+$/`" does not say what an invalid one does. | Any `deal` param (valid or not) wins over `example`. An invalid one is handled exactly like an id that is not in the bank (`That layout isn't in this version`, then session mode). |
| B6 | A session saved before an update whose bank was rebuilt holds ids the new bank lacks (spec silent). | On resume, `byId` → `null` for the current slot shows `MISSING_DEAL_TEXT`, clears the store and starts a new session. A stored value failing `validSession` also starts a new session. |
| B7 | Aim handle at `max(14 in, 36 px)` can fall off the canvas when the cue is near a rail and aims into it (spec silent). | If the front handle point is outside the drawn table inset by the 22 px hit radius, the handle sits on the opposite side of the cue at the same distance, and dragging it sets `aimDeg = atan2(cue − p)`. The side is fixed for the whole drag. |
| B8 | §6 scene `traces?: {id, pts}[]` has no colour. | Each trace carries `colour`. The player sets it (`#54b6d6` cue, `rgba(231,162,62,0.5)` others). |
| B9 | §21.5 replaces the 1.5 s seeded-Suggest budget. The bench still prints `seeded suggest max … ≤ 1500: PASS|FAIL`. | That line becomes report-only. The new pass mark is `hint replay round trip … ≤ 250: PASS|FAIL`. |
| B10 | §14 lists `bench/index.html` as modified. | Nothing in it needs to change; it is left alone. |
| B11 | §14's file list | Adds two pure modules allowed by its [BUILDER] clause: `src/study/safety-state.js` (control enablement, open action) and `src/ui/ball-drag.js` (pick, clamp, validated move). It also adds four tests: `test/controls.test.js`, `test/table-view.test.js`, `test/safety-state.test.js`, `test/ball-drag.test.js`. |
| B12 | Copy the spec does not fix | Study list: h1 `Study`, lede `Simulated drills and theory at a desk or on your phone.` A failed shot request: `Something went wrong. Try the shot again.` Copy-link success: the button reads `Copied` for 2000 ms. Door card notes end with a period. |
| B13 | Single mode and the session context line (§9.3) | Single mode shows no context line. |
| B14 | Hint label (§9.4/§9.7) | `No safety scoring 70 found` is shown for any hint whose total is below 70, placed directly after `Best found: <n>`. Bank entries are all ≥ 70, so in practice this means examples and edited layouts. |

## Global Constraints

1. Table playing surface is 100 × 50 in. x points right, y points down, units are inches. Ball R = 1.125 in (`R` from `src/engine/constants.js`). `aimDeg`: 0 = +x, 90 = +y (down the screen). `spin.x` > 0 = right english, `spin.y` > 0 = follow.
2. Every `.js` file is an ES module whose first line is `// @ts-check` (`sw.js`: line 2). No TypeScript, no build step, no dependencies. `package.json` stays exactly `{"name":"runout-lab","private":true,"type":"module","scripts":{"test":"node --test \"test/**/*.test.js\""}}`.
3. **Frozen (modelHash).** Do not modify anything under `src/engine/`, `src/geometry/`, `src/eval/`, or `src/search/grid.js`, `src/search/search.js`, `data/safety-bank.json`. No bank rebuild. `test/bank.test.js` must stay green.
4. **Thread rule (§17 anti-goal).** The main thread never imports `src/engine/simulate.js`, `motion.js`, `cushion.js`, anything under `src/eval/`, or `src/search/search.js`, `grid.js`, `handle.js`, `worker.js`. It may import `src/engine/constants.js`, `table.js`, `layout.js` (`validateLayout`), `src/geometry/visibility.js`, `src/deal/families.js`, `src/deal/bank.js` (copy constants and `exampleLabel` only, never a bank object). The bank is fetched and parsed only in the worker. Pinned by the import-graph test (Task 1).
5. "Shipped" is defined by `scripts/shipped.js`. Every shipped file is in `FILES` in `src/precache.js`. Each task adds the files it creates to `FILES` (sorted position, matching `listShipped` order) and removes deleted ones.
6. After changing any shipped file: `node scripts/stamp.js`, then `npm test`; both green before every commit. Every commit after a stamp includes `sw.js src/precache.js` in `git add` (R1).
7. Update prompt text is exactly `New version available — tap to reload`.
8. **Look (§4).** Keep the `:root` tokens in `index.html` unchanged and add `--red:#df6a4f; --rail:#241b12; --rail2:#160f09`. Fonts: Oswald (headings, buttons), Archivo (body), Space Mono (labels, numbers), self-hosted. `--faint` and `--brass-dim` are never a text `color`. No `font-size` below `0.75rem` (or 12 px). Headings, tabs and buttons are uppercased by CSS (`text-transform`); copy strings in code are sentence case. Screen intros are at most two sentences.
9. **Targets.** Every button and control is at least 44 px tall and wide. **Shoot** and the Safety Studio secondary button are 52 px tall. Buttons on the Table door are at least 64 px tall. The aim handle hit circle has a 22 px radius.
10. Viewport meta stays exactly `width=device-width, initial-scale=1`.
11. **DOM safety.** `innerHTML` is used only for static markup written in source. Every dynamic string (ids, slugs, names, scores, copy built at run time) is set with `textContent` or as an attribute value via `setAttribute`/`href`.
12. **Session rule.** A slot's session score is its first shot's total (gated = 0). Retry, Try this shot and edited-layout shots are practice and never change it.
13. **Escalation.** If a pinned test or measured budget fails after following this plan exactly (for example the 250 ms hint replay or the 390 × 664 phone fit), stop and report the measured numbers. Do not change frozen files, grids or the bank to make it pass.
14. Every commit: `git commit -m "<subject>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`. Extra `-m` body lines go between the subject and the Co-Authored-By line. Do not push; merging needs the user's confirmation.

## Review Focus

1. **Stale or corrupt stored session on resume** (an older shape, a slot out of range, or ids missing from a rebuilt bank after an update reload). Expected: no crash; a new session starts, with the missing-layout notice when an id was missing. Pinned in Task 6 (`RF1: validSession`) and Task 7 (`openAction`).
2. **Malformed share links** (`?deal=12abc`, `?deal=`, bad percent-encoding `%E0%A4%A`, repeated keys, a trailing slash). Expected: `parseHash` never throws, and the screen shows the missing-layout notice. Pinned in Task 1 (`RF2`).
3. **Cue ball near a rail aiming into it**, so the aim handle would sit off the canvas. Expected: the handle flips behind the cue and dragging it still aims correctly. Pinned in Task 3 (`RF3`).
4. **Double taps and late replies.** Shoot tapped twice, Next tapped while a deal is loading, a reply arriving after the player moved on. Expected: while anything is pending, no control except Skip or Cancel is enabled, and stale replies are ignored by generation. Pinned in Task 7 (`RF4`).
5. **Ball dropped onto another ball, into a pocket mouth or off the table in edit mode.** Expected: the ball returns to where it was; drags clamp to the playing area. Pinned in Task 8 (`RF5`).

## File Structure

| Path (repo root `/Users/reubenpatterson/pool_drills/runout-lab/`) | Change | Responsibility |
|---|---|---|
| `index.html` | Modify (T1, T3, T4, T7) | Shell markup and all CSS |
| `src/app.js` | Create (T1), Modify (T7) | Boot, router outlet, Home view, nav `aria-current` |
| `src/home.js` | Delete (T1) | Replaced by `app.js` and the Table door |
| `src/ui/router.js` | Create (T1) | `parseHash`, `matchRoute`, `safetyMode` |
| `src/ui/update-banner.js` | Create (T1) | `initUpdateBanner` |
| `src/study/index.js` | Create (T1), Modify (T7) | Study list screen |
| `src/table/index.js` | Create (T1) | Table door with wake-lock check |
| `src/search/handle.js`, `src/search/client.js` | Modify (T2) | `simulate` and `score` requests |
| `src/ui/aim.js` | Create (T3) | Aim math, default aim, preview, handle |
| `src/ui/spin-pad.js`, `src/ui/speed.js` | Create (T3) | Pure helpers plus DOM components |
| `src/ui/table-view.js` | Create (T4) | Transform, ball styles, canvas renderer |
| `src/ui/player.js` | Create (T5) | Trajectory sampling, scene, real-time replay |
| `src/study/safety-session.js` | Create (T6) | Session state (pure) |
| `src/study/safety-copy.js` | Create (T6) | Every Safety Studio string (pure) |
| `src/study/safety-state.js` | Create (T7) | Control enablement and open action (pure) |
| `src/study/safety-studio.js` | Create (T7), Modify (T8) | Screen glue |
| `src/ui/ball-drag.js` | Create (T8) | Pick, clamp, validated move (pure) |
| `bench/bench.js` | Modify (T9) | Hint replay and score round trips |
| `docs/acceptance-checklist.md` | Modify (T9) | Stage 1b owner items |
| `src/precache.js`, `sw.js` | Modify (every task) | FILES and stamp |
| `test/router.test.js`, `test/aim.test.js`, `test/controls.test.js`, `test/table-view.test.js`, `test/player.test.js`, `test/safety-session.test.js`, `test/safety-copy.test.js`, `test/safety-state.test.js`, `test/ball-drag.test.js` | Create | Pure-module tests |
| `test/site.test.js`, `test/search-worker.test.js`, `test/ui.test.js` | Modify | Shell, worker and banner tests |

---

### Task 1: Shell, router, Home, Study list, Table door, update banner

**Files:**
- Create: `src/app.js`, `src/ui/router.js`, `src/ui/update-banner.js`, `src/study/index.js`, `src/table/index.js`, `test/router.test.js`
- Modify: `index.html`, `test/site.test.js`, `test/ui.test.js`, `src/precache.js` + `sw.js`
- Delete: `src/home.js`
- Commit as well: `docs/superpowers/plans/2026-11-25-runout-lab-stage1b-ui.md`

**Interfaces:**
- Produces:
  - `parseHash(hash: string): {path: string, params: Record<string,string>}`. Strip one leading `#`. Split once at the first `?`. `path` is `'/'` when empty; otherwise one trailing `/` is removed when `path.length > 1`. The query splits on `&` and drops empty parts. Each part splits at its first `=`; a part with no `=` gets value `''`. Keys and values go through `decodeURIComponent` and keep the raw string if it throws. A later duplicate key wins.
  - `matchRoute(hash: string): {screen: 'home'|'study'|'safety'|'table', params: Record<string,string>, known: boolean}`. Paths: `/` → home, `/study` → study, `/study/safety` → safety, `/table` → table. Anything else → `{screen: 'home', params: {}, known: false}`.
  - `safetyMode(params): {mode: 'session'} | {mode: 'deal', id: number} | {mode: 'example', slug: string} | {mode: 'missing'}` (ruling B5).
  - `initUpdateBanner(btn: HTMLButtonElement, register = registerServiceWorker): Promise<ServiceWorkerRegistration|null>`. It calls `register({onUpdateReady(apply) { btn.hidden = false; btn.onclick = apply; }})` and returns its promise.
  - Screen contract: each screen module exports `mount(el: HTMLElement, params: Record<string,string>): () => void`. The returned function unmounts it.
- `index.html` body, in order:
  1. `<header class="top">` holding `.bar` and `<nav class="tabs" aria-label="Modules">`.
     - `.bar` holds `<a class="brand" href="#/">RUN<span class="dot"></span><b>OUT</b> LAB</a>` and the tagline.
     - The nav holds the seven current links unchanged. Safety Studio still points to `legacy/index.html#safety` until Task 7.
  2. `<div id="update-wrap" role="status"><button id="update" class="btn active" hidden>New version available — tap to reload</button></div>`
  3. `<main id="app" class="wrap"></main>`
  4. `<div class="wrap"><footer>Runout Lab · works offline once loaded</footer></div>`
  5. `<script type="module" src="src/app.js"></script>`
- CSS changes (§4):
  - Text colour: `.tagline` uses `--muted`. `.tab .ix` and `.kicker` use `--brass`. `footer`, `.hint` and `a.navcard::after` use `--muted`.
  - Text size: `.tagline`, `.tab .ix`, `.pill`, `.kicker`, `footer` and `a.navcard::after` are `.75rem`.
  - `.brand` adds `color:inherit;text-decoration:none`.
  - `h3.sub` becomes `.sub`.
  - Add `.g2{grid-template-columns:repeat(2,1fr)}`, which becomes `1fr` under the existing `@media(max-width:820px)`.
  - Add `.door .btn{min-height:64px;width:100%}`.
  - Add `h1[tabindex="-1"]:focus{outline:none}`.
  - Add `.btn:focus-visible{outline:2px solid var(--brass2);outline-offset:2px}`.
- `src/app.js`:
  - `SCREENS = {home, study, safety: home, table}`. `safety` maps to Home until Task 7.
  - `show(focus: boolean)` does the following:
    - It reads `r = matchRoute(location.hash)`. If `!r.known`, it calls `history.replaceState(null, '', '#/')`.
    - It calls the previous unmount, then `el.replaceChildren()`, then mounts `SCREENS[r.screen]`.
    - It sets `aria-current="page"` and class `active` on the nav link whose `href` is `#/study/safety` when `r.screen === 'safety'`, and removes them from every other nav link.
    - If `focus`, it calls `scrollTo(0, 0)` and focuses the screen's `<h1 tabindex="-1">`.
  - Boot runs `show(false)` and `addEventListener('hashchange', () => show(true))`, then `initUpdateBanner(document.getElementById('update'))`.
  - The Home view lives in `app.js`:
    - `<div class="hero">` holds kicker `Training hub`, `<h1 class="title" tabindex="-1">Close the rack.<br><em>Win the safety battle.</em></h1>` and lede `Safety Studio is rebuilt. The other modules open the current version.`
    - Then `<div class="grid g2">` with two `a.panel.navcard` cards, each with `<h2 class="sub">`:
      - **Study**: `#/study`, note `Simulated drills and theory at a desk or on your phone.`
      - **Table**: `#/table`, note `Run drills at a real table and log what happened.`
- `src/study/index.js`:
  - Hero with `<h1 class="title" tabindex="-1">Study</h1>` and lede `Simulated drills and theory at a desk or on your phone.`
  - Then `<div class="grid g3">` with the six Study cards copied from the current `index.html` lines 121–126 (`h3` becomes `h2`).
  - Escape Trainer's note becomes `Kick out of hooks with the mirror system and see where the cue ball really goes.`
  - Safety Studio's card is unchanged until Task 7.
- `src/table/index.js`:
  - `<div class="door">` holds a hero with `<h1 class="title" tabindex="-1">Table</h1>` and lede `Run drills at a real table. Until the new drill screens ship, drills open the current version.`
  - Then one large `a.panel.navcard` to `legacy/index.html#drills` with `<h2 class="sub">Table Drills</h2>` and a `<ul>` of the eight names, in order: `Stop-Shot Ladder`, `Up-and-Down Speed Control`, `Wagon Wheel`, `Progressive Ghost`, `Key-Ball End Game`, `Insurance Breakout`, `Hide-Behind-Target`, `Line-of-Balls Mirror Kick`. Under the list, the note `Logs in the current version last for this visit only.`
  - Then the wake-lock panel. It keeps the `src/home.js` markup, button texts, status texts and the fallback template exactly: `Wake lock not available (${reason}). Set Auto-Lock to Never: Settings → Display & Brightness → Auto-Lock.`
  - Unmount calls `wakeLock.stop()`.

- [ ] **Step 0: Snapshot and branch.** Run `tar -czf ~/runout-lab-snapshot-2026-11-25-stage1b.tgz -C /Users/reubenpatterson/pool_drills runout-lab && cd /Users/reubenpatterson/pool_drills/runout-lab && git checkout -b stage-1b`.
- [ ] **Step 1: Write the failing tests.** Create `test/router.test.js`:

```js
// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHash, matchRoute, safetyMode } from '../src/ui/router.js';

test('parseHash: path and decoded params', () => {
  for (const h of ['', '#', '#/']) assert.deepEqual(parseHash(h), { path: '/', params: {} });
  assert.deepEqual(parseHash('#/study'), { path: '/study', params: {} });
  assert.deepEqual(parseHash('#/study/safety?deal=123'), { path: '/study/safety', params: { deal: '123' } });
  assert.deepEqual(parseHash('#/study/safety?example=open-hook&x=a%20b'), { path: '/study/safety', params: { example: 'open-hook', x: 'a b' } });
  assert.deepEqual(parseHash('#/table/'), { path: '/table', params: {} });
});
test('matchRoute: every row of the route table; unknown routes go home and are not known', () => {
  assert.deepEqual(['', '#', '#/', '#/study', '#/study/safety', '#/study/safety?deal=5', '#/study/safety?example=rail-tuck', '#/table'].map((h) => matchRoute(h).screen),
    ['home', 'home', 'home', 'study', 'safety', 'safety', 'safety', 'table']);
  assert.deepEqual(matchRoute('#/study/safety?deal=5'), { screen: 'safety', params: { deal: '5' }, known: true });
  for (const h of ['#/nope', '#study', '#/study/escape', '#/tablex']) assert.deepEqual(matchRoute(h), { screen: 'home', params: {}, known: false });
});
test('safetyMode: deal must be digits, deal beats example, an invalid deal is a missing layout', () => {
  assert.deepEqual(safetyMode({}), { mode: 'session' });
  assert.deepEqual(safetyMode({ deal: '85723992' }), { mode: 'deal', id: 85723992 });
  assert.deepEqual(safetyMode({ deal: '7', example: 'open-hook' }), { mode: 'deal', id: 7 });
  assert.deepEqual(safetyMode({ example: 'open-hook' }), { mode: 'example', slug: 'open-hook' });
  for (const d of ['', '12abc', '-3', '1.5', ' 4']) assert.deepEqual(safetyMode({ deal: d, example: 'open-hook' }), { mode: 'missing' });
});
test('RF2: malformed links never throw', () => {
  assert.deepEqual(parseHash('#/study/safety?deal=%E0%A4%A'), { path: '/study/safety', params: { deal: '%E0%A4%A' } });
  assert.deepEqual(parseHash('#/study/safety?deal'), { path: '/study/safety', params: { deal: '' } });
  assert.deepEqual(parseHash('#/study/safety?deal=1&deal=2'), { path: '/study/safety', params: { deal: '2' } });
  assert.deepEqual(parseHash('#/study/safety?&&a=1&q=b=c'), { path: '/study/safety', params: { a: '1', q: 'b=c' } });
});
```

  Append to `test/ui.test.js` (add `import { initUpdateBanner } from '../src/ui/update-banner.js';` at the top):

```js
test('update banner: hidden until onUpdateReady, then tapping applies', async () => {
  const btn = { hidden: true, onclick: null }, apply = () => {};
  /** @type {any} */ let opts = null;
  await initUpdateBanner(/** @type {any} */ (btn), async (o) => { opts = o; return null; });
  assert.equal(btn.hidden, true); opts.onUpdateReady(apply);
  assert.equal(btn.hidden, false); assert.equal(btn.onclick, apply);
});
```

  In `test/site.test.js`, add `import { posix } from 'node:path';`. Replace the test `home uses the legacy look…` with the three tests below. Keep every other test.

```js
test('shell: legacy look, brand links home, update banner, app.js, no home.js', () => {
  const html = read('index.html');
  assert.ok(html.includes('<link rel="stylesheet" href="fonts/fonts.css">') && !/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(html));
  assert.ok(html.includes('<header class="top">') && html.includes('<a class="brand" href="#/">RUN<span class="dot"></span><b>OUT</b> LAB</a>'));
  for (const t of ['--bg:#0a0e0c', '--brass:#c8a24c', '--ink:#ece7d6', '--red:#df6a4f', '--rail:#241b12', '--rail2:#160f09']) assert.ok(html.includes(t), t);
  assert.ok(html.includes('<nav class="tabs" aria-label="Modules">'));
  assert.ok(html.includes('<div id="update-wrap" role="status"><button id="update" class="btn active" hidden>New version available — tap to reload</button></div>'));
  assert.ok(html.includes('<main id="app" class="wrap"></main>'));
  assert.ok(html.includes('<script type="module" src="src/app.js"></script>') && !html.includes('src/home.js'));
  assert.ok(html.includes('<meta name="viewport" content="width=device-width, initial-scale=1">'));
  assert.ok(!existsSync(new URL('src/home.js', root)));
  const app = read('src/app.js');
  for (const s of ['Training hub', 'Close the rack.', 'Win the safety battle.', 'Safety Studio is rebuilt. The other modules open the current version.', 'href="#/study"', 'href="#/table"']) assert.ok(app.includes(s), s);
});
test('§14 text rules: nothing below 0.75rem or 12px; --faint and --brass-dim never colour text', () => {
  const css = /** @type {RegExpMatchArray} */ (read('index.html').match(/<style>([\s\S]*?)<\/style>/))[1];
  for (const m of css.matchAll(/font-size:\s*([\d.]+)(rem|px)/g)) assert.ok(m[2] === 'rem' ? Number(m[1]) >= 0.75 : Number(m[1]) >= 12, m[0]);
  assert.ok(!/(^|[;{\s])color:\s*var\(--(faint|brass-dim)\)/.test(css));
  assert.ok(css.includes('.door .btn{min-height:64px'));
});
test('Study list and Table door copy', () => {
  const study = read('src/study/index.js'), table = read('src/table/index.js');
  for (const id of ['plan', 'position', 'closer', 'escape', 'decide']) assert.ok(study.includes(`legacy/index.html#${id}`), id);
  assert.ok(study.includes('Kick out of hooks with the mirror system and see where the cue ball really goes.') && !study.includes('calculator'));
  assert.ok(table.includes('legacy/index.html#drills'));
  for (const s of ['Stop-Shot Ladder', 'Up-and-Down Speed Control', 'Wagon Wheel', 'Progressive Ghost', 'Key-Ball End Game', 'Insurance Breakout', 'Hide-Behind-Target', 'Line-of-Balls Mirror Kick',
    'Logs in the current version last for this visit only.', 'Run drills at a real table. Until the new drill screens ship, drills open the current version.',
    'Start wake-lock test', 'Stop wake-lock test', 'Held — the screen should stay on.', 'Set Auto-Lock to Never: Settings → Display & Brightness → Auto-Lock.']) assert.ok(table.includes(s), s);
});
/** Relative static imports reachable from entry (repo-relative POSIX paths). @param {string} entry */
function importGraph(entry) {
  const seen = new Set(), stack = [entry];
  while (stack.length) {
    const f = /** @type {string} */ (stack.pop());
    if (seen.has(f)) continue;
    seen.add(f);
    for (const m of read(f).matchAll(/(?:^|\n)\s*(?:import|export)\s(?:[^;'"]*?\sfrom\s*)?['"](\.{1,2}\/[^'"]+)['"]/g)) stack.push(posix.normalize(posix.join(posix.dirname(f), m[1])));
  }
  return seen;
}
test('main thread never imports the engine simulation, eval or search (GC4)', () => {
  const g = importGraph('src/app.js');
  assert.ok(g.has('src/ui/router.js') && g.has('src/table/index.js'));
  const bad = [...g].filter((f) => /^src\/(eval\/|engine\/(simulate|motion|cushion)\.js$|search\/(search|grid|handle|worker)\.js$)/.test(f));
  assert.deepEqual(bad, []);
});
```

- [ ] **Step 2: Run** `node --test test/router.test.js test/site.test.js test/ui.test.js`. Expected: FAIL (`ERR_MODULE_NOT_FOUND` for `src/ui/router.js` and `src/ui/update-banner.js`; the shell tests fail on the old `index.html`).
- [ ] **Step 3: Implement** everything in Interfaces. Then `git rm src/home.js`. In `FILES`, remove `src/home.js` and add `src/app.js`, `src/study/index.js`, `src/table/index.js`, `src/ui/router.js`, `src/ui/update-banner.js`. Run `node scripts/stamp.js`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Browser check.** Run `python3 -m http.server 3000` in the repo root and open `http://localhost:3000/`. Expected:
  - `#/`, `#/study` and `#/table` render. `#/nope` lands on Home with the URL showing `#/`.
  - Back and forward move between screens, and focus lands on each `<h1>`.
  - The Table door wake-lock button toggles.
  - The DevTools console shows no errors.

  If no browser is available, report `NEEDS-BROWSER` and the controller runs this check.
- [ ] **Step 6: Commit.** `git add index.html src/app.js src/ui/router.js src/ui/update-banner.js src/study/index.js src/table/index.js test/router.test.js test/site.test.js test/ui.test.js src/precache.js sw.js docs/superpowers/plans/2026-11-25-runout-lab-stage1b-ui.md && git commit -m "Shell: hash router, Home, Study list, Table door with wake-lock check, update banner, contrast and 12 px fixes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`. `git rm` has already staged the deletion.

### Task 2: Worker `simulate` and `score` requests

**Files:**
- Modify: `src/search/handle.js`, `src/search/client.js`, `test/search-worker.test.js`, `src/precache.js` + `sw.js` (stamp)

**Interfaces:**
- Consumes: `simulate(layout, shot, opts)` from `src/engine/simulate.js`, `scoreSafety(layout, shot)` from `src/eval/safety.js` (imported by `handle.js`, which runs in the worker).
- Produces:
  - Request `{id, type: 'simulate', layout, shot}` → `{id, type: 'result', result: simulate(layout, shot, {record: true})}`.
  - Request `{id, type: 'score', layout, shot}` → `{id, type: 'result', result: scoreSafety(layout, shot)}`.
  - Both are handled before the bank is awaited, the same way `suggest` is. A thrown error answers `{id, type: 'error', message: err.message}` through the existing catch.
  - The client gains `simulate(layout: Layout, shot: Shot): Promise<SimResult>` and `score(layout: Layout, shot: Shot): Promise<SafetyScore>`.

- [ ] **Step 1: Write the failing tests.** Append to `test/search-worker.test.js`. Add `import { simulate } from '../src/engine/simulate.js';` and `import { scoreSafety } from '../src/eval/safety.js';` to its imports.

```js
test('simulate and score through the handler deep-equal direct calls on 3 bank entries, without the bank', async () => {
  const h = createHandler(() => Promise.reject(new Error('must not load the bank')));
  for (const e of [bank.entries[0], bank.entries[400], bank.entries[bank.entries.length - 1]]) {
    assert.deepEqual(await h({ id: 1, type: 'simulate', layout: e.layout, shot: e.best.shot }), { id: 1, type: 'result', result: simulate(e.layout, e.best.shot, { record: true }) });
    assert.deepEqual(await h({ id: 2, type: 'score', layout: e.layout, shot: e.best.shot }), { id: 2, type: 'result', result: scoreSafety(e.layout, e.best.shot) });
  }
  const e = bank.entries[0];
  assert.deepEqual(await h({ id: 3, type: 'simulate', layout: { ...e.layout, cueId: 'zz' }, shot: e.best.shot }), { id: 3, type: 'error', message: 'invalid layout: missing-cue' });
});
test('client.simulate and client.score resolve with the worker results', async () => {
  const c = createSearchClient(fakeWorker(createHandler(load))), e = bank.entries[1];
  assert.deepEqual(await c.simulate(e.layout, e.best.shot), simulate(e.layout, e.best.shot, { record: true }));
  assert.deepEqual(await c.score(e.layout, e.best.shot), e.best.score);
});
```

- [ ] **Step 2: Run** `node --test test/search-worker.test.js`. Expected: the 2 new tests FAIL (`unknown request type: simulate` and `c.simulate is not a function`).
- [ ] **Step 3: Implement** per Interfaces, then run `node scripts/stamp.js`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit.** `git add src/search/handle.js src/search/client.js test/search-worker.test.js src/precache.js sw.js && git commit -m "Worker: simulate and score requests for replay and shot scoring" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 3: Aim, spin pad and speed control

**Files:**
- Create: `src/ui/aim.js`, `src/ui/spin-pad.js`, `src/ui/speed.js`, `test/aim.test.js`, `test/controls.test.js`
- Modify: `index.html` (CSS), `src/precache.js` + `sw.js`

**Interfaces:**
- Consumes: `visibility`, `firstBallOnRay` (`src/geometry/visibility.js`), `R`, `W`, `H` (`src/engine/constants.js`).
- Produces (`src/ui/aim.js`, all pure):
  - `normDeg(a: number): number` maps into (−180, 180].
  - `nudge(aimDeg: number, delta: number): number` is `normDeg(aimDeg + delta)`.
  - `aimKey(aimDeg: number, key: string, shift: boolean): number|null`. `ArrowLeft` gives −1 and `ArrowRight` gives +1; with Shift they give −0.1 and +0.1. Any other key gives `null`.
  - `defaultAim(layout: Layout): number`:
    - It finds the legal ball (`rules.legalIds`) with the highest `visibility(cue, ball, balls, [cueId])`. It walks balls in layout order and replaces the pick only on strictly greater V.
    - It returns the direction from the cue to that ball's centre, in degrees.
  - `aimPreview(layout: Layout, aimDeg: number): {end: {x, y}, hitId: string|null}`:
    - `tBall` comes from `firstBallOnRay(cue, dir, balls, [cueId])`.
    - `tRail` is the distance to the box x ∈ [R, W − R], y ∈ [R, H − R].
    - If `tBall` exists and `tBall ≤ tRail`: `end = cue + dir·tBall` and `hitId` is that ball's id. Otherwise `end = cue + dir·tRail` and `hitId` is `null`.
  - Constants: `HANDLE_MIN_IN = 14`, `HANDLE_MIN_PX = 36`, `HIT_RADIUS_PX = 22`.
  - `handlePoint(cue, aimDeg, pxPerIn, back: boolean): {x, y}` lies at distance `max(14, 36 / pxPerIn)` along `aimDeg`, or along `aimDeg + 180` when `back`.
  - `handleSide(cue, aimDeg, pxPerIn): boolean` returns `true` (back) when the front point lies outside x ∈ [−5 + h, 105 − h], y ∈ [−5 + h, 55 − h], with h = 22 / pxPerIn.
  - `hitsHandle(handle, p, pxPerIn): boolean` is `dist ≤ 22 / pxPerIn`.
  - `aimFromDrag(cue, p, back): number` is `normDeg(atan2(p − cue))`, plus 180 when `back`.
- Produces (`src/ui/spin-pad.js`):
  - `clampSpin(x, y): {x, y}` scales to the unit disk when the length is > 1, then rounds each component to 0.05 (`Math.round(v * 20) / 20`), then normalises `-0` to `0`.
  - `spinFromOffset(dx, dy, radius)` is `clampSpin(dx / radius, -dy / radius)`. Screen up means follow.
  - `spinText(spin): string`:
    - The vertical part comes first: `follow`/`draw` + `abs.toFixed(2)`.
    - Then ` · `, then the side part: `right`/`left` + `abs.toFixed(2)`.
    - A zero component is omitted. Both zero gives `center`.
  - `spinKey(spin, key): {x, y}|null`:
    - `ArrowUp`/`ArrowDown` change y by ±0.1, and `ArrowRight`/`ArrowLeft` change x by ±0.1, each through `clampSpin`.
    - `0` and `Home` give `{x: 0, y: 0}`. Any other key gives `null`.
  - `createSpinPad(container: HTMLElement, opts: {onChange: (spin) => void}): {get(), set(spin), setDisabled(b: boolean), destroy()}`:
    - A 96 px circle (pad radius 48) with `tabindex="0"`, `role="group"` and `aria-label="Cue tip position"`.
    - Pointer down or drag sets the tip through `spinFromOffset`. Arrow keys use `spinKey` and call `preventDefault`.
    - The label under it shows `spinText`, with `aria-live="polite"`.
    - `set` does not call `onChange`.
- Produces (`src/ui/speed.js`):
  - `SPEED_MIN_UI = 8`, `SPEED_MAX_UI = 130`, `SPEED_DEFAULT = 40`.
  - `clampSpeed(v)` clamps to [8, 130].
  - `speedWord(v)`: < 25 `soft`, 25–59 `medium`, 60–94 `firm`, ≥ 95 `hard`.
  - `speedText(v)` is `` `${n} in/s · ${speedWord(n)}` `` with `n = Math.round(v)`.
  - `stepSpeed(v, dir: 1|-1)` is `clampSpeed(Math.round(v) + dir)`.
  - `createSpeedControl(container, opts: {onChange: (v) => void}): {get(), set(v), setDisabled(b), destroy()}`:
    - It holds an `<input type="range" min="8" max="130" step="1" aria-label="Speed">`, −/+ buttons (44 px, `aria-label` `Slower` and `Faster`) and an `<output>` showing `speedText`.
    - `get()` returns the exact held value. `set(v)` stores it exactly and shows `Math.round(v)` on the slider. User input stores integers.
    - `set` does not call `onChange`.
- CSS: `.spin-pad{width:96px;height:96px;border-radius:50%;background:#f2eedd;position:relative;touch-action:none}` plus a 12 px `--chalk` tip dot. `.speed input[type=range]{width:100%;min-height:44px}`.

- [ ] **Step 1: Write the failing tests.** Create `test/aim.test.js`:

```js
// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normDeg, nudge, aimKey, defaultAim, aimPreview, handlePoint, handleSide, hitsHandle, aimFromDrag } from '../src/ui/aim.js';
import { R } from '../src/engine/constants.js';
import { B, L, near } from './helpers.js';

test('normDeg maps into (−180, 180]', () => {
  assert.deepEqual([0, 180, -180, 540, -190, 181, 359.5, 90].map(normDeg), [0, 180, 180, 180, 170, -179, -0.5, 90]);
});
test('nudges and arrow keys wrap through ±180', () => {
  assert.equal(nudge(179.5, 1), -179.5); assert.ok(near(nudge(-179.95, -0.1), 179.95, 1e-9)); assert.ok(near(nudge(10, 0.1), 10.1, 1e-9));
  assert.equal(aimKey(10, 'ArrowRight', false), 11); assert.equal(aimKey(10, 'ArrowLeft', false), 9);
  assert.ok(near(/** @type {number} */ (aimKey(10, 'ArrowRight', true)), 10.1, 1e-9)); assert.ok(near(/** @type {number} */ (aimKey(10, 'ArrowLeft', true)), 9.9, 1e-9));
  assert.equal(aimKey(10, 'ArrowUp', false), null);
});
test('defaultAim: the most visible legal ball; ties go to the lower layout index', () => {
  const balls = [B('cue', 20, 25), B('1', 60, 25), B('2', 20, 10), B('9', 40, 25)];
  assert.ok(near(defaultAim(L(balls, ['1', '2'])), -90, 1e-9)); // '1' is behind '9' (measured V 0), '2' is open (V 1)
  assert.ok(near(defaultAim(L(balls.slice(0, 3), ['1', '2'])), 0, 1e-9)); // both V 1 → '1', the lower index
});
test('aimPreview ends at the first ball contact or at the cushion line (centre R from the cushion)', () => {
  const lay = L([B('cue', 25, 25), B('ob', 75, 25)]);
  assert.deepEqual(aimPreview(lay, 0), { end: { x: 75 - 2 * R, y: 25 }, hitId: 'ob' });
  const down = aimPreview(lay, 90); assert.equal(down.hitId, null); assert.ok(near(down.end.x, 25, 1e-9) && near(down.end.y, 50 - R, 1e-9));
  const diag = aimPreview(lay, 45); assert.equal(diag.hitId, null); assert.ok(near(diag.end.x, 50 - R, 1e-9) && near(diag.end.y, 50 - R, 1e-9));
  assert.ok(near(aimPreview(lay, 180).end.x, R, 1e-9));
});
test('RF3: handle at max(14 in, 36 px), 22 px hit radius, flips behind the cue near a rail', () => {
  const cue = { x: 50, y: 25 };
  assert.deepEqual(handlePoint(cue, 0, 3.4, false), { x: 64, y: 25 });
  assert.ok(near(handlePoint(cue, 0, 2, false).x, 68, 1e-9));
  assert.equal(handleSide(cue, 0, 3.4), false);
  assert.ok(hitsHandle({ x: 64, y: 25 }, { x: 64 + 22 / 3.4 - 1e-6, y: 25 }, 3.4)); assert.ok(!hitsHandle({ x: 64, y: 25 }, { x: 64 + 22 / 3.4 + 1e-3, y: 25 }, 3.4));
  const rail = { x: 98, y: 25 };
  assert.equal(handleSide(rail, 0, 3.4), true);
  const hb = handlePoint(rail, 0, 3.4, true); assert.ok(near(hb.x, 84, 1e-9) && near(hb.y, 25, 1e-9));
  assert.ok(near(aimFromDrag(rail, { x: 80, y: 25 }, true), 0, 1e-9));
  assert.ok(near(aimFromDrag(cue, { x: 50, y: 40 }, false), 90, 1e-9));
  assert.equal(handleSide({ x: 50, y: 48.8 }, 90, 3.4), true);
});
```

  Create `test/controls.test.js`:

```js
// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampSpin, spinFromOffset, spinText, spinKey } from '../src/ui/spin-pad.js';
import { clampSpeed, speedWord, speedText, stepSpeed } from '../src/ui/speed.js';

test('spin: offset over radius, screen up is follow, clamped to the unit disk, rounded to 0.05', () => {
  assert.deepEqual(spinFromOffset(0, -48, 48), { x: 0, y: 1 });
  assert.deepEqual(spinFromOffset(24, 12, 48), { x: 0.5, y: -0.25 });
  assert.deepEqual(spinFromOffset(96, 0, 48), { x: 1, y: 0 });
  assert.deepEqual(spinFromOffset(100, -100, 50), { x: 0.7, y: 0.7 });
  assert.deepEqual(spinFromOffset(0, 0, 48), { x: 0, y: 0 });
  assert.deepEqual(clampSpin(0.33, -0.12), { x: 0.35, y: -0.1 });
});
test('spin text and keys', () => {
  assert.equal(spinText({ x: 0, y: 0 }), 'center');
  assert.equal(spinText({ x: 0.2, y: 0.6 }), 'follow 0.60 · right 0.20');
  assert.equal(spinText({ x: -0.5, y: -0.8 }), 'draw 0.80 · left 0.50');
  assert.equal(spinText({ x: 0.3, y: 0 }), 'right 0.30');
  assert.deepEqual(spinKey({ x: 0, y: 0.95 }, 'ArrowUp'), { x: 0, y: 1 });
  assert.deepEqual(spinKey({ x: 0.7, y: 0.7 }, 'ArrowRight'), { x: 0.75, y: 0.65 });
  assert.deepEqual(spinKey({ x: 0.5, y: 0.5 }, 'Home'), { x: 0, y: 0 }); assert.deepEqual(spinKey({ x: 0.5, y: 0.5 }, '0'), { x: 0, y: 0 });
  assert.equal(spinKey({ x: 0, y: 0 }, 'a'), null);
});
test('speed words at each edge, rounded display, clamped steps', () => {
  assert.deepEqual([8, 24, 25, 59, 60, 94, 95, 130].map(speedWord), ['soft', 'soft', 'medium', 'medium', 'firm', 'firm', 'hard', 'hard']);
  assert.equal(speedText(40), '40 in/s · medium'); assert.equal(speedText(31.5), '32 in/s · medium'); assert.equal(speedText(24.6), '25 in/s · medium');
  assert.deepEqual([5, 52.3, 200].map(clampSpeed), [8, 52.3, 130]);
  assert.deepEqual([stepSpeed(31.5, 1), stepSpeed(130, 1), stepSpeed(8, -1)], [33, 130, 8]);
});
```

- [ ] **Step 2: Run** `node --test test/aim.test.js test/controls.test.js`. Expected: FAIL (`ERR_MODULE_NOT_FOUND`).
- [ ] **Step 3: Implement** per Interfaces. Add the three files to `FILES` and run `node scripts/stamp.js`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit.** `git add src/ui/aim.js src/ui/spin-pad.js src/ui/speed.js test/aim.test.js test/controls.test.js index.html src/precache.js sw.js && git commit -m "UI: aim math with default aim, straight preview and rail-safe handle; spin pad; speed control" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 4: Table renderer

**Files:**
- Create: `src/ui/table-view.js`, `test/table-view.test.js`
- Modify: `index.html` (CSS), `src/precache.js` + `sw.js`

**Interfaces:**
- Consumes: `POCKETS`, `JAWS` (`src/engine/table.js`), `R`, `W`, `H`.
- Produces (pure):
  - `RAIL_IN = 5`.
  - `viewTransform(cssWidth: number): {pxPerIn, cssHeight, toScreen(p): {x, y}, toTable(x, y): {x, y}}`:
    - `pxPerIn = cssWidth / 110` and `cssHeight = 60 · pxPerIn`.
    - `toScreen(p) = ((p.x + 5)·pxPerIn, (p.y + 5)·pxPerIn)`. `toTable` is its inverse, taking canvas-relative CSS px.
  - `ballRadiusPx(pxPerIn)` is `max(R · pxPerIn, 3.5)`.
  - `ballColour(id: string): string`:
    - `cue` `#f2eedd`, `ob` `#cf4631`, `/^b\d+$/` `#2f6fb0`.
    - Numeric ids 1–8 use legacy `BALLCOL`: 1 `#e9c63b`, 2 `#2f6fb0`, 3 `#cf4631`, 4 `#6e44a0`, 5 `#e2872d`, 6 `#2f8f5b`, 7 `#7c3a32`, 8 `#141414`. Ids 9–15 use the colour of `n − 8`.
    - Anything else is `#2f6fb0`.
  - `ballStriped(id)` is true for numeric 9–15.
  - `ballLabel(id)` is the id for numeric ids and `''` otherwise.
  - `ballStyles(balls: Ball[]): {colours: Record<string,string>, labels: Record<string,string>}`.
  - `/** @typedef {{balls: Ball[], colours: Record<string,string>, labels: Record<string,string>, aim?: {from:{x:number,y:number}, to:{x:number,y:number}, ghost:{x:number,y:number}|null}, handle?: {x:number,y:number}, traces?: {id:string, pts:{x:number,y:number}[], colour:string}[], ghosts?: {x:number,y:number}[], highlight?: string[]}} Scene */`
- Produces (DOM): `createTableView(canvas: HTMLCanvasElement): {draw(scene: Scene), toTable(clientX, clientY), toScreen(p), get pxPerIn(), destroy()}`.
  - **Size.** CSS width is the canvas's `clientWidth`, and the height follows the aspect (CSS `aspect-ratio: 110 / 60`). The backing store is scaled by `min(devicePixelRatio, 2)`.
  - **Resize.** A `ResizeObserver` rebuilds the offscreen base layer and redraws the last scene. `destroy()` disconnects it.
  - **Base layer** (offscreen canvas, rebuilt per resize):
    - Rail bed `#1c140c`: the full canvas as a rounded rect with corner radius 2.5 in.
    - Felt: the rect (0, 0)–(100, 50) with a vertical gradient `#19543a → #14442f → #0e3322` (stops 0, .5, 1).
    - Diamonds: `rgba(236,210,138,.85)`, 1.2 in squares rotated 45°. They sit at x = 12.5·i (i = 1..7, i ≠ 4) on y = −2.5 and y = 52.5, and at y = 12.5·i (i = 1..3) on x = −2.5 and x = 102.5.
    - Pockets: for each `POCKETS[k]`, a `#05100a` circle centred on the midpoint of its two `JAWS` points, with radius half the jaw-to-jaw distance.
  - **Each frame**, in order: blit the base layer, then:
    - `ghosts`: outline circles, ball radius, `rgba(137,147,137,.6)`, 1 px, dash [3, 3].
    - `traces`: polylines, width 1.5 px, in each trace's `colour`.
    - `aim`: a line from `from` to `to`, `rgba(236,231,214,.75)`, 1.5 px. If `ghost` is set, an unfilled circle of ball radius at `ghost`, same stroke.
    - Balls: a filled `colours[id]` disc of radius `ballRadiusPx` with a 1 px `rgba(0,0,0,.5)` stroke. A striped ball is a white disc with a colour band 1.1·r tall, clipped to the disc. A label is drawn only when the radius is ≥ 7 px: `#141414` text, bold, `Space Mono`, size = radius, on a white disc of 0.55·r.
    - `highlight`: rings of `#ecd28a`, 1.5 px, radius r + 2 px.
    - `handle`: a filled `#ecd28a` circle of radius 9 px with a 2 px `rgba(0,0,0,.6)` stroke.
  - **Coordinates.** `toTable(clientX, clientY)` subtracts `canvas.getBoundingClientRect()` and applies the inverse transform.
- CSS: `canvas.felt{display:block;width:100%;height:auto;aspect-ratio:110/60;touch-action:manipulation}` and `canvas.felt:focus-visible{outline:2px solid var(--brass2);outline-offset:2px}`.

- [ ] **Step 1: Write the failing test** `test/table-view.test.js`:

```js
// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RAIL_IN, viewTransform, ballRadiusPx, ballColour, ballStriped, ballLabel, ballStyles } from '../src/ui/table-view.js';
import { B, near } from './helpers.js';

test('transform: 5 in rail, 110 × 60 aspect, exact inverse', () => {
  assert.equal(RAIL_IN, 5);
  const v = viewTransform(374);
  assert.ok(near(v.pxPerIn, 3.4, 1e-12) && near(v.cssHeight, 204, 1e-9));
  const a = v.toScreen({ x: 0, y: 0 }), b = v.toScreen({ x: 100, y: 50 });
  assert.ok(near(a.x, 17, 1e-9) && near(a.y, 17, 1e-9) && near(b.x, 357, 1e-9) && near(b.y, 187, 1e-9));
  const p = v.toTable(b.x, b.y); assert.ok(near(p.x, 100, 1e-9) && near(p.y, 50, 1e-9));
});
test('ball radius is true scale with a 3.5 px floor', () => {
  assert.ok(near(ballRadiusPx(3.4), 3.825, 1e-9)); assert.equal(ballRadiusPx(2), 3.5);
});
test('ball colours, stripes and labels follow legacy BALLCOL', () => {
  assert.deepEqual(['cue', 'ob', 'b3', '1', '8', '9', '10', '15', 'zz'].map(ballColour),
    ['#f2eedd', '#cf4631', '#2f6fb0', '#e9c63b', '#141414', '#e9c63b', '#2f6fb0', '#7c3a32', '#2f6fb0']);
  assert.deepEqual(['9', '10', '15', '8', '1', 'cue', 'ob'].map(ballStriped), [true, true, true, false, false, false, false]);
  assert.deepEqual(['10', 'ob', 'cue'].map(ballLabel), ['10', '', '']);
  assert.deepEqual(ballStyles([B('cue', 1, 1), B('9', 2, 2)]), { colours: { cue: '#f2eedd', 9: '#e9c63b' }, labels: { cue: '', 9: '9' } });
});
```

- [ ] **Step 2: Run** `node --test test/table-view.test.js`. Expected: FAIL (`ERR_MODULE_NOT_FOUND`).
- [ ] **Step 3: Implement** per Interfaces. Add the file to `FILES` and run `node scripts/stamp.js`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit.** `git add src/ui/table-view.js test/table-view.test.js index.html src/precache.js sw.js && git commit -m "UI: canvas table renderer with legacy felt, true-size pockets and ball styles" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 5: Animation player

**Files:**
- Create: `src/ui/player.js`, `test/player.test.js`
- Modify: `src/precache.js` + `sw.js`

**Interfaces:**
- Consumes: `SimResult` (trajectory samples are strictly increasing in `t`, and every ball's last sample is at `duration`; measured on 120 bank simulations), `Scene` and `createTableView` (Task 4).
- Produces (pure):
  - `positionsAt(sim, t): Record<string, {x, y}>`. For each trajectory it binary-searches for the last sample `s` with `s.t ≤ t`:
    - If `s` is the last sample or `s.t === t`, it returns `{x: s.x, y: s.y}` exactly.
    - Otherwise it interpolates linearly toward the next sample.
    - `t` below the first sample's time gives the first sample.
  - `visibleAt(sim, t): string[]` lists ids in `Object.keys(sim.trajectories)` order, minus every ball whose `pocket` event has `ev.t ≤ t`.
  - `traceAt(sim, id, t): {x, y}[]` is every sample with `s.t < t` (as `{x, y}`) followed by `positionsAt(sim, t)[id]`.
  - `movedIds(sim): string[]` lists ids (`Object.keys` order) with any sample whose x or y differs from the first sample.
  - `TRACE_CUE = '#54b6d6'`, `TRACE_OTHER = 'rgba(231,162,62,0.5)'`.
  - `sceneAt(sim, t, base: {colours, labels, cueId}): Scene`:
    - `balls` is `{id, x, y}` for each visible id at `t`.
    - `traces` is first the cue (`TRACE_CUE`), then every other moved id (`TRACE_OTHER`).
    - `ghosts` is `{x, y}` of the first sample of each moved id, in `movedIds` order.
    - It carries `colours` and `labels` from `base`.
- Produces (DOM): `play(view, sim, base, opts: {onDone: () => void, reducedMotion?: boolean}): {skip(), cancel()}`.
  - `reducedMotion` defaults to `matchMedia('(prefers-reduced-motion: reduce)').matches`.
  - **Normal motion.** `requestAnimationFrame` drives the replay: `t = (now − t0) / 1000`, and each frame draws `sceneAt(sim, t, base)`. When `t ≥ duration`, it draws the final frame and calls `onDone` once.
  - **Reduced motion.** It draws `sceneAt(sim, sim.duration, base)` at once and calls `onDone` in a microtask.
  - `skip()` cancels the frame, draws the final frame and calls `onDone` if it has not been called. `cancel()` stops without `onDone`.

- [ ] **Step 1: Write the failing test** `test/player.test.js`:

```js
// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { simulate } from '../src/engine/simulate.js';
import { positionsAt, visibleAt, traceAt, movedIds, sceneAt, TRACE_CUE, TRACE_OTHER } from '../src/ui/player.js';
import { near } from './helpers.js';
const bank = JSON.parse(readFileSync(new URL('../data/safety-bank.json', import.meta.url), 'utf8'));
const e = bank.entries[0];
const sim = simulate(e.layout, e.best.shot, { record: true });
const tr = sim.trajectories.cue;
const base = { colours: {}, labels: {}, cueId: 'cue' };

test('positionsAt equals the samples at sample times and interpolates linearly between them', () => {
  for (const k of [0, 1, 50, tr.length - 1]) assert.deepEqual(positionsAt(sim, tr[k].t).cue, { x: tr[k].x, y: tr[k].y });
  const a = tr[50], b = tr[51], p = positionsAt(sim, a.t + 0.25 * (b.t - a.t)).cue;
  assert.ok(near(p.x, a.x + 0.25 * (b.x - a.x), 1e-9) && near(p.y, a.y + 0.25 * (b.y - a.y), 1e-9));
  const b1 = e.layout.balls.find((x) => x.id === 'b1');
  assert.deepEqual(positionsAt(sim, 1.234).b1, { x: b1.x, y: b1.y });
});
test('t beyond duration returns the final positions; t below 0 returns the start', () => {
  const end = positionsAt(sim, sim.duration + 5);
  for (const f of sim.final) assert.deepEqual(end[f.id], { x: f.x, y: f.y });
  assert.deepEqual(positionsAt(sim, -1).cue, { x: tr[0].x, y: tr[0].y });
});
test('a ball disappears from the time of its pocket event', () => {
  const sp = simulate(e.layout, { ...e.best.shot, speed: 130 }, { record: true }); // measured: the cue scratches at t ≈ 0.767
  const ev = sp.events.find((x) => x.type === 'pocket');
  assert.ok(ev && ev.a === 'cue');
  assert.ok(visibleAt(sp, ev.t - 1e-6).includes('cue')); assert.ok(!visibleAt(sp, ev.t).includes('cue'));
  assert.deepEqual([...visibleAt(sp, sp.duration)].sort(), sp.final.map((x) => x.id).sort());
  assert.ok(!sceneAt(sp, sp.duration, base).balls.some((x) => x.id === 'cue'));
});
test('traces: cue first in chalk, other movers amber; ghosts at their start; final scene balls', () => {
  assert.deepEqual(movedIds(sim), ['cue', 'ob']);
  assert.deepEqual(traceAt(sim, 'cue', 0), [{ x: tr[0].x, y: tr[0].y }]);
  const full = traceAt(sim, 'cue', sim.duration);
  assert.equal(full.length, tr.length); assert.deepEqual(full[full.length - 1], { x: tr[tr.length - 1].x, y: tr[tr.length - 1].y });
  const sc = sceneAt(sim, sim.duration, base);
  assert.equal(TRACE_CUE, '#54b6d6'); assert.equal(TRACE_OTHER, 'rgba(231,162,62,0.5)');
  assert.deepEqual((sc.traces ?? []).map((t) => [t.id, t.colour]), [['cue', TRACE_CUE], ['ob', TRACE_OTHER]]);
  const ob0 = sim.trajectories.ob[0];
  assert.deepEqual(sc.ghosts, [{ x: tr[0].x, y: tr[0].y }, { x: ob0.x, y: ob0.y }]);
  assert.deepEqual(sc.balls.map((x) => x.id).sort(), sim.final.map((x) => x.id).sort());
});
```

- [ ] **Step 2: Run** `node --test test/player.test.js`. Expected: FAIL (`ERR_MODULE_NOT_FOUND`).
- [ ] **Step 3: Implement** per Interfaces. Add the file to `FILES` and run `node scripts/stamp.js`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit.** `git add src/ui/player.js test/player.test.js src/precache.js sw.js && git commit -m "UI: animation player with interpolated replay, pocket hiding, traces, Skip and reduced motion" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 6: Session scoring and Safety Studio copy

**Files:**
- Create: `src/study/safety-session.js`, `src/study/safety-copy.js`, `test/safety-session.test.js`, `test/safety-copy.test.js`
- Modify: `src/precache.js` + `sw.js`

**Interfaces:**
- Consumes: `BankEntry`, `SafetyScore`, `Gate`, `Band` (`src/types.js`); `FAMILIES`, `BANDS`, `ACTIVE_FAMILIES` (`src/deal/families.js`); `NO_GOOD_SAFETY_TEXT` (`src/deal/bank.js`); `normDeg` (Task 3).
- Produces (`src/study/safety-session.js`, pure, never mutates its input):
  - `/** @typedef {{id: number, family: number, band: Band, rerolls: number, noAlt: boolean, score: number|null, gate: Gate|null, best: number}} SessionSlot */`
  - `/** @typedef {{seed: number, slot: number, slots: SessionSlot[], done: boolean}} SafetySession */`
  - `newSession(seed: number): SafetySession` is `{seed, slot: 0, slots: [], done: false}`.
  - `addDeal(s, entry: BankEntry): SafetySession` appends `{id, family, band, rerolls: 0, noAlt: false, score: null, gate: null, best: entry.best.score.total}`. It throws `Error('deal out of order')` unless `s.slots.length === s.slot`.
  - `applyReroll(s, entry: BankEntry|null): SafetySession` works on the current slot.
    - If the slot's `score !== null`, it throws `Error('reroll after the first shot')`.
    - With `entry`, it replaces `id`, `family`, `band` and `best`, and adds 1 to `rerolls`.
    - With `null`, it sets `noAlt: true` and leaves `rerolls` alone.
  - `recordShot(s, score: SafetyScore): SafetySession` sets `score: score.total` and `gate: score.gate ?? null` on the current slot only when its `score` is `null`. Otherwise it returns an equal copy.
  - `advance(s): SafetySession` throws `Error('slot not scored')` if the current slot is missing or unscored. Slot < 9 gives `slot + 1`; slot 9 gives `done: true` with `slot` still 9.
  - `usedIds(s): number[]` is `s.slots.map(x => x.id)`.
  - `average(s): number|null` is `Math.round(mean)` of the slots whose score is not null, or `null` when there are none.
  - `summary(s): {average: number|null, good: number, rows: {n: number, id: number, family: number, band: Band, score: number|null, gate: Gate|null, best: number}[]}`. `good` counts scores ≥ 70, and `n = index + 1`.
  - `validSession(x: unknown): boolean` requires all of:
    - `Number.isInteger(seed)` with 0 ≤ seed < 2^31.
    - Integer `slot` in 0..9.
    - `slots` is an array whose length is `slot` or `slot + 1`, and every slot before `slot` is scored.
    - Each slot has an integer `id`, `family ∈ ACTIVE_FAMILIES`, `band ∈ BANDS`, an integer `rerolls ≥ 0`, a boolean `noAlt`, `score` either null or an integer 0..100, `gate` either null or one of the 4 gates, and a numeric `best`.
    - `done` is a boolean, and `done` implies `slot === 9`, 10 slots and all scored.
- Produces (`src/study/safety-copy.js`, pure):
  - `GATE_TEXT`: `scratch` → `Scratch: ball in hand to your opponent`; `wrong-ball-first` → `Foul: wrong ball first`; `no-rail` → `Foul: no rail after contact`; `ob-pocketed` → `Not a safety: you pocketed the object ball`.
  - `GATE_SHORT`: `Scratch`, `Wrong ball first`, `No rail`, `Pocketed the object ball`.
  - `verdict(total)`: ≥ 85 `Lock-up`, 70–84 `Good safety`, 50–69 `Playable`, 25–49 `Weak`, < 25 `Sells out`.
  - `verdictTone(score): 'red'|'amber'|'green'`: a gate or a total < 25 gives `red`, 25–69 `amber`, ≥ 70 `green`. The CSS maps these to `--red`, `--amber` and `--green`.
  - `sessionVerdict(avg)`: ≥ 80 `Lock-down defence`, 65–79 `Solid`, 50–64 `Leaky`, < 50 `Giving them shots`.
  - `breakdownRows(score): string[]` follows §9.3 with rulings B1 and B2. Percentages use `Math.round`. Kick widths use `.toFixed(1)` followed by `°`. The robustness range is the rounded min and max joined by `–` (en dash).
  - `statusLine(x)`:
    - Input is `{mode:'session', slot, band, family, average, edited}`, `{mode:'deal', id, band, family, edited}` or `{mode:'example', name, edited}`.
    - Parts are joined with ` · `. The band and the example name get a capital first letter.
    - `Avg <n>` is omitted when `average` is null. `Edited layout` is appended when `edited`.
  - `contextLine(counted: boolean)` gives `Counts for the session` or `Practice: doesn't count`.
  - `noAltText(band)` gives `` `No other ${band} layout left for this family. Play this one or move on.` ``.
  - `hintLines(best: Scored|null): string[]`:
    - `null` gives `['No legal safety found from here']`.
    - Otherwise `['Best found: <total>', ...(total < 70 ? [NO_GOOD_SAFETY_TEXT] : []), ...breakdownRows(best.score)]`.
  - `announceText(score)` gives `` `${score.gate ? GATE_TEXT[score.gate] : verdict(score.total)}. Score ${score.total}` ``.
  - `tableLabel(layout, aimDeg)`: the aim is shown as `normDeg(aimDeg).toFixed(1)`.
    - Designated: `Table. Cue ball, object ball, <n> blocker(s). Aim <a> degrees.`, where n counts the balls that are neither the cue nor legal. When n = 0 the blocker part and its comma are omitted.
    - 8-ball: `Table. Cue ball; your balls <legal ids in layout order>; their balls <opponentIds in layout order>` + `; the 8` when a ball `8` exists and is in neither list, then `. Aim <a> degrees.`
    - 9-ball: `Table. Cue ball; balls <non-cue ids, ascending numeric>; lowest ball <legalIds[0]>. Aim <a> degrees.`
  - `dealLink(href, id)` is `href.split('#')[0] + '#/study/safety?deal=' + id`.
  - `scoreCell(row)` gives `` `0 (${GATE_SHORT[row.gate]})` `` when gated, otherwise `String(row.score)`.
  - `familyName(id)` looks the id up in `FAMILIES`.
  - `EXAMPLE_LINKS = [{slug: 'open-hook', label: 'Open hook'}, {slug: 'rail-tuck', label: 'Rail tuck'}, {slug: 'behind-the-8', label: 'Behind the 8'}]`.
  - `searchingText(s)` gives `` `Searching for a good safety… ${s} s` ``.
  - Constants, exactly as the test pins them: `LOADING_TEXT`, `LOAD_ERROR_TEXT`, `SHOT_ERROR_TEXT`, `SCORING_TEXT`, `NEW_SESSION_CONFIRM`, `COPIED_TEXT`.

- [ ] **Step 1: Write the failing tests.** Create `test/safety-session.test.js`:

```js
// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newSession, addDeal, applyReroll, recordShot, advance, usedIds, average, summary, validSession } from '../src/study/safety-session.js';
import { dealSlot, dealSession } from '../src/deal/bank.js';
import { createSessionStore } from '../src/ui/session-store.js';
const bank = JSON.parse(readFileSync(new URL('../data/safety-bank.json', import.meta.url), 'utf8'));
const E = (id, family = 2, band = 'medium', total = 80) => /** @type {any} */ ({ id, family, band, best: { score: { total } } });
const S = (total, gate) => /** @type {any} */ ({ total, ...(gate ? { gate } : {}) });
const full = () => { let s = newSession(4); for (let i = 0; i < 10; i++) s = advance(recordShot(addDeal(s, E(i, 2, 'hard', 90)), S(i === 3 ? 0 : 60 + 2 * i, i === 3 ? 'scratch' : undefined))); return s; };

test('addDeal records the slot; the first shot counts and later shots never change it', () => {
  let s = addDeal(newSession(5), E(11, 2, 'hard', 88));
  assert.deepEqual(s, { seed: 5, slot: 0, done: false, slots: [{ id: 11, family: 2, band: 'hard', rerolls: 0, noAlt: false, score: null, gate: null, best: 88 }] });
  s = recordShot(recordShot(recordShot(s, S(73)), S(99)), S(0, 'scratch'));
  assert.deepEqual([s.slots[0].score, s.slots[0].gate], [73, null]);
  const g = recordShot(addDeal(newSession(1), E(3)), S(0, 'no-rail'));
  assert.deepEqual([g.slots[0].score, g.slots[0].gate], [0, 'no-rail']);
  assert.throws(() => addDeal(s, E(12)), /deal out of order/);
});
test('functions are pure: inputs are never mutated', () => {
  const s0 = addDeal(newSession(1), E(1)), copy = structuredClone(s0);
  recordShot(s0, S(80)); applyReroll(s0, E(2)); applyReroll(s0, null); advance(recordShot(s0, S(80)));
  assert.deepEqual(s0, copy);
});
test('reroll: an entry replaces the slot; null sets noAlt and keeps the layout; no reroll after a shot', () => {
  let s = applyReroll(addDeal(newSession(5), E(11)), E(12, 2, 'medium', 75));
  assert.deepEqual(s.slots[0], { id: 12, family: 2, band: 'medium', rerolls: 1, noAlt: false, score: null, gate: null, best: 75 });
  s = applyReroll(s, null);
  assert.deepEqual([s.slots[0].id, s.slots[0].rerolls, s.slots[0].noAlt], [12, 1, true]);
  assert.throws(() => applyReroll(recordShot(s, S(70)), E(13)), /reroll after the first shot/);
});
test('advance stops at slot 9 and sets done after it; it needs a scored slot', () => {
  assert.throws(() => advance(addDeal(newSession(1), E(0))), /slot not scored/);
  assert.throws(() => advance(newSession(1)), /slot not scored/);
  let s = newSession(1);
  for (let i = 0; i < 10; i++) { s = advance(recordShot(addDeal(s, E(i)), S(70))); assert.deepEqual([s.slot, s.done], i < 9 ? [i + 1, false] : [9, true]); }
  assert.deepEqual(usedIds(s), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});
test('average rounds the mean of scored slots and is null before the first', () => {
  let s = addDeal(newSession(1), E(1)); assert.equal(average(s), null);
  s = recordShot(addDeal(advance(recordShot(s, S(70))), E(2)), S(71)); assert.equal(average(s), 71);
  assert.equal(average(addDeal(advance(s), E(3))), 71);
});
test('summary rows match the slots', () => {
  const s = full(), m = summary(s);
  assert.equal(m.average, average(s)); assert.equal(m.good, s.slots.filter((x) => /** @type {number} */ (x.score) >= 70).length);
  assert.deepEqual(m.rows, s.slots.map((x, i) => ({ n: i + 1, id: x.id, family: x.family, band: x.band, score: x.score, gate: x.gate, best: x.best })));
  assert.deepEqual([m.rows[3].score, m.rows[3].gate], [0, 'scratch']);
});
test('session determinism through the UI path: 200 seeds give exactly dealSession ids', () => {
  for (let seed = 0; seed < 200; seed++) {
    let s = newSession(seed);
    for (let i = 0; i < 10; i++) s = advance(recordShot(addDeal(s, /** @type {any} */ (dealSlot(bank, seed, s.slot, usedIds(s)))), S(50)));
    assert.equal(s.done, true); assert.deepEqual(usedIds(s), dealSession(bank, seed).map((x) => x?.id));
  }
});
test('the state round-trips through createSessionStore', () => {
  const m = new Map(), storage = /** @type {any} */ ({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } });
  const s = full();
  assert.equal(createSessionStore('study-safety', null, { storage }).save(s), true);
  assert.deepEqual(createSessionStore('study-safety', null, { storage }).load(), s);
});
test('RF1: validSession rejects stale or corrupt stored state', () => {
  const ok = addDeal(newSession(3), E(1));
  for (const good of [newSession(3), ok, full()]) assert.equal(validSession(good), true);
  for (const bad of [null, 7, {}, { ...ok, seed: -1 }, { ...ok, seed: 2 ** 31 }, { ...ok, slot: 10 }, { ...ok, slots: 'x' },
    { ...ok, slots: [...ok.slots, ok.slots[0]] }, { ...ok, slot: 1 }, { ...ok, done: true },
    { ...ok, slots: [{ ...ok.slots[0], band: 'x' }] }, { ...ok, slots: [{ ...ok.slots[0], family: 4 }] },
    { ...ok, slots: [{ ...ok.slots[0], score: 101 }] }, { ...ok, slots: [{ ...ok.slots[0], gate: 'x' }] }]) assert.equal(validSession(bad), false, JSON.stringify(bad));
});
```

  Create `test/safety-copy.test.js`:

```js
// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/study/safety-copy.js';
import { B, L } from './helpers.js';
const score = (o = {}) => /** @type {any} */ ({ total: 78, V: 0, directThreat: 0, cueRestriction: 0.256,
  kick: { rails: 1, n1: 2, w1: 3.14159, n2: 0, w2: 0, K: 0.4 }, robustness: { scores: [61.4, 70, 80.6, 75, 78, 79, 80, 81, 95.5], sd: 9 }, label: 'Forgiving', ...o });
const gated = score({ total: 0, gate: 'scratch', label: null });

test('gate strings and short gate names', () => {
  assert.deepEqual(C.GATE_TEXT, { scratch: 'Scratch: ball in hand to your opponent', 'wrong-ball-first': 'Foul: wrong ball first', 'no-rail': 'Foul: no rail after contact', 'ob-pocketed': 'Not a safety: you pocketed the object ball' });
  assert.deepEqual(C.GATE_SHORT, { scratch: 'Scratch', 'wrong-ball-first': 'Wrong ball first', 'no-rail': 'No rail', 'ob-pocketed': 'Pocketed the object ball' });
});
test('verdict at every band edge (24/25, 49/50, 69/70, 84/85) and tone', () => {
  assert.deepEqual([0, 24, 25, 49, 50, 69, 70, 84, 85, 100].map(C.verdict), ['Sells out', 'Sells out', 'Weak', 'Weak', 'Playable', 'Playable', 'Good safety', 'Good safety', 'Lock-up', 'Lock-up']);
  assert.deepEqual([24, 25, 69, 70].map((t) => C.verdictTone(score({ total: t }))), ['red', 'amber', 'amber', 'green']);
  assert.equal(C.verdictTone(gated), 'red');
  assert.deepEqual([49, 50, 64, 65, 79, 80].map(C.sessionVerdict), ['Giving them shots', 'Leaky', 'Leaky', 'Solid', 'Solid', 'Lock-down defence']);
});
test('breakdown rows: kick rows for rails 1, 2 and 3, direct threat when visible, none when gated (B1)', () => {
  assert.deepEqual(C.breakdownRows(score()), ['Hidden: 100%', 'Their best escape: 1-rail kick · 2 lanes, widest 3.1°', 'Cue ball on a rail: 26%', 'Robustness: Forgiving · range 61–96']);
  assert.equal(C.breakdownRows(score({ kick: { rails: 2, n1: 0, w1: 0, n2: 1, w2: 2, K: 0.85 } }))[1], 'Their best escape: 2-rail kick · 1 lane, widest 2.0°');
  assert.equal(C.breakdownRows(score({ kick: { rails: 3, n1: 0, w1: 0, n2: 0, w2: 0, K: 1 } }))[1], 'No 1- or 2-rail kick for them');
  assert.deepEqual(C.breakdownRows(score({ V: 0.25, directThreat: 0.404, kick: { rails: 0, n1: 0, w1: 0, n2: 0, w2: 0, K: 0 }, label: 'Touchy' })),
    ['Hidden: 75%', 'Direct shot threat: 40%', 'Cue ball on a rail: 26%', 'Robustness: Touchy · range 61–96']);
  assert.deepEqual(C.breakdownRows(gated), []);
});
test('status, context, no-alternative, hint and announcement lines', () => {
  assert.equal(C.statusLine({ mode: 'session', slot: 2, band: 'medium', family: 2, average: 72, edited: false }), 'Deal 3 of 10 · Medium · Rail tuck or freeze · Avg 72');
  assert.equal(C.statusLine({ mode: 'session', slot: 0, band: 'hard', family: 1, average: null, edited: false }), 'Deal 1 of 10 · Hard · Hook behind a blocker');
  assert.equal(C.statusLine({ mode: 'deal', id: 85723992, band: 'medium', family: 1, edited: true }), 'Layout #85723992 · Medium · Hook behind a blocker · Edited layout');
  assert.equal(C.statusLine({ mode: 'example', name: 'rail tuck', edited: false }), 'Example · Rail tuck');
  assert.deepEqual([C.contextLine(true), C.contextLine(false)], ['Counts for the session', "Practice: doesn't count"]);
  assert.equal(C.noAltText('easy'), 'No other easy layout left for this family. Play this one or move on.');
  const shot = { aimDeg: 1, speed: 40, spin: { x: 0, y: 0 } };
  assert.deepEqual(C.hintLines({ shot, score: score() }), ['Best found: 78', ...C.breakdownRows(score())]);
  assert.deepEqual(C.hintLines({ shot, score: score({ total: 65 }) }).slice(0, 2), ['Best found: 65', 'No safety scoring 70 found']);
  assert.deepEqual(C.hintLines(null), ['No legal safety found from here']);
  assert.equal(C.announceText(score()), 'Good safety. Score 78'); assert.equal(C.announceText(gated), 'Scratch: ball in hand to your opponent. Score 0');
});
test('canvas labels for designated, 8-ball and 9-ball layouts', () => {
  const d = [B('cue', 10, 10), B('ob', 50, 25), B('b1', 30, 20), B('b2', 30, 30), B('b3', 40, 40)];
  assert.equal(C.tableLabel(L(d), 12.44), 'Table. Cue ball, object ball, 3 blockers. Aim 12.4 degrees.');
  assert.equal(C.tableLabel(L(d.slice(0, 3)), 12.44), 'Table. Cue ball, object ball, 1 blocker. Aim 12.4 degrees.');
  assert.equal(C.tableLabel(L(d.slice(0, 2)), 360), 'Table. Cue ball, object ball. Aim 0.0 degrees.');
  const e8 = L([B('cue', 5, 5), B('9', 10, 10), B('10', 20, 10), B('1', 30, 10), B('2', 40, 10), B('3', 50, 10), B('8', 60, 10)], ['1', '2', '3'], '8ball', ['9', '10']);
  assert.equal(C.tableLabel(e8, 3.4832), 'Table. Cue ball; your balls 1, 2, 3; their balls 9, 10; the 8. Aim 3.5 degrees.');
  const e9 = L([B('cue', 5, 5), B('2', 10, 10), B('9', 20, 10), B('4', 30, 10), B('7', 40, 10), B('5', 50, 10)], ['2'], '9ball');
  assert.equal(C.tableLabel(e9, -114.956), 'Table. Cue ball; balls 2, 4, 5, 7, 9; lowest ball 2. Aim -115.0 degrees.');
});
test('links, summary cells, names and fixed strings', () => {
  assert.equal(C.dealLink('https://h/runout-lab/?x=1#/study/safety?deal=1', 85723992), 'https://h/runout-lab/?x=1#/study/safety?deal=85723992');
  assert.equal(C.dealLink('https://h/runout-lab/', 5), 'https://h/runout-lab/#/study/safety?deal=5');
  assert.deepEqual([C.scoreCell({ score: 73, gate: null }), C.scoreCell({ score: 0, gate: 'no-rail' })], ['73', '0 (No rail)']);
  assert.equal(C.familyName(7), '9-ball: lowest ball in clutter');
  assert.deepEqual(C.EXAMPLE_LINKS, [{ slug: 'open-hook', label: 'Open hook' }, { slug: 'rail-tuck', label: 'Rail tuck' }, { slug: 'behind-the-8', label: 'Behind the 8' }]);
  assert.equal(C.searchingText(3), 'Searching for a good safety… 3 s');
  assert.deepEqual([C.LOADING_TEXT, C.LOAD_ERROR_TEXT, C.SHOT_ERROR_TEXT, C.SCORING_TEXT, C.NEW_SESSION_CONFIRM, C.COPIED_TEXT],
    ['Loading layouts…', "Couldn't load the layouts. Check your connection, then try again.", 'Something went wrong. Try the shot again.', 'Scoring…', "Start a new session? This session's scores will be cleared.", 'Copied']);
});
```

- [ ] **Step 2: Run** `node --test test/safety-session.test.js test/safety-copy.test.js`. Expected: FAIL (`ERR_MODULE_NOT_FOUND`).
- [ ] **Step 3: Implement** per Interfaces. Add both files to `FILES` and run `node scripts/stamp.js`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit.** `git add src/study/safety-session.js src/study/safety-copy.js test/safety-session.test.js test/safety-copy.test.js src/precache.js sw.js && git commit -m "Safety Studio: pure session scoring (first shot counts) and screen copy" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 7: Safety Studio screen (session, single mode, shoot, result, hint, reroll, summary)

**Files:**
- Create: `src/study/safety-state.js`, `src/study/safety-studio.js`, `test/safety-state.test.js`
- Modify: `src/app.js` (`SCREENS.safety`), `index.html` (nav link, CSS), `src/study/index.js` (Safety Studio card), `test/site.test.js`, `src/precache.js` + `sw.js`

**Interfaces:**
- Consumes: everything from Tasks 1–6. Also `createSearchClient` (`src/search/client.js`), `createSessionStore` (`src/ui/session-store.js`), `MISSING_DEAL_TEXT` (`src/deal/bank.js`) and `validateLayout`.
- Produces (`src/study/safety-state.js`, pure):
  - `controlState(ctx) → Record<'aim'|'shoot'|'newLayout'|'next'|'startSession'|'retry'|'hint'|'tryShot'|'moveBalls'|'restore'|'done'|'skip'|'cancel', 'enabled'|'disabled'|'hidden'> & {nextLabel: 'Next layout'|'Finish session'}`.
  - `ctx = {mode: 'session'|'single', phase: 'aiming'|'result'|'editing', pending: null|'replay'|'search'|'load', scored: boolean, noAlt: boolean, last: boolean, edited: boolean, hintShot: boolean}`.
  - Base values, before `pending` is applied (every key not listed is `hidden`):
    - **aiming:**
      - `aim` and `shoot` are enabled.
      - Session mode, slot not scored: `newLayout` is `noAlt ? disabled : enabled`.
      - Session mode, slot scored: `next` is enabled.
      - Single mode: `startSession` is enabled.
      - `moveBalls` is enabled when `mode === 'single' || scored`.
      - `restore` is enabled when `edited`.
    - **result:**
      - `retry` and `hint` are enabled.
      - `tryShot` is enabled when `hintShot`.
      - `next` is enabled in session mode.
      - `moveBalls` is enabled when `mode === 'single' || scored`.
      - `restore` is enabled when `edited`.
    - **editing:** `done` is enabled, and `restore` is enabled when `edited`.
  - Then `pending` is applied:
    - `pending !== null` turns every `enabled` into `disabled`.
    - `'replay'` then sets `skip` enabled. `'search'` then sets `cancel` enabled.
  - `nextLabel` is `last ? 'Finish session' : 'Next layout'`.
  - `openAction(stored: unknown): {kind: 'new'} | {kind: 'summary'} | {kind: 'deal'} | {kind: 'load', id: number}`:
    - Not `validSession` → `new`.
    - `done` → `summary`.
    - `slots.length === slot` → `deal`.
    - Otherwise `load` with `slots[slot].id`.
- Produces (`src/study/safety-studio.js`): `mount(el, params): () => void`. The glue follows these rules:
  - **State.** The screen holds:
    - `client = createSearchClient()` and `store = createSessionStore('study-safety', null)`.
    - `gen`, a counter incremented by every action that makes in-flight replies obsolete: a new deal, reroll, Next, Retry, Restore, Cancel, unmount. Every reply handler captures `gen` and returns early if it changed.
    - `mode` and `session`.
    - `dealt = {layout, best, id?, family?, band?, name?}`, the entry or example as received, never modified.
    - `working`, the layout currently on the table.
    - `edited`, `phase`, `pending`, `aim`, `spin`, `speed`, and the last score, last hint and their counted flag.
  - **Markup.** A `.studio` grid with three areas:
    - **status:** `<h1 class="screen-title" tabindex="-1">Safety Studio</h1>`, an optional `<p class="notice" role="status">`, and `<p class="status">` holding `statusLine`.
    - **table:** `<canvas class="felt" tabindex="0" role="img">`, a `Skip` button shown when `controlState.skip !== 'hidden'`, and the loading or error text in place of the canvas while loading.
    - **controls:**
      - Aiming block: a nudge row of four buttons `↺ 1°`, `↺ 0.1°`, `↻ 0.1°`, `↻ 1°`, with `aria-label`s `Rotate aim back 1 degree`, `Rotate aim back 0.1 degree`, `Rotate aim forward 0.1 degree`, `Rotate aim forward 1 degree`, applying −1, −0.1, +0.1, +1. Then the spin pad and speed control side by side. Then the Shoot row: **Shoot** (`.btn.active.primary`) and the secondary button (**New layout** / **Next layout** / **Finish session** / **Start a session** as `controlState` says). Then the no-alternative note, the links line (`Examples:` plus `EXAMPLE_LINKS` as `#/study/safety?example=<slug>` joined by ` · `) and, for bank deals only, `Layout #<id>` with **Copy link**.
      - Result block: the score panel (headline, total, context line, breakdown rows), a row with **Retry**, **Show a good safety**, and **Next layout** / **Finish session**, then **Try this shot**, **Move balls** and **Restore layout** under it.
      - A visually hidden `<p class="sr-only" aria-live="polite">`.
    - Every control is rendered from `controlState`: `hidden` maps to the `hidden` attribute and `disabled` to the `disabled` attribute.
  - **Opening:**
    - `safetyMode(params)` decides the mode.
    - **Session mode** follows `openAction(store.load())`:
      - `new`: `seed = crypto.getRandomValues(new Uint32Array(1))[0] >>> 1`, then `newSession`, save, then deal.
      - `summary`: render the summary.
      - `deal`: `client.deal(seed, slot, usedIds)`, then `addDeal` and save.
      - `load`: `client.byId(id)`. A `null` result shows `MISSING_DEAL_TEXT`, calls `store.clear()` and starts `new` (ruling B6).
    - **Deal mode:** `client.byId(id)`. **Example mode:** `client.example(slug)`.
    - **Missing:** a `missing` mode, or a `null` from deal or example mode, shows the `MISSING_DEAL_TEXT` notice, runs `history.replaceState(null, '', '#/study/safety')`, and continues in session mode.
    - **Waiting:** while a request is outstanding, the table area shows `LOADING_TEXT`.
    - **Rejection:** shows `LOAD_ERROR_TEXT` with a **Try again** button that repeats the same request.
    - A `null` from `client.deal` is treated as a rejection.
  - **New deal on screen:** `working = structuredClone(dealt.layout)`, `aim = defaultAim(working)`, `spin = {x: 0, y: 0}`, `speed = 40`, `edited = false`, `phase = 'aiming'`.
  - **Aiming:** every aim, spin or speed change redraws the scene:
    - balls from `working`, plus `ballStyles`;
    - `aim: {from: cue, to: preview.end, ghost: preview.hitId ? preview.end : null}` from `aimPreview`;
    - `handle: handlePoint(cue, aim, pxPerIn, side)`;
    - `highlight: rules.legalIds`.
  - **Aim input:**
    - A canvas `touchstart` listener with `{passive: false}` calls `preventDefault()` only when the touch is inside the handle hit circle (`hitsHandle`).
    - `pointerdown` inside the circle starts a drag: `setPointerCapture`, and `side` is fixed from `handleSide` at that moment. `pointermove` sets `aim = aimFromDrag(cue, p, side)`. `pointerup` and `pointercancel` end the drag.
    - Canvas `keydown` applies `aimKey` with `e.shiftKey`, then calls `preventDefault` when the result is non-null.
    - Aim input works only when `controlState.aim === 'enabled'`.
  - **Canvas `aria-label`:** `tableLabel(working, aim)`, updated by a trailing 250 ms timer on aim changes.
  - **Shoot:**
    - `gen++`, `pending = 'replay'`, `shot = {aimDeg: aim, speed, spin}`.
    - It sends `client.simulate(working, shot)` and then `client.score(working, shot)`.
    - When the score arrives, it is kept. If this is session mode, `!edited`, and the current slot's `score === null`, it calls `recordShot`, saves, and sets `counted = true`; otherwise `counted = false`. Recording happens on arrival, not after the animation.
    - When the sim arrives, it calls `play(view, sim, {...ballStyles(working.balls), cueId}, {onDone})`.
    - When both the animation is done and the score is in: `phase = 'result'`, `pending = null`, the score panel renders, and `announceText` goes into the live region. If the animation finishes first, the panel shows `SCORING_TEXT` until the score arrives.
    - A rejection other than `terminated` sets `phase = 'aiming'`, `pending = null` and shows `SHOT_ERROR_TEXT` in the notice.
  - **Score panel:**
    - Headline: `GATE_TEXT[gate]` or `verdict(total)`, with the class `tone-<verdictTone>`.
    - Then the total, then `contextLine(counted)` (session mode only, ruling B13), then `breakdownRows`.
  - **Retry:** `gen++`, `phase = 'aiming'`, and the balls are redrawn from `working`. Aim, spin and speed are kept (ruling B3).
  - **Show a good safety** (this task: not edited):
    - The hint comes from `dealt.best`. If `dealt.best` is `null`, the panel shows `hintLines(null)` and there is no replay.
    - Otherwise: `gen++`, `pending = 'replay'`, then `client.simulate(working, dealt.best.shot)`, replayed from `working`.
    - When the replay is done, the panel shows `hintLines(dealt.best)` and `hintShot = true`.
    - **Try this shot** sets `aim = best.shot.aimDeg` and `speed = best.shot.speed` exactly, `spin = best.shot.spin`, and `phase = 'aiming'`.
  - **New layout:**
    - `gen++`, `pending = 'load'`, then `client.reroll(seed, slot, slot.rerolls + 1, slot.id, usedIds(session))`.
    - The result goes through `applyReroll(session, result)` and the session is saved.
    - A non-null result is put on screen as a new deal. A `null` result keeps the layout and shows `noAltText(band)` under the button.
  - **Next layout / Finish session:**
    - `gen++`, then `session = advance(session)` and save.
    - If `done`: render the summary.
    - Otherwise: `pending = 'load'`, `client.deal(...)`, then `addDeal`, save, and put the deal on screen.
  - **Summary:**
    - The h1 `Safety Studio`, then `Session average <avg> · <sessionVerdict(avg)>`, then `Good safeties: <good>/10`.
    - Then a `<table>` with `<th scope="col">` headers `#`, `Family`, `Band`, `Your score`, `Best found`. Each `#` cell links to `#/study/safety?deal=<id>`; `Family` is `familyName`; `Your score` is `scoreCell`.
    - **New session:** if `window.confirm(NEW_SESSION_CONFIRM)` is OK, it calls `store.clear()` and starts a new session.
  - **Copy link:** `navigator.clipboard.writeText(dealLink(location.href, id))`. On success the button reads `COPIED_TEXT` for 2000 ms. On rejection, or when `navigator.clipboard` is missing, the link appears as a `<input readonly>` holding the link, selected.
  - **Unmount:** `gen++`, cancel any player, clear the timers, `client.terminate()`, `view.destroy()`.
- **Other edits:**
  - `src/app.js`: `SCREENS.safety` is this `mount`.
  - `index.html`: the nav Safety Studio `href` becomes `#/study/safety`.
  - `src/study/index.js`: the Safety Studio card links to `#/study/safety`, with note `Ten dealt layouts. Each safety is scored by how hard your opponent's next shot is.` and pills `hide`, `kick`, `rail`.
- **CSS:**
  - `.studio{display:grid;gap:8px;padding-top:8px;grid-template-areas:"status" "table" "controls"}`.
  - `@media(min-width:900px){.studio{grid-template-columns:62% 1fr;grid-template-areas:"table status" "table controls";grid-template-rows:auto 1fr;gap:16px}}`.
  - `.screen-title{font-family:"Oswald";text-transform:uppercase;font-size:1.1rem;margin:0}` and `.status{font-family:"Space Mono";font-size:.8rem;color:var(--muted);margin:0}`.
  - `.nudges{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}`, `.tip-speed{display:flex;gap:12px;align-items:center}`, `.shoot-row{display:flex;gap:8px}`.
  - `.shoot-row .btn{min-height:52px}`, `.shoot-row .primary{flex:2}`, `.shoot-row .btn:not(.primary){flex:1}`.
  - `.tone-red{color:var(--red)}`, `.tone-amber{color:var(--amber)}`, `.tone-green{color:var(--green)}`.
  - `.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}`.

- [ ] **Step 1: Write the failing tests.** Create `test/safety-state.test.js`:

```js
// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controlState, openAction } from '../src/study/safety-state.js';
import { newSession, addDeal, recordShot, advance } from '../src/study/safety-session.js';
const KEYS = ['aim', 'shoot', 'newLayout', 'next', 'startSession', 'retry', 'hint', 'tryShot', 'moveBalls', 'restore', 'done', 'skip', 'cancel'];
const ctx = (o) => /** @type {any} */ ({ mode: 'session', phase: 'aiming', pending: null, scored: false, noAlt: false, last: false, edited: false, hintShot: false, ...o });
const want = (on = [], off = [], nextLabel = 'Next layout') => ({ ...Object.fromEntries(KEYS.map((k) => [k, on.includes(k) ? 'enabled' : off.includes(k) ? 'disabled' : 'hidden'])), nextLabel });
const E = (id) => /** @type {any} */ ({ id, family: 2, band: 'medium', best: { score: { total: 80 } } });

test('session aiming before and after the first shot (B4)', () => {
  assert.deepEqual(controlState(ctx({})), want(['aim', 'shoot', 'newLayout']));
  assert.deepEqual(controlState(ctx({ noAlt: true })), want(['aim', 'shoot'], ['newLayout']));
  assert.deepEqual(controlState(ctx({ scored: true, last: true })), want(['aim', 'shoot', 'next', 'moveBalls'], [], 'Finish session'));
});
test('single mode aiming and result', () => {
  assert.deepEqual(controlState(ctx({ mode: 'single' })), want(['aim', 'shoot', 'startSession', 'moveBalls']));
  assert.deepEqual(controlState(ctx({ mode: 'single', phase: 'result', edited: true })), want(['retry', 'hint', 'moveBalls', 'restore']));
});
test('session result, then after a hint', () => {
  assert.deepEqual(controlState(ctx({ phase: 'result', scored: true })), want(['retry', 'hint', 'next', 'moveBalls']));
  assert.deepEqual(controlState(ctx({ phase: 'result', scored: true, hintShot: true })), want(['retry', 'hint', 'tryShot', 'next', 'moveBalls']));
});
test('editing shows only Done and Restore', () => {
  assert.deepEqual(controlState(ctx({ mode: 'single', phase: 'editing', edited: true })), want(['done', 'restore']));
  assert.deepEqual(controlState(ctx({ mode: 'single', phase: 'editing' })), want(['done']));
});
test('RF4: while anything is pending, only Skip (replay) or Cancel (search) is enabled', () => {
  for (const mode of ['session', 'single']) for (const phase of ['aiming', 'result']) for (const scored of [false, true]) for (const edited of [false, true]) for (const pending of ['replay', 'search', 'load']) {
    const s = controlState(ctx({ mode, phase, scored, edited, pending, hintShot: true }));
    const enabled = KEYS.filter((k) => s[k] === 'enabled');
    assert.deepEqual(enabled, pending === 'replay' ? ['skip'] : pending === 'search' ? ['cancel'] : [], JSON.stringify({ mode, phase, scored, edited, pending }));
  }
});
test('openAction: new, deal, load and summary; corrupt state starts new (RF1)', () => {
  assert.deepEqual(openAction(null), { kind: 'new' }); assert.deepEqual(openAction({ junk: 1 }), { kind: 'new' });
  const s0 = newSession(4); assert.deepEqual(openAction(s0), { kind: 'deal' });
  assert.deepEqual(openAction(addDeal(s0, E(42))), { kind: 'load', id: 42 });
  assert.deepEqual(openAction(advance(recordShot(addDeal(s0, E(42)), /** @type {any} */ ({ total: 70 })))), { kind: 'deal' });
  let s = newSession(4); for (let i = 0; i < 10; i++) s = advance(recordShot(addDeal(s, E(i)), /** @type {any} */ ({ total: 70 })));
  assert.deepEqual(openAction(s), { kind: 'summary' });
});
```

  In `test/site.test.js`:
  - Change `IDS` to `['plan', 'position', 'closer', 'escape', 'decide', 'drills']`.
  - Append to the test `home links every legacy module in one tap`:
    `assert.ok(html.includes('href="#/study/safety"') && !html.includes('legacy/index.html#safety'));`
    `const study = read('src/study/index.js'); assert.ok(study.includes('href="#/study/safety"') && !study.includes('legacy/index.html#safety') && study.includes("Ten dealt layouts. Each safety is scored by how hard your opponent's next shot is."));`
  - In the GC4 test, append:
    `for (const f of ['src/study/safety-studio.js', 'src/ui/player.js', 'src/ui/aim.js', 'src/ui/table-view.js', 'src/search/client.js']) assert.ok(g.has(f), f);`

- [ ] **Step 2: Run** `node --test test/safety-state.test.js test/site.test.js`. Expected: FAIL (`ERR_MODULE_NOT_FOUND` for `safety-state.js`; the site tests fail on the legacy link and the missing graph nodes).
- [ ] **Step 3: Implement** per Interfaces. Add `src/study/safety-state.js` and `src/study/safety-studio.js` to `FILES` and run `node scripts/stamp.js`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Browser check** (`python3 -m http.server 3000`, Chrome DevTools device toolbar). Expected:
  1. `#/study/safety` deals slot 1. The status reads `Deal 1 of 10 · <Band> · <family>`, and the aim line and ghost ball follow the handle drag, nudges and arrow keys.
  2. At 390 × 664 and 412 × 780 the nudge row, spin pad, speed control and Shoot are visible with no scrolling, and nothing scrolls sideways at any width from 320 to 1440.
  3. Shoot replays. Skip jumps to the end. The score panel shows a verdict, the total and `Counts for the session`, and `Avg` appears.
  4. Retry, then Shoot, shows `Practice: doesn't count`, and the session score is unchanged.
  5. Show a good safety replays the stored shot and shows `Best found: <entry.best.score.total>`. Try this shot loads it.
  6. On an easy slot, tapping New layout until it disables shows the no-alternative note.
  7. Refreshing mid-session resumes the same slot, with Next layout shown if that slot was scored. Ten slots end in the summary, and New session asks for confirmation.
  8. `?deal=<id from summary>`, `?example=rail-tuck` (`Example · Rail tuck`, `Best found: 60`, `No safety scoring 70 found`) and `?deal=1` (notice, then a session) all behave as described.
  9. Copy link copies the deal link.
  10. The Performance panel shows no main-thread task over 50 ms during a shot.

  If no browser is available, report `NEEDS-BROWSER`.
- [ ] **Step 6: Commit.** `git add src/study/safety-state.js src/study/safety-studio.js src/study/index.js src/app.js index.html test/safety-state.test.js test/site.test.js src/precache.js sw.js && git commit -m "Safety Studio: rebuilt screen with bank sessions, first-shot scoring, instant stored-best hints, reroll no-alternative state and summary" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 8: Edit mode (Move balls) and edited-layout Suggest with Cancel

**Files:**
- Create: `src/ui/ball-drag.js`, `test/ball-drag.test.js`
- Modify: `src/study/safety-studio.js`, `src/precache.js` + `sw.js`

**Interfaces:**
- Consumes: `validateLayout`, `R`, `W`, `H`, `controlState` (`editing` phase, `pending: 'search'`), `hintLines`, `searchingText`, `client.suggest(layout, null)`.
- Produces (`src/ui/ball-drag.js`, pure):
  - `PICK_PX = 22`.
  - `pickBall(balls: Ball[], p: {x, y}, tolIn: number): string|null` returns the nearest centre with distance ≤ `tolIn`, ties to the lower index, or `null`.
  - `clampToPlay(p): {x, y}` clamps to x ∈ [R, W − R], y ∈ [R, H − R].
  - `moveBall(layout: Layout, id: string, p): Layout|null` builds a copy with that ball at `clampToPlay(p)`. It returns `null` if `validateLayout` fails or any two centres are closer than `2R − 1e-6`. It never mutates `layout`.
- Glue (`safety-studio.js`):
  - **Move balls** sets `phase = 'editing'` and draws the balls with no aim line or handle.
  - **Picking.** The `touchstart` listener calls `preventDefault()` when `pickBall(working.balls, p, PICK_PX / pxPerIn)` is non-null. `pointerdown` on such a ball starts a drag with `setPointerCapture`. `pointermove` draws that ball at `clampToPlay(p)`.
  - **Dropping.** `pointerup` sets `next = moveBall(working, id, p)`. If `next` is non-null, `working = next` and `edited` becomes true when the position changed. Otherwise the ball is redrawn where it was.
  - **Done** sets `phase = 'aiming'` and keeps aim, spin and speed.
  - **Restore layout** does `gen++`, `working = structuredClone(dealt.layout)`, `edited = false`, `phase = 'aiming'`.
  - The status line passes `edited`.
  - **Show a good safety when `edited`:**
    - `gen++`, `pending = 'search'`, start a 1 s interval showing `searchingText(s)` with whole elapsed seconds from 0, then call `client.suggest(working, null)`.
    - On a result, clear the interval. If `best` is `null`, the panel shows `hintLines(null)` and `pending = null`. Otherwise it replays `client.simulate(working, best.shot)` with `pending = 'replay'`, then shows `hintLines(best)`, `hintShot = true`, and Try this shot uses that `best`.
    - **Cancel** does `gen++`, clears the interval, `client.terminate()`, `client = createSearchClient()`, `pending = null`, and restores the previous result panel.
  - Shots on an edited layout never call `recordShot` (GC12).

- [ ] **Step 1: Write the failing test** `test/ball-drag.test.js`:

```js
// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PICK_PX, pickBall, clampToPlay, moveBall } from '../src/ui/ball-drag.js';
import { R } from '../src/engine/constants.js';
import { B, L } from './helpers.js';
const lay = L([B('cue', 20, 25), B('ob', 60, 25), B('b1', 40, 10)]);

test('pickBall: the nearest centre within the tolerance, else null', () => {
  assert.equal(PICK_PX, 22);
  assert.equal(pickBall(lay.balls, { x: 21, y: 25 }, 22 / 3.4), 'cue');
  assert.equal(pickBall(lay.balls, { x: 30, y: 25 }, 22 / 3.4), null);
  assert.equal(pickBall([B('a', 20, 25), B('b', 22.3, 25)], { x: 21.5, y: 25 }, 5), 'b');
});
test('RF5: overlapping, in-pocket and off-table drops return null; legal drops move the ball; drags clamp', () => {
  const before = structuredClone(lay);
  assert.deepEqual(moveBall(lay, 'cue', { x: 30, y: 30 })?.balls[0], { id: 'cue', x: 30, y: 30 });
  assert.ok(moveBall(lay, 'cue', { x: 60 - 2 * R, y: 25 })); // frozen to the OB is allowed
  assert.equal(moveBall(lay, 'cue', { x: 60 - 2 * R + 0.001, y: 25 }), null); // closer than 2R − 1e-6 (validateLayout alone allows it)
  assert.equal(moveBall(lay, 'cue', { x: R, y: R }), null); // past the corner pocket mouth (measured: in-pocket)
  assert.deepEqual(moveBall(lay, 'b1', { x: 50, y: 70 })?.balls[2], { id: 'b1', x: 50, y: 50 - R }); // clamped to the rail at the side pocket
  assert.deepEqual(clampToPlay({ x: -10, y: 70 }), { x: R, y: 50 - R });
  assert.deepEqual(lay, before);
});
```

- [ ] **Step 2: Run** `node --test test/ball-drag.test.js`. Expected: FAIL (`ERR_MODULE_NOT_FOUND`).
- [ ] **Step 3: Implement** `ball-drag.js`, then the glue, per Interfaces. Add `src/ui/ball-drag.js` to `FILES` and run `node scripts/stamp.js`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Browser check.** Expected:
  1. In `?deal=<id>`, Move balls lets you drag the cue ball. Dropping it on another ball or a pocket mouth snaps it back. Done returns to aiming, and the status line ends `· Edited layout`.
  2. Shoot works. Show a good safety shows `Searching for a good safety… 0 s` counting up with Cancel, and only Cancel is enabled. Cancel returns to the result panel; a second Show a good safety completes and replays.
  3. Restore layout brings back the dealt balls, and Show a good safety is instant again.
  4. In a session, Move balls is hidden before the first shot and shown after it, and edited shots show `Practice: doesn't count`.
  5. A swipe that starts on the felt (not on the handle or a ball) scrolls the page, and pinch-zoom works.
- [ ] **Step 6: Commit.** `git add src/ui/ball-drag.js test/ball-drag.test.js src/study/safety-studio.js src/precache.js sw.js && git commit -m "Safety Studio: Move balls with validated drops, Restore layout, edited-layout Suggest with seconds counter and Cancel" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 9: Bench additions, owner checklist, final verification

**Files:**
- Modify: `bench/bench.js`, `docs/acceptance-checklist.md`

**Interfaces:**
- Consumes: `client.simulate`, `client.score` (Task 2) and `c.sample(2)` cases.
- `bench/bench.js`:
  - For each case, time `await c.simulate(e.layout, e.best.shot)` into `replay[]` and `await c.score(e.layout, e.best.shot)` into `scoreMs[]`.
  - Print these exact lines after the worker round-trip line:
    - `hint replay round trip median <ms> max <ms> ≤ 250: PASS|FAIL`, which passes when the max is ≤ 250.
    - `score round trip median <ms> max <ms> (report only)`
  - Replace the seeded line with `seeded suggest median <ms> max <ms> (report only; hints use the stored best since 2026-11-25)` (ruling B9).
  - Keep every other line.
- `docs/acceptance-checklist.md`:
  - The title becomes `Runout Lab: Stage 1a and 1b owner acceptance checklist`.
  - In §2, the "After Plan 1b" step and expectation point to §8.
  - In §3, the 1500 expectation becomes the report-only seeded line, and the hint-speed choice is ticked on "Show the bank's stored best shot instantly…" with `Decided by the owner 2026-11-25 (spec §21.5).`
  - In §4, "after Plan 1b" becomes "see §8.3".
  - In §7, the thin-easy-band choice is ticked on "accept thin easy band for Stage 1" with the same note. The per-cell boxes stay unticked.
  - Add `## 8. Stage 1b` with items 8.1–8.10. Each item has Steps, Expected, a Result checkbox, Notes, Device and OS version, in the §1 format:
    1. **Hint speed:** bench `hint replay round trip … ≤ 250: PASS` on the iPad. Tapping Show a good safety on a bank deal starts the replay at once.
    2. **No freeze:** Chrome shows `main-thread long tasks: 0`; Safari shows `max rAF gap` < 50 ms during shot, score, replay, edited Suggest and bank load.
    3. **Smooth replay:** during a 5 s replay, ≥ 95% of frame gaps are ≤ 20 ms and the max is < 50 ms.
    4. **Phone fit at 390 × 664 and 412 × 780:** aim, spin, speed and Shoot are visible with no scrolling.
    5. **Offline session:** in airplane mode the installed app cold-starts and plays 10 deals including hints.
    6. **Update mid-session:** the update button reloads into the same slot with earlier scores intact.
    7. **Lighthouse accessibility ≥ 90** on `#/`, `#/study` and `#/study/safety`.
    8. **Installable**, as §6.
    9. **Aim drag:** dragging the handle never scrolls; a swipe elsewhere on the table scrolls.
    10. **Table door:** the wake-lock test runs from `#/table`, and Table Drills opens the legacy drills offline.
  - Add rows to "Build-time results" for the Stage 1b bench lines (node is not applicable; the Chrome page values come from Step 2).

- [ ] **Step 1: Implement** the bench lines and the checklist edits per Interfaces.
- [ ] **Step 2: Measure.** Serve with `python3 -m http.server 3000`, open `http://localhost:3000/bench/` in desktop Chrome, and record the output. If no browser is available, report `NEEDS-BROWSER`; the controller runs it and fills the checklist rows. If `hint replay round trip` FAILs at desktop speed, STOP (GC13) and report the numbers.
- [ ] **Step 3: Lighthouse and phone fit.**
  - Run Lighthouse accessibility (Chrome DevTools, Navigation, mobile) on `http://localhost:3000/#/`, `#/study` and `#/study/safety`, and record each score in checklist §8.7 Notes as "dev-machine pre-check". Expected: every score ≥ 90.
  - Repeat the Task 7 phone-fit check at 390 × 664 and 412 × 780.
  - If a score is below 90, fix the reported issue inside the Stage 1b files (never in frozen files), re-run `npm test`, and include the fix in this commit.
- [ ] **Step 4: Final verification.**
  - `npm test`: PASS.
  - `node scripts/stamp.js` prints `up to date v<N>`.
  - `git diff --stat specs-stage2 -- src/engine src/geometry src/eval src/search/grid.js src/search/search.js data/safety-bank.json` prints nothing.
  - `git status --short` shows only `?? .claude/` and `?? .superpowers/`.
- [ ] **Step 5: Commit.** `git add bench/bench.js docs/acceptance-checklist.md && git commit -m "Bench: hint replay and score round trips; checklist: Stage 1b owner items and recorded 2026-11-25 decisions" -m "<hint replay line from Step 2>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`. Add `index.html` or other Stage 1b files if Step 3 fixed anything, and run the stamp first if a shipped file changed. Do not push.

---

## Self-review

- **Spec coverage (stage1b-ui):**
  - §3/§21.5 defaults: B9, Task 7 hint, Task 9 checklist.
  - §4 tokens, contrast, sizes, intros, table drawing: Tasks 1 and 4.
  - §5 shell, header, nav `aria-current`, routes, Home, Study list: Tasks 1 and 7.
  - §6 components:
    - renderer: Task 4
    - aim, aim input, touch handling: Tasks 3, 7 and 8
    - spin pad, speed: Task 3
    - player: Task 5
    - update banner: Task 1
    - session store and wake lock reused unchanged
  - §7 worker messages, generation numbers, Cancel: Tasks 2, 7 and 8.
  - §8 layout and phone fit: Task 7 CSS and Step 5, Task 9 Step 3.
  - §9.1–9.6: Task 7. §9.7: Task 8. §10: Task 6 (pure) and Task 7 (wiring). §11 update prompt: Task 1.
  - §12 Table door: Task 1. §13 accessibility: Tasks 1, 3, 4 and 7, with Lighthouse in Task 9.
  - §14 files: as listed, plus B11. §16 node tests: every listed test, including 200-seed determinism (Task 6), worker deep-equal on 3 entries (Task 2), site tests (Tasks 1 and 7), precache (each task).
  - §16 bench additions and checklist items 1–8: Task 9.
  - §17 anti-goals:
    - main-thread engine calls: the GC4 import-graph test
    - session score changing after the first shot: Task 6 tests and GC12
    - hint showing a different shot or score: the hint uses `dealt.best` unchanged; Task 2 proves the worker `score` equals the stored score
    - scrolling during an aim drag: the `touchstart` rule plus checklist §8.9
    - precise tapping at the Table door: 64 px buttons and a large card
- **Main spec:** §12 door, wake lock and session store (Task 1). §13 update text (GC7). §14 zoom, targets, phone layout, contrast, keyboard (GC8–GC10, Tasks 3 and 7). §15 offline and Lighthouse (checklist §8). §21.5 (header and B9).
- **Name consistency:** each name appears identically in its producing Interfaces block and in every consumer:
  - `parseHash`/`matchRoute`/`safetyMode`, `initUpdateBanner`, `mount`
  - `client.simulate`/`client.score`
  - `normDeg`/`nudge`/`aimKey`/`defaultAim`/`aimPreview`/`handlePoint`/`handleSide`/`hitsHandle`/`aimFromDrag`
  - `clampSpin`/`spinFromOffset`/`spinText`/`spinKey`/`createSpinPad`
  - `clampSpeed`/`speedWord`/`speedText`/`stepSpeed`/`createSpeedControl`
  - `viewTransform`/`ballRadiusPx`/`ballColour`/`ballStriped`/`ballLabel`/`ballStyles`/`createTableView`/`Scene`
  - `positionsAt`/`visibleAt`/`traceAt`/`movedIds`/`sceneAt`/`play`/`TRACE_CUE`/`TRACE_OTHER`
  - the `safety-session` exports and the `safety-copy` exports
  - `controlState`/`openAction`
  - `PICK_PX`/`pickBall`/`clampToPlay`/`moveBall`
  - The existing names used (`createSearchClient`, `createSessionStore`, `createWakeLock`, `registerServiceWorker`, `dealSlot`, `dealSession`, `MISSING_DEAL_TEXT`, `NO_GOOD_SAFETY_TEXT`, `FAMILIES`, `ACTIVE_FAMILIES`, `BANDS`, `POCKETS`, `JAWS`, `visibility`, `firstBallOnRay`, `validateLayout`, `simulate`, `scoreSafety`) were checked against the code at `10d0594`.
- **Measured preconditions:**
  - Defaults: `visibility` gives 0 for '1' behind '9' and 1 for open balls.
  - `firstBallOnRay` t = 47.75 for the Task 3 preview.
  - `bank.entries[0]` at its stored shot moves only `cue` and `ob` (393 cue samples). At speed 130 the cue scratches at t = 0.7665.
  - Trajectory times are strictly increasing, and every last sample is at `duration` and equals `final` (120 simulations).
  - `validateLayout` gives `in-pocket` at (R, R), ok at (50, 48.875), and ok at 2R − 0.001 spacing, which is why the spacing rule is tested separately.
  - `374 / 110 = 3.4` and `60 · 3.4 = 204`.
  - `scoreSafety` takes about 0.3–0.8 s in node.
- **Review Focus:** RF1 is pinned in Tasks 6 and 7, RF2 in Task 1, RF3 in Task 3, RF4 in Task 7 and RF5 in Task 8.
