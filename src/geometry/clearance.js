// @ts-check
import { R } from '../engine/constants.js';

/**
 * Distance from point p to segment a-b.
 * @param {{x:number,y:number}} p
 * @param {{x:number,y:number}} a
 * @param {{x:number,y:number}} b
 * @returns {number}
 */
export function segmentPointDistance(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Minimum over non-excluded balls of (segment distance - 2R); Infinity if none.
 * @param {{x:number,y:number}} a
 * @param {{x:number,y:number}} b
 * @param {import('../types.js').Ball[]} balls
 * @param {string[]} excludeIds
 * @returns {number}
 */
export function clearance(a, b, balls, excludeIds) {
  let best = Infinity;
  for (const ball of balls) {
    if (excludeIds.includes(ball.id)) continue;
    const c = segmentPointDistance(ball, a, b) - 2 * R;
    if (c < best) best = c;
  }
  return best;
}
