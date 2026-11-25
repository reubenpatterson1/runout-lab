// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../src/engine/simulate.js';
import { validateLayout } from '../src/engine/layout.js';
import { R, CORNER_MOUTH } from '../src/engine/constants.js';
import { B, L, aimAt, ev, mulberry, randomLayout } from './helpers.js';

const a = CORNER_MOUTH / Math.SQRT2;

test('ball into the corner along the diagonal is pocketed; cue → scratch', () => {
  const s = simulate(L([B('cue', 8, 8)], []), { aimDeg: 225, speed: 30, spin: { x: 0, y: 0 } });
  assert.ok(s.scratch); assert.deepEqual(s.pocketed, ['cue']); assert.equal(ev(s, (e) => e.type === 'pocket')?.b, 0);
});
test('RF3 ball rolling frozen along the rail into the corner drops (jaw grazing is not a hit)', () => {
  const s = simulate(L([B('cue', 20, R)], []), { aimDeg: 180, speed: 40, spin: { x: 0, y: 0 } });
  assert.deepEqual(s.pocketed, ['cue']); assert.equal(s.events.filter((e) => e.type === 'jaw').length, 0);
});
test('RF3 head-on into a jaw point rebounds and stays on the table', () => {
  const s = simulate(L([B('cue', a, 10)], []), { aimDeg: 270, speed: 30, spin: { x: 0, y: 0 } });
  assert.equal(ev(s, (e) => e.type === 'jaw')?.b, 0); assert.deepEqual(s.pocketed, []); assert.ok(s.settled);
});
test('RF3 straight into the side pocket drops; 10-degree shallow approach hits the cushion first', () => {
  assert.deepEqual(simulate(L([B('cue', 50, 25)], []), { aimDeg: 270, speed: 40, spin: { x: 0, y: 0 } }).pocketed, ['cue']);
  const s = simulate(L([B('cue', 20, 30 * Math.tan(Math.PI / 18))], []), { aimDeg: -10, speed: 50, spin: { x: 0, y: 0 } });
  const first = s.events.find((e) => e.a === 'cue' && e.type !== 'roll' && e.type !== 'stop');
  assert.equal(first?.type, 'cushion'); assert.equal(first?.b, 0);
});
test('object ball pocketed is reported, not scratch', () => {
  const s = simulate(L([B('cue', 80, 20), B('ob', 93, 7)]), { aimDeg: -45, speed: 60, spin: { x: 0, y: -1 } });
  assert.ok(s.pocketed.includes('ob')); assert.equal(s.scratch, false);
});
test('no non-pocketed final ball is outside the table over 200 random shots', () => {
  const rnd = mulberry(7);
  let pocketedTotal = 0;
  for (let i = 0; i < 200; i++) {
    const lay = randomLayout(1000 + i, 6);
    const s = simulate(lay, { aimDeg: rnd() * 360, speed: 10 + rnd() * 150, spin: { x: rnd() * 1.2 - 0.6, y: rnd() * 2 - 1 } });
    pocketedTotal += s.pocketed.length;
    assert.equal(s.final.length + s.pocketed.length, lay.balls.length);
    const v = validateLayout({ ...lay, balls: s.final, rules: { kind: 'designated', legalIds: [] } });
    assert.ok(v.ok || v.reason !== 'off-table', `shot ${i}: ${JSON.stringify(v)}`);
  }
  assert.ok(pocketedTotal > 0);
});
