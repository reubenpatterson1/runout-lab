// @ts-check
import { R, W, H } from '../engine/constants.js';
import { POCKETS } from '../engine/table.js';
import { visibility } from '../geometry/visibility.js';
import { clearance } from '../geometry/clearance.js';
import { mirrorLanes } from '../geometry/kick-lanes.js';
import { kickLanes, kickEase } from './kick.js';

/** @param {number} v @param {number} lo @param {number} hi */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * @param {{V:number,D:number,K:number,Q:number}} p
 * @returns {number}
 */
export function combineScore({ V, D, K, Q }) {
  const H = 1 - V;
  return 100 * clamp(0.55 * H + 0.25 * K * H + 0.20 * Q - 0.60 * D, 0, 1);
}

/** @param {{x:number,y:number}} cue @returns {number} */
export function cueRestriction(cue) {
  const railD = Math.max(0, Math.min(cue.x - R, W - R - cue.x, cue.y - R, H - R - cue.y));
  return clamp(1 - railD / (4 * R), 0, 1);
}

/** @param {number} d */
const f = (d) => clamp(1.1 - d / 60, 0.15, 1);

/**
 * @param {{x:number,y:number}} cue
 * @param {import('../types.js').Ball} target
 * @param {import('../types.js').Ball[]} balls
 * @param {string} cueId
 * @param {number} V
 * @returns {number}
 */
export function directThreat(cue, target, balls, cueId, V) {
  if (V === 0) return 0;
  let best = 0;
  for (const p of POCKETS) {
    const ex = p.x - target.x, ey = p.y - target.y;
    const el = Math.hypot(ex, ey);
    const u = { x: ex / el, y: ey / el };
    const G = { x: target.x - 2 * R * u.x, y: target.y - 2 * R * u.y };
    const gx = G.x - cue.x, gy = G.y - cue.y;
    const gl = Math.hypot(gx, gy);
    const cosCut = (gx * u.x + gy * u.y) / gl;
    const cut = (Math.acos(clamp(cosCut, -1, 1)) * 180) / Math.PI;
    if (cut > 75) continue;
    if (clearance(target, p, balls, [cueId, target.id]) < 0) continue;
    if (clearance(cue, G, balls, [cueId, target.id]) < 0) continue;
    if (p.kind === 'side') {
      const c = u.x * p.out.x + u.y * p.out.y;
      if ((Math.acos(clamp(c, -1, 1)) * 180) / Math.PI > 60) continue;
    }
    const ease = Math.cos((cut * Math.PI) / 180) * f(gl) * f(el);
    if (ease > best) best = ease;
  }
  return V * (0.1 + 0.9 * best);
}

/**
 * @param {import('../types.js').Ball[]} balls
 * @param {string} cueId
 * @param {string[]} targetIds
 * @param {{cheap?: boolean, kick?: {n1:number,w1:number,n2:number,w2:number}}} [opts]
 * @returns {{score:number,V:number,D:number,Q:number,kick:import('../types.js').KickInfo}}
 */
export function scorePosition(balls, cueId, targetIds, opts = {}) {
  const cue = /** @type {import('../types.js').Ball} */ (balls.find((b) => b.id === cueId));
  let V = 0, D = 0;
  for (const tid of targetIds) {
    const t = /** @type {import('../types.js').Ball} */ (balls.find((b) => b.id === tid));
    const v = visibility(cue, t, balls, [cueId]);
    V = Math.max(V, v);
    D = Math.max(D, directThreat(cue, t, balls, cueId, v));
  }
  const Q = cueRestriction(cue);
  /** @type {{n1:number,w1:number,n2:number,w2:number}} */
  let lanes = { n1: 0, w1: 0, n2: 0, w2: 0 };
  let K = 0;
  if (V < 1) {
    lanes = opts.kick ?? (opts.cheap ? mirrorLanes(cue, balls, targetIds, [cueId]) : kickLanes(balls, cueId, targetIds));
    K = 1 - kickEase(lanes);
  }
  const rails = V > 0 ? 0 : lanes.n1 ? 1 : lanes.n2 ? 2 : 3;
  const score = combineScore({ V, D, K, Q });
  return { score, V, D, Q, kick: { rails, ...lanes, K } };
}
