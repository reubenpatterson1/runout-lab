# Runout Lab Stage 1b: shell, Safety Studio UI, Table door (design)

Date: 2026-11-25. Status: draft for owner review.

Tags follow the main spec (`2026-11-24-runout-lab-rebuild-design.md`): **[OWNER]** decided by the owner, **[PROPOSED]** stands unless the owner corrects it, **[BUILDER]** the implementer decides. Section numbers like "§11" refer to the main spec. Line numbers refer to `legacy/index.html`.

## 1. Scope

Stage 1a is built and merged: engine, geometry, eval, search worker, layout bank (858 entries), pure dealing (`src/deal/bank.js`), service worker, session store, wake lock, bench and the owner checklist. What remains of §16 Stage 1 is the part that needs a look:

- the Study/Table shell with hash routing (§8, §14);
- the rebuilt Safety Studio screen wired to `src/search/client.js` and the bank (§11);
- session scoring UI, the reroll "no alternative" state, hint display;
- the Table door (§12, Stage 1 part only);
- the update prompt (§13).

§11 already defines Safety Studio behaviour (bank dealing, session plan, reroll seeds, Retry, URLs, examples, Suggest seeding). This spec does not restate it. It covers screens, controls, wiring, copy and tests.

No file under `src/engine/`, `src/geometry/`, `src/eval/`, `src/search/grid.js` or `src/search/search.js` changes in Stage 1b, so `modelHash` (R36) is unchanged and **no bank rebuild is needed**. `src/search/handle.js` and `src/search/client.js` are outside the hash.

## 2. Intent and why

The owner's aim (§1) is to win safety battles. Safety Studio is the first rebuilt module that trains it: real physics, scored by how hard the opponent's next shot is, dealt from layouts that are known to have a good answer. Stage 1b turns the tested engine and bank into something the owner can play on a phone or iPad, offline, without the old app's clumsy controls.

## 3. Pending owner decisions folded in as defaults

Each is written into this spec using the default shown. Section 19 lists them as open questions.

- **(a) Hint speed [PROPOSED].** "Show a good safety" displays the stored best shot instantly for bank deals and examples. Suggest runs only for layouts the player has edited (section 9.7). Reason: seeded Suggest measured 1.75–1.85 s worst case against the 1.5 s budget (checklist §3), and the stored best is already the search result.
- **(b) Thin easy band [PROPOSED].** Accept it for Stage 1b. No rebuild now. The next bank rebuild (`2026-11-25-module-ports-design.md` M1, merged with Banking B0) re-measures bands and is the place to raise the layout limit. The UI handles the consequences: easy slots repeat across sessions, and reroll on an easy slot often has no alternative (section 9.5).
- **(c) Examples below 70 [PROPOSED].** Keep the three examples as they are and show their honest stored scores with the label `No safety scoring 70 found` (§11, already [OWNER]).
- **(d) Safari pass mark [PROPOSED].** On Safari, where the Long Tasks API is missing, "max requestAnimationFrame gap < 50 ms" stands in for "no main-thread task over 50 ms".
- **(e) Visual direction [PROPOSED].** Adopt the legacy look now used by `index.html` (commit `bcb634c`) as the chosen direction. This replaces the mockup round in §18.1 and §18a.1. Section 4 lists the accessibility corrections it needs.

## 4. Visual direction [PROPOSED]

