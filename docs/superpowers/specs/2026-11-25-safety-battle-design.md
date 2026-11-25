# Safety Battle against a noisy bot: design

Date: 2026-11-25. Status: draft for owner review. New-drill priority 3 (owner, 2026-11-25).

Tags follow the Stage 1 spec (`docs/superpowers/specs/2026-11-24-runout-lab-rebuild-design.md`, "the main spec"): **[OWNER]**, **[PROPOSED]**, **[BUILDER]**. Line numbers refer to `legacy/index.html`.

This spec also defines three small shared modules (section 8) that the Two-way, Read-the-Hook and Speed-window specs reuse.

## 1. Intent and why

The main spec's second aim is to win safety battles (§1). Safety Studio scores one safety on its own. A real battle is an exchange. You play safe, the opponent kicks or plays safe back, and whoever first leaves a shot or fouls loses. This drill trains three things:

- picking forgiving safeties, because execution is never exact
- escaping a hook legally
- returning the hook

A bot with a chosen skill level plays the other side. No legacy module does this. The nearest relatives are Escape Trainer's "Two-way escape" verdict (lines 1230–1236) and the Run or Safe? card "Kick to hit + safe" (lines 1708–1712).

## 2. Battle rules [PROPOSED]

- **Families.** Battles use bank entries from families 1, 2, 3, 7 and 8, where both sides share the same legal ball (designated OB, or the lowest ball in 9-ball). Family 6 is excluded, because 8-ball groups differ by side.
- **Opening.** The bot always plays first: it plays the entry's stored best shot (`entry.best.shot`) with its own execution noise (section 4). The player then answers. Opening retries:
  - Attempt a = 0..4 uses seed `hashSeed(battleSeed, 0, a)`. The first attempt that is not a Foul or Pot and does not leave a shot is the opening.
  - If all five fail, the opening is the noiseless stored best shot.
  - If even that is a Foul or Pot, the battle is "No result".
- **Outcome of every shot.** After `simulate(layout, executedShot)`:
  - **Foul** if `gateFor` returns `scratch`, `wrong-ball-first` or `no-rail`. The shooter loses ("Ball in hand").
  - **Pot** if `gateFor` returns `ob-pocketed`, meaning a ball dropped after a legal first contact with no scratch. The shooter wins ("Potted — keeps the table").
  - Otherwise compute `scorePosition(final, cueId, opponentTargets(rules, final, cueId))` with full kick lanes, and keep S (score) and D (direct threat).
  - **Left a shot** if D ≥ 0.35 (`D_SHOT`). The shooter loses.
  - Otherwise the turn passes.
- **Why D, not S, decides a sell-out.** The current formula scores distance safeties 0–20 even when they are well played (main spec §11, families 4 and 5). Using S < 30 would call a long, frozen, open leave a sell-out, which is a false lesson. D only reaches 0.35 when the opponent has a makeable pot.
- **Carry forward.** The next position is `{balls: sim.final, cueId, rules}` with the same rules. If `validateLayout` fails, the battle ends as "No result" and does not count.
- **Cap.** After the opening, at most 10 shots (5 each). Reaching the cap is a Draw.
- **Seeds.** `battleSeed = hashSeed(sessionSeed, 200 + battleIndex)`. Bot noise on turn t uses `mulberry32(hashSeed(battleSeed, t, 1))`. Player noise uses `mulberry32(hashSeed(battleSeed, t, 2))`. The opening is turn 0.

## 3. Execution model (shared) [PROPOSED]

New pure module `src/play/execution.js`. It has no DOM, no `Math.random` and no `Date` (main spec global constraint 5).

```
EXECUTION_LEVELS = {
  club:   { aimSd: 0.50, speedSd: 0.08, spinSd: 0.15 },
  strong: { aimSd: 0.30, speedSd: 0.05, spinSd: 0.08 },
  pro:    { aimSd: 0.15, speedSd: 0.03, spinSd: 0.04 },
}
gaussian(rng) -> number          // Box–Muller, cos branch: sqrt(-2 ln max(u1,1e-12)) * cos(2π u2), then clamped to [-2.5, 2.5]
perturb(shot, level, rng) -> Shot
```

