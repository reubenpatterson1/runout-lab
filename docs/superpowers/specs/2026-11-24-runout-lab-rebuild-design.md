# Runout Lab rebuild: design (Stage 1)

Date: 2026-11-24. Status: approved by owner 2026-11-24. Amended 2026-11-25 by owner decision (see section 21).

Each decision is tagged:

- **[OWNER]**: the owner decided this.
- **[PROPOSED]**: Claude proposed it. It stands unless the owner corrects it.
- **[BUILDER]**: the implementer decides.

Line numbers refer to the current `index.html`. `runout-lab.html` is an identical copy.

## 1. Intent and why

Runout Lab is for a player who runs racks but stalls on the last two balls and the money ball, and plays weak safeties. The aim: close out racks and win safety battles. Today's physics teaches false lessons, the safety scoring rewards the wrong things, the app is clumsy on a phone, and the code is duplicated and untested. The owner asked for random Safety Studio setups, then a general update. This document defines Stage 1.

## 2. Users and modes [OWNER]

There is one user, who uses the app in two ways:

- **Study:** desk or phone, playing simulated drills for decisions and theory.
- **Table:** phone or iPad at a real table, running drills and logging real results.

There is no sync and no long-term tracking. Scoring lasts for one session.

## 3. Goals

1. One tested, realistic physics engine shared by every simulated module.
2. Safety scoring based on how hard the opponent's next shot is.
3. A large bank of random Safety Studio layouts, validated offline, each guaranteed to have a good answer. **[OWNER, amended 2026-11-25]**
4. Separate Study and Table front doors. Table mode works one-handed.
5. Installable and usable with no signal.
6. Readable, zoomable, and usable with a keyboard and screen reader.
7. The live site keeps working throughout the rebuild.

## 4. Non-goals

- Sync and accounts.
- Long-term history and trends.
- Modelling jump shots or jump vulnerability.
- TypeScript or a build step.
- Compatibility with Claude artifacts (`window.storage`, lines 1754–1757).
- Two-way shots (a later trainer).

## 5. Anti-goals (count as failure)

- Physics that teaches false lessons. Example: mirror kicks that always work because the cushion is a perfect mirror plus `eng*8°` (line 682).
- A "random" layout with no good safety.
- A rebuild that leaves the live site broken partway through.
- A Table mode that needs precise tapping, such as marking where a virtual ball stopped.
- Search that freezes the UI.

## 6. Constraints

- GitHub Pages: static files served as-is, no build step.
- Safari on iOS/iPadOS (including home-screen apps), Chrome on Android, desktop browsers.
- Fully offline after the first visit.
- No runtime dependencies. Tests use `node --test`; `package.json` holds only the test script. **[PROPOSED]**

## 7. Approaches

- **A. Restructure the single file in place.** It never breaks. But the new engine and the Study/Table split touch nearly every line, so it costs as much as a rebuild and keeps the old structure.
- **B. Static ES modules, no build step. [OWNER picked this]** For: Pages serves files as-is, the physics gets automated tests, and the old app stays live until replaced. Against: JSDoc plus `// @ts-check` is lighter than TypeScript, and the offline file list is kept by hand (a test catches omissions). Local dev needs `npx serve`, as C does.
- **C. Vite plus TypeScript, built by GitHub Actions.** Best tooling, but a pipeline to maintain, and deployed output differs from the repo. B can migrate to C later.

The owner asked whether B works on an iPad at the table. It does: the device never sees how the app was built.

## 8. Architecture [PROPOSED; file names BUILDER]

Every file is an ES module with `// @ts-check`.

