# Two-way Shot Trainer: design

Date: 2026-11-25. Status: draft for owner review. New-drill priority 4 (owner, 2026-11-25).

Tags follow the Stage 1 spec (`docs/superpowers/specs/2026-11-24-runout-lab-rebuild-design.md`, "the main spec"): **[OWNER]**, **[PROPOSED]**, **[BUILDER]**.

The main spec lists two-way shots as a Stage 1 non-goal, "a later trainer" (§4). This is that trainer.

It reuses three shared modules defined in the Safety Battle spec (`2026-11-25-safety-battle-design.md`, §8): `src/play/execution.js`, `src/deal/stream.js` and `src/play/describe.js`.

## 1. Intent and why

A two-way shot is a pot attempt played so that a miss still leaves the opponent safe. It ties both of the main spec's aims together (§1). The player who stalls on the last balls often has a choice between three plays:

- a low-percentage pot that sells out on a miss
- a pure safety
- a two-way shot that does both

The trainer teaches the player to see that choice and value it. The value combines the chance of making the ball with how good the leave is when the ball is missed.

The legacy app only gestures at this. The Run or Safe? card "the 9 is buried" recommends a "Two-way safe" (legacy lines 1693–1697). Escape Trainer's top verdict is "Two-way escape" (line 1236). Neither computes anything.

## 2. The model [PROPOSED]

### 2.1 Shot value

For a pot candidate c (legal ball, pocket, speed, spin) at execution level L:

- **Aim.** The aim is automatic: the ghost-ball aim at the pocket centre (`POCKETS[k]`, the mouth midpoint).
  - G = T − 2R·u, where u is the unit vector from the target's centre T to the pocket centre.
  - `aimDeg = atan2(G − cue)`.
  - The engine has no throw (main spec §9), so this is exactly the aim that sends the OB at the pocket centre. The trainer teaches choice of shot, not fine aim.
- **Execution samples.** Deterministic quadrature, no PRNG.
  - Aim offsets are zₐ · aimSd for zₐ ∈ linspace(−2.5, 2.5, 11), with weights ∝ exp(−zₐ²/2), normalised.
  - Speed factors are (1 + zᵥ · speedSd) for zᵥ ∈ {−√3, 0, √3}, with weights {1/6, 2/3, 1/6} (3-point Gauss–Hermite).
  - That gives 33 samples, and each sample's weight is the product of its two weights. Spin is not perturbed.
  - The level's `aimSd` and `speedSd` come from `EXECUTION_LEVELS`.
- **Make.** A sample is a make if `firstContactId` is the target, the target is in `pocketed`, and there is no scratch. Any pocket counts.
- **Miss.** Every other sample is a miss:
  - If `gateFor` returns `scratch`, `wrong-ball-first` or `no-rail`, the miss is a Foul with leave score 0.
  - Otherwise the leave score is S = `scorePosition(final, cueId, opponentTargets(rules, final, cueId)).score` with full kick lanes. A non-target ball dropping on a miss counts as a Foul for this purpose.
- **Values.**
  - P = Σ w over makes.
  - Q = (Σ w·S over misses) / (Σ w over misses). Q = 0 if there are no misses.
  - **V = 100·P + (1 − P)·Q.** A make counts as 100 ("keeps the table").
- **Miss breakdown** (weights, normalised over misses):
  - Safe: S ≥ 70
  - Tough: 30 ≤ S < 70
  - Open: S < 30
  - Foul

### 2.2 The three options

Every trainer layout offers exactly three options:

- **Pot (A).** Among the fully evaluated candidates, the one with the highest P. Ties go to the higher V, then the lower candidate index.
- **Two-way (B).** Among the fully evaluated candidates other than A, the one with the highest V, subject to Q ≥ 50 and P ≥ 0.2.
- **Safe (C).** The safety bank entry's stored best shot, with P = 0 and Q = V = `best.score.total`. Its breakdown is the nine robustness scores (`best.score.robustness.scores`), each weighted 1/9 and split with the same S thresholds. A gated variant scores 0 and counts as Foul.

The layout's **type** is the kind of option with the highest V. Ties are broken in the order two-way, safe, pot.

## 3. Building the two-way set offline [PROPOSED]