- **Tokens.** Use the `:root` tokens in the current `index.html` unchanged: `--bg #0a0e0c`, `--panel #101814`, `--panel2 #0c110e`, `--brass #c8a24c`, `--brass2 #ecd28a`, `--brass-dim #8f7536`, `--ink #ece7d6`, `--muted #899389`, `--faint #5a655c`, `--chalk #54b6d6`, `--amber #e7a23e`, `--green #62b986`. Add `--red #df6a4f`, `--rail #241b12`, `--rail2 #160f09` from legacy lines 12–15.
- **Fonts.** Oswald (headings, buttons), Archivo (body), Space Mono (labels, numbers), self-hosted, as now.
- **Contrast fixes (§14 AA 4.5:1).** Measured against `--bg`: `--faint` is 3.2:1 and `--brass-dim` 4.4:1, so both fail as text colours. Rule: `--faint` and `--brass-dim` are used only for borders, rules and decoration. Text that uses them today (`.hint`, `.tagline`, `.tab .ix`, `.kicker`, `footer`, the navcard "open →") switches to `--muted` (6.1:1) or `--brass` (8.1:1, for `.kicker` and `.tab .ix`).
- **Size fix (§14 12 px).** No text below `0.75rem`. Today `.tab .ix` (.62rem), `.tagline` (.66rem), `.pill` (.66rem), `.kicker` (.7rem), `footer` (.7rem) and the navcard label (.62rem) are smaller; each becomes `0.75rem`.
- **Intros.** Screen intros are at most two sentences. The long legacy ledes are not carried over.
- **All caps** stays for headings, tabs and buttons (Oswald), as in the current home. Body text is sentence case.
- **Table drawing.** Port the legacy `Felt.table()` look (lines 581–604): rail bed `#1c140c`, felt gradient `#19543a → #14442f → #0e3322`, brass diamonds at the 1/8 and 1/4 marks. Pockets are drawn from the engine's `POCKETS` and `JAWS` (true mouth size), not legacy radii. Ball colours come from legacy `BALLCOL` (line 545): cue `#f2eedd`, designated object ball `#cf4631`, blockers `#2f6fb0`, numbered balls by number; balls 9–15 get a white band.

## 5. Shell and routing [PROPOSED]

`index.html` becomes the shell: header, nav, update button, `<main id="app">`, one `<script type="module" src="src/app.js">`. All CSS stays inline in `index.html`. `src/home.js` is deleted; its wake-lock check moves to the Table door.

**Header (every route).** Brand (links to `#/`), tagline, and the module nav from the current `index.html`, in the same order: Diagnosis, Position Lab, The Closer, Safety Studio, Escape Trainer, Run or Safe?, Table Drills. Safety Studio's link becomes `#/study/safety`. The others keep `legacy/index.html#<tab>`, so every unported module stays one tap from any screen (§15 continuity). The nav is a `<nav aria-label="Modules">` of links; the current route's link gets `aria-current="page"` and the `.active` style. This is the correct ARIA pattern for page navigation; §14's "ARIA tab pattern" applies to in-screen tab sets, and Stage 1b has none.

**Routes.** `src/ui/router.js` exports a pure `parseHash(hash: string): {path: string, params: Record<string,string>}`. The query part after `?` is split on `&` and `=` and decoded with `decodeURIComponent`. Routes:

| Hash | Screen |
|---|---|
| `''`, `#`, `#/` | Home |
| `#/study` | Study list |
| `#/study/safety` | Safety Studio, session mode |
| `#/study/safety?deal=<id>` | Safety Studio, single mode (bank entry) |
| `#/study/safety?example=<slug>` | Safety Studio, single mode (example) |
| `#/table` | Table door |
| anything else | Home (hash replaced with `#/` via `history.replaceState`) |

`deal` is valid only if it matches `/^\d+$/`. If both `deal` and `example` are present, `deal` wins.

On `hashchange` the router unmounts the current screen (each screen exports `mount(el, params): () => void`; the returned function unmounts it: stops animation, removes listeners, releases nothing else) and mounts the next. Focus moves to the new screen's `<h1>`.

**Home `#/`.** Hero: kicker `Training hub`, title `Close the rack. Win the safety battle.`, lede `Safety Studio is rebuilt. The other modules open the current version.` Then two door cards side by side (stacked below 820 px): **Study** (`#/study`, "Simulated drills and theory at a desk or on your phone") and **Table** (`#/table`, "Run drills at a real table and log what happened").

**Study list `#/study`.** The six Study cards from the current `index.html`. Safety Studio's card links to `#/study/safety`, copy: "Ten dealt layouts. Each safety is scored by how hard your opponent's next shot is." Pills: `hide`, `kick`, `rail`. The other five cards keep their legacy links and copy, except Escape Trainer, whose copy drops the word "calculator" (§17): "Kick out of hooks with the mirror system and see where the cue ball really goes."

## 6. Shared UI components [PROPOSED]

