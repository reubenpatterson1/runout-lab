# Runout Lab Stage 1a: Foundation Implementation Plan (Amendment 2026-11-25, Tasks 13 onward)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish Stage 1a under the amended spec. The work is:
- Apply the halved robustness grid, the 0.62 hook weight and the R34 speed cap.
- Build, run and commit the offline layout bank for families 1, 2, 3, 6, 7 and 8.
- Deal sessions from the bank with pure seeded code.
- Answer deal and suggest requests from the search worker.
- Carry over the session store and wake lock unchanged.
- Measure seeded Suggest, bank load and worker latency.
- Hand the owner the acceptance checklist and the bank coverage report.

**Architecture:** The pure layers are unchanged: `engine` ← `geometry` ← `eval` ← `search` ← `deal`.
- **Offline (not shipped).** `scripts/bank-search.js`, `scripts/build-bank.js` and `scripts/bank-worker.js` import those layers. They run a coarse-to-fine search capped at 130 in/s over `worker_threads`. Results are committed in job order, so the output does not depend on `--jobs`. The builder writes `data/safety-bank.json`.
- **Shipped and precached.** The bank is parsed only inside the module Web Worker (`src/search/worker.js`). `src/deal/bank.js` is pure picking code that both the worker and the node tests use.
- **Freshness check.** A `modelHash` over `src/engine`, `src/geometry` and `src/eval` ties the bank to the scoring model.

**Tech Stack:** Vanilla JS (ES2022 modules, `// @ts-check` + JSDoc), `node --test` (Node v26.8.2 on the dev machine, `os.availableParallelism()` = 18), `node:worker_threads`, `node:crypto`, Web Worker (`type: 'module'`), Service Worker, localStorage, Screen Wake Lock. No dependencies.

**Spec (binding):** `/Users/reubenpatterson/pool_drills/runout-lab/docs/superpowers/specs/2026-11-24-runout-lab-rebuild-design.md`, amended 2026-11-25: §§10, 11, 13, 15, 16, 18.4, 18a.3, 19 and 21.
**Rulings:** `.superpowers/sdd/2026-11-24-runout-lab-stage1a-foundation/rulings.md`. R31–R34 are binding. R9 and R15 are obsolete.
**Base:** branch `stage-1a`, HEAD `bf32eed` (Tasks 1–12 done).

## Ambiguities found and the rulings this plan assumes

| # | Spec point | Assumed ruling |
|---|---|---|
| A1 | §11 says the cell cap is 200 (`"cap": 200`). R32 says 100. | **R32 wins.** cap = target = 100 per cell, so at most 1,800 entries. `params` is `{families:[1,2,3,6,7,8], target:100, cap:100, speedCap:130}`. "Cell full" means count ≥ 100. Layouts are skipped before the search when their cell already holds 100. |
| A2 | §11: "if the planned family's cell is **empty**, use the next active family". The spec doesn't say what happens when the cell is non-empty but every entry is excluded. | The same fallthrough applies whenever `pickEntry` returns `null` (empty or exhausted). With this rule, "≥ 4 entries per band across families" (§15 coverage) is exactly enough to deal every slot. |
| A3 | "entries already in the session" | These are the ids currently assigned to the session's slots. A rerolled-away entry is no longer "in the session" and may reappear later. A reroll excludes the current entry plus all assigned ids. |
| A4 | §11 Search step 2: "fully score the top 200 … with branch-and-bound", then "take the 5 best". | The full-pass B&B threshold is the **5th-best total so far**, once 5 shots are scored. Candidates are walked in optimistic-desc order, so the first candidate with `optimisticTotal ≤ threshold` ends the pass (`break`). This keeps the top-5 identical to the no-B&B reference. The fine pass uses B&B against the single current best. |
| A5 | Fine pass with speed clamped to 130 | Clamping produces exact duplicate shots. A fine shot whose exact key (`aimDeg,speed,spin.x,spin.y`) was already fully scored in this search is skipped. |
| A6 | R31's 3 h per-family wall-clock cap vs §11 "same code, same file" | When the time cap binds, output depends on machine speed. That is unavoidable, and it is flagged to the owner. A family stopped by `full` or `limit` is fully deterministic. The builder prints each family's stop reason and final job index. Elapsed time adds up across resumed runs. Families run one after another in `ACTIVE_FAMILIES` order. |
| A7 | "2,000 non-null generated layouts" | Every job whose `generate` returned non-null counts, including ones later rejected by rounding, validation, spacing, a duplicate seed or a full cell. |
| A8 | Examples | Each `layout` is the `FIXED_LAYOUTS` layout as-is (not rounded). `best` is `Scored|null`. |
| A9 | `modelHash` | SHA-256 over the concatenated **contents** (no paths) of every file under the three dirs, recursive, skipping dot-names. Order is POSIX root-relative paths under default JS `sort()`. |
| A10 | Re-validation "exactly equals the stored total" | The test asserts `deepEqual(scoreSafety(layout, best.shot), best.score)`. That implies equal totals and is stronger. |
| A11 | R32 "target file ≤ 1.5 MB" | Report only. The builder and the bank test print the size, and the checklist records it. Measured entries are 570–820 bytes, so the projected maximum is about 1.4 MB. |
| A12 | Checkpoint location (R31) | `.bank-build/checkpoint.json`. It is a dot-dir, so not shipped, and `.gitignore` lists it. |
| A13 | "A seed already in the bank is skipped" | Checked at commit time against every accepted id, across all families. |
| A14 | Bench cases | The first 2 entries in file order of each of the 18 cells: `sampleCells(bank, 2)`. |

## Global Constraints

1. The table playing surface is 100 × 50 in. Coordinates: x points right (0→100), y points down (0→50), units are inches. Ball R = 1.125 in. Corner mouth 4.5 in, side mouth 5.0 in.
2. `aimDeg`: 0 = +x, 90 = +y (down the screen). `spin.x` > 0 = right english. `spin.y` > 0 = follow, < 0 = draw. |spin| ≤ 1; larger values are scaled to the unit disk. `speed` = initial cue-ball speed in in/s, clamped to [1, 250].
3. Every `.js` file is an ES module whose first line is `// @ts-check`. The exception is `sw.js`, where it is line 2 because line 1 is the version line. No TypeScript, no build step, no dependencies.
4. `package.json` is exactly `{"name":"runout-lab","private":true,"type":"module","scripts":{"test":"node --test \"test/**/*.test.js\""}}`.
5. `src/engine`, `src/geometry`, `src/eval`, `src/search` and `src/deal` never use DOM, `window`, `Math.random`, `Date` or `performance`. The same inputs always give identical outputs. Exempt (browser glue, R12): `src/search/client.js` and `src/search/worker.js`.
6. "Shipped" means every file except these:
   - paths with any segment starting with `.`
   - the top-level dirs `test/`, `docs/`, `scripts/`, `bench/`, `node_modules/`
   - the top-level files `package.json`, `package-lock.json`, `README.md`, `CLAUDE.md`, `LICENSE`

   Every shipped file appears in `FILES` in `src/precache.js`. **`data/safety-bank.json` is shipped.**
7. After changing any shipped file, run `node scripts/stamp.js`, then `npm test`. Both must be green before every commit. **R1:** every commit that follows a stamp runs `git add sw.js src/precache.js`.
8. Offline: cache name `runout-lab-v<VERSION>`; cache-first; old `runout-lab-v*` caches are deleted on activate. The update prompt text is exactly `New version available — tap to reload`.
9. **(amended)** The safety score runs 0–100, and a "good safety" is total ≥ 70.
   - `ROBUST_GRID`: speedF ∈ [0.96, 1, 1.04] (outer) × aimOff ∈ [−0.2, 0, 0.2]° (inner). Nominal is index 4. The total is the rounded mean of 9 runs, and a gated variant scores 0.
   - `combineScore = 100·clamp(0.62·H + 0.25·K·H + 0.20·Q − 0.60·D, 0, 1)`, with H = 1 − V.
10. **(amended)** Safety Studio deals only from `data/safety-bank.json`. There is no on-device deal validation, no redeal loop and no fallback.
    - `ACTIVE_FAMILIES = [1, 2, 3, 6, 7, 8]`.
    - Band = `classify(selectShots(layout, DIFFICULTY_GRID).shareGe70)`: easy > 0.15, medium 0.04–0.15, hard < 0.04. The thresholds are unchanged (R33).
    - A session is 10 deals: 3 easy, 4 medium, 3 hard, over `ACTIVE_FAMILIES`.
    - Bank: target 100 and cap 100 per family×band (R32). A family stops when its 3 cells are full, after 2,000 non-null layouts, or after 3 h of wall-clock time (R31).
11. **(amended)** Budgets under desktop Chrome with 4× CPU throttle:
    - Suggest seeded with the entry's stored best takes ≤ 1500 ms and never returns less than the stored total.
    - There are zero main-thread tasks over 50 ms during search, animation or bank loading.
    - The bank is fetched and parsed only in the worker.
    - Unseeded Suggest is report-only.
    - No shot faster than 130 in/s: `SUGGEST_GRID` (R34) and the offline search.
12. No Google Fonts and no other third-party origin anywhere. Fonts are self-hosted in `fonts/` under OFL 1.1.
13. **Escalation.** If a pinned test, budget or measurement fails after following this plan exactly, stop and report the measured numbers to the caller. Do not retune constants, weights, grids, thresholds, search parameters or generator ranges. This covers:
    - a §10 fixture leaving its band
    - a re-derivation procedure that finds no layout or shot
    - a band with < 4 bank entries
    - the seeded-Suggest budget

    Bank shortfalls below 100 are **reported, not failures**. They go to the owner (§18.4).
14. Work on branch `stage-1a`. Every commit: `git commit -m "<subject>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`. Extra `-m` body lines may go between the subject and the Co-Authored-By line (R7).
15. **(new) Model freeze.** From the Task 16 commit on, `src/engine/**`, `src/geometry/**` and `src/eval/**` are frozen. Any change makes the modelHash test fail and needs Task 16 re-run (owner-visible, about 5–18 h). Tasks 17–21 must not touch these dirs.