The search is too heavy for the device. A full evaluation needs up to 33 simulations plus up to 33 full kick-lane sweeps of about 60 ms each (measured 2026-11-25). So, as with the safety layout bank (main spec §11), the trainer deals from a set validated offline.

**Builder.** `scripts/build-two-way.js`, not shipped, writes `data/two-way-set.json`. It is shipped and precached (main spec §13).

**Source.** Safety bank entries from families 1, 2, 3, 7 and 8, in file order. Family 6 is excluded because 8-ball group pots need group-aware options.

**Candidates.** For each legal ball T and each pocket k, a candidate needs all of these:
- the cut is ≤ 75°
- `clearance(T, pocket) ≥ 0` and `clearance(cue, G) ≥ 0`, excluding the cue and T
- for side pockets, the approach is within 60° of the pocket's outward axis

These are the same gates as `directThreat` in `src/eval/position.js`.

Each feasible (T, k) pair is crossed with:
- speeds [22, 30, 40, 52, 66, 84, 106] in/s
- spins [(0, 0.8), (0, 0), (0, −0.8)], vertical only (section 7)

Candidates are indexed in loop order: T, then k, then speed, then spin.

**Stage A (cheap).**
- The 11 aim samples at the nominal speed only.
- S on misses comes from `scorePosition(…, {cheap: true})`.
- The result is P_cheap, Q_cheap and V_cheap.

**Stage B (full).**
- Take the union of the top 6 candidates by V_cheap and the top 3 by P_cheap (ties to the lower index).
- Score each with the full 33-sample model (section 2.1) at level `strong`.
- Memoise kick lanes by exact final positions, as R27b does.

**Acceptance.** An entry is accepted only if all of these hold:
- options A and B both exist
- A.P ≥ 0.30
- max(V) − min(V) over A, B and C is at least 10 points

**Size.** Each type has a target of 100 entries and a cap of 150. A full type skips further entries of that type. The build stops when the source runs out.

**Report.** The builder prints count, target and shortfall per type, plus `SHORTFALL type T: n/100` lines and the elapsed time. Shortfalls go to the owner, and nothing is tuned to fill them (main spec §11).

**Determinism.** The builder runs in parallel over `worker_threads` and accepts in source order, as the bank builder does (main spec §11).

**File.**
```
{ "v": 1, "hash": "<sha256>", "safetyBankHash": "<sha256>", "level": "strong",
  "params": { "families": [1,2,3,7,8], "target": 100, "cap": 150 },
  "coverage": [ { "type": "two-way", "count": 0 } ],
  "entries": [ { "id": 0, "type": "two-way", "layout": Layout,
                 "options": [ { "kind": "pot"|"two-way"|"safe", "shot": Shot, "target": "ob", "pocket": 5|null,
                                "P": 0.55, "Q": 74.2, "V": 88.4,
                                "miss": { "safe": 0.6, "tough": 0.3, "open": 0.1, "foul": 0 } } ] } ] }
```

- `id` is the safety bank entry id. `options` is always in the order pot, two-way, safe.
- `hash` is the SHA-256, using the same framing as `scripts/model-hash.js`, over the model-hash file set plus every file under `src/twoway/` and `src/play/execution.js`.
- `safetyBankHash` is the SHA-256 of the bytes of `data/safety-bank.json`.
- A stale `hash` or `safetyBankHash` fails a test until the set is rebuilt.

## 4. Study mode [PROPOSED]

Route: `#/study/two-way`.

**Session.** 10 deals. The type plan is 5 two-way, 3 safe and 2 pot, shuffled with `mulberry32(hashSeed(sessionSeed, 11))`.

**Picking a deal.** Slot i picks with `entryStream(entriesOfType, sessionSeed, 400 + typeIndex)` (two-way 0, safe 1, pot 2), excluding entries already used in the session. If a type is exhausted, the slot uses the next type in the order two-way, safe, pot.

**Deal screen.** The layout, plus three option cards in a seeded order (`shuffle` with `hashSeed(sessionSeed, 500 + i)`). Each card has a line on the diagram and words from `describeShot`, plus the pocket name. Examples:
- "Pot the 2 in the foot-right corner · firm · draw"
- "Safe: half-ball on the 2, cut right · soft · centre"

