// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHandler } from '../src/search/handle.js';
import { createSearchClient } from '../src/search/client.js';
import { suggest } from '../src/search/search.js';
import { dealSlot, entryById } from '../src/deal/bank.js';
const text = readFileSync(new URL('../data/safety-bank.json', import.meta.url), 'utf8');
const bank = JSON.parse(text);
const load = () => Promise.resolve({ bank });
const fakeWorker = (h) => () => { const w = { onmessage: null, onerror: null, terminated: false,
  postMessage(m) { h(m).then((data) => w.onmessage && w.onmessage({ data })); }, terminate() { w.terminated = true; } }; return /** @type {any} */ (w); };

test('handler answers deal/byId/example/sample/info from the bank', async () => {
  const h = createHandler(load);
  assert.deepEqual(await h({ id: 1, type: 'deal', sessionSeed: 5, slot: 0, usedIds: [] }), { id: 1, type: 'result', result: dealSlot(bank, 5, 0, []) });
  assert.deepEqual((await h({ id: 2, type: 'byId', dealId: bank.entries[0].id })).result, bank.entries[0]);
  assert.equal((await h({ id: 3, type: 'byId', dealId: -1 })).result, null);
  assert.equal((await h({ id: 4, type: 'example', slug: 'open-hook' })).result.name, 'open hook');
  assert.equal((await h({ id: 5, type: 'info' })).result.entries, bank.entries.length);
  assert.deepEqual(await h({ id: 6, type: 'nope' }), { id: 6, type: 'error', message: 'unknown request type: nope' });
  assert.deepEqual(await h({ id: 7, type: 'reroll', sessionSeed: 1, slot: 0, r: 1, currentId: -5, usedIds: [] }), { id: 7, type: 'error', message: 'unknown deal id: -5' });
});
test('seeded suggest via the handler equals direct seeded suggest and is ≥ the stored total', async () => {
  const e = bank.entries[0], h = createHandler(load);
  const r = (await h({ id: 1, type: 'suggest', layout: e.layout, best: e.best })).result;
  assert.deepEqual(r, suggest(e.layout, { seedShots: [{ ...e.best.shot, known: e.best.score }] }));
  assert.ok(r.best.score.total >= e.best.score.total);
});
test('bank load failure → error, then retry succeeds', async () => {
  let n = 0; const h = createHandler(() => (n++ === 0 ? Promise.reject(new Error('offline')) : load()));
  assert.deepEqual(await h({ id: 1, type: 'info' }), { id: 1, type: 'error', message: 'bank load failed: offline' });
  assert.equal((await h({ id: 2, type: 'info' })).type, 'result');
});
test('client resolves by id, rejects errors, terminate rejects pending; client never parses the bank', async () => {
  const c = createSearchClient(fakeWorker(createHandler(load)));
  const [d, x] = await Promise.all([c.deal(5, 0, []), c.byId(bank.entries[0].id)]);
  assert.deepEqual(d, dealSlot(bank, 5, 0, [])); assert.deepEqual(x, entryById(bank, bank.entries[0].id));
  await assert.rejects(c.reroll(1, 0, 1, -5, []), /unknown deal id/);
  const p = c.suggest(bank.entries[0].layout, bank.entries[0].best); c.terminate(); await assert.rejects(p, /terminated/);
  const src = readFileSync(new URL('../src/search/client.js', import.meta.url), 'utf8');
  assert.ok(!src.includes('JSON.parse') && !src.includes('fetch('));
});
test('client calls after terminate or a fatal worker error reject immediately', async () => {
  const c1 = createSearchClient(fakeWorker(createHandler(load)));
  c1.terminate(); await assert.rejects(c1.info(), /terminated/);
  let w; const c2 = createSearchClient(() => { w = fakeWorker(createHandler(load))(); return w; });
  const p = c2.info(); w.onerror({ message: 'boom' });
  await assert.rejects(p, /boom/); await assert.rejects(c2.deal(5, 0, []), /boom/);
});
