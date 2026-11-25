// @ts-check
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { contentHash } from './shipped.js';

/**
 * @param {string} root
 * @param {{write?: boolean}} [opts]
 * @returns {{changed: boolean, version: number, hash: string}}
 */
export function stamp(root, opts = {}) {
  const write = opts.write !== false;
  const path = root + 'src/precache.js';
  let src = readFileSync(path, 'utf8');
  const vm = src.match(/export const VERSION = (\d+);/);
  const hm = src.match(/export const HASH = '([0-9a-f]*)';/);
  if (!vm || !hm) throw new Error('src/precache.js: VERSION/HASH not found');
  let version = Number(vm[1]);
  const hash = contentHash(root);
  const changed = hm[1] !== hash;
  if (changed) {
    version += 1;
    src = src.replace(vm[0], `export const VERSION = ${version};`).replace(hm[0], `export const HASH = '${hash}';`);
    if (write) writeFileSync(path, src);
  }
  const swPath = root + 'sw.js';
  if (write && existsSync(swPath)) {
    const lines = readFileSync(swPath, 'utf8').split('\n');
    lines[0] = `// runout-lab sw v${version}`;
    writeFileSync(swPath, lines.join('\n'));
  }
  return { changed, version, hash };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = stamp(fileURLToPath(new URL('../', import.meta.url)));
  console.log(`${r.changed ? 'stamped' : 'up to date'} v${r.version}`);
}
