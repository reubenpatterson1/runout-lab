// @ts-check
import { G, MU_SLIDE, MU_ROLL, SPIN_DECAY, TIP, SPEED_MIN, SPEED_MAX } from './constants.js';

/**
 * w = (wx, wy) is the spin's contact-free rolling velocity in in/s; the ball is rolling iff v = w.
 * wz is side spin in in/s; wz > 0 is right english, counter-clockwise seen from above.
 */
/** @typedef {{id:string,x:number,y:number,vx:number,vy:number,wx:number,wy:number,wz:number,state:'stopped'|'sliding'|'rolling'|'pocketed'}} BallState */

/**
 * Cue strike. Speed is clamped to [SPEED_MIN, SPEED_MAX] and used for v, w and wz alike.
 * @param {import('../types.js').Shot} shot
 * @returns {{vx:number,vy:number,wx:number,wy:number,wz:number,state:'sliding'|'rolling'}}
 */
export function strike(shot) {
  const a = (shot.aimDeg * Math.PI) / 180;
  const dx = Math.cos(a), dy = Math.sin(a);
  const s = Math.min(SPEED_MAX, Math.max(SPEED_MIN, shot.speed));
  let sx = shot.spin.x, sy = shot.spin.y;
  const m = Math.hypot(sx, sy);
  if (m > 1) { sx /= m; sy /= m; }
  const vx = s * dx, vy = s * dy;
  const wx = TIP * s * sy * dx, wy = TIP * s * sy * dy;
  const wz = TIP * s * sx;
  const state = Math.hypot(vx - wx, vy - wy) < 1e-9 ? 'rolling' : 'sliding';
  return { vx, vy, wx, wy, wz, state };
}

/**
 * Advance a ball analytically by dt, mutating it. Returns offsets within dt at which it began rolling / stopped.
 * @param {BallState} b
 * @param {number} dt
 * @returns {{roll?: number, stop?: number}}
 */
export function advanceBall(b, dt) {
  /** @type {{roll?: number, stop?: number}} */
  const out = {};
  let el = 0;
  if (b.state === 'sliding') {
    const ux = b.vx - b.wx, uy = b.vy - b.wy;
    const U = Math.hypot(ux, uy);
    const tr = U / (3.5 * MU_SLIDE * G);
    if (U === 0) {
      b.wx = b.vx; b.wy = b.vy; b.state = 'rolling'; out.roll = 0;
    } else {
      const tau = Math.min(dt, tr);
      const hx = ux / U, hy = uy / U;
      const a = MU_SLIDE * G;
      b.x += b.vx * tau - 0.5 * a * hx * tau * tau;
      b.y += b.vy * tau - 0.5 * a * hy * tau * tau;
      if (tr <= dt) {
        b.vx -= a * hx * tr; b.vy -= a * hy * tr;
        b.wx = b.vx; b.wy = b.vy;
        b.state = 'rolling';
        out.roll = tr; el = tr;
      } else {
        b.vx -= a * hx * tau; b.vy -= a * hy * tau;
        b.wx += 2.5 * a * hx * tau; b.wy += 2.5 * a * hy * tau;
        el = tau;
      }
    }
  }
  if (b.state === 'rolling') {
    const rem = dt - el;
    const sp = Math.hypot(b.vx, b.vy);
    const a = MU_ROLL * G;
    const ts = sp / a;
    if (sp === 0 || ts <= rem) {
      if (sp > 0) {
        const hx = b.vx / sp, hy = b.vy / sp;
        b.x += b.vx * ts - 0.5 * a * hx * ts * ts;
        b.y += b.vy * ts - 0.5 * a * hy * ts * ts;
      }
      b.vx = b.vy = b.wx = b.wy = 0;
      b.state = 'stopped';
      out.stop = el + ts;
    } else {
      const hx = b.vx / sp, hy = b.vy / sp;
      b.x += b.vx * rem - 0.5 * a * hx * rem * rem;
      b.y += b.vy * rem - 0.5 * a * hy * rem * rem;
      b.vx -= a * hx * rem; b.vy -= a * hy * rem;
      b.wx = b.vx; b.wy = b.vy;
    }
  }
  b.wz = Math.sign(b.wz) * Math.max(0, Math.abs(b.wz) - SPIN_DECAY * dt);
  return out;
}
