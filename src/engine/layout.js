// @ts-check
/** @typedef {import('../types.js').Layout} Layout */
import { W, H, R, EPS_LAYOUT, POCKET_NEAR } from './constants.js';
import { CUSHIONS, POCKETS, mouthDistance } from './table.js';

/** @param {number} px @param {number} py @param {{ax:number,ay:number,bx:number,by:number}} c */
function segDist(px, py, c) {
  const dx = c.bx - c.ax, dy = c.by - c.ay;
  let t = ((px - c.ax) * dx + (py - c.ay) * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (c.ax + t * dx), py - (c.ay + t * dy));
}

/** @param {Layout} layout
 * @returns {{ok: true} | {ok: false, reason: 'missing-cue'|'duplicate-id'|'unknown-legal-id'|'off-table'|'in-pocket'|'overlap'}} */
export function validateLayout(layout) {
  const { balls, cueId, rules } = layout;
  if (!balls.some((b) => b.id === cueId)) return { ok: false, reason: 'missing-cue' };
  const ids = new Set(balls.map((b) => b.id));
  if (ids.size !== balls.length) return { ok: false, reason: 'duplicate-id' };
  for (const id of [...rules.legalIds, ...(rules.opponentIds ?? [])]) {
    if (!ids.has(id)) return { ok: false, reason: 'unknown-legal-id' };
  }
  for (const b of balls) {
    if (b.x < 0 || b.x > W || b.y < 0 || b.y > H) return { ok: false, reason: 'off-table' };
    for (const c of CUSHIONS) {
      if (segDist(b.x, b.y, c) < R - EPS_LAYOUT) return { ok: false, reason: 'off-table' };
    }
  }
  for (const b of balls) {
    for (let i = 0; i < POCKETS.length; i++) {
      const p = POCKETS[i];
      if (Math.hypot(b.x - p.x, b.y - p.y) <= POCKET_NEAR && mouthDistance(b.x, b.y, i) > 0) {
        return { ok: false, reason: 'in-pocket' };
      }
    }
  }
  for (let i = 0; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) {
      if (Math.hypot(balls[i].x - balls[j].x, balls[i].y - balls[j].y) < 2 * R - EPS_LAYOUT) {
        return { ok: false, reason: 'overlap' };
      }
    }
  }
  return { ok: true };
}
