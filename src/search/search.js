// @ts-check
import { simulate } from '../engine/simulate.js';
import { validateLayout } from '../engine/layout.js';
import { gateFor, opponentTargets, scoreSafety } from '../eval/safety.js';
import { scorePosition } from '../eval/position.js';
import { SUGGEST_GRID, DIFFICULTY_GRID, candidateShots } from './grid.js';

export const K_FULL = 3;

/** @param {import('../types.js').Shot} a @param {import('../types.js').Shot} b */
const sameShot = (a, b) => a.aimDeg === b.aimDeg && a.speed === b.speed && a.spin.x === b.spin.x && a.spin.y === b.spin.y;

/**
 * @param {import('../types.js').Layout} layout
 * @param {import('./grid.js').Grid} grid
 * @param {{seedShots?: import('../types.js').Shot[]}} [opts]
 * @returns {import('../types.js').SuggestResult}
 */
export function runSearch(layout, grid, opts = {}) {
  const v = validateLayout(layout);
  if (!v.ok) throw new Error('invalid layout: ' + v.reason);
  const candidates = candidateShots(layout, grid);
  /** @type {{shot: import('../types.js').Shot, cheap: number, gated: boolean, idx: number}[]} */
  const cheaps = [];
  let ge70 = 0;
  candidates.forEach((shot, idx) => {
    const sim = simulate(layout, shot, { record: false });
    if (gateFor(sim, layout)) { cheaps.push({ shot, cheap: 0, gated: true, idx }); return; }
    const targets = opponentTargets(layout.rules, sim.final, layout.cueId);
    const cheap = scorePosition(sim.final, layout.cueId, targets, { cheap: true }).score;
    if (cheap >= 70) ge70++;
    cheaps.push({ shot, cheap, gated: false, idx });
  });
  const shareGe70 = candidates.length ? ge70 / candidates.length : 0;
  const seeds = opts.seedShots ?? [];
  const top = cheaps
    .filter((c) => !c.gated)
    .sort((a, b) => b.cheap - a.cheap || a.idx - b.idx)
    .slice(0, K_FULL)
    .map((c) => c.shot)
    .filter((s) => !seeds.some((sd) => sameShot(sd, s)));
  /** @type {import('../types.js').Scored|null} */
  let best = null;
  for (const shot of [...seeds, ...top]) {
    const score = scoreSafety(layout, shot);
    if (!best || score.total > best.score.total) best = { shot, score };
  }
  return { best, cheapCount: candidates.length, shareGe70 };
}

/**
 * @param {import('../types.js').Layout} layout
 * @param {{seedShots?: import('../types.js').Shot[]}} [opts]
 */
export function suggest(layout, opts) {
  return runSearch(layout, SUGGEST_GRID, opts);
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
  const { best, shareGe70: share } = runSearch(layout, DIFFICULTY_GRID);
  return { ok: !!best && best.score.total >= 70, best, share, band: classify(share) };
}
