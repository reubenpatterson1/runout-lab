// @ts-check

/**
 * @template T
 * @param {string} name
 * @param {T} initial
 * @param {{storage?: Storage}} [deps]
 * @returns {{load(): T, save(value: T): boolean, clear(): void}}
 */
export function createSessionStore(name, initial, deps = {}) {
  const key = 'runout-lab:session:' + name;
  const storage = deps.storage ?? globalThis.localStorage;
  /** @type {{value: T} | null} */
  let mem = null;
  return {
    load() {
      if (mem) return structuredClone(mem.value);
      try {
        const raw = storage.getItem(key);
        if (raw != null) {
          const p = JSON.parse(raw);
          if (p && p.v === 1 && 'data' in p) return structuredClone(p.data);
        }
      } catch { /* swallow */ }
      return structuredClone(initial);
    },
    save(value) {
      mem = { value: structuredClone(value) };
      try { storage.setItem(key, JSON.stringify({ v: 1, data: value })); return true; } catch { return false; }
    },
    clear() {
      mem = null;
      try { storage.removeItem(key); } catch { /* swallow */ }
    },
  };
}