- `index.html`: the shell (Study and Table doors, router outlet, manifest, service worker registration).
- `src/engine/`: the physics. Pure, deterministic, no DOM. `simulate(layout, shot, opts)` returns a time-stamped trajectory per ball, an event log, and final positions.
- `src/geometry/`: clearance, visibility, and kick lanes, written once. Replaces three copies of `clearanceBetween` (lines 1029, 1184, 1521) and four each of segment-clear and `alongPath` (e.g. lines 1122, 1228, 1640).
- `src/eval/safety.js`: scores a safety by the opponent's best option (section 10). Later stages also use it for Run or Safe? and Table Drills, replacing the duplicate formula at line 1583.
- `src/search/`: searches aim, speed, and spin. It runs in a Web Worker. The worker also fetches and parses the layout bank (section 11).
- `src/deal/`: seeded generators for layout families, plus `src/deal/bank.js`, the pure picker that deals from the layout bank (section 11).
- `data/safety-bank.json`: the pre-validated layout bank. It is generated offline, shipped and precached. **[OWNER 2026-11-25]**
- `src/ui/`: shared renderer, ball drag, aim handle with nudges, spin pad, speed control, animation player (replays the engine trajectory in real time), hash router, session store (localStorage), wake lock, update banner.
- `src/study/safety-studio.js` and `src/table/`: the two modes.
- `sw.js`, `manifest.webmanifest`, icons.
- `src/precache.js`: the file list and version.
- `test/` and `docs/`: never shipped.
- `scripts/build-bank.js`: the offline bank builder (section 11). Never shipped, like everything under `scripts/`.
- The legacy app stays reachable until each module is ported. The builder chooses how (for example `legacy/`). The requirement is that every unported module is one tap from the new home.

Cleanup:

- Do not port dead code: `dragify` (line 626), `getCss` (line 779), `_clearSegD` (line 1322), and unused CSS.
- Replace `runout-lab.html` with a redirect to `./`. **[PROPOSED]** Its old bookmarks keep working.
- Remove the `window.storage` paths. On Pages they only ever stored data in memory, so no user data is lost.

## 9. Physics engine [PROPOSED; constants BUILDER]

Today every sim models only the cue ball and one object ball (OB) over a fixed "range" (lines 652–688, copied at 979–1028). Safety Studio's OB path ignores blockers (line 984), blockers never move, spin differs between Position Lab (lines 736–742) and the shared sim, and animation is constant-speed with the OB starting at a hardcoded 35% (line 1127).

The new engine must:

1. Move every ball. Every ball collides with balls, cushions, and pockets.
2. Be event-driven, use a fixed timestep, be seedable, be pure, and have no DOM dependency.
3. Model the change from sliding to rolling, so follow and draw build up with distance and speed.
4. Let side english change the rebound: running english lengthens the angle, reverse english shortens it.
5. Make the cushion rebound angle depend on speed, so mirror kicks come up short or long the way they do on a real table.
6. Capture balls in corner and side pockets using pocket geometry and the ball's approach.
7. Report first contact, rails hit after contact, pocketed balls, and scratches.
8. Be fast enough for the search budgets in section 15. The builder chooses how.

Not required in Stage 1: throw, squirt, swerve, jumps.

## 10. Safety evaluation [PROPOSED]

The current `evalSafety` (lines 1032–1041) checks only the centre line, so a half-visible OB counts as "hooked". Its rail score caps at 75% (`1 − railD/4R` with `railD = R` when frozen). Distance is scaled to a nearly unreachable 0.85 × diagonal and rewarded even when hooked. A no-rail foul only affects ranking (line 1046). It ignores kick difficulty and speed tolerance.

New model:

1. **Hard gates (score 0, outcome named).**
   - scratch
   - wrong ball first
   - no rail after contact (a foul)
   - OB pocketed ("not a safety")
2. **Visibility V (0 to 1).** V is the fraction of the target's contactable width the cue ball can hit directly. It is found by sweeping directions across the OB's contact cone. In 8-ball, use the opponent's best ball in their group.
3. **Direct threat.** Applies only when V > 0. It rises with V, with shorter distance, with an easier cut, and when the OB is near a pocket. Distance matters only through this term.
4. **Kick difficulty.** Uses the fewest rails needed, plus the count and width of open one-rail and two-rail lanes, all computed with the engine.
5. **Cue restriction.** Grows as the cue ball nears a rail and reaches 100% when it is frozen.
6. **Robustness. [OWNER, amended 2026-11-25]** Re-run the shot on a 3×3 grid of speed ×{0.96, 1, 1.04} and aim {−0.2°, 0, +0.2°}. The headline score is the mean of the nine runs, and a gated variant counts as 0. A "Forgiving" or "Touchy" label reflects how much the scores spread. The tolerance was halved from ±8% and ±0.4°. At the old tolerance, none of 80 generated layouts reached 70, because most variants lost the hook. With the halved tolerance plus the hook weight below, 46% of sampled layouts were valid, against 6% before (Task 13 investigation).

The score runs 0 to 100. The breakdown shows V, the best kick, the direct threat, cue restriction, and robustness.

