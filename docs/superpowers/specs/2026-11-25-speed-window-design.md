# Speed-window safety and table calibration: design

Date: 2026-11-25. Status: draft for owner review. New-drill priority 6 (owner, 2026-11-25).

Tags follow the Stage 1 spec (`docs/superpowers/specs/2026-11-24-runout-lab-rebuild-design.md`, "the main spec"): **[OWNER]**, **[PROPOSED]**, **[BUILDER]**. Line numbers refer to `legacy/index.html`.

This spec reuses `src/deal/stream.js` and `src/play/describe.js` from the Safety Battle spec (`2026-11-25-safety-battle-design.md`, §8).

## 1. Intent and why

Most safeties are lost on speed, not line. The legacy speed drill calls speed "the biggest fix for balls that linger" (line 1766). The main spec's robustness grid already measures speed tolerance (±4%, §10.6), but it only shows the player a Forgiving or Touchy label.

This drill makes the tolerance concrete:

- **The speed window.** The range of speeds on a given line that still leaves a good safety. Learning it trains two things: choosing safeties with wide windows, and hitting the middle of them.
- **Calibration.** A short routine at the real table measures how that table plays. Windows shown at the table then come from a tuned engine.

The legacy Kick drill already asks the player to "Calibrate your table — note if it plays long or short" (line 1800), but nothing measured it.

## 2. Definitions [PROPOSED]

**Line.** A bank entry's stored best shot with its aim and spin fixed: `entry.best.shot`. Its speed is v_ref.

**Leave score at speed v, written L(v).**
1. Run `simulate(layout, {aimDeg, speed: v, spin}, {record: false, tune})`.
2. If `gateFor` gates it, L(v) = 0, and the gate is recorded.
3. Otherwise L(v) = round(`scorePosition(final, cueId, opponentTargets(rules, final, cueId)).score`), with full kick lanes.

L(v) is the nominal run only. Robustness is not added on top, because the window is the robustness.

**Sweep grid.**
- v_k = v_ref · 1.02^k for k = −20..20.
- Speeds below 3 in/s or above 150 in/s are dropped, so every swept shot stays below the non-smooth cushion region (acceptance checklist, Known limitations).
- Kick lanes are memoised by exact final positions within one sweep.

**Runs and the window.**
- A run is a maximal set of consecutive grid points with L ≥ 70.
- The primary window is the run that contains k = 0.
- If no run contains k = 0, the primary window is the longest run. Ties go to the run nearest k = 0, then to the lower k.
- Window = [v_lo, v_hi], the speeds at the run's ends.
- Centre v_c = √(v_lo · v_hi).
- Width = 100 · (v_hi / v_lo − 1) %.

Measured on 22 bank entries (2026-11-25):
- Widths ranged from 4% to 58%, with a median of about 15%.
- In 3 of 22, the stored speed was not inside a run. Its nominal score was 66–69, although the robust mean was ≥ 70.

**Eligible.**
- Study: the primary window has at least 3 grid points (width ≥ 4%).
- Table: at least 5 points (width ≥ 8%).

**Rest zone.** The cue-ball final positions at the window's grid speeds, drawn as a thick polyline.

**Lag scale ("lengths").** Players can't feel in/s, but they can feel "how many table lengths".
- `lengthsAt(v, tune)`:
  1. Simulate a lone cue ball at (R, 25), aim 0°, centre ball, speed v.
  2. Sum |Δx| from the start through each cue cushion event to the stop event.
  3. Divide by 97.75, which is W − 2R.
- Results go into a cache per tune, for v = 1..150 in 1 in/s steps. Values in between are linearly interpolated, and the inverse is found the same way.
- Lengths are shown to 1 decimal place.
- `lengthsAt` must be strictly increasing for v in [2, 150] (section 10).