`perturb` draws four normals in this order: aim, speed, spin.x, spin.y. Then:

- `aimDeg' = aimDeg + z1 · aimSd · (1 + 0.5·|spin.x|)`. The factor stands in for squirt and swerve, which the engine does not model: side english is harder to aim in real play.
- `speed' = clamp(speed · (1 + z2 · speedSd), 1, 150)`. The 150 in/s cap stays below the known non-smooth cushion region (acceptance checklist, Known limitations).
- `spin' = (x + z3·spinSd, y + z4·spinSd)`, scaled back onto the unit disk if |spin'| > 1.

For scale: the robustness grid (main spec §10) is ±0.2° and ±4%. Strong is about one standard deviation of that grid, and Pro is tighter.

## 4. The bot [PROPOSED]

### 4.1 Levels

| Level | Direct-mode search | Kick-mode choice | Noise |
|---|---|---|---|
| Club | `selectShots(layout, DIFFICULTY_GRID).fullSet[0].shot` (best cheap score, no full scoring) | best cheap score | `club` |
| Strong | `runSearch(layout, DIFFICULTY_GRID).best.shot` | full `scoreSafety` on the top 3 by cheap score | `strong` |
| Pro | `runSearch(layout, SUGGEST_GRID).best.shot` | full `scoreSafety` on the top 3 by cheap score | `pro` |

`selectShots`, `runSearch`, `DIFFICULTY_GRID` and `SUGGEST_GRID` are used unchanged from `src/search/`. The bot never calls Suggest seeded with a bank best, except for the opening (section 2).

### 4.2 Direct mode or kick mode

- **Direct mode** applies when `candidateShots(layout, DIFFICULTY_GRID)` is non-empty, meaning some legal ball has V ≥ 0.25 from the bot's cue, and the level's search returns a shot. Club's `fullSet` must be non-empty, and Strong's or Pro's `best` must be non-null.
- **Kick mode** applies otherwise.

### 4.3 Kick search

New pure function `kickCandidates(layout)` in `src/battle/kick-search.js`. It works in two stages, K1 then K2.

**K1 (find lanes).**
- For k = 0..719, simulate `aimDeg = k·0.5`, speed 60, spin (0, 0), with `{record: false, stopAtFirstContact: true, maxCushions: 2}`.
- Sample k counts as a lane hit when all of these hold:
  - `cueRailsBeforeContact` is 1 or 2
  - there is no scratch
  - `firstContactId` is in `rules.legalIds`
  - the first cue cushion event lies at least R from the cue's start (the R23 rule, as in `src/eval/kick.js`)
- Group the hits into circular runs of equal rail count.
- If K1 finds no hits at 60 in/s, repeat it at 90 in/s.

**Choosing runs.** Take up to 6 runs: one-rail runs first, then two-rail runs. Within each group, order by run length (descending), then by start index (ascending).

**Directions.** From each run, take its centre sample. Also take the samples at 25% and 75% of the run when the run is at least 4 samples long. That gives at most 18 directions.

**K2 (candidates).** Each direction is combined with speeds [30, 45, 65, 90] and spins [(0, 0), (0, −0.5), (0, 0.5)], in that order. Candidates are indexed in loop order: direction, then speed, then spin.

**Cheap score.** Simulate the candidate. A gated candidate scores 0. Otherwise the cheap score is `scorePosition(final, cueId, targets, {cheap: true}).score`. Ties go to the lower index.

**No lanes at all.** If K1 finds nothing at either speed, the bot plays straight at the centre of the first legal ball at 40 in/s. It is simulated, and it normally fouls. The banner reads "Bot found no legal kick".

### 4.4 Thinking time

The bot's search runs in the worker while the player's shot animates. The UI shows "Bot is thinking…" until the result arrives. The worker is never asked to stop early.

## 5. Study mode [PROPOSED]

Route: `#/study/battle`.