**Weights [PROPOSED, accepted by OWNER 2026-11-25].** Each run's score is 100 · clamp(0.62·H + 0.25·K·H + 0.20·Q − 0.60·D, 0, 1). Here H = 1 − V (the hook), K is kick difficulty, Q is cue restriction and D is direct threat, all 0 to 1. Only the hook weight changed, from 0.55 to 0.62. The builder sets the spread values for the Forgiving/Touchy label. The results must pass these fixtures. The predicted values at these weights are in brackets:

- Full hook, cue frozen, no one-rail lane: score ≥ 90 (predicted 100).
- Full hook, cue mid-table, one wide one-rail lane: score 55–80 (predicted 67.4).
- Half-visible OB: at least 30 points below the same layout fully hooked (predicted gap 42.3).
- Open OB near a pocket at short range: score ≤ 25 (predicted 0).
- No rail after contact: always 0, shown as a foul.

If a measured fixture leaves its band, stop and report the numbers. Do not retune the weights.

## 11. Safety Studio [PROPOSED]

**Layout bank [OWNER 2026-11-25].** Safety Studio deals only from a bank of layouts validated offline. Stage 1 does not validate random deals on the device. The redeal loop, the 25-attempt limit and the fixed-layout fallback are removed. Code that becomes unused is removed with them: `findDeal`, `MAX_ATTEMPTS`, the fallback and the 500-seed fallback test. The generators, `classify`, `DIFFICULTY_GRID`, `selectShots`, `validateDeal` and `suggest` stay.

**Bank builder.** `scripts/build-bank.js` is a node script that is not shipped. It imports the `src/` modules and writes `data/safety-bank.json`. **[PROPOSED unless marked]**

- **Families [OWNER].** It builds only the six Stage 1 families: 1, 2, 3, 6, 7, 8. These are exported as `ACTIVE_FAMILIES` from `src/deal/families.js`.
- **Generation.** For family f, the builder cycles k = 0, 1, 2, … For each k it goes through the generator bands g = easy, medium, hard in that order.
  - The seed is `dealSeedFor(f, g, hashSeed(f, BANDS.indexOf(g), k) >>> 1)`, and the layout is `generate(f, seed, g)`. A `null` layout is skipped.
  - The builder rounds every ball coordinate to 0.01 in. It then rejects the layout if `validateLayout` fails or any two centres are closer than 2R − 1e-6 (R30).
  - A seed already in the bank is skipped.
- **Band.** The band is `classify(shareGe70)`, where `shareGe70` comes from `selectShots(layout, DIFFICULTY_GRID)`. It is the share of difficulty-grid candidates whose cheap nominal score is ≥ 70, using the thresholds below. The measured band, not g, decides the layout's cell. If that cell already holds 200 entries, the layout is skipped before the search.
- **Search** (coarse to fine, no shot faster than 130 in/s):
  1. **Coarse.** The grid is `BANK_GRID`:
     - offsets: `linspace(−0.92, 0.92, 25)`, or 17 when there are two targets
     - speeds: [12, 16, 22, 30, 40, 52, 66, 84, 106, 130] in/s
     - spins: `SPINS9`

     Run `prepareSafety` on every candidate and drop the ones gated at nominal. Rank the rest by `optimisticTotal` (highest first, then lowest index).
  2. **Full.** Fully score the top 200 ranked candidates whose nominal final layouts are distinct (R26). Use the kick memo and branch-and-bound (R27), with no early exit.
  3. **Fine.** Take the 5 best fully scored shots. Around each, fully score the 5×5 grid of aim offsets {−0.2°, −0.1°, 0, +0.1°, +0.2°} × speed ×{0.9, 0.95, 1, 1.05, 1.1}, minus the centre. Keep the same spin and clamp speed to ≤ 130 in/s.
  4. The best shot is the highest total, and ties keep the first one found.
- **Acceptance.** The builder keeps a layout only if its best total is ≥ 70 under the full model (section 10).
- **Size [OWNER; stop rule PROPOSED].** Each family×band cell has a target of 100 entries and a cap of 200. A family stops when all three of its cells are full, or after 2,000 non-null generated layouts. A cell with fewer than 100 entries is a shortfall.
- **Determinism.** The builder runs in parallel over `worker_threads`, set with `--jobs`, default `os.availableParallelism()`. It decides acceptance in k order, so the output doesn't depend on the job count. Same code, same file.
- **Report [OWNER].** The builder prints:
  - a coverage table with these columns per family×band: generated, valid, count, target, shortfall
  - one line per short cell: `SHORTFALL family F band B: n/100`
  - the total elapsed time

  Shortfalls go to the owner. To fill a cell, nobody tunes generator ranges, weights, band thresholds or search parameters. That needs an owner decision.
