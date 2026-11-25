// @ts-check
import os from 'node:os';
import { Worker } from 'node:worker_threads';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { dealSeedFor, BANDS, ACTIVE_FAMILIES } from '../src/deal/families.js';
import { FIXED_LAYOUTS } from '../src/deal/fixed.js';
import { hashSeed } from '../src/deal/prng.js';
import { BANK_GRID, N_FULL, TOP_N } from './bank-search.js';
import { modelHash } from './model-hash.js';

const root = fileURLToPath(new URL('../', import.meta.url));

/**
 * R38: hash of the builder's own inputs, same framing as modelHash.
 * @param {string} r repo root ending with '/'
 */
function buildHash(r) {
  const h = createHash('sha256');
  for (const p of ['scripts/bank-search.js', 'scripts/bank-worker.js', 'scripts/build-bank.js', 'src/deal/families.js', 'src/deal/prng.js']) {
    const buf = readFileSync(r + p);
    h.update(p + '\0' + buf.length + '\0');
    h.update(buf);
  }
  return h.digest('hex');
}

/** @param {number} family */
export function newFamilyState(family) {
  const cell = () => ({ generated: 0, valid: 0, count: 0 });
  return {
    family, j: 0, nonNull: 0,
    cells: { easy: cell(), medium: cell(), hard: cell() },
    /** @type {import('../src/types.js').BankEntry[]} */
    entries: [],
    // Advances only at commits (carried + wall time since the family started), so a time stop is checked per commit.
    elapsedMs: 0,
    errors: 0,
    /** @type {{family: number, j: number, seed: number, message: string}[]} */
    errorList: [],
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
  if (res.error) { // R37: a job that threw in the worker is a counted reject
    state.nonNull++;
    state.errors++;
    if (state.errorList.length < 5) state.errorList.push({ family: state.family, j: res.j, seed: res.seed, message: String(res.error).split('\n')[0] });
  } else if (res.kind !== 'null') {
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

/**
 * Route a worker result by message shape (R39): example results carry `i` and no `j`; family results carry `j` + `family`.
 * Never routes on `error`.
 * @param {'examples'|'family'} phase
 * @param {any} res
 * @param {{family: number, stop: string|null}|null} state current family state (family phase)
 * @returns {'family-commit'|'example'|'example-error'|'ignore'}
 */
export function routeResult(phase, res, state) {
  const isExample = res.i !== undefined && res.j === undefined;
  if (phase === 'examples') return isExample ? (res.error ? 'example-error' : 'example') : 'ignore';
  if (isExample || !state || res.j === undefined || res.family !== state.family || state.stop !== null) return 'ignore';
  return 'family-commit';
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
  const nErr = states.reduce((a, s) => a + s.errors, 0);
  const lines = nErr > 0 ? [`WARNING: ${nErr} job errors`] : [];
  lines.push('family\tband\tgenerated\tvalid\tcount\ttarget\tshortfall');
  for (const c of bank.coverage) lines.push([c.family, c.band, c.generated, c.valid, c.count, target, Math.max(0, target - c.count)].join('\t'));
  for (const c of bank.coverage) if (c.count < target) lines.push(`SHORTFALL family ${c.family} band ${c.band}: ${c.count}/${target}`);
  for (const s of states) lines.push(`family ${s.family} stopped: ${s.stop} at j=${s.j} (nonNull ${s.nonNull}, elapsed ${hm(s.elapsedMs)})`);
  lines.push(`errors: ${states.reduce((a, s) => a + s.errors, 0)}`);
  for (const s of states) for (const e of s.errorList) lines.push(`error family ${e.family} j=${e.j} seed ${e.seed}: ${e.message}`);
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
    crashAfterCommits = Infinity, failJ = undefined, slowJ = undefined, watchdogMs = 15 * 60e3, dispatchLog = undefined, log = (/** @type {string} */ s) => process.stderr.write(s + '\n'),
  } = opts;
  const t0 = performance.now();
  const hash = modelHash(root);
  const bHash = buildHash(root);
  const cfgKey = JSON.stringify({ bHash, families, target, cap, maxNonNull, timeCapMs, grid, nFull, nTop, examples });
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

  const workers = Array.from({ length: jobs }, () => new Worker(new URL('./bank-worker.js', import.meta.url), { workerData: { grid, nFull, nTop, failJ, slowJ } }));
  /** @type {Worker[]} */
  const idle = [...workers];
  /** @type {((res: any, w: Worker) => void)|null} */
  let onResult = null;
  /** @type {Map<Worker, any>} */
  const cur = new Map();
  let closing = false;
  /** @type {(e: Error) => void} */
  let fail = () => {};
  const failed = new Promise((_, rej) => { fail = rej; });
  failed.catch(() => {});
  /** @param {any} m */
  const what = (m) => (m.example ? `example i=${m.i}` : `family ${m.family} j=${m.j} seed ${m.seed}`);
  /** @param {Worker} w @param {string} why */
  const infra = (w, why) => {
    const c = cur.get(w);
    fail(new Error(c ? `worker failed ${what(c.m)}: ${why}` : `worker failed (no job in flight): ${why}`));
  };
  for (const w of workers) {
    w.on('message', (res) => {
      const c = cur.get(w);
      if (c) clearTimeout(c.timer);
      cur.delete(w); idle.push(w); if (onResult) onResult(res, w);
    });
    w.on('error', (e) => infra(w, String(e && e.message || e)));
    w.on('exit', (c) => { if (!closing) infra(w, 'unexpected exit code ' + c); });
  }
  /** @param {Worker} w @param {any} m */
  const post = (w, m) => {
    const timer = setTimeout(() => fail(new Error(`worker timeout ${what(m)}`)), watchdogMs);
    cur.set(w, { m, timer });
    if (dispatchLog) dispatchLog.push(m.example ? `example ${m.i}` : `family ${m.family} j=${m.j}`);
    w.postMessage(m);
  };
  let commits = 0;
  let crashed = false;

  try {
    if (examples && !(exs && exs.length)) { // R39: examples first, while all workers are idle
      /** @type {import('../src/types.js').BankExample[]} */
      const got = [];
      await Promise.race([failed, new Promise((resolve, reject) => {
        let next = 0, done = 0;
        const pump = () => {
          while (idle.length && next < FIXED_LAYOUTS.length) post(/** @type {Worker} */ (idle.pop()), { example: true, i: next++ });
        };
        onResult = (res) => {
          const route = routeResult('examples', res, null);
          if (route === 'example-error') { reject(new Error(`worker failed example i=${res.i}: ${String(res.error).split('\n')[0]}`)); return; }
          if (route === 'example') {
            got[res.i] = res.example;
            if (++done === FIXED_LAYOUTS.length) { resolve(undefined); return; }
          }
          pump();
        };
        pump();
      })]);
      onResult = null;
      exs = got;
      save();
    }

    for (const state of states) {
      if (state.stop !== null) continue;
      const carried = state.elapsedMs;
      const familyStart = performance.now();
      let nextJ = state.j;
      /** @type {Map<number, any>} */
      const buf = new Map();
      await Promise.race([failed, new Promise((resolve) => {
        const pump = () => {
          while (idle.length && state.stop === null && !crashed && nextJ - state.j < 4 * jobs) {
            const w = /** @type {Worker} */ (idle.pop());
            const j = nextJ++;
            const k = Math.floor(j / 3), g = BANDS[j % 3];
            const skipCells = BANDS.filter((b) => state.cells[b].count >= cap);
            post(w, { j, family: state.family, seed: dealSeedFor(state.family, g, hashSeed(state.family, j % 3, k) >>> 1), genBand: g, skipCells });
          }
        };
        onResult = (res) => {
          if (routeResult('family', res, state) !== 'family-commit' || crashed) { pump(); return; }
          buf.set(res.j, res);
          let wrote = false;
          while (buf.has(state.j) && state.stop === null) {
            const r = buf.get(state.j);
            buf.delete(state.j);
            state.elapsedMs = carried + (performance.now() - familyStart);
            commitResult(state, r, ccfg, ids);
            wrote = true;
            commits++;
            if (state.j % 25 === 0) log(`family ${state.family} j=${state.j} nonNull=${state.nonNull} counts e/m/h=${BANDS.map((b) => state.cells[b].count).join('/')} elapsed ${hm(state.elapsedMs)}`);
            if (commits >= crashAfterCommits) { crashed = true; break; }
          }
          if (wrote) save();
          if (state.stop !== null || crashed) resolve(undefined);
          else pump();
        };
        pump();
      })]);
      onResult = null;
      if (crashed) return { bank: null, report: '' };
    }

    if (modelHash(root) !== hash || buildHash(root) !== bHash) throw new Error('model files changed during build');
    const bank = assembleBank(states, examples ? exs ?? [] : [], hash, { families, target, cap });
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out + '.tmp', JSON.stringify(bank) + '\n');
    renameSync(out + '.tmp', out);
    return { bank, report: formatReport(bank, states, states.reduce((a, s) => a + s.elapsedMs, 0) || performance.now() - t0) };
  } finally {
    closing = true;
    for (const c of cur.values()) clearTimeout(c.timer);
    await Promise.all(workers.map((w) => w.terminate()));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const opts = /** @type {any} */ ({});
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--jobs') { opts.jobs = Number(a[++i]); if (!Number.isInteger(opts.jobs) || opts.jobs < 1) { console.error('--jobs must be an integer >= 1'); process.exit(1); } }
    else if (a[i] === '--fresh') opts.fresh = true;
    else { console.error('unknown flag ' + a[i]); process.exit(1); }
  }
  buildBank(opts).then((r) => { console.log(r.report); process.exit(0); }, (e) => { console.error(String(e && e.message || e)); process.exit(1); });
}
