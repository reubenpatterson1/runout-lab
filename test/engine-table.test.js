// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { R, W, H, CORNER_MOUTH, SIDE_MOUTH } from '../src/engine/constants.js';
import { CUSHIONS, JAWS, POCKETS, mouthDistance } from '../src/engine/table.js';
import { validateLayout } from '../src/engine/layout.js';
const L = (balls, legalIds = ['ob']) => ({ balls, cueId: 'cue', rules: { kind: 'designated', legalIds } });
test('true-scale 9 ft table', () => { assert.equal(R, 1.125); assert.equal(W, 100); assert.equal(H, 50); assert.equal(CORNER_MOUTH, 4.5); assert.equal(SIDE_MOUTH, 5.0); });
test('pocket mouths are 4.5 in (corner) and 5.0 in (side)', () => {
  assert.equal(CUSHIONS.length, 6); assert.equal(JAWS.length, 12);
  for (const p of POCKETS) { const [i, j] = p.jaws; const m = Math.hypot(JAWS[i].x - JAWS[j].x, JAWS[i].y - JAWS[j].y);
    assert.ok(Math.abs(m - (p.kind === 'corner' ? 4.5 : 5.0)) < 1e-9); }
  assert.ok(Math.abs(JAWS[0].x - 3.181980515339464) < 1e-12);
});
test('mouthDistance sign', () => { assert.ok(mouthDistance(1, 1, 0) > 0); assert.ok(mouthDistance(5, 5, 0) < 0); assert.ok(mouthDistance(50, -0.1, 1) > 0); });
test('validateLayout accepts frozen pair and rail-frozen ball, tolerates 0.005 overlap', () => {
  assert.deepEqual(validateLayout(L([{ id: 'cue', x: R, y: 25 }, { id: 'ob', x: 50, y: 25 }, { id: 'b1', x: 50 + 2 * R, y: 25 }])), { ok: true });
  assert.deepEqual(validateLayout(L([{ id: 'cue', x: 20, y: 25 }, { id: 'ob', x: 20 + 2 * R - 0.005, y: 25 }])), { ok: true });
});
test('validateLayout rejections', () => {
  const r = (balls, legal) => validateLayout(L(balls, legal)).reason;
  assert.equal(r([{ id: 'ob', x: 50, y: 25 }]), 'missing-cue');
  assert.equal(r([{ id: 'cue', x: 20, y: 25 }, { id: 'cue', x: 60, y: 25 }], []), 'duplicate-id');
  assert.equal(r([{ id: 'cue', x: 20, y: 25 }], ['ob']), 'unknown-legal-id');
  assert.equal(r([{ id: 'cue', x: 0.5, y: 25 }], []), 'off-table');
  assert.equal(r([{ id: 'cue', x: NaN, y: 25 }], []), 'off-table');
  assert.equal(r([{ id: 'cue', x: 1.2, y: 1.2 }], []), 'in-pocket');
  assert.equal(r([{ id: 'cue', x: 20, y: 25 }, { id: 'ob', x: 20 + 2 * R - 0.02, y: 25 }]), 'overlap');
});
test('CUSHIONS normals in order', () => {
  assert.deepEqual(CUSHIONS.map((c) => [c.nx, c.ny]), [[0, -1], [0, -1], [0, 1], [0, 1], [-1, 0], [1, 0]]);
});
test('POCKETS out vectors in order', () => {
  const q = Math.SQRT1_2;
  const exp = [[-q, -q], [0, -1], [q, -q], [-q, q], [0, 1], [q, q]];
  POCKETS.forEach((p, i) => { assert.ok(Math.abs(p.out.x - exp[i][0]) < 1e-12 && Math.abs(p.out.y - exp[i][1]) < 1e-12); });
});
test('POCKETS jaws are [2i, 2i+1]', () => {
  POCKETS.forEach((p, i) => assert.deepEqual(p.jaws, [2 * i, 2 * i + 1]));
});
