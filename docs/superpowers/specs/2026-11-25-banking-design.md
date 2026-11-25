# Banking: design (new feature, priority 1)

Date: 2026-11-25. Status: draft for owner review.

Tags follow the Stage 1 spec (`2026-11-24-runout-lab-rebuild-design.md`): **[OWNER]** decided by the owner, **[PROPOSED]** stands unless the owner corrects it, **[BUILDER]** the implementer decides. Section numbers like "§10" refer to the Stage 1 spec.

**Naming [OWNER].** A *bank shot* is an object ball (OB) driven off one or more cushions into a pocket. The feature is called "Banking". UI copy always says "bank shot" or "Banking", never "bank" alone, because "bank" already means the safety layout bank (`data/safety-bank.json`). Code lives in `src/bankshot/` for the same reason. **[PROPOSED]**

## 1. Intent and why

The owner closes racks badly and loses safety battles (§1). Bank shots touch both:

- Late in a rack a bank is often the only shot on the key ball or the money ball. A player who can't read the line either passes up the shot or plays it and sells out.
- A bank that is played "bank safe" (a miss leaves the opponent hooked or long) is the commonest two-way shot in a safety battle.

The core skill is reading the real line. The mirror (equal-angle) line is only a reference. Speed, the OB's roll at the cushion, cut-induced spin and cushion compression move the real line off the mirror. Banking teaches that reading in Study, with a model answer from the engine, and drills it at the table with simple logging.

## 2. Scope

**Must have:**
1. Engine fidelity work (section 3): fixes E1 and E2, gate G1, and one safety-bank rebuild.
2. Study lessons with a Bank Explorer (section 6.1).
3. Study drill "Read the Bank Shot": guess the line, get the model answer, session score (section 6.2).
4. A seeded bank-shot layout generator (section 5).
5. A Table drill set placed by diamonds, with one-tap make/miss logging (section 7), including the calibration drill T4 that runs gate G2.

**Nice to have (not in this stage):** multi-rail banks (two or three rails), kick-banks, banks with blockers, and a scored "bank or safe?" decision drill. That decision drill goes to the Two-way Shot Trainer (priority 4), which reuses the miss-leave function from section 4.7.

## 3. Physics fidelity (do this first)

### 3.1 What the engine does today

Measured on the current engine with throwaway scripts that import `src/` read-only. The OB is launched alone, with no spin, which is the state a full-ball hit leaves it in.

- **Cushion constants** (`src/engine/constants.js`, `cushion.js`):
  - e = clamp(0.92 − 0.0012·vn, 0.70, 0.92)
  - τ = clamp(0.97 − 0.004·vn, 0.55, 0.97)
  - τ reaches its floor at vn = 105 in/s, but e keeps falling until vn = 183. Between those speeds the rebound angle *lengthens* with speed, which is the known limitation (`docs/acceptance-checklist.md`, "not smooth above about 150 in/s"; at 45°, 150 in/s gives 34.8° out and 250 in/s gives 37.9°).
  - For banks the threshold is normal speed, not ball speed. Near-perpendicular banks enter that band once OB speed is above about 110 in/s.
- **Roll into the rail is kept whole.** At a cushion, `simulate.js` keeps the rolling velocity w unchanged when vn ≥ V_REST. A rolling ball therefore leaves the rail with full topspin into it, which brakes and bends the rebound.
  - Head-on, a rolling ball keeps 0.30–0.34 of its speed after rebound and skid. Published value: "loses about half of its speed" (Dr. Dave, cushion speed FAQ).
  - Slow banks run very long. At 30° incidence from 30 in away, 60 in/s gives 52° out.
- **Consequences for bank shots on the current engine:**
  - A cross-side bank (OB at (30, 30), off the y = 0 rail, into the side pocket at (50, 50)) cannot be made below 80 in/s.
  - A long bank (OB at (45, 20), off the x = 100 rail, into the (0, 50) corner) cannot be made below 130 in/s.
  - Realistic bank speeds are pushed up into the non-monotonic band.
