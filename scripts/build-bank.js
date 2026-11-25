// @ts-check
import os from 'node:os';
import { Worker } from 'node:worker_threads';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { dealSeedFor, BANDS, ACTIVE_FAMILIES } from '../src/deal/families.js';
import { FIXED_LAYOUTS } from '../src/deal/fixed.js';
import { hashSeed } from '../src/deal/prng.js';
import { BANK_GRID, N_FULL, TOP_N } from './bank-search.js';
import { modelHash } from './model-hash.js';

const root = new URL('../', import.meta.url).pathname;

/** @param {number} family */
export function newFamilyState(family) {
  const cell = () => ({ generated: 0, valid: 0, count: 0 });
  return {
    family, j: 0, nonNull: 0,
    cells: { easy: cell(), medium: cell(), hard: cell() },
    /** @type {import('../src/types.js').BankEntry[]} */
    entries: [],
    elapsedMs: 0,
    /** @type {string|null} */
    stop: null,
  };
}

/**
 * @param {ReturnType<typeof newFamilyState>} state
 * @param {any} res
 * @param {{cap: number, maxNonNull: number, timeCapMs: number}} cfg
 * @param {Set<number>} ids
 */
export function commitResult(state, res, cfg, ids) {
  if (res.j !== state.j) throw new Error('out of order');
  state.j++;
  if (res.kind !== 'null') {
    state.nonNull++;
    if (res.kind === 'measured' && !ids.has(res.seed)) {
      const c = state.cells[/** @type {import('../src/types.js').Band} */ (res.band)];
      if (res.skipped && c.count < cfg.cap) throw new Error('skip invariant');
      if (c.count < cfg.cap) {
        c.generated++;
        if (res.best && res.best.score.total >= 70) {
          c.valid++;
          c.count++;
          ids.add(res.seed);
          state.entries.push({ id: res.seed, family: state.family, band: res.band, genBand: res.genBand, seed: res.seed, share: res.share, layout: res.layout, best: res.best });
        }
      }
    }
  }
  if (BANDS.every((b) => state.cells[b].count >= cfg.cap)) state.stop = 'full';
  else if (state.nonNull >= cfg.maxNonNull) state.stop = 'limit';
  else if (state.elapsedMs >= cfg.timeCapMs) state.stop = 'time';
}

/**
 * @param {ReturnType<typeof newFamilyState>[]} states
 * @param {import('../src/types.js').BankExample[]} examples
 * @param {string} hash
 * @param {{families: number[], target: number, cap: number}} cfg
 * @returns {import('../src/types.js').Bank}
 */
export function assembleBank(states, examples, hash, cfg) {
  /** @type {import('../src/types.js').CoverageRow[]} */
  const coverage = [];
  /** @type {import('../src/types.js').BankEntry[]} */
  const entries = [];
  for (const family of cfg.families) {
    const s = states.find((x) => x.family === family);
    if (!s) throw new Error('missing family state ' + family);
    for (const band of BANDS) {
      const c = s.cells[band];
      coverage.push({ family, band, generated: c.generated, valid: c.valid, count: c.count });
      entries.push(...s.entries.filter((e) => e.band === band));
    }
  }
  return { v: 1, modelHash: hash, params: { families: cfg.families, target: cfg.target, cap: cfg.cap, speedCap: 130 }, coverage, entries, examples };
}

