// @ts-check
import { R } from '../engine/constants.js';

export const V_SAMPLES = 32;
const TIE = 1e-9;

/**
 * All balls hit by the ray, as {id, idx, t}.
 * @param {{x:number,y:number}} from
 * @param {{x:number,y:number}} dir unit
 * @param {import('../types.js').Ball[]} balls
 * @param {string[]} excludeIds
 */
function sweepHits(from, dir, balls, excludeIds) {
  const r2 = 2 * R;
  /** @type {{id:string, idx:number, t:number}[]} */
  const hits = [];
  balls.forEach((ball, idx) => {
    if (excludeIds.includes(ball.id)) return;
    const bx = ball.x - from.x, by = ball.y - from.y;
    const proj = dir.x * bx + dir.y * by;
    const d = Math.hypot(bx, by);
    if (d <= r2 + TIE) {
      if (proj > 0) hits.push({ id: ball.id, idx, t: 0 });
      return;
    }
    const perp2 = d * d - proj * proj;
    const disc = r2 * r2 - perp2;
    if (disc < 0) return;
    const t = proj - Math.sqrt(disc);
    if (t >= 0) hits.push({ id: ball.id, idx, t });
  });
  return hits;
}

/**
 * Earliest hit; ties (within 1e-9 in t) sorted by lower layout index.
 * @param {{id:string, idx:number, t:number}[]} hits non-empty
 */
function tiedFirst(hits) {
  const tMin = Math.min(...hits.map((h) => h.t));
  return hits.filter((h) => h.t - tMin <= TIE).sort((p, q) => p.idx - q.idx);
}

/**
 * First ball hit by a 2R-radius sweep along the ray; ties (within 1e-9 in t) go to the lower layout index.
 * @param {{x:number,y:number}} from
 * @param {{x:number,y:number}} dir unit
 * @param {import('../types.js').Ball[]} balls
 * @param {string[]} excludeIds
 * @returns {{id:string, t:number}|null}
 */
export function firstBallOnRay(from, dir, balls, excludeIds) {
  const hits = sweepHits(from, dir, balls, excludeIds);
  if (hits.length === 0) return null;
  const tied = tiedFirst(hits);
  return { id: tied[0].id, t: tied[0].t };
}

/**
 * Fraction of 32 sample rays across the 2R-wide cone that hit the target first.
 * @param {{x:number,y:number}} from
 * @param {import('../types.js').Ball} target
 * @param {import('../types.js').Ball[]} balls
 * @param {string[]} excludeIds
 * @returns {number}
 */
export function visibility(from, target, balls, excludeIds) {
  const dx = target.x - from.x, dy = target.y - from.y;
  const L = Math.hypot(dx, dy);
  const ux = dx / L, uy = dy / L;
  let count = 0;
  for (let i = 0; i < V_SAMPLES; i++) {
    const b = 2 * R * (-1 + (2 * i + 1) / V_SAMPLES);
    const a = Math.asin(Math.max(-1, Math.min(1, b / L)));
    const c = Math.cos(a), s = Math.sin(a);
    const dir = { x: ux * c - uy * s, y: ux * s + uy * c };
    const hits = sweepHits(from, dir, balls, excludeIds);
    if (hits.length === 0) continue;
    const tied = tiedFirst(hits);
    if (tied.length === 1 && tied[0].id === target.id) count++;
  }
  return count / V_SAMPLES;
}
