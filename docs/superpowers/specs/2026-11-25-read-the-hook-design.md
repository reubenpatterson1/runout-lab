# Read-the-Hook quiz: design

Date: 2026-11-25. Status: draft for owner review. New-drill priority 5 (owner, 2026-11-25).

Tags follow the Stage 1 spec (`docs/superpowers/specs/2026-11-24-runout-lab-rebuild-design.md`, "the main spec"): **[OWNER]**, **[PROPOSED]**, **[BUILDER]**. Line numbers refer to `legacy/index.html`.

The quiz reuses two shared modules from the Safety Battle spec (`2026-11-25-safety-battle-design.md`, §8): `src/deal/stream.js` and the `Rail` names in `src/play/describe.js`.

## 1. Intent and why

Winning safety battles starts with reading the table correctly (main spec §1):

- Am I hooked?
- How much of the ball can I see?
- Which rail gets me out?

The old app got this wrong itself. Its `evalSafety` checked only the centre line, so a half-visible ball counted as "hooked" (main spec §10; legacy meter at line 1087). Escape Trainer asked the player to "read the hook" (line 412) but never tested the read.

This is a fast visual quiz: one or two taps per card. It builds the instant read a player needs before choosing between a direct hit and a kick.

## 2. Card model [PROPOSED]

**What the viewer sees.**
- A card is a position, a viewer (the player at the cue ball) and the viewer's legal targets.
- V is the maximum, over those targets, of `visibility(cue, target, balls, [cueId])`.
- That function sweeps 32 rays across the target's contact cone (main spec §10.2). Let k = 32·V be the number of clear rays.

**Q1, "How much can you see?"** It uses four categories and three excluded bands. Borderline positions are never asked, because they can't be judged fairly by eye.

| k (clear rays out of 32) | Category | Button label |
|---|---|---|
| 0 | None | "None — I'm hooked" |
| 1–3 | excluded | |
| 4–13 | Some | "Less than half" |
| 14–18 | excluded | |
| 19–28 | Most | "More than half" |
| 29–31 | excluded | |
| 32 | All | "All of it" |

**Q2, "Best way out?"** It is asked only on None cards. When any of the ball is visible, the direct hit is the answer the quiz assumes, so Q2 is skipped.

The answer comes from `hookSamples` (section 6). This uses the same 360 one-degree engine kicks as `kickLanes`: speed `KICK_SPEED` (90 in/s), no spin, stop at first contact, at most 2 cushions, the direct-ray shortcut, and the R23 first-leg rule. For each sample it records the rail count and the first cushion.

Cushion indices map to `Rail` names:

| Cushion index | Rail |
|---|---|
| 0, 1 (y = 0) | 'left long' |
| 2, 3 (y = 50) | 'right long' |
| 4 (x = 0) | 'head' |
| 5 (x = 100) | 'foot' |

Samples whose first contact before the target is a jaw (event type `jaw`) are left out of the per-rail widths. They still count in the equivalence check (section 8).

For each rail r, width_r (in degrees) is the longest circular run of samples with 1 rail, a first cushion on r, and no jaw.

**Answer key:**
- If any width_r > 0, the correct answers are every rail whose width is at least 0.75 × the widest.
- Otherwise, if any two-rail sample exists, the answer is "Two rails".
- Otherwise the answer is "No clean kick".

The Q2 buttons are "Head rail", "Foot rail", "Left long rail", "Right long rail", "Two rails" and "No clean kick". Each rail's name is also drawn on that rail in the diagram, so the answer is clear in any orientation.

**Where positions come from.** They come from the shipped safety layout bank. For an entry e:
- The **initial** source is `e.layout`, seen from the shooter. Targets are `rules.legalIds`.
- The **leave j** source is `simulate(e.layout, shot_j)`, seen from the opponent. Here shot_j is `e.best.shot` with `ROBUST_GRID[j]` applied, for j = 0..8, as in `prepareSafety`. Targets are `opponentTargets(rules, final, cueId)`.
  - A gated leave is not a hook read, so it is skipped.
  - A leave that fails `validateLayout` is skipped.

These sources supply every category. Measured on a 1-in-6 sample of the bank (2026-11-25):

| Source | None | Some | Most | All | Excluded |
|---|---|---|---|---|---|
| Leaves | 1033 | 101 | 6 | 9 | 137 |
| Initial positions | 0 | 0 | 24 | 115 | 4 |

Among the nominal full-hook leaves, 110 had a one-rail lane, 15 had only two-rail lanes, and 8 had neither.

## 3. Session plan [PROPOSED]

