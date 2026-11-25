// @ts-check
import { R } from '../engine/constants.js';
import { visibility } from '../geometry/visibility.js';

/**
 * @typedef {{offsets: number[], offsets2: number[], speeds: number[], spins: {x:number,y:number}[]}} Grid
 */

/**
 * @param {number} a
 * @param {number} b
 * @param {number} n
 * @returns {number[]}
 */
export function linspace(a, b, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(a + ((b - a) * i) / (n - 1));
  return out;
}

/** @type {{x:number,y:number}[]} */
export const SPINS9 = [];
for (const y of [-0.8, 0, 0.8]) for (const x of [-0.5, 0, 0.5]) SPINS9.push({ x, y });

/** @type {Grid} */
export const SUGGEST_GRID = {
  offsets: linspace(-0.92, 0.92, 13),
  offsets2: linspace(-0.92, 0.92, 9),
  speeds: [16, 22, 30, 40, 52, 66, 84, 106, 134],
  spins: SPINS9,
};

/** Coarser than Suggest's (§18a.3c). @type {Grid} */
export const DIFFICULTY_GRID = {
  offsets: linspace(-0.92, 0.92, 9),
  offsets2: linspace(-0.92, 0.92, 5),
  speeds: [20, 36, 60, 100],
  spins: [{ x: 0, y: -0.8 }, { x: 0, y: 0 }, { x: 0, y: 0.8 }],
};

/**
 * @param {import('../types.js').Layout} layout
 * @param {Grid} grid
 * @returns {import('../types.js').Shot[]}
 */
export function candidateShots(layout, grid) {
  const cue = /** @type {import('../types.js').Ball} */ (layout.balls.find((b) => b.id === layout.cueId));
  const targets = layout.balls
    .filter((b) => layout.rules.legalIds.includes(b.id))
    .map((b) => ({ b, v: visibility(cue, b, layout.balls, [layout.cueId]) }))
    .filter((t) => t.v >= 0.25)
    .sort((p, q) => q.v - p.v || (p.b.id < q.b.id ? -1 : p.b.id > q.b.id ? 1 : 0))
    .slice(0, 2)
    .map((t) => t.b);
  const offsets = targets.length === 1 ? grid.offsets : grid.offsets2;
  /** @type {import('../types.js').Shot[]} */
  const shots = [];
  for (const t of targets) {
    const dx = t.x - cue.x, dy = t.y - cue.y;
    const d = Math.hypot(dx, dy);
    const base = (Math.atan2(dy, dx) * 180) / Math.PI;
    for (const f of offsets) {
      const aimDeg = base + (Math.asin(Math.max(-1, Math.min(1, (2 * R * f) / d))) * 180) / Math.PI;
      for (const speed of grid.speeds) for (const spin of grid.spins) shots.push({ aimDeg, speed, spin: { x: spin.x, y: spin.y } });
    }
  }
  return shots;
}