All under `src/ui/`. Pure helpers are exported separately from DOM code so node can test them.

- **`table-view.js`: renderer.** `createTableView(canvas)` returns `{draw(scene), toTable(clientX, clientY), toScreen(p), pxPerIn}`. Drawn rail width is 5 in, so the canvas aspect is 60:110. CSS width fills the container; height follows the aspect. Device pixel ratio is capped at 2. A `ResizeObserver` triggers a redraw. The felt, rails, diamonds and pockets are drawn once per resize into an offscreen canvas and blitted each frame. Ball draw radius is `max(R · pxPerIn, 3.5)` px, so it is true scale on every target device. `scene` = `{balls: Ball[], colours: Record<id,string>, labels: Record<id,string>, aim?: {from, to, ghost: {x,y}|null}, handle?: {x,y}, traces?: {id, pts: {x,y}[]}[], ghosts?: {x,y}[], highlight?: string[]}`.
- **`aim.js`: aim state (pure).** `normDeg(a)` maps to (−180, 180]. `nudge(aimDeg, delta)`. `defaultAim(layout)`: the direction from the cue to the centre of the legal ball with the highest `visibility` (from `src/geometry/visibility.js`); ties go to the lower layout index. `aimPreview(layout, aimDeg)`: walks the straight ray from the cue with `firstBallOnRay` and the cushion lines (ball centre at R from each cushion) and returns `{end: {x,y}, hitId: string|null}`. Only the straight first leg is shown; no rebound line and no predicted path after contact. Reason: a full predicted path would hand the player the answer.
- **Aim input.** The aim handle sits on the aim line at `max(14 in, 36 px)` from the cue centre and has a 44 px hit circle. Dragging it sets `aimDeg = atan2(p − cue)`. Four nudge buttons under the table: `↺ 1°`, `↺ 0.1°`, `↻ 0.1°`, `↻ 1°` (↻ adds, because y points down the screen). Keyboard on the focused canvas: ←/→ = −1°/+1°, Shift+←/→ = −0.1°/+0.1°.
- **Touch handling (§14).** The canvas uses `touch-action: manipulation`. A non-passive `touchstart` listener calls `preventDefault()` only when the touch starts within the handle's hit circle (or on a ball in edit mode). Every other touch scrolls and zooms the page normally. Drags use Pointer Events with `setPointerCapture`.
- **`spin-pad.js`.** A 96 px circle. Pointer down or drag sets the tip point; `spin = offset / padRadius`, clamped to the unit disk and rounded to 0.05. Focusable (`tabindex=0`, `role="group"`, `aria-label="Cue tip position"`); arrow keys move 0.1, `0` or Home re-centres. A text label under it reads like `follow 0.60 · right 0.20` or `center`, and is `aria-live="polite"`.
- **`speed.js`.** `<input type="range" min="8" max="130" step="1">` with −/+ buttons (44 px) stepping 1 in/s, and an `<output>` reading `40 in/s · medium`. Words: < 25 `soft`, 25–59 `medium`, 60–94 `firm`, ≥ 95 `hard`. Default 40. The 130 cap matches the bank's speed cap and keeps shots below the speed where cushion rebound is known to be rough (checklist known limitations). §19 left the units to the builder; this fixes them as in/s.
- **`player.js`: animation player.** Pure `positionsAt(sim, t)` returns each ball's position at time t by binary search and linear interpolation of `sim.trajectories` (sampled every 0.01 s by the engine), and `visibleAt(sim, t)` hides a ball from the time of its `pocket` event. `play(view, sim, {onDone})` replays in real time with `requestAnimationFrame`, drawing traces for the cue ball (`--chalk`) and every other ball that moved (`--amber`, 50% alpha). It returns `{skip(), cancel()}`. A **Skip** button jumps to the final frame. With `prefers-reduced-motion: reduce` it draws the final frame and traces at once.
- **`update-banner.js`.** Wires `registerServiceWorker` (unchanged) to the `#update` button (section 11).
- **`session-store.js`, `wake-lock.js`.** Unchanged from Stage 1a.

## 7. Worker protocol additions [PROPOSED]