(Controller note: overwrite `.superpowers/sdd/2026-11-24-runout-lab-stage1a-foundation/global-constraints.md` with this list before dispatching Task 13.)

## Review Focus

1. **Builder determinism independent of `--jobs`.**
   - Results are committed strictly in job index order.
   - The `skipCells` snapshot sent at dispatch only ever lists cells that are already full, and cells never un-fill, so a worker-side skip always agrees with the commit-time rule.
   - A crash followed by a resume produces the identical file.
   - Pinned in Task 15.
2. **Exact re-scoring.**
   - Layouts are rounded to 0.01 in **before** band measurement and search.
   - Shots are stored unrounded, and JSON round-trips doubles exactly.
   - `scoreSafety(entry.layout, entry.best.shot)` deep-equals `entry.best.score`.
   - Pinned in Task 16.
3. **B&B result preservation in `bankSearch`.** The top-5 threshold and the fine-pass threshold must give results deep-equal to `reference: true`. Pinned in Task 14.
4. **Model staleness.** `modelHash` covers exactly `src/engine`, `src/geometry` and `src/eval`. The bank is built only after Tasks 13–15 are committed, and nothing later touches those dirs. Pinned in Task 16.
5. **Session dealing and thread discipline.**
   - The fallthrough order, exclusions and the 3/4/3 mix hold over 500 seeds, and there are no repeats.
   - The main thread never fetches or parses the bank: client.js contains no `fetch(` or `JSON.parse`.
   - Pinned in Tasks 17–18.

## Core data shapes delta (`src/types.js`)

Remove the `DealResult` typedef (findDeal is gone). Keep `Validation` (validateDeal stays). Add:

```js
/** @typedef {{id: number, family: number, band: Band, genBand: Band, seed: number, share: number, layout: Layout, best: Scored}} BankEntry */
/** @typedef {{name: string, slug: string, layout: Layout, best: Scored|null}} BankExample */
/** @typedef {{family: number, band: Band, generated: number, valid: number, count: number}} CoverageRow */
/** @typedef {{v: 1, modelHash: string, params: {families: number[], target: number, cap: number, speedCap: number}, coverage: CoverageRow[], entries: BankEntry[], examples: BankExample[]}} Bank */
```

## File Structure delta

| Path (repo root `/Users/reubenpatterson/pool_drills/runout-lab/`) | Change | Responsibility |
|---|---|---|
| `src/deal/deal.js`, `test/deal-find.test.js`, `test/deal-500/` | **Discard (never committed)** | findDeal / fallback WIP is obsolete (§11) |
| `src/eval/safety.js`, `src/eval/position.js`, `src/search/grid.js`, `src/search/search.js` (JSDoc only) | Modify (T13) | Amended grid, wH 0.62, R34 |
| `test/eval-position.test.js`, `test/eval-safety.test.js`, `test/search.test.js` | Modify (T13) | Re-derived preconditions |
| `src/deal/families.js` | Modify (T14) | `ACTIVE_FAMILIES` |
| `src/deal/fixed.js` | Modify (T14, JSDoc only) | "Named examples" wording |
| `src/types.js` | Modify (T14) | Bank typedefs, drop `DealResult` |
| `scripts/model-hash.js` | Create (T14) | `modelHash(root)` |
| `scripts/bank-search.js` | Create (T14) | `BANK_GRID`, `roundLayout`, `spacingOk`, `measureBand`, `bankSearch` |
| `scripts/bank-worker.js` | Create (T15) | `runJob` + worker_threads entry |
| `scripts/build-bank.js` | Create (T15) | `commitResult`, `formatReport`, `buildBank`, CLI |
| `.gitignore` | Create (T15) | `.bank-build/` |
| `data/safety-bank.json` | Create by running the builder (T16) | Shipped bank |
| `test/bank.test.js`, `test/bank-revalidate/run.js`, `test/bank-revalidate/family-{1,2,3,6,7,8}.test.js` | Create (T16) | Integrity, staleness, coverage, re-validation |
| `src/deal/bank.js` | Create (T17) | `sessionPlan`, `pickEntry`, `dealSlot`, `dealSession`, `rerollSlot`, `entryById`, `exampleBySlug`, `sampleCells`, texts |
| `src/search/handle.js`, `src/search/worker.js`, `src/search/client.js` | Create (T18) | Worker protocol over the bank |
| `src/ui/session-store.js`, `src/ui/wake-lock.js`, `src/home.js`, `index.html` | Create/Modify (T19) | Unchanged from the original Task 15 |
| `bench/index.html`, `bench/bench.js`, `scripts/bench.js` | Create (T20) | Perf harness |
| `docs/acceptance-checklist.md` | Create (T21) | Owner checklist with bank coverage |

Measured on the dev machine, with the amended model applied to a scratch copy of HEAD:
- §10 fixtures: F1 100, F2 67.4167, half-visible gap 42.3009, F4 0, all inside their bands.
- Per-layout offline search is about 15–40 s on one core. Coarse prepare takes 5–9 s, full B&B 3–12 s (8–19 shots fully scored), fine 2–26 s.
- The first sampled layouts' best totals were 70–96, and their measured bands were mostly `hard`.

---

### Task 13: Discard the findDeal WIP; amended scoring (ROBUST_GRID, wH 0.62) and R34 speed cap

**Files:**
- Discard: `src/deal/deal.js`, `test/deal-500/`, `test/deal-find.test.js`, working-tree edits to `src/precache.js` and `sw.js`
- Modify: `src/eval/safety.js`, `src/eval/position.js`, `src/search/grid.js`, `src/search/search.js` (JSDoc only), `test/eval-position.test.js`, `test/eval-safety.test.js`, `test/search.test.js`, `src/precache.js` + `sw.js` (stamp)
- Commit as well: `docs/superpowers/specs/2026-11-24-runout-lab-rebuild-design.md` and `docs/superpowers/plans/2026-11-25-runout-lab-stage1a-amendment.md`

**Interfaces:**
- `ROBUST_GRID` in `src/eval/safety.js`: `for (const speedF of [0.96, 1, 1.04]) for (const aimOff of [-0.2, 0, 0.2]) ROBUST_GRID.push({ speedF, aimOff });`
- `combineScore({V, D, K, Q})` in `src/eval/position.js`: `100 * clamp(0.62 * H + 0.25 * K * H + 0.20 * Q - 0.60 * D, 0, 1)`.
- `SUGGEST_GRID.speeds` in `src/search/grid.js` = `[16, 22, 30, 40, 52, 66, 84, 106, 130]`. The size stays 1053 for one target.
- In the `suggest` JSDoc in `src/search/search.js`, replace the two comment lines with: `A suggest for a bank deal must be seeded with the entry's stored best (\`seedShots: [{...best.shot, known: best.score}]\`) so the hint never scores below it (spec §11).`

- [ ] **Step 0: Discard the WIP and commit the docs.**
  - Run: `cd /Users/reubenpatterson/pool_drills/runout-lab && git checkout -- src/precache.js sw.js && rm -rf src/deal/deal.js test/deal-500 test/deal-find.test.js`
  - Check `git status --short`. It shows only `M docs/superpowers/specs/...rebuild-design.md`, `?? .claude/` and `?? docs/superpowers/plans/2026-11-25-runout-lab-stage1a-amendment.md`.
  - Check `grep -c "src/deal/deal.js" src/precache.js`. It prints `0`.
  - Commit: `git add docs/superpowers/specs/2026-11-24-runout-lab-rebuild-design.md docs/superpowers/plans/2026-11-25-runout-lab-stage1a-amendment.md && git commit -m "Docs: spec amendment 2026-11-25 (offline bank, halved robustness, families 4/5 deferred) and amended plan" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`
- [ ] **Step 1: Write the failing tests.**
  - Append to `test/eval-position.test.js`:
    ```js
    test('§10 weights (amended 2026-11-25): wH = 0.62', () => {
      assert.equal(combineScore({ V: 0, D: 0, K: 0, Q: 0 }), 62);
      assert.equal(combineScore({ V: 0, D: 0, K: 1, Q: 1 }), 100);
      assert.ok(Math.abs(combineScore({ V: 0.5, D: 0, K: 0, Q: 0 }) - 31) < 1e-9);
    });
    ```
  - Append to `test/eval-safety.test.js`:
    ```js
    test('§10.6 robustness grid (amended): speed ×{0.96,1,1.04} outer × aim {−0.2,0,+0.2}° inner', () => {
      assert.deepEqual(ROBUST_GRID, [0.96, 1, 1.04].flatMap((speedF) => [-0.2, 0, 0.2].map((aimOff) => ({ speedF, aimOff }))));
    });
    ```
  - Append to `test/search.test.js`:
    ```js
    test('R34: SUGGEST_GRID speeds capped at 130 in/s', () => {
      assert.deepEqual(SUGGEST_GRID.speeds, [16, 22, 30, 40, 52, 66, 84, 106, 130]);
    });
    ```
- [ ] **Step 2: Run** `node --test test/eval-position.test.js test/eval-safety.test.js test/search.test.js`. Expected: the 3 new tests FAIL.
- [ ] **Step 3: Implement** the three value changes and the JSDoc line per Interfaces. Then run the same command. Expected: the 3 new tests pass, and exactly these 3 existing tests fail (measured):
  - `robustness: partial hook, varied scores, a gated variant counts as 0 in the mean`: no variant is gated any more.
  - `suggest seeded with validateDeal best never scores below it`: layA precondition fails, unseeded 77 vs validate 77.
  - `shareGe70 equals an independent Stage-A-only recount (pinned 5/108)`: the count is now 8.