- **Mix.** A session has 10 cards: 4 None, 2 Some, 2 Most and 2 All. The order is shuffled with `mulberry32(hashSeed(sessionSeed, 13))`. None gets the most cards because it carries Q2.
- **Filling slot i** (category c):
  - Draw entries with `entryStream(bank.entries, sessionSeed, 300)`, skipping entries already used in the session.
  - For each entry, test sources in this order: initial, then leave j for j = j0, j0+1, … (mod 9), where j0 = `hashSeed(sessionSeed, 310, i) % 9`.
  - The first source in category c fills the slot.
  - After 200 entries without a match, the slot takes the first source seen that was in a non-excluded category, and the card shows its real category.
- **Same seed, same cards.** The same session seed gives the same 10 cards.

## 4. Study mode [PROPOSED]

Route: `#/study/hook`.

**Card screen:**
- A bird's-eye diagram with the viewer's cue ball and the target(s) ringed. For 8-ball, the target is the group; for 9-ball, the lowest ball.
- A one-line prompt: "You're at the white. Your ball: the 3."
- Q1's four buttons.

**After Q1:**
- The app reveals the answer, marked correct or wrong.
- It overlays the 32 sweep rays: green where the target is hit first, red where blocked. "k of 32 clear" is written beside them.
- On None cards, Q2's six buttons follow.

**After Q2:**
- The app reveals the key.
- It draws each rail's widest one-rail lane as a band from the cue ball to the rail, labelled with its width in degrees.
- The caption reads: "Lanes at firm speed (90 in/s), centre ball. Softer or with english, the lanes move."

**Navigation.**
- Next moves on. There is no retry: a quiz answer is final.
- `#/study/hook?deal=<id>&src=<initial|0..8>` opens one card. An unknown id shows "That layout isn't in this version" and deals normally.

**Quick-fire (toggle, off by default).**
- Each card allows 6 s for Q1, plus 6 s for Q2 when it is asked.
- A countdown bar is shown.
- An unanswered question scores as wrong.

**Timing.** Answer time per question is recorded for the session summary.

**Session store.** `createSessionStore('hook', …)` holds the seed, card index and answers.

## 5. Table mode: "Read it at the table" [PROPOSED]

At the table, the player sees the hook from the cue ball's height, which is the real skill.

Placing balls from a diagram is approximate, though. Half an inch can turn a partial hook into a full one, so the app's answer key cannot grade a real placement. Table mode is therefore self-graded against the real table, and the app's read is shown only as a reference.

Route: `#/table/hook`.

- **Deals.** As in section 3, but only entries from families 1, 2, 3 and 8, which have at most 5 balls. A session is 10 cards, with the same mix.
- **Step 1, place.** A placement diagram with diamonds and ids. The answer is not shown.
- **Step 2, read.** The player looks from behind the cue ball, then taps one of the four Q1 buttons (≥ 64 px tall).
- **Step 3, check.** The app shows its own read from the diagram. It then prompts: "Check it: lay your cue from each edge of the cue ball to the same edge of your ball. Did your read match the table?"
  - The player logs "Matched" or "Didn't match", with one tap.
- **Step 4, escape.** This step appears only when the player read None and the check matched.
  - The player taps the escape they will use (the Q2 buttons).
  - They shoot it for real.
  - They log "Hit it", "Missed" or "Foul".
- **Logging and storage.** One tap undoes the last log. Session store and wake lock follow main spec §12.

## 6. Reuse and new modules

**Reused unchanged:**
- `visibility`
- `simulate`
- `validateLayout`
- `gateFor`, `opponentTargets`
- `ROBUST_GRID`
- `KICK_SPEED`
- `lanesFromSamples`
- `R`
- `entryStream`, `hashSeed`, `mulberry32`, `shuffle`
- the worker's bank loader
- the Plan 1b renderer, router, session store and wake lock

Nothing in the `modelHash` file set changes.

**New pure modules [file names BUILDER]:**

- **`src/hook/escape.js`**:
  - `hookSamples(balls, cueId, targetIds) -> {rails: 0|1|2, rail: Rail|null, jaw: boolean}[]`, of length 360.
    - It copies `kickLanes`' per-sample loop and decision exactly: direct-ray shortcut, R23 first-leg rule, rail count, scratch and legal first contact.
    - It also reads the first cue `cushion` or `jaw` event from `sim.events`.
  - `escapeKey(samples) -> {answers: (Rail|'two'|'none')[], widths: Record<Rail, number>, twoRail: boolean}`.
- **`src/hook/cards.js`**:
  - `cardFrom(entry, source) -> Card|null`
  - `planCards(bank, sessionSeed, entries) -> Card[]`, which does section 3
  - Shape:
    ```
    Card = {entryId, source: 'initial'|0..8, viewer: 'shooter'|'opponent', balls, cueId, targets, k, category,
            escape: null|{answers, widths, twoRail}}
    ```
  - `escape` is computed only for None cards.
- **Worker message.** `{type: 'hookCards', sessionSeed, table: boolean}` returns 10 Cards. The UI asks for them once per session and gets every answer before the first card shows, so feedback is instant.