Two request types are added to `src/search/handle.js`. Neither needs the bank.

| Request | Result |
|---|---|
| `{type: 'simulate', layout, shot}` | `simulate(layout, shot, {record: true})`: the full `SimResult` |
| `{type: 'score', layout, shot}` | `scoreSafety(layout, shot)`: a `SafetyScore` |

`src/search/client.js` gains `simulate(layout, shot)` and `score(layout, shot)`. Errors use the existing `{type: 'error', message}` path.

The worker is single-threaded and answers in order. Shoot sends `simulate`, then `score`. `simulate` returns within a few milliseconds (node measured 1.1 ms mean, 6 ms max on bank shots), so the animation starts at once. `score` takes about 0.5–0.8 s in node and longer on a phone; it runs while the animation plays.

Every screen request carries a generation number held by the screen. A response whose generation is older than the current one (the player moved on) is ignored.

**Cancel.** Cancelling an in-flight Suggest calls `client.terminate()` and creates a new client. Rejections from the old client are ignored. The new worker re-reads the bank from the cache (measured 38 ms round trip).

## 8. Safety Studio layout [PROPOSED]

**Below 900 px wide (phone portrait, iPad portrait):** top to bottom: status line, table canvas (full width), control block. **900 px and wider (iPad landscape, desktop):** table on the left (62% width), status line and control block on the right. No horizontal scrolling at any width.

**Aim-and-shoot must fit without scrolling (§14)** at 390 × 664 CSS px (iPhone 12 Safari with toolbars) and 412 × 780 (Pixel 6a). Height budget at 390 wide: header 96, status 32, table 204, nudges 44, spin pad and speed 96, Shoot row 52, gaps 32: total 556.

**Status line.** Session: `Deal 3 of 10 · Medium · Rail tuck or freeze · Avg 72`. Single mode: `Layout #<id> · Medium · Rail tuck or freeze` or `Example · Rail tuck`. Family names come from `FAMILIES` in `src/deal/families.js`. `Avg` is omitted until the first deal is scored.

**Control block, aiming state:** nudge row; spin pad with speed control beside it; a row with **Shoot** (primary, 52 px tall) and **New layout** (secondary). In single mode, **New layout** is replaced by **Start a session** (links to `#/study/safety`). Under the row, small links: `Examples: Open hook · Rail tuck · Behind the 8` (to `?example=<slug>`), and the deal id with **Copy link** (copies `<page URL without hash>#/study/safety?deal=<id>`; if the clipboard call fails, the link is shown as selectable text).

**Result state** replaces the control block: score panel (section 9.3), then a button row **Retry**, **Show a good safety**, **Next layout** (the last slot shows **Finish session**). In single mode **Next layout** is absent. **Move balls** sits under the row (section 9.7). In the result state the page may scroll.

## 9. Safety Studio behaviour and wiring [PROPOSED]

### 9.1 Opening the screen

- **Session mode** (`#/study/safety`). Load the session store `createSessionStore('study-safety', null)`. If it holds a session that is not `done`, resume at its current slot. If it is `done`, show its summary. If it is empty, start a new session (section 10).
- **Single mode, deal.** `client.byId(id)`. If the result is `null`, show the notice `That layout isn't in this version` (`MISSING_DEAL_TEXT`), replace the hash with `#/study/safety`, and continue in session mode (§11).
- **Single mode, example.** `client.example(slug)`. If `null`, same handling as a missing deal.
- **Loading.** While waiting, the table area shows `Loading layouts…`. If the request rejects (for example `bank load failed` on a first visit with no signal), show `Couldn't load the layouts. Check your connection, then try again.` with a **Try again** button that repeats the request.

### 9.2 Aiming and shooting

On a new deal: balls drawn at their layout positions, aim = `defaultAim(layout)`, spin centred, speed 40 in/s. The aim preview line and ghost ball update on every aim change.

**Shoot** disables all controls, sends `simulate` and `score` with the current `{aimDeg, speed, spin}`, plays the animation when the simulation arrives, and enters the result state when both the animation has finished (or been skipped) and the score has arrived. If the score is still pending after the animation, the score panel shows `Scoring…`.

### 9.3 Score panel and copy

