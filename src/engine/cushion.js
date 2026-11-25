// @ts-check
import { V_REST, CUSHION } from './constants.js';

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/**
 * Cushion response in the wall frame (n = outward normal, t = (n.y, -n.x)).
 * vn > 0 means moving into the cushion. Positive wz moves the contact point along +t,
 * so english is running iff sign(wz) = -sign(vt).
 * @param {{vn: number, vt: number, wz: number}} c
 * @returns {{vn: number, vt: number, wz: number}}
 */
export function cushionRebound(c) {
  const { vn, vt, wz } = c;
  if (vn < V_REST) return { vn: 0, vt, wz };
  const e = clamp(CUSHION.E_HI - CUSHION.E_SLOPE * vn, CUSHION.E_MIN, CUSHION.E_HI);
  const tau = clamp(CUSHION.TAU_HI - CUSHION.TAU_SLOPE * vn, CUSHION.TAU_MIN, CUSHION.TAU_HI);
  return { vn: -e * vn, vt: tau * vt - CUSHION.ENGLISH * wz, wz: CUSHION.SPIN_KEEP * wz };
}
