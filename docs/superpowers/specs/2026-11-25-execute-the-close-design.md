# Execute the Close: design (new drill, priority 2)

Date: 2026-11-25. Status: draft for owner review.

Tags follow the Stage 1 spec (`2026-11-24-runout-lab-rebuild-design.md`): **[OWNER]**, **[PROPOSED]**, **[BUILDER]**. "§n" refers to that spec. This spec depends on Banking stage B0 (`2026-11-25-banking-design.md` section 3).

## 1. Intent and why

The owner runs racks but stalls on the last two balls and the money ball (§1). The Closer (legacy) trains the *plan*, meaning which order to shoot. Execute the Close trains *doing it*:

- Shoot the last two balls and the money ball, one shot at a time.
- The cue ball carries forward, so every position error lands on the next shot.
- The score is runouts, not plan grades.

It answers the question the owner keeps losing: from here, can I actually get out?

**Owner definition [OWNER]:** "the last two balls plus the money ball, with the cue ball carried forward between shots, scored on runouts" (§16).

## 2. Relation to the legacy modules (no duplication)

- **The Closer** (legacy `index.html` markup lines 284–340, logic lines 797–958).
  - The player taps a shot order for 2–6 balls plus the money ball. `evalOrder` (line 907) grades it A–F against `bestOrder`, using the legacy `routeSim`/`bestShot` (lines 823–870: up to 3 pockets × 4 spins × 3 powers on the legacy sim).
  - Nothing is executed, and the cue ball positions are the model's, not the player's.
  - Another spec covers its port. Execute the Close does not grade order and does not reuse legacy code.
  - **Ownership split [PROPOSED]:** The Closer owns order planning and plan grades. Execute the Close owns shot execution, the carried-forward cue ball and runout scoring.
  - **Home cards:** "The Closer: plan the order" and "Execute the Close: shoot it out".
- **Table Drills "Progressive Ghost" (line 1776) and "Key-Ball End Game" (line 1781).** These are player-set racks with a count logged per session. Execute the Close (Table) is the dealt, diagrammed version that also records which ball the rack died on. It does not replace them, and their port is specified elsewhere.
- **Shared code [PROPOSED].** Execute the Close uses the Closer port's generator `closerLayout(seed, game, 2)` (`src/deal/closer.js`, module-ports spec M6). It does not define its own.
  - It does not use the port's route model (`src/search/route.js`). That model grades plans with legacy-style costs, while Execute the Close needs a robust execution search (section 4.4).
  - Because the two models differ, the "model" shot here can differ from The Closer's model step. That is expected, and the copy never compares them.

## 3. Rules [PROPOSED]

- **Games.** Chosen per session.
  - **8-ball:** the player's last two group balls `'1'`, `'2'`, in any order, then `'8'`.
  - **9-ball:** `'7'`, `'8'`, `'9'`. The lowest ball is hit first. Combinations and caroms count, and a legal `'9'` pocketed at any time wins the rack.
- **Called pocket (8-ball), with no extra input.** The intended pocket is the `POCKETS` index with the smallest angle between the target's velocity at the first cue–target ball event (`vb`) and the direction from the target's position to the pocket. A target that drops in any other pocket is "Slop: doesn't count". 9-ball has no call.
- **Shot outcome.** `judgeShot(state, sim, game)` returns:
  `{ counted: string[], foul: null|'scratch'|'wrong-ball-first'|'no-contact'|'eight-early', slop: boolean, rackOver: boolean, won: boolean }`
  - **Fouls:**
    - scratch
    - first contact not legal (8-ball: a remaining group ball, or the 8 once the group is gone; 9-ball: the lowest ball)
    - no contact at all
    - in 8-ball, the 8 pocketed while a group ball remains, which is a loss
  - **Rack over:** any foul, or no legal target counted.
  - **Won:** the money ball counted on a shot with no foul.
- **No safeties and no ball in hand after the start.** A miss ends the rack, as it does in a real close.
- **Pocketed non-targets.** In 8-ball, pocketing an opponent ball as well is allowed, as in real rules. Group balls pocketed together with the target all count.

## 4. Shared model (pure, `src/execute-close/`)

### 4.1 State and shapes

- `CloseState = { layout: Layout, game: '8'|'9', remaining: string[], shotIndex: number }`, where `remaining` lists the money ball last.
- `layout.rules` is set per shot:
  - 8-ball: `{ kind: '8ball', legalIds, opponentIds }`
  - 9-ball: `{ kind: '9ball', legalIds: [lowest] }`