- **Examples.** The builder also runs the search on the three fixed layouts and stores each one's best shot. This applies whatever the score.

**Bank file.** `data/safety-bank.json`: **[PROPOSED]**

```
{ "v": 1,
  "modelHash": "<sha256 hex>",
  "params": { "families": [1,2,3,6,7,8], "target": 100, "cap": 200, "speedCap": 130 },
  "coverage": [ { "family": 1, "band": "easy", "generated": 0, "valid": 0, "count": 0 } ],
  "entries":  [ { "id": 0, "family": 1, "band": "easy", "genBand": "easy", "seed": 0,
                  "share": 0, "layout": Layout, "best": Scored } ],
  "examples": [ { "name": "open hook", "slug": "open-hook", "layout": Layout, "best": Scored } ] }
```

- `id` equals `seed`, the deal seed. It is an integer and unique in the bank, and it encodes the family and generator band through `dealSeedFor`. `band` is the measured band, `genBand` is the band passed to `generate`, and `share` is `shareGe70`.
- `layout` is the stored, rounded layout. `best` is the full `Scored` (`{shot, score}`) that the builder found for it.
- In `coverage`, each cell has three counts:
  - `generated`: layouts measured into that cell and searched
  - `valid`: those whose best is ≥ 70
  - `count`: entries kept, at most 200
- Entries are ordered by family, then band (easy, medium, hard), then generation order.
- `modelHash` is the SHA-256 of the contents of every file under `src/engine/`, `src/geometry/` and `src/eval/`, in sorted path order. When the scoring model changes, a test fails until the bank is rebuilt (section 15).

**Dealing [OWNER; mechanics PROPOSED].**

- The search worker fetches and parses the bank. The main thread never parses it, because of the 50 ms task rule in section 15. Picking is pure code in `src/deal/bank.js`.
- `pickEntry(bank, family, band, seed, excludeIds)` works on the cell's entries in file order (n entries):
  - It starts at index i = floor(mulberry32(hashSeed(seed))() · n).
  - If that entry is excluded, it steps to i + 1 mod n until it finds one that isn't.
  - It returns `null` if the cell is empty or every entry is excluded.
- **Session.** `sessionPlan(sessionSeed)` keeps the 3 easy, 4 medium, 3 hard mix and shuffles over `ACTIVE_FAMILIES`, so a family appears at most twice in 10 slots.
  - Slot i picks with seed `hashSeed(sessionSeed, 100 + i)` and excludes entries already in the session.
  - If the planned family's cell is empty, the slot uses the next active family, in ascending cyclic order, that has an entry in that band.
- **New layout.** It replaces the current deal with another from the same family and band, and does not advance the session. The r-th reroll of slot i (r = 1, 2, …) uses seed `hashSeed(sessionSeed, 100 + i, r)`. It excludes the current entry and every entry already in the session.
- **Retry.** Retry replays the same layout. This replaces today's unclear Reset button (line 367).
- **URL.** `#/study/safety?deal=<id>` replays that bank entry exactly. If the id isn't in the bank, for example after a rebuild, the app shows "That layout isn't in this version" and deals a new layout.
- **Suggest.** "Show a good safety" runs `suggest(layout, {seedShots: [{...best.shot, known: best.score}]})` seeded with the stored best. So it is fast, never scores below the stored best, and is always ≥ 70.

**Difficulty** is measured offline by the builder as the share described under "Band" above. Easy is above 15%, medium 4–15%, hard below 4%. A 10-deal session mixes 3 easy, 4 medium and 3 hard, shuffled and drawn from the bank by band.

**Families:** (1) hook behind a blocker; (2) rail tuck or freeze; (3) stop/stun hide; (4) thin cut sending the OB long to a rail; (5) length-of-table lag; (6) 8-ball, hide from the opponent's whole group; (7) 9-ball, lowest ball in clutter; (8) behind your own balls or a cluster.