The copy lives in a pure module `src/study/safety-copy.js` so it can be tested.

- **Gates** (score 0, shown in `--red`): `scratch` → `Scratch: ball in hand to your opponent`; `wrong-ball-first` → `Foul: wrong ball first`; `no-rail` → `Foul: no rail after contact`; `ob-pocketed` → `Not a safety: you pocketed the object ball`.
- **Verdict by total:** ≥ 85 `Lock-up`; 70–84 `Good safety`; 50–69 `Playable`; 25–49 `Weak`; < 25 `Sells out`.
- **Breakdown rows** from the `SafetyScore`:
  - `Hidden: <round((1−V)·100)>%`.
  - If V = 0, the kick row by `kick.rails`: 1 → `Their best escape: 1-rail kick · <n1> lane(s), widest <w1.toFixed(1)>°`; 2 → `Their best escape: 2-rail kick · <n2> lane(s), widest <w2.toFixed(1)>°`; 3 → `No 1- or 2-rail kick for them`.
  - If V > 0: `Direct shot threat: <round(directThreat·100)>%`.
  - `Cue ball on a rail: <round(cueRestriction·100)>%`.
  - `Robustness: <label> · range <min>–<max>`, where min and max are the rounded minimum and maximum of `robustness.scores`. The row is absent when the shot is gated.
- **Session context:** after the slot's first shot, `Counts for the session`. After later shots on the same slot, `Practice: doesn't count` (section 10).

### 9.4 Retry and hint

- **Retry** returns to the aiming state on the dealt layout (§11) with the last aim, spin and speed kept.
- **Show a good safety** is enabled only in the result state (§11: "after each shot"). For a bank deal or an example it uses the stored `best` with no search: it sends one `simulate(layout, best.shot)`, replays it, and shows `Best found: <best.score.total>` plus the breakdown of `best.score`. If the total is below 70 (examples only), it adds `No safety scoring 70 found` (`exampleLabel`). A **Try this shot** button loads the exact stored `aimDeg`, `speed` and `spin` into the controls (the speed output shows the value rounded to 1 in/s) and returns to the aiming state. Shots after that are practice.

### 9.5 New layout (reroll) and the "no alternative" state

**New layout** is enabled only in the aiming state, before the slot's first shot, in session mode, and while the slot's `noAlt` is false. It calls `client.reroll(seed, slot, r, currentId, usedIds)` with `r = slot.rerolls + 1` and `usedIds` = the ids of all dealt slots (§11, as read by ambiguity A3 of the Stage 1a amendment plan).

If the result is `null`, set `noAlt = true` for the slot, keep the current layout, disable **New layout**, and show under the button: `No other <band> layout left for this family. Play this one or move on.` `pickEntry` returns `null` only when every entry in the cell is excluded, and the exclusion set does not depend on `r`, so a `null` is final for that slot. With the current bank this is common on easy slots: family 6 easy has 1 entry and family 7 easy has 3.

### 9.6 Next layout and the summary

**Next layout** is enabled once the slot's first shot is scored. It advances the session and deals the next slot with `client.deal(seed, slot, usedIds)`. After slot 10, **Finish session** shows the summary (section 10).

### 9.7 Edited layouts (Move balls)

This exists so the hint-speed default (a) has a meaning for non-bank layouts, and because the legacy studio let the player drag balls (lines 1150–1156).

- **Move balls** is available in single mode at any time, and in session mode only after the slot's first shot is scored, so editing never affects the session score.
- In edit mode, a pointer down within 22 px of a ball centre picks the nearest ball; dragging moves it, clamped to the playing area. On release the layout is checked with `validateLayout` and the 2R − 1e-6 spacing rule. If either fails, that ball returns to where it was before the drag. **Done** leaves edit mode. Ball moving is pointer-only; there is no keyboard equivalent in Stage 1b.
- Once any ball has moved, the status line adds `Edited layout`, and every shot on it is practice. **Restore layout** returns to the dealt layout and its stored best.
- **Show a good safety** on an edited layout runs `client.suggest(layout, null)`. While it runs, the panel shows `Searching for a good safety… <s> s` (whole seconds, updated each second) with **Cancel**, and Shoot, Retry and hint are disabled. On a result: if `best` is `null`, show `No legal safety found from here`. Otherwise replay `best.shot` and show its breakdown, with `No safety scoring 70 found` when the total is below 70.

## 10. Session scoring [PROPOSED]

Pure module `src/study/safety-session.js`. The state is saved with `createSessionStore('study-safety', null)` after every change, so a refresh, a screen lock or an update reload resumes in place.

```
SafetySession = {
  seed: number,          // session seed, 0 ≤ seed < 2^31
  slot: number,          // current slot, 0..9
  slots: { id: number, family: number, band: Band, rerolls: number, noAlt: boolean,
           score: number|null, gate: Gate|null, best: number }[],   // one per dealt slot
  done: boolean }
