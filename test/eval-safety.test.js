// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROBUST_GRID, aggregate, gateFor, opponentTargets, scoreSafety } from '../src/eval/safety.js';
import { B, L, aimAt, fullnessAim } from './helpers.js';

const sh = (aimDeg, speed, x = 0, y = 0) => ({ aimDeg, speed, spin: { x, y } });
test('Fixture 5: no rail after contact is always 0, shown as a foul', () => {
  const s = scoreSafety(L([B('cue', 40, 25), B('ob', 46, 25)]), sh(0, 12)); assert.equal(s.total, 0); assert.equal(s.gate, 'no-rail'); assert.equal(s.label, null);
});
test('gates: scratch, wrong ball first, ob pocketed', () => {
  assert.equal(scoreSafety(L([B('cue', 90, 40), B('ob', 20, 10)]), sh(aimAt({ x: 90, y: 40 }, { x: 100 - 4.5 / Math.SQRT2 / 2, y: 50 - 4.5 / Math.SQRT2 / 2 }), 40)).gate, 'scratch');
  assert.equal(scoreSafety(L([B('cue', 20, 25), B('b1', 40, 25), B('ob', 60, 25)]), sh(0, 40)).gate, 'wrong-ball-first');
  assert.equal(scoreSafety(L([B('cue', 80, 20), B('ob', 93, 7)]), sh(-45, 60, 0, -1)).gate, 'ob-pocketed');
});
test('gateFor: null first contact is wrong-ball-first', () => {
  const sim = /** @type {any} */ ({ scratch: false, firstContactId: null, pocketed: [], railsAfterContact: 0 });
  assert.equal(gateFor(sim, L([B('cue', 1, 1), B('ob', 9, 9)])), 'wrong-ball-first');
});
test('aggregate: nominal gate forces 0 even when other runs score', () => {
  assert.equal(aggregate([80, 80, 80, 80, 0, 80, 80, 80, 80], 'no-rail').total, 0);
  const a = aggregate([70, 72, 74, 70, 72, 74, 70, 72, 74], null); assert.equal(a.total, 72); assert.equal(a.label, 'Forgiving');
  assert.equal(aggregate([0, 100, 0, 100, 50, 100, 0, 100, 0], null).label, 'Touchy');
});
test('opponent targets per family rules', () => {
  const balls = [B('cue', 10, 10), B('3', 20, 20), B('10', 30, 30), B('9', 40, 40), B('8', 50, 25)];
  assert.deepEqual(opponentTargets({ kind: 'designated', legalIds: ['ob'] }, [B('cue', 1, 1), B('ob', 9, 9)], 'cue'), ['ob']);
  assert.deepEqual(opponentTargets({ kind: '8ball', legalIds: ['3'], opponentIds: ['9', '10', '11'] }, balls, 'cue'), ['10', '9']);
  assert.deepEqual(opponentTargets({ kind: '8ball', legalIds: ['3'], opponentIds: ['11'] }, balls, 'cue'), ['8']);
  assert.deepEqual(opponentTargets({ kind: '9ball', legalIds: ['3'] }, balls, 'cue'), ['3']);
});
test('robustness: nine runs on the 3x3 grid, total is their rounded mean', () => {
  const s = scoreSafety(L([B('cue', 30, 25), B('ob', 50, 20)]), sh(fullnessAim(B('cue', 30, 25), B('ob', 50, 20), 0.5), 40));
  assert.equal(ROBUST_GRID.length, 9); assert.deepEqual(ROBUST_GRID[4], { speedF: 1, aimOff: 0 });
  assert.equal(s.gate, undefined);
  assert.equal(s.robustness.scores.length, 9);
  assert.equal(s.total, Math.round(s.robustness.scores.reduce((a, b) => a + b, 0) / 9)); assert.ok(['Forgiving', 'Touchy'].includes(/** @type {string} */ (s.label)));
});
