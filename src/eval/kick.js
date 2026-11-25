// @ts-check
import { R, W, H } from '../engine/constants.js';
import { simulate } from '../engine/simulate.js';
import { firstBallOnRay } from '../geometry/visibility.js';
import { lanesFromSamples } from '../geometry/kick-lanes.js';

export const KICK_SPEED = 60;
export const KICK_STEP_DEG = 1;

/**
 * Distance along unit dir until the ball centre reaches a rail line.
 * @param {{x:number,y:number}} p @param {{x:number,y:number}} dir
 */
function railDistance(p, dir) {
  let t = Infinity;
  if (dir.x > 0) t = Math.min(t, (W - R - p.x) / dir.x);
  else if (dir.x < 0) t = Math.min(t, (R - p.x) / dir.x);
  if (dir.y > 0) t = Math.min(t, (H - R - p.y) / dir.y);
  else if (dir.y < 0) t = Math.min(t, (R - p.y) / dir.y);
  return Math.max(0, t);
}

/**
 * Engine-simulated kick lanes: 360 one-degree shots at KICK_SPEED, stopping at first contact.
 * @param {import('../types.js').Ball[]} balls
 * @param {string} cueId
 * @param {string[]} targetIds
 * @returns {{n1:number,w1:number,n2:number,w2:number}}
 */
export function kickLanes(balls, cueId, targetIds) {
  const cue = /** @type {import('../types.js').Ball} */ (balls.find((b) => b.id === cueId));
  /** @type {(0|1|2)[]} */
  const samples = [];
  for (let k = 0; k < 360; k++) {
    const rad = (k * Math.PI) / 180;
    const dir = { x: Math.cos(rad), y: Math.sin(rad) };
    const hit = firstBallOnRay(cue, dir, balls, [cueId]);
    if (hit && hit.t < railDistance(cue, dir)) { samples.push(0); continue; }
    const sim = simulate(
      { balls, cueId, rules: { kind: 'designated', legalIds: targetIds } },
      { aimDeg: k, speed: KICK_SPEED, spin: { x: 0, y: 0 } },
      { record: false, stopAtFirstContact: true, maxCushions: 2 },
    );
    const r = sim.cueRailsBeforeContact;
    const ok = (r === 1 || r === 2) && !sim.scratch && sim.firstContactId !== null && targetIds.includes(sim.firstContactId);
    samples.push(ok ? /** @type {1|2} */ (r) : 0);
  }
  return lanesFromSamples(samples, KICK_STEP_DEG);
}

/** @param {number} w */
const g = (w) => Math.min(1, Math.max(0, w / 6));

/**
 * @param {{n1:number,w1:number,n2:number,w2:number}} lanes
 * @returns {number}
 */
export function kickEase({ n1, w1, n2, w2 }) {
  if (n1 >= 1) return Math.min(0.85, 0.40 + 0.40 * g(w1) + 0.05 * (Math.min(n1, 3) - 1));
  if (n2 >= 1) return Math.min(0.30, 0.10 + 0.15 * g(w2) + 0.025 * (Math.min(n2, 3) - 1));
  return 0;
}