Measured friction invariance (2026-11-25). The engine was copied with MU_ROLL ×0.7, ×1 and ×1.5. Primary windows expressed in lengths moved by at most about 0.1 length, for example 1.08–1.15, 1.08–1.16 and 1.08–1.15. The reason: on a slower cloth both balls lose speed faster, so the stroke that rolls N lengths leaves nearly the same picture. Cloth friction alone therefore changes table-visible predictions only a little. Rails and the slide-to-roll balance change them more. That is why calibration fits both cloth and rails (section 5).

## 3. Study mode [PROPOSED]

Route: `#/study/speed`.

**Deals.**
- A session is 10 deals.
- Slot i takes the next eligible entry from `entryStream(bank.entries, sessionSeed, 600)`, skipping entries already used in the session.
- Each eligibility check is a sweep, run in the worker. The next deal's sweep starts while the player works on the current one.
- `#/study/speed?deal=<id>` opens one entry. An unknown id shows "That layout isn't in this version" and deals normally.

**Screen.**
- The layout with the fixed line: an aim line, the spin dot on the shared spin pad (read-only) and the target ringed.
- The only control is a lengths slider, from 0.3 to `lengthsAt(150)` in 0.05 steps, with ±0.05 nudges.
- The slider shows lengths, and the speed in in/s is shown next to it.

**Shoot.**
- The app runs `simulate` at the chosen speed exactly, with no noise, and the animation player replays it.
- The reveal shows:
  - L at the chosen speed
  - in or out of the window
  - a chart of L against lengths, with the window shaded and the player's mark on it
  - the rest zone drawn on the table
  - every other run, labelled "second window" where there is one
- Retry repeats the deal. Next advances.

**Physics.** Study uses the default engine (no tune).

## 4. Table mode [PROPOSED]

### 4.1 Speed-window reps

Route: `#/table/speed`.

**Banner.** Shown if no current calibration exists: "Not calibrated — windows assume the app's default table. Calibrate (about 5 minutes)." It links to section 5.

**Deals.**
- Entries come from families 1, 2, 3 and 8, which have at most 5 balls, via `entryStream(…, sessionSeed, 610)`.
- An entry must be Table-eligible under the current tune.
- A session is 4 layouts × 5 reps = 20 logged shots.

**Card.**
- The placement diagram.
- The line from `describeShot`, for example "¾-ball on the ob, cut left · draw".
- Speed: "1.2–1.4 lengths (aim for 1.3)", which is the window and v_c in lengths under the current tune.
- The rest zone, and the object ball's predicted rest at v_c drawn faintly.
- A reference line: "From the head spot, up and back to the side pocket ≈ X lengths", where X = `lengthsAt` for Test A's middle case under the current tune.

**Log each rep.** One tap on a button at least 64 px tall:
- "Short"
- "In the zone"
- "Long"
- "Foul"

Undo removes the last log. Session store and wake lock follow main spec §12.

### 4.2 Calibration

Route: `#/table/calibrate`. It needs a real table, so it is Table-only. Study can't measure a table.

## 5. Calibration routine [PROPOSED]

### 5.1 Why timing is needed

A stop distance alone can't separate cloth speed from how hard the ball was struck, because the speed of a human stroke is unknown. Taps on the phone clock give the second number.

All timing taps go on a single full-screen pad. The positions are coarse, picked from buttons (diamond, then a third of a diamond), so nothing needs precise tapping (main spec §5).

### 5.2 Tests

Coordinates:
- The head rail is at x = 0 and the foot rail at x = 100.
- The long-rail diamonds are at x = 12.5·d, for d = 1..7. The side pocket is at d = 4.
- The cue ball starts on the head spot (25, 25) and is struck straight up-table at the foot-rail centre diamond, centre ball.

**Test A, cloth: 3 trials.**
- The stroke: a lag that comes back off the foot rail and stops before reaching the head rail.
- Taps: "Foot rail" when the ball hits the foot rail, then "Stopped".
- Position:
  - diamond d, from 1 to 7
  - then "nearer head", "level" or "nearer foot", giving x_stop = 12.5·(d − 1/3), 12.5·d or 12.5·(d + 1/3)