- `CloseRack = { seed, game, feature: 'none'|'cluster'|'rail'|'both', layout, modelChain: Shot[] }`. `feature` is recomputed from the layout (a frozen pair, a ball frozen to a rail, or both). `modelChain` is the noise-free model runout from the start (section 4.4).

### 4.2 Pot ease (leave quality)

- `potEaseBest(cue, ball, balls, cueId)` = (`directThreat(cue, ball, balls, cueId, 1)` − 0.1) / 0.9, clamped to [0, 1]. `directThreat` is in `src/eval/position.js`.
- This reuses the Stage 1 formula cos(cut)·f(cue→ghost)·f(ball→pocket), with f(d) = clamp(1.1 − d/60, 0.15, 1). That formula also handles cut > 75° and blocked paths (0) and the side-pocket entry limit. No hashed file changes.
- **Leave value** L(state after shot):
  - 1 if the rack is won
  - 0 if the rack is over
  - otherwise the maximum of `potEaseBest` over the next legal targets

### 4.3 Execution noise [PROPOSED]

- The shot actually played is `{ aimDeg: aim + na, speed: speed·(1 + ns), spin }`. The noise na ~ N(0, σa), with σa = 0.15° + 0.25°·|spin.x|, and ns ~ N(0, 0.04). Both are clamped to ±3σ.
- Side spin raises the aim error. This stands in for squirt and swerve, which the engine does not model, so the drill cannot teach that english is free.
- The noise is drawn by Box–Muller from `mulberry32(hashSeed(rackSeed, shotIndex, attempt))`, so the same rack, shot and attempt replays identically.
- **Mode.** "Realistic" (noise on, the default) or "Exact" (no noise). It is picked at session start and shown on the summary.

### 4.4 Model shot: `closeSuggest(state)`

The search runs in the worker.

1. **Candidates.**
   - For each legal target t (in id order) and each pocket p (in index order), keep the pair if `clearance(t → p)` and `clearance(cue → ghost)` are both ≥ 0 and the cut is ≤ 75°.
   - The aim is cue → ghost ball (G = t − 2R·û, where û points from t to p). No throw is modelled.
   - Speeds `CLOSE_SPEEDS = [20, 28, 38, 50, 65, 85, 110, 130]`. Spins `SPINS9` (`src/search/grid.js`).
2. **Nominal.** Simulate each candidate once. If the target counted with no foul, nominal = 0.4 + 0.6·L. Otherwise nominal = 0.
3. **Robust.** For the top 8 by nominal (ties go to the lower candidate index), run the §10 grid: aim {−0.2°, 0, +0.2°} × speed ×{0.96, 1, 1.04}. Each run scores 0.4 + 0.6·L if counted with no foul, otherwise 0. The score is the mean of the 9 runs, and `makeShare` is the share of runs counted.
4. **Return** `{ shot, score, makeShare, leave }` for the highest score (ties go to the lower index), or `null` if no candidate counts nominally.

**`modelChain`.** Apply `closeSuggest` from the start with no noise until the rack is won. Generation fails if any step returns `null` or ends the rack.

## 5. Layout generation (seeded, `src/execute-close/deal.js`) [PROPOSED]

- **Base.** `closerLayout(seed, game, 2)` from the Closer port. Ids are 8-ball `'1'`, `'2'`, `'8'` and 9-ball `'7'`, `'8'`, `'9'`. The port's feature mix applies: none 25%, cluster 35%, rail ball 25%, both 15%. So frozen pairs and rail balls appear (the §17 fix for The Closer).
- **`dealRack(seed, game)`.** Returns a `CloseRack` or `null`. It takes `closerLayout(seed, game, 2)` and accepts the layout only if:
  1. it is non-null
  2. at least one legal first target has `potEaseBest` ≥ 0.2 from the cue ball
  3. `modelChain` succeeds (section 4.4)

  Otherwise it returns `null`, and the caller moves to the next seed.
- **Session.**
  - 10 racks, all of the game chosen at session start.
  - Rack i uses the first non-null of `dealRack(hashSeed(sessionSeed, 400 + i, j) >>> 1, game)` for j = 0…39.
  - The test requires 500 sessions per game to resolve all 10 racks with no repeated seed.
- **Reroll.** "New rack" r uses j = 100 + r, …, and does not advance the session.
- **URL.** `#/study/close?rack=<seed>&game=<8|9>` replays a rack. If that seed now gives `null` (after a model change), the screen shows `That layout isn't in this version` and deals a new one.

## 6. Study mode

**Route.** `#/study/close`, with `?rack=<seed>` to replay a rack.

