// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ACTIVE_FAMILIES, BANDS, generate, parseDealSeed } from '../src/deal/families.js';
import { FIXED_LAYOUTS } from '../src/deal/fixed.js';
import { validateLayout } from '../src/engine/layout.js';
import { scoreSafety } from '../src/eval/safety.js';
import { classify } from '../src/search/search.js';
import { modelHash } from '../scripts/model-hash.js';
import { roundLayout, spacingOk } from '../scripts/bank-search.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const path = root + 'data/safety-bank.json';
const bank = JSON.parse(readFileSync(path, 'utf8'));

test('schema and params', () => {
  assert.deepEqual(Object.keys(bank), ['v', 'modelHash', 'params', 'coverage', 'entries', 'examples']);
  assert.equal(bank.v, 1); assert.deepEqual(bank.params, { families: [1, 2, 3, 6, 7, 8], target: 100, cap: 100, speedCap: 130 });
});
test('modelHash matches src/engine, src/geometry, src/eval (rebuild the bank after any model change)', () => {
  assert.equal(bank.modelHash, modelHash(root));
});
test('integrity: ids, families, bands, replayable rounded layouts, spacing, speed cap, ≥ 70', () => {
  const ids = new Set(); let last = -1;
  for (const e of bank.entries) {
    assert.deepEqual(Object.keys(e), ['id', 'family', 'band', 'genBand', 'seed', 'share', 'layout', 'best']);
    assert.ok(Number.isInteger(e.id) && e.id === e.seed && !ids.has(e.id)); ids.add(e.id);
    assert.ok(ACTIVE_FAMILIES.includes(e.family) && BANDS.includes(e.band) && BANDS.includes(e.genBand));
    assert.deepEqual(parseDealSeed(e.seed), { family: e.family, band: e.genBand }); assert.equal(e.band, classify(e.share));
    const order = ACTIVE_FAMILIES.indexOf(e.family) * 3 + BANDS.indexOf(e.band); assert.ok(order >= last); last = order;
    assert.deepEqual(e.layout, roundLayout(/** @type {any} */ (generate(e.family, e.seed, e.genBand))));
    assert.deepEqual(validateLayout(e.layout), { ok: true }); assert.ok(spacingOk(e.layout.balls));
    assert.ok(e.best.shot.speed <= 130 && e.best.score.total >= 70);
  }
});
test('coverage rows agree with entries; examples re-score exactly', () => {
  assert.deepEqual(bank.coverage.map((c) => [c.family, c.band]), ACTIVE_FAMILIES.flatMap((f) => BANDS.map((b) => [f, b])));
  for (const c of bank.coverage) {
    const n = bank.entries.filter((e) => e.family === c.family && e.band === c.band).length;
    assert.equal(c.count, n); assert.equal(c.valid, c.count); assert.ok(c.count <= 100 && c.generated >= c.valid);
  }
  assert.deepEqual(bank.examples.map((x) => [x.name, x.slug]), [['open hook', 'open-hook'], ['rail tuck', 'rail-tuck'], ['behind the 8', 'behind-the-8']]);
  bank.examples.forEach((x, i) => { assert.deepEqual(x.layout, FIXED_LAYOUTS[i].layout);
    if (x.best) { assert.ok(x.best.shot.speed <= 130); assert.deepEqual(scoreSafety(x.layout, x.best.shot), x.best.score); } });
});
test('coverage report (shortfalls go to the owner; fail only if a band has < 4 entries)', (t) => {
  for (const c of bank.coverage) t.diagnostic(`family ${c.family} ${c.band}: ${c.count}/100${c.count < 100 ? ' SHORTFALL' : ''}`);
  t.diagnostic(`file ${statSync(path).size} bytes (target ≤ 1.5 MB, R32)`);
  for (const b of BANDS) assert.ok(bank.entries.filter((e) => e.band === b).length >= 4, `band ${b} has < 4 entries`);
});