Pocket names, as seen from the head end:
| Pocket | Name |
|---|---|
| 0 | head-left corner |
| 1 | left side |
| 2 | foot-left corner |
| 3 | head-right corner |
| 4 | right side |
| 5 | foot-right corner |

**Choose.** One tap picks an option. The reveal shows:
- P, Q, V and the miss breakdown for all three options, with the best one marked
- an animation of the chosen option's nominal sample, which is the make for pot options and the shot itself for safe
- for pot and two-way options, the "typical miss": the miss sample with the largest weight, ties to the smaller |zₐ| and then negative zₐ first. It is simulated on the device.

**Score.** Deal score = round(100 × V_chosen / V_max). Session score = the mean of the deal scores. Both are shown live.

**Retry / Next.** Retry repeats the deal. Next advances.

**URL.** `#/study/two-way?deal=<id>` opens one entry. An unknown id shows "That layout isn't in this version" and deals normally.

**Nice-to-have: "Your own shot".**
- The player taps a pocket (hit area ≥ 44 px) and sets speed and vertical spin. The aim is automatic.
- The worker runs the full section 2.1 evaluation and shows P, Q, V next to the three options.
- Budget ≤ 2.5 s in node on desktop. It runs in the worker and never blocks the UI.

## 5. Table mode [PROPOSED]

Route: `#/table/two-way`.

**Deals.** Entries of type two-way only, from families 1, 2, 3 and 8 (at most 5 balls). They are picked with `entryStream(…, sessionSeed, 410)`. A session is 10 positions.

**Card.** The placement diagram shows:
- option B's line and words, for example "Pot the ob in the right side · medium · draw"
- the predicted make percentage and the miss-safe percentage
- the typical-miss leave drawn faintly, so the player knows where a miss should end up

**Log.** One tap on a button at least 64 px tall:
- "Made it" (100)
- "Missed, left them safe" (70)
- "Missed, left a shot" (10)
- "Foul" (0)

Undo removes the last log. "Safe" means the player judges the opponent has no easy pot.

**Score.** Session score = round(mean of points). The summary also compares the app's average predicted P over the logged positions with the player's real make rate, for example "App 52%, you 4/10". It is shown, not scored.

**Storage and screen.** Session store and wake lock follow main spec §12.

## 6. Reuse and new modules

**Reused:**
- `simulate`
- `POCKETS`
- `clearance`
- `gateFor`, `opponentTargets`, `scorePosition` and the cheap path (mirror lanes) for Stage A only
- `EXECUTION_LEVELS`, `entryStream`, `describeShot`, `shuffle`, `hashSeed`
- Plan 1b UI pieces
- the worker's bank loader, extended to load `data/two-way-set.json` on a `twoWay*` message

**New pure modules [file names BUILDER]:**

- **`src/twoway/candidates.js`**: `potCandidates(layout) -> {target, pocket, shot}[]` (section 3).
- **`src/twoway/value.js`**:
  - `evaluatePot(layout, candidate, level, {cheap}) -> {P, Q, V, miss, typicalMiss: Shot|null}`
  - `safeOption(entry) -> {P: 0, Q, V, miss}`
- **`src/twoway/build.js`**: Stage A/B and acceptance, called by the builder script.
- **`src/twoway/plan.js`**: the type plan and slot picking (section 4).

**Worker messages:**
- `{type: 'twoWayDeal', sessionSeed, slot, usedIds}`
- `{type: 'twoWayById', id}`
- `{type: 'twoWayEval', layout, candidate}` (nice-to-have)

## 7. Physics and engine requirements and risks

**Must fix first: pocket acceptance.**

P_make is only as good as the pocket model. The engine captures a ball once its centre crosses the mouth line, and the jaws are single points (`src/engine/table.js`, `simulate.js`). Measured on 2026-11-25:
- Method: a lone ball launched from 30 in out, along approach angle a from the pocket axis.
- Effective target width = the accepted angular window × 30 in.

| Corner | 30 in/s | 60 in/s | 120 in/s |
|---|---|---|---|
| a = 0° | 3.75 in | 2.82 | 2.90 |
| a = 15° | 4.49 | 2.89 | 3.24 |
| a = 30° | 4.57 | 4.21 | 3.60 |
| a = 40° | 4.42 | 4.30 | 4.75 |