- [ ] **Step 4: Re-derive the three tests.** These are pinned values that were found by the procedures below on the amended model. The implementer only re-runs a procedure if the pinned value fails.
  1. **Robustness test** (`test/eval-safety.test.js`): change `const shot = sh(fullnessAim(cue, ob, 0.6), 48);` to `const shot = sh(fullnessAim(cue, ob, 0.5), 48);`. Change nothing else; all its assertions stay. Measured: gates `[null,null,null,null,null,"ob-pocketed",null,null,"ob-pocketed"]`, total 35, sd 33.9, label Touchy.
     - Procedure if this fails: on the same layout, loop `f` over `[0.6, 0.5, 0.7, 0.4, 0.8]` (outer) and `speed` over 48, 49, …, 150 (inner). Take the first shot `sh(fullnessAim(cue, ob, f), speed)` where every existing assertion of that test holds. If none qualifies, apply GC13.
  2. **Seeding test** (`test/search.test.js`): change `for (const l of [layA, layB])` to `for (const l of [randomLayout(1, 5), layB])`. `layA` stays defined; the R27 and R28 tests still use it and still pass. Measured: randomLayout(1,5) validates at 74 (ok) against 58 unseeded; layB 80 against 77.
     - Procedure if this fails: for n in [5, 6] (outer) and seed 1..60 (inner), take the first `randomLayout(seed, n)` where `validateDeal` does not throw, `v.ok`, and `suggest(l).best.score.total < v.best.score.total`. If none qualifies, apply GC13.
  3. **Recount test**: change the title to `(pinned 8/108)` and `assert.equal(n, 5)` to `assert.equal(n, 8)`. Procedure if this fails: pin the measured `n` only if `n ≥ 1`; otherwise apply GC13.

  The §10 fixture tests must pass unchanged. If any fails, STOP (GC13) and report the measured F1, F2, gap and F4. The measured values are 100, 67.42, 42.30 and 0.
- [ ] **Step 5: Run** `node scripts/stamp.js && npm test`. Expected: PASS, with no `deal-500` or `deal-find` files present.
- [ ] **Step 6: Commit.** `git add src/eval/safety.js src/eval/position.js src/search/grid.js src/search/search.js test/eval-position.test.js test/eval-safety.test.js test/search.test.js src/precache.js sw.js && git commit -m "Eval: halved robustness grid, hook weight 0.62; Suggest speeds capped at 130 (R34); re-derived test preconditions" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 14: Active families, bank typedefs, model hash, offline bank search

**Files:**
- Create: `scripts/model-hash.js`, `scripts/bank-search.js`
- Modify: `src/deal/families.js`, `src/deal/fixed.js` (JSDoc), `src/types.js`, `src/precache.js` + `sw.js` (stamp)
- Test: `test/bank-search.test.js`

**Interfaces:**
- Consumes these real exports:
  - `candidateShots`, `linspace` and `SPINS9` from `src/search/grid.js`
  - `selectShots` and `classify` from `src/search/search.js`; `DIFFICULTY_GRID`
  - `prepareSafety`, `optimisticTotal`, `finishSafety` and `scoreSafety` from `src/eval/safety.js`
  - `kickLanes` from `src/eval/kick.js`, `validateLayout`, `R`
- `src/deal/families.js`: add `export const ACTIVE_FAMILIES = [1, 2, 3, 6, 7, 8];` with JSDoc `Stage 1 families (spec §11, OWNER 2026-11-25); 4 and 5 deferred.`
- `src/deal/fixed.js`: replace the JSDoc above `FIXED_LAYOUTS` with `/** Named examples (spec §11): not dealt, not a fallback; opened by slug. True scale. */`
- `src/types.js`: apply the Core data shapes delta.
- `scripts/model-hash.js`: `modelHash(root: string): string`.
  - Walk `src/engine`, `src/geometry` and `src/eval` recursively under `root` (root ends with `/`). Skip entries whose name starts with `.`.
  - Collect POSIX root-relative file paths and `sort()` them.
  - Hash with `createHash('sha256')`, calling `h.update(readFileSync(root + p))` for each path in order. Return the hex digest.
- `scripts/bank-search.js`:
  - `SPEED_CAP = 130`, `N_FULL = 200`, `TOP_N = 5`, `FINE_AIM = [-0.2, -0.1, 0, 0.1, 0.2]`, `FINE_SPEED = [0.9, 0.95, 1, 1.05, 1.1]`.
  - `BANK_GRID = {offsets: linspace(-0.92, 0.92, 25), offsets2: linspace(-0.92, 0.92, 17), speeds: [12, 16, 22, 30, 40, 52, 66, 84, 106, 130], spins: SPINS9}`.
  - `roundLayout(layout): Layout` returns `{balls: layout.balls.map((b) => ({id: b.id, x: Math.round(b.x * 100) / 100, y: Math.round(b.y * 100) / 100})), cueId: layout.cueId, rules: structuredClone(layout.rules)}`.
  - `spacingOk(balls): boolean` is true iff every pair's centre distance is ≥ `2 * R - 1e-6`.
  - `measureBand(layout): {share: number, band: Band}` returns `share = selectShots(layout, DIFFICULTY_GRID).shareGe70`, `band = classify(share)`.
  - `bankSearch(layout, opts?: {grid?: Grid, nFull?: number, nTop?: number, reference?: boolean, stats?: {full: number}}): {best: Scored|null, top: Scored[]}`. Defaults: `BANK_GRID`, `N_FULL`, `TOP_N`, false. Algorithm (pinned):
    ```
    key(final) = final.map(b => `${b.id}:${b.x},${b.y}`).join('|')            // same as search.js finalKey
    kick = memoized kickLanes keyed cueId+'#'+targetIds.join(',')+'#'+key(balls) (memo off when reference)
    score(prep) = finishSafety(layout, prep, kick); stats.full++
    1 Coarse: for idx, shot of candidateShots(layout, grid): prep = prepareSafety(layout, shot);
        if prep.gated continue; push {shot, idx, prep, opt: optimisticTotal(prep), k: key(prep.nominalFinal)}
      sort by opt desc, idx asc; walk keeping the first nFull with a key not seen before → `pick`
    2 Full: top = [] (sorted by total desc, then scoring order asc; length ≤ nTop); scoredKeys = Set of shot keys
      for r of pick: if !reference && top.length === nTop && r.opt <= top[nTop-1].score.total → break
        insert {shot: r.shot, score: score(r.prep)} into top keeping the order; truncate to nTop; add shot key
    3 Fine: best = top[0] ?? null
      for t of top (in order) for a of FINE_AIM for f of FINE_SPEED: if a===0 && f===1 continue
        shot = {aimDeg: t.shot.aimDeg + a, speed: Math.min(SPEED_CAP, t.shot.speed * f), spin: t.shot.spin}
        if scoredKeys has `${shot.aimDeg},${shot.speed},${shot.spin.x},${shot.spin.y}` continue; add it
        prep = prepareSafety(layout, shot); if prep.gated continue
        if !reference && optimisticTotal(prep) <= best.score.total continue
        s = score(prep); if s.total > best.score.total → best = {shot, score: s}
    return {best, top}
    ```
    The shot key in step 2 uses the same `${aimDeg},${speed},${spin.x},${spin.y}` form.

- [ ] **Step 1: Write the failing test** `test/bank-search.test.js`:

```js
// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { R } from '../src/engine/constants.js';
import { ACTIVE_FAMILIES } from '../src/deal/families.js';
import { candidateShots } from '../src/search/grid.js';
import { scoreSafety } from '../src/eval/safety.js';
import { modelHash } from '../scripts/model-hash.js';
import { BANK_GRID, roundLayout, spacingOk, measureBand, bankSearch, SPEED_CAP } from '../scripts/bank-search.js';
import { B, L } from './helpers.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const lay = L([B('cue', 30, 25), B('ob', 50, 20), B('b1', 58, 30), B('b2', 58 + 2 * R, 30)]);
const TINY = { offsets: [-0.46, 0, 0.46], offsets2: [-0.46, 0.46], speeds: [40], spins: [{ x: 0, y: 0 }] };

test('active families and bank grid shape', () => {
  assert.deepEqual(ACTIVE_FAMILIES, [1, 2, 3, 6, 7, 8]);
  assert.equal(candidateShots(lay, BANK_GRID).length, 2250);
  const two = L([B('cue', 50, 25), B('1', 70, 15), B('2', 70, 35)], ['1', '2']);
  assert.equal(candidateShots(two, BANK_GRID).length, 3060);
  assert.equal(Math.max(...BANK_GRID.speeds), 130); assert.equal(SPEED_CAP, 130);
});
test('roundLayout rounds to 0.01 in; spacingOk is strict 2R − 1e-6', () => {
  const r = roundLayout(L([B('cue', 10.123, 20.987), B('ob', 30.005, 40)]));
  assert.deepEqual(r.balls, [B('cue', 10.12, 20.99), B('ob', 30.01, 40)]);
  assert.equal(spacingOk([B('a', 10, 10), B('b', 10 + 2 * R, 10)]), true);
  assert.equal(spacingOk([B('a', 10, 10), B('b', 10 + 2 * R - 1e-5, 10)]), false);
});
test('measureBand is classify(shareGe70) of the difficulty grid', () => {
  const m = measureBand(lay); assert.ok(m.share >= 0 && m.share <= 1);
  assert.equal(m.band, m.share > 0.15 ? 'easy' : m.share >= 0.04 ? 'medium' : 'hard');
});
test('bankSearch: B&B + memo deep-equal the reference; best re-scores exactly; speeds ≤ 130', () => {
  const fast = { full: 0 }, ref = { full: 0 };
  const a = bankSearch(lay, { grid: TINY, nFull: 3, nTop: 1, stats: fast });
  const b = bankSearch(lay, { grid: TINY, nFull: 3, nTop: 1, reference: true, stats: ref });
  assert.ok(a.best, 'precondition: a best exists'); assert.deepEqual(a, b); assert.ok(fast.full <= ref.full);
  assert.deepEqual(scoreSafety(lay, a.best.shot), a.best.score);
  assert.ok(a.best.score.total >= a.top[0].score.total);
  const capped = bankSearch(lay, { grid: { ...TINY, speeds: [130] }, nFull: 1, nTop: 1 });
  assert.ok(capped.best && capped.best.shot.speed <= 130);
});
test('modelHash: deterministic, changes when a model file changes', () => {
  assert.match(modelHash(root), /^[0-9a-f]{64}$/); assert.equal(modelHash(root), modelHash(root));
  const t = mkdtempSync(tmpdir() + '/mh-') + '/';
  for (const d of ['src/engine', 'src/geometry', 'src/eval']) { mkdirSync(t + d, { recursive: true }); cpSync(root + d, t + d, { recursive: true }); }
  assert.equal(modelHash(t), modelHash(root));
  writeFileSync(t + 'src/eval/position.js', '// changed\n', { flag: 'a' }); assert.notEqual(modelHash(t), modelHash(root));
});
```

- [ ] **Step 2: Run** `node --test test/bank-search.test.js`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** per Interfaces. `scripts/` is not shipped, but `families.js`, `fixed.js` and `types.js` are, so run `node scripts/stamp.js`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS. If the bankSearch test's `a.best` precondition fails, apply GC13.
- [ ] **Step 5: Commit.** `git add scripts/model-hash.js scripts/bank-search.js src/deal/families.js src/deal/fixed.js src/types.js test/bank-search.test.js src/precache.js sw.js && git commit -m "Bank: active families, model hash, coarse-to-fine offline search capped at 130 in/s" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 15: Bank builder: deterministic parallel build, checkpoint/resume, report