- **What is right already.** Softer goes long, firmer goes short, and an OB close to the rail (still sliding) goes shorter than one far away (rolling). These match the published rules: "more speed shortens the rebound"; "less topspin (faster speed or closeness to rail) means shorter bank rebound".
- **Not modelled:** throw, cut-induced spin (CIS), spin transfer, squirt and swerve. The published rule is "outside cut shortens a bank, inside cut lengthens it". The engine predicts neither.
- **Pocket windows.** These are 0.6–2.2° wide, about 0.3–1.5 in at the rail. A model answer must be resolved to 0.01°.

### 3.2 Required engine changes

Both go into one change set, so there is one rebuild (section 3.4).

**E1. Monotonic rebound [PROPOSED, required].**
- Set `CUSHION.E_MIN` = 0.794 (= E_HI − E_SLOPE·(TAU_HI − TAU_MIN)/TAU_SLOPE = 0.92 − 0.0012·105). e and τ then hit their floors at the same vn, and the out-angle is non-increasing in speed.
- Prototype result: all 73 current engine, eval and geometry tests pass unchanged.
- This fixes the known limitation.

**E2. Cushion removes into-rail roll [PROPOSED, needs owner approval because it changes approved fixtures].**
- On a cushion or jaw contact with vn ≥ V_REST, subtract `CUSHION.ROLL_LOSS · vn` from the normal component of the rolling velocity w. In code: `b.wx -= ROLL_LOSS·vn·nx; b.wy -= ROLL_LOSS·vn·ny` in the cushion branch of `simulate.js`, as the else-branch of the existing R3b block. `ROLL_LOSS` = 0.75, a new key in `CUSHION`. `cushionRebound` is unchanged.
- This matches the published "topspin roll becomes stun out" (0.25 of the roll is left) and the "about half" speed loss.
- Prototype (E1 + E2):
  - Head-on rolling retention is 0.49–0.55.
  - The cross-side bank above is makeable from 60 in/s.
  - Window centre against the mirror is −1.8 in at 60 in/s (long) and +1.3 in at 130 in/s (short).
  - The rebound angle is non-increasing over 30–130 in/s at 15°, 30° and 45° incidence, from 6 in and from 30 in.
- E2 breaks 4 current tests:
  - "Kicks: firm one-rail mirror kick misses by > one ball-width". At 120 in/s the kick now lands 0.27 in from the target. At 60, 90 and 160 in/s it misses by 6.5, 5.0 and 3.8 in.
  - R19 jaw-capture regression. Its hand-found shot no longer produces the jaw event.
  - Two R23 lane fixtures. `w1` goes from 6 to 5 for both the frozen and the near-frozen cue, so the "no cliff" property still holds.
- Proposed amendments:
  - The Kicks fixture becomes "misses by > 2R at 60, 90 and 160 in/s".
  - R19 gets a new reproducer, found by the same random search.
  - R23 asserts that frozen and near-frozen give equal `n1` and `w1`, and records the new values.

**E3. No throw or CIS in this stage [PROPOSED].** Banking deals keep the cut at 15° or less (section 5), and every answer is stated as "where the OB must meet the rail". The lessons state the CIS rule as a real-table effect that the app does not simulate.

**Speed cap [PROPOSED].** No Banking shot is faster than 130 in/s (OB launch speed), the same as the safety bank.

### 3.3 Gates

**G1. Engine fixtures (node tests, must pass before any Banking UI merges).** `test/engine-cushion-fidelity.test.js` [BUILDER name]. "OB-only" means a layout with one ball, which is also `cueId`, struck with spin {0, 0}.

| Id | Setup | Pass |
|---|---|---|
| BF1 | Out-angle from `cushionRebound` at incidence 15°, 30°, 45°, vn from V_REST to 250 in 1 in/s steps | non-increasing |
| BF2 | OB-only toward the y = 0 rail at u = 30, from 6 in and 30 in, at 15°/30°/45°, speeds {45, 60, 80, 100, 130}. Effective angle = contact point to the crossing of y = 20 | non-increasing in speed, tolerance 0.2° |
| BF3 | Same shot at 30°, 80 in/s | from 6 in, at least 3° shorter than from 30 in |
| BF4 | Rolling ball (spin y = 0.8) head-on from 30 in, at 40, 80 and 120 in/s | speed after skid ÷ speed at the rail is in [0.40, 0.60] |
| BF5 | Cross-side: OB (30, 30), rail y0, pocket 4 | window ≥ 0.5° at 60 in/s; no window at 30 in/s |
| BF6 | Same | 60 in/s reads long, 130 in/s reads short (section 4.4) |
| BF7 | All Stage 1 §15 physics tests | pass, with the E2 amendments above |