- **Stage 1 ships the six hide-based families: 1, 2, 3, 6, 7, 8 [OWNER 2026-11-25].**
- **Families 4 and 5 are deferred.** The current formula credits distance only through direct threat, so distance safeties score 0–20 even when played well. For example, a length-of-table leave with both balls frozen and the OB visible scores 14, and a thin-cut leave scores 0. Their generators stay in the code and in the generator tests. They are excluded from the bank and the session mix. Re-enabling them is in the Backlog (section 17).
- **Family 1 is weak.** The investigation found it gave 0–2 valid layouts in every sampled configuration. If it can't fill its cells, the builder's report flags this to the owner. It is not tuned silently (section 18).

**Examples [OWNER 2026-11-25].** The current three layouts (`SCEN`, lines 969–973) stay as named examples: "open hook", "rail tuck" and "behind the 8".

- They are not a fallback, are not in the session mix, and do not count as validated deals.
- They open from Safety Studio, and by URL as `#/study/safety?example=<slug>` with slug `open-hook`, `rail-tuck` or `behind-the-8`.
- Each one honestly shows its stored best score. If that score is below 70, it is labelled "No safety scoring 70 found".
- "Show a good safety" is seeded with the stored best.

**Session.** A session is 10 deals, like Escape Trainer's 10 rounds. Each deal is scored 0–100, and the session shows a running average and the score for each deal. After each shot, "Show a good safety" displays the best shot the search found.

**Controls:** drag to aim with ±1° and ±0.1° nudges, one shared spin pad (replacing three copies), speed control.

## 12. Table mode [PROPOSED]

Stage 1 delivers the Table door, the session store and wake lock. Until the port is done, the door lists the drills and opens the legacy Table Drills.

Target design for the later port:

- **Layout.**
  - Phone (portrait): diagram on top, large log buttons in thumb reach.
  - iPad (landscape): diagram and buttons side by side, no scrolling.
- **Setups.** Random setups appear as placement diagrams. The player logs what really happened. There is no tapping to mark where a virtual ball stopped.
- **Logging.**
  - Logging takes one or two taps on buttons at least 64 px tall.
  - Labels are specific to each drill, for example "Hooked / Partial / Open / Foul".
  - One tap undoes the last log.
- **Session storage.** The tally is saved to localStorage after each log, so it survives a refresh or screen lock. "New session" asks for confirmation, then clears it. There is no history. **[OWNER]**
- **Wake lock.** Screen Wake Lock is held during a session and re-acquired whenever the app becomes visible again.

## 13. Offline and updates [PROPOSED]

- **Install.** A manifest and icons let the app run standalone from the home screen.
- **Caching.**
  - The service worker precaches everything in `src/precache.js`.
  - The cache name includes the version.
  - Files are served cache-first.
  - Old caches are deleted on activation.
  - **[OWNER 2026-11-25]** The layout bank `data/safety-bank.json` is a shipped file. It is listed in `src/precache.js` and is covered by the precache tests and the content hash. Rebuilding the bank changes the hash, which forces a version bump. A Safety Studio session therefore works offline.
- **Precache tests.**
  - A test fails if a shipped file is missing from the list, or if a listed file does not exist.
  - `src/precache.js` also stores a content hash of all shipped files. `node scripts/stamp.js` updates it and the result is committed, so this is not a build step. A test fails if the hash is stale, which forces a version bump.
- **Updates.** When a new service worker is waiting, show "New version available — tap to reload". Tapping it activates the new version and reloads.

## 14. UX and accessibility [PROPOSED]

- **Zoom and scrolling.** Remove `user-scalable=no` and `maximum-scale` (line 5). Replace blanket `touch-action:none` on canvases (line 108) with capturing only drags that start on a ball or the aim handle.
- **Touch targets.** Balls and the aim handle get hit areas of at least 44 px.
- **Phone layout.** Aim and Shoot both fit without scrolling. Today, below 900 px Shoot sits under the canvas (line 101).
- **Contrast and text.** Contrast meets WCAG AA at 4.5:1 or better. Labels are at least 12 px.
- **Navigation and semantics.** Hash routing (Back, refresh, deep links work), ARIA tab pattern, all controls keyboard-operable.
- **Look [OWNER, open].** The current theme looks dated: brass and wood grain, all caps, tiny monospace labels, long intros. The look will be chosen from mockups before the shell UI is built. Engine, evaluation and search work does not wait for this.