**Files:**
- Create: `scripts/bank-worker.js`, `scripts/build-bank.js`, `.gitignore` (exact content `.bank-build/\n`)
- Test: `test/build-bank.test.js`

**Interfaces:**
- Consumes: `generate`, `dealSeedFor`, `BANDS`, `ACTIVE_FAMILIES`, `FIXED_LAYOUTS`, `hashSeed`, `validateLayout`, `roundLayout`, `spacingOk`, `measureBand`, `bankSearch`, `BANK_GRID`, `N_FULL`, `TOP_N`, `modelHash`.
- **Job index.** For family f, job j has k = floor(j/3), g = `BANDS[j % 3]` and seed = `dealSeedFor(f, g, hashSeed(f, j % 3, k) >>> 1)`.
- **`scripts/bank-worker.js`.**
  - `runJob(job: {j, family, seed, genBand, skipCells: Band[]}, cfg: {grid, nFull, nTop}): JobResult`:
    1. `lay = generate(family, seed, genBand)`. If it is null, return `{j, family, seed, genBand, kind: 'null'}`.
    2. `r = roundLayout(lay)`. If `!validateLayout(r).ok || !spacingOk(r.balls)`, return `{..., kind: 'reject'}`.
    3. `{share, band} = measureBand(r)`. If `skipCells.includes(band)`, return `{..., kind: 'measured', layout: r, share, band, skipped: true, best: null}`.
    4. Otherwise return `{..., kind: 'measured', layout: r, share, band, skipped: false, best: bankSearch(r, cfg).best}`.
  - `runExample(f: {name, layout}, cfg): BankExample` returns `{name, slug: name.replaceAll(' ', '-'), layout: f.layout, best: bankSearch(f.layout, cfg).best}`.
  - When `!isMainThread`, the module sets `parentPort.on('message', (m) => parentPort.postMessage(m.example ? {i: m.i, example: runExample(FIXED_LAYOUTS[m.i], workerData)} : runJob(m, workerData)))`.
- **`scripts/build-bank.js`.**
  - `newFamilyState(family)` returns `{family, j: 0, nonNull: 0, cells: {easy, medium, hard each {generated: 0, valid: 0, count: 0}}, entries: [], elapsedMs: 0, stop: null}`.
  - `commitResult(state, res, cfg: {cap, maxNonNull, timeCapMs}, ids: Set<number>): void` (pinned order):
    1. If `res.j !== state.j`, throw `Error('out of order')`. Then `state.j++`.
    2. `kind 'null'`: nothing more (go to step 6).
    3. Otherwise `state.nonNull++`. `kind 'reject'`: nothing more.
    4. `kind 'measured'`: if `ids.has(res.seed)` → nothing. Else `c = state.cells[res.band]`. If `c.count >= cap` → nothing. Before that, if `res.skipped && c.count < cap`, throw `Error('skip invariant')`.
    5. Else `c.generated++`. If `res.best && res.best.score.total >= 70`: `c.valid++; c.count++; ids.add(res.seed); state.entries.push({id: res.seed, family, band: res.band, genBand: res.genBand, seed: res.seed, share: res.share, layout: res.layout, best: res.best})`.
    6. `state.stop` = `'full'` if all three `count >= cap`; else `'limit'` if `nonNull >= maxNonNull`; else `'time'` if `elapsedMs >= timeCapMs`; else stays null.
  - `assembleBank(states, examples, hash, cfg): Bank`:
    - `{v: 1, modelHash: hash, params: {families: cfg.families, target: cfg.target, cap: cfg.cap, speedCap: 130}, coverage, entries, examples}`.
    - `coverage` is one row per family (cfg order) × BANDS: `{family, band, generated, valid, count}`.
    - `entries` = per family, then per band in BANDS order, that family's entries filtered by band, keeping generation order.
  - `formatReport(bank, states, elapsedMs): string`. Lines joined by `\n`:
    - header `family\tband\tgenerated\tvalid\tcount\ttarget\tshortfall`
    - one tab-separated row per coverage row, with shortfall = `max(0, target − count)`
    - then, for each row with count < target: `SHORTFALL family F band B: n/100` (target value substituted)
    - then per family `family F stopped: <stop> at j=<j> (nonNull <n>, elapsed <h>h<mm>m)`
    - then `bank: <entries> entries, <bytes> bytes` (bytes of the serialized file)
    - then per example `example <name>: <total or none>`
    - then `elapsed <h>h<mm>m`
  - `buildBank(opts): Promise<{bank, report}>`.
    - Options and defaults: `{families = ACTIVE_FAMILIES, jobs = os.availableParallelism(), target = 100, cap = 100, maxNonNull = 2000, timeCapMs = 3 * 3600e3, grid = BANK_GRID, nFull = N_FULL, nTop = TOP_N, examples = true, out = root + 'data/safety-bank.json', checkpoint = root + '.bank-build/checkpoint.json', fresh = false, crashAfterCommits = Infinity, log = (s) => process.stderr.write(s + '\n')}`.
    - `crashAfterCommits` is a test hook. It returns `{bank: null, report: ''}` after that many commits in this run, without writing `out`.
    - Start-up:
      - `hash = modelHash(root)`, `cfgKey = JSON.stringify({families, target, cap, maxNonNull, timeCapMs, grid, nFull, nTop, examples})`.
      - If `fresh`, delete the checkpoint.
      - If a checkpoint exists and its `modelHash` or `cfgKey` differs, throw `Error('stale checkpoint: delete .bank-build/ or pass --fresh')`. Otherwise load its states, `ids` and examples.
    - Create `jobs` `Worker(new URL('./bank-worker.js', import.meta.url), {workerData: {grid, nFull, nTop}})`.
    - For each family in order whose state has `stop === null`:
      - Dispatch ascending j to idle workers, each with `skipCells` = bands whose `count >= cap` at dispatch time.
      - Buffer results by j and commit while the buffer holds `state.j`. Set `state.elapsedMs = carried + (performance.now() − familyStart)` before each commit.
      - After each commit, write the checkpoint atomically (`writeFileSync(tmp)` then `renameSync`) as `{v: 1, modelHash, cfgKey, states, examples}`.
      - Every 25 commits, log `family F j=<j> nonNull=<n> counts e/m/h=<a>/<b>/<c> elapsed <h>h<mm>m`.
      - On stop, ignore any later results for that family.
    - If `examples` is true and the checkpoint has no examples, run the 3 examples on the pool and checkpoint them. Otherwise use `[]`.
    - Before writing, recompute `modelHash`. If it changed, throw `Error('model files changed during build')`.
    - Write `out` as `JSON.stringify(bank) + '\n'` (mkdir `data/`), terminate the workers, return. The checkpoint is kept.
  - **CLI** (when run as main): flags `--jobs N` and `--fresh` only. It prints `formatReport` to stdout and exits 0, or prints the error and exits 1.

- [ ] **Step 1: Write the failing test** `test/build-bank.test.js`:

