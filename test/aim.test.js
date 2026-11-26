// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normDeg, nudge, aimKey, defaultAim, aimPreview, handlePoint, handleSide, hitsHandle, aimFromDrag } from '../src/ui/aim.js';
import { R } from '../src/engine/constants.js';
import { B, L, near } from './helpers.js';

test('normDeg maps into (−180, 180]', () => {
  assert.deepEqual([0, 180, -180, 540, -190, 181, 359.5, 90].map(normDeg), [0, 180, 180, 180, 170, -179, -0.5, 90]);
});
test('nudges and arrow keys wrap through ±180', () => {
  assert.equal(nudge(179.5, 1), -179.5); assert.ok(near(nudge(-179.95, -0.1), 179.95, 1e-9)); assert.ok(near(nudge(10, 0.1), 10.1, 1e-9));
  assert.equal(aimKey(10, 'ArrowRight', false), 11); assert.equal(aimKey(10, 'ArrowLeft', false), 9);
  assert.ok(near(/** @type {number} */ (aimKey(10, 'ArrowRight', true)), 10.1, 1e-9)); assert.ok(near(/** @type {number} */ (aimKey(10, 'ArrowLeft', true)), 9.9, 1e-9));
  assert.equal(aimKey(10, 'ArrowUp', false), null);
});
test('defaultAim: the most visible legal ball; ties go to the lower layout index', () => {
  const balls = [B('cue', 20, 25), B('1', 60, 25), B('2', 20, 10), B('9', 40, 25)];
  assert.ok(near(defaultAim(L(balls, ['1', '2'])), -90, 1e-9)); // '1' is behind '9' (measured V 0), '2' is open (V 1)
  assert.ok(near(defaultAim(L(balls.slice(0, 3), ['1', '2'])), 0, 1e-9)); // both V 1 → '1', the lower index
});
test('aimPreview ends at the first ball contact or at the cushion line (centre R from the cushion)', () => {
  const lay = L([B('cue', 25, 25), B('ob', 75, 25)]);
  assert.deepEqual(aimPreview(lay, 0), { end: { x: 75 - 2 * R, y: 25 }, hitId: 'ob' });
  const down = aimPreview(lay, 90); assert.equal(down.hitId, null); assert.ok(near(down.end.x, 25, 1e-9) && near(down.end.y, 50 - R, 1e-9));
  const diag = aimPreview(lay, 45); assert.equal(diag.hitId, null); assert.ok(near(diag.end.x, 50 - R, 1e-9) && near(diag.end.y, 50 - R, 1e-9));
  assert.ok(near(aimPreview(lay, 180).end.x, R, 1e-9));
});
test('RF3: handle at max(14 in, 36 px), 22 px hit radius, flips behind the cue near a rail', () => {
  const cue = { x: 50, y: 25 };
  assert.deepEqual(handlePoint(cue, 0, 3.4, false), { x: 64, y: 25 });
  assert.ok(near(handlePoint(cue, 0, 2, false).x, 68, 1e-9));
  assert.equal(handleSide(cue, 0, 3.4), false);
  assert.ok(hitsHandle({ x: 64, y: 25 }, { x: 64 + 22 / 3.4 - 1e-6, y: 25 }, 3.4)); assert.ok(!hitsHandle({ x: 64, y: 25 }, { x: 64 + 22 / 3.4 + 1e-3, y: 25 }, 3.4));
  const rail = { x: 98, y: 25 };
  assert.equal(handleSide(rail, 0, 3.4), true);
  const hb = handlePoint(rail, 0, 3.4, true); assert.ok(near(hb.x, 84, 1e-9) && near(hb.y, 25, 1e-9));
  assert.ok(near(aimFromDrag(rail, { x: 80, y: 25 }, true), 0, 1e-9));
  assert.ok(near(aimFromDrag(cue, { x: 50, y: 40 }, false), 90, 1e-9));
  assert.equal(handleSide({ x: 50, y: 48.8 }, 90, 3.4), true);
});
