// @ts-check
/** Standard mulberry32. @param {number} seed @returns {() => number} */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32 over each int's 4 little-endian bytes, then fmix32. @param {...number} ints @returns {number} */
export function hashSeed(...ints) {
  let h = 2166136261;
  for (const n of ints) {
    for (let k = 0; k < 4; k++) {
      h ^= (n >>> (8 * k)) & 0xff;
      h = Math.imul(h, 16777619);
    }
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Fisher-Yates on a copy. @template T @param {T[]} arr @param {() => number} rng @returns {T[]} */
export function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i >= 1; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