| Side | 30 in/s | 60 in/s | 120 in/s |
|---|---|---|---|
| a = 0° | 3.58 | 3.85 | 5.06 |
| a = 30° | 2.91 | 2.92 | 5.44 |
| a = 45° | 2.13 | 3.16 | 4.27 |

The rule of thumb is that effective size is about the mouth minus 2 in: about 2.5 in for the 4.5 in corner and 3.0 in for the 5.0 in side. Real pockets also shrink for fast shots (Alciatore, TP 3.5–3.8; see sources). The engine is 0.3–2.3 in too generous, and at the side pocket it grows with speed, which is backwards. Shipping P_make on this model would teach "hit it firmer, it still drops", a false lesson.

**Proposed pocket model [PROPOSED; constants BUILDER within the ranges given]:**
- Each jaw gets a straight facing segment that runs into the pocket at the WPA cut angle, measured between the cushion nose line and the facing: 142° for corners and 104° for sides.
- Facings rebound through `cushionRebound`, the same speed-dependent response as the rails.
- Capture happens when the ball's centre crosses a drop line behind the mouth line, at shelf depth. Use 1.5 in for corners, inside the WPA range of 1–2.25 in, and 0.25 in for sides, inside 0–0.375 in.
- A ball resting between the mouth line and the drop line is on the table. `validateLayout` must accept it.

**Pocket tests (PK).** Same harness as above, at launch speeds of 30 (slow), 60 and 120 in/s from 30 in. Each is a `node --test` case.
- PK1: corner, a = 0°, slow: 2.2–2.9 in.
- PK2: corner, a ∈ {0°, 15°, 30°}: the size at 120 is at most the size at slow minus 0.3 in.
- PK3: corner, a = 40°, slow: 3.0–4.0 in, and at least the a = 0° slow size. Rail-side shots are bigger at slow speed (TP 3.6).
- PK4: side, a = 0°, slow: 2.6–3.4 in. Side, a = 45°, slow: at most side a = 0° slow minus 0.5 in. Side at 120 is at most side slow, at every a.
- PK5: the existing pocket and scratch tests still pass, or are updated only where a test asserted the old mouth-line capture.

The builder also writes the TP 3.6–3.8 reference values for 4.5 in and 5.0 in mouths into the test file as a report-only comparison. If PK1–PK4 cannot all pass, stop and report the measured table. Do not tune the bands.

**Cost of the fix.** The pocket model lives under `src/engine/`, so it changes `modelHash` and forces a safety bank rebuild (about 1 h 40 min), plus a fresh coverage report for the owner (main spec §18.4). Some bank shots will change outcome.

**Bundle it.** Bundle the fix into one model-change window with:
- the cushion smoothness fix above about 150 in/s (acceptance checklist, Known limitations)
- Banking's E2 cushion roll-loss fix (Banking spec, §3; Speed-window spec, §9.1). Today a rolling ball comes off a rail at about 0.33 of its impact speed, against a published figure of about half. The fix changes how far a missed object ball travels off a rail, which feeds Q.
- any physics changes from the Banking spec, which needs pocket acceptance for bank shots too
- the engine tune parameter from the Speed-window spec

One rebuild then covers all of them. If Banking lands a pocket model that already passes PK1–PK4, Two-way adds only the tests.

**Other risks:**
- **Throw** is not modelled. Aim is automatic and centred on the engine's pot line, so throw would only shift where the correct aim lies, not how wide the make window is. The trainer never asks the player to aim.
- **Squirt and swerve** are not modelled, so candidates use vertical spin only. Side english would be credited with accuracy it does not have.
- **Speeds.** Candidates stop at 106 in/s, and with √3·speedSd the samples reach about 116, which stays clear of the region above 150.
- **Distance safeties.** Q inherits the distance-safety blind spot (main spec §11, families 4 and 5): a miss that leaves the OB long and frozen scores low, so "lag-style" two-ways are undervalued. When the Backlog's distance-safety update lands, the two-way set must be rebuilt, because its `hash` covers `src/eval`.

## 8. Testing and success criteria

