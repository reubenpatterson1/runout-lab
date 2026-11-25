# Runout Lab: Stage 1a owner acceptance checklist

Work through the sections in order. For each item, do the Steps, compare with Expected, then tick pass or fail. Fill in Notes, Device and OS version every time.

> Sections 1, 2, 3, 5 and 6 run against the deployed site, https://reubenpatterson1.github.io/runout-lab/, after `stage-1a` is merged to `main`. An iPad cannot use the offline features from a computer on the local network.

## 1. Wake lock in the installed iPad app (do this first)

**Steps**
1. On the iPad, open the app in Safari. Tap Share, then Add to Home Screen. Open the app from the home screen icon.
2. In Settings, set Auto-Lock to 2 minutes.
3. In the app, tap "Start wake-lock test". Leave the iPad alone for 3 minutes.
4. Lock the iPad, unlock it, and reopen the app.
5. If the tip appears instead of the lock being held, write down the reason shown and the iPadOS version (Settings, General, About). From then on, use Auto-Lock set to Never at the table.

**Expected**
- After 3 minutes the screen is still on and the status reads "Held".
- After lock, unlock and reopen, the lock is taken again.

Note: iOS versions earlier than 18.4 may report the lock as "Held" when it is not. If so, trust the screen behaviour, not the label.

- [ ] Result: pass / fail

Notes:
Device:
OS version:

## 2. Offline cold start in airplane mode

**Steps**
1. Open the app online once and wait 10 seconds. This lets it save everything it needs, including `data/safety-bank.json`.
2. Force-quit the app.
3. Turn on airplane mode.
4. Launch the app from the home screen.
5. Open Table Drills (legacy).
6. After Plan 1b: play one Safety Studio session from the bank.

**Expected**
- The home screen loads with no network.
- Table Drills (legacy) opens and shows correct fonts.
- After Plan 1b: the Safety Studio session plays from the bank.

- [ ] Result: pass / fail

Notes:
Device:
OS version:

## 3. Suggest time and bank load on device

**Steps**
1. While online, open https://reubenpatterson1.github.io/runout-lab/bench/ on the iPad.
2. Open https://reubenpatterson1.github.io/runout-lab/bench/ on the phone (iPhone 12 or Pixel 6a class).
3. Write down the bank load and parse times.

**Expected**
- `seeded suggest max <ms> ≤ 1500: PASS`
- `seeded suggest below stored: 0 (must be 0): PASS`
- `main-thread long tasks: 0 (must be 0): PASS`
- On iPad/iPhone Safari the long-task line reads `main-thread long tasks: n/a (longtask API unsupported; use max rAF gap)`. There, the check is `max rAF gap` under 50 ms instead.
- Bank load and parse times are recorded in Notes. Unseeded Suggest is report-only and does not pass or fail.

- [ ] Result: pass / fail

Notes:
Device:
OS version:

### Desktop Chrome 4× proxy (Task 20)

| Measure | Node, unthrottled | Chrome page (main thread at 4×; the worker was NOT throttled) |
|---|---|---|
| Seeded Suggest | median 482.4 ms, p95 1682.4 ms, max 1848.6 ms | max 1751.4 ms: FAIL (budget 1500 ms) |
| Seeded result below stored | 0 | 0: PASS |
| Unseeded Suggest (report only) | median 1008.5 ms, max 2344.5 ms | median 1001.7 ms, max 2231.3 ms |
| Bank file read | readFileSync 0.8 ms | not applicable |
| Bank JSON parse | JSON.parse 1.9 ms | not applicable |
| Bank load round trip | not applicable | 38.3 ms (fetch 4.5 ms, parse 1.4 ms in the worker) |
| Worker message round trip | not applicable | median 0.1 ms, max 1.0 ms |
| Main-thread long tasks | not applicable | 0: PASS |
| Max animation-frame gap | not applicable | 7.9 ms |

Over budget: 2 of 26 cases (family 6 easy 1574.2 ms, family 6 hard 1751.4 ms).

**[OWNER] Hint-speed decision**

- The worst-case hint search misses the 1.5 s budget even at full desktop speed.
- A true 4× figure was not measured, because the throttle did not reach the background worker. A linear estimate is about 7 s.
- The screen stays smooth either way, because the search runs in the background worker.

