// @ts-check
import { R, DT, MAX_T, MAX_EVENTS, MAX_ZERO_TIME, E_BALL, EPS_V, EPS_D, V_REST } from './constants.js';
import { CUSHIONS } from './table.js';
import { validateLayout } from './layout.js';
import { strike, advanceBall } from './motion.js';
import { cushionRebound } from './cushion.js';

/** @typedef {import('./motion.js').BallState} BallState */

const TIE = 1e-12;
const TYPE_BALL = 1, TYPE_CUSHION = 2;

/** @param {BallState} b */
const moving = (b) => b.state === 'sliding' || b.state === 'rolling';

/**
 * Event-driven simulation on a fixed outer step DT. Within a step, the earliest ball or cushion contact
 * is found from chord velocities, then accepted only if the instantaneous normal approach speed
 * exceeds EPS_V (R3a). Pockets, scratch and jaws are added by a later task.
 * @param {import('../types.js').Layout} layout
 * @param {import('../types.js').Shot} shot
 * @param {{record?: boolean, stopAtFirstContact?: boolean, maxCushions?: number}} [opts]
 * @returns {import('../types.js').SimResult}
 */
export function simulate(layout, shot, opts = {}) {
  const v = validateLayout(layout);
  if (!v.ok) throw new Error('invalid layout: ' + v.reason);
  const record = opts.record !== false;
  const maxCushions = opts.maxCushions ?? Infinity;

  /** @type {BallState[]} */
  const bs = layout.balls.map((b) => {
    const base = { id: b.id, x: b.x, y: b.y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0 };
    if (b.id === layout.cueId) return { ...base, ...strike(shot) };
    return { ...base, state: /** @type {const} */ ('stopped') };
  });
  const n = bs.length;
  const cueIdx = bs.findIndex((b) => b.id === layout.cueId);
  let t = 0;
  /** @type {import('../types.js').SimEvent[]} */
  const events = [];
  /** @type {Record<string, {t:number,x:number,y:number}[]>} */
  const trajectories = {};
  if (record) for (const b of bs) trajectories[b.id] = [{ t: 0, x: b.x, y: b.y }];
  /** @param {number} i */
  const sample = (i) => { if (record) trajectories[bs[i].id].push({ t, x: bs[i].x, y: bs[i].y }); };

  /** @type {string|null} */
  let firstContactId = null;
  let firstContactT = Infinity;
  let railsAfterContact = 0, cueRails = 0, zeroRun = 0;
  let lastCueCushion = { idx: /** @type {number|null} */ (null), t: -1 };
  let halted = false;

  /** Advance every ball by dt, pushing roll/stop events at their instants.
   * @param {number} dt */
  const advanceAll = (dt) => {
    for (const b of bs) {
      const before = { ...b };
      const out = advanceBall(b, dt);
      if (out.roll !== undefined) {
        const c = { ...before };
        advanceBall(c, out.roll);
        events.push({ t: t + out.roll, type: 'roll', a: b.id, x: c.x, y: c.y });
      }
      if (out.stop !== undefined) {
        const c = { ...before };
        advanceBall(c, out.stop);
        events.push({ t: t + out.stop, type: 'stop', a: b.id, x: c.x, y: c.y });
      }
    }
  };

  /** State of ball i advanced by tau, on a copy.
   * @param {number} i @param {number} tau */
  const stateAt = (i, tau) => {
    const c = { ...bs[i] };
    if (tau > 0) advanceBall(c, tau);
    return c;
  };

  /** @param {BallState} b */
  const settleState = (b) => {
    b.state = Math.hypot(b.vx - b.wx, b.vy - b.wy) < 1e-9 ? 'rolling' : 'sliding';
  };

  while (!halted && bs.some(moving) && t < MAX_T && events.length < MAX_EVENTS) {
    let rem = DT;
    const touched = new Set();
    while (rem > 1e-12) {
      for (let i = 0; i < n; i++) if (moving(bs[i])) touched.add(i);
      // chord velocities over rem
      const cx = new Array(n).fill(0), cy = new Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        if (!moving(bs[i])) continue;
        const e = stateAt(i, rem);
        cx[i] = (e.x - bs[i].x) / rem;
        cy[i] = (e.y - bs[i].y) / rem;
      }

      /** @type {{tau:number,type:number,i:number,j:number}|null} */
      let best = null;
      /** @param {number} tau @param {number} type @param {number} i @param {number} j */
      const better = (tau, type, i, j) => {
        if (!best) return true;
        if (Math.abs(tau - best.tau) > TIE) return tau < best.tau;
        if (type !== best.type) return type < best.type;
        if (i !== best.i) return i < best.i;
        return j < best.j;
      };

      // ball pairs
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          if (!moving(bs[i]) && !moving(bs[j])) continue;
          const dx = bs[j].x - bs[i].x, dy = bs[j].y - bs[i].y;
          const d = Math.hypot(dx, dy);
          let tau;
          if (d <= 2 * R + EPS_D) {
            tau = 0;
          } else {
            const dcx = cx[j] - cx[i], dcy = cy[j] - cy[i];
            const b2 = dx * dcx + dy * dcy;
            if (!(b2 < -EPS_V)) continue;
            const a = dcx * dcx + dcy * dcy;
            const disc = b2 * b2 - a * (d * d - 4 * R * R);
            if (disc < 0) continue;
            tau = (-b2 - Math.sqrt(disc)) / a;
            if (!(tau >= 0 && tau <= rem)) continue;
          }
          if (best && tau > best.tau + TIE) continue;
          // R3a: instantaneous approach speed at the contact instant
          const si = stateAt(i, tau), sj = stateAt(j, tau);
          const ex = sj.x - si.x, ey = sj.y - si.y, ed = Math.hypot(ex, ey);
          if (ed === 0) continue;
          const rel = ((si.vx - sj.vx) * ex + (si.vy - sj.vy) * ey) / ed;
          if (!(rel > EPS_V)) continue;
          if (better(tau, TYPE_BALL, i, j)) best = { tau, type: TYPE_BALL, i, j };
        }
      }

      // cushion segments
      for (let i = 0; i < n; i++) {
        if (!moving(bs[i])) continue;
        const p = bs[i];
        for (let k = 0; k < CUSHIONS.length; k++) {
          const c = CUSHIONS[k];
          const cn = cx[i] * c.nx + cy[i] * c.ny;
          if (!(cn > EPS_V)) continue;
          const s = (c.ax - p.x) * c.nx + (c.ay - p.y) * c.ny;
          const tau = Math.max(0, (s - R) / cn);
          if (tau > rem) continue;
          const px = p.x + cx[i] * tau, py = p.y + cy[i] * tau;
          const sx = c.bx - c.ax, sy = c.by - c.ay;
          const u = ((px - c.ax) * sx + (py - c.ay) * sy) / (sx * sx + sy * sy);
          if (!(u > 0 && u < 1)) continue;
          if (best && tau > best.tau + TIE) continue;
          const si = stateAt(i, tau);
          if (!(si.vx * c.nx + si.vy * c.ny > EPS_V)) continue;
          if (better(tau, TYPE_CUSHION, i, k)) best = { tau, type: TYPE_CUSHION, i, j: k };
        }
        // Jaw points slot in here under the same rule (R3a/R3d): accept only if the instantaneous
        // approach speed toward the jaw point exceeds EPS_V.
      }

      if (!best) {
        advanceAll(rem);
        t += rem;
        zeroRun = 0; // R3c
        break;
      }

      const ev = best;
      advanceAll(ev.tau);
      t += ev.tau;
      rem -= ev.tau;

      if (ev.type === TYPE_BALL) {
        // R17: when the cue is in the pair it is `a`; otherwise `a` is the lower layout index
        const cueFirst = ev.j === cueIdx;
        const ia = cueFirst ? ev.j : ev.i, ib = cueFirst ? ev.i : ev.j;
        const A = bs[ia], Bb = bs[ib];
        const dx = Bb.x - A.x, dy = Bb.y - A.y, d = Math.hypot(dx, dy);
        const nx = dx / d, ny = dy / d;
        const rel = (A.vx - Bb.vx) * nx + (A.vy - Bb.vy) * ny;
        const delta = ((1 + E_BALL) / 2) * rel;
        A.vx -= delta * nx; A.vy -= delta * ny;
        Bb.vx += delta * nx; Bb.vy += delta * ny;
        settleState(A); settleState(Bb);
        touched.add(ev.i); touched.add(ev.j);
        const x = A.x, y = A.y;
        events.push({ t, type: 'ball', a: A.id, b: Bb.id, x, y, va: { x: A.vx, y: A.vy }, vb: { x: Bb.vx, y: Bb.vy } });
        sample(ia); sample(ib);
        if (firstContactId === null && ia === cueIdx) {
          firstContactId = Bb.id;
          firstContactT = t;
          if (opts.stopAtFirstContact) halted = true;
        }
      } else {
        const b = bs[ev.i];
        const c = CUSHIONS[ev.j];
        const nx = c.nx, ny = c.ny, tx = ny, ty = -nx;
        const vn = b.vx * nx + b.vy * ny, vt = b.vx * tx + b.vy * ty;
        const r = cushionRebound({ vn, vt, wz: b.wz });
        b.vx = r.vt * tx + r.vn * nx;
        b.vy = r.vt * ty + r.vn * ny;
        b.wz = r.wz;
        if (vn < V_REST) { // R3b: remove the into-rail rolling velocity
          const wn = b.wx * nx + b.wy * ny;
          if (wn > 0) { b.wx -= wn * nx; b.wy -= wn * ny; }
        }
        settleState(b);
        touched.add(ev.i);
        events.push({ t, type: 'cushion', a: b.id, b: ev.j, x: b.x, y: b.y });
        sample(ev.i);
        if (t >= firstContactT) railsAfterContact++;
        if (ev.i === cueIdx && firstContactId === null) {
          if (!(lastCueCushion.idx === ev.j && t - lastCueCushion.t <= 0.1)) cueRails++;
          lastCueCushion = { idx: ev.j, t };
        }
        if (cueRails > maxCushions) halted = true;
      }

      if (ev.tau <= TIE) zeroRun++; else zeroRun = 0;
      if (zeroRun > MAX_ZERO_TIME) halted = true;
      if (halted) break;
    }
    if (record) for (const i of touched) sample(i);
  }

  const settled = !halted && !bs.some(moving);
  for (let i = 0; i < n; i++) sample(i);
  events.sort((a, b) => a.t - b.t);
  return {
    trajectories,
    events,
    final: bs.filter((b) => b.state !== 'pocketed').map((b) => ({ id: b.id, x: b.x, y: b.y })),
    firstContactId,
    railsAfterContact,
    cueRailsBeforeContact: cueRails,
    pocketed: [],
    scratch: false,
    duration: t,
    settled,
  };
}
