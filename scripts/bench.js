// @ts-check
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { suggest } from '../src/search/search.js';
import { sampleCells } from '../src/deal/bank.js';

/** @param {number[]} values */
function stats(values) {
  const n = values.length;
  if (n === 0) return { n, median: 0, p95: 0, max: 0 };
  const s = [...values].sort((a, b) => a - b);
  const median = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  return { n, median, p95: s[Math.ceil(0.95 * n) - 1], max: s[n - 1] };
}

/** @param {{n?: number, limit?: number, unseeded?: boolean}} [opts] */
export function runBench(opts = {}) {
  const { n = 2, limit, unseeded = true } = opts;
  const path = fileURLToPath(new URL('../data/safety-bank.json', import.meta.url));
  let t = performance.now();
  const raw = readFileSync(path, 'utf8');
  const loadMs = performance.now() - t;
  t = performance.now();
  const bank = JSON.parse(raw);
  const parseMs = performance.now() - t;
  const cases = sampleCells(bank, n).slice(0, limit ?? Infinity);
  /** @type {number[]} */ const seeded = [];
  /** @type {number[]} */ const unseededMs = [];
  let belowStored = 0;
  for (const e of cases) {
    t = performance.now();
    const r = suggest(e.layout, { seedShots: [{ ...e.best.shot, known: e.best.score }] });
    seeded.push(performance.now() - t);
    if (r.best.score.total < e.best.score.total) belowStored++;
    if (unseeded) {
      t = performance.now();
      suggest(e.layout);
      unseededMs.push(performance.now() - t);
    }
  }
  return {
    loadMs, parseMs, cases: cases.length, seeded: stats(seeded), belowStored,
    unseeded: unseeded ? stats(unseededMs) : null,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  console.log(JSON.stringify(runBench(), null, 2));
}
