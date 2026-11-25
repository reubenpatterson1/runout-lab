// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mulberry32, hashSeed } from '../src/deal/prng.js';
import { ACTIVE_FAMILIES } from '../src/deal/families.js';
import { sessionPlan, pickEntry, dealSlot, dealSession, rerollSlot, entryById, exampleBySlug, exampleLabel, sampleCells, MISSING_DEAL_TEXT } from '../src/deal/bank.js';
const bank = JSON.parse(readFileSync(new URL('../data/safety-bank.json', import.meta.url), 'utf8'));
const E = (id, family, band) => /** @type {any} */ ({ id, family, band });
const mini = /** @type {any} */ ({ entries: [E(1, 1, 'easy'), E(2, 1, 'easy'), E(3, 1, 'easy'), E(4, 2, 'hard')], examples: [] });

test('pickEntry: seeded start, steps over excluded, null when empty or exhausted', () => {
  const i = Math.floor(mulberry32(hashSeed(9))() * 3);
  assert.equal(pickEntry(mini, 1, 'easy', 9, [])?.id, [1, 2, 3][i]);
  assert.equal(pickEntry(mini, 1, 'easy', 9, [[1, 2, 3][i]])?.id, [1, 2, 3][(i + 1) % 3]);
  assert.equal(pickEntry(mini, 1, 'easy', 9, [1, 2, 3]), null); assert.equal(pickEntry(mini, 3, 'easy', 9, []), null);
});
test('sessionPlan: 3/4/3 over active families, each family ≤ 2, deterministic', () => {
  for (let s = 0; s < 500; s++) { const p = sessionPlan(s); assert.equal(p.length, 10);
    assert.deepEqual(['easy', 'medium', 'hard'].map((b) => p.filter((x) => x.band === b).length), [3, 4, 3]);
    for (const f of ACTIVE_FAMILIES) assert.ok(p.filter((x) => x.family === f).length <= 2);
    assert.ok(p.every((x) => ACTIVE_FAMILIES.includes(x.family))); }
  assert.deepEqual(sessionPlan(123), sessionPlan(123));
});
test('dealSlot falls through to the next active family (cyclic) when the planned cell yields nothing', () => {
  const s = [...Array(2000).keys()].find((k) => sessionPlan(k)[0].band === 'hard' && sessionPlan(k)[0].family !== 2);
  assert.ok(s !== undefined); assert.equal(dealSlot(mini, /** @type {number} */ (s), 0, [])?.id, 4);
});
test('500 sessions on the real bank: every slot resolves, no repeats, bands match the plan, deterministic', () => {
  for (let s = 0; s < 500; s++) {
    const d = dealSession(bank, s), p = sessionPlan(s);
    assert.ok(d.every((e) => e)); assert.equal(new Set(d.map((e) => e?.id)).size, 10);
    d.forEach((e, i) => assert.equal(e?.band, p[i].band));
    if (s < 20) assert.deepEqual(dealSession(bank, s).map((e) => e?.id), d.map((e) => e?.id));
  }
});
test('reroll keeps family and band, excludes current and session, is seeded by (session, slot, r)', () => {
  const d = /** @type {any[]} */ (dealSession(bank, 7)), used = d.map((e) => e.id);
  const r1 = rerollSlot(bank, 7, 0, 1, d[0], used);
  if (r1) { assert.equal(r1.family, d[0].family); assert.equal(r1.band, d[0].band); assert.ok(!used.includes(r1.id));
    assert.deepEqual(rerollSlot(bank, 7, 0, 1, d[0], used), r1); }
  assert.equal(rerollSlot(mini, 1, 0, 1, E(4, 2, 'hard'), []), null);
});
test('URL ids and examples', () => {
  const e = bank.entries[0]; assert.deepEqual(entryById(bank, e.id), e); assert.equal(entryById(bank, -1), null);
  assert.equal(MISSING_DEAL_TEXT, "That layout isn't in this version");
  for (const slug of ['open-hook', 'rail-tuck', 'behind-the-8']) { const x = exampleBySlug(bank, slug); assert.ok(x);
    assert.equal(exampleLabel(x), !x.best || x.best.score.total < 70 ? 'No safety scoring 70 found' : null); }
  assert.equal(exampleBySlug(bank, 'nope'), null);
  assert.ok(sampleCells(bank, 2).length <= 36);
});
