// @ts-check

/**
 * The value must be JSON-serializable.
 * @template T
 * @param {string} name
 * @param {T} initial
 * @param {{storage?: Storage}} [deps]
 * @returns {{load(): T, save(value: T): boolean, clear(): void}}
 */
export function createSessionStore(name, initial, deps = {}) {
  const key = 'runout-lab:session:' + name;
  // Resolved lazily: the localStorage getter itself can throw (blocked storage); then degrade to memory-only.
  const getStorage = () => deps.storage ?? globalThis.localStorage;
  /** @type {{value: T} | null} */
  let mem = null;
  return {
    load() {
      if (mem) return structuredClone(mem.value);
      try {
        const raw = getStorage().getItem(key);
        if (raw != null) {
          const p = JSON.parse(raw);
          if (p && p.v === 1 && 'data' in p) return structuredClone(p.data);
        }
      } catch { /* swallow */ }
      return structuredClone(initial);
    },
    save(value) {
      mem = { value: structuredClone(value) };
      try { getStorage().setItem(key, JSON.stringify({ v: 1, data: value })); return true; } catch { return false; }
    },
    clear() {
      mem = null;
      try { getStorage().removeItem(key); } catch { /* swallow */ }
    },
  };
}