Pick one:
- [ ] **Show the bank's stored best shot instantly for bank layouts, and run the search only for edited layouts (recommended; Plan 1b UI wiring, no rebuild)**
- [ ] **Accept a slower hint with a progress indicator**
- [ ] **Shrink the Suggest grid (changes src/search/grid.js, which is in the bank's model hash, so it needs a ~2 h bank rebuild)**

## 4. Frame rate (after Plan 1b)

**Steps**
1. Open the animation player and play a shot.
2. Record a timeline in DevTools (desktop) or Safari (iPad) while it plays.

**Expected**
- The animation holds a steady 60 fps.
- No main-thread task is longer than 50 ms.

- [ ] Result: pass / fail

Notes:
Device:
OS version:

## 5. Update flow

**Steps**
1. After a new version is deployed, reopen the app.
2. Look for the update message.
3. Tap it.

**Expected**
- "New version available — tap to reload" appears.
- Tapping it reloads the app into the new version.

- [ ] Result: pass / fail

Notes:
Device:
OS version:

## 6. Install check

**Steps**
1. Open the app in desktop Chrome.
2. Open DevTools and go to the Application panel, then Manifest.

**Expected**
- The panel reports the manifest as installable.

- [ ] Result: pass / fail

Notes:
Device:
OS version:

## 7. Bank coverage decision (spec §18.4) [OWNER]

**Steps**
1. Read the coverage table and the SHORTFALL lines below.
2. For each of the 10 short cells, tick one box.
3. Read the highlighted note on the easy band and tick one box.

**Expected**
- Every short cell has one decision ticked.
- The easy-band decision is ticked.

- [ ] Result: pass / fail

Notes:
Device:
OS version:

### Coverage table

```
family	band	generated	valid	count	target	shortfall
1	easy	0	0	0	100	100
1	medium	16	14	14	100	86
1	hard	253	100	100	100	0
2	easy	0	0	0	100	100
2	medium	11	11	11	100	89
2	hard	510	100	100	100	0
3	easy	0	0	0	100	100
3	medium	1	1	1	100	99
3	hard	141	100	100	100	0
6	easy	1	1	1	100	99
6	medium	103	100	100	100	0
6	hard	171	100	100	100	0
7	easy	3	3	3	100	97
7	medium	101	100	100	100	0
7	hard	116	100	100	100	0
8	easy	0	0	0	100	100
8	medium	29	28	28	100	72
8	hard	160	100	100	100	0
```

### Shortfall lines

```
SHORTFALL family 1 band easy: 0/100
SHORTFALL family 1 band medium: 14/100
SHORTFALL family 2 band easy: 0/100
SHORTFALL family 2 band medium: 11/100
SHORTFALL family 3 band easy: 0/100
SHORTFALL family 3 band medium: 1/100
SHORTFALL family 6 band easy: 1/100
SHORTFALL family 7 band easy: 3/100
SHORTFALL family 8 band easy: 0/100
SHORTFALL family 8 band medium: 28/100
```

### Stop lines

```
family 1 stopped: limit at j=2000 (nonNull 2000, elapsed 0h14m)
family 2 stopped: limit at j=2000 (nonNull 2000, elapsed 0h08m)
family 3 stopped: limit at j=2000 (nonNull 2000, elapsed 0h05m)
family 6 stopped: limit at j=2000 (nonNull 2000, elapsed 0h45m)
family 7 stopped: limit at j=2000 (nonNull 2000, elapsed 0h14m)
family 8 stopped: limit at j=2000 (nonNull 2000, elapsed 0h12m)
```

No family had a `time` stop, so every family is reproducible bit-for-bit on another machine (R31).

### File size

687469 bytes, against the 1.5 MB target (R32).

### Examples (stored scores)

| Example | Stored score | Label |
|---|---|---|
| open hook | 65 | No safety scoring 70 found |
| rail tuck | 60 | No safety scoring 70 found |
| behind the 8 | 65 | No safety scoring 70 found |

### Decision for each short cell

Family 1 was expected to be short. Tick one box per row.

| Cell | Shortfall | Accept shortfall | Approve generator-range change for this family | Drop family from Stage 1 |
|---|---|---|---|---|
| Family 1, easy | 0/100 | [ ] | [ ] | [ ] |
| Family 1, medium | 14/100 | [ ] | [ ] | [ ] |
| Family 2, easy | 0/100 | [ ] | [ ] | [ ] |
| Family 2, medium | 11/100 | [ ] | [ ] | [ ] |
| Family 3, easy | 0/100 | [ ] | [ ] | [ ] |
| Family 3, medium | 1/100 | [ ] | [ ] | [ ] |
| Family 6, easy | 1/100 | [ ] | [ ] | [ ] |
| Family 7, easy | 3/100 | [ ] | [ ] | [ ] |
| Family 8, easy | 0/100 | [ ] | [ ] | [ ] |
| Family 8, medium | 28/100 | [ ] | [ ] | [ ] |

Option meanings: **accept shortfall** / **approve generator-range change for this family** / **drop family from Stage 1**.

> **[OWNER] Thin easy band**
>
> - The easy band has only 4 entries in total (family 6: 1, family 7: 3). That is exactly the minimum the tests allow.
> - The highest easy-ness share in the bank is 0.185, against the 0.15 easy threshold.
> - In 500 test sessions, 77% of easy slots fell through to another family. Every session reuses 3 of the same 4 easy layouts. "New layout" (reroll) on an easy slot finds no alternative about 1 time in 3.
> - Each family stopped at its 2,000-layout limit, not its time cap. Raising that limit, or changing the easy threshold, is a bank rebuild of about 2 hours with no app code change.
>
> Pick one:
> - [ ] **accept thin easy band for Stage 1**
> - [ ] **rebuild with a higher layout limit**
> - [ ] **revisit the easy threshold (spec change)**

Band thresholds are not retuned (R33). Any engine, geometry or eval change requires a rebuild (GC15).

## Build-time results

| Item | Result |
|---|---|
| Bank build elapsed | 1h40m, 0 errors |
| Bank entries | 858 |
| Node bench, seeded Suggest max | 1848.6 ms |
| Chrome 4× proxy bench, seeded Suggest max | 1751.4 ms (worker unthrottled) |
| `RUNOUT_FULL=1 npm test` | 167/167 pass in 108 s, re-scoring all 858 entries (family 1: 114, family 2: 111, family 3: 101, family 6: 201, family 7: 203, family 8: 128) |

## Known limitations

- Cushion rebound angle is not smooth above about 150 in/s. Every bank shot is at most 130 in/s, so the bank is unaffected. The fix is in frozen physics code and will be bundled into the next bank rebuild.
