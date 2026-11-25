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
test('bankSearch: non-degenerate B&B cut (top-N threshold break) deep-equals the reference; speeds ≤ 130', () => {
  const layB = L([B('cue', 43.06, 35.83), B('ob', 62.17, 29.12), B('b2', 78.24, 35.9), B('b3', 85.35, 36.07)]);
  const grid = { offsets: [-0.46, 0, 0.46], offsets2: [0], speeds: [40, 106, 130], spins: [{ x: 0, y: 0 }, { x: 0, y: 0.5 }] };
  const fast = { full: 0 }, ref = { full: 0 };
  const a = bankSearch(layB, { grid, nFull: 5, nTop: 2, stats: fast });
  const b = bankSearch(layB, { grid, nFull: 5, nTop: 2, reference: true, stats: ref });
  assert.equal(a.top.length, 2, 'precondition: top is full');
  assert.ok(a.best && a.best.score.total > 0, 'precondition: non-zero best');
  assert.ok(fast.full < ref.full, `precondition: a cut happened (${fast.full} < ${ref.full})`);
  assert.deepEqual(a, b);
  for (const t of [...a.top, a.best]) assert.ok(t.shot.speed <= 130);
});
const copyTree = () => {
  const t = mkdtempSync(tmpdir() + '/mh-') + '/';
  for (const d of ['src/engine', 'src/geometry', 'src/eval', 'src/search']) { mkdirSync(t + d, { recursive: true }); cpSync(root + d, t + d, { recursive: true }); }
  return t;
};
test('modelHash: deterministic, covers model + grid.js/search.js, framed by path and length', () => {
  assert.match(modelHash(root), /^[0-9a-f]{64}$/); assert.equal(modelHash(root), modelHash(root));
  const t = copyTree();
  assert.equal(modelHash(t), modelHash(root));
  writeFileSync(t + 'src/eval/position.js', '// changed\n', { flag: 'a' }); assert.notEqual(modelHash(t), modelHash(root));
  const g = copyTree(); writeFileSync(g + 'src/search/grid.js', '// changed\n', { flag: 'a' });
  assert.notEqual(modelHash(g), modelHash(root), 'grid.js is covered');
  const u = copyTree(); writeFileSync(u + 'src/search/search.js', '// changed\n', { flag: 'a' });
  assert.notEqual(modelHash(u), modelHash(root), 'search.js is covered');
  // the same appended byte in two different files hashes differently (path framing)
  const m2 = copyTree(); writeFileSync(m2 + 'src/eval/position.js', 'X', { flag: 'a' });
  const m3 = copyTree(); writeFileSync(m3 + 'src/eval/safety.js', 'X', { flag: 'a' });
  assert.notEqual(modelHash(m2), modelHash(m3));
});