**Flow per rack.**
1. Show the rack. The money ball has a halo, the 8-ball call is inferred (section 3), and the controls are the Plan 1b kit: aim drag with ±1°/±0.1° nudges, spin pad and speed control.
2. **Shoot.** The shot is played with noise (if Realistic) and the full engine trajectory is animated. Then a result line, for example "Made the 1. Next: the 2", "Missed: rack over", "Scratch: rack over" or "Slop: the 1 went in the wrong pocket".
3. **Carry forward.** On a made shot the cue ball stays where it stopped and the next shot starts from there. Nothing is reset.
4. **After the rack ends:**
   - "Model shot from here" shows `closeSuggest` from the position before the failed shot, with "makes it 7 in 9".
   - "Model runout" animates `modelChain` from the start.
5. **Retry** replays the rack from the start with attempt + 1 (new noise). Only the first attempt counts toward the session. "New rack" rerolls.

**In the background**, after each made non-final shot, the worker computes `closeSuggest` from the pre-shot state. Its nominal `leave` is L_model. The player's own leave L_you is L of the actual result.

**Scoring [PROPOSED].**
- **Per rack:** a runout (1 or 0), balls made (0–3), and died-on (1st, key or money).
- **Session of 10 racks:**
  - headline: "Runouts k/10"
  - "Balls made m/30"
  - a died-on histogram with the line "Most racks died on: the key ball (4)"
  - "Position efficiency": the mean of min(1, L_you / L_model) over shots with L_model > 0.05, as a percentage
  - per-rack rows
- Stored with `createSessionStore('close-study', …)`. It resumes after a refresh, and New session asks for confirmation.

## 7. Table mode

**Route.** `#/table/close`. Layout and logging follow §12: diagram on top, buttons at least 64 px tall, one-tap undo, saved after each log, wake lock held.

**Setup.**
- The app deals a rack with `dealRack`, the same as Study. Next to the diagram, each ball's position is given in diamonds rounded to 0.25 diamond (3.1 in), for example "1: (2.5, 1)", "2: (5, 3.25)", "8: (7, 0.5)", "Cue: (1.5, 2)". A frozen ball says "frozen to the rail", and a cluster says "touching the 2". There is no tapping to place. The rounding moves a ball by at most 2.2 in, which is acceptable because the real cue-ball path already differs from the sim.
- The diagram shows the balls only. The model chain is behind "Show model runout", because the real cue-ball path will differ.
- **[PROPOSED]** The cue ball starts where the diagram puts it. "Ball in hand" is a session option for the first shot.

**Play.** The player shoots it out in real life, with the cue ball carried forward naturally. Then one tap:

| Button | Meaning |
|---|---|
| Ran out | money ball made legally |
| Missed 1st | missed or fouled on the first ball |
| Missed key | missed or fouled on the second ball |
| Missed money | missed or fouled on the money ball |

**Scoring.**
- "Runouts k/10" and the died-on histogram, the same as Study.
- **Progression [PROPOSED].** At 8/10 or better, the summary suggests "Ready for more: try Progressive Ghost with 3 balls (Table Drills)". That drill adds balls, the way the legacy "add a ball" progression did.

## 8. Physics and engine requirements

- **No new engine change.** It needs Banking B0:
  - E1 removes the non-monotonic rebound that a firm position shot can enter.
  - E2 fixes how much speed the cue ball keeps off a rail. Today a rolling cue ball keeps only 0.30–0.34 of its speed head-on, against the published ~0.5, so rail-first position routes fall short.
  - Execute the Close must not start its model work before B0 merges. Otherwise its tests are tuned to the old cushion and the safety bank is rebuilt twice.
- **Already covered by Stage 1 tests:** stop, stun, the 30° rule, draw decay, all balls moving, and pocket capture.
- **Known limits and their treatment:**

| Limit | Treatment |
|---|---|
| No throw | Sim cut shots need no throw allowance. Copy says so once. Aim skill is not scored. |
| No squirt/swerve | Noise σa grows with side spin (section 4.3). |
| Pocket capture by mouth-line crossing is more generous than real facings | Player and model shots are capped at 130 in/s (Stage 1b speed control; module-ports rule 6). Noisy speed is clamped to ≤ 135.2 in/s, the same bound as the robustness variants (R35). |
| Sim speed units are not the owner's table speed | Out of scope until Speed-window calibration (priority 6). Table mode never states a speed. |

- **Must be validated before shipping:** the model runout rate. Over 100 racks per `closerLayout` feature (none, cluster, rail, both) and game in Realistic mode, the rate is reported. If the "none" feature is below 50%, stop and report to the owner: either the noise is too high or the racks are too hard. Do not retune silently.

## 9. Architecture [PROPOSED; file names BUILDER except `src/execute-close/`]