## 15. Testing and success criteria

Stage 1 is done when all of the following pass.

**Physics tests.** Each is a named `node --test` case. Tolerances are recorded in the tests (builder chooses them).

- **Stop shot.** On a straight-in stun shot, the cue ball stops within 0.25 ball-widths of where it hit the OB.
- **Stun cut.** On a stun cut, the cue ball leaves along the tangent line, within ±2°.
- **30° rule.** A rolling cue ball deflects 30° ± 4° on a half-ball hit, and 27–36° from ¼- to ¾-ball hits.
- **Draw.** Draw from twice the distance comes back measurably less.
- **Cushions.** A soft spinless ball rebounds near the mirror angle; harder rebounds shorter; running english lengthens it.
- **Kicks.** A firm one-rail kick aimed by the mirror rule misses the mirror target by more than one ball-width.
- **Blockers.** Blockers in the path get hit and move.
- **Determinism and termination.** Same seed, identical output; every simulation settles in bounded time.

**Evaluation.** All the fixtures in section 10 pass at the section 10 weights and robustness grid.

**Deals (layout bank) [OWNER 2026-11-25].** These replace the 500-seed fallback criterion.

- **Re-validation.** For every bank entry, `scoreSafety(layout, best.shot)` gives a total ≥ 70 that exactly equals the stored total. `npm test` checks the first 2 entries of each family×band cell. `RUNOUT_FULL=1` checks every entry. Each example also re-scores exactly to its stored total, with no ≥ 70 requirement.
- **Integrity.**
  - Ids are unique.
  - Every entry's family is in `ACTIVE_FAMILIES`, and its band is easy, medium or hard.
  - Every layout passes `validateLayout` and the 2R − 1e-6 spacing check.
  - `modelHash` matches the current model files.
- **Coverage.** The test prints the count for every family×band cell and lists each shortfall below 100. Shortfalls are reported to the owner and do not fail the test. The test fails only if a band has fewer than 4 entries across all families, because then a 3/4/3 session can't be dealt without repeats.
- **Session.** For 500 session seeds:
  - `sessionPlan` gives 3 easy, 4 medium and 3 hard slots over active families only.
  - Every slot resolves to a bank entry, and no entry repeats within a session.
  - The same seed gives the same ten ids.

**Performance.** Measured on a 2020-class iPad and an iPhone 12 / Pixel 6a-class phone:

- Suggest, seeded with the entry's stored best, finishes in 1.5 s or less and never returns less than the stored total. During the build, the bench checks this under desktop Chrome with 4× CPU throttling (section 18a.5), on 2 entries per family×band cell. Dealing is a lookup, so there is no deal-validation budget. **[OWNER 2026-11-25]**
- No main-thread task runs longer than 50 ms during search, animation or bank loading. The bank is parsed in the worker.
- Animation holds a steady 60 fps.

**Offline.** With the iPad in airplane mode, the home-screen app cold-starts and plays a Safety Studio session.

**Install and accessibility.**

- Chrome DevTools reports the app as installable. Lighthouse 12 removed its PWA category, so the Application panel is the check.
- Lighthouse accessibility scores 90 or higher on the home, Study, and Safety Studio screens.

**Continuity.**

- The live URL works after every merge.
- Every unported module is one tap from the new home.
- The precache tests pass.

## 16. Staging [PROPOSED]

Each stage ships usable.

**Stage 1 (this doc):** repo structure; engine, geometry, evaluation, search worker; Study/Table shell; offline and updates; rebuilt Safety Studio; Table door linking to legacy drills; wake-lock check.

**Stage 1 amendments [OWNER 2026-11-25]:**

- Stage 1 also delivers the offline bank builder (`scripts/build-bank.js`) and the shipped bank (`data/safety-bank.json`) for families 1, 2, 3, 6, 7 and 8.
- The bank is built after the engine, evaluation and search are final, because a model change invalidates it (section 11, `modelHash`). It is committed before the Safety Studio UI is wired to it.
- The builder's coverage report goes to the owner before Stage 1 is accepted.
- Families 4 and 5 wait for the distance-safety scoring update in the Backlog.

**Later stages, each with its own design round:**