- **Start.** The player chooses a bot level (Club, Strong or Pro) and their own execution: Exact, Club, Strong or Pro. The default for both is Strong. The choice is fixed for the session.
- **Deals.**
  - A session is 10 battles.
  - Battle i takes the next entry from `entryStream(eligible, sessionSeed, 200)` (section 8), where eligible means bank entries from families 1, 2, 3, 7 and 8.
  - `#/study/battle?deal=<id>&level=<club|strong|pro>` starts one battle on that entry with `battleSeed = hashSeed(id, levelIndex)`, where levelIndex is club 0, strong 1, pro 2.
  - An unknown id shows "That layout isn't in this version" (main spec §11) and deals normally.
- **Player turn.** Same controls as Safety Studio: drag to aim, ±1° and ±0.1° nudges, the shared spin pad and speed control. Shoot applies the player's execution noise. The result line reads, for example, "Aimed 31.40°, played 31.62° (+0.22°), speed −3%".
- **Each shot.** The animation player replays the executed trajectory. A banner names the outcome (Foul, Pot, Left a shot, or "Safe — S 74, V 0, best kick 1 rail").
- **End of battle.** The summary shows:
  - the winner and the reason
  - each turn: who shot, the outcome, S and D
  - "Show a good safety" on any of the player's turns. This runs unseeded Suggest on that position. Its time is report-only, as in main spec §15.
- **Retry** replays the same battle seed from the opening. **Next battle** advances the session.
- **Session store.** `createSessionStore('battle', …)` holds the level, execution setting, session seed, battle index and results, so the session survives a refresh.

## 6. Table mode: "Answer the bot" [PROPOSED]

The bot cannot shoot at a real table, and the app cannot know real ball positions without precise tapping, which is an anti-goal. So the Table version is one exchange per position. The bot has played its opening safety, and you answer it for real.

Route: `#/table/battle`.

- **Deals.**
  - Positions come from `entryStream(eligibleTable, sessionSeed, 210)`, where eligibleTable is bank entries from families 1, 2, 3 and 8. These have at most 5 balls, so they are quick to place.
  - Each position is the bot's opening leave at the chosen level (section 2).
  - A session is 10 positions.
- **Screen.**
  - A placement diagram of the leave, with diamonds and ball ids, and the legal ball ringed.
  - Caption: "Bot (Strong) left you this. Play your answer."
  - Layout follows main spec §12 (phone portrait or iPad landscape).
- **Log, one tap on a button ≥ 64 px tall.** Points in brackets.
  - "Hooked them" (3)
  - "Legal, no easy shot for them" (2)
  - "Legal, left a shot" (1)
  - "Foul" (0)
  - One tap undoes the last log.
- **Reveal.** After logging, "Show a strong answer" runs the Pro-level choice (section 4.1, no noise) for the player's side and shows it with `describeShot` (section 8). Example: "One rail off the foot rail, medium, centre ball".
- **Storage and screen.** Session store and wake lock follow main spec §12.

## 7. Scoring (session only) [PROPOSED]

- **Study.**
  - Points per battle: Win 1, Draw 0.5, Loss 0. "No result" is excluded.
  - Session score = round(100 × points / decided battles).
  - Also shown: wins, draws and losses; the player's mean S over their shots that were neither foul nor pot; fouls; sell-outs (Left a shot).
- **Table.** Session score = round(100 × points / (3 × logged positions)). The tally per log category is also shown.

## 8. Reuse and new modules

**Reused unchanged:**
- engine: `simulate`, `validateLayout`
- eval: `gateFor`, `opponentTargets`, `scorePosition`, `scoreSafety`
- search: `candidateShots`, `selectShots`, `runSearch`, `DIFFICULTY_GRID`, `SUGGEST_GRID`
- deal: `mulberry32`, `hashSeed`
- worker: the bank loader
- UI pieces from Plan 1b: renderer, aim handle, spin pad, speed control, animation player, router, session store, wake lock

Nothing under `src/engine`, `src/geometry`, `src/eval`, `src/search/grid.js` or `src/search/search.js` changes, so the bank's `modelHash` is untouched.

**New modules (file names [BUILDER], contracts [PROPOSED]):**

