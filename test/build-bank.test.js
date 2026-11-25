// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { newFamilyState, commitResult, assembleBank, formatReport, buildBank } from '../scripts/build-bank.js';
const cfg = { cap: 2, maxNonNull: 6, timeCapMs: 1e12 };
const best = (total) => ({ shot: { aimDeg: 0, speed: 30, spin: { x: 0, y: 0 } }, score: /** @type {any} */ ({ total }) });
const m = (j, seed, band, total, skipped = false) => ({ j, family: 2, seed, genBand: 'easy', kind: 'measured', layout: /** @type {any} */ ({}), share: 0.2, band, skipped, best: skipped ? null : best(total) });

test('commitResult: counting, cap, duplicate seed, rejects, order and stop rules', () => {
  const s = newFamilyState(2), ids = new Set();
  commitResult(s, { j: 0, family: 2, seed: 1, genBand: 'easy', kind: 'null' }, cfg, ids); assert.equal(s.nonNull, 0);
  commitResult(s, { j: 1, family: 2, seed: 2, genBand: 'easy', kind: 'reject' }, cfg, ids); assert.equal(s.nonNull, 1);
  commitResult(s, m(2, 10, 'easy', 80), cfg, ids); commitResult(s, m(3, 11, 'easy', 60), cfg, ids);
  commitResult(s, m(4, 10, 'easy', 90), cfg, ids); // duplicate seed: no counts
  commitResult(s, m(5, 12, 'easy', 75), cfg, ids); // cell now full (2)
  assert.deepEqual(s.cells.easy, { generated: 3, valid: 2, count: 2 }); assert.equal(s.entries.length, 2);
  commitResult(s, { j: 6, family: 2, seed: 3, genBand: 'easy', kind: 'reject' }, cfg, ids);
  assert.equal(s.stop, 'limit'); // nonNull reached 6
  assert.throws(() => commitResult(s, m(9, 13, 'easy', 75), cfg, ids), /out of order/);
  const t = newFamilyState(2); t.cells.easy.count = 0;
  assert.throws(() => commitResult(t, m(0, 20, 'easy', 0, true), cfg, new Set()), /skip invariant/);
  const u = newFamilyState(2); u.elapsedMs = 2e12; commitResult(u, m(0, 30, 'hard', 10), cfg, new Set()); assert.equal(u.stop, 'time');
});
test('assembleBank order and formatReport SHORTFALL lines', () => {
  const s = newFamilyState(2), ids = new Set();
  commitResult(s, m(0, 50, 'hard', 80), cfg, ids); commitResult(s, m(1, 51, 'easy', 80), cfg, ids);
  const bank = assembleBank([s], [], 'h', { families: [2], target: 100, cap: 100 });
  assert.deepEqual(bank.entries.map((e) => e.band), ['easy', 'hard']);
  assert.deepEqual(bank.coverage.map((c) => c.band), ['easy', 'medium', 'hard']);
  const rep = formatReport(bank, [s], 0);
  assert.ok(rep.includes('SHORTFALL family 2 band easy: 1/100') && rep.includes('SHORTFALL family 2 band medium: 0/100'));
});
test('buildBank output is independent of --jobs and survives crash + resume', async () => {
  const base = { families: [2], cap: 1, maxNonNull: 3, grid: { offsets: [-0.46, 0, 0.46], offsets2: [-0.46, 0.46], speeds: [40], spins: [{ x: 0, y: 0 }] }, nFull: 3, nTop: 1, examples: false, log: () => {} };
  const run = async (jobs, extra = {}) => { const d = mkdtempSync(tmpdir() + '/bank-') + '/';
    await buildBank({ ...base, jobs, out: d + 'b.json', checkpoint: d + 'c.json', ...extra }); return d; };
  const a = await run(1), b = await run(3);
  assert.equal(readFileSync(a + 'b.json', 'utf8'), readFileSync(b + 'b.json', 'utf8'));
  const c = mkdtempSync(tmpdir() + '/bank-') + '/';
  const crashed = await buildBank({ ...base, jobs: 2, out: c + 'b.json', checkpoint: c + 'c.json', crashAfterCommits: 2 });
  assert.equal(crashed.bank, null);
  await buildBank({ ...base, jobs: 2, out: c + 'b.json', checkpoint: c + 'c.json' });
  assert.equal(readFileSync(c + 'b.json', 'utf8'), readFileSync(a + 'b.json', 'utf8'));
  const bank = JSON.parse(readFileSync(a + 'b.json', 'utf8')); assert.equal(bank.v, 1); assert.equal(bank.coverage.length, 3);
});