- Valid when 1.0 s ≤ T_A ≤ 20 s, where T_A is the time from the foot-rail tap to the "Stopped" tap.

**Test B, rails: 3 trials.**
- The stroke: firmer. Up, back off the head rail, and stopping on the way back up-table.
- Taps: "Foot rail", then "Head rail".
- Position: entered the same way as Test A.
- Valid when 0.8 s ≤ T_B ≤ 10 s, where T_B is the time from the foot-rail tap to the head-rail tap.

A trial that fails validation, or doesn't match its test in the fit (section 5.3), shows "That lag didn't match the test — redo it" and is replaced.

### 5.3 Fit

New pure module `src/calib/fit.js`.

**`lagSim(v, tune)`** simulates the lone ball from (25, 25). It returns the cue cushion event times, the stop time and the path length (sum of |Δx|).

**Target path P\*:**
- Test A: P\* = 73.875 + (98.875 − x_stop).
- Test B: P\* = 73.875 + 97.75 + (x_stop − 1.125).

**Fitting a trial's speed.**
- Bisect v in [1, 150] on path(v) − P\*. Path increases with v.
- Stop when |Δ| < 0.05 in, or after 40 iterations.
- The fitted run must have exactly 1 cue cushion event (Test A) or 2 (Test B). Otherwise the trial is invalid.

**Model times:**
- Test A: T_sim = t_stop − t_c1.
- Test B: T_sim = t_c2 − t_c1.

**Cloth factor `roll`.**
- For each Test A trial, bisect roll in [0.4, 2.5]. T_sim decreases as roll increases.
- Stop when |T_sim − T_A| < 0.005 s, or after 30 iterations.
- An estimate that hits a bound is clamped and flagged "outside the model's range".

**Rail factor `rail`.**
- For each Test B trial, bisect rail in [0.85, 1.08]. T_sim increases with rail: a livelier rail needs a slower ball for the same stop, so the second leg takes longer.
- Same stopping rules as for roll.

**Rounds.**
- Start from (roll, rail) = (1, 1).
- roll ← median of the per-trial Test A estimates, given rail.
- rail ← median of the Test B estimates, given roll.
- Do this twice: two full rounds.
- Round both results to 2 decimal places.

**Consistency.**
- Spreads are measured in the final round's per-trial estimates.
- If the roll spread is more than 0.35, or the rail spread is more than 0.06, show "Your lags disagree — redo the marked one".
- The marked trial is the one farthest from the median. The redo replaces it, and the fit runs again.

**Result.** `Calibration = {v: 1, roll, rail, trialsA, trialsB, at: <epoch ms>}`.

It is shown in words:
- Cloth: "fast" if roll < 0.85, "medium" from 0.85 to 1.15, "slow" above 1.15.
- Rails: "dead" if rail < 0.97, "normal" from 0.97 to 1.03, "lively" above 1.03.

The numbers appear underneath.

**Where it runs.** The worker message `{type: 'calibrate', trialsA, trialsB}` runs the fit, with a progress line.

### 5.4 Lifetime

- Stored with `createSessionStore('calibration', null)`. `Date` is used only in UI code.
- It lasts 12 hours from `at`, or until "Clear calibration".
- A drill's "New session" does not clear it. That is the intent of "per table for the session".
- No calibration history is kept.

## 6. Calibration and the frozen layout bank [PROPOSED]

The bank's `modelHash` hashes code: `src/engine`, `src/geometry`, `src/eval`, `src/search/grid.js` and `src/search/search.js` (R36). Calibration has to change engine behaviour without invalidating the bank. These rules make that work:

1. **Calibration is runtime data.** It is passed per call. It is never written into code, constants or any shipped data file, so it can never change the hash.
2. **Engine change.** The engine gains one optional parameter, `opts.tune` (section 8). With `tune` absent, or equal to `{roll: 1, rail: 1}`, every simulation is bit-identical to today's: the tuned expressions only multiply by 1. This code change alters `modelHash` once. It belongs in the bundled model-change window described in section 9, so one bank rebuild covers it.
   - If it ships on its own, the proof that it is harmless works like this:
     - `RUNOUT_FULL=1` re-validation passes for all 858 entries, exactly.
     - The bank is rebuilt, and the new file is byte-identical to the old one except for `modelHash`.
     - Then the usual stamp and version bump follow.
3. **Bank-facing code never passes `tune`.** That covers:
   - dealing, Suggest (seeded or not), the bank builder, re-validation and Safety Studio scoring
   - Safety Battle, Two-way and Read-the-Hook
   - kick lanes inside `src/eval`, which always use the default engine, even in tuned sweeps. This is a stated approximation: the opponent's kick lanes in a tuned window are computed on the default table.
4. **Tuned results stay separate.** A tuned window is never compared with a stored bank score. Table cards say "on your table" and are computed live.
5. **Enforced by tests** (section 10):
   - worker `suggest`, `deal` and `byId` give identical results with and without a stray `tune` field
   - a source scan allows the identifier `tune` only under `src/engine/`, `src/speed/`, `src/calib/` and the speed-window and calibration UI files

## 7. Scoring (session only) [PROPOSED]

**Study, per deal,** for chosen speed v_p:
- If v_lo ≤ v_p ≤ v_hi: score = 70 + round(30 · c), where c = clamp(1 − |ln(v_p / v_c)| / (½ · ln(v_hi / v_lo)), 0, 1).
- Otherwise: score = min(69, L(v_p)).
- Session score = the mean over the 10 deals.

**Table.**
- Session score = round(100 × "In the zone" / logged shots).
- After at least 5 logs, if (Long − Short) / logged ≥ 0.3, show "You're hitting long — or the table is faster than calibrated". The mirror message appears for short.
- Calibration is not scored.

## 8. Reuse, engine change and new modules

**Reused:**
- `simulate`, `gateFor`, `opponentTargets`, `scorePosition`
- the bank loader
- `entryStream`, `describeShot`
- Plan 1b UI: renderer, animation player, spin pad (read-only), router, session store, wake lock

**Engine change** (under `src/engine/`, inside the model-change window):
- `simulate(layout, shot, opts)` accepts `opts.tune?: {roll: number, rail: number}`. It throws `Error('invalid tune')` unless 0.4 ≤ roll ≤ 2.5 and 0.85 ≤ rail ≤ 1.08.
- `advanceBall(b, dt, roll = 1)`: rolling deceleration becomes `MU_ROLL * G * roll`. Sliding is unchanged.
- `cushionRebound(c, rail = 1)`: e becomes `Math.min(0.98, e * rail)` for every cushion, jaw and pocket-facing contact. The tangential factor tau is unchanged.
- No constant changes value.

**New pure modules [file names BUILDER]:**
- **`src/speed/window.js`**:
  - `sweep(layout, line, vRef, tune?) -> {grid: {v, L, gate, cue: {x, y}, ob: {x, y}}[]}`
  - `windowFrom(grid) -> {runs, primary: {lo, hi, vLo, vHi, vC, width}|null}`, which is pure on the score array
  - `eligible(win, minPoints)`
- **`src/speed/lag.js`**: `lagTable(tune?)`, `lengthsAt(v, tune?)`, `speedForLengths(n, tune?)`.
- **`src/calib/fit.js`**: section 5.3.

**Worker messages:**
- `{type: 'speedSweep', dealId, tune}`
- `{type: 'speedNext', sessionSeed, slot, usedIds, table, tune}`
- `{type: 'calibrate', trialsA, trialsB}`

Each screen creates its own search client and terminates it when the route is left.

