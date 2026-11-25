# Runout Lab: module ports and distance-safety update (design)

Date: 2026-11-25. Status: draft for owner review.

Tags follow the main spec (`2026-11-24-runout-lab-rebuild-design.md`): **[OWNER]**, **[PROPOSED]**, **[BUILDER]**. "§N" means a main-spec section. Line numbers refer to `legacy/index.html`. Stage 1b (`2026-11-25-stage1b-ui-design.md`) is assumed done; its shell, renderer, controls, player and worker `simulate`/`score` messages are reused everywhere below.

## 1. Intent and why

The legacy modules still run on the old two-ball "range" physics (lines 633–687), which teaches false lessons (§5), and each has known scoring bugs (§17). Porting them onto the tested engine finishes §16 "Later stages" items 1 and 2, so the whole app serves the two goals in §1: closing racks (Position Lab, The Closer, the closing Table drills) and winning safety battles (Escape Trainer, Run or Safe?, the safety and kick Table drills). The distance-safety update makes length-of-table and thin-cut safeties score fairly, so families 4 and 5 can join Safety Studio. When every module is ported, `legacy/` is retired.

## 2. Rules for every port [PROPOSED]

1. **Model-hash boundary.** `modelHash` covers every file under `src/engine/`, `src/geometry/`, `src/eval/`, plus `src/search/grid.js` and `src/search/search.js` (R36). Any change there forces a bank rebuild. Only M1 is allowed to touch those paths. New pure modules for the other ports go under `src/study/<module>/`, `src/table/`, `src/deal/` (new files only; `families.js`, `prng.js` and `fixed.js` are in the build hash) or `src/search/` (new files only).
2. **Determinism.** Pure modules never use `Math.random`, `Date`, DOM or `performance` (Stage 1a GC5). Random setups use `mulberry32`/`hashSeed` from `src/deal/prng.js`, seeded from a session seed made by `crypto.getRandomValues(new Uint32Array(1))[0] >>> 1` in the screen glue. Every deal is replayable by URL.
3. **Main thread.** Every `simulate`, scoring or search call runs in the search worker. Only `visibility`, `firstBallOnRay`, `clearance`, `validateLayout` and plain geometry may run on the main thread.
4. **Session-only scoring.** Each module keeps one session in `createSessionStore('<module>', null)`, saved after every change, cleared by **New session** with `window.confirm`. No history, no trends, no export (§2, §4).
5. **Shared UI.** Aim handle and nudges, spin pad, speed control (8–130 in/s), animation player, update banner and table renderer come from Stage 1b. No module ships its own copy (the legacy app has three spin pads: lines 1134, 1285 and 1662).
6. **Speed cap.** No user or model shot faster than 130 in/s. Robustness variants may reach 135.2 in/s (R35).
7. **Navigation.** Each port changes its header link and Study-list card from `legacy/index.html#<tab>` to its new route in the same commit, so §15 continuity ("every unported module is one tap from the new home") holds after every merge.
8. **Copy.** Intros are at most two sentences (Stage 1b section 4). Legacy teaching text is kept where the engine agrees with it and rewritten where it does not; each module below lists the rewrites.
9. **Per-port checks.** Every port adds its route to the Lighthouse accessibility check (≥ 90), lists its files in `src/precache.js`, stamps, and passes `npm test`.

## 3. Port order [PROPOSED]

| # | Port | Depends on | Why here |
|---|---|---|---|
| M1 | Distance-safety update, families 4 and 5, bank rebuild | Stage 1b | Changes the scoring model. Escape Trainer, Run or Safe? and the hide drill all score positions with it, so it lands first and the bank is rebuilt once. It also absorbs the easy-band fix (Stage 1b open question 3). |
| M2 | Diagnosis | Stage 1b | Static text. One task. Removes the "log + track" promise that contradicts §2. |
| M3 | Escape Trainer | M1 | Most §17 bugs. Reuses Safety Studio's screen almost whole. Uses bank positions as puzzles. |
| M4 | Run or Safe? | M1 | Reuses Safety Studio scoring for the "safe" call. |
| M5 | Position Lab | Stage 1b | The worst false lesson (a made-up draw formula, lines 734–744). Needs a contact-state helper. |
| M6 | The Closer | Stage 1b | Needs the route search in the worker. Provides the layout generator M7 reuses. |
| M7 | Table Drills (Table mode) | M1, M6 | Uses the bank for the hide drill and the Closer generator for the closing drills. |
| M8 | Retire `legacy/` | M1–M7 | Only when every module above is accepted. |

M2 and M5 do not depend on M1 and may move earlier if M1 waits on an owner answer.

## 4. M1: distance-safety update, families 4 and 5, bank rebuild

**Problem.** §10 credits distance only through the direct-threat term D, so a visible object ball scores at most 14 even when the opponent faces a long, frozen-ball shot (§11, §17). Families 4 (thin cut, OB long to a rail) and 5 (length-of-table lag) were deferred for this reason.

**New term [PROPOSED].** For each opponent target t with visibility v_t > 0, with c the cue ball:

- d_t = |c − t| (centre distance, in).
- L_t = clamp((d_t − 30) / 50, 0, 1): no credit at 30 in or closer, full credit at 80 in or more.
- railD_t = max(0, min(t.x − R, W − R − t.x, t.y − R, H − R − t.y)).
- F_t = clamp(1 − railD_t / (2R), 0, 1): 1 when the object ball is frozen to a cushion, 0 at 2.25 in off.
- T_t = v_t · L_t · (0.5 + 0.5 · F_t).

T = the minimum of T_t over targets with v_t > 0 (the opponent picks the easiest visible ball); T = 0 when no target is visible. Each run's score becomes:

100 · clamp(0.62·H + 0.25·K·H + 0.20·Q − 0.60·D + 0.60·T, 0, 1)

All other §10 parts (gates, V, D, K, Q, the 3 × 3 robustness grid, the mean of nine runs) are unchanged.

**Code changes (inside the hash, so they force the rebuild).**

- `src/eval/position.js`: new export `distanceCredit(cue, target, v): number`; `combineScore({V, D, K, Q, T})`; `scorePosition` computes T and returns it.
- `src/eval/safety.js`: `positionVDQ` returns T; the `Variant` typedef gains `T`; `optimisticTotal` and `finishSafety` pass T. T does not depend on kick lanes, so `optimisticTotal` stays an upper bound and branch-and-bound stays result-preserving (R27).
- `src/types.js`: `SafetyScore` gains `distanceCredit: number` (the nominal run's T).
- `src/deal/families.js`: `ACTIVE_FAMILIES = [1, 2, 3, 4, 5, 6, 7, 8]`.
- `src/deal/bank.js`: `dealSlot`'s fallthrough loop uses `ACTIVE_FAMILIES.length` instead of the hard-coded 6 (both the loop bound and the modulus). This is a bug once there are 8 families.
- Stage 1b's score panel adds the row `Distance credit: <round(distanceCredit·100)>%` when V > 0 (`src/study/safety-copy.js`).

**Fixtures.** §10 fixtures F1–F5 must still pass unchanged. Each is unaffected by construction (F1, F2: V = 0; F3: d = 30; F4: d = 18.4). New fixtures, with predicted values in brackets, use `scorePosition`:

- **F6 lag.** Cue (R, 25), OB (100 − R, 25), no other balls: ≥ 70 [74.0].
- **F7 long open ball near a pocket.** Cue (10, 25), OB (95, 45): ≤ 30 [17.3].
- **F8 thin-cut leave.** Cue (40, 25), OB (100 − R, 10): 20–45 [28.5].
- **F9 ordering.** F8's score is greater than F7's.

If a measured fixture leaves its band, stop and report the numbers. Do not retune the weights or the ramp (§10 rule).

**One change set with Banking B0 [PROPOSED].** The Banking spec (`2026-11-25-banking-design.md` §3) owns the cushion work: E1 (`CUSHION.E_MIN` = 0.794, which removes the known non-smooth rebound) and E2 (`CUSHION.ROLL_LOSS` = 0.75, pending owner approval), checked by its fixtures BF1–BF7. Both M1 and Banking B0 change hashed files and force a rebuild. They are one change set with one rebuild: whichever is scheduled first carries the other's engine and eval changes (E2 only if the owner approved it), and the §10 fixtures F1–F9 and Banking's BF fixtures must all pass before the build starts.

**Family 4 and 5 sample gate.** Before the full build, run the builder's search on the first 200 non-null layouts per band for families 4 and 5 and print the valid share (best ≥ 70). If a family's valid share is below 5% in all three bands, stop and report to the owner before building.

**Rebuild.** `node scripts/build-bank.js` with today's parameters (cap = target = 100 per cell, R32; 130 in/s; 3 h per-family cap, R31). The layout limit stays 2,000 non-null per family, unless the owner chose "rebuild with a higher layout limit" for the easy band, in which case it is 6,000. The coverage report, shortfall lines, stop lines and file size go to the owner, as in checklist §7. File size above 1.5 MB is reported, not a failure (R32; 8 families can reach about 1.9 MB).

**Spec amendment.** When M1 merges, §10's formula, §11's family list and §17 are amended, with a §21 entry.

**Acceptance.**

- F1–F9 pass. Bank integrity, coverage and re-validation tests pass (2 per cell in `npm test`; every entry and example with `RUNOUT_FULL=1`).
- 500-seed session test passes with 8 active families: 3/4/3, no repeats, deterministic.
- The bench is re-run and the seeded Suggest, hint replay and score round-trip numbers are recorded in the checklist.
- The owner has the coverage report, including a before/after band count per family, because the new term raises cheap scores for long open leaves and can move layouts between bands.

## 5. M2: Diagnosis

Legacy lines 181–233. Route `#/study/diagnosis`. Static; no engine, no scoring.

- Port the hero, the two leak panels and the "closing mindset" panel as written.
- The "what each tab trains" grid becomes links to the new routes (legacy links while a module is unported).
- Rewrites: the Table Drills card says `Eight drills to run at a real table, with one-tap logging for the session.` (legacy promises a log that tracks improvement, line 221, which contradicts §2). The safety bullet "three ingredients … distance + a blocker + the cue ball frozen" (line 206) becomes `Hide the object ball first. Then add distance and put the cue ball on a rail.`, matching the scoring order (hook weight 0.62, distance credit 0.60, rail 0.20).
- Escape card copy drops "calculator" (§17).

**Table mode:** none. Diagnosis is reading material.

**Acceptance:** route renders with one `<h1>`; every card link resolves; site test asserts the removed phrases (`track real improvement`, `calculator`) are absent from shipped HTML and JS.

## 6. M3: Escape Trainer

Legacy lines 395–458 (markup) and 1172–1315 (logic).

**§17 fixes.** Direct hits and no-rail fouls count as kicks (`evalEscape`, lines 1227–1238, never checks for a cushion before contact or a rail after it). A blocker foul scores 1 (line 1230). The card calls it a calculator.

**Puzzles [PROPOSED].** Every escape is the position a real safety left. For a bank entry e, the puzzle layout is `simulate(e.layout, e.best.shot).final` with the escaping player's rules:

- designated: `{kind: 'designated', legalIds: e.layout.rules.legalIds}`;
- 8-ball: `legalIds` = the original `opponentIds` still on the table (`['8']` if none), `opponentIds` = the original `legalIds` still on the table;
- 9-ball: `legalIds` = the lowest-numbered ball on the table.

Eligible entries: `best.score.V === 0` and `best.score.kick.rails` is 1 or 2. Today that is 742 of 858 entries (634 one-rail, 108 two-rail), and all 742 final layouts pass `validateLayout`. This replaces the legacy `genPuzzle` (lines 1184–1204) and its fixed fallback.

New pure module `src/deal/escape.js`: `escapeRules(rules, final)`, `eligibleEscapes(bank)`, `escapePlan(bank, sessionSeed)`: 7 one-rail and 3 two-rail entries, each group shuffled with `mulberry32(hashSeed(sessionSeed, 11))` in file order and the 10 slots shuffled together with the same generator. Worker message `{type: 'escapeDeal', sessionSeed, slot}` returns `{id, rails, layout}`; `{type: 'escapeById', dealId}` returns the same for one entry or `null`.

**Study behaviour.** Route `#/study/escape` (session of 10 rounds) and `#/study/escape?deal=<id>` (single). Same screen layout and controls as Safety Studio. Status line: `Round 3 of 10 · 1-rail hook · Total 41`.

- **Show mirror** toggles a reference line for the selected rail; a four-button selector picks Top, Bottom, Head (left), Foot (right). The line runs from the cue centre to the target centre reflected across that rail's ball-centre line (y = R, y = H − R, x = R, x = W − R), with a marker where it crosses the line. Caption: `Mirror line: equal angles in and out. Real cushions rebound shorter at speed and with spin.`
- After the shot, if the mirror is shown, the readout adds `First cushion contact <d> in from the mirror point`, measured along the rail between the cue's first cushion event and the mirror marker. This is the lesson the engine teaches (the §15 kick test).
- **Show a kick** (after the round's shot only, like Safety Studio's hint) runs `findKick` in the worker (below), replays it and shows its round score, with **Try this shot**.

**Round score, 0–10 [PROPOSED].** Pure `scoreEscape(sim, layout, leave)` in `src/study/escape/score.js`:

| Outcome | Score | Copy |
|---|---|---|
| Scratch | 0 | `Scratch: ball in hand to your opponent` |
| No ball hit | 0 | `Missed everything` |
| Wrong ball first (blockers included) | 0 | `Foul: wrong ball first` |
| No cushion before the target (`cueRailsBeforeContact === 0`) | 0 | `Direct hit: this drill scores kicks only` |
| 8 pocketed when not legal | 0 | `You pocketed the 8: loss of game` |
| No rail after contact and no ball pocketed | 0 | `Foul: no rail after contact` |
| Legal kick that pockets a legal ball, no scratch | 10 | `Kicked one in: still your shot` |
| Other legal kick | 6 + round(leave / 25) | ≥ 9 `Two-way escape`, 7–8 `Clean escape`, 6 `Legal escape` |

`leave` = `scorePosition(final, cueId, opponentTargets(escapeRules, final, cueId)).score`: the safety score of what the opponent now faces, computed in the worker by a new message `{type: 'escapeScore', layout, shot}` that returns `{sim, round}`.

Session total = sum of the 10 rounds (0–100). End words (legacy line 1239): ≥ 85 `Sharpshooter`, 65–84 `Solid kicker`, 45–64 `Getting there`, < 45 `Keep drilling the mirror`. The round score is the first shot; later shots are practice (as Stage 1b).

**`findKick(layout)`** in `src/search/kick-hint.js` [PROPOSED]:

1. For aim k · 0.5°, k = 0…719: `simulate(layout, {aimDeg, speed: 90, spin: {x: 0, y: 0}}, {record: false, stopAtFirstContact: true, maxCushions: 2})`. Keep aims whose first contact is legal, with 1 or 2 cue cushions before it and no scratch.
2. For each kept aim × speed ∈ {35, 50, 70, 90}: full simulate, then `scoreEscape` with `leave` from `scorePosition(..., {cheap: true})`.
3. Best = highest score, then fewer cushions, then lower speed, then lower k. Return `{shot, round}` or `null` (copy: `No 1- or 2-rail kick found from here`).

**Table mode:** the Line-of-Balls Mirror Kick drill (M7).

**Acceptance.**

- `scoreEscape` unit tests for every table row, built from real engine shots on fixed layouts.
- `escapePlan`: for 500 seeds, 10 distinct eligible ids, exactly 7 one-rail and 3 two-rail, same seed gives the same ids.
- Every eligible puzzle layout passes `validateLayout` and has at least one legal target (checked for all eligible entries under `RUNOUT_FULL=1`, the first 20 in `npm test`).
- `findKick` finds a legal kick on ≥ 90% of eligible puzzles (`RUNOUT_FULL=1`); the test prints the misses. Node time per call is reported; median ≤ 1.5 s.
- No legacy `evalEscape` scoring path remains.

## 7. M4: Run or Safe?

Legacy lines 461–516 (markup) and 1489–1745 (logic and the decision deck).

**§17 fixes.** The call does not affect the score (`grade`, lines 1566–1598, ignores whether the call was right), and it can be changed after shooting (line 1675 re-grades on a new call). Also, `grade` duplicates an old safety formula (lines 1582–1585), which §8 says to replace with `src/eval/safety.js`.

**Layouts [PROPOSED].** New pure `src/deal/run-or-safe.js`, ported from `genLayout` (lines 1503–1515) at true scale: OB x ∈ [18, 82], y ∈ [10, 40]; cue x ∈ [12, 88], y ∈ [8, 42], at least 26 in from the OB; OB at least 9 in from every pocket centre; one blocker, or two with probability 0.6, at x ∈ [16, 84], y ∈ [10, 40], at least 3R from every other ball and 9 in from every pocket centre. Rules: designated, `legalIds: ['ob']`, blockers `b1`, `b2`. Each layout must pass `validateLayout` and the 2R − 1e-6 spacing rule.

**Pot chance p** (pure, in `src/study/run-or-safe/pot.js`, run in the worker): for each pocket with cut ≤ 72° and clear paths (`clearance` ≥ 0 from OB to pocket and from cue to ghost ball, excluding cue and OB), simulate 15 shots aimed at the ghost ball: aim offset ∈ {−1, −0.5, 0, 0.5, 1}° × speed ∈ {45, 60, 80} in/s, no spin. A shot counts if the OB is pocketed, it was hit first and there is no scratch. p = the best pocket's share. **Smart call** = `run` if p ≥ 0.6, else `safe`. The ±1° spread stands in for a player's aim error; the robustness grid (±0.2°) is for safety execution, not potting.

**Dealing.** A session is 10 rounds: 5 run and 5 safe, order shuffled with `mulberry32(hashSeed(sessionSeed, 21))`. Slot i tries seeds `hashSeed(sessionSeed, 200 + i, a)` for a = 0, 1, 2, … and accepts the first layout whose p ≥ 0.8 (run slots) or p ≤ 0.2 (safe slots). The gaps keep the right call clear-cut. As soon as a layout is shown, the worker computes the model lines in the background: run = the best pocket's centre shot at 60 in/s; safe = unseeded `suggest(layout)`.

**Study behaviour.** Route `#/study/decide`. Same layout as Safety Studio plus a two-button **Run it / Play safe** segment above Shoot. Shoot is disabled until a call is picked; the call locks when Shoot is pressed. After the shot: the score panel, then the line `Smart call: <Run it|Play safe> (pot chance <round(p·100)>%)`, and **Show model line** (replays the model shot for the smart call and shows its result).

**Round score, 0–100 [PROPOSED].** Pure `scoreRound(call, smart, sim, safety)`:

- Decision points: 40 if `call === smart`, else 0.
- Execution E: call `run`: 100 if the OB is pocketed after a legal first hit with no scratch, else 0. Call `safe`: `scoreSafety(layout, shot).total`, except gate `ob-pocketed` gives 50 (`Made it: not the safety you called`, legacy line 1580).
- Round score = decision points + round(0.6 · E).

Session: average of the 10 rounds, and `Right calls: <n>/10`. First shot counts; later shots are practice.

**Decision deck.** The six legacy cards (lines 1692–1723) move to a second section `Read and reason` on the same route. Copy unchanged. One card at a time; pick an option, then the reveal shows `A strong player: <rec>` and the reasoning; tally `Matched a strong player: <n>/6` for the session. The card diagrams keep the legacy positions and the legacy drawn radius (2.45 in) and carry the caption `Diagram, not to scale`, because they were drawn at that scale and their clusters only read correctly there.

**Table mode:** none. Calling run or safe against a live opponent is covered by the Safety Battle and Two-way Shot specs.

**Acceptance.**

- `scoreRound` tests: right call plus made pot = 100; wrong call plus made pot = 60; right call plus safety 80 = 88; potting on a safe call = 40 or 70 depending on the call; fouls give the decision points only.
- Changing the call after Shoot is impossible (screen test of the reducer: the call field is frozen once a shot is recorded).
- For 200 session seeds: 5 run and 5 safe slots, every layout valid, p ≥ 0.8 or ≤ 0.2 as planned, deterministic.
- No safety formula other than `src/eval/safety.js` is used for the safe call.

## 8. M5: Position Lab

Legacy lines 236–282 (markup) and 712–794 (logic).

**False lessons removed.** The legacy draw path is an invented formula (`drawStrength`, lines 734–744), the follow line is a fitted curve (line 731), lines have fixed lengths unrelated to physics (line 729), and "hit fraction" shows cos(cut) (line 759), which is wrong: a 30° cut is a half-ball hit, not 0.87.

**Study behaviour [PROPOSED].** Route `#/study/position`. A sandbox, no session.

- Drag the cue ball and the object ball (44 px hit areas; validity rules as Stage 1b edit mode). Six pocket buttons labelled by position (`↖ ↑ ↗ ↙ ↓ ↘`). The aim is always the ghost-ball line for the chosen pocket, so the lesson is the cue ball, not the pot.
- Spin pad plus three presets: **Draw** (0, −0.6), **Center** (0, 0), **Follow** (0, 0.6). Speed control 8–130 in/s, default 40.
- Each change sends `simulate` to the worker with "one in flight": while a request is pending, later changes only update the pending state; when the response arrives, a new request goes out if the state changed. The cue and OB paths from the engine are drawn solid. The tangent line (90° rule, `--chalk`) and the line 30° off the aim (`--amber`) are drawn faint, 24 in long, from the ghost ball, as fixed references.

**Readouts** (pure `src/study/position/readouts.js`):

- `Cut angle <n>°`.
- `Hit <f> ball`, f = 1 − sin(cut), two decimals.
- `At contact: <state>` from `cueAtContact(shot, dist)`, which steps `strike` and `advanceBall` from `src/engine/motion.js` in DT increments over the straight distance to the ghost ball. With ρ = (w · v̂)/|v|: rolling or 0.95 ≤ ρ ≤ 1.05 → `Natural roll`; ρ < −0.05 → `Draw holding`; −0.05 ≤ ρ ≤ 0.05 → `Stun`; 0.05 < ρ < 0.95 → `Partial roll`; ρ > 1.05 → `Over-spin follow`.
- `Cue ball leaves <a>° off the aim line`, measured from contact to the cue's position 12 in of travel later (or its final position if it stops sooner).
- `Cue ball ends <d> in from contact`.
- `Object ball misses` if the engine does not pocket it.

**Tips** replace lines 768–775, chosen in this order: cut < 5° → `Dead straight. A stun shot stops the cue ball, but there is no angle to send it anywhere else.`; draw requested (spin.y < −0.1) and state is not `Draw holding` → `The draw wore off before contact. Move the balls closer or hit harder.`; `Stun` → `Stun: the cue ball slides into the object ball and leaves along the tangent line (the 90° rule).`; `Natural roll` → `Natural roll: the cue ball leaves about 30° off the aim line for cuts from a quarter to three-quarter ball (the 30° rule).`; `Draw holding` → `Draw at contact: the cue ball pulls back across the tangent line.`; otherwise → `Partial roll: the cue ball leaves between the tangent line and the 30° line.` A footnote on the screen: `This model has no throw, squirt or swerve.`

**Scoring:** none. Position Lab is a sandbox for seeing cause and effect; scored cue-ball control lives in the Table drills (M7) and Execute the Close.

**Table mode:** Stop-Shot Ladder, Up-and-Down Speed Control and Wagon Wheel (M7), each linking back here.

**Acceptance.**

- `hitFraction(30°) = 0.5`, `hitFraction(0) = 1`.
- `cueAtContact` matches the engine: the cue position at contact is within 0.01 in of `simulate`'s trajectory, and the state agrees, on 20 fixed shots.
- On a rolling half-ball hit the readout angle is 30° ± 4°; on a stun 30° cut, the cue leaves along the tangent within ±2° (same tolerances as §15).
- Tip selection unit-tested for every branch.
- A grep test confirms no `drawStrength`, `followAng` or `Math.cos(angle` hit-fraction code is shipped outside `legacy/`.

## 9. M6: The Closer

Legacy lines 285–339 (markup) and 797–960 (logic).

**§17 fixes.** Random layouts have no clusters or rail balls (`genLayout`, lines 813–821, spaces every ball 3.3R apart and 9 in from pockets). 9-ball order is forced, so the 9-ball exercise has no decision (line 860).

**Layouts [PROPOSED].** New pure `src/deal/closer.js`: `closerLayout(seed, game, n)` for game `'8'` or `'9'` and n = 2–6 balls before the money ball.

- Ids: 8-ball `'1'`…`String(n)` plus `'8'`; 9-ball `String(9 − n)`…`'8'` plus `'9'` (legacy line 819).
- Base placement: x ∈ [R + 4, W − R − 4], y ∈ [R + 4, H − R − 4], at least 9 in from every pocket centre and 3.3R from every placed ball; cue placed last by the same rule; up to 500 tries per ball, else `null` (the caller moves to the next seed).
- Feature, drawn first from the rng: none 25%, cluster 35%, rail ball 25%, cluster and rail ball 15%. Cluster: one non-money ball is placed frozen to another (centre distance exactly 2R at a uniform random angle), exempt from the 3.3R rule for that pair. Rail ball: one non-money ball is frozen to a cushion (y = R or H − R with x ∈ [12, 88] and |x − 50| > 6, or x = R or W − R with y ∈ [8, 42]).
- Every layout passes `validateLayout` and the 2R − 1e-6 spacing rule.

**Route model** in the worker, `src/search/route.js` [PROPOSED]. One step shoots ball b from the current table:

- Candidate pockets: cut ≤ 82° with clear paths (as legacy line 826); keep the 2 with the smallest cut. Candidate shots per pocket: aim at the ghost ball, speed ∈ {30, 50, 75} × spin.y ∈ {−0.5, 0, 0.5}, spin.x 0.
- A candidate is valid if b is pocketed, the cue is not, and the money ball is not pocketed unless b is the money ball.
- Cost of a valid candidate (legacy lines 834–840): potDiff = 1 / max(0.2, cos cut) − 1; ctrl = 1.4 · |cueFinal − b| / 111.8; look = the best (1 − cut/80) to the next ball from `cueFinal` on the post-shot table over pockets with cut ≤ 80° and clear paths, and lookPen = 1.6 · (1 − look) + (look ≤ 0 ? 2.4 : 0); for the money ball lookPen = 0.5 if cut < 8°, 0.9 if cut > 74°, else 0.1. The step takes the lowest-cost valid candidate.
- If no candidate is valid: cost 4, plus 6 if the fallback shot scratches; the fallback is the lowest-cut pocket's ghost-ball shot at 50 in/s with spin.y 0.2 (legacy line 843). The ball is marked stranded and the cue continues from b's position.
- The next step starts from the engine's final positions of every ball, so clusters really break or stay closed.

**Modes.**

- **8-ball, order mode.** Tap balls in shot order (tap a chosen ball again to truncate the order there, legacy line 956). The money ball must be last, otherwise grade F (line 909). Model order: exhaustive over permutations when there are ≤ 3 balls before the money ball; otherwise beam search keeping the 4 lowest cumulative-cost partial orders.
- **9-ball, pocket mode (§17 fix).** The order is fixed (lowest first). The player picks a pocket for each ball in turn: the current ball is ringed, and the player taps one of six pocket buttons. The model picks pockets by beam search (width 4) over each step's two candidate pockets.

The worker computes the model route as soon as a layout is shown, so it is usually ready before the player finishes.

**Grade [PROPOSED].** Keep the legacy demerit scheme (lines 916–938) on engine metrics: cost ratio player/model > 1.6 → 3, > 1.32 → 2, > 1.14 → 1; reversal not in the model +2; two or more extra zig-zags +1; money-ball angle < 12° or > 74° when the model's is not +1; extra scratches +2; extra stranded balls +3; max cut > 70° and 8° beyond the model's +1. Demerits 0 → A `Pro-level flow`, 1 → B `Solid plan`, 2 → C `Workable, leaks`, 3+ → D `Tangled route`; money ball not last → F `Hands over the table`. The legacy notes (lines 926–933) are kept as the explanation text.

**Session.** 10 layouts with the chosen game and count. Points A 4, B 3, C 2, D 1, F 0. The summary shows the mean to one decimal and the count of each grade.

**Table mode:** Progressive Ghost, Key-Ball End Game and Insurance Breakout (M7) use `closerLayout`. Execute the Close (its own spec) carries the cue ball forward at the table.

**Acceptance.**

- `closerLayout`: for 500 seeds × both games × n = 2…6, every non-null layout is valid; feature shares within ±5 points of 25/35/25/15 over the 500 seeds; at least 99% of seeds non-null.
- Route model unit tests on fixed layouts: a straight-in ball pockets with cost < 0.2; a frozen cluster ball moves when hit; a forced scratch line costs ≥ 6.
- Model route on n = 6 ready in ≤ 3 s in node for 30 seeds (report median and max).
- 9-ball mode never asks for an order; 8-ball mode grades F when the money ball is not last.

## 10. M7: Table Drills (Table mode)

Legacy lines 519–538 (markup), 1323–1485 (demos, setups, targets) and 1760–1916 (drills and logging).

**§17 fixes and anti-goal fixes.** Setup targets do not match drill intent (`setupTarget`, lines 1464–1474: the hide drill's target is wherever an old-physics stun shot stops, never checked as hooked). "Reset all logs" has no confirmation (line 1906). Setup mode scores by tapping where the cue ball stopped (line 1868), which is the §5 anti-goal. The 30-entry log with sparklines (lines 1802–1820, 1898–1909) and "Copy my log" (lines 1910–1915) are long-term tracking, which §2 excludes.

**Screens [PROPOSED].** `#/table` lists the eight drills; `#/table/<id>` opens one (`stop`, `speed`, `wagon`, `ghost`, `keyball`, `insurance`, `hide`, `kick`, legacy ids). Layout per §12: phone portrait has the setup diagram on top, the tally, then the log buttons in thumb reach at the bottom; iPad landscape has the diagram on the left (60%) and the buttons on the right, with no scrolling at 1180 × 820. The diagram has no pointer handlers at all.

Each drill screen shows: name, area, difficulty, the legacy "how" text (line-by-line from `DRILLS`, lines 1760–1800; the phrase about tracking a trend is removed), a placement diagram for the current setup, the log buttons, the tally `Rep 4 of 10 · 3 points`, **Undo**, **New setup** and **New session**.

**Logging [PROPOSED].** One tap logs one rep. Buttons are at least 64 px tall and full-width in a single column (up to four), labelled as below. **Undo** removes the last rep. A session is the drill's legacy max number of reps; after the last rep the screen shows `<points> / <max points> (<percent>%)` and the count per outcome, with **New session** (confirm `Start a new session? This drill's tally will be cleared.`).

| Drill | Reps | Buttons (points) | Setup source |
|---|---|---|---|
| Stop-Shot Ladder | 8 | Stopped (1) · Drifted (0) · Missed the ball (0) | legacy `randomSetup` stop branch, lines 1446–1452, true scale |
| Up-and-Down Speed | 10 | In the zone (1) · Short (0) · Long (0) | lines 1453–1457; markers Z1–Z3 |
| Wagon Wheel | 9 | Reached the target (1) · Missed position (0) · Missed the ball (0) | lines 1458–1462 |
| Progressive Ghost | 10 | Ran out (1) · Missed a ball (0) · Got stuck (0) | `closerLayout(seed, '9', count)`; a count stepper 3–7 |
| Key-Ball End Game | 10 | Called key ball and ran out (1) · Ran out, wrong key (0) · Didn't run out (0) | `closerLayout(seed, '8', 3)` |
| Insurance Breakout | 10 | Broke it and kept a shot (1) · Broke it, no shot (0) · Didn't break it (0) | lines 1425–1432 with the pair frozen at 2R |
| Hide-Behind-Target | 10 | Hooked (2) · Partial (1) · Open (0) · Foul (0) | bank entries (below) |
| Line-of-Balls Mirror Kick | 10 | Clean hit (1) · Wrong ball (0) · Missed (0) · Scratch (0) | lines 1439–1445 |

Setups are seeded: setup k of a session uses `hashSeed(sessionSeed, 300 + k)`. Generators live in `src/table/setups.js` and use `mulberry32`; each output passes `validateLayout` and the spacing rule.

**Hide drill intent fix.** Hide setups are bank entries from the designated families (1, 2, 3, 4, 5, 8) whose stored best has V = 0. The diagram shows the layout plus dashed outlines labelled `one hook` at the cue and object-ball final positions of the stored best shot. So the shown target is a checked full hook, and the "Hooked / Partial / Open / Foul" logging matches what the drill asks.

**Session store.** `createSessionStore('table:<id>', null)` holding `{seed, setup, reps: string[], count?}`, saved after every log, undo or new setup. A refresh or screen lock resumes exactly.

**Wake lock.** Held while a drill screen is mounted, released on unmount, re-acquired on visibility (Stage 1a `createWakeLock`). On fallback, the Auto-Lock tip appears on the drill screen.

**Demos [PROPOSED].** The legacy animated demos (`buildDrillDemo`, lines 1360–1411) are not ported. Each drill has a `See it in Study` link instead: Stop, Speed, Wagon → `#/study/position`; Ghost, Key-Ball, Insurance → `#/study/closer`; Hide → `#/study/safety?deal=<current setup's id>`; Kick → `#/study/escape`.

**Study mode:** the linked Study modules above.

**Acceptance.**

- No drill needs a tap on the diagram (site test: drill screen code registers no pointer or click handler on its canvas).
- Every log button is ≥ 64 px tall (CSS test on the rule); one tap logs; **Undo** restores the previous tally (reducer test).
- Persistence: the reducer state round-trips through a stub store; after a simulated reload the rep count and setup index are unchanged.
- Generators: 500 seeds per drill, every setup valid; every hide setup's shown hook has V = 0 when re-simulated.
- Owner checklist: on the iPad in the installed app, a full Hide-Behind-Target session is logged one-handed; the screen stays on for 5 minutes with Auto-Lock at 2 minutes (or the tip appears); refresh mid-session resumes.

## 11. M8: retire `legacy/`

When M1–M7 are merged and the owner has ticked each module's checklist items:

- Replace `legacy/index.html` with a redirect stub (under 1,500 bytes) that maps old deep links: `#plan` → `#/study/diagnosis`, `#position` → `#/study/position`, `#closer` → `#/study/closer`, `#safety` → `#/study/safety`, `#escape` → `#/study/escape`, `#decide` → `#/study/decide`, `#drills` → `#/table`, anything else → `../`. Old bookmarks and home-screen links keep working, as with `runout-lab.html`.
- The header nav and Study list link only new routes.
- Site tests: no shipped file other than the stub contains `legacy/`; the stub maps all seven hashes; the precache list holds the stub.
- §8's "legacy app stays reachable" requirement and the §18a.6 legacy precache note are closed in a §21 amendment.

## 12. Physics and engine: what is good enough and what is not

- **Spin, slide-to-roll, 30° and stun rules:** tested in §15; good enough for Position Lab and The Closer.
- **Cushion rebound:** speed- and english-dependent, tested at ≤ 130 in/s; not smooth above about 150 in/s. Every port caps shots at 130 in/s. Escape Trainer depends most on rebound; its mirror-miss readout is only as true as the cushion model, so Banking's E1/E2 and BF fixtures land with M1, before M3.
- **No throw, squirt or swerve** (§9). Risk: Position Lab and The Closer pot every ghost-ball shot that is not blocked, which overstates cut-shot reliability. Mitigation: the footnote in Position Lab, and Run or Safe?'s ±1° aim spread for pot chance. Not fixed here.
- **Ball–ball clusters:** frozen contacts and simultaneous collisions are pinned (RF1, RF2), so cluster breakouts in The Closer are believable.
- **Pockets:** true mouths (4.5 in corner, 5.0 in side); jaw contacts tested (RF3).

## 13. Success criteria (all ports)

Each port's acceptance list above, plus: `npm test` green; precache tests green; Lighthouse accessibility ≥ 90 on the port's route; no main-thread long task (Chrome) or rAF gap ≥ 50 ms (Safari) while its engine work runs; the module works offline in the installed app; and, after M8, no shipped page depends on the old physics.

## 14. Non-goals and anti-goals

Non-goals: new drills (each has its own spec); long-term history; porting the legacy demos; throw, squirt, swerve or jump physics; keyboard ball dragging; changing §10 weights other than adding the M1 term.

Anti-goals (fail the port): any legacy physics or scoring function in a ported module; a Table drill that asks the player to tap where a ball stopped; a score that can change after the round's first shot; a module that freezes the UI; a port that leaves any module more than one tap from home.

## 15. Size and dependencies

| Port | Tasks |
|---|---|
| M1 | 6 (term and fixtures, safety plumbing, families and fallthrough fix, sample gate, rebuild and report, Stage 1b copy row) |
| M2 | 1 |
| M3 | 5 |
| M4 | 5 |
| M5 | 4 |
| M6 | 6 |
| M7 | 7 |
| M8 | 2 |

About 36 tasks. Depends on Stage 1b. M1 depends on the owner's easy-band answer and is merged with Banking B0 into one change set. M3, M4 and M7 depend on M1; M7 also on M6. The new-drill specs (Banking, Execute the Close, Safety Battle, Two-way Shot, Read-the-Hook, Speed-window) reuse M7's Table drill screen and logging.

## 16. Open questions for the owner

1. **Model change first.** Default: M1 (distance-safety update and bank rebuild) is the first port, so scoring ports are built once on the final model. If you would rather see ports sooner, M2 and M5 can go first; M3, M4 and M7 still wait for M1.
2. **Distance-credit formula.** Default: +0.60·T, credit ramping from 30 to 80 in, OB-frozen factor 0.5 to 1, predicted lag 74, long thin cut 28.5, long open ball near a pocket 17.3. If you want distance safeties worth more or less, say so now; after M1 the §10 rule forbids retuning without a new decision and a rebuild.
3. **Banking before the ports?** Default: §16 order, ports first, then Banking as new drill 1. If Banking goes first, it must build the Table drill screen and logging (M7's shared parts) itself, and M7 reuses them.
4. **Escape puzzles from bank positions.** Default: every escape is the position a real safety left (742 today). The alternative is a separate hook generator like legacy `genPuzzle`, which needs its own validation.
5. **Run or Safe? scoring split.** Default: 40 points for the right call, 60 for execution. A 50/50 split makes the call matter more; 30/70 favours stroke.
6. **The Closer, 9-ball.** Default: 9-ball becomes a pocket-choice exercise. The alternative is to drop 9-ball from The Closer and leave rotation to Execute the Close.
7. **Table drill demos.** Default: drop the animated demos and link to the matching Study module. Porting them onto the engine is about 2 more tasks.
8. **Hide drill points.** Default: Hooked 2, Partial 1, Open 0, Foul 0, out of 20. Legacy scored 1 per full hook out of 10.
9. **Legacy retirement.** Default: replace `legacy/index.html` with a redirect stub. The alternative is to delete it, which breaks any old home-screen link to a legacy tab.
10. **One rebuild for M1 and Banking B0.** Default: the distance-credit term and Banking's cushion fixes E1 (and E2 if you approve it) ship together with one bank rebuild, whichever stage is scheduled first. If you want them separate, there are two rebuilds and two coverage reviews.
