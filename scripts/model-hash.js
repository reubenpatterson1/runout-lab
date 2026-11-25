// @ts-check
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';

/**
 * SHA-256 over the contents of every file under src/engine, src/geometry and src/eval (sorted POSIX paths).
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
  paths.sort();
  const h = createHash('sha256');
  for (const p of paths) h.update(readFileSync(root + p));
  return h.digest('hex');
}
