// @ts-check
/** @typedef {import('../types.js').Bank} Bank */
/** @typedef {import('../types.js').Scored} Scored */
/** @typedef {import('../types.js').Layout} Layout */
import { suggest } from './search.js';
import { simulate } from '../engine/simulate.js';
import { scoreSafety } from '../eval/safety.js';
import { dealSlot, rerollSlot, entryById, exampleBySlug, sampleCells } from '../deal/bank.js';

/**
 * @param {() => Promise<{bank: Bank, timing?: {fetchMs: number, parseMs: number}}>} loadBank
 * @returns {(msg: any) => Promise<any>}
 */
export function createHandler(loadBank) {
  /** @type {Promise<{bank: Bank, timing?: {fetchMs: number, parseMs: number}}>|null} */
  let cache = null;
  const getBank = async () => {
    if (!cache) cache = loadBank();
    try {
      return await cache;
    } catch (err) {
      cache = null;
      throw new Error('bank load failed: ' + /** @type {Error} */ (err).message);
    }
  };
  return async (msg) => {
    const id = msg.id;
    try {
      if (msg.type === 'suggest') {
        const best = msg.best ?? null;
        const result = suggest(msg.layout, { seedShots: best ? [{ ...best.shot, known: best.score }] : [] });
        return { id, type: 'result', result };
      }
      if (msg.type === 'simulate') return { id, type: 'result', result: simulate(msg.layout, msg.shot, { record: true }) };
      if (msg.type === 'score') return { id, type: 'result', result: scoreSafety(msg.layout, msg.shot) };
      const known = ['info', 'deal', 'reroll', 'byId', 'example', 'sample'];
      if (!known.includes(msg.type)) return { id, type: 'error', message: 'unknown request type: ' + msg.type };
      const { bank, timing } = await getBank();
      let result;
      switch (msg.type) {
        case 'info':
          result = { entries: bank.entries.length, examples: bank.examples.map((x) => x.slug), modelHash: bank.modelHash, coverage: bank.coverage, timing: timing ?? null };
          break;
        case 'deal':
          result = dealSlot(bank, msg.sessionSeed, msg.slot, msg.usedIds);
          break;
        case 'reroll': {
          const current = entryById(bank, msg.currentId);
          if (!current) return { id, type: 'error', message: 'unknown deal id: ' + msg.currentId };
          result = rerollSlot(bank, msg.sessionSeed, msg.slot, msg.r, current, msg.usedIds);
          break;
        }
        case 'byId':
          result = entryById(bank, msg.dealId);
          break;
        case 'example':
          result = exampleBySlug(bank, msg.slug);
          break;
        default:
          result = sampleCells(bank, msg.n);
      }
      return { id, type: 'result', result };
    } catch (err) {
      return { id, type: 'error', message: /** @type {Error} */ (err).message };
    }
  };
}
