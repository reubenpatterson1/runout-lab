// @ts-check
import { simulate } from '../engine/simulate.js';
import { validateLayout } from '../engine/layout.js';
import { gateFor, opponentTargets, prepareSafety, optimisticTotal, finishSafety } from '../eval/safety.js';
import { scorePosition } from '../eval/position.js';
import { kickLanes } from '../eval/kick.js';
import { SUGGEST_GRID, DIFFICULTY_GRID, candidateShots } from './grid.js';

export const K_FULL = 3;

/**
 * A seed shot may carry its already-known SafetyScore in `known` (used without re-scoring; exact by determinism).
 * @typedef {import('../types.js').Shot & {known?: import('../types.js').SafetyScore}} SeedShot
 * @typedef {{seedShots?: SeedShot[], stopAtTotal?: number, reference?: boolean, stats?: {kickCalls: number}}} SearchOpts
 */

/** @param {import('../types.js').Ball[]} final */
const finalKey = (final) => final.map((b) => `${b.id}:${b.x},${b.y}`).join('|');

/**
 * Stage A scores every grid candidate cheaply (mirror lanes) and selects the Stage B set: the seeds plus the
 * top K_FULL candidates whose nominal final layouts are distinct from each other and from the seeds (R26).
 * @param {import('../types.js').Layout} layout
 * @param {import('./grid.js').Grid} grid
 * @param {SearchOpts} [opts]
 * @returns {{cheapCount: number, shareGe70: number, fullSet: {shot: import('../types.js').Shot, known?: import('../types.js').SafetyScore}[]}}
 */
export function selectShots(layout, grid, opts = {}) {
  const v = validateLayout(layout);
  if (!v.ok) throw new Error('invalid layout: ' + v.reason);
  if (!opponentTargets(layout.rules, layout.balls, layout.cueId).length) throw new Error('invalid layout: no opponent targets');
  const candidates = candidateShots(layout, grid);
  /** @type {{shot: import('../types.js').Shot, cheap: number, final: import('../types.js').Ball[], idx: number}[]} */
  const ungated = [];
  let ge70 = 0;
  candidates.forEach((shot, idx) => {
    const sim = simulate(layout, shot, { record: false });
    if (gateFor(sim, layout)) return;
    const targets = opponentTargets(layout.rules, sim.final, layout.cueId);
    const cheap = scorePosition(sim.final, layout.cueId, targets, { cheap: true }).score;
    if (cheap >= 70) ge70++;
    ungated.push({ shot, cheap, final: sim.final, idx });
  });
  const shareGe70 = candidates.length ? ge70 / candidates.length : 0;

  /** @type {{shot: import('../types.js').Shot, known?: import('../types.js').SafetyScore}[]} */
  const fullSet = [];
  const seen = new Set();
  for (const sd of opts.seedShots ?? []) {
    const shot = { aimDeg: sd.aimDeg, speed: sd.speed, spin: sd.spin };
    const sim = simulate(layout, shot, { record: false });
    if (!gateFor(sim, layout)) seen.add(finalKey(sim.final));
    fullSet.push({ shot, known: sd.known });
  }
  let picked = 0;
  for (const c of [...ungated].sort((a, b) => b.cheap - a.cheap || a.idx - b.idx)) {
    if (picked >= K_FULL) break;
    const key = finalKey(c.final);
    if (seen.has(key)) continue;
    seen.add(key);
    picked++;
    fullSet.push({ shot: c.shot });
  }
  return { cheapCount: candidates.length, shareGe70, fullSet };
}

/**
 * Runs selectShots, then Stage B fully scores the set. Internal opts: `stopAtTotal` ends Stage B
 * at the first shot reaching that total (R28, validateDeal only); `reference` disables kick memo and
 * branch-and-bound (R27, for equivalence tests); `stats.kickCalls` counts kickLanes evaluations.
 * @param {import('../types.js').Layout} layout
 * @param {import('./grid.js').Grid} grid
 * @param {SearchOpts} [opts]
 * @returns {import('../types.js').SuggestResult}
 */
export function runSearch(layout, grid, opts = {}) {
  const { cheapCount, shareGe70, fullSet } = selectShots(layout, grid, opts);
  const memo = new Map();
  /** @type {import('../eval/safety.js').KickFn} */
  const kick = (balls, cueId, targetIds) => {
    const key = cueId + '#' + targetIds.join(',') + '#' + finalKey(balls);
    if (!opts.reference && memo.has(key)) return memo.get(key);
    if (opts.stats) opts.stats.kickCalls++;
    const lanes = kickLanes(balls, cueId, targetIds);
    memo.set(key, lanes);
    return lanes;
  };

  /** @type {import('../types.js').Scored|null} */
  let best = null;
  for (const { shot, known } of fullSet) {
    let score = known;
    if (!score) {
      const prep = prepareSafety(layout, shot);
      if (!opts.reference && best && !prep.gated && optimisticTotal(prep) <= best.score.total) continue;
      score = finishSafety(layout, prep, kick);
    }
    if (!best || score.total > best.score.total) best = { shot, score };
    if (opts.stopAtTotal !== undefined && best.score.total >= opts.stopAtTotal) break;
  }
  return { best, cheapCount, shareGe70 };
}

/**
 * A suggest for a deal already shown to the player must be seeded with validateDeal's best
 * (`seedShots: [{...best.shot, known: best.score}]`) so the hint never scores below the validation.
 * @param {import('../types.js').Layout} layout
 * @param {SearchOpts} [opts]
 */
export function suggest(layout, opts) {
  return runSearch(layout, SUGGEST_GRID, { ...opts, stopAtTotal: undefined });
}

/**
 * @param {number} share
 * @returns {import('../types.js').Band}
 */
export function classify(share) {
  if (share > 0.15) return 'easy';
  if (share >= 0.04) return 'medium';
  return 'hard';
}

/**
 * @param {import('../types.js').Layout} layout
 * @returns {import('../types.js').Validation}
 */
export function validateDeal(layout) {
  const { best, shareGe70: share } = runSearch(layout, DIFFICULTY_GRID, { stopAtTotal: 70 });
  return { ok: !!best && best.score.total >= 70, best, share, band: classify(share) };
}
