// @ts-check
import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { generate } from '../src/deal/families.js';
import { FIXED_LAYOUTS } from '../src/deal/fixed.js';
import { validateLayout } from '../src/engine/layout.js';
import { roundLayout, spacingOk, measureBand, bankSearch } from './bank-search.js';

/**
 * @param {{j: number, family: number, seed: number, genBand: import('../src/types.js').Band, skipCells: import('../src/types.js').Band[]}} job
 * @param {{grid: import('../src/search/grid.js').Grid, nFull: number, nTop: number, failJ?: number, slowJ?: number}} cfg
 * @returns {any}
 */
export function runJob(job, cfg) {
  const { j, family, seed, genBand } = job;
  if (cfg.slowJ === j) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20000); // test-only hook
  if (cfg.failJ === j) throw new Error('injected failure'); // test-only hook
  const head = { j, family, seed, genBand };
  const lay = generate(family, seed, genBand);
  if (!lay) return { ...head, kind: 'null' };
  const r = roundLayout(lay);
  if (!validateLayout(r).ok || !spacingOk(r.balls)) return { ...head, kind: 'reject' };
  const { share, band } = measureBand(r);
  if (job.skipCells.includes(band)) return { ...head, kind: 'measured', layout: r, share, band, skipped: true, best: null };
  return { ...head, kind: 'measured', layout: r, share, band, skipped: false, best: bankSearch(r, cfg).best };
}

/**
 * @param {{name: string, layout: import('../src/types.js').Layout}} f
 * @param {{grid: import('../src/search/grid.js').Grid, nFull: number, nTop: number}} cfg
 * @returns {import('../src/types.js').BankExample}
 */
export function runExample(f, cfg) {
  return { name: f.name, slug: f.name.replaceAll(' ', '-'), layout: f.layout, best: bankSearch(f.layout, cfg).best };
}

if (!isMainThread && parentPort) {
  const port = parentPort;
  port.on('message', (m) => {
    try {
      port.postMessage(m.example ? { i: m.i, example: runExample(FIXED_LAYOUTS[m.i], workerData) } : runJob(m, workerData));
    } catch (e) {
      const error = e instanceof Error ? e.stack : String(e);
      port.postMessage(m.example ? { i: m.i, error } : { j: m.j, family: m.family, seed: m.seed, error });
    }
  });
}
