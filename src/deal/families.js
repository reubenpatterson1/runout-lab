// @ts-check
/** @typedef {import('../types.js').Layout} Layout */
/** @typedef {import('../types.js').Ball} Ball */
/** @typedef {import('../types.js').Band} Band */
import { R } from '../engine/constants.js';
import { validateLayout } from '../engine/layout.js';
import { visibility } from '../geometry/visibility.js';
import { mulberry32 } from './prng.js';

/** @type {Band[]} */
export const BANDS = ['easy', 'medium', 'hard'];

export const FAMILIES = [
  { id: 1, name: 'Hook behind a blocker' },
  { id: 2, name: 'Rail tuck or freeze' },
  { id: 3, name: 'Stop/stun hide' },
  { id: 4, name: 'Thin cut, OB long to a rail' },
  { id: 5, name: 'Length-of-table lag' },
  { id: 6, name: '8-ball: hide from the group' },
  { id: 7, name: '9-ball: lowest ball in clutter' },
  { id: 8, name: 'Behind your own balls or a cluster' },
];

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const SQ3 = Math.sqrt(3);

/**
 * @param {{x:number,y:number}} center @param {number} axisDeg
 * @param {'single'|'pair'|'triangle'|'line3'} kind
 * @returns {{x:number,y:number}[]}
 */
export function unitBalls(center, axisDeg, kind) {
  const { x, y } = center;
  if (kind === 'single') return [{ x, y }];
  if (kind === 'pair' || kind === 'line3') {
    const px = Math.cos((axisDeg + 90) * RAD), py = Math.sin((axisDeg + 90) * RAD);
    const step = kind === 'pair' ? R : 2 * R;
    const js = kind === 'pair' ? [-1, 1] : [-1, 0, 1];
    return js.map((j) => ({ x: x + j * step * px, y: y + j * step * py }));
  }
  const r = (2 * R) / SQ3;
  return [0, 1, 2].map((k) => ({ x: x + r * Math.cos((axisDeg + k * 120) * RAD), y: y + r * Math.sin((axisDeg + k * 120) * RAD) }));
}

/** @param {{x:number,y:number}} p @param {{x:number,y:number}} q */
const ang = (p, q) => Math.atan2(q.y - p.y, q.x - p.x) * DEG;

/**
 * One attempt; draws from rng continuously.
 * @param {number} family @param {Band} band @param {() => number} rng
 * @returns {Layout}
 */
