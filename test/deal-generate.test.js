// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, hashSeed, shuffle } from '../src/deal/prng.js';
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

const GOLDEN = [
  [1, {"balls":[{"id":"cue","x":51.612399221,"y":7.866999436},{"id":"ob","x":84.391848033,"y":19.202567935},{"id":"b1","x":83.659504447,"y":8.08488923},{"id":"b2","x":85.908097434,"y":8.164447866}],"cueId":"cue","rules":{"kind":"designated","legalIds":["ob"]}}],
  [2, {"balls":[{"id":"cue","x":66.488837699,"y":3.137725913},{"id":"ob","x":60.896761389,"y":32.303497535},{"id":"b1","x":64.359233901,"y":48.875},{"id":"b2","x":66.609233901,"y":48.875}],"cueId":"cue","rules":{"kind":"designated","legalIds":["ob"]}}],
  [3, {"balls":[{"id":"cue","x":39.493206694,"y":19.975558877},{"id":"ob","x":56.622545928,"y":24.853919564},{"id":"b1","x":56.73334793,"y":28.028505717},{"id":"b2","x":54.602667742,"y":27.305524434}],"cueId":"cue","rules":{"kind":"designated","legalIds":["ob"]}}],
  [4, {"balls":[{"id":"cue","x":66.46958146,"y":14.73387425},{"id":"ob","x":89.695924016,"y":19.975558877},{"id":"b1","x":67.051310174,"y":22.186233146},{"id":"b2","x":64.807331128,"y":22.021739866}],"cueId":"cue","rules":{"kind":"designated","legalIds":["ob"]}}],
  [5, {"balls":[{"id":"cue","x":72.263081323,"y":34.538032375},{"id":"ob","x":94.858097874,"y":18.429576993},{"id":"b1","x":10.565998585,"y":19.909268372},{"id":"b2","x":10.565998585,"y":22.159268372}],"cueId":"cue","rules":{"kind":"designated","legalIds":["ob"]}}],
  [6, {"balls":[{"id":"cue","x":90.25787383,"y":41.632323603},{"id":"9","x":48.40057035,"y":18.371535036},{"id":"10","x":51.883643604,"y":14.429504134},{"id":"11","x":49.557504071,"y":12.337485636},{"id":"1","x":67.239194238,"y":30.199135514},{"id":"2","x":49.772023626,"y":23.157845481},{"id":"3","x":53.436616556,"y":22.084296133},{"id":"8","x":32.335246168,"y":8.486418945}],"cueId":"cue","rules":{"kind":"8ball","legalIds":["1","2","3"],"opponentIds":["9","10","11"]}}],
  [7, {"balls":[{"id":"cue","x":42.418534847,"y":3.83509697},{"id":"2","x":25.087908737,"y":30.436393104},{"id":"4","x":30.166649746,"y":32.029100609},{"id":"5","x":23.744777359,"y":26.067961644},{"id":"7","x":84.957601391,"y":7.404057553},{"id":"9","x":55.168380439,"y":40.27615892}],"cueId":"cue","rules":{"kind":"9ball","legalIds":["2"]}}],
  [8, {"balls":[{"id":"cue","x":55.362886864,"y":9.163967845},{"id":"ob","x":84.391848033,"y":19.202567935},{"id":"b1","x":82.877103162,"y":5.904691993},{"id":"b2","x":84.215406536,"y":7.71340537},{"id":"b3","x":81.979863116,"y":7.968053401}],"cueId":"cue","rules":{"kind":"designated","legalIds":["ob"]}}],
];
/** @param {import('../src/types.js').Layout} l */
const rounded = (l) => ({ ...l, balls: l.balls.map((b) => ({ id: b.id, x: Math.round(b.x * 1e9) / 1e9, y: Math.round(b.y * 1e9) / 1e9 })) });
test('golden seed 12345 medium per family (URL replay guard)', () => {
  for (const [f, lay] of GOLDEN) assert.deepEqual(rounded(/** @type {any} */ (generate(/** @type {number} */ (f), 12345, 'medium'))), lay, `family ${f}`);
});
test('family identity: structural checks over 50 seeds per family per band', () => {
  const SQ3 = Math.sqrt(3);
  for (const f of [1, 2, 3, 4, 5, 8]) for (const [bi, band] of BANDS.entries()) {
    const count = f === 8 ? [3, 3, 2][bi] : [3, 2, 1][bi];
    for (let k = 0; k < 50; k++) {
      const lay = generate(f, hashSeed(f, 1000 + k) >>> 1, band);
      assert.ok(lay, `family ${f} ${band} seed ${k} null`);
      const blk = lay.balls.filter((b) => b.id.startsWith('b'));
      assert.equal(blk.length, count, `family ${f} ${band} blocker count`);
      const ob = /** @type {any} */ (lay.balls.find((b) => b.id === 'ob'));
      if (f === 2) {
        const railed = blk.filter((b) => Math.abs(b.y - R) < 1e-9 || Math.abs(b.y - (50 - R)) < 1e-9);
        assert.equal(railed.length, count === 3 ? 2 : count, 'family 2 rail balls');
        if (count === 3) assert.ok(Math.abs(blk[2].y - blk[0].y) > 1e-9);
      }
      if (f === 5) for (const b of blk) assert.ok(b.x >= 7 - 2 * R / SQ3 - 1e-9 && b.x <= 14 + 2 * R / SQ3 + 1e-9, `family 5 x ${b.x}`);
      if (f === 3) assert.ok(Math.min(...blk.map((b) => Math.hypot(b.x - ob.x, b.y - ob.y))) < 2 * R + 1.5 + R / SQ3 + 2);
    }
  }
});
test('generate rejects bad family/band; seed helpers reject negative or non-integer', () => {
  assert.throws(() => generate(0, 1, 'easy'), /invalid family/);
  assert.throws(() => generate(9, 1, 'easy'), /invalid family/);
  assert.throws(() => generate(1.5, 1, 'easy'), /invalid family/);
  assert.throws(() => generate(1, 1, /** @type {any} */ ('extreme')), /invalid band/);
  assert.throws(() => dealSeedFor(1, 'easy', -1), /invalid seed/);
  assert.throws(() => dealSeedFor(1, 'easy', 1.5), /invalid seed/);
  assert.throws(() => parseDealSeed(-1), /invalid seed/);
  assert.throws(() => parseDealSeed(2.5), /invalid seed/);
});
test('shuffle: pinned order with fixed rng, input not mutated', () => {
  const seq = [0.9, 0.0, 0.5]; let i = 0;
  const input = [1, 2, 3, 4];
  assert.deepEqual(shuffle(input, () => seq[i++]), [3, 2, 1, 4]);
  assert.deepEqual(input, [1, 2, 3, 4]);
  assert.equal(i, 3);
});
