// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { R } from '../src/engine/constants.js';
import { DIFFICULTY_GRID, SUGGEST_GRID, candidateShots } from '../src/search/grid.js';
import { classify, suggest, validateDeal, runSearch, selectShots } from '../src/search/search.js';
import { simulate } from '../src/engine/simulate.js';
import { gateFor, opponentTargets } from '../src/eval/safety.js';
import { scorePosition } from '../src/eval/position.js';
import { B, L, aimAt, near, randomLayout } from './helpers.js';

const lay = L([B('cue', 30, 25), B('ob', 50, 20), B('b1', 58, 30), B('b2', 58 + 2 * R, 30)]);
test('grids: difficulty grid is coarser than suggest; sizes pinned', () => {
  assert.equal(candidateShots(lay, DIFFICULTY_GRID).length, 108); assert.equal(candidateShots(lay, SUGGEST_GRID).length, 1053);
  const first = candidateShots(lay, DIFFICULTY_GRID)[0];
  assert.ok(near(first.aimDeg, aimAt(B('cue', 30, 25), B('ob', 50, 20)) + (Math.asin((2 * R * -0.92) / Math.hypot(20, 5)) * 180) / Math.PI, 1e-9));
  assert.deepEqual([first.speed, first.spin], [20, { x: 0, y: -0.8 }]);
});
test('classify thresholds', () => { assert.equal(classify(0.16), 'easy'); assert.equal(classify(0.15), 'medium'); assert.equal(classify(0.04), 'medium'); assert.equal(classify(0.0399), 'hard'); });
test('validateDeal is consistent and deterministic', () => {
  const v = validateDeal(lay); assert.equal(v.ok, !!v.best && v.best.score.total >= 70); assert.equal(v.band, classify(v.share));
  assert.ok(v.share >= 0 && v.share <= 1); assert.deepEqual(validateDeal(lay), v);
});
const layA = L([B('cue', 40, 30), B('ob', 52, 30), B('b1', 56, 33), B('b2', 56, 27), B('b3', 60, 30), B('b4', 90, 45)]);
const layB = L([B('cue', 43.06, 35.83), B('ob', 62.17, 29.12), B('b2', 78.24, 35.9), B('b3', 85.35, 36.07)]);
test('suggest seeded with validateDeal best never scores below it (seeding is load-bearing)', () => {
  for (const l of [layA, layB]) {
    const v = validateDeal(l); assert.ok(v.best, 'precondition: validate found a best');
    const unseeded = suggest(l).best;
    assert.ok(unseeded && unseeded.score.total < v.best.score.total, `precondition: unseeded ${unseeded?.score.total} < validate ${v.best.score.total}`);
    for (const seed of [v.best.shot, { ...v.best.shot, known: v.best.score }]) {
      const s = suggest(l, { seedShots: [seed] }).best;
      assert.ok(s && s.score.total >= v.best.score.total);
      if (v.ok) assert.ok(s.score.total >= 70);
    }
  }
});
/** nominal final key of a shot */
const finalOf = (l, shot) => simulate(l, shot, { record: false }).final.map((b) => `${b.id}:${b.x},${b.y}`).join('|');
test('Stage B nominal finals are pairwise distinct (R26) where naive top-3 collapsed', () => {
  const cands = candidateShots(layB, SUGGEST_GRID).map((shot, idx) => {
    const sim = simulate(layB, shot, { record: false });
    if (gateFor(sim, layB)) return null;
    return { shot, idx, cheap: scorePosition(sim.final, 'cue', opponentTargets(layB.rules, sim.final, 'cue'), { cheap: true }).score };
  }).filter((c) => c).sort((p, q) => q.cheap - p.cheap || p.idx - q.idx);
  const naive = new Set(cands.slice(0, 3).map((c) => finalOf(layB, c.shot)));
  assert.ok(naive.size < 3, `precondition: naive top-3 collapse (distinct finals ${naive.size})`);
  const { fullSet } = selectShots(layB, SUGGEST_GRID);
  assert.equal(fullSet.length, 3);
  assert.equal(new Set(fullSet.map((f) => finalOf(layB, f.shot))).size, 3);
  const seed = fullSet[0].shot;
  const withSeed = selectShots(layB, SUGGEST_GRID, { seedShots: [seed] }).fullSet;
  assert.equal(withSeed.length, 4); assert.equal(new Set(withSeed.map((f) => finalOf(layB, f.shot))).size, 4);
});
test('R27: memo + branch-and-bound give results deep-equal to the reference path', () => {
  for (const l of [layA, layB, lay]) {
    const fast = { kickCalls: 0 }, ref = { kickCalls: 0 };
    assert.deepEqual(runSearch(l, DIFFICULTY_GRID, { stats: fast }), runSearch(l, DIFFICULTY_GRID, { reference: true, stats: ref }));
    assert.ok(fast.kickCalls <= ref.kickCalls);
    if (l !== layA) assert.ok(fast.kickCalls < ref.kickCalls, `${fast.kickCalls} vs ${ref.kickCalls}`);
  }
});
test('R28: validateDeal stops at the first full total >= 70; suggest never early-exits', () => {
  const v = validateDeal(layA); assert.ok(v.ok);
  const full = runSearch(layA, DIFFICULTY_GRID);
  assert.ok(full.best && full.best.score.total >= v.best.score.total);
  assert.equal(full.shareGe70, v.share);
  const early = { kickCalls: 0 }, noStop = { kickCalls: 0 };
  runSearch(layA, DIFFICULTY_GRID, { stopAtTotal: 70, stats: early }); runSearch(layA, DIFFICULTY_GRID, { stats: noStop });
  assert.ok(early.kickCalls < noStop.kickCalls, `${early.kickCalls} vs ${noStop.kickCalls}`);
  assert.deepEqual(suggest(layA, { stopAtTotal: 70 }), suggest(layA));
});
test('shareGe70 equals an independent Stage-A-only recount (pinned 5/108)', () => {
  const l = randomLayout(14, 5);
  let n = 0;
  const cands = candidateShots(l, DIFFICULTY_GRID);
  for (const shot of cands) {
    const sim = simulate(l, shot, { record: false });
    if (gateFor(sim, l)) continue;
    if (scorePosition(sim.final, 'cue', opponentTargets(l.rules, sim.final, 'cue'), { cheap: true }).score >= 70) n++;
  }
  assert.equal(n, 5);
  assert.equal(runSearch(l, DIFFICULTY_GRID).shareGe70, n / cands.length);
});
test('R29: no opponent targets throws before Stage A', () => {
  const l = L([B('cue', 30, 25), B('ob', 50, 25)], ['ob'], '9ball');
  assert.ok(opponentTargets(l.rules, l.balls, 'cue').length > 0);
  const bad = { ...l, rules: { kind: /** @type {const} */ ('designated'), legalIds: ['ob'], opponentIds: ['cue'] } };
  assert.throws(() => runSearch(bad, DIFFICULTY_GRID), /no opponent targets/);
});
test('candidateShots id tiebreak is numeric for numeric ids', () => {
  const l = { balls: [B('cue', 10, 25), B('10', 40, 10), B('9', 40, 40)], cueId: 'cue', rules: { kind: /** @type {const} */ ('9ball'), legalIds: ['10', '9'] } };
  const aim = (id) => aimAt(B('cue', 10, 25), l.balls.find((b) => b.id === id));
  const first = candidateShots(l, DIFFICULTY_GRID)[0];
  assert.ok(Math.abs(first.aimDeg - aim('9')) < 5 && Math.abs(first.aimDeg - aim('10')) > 5);
});
test('a shooter with no direct look at the legal ball gets no candidates', () => {
  const hooked = L([B('cue', 30, 25), B('b1', 36, 25), B('ob', 60, 25)]);
  assert.equal(candidateShots(hooked, DIFFICULTY_GRID).length, 0); assert.equal(validateDeal(hooked).ok, false);
});
test('runSearch throws on an invalid layout (R4)', () => {
  assert.throws(() => runSearch(L([B('cue', 30, 25), B('ob', 30, 25)]), DIFFICULTY_GRID), /invalid layout/);
});