- **`src/play/execution.js`** (shared): section 3.
- **`src/deal/stream.js`** (shared): `entryStream(entries, sessionSeed, salt) -> { next(usedIds: number[]): BankEntry|null }`.
  - Call k (counting from 0) computes `i0 = floor(mulberry32(hashSeed(sessionSeed, salt, k))() · n)`.
  - It then probes i0, i0+1, … mod n and returns the first entry whose id is not in `usedIds`. It returns null if every entry is used.
  - `entries` is in bank file order.
- **`src/play/describe.js`** (shared): `describeShot(layout, shot) -> {kind: 'direct'|'kick', target?: string, fullness?: '1/8'|'1/4'|…|'7/8'|'full', cut?: 'left'|'right', rails?: 1|2, firstRail?: Rail, spin: string, speed: 'soft'|'medium'|'firm'|'power'}`.
  - The kind and first rail come from simulating the shot with `stopAtFirstContact`. Zero cue cushions means direct.
  - Fullness = 1 − |b|/(2R), rounded to the nearest 1/8. b is the signed distance from the target's centre to the aim line.
  - The cut side is the side of the aim line on which the target's centre lies, seen from the cue looking along the aim.
  - Spin words: y ≥ 0.3 "follow", y ≤ −0.3 "draw", otherwise "centre". Then x ≥ 0.25 adds "right" and x ≤ −0.25 adds "left".
  - Speed words: below 30 "soft", 30 up to 66 "medium", 66 up to 106 "firm", 106 or more "power".
  - `Rail` is 'head' (x = 0), 'foot' (x = 100), 'left long' (y = 0) or 'right long' (y = 50), named as seen from the head end looking toward the foot.
- **`src/battle/kick-search.js`**: section 4.3.
- **`src/battle/battle.js`**: pure turn logic.
  - `openBattle(entry, level, battleSeed) -> BattleState`
  - `playTurn(state, intendedShot, who) -> BattleState`, which applies noise, simulates, classifies and carries forward
  - `botShot(layout, level) -> Shot`, which is section 4 with no noise
  - Shape: `BattleState = {layout, turn, history: {who, intended, executed, outcome, S, D}[], result: null|{winner: 'player'|'bot'|'draw'|'none', reason}}`
- **Worker messages** (in `src/search/handle.js`, which is not in the model hash):
  - `{type: 'battleOpen', dealId, level, battleSeed}`
  - `{type: 'battleTurn', state, shot}`: the player's turn, then the bot's turn if the battle continues. It returns both turns' trajectories for animation.
  - Each battle screen creates its own search client and terminates it when the route is left.

## 9. Physics and engine requirements and risks

- **Kicks.** Kicks carry this drill, so cushion behaviour matters most. Stage 1 only checks it qualitatively (main spec §15, "Cushions" and "Kicks"). The Banking spec, priority 1, owns quantitative cushion validation. If Banking changes cushion code, Battle inherits the fix through the shared engine and the bank rebuild that follows. Battle adds no physics of its own and needs no fix before it is built.
  - Known issue: a ball rolling into a rail keeps all its forward roll, so it comes back at about 0.33 of its impact speed, against a published figure of about half. Banking's fix E2 (Banking spec, §3) corrects this. Until then, multi-rail kicks and rail-first leaves are too dead. Battle doesn't block on it, but its bot benches (section 10, items 4–7) should be re-run after E2 lands.
- **Speeds.** Search grids stop at 130 in/s, kick speeds at 90, and executed shots are clamped to 150. Every shot stays out of the non-smooth cushion region above about 150 in/s (acceptance checklist).
- **Throw, squirt and swerve** are not modelled (main spec §9). The extra aim noise for side english in section 3 is the stand-in. Throw affects pots more than safeties, and the bot never aims to pot.
- **Distance safeties.** These score low under the current formula. Using D for sell-outs (section 2) keeps the battle from punishing a good distance leave.
- **Carry-forward.** Resting balls can overlap by up to about 0.004 in (`simulate.js` comment), which is below `EPS_LAYOUT`. The No-result rule covers any rare validation failure, and section 10 measures how often it happens.

## 10. Testing and success criteria

Each item below is a `node --test` case unless marked bench. Tolerances are [BUILDER] unless stated.

