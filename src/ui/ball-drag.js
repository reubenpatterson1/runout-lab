// @ts-check
import { R, W, H } from '../engine/constants.js';
import { validateLayout } from '../engine/layout.js';

/** @typedef {import('../types.js').Ball} Ball */
/** @typedef {import('../types.js').Layout} Layout */

export const PICK_PX = 22;

/**
 * @param {Ball[]} balls
 * @param {{x: number, y: number}} p
 * @param {number} tolIn
 * @returns {string|null}
 */
export function pickBall(balls, p, tolIn) {
  /** @type {string|null} */
  let bestId = null;
  let bestDist = Infinity;
  for (const b of balls) {
    const d = Math.hypot(b.x - p.x, b.y - p.y);
    if (d <= tolIn && d < bestDist) {
      bestDist = d;
      bestId = b.id;
    }
  }
  return bestId;
}

/**
 * @param {{x: number, y: number}} p
 * @returns {{x: number, y: number}}
 */
export function clampToPlay(p) {
  return { x: Math.max(R, Math.min(W - R, p.x)), y: Math.max(R, Math.min(H - R, p.y)) };
}

/**
 * @param {Layout} layout
 * @param {string} id
 * @param {{x: number, y: number}} p
 * @returns {Layout|null}
 */
export function moveBall(layout, id, p) {
  const copy = structuredClone(layout);
  const i = copy.balls.findIndex((b) => b.id === id);
  if (i === -1) return null;
  const c = clampToPlay(p);
  copy.balls[i] = { id, x: c.x, y: c.y };
  if (!validateLayout(copy).ok) return null;
  const balls = copy.balls;
  for (let a = 0; a < balls.length; a++) {
    for (let b = a + 1; b < balls.length; b++) {
      if (Math.hypot(balls[a].x - balls[b].x, balls[a].y - balls[b].y) < 2 * R - 1e-6) return null;
    }
  }
  return copy;
}
