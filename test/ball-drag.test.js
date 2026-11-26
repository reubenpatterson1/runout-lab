// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PICK_PX, pickBall, clampToPlay, moveBall } from '../src/ui/ball-drag.js';
import { R } from '../src/engine/constants.js';
import { B, L } from './helpers.js';
const lay = L([B('cue', 20, 25), B('ob', 60, 25), B('b1', 40, 10)]);

test('pickBall: the nearest centre within the tolerance, else null', () => {
  assert.equal(PICK_PX, 22);
  assert.equal(pickBall(lay.balls, { x: 21, y: 25 }, 22 / 3.4), 'cue');
  assert.equal(pickBall(lay.balls, { x: 30, y: 25 }, 22 / 3.4), null);
  assert.equal(pickBall([B('a', 20, 25), B('b', 22.3, 25)], { x: 21.5, y: 25 }, 5), 'b');
});
test('RF5: overlapping, in-pocket and off-table drops return null; legal drops move the ball; drags clamp', () => {
  const before = structuredClone(lay);
  assert.deepEqual(moveBall(lay, 'cue', { x: 30, y: 30 })?.balls[0], { id: 'cue', x: 30, y: 30 });
  assert.ok(moveBall(lay, 'cue', { x: 60 - 2 * R, y: 25 })); // frozen to the OB is allowed
  assert.equal(moveBall(lay, 'cue', { x: 60 - 2 * R + 0.001, y: 25 }), null); // closer than 2R − 1e-6 (validateLayout alone allows it)
  assert.equal(moveBall(lay, 'cue', { x: R, y: R }), null); // past the corner pocket mouth (measured: in-pocket)
  assert.deepEqual(moveBall(lay, 'b1', { x: 50, y: 70 })?.balls[2], { id: 'b1', x: 50, y: 50 - R }); // clamped to the rail at the side pocket
  assert.deepEqual(clampToPlay({ x: -10, y: 70 }), { x: R, y: 50 - R });
  assert.deepEqual(lay, before);
});