```js
// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { newFamilyState, commitResult, assembleBank, formatReport, buildBank } from '../scripts/build-bank.js';
const cfg = { cap: 2, maxNonNull: 6, timeCapMs: 1e12 };
const best = (total) => ({ shot: { aimDeg: 0, speed: 30, spin: { x: 0, y: 0 } }, score: /** @type {any} */ ({ total }) });
const m = (j, seed, band, total, skipped = false) => ({ j, family: 2, seed, genBand: 'easy', kind: 'measured', layout: /** @type {any} */ ({}), share: 0.2, band, skipped, best: skipped ? null : best(total) });

test('commitResult: counting, cap, duplicate seed, rejects, order and stop rules', () => {
  const s = newFamilyState(2), ids = new Set();
  commitResult(s, { j: 0, family: 2, seed: 1, genBand: 'easy', kind: 'null' }, cfg, ids); assert.equal(s.nonNull, 0);
  commitResult(s, { j: 1, family: 2, seed: 2, genBand: 'easy', kind: 'reject' }, cfg, ids); assert.equal(s.nonNull, 1);
  commitResult(s, m(2, 10, 'easy', 80), cfg, ids); commitResult(s, m(3, 11, 'easy', 60), cfg, ids);
  commitResult(s, m(4, 10, 'easy', 90), cfg, ids); // duplicate seed: no counts
  commitResult(s, m(5, 12, 'easy', 75), cfg, ids); // cell now full (2)
  assert.deepEqual(s.cells.easy, { generated: 3, valid: 2, count: 2 }); assert.equal(s.entries.length, 2);
  assert.throws(() => commitResult(s, m(9, 13, 'easy', 75), cfg, ids), /out of order/);
  assert.equal(s.stop, 'limit'); // nonNull 5 → 6 after next
  const t = newFamilyState(2); t.cells.easy.count = 0;
  assert.throws(() => commitResult(t, m(0, 20, 'easy', 0, true), cfg, new Set()), /skip invariant/);
  const u = newFamilyState(2); u.elapsedMs = 2e12; commitResult(u, m(0, 30, 'hard', 10), cfg, new Set()); assert.equal(u.stop, 'time');
});
test('assembleBank order and formatReport SHORTFALL lines', () => {
  const s = newFamilyState(2), ids = new Set();
  commitResult(s, m(0, 50, 'hard', 80), cfg, ids); commitResult(s, m(1, 51, 'easy', 80), cfg, ids);
  const bank = assembleBank([s], [], 'h', { families: [2], target: 100, cap: 100 });
  assert.deepEqual(bank.entries.map((e) => e.band), ['easy', 'hard']);
  assert.deepEqual(bank.coverage.map((c) => c.band), ['easy', 'medium', 'hard']);
  const rep = formatReport(bank, [s], 0);
  assert.ok(rep.includes('SHORTFALL family 2 band easy: 1/100') && rep.includes('SHORTFALL family 2 band medium: 0/100'));
});
test('buildBank output is independent of --jobs and survives crash + resume', async () => {
  const base = { families: [2], cap: 1, maxNonNull: 3, grid: { offsets: [-0.46, 0, 0.46], offsets2: [-0.46, 0.46], speeds: [40], spins: [{ x: 0, y: 0 }] }, nFull: 3, nTop: 1, examples: false, log: () => {} };
  const run = async (jobs, extra = {}) => { const d = mkdtempSync(tmpdir() + '/bank-') + '/';
    await buildBank({ ...base, jobs, out: d + 'b.json', checkpoint: d + 'c.json', ...extra }); return d; };
  const a = await run(1), b = await run(3);
  assert.equal(readFileSync(a + 'b.json', 'utf8'), readFileSync(b + 'b.json', 'utf8'));
  const c = mkdtempSync(tmpdir() + '/bank-') + '/';
  const crashed = await buildBank({ ...base, jobs: 2, out: c + 'b.json', checkpoint: c + 'c.json', crashAfterCommits: 2 });
  assert.equal(crashed.bank, null);
  await buildBank({ ...base, jobs: 2, out: c + 'b.json', checkpoint: c + 'c.json' });
  assert.equal(readFileSync(c + 'b.json', 'utf8'), readFileSync(a + 'b.json', 'utf8'));
  const bank = JSON.parse(readFileSync(a + 'b.json', 'utf8')); assert.equal(bank.v, 1); assert.equal(bank.coverage.length, 3);
});
```

(In the first test, `m(...)` sets `family: 2` and `genBand: 'easy'`. The `'limit'` assertion: after the j=5 commit, nonNull = 5 < 6, so first add one more `commitResult(s, { j: 6, family: 2, seed: 3, genBand: 'easy', kind: 'reject' }, cfg, ids)` before `assert.equal(s.stop, 'limit')`. The implementer writes the test in that corrected order. The out-of-order `throws` check uses j: 9 and comes after it.)

- [ ] **Step 2: Run** `node --test test/build-bank.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** per Interfaces. Create `.gitignore` containing `.bank-build/`. No stamp is needed: `scripts/` and dotfiles are not shipped.
- [ ] **Step 4: Run** `npm test`. Expected: PASS. The e2e test should take ≤ ~60 s; record its duration in the report.
- [ ] **Step 5: Commit.** `git add scripts/bank-worker.js scripts/build-bank.js .gitignore test/build-bank.test.js && git commit -m "Bank builder: worker_threads, in-order commit, checkpoint/resume, 3 h family cap, coverage report" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 16: Run the bank build; bank integrity, staleness, coverage and re-validation tests

**Files:**
- Create: `data/safety-bank.json` (builder output), `test/bank.test.js`, `test/bank-revalidate/run.js`, `test/bank-revalidate/family-1.test.js`, `-2`, `-3`, `-6`, `-7`, `-8`
- Modify: `src/precache.js` (add `'data/safety-bank.json'` to `FILES` in sorted position, just after `'./'`; then stamp), `sw.js`

**Interfaces:**
- `test/bank-revalidate/run.js`: `revalidateFamily(family)` registers one test.
  - For each band in BANDS, take that family's entries in that band in file order. Take all of them if `process.env.RUNOUT_FULL === '1'`, else the first 2.
  - For each, assert `deepEqual(scoreSafety(e.layout, e.best.shot), e.best.score)` and `e.best.score.total >= 70`.
  - Report `t.diagnostic(\`family ${family}: re-scored ${n}\`)`.
  - Each `family-N.test.js` is `// @ts-check` + `import { revalidateFamily } from './run.js'; revalidateFamily(N);`.

- [ ] **Step 1: Write the failing tests.** `test/bank.test.js`:

```js
// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ACTIVE_FAMILIES, BANDS, generate, parseDealSeed } from '../src/deal/families.js';
import { FIXED_LAYOUTS } from '../src/deal/fixed.js';
import { validateLayout } from '../src/engine/layout.js';
import { scoreSafety } from '../src/eval/safety.js';
import { classify } from '../src/search/search.js';
import { modelHash } from '../scripts/model-hash.js';
import { roundLayout, spacingOk } from '../scripts/bank-search.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const path = root + 'data/safety-bank.json';
const bank = JSON.parse(readFileSync(path, 'utf8'));

test('schema and params', () => {
  assert.deepEqual(Object.keys(bank), ['v', 'modelHash', 'params', 'coverage', 'entries', 'examples']);
  assert.equal(bank.v, 1); assert.deepEqual(bank.params, { families: [1, 2, 3, 6, 7, 8], target: 100, cap: 100, speedCap: 130 });
});
test('modelHash matches src/engine, src/geometry, src/eval (rebuild the bank after any model change)', () => {
  assert.equal(bank.modelHash, modelHash(root));
});
test('integrity: ids, families, bands, replayable rounded layouts, spacing, speed cap, ≥ 70', () => {
  const ids = new Set(); let last = -1;
  for (const e of bank.entries) {
    assert.deepEqual(Object.keys(e), ['id', 'family', 'band', 'genBand', 'seed', 'share', 'layout', 'best']);
    assert.ok(Number.isInteger(e.id) && e.id === e.seed && !ids.has(e.id)); ids.add(e.id);
    assert.ok(ACTIVE_FAMILIES.includes(e.family) && BANDS.includes(e.band) && BANDS.includes(e.genBand));
    assert.deepEqual(parseDealSeed(e.seed), { family: e.family, band: e.genBand }); assert.equal(e.band, classify(e.share));
    const order = ACTIVE_FAMILIES.indexOf(e.family) * 3 + BANDS.indexOf(e.band); assert.ok(order >= last); last = order;
    assert.deepEqual(e.layout, roundLayout(/** @type {any} */ (generate(e.family, e.seed, e.genBand))));
    assert.deepEqual(validateLayout(e.layout), { ok: true }); assert.ok(spacingOk(e.layout.balls));
    assert.ok(e.best.shot.speed <= 130 && e.best.score.total >= 70);
  }
});
test('coverage rows agree with entries; examples re-score exactly', () => {
  assert.deepEqual(bank.coverage.map((c) => [c.family, c.band]), ACTIVE_FAMILIES.flatMap((f) => BANDS.map((b) => [f, b])));
  for (const c of bank.coverage) {
    const n = bank.entries.filter((e) => e.family === c.family && e.band === c.band).length;
    assert.equal(c.count, n); assert.equal(c.valid, c.count); assert.ok(c.count <= 100 && c.generated >= c.valid);
  }
  assert.deepEqual(bank.examples.map((x) => [x.name, x.slug]), [['open hook', 'open-hook'], ['rail tuck', 'rail-tuck'], ['behind the 8', 'behind-the-8']]);
  bank.examples.forEach((x, i) => { assert.deepEqual(x.layout, FIXED_LAYOUTS[i].layout);
    if (x.best) { assert.ok(x.best.shot.speed <= 130); assert.deepEqual(scoreSafety(x.layout, x.best.shot), x.best.score); } });
});
test('coverage report (shortfalls go to the owner; fail only if a band has < 4 entries)', (t) => {
  for (const c of bank.coverage) t.diagnostic(`family ${c.family} ${c.band}: ${c.count}/100${c.count < 100 ? ' SHORTFALL' : ''}`);
  t.diagnostic(`file ${statSync(path).size} bytes (target ≤ 1.5 MB, R32)`);
  for (const b of BANDS) assert.ok(bank.entries.filter((e) => e.band === b).length >= 4, `band ${b} has < 4 entries`);
});
```

  Then write `test/bank-revalidate/run.js` and the six family files per Interfaces.
- [ ] **Step 2: Run** `node --test test/bank.test.js`. Expected: FAIL (ENOENT on `data/safety-bank.json`).
- [ ] **Step 3: Pre-flight.**
  - Confirm that Tasks 13–15 are committed and that `git status --short` shows no change under `src/`.
  - Note the expected cost: about 15–40 s per searched layout per core on 18 cores, at most 2,000 layouts and at most 3 h per family, so roughly 5–18 h in total.
  - Tell the caller the build is starting.
- [ ] **Step 4: RUN THE BUILD (long, background).**
  - Command: `cd /Users/reubenpatterson/pool_drills/runout-lab && mkdir -p .bank-build && node scripts/build-bank.js > .bank-build/build.log 2> .bank-build/progress.log`. Use the background-run facility and wait for its exit notification; do not poll.
  - If the process dies or the machine sleeps, re-run the **same** command. It resumes from `.bank-build/checkpoint.json`.
  - Never pass `--fresh` unless the builder reports `stale checkpoint`. If it does, STOP and report it, because that means a model file changed.
  - Success criterion: exit code 0, `data/safety-bank.json` exists, and `.bank-build/build.log` ends with an `elapsed` line.
- [ ] **Step 5: Register and stamp.** Add `'data/safety-bank.json'` to `FILES`, then run `node scripts/stamp.js && npm test`. Expected: PASS.
  - If the coverage test fails (a band has < 4 entries), STOP (GC13) and send the caller the full `.bank-build/build.log`.
  - If re-validation fails, STOP (GC13). Re-validation failing means the model or JSON is not exact.