If any fixture fails, stop and report the numbers. Do not tune constants beyond E1 and E2 without the owner.

**G2. Owner table check (before the Study drill's scoring ships).**
- The owner runs drill T4 (section 7) on their own table: 3 setups × 3 speeds × 5 shots = 45 shots.
- For each of the 9 cells, the majority of the 5 logs (Made, Long or Short; a tie counts as Made) is compared with the engine's prediction for a mirror aim (section 4.4).
- **Pass:** at least 7 of 9 cells agree, and no cell is opposite (engine Long against observed Short, or the reverse).
- **On fail:** the Study drill ships without scoring, labelled "Practice (model not yet checked against your table)". The owner decides whether to retune the cushion constants, which means another rebuild.
- `src/bankshot/config.js` exports `MODEL_CHECKED = false`, set to true by a commit after G2 passes. It controls Study scoring and the model line in Table mode (section 7).

### 3.4 Effect on the frozen safety bank (modelHash)

`scripts/model-hash.js` hashes every file under `src/engine/`, `src/geometry/` and `src/eval/`, plus `src/search/grid.js` and `src/search/search.js`. E1 and E2 change `src/engine/`, so the integrity test fails until the bank is rebuilt. Procedure **[PROPOSED]**:

1. On one branch, land E1 + E2, the G1 fixtures and the amended Stage 1 tests.
2. Run the full suite. The §10 safety fixtures must stay in their bands, because kicks now rebound differently. If any leaves its band, stop and report. Do not retune the weights (§10).
3. Rebuild `data/safety-bank.json` with `scripts/build-bank.js` (about 1 h 40 m, deterministic). Run `RUNOUT_FULL=1 npm test`, then `node scripts/stamp.js`. The precache version bumps.
4. The new coverage report goes to the owner. The §18.4 cell decisions and the thin-easy-band decision are asked again if their cells moved.
5. Bundle every other pending rebuild into this one:
   - M1 in `2026-11-25-module-ports-design.md` (distance-safety update, families 4 and 5), which also changes `src/eval/` and rebuilds the bank. That spec allows only M1 to touch hashed paths, so B0 goes onto M1's branch, before M1's rebuild.
   - the owner's hint-speed option "shrink the Suggest grid" (acceptance checklist §3), if it was picked.

   Banking B1–B3 can be built against the B0 engine on that branch, so only merging to `main` waits for the rebuild.
6. Banking code merges only after this branch, so `main` never fails the hash test.

**Rule [PROPOSED]:** no Banking file is placed under `src/engine/`, `src/geometry/`, `src/eval/`, or in `src/search/grid.js` or `src/search/search.js`. Banking imports those modules read-only, so later Banking changes never force a rebuild. Banking ships no data file, and every answer is computed on the device.

## 4. Shared bank-shot model (pure, `src/bankshot/model.js`)

### 4.1 Rails, coordinates, diamonds

- `RailId = 'y0' | 'y50' | 'x0' | 'x100'`.
- Each rail's reflection line is the ball-centre line: y = R, y = H − R, x = R, x = W − R. Each rail maps to its `CUSHIONS` indices: y0 → [0, 1], y50 → [2, 3], x0 → [4], x100 → [5].
- The rail coordinate u is the centre's x on a y-rail and its y on an x-rail.
- 1 diamond = 12.5 in on every rail. Diamonds are shown as u / 12.5 to 2 decimals.

### 4.2 Shapes

- `BankShotSpec = { type: 'cross-side'|'cross-corner'|'long', rail: RailId, pocket: number }`, where pocket is a `POCKETS` index.
- `BankShotDeal = { seed, type, level, layout: Layout, spec }`. The layout has the balls `cue` and `ob`, with `rules: { kind: 'designated', legalIds: ['ob'] }`.
- `Window = { loDeg, hiDeg, centerDeg, widthDeg, u: { lo, hi, center } }`. Angles are OB launch directions.
- `LevelAnswer = { level, speed, captureSpeed, window: Window|null, mirror: { aimDeg, u }, devIn, read: 'long'|'short'|'mirror', kiss: { stun, follow, draw }, missLeave?: { long: number|null, short: number|null } }`. Each `kiss` field is `{ made: boolean, kiss: boolean }`.

### 4.3 Mirror and window

- **`mirrorAim(ob, spec)`.** Reflect the pocket point `POCKETS[pocket]` across the rail's reflection line. Aim the OB centre at the image.
- **`isGood(sim, spec)`.** The events before the pocket event contain exactly one cushion event, on a cushion of `spec.rail`, and no ball event. The pocket event is in `spec.pocket`. Jaw events are allowed only on that pocket's jaws.
- **`windowAt(ob, spec, speed)`.**
  1. Scan φ = φm + 0.25°·k for k = −60…60, using OB-only sims with `record: false`.
  2. Take the largest contiguous run of good directions. On a tie, take the run nearest φm, then the one with the lower k.
  3. Refine each edge by 5 bisection steps between the last good and the first bad direction (0.0078° resolution).
  4. If the centre direction is not good, use the good grid point in the run nearest the centre.
  5. Return `null` if no direction is good.
- u values are where the launch line meets the reflection line. A no-spin OB travels straight to the rail, so this is the true contact point.

### 4.4 Speed levels and "read"

- **Levels [PROPOSED]** are defined by how far the OB would have rolled past the pocket: `EXTRA_ROLL = { soft: 12.5, medium: 50, firm: 150 }` in (1, 4 and 12 diamonds).
- **Level names.** The names describe the OB's roll past the pocket. They are not the Stage 1b speed-control words, which describe cue speed in in/s (< 25 soft, 25–59 medium, 60–94 firm, ≥ 95 hard). Banking screens never show the speed control, and every level badge carries its diamond distance.
- **Target capture speed:** v* = √(2·MU_ROLL·G·E).
- **Capture speed** is measured in a `record: true` sim as the distance between the trajectory sample at the pocket event time and the sample before it, divided by their time gap.
- **`solveLevel(ob, spec, level)`** steps the launch speed s over 20, 25, …, 130. It computes `windowAt`, then the capture speed at the window centre. The first s whose capture speed is ≥ v* is refined by 3 bisection steps over [s − 5, s]. If none qualifies up to 130, the level is infeasible (`window: null`).
- **devIn** = (u_center − u_mirror) · sign(u_pocket − u_ob), where u_pocket and u_ob are the pocket's and the OB's coordinates along the rail. A negative value means the ball runs long (it must meet the rail earlier).
- **read:**
  - `'mirror'` if |devIn| < 0.5 in
  - `'long'` if devIn ≤ −0.5
  - `'short'` if devIn ≥ 0.5
- **Prediction for a mirror aim (used by G2):**
  - Made if φm lies in [loDeg, hiDeg].
  - Otherwise Long if read = long and Short if read = short.
  - read = mirror with φm outside the window cannot happen, because windows are wider than 0.5 in.

### 4.5 Example values (prototype E1 + E2, for the record; not test fixtures)

The cross-side bank from (30, 30) needs about 57 in/s at soft, 70 at medium and 95 at firm. Its window is 1.8–2.5° wide, and it reads long at soft and medium and short at firm.

### 4.6 Kiss check

The shot is played as cue ball → ghost ball G = ob − 2R·(cos φc, sin φc), for φc = window centre. The cue ball is aimed straight at G, so its path is straight for any follow or draw.

1. For each spin in {stun {0, 0}, follow {0, 0.5}, draw {0, −0.5}}, bisect the cue speed over [s, 3s] in 10 steps. The target is an OB launch speed (|vb| at the first ball event) within 0.5 in/s of the level speed s.
2. Run the full sim.
3. `kiss` is true if the cue ball and the OB collide again before the OB is pocketed or stops.
4. `made` is `isGood` on the full sim, applied to the OB's events.

### 4.7 Miss leave ("bank safe")

- `missLeave(deal, level)` plays the stun shot at φ = hiDeg + 0.5° and φ = loDeg − 0.5°, with the same cue speed. Each is labelled long-miss or short-miss by section 4.4's sign rule.
- A variant that scratches or pockets the OB scores `null`. Otherwise it scores `scorePosition(final, 'cue', ['ob']).score` from `src/eval/position.js`, the opponent's view, with the full kick lanes.
- **Labels [PROPOSED]:**
  - ≥ 70: "Safe miss"
  - 40–69: "Tough for them"
  - < 40: "Sells out"

## 5. Layout generation (seeded, `src/bankshot/deal.js`)

Built like `src/deal/families.js` and using its `mulberry32` / `hashSeed`. **[PROPOSED]**

- **Seeds.** `bankShotSeedFor(type, level, h)` = hh − (hh mod 9) + typeIdx + 3·levelIdx, with hh = h mod (2^31 − 18). `parseBankShotSeed` inverts it. Type order is cross-side, cross-corner, long. Level order is soft, medium, firm.
- **`dealBankShot(seed)`.** Returns a `BankShotDeal` or `null`, after at most 40 attempts from `mulberry32(seed)`. Each attempt runs these steps:
  1. **Draw the symmetry** t ∈ {0, 1, 2, 3}: flip x (x → W − x) if t & 1, flip y (y → H − y) if t & 2. The spec's rail and pocket are mapped with the balls.
  2. **Place the OB in the canonical frame:**
     - cross-side: rail y0, pocket 4; OB x ∈ [20, 46], y ∈ [10, 40]
     - cross-corner: rail y0, pocket 5; OB x ∈ [55, 88], y ∈ [8, 38]
     - long: rail x100, pocket 3; OB x ∈ [35, 70], y ∈ [8, 40]
  3. **Check the mirror line:**
     - The mirror contact u is at least 2R from every jaw and outside the side-pocket span [47.5 − 2R, 52.5 + 2R].
     - The OB is at least 6 in from the contact.
     - Cross-side only: the mirror line enters the side pocket within 40° of the pocket's `out` normal. The engine has jaw points but no pocket facings, so steeper entries would be accepted unrealistically.
  4. **Place the cue ball:** cue = G_m − d·(cos(φm + c), sin(φm + c)), with d ∈ [10, 30] in and cut c ∈ [−15°, 15°]. G_m is the ghost ball for the mirror direction.
  5. **Round** every coordinate to 0.01 in. Reject on `validateLayout`, or if the two centres are closer than 2R − 1e-6.
  6. **Accept** only if `solveLevel` for the seed's level gives a window ≥ 0.3° at ≤ 130 in/s.
- **Grid mode for Table.** Pass `{grid: 6.25}` to snap the OB and the cue ball to the half-diamond grid before validation. The cue ball is then placed in line (c = 0) at d = 12.5 in, and the window must be ≥ 0.5° so that real placement error (about ±1 in) is tolerated.
- **Session plan.** `bankShotSessionPlan(sessionSeed)` has 10 slots. Types are 4 cross-side, 3 cross-corner and 3 long. Levels are 3 soft, 4 medium and 3 firm. Types and levels are shuffled independently with `mulberry32(hashSeed(sessionSeed, 11))`.
- **Dealing a slot.**
  1. Slot i, attempt j (0…9) uses seed `bankShotSeedFor(type, level, hashSeed(sessionSeed, 200 + i, j) >>> 1)`.
  2. If all 10 attempts are null, it tries the next type in cyclic order with the same level, then the next level.
  3. The test requires every slot of 500 sessions to resolve.
- **Reroll.** Reroll r of slot i uses `hashSeed(sessionSeed, 200 + i, 100 + r)`. It keeps type and level and does not advance the session.

## 6. Study mode

### 6.1 Lessons and Bank Explorer

**Lessons [PROPOSED].** Short cards at `#/study/banking`. Each opens the Explorer with a preset. Every claim is tagged in the copy as "shown by the simulation" or "real-table rule, not simulated".

1. **Mirror reference.** Reflect the pocket across the line one ball-radius off the cushion, not the cushion nose. Sight it with diamonds. (simulated)
2. **Speed.** Soft runs long, firm runs short, and medium-firm is the most repeatable. (simulated)
3. **Distance to the rail.** A ball near the rail is still sliding and runs shorter. A far ball is rolling and runs longer. (simulated)
4. **Cushion compression.** Hard hits sink in and shorten the angle. Above firm speed the app shows no further change, and real tables vary. (simulated up to 130 in/s)
5. **Cut and spin.** An outside cut shortens the bank and an inside cut lengthens it. A little cue-ball side spin transfers to the OB. Neither is simulated, which is why drills keep cuts under 15°. (real-table rule)
6. **Types.** Cross-side (side-pocket entry angle limit), cross-corner, and long (end rail, length of the table). Equipment changes everything, which is why table calibration exists (T4). (mixed)
7. **Kiss and double-kiss.** On near-straight banks with the cue ball close, the OB comes back into the cue ball. Cut the bank slightly, or use draw or follow to move the cue ball off the line. (simulated, section 4.6)
8. **Bank safe.** Choose the speed so that a miss leaves the OB on the far side and the cue ball long. (simulated, section 4.7)

**Bank Explorer.**
- The player drags the OB and the cue ball, taps a pocket, then taps a rail.
- It shows:
  - the mirror line (grey, dashed)
  - the soft, medium and firm model lines (three colours, with a text legend)
  - each window as a band on the rail
  - readouts such as "Medium: 2.31 diamonds, 0.12 diamond long of mirror"
  - kiss flags per spin
  - on request ("Show miss leave"), the miss-leave labels
- Results update when a drag ends, never during it. They are computed in the worker. Soft appears first, then medium, then firm.

### 6.2 Drill: Read the Bank Shot

**Route.** `#/study/banking/drill`, with `?deal=<seed>` to replay a deal.

**One deal.**
1. **Show** the table, the cue ball, the OB, the ringed target pocket, the highlighted rail and a level badge: "Medium: would roll about 4 diamonds past the pocket".
   - The mirror line is hidden. "Show mirror" reveals it and marks the deal "mirror shown". There is no penalty.
2. **Mark the rail.** The player drags a marker along the rail, limited to its cushion span. There are nudges of ±0.1 and ±0.02 diamond (1.25 and 0.25 in) and a readout in diamonds.
3. **Shoot.** An OB-only sim launches the OB from its centre through the marked point at the level's solved speed. It animates and reports Made, or Missed long / Missed short (by the sign rule in section 4.4).
4. **Reveal:**
   - the window band, the centre tick and the mirror tick
   - "At medium this bank shot plays 0.14 diamond long of the mirror"
   - the kiss line, for example "Stun double-kisses; draw avoids it"
   - "Show miss leave"
5. Next deal. Retry replays the deal but does not change its recorded score.

**Scoring [PROPOSED].** g is the marked u. The window is [a, b], with centre c and mirror point m.

- **made** comes from the simulation in step 3. If the sim and the window disagree at an edge, the sim wins.
- **Miss distance** m_d is 0 if made, otherwise min(|g − a|, |g − b|) in inches.
- **Deal score** = 100 if made, otherwise round(60 · max(0, 1 − m_d / 2.5)). 2.5 in is 0.2 diamond.
- **Read call**, counted only when |devIn| ≥ 0.5 in: correct if sign(g − m) = sign(c − m) and g ≠ m.
- **Session** of 10 deals:
  - headline: the mean deal score, to one decimal
  - "Made n/10"
  - "Read the speed k/j"
  - the per-deal list
- The session is kept with `createSessionStore('bankshot-study', …)`. A refresh resumes it, and New session asks for confirmation.
- When `MODEL_CHECKED` is false, scores show as "Practice" and the copy says the model is unchecked (G2).

## 7. Table mode

Route `#/table/banking`. It follows §12's layout: a diagram on top and log buttons at least 64 px tall in thumb reach, with iPad side by side. Logging is one tap, with one-tap undo. The tally is saved after every log, New session asks for confirmation, and the wake lock is held.

**Placement without tapping [PROPOSED].**
- Every position is on the half-diamond grid. The text gives "(3, 2.5)", meaning 3 diamonds from the left short rail and 2.5 from the bottom long rail, as drawn. The diagram shows the diamond grid and labels the ends.
- The cue ball is "in line": the player sights cue ball, OB and target diamond.
- The diagram always shows the mirror line and the target diamond. The engine's line is shown only when `MODEL_CHECKED` is true. Until then, showing it at the table could teach an unchecked line.

**Drills** (setups in diamonds; cue ball 1 diamond behind the OB, in line, unless stated):

| Id | Drill | Setups (OB) | Level | Log buttons | Score |
|---|---|---|---|---|---|
| T1 | Cross-side ladder (rail y0 → side top) | (3.5, 3), (3, 3), (2.5, 2.5), (3, 2) | medium | Made / Long / Short / Kissed | makes / 20 (5 each) |
| T2 | Cross-corner ladder (y0 → corner (8, 4)) | (6, 2.5), (5.5, 2), (6.5, 1.5), (5, 3) | medium | same | makes / 20 |
| T3 | Long bank (end rail x100 → corner (0, 4)) | (4, 1.5), (3.5, 2), (5, 1), (4.5, 2.5) | firm | same | makes / 20 |
| T4 | Calibration: aim at the mirror diamond | cross-side (3, 2.5), cross-corner (6, 2), long (4, 1.5) | soft, medium and firm, 5 each | Made / Long / Short | 45 logs; feeds G2 |
| T5 | Double-kiss | (3.5, 0.75), cross-side, cue ball 0.5 diamond behind | medium | Made / Kissed / Missed | makes / 10 |
| T6 | Bank safe | (6, 1.5), cross-corner | soft | Made / Missed safe / Missed open | (made + missed safe) / 10 |

**Setup rules:**
- **Validation.** A test checks every fixed setup on the engine: window ≥ 0.5° at its level, ≤ 130 in/s, and for T5 a stun kiss.
- **Substitution.** If a setup fails, the builder moves the OB by half-diamond steps in this order: +x, −x, +y, −y, then the four diagonals. The first position that passes replaces it, and the change is reported.
- **Random.** T1–T3 also offer "Random setup" (grid mode, section 5), seeded and shown with its seed.

**Labels and readouts:**
- **Long and Short** are drawn as arrows on the diagram at the pocket. Long is past the pocket on the side away from the OB's start.
- **"Missed safe"** has a copy definition: the opponent has no shot with a cut under 45° and no clear path.
- **Bias line [PROPOSED].** After at least 4 misses at a level, if one side has ≥ 75% of them: "You miss long at medium (5 of 6 misses). Your table may play long."
- **T4 summary.** Shows the 9-cell table (observed majority against the engine prediction) and PASS/FAIL against G2.

## 8. Architecture [PROPOSED; file names BUILDER except where fixed]

- `src/bankshot/model.js`: pure (sections 4.1–4.7). It imports `src/engine/*`, `src/eval/position.js` and `src/geometry/clearance.js` read-only.
- `src/bankshot/deal.js`: pure (section 5). `src/bankshot/score.js`: pure (sections 6.2 and 7). `src/bankshot/config.js`: `MODEL_CHECKED`.
- `src/bankshot/worker.js` and `src/bankshot/client.js` follow the `src/search/client.js` pattern. Requests: `deal(sessionSeed, slot, used)`, `reroll`, `byId(seed)`, `answer(deal)`, `explore(layout, spec)` (streams soft, medium, firm), `missLeave(deal, level)`, `tableSetup(drillId, seed?)`.
  - It is a separate worker from the safety search worker, so neither queues behind the other.
  - The next deal is prepared while the player works on the current one.
- `src/study/banking/*` and `src/table/banking/*` hold the UI. They reuse the Plan 1b kit: renderer, drag, nudges, animation player, router, session store and wake lock.
- Every new shipped file goes into `src/precache.js`, and the hash is restamped (§13).

## 9. Testing and success criteria

- **G1** fixtures BF1–BF7 pass (section 3.3). The safety-bank rebuild passes `RUNOUT_FULL=1`.
- **Model unit tests:**
  - `mirrorAim` reflects correctly for all 4 rails.
  - `windowAt` is deterministic, and its edges are within 0.01° of a 0.01° brute-force scan on 5 fixed shots.
  - devIn and read signs are correct on 4 hand-built cases (each type plus a flipped case).
  - The kiss check finds a stun double-kiss on the T5 setup, and none for draw.
- **Generator:**
  - For 300 seeds per type × level, ≥ 90% are non-null.
  - Every non-null deal re-solves to its stored level with a window ≥ 0.3°.
  - Every deal passes `validateLayout` and has a cut ≤ 15°.
  - The same seed gives the same deal.
  - 500 session plans resolve all 10 slots with no repeats.
- **Scoring:** deal-score formula fixtures (made → 100; m_d = 1.25 in → 30; m_d ≥ 2.5 → 0), read-call cases, and T4 G2 pass/fail cases including a tie.
- **Hash safety:** a test asserts that no file under `src/bankshot/` is inside the hashed set.
- **Performance** (node desktop, max over 50 sampled deals) [PROPOSED]:
  - `answer` (one level plus kiss check) ≤ 600 ms
  - `explore` (3 levels plus kiss) ≤ 1.5 s
  - no main-thread task > 50 ms
  - The device check goes on the owner checklist. Prefetch must make the wait after Next 0 ms in normal play.
- **Owner:** G2 run with T4. Table placement of every fixed setup takes under 30 s, with no tapping beyond the log buttons.

## 10. Non-goals and anti-goals

- **Non-goals:**
  - multi-rail banks, kick-banks and banks with blockers
  - throw, CIS and spin transfer
  - a scored bank-or-safe decision (that belongs to the Two-way trainer)
  - long-term tracking
  - any per-table constant fitted from T4 (T4 only checks the engine)
- **Anti-goals (count as failure):**
  - teaching the mirror as the answer
  - showing an unchecked engine line at the table as the answer
  - a deal with no makeable line
  - a Banking change that silently invalidates the safety bank
  - a UI freeze during solving

## 11. Staging, size, dependencies

- **B0.** E1 + E2, G1 and the amended Stage 1 tests, then the safety-bank rebuild (shared with module-ports M1) and the owner coverage review. About 5 tasks. Depends on owner questions 1, 2 and 8. Blocks Execute the Close too, which wants E2 for cue-ball rail play.
- **B1.** `model.js`, `deal.js`, `score.js` and the worker/client, with tests. About 6 tasks.
- **B2.** Table drills T1–T6. The owner runs G2. About 4 tasks. Needs the Plan 1b Table shell.
- **B3.** Study lessons, Explorer and drill. About 5 tasks. Needs the Plan 1b UI kit. Scoring turns on when G2 passes.

**Size:** about 20 tasks. Depends on Stage 1b (UI kit, router, Table shell).

## 12. Open questions for the owner

1. **Approve E2 (the cushion removes 75% of into-rail roll) and the 4 test amendments?** Default: yes. If no, only E1 ships. Bank shots then need 80+ in/s for cross-side and 130 for long, and slow banks run up to 20° long, so G2 will probably fail and the Study drill stays "Practice".
2. **Accept one safety-bank rebuild (about 2 h) and a new coverage review now?** Default: yes, bundled with any other pending rebuild. If no, Banking waits. Without E1 the known limitation stays in the band that firm banks use.
3. **Is G2 (7 of 9 cells, no opposite cell) the right bar for turning on scoring and the Table model line?** Default: yes. A stricter bar (9/9) makes a retune and rebuild more likely. A looser one risks false lessons.
4. **Speed levels as "rolls 1, 4 or 12 diamonds past the pocket"?** Default: yes. Fixed in/s values would be simpler to compute but have no meaning at the table.
5. **Cut limit of 15° in Study deals (because CIS and throw are not simulated)?** Default: yes. Raising it gives more variety, but the model answer omits a real effect.
6. **Partial credit for a near miss (up to 60 points within 0.2 diamond)?** Default: yes. Make-or-miss only (0 or 100) is harsher and noisier over 10 deals.
7. **Mirror line hidden by default in the drill?** Default: hidden, with a free reveal. Shown by default would practise only the adjustment, not the mirror construction.
8. **One shared rebuild for Banking B0 and module-ports M1?** Default: yes, B0 joins M1's branch. If M1 is blocked on owner answers and B0 goes alone, that is two rebuilds and two coverage reviews.