1. **PK1–PK5 pass** (section 7). This blocks everything else.
2. **Quadrature accuracy.** On 30 candidates, the first 10 accepted entries' A, B and the next-best candidate, the 33-sample P is within ±0.05 of a 201 × 9 reference grid (zₐ step 0.025, 9-point Gauss–Hermite in speed). The 33-sample Q is within ±5 points of the reference.
3. **Re-validation.** For every entry, `evaluatePot` and `safeOption` reproduce the stored P, Q and V exactly. `npm test` checks the first 3 entries of each type, and `RUNOUT_FULL=1` checks all of them.
4. **Integrity.**
   - Ids are unique and present in the safety bank.
   - Options come in the order pot, two-way, safe.
   - B has Q ≥ 50 and P ≥ 0.2, and A has P ≥ 0.3.
   - The spread of V over the three options is at least 10.
   - `hash` and `safetyBankHash` are current.
5. **Coverage.** The test prints counts per type. It fails only if a type has fewer than 5 entries, the minimum for a session plan without repeats. Shortfalls below 100 are reported to the owner.
6. **Determinism.** The same build inputs give a byte-identical file at any `--jobs` value. The same session seed gives the same 10 ids and option orders, checked over 500 seeds.
7. **Study is instant.** Choosing an option shows the reveal values within 100 ms, because they are precomputed. The typical-miss simulation takes ≤ 50 ms on the main thread, or it runs in the worker.
8. **Nice-to-have budget.** "Your own shot" evaluation p95 ≤ 2.5 s in node on desktop, over 20 shots.
9. **Offline.** A Two-way Study session plays in airplane mode after one online visit, because the set is precached.

## 9. Non-goals and anti-goals

**Non-goals:**
- Position play after a make. The value of a make is a flat 100.
- Banks, combos and caroms as pot candidates. The Banking drill covers banks.
- Call-pocket fouls, since any pocket counts.
- 8-ball groups (family 6).
- Side english in candidates.
- Long-term make-rate tracking.

**Anti-goals:**
- Showing make percentages from a pocket model that fails PK1–PK4.
- A "best option" that only beats the others by rounding. That is why the 10-point spread is required.

## 10. Size and dependencies

**Size:** about 14 tasks.
- pocket model and PK tests
- bank rebuild and owner coverage review, inside the bundled model-change window
- candidates and value
- the two-way set builder and its report
- set file tests
- worker messages
- Study UI
- Table UI
- nice-to-have free shot
- owner checklist items

**Depends on:**
- the model-change window (section 7)
- the rebuilt safety bank, because the set is built from it
- the Safety Battle shared modules (`execution.js`, `stream.js`, `describe.js`)
- Stage 1b UI

## 11. Open questions for the owner

1. **Fix the pocket model before this trainer ships?** Default: yes, inside one bundled model-change window, which costs one safety bank rebuild plus a new coverage review. If no, the trainer must label P "optimistic". This is not recommended, because it teaches hitting harder.
2. **Value of a make.** Default: 100 (keeps the table). A lower value, for example 85, favours safeties and two-ways more often and changes the type mix in the built set.
3. **Execution level for the set.** Default: Strong only. Building all three levels lets you pick your level, but triples build time and file size.
4. **Must-have Study interaction.** Default: choose one of three options. Free choice of pocket, speed and spin as the main mode is slower (about 2 s per evaluation) and harder to score fairly.
5. **Session type mix.** Default: 5 two-way, 3 safe, 2 pot. More safe and pot deals teach "two-way isn't always right" more strongly.
6. **Family 6 (8-ball).** Default: excluded. Including it needs pots on any group ball and group-aware leaves.

## Sources

- [Dr. Dave Alciatore, technical proofs TP 3.5 (effective target size notation)](https://billiards.colostate.edu/technical_proofs/TP_3-5.pdf), [TP 3.7](https://billiards.colostate.edu/technical_proofs/TP_3-7.pdf), [TP 3.8](https://billiards.colostate.edu/technical_proofs/TP_3-8.pdf)
- [Dr. Dave FAQ: pocket size standards](https://drdavepoolinfo.com/FAQ/pocket/size-and-center/)
- [WPA table and equipment specs as quoted by poolroom.com (mouth widths, shelf depths)](https://www.poolroom.com/tournament-table-equipment-specifications/)
- [AZBilliards forum: WPA facing angles 142° corner and 104° side](https://forums.azbilliards.com/posts/8495705/)
