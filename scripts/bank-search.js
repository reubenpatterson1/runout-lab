// @ts-check
import { R } from '../src/engine/constants.js';
import { candidateShots, linspace, SPINS9, DIFFICULTY_GRID } from '../src/search/grid.js';
import { selectShots, classify } from '../src/search/search.js';
import { prepareSafety, optimisticTotal, finishSafety } from '../src/eval/safety.js';
import { kickLanes } from '../src/eval/kick.js';

export const SPEED_CAP = 130;
export const N_FULL = 200;
export const TOP_N = 5;
export const FINE_AIM = [-0.2, -0.1, 0, 0.1, 0.2];
export const FINE_SPEED = [0.9, 0.95, 1, 1.05, 1.1];
export const BANK_GRID = {
  offsets: linspace(-0.92, 0.92, 25),
  offsets2: linspace(-0.92, 0.92, 17),
  speeds: [12, 16, 22, 30, 40, 52, 66, 84, 106, 130],
  spins: SPINS9,
};

/**
 * @param {import('../src/types.js').Layout} layout
 * @returns {import('../src/types.js').Layout}
 */
export function roundLayout(layout) {
  return {
    balls: layout.balls.map((b) => ({ id: b.id, x: Math.round(b.x * 100) / 100, y: Math.round(b.y * 100) / 100 })),
    cueId: layout.cueId,
    rules: structuredClone(layout.rules),
  };
}

/**
 * @param {import('../src/types.js').Ball[]} balls
 * @returns {boolean}
 */
export function spacingOk(balls) {
  for (let i = 0; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) {
      if (Math.hypot(balls[i].x - balls[j].x, balls[i].y - balls[j].y) < 2 * R - 1e-6) return false;
    }
  }
  return true;
}

/**
 * @param {import('../src/types.js').Layout} layout
 * @returns {{share: number, band: import('../src/types.js').Band}}
 */
export function measureBand(layout) {
  const share = selectShots(layout, DIFFICULTY_GRID).shareGe70;
  return { share, band: classify(share) };
}

/** @param {import('../src/types.js').Ball[]} final */
const key = (final) => final.map((b) => `${b.id}:${b.x},${b.y}`).join('|');
/** @param {import('../src/types.js').Shot} s */
const shotKey = (s) => `${s.aimDeg},${s.speed},${s.spin.x},${s.spin.y}`;

/**
 * Coarse-to-fine offline search for the bank.
 * @param {import('../src/types.js').Layout} layout
 * @param {{grid?: import('../src/search/grid.js').Grid, nFull?: number, nTop?: number, reference?: boolean, stats?: {full: number}}} [opts]
 * @returns {{best: import('../src/types.js').Scored|null, top: import('../src/types.js').Scored[]}}
 */
export function bankSearch(layout, opts = {}) {
  const grid = opts.grid ?? BANK_GRID;
  const nFull = opts.nFull ?? N_FULL;
  const nTop = opts.nTop ?? TOP_N;
  const reference = opts.reference ?? false;
  const stats = opts.stats;
  const memo = new Map();
  /** @type {import('../src/eval/safety.js').KickFn} */
  const kick = (balls, cueId, targetIds) => {
    const k = cueId + '#' + targetIds.join(',') + '#' + key(balls);
    if (!reference && memo.has(k)) return memo.get(k);
    const lanes = kickLanes(balls, cueId, targetIds);
    memo.set(k, lanes);
    return lanes;
  };
  /** @param {import('../src/eval/safety.js').SafetyPrep} prep */
  const score = (prep) => {
    if (stats) stats.full++;
    return finishSafety(layout, prep, kick);
  };

  // 1 Coarse
  const cands = [];
  let idx = 0;
  for (const shot of candidateShots(layout, grid)) {
    const i = idx++;
    const prep = prepareSafety(layout, shot);
    if (prep.gated) continue;
    cands.push({ shot, idx: i, prep, opt: optimisticTotal(prep), k: key(prep.nominalFinal) });
  }
  cands.sort((a, b) => b.opt - a.opt || a.idx - b.idx);
  const seen = new Set();
  const pick = [];
  for (const c of cands) {
    if (pick.length >= nFull) break;
    if (seen.has(c.k)) continue;
    seen.add(c.k);
    pick.push(c);
  }

  // 2 Full
  /** @type {import('../src/types.js').Scored[]} */
  let top = [];
  const scoredKeys = new Set();
  for (const r of pick) {
    if (!reference && top.length === nTop && r.opt <= top[nTop - 1].score.total) break;
    const item = { shot: r.shot, score: score(r.prep) };
    // insert after all entries with total >= new total (scoring order asc on ties)
    let pos = top.length;
    while (pos > 0 && top[pos - 1].score.total < item.score.total) pos--;
    top.splice(pos, 0, item);
    top = top.slice(0, nTop);
    scoredKeys.add(shotKey(r.shot));
  }

  // 3 Fine
  let best = top[0] ?? null;
  for (const t of top) {
    for (const a of FINE_AIM) {
      for (const f of FINE_SPEED) {
        if (a === 0 && f === 1) continue;
        const shot = { aimDeg: t.shot.aimDeg + a, speed: Math.min(SPEED_CAP, t.shot.speed * f), spin: t.shot.spin };
        const sk = shotKey(shot);
        if (scoredKeys.has(sk)) continue;
        scoredKeys.add(sk);
        const prep = prepareSafety(layout, shot);
        if (prep.gated) continue;
        if (!reference && optimisticTotal(prep) <= /** @type {NonNullable<typeof best>} */ (best).score.total) continue;
        const s = score(prep);
        if (s.total > /** @type {NonNullable<typeof best>} */ (best).score.total) best = { shot, score: s };
      }
    }
  }
  return { best, top };
}