- `src/execute-close/rules.js` (`judgeShot`), `model.js` (`potEaseBest`, `closeSuggest`, `modelChain`, noise), `deal.js`, `score.js`. All are pure.
  - They import `src/engine/*`, `src/eval/position.js`, `src/geometry/clearance.js`, `src/search/grid.js` (`SPINS9`) and `src/deal/closer.js` read-only.
  - None of them is in a hashed path (Banking section 3.4 rule).
- **Worker.** `src/execute-close/worker.js` and `client.js`, following the `src/search/client.js` pattern. Requests: `deal`, `reroll`, `byId`, `suggest(state)`, `shoot(state, shot, mode, attempt)` (applies noise, simulates and judges), `tableRack`.
  - The next rack is dealt while the current one is played.
- **UI.** `src/study/close/*` and `src/table/close/*`, on the Plan 1b kit.
- **Precache.** New files are added to `src/precache.js` and the hash is restamped.

## 10. Testing and success criteria

- **Rules.** Fixtures for each foul, slop (8-ball), the 8 pocketed early, the 9 on a combination, group balls made together, and a scratch on the money ball (a loss).
- **Generator:**
  - For 200 seeds per game, ≥ 80% give a non-null `dealRack`. The rejected share is reported per feature.
  - Every non-null rack's stored `modelChain` replays to a win.
  - `npm test` replays 20 per game, and `RUNOUT_FULL=1` replays all 200.
  - Same seed, same rack. 500 sessions per game resolve.
- **Determinism.** The same (rack, shot index, attempt, shot) gives an identical outcome in both modes.
- **Noise.** Over 10,000 draws, the sample σ is within 5% of the target and nothing exceeds 3σ.
- **closeSuggest:**
  - It never returns a shot that fails nominally while a counted candidate exists.
  - It is deterministic.
  - Time: ≤ 400 ms per call, node desktop, max over 50 sampled states.
  - `dealRack`: median ≤ 1.0 s and max ≤ 3.0 s, node desktop.
  - Device checks go on the owner checklist. Prefetch hides deal time after the first rack. No main-thread task runs longer than 50 ms.
- **Scoring.** Fixtures for runouts, the died-on histogram and position efficiency, including the L_model ≤ 0.05 exclusion. Retries are not counted.
- **Table:**
  - Logging is one tap, and undo restores the tally.
  - The tally persists across a reload.
  - Every diamond readout is within 0.125 diamond of the true position, and frozen and touching balls are labelled.
- **Owner acceptance:** one Study session and one Table session on the iPad, offline.

## 11. Non-goals and anti-goals

- **Non-goals:**
  - grading the shot order (that is The Closer)
  - full racks or more than 2 balls plus the money ball (the ball count is fixed by the owner's definition)
  - safety play inside the drill (that is Safety Battle)
  - throw and squirt physics
  - long-term tracking
  - a bot opponent
- **Anti-goals:**
  - a dealt rack with no model runout
  - noise so large the model can't run out a featureless rack half the time
  - "english is free" (section 4.3)
  - a Table mode that asks the player to mark where the cue ball stopped
  - a UI freeze during search

## 12. Size and dependencies

**Size:** about 13 tasks (rules 2, model and search 3, deal 1, worker 1, Study UI 3, Table UI 2, bench and checklist 1).

**Depends on:**
- Stage 1b (UI kit, router, Table shell)
- Banking B0 (E1 + E2 and the single safety-bank rebuild)
- module-ports M6's `closerLayout` task only. The Closer screens and route model are not needed.

## 13. Open questions for the owner

1. **Execution noise on by default (σa = 0.15° + 0.25°·|english|, speed σ 4%)?** Default: yes, with "Exact" as a choice. With noise off, a runout only shows that you found the line, not that the line has margin, so the score overstates real skill.
2. **8-ball "slop doesn't count", with the intended pocket inferred from the object ball's departure line?** Default: yes. "Any pocket" is simpler but rewards lucky makes.
3. **Add opponent balls as traffic in 8-ball?** Default: no for now. `closerLayout` has no opponent balls. Adding them needs a new option on `closerLayout` (owned by M6) or a wrapper here.
4. **Reuse `closerLayout(seed, game, 2)` instead of an Execute-the-Close generator?** Default: yes, which makes M6's generator task a dependency. If no, this spec adds its own generator (about 1 more task), and the two generators can drift apart.
5. **Table start: cue ball placed from the diagram, or ball in hand?** Default: placed, with ball in hand as an option. Ball in hand first is easier and matches Progressive Ghost.
6. **Session length of 10 racks, and only first attempts count?** Default: yes. Counting retries inflates runouts.