- [ ] **Step 6: Commit.** Include every `SHORTFALL …` line and the `elapsed …` line from build.log as extra `-m` lines:
  `git add data/safety-bank.json src/precache.js sw.js test/bank.test.js test/bank-revalidate && git commit -m "Bank: built safety-bank.json (families 1,2,3,6,7,8) with integrity, staleness, coverage and re-validation tests" -m "<SHORTFALL lines…>" -m "<elapsed line>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`
- [ ] **Step 7: Report** `.bank-build/build.log` verbatim to the caller. This is the owner's §18.4 coverage decision input. It does not block Tasks 17–21 unless Step 5 failed.

### Task 17: Bank dealing: pick, 3/4/3 session plan, fallthrough, reroll, URL ids, examples

**Files:**
- Create: `src/deal/bank.js`
- Modify: `src/precache.js` + `sw.js` (add `'src/deal/bank.js'` to FILES; stamp)
- Test: `test/deal-bank.test.js`

**Interfaces:**
- Consumes: `mulberry32`, `hashSeed`, `shuffle`, `ACTIVE_FAMILIES`, `BANDS`.
- Produces:
  - `MISSING_DEAL_TEXT = "That layout isn't in this version"`, `NO_GOOD_SAFETY_TEXT = 'No safety scoring 70 found'`.
  - `sessionPlan(sessionSeed): {family: number, band: Band}[]`:
    - rng = `mulberry32(hashSeed(sessionSeed, 7))`
    - families = `[...shuffle(ACTIVE_FAMILIES, rng), ...shuffle(ACTIVE_FAMILIES, rng)].slice(0, 10)`
    - bands = `shuffle(['easy','easy','easy','medium','medium','medium','medium','hard','hard','hard'], rng)`, drawn after the families
    - slot i = `{family: families[i], band: bands[i]}`
  - `pickEntry(bank, family, band, seed, excludeIds: number[]): BankEntry|null`:
    - cell = `bank.entries.filter(e => e.family === family && e.band === band)`, n = its length.
    - If n is 0, return null.
    - i = `Math.floor(mulberry32(hashSeed(seed))() * n)`.
    - For s = 0..n−1, return `cell[(i + s) % n]` if its id is not in `excludeIds`.
    - Otherwise return null.
  - `dealSlot(bank, sessionSeed, i, usedIds): BankEntry|null`:
    - `{family, band} = sessionPlan(sessionSeed)[i]`, seed = `hashSeed(sessionSeed, 100 + i)`.
    - For s = 0..5, try `f = ACTIVE_FAMILIES[(ACTIVE_FAMILIES.indexOf(family) + s) % 6]` and return the first non-null `pickEntry(bank, f, band, seed, usedIds)`.
    - Otherwise return null.
  - `dealSession(bank, sessionSeed): (BankEntry|null)[]` deals slots 0..9 in order. `usedIds` grows with each non-null entry.
  - `rerollSlot(bank, sessionSeed, i, r, current: BankEntry, usedIds): BankEntry|null` = `pickEntry(bank, current.family, current.band, hashSeed(sessionSeed, 100 + i, r), [...usedIds, current.id])`. Here r ≥ 1 and `usedIds` = ids currently assigned to the session's slots.
  - `entryById(bank, id): BankEntry|null`, `exampleBySlug(bank, slug): BankExample|null`.
  - `exampleLabel(x): string|null` returns `NO_GOOD_SAFETY_TEXT` if `!x.best || x.best.score.total < 70`, else null.
  - `sampleCells(bank, n): BankEntry[]` returns, for f in ACTIVE_FAMILIES and b in BANDS, the first n entries of that cell in file order, concatenated.

- [ ] **Step 1: Write the failing test** `test/deal-bank.test.js`:

```js
// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mulberry32, hashSeed } from '../src/deal/prng.js';
import { ACTIVE_FAMILIES } from '../src/deal/families.js';
import { sessionPlan, pickEntry, dealSlot, dealSession, rerollSlot, entryById, exampleBySlug, exampleLabel, sampleCells, MISSING_DEAL_TEXT } from '../src/deal/bank.js';
const bank = JSON.parse(readFileSync(new URL('../data/safety-bank.json', import.meta.url), 'utf8'));
const E = (id, family, band) => /** @type {any} */ ({ id, family, band });
const mini = /** @type {any} */ ({ entries: [E(1, 1, 'easy'), E(2, 1, 'easy'), E(3, 1, 'easy'), E(4, 2, 'hard')], examples: [] });

test('pickEntry: seeded start, steps over excluded, null when empty or exhausted', () => {
  const i = Math.floor(mulberry32(hashSeed(9))() * 3);
  assert.equal(pickEntry(mini, 1, 'easy', 9, [])?.id, [1, 2, 3][i]);
  assert.equal(pickEntry(mini, 1, 'easy', 9, [[1, 2, 3][i]])?.id, [1, 2, 3][(i + 1) % 3]);
  assert.equal(pickEntry(mini, 1, 'easy', 9, [1, 2, 3]), null); assert.equal(pickEntry(mini, 3, 'easy', 9, []), null);
});
test('sessionPlan: 3/4/3 over active families, each family ≤ 2, deterministic', () => {
  for (let s = 0; s < 500; s++) { const p = sessionPlan(s); assert.equal(p.length, 10);
    assert.deepEqual(['easy', 'medium', 'hard'].map((b) => p.filter((x) => x.band === b).length), [3, 4, 3]);
    for (const f of ACTIVE_FAMILIES) assert.ok(p.filter((x) => x.family === f).length <= 2);
    assert.ok(p.every((x) => ACTIVE_FAMILIES.includes(x.family))); }
  assert.deepEqual(sessionPlan(123), sessionPlan(123));
});
test('dealSlot falls through to the next active family (cyclic) when the planned cell yields nothing', () => {
  const s = [...Array(2000).keys()].find((k) => sessionPlan(k)[0].band === 'hard' && sessionPlan(k)[0].family !== 2);
  assert.ok(s !== undefined); assert.equal(dealSlot(mini, /** @type {number} */ (s), 0, [])?.id, 4);
});
test('500 sessions on the real bank: every slot resolves, no repeats, bands match the plan, deterministic', () => {
  for (let s = 0; s < 500; s++) {
    const d = dealSession(bank, s), p = sessionPlan(s);
    assert.ok(d.every((e) => e)); assert.equal(new Set(d.map((e) => e?.id)).size, 10);
    d.forEach((e, i) => assert.equal(e?.band, p[i].band));
    if (s < 20) assert.deepEqual(dealSession(bank, s).map((e) => e?.id), d.map((e) => e?.id));
  }
});
test('reroll keeps family and band, excludes current and session, is seeded by (session, slot, r)', () => {
  const d = /** @type {any[]} */ (dealSession(bank, 7)), used = d.map((e) => e.id);
  const r1 = rerollSlot(bank, 7, 0, 1, d[0], used);
  if (r1) { assert.equal(r1.family, d[0].family); assert.equal(r1.band, d[0].band); assert.ok(!used.includes(r1.id));
    assert.deepEqual(rerollSlot(bank, 7, 0, 1, d[0], used), r1); }
  assert.equal(rerollSlot(mini, 1, 0, 1, E(4, 2, 'hard'), []), null);
});
test('URL ids and examples', () => {
  const e = bank.entries[0]; assert.deepEqual(entryById(bank, e.id), e); assert.equal(entryById(bank, -1), null);
  assert.equal(MISSING_DEAL_TEXT, "That layout isn't in this version");
  for (const slug of ['open-hook', 'rail-tuck', 'behind-the-8']) { const x = exampleBySlug(bank, slug); assert.ok(x);
    assert.equal(exampleLabel(x), !x.best || x.best.score.total < 70 ? 'No safety scoring 70 found' : null); }
  assert.equal(exampleBySlug(bank, 'nope'), null);
  assert.ok(sampleCells(bank, 2).length <= 36);
});
```

- [ ] **Step 2: Run** `node --test test/deal-bank.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** per Interfaces. Add to FILES and run `node scripts/stamp.js`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS. If a slot fails to resolve on the real bank, STOP (GC13) and report per-band totals.
- [ ] **Step 5: Commit.** `git add src/deal/bank.js src/precache.js sw.js test/deal-bank.test.js && git commit -m "Deals: seeded bank picks, 3/4/3 session with family fallthrough, reroll, URL ids, examples" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 18: Search Web Worker: bank-backed protocol, shim, client

**Files:**
- Create: `src/search/handle.js`, `src/search/worker.js`, `src/search/client.js`
- Modify: `src/precache.js` + `sw.js` (add the three files; stamp)
- Test: `test/search-worker.test.js`

**Interfaces:**
- Consumes: `suggest`, `dealSlot`, `rerollSlot`, `entryById`, `exampleBySlug`, `sampleCells`.
- **Requests**, each with `id: number`:
  - `{type:'info'}`
  - `{type:'deal', sessionSeed, slot, usedIds}`
  - `{type:'reroll', sessionSeed, slot, r, currentId, usedIds}`
  - `{type:'byId', dealId}`
  - `{type:'example', slug}`
  - `{type:'sample', n}`
  - `{type:'suggest', layout, best?: Scored|null}`
- **Responses:** `{id, type: 'result', result}` or `{id, type: 'error', message}`.
- `createHandler(loadBank: () => Promise<{bank: Bank, timing?: {fetchMs: number, parseMs: number}}>): (msg) => Promise<Response>`:
  - The bank is loaded lazily on the first request that needs it. The promise is cached; if it rejects, the cache is cleared so the next request retries, and that request answers `bank load failed: <message>`.
  - `'suggest'` never awaits the bank. It returns `suggest(layout, {seedShots: best ? [{...best.shot, known: best.score}] : []})`.
  - `'info'` returns `{entries: bank.entries.length, examples: bank.examples.map(x => x.slug), modelHash: bank.modelHash, coverage: bank.coverage, timing: timing ?? null}`.
  - `'deal'` returns `dealSlot(...)`, `'byId'` returns `entryById(...)`, `'example'` returns `exampleBySlug(...)`, `'sample'` returns `sampleCells(...)`.
  - `'reroll'`: if `entryById(bank, currentId)` is null, the error is `unknown deal id: <currentId>`; otherwise it returns `rerollSlot(bank, sessionSeed, slot, r, current, usedIds)`.
  - An unknown type gives the error `unknown request type: <type>`. A thrown error gives `{type: 'error', message: err.message}`.