```

Functions: `newSession(seed)`, `addDeal(s, entry)`, `applyReroll(s, entry|null)`, `recordShot(s, score)`, `advance(s)`, `usedIds(s)`, `average(s)`, `summary(s)`. All are pure and return a new object.

- **New session seed:** `crypto.getRandomValues(new Uint32Array(1))[0] >>> 1`.
- **Deal score:** the total of the slot's **first** shot, 0–100, gated shots 0. Later shots on the slot (Retry, Try this shot, edited layouts) are shown but never change it. Reason: in a match the player gets one attempt.
- **Running average:** `Math.round` of the mean of scored slots; `null` before the first.
- **Good safeties:** the count of slots with score ≥ 70.
- **Summary screen:** `Session average <avg>` with a verdict: ≥ 80 `Lock-down defence`, 65–79 `Solid`, 50–64 `Leaky`, < 50 `Giving them shots`. Then `Good safeties: <n>/10` and a 10-row table: slot number, family name, band, your score (or the gate name), best found (`slot.best`). Each row links to `#/study/safety?deal=<id>`. **New session** asks `Start a new session? This session's scores will be cleared.` with `window.confirm`; on OK it clears the store and starts a new session.
- Rerolling does not cost points and does not advance the session (§11).

## 11. Update prompt (§13) [PROPOSED]

- The `#update` button sits directly under the header on every route, hidden until `onUpdateReady` fires, with the exact text `New version available — tap to reload`. Its container is `role="status"`.
- Tapping it calls the `apply` callback from `registerServiceWorker`, which posts `SKIP_WAITING`; the page reloads once on `controllerchange` (existing Stage 1a logic).
- Because the Safety Studio session is saved after every change, reloading mid-session resumes the same slot. An in-flight animation or search is simply lost; the slot's first-shot score is kept only if it had already arrived.

## 12. Table door `#/table` (§12, Stage 1 part) [PROPOSED]

Table Drills are not ported in Stage 1b (`2026-11-25-module-ports-design.md` M7). The door:

- Title `Table`, one-sentence lede: `Run drills at a real table. Until the new drill screens ship, drills open the current version.`
- One large card **Table Drills** linking to `legacy/index.html#drills`, listing the eight drill names from legacy `DRILLS` (lines 1760–1800). Note under it: `Logs in the current version last for this visit only.` (On Pages the legacy app stores logs in memory, lines 1752–1755.)
- The wake-lock check panel moved from the current home, with the same button text, status text and fallback tip (`Wake lock not available (<reason>). Set Auto-Lock to Never: Settings → Display & Brightness → Auto-Lock.`).
- Buttons on this screen are at least 64 px tall (§12).

Wake lock cannot carry over into the legacy page, which is a separate document. Until M7, the tip to set Auto-Lock to Never is the table-side answer.

## 13. Accessibility (§14) [PROPOSED]

- Each screen has one `<h1>`. Focus moves to it on route change.
- The table canvas has `role="img"` and an `aria-label` that names the deal and its balls, for example `Table. Cue ball, object ball, 3 blockers. Aim 12.4 degrees.` The label updates when aim changes, at most once per 250 ms.
- After each shot, the verdict and total are announced through an `aria-live="polite"` region.
- Every button and control is reachable and operable by keyboard, except ball moving in edit mode (section 9.7).
- Touch targets are at least 44 px; the aim handle hit circle is 44 px.
- Viewport meta stays `width=device-width, initial-scale=1` (no `maximum-scale`, no `user-scalable=no`).