1. **Determinism.** The same entry, level, battle seed and player shots give an identical `BattleState`, including executed shots and outcomes.
2. **Noise model.** Over 10,000 draws per level, the sample standard deviation of aim error is within ±5% of `aimSd` times the truncation factor (truncated at 2.5σ). Speed is checked the same way. No executed speed exceeds 150, and no |spin| exceeds 1.
3. **Outcome rules.** Fixtures:
   - a scratch is a Foul
   - a blocker hit first is a Foul
   - legal contact with no rail is a Foul
   - a dropped OB is a Pot
   - main spec fixture F4 (open OB near a pocket, short range) is "Left a shot"
   - a length-of-table leave with both balls frozen and the OB visible (main spec §11 example) is not "Left a shot"
4. **Level separation (bench, report to owner).**
   - Positions: the first 4 entries of every family × band cell for families 1, 2, 3, 7 and 8 (at most 60).
   - Each level plays each position with 3 noise seeds.
   - Measured: mean S of the executed leave, and the bad-shot rate (Foul or Left a shot).
   - Pass requires mean S(Pro) ≥ mean S(Strong) + 5 ≥ mean S(Club) + 10, and bad-shot rate(Club) ≥ bad-shot rate(Pro) + 10 percentage points.
   - If it fails, stop and report the numbers. Do not retune σ values or `D_SHOT` (as main spec §10 does for fixtures).
5. **Kick search.**
   - Positions: nominal leaves of bank entries where V = 0 and `kickLanes` reports n1 ≥ 1.
   - For at least 90% of them, the noiseless Pro kick is not gated.
   - For 100% of them, `kickCandidates` returns at least one candidate.
6. **Bot time (bench, node, desktop) on 50 positions.** p95 per bot turn: Club ≤ 0.3 s, Strong ≤ 1.2 s, Pro ≤ 2.5 s. On-device times are recorded on the owner checklist as report-only.
7. **Carry-forward validity (bench).** In 200 Strong-vs-Strong battles (the harness plays both sides), at most 1% end as No result. The bench also reports median battle length and the win split.
8. **UI.** No main-thread task over 50 ms during a battle. All search runs in the worker (main spec §15).
9. **Bank untouched.** The `modelHash` test and bank re-validation still pass with no rebuild.
10. **`entryStream`.** Deterministic. No repeats until every entry is used. It returns null once all are used.

## 11. Non-goals and anti-goals

**Non-goals:**
- The bot attempting pots
- 8-ball group battles (family 6)
- More than one exchange in Table mode
- Tracking Elo or level across sessions
- Push-outs
- Jump shots (main spec §4)

**Anti-goals:**
- A bot whose levels play the same
- Battles decided by the distance-safety blind spot (section 2)
- Waiting on the bot with the UI frozen

## 12. Size and dependencies

**Size:** about 12 tasks.
- execution.js, stream.js and describe.js
- kick search
- battle logic
- worker messages
- Study UI
- Table UI
- tests and bench
- owner checklist items

**Depends on:** Stage 1b UI (renderer, controls, animation player, router, Table layout). It does not depend on Execute the Close. Both carry the cue ball forward, but Battle's carry-forward rule is self-contained.

It reuses the bank as built today. If the Banking work rebuilds the bank, the battle needs no change.

## 13. Open questions for the owner

1. **Does a pot end the battle as a win for the shooter?** Default: yes ("keeps the table"). If no, a pot voids the battle (No result), and pure safety play is all that counts.
2. **How is a sell-out defined?** Default: the leave gives the opponent direct threat D ≥ 0.35. If you prefer the safety score (for example S < 30), battles end sooner, and long open leaves count as losses even when played well.
3. **Player execution noise.** Default: Strong. With Exact, the player's shots are played exactly as aimed, so touchy safeties are never punished in the battle.
4. **Bot noise per level** (section 3). Default as tabled. Tightening Pro or loosening Club changes the level-separation bench, which is reported, not tuned.
5. **Table mode scope.** Default: one answer per position. The alternative is a full self-battle, where you also play the bot's side and log every shot. It is more realistic but slower, and it has no bot.
6. **Family 6 (8-ball).** Default: excluded. Including it needs group-swap rules, so each side's legal balls change on every turn.