1. Port and fix the other Study modules.
2. Port the Table drills.
3. Add new drills, in priority order:
   1. **Execute the Close:** the last two balls plus the money ball, with the cue ball carried forward between shots, scored on runouts.
   2. **Safety Battle** against a noisy bot.
   3. **Two-way Shot Trainer.**
   4. **Read-the-Hook quiz.**
   5. **Speed-window safety plus table calibration.**

## 17. Backlog (not in Stage 1)

- **Escape Trainer:** direct hits and no-rail fouls count as successful kicks; a blocker foul still scores 1; the home card calls it a "calculator" (line 221).
- **Run or Safe?:** the call doesn't affect the score and can be changed after shooting.
- **The Closer:** random layouts have no clusters or rail balls; 9-ball order is forced.
- **Table Drills:** setup targets don't match drill intent (a hide target is never checked as hooked); "Reset all logs" (line 528) has no confirmation.
- **Distance safeties [OWNER 2026-11-25]:** distance-safety scoring update (credit leaving the opponent long/frozen against a rail), then re-enable families 4 and 5. Today distance counts only through direct threat, so well-played distance safeties score 0–20. The update must keep the section 10 fixtures passing, and the bank must be rebuilt afterwards.

## 18. Open items

1. **Visual direction [OWNER].** Choose it from mockups before the shell UI is built.
2. **Wake lock on iPad [PROPOSED].** Wake lock was reported broken in iOS home-screen apps before 18.4. This hasn't been verified. Test it early on the owner's iPad in the installed app. If it fails, show a tip to set Auto-Lock to Never.
3. **`runout-lab.html` [PROPOSED].** Confirm that a redirect stub is preferred over deleting it.
4. **Bank coverage [OWNER, pending the first build].** The owner gets the builder's shortfall report. For each short family×band cell, the owner decides one of three things: accept the shortfall, approve changes to that family's generator ranges, or drop the family from Stage 1. Family 1 is expected to be short. The 3/4/3 mix also depends on every band being reachable. Band thresholds are unchanged, so a skewed band distribution shows up here and is not retuned.

## 18a. Builder-check resolutions [PROPOSED by Claude unless marked]

1. **Visual direction and build order.** Claude produces two or three mockups for the owner to choose from. Engine, geometry, eval, search, deal, service worker and precache are built first and do not wait. Shell and Safety Studio UI work starts only after the owner picks a look. The contrast and Lighthouse criteria apply to the chosen look.
2. **Scale.** The engine uses true proportions: a real table playing area, 2.25 in balls and standard pocket mouths. The renderer may draw balls larger than true scale for legibility, and hit targets stay at least 44 px regardless of drawn size. The engine scale and render scale are separate. The table size is TBD by the OWNER (see below).
3. **Performance fallbacks, in order.**
   - (b) Search with a cheap kick-lane and robustness approximation, and run the full model only on the top candidates. *Still applies to Suggest.*
   - (c) Measure difficulty on a coarser grid than Suggest uses. *Now done offline by the bank builder.*
   - Validate the next deal in the worker while the player is still on the current one, so the wait is hidden. *Obsolete: there is no on-device deal validation.*
   - (d) If it still misses, loosen the 1.5 s budget for deal validation only. *Obsolete: the deal-validation budget is removed.*
   - A pre-validated seed bank is the last resort, and it must be reported to the owner first.

   **Status 2026-11-25 [OWNER]:** this was reported to the owner, who approved the last resort. Mid-density search took 8–22 s per layout on desktop, so on-device validation was not viable. Safety Studio now deals from the pre-validated layout bank (section 11). The only on-device search budget left is Suggest seeded with the stored best: ≤ 1.5 s under 4× throttle.
4. **Rules per family.**
   - Families 1–5 use a single designated object ball, as today. Families 4 and 5 are deferred from Stage 1 (section 11). "Wrong ball first" means anything other than that ball.
   - Family 6 uses 8-ball group rules. V is taken against the opponent's best ball in their group.
   - Family 7 uses 9-ball. The legal ball is the lowest on the table, and the opponent's target is the lowest ball after the shot.
   - Family 8 uses a designated object ball. The blockers are your own balls or a cluster, and hitting them first is a foul.
5. **Acceptance devices.**
   - During the build, the proxy is desktop Chrome with 4× CPU throttling.
   - Final acceptance uses a short hand-off checklist run by the owner on their own devices: offline cold start, wake lock, frame rate and Suggest time. The devices are TBD by the OWNER (see below).
