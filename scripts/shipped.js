// @ts-check
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const SKIP_DIRS = new Set(['test', 'docs', 'scripts', 'bench', 'node_modules']);
const SKIP_FILES = new Set(['package.json', 'package-lock.json', 'README.md', 'CLAUDE.md', 'LICENSE']);

/**
 * Sorted POSIX relative paths of every shipped file under root.
 * @param {string} root
 * @returns {string[]}
 */
export function listShipped(root) {
  /** @type {string[]} */
  const out = [];
  /** @param {string} rel */
  const walk = (rel) => {
    for (const e of readdirSync(root + rel, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const top = rel === '';
      if (e.isDirectory()) {
        if (top && SKIP_DIRS.has(e.name)) continue;
        walk(rel + e.name + '/');
      } else if (e.isFile()) {
        if (top && SKIP_FILES.has(e.name)) continue;
        out.push(rel + e.name);
      }
    }
  };
  walk('');
  return out.sort();
}

/**
 * sha256 hex over shipped files (excluding src/precache.js; sw.js minus its first line).
 * @param {string} root
 * @param {string[]} [files]
 * @returns {string}
 */
export function contentHash(root, files = listShipped(root)) {
  const h = createHash('sha256');
  for (const f of files) {
    if (f === 'src/precache.js') continue;
    let bytes = readFileSync(root + f);
    if (f === 'sw.js') bytes = bytes.subarray(bytes.indexOf(10) + 1);
    h.update(f); h.update('\0'); h.update(bytes); h.update('\0');
  }
  return h.digest('hex');
}