## 9. Physics and engine requirements and risks

### 9.1 Must fix first: cushion impacts keep all the forward roll

When a ball hits a cushion, `simulate.js` changes v through `cushionRebound` but leaves the rolling velocity w untouched. R3b zeros it only below `V_REST`. So a ball rolling head-on into a rail leaves with its velocity reversed and its topspin still forward. Sliding friction then burns most of its speed: it comes back at about 0.33 of its impact speed (measured 15.1 in/s after a 45.8 in/s impact). The published figure is about half (Dr. Dave, cited in the Banking spec).

The Banking spec (`2026-11-25-banking-design.md`, §3) diagnoses the same fault and specifies the fix:
- **E1**, monotonic rebound: `E_MIN` 0.794. This also fixes the known limitation above about 150 in/s.
- **E2**: subtract `CUSHION.ROLL_LOSS · vn` from w's normal component, with `ROLL_LOSS` = 0.75.

This spec adopts E1 and E2 as they stand. It adds no cushion change of its own.

Measured with E2 on a copy of the engine (2026-11-25):

| Measure | Current engine | With E2 |
|---|---|---|
| `lengthsAt`, 40 / 84 / 130 / 150 in/s | 1.02 / 1.55 / 2.04 / 2.09 (saturates) | 1.05 / 2.09 / 2.67 / 2.94 |
| Test B middle case (x_stop = 50) needs | 184 in/s (above the 150 limit; calibration can't run) | 116 in/s |
| Head-on retention | 0.33 | 0.54 |

**Acceptance tests (added by this spec on top of Banking's E1/E2 tests):**
- C1: Banking's E1/E2 fixtures pass.
- C2: `lengthsAt` is strictly increasing on [2, 150], and `lengthsAt(130)` ≥ 2.5.
- C3: the Test B middle case (x_stop = 50) needs ≤ 130 in/s under the default tune.

If C2 or C3 fails once E1 and E2 are in, stop and report the numbers. Do not tune them.

**One model-change window.** E1/E2 join one shared window with:
- the pocket model from the Two-way spec, §7
- `opts.tune` from section 8
- the module-ports M1 rebuild that Banking already plans to share

That is one rebuild of the bank and one owner coverage review for all of them. E2 changes many bank outcomes, so the coverage report will move.

### 9.2 Other risks

- **Throw.** Throw is not modelled (main spec §9). At low speed, cut shots throw more in reality, so windows whose low end is below 15 in/s are least trustworthy. Cards whose v_lo < 15 in/s show "Very soft — the table may differ".
- **Approximate tuning.** The tuned engine scales rolling friction and normal restitution only. Sliding friction, tangential cushion response (tau) and spin decay stay at defaults, and kick lanes stay at default (section 6, rule 3).
- **Tap bias.** A late "Stopped" tap makes the cloth look faster. `STOP_TAP_BIAS_S = 0` [PROPOSED]. The owner's acceptance run (section 10, item 9) checks whether this is good enough. It is not tuned silently.
- **Diamond reading.** Reading the stop position to a third of a diamond (±4 in) limits cloth accuracy to about ±8% for one trial. The median of 3 helps.

## 10. Testing and success criteria

1. **Bit-identity.** For 200 cases (2 entries per family × band cell, all examples, and every main spec §15 physics fixture), `simulate(l, s)` deep-equals `simulate(l, s, {tune: {roll: 1, rail: 1}})`. Bank re-validation passes unchanged.
2. **Tune effect.**
   - With roll 1.5, a straight roll that never reaches a cushion has a rolling-phase distance of 1/1.5 of the default, within 0.01 in.
   - With rail 0.9, a head-on rebound's normal speed is 0.9 × the default.
   - An out-of-range tune throws.
3. **Hash guard.** The tests in section 6, rule 5. `modelHash` matches the bank after the model-change window's rebuild.
4. **Window logic.** `windowFrom` is tested on synthetic score arrays covering:
   - a run through k = 0
   - k = 0 below 70 with two runs, testing the longest-run and nearest tie rules
   - no run
   - dropped speeds above 150

   Also, `sweep` L values equal direct `scorePosition` results.
5. **Sweep time.** p95 ≤ 2.0 s per layout in node on desktop, measured at about 40 ms per full leave score. It runs in the worker, and the next deal is prefetched. No main-thread task runs over 50 ms.
6. **Lag scale.** Strictly increasing for v in [2, 150] at the tune corners (0.4, 0.85), (0.4, 1.08), (2.5, 0.85) and (2.5, 1.08), plus the default. Inverse round-trip within 0.01 length.
7. **Calibration recovery.**
   - Synthetic trials are generated by the engine at tunes (1.30, 0.93) and (0.75, 1.04).
   - x_stop is rounded to the nearest third of a diamond.
   - Deterministic jitter of ±0.08 s is added to rail taps and ±0.25 s to the stop tap.
   - The fit must recover roll within ±0.12 and rail within ±0.03.
   - If it fails, report the numbers.
8. **Calibration time.** p95 ≤ 3.0 s in node on desktop for 6 trials.
9. **Owner acceptance at the table** (added to `docs/acceptance-checklist.md` when built):
   - calibration finishes in 5 minutes or less
   - the consistency check passes by the second attempt at the latest
   - a 20-shot speed-window session is played, with the cloth and rail words, the session score and the short/long tip recorded
10. **Prerequisite.** C1–C3 (section 9.1) pass before any speed-window UI work starts.

## 11. Non-goals and anti-goals

**Non-goals:**
- Calibrating sliding friction, throw, cushion angle ("plays long or short"), spin decay or pocket size
- Calibration history across days
- Microphone or ramp-based measurement
- Tuned kick lanes
- Speed windows for kicks or pots. This drill is safeties only, from the bank.

**Anti-goals:**
- Calibration that changes Safety Studio scores or invalidates the bank
- Asking for precise taps on the table diagram
- Showing a lag scale that saturates, which is why section 9.1 comes first

## 12. Size and dependencies

**Size:** about 13 tasks.
- C1–C3 on top of Banking's E1/E2 (in the shared model-change window)
- `opts.tune` and the bit-identity tests
- the bank rebuild and owner coverage review (shared)
- `lag.js`
- `window.js`
- the worker messages
- Study UI
- Table reps UI
- the calibration UI
- `fit.js` and the recovery test
- the hash-guard tests
- the owner checklist items

**Depends on:**
- the model-change window, together with the Banking work
- the rebuilt bank
- `entryStream` and `describeShot` from the Safety Battle spec
- Stage 1b UI

## 13. Open questions for the owner

1. **Fix the cushion roll loss (section 9.1) in one model-change window with Banking, the pocket model and `tune`?** Default: yes, with one rebuild. If no, speed windows and the lag scale stay unrealistic, and Test B can't run, so calibration becomes cloth-only and the lag scale tops out near 2 lengths.
2. **Calibrate rails as well as cloth?** Default: both. With cloth only, Test B is dropped, which saves about 2 minutes. But cloth alone barely moves what you see at the table (section 2), so calibration would mostly relabel the in/s numbers.
3. **Phone taps for timing?** Default: yes, using a full-screen tap pad and the median of 3 trials. The alternatives are a ball ramp (needs equipment) or the microphone (permissions, and noise from other tables).
4. **How long a calibration lasts.** Default: 12 hours, or until cleared. "Clear on New session" is stricter. "Until cleared" risks carrying one table's numbers to another.
5. **Speed shown as "lengths".** Default: lengths, plus in/s in Study. Alternatives are a 1–10 speed scale tied to lengths, or in/s only.
6. **Window threshold.** Default: L ≥ 70, the same as a good safety. Lower thresholds, such as 60, give wider windows but count weaker leaves as "in".
