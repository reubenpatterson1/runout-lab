// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RAIL_IN, viewTransform, ballRadiusPx, ballColour, ballStriped, ballLabel, ballStyles } from '../src/ui/table-view.js';
import { B, near } from './helpers.js';

test('transform: 5 in rail, 110 × 60 aspect, exact inverse', () => {
  assert.equal(RAIL_IN, 5);
  const v = viewTransform(374);
  assert.ok(near(v.pxPerIn, 3.4, 1e-12) && near(v.cssHeight, 204, 1e-9));
  const a = v.toScreen({ x: 0, y: 0 }), b = v.toScreen({ x: 100, y: 50 });
  assert.ok(near(a.x, 17, 1e-9) && near(a.y, 17, 1e-9) && near(b.x, 357, 1e-9) && near(b.y, 187, 1e-9));
  const p = v.toTable(b.x, b.y); assert.ok(near(p.x, 100, 1e-9) && near(p.y, 50, 1e-9));
});
test('ball radius is true scale with a 3.5 px floor', () => {
  assert.ok(near(ballRadiusPx(3.4), 3.825, 1e-9)); assert.equal(ballRadiusPx(2), 3.5);
});
test('ball colours, stripes and labels follow legacy BALLCOL', () => {
  assert.deepEqual(['cue', 'ob', 'b3', '1', '8', '9', '10', '15', 'zz'].map(ballColour),
    ['#f2eedd', '#cf4631', '#2f6fb0', '#e9c63b', '#141414', '#e9c63b', '#2f6fb0', '#7c3a32', '#2f6fb0']);
  assert.deepEqual(['9', '10', '15', '8', '1', 'cue', 'ob'].map(ballStriped), [true, true, true, false, false, false, false]);
  assert.deepEqual(['10', 'ob', 'cue'].map(ballLabel), ['10', '', '']);
  assert.deepEqual(ballStyles([B('cue', 1, 1), B('9', 2, 2)]), { colours: { cue: '#f2eedd', 9: '#e9c63b' }, labels: { cue: '', 9: '9' } });
});
