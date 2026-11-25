// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, hashSeed } from '../src/deal/prng.js';
import { BANDS, generate, dealSeedFor, parseDealSeed, dealFromSeed } from '../src/deal/families.js';
import { FIXED_LAYOUTS } from '../src/deal/fixed.js';
import { validateLayout } from '../src/engine/layout.js';
import { visibility } from '../src/geometry/visibility.js';
import { R } from '../src/engine/constants.js';

test('PRNG and hash vectors', () => {
  const r = mulberry32(1); assert.deepEqual([r(), r(), r()], [0.6270739405881613, 0.002735721180215478, 0.5274470399599522]);
  assert.equal(hashSeed(0), 1234692987); assert.equal(hashSeed(1, 2), 541715573);
});
test('deal seeds encode family and band', () => {
  for (let f = 1; f <= 8; f++) for (const b of BANDS) assert.deepEqual(parseDealSeed(dealSeedFor(f, b, hashSeed(f, 9) >>> 1)), { family: f, band: b });
});
test('dealSeedFor stays a non-negative integer below 2^31 even for h near 2^31', () => {
  for (let f = 1; f <= 8; f++) for (const b of BANDS) for (const h of [0, 2 ** 31 - 1, 2 ** 31 - 24, 2 ** 31 - 25]) {
    const s = dealSeedFor(f, b, h);
    assert.ok(Number.isInteger(s) && s >= 0 && s < 2 ** 31, `${f} ${b} ${h} -> ${s}`);
    assert.deepEqual(parseDealSeed(s), { family: f, band: b });
  }
});
test('RF4 500 seeds × 8 families × 3 bands: valid, non-overlapping, shooter can see the legal ball', () => {
  for (let f = 1; f <= 8; f++) { let nulls = 0;
    for (const band of BANDS) for (let k = 0; k < 500; k++) {
      const lay = generate(f, hashSeed(f, k) >>> 1, band); if (!lay) { nulls++; continue; }
      assert.deepEqual(validateLayout(lay), { ok: true });
      for (let i = 0; i < lay.balls.length; i++) for (let j = i + 1; j < lay.balls.length; j++)
        assert.ok(Math.hypot(lay.balls[i].x - lay.balls[j].x, lay.balls[i].y - lay.balls[j].y) >= 2 * R - 1e-6);
      const cue = lay.balls.find((b) => b.id === 'cue');
      assert.ok(cue);
      assert.ok(Math.max(...lay.rules.legalIds.map((id) => visibility(cue, /** @type {any} */ (lay.balls.find((b) => b.id === id)), lay.balls, ['cue']))) >= 0.5);
    }
    assert.ok(nulls / 1500 < 0.05, `family ${f} nulls ${nulls}`); }
});
/** @param {number} f @param {import('../src/types.js').Band} band */
function firstFrom11(f, band) {
  for (let k = 11; k < 200; k++) { const l = generate(f, k, band); if (l) return l; }
  throw new Error(`no layout for family ${f} ${band} from seed 11`);
}
test('family rules: 8-ball groups and 9-ball lowest ball', () => {
  const e = firstFrom11(6, 'easy'), m = firstFrom11(6, 'medium'), n = firstFrom11(7, 'medium');
  assert.equal(e.rules.kind, '8ball'); assert.deepEqual(e.rules.legalIds, ['1', '2', '3']); assert.deepEqual(e.rules.opponentIds, ['9', '10']);
  assert.deepEqual(m.rules.opponentIds, ['9', '10', '11']);
  assert.equal(n.rules.kind, '9ball'); assert.deepEqual(n.rules.legalIds, [String(Math.min(...n.balls.filter((b) => b.id !== 'cue').map((b) => Number(b.id))))]);
});
test('dealFromSeed matches parse + generate', () => {
  const s = dealSeedFor(4, 'medium', hashSeed(4, 3) >>> 1);
  assert.deepEqual(dealFromSeed(s), { family: 4, band: 'medium', layout: generate(4, s, 'medium') });
});
test('generate is deterministic; fixed layouts are valid and named', () => {
  assert.deepEqual(generate(3, 77, 'hard'), generate(3, 77, 'hard'));
  assert.deepEqual(FIXED_LAYOUTS.map((f) => f.name), ['open hook', 'rail tuck', 'behind the 8']);
  for (const f of FIXED_LAYOUTS) assert.deepEqual(validateLayout(f.layout), { ok: true });
});
