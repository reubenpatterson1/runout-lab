// @ts-check
import { R, W, H, CORNER_MOUTH, EPS_LAYOUT } from '../engine/constants.js';
import { clearance } from './clearance.js';

const A = CORNER_MOUTH / Math.SQRT2;

/**
 * Reflection lines: axis 'x' means the line x = v, 'y' means y = v.
 */
const RAILS = [
  { axis: 'x', v: R },
  { axis: 'x', v: W - R },
  { axis: 'y', v: R },
  { axis: 'y', v: H - R },
];

/** @param {{x:number,y:number}} p @param {{axis:string,v:number}} rail */
function reflect(p, rail) {
  return rail.axis === 'x' ? { x: 2 * rail.v - p.x, y: p.y } : { x: p.x, y: 2 * rail.v - p.y };
}

/**
 * Intersection of segment line p->q with the rail line, or null if parallel.
 * @param {{x:number,y:number}} p @param {{x:number,y:number}} q @param {{axis:string,v:number}} rail
 */
function intersect(p, q, rail) {
  const d = rail.axis === 'x' ? q.x - p.x : q.y - p.y;
  if (d === 0) return null; // parallel: both points lie on the reflection line, so the candidate is rejected
  const t = ((rail.axis === 'x' ? rail.v - p.x : rail.v - p.y)) / d;
  return { x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) };
}

/** @param {{x:number,y:number}} p @param {{axis:string,v:number}} rail */
function inSpan(p, rail) {
  if (rail.axis === 'y') {
    const x = p.x;
    return (x >= A + R && x <= 47.5 - R) || (x >= 52.5 + R && x <= W - A - R);
  }
  return p.y >= A + R && p.y <= H - A - R;
}

/** @param {{x:number,y:number}} p @param {{axis:string,v:number}} rail */
function onRail(p, rail) {
  return Math.abs((rail.axis === 'x' ? p.x : p.y) - rail.v) < EPS_LAYOUT;
}

/**
 * Circular runs of equal non-zero values.
 * @param {(0|1|2)[]} samples
 * @param {number} stepDeg
 * @returns {{n1:number,w1:number,n2:number,w2:number}}
 */
export function lanesFromSamples(samples, stepDeg) {
  const n = samples.length;
  const out = { n1: 0, w1: 0, n2: 0, w2: 0 };
  if (n === 0) return out;
  /** @param {number} r */
  const tally = (r) => {
    let runs = 0, longest = 0;
    if (samples.every((s) => s === r)) {
      runs = 1;
      longest = n;
    } else {
      const start = samples.findIndex((s) => s !== r);
      let len = 0;
      for (let k = 1; k <= n; k++) {
        const s = samples[(start + k) % n];
        if (s === r) len++;
        else {
          if (len > 0) { runs++; if (len > longest) longest = len; }
          len = 0;
        }
      }
    }
    return { runs, w: longest * stepDeg };
  };
  const a = tally(1), b = tally(2);
  return { n1: a.runs, w1: a.w, n2: b.runs, w2: b.w };
}

/**
 * Cheap one- and two-rail mirror kick-lane approximation.
 * A candidate is skipped when its first bounce point lies less than R from `from`: a (near-)frozen
 * ball's "kick" off its own rail is really the direct shot (R20/R23).
 * @param {{x:number,y:number}} from
 * @param {import('../types.js').Ball[]} balls
 * @param {string[]} targetIds
 * @param {string[]} excludeIds
 * @returns {{n1:number,w1:number,n2:number,w2:number}}
 */
export function mirrorLanes(from, balls, targetIds, excludeIds) {
  let n1 = 0, w1 = 0, n2 = 0, w2 = 0;
  /** @param {{x:number,y:number}} image */
  const width = (image) => {
    const L = Math.hypot(from.x - image.x, from.y - image.y);
    return 2 * (Math.asin(Math.min(1, 2 * R / L)) * 180 / Math.PI);
  };
  for (const tid of targetIds) {
    const T = balls.find((b) => b.id === tid);
    if (!T) continue;
    const exclFinal = [...excludeIds, tid];
    for (const rail of RAILS) {
      const image = reflect(T, rail);
      const P = intersect(from, image, rail);
      if (!P || !inSpan(P, rail)) continue;
      if (Math.hypot(from.x - P.x, from.y - P.y) < R) continue;
      if (clearance(from, P, balls, excludeIds) < 0) continue;
      if (clearance(P, T, balls, exclFinal) < 0) continue;
      n1++;
      w1 = Math.max(w1, width(image));
    }
    for (const r1 of RAILS) {
      for (const r2 of RAILS) {
        if (r1 === r2) continue;
        const T2 = reflect(T, r2);
        const T12 = reflect(T2, r1);
        const P1 = intersect(from, T12, r1);
        if (!P1) continue;
        const P2 = intersect(P1, T2, r2);
        if (!P2 || onRail(P1, r2)) continue;
        if (Math.hypot(from.x - P1.x, from.y - P1.y) < R) continue;
        if (!inSpan(P1, r1) || !inSpan(P2, r2)) continue;
        if (clearance(from, P1, balls, excludeIds) < 0) continue;
        if (clearance(P1, P2, balls, excludeIds) < 0) continue;
        if (clearance(P2, T, balls, exclFinal) < 0) continue;
        n2++;
        w2 = Math.max(w2, width(T12));
      }
    }
  }
  return { n1, w1, n2, w2 };
}