/** @param {number} ms */
const hm = (ms) => {
  const m = Math.floor(ms / 60000);
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`;
};

/**
 * @param {import('../src/types.js').Bank} bank
 * @param {ReturnType<typeof newFamilyState>[]} states
 * @param {number} elapsedMs
 */
export function formatReport(bank, states, elapsedMs) {
  const target = bank.params.target;
  const lines = ['family\tband\tgenerated\tvalid\tcount\ttarget\tshortfall'];
  for (const c of bank.coverage) lines.push([c.family, c.band, c.generated, c.valid, c.count, target, Math.max(0, target - c.count)].join('\t'));
  for (const c of bank.coverage) if (c.count < target) lines.push(`SHORTFALL family ${c.family} band ${c.band}: ${c.count}/${target}`);
  for (const s of states) lines.push(`family ${s.family} stopped: ${s.stop} at j=${s.j} (nonNull ${s.nonNull}, elapsed ${hm(s.elapsedMs)})`);
  lines.push(`bank: ${bank.entries.length} entries, ${Buffer.byteLength(JSON.stringify(bank) + '\n')} bytes`);
  for (const e of bank.examples) lines.push(`example ${e.name}: ${e.best ? e.best.score.total : 'none'}`);
  lines.push(`elapsed ${hm(elapsedMs)}`);
  return lines.join('\n');
}

/** @param {any} opts @returns {Promise<{bank: import('../src/types.js').Bank|null, report: string}>} */
export async function buildBank(opts = {}) {
  const {
    families = ACTIVE_FAMILIES, jobs = os.availableParallelism(), target = 100, cap = 100, maxNonNull = 2000,
    timeCapMs = 3 * 3600e3, grid = BANK_GRID, nFull = N_FULL, nTop = TOP_N, examples = true,
    out = root + 'data/safety-bank.json', checkpoint = root + '.bank-build/checkpoint.json', fresh = false,
    crashAfterCommits = Infinity, log = (/** @type {string} */ s) => process.stderr.write(s + '\n'),
  } = opts;
  const t0 = performance.now();
  const hash = modelHash(root);
  const cfgKey = JSON.stringify({ families, target, cap, maxNonNull, timeCapMs, grid, nFull, nTop, examples });
  if (fresh) rmSync(checkpoint, { force: true });
  /** @type {ReturnType<typeof newFamilyState>[]} */
  let states = families.map((/** @type {number} */ f) => newFamilyState(f));
  /** @type {import('../src/types.js').BankExample[]|null} */
  let exs = null;
  if (existsSync(checkpoint)) {
    const cp = JSON.parse(readFileSync(checkpoint, 'utf8'));
    if (cp.modelHash !== hash || cp.cfgKey !== cfgKey) throw new Error('stale checkpoint: delete .bank-build/ or pass --fresh');
    states = cp.states;
    exs = cp.examples;
  }
  /** @type {Set<number>} */
  const ids = new Set(states.flatMap((s) => s.entries.map((e) => e.id)));
  const ccfg = { cap, maxNonNull, timeCapMs };
  const save = () => {
    mkdirSync(dirname(checkpoint), { recursive: true });
    const tmp = checkpoint + '.tmp';
    writeFileSync(tmp, JSON.stringify({ v: 1, modelHash: hash, cfgKey, states, examples: exs }));
    renameSync(tmp, checkpoint);
  };

  const workers = Array.from({ length: jobs }, () => new Worker(new URL('./bank-worker.js', import.meta.url), { workerData: { grid, nFull, nTop } }));
  /** @type {Worker[]} */
  const idle = [...workers];
  /** @type {((res: any, w: Worker) => void)|null} */
  let onResult = null;
  for (const w of workers) {
    w.on('message', (res) => { idle.push(w); if (onResult) onResult(res, w); });
    w.on('error', (e) => { throw e; });
  }
  let commits = 0;
  let crashed = false;

  try {
    for (const state of states) {
      if (state.stop !== null) continue;
      const carried = state.elapsedMs;
      const familyStart = performance.now();
      let nextJ = state.j;
      /** @type {Map<number, any>} */
      const buf = new Map();
      await new Promise((resolve) => {
        const pump = () => {
          while (idle.length && state.stop === null && !crashed) {
            const w = /** @type {Worker} */ (idle.pop());
            const j = nextJ++;
            const k = Math.floor(j / 3), g = BANDS[j % 3];
            const skipCells = BANDS.filter((b) => state.cells[b].count >= cap);
            w.postMessage({ j, family: state.family, seed: dealSeedFor(state.family, g, hashSeed(state.family, j % 3, k) >>> 1), genBand: g, skipCells });
          }
        };
        onResult = (res) => {
          if (res.family !== state.family || state.stop !== null || crashed) return;
          buf.set(res.j, res);
          while (buf.has(state.j) && state.stop === null) {
            const r = buf.get(state.j);
            buf.delete(state.j);
            state.elapsedMs = carried + (performance.now() - familyStart);
            commitResult(state, r, ccfg, ids);
            save();
            commits++;
            if (state.j % 25 === 0) log(`family ${state.family} j=${state.j} nonNull=${state.nonNull} counts e/m/h=${BANDS.map((b) => state.cells[b].count).join('/')} elapsed ${hm(state.elapsedMs)}`);
            if (commits >= crashAfterCommits) { crashed = true; break; }
          }
          if (state.stop !== null || crashed) resolve(undefined);
          else pump();
        };
        pump();
      });
      onResult = null;
      if (crashed) return { bank: null, report: '' };
    }

    if (examples && !(exs && exs.length)) {
      /** @type {import('../src/types.js').BankExample[]} */
      const got = [];
      await new Promise((resolve) => {
        let next = 0, done = 0;
        const pump = () => {
          while (idle.length && next < FIXED_LAYOUTS.length) /** @type {Worker} */ (idle.pop()).postMessage({ example: true, i: next++ });
        };
        onResult = (res) => {
          got[res.i] = res.example;
          if (++done === FIXED_LAYOUTS.length) resolve(undefined);
          else pump();
        };
        pump();
      });
      onResult = null;
      exs = got;
      save();
    }

    if (modelHash(root) !== hash) throw new Error('model files changed during build');
    const bank = assembleBank(states, examples ? exs ?? [] : [], hash, { families, target, cap });
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(bank) + '\n');
    return { bank, report: formatReport(bank, states, states.reduce((a, s) => a + s.elapsedMs, 0) || performance.now() - t0) };
  } finally {
    await Promise.all(workers.map((w) => w.terminate()));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const opts = /** @type {any} */ ({});
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--jobs') opts.jobs = Number(a[++i]);
    else if (a[i] === '--fresh') opts.fresh = true;
    else { console.error('unknown flag ' + a[i]); process.exit(1); }
  }
  buildBank(opts).then((r) => { console.log(r.report); process.exit(0); }, (e) => { console.error(String(e && e.message || e)); process.exit(1); });
}