6. **Legacy offline.** The legacy page is precached too, because the Table door opens the legacy Table Drills at a table that may have no signal. The new app and the legacy page both use self-hosted font files that are precached. There is no Google Fonts dependency.

## 19. Left to the builder

- Physics constants and integration method (must pass the tests in section 15).
- Evaluation spread values (must pass the section 10 fixtures). The weights and the robustness grid are fixed in section 10 (amended 2026-11-25).
- On-device Suggest search strategy: grid or coarse-to-fine, number of workers, early exit. The offline bank search is fixed in section 11.
- File names, except `scripts/build-bank.js`, `data/safety-bank.json` and `src/deal/bank.js`, which section 11 fixes.
- How the legacy app stays reachable.
- Parameter ranges for each family. Once the bank is built, they are not changed to fill a cell without owner approval (section 18, item 4).
- Units for the speed control.
- Test tolerances.

## 20. Owner answers

- **Table size [OWNER]: 9 ft.**
  - The engine models a 100 × 50 in playing surface with 2.25 in balls (R = 1.125 in) and **4.5 in corner pocket mouths [OWNER]**. Side pocket mouths are 5.0 in, per WPA's rule that the side is about ½ in wider than the corner **[PROPOSED]**.
  - The current app's 100 × 50 coordinate space already matches a 9 ft table in inches, so only the ball radius changes: today's R = 2.45 (line 545) is about twice real size. Existing layout coordinates can be reused, but positions near rails and between balls must be re-validated at true ball size.
- **iPadOS version [OWNER]: unknown.**
  - The app detects Screen Wake Lock support at runtime. If the lock can't be acquired, or is released while the session is visible, it shows the "set Auto-Lock to Never" tip automatically.
  - Running wake lock in the installed app on the owner's iPad is the first item on the owner's acceptance checklist. The owner can find the version under Settings → General → About.
  - The plan does not depend on knowing the version in advance.

## 21. Amendments 2026-11-25

These follow the Task 13 investigation, `.superpowers/sdd/2026-11-24-runout-lab-stage1a-foundation/investigation-task13.md`. Rulings R22 (KICK_SPEED 90), R23–R24 and R26–R28 are unchanged.

1. **Robustness and hook weight [OWNER; weight PROPOSED, accepted].**
   - The robustness grid is halved to speed ×{0.96, 1, 1.04} × aim {−0.2°, 0, +0.2°}. It is still the mean of nine runs, and gated variants still count as 0.
   - The weights are now 0.62·H + 0.25·K·H + 0.20·Q − 0.60·D, with wH changed from 0.55.
   - Predicted fixtures: F1 100, F2 67.4, half-visible gap 42.3, F4 0.
   - Sections 10 and 19.
2. **Pre-validated layout bank [OWNER].**
   - Safety Studio deals from `data/safety-bank.json`, which the unshipped `scripts/build-bank.js` builds offline with a coarse-to-fine search capped at 130 in/s. The bank keeps only layouts whose best is ≥ 70, with a target of 100–200 per family×band, and shortfalls are reported.
   - Deals are a seeded pick from the bank, so `deal=<id>` replays exactly. Suggest is seeded with the stored best.
   - On-device deal validation, the redeal loop, the fixed-layout fallback and the deal-validation budget are removed. The Suggest budget of ≤ 1.5 s at 4× throttle stays.
   - The three fixed layouts become named examples with their honest scores.
   - This is the section 18a.3 last resort, now approved.
   - Sections 3, 8, 11, 13, 15, 16, 18, 18a.3 and 19.
3. **Families 4 and 5 deferred [OWNER].**
   - Stage 1 ships families 1, 2, 3, 6, 7 and 8, because the current formula scores distance safeties 0–20. The generators for 4 and 5 stay but are excluded from the bank and the session mix.
   - Family 1 is flagged as weak (0–2 valid layouts per sampled configuration) and goes to the owner through the coverage report, not silent tuning.
   - Backlog item added.
   - Sections 11, 16, 17, 18 and 18a.4.

Not edited here and now stale: the implementation plan's Global Constraints 9–11, `.superpowers/sdd/2026-11-24-runout-lab-stage1a-foundation/global-constraints.md`, the plan's `combineScore`, `ROBUST_GRID` and Task 13 and Task 16 text, and rulings R9 and R15. They must be reconciled with this section before work resumes.