- `src/search/worker.js` (glue, exempt from GC5):
  ```js
  // @ts-check
  import { createHandler } from './handle.js';
  const handle = createHandler(async () => {
    const t0 = performance.now(); const res = await fetch(new URL('../../data/safety-bank.json', import.meta.url));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text(); const t1 = performance.now(); const bank = JSON.parse(text);
    return { bank, timing: { fetchMs: t1 - t0, parseMs: performance.now() - t1 } };
  });
  self.onmessage = async (e) => { self.postMessage(await handle(e.data)); };
  ```
- `createSearchClient(factory?: () => Worker)` returns `{info(), deal(sessionSeed, slot, usedIds), reroll(sessionSeed, slot, r, currentId, usedIds), byId(dealId), example(slug), sample(n), suggest(layout, best?), terminate()}`, each returning a Promise of the result.
  - The default factory is `() => new Worker(new URL('./worker.js', import.meta.url), {type: 'module'})`.
  - Ids increment from 1, and pending requests live in a Map. Responses may arrive out of order and are matched by id; responses for unknown ids are ignored.
  - An error response rejects that request with `new Error(message)`. `worker.onerror` rejects all pending requests.
  - `terminate()` calls `worker.terminate()` and rejects pending requests with `new Error('terminated')`.
  - The client never fetches or parses the bank (the §15 50 ms rule).

- [ ] **Step 1: Write the failing test** `test/search-worker.test.js`:

```js
// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHandler } from '../src/search/handle.js';
import { createSearchClient } from '../src/search/client.js';
import { suggest } from '../src/search/search.js';
import { dealSlot, entryById } from '../src/deal/bank.js';
const text = readFileSync(new URL('../data/safety-bank.json', import.meta.url), 'utf8');
const bank = JSON.parse(text);
const load = () => Promise.resolve({ bank });
const fakeWorker = (h) => () => { const w = { onmessage: null, onerror: null, terminated: false,
  postMessage(m) { h(m).then((data) => w.onmessage && w.onmessage({ data })); }, terminate() { w.terminated = true; } }; return /** @type {any} */ (w); };

test('handler answers deal/byId/example/sample/info from the bank', async () => {
  const h = createHandler(load);
  assert.deepEqual(await h({ id: 1, type: 'deal', sessionSeed: 5, slot: 0, usedIds: [] }), { id: 1, type: 'result', result: dealSlot(bank, 5, 0, []) });
  assert.deepEqual((await h({ id: 2, type: 'byId', dealId: bank.entries[0].id })).result, bank.entries[0]);
  assert.equal((await h({ id: 3, type: 'byId', dealId: -1 })).result, null);
  assert.equal((await h({ id: 4, type: 'example', slug: 'open-hook' })).result.name, 'open hook');
  assert.equal((await h({ id: 5, type: 'info' })).result.entries, bank.entries.length);
  assert.deepEqual(await h({ id: 6, type: 'nope' }), { id: 6, type: 'error', message: 'unknown request type: nope' });
  assert.deepEqual(await h({ id: 7, type: 'reroll', sessionSeed: 1, slot: 0, r: 1, currentId: -5, usedIds: [] }), { id: 7, type: 'error', message: 'unknown deal id: -5' });
});
test('seeded suggest via the handler equals direct seeded suggest and is ≥ the stored total', async () => {
  const e = bank.entries[0], h = createHandler(load);
  const r = (await h({ id: 1, type: 'suggest', layout: e.layout, best: e.best })).result;
  assert.deepEqual(r, suggest(e.layout, { seedShots: [{ ...e.best.shot, known: e.best.score }] }));
  assert.ok(r.best.score.total >= e.best.score.total);
});
test('bank load failure → error, then retry succeeds', async () => {
  let n = 0; const h = createHandler(() => (n++ === 0 ? Promise.reject(new Error('offline')) : load()));
  assert.deepEqual(await h({ id: 1, type: 'info' }), { id: 1, type: 'error', message: 'bank load failed: offline' });
  assert.equal((await h({ id: 2, type: 'info' })).type, 'result');
});
test('client resolves by id, rejects errors, terminate rejects pending; client never parses the bank', async () => {
  const c = createSearchClient(fakeWorker(createHandler(load)));
  const [d, x] = await Promise.all([c.deal(5, 0, []), c.byId(bank.entries[0].id)]);
  assert.deepEqual(d, dealSlot(bank, 5, 0, [])); assert.deepEqual(x, entryById(bank, bank.entries[0].id));
  await assert.rejects(c.reroll(1, 0, 1, -5, []), /unknown deal id/);
  const p = c.suggest(bank.entries[0].layout, bank.entries[0].best); c.terminate(); await assert.rejects(p, /terminated/);
  const src = readFileSync(new URL('../src/search/client.js', import.meta.url), 'utf8');
  assert.ok(!src.includes('JSON.parse') && !src.includes('fetch('));
});
```

- [ ] **Step 2: Run** `node --test test/search-worker.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** per Interfaces. `terminate` rejects synchronously; later responses are ignored. Add the three files to FILES and run `node scripts/stamp.js`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit.** `git add src/search/handle.js src/search/worker.js src/search/client.js src/precache.js sw.js test/search-worker.test.js && git commit -m "Search: module Web Worker loads the bank and answers deal, reroll, id, example and seeded suggest" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 19: UI logic: session store and wake lock (plus home wake-lock check)

Carried over verbatim from original Task 15; only the task number changed.

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

- [ ] **Step 1: Write the failing test** `test/ui.test.js`. `mapStorage()` is a Map-backed `getItem`/`setItem`/`removeItem`. The fake `nav.wakeLock.request` returns an `EventTarget` sentinel with `release()` (which dispatches `release`) and counts its calls. The fake `doc` is an `EventTarget` with a mutable `visibilityState`. Per R2, the comment-only bodies below are binding behaviour descriptions and must be real assertions.

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
- [ ] **Step 5: Commit.** `git add src/ui/session-store.js src/ui/wake-lock.js src/home.js index.html src/precache.js sw.js test/ui.test.js && git commit -m "UI logic: session store and wake lock with Auto-Lock fallback signal" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 20: Performance harness (seeded Suggest, bank load/parse, worker latency, unseeded report)

**Files:**
- Create: `scripts/bench.js`, `bench/index.html`, `bench/bench.js`
- Test: `test/bench.test.js`

**Interfaces:**
- Consumes: `suggest`, `sampleCells`, `createSearchClient`.
- `scripts/bench.js`: `runBench(opts?: {n?: number /*per cell, default 2*/, limit?: number, unseeded?: boolean /*default true*/}): {loadMs, parseMs, cases: number, seeded: Stats, belowStored: number, unseeded: Stats|null}`.
  - `Stats = {n, median, p95, max}` in ms from `performance.now()`. p95 = the sorted value at index `Math.ceil(0.95 * n) − 1`.
  - `loadMs` times `readFileSync` of the bank, and `parseMs` times `JSON.parse`.
  - cases = `sampleCells(bank, n).slice(0, limit ?? Infinity)`.
  - For each case, time `suggest(e.layout, {seedShots: [{...e.best.shot, known: e.best.score}]})`. `belowStored` counts results with total < `e.best.score.total`.
  - If `unseeded`, also time `suggest(e.layout)`.
  - When run as main, it prints `JSON.stringify(result, null, 2)`.
- **Bench page.** `bench/index.html` holds `<pre id="out">` and `<script type="module" src="./bench.js">`. `bench/bench.js` does the following:
  1. Start a `PerformanceObserver` with `observe({type: 'longtask', buffered: true})`, or print `longtask API unsupported`. Track the max `requestAnimationFrame` gap.
  2. `c = createSearchClient()`. Time `await c.info()` as `bank load round trip`, and read `timing.fetchMs` and `timing.parseMs` from the result.
  3. Run 20 sequential `c.byId(firstId)` calls for the worker round-trip median and max.
  4. `cases = await c.sample(2)`. For each case, time `await c.suggest(e.layout, e.best)` (seeded) and count results below the stored total. Then time `await c.suggest(e.layout)` (unseeded).
  5. Output a per-case table plus these lines exactly:
     - `bank load <ms> (fetch <ms>, parse <ms> in worker)`
     - `worker round trip median <ms> max <ms>`
     - `seeded suggest max <ms> ≤ 1500: PASS|FAIL`
     - `seeded suggest below stored: <n> (must be 0): PASS|FAIL`
     - `unseeded suggest median <ms> max <ms> (report only)`
     - `main-thread long tasks: <count> (must be 0): PASS|FAIL`
     - `max rAF gap <ms>`

- [ ] **Step 1: Write the failing test** `test/bench.test.js`:

```js
// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runBench } from '../scripts/bench.js';
test('bench runs one seeded case and reports load, parse and suggest stats', () => {
  const r = runBench({ limit: 1, unseeded: false });
  assert.equal(r.cases, 1); assert.equal(r.seeded.n, 1); assert.equal(r.belowStored, 0); assert.equal(r.unseeded, null);
  assert.ok(r.loadMs >= 0 && r.parseMs >= 0 && r.seeded.max >= 0);
});
```

- [ ] **Step 2: Run** `node --test test/bench.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** per Interfaces. No precache change is needed: `bench/` and `scripts/` are not shipped.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
  - Run `node scripts/bench.js` (unthrottled reference) and record the output.
  - Serve with `python3 -m http.server 3000`. Open `http://localhost:3000/bench/` in Chrome with the DevTools Performance CPU set to 4× slowdown. If no interactive browser is available, use Playwright plus CDP `Emulation.setCPUThrottlingRate {rate: 4}`. If neither is possible, report `NEEDS-BROWSER` and the controller runs it.
  - Record both outputs for Task 21.
  - If `seeded suggest max` fails, or `below stored` or `long tasks` fails, STOP (GC13) and report the numbers. Do not change grids.
