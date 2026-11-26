// @ts-check
import { ACTIVE_FAMILIES, BANDS } from '../deal/families.js';

/**
 * @typedef {import('../types.js').BankEntry} BankEntry
 * @typedef {import('../types.js').SafetyScore} SafetyScore
 * @typedef {import('../types.js').Gate} Gate
 * @typedef {import('../types.js').Band} Band
 * @typedef {{id: number, family: number, band: Band, rerolls: number, noAlt: boolean, score: number|null, gate: Gate|null, best: number}} SessionSlot
 * @typedef {{seed: number, slot: number, slots: SessionSlot[], done: boolean}} SafetySession
 */

const GATES = ['scratch', 'wrong-ball-first', 'no-rail', 'ob-pocketed'];

/** @param {number} seed @returns {SafetySession} */
export function newSession(seed) {
  return { seed, slot: 0, slots: [], done: false };
}

/** @param {SafetySession} s @param {BankEntry} entry @returns {SafetySession} */
export function addDeal(s, entry) {
  if (s.slots.length !== s.slot) throw new Error('deal out of order');
  const slot = { id: entry.id, family: entry.family, band: entry.band, rerolls: 0, noAlt: false, score: null, gate: null, best: entry.best.score.total };
  return { ...s, slots: [...s.slots, slot] };
}

/**
 * @param {SafetySession} s @param {(slot: SessionSlot) => SessionSlot} f
 * @returns {SafetySession}
 */
function mapCurrent(s, f) {
  return { ...s, slots: s.slots.map((x, i) => (i === s.slot ? f(x) : { ...x })) };
}

/** @param {SafetySession} s @param {BankEntry|null} entry @returns {SafetySession} */
export function applyReroll(s, entry) {
  if (s.slots[s.slot] && s.slots[s.slot].score !== null) throw new Error('reroll after the first shot');
  return mapCurrent(s, (x) => (entry
    ? { ...x, id: entry.id, family: entry.family, band: entry.band, best: entry.best.score.total, rerolls: x.rerolls + 1 }
    : { ...x, noAlt: true }));
}

/** @param {SafetySession} s @param {SafetyScore} score @returns {SafetySession} */
export function recordShot(s, score) {
  return mapCurrent(s, (x) => (x.score === null ? { ...x, score: score.total, gate: score.gate ?? null } : x));
}

/** @param {SafetySession} s @returns {SafetySession} */
export function advance(s) {
  const cur = s.slots[s.slot];
  if (!cur || cur.score === null) throw new Error('slot not scored');
  const slots = s.slots.map((x) => ({ ...x }));
  return s.slot < 9 ? { ...s, slots, slot: s.slot + 1 } : { ...s, slots, done: true };
}

/** @param {SafetySession} s @returns {number[]} */
export function usedIds(s) {
  return s.slots.map((x) => x.id);
}

/** @param {SafetySession} s @returns {number|null} */
export function average(s) {
  const v = s.slots.filter((x) => x.score !== null).map((x) => /** @type {number} */ (x.score));
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
}

/** @param {SafetySession} s */
export function summary(s) {
  return {
    average: average(s),
    good: s.slots.filter((x) => x.score !== null && x.score >= 70).length,
    rows: s.slots.map((x, i) => ({ n: i + 1, id: x.id, family: x.family, band: x.band, score: x.score, gate: x.gate, best: x.best })),
  };
}

/** @param {unknown} x @returns {boolean} */
export function validSession(x) {
  if (!x || typeof x !== 'object') return false;
  const s = /** @type {any} */ (x);
  if (!Number.isInteger(s.seed) || s.seed < 0 || s.seed >= 2 ** 31) return false;
  if (!Number.isInteger(s.slot) || s.slot < 0 || s.slot > 9) return false;
  if (!Array.isArray(s.slots) || (s.slots.length !== s.slot && s.slots.length !== s.slot + 1)) return false;
  if (typeof s.done !== 'boolean') return false;
  for (let i = 0; i < s.slots.length; i++) {
    const t = s.slots[i];
    if (!t || typeof t !== 'object') return false;
    if (!Number.isInteger(t.id) || !ACTIVE_FAMILIES.includes(t.family) || !BANDS.includes(t.band)) return false;
    if (!Number.isInteger(t.rerolls) || t.rerolls < 0 || typeof t.noAlt !== 'boolean') return false;
    if (!(t.score === null || (Number.isInteger(t.score) && t.score >= 0 && t.score <= 100))) return false;
    if (!(t.gate === null || GATES.includes(t.gate))) return false;
    if (typeof t.best !== 'number' || !Number.isFinite(t.best)) return false;
    if (i < s.slot && t.score === null) return false;
  }
  if (s.done && (s.slot !== 9 || s.slots.length !== 10 || s.slots.some((/** @type {any} */ t) => t.score === null))) return false;
  return true;
}
