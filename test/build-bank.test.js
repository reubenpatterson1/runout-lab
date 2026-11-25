// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { FIXED_LAYOUTS } from '../src/deal/fixed.js';
import { routeResult, newFamilyState, commitResult, assembleBank, formatReport, buildBank } from '../scripts/build-bank.js';
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

const tiny = { families: [2], cap: 1, maxNonNull: 8, grid: { offsets: [-0.46, 0, 0.46], offsets2: [-0.46, 0.46], speeds: [40], spins: [{ x: 0, y: 0 }] }, nFull: 3, nTop: 1, examples: false, log: () => {} };
const dir = () => mkdtempSync(tmpdir() + '/bank-') + '/';

test('larger build: jobs-independent with real entries; crash leaves no out; stale checkpoint rejected', async () => {
  const a = dir(), b = dir(), c = dir();
  await buildBank({ ...tiny, jobs: 1, out: a + 'b.json', checkpoint: a + 'c.json' });
  await buildBank({ ...tiny, jobs: 4, out: b + 'b.json', checkpoint: b + 'c.json' });
  const sa = readFileSync(a + 'b.json', 'utf8');
  assert.equal(sa, readFileSync(b + 'b.json', 'utf8'));
  const bank = JSON.parse(sa);
  assert.ok(bank.entries.length >= 2, 'entries ' + bank.entries.length);
  assert.ok(bank.coverage.some((r) => r.count === 1));
  const cr = await buildBank({ ...tiny, jobs: 3, out: c + 'b.json', checkpoint: c + 'c.json', crashAfterCommits: 3 });
  assert.equal(cr.bank, null); assert.ok(!existsSync(c + 'b.json'));
  await assert.rejects(buildBank({ ...tiny, cap: 2, jobs: 2, out: c + 'b.json', checkpoint: c + 'c.json' }), /stale checkpoint/);
  await buildBank({ ...tiny, jobs: 3, out: c + 'b.json', checkpoint: c + 'c.json' });
  assert.equal(readFileSync(c + 'b.json', 'utf8'), sa);
});
test('a job that throws is a counted reject with reason error and the build completes', async () => {
  const d = dir();
  const r = await buildBank({ ...tiny, jobs: 2, failJ: 1, out: d + 'b.json', checkpoint: d + 'c.json' });
  assert.ok(r.bank);
  assert.ok(r.report.includes('errors: 1'));
  assert.ok(/error family 2 j=1 seed \d+: Error: injected failure/.test(r.report));
});

test('routeResult routes by message shape in each phase, never by error', () => {
  const st = { family: 2, stop: null };
  const fam = { j: 3, family: 2, seed: 5, kind: 'null' }, famErr = { j: 3, family: 2, seed: 5, error: 'Error: x' };
  const ex = { i: 1, example: { name: 'n' } }, exErr = { i: 1, error: 'Error: y' };
  assert.equal(routeResult('examples', fam, null), 'ignore');
  assert.equal(routeResult('examples', famErr, null), 'ignore');
  assert.equal(routeResult('examples', ex, null), 'example');
  assert.equal(routeResult('examples', exErr, null), 'example-error');
  assert.equal(routeResult('family', fam, st), 'family-commit');
  assert.equal(routeResult('family', famErr, st), 'family-commit');
  assert.equal(routeResult('family', ex, st), 'ignore');
  assert.equal(routeResult('family', exErr, st), 'ignore');
  assert.equal(routeResult('family', { ...fam, family: 3 }, st), 'ignore');
  assert.equal(routeResult('family', fam, { family: 2, stop: 'full' }), 'ignore');
});
test('examples run before any family job; a throwing family job does not poison the examples', async () => {
  const d = dir(), log = [];
  const r = await buildBank({ ...tiny, examples: true, jobs: 8, failJ: 1, dispatchLog: log, out: d + 'b.json', checkpoint: d + 'c.json' });
  assert.deepEqual(log.slice(0, 3).sort(), ['example 0', 'example 1', 'example 2']);
  assert.ok(log.slice(3).every((x) => x.startsWith('family')));
  assert.equal(JSON.parse(readFileSync(d + 'c.json', 'utf8')).examples.length, 3);
  assert.ok(r.report.startsWith('WARNING: 1 job errors'));
});
test('watchdog rejects a stuck job with context and keeps the checkpoint', async () => {
  const d = dir();
  await assert.rejects(buildBank({ ...tiny, jobs: 2, slowJ: 1, watchdogMs: 300, out: d + 'b.json', checkpoint: d + 'c.json' }), /worker timeout family 2 j=1 seed \d+/);
  assert.ok(existsSync(d + 'c.json')); assert.ok(!existsSync(d + 'b.json'));
});
