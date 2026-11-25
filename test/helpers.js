// @ts-check
import { R } from '../src/engine/constants.js';

/**
 * @typedef {{x:number,y:number}} Pt
 * @typedef {{id:string,x:number,y:number}} Ball
 * @typedef {{balls:Ball[],cueId:string,rules:{kind:'designated'|'8ball'|'9ball',legalIds:string[],opponentIds?:string[]}}} Layout
 */

/**
 * @param {string} id
 * @param {number} x
 * @param {number} y
 * @returns {Ball}
 */
export function B(id, x, y) {
  return { id, x, y };
}

/**
 * @param {Ball[]} balls
 * @param {string[]} [legalIds]
 * @param {'designated'|'8ball'|'9ball'} [kind]
 * @param {string[]} [opponentIds]
 * @returns {Layout}
 */
export function L(balls, legalIds = ['ob'], kind = 'designated', opponentIds) {
  const rules = { kind, legalIds, ...(opponentIds ? { opponentIds } : {}) };
  return { balls, cueId: 'cue', rules };
}

/** @param {number} rad */
export function deg(rad) {
  return (rad * 180) / Math.PI;
}

/** Angle in degrees from a to b. @param {Pt} a @param {Pt} b */
export function aimAt(a, b) {
  return deg(Math.atan2(b.y - a.y, b.x - a.x));
}

/** @param {Pt} a @param {Pt} b */
function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * @param {Pt} cue @param {Pt} ob @param {number} f fullness 0..1
 * @param {number} [side]
 */
export function fullnessAim(cue, ob, f, side = 1) {
  return aimAt(cue, ob) + side * deg(Math.asin((2 * R * (1 - f)) / dist(ob, cue)));
}

/** Unsigned angle in degrees between two vectors. @param {Pt} u @param {Pt} v */
export function angleDeg(u, v) {
  const c = (u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y));
  return deg(Math.acos(Math.min(1, Math.max(-1, c))));
}

/**
 * @param {import('../src/types.js').SimResult} sim
 * @param {(e: import('../src/types.js').SimEvent) => boolean} pred
 */
export function ev(sim, pred) {
  return sim.events.find(pred);
}

/** @param {Pt} a @param {Pt} b @param {Pt} p */
function pointSegmentDist(a, b, p) {
  const vx = b.x - a.x, vy = b.y - a.y;
  const c1 = vx * (p.x - a.x) + vy * (p.y - a.y);
  if (c1 <= 0) return dist(p, a);
  const c2 = vx * vx + vy * vy;
  if (c2 <= c1) return dist(p, b);
  const t = c1 / c2;
  return dist(p, { x: a.x + t * vx, y: a.y + t * vy });
}

/** Minimum distance from p to the polyline through points. @param {Pt[]} points @param {Pt} p */
export function polylineDistance(points, p) {
  if (points.length === 0) return Infinity;
  if (points.length === 1) return dist(p, points[0]);
  let min = Infinity;
  for (let i = 0; i < points.length - 1; i++) min = Math.min(min, pointSegmentDist(points[i], points[i + 1], p));
  return min;
}

/** @param {number} a @param {number} b @param {number} tol */
export function near(a, b, tol) {
  return Math.abs(a - b) <= tol;
}

/**
 * Test-only mulberry32. Deliberately independent of the future src mulberry32,
 * so tests do not share a bug with the code they exercise.
 * @param {number} seed
 * @returns {() => number}
 */
export function mulberry(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** @param {number} seed @param {number} n */
export function randomLayout(seed, n) {
  const rng = mulberry(seed);
  const minD = 2 * R + 0.1;
  /** @type {Ball[]} */
  const balls = [];
  for (let i = 0; i < n; i++) {
    let x = 0, y = 0, ok = false;
    while (!ok) {
      x = 5 + rng() * 90;
      y = 5 + rng() * 40;
      ok = balls.every((b) => dist(b, { x, y }) >= minD);
    }
    balls.push(B(i === 0 ? 'cue' : `o${i}`, x, y));
  }
  return L(balls, ['o1']);
}