## 14. Files

Created: `src/app.js` (boot, router outlet, Home view), `src/ui/router.js`, `src/ui/table-view.js`, `src/ui/aim.js`, `src/ui/spin-pad.js`, `src/ui/speed.js`, `src/ui/player.js`, `src/ui/update-banner.js`, `src/study/index.js` (Study list), `src/study/safety-studio.js` (screen glue), `src/study/safety-session.js`, `src/study/safety-copy.js`, `src/table/index.js` (Table door). Tests: `test/router.test.js`, `test/aim.test.js`, `test/player.test.js`, `test/safety-session.test.js`, `test/safety-copy.test.js`.

Modified: `index.html`, `src/search/handle.js`, `src/search/client.js`, `src/precache.js` (FILES), `sw.js` (stamped), `test/site.test.js`, `test/search-worker.test.js`, `bench/bench.js`, `bench/index.html`, `docs/acceptance-checklist.md`.

Deleted: `src/home.js` (and removed from FILES).

File names are [BUILDER] if a better split appears, but the pure/DOM split and the test list are fixed.

## 15. Physics and engine requirements

The UI adds no physics. What it relies on, and the risks:

- **Real-time replay.** Trajectories are sampled every 0.01 s, so linear interpolation at 60 fps is exact enough. Long shots replay for their full simulated duration; **Skip** covers impatience.
- **Speed cap 130 in/s.** Cushion rebound is not smooth above about 150 in/s (checklist known limitations). The speed control stops at 130, and robustness variants reach at most 135.2 in/s (R35), so players never see the rough region.
- **Straight aim preview.** The engine has no swerve or squirt, so the cue's path to first contact is straight for any spin. The preview is therefore true. It stops at first contact so it never shows a rebound the engine might compute differently.
- **Scoring latency.** `scoreSafety` measured 0.53 s mean and 0.80 s max in node on 22 bank shots. On a phone expect 2–4 times that. It overlaps the animation, so most shots show the score as the balls stop.

## 16. Testing and success criteria

Stage 1b is done when all of these pass.

**Node tests (`npm test`).**

- `parseHash`: every row of the route table, `deal` validation, `deal` beating `example`, unknown routes.
- `aim`: `normDeg` range; nudges; `defaultAim` picks the most visible legal ball and breaks ties by index; `aimPreview` ends at the first ball contact or the cushion line.
- `player`: `positionsAt` equals the trajectory samples at sample times and interpolates between them; balls disappear at their pocket event; t beyond `duration` returns final positions.
- `safety-session`: the first shot sets the score and later shots do not; reroll `null` sets `noAlt`; `advance` stops at slot 9 and sets `done` after it; `average` rounds; `summary` rows match slots; the state round-trips through `createSessionStore` with a stub storage.
- `safety-copy`: every gate string, every verdict band edge (24/25, 49/50, 69/70, 84/85), kick rows for rails 1, 2 and 3.
- **Session determinism through the UI path.** For 200 seeds, driving `safety-session` with `dealSlot` results (no rerolls) yields exactly `dealSession(bank, seed)` ids.
- **Worker messages.** `simulate` and `score` through `createHandler` deep-equal direct `simulate(..., {record: true})` and `scoreSafety` calls on 3 bank entries.
- **Site.** `index.html`: links `legacy/index.html#plan`, `#position`, `#closer`, `#escape`, `#decide`, `#drills` and `#/study/safety`; does not link `legacy/index.html#safety`; loads `src/app.js`; has `id="update"`; has no `maximum-scale` or `user-scalable=no`; no text rule below `0.75rem`.
- Precache tests pass (new files listed, `src/home.js` removed, hash stamped).

**Bench additions (report on device).** `hint replay round trip` (client `simulate` on each `sampleCells(bank, 2)` best shot): median and max. `score round trip` (client `score` on the same shots): median and max.

**Owner checklist (added to `docs/acceptance-checklist.md`).**