function attempt(family, band, rng) {
  const u = (/** @type {number} */ a, /** @type {number} */ b) => a + (b - a) * rng();
  const pt = (/** @type {number} */ x0, /** @type {number} */ x1, /** @type {number} */ y0, /** @type {number} */ y1) => {
    const x = u(x0, x1);
    const y = u(y0, y1);
    return { x, y };
  };
  const polar = (/** @type {{x:number,y:number}} */ o, /** @type {number} */ d0, /** @type {number} */ d1, /** @type {number} */ a0, /** @type {number} */ a1) => {
    const d = u(d0, d1);
    const a = u(a0, a1) * RAD;
    return { x: o.x + d * Math.cos(a), y: o.y + d * Math.sin(a) };
  };
  const sgn = () => (rng() < 0.5 ? -1 : 1);
  const bi = BANDS.indexOf(band);
  /** @type {'single'|'pair'|'triangle'|'line3'} */
  const kind = family === 8 ? (['line3', 'triangle', 'pair'][bi]) : (['triangle', 'pair', 'single'][bi]);
  const unit = (/** @type {{x:number,y:number}} */ c, /** @type {number} */ axis) => unitBalls(c, axis, kind);
  /** @param {{x:number,y:number}} cue @param {{x:number,y:number}} ob @param {{x:number,y:number}[]} blk @returns {Layout} */
  const designated = (cue, ob, blk) => ({
    balls: [
      { id: 'cue', ...cue },
      { id: 'ob', ...ob },
      ...blk.map((p, i) => ({ id: 'b' + (i + 1), x: p.x, y: p.y })),
    ],
    cueId: 'cue',
    rules: { kind: 'designated', legalIds: ['ob'] },
  });

  if (family === 1) {
    const ob = pt(55, 85, 10, 40);
    const cue = polar(ob, 25, 45, 150, 210);
    const th = ang(ob, cue);
    const s = sgn();
    const uc = polar(ob, 9, 15, th + 70 * s, th + 110 * s);
    return designated(cue, ob, unit(uc, ang(ob, uc)));
  }
  if (family === 2) {
    const ob = pt(30, 70, 15, 35);
    const cue = polar(ob, 20, 35, 0, 360);
    const top = rng() < 0.5;
    const ux = ob.x + u(-15, 15);
    const yr = top ? R : 50 - R;
    /** @type {{x:number,y:number}[]} */
    let blk;
    if (kind === 'single') blk = [{ x: ux, y: yr }];
    else {
      blk = [{ x: ux - R, y: yr }, { x: ux + R, y: yr }];
      if (kind === 'triangle') blk.push({ x: ux, y: yr + (top ? 1 : -1) * SQ3 * R });
    }
    return designated(cue, ob, blk);
  }
  if (family === 3) {
    const cue = pt(15, 40, 12, 38);
    const ob = polar(cue, 12, 24, -25, 25);
    const l = Math.hypot(ob.x - cue.x, ob.y - cue.y);
    const d = { x: (ob.x - cue.x) / l, y: (ob.y - cue.y) / l };
    const s = sgn();
    const gap = u(0.3, 1.5);
    const back = u(0, 2);
    const off = 2 * R + gap + (kind === 'triangle' ? R / SQ3 : 0);
    const uc = { x: ob.x + s * -d.y * off - d.x * back, y: ob.y + s * d.x * off - d.y * back };
    return designated(cue, ob, unit(uc, ang(ob, uc)));
  }
  if (family === 4) {
    const ob = pt(75, 90, 12, 38);
    const cue = polar(ob, 18, 30, 160, 200);
    const th = ang(cue, ob);
    const s = sgn();
    const uc = polar(cue, 6, 10, th + 80 * s, th + 100 * s);
    return designated(cue, ob, unit(uc, ang(cue, uc)));
  }
  if (family === 5) {
    const ob = pt(88, 95, 8, 42);
    const cue = pt(65, 80, 10, 40);
    const uc = pt(7, 14, 12, 38);
    return designated(cue, ob, unit(uc, 0));
  }
  if (family === 6) {
    /** @type {Record<string, {x:number,y:number}>} */
    const p = {};
    p['9'] = pt(20, 80, 8, 42);
    p['10'] = polar(p['9'], 2 * R + 0.5, 6, 0, 360);
    if (band !== 'easy') p['11'] = polar(p['9'], 2 * R + 0.5, 8, 0, 360);
    p['1'] = pt(20, 80, 8, 42);
    const cue = polar(p['1'], 18, 35, 0, 360);
    p['2'] = polar(p['9'], 4, 7, 0, 360);
    p['3'] = polar(p['9'], 4, 7, 0, 360);
    p['8'] = pt(10, 90, 6, 44);
    const order = ['9', '10', '11', '1', '2', '3', '8'].filter((id) => p[id]);
    return {
      balls: [{ id: 'cue', ...cue }, ...order.map((id) => ({ id, ...p[id] }))],
      cueId: 'cue',
      rules: { kind: '8ball', legalIds: ['1', '2', '3'], opponentIds: ['9', '10', '11'].filter((id) => p[id]) },
    };
  }
  if (family === 7) {
    const two = pt(25, 75, 10, 40);
    /** @type {{id:string,x:number,y:number}[]} */
    const rest = [];
    for (const id of band === 'easy' ? ['4', '5', '6'] : ['4', '5']) rest.push({ id, ...polar(two, 2 * R + 0.2, 6, 0, 360) });
    rest.push({ id: '7', ...pt(10, 90, 6, 44) });
    rest.push({ id: '9', ...pt(10, 90, 6, 44) });
    const cue = polar(two, 20, 40, 0, 360);
    return {
      balls: [{ id: 'cue', ...cue }, { id: '2', ...two }, ...rest],
      cueId: 'cue',
      rules: { kind: '9ball', legalIds: ['2'] },
    };
  }
  const ob = pt(55, 85, 10, 40);
  const cue = polar(ob, 22, 40, 150, 210);
  const th = ang(ob, cue);
  const s = sgn();
  const uc = polar(ob, 10, 16, th + 60 * s, th + 120 * s);
  return designated(cue, ob, unit(uc, ang(ob, uc)));
}

/** Smallest centre distance between any two balls. @param {Ball[]} balls */
function minGap(balls) {
  let m = Infinity;
  for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) m = Math.min(m, Math.hypot(balls[i].x - balls[j].x, balls[i].y - balls[j].y));
  return m;
}

/**
 * Deterministic layout for (family, seed, band), or null after 40 failed tries.
 * @param {number} family 1..8 @param {number} seed non-negative integer @param {Band} band
 * @returns {Layout|null}
 */
export function generate(family, seed, band) {
  if (!Number.isInteger(family) || family < 1 || family > 8) throw new Error('invalid family');
  if (!BANDS.includes(band)) throw new Error('invalid band');
  const rng = mulberry32(seed);
  for (let t = 0; t < 40; t++) {
    const lay = attempt(family, band, rng);
    if (!validateLayout(lay).ok) continue;
    if (minGap(lay.balls) < 2 * R - 1e-6) continue;
    const cue = /** @type {Ball} */ (lay.balls.find((b) => b.id === lay.cueId));
    let vmax = 0;
    for (const id of lay.rules.legalIds) {
      const tb = /** @type {Ball} */ (lay.balls.find((b) => b.id === id));
      vmax = Math.max(vmax, visibility(cue, tb, lay.balls, [lay.cueId]));
    }
    if (vmax >= 0.5) return lay;
  }
  return null;
}

/**
 * Encode family and band into a non-negative integer seed below 2^31.
 * h is first reduced modulo 2^31 - 24 so the result stays below 2^31.
 * @param {number} family @param {Band} band @param {number} h
 */
export function dealSeedFor(family, band, h) {
  if (!Number.isInteger(h) || h < 0) throw new Error('invalid seed');
  const hh = h % (2 ** 31 - 24);
  return hh - (hh % 24) + (family - 1) + 8 * BANDS.indexOf(band);
}

/** @param {number} seed non-negative integer @returns {{family:number, band:Band}} */
export function parseDealSeed(seed) {
  if (!Number.isInteger(seed) || seed < 0) throw new Error('invalid seed');
  return { family: 1 + (seed % 8), band: BANDS[Math.floor((seed % 24) / 8)] };
}

/** @param {number} seed non-negative integer */
export function dealFromSeed(seed) {
  const { family, band } = parseDealSeed(seed);
  return { family, band, layout: generate(family, seed, band) };
}
