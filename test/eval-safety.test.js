// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROBUST_GRID, aggregate, gateFor, opponentTargets, scoreSafety } from '../src/eval/safety.js';
import { simulate } from '../src/engine/simulate.js';
import { scorePosition } from '../src/eval/position.js';
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
  assert.deepEqual(opponentTargets({ kind: '9ball', legalIds: ['3'] }, [B('cue', 1, 1), B('9', 2, 2), B('4', 3, 3), B('3', 4, 4)], 'cue'), ['3']);
  assert.deepEqual(opponentTargets({ kind: '8ball', legalIds: ['3'], opponentIds: ['11'] }, [B('cue', 1, 1), B('3', 2, 2)], 'cue'), []);
});
test('no opponent targets is an invalid layout', () => {
  const lay = L([B('cue', 30, 25), B('ob', 60, 25)], ['ob'], '8ball', []);
  assert.throws(() => scoreSafety(lay, sh(fullnessAim(B('cue', 30, 25), B('ob', 60, 25), 0.6), 56)), /invalid layout: no opponent targets/);
});
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
test('robustness: partial hook, varied scores, a gated variant counts as 0 in the mean', () => {
  const cue = B('cue', 30, 25), ob = B('ob', 60, 25), lay = L([cue, ob, B('b2', 91.5, 25)]);
  const shot = sh(fullnessAim(cue, ob, 0.6), 48);
  const s = scoreSafety(lay, shot);
  assert.equal(s.gate, undefined); assert.ok(s.V > 0 && s.V < 1, String(s.V));
  const sc = s.robustness.scores;
  assert.equal(ROBUST_GRID.length, 9); assert.deepEqual(ROBUST_GRID[4], { speedF: 1, aimOff: 0 }); assert.equal(sc.length, 9);
  assert.ok(new Set(sc).size >= 2); assert.ok(sc.some((v) => v > 0));
  assert.equal(s.total, Math.round(mean(sc)));
  const gated = ROBUST_GRID.map((g) => gateFor(simulate(lay, { ...shot, aimDeg: shot.aimDeg + g.aimOff, speed: shot.speed * g.speedF }, { record: false }), lay));
  assert.ok(gated.some((g) => g) && gated.some((g) => !g), JSON.stringify(gated));
  gated.forEach((g, i) => { if (g) assert.equal(sc[i], 0, `slot ${i}`); });
  assert.equal(gated[4], null);
  const nonGatedMean = mean(sc.filter((_, i) => !gated[i]));
  assert.ok(nonGatedMean > mean(sc)); // zeros of gated slots are included in the mean
  const sd = Math.sqrt(mean(sc.map((v) => (v - mean(sc)) ** 2)));
  assert.ok(Math.abs(s.robustness.sd - sd) < 1e-9);
  assert.equal(s.label, sd <= 12 ? 'Forgiving' : 'Touchy'); assert.equal(s.label, 'Touchy');
});
test('kick reuse requires every ball (not just cue and targets) to stay within 2.25 in', () => {
  const lay = L([B('cue', 43.06, 35.83), B('ob', 62.17, 29.12), B('b2', 78.24, 35.9), B('b3', 85.35, 36.07)]);
  const shot = sh(-15.7, 62.25);
  const nom = simulate(lay, shot, { record: false });
  const np = scorePosition(nom.final, 'cue', ['ob']);
  assert.ok(np.V < 1); assert.equal(gateFor(nom, lay), null);
  const lanes = { n1: np.kick.n1, w1: np.kick.w1, n2: np.kick.n2, w2: np.kick.w2 };
  const g = ROBUST_GRID[3];
  const sim = simulate(lay, { ...shot, aimDeg: shot.aimDeg + g.aimOff, speed: shot.speed * g.speedF }, { record: false });
  assert.equal(gateFor(sim, lay), null);
  const d = (id) => { const p = sim.final.find((b) => b.id === id), q = nom.final.find((b) => b.id === id); return Math.hypot(p.x - q.x, p.y - q.y); };
  assert.ok(d('cue') <= 2.25 && d('ob') <= 2.25, `${d('cue')} ${d('ob')}`);
  assert.ok(Math.max(d('b2'), d('b3')) > 2.25);
  const fresh = scorePosition(sim.final, 'cue', ['ob']).score, reused = scorePosition(sim.final, 'cue', ['ob'], { kick: lanes }).score;
  assert.ok(Math.abs(fresh - reused) >= 1, `${fresh} ${reused}`);
  assert.equal(scoreSafety(lay, shot).robustness.scores[3], fresh);
});
