// @ts-check
/** @typedef {import('../types.js').Scored} Scored */
/** @typedef {import('../types.js').Layout} Layout */

/** @returns {Worker} */
const defaultFactory = () => new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });

/** @param {() => Worker} [factory] */
export function createSearchClient(factory = defaultFactory) {
  const worker = factory();
  let nextId = 1;
  /** @type {Error|null} */
  let dead = null;
  /** @type {Map<number, {resolve: (v: any) => void, reject: (e: Error) => void}>} */
  const pending = new Map();
  worker.onmessage = (e) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    if (e.data.type === 'error') p.reject(new Error(e.data.message));
    else p.resolve(e.data.result);
  };
  worker.onerror = (ev) => {
    const err = new Error(ev?.message ?? 'worker error');
    dead = err;
    const all = [...pending.values()];
    pending.clear();
    for (const p of all) p.reject(err);
  };
  /** @param {object} req @returns {Promise<any>} */
  const call = (req) => dead ? Promise.reject(new Error(dead.message)) : new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, ...req });
  });
  return {
    info: () => call({ type: 'info' }),
    /** @param {number} sessionSeed @param {number} slot @param {number[]} usedIds */
    deal: (sessionSeed, slot, usedIds) => call({ type: 'deal', sessionSeed, slot, usedIds }),
    /** @param {number} sessionSeed @param {number} slot @param {number} r @param {number} currentId @param {number[]} usedIds */
    reroll: (sessionSeed, slot, r, currentId, usedIds) => call({ type: 'reroll', sessionSeed, slot, r, currentId, usedIds }),
    /** @param {number} dealId */
    byId: (dealId) => call({ type: 'byId', dealId }),
    /** @param {string} slug */
    example: (slug) => call({ type: 'example', slug }),
    /** @param {number} n */
    sample: (n) => call({ type: 'sample', n }),
    /** @param {Layout} layout @param {Scored|null} [best] */
    suggest: (layout, best) => call({ type: 'suggest', layout, best: best ?? null }),
    /** @param {Layout} layout @param {any} shot */
    simulate: (layout, shot) => call({ type: 'simulate', layout, shot }),
    /** @param {Layout} layout @param {any} shot */
    score: (layout, shot) => call({ type: 'score', layout, shot }),
    terminate: () => {
      dead = new Error('terminated');
      worker.terminate();
      const err = new Error('terminated');
      const all = [...pending.values()];
      pending.clear();
      for (const p of all) p.reject(err);
    },
  };
}
