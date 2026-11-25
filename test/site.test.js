// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const IDS = ['plan', 'position', 'closer', 'safety', 'escape', 'decide', 'drills'];

test('home links every legacy module in one tap', () => {
  const html = read('index.html');
  for (const id of IDS) assert.ok(html.includes(`href="legacy/index.html#${id}"`), id);
  assert.ok(!/user-scalable=no|maximum-scale/.test(html));
});
test('legacy page is the old app, self-hosted fonts, deep links', () => {
  const html = read('legacy/index.html');
  assert.ok(html.includes("const TABS=[['plan','Diagnosis']"));
  assert.ok(!/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(html));
  assert.ok(html.includes('<link rel="stylesheet" href="../fonts/fonts.css">'));
  assert.ok(html.includes('function showFromHash()'));
});
test('runout-lab.html is a redirect stub to ./', () => {
  const html = read('runout-lab.html');
  assert.ok(html.length < 1000);
  assert.ok(html.includes("location.replace('./')") && html.includes('url=./'));
});
test('fonts are woff2 with OFL licences', () => {
  for (const f of ['oswald-latin', 'archivo-latin', 'spacemono-400-latin', 'spacemono-700-latin']) {
    const buf = readFileSync(new URL(`fonts/${f}.woff2`, root));
    assert.equal(buf.subarray(0, 4).toString('latin1'), 'wOF2'); assert.ok(buf.length > 5000);
    assert.ok(read('fonts/fonts.css').includes(`url("${f}.woff2")`));
  }
  for (const n of ['Oswald', 'Archivo', 'SpaceMono']) assert.match(read(`fonts/OFL-${n}.txt`), /SIL Open Font License/i);
});
test('package.json holds only the test script', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.deepEqual(Object.keys(pkg.scripts), ['test']);
  assert.ok(!pkg.dependencies && !pkg.devDependencies);
});
