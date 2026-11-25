// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { listShipped, contentHash } from '../scripts/shipped.js';
import { stamp } from '../scripts/stamp.js';
import { VERSION, HASH, FILES, CACHE_PREFIX } from '../src/precache.js';
const root = fileURLToPath(new URL('../', import.meta.url));

test('every shipped file is listed and every listed file exists', () => {
  assert.equal(FILES[0], './'); assert.equal(new Set(FILES).size, FILES.length);
  const listed = FILES.slice(1);
  assert.deepEqual([...listed].sort(), listShipped(root));
  for (const f of listed) assert.ok(existsSync(root + f) && statSync(root + f).isFile(), f);
});
test('content hash is not stale (run node scripts/stamp.js)', () => {
  assert.equal(HASH, contentHash(root)); assert.equal(stamp(root, { write: false }).changed, false);
});
test('cache prefix and version', () => { assert.equal(CACHE_PREFIX, 'runout-lab-v'); assert.ok(Number.isInteger(VERSION) && VERSION >= 1); });
test('manifest is installable and icons are real PNGs', () => {
  const m = JSON.parse(readFileSync(root + 'manifest.webmanifest', 'utf8'));
  assert.equal(m.start_url, './'); assert.equal(m.scope, './'); assert.equal(m.display, 'standalone');
  const sizes = { 'icons/icon-192.png': 192, 'icons/icon-512.png': 512, 'icons/icon-maskable-512.png': 512, 'icons/apple-touch-icon-180.png': 180 };
  for (const [p, s] of Object.entries(sizes)) {
    const b = readFileSync(root + p);
    assert.equal(b.subarray(1, 4).toString('latin1'), 'PNG'); assert.equal(b.readUInt32BE(16), s); assert.equal(b.readUInt32BE(20), s);
  }
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
});
test('listShipped excludes non-shipped paths', () => {
  const s = listShipped(root);
  assert.ok(!s.some((p) => /^(test|docs|scripts|bench|node_modules)\//.test(p) || p.split('/').some((x) => x.startsWith('.')) || p === 'package.json'));
});
test('RF5 sw.js line 1 matches VERSION', () => {
  assert.equal(readFileSync(root + 'sw.js', 'utf8').split('\n')[0], `// runout-lab sw v${VERSION}`);
});