**Why copy the loop.** `hookSamples` copies the `kickLanes` loop instead of changing `src/eval/kick.js`, because `src/eval` is frozen under the bank's `modelHash` (global constraint 15). The equivalence test in section 8 keeps the two from drifting apart.

## 7. Physics and engine requirements and risks

- **Q1 is pure geometry** (ray sweep at true ball size). Its answer is exact for the diagram. The excluded bands remove positions within about 2 rays of a boundary, so no card hinges on sub-degree judgement.
- **Q2 depends on the cushion model.** Rebound angles change with speed and spin (main spec §9.4–9.5). The key is defined at one stated condition, 90 in/s with centre ball, and the caption says so.
  - Stage 1 validated the cushion model only qualitatively.
  - Quantitative cushion validation belongs to the Banking spec, priority 1, which needs it for bank shots. If Banking changes cushion code, the bank is rebuilt and Q2 keys follow automatically, because cards are computed on the device from the engine.
- **Two-rail keys** compound cushion error, so the quiz never asks which two rails. It only asks whether two rails is the way out.
- **Known issue: cushion roll loss.** A rolling ball keeps its full topspin through a cushion impact. Banking's fix E2 (Banking spec, §3) corrects this. At 90 in/s the cue ball is still partly sliding at the first rail, so one-rail keys are affected less, but "Two rails" versus "No clean kick" can be wrong until that fix lands.
- **Jaw kicks** are left out of the rail key, because a point-jaw rebound is the least trustworthy part of the engine (see the Two-way spec, §7).
- **Speed.** Kick sweeps run at 90 in/s, below the non-smooth cushion region above about 150 in/s.

## 8. Testing and success criteria

1. **Equivalence with scoring.** On 50 positions (the nominal leaves of the first entries of each family × band cell), `lanesFromSamples(samples.map(s => s.rails), 1)` deep-equals `kickLanes(balls, cueId, targets)`.
2. **Rail mapping fixture.** In a hand-built layout, the cue ball is blocked from the OB and a single one-rail lane exists, off the foot rail. The key is `['foot']`, and widths are 0 for the other three rails.
3. **Tie rule.** In a fixture with two one-rail lanes on different rails, at width ratio 0.8, both rails are accepted. At ratio 0.7, only the wider rail is accepted.
4. **No ambiguous cards.** Over 500 session seeds, no card has k in 1–3, 14–18 or 29–31. At least 99% of slots get their planned category, and the rest are reported.
5. **Determinism.** Same seed, same 10 cards, including `k` and the escape keys.
6. **Speed.** `hookCards` p95 ≤ 1.0 s in node on desktop for a 10-card session. No main-thread task runs over 50 ms. Feedback after a tap appears within 100 ms.
7. **Offline.** The quiz works in airplane mode, because it needs only the precached bank.
8. **Accessibility.** The ray and lane overlays have text equivalents, such as "12 of 32 clear" and "Foot rail lane 6°". The buttons are keyboard-operable (main spec §14).

## 9. Non-goals and anti-goals

**Non-goals:**
- Choosing between a thin direct hit and a kick on partly visible cards
- Kick-and-hide (kick safe) evaluation
- Diamond-system arithmetic, such as Plus or Corner-5 (legacy line 456)
- Three-rail kicks
- Masse and jump escapes (main spec §4)
- History across sessions

**Anti-goals:**
- Asking a question whose answer turns on a sub-degree or single-ray judgement
- Grading a real-table placement against the diagram

## 10. Size and dependencies

**Size:** about 7 tasks.
- `escape.js` and its tests
- `cards.js` and the plan
- the worker message
- the Study UI and overlays
- the Table UI
- Quick-fire
- owner checklist items

**Depends on:**
- Stage 1b UI
- `entryStream` and `Rail` from the Safety Battle spec. If Read-the-Hook is built first, it brings those two small modules with it.

It needs no model change. It inherits any Banking cushion fix through the engine.

## 11. Open questions for the owner

1. **Q2 only on full hooks?** Default: yes. Asking it on partial hooks needs a rule for when a thin direct hit beats a kick. That is a judgement call the engine would hard-code, and it could teach the wrong habit.
2. **Excluded bands.** Default: about 2 rays around each boundary (k 1–3, 14–18, 29–31). Narrower bands give more variety but closer calls. Wider bands make the quiz easier.
3. **Card mix.** Default: 4 None, 2 Some, 2 Most, 2 All. More None cards means more escape practice. More Some and Most cards means more practice at "it's not as hooked as it looks".
4. **Rail tie tolerance.** Default: any rail at least 75% as wide as the best counts as correct. A stricter rule, such as only the widest, makes Q2 a test of fine lane widths that the engine may not get exactly right.
5. **Quick-fire.** Default: off, 6 s when on. Making it the default turns the drill into a reflex trainer.
6. **Table mode self-graded.** Default: yes, checked against the real table with the cue-edge check. The alternative, grading against the diagram, is unfair whenever the placement is a little off.