1. **Hint speed.** On the iPad, tapping **Show a good safety** on a bank deal starts the replay within 250 ms (bench `hint replay round trip` max ≤ 250 ms).
2. **No freeze.** During shooting, scoring, replay, edited-layout Suggest and bank load: Chrome reports 0 main-thread long tasks; Safari reports max rAF gap < 50 ms (decision d).
3. **Smooth replay.** During a 5 s replay, at least 95% of frame gaps are ≤ 20 ms and the maximum is < 50 ms (Safari timeline or DevTools performance panel).
4. **Phone fit.** At 390 × 664 and 412 × 780, aim, spin, speed and Shoot are all visible without scrolling.
5. **Offline session.** In airplane mode, the installed app cold-starts and plays a full 10-deal session, including hints.
6. **Update mid-session.** With a new version deployed, tapping the update button mid-session reloads into the same slot with earlier scores intact.
7. **Lighthouse accessibility ≥ 90** on `#/`, `#/study` and `#/study/safety`.
8. **Installable** (DevTools Application panel), as in Stage 1a.

## 17. Non-goals and anti-goals

Non-goals: porting any other module; rebuilding the bank; a predicted path after first contact; keyboard ball moving; sharing or exporting sessions; session history beyond the current session; Table drill screens (M7).

Anti-goals (fail the stage): any engine, scoring or search call on the main thread (everything goes through the worker, except the cheap `visibility`/`firstBallOnRay` aim helpers and `validateLayout`); a session score that changes after the slot's first shot; a hint that shows a different shot or score than the bank stores; the page scrolling during an aim drag; a Table door that needs precise tapping.

## 18. Size and dependencies

Size: about 12 tasks (shell and router; renderer; aim, spin, speed; player; worker messages; session module and copy; Safety Studio screen; edit mode and Suggest cancel; Table door and update banner; site/precache tests; bench additions; checklist update).

Depends on: Stage 1a (done). The owner answering (e) before shell CSS work starts. Nothing depends on the bank being rebuilt. Later stages reuse every `src/ui/` component and the worker `simulate`/`score` messages.

## 19. Open questions for the owner

1. **Hint speed (a).** Default: show the stored best instantly for bank deals and examples; run Suggest only for edited layouts, with a seconds counter and Cancel. This replaces the §15 "seeded Suggest ≤ 1.5 s" budget with "hint replay starts ≤ 250 ms". If you pick "slower hint with progress", every hint runs seeded Suggest (about 2 s worst case on desktop, more on iPad) and edit mode becomes optional. If you pick "shrink the Suggest grid", that changes `src/search/grid.js`, which is in the model hash, so it needs a bank rebuild of about 2 hours before Stage 1b ships.
2. **Visual direction (e).** Default: adopt the legacy look of the current `index.html` as the chosen direction, with the contrast and 12 px fixes in section 4, and skip the mockup round. If you want mockups instead, shell and Safety Studio UI work waits for your pick; the worker, session and copy modules can still be built.
3. **Thin easy band (b).** Default: accept it for Stage 1b and fix it in the M1 bank rebuild, which re-measures bands under the distance-safety update. If you pick "rebuild now with a higher layout limit", Stage 1b adds a 2–3 hour rebuild and a checklist re-run first. If you pick "revisit the easy threshold", that is a §11 spec change, and it is best made together with M1 so the bank is rebuilt once.
4. **Examples below 70 (c).** Default: keep them with their honest scores (65, 60, 65) and the label. Alternatives: move their balls so each has a ≥ 70 answer (edits `src/deal/fixed.js`, which is in the build hash, so the examples must be re-searched in a rebuild), or replace them with three named bank entries you choose (no rebuild).
5. **Safari pass mark (d).** Default: max rAF gap < 50 ms on Safari stands in for the long-task check. If you want a stricter mark, say < 34 ms (two frames), it applies to the checklist only.
6. **First shot counts.** Default: a deal's session score is its first shot; Retry and hints are practice. The alternative is best-of-attempts, which makes the hint plus "Try this shot" a guaranteed full score, so it would also need hints to end the slot's scoring.
7. **Move balls in a session.** Default: allowed only after the slot is scored. If you never want editing inside a session, the button appears only in single mode.
