// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { R } from '../src/engine/constants.js';
import { DIFFICULTY_GRID, SUGGEST_GRID, candidateShots } from '../src/search/grid.js';
import { classify, suggest, validateDeal, runSearch } from '../src/search/search.js';
import { B, L, aimAt, near } from './helpers.js';

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
test('suggest never returns less than a seeded shot', () => {
  const v = validateDeal(lay); assert.ok(v.best, 'precondition: validateDeal finds a best shot on the fixture layout');
  const s = suggest(lay, { seedShots: [v.best.shot] }).best;
  assert.ok(s && s.score.total >= v.best.score.total);
});
test('a shooter with no direct look at the legal ball gets no candidates', () => {
  const hooked = L([B('cue', 30, 25), B('b1', 36, 25), B('ob', 60, 25)]);
  assert.equal(candidateShots(hooked, DIFFICULTY_GRID).length, 0); assert.equal(validateDeal(hooked).ok, false);
});
test('runSearch throws on an invalid layout (R4)', () => {
  assert.throws(() => runSearch(L([B('cue', 30, 25), B('ob', 30, 25)]), DIFFICULTY_GRID), /invalid layout/);
});
