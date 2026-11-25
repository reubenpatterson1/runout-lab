// @ts-check
/** @typedef {import('../types.js').Band} Band */
/** @typedef {import('../types.js').BankEntry} BankEntry */
/** @typedef {import('../types.js').BankExample} BankExample */
/** @typedef {import('../types.js').Bank} Bank */
import { mulberry32, hashSeed, shuffle } from './prng.js';
import { ACTIVE_FAMILIES, BANDS } from './families.js';

export const MISSING_DEAL_TEXT = "That layout isn't in this version";
export const NO_GOOD_SAFETY_TEXT = 'No safety scoring 70 found';

/** @param {number} sessionSeed @returns {{family: number, band: Band}[]} */
export function sessionPlan(sessionSeed) {
  const rng = mulberry32(hashSeed(sessionSeed, 7));
  const families = [...shuffle(ACTIVE_FAMILIES, rng), ...shuffle(ACTIVE_FAMILIES, rng)].slice(0, 10);
  /** @type {Band[]} */
  const base = ['easy', 'easy', 'easy', 'medium', 'medium', 'medium', 'medium', 'hard', 'hard', 'hard'];
  const bands = shuffle(base, rng);
  return families.map((family, i) => ({ family, band: bands[i] }));
}

/**
 * @param {Bank} bank @param {number} family @param {Band} band @param {number} seed @param {number[]} excludeIds
 * @returns {BankEntry|null}
 */
export function pickEntry(bank, family, band, seed, excludeIds) {
  const cell = bank.entries.filter((e) => e.family === family && e.band === band);
  const n = cell.length;
  if (n === 0) return null;
  const i = Math.floor(mulberry32(hashSeed(seed))() * n);
  for (let s = 0; s < n; s++) {
    const e = cell[(i + s) % n];
    if (!excludeIds.includes(e.id)) return e;
  }
  return null;
}

/** @param {Bank} bank @param {number} sessionSeed @param {number} i @param {number[]} usedIds @returns {BankEntry|null} */
export function dealSlot(bank, sessionSeed, i, usedIds) {
  const { family, band } = sessionPlan(sessionSeed)[i];
  const seed = hashSeed(sessionSeed, 100 + i);
  for (let s = 0; s < 6; s++) {
    const f = ACTIVE_FAMILIES[(ACTIVE_FAMILIES.indexOf(family) + s) % 6];
    const e = pickEntry(bank, f, band, seed, usedIds);
    if (e) return e;
  }
  return null;
}

/** @param {Bank} bank @param {number} sessionSeed @returns {(BankEntry|null)[]} */
export function dealSession(bank, sessionSeed) {
  /** @type {number[]} */
  const usedIds = [];
  /** @type {(BankEntry|null)[]} */
  const out = [];
  for (let i = 0; i < 10; i++) {
    const e = dealSlot(bank, sessionSeed, i, usedIds);
    if (e) usedIds.push(e.id);
    out.push(e);
  }
  return out;
}

/**
 * @param {Bank} bank @param {number} sessionSeed @param {number} i @param {number} r
 * @param {BankEntry} current @param {number[]} usedIds
 * @returns {BankEntry|null}
 */
export function rerollSlot(bank, sessionSeed, i, r, current, usedIds) {
  return pickEntry(bank, current.family, current.band, hashSeed(sessionSeed, 100 + i, r), [...usedIds, current.id]);
}

/** @param {Bank} bank @param {number} id @returns {BankEntry|null} */
export function entryById(bank, id) {
  return bank.entries.find((e) => e.id === id) ?? null;
}

/** @param {Bank} bank @param {string} slug @returns {BankExample|null} */
export function exampleBySlug(bank, slug) {
  return bank.examples.find((x) => x.slug === slug) ?? null;
}

/** @param {BankExample} x @returns {string|null} */
export function exampleLabel(x) {
  return !x.best || x.best.score.total < 70 ? NO_GOOD_SAFETY_TEXT : null;
}

/** @param {Bank} bank @param {number} n @returns {BankEntry[]} */
export function sampleCells(bank, n) {
  /** @type {BankEntry[]} */
  const out = [];
  for (const f of ACTIVE_FAMILIES) {
    for (const b of BANDS) {
      out.push(...bank.entries.filter((e) => e.family === f && e.band === b).slice(0, n));
    }
  }
  return out;
}