- [ ] **Step 5: Commit.** `git add bench scripts/bench.js test/bench.test.js && git commit -m "Perf harness: seeded/unseeded Suggest, bank load and parse, worker latency (node + worker page)" -m "<seeded max 4x line>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 21: Owner acceptance checklist (with bank coverage report) and final verification

**Files:**
- Create: `docs/acceptance-checklist.md`

**Interfaces:**
- Consumes: `.bank-build/build.log` (Task 16), the bench outputs (Task 20), and the `RUNOUT_FULL=1` result from Step 2 below.

- [ ] **Step 1: Write the doc.** `docs/acceptance-checklist.md` has the sections below, in order. Each item has Steps, Expected, a Result checkbox, and fields for Notes, Device and OS version.
  1. **Wake lock in the installed iPad app (do this first).**
     - Install: Safari → Share → Add to Home Screen. Open from the home screen.
     - Set Auto-Lock to 2 minutes, tap "Start wake-lock test", and leave it for 3 minutes. Expected: the screen stays on and the status reads "Held".
     - Lock and unlock, then reopen: the lock is re-acquired.
     - If the tip appears instead, record the reason and the iPadOS version (Settings → General → About). From then on, use Auto-Lock → Never at the table.
  2. **Offline cold start in airplane mode.**
     - Open the app online once and wait 10 s (precache, including `data/safety-bank.json`). Force-quit, enable airplane mode, and launch from the home screen.
     - Expected: the home loads and Table Drills (legacy) opens with correct fonts.
     - After Plan 1b: play one Safety Studio session from the bank.
  3. **Suggest time and bank load on device.**
     - Online, open `/bench/` on the iPad and on the phone (iPhone 12 / Pixel 6a class).
     - Expected: `seeded suggest max ≤ 1500: PASS`, `below stored: 0`, and `long tasks: 0`, plus a record of bank load and parse ms.
     - Include a table of the desktop Chrome 4× proxy results with the numbers from Task 20. Unseeded Suggest is report-only.
  4. **Frame rate (after Plan 1b).** The animation player holds a steady 60 fps (DevTools / Safari timeline), with no main-thread task over 50 ms.
  5. **Update flow.** After a new deploy, reopen the app. Expected: "New version available — tap to reload" appears, and tapping it reloads into the new version.
  6. **Install check.** The Chrome DevTools Application panel reports the manifest installable.
  7. **Bank coverage decision (spec §18.4) [OWNER].**
     - Paste the Task 16 coverage table (family, band, generated, valid, count, target, shortfall) and every `SHORTFALL` line.
     - Paste each family's stop line (`full`/`limit`/`time`). A `time` stop means that family's cells are not reproducible bit-for-bit on another machine (R31).
     - Give the file size against the 1.5 MB target (R32), and each example's honest stored score, labelled "No safety scoring 70 found" where it is below 70.
     - For each short cell, give one checkbox each for: **accept shortfall** / **approve generator-range change for this family** / **drop family from Stage 1**. Family 1 is expected to be short.
     - Note that band thresholds are not retuned (R33). Any engine, geometry or eval change requires a rebuild (GC15).

  End with a "Build-time results" table: bank build elapsed time, entry count, bench numbers (node and 4× proxy), and the duration of the `RUNOUT_FULL=1` re-validation.
- [ ] **Step 2: Final verification.**
  - Run `npm test` (PASS) and `RUNOUT_FULL=1 npm test` (PASS; it re-scores every bank entry, which can take tens of minutes).
  - Run `node scripts/stamp.js`; it prints `up to date`.
  - `git status --short` should show nothing except `?? .claude/` (`.bank-build/` is ignored).
- [ ] **Step 3: Commit.** `git add docs/acceptance-checklist.md && git commit -m "Add owner acceptance checklist for Stage 1a with bank coverage report" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`. Per the ledger, push `stage-1a` to origin. Merging to `main` needs the user's confirmation.

---

## Architectural choices and rejected alternatives

- **In-order commit with speculative parallel work.** Workers measure and search ahead. The main thread applies every stateful rule (cap, duplicate seed, counters, stop) strictly in job order. The only worker-side shortcut is skipping cells that were already full at dispatch, and that set only grows, so the skip is always consistent with the commit rule.
  - Rejected: each worker owning a slice of k. Acceptance would then depend on the job count.
  - Rejected: re-checking the cap in workers through shared memory. That is racy.
- **The offline search lives in `scripts/` and is not shipped.** It keeps the shipped bundle and `src/search` unchanged. It reuses the real `prepareSafety`, `optimisticTotal` and `finishSafety` exports, so the stored score is produced by exactly the code that re-scores it.
  - Rejected: adding `BANK_GRID` to `src/search/grid.js`. It is dead weight on the device.
- **B&B against the 5th-best total, then `break`.** The walk is in optimistic order, so this is exact for the top-5 and prunes heavily. The probe fully scored 8–19 of 200 shots.
  - Rejected: no B&B. It is about 10× slower with an identical result.
  - Rejected: B&B against the single best. It changes the top-5, and so the fine pass.
- **Checkpoint after every commit (atomic rename).** This is a superset of R31's "per accepted entry". A resume replays the same job order from `state.j`.
  - Rejected: checkpointing only accepted entries. Resuming would repeat already-rejected work, and the counters would need reconstruction.
- **Re-validation as deep equality of the whole `SafetyScore`.** It catches any model drift, even drift that leaves the total unchanged.
- **Async worker handler with a lazily cached bank promise.** `suggest` doesn't wait for the bank. A failed load retries on the next request, so it recovers from a first offline load.
- **Bank-dependent tests read the real committed bank.** They are fast because they are lookups. Re-validation is split per family so `node --test` runs it in parallel, following the old deal-500 pattern.

## Risks and edge cases

1. **The seeded-Suggest budget is the main open risk.** Stage A still cheap-scores 1053 SUGGEST_GRID candidates. Task 11 measured seeded Suggest at 0.48–0.74 s unthrottled, which is about 2–3 s at 4×. If Task 20 fails, apply GC13. Options for the owner include skipping Stage A when the seed is `known` (always ≥ 70), but that is a ruling, not an implementer choice.
2. **Build duration is about 5–18 h.** The 3 h cap is likely to bind for weak families, so family 1 (and possibly the `easy` band everywhere) will be short. The probe measured mostly `hard` bands. A band with < 4 entries fails the coverage test and needs the owner.
3. **The time cap breaks reproducibility for that family (A6).** It is recorded and reported.
4. **GC15 model freeze.** A later fix in `src/engine`, `src/geometry` or `src/eval` costs a full rebuild. Do the deferred Task 5 and Task 7 minors before Task 16 or not at all in Stage 1a.
5. **Rounding to 0.01 in** can create overlaps or reduce visibility. Rounded layouts are re-validated, and a layout with no candidates is counted as generated but not valid.
6. **File size** may approach 1.5 MB. Shots and scores are stored at full precision, which exact re-scoring requires. The size is reported only.
7. **The fine pass at 130 in/s** produces clamped duplicates. They are deduped by exact shot key.
8. **`RUNOUT_FULL=1` runtime** is long, at about 1,800 full scorings. It runs only in Task 21.

## Self-review

- **Spec coverage (amended sections):**
  - §10 grid and weights, fixtures and the GC13 stop: Task 13.
  - §11 bank builder (families, generation, seed formula, rounding, R30 spacing, duplicate seeds, band, cap before search, coarse/full/fine, ≥ 70, stop rule, worker_threads determinism, report, examples): Tasks 14–16.
  - §11 bank file schema: Tasks 15–16.
  - §11 dealing, `pickEntry`, session, fallthrough, New layout, Retry and URL: Task 17. Retry replays the same entry, which is a UI concern; the entry is immutable.
  - §11 Suggest seeding: Tasks 18 and 20.
  - §11 removal of `findDeal`, `MAX_ATTEMPTS`, the fallback and the 500-seed test: Task 13 Step 0 (never committed) plus removing `DealResult` in Task 14.
  - §13 bank shipped and precached: Task 16.
  - §15 re-validation, integrity, coverage, session and performance: Tasks 16, 17 and 20.
  - §16 build after the model is final, committed before the UI: Task 16 comes after 13–15 and GC15.
  - §18.4 and §16 coverage report to the owner: Tasks 16 Step 7 and 21.
  - R31 (Task 15), R32 (GC10 and A1), R33 (GC10), R34 (Task 13).
- **Name consistency against the real code:**
  - `prepareSafety`, `optimisticTotal`, `finishSafety`, `scoreSafety`, `ROBUST_GRID` (src/eval/safety.js)
  - `combineScore` (position.js), `kickLanes` (kick.js)
  - `candidateShots`, `linspace`, `SPINS9`, `SUGGEST_GRID`, `DIFFICULTY_GRID` (grid.js)
  - `selectShots`, `runSearch`, `suggest`, `validateDeal`, `classify` (search.js)
  - `mulberry32`, `hashSeed`, `shuffle` (prng.js)
  - `BANDS`, `generate`, `dealSeedFor`, `parseDealSeed` (families.js), `FIXED_LAYOUTS` (fixed.js)
  - `validateLayout`, `R`
  - All of these exist at `bf32eed`. `ACTIVE_FAMILIES` is added in Task 14.
- **No placeholders:**
  - All pinned values were measured on the amended model: fullness 0.5 / speed 48, `randomLayout(1, 5)`, recount 8, fixtures 100 / 67.42 / 42.30 / 0.
  - Commit body lines in angle brackets are filled from build or bench output.
  - One test-ordering correction is spelled out in Task 15 Step 1.

Relevant paths:
- Spec: `/Users/reubenpatterson/pool_drills/runout-lab/docs/superpowers/specs/2026-11-24-runout-lab-rebuild-design.md`
- Rulings: `/Users/reubenpatterson/pool_drills/runout-lab/.superpowers/sdd/2026-11-24-runout-lab-stage1a-foundation/rulings.md`
- Re-derivation probes (scratch, not part of the repo): `/private/tmp/claude-502/-Users-reubenpatterson-pool-drills-runout-lab/7e777927-adf0-4df0-bd09-cd470789b3c7/scratchpad/amend/probe1.mjs` … `probe4.mjs`