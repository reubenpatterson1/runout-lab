// @ts-check
import { R, W, H } from '../engine/constants.js';
import { visibility, firstBallOnRay } from '../geometry/visibility.js';

export const HANDLE_MIN_IN = 14;
export const HANDLE_MIN_PX = 36;
export const HIT_RADIUS_PX = 22;

/** Map into (−180, 180]. @param {number} a */
export function normDeg(a) {
  let r = ((a % 360) + 360) % 360;
  if (r > 180) r -= 360;
  return r;
}

/** @param {number} aimDeg @param {number} delta */
export function nudge(aimDeg, delta) {
  return normDeg(aimDeg + delta);
}

/**
 * @param {number} aimDeg
 * @param {string} key
 * @param {boolean} shift
 * @returns {number|null}
 */
export function aimKey(aimDeg, key, shift) {
  const step = shift ? 0.1 : 1;
  if (key === 'ArrowLeft') return nudge(aimDeg, -step);
  if (key === 'ArrowRight') return nudge(aimDeg, step);
  return null;
}

/** @param {import('../types.js').Layout} layout */
export function defaultAim(layout) {
  const { balls, cueId, rules } = layout;
  const cue = /** @type {import('../types.js').Ball} */ (balls.find((b) => b.id === cueId));
  let best = null;
  let bestV = -1;
  for (const ball of balls) {
    if (!rules.legalIds.includes(ball.id)) continue;
    const v = visibility(cue, ball, balls, [cueId]);
    if (v > bestV) { bestV = v; best = ball; }
  }
  if (!best) return 0;
  return (Math.atan2(best.y - cue.y, best.x - cue.x) * 180) / Math.PI;
}

/**
 * @param {import('../types.js').Layout} layout
 * @param {number} aimDeg
 * @returns {{end: {x:number, y:number}, hitId: string|null}}
 */
export function aimPreview(layout, aimDeg) {
  const { balls, cueId } = layout;
  const cue = /** @type {import('../types.js').Ball} */ (balls.find((b) => b.id === cueId));
  const rad = (aimDeg * Math.PI) / 180;
  const dir = { x: Math.cos(rad), y: Math.sin(rad) };
  const hit = firstBallOnRay(cue, dir, balls, [cueId]);
  let tRail = Infinity;
  if (dir.x > 0) tRail = Math.min(tRail, (W - R - cue.x) / dir.x);
  else if (dir.x < 0) tRail = Math.min(tRail, (R - cue.x) / dir.x);
  if (dir.y > 0) tRail = Math.min(tRail, (H - R - cue.y) / dir.y);
  else if (dir.y < 0) tRail = Math.min(tRail, (R - cue.y) / dir.y);
  if (hit && hit.t <= tRail) {
    return { end: { x: cue.x + dir.x * hit.t, y: cue.y + dir.y * hit.t }, hitId: hit.id };
  }
  return { end: { x: cue.x + dir.x * tRail, y: cue.y + dir.y * tRail }, hitId: null };
}

/**
 * @param {{x:number,y:number}} cue
 * @param {number} aimDeg
 * @param {number} pxPerIn
 * @param {boolean} back
 */
export function handlePoint(cue, aimDeg, pxPerIn, back) {
  const d = Math.max(HANDLE_MIN_IN, HANDLE_MIN_PX / pxPerIn);
  const rad = ((back ? aimDeg + 180 : aimDeg) * Math.PI) / 180;
  return { x: cue.x + Math.cos(rad) * d, y: cue.y + Math.sin(rad) * d };
}

/**
 * True (back) when the front handle point would lie outside the padded table area.
 * @param {{x:number,y:number}} cue
 * @param {number} aimDeg
 * @param {number} pxPerIn
 */
export function handleSide(cue, aimDeg, pxPerIn) {
  const p = handlePoint(cue, aimDeg, pxPerIn, false);
  const h = HIT_RADIUS_PX / pxPerIn;
  return p.x < -5 + h || p.x > 105 - h || p.y < -5 + h || p.y > 55 - h;
}

/**
 * @param {{x:number,y:number}} handle
 * @param {{x:number,y:number}} p
 * @param {number} pxPerIn
 */
export function hitsHandle(handle, p, pxPerIn) {
  return Math.hypot(p.x - handle.x, p.y - handle.y) <= HIT_RADIUS_PX / pxPerIn;
}

/**
 * @param {{x:number,y:number}} cue
 * @param {{x:number,y:number}} p
 * @param {boolean} back
 */
export function aimFromDrag(cue, p, back) {
  const a = (Math.atan2(p.y - cue.y, p.x - cue.x) * 180) / Math.PI;
  return normDeg(back ? a + 180 : a);
}
