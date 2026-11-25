// @ts-check
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';

/**
 * SHA-256 over every file under src/engine, src/geometry and src/eval plus src/search/grid.js and
 * src/search/search.js (R36), in sorted POSIX path order, framed as path\0byteLength\0contents.
 * @param {string} root repo root, ending with '/'
 * @returns {string}
 */
export function modelHash(root) {
  /** @type {string[]} */
  const paths = [];
  /** @param {string} rel */
  const walk = (rel) => {
    for (const e of readdirSync(root + rel, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      if (e.isDirectory()) walk(rel + '/' + e.name);
      else paths.push(rel + '/' + e.name);
    }
  };
  for (const d of ['src/engine', 'src/geometry', 'src/eval']) walk(d);
  paths.push('src/search/grid.js', 'src/search/search.js');
  paths.sort();
  const h = createHash('sha256');
  for (const p of paths) {
    const buf = readFileSync(root + p);
    h.update(p + '\0' + buf.length + '\0');
    h.update(buf);
  }
  return h.digest('hex');
}
