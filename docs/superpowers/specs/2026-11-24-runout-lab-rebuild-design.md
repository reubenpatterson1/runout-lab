# Runout Lab rebuild: design (Stage 1)

Date: 2026-11-24. Status: approved by owner 2026-11-24.

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
3. Endless random Safety Studio layouts, each guaranteed to have a good answer.
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
- `src/search/`: searches aim, speed, and spin. It runs in a Web Worker.
- `src/deal/`: seeded generators for layout families, plus validation.
- `src/ui/`: shared renderer, ball drag, aim handle with nudges, spin pad, speed control, animation player (replays the engine trajectory in real time), hash router, session store (localStorage), wake lock, update banner.
- `src/study/safety-studio.js` and `src/table/`: the two modes.
- `sw.js`, `manifest.webmanifest`, icons.
- `src/precache.js`: the file list and version.
- `test/` and `docs/`: never shipped.
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
6. **Robustness.** Re-run the shot on a 3×3 grid of speed (±8%) and aim (±0.4°). The headline score is the mean of the nine runs. A "Forgiving" or "Touchy" label reflects how much the scores spread.

The score runs 0 to 100. The breakdown shows V, the best kick, the direct threat, cue restriction, and robustness.

The builder sets the weights and the spread values. The results must pass these fixtures:

- Full hook, cue frozen, no one-rail lane: score ≥ 90.
- Full hook, cue mid-table, one wide one-rail lane: score 55–80.
- Half-visible OB: at least 30 points below the same layout fully hooked.
- Open OB near a pocket at short range: score ≤ 25.
- No rail after contact: always 0, shown as a foul.

## 11. Safety Studio [PROPOSED]

**Deals and buttons.**

- Every layout comes from a seed and a family.
- "New layout" deals a new seed.
- "Retry" replays the same layout. This replaces today's unclear Reset button (line 367).
- The seed is in the URL (`#/study/safety?deal=<seed>`).

**Validation.**

- Before a deal is shown, the search worker must find a safety that scores ≥ 70. If it can't, the deal is redealt.
- After 25 rejected deals, fall back to a fixed layout.

**Difficulty** is the share of the search grid scoring ≥ 70: easy above 15%, medium 4–15%, hard below 4%. A 10-deal session mixes 3 easy, 4 medium and 3 hard, shuffled.

**Families:** (1) hook behind a blocker; (2) rail tuck or freeze; (3) stop/stun hide; (4) thin cut sending the OB long to a rail; (5) length-of-table lag; (6) 8-ball, hide from the opponent's whole group; (7) 9-ball, lowest ball in clutter; (8) behind your own balls or a cluster.

The current three layouts (`SCEN`, lines 969–973) stay as named fixed examples.

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

**Evaluation.** All the fixtures in section 10 pass.

**Deals.** Over 500 seeds per family:

- Every shown deal has a safety scoring ≥ 70.
- The fallback layout is used in under 1% of deals.

**Performance.** Measured on a 2020-class iPad and an iPhone 12 / Pixel 6a-class phone:

- Deal validation finishes in 1.5 s or less, and so does Suggest.
- No main-thread task runs longer than 50 ms during search or animation.
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

## 18. Open items

1. **Visual direction [OWNER].** Choose it from mockups before the shell UI is built.
2. **Wake lock on iPad [PROPOSED].** Wake lock was reported broken in iOS home-screen apps before 18.4. This hasn't been verified. Test it early on the owner's iPad in the installed app. If it fails, show a tip to set Auto-Lock to Never.
3. **`runout-lab.html` [PROPOSED].** Confirm that a redirect stub is preferred over deleting it.

## 18a. Builder-check resolutions [PROPOSED by Claude unless marked]

1. **Visual direction and build order.** Claude produces two or three mockups for the owner to choose from. Engine, geometry, eval, search, deal, service worker and precache are built first and do not wait. Shell and Safety Studio UI work starts only after the owner picks a look. The contrast and Lighthouse criteria apply to the chosen look.
2. **Scale.** The engine uses true proportions: a real table playing area, 2.25 in balls and standard pocket mouths. The renderer may draw balls larger than true scale for legibility, and hit targets stay at least 44 px regardless of drawn size. The engine scale and render scale are separate. The table size is TBD by the OWNER (see below).
3. **Performance fallbacks, in order.**
   - (b) Search with a cheap kick-lane and robustness approximation, and run the full model only on the top candidates.
   - (c) Measure difficulty on a coarser grid than Suggest uses.
   - Validate the next deal in the worker while the player is still on the current one, so the wait is hidden.
   - (d) If it still misses, loosen the 1.5 s budget for deal validation only.
   - A pre-validated seed bank is the last resort, and it must be reported to the owner first.
4. **Rules per family.**
   - Families 1–5 use a single designated object ball, as today. "Wrong ball first" means anything other than that ball.
   - Family 6 uses 8-ball group rules. V is taken against the opponent's best ball in their group.
   - Family 7 uses 9-ball. The legal ball is the lowest on the table, and the opponent's target is the lowest ball after the shot.
   - Family 8 uses a designated object ball. The blockers are your own balls or a cluster, and hitting them first is a foul.
5. **Acceptance devices.**
   - During the build, the proxy is desktop Chrome with 4× CPU throttling.
   - Final acceptance uses a short hand-off checklist run by the owner on their own devices: offline cold start, wake lock, frame rate and Suggest time. The devices are TBD by the OWNER (see below).
6. **Legacy offline.** The legacy page is precached too, because the Table door opens the legacy Table Drills at a table that may have no signal. The new app and the legacy page both use self-hosted font files that are precached. There is no Google Fonts dependency.

## 19. Left to the builder

- Physics constants and integration method (must pass the tests in section 15).
- Evaluation weights and spread values (must pass the section 10 fixtures).
- Search strategy: grid or coarse-to-fine, number of workers, early exit.
- File names.
- How the legacy app stays reachable.
- Parameter ranges for each family.
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
