// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { posix } from 'node:path';
const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const IDS = ['plan', 'position', 'closer', 'safety', 'escape', 'decide', 'drills'];

test('home links every legacy module in one tap', () => {
  const html = read('index.html');
  for (const id of IDS) assert.ok(html.includes(`href="legacy/index.html#${id}"`), id);
  assert.ok(!/user-scalable=no|maximum-scale/.test(html));
});
test('shell: legacy look, brand links home, update banner, app.js, no home.js', () => {
  const html = read('index.html');
  assert.ok(html.includes('<link rel="stylesheet" href="fonts/fonts.css">') && !/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(html));
  assert.ok(html.includes('<header class="top">') && html.includes('<a class="brand" href="#/">RUN<span class="dot"></span><b>OUT</b> LAB</a>'));
  for (const t of ['--bg:#0a0e0c', '--brass:#c8a24c', '--ink:#ece7d6', '--red:#df6a4f', '--rail:#241b12', '--rail2:#160f09']) assert.ok(html.includes(t), t);
  assert.ok(html.includes('<nav class="tabs" aria-label="Modules">'));
  assert.ok(html.includes('<div id="update-wrap" role="status"><button id="update" class="btn active" hidden>New version available — tap to reload</button></div>'));
  assert.ok(html.includes('<main id="app" class="wrap"></main>'));
  assert.ok(html.includes('<script type="module" src="src/app.js"></script>') && !html.includes('src/home.js'));
  assert.ok(html.includes('<meta name="viewport" content="width=device-width, initial-scale=1">'));
  assert.ok(!existsSync(new URL('src/home.js', root)));
  const app = read('src/app.js');
  for (const s of ['Training hub', 'Close the rack.', 'Win the safety battle.', 'Safety Studio is rebuilt. The other modules open the current version.', 'href="#/study"', 'href="#/table"']) assert.ok(app.includes(s), s);
});
test('§14 text rules: nothing below 0.75rem or 12px; --faint and --brass-dim never colour text', () => {
  const css = /** @type {RegExpMatchArray} */ (read('index.html').match(/<style>([\s\S]*?)<\/style>/))[1];
  for (const m of css.matchAll(/font-size:\s*([\d.]+)(rem|px)/g)) assert.ok(m[2] === 'rem' ? Number(m[1]) >= 0.75 : Number(m[1]) >= 12, m[0]);
  assert.ok(!/(^|[;{\s])color:\s*var\(--(faint|brass-dim)\)/.test(css));
  assert.ok(css.includes('.door .btn{min-height:64px'));
});
test('Study list and Table door copy', () => {
  const study = read('src/study/index.js'), table = read('src/table/index.js');
  for (const id of ['plan', 'position', 'closer', 'escape', 'decide']) assert.ok(study.includes(`legacy/index.html#${id}`), id);
  assert.ok(study.includes('Kick out of hooks with the mirror system and see where the cue ball really goes.') && !study.includes('calculator'));
  assert.ok(table.includes('legacy/index.html#drills'));
  for (const s of ['Stop-Shot Ladder', 'Up-and-Down Speed Control', 'Wagon Wheel', 'Progressive Ghost', 'Key-Ball End Game', 'Insurance Breakout', 'Hide-Behind-Target', 'Line-of-Balls Mirror Kick',
    'Logs in the current version last for this visit only.', 'Run drills at a real table. Until the new drill screens ship, drills open the current version.',
    'Start wake-lock test', 'Stop wake-lock test', 'Held — the screen should stay on.', 'Set Auto-Lock to Never: Settings → Display & Brightness → Auto-Lock.']) assert.ok(table.includes(s), s);
});
/** Relative static imports reachable from entry (repo-relative POSIX paths). @param {string} entry */
function importGraph(entry) {
  const seen = new Set(), stack = [entry];
  while (stack.length) {
    const f = /** @type {string} */ (stack.pop());
    if (seen.has(f)) continue;
    seen.add(f);
    for (const m of read(f).matchAll(/(?:^|\n)\s*(?:import|export)\s(?:[^;'"]*?\sfrom\s*)?['"](\.{1,2}\/[^'"]+)['"]/g)) stack.push(posix.normalize(posix.join(posix.dirname(f), m[1])));
  }
  return seen;
}
test('main thread never imports the engine simulation, eval or search (GC4)', () => {
  const g = importGraph('src/app.js');
  assert.ok(g.has('src/ui/router.js') && g.has('src/table/index.js'));
  const bad = [...g].filter((f) => /^src\/(eval\/|engine\/(simulate|motion|cushion)\.js$|search\/(search|grid|handle|worker)\.js$)/.test(f));
  assert.deepEqual(bad, []);
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
