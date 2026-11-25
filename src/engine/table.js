// @ts-check
import { W, H, CORNER_MOUTH } from './constants.js';

const a = CORNER_MOUTH / Math.SQRT2;
const s = Math.SQRT1_2;

/** @type {{ax:number,ay:number,bx:number,by:number,nx:number,ny:number}[]} */
export const CUSHIONS = [
  { ax: a, ay: 0, bx: 47.5, by: 0, nx: 0, ny: -1 },
  { ax: 52.5, ay: 0, bx: W - a, by: 0, nx: 0, ny: -1 },
  { ax: a, ay: H, bx: 47.5, by: H, nx: 0, ny: 1 },
  { ax: 52.5, ay: H, bx: W - a, by: H, nx: 0, ny: 1 },
  { ax: 0, ay: a, bx: 0, by: H - a, nx: -1, ny: 0 },
  { ax: W, ay: a, bx: W, by: H - a, nx: 1, ny: 0 },
];

/** @type {{x:number,y:number}[]} */
export const JAWS = [
  { x: a, y: 0 }, { x: 0, y: a },
  { x: 47.5, y: 0 }, { x: 52.5, y: 0 },
  { x: W - a, y: 0 }, { x: W, y: a },
  { x: 0, y: H - a }, { x: a, y: H },
  { x: 47.5, y: H }, { x: 52.5, y: H },
  { x: W - a, y: H }, { x: W, y: H - a },
];

/** @param {number} i @param {'corner'|'side'} kind @param {number} ox @param {number} oy */
function pocket(i, kind, ox, oy) {
  const j0 = 2 * i, j1 = 2 * i + 1;
  return {
    x: (JAWS[j0].x + JAWS[j1].x) / 2,
    y: (JAWS[j0].y + JAWS[j1].y) / 2,
    kind,
    jaws: /** @type {[number, number]} */ ([j0, j1]),
    out: { x: ox, y: oy },
  };
}

export const POCKETS = [
  pocket(0, 'corner', -s, -s),
  pocket(1, 'side', 0, -1),
  pocket(2, 'corner', s, -s),
  pocket(3, 'corner', -s, s),
  pocket(4, 'side', 0, 1),
  pocket(5, 'corner', s, s),
];

/** Signed distance past pocket i's mouth line; positive = past the mouth.
 * @param {number} x @param {number} y @param {number} i */
export function mouthDistance(x, y, i) {
  const p = POCKETS[i];
  return (x - p.x) * p.out.x + (y - p.y) * p.out.y;
}
