// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { R } from '../src/engine/constants.js';
import { ACTIVE_FAMILIES } from '../src/deal/families.js';
import { candidateShots } from '../src/search/grid.js';
import { scoreSafety } from '../src/eval/safety.js';
import { modelHash } from '../scripts/model-hash.js';
import { BANK_GRID, roundLayout, spacingOk, measureBand, bankSearch, SPEED_CAP } from '../scripts/bank-search.js';
import { B, L } from './helpers.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const lay = L([B('cue', 30, 25), B('ob', 50, 20), B('b1', 58, 30), B('b2', 58 + 2 * R, 30)]);
const TINY = { offsets: [-0.46, 0, 0.46], offsets2: [-0.46, 0.46], speeds: [40], spins: [{ x: 0, y: 0 }] };

test('active families and bank grid shape', () => {
  assert.deepEqual(ACTIVE_FAMILIES, [1, 2, 3, 6, 7, 8]);
  assert.equal(candidateShots(lay, BANK_GRID).length, 2250);
  const two = L([B('cue', 50, 25), B('1', 70, 15), B('2', 70, 35)], ['1', '2']);
  assert.equal(candidateShots(two, BANK_GRID).length, 3060);
  assert.equal(Math.max(...BANK_GRID.speeds), 130); assert.equal(SPEED_CAP, 130);
});
test('roundLayout rounds to 0.01 in; spacingOk is strict 2R − 1e-6', () => {
  const r = roundLayout(L([B('cue', 10.123, 20.987), B('ob', 30.005, 40)]));
  assert.deepEqual(r.balls, [B('cue', 10.12, 20.99), B('ob', 30.01, 40)]);
  assert.equal(spacingOk([B('a', 10, 10), B('b', 10 + 2 * R, 10)]), true);
  assert.equal(spacingOk([B('a', 10, 10), B('b', 10 + 2 * R - 1e-5, 10)]), false);
});
test('measureBand is classify(shareGe70) of the difficulty grid', () => {
  const m = measureBand(lay); assert.ok(m.share >= 0 && m.share <= 1);
  assert.equal(m.band, m.share > 0.15 ? 'easy' : m.share >= 0.04 ? 'medium' : 'hard');
});
test('bankSearch: B&B + memo deep-equal the reference; best re-scores exactly; speeds ≤ 130', () => {
  const fast = { full: 0 }, ref = { full: 0 };
  const a = bankSearch(lay, { grid: TINY, nFull: 3, nTop: 1, stats: fast });
  const b = bankSearch(lay, { grid: TINY, nFull: 3, nTop: 1, reference: true, stats: ref });
  assert.ok(a.best, 'precondition: a best exists'); assert.deepEqual(a, b); assert.ok(fast.full <= ref.full);
  assert.deepEqual(scoreSafety(lay, a.best.shot), a.best.score);
  assert.ok(a.best.score.total >= a.top[0].score.total);
  const capped = bankSearch(lay, { grid: { ...TINY, speeds: [130] }, nFull: 1, nTop: 1 });
  assert.ok(capped.best && capped.best.shot.speed <= 130);
});
test('bankSearch: top-5 path (nTop 5) deep-equals the reference', () => {
  const a = bankSearch(lay, { grid: TINY, nFull: 8, nTop: 5 });
  const b = bankSearch(lay, { grid: TINY, nFull: 8, nTop: 5, reference: true });
  assert.ok(a.top.length > 1, 'precondition: several top entries'); assert.deepEqual(a, b);
});
test('modelHash: deterministic, changes when a model file changes', () => {
  assert.match(modelHash(root), /^[0-9a-f]{64}$/); assert.equal(modelHash(root), modelHash(root));
  const t = mkdtempSync(tmpdir() + '/mh-') + '/';
  for (const d of ['src/engine', 'src/geometry', 'src/eval']) { mkdirSync(t + d, { recursive: true }); cpSync(root + d, t + d, { recursive: true }); }
  assert.equal(modelHash(t), modelHash(root));
  writeFileSync(t + 'src/eval/position.js', '// changed\n', { flag: 'a' }); assert.notEqual(modelHash(t), modelHash(root));
});
