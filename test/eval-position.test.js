// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { R } from '../src/engine/constants.js';
import { kickEase, kickLanes } from '../src/eval/kick.js';
import { combineScore, cueRestriction, scorePosition } from '../src/eval/position.js';
import { B } from './helpers.js';

test('fixture formula: full hook, frozen, no one-rail lane (worst two-rail case) ≥ 90', () => {
  const K = 1 - kickEase({ n1: 0, w1: 0, n2: 3, w2: 12 }); assert.ok(combineScore({ V: 0, D: 0, K, Q: 1 }) >= 90);
});
test('fixture formula: full hook, mid-table, one wide one-rail lane in 55–80', () => {
  for (const lanes of [{ n1: 1, w1: 6, n2: 0, w2: 0 }, { n1: 1, w1: 1, n2: 0, w2: 0 }, { n1: 3, w1: 6, n2: 2, w2: 6 }]) {
    const s = combineScore({ V: 0, D: 0, K: 1 - kickEase(lanes), Q: 0 }); assert.ok(s >= 55 && s <= 80, String(s)); }
});
test('Fixture 1 (layout): ringed OB, cue frozen on the head rail → ≥ 90, no one-rail lane', () => {
  const ring = [0, 1, 2, 3, 4, 5].map((k) => B(`b${k}`, 60 + 2 * R * Math.cos((k * Math.PI) / 3), 25 + 2 * R * Math.sin((k * Math.PI) / 3)));
  const p = scorePosition([B('cue', R, 25), B('ob', 60, 25), ...ring], 'cue', ['ob']);
  assert.equal(p.V, 0); assert.equal(p.kick.n1, 0); assert.equal(p.kick.rails, 3); assert.equal(p.kick.K, 1); assert.ok(p.score >= 90);
});
test('Fixture 2 (layout): full hook mid-table with open one-rail lanes → 55–80', () => {
  const p = scorePosition([B('cue', 30, 25), B('b1', 36, 25), B('ob', 60, 25)], 'cue', ['ob']);
  assert.equal(p.V, 0); assert.ok(p.kick.n1 >= 1); assert.equal(p.kick.rails, 1); assert.ok(p.score >= 55 && p.score <= 80, String(p.score));
});
test('Fixture 3: half-visible OB scores ≥ 30 below the same layout fully hooked', () => {
  const hooked = scorePosition([B('cue', 30, 25), B('b1', 36, 25), B('ob', 60, 25)], 'cue', ['ob']);
  const half = scorePosition([B('cue', 30, 25), B('b1', 36, 22.75), B('ob', 60, 25)], 'cue', ['ob']);
  assert.ok(half.V >= 0.4 && half.V <= 0.6); assert.ok(hooked.score - half.score >= 30);
});
test('Fixture 4: open OB near a pocket at short range ≤ 25', () => {
  const p = scorePosition([B('cue', 80, 20), B('ob', 93, 7)], 'cue', ['ob']); assert.equal(p.V, 1); assert.ok(p.score <= 25);
});
test('cue restriction is 100% when frozen and 0 mid-table', () => { assert.equal(cueRestriction({ x: R, y: 25 }), 1); assert.equal(cueRestriction({ x: 50, y: 25 }), 0); });
test('frozen cue: no phantom lane from bouncing off its own rail (R21/R23)', () => {
  assert.deepEqual(kickLanes([B('cue', R, 25), B('ob', 40, 15)], 'cue', ['ob']), { n1: 3, w1: 6, n2: 0, w2: 0 });
});
test('near-frozen cue (R+0.02) has no cliff: same one-rail lanes as frozen (R23)', () => {
  const l = kickLanes([B('cue', R + 0.02, 25), B('ob', 40, 15)], 'cue', ['ob']);
  assert.equal(l.n1, 3); assert.equal(l.w1, 6);
});
test('kickLanes is deterministic', () => {
  const balls = [B('cue', 30, 25), B('b1', 36, 25), B('ob', 60, 25)];
  assert.deepEqual(kickLanes(balls, 'cue', ['ob']), kickLanes(balls, 'cue', ['ob']));
});
test('§10 weights (amended 2026-11-25): wH = 0.62', () => {
  assert.equal(combineScore({ V: 0, D: 0, K: 0, Q: 0 }), 62);
  assert.equal(combineScore({ V: 0, D: 0, K: 1, Q: 1 }), 100);
  assert.ok(Math.abs(combineScore({ V: 0.5, D: 0, K: 0, Q: 0 }) - 31) < 1e-9);
});
