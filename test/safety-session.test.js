// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newSession, addDeal, applyReroll, recordShot, advance, usedIds, average, summary, validSession } from '../src/study/safety-session.js';
import { dealSlot, dealSession } from '../src/deal/bank.js';
import { createSessionStore } from '../src/ui/session-store.js';
const bank = JSON.parse(readFileSync(new URL('../data/safety-bank.json', import.meta.url), 'utf8'));
const E = (id, family = 2, band = 'medium', total = 80) => /** @type {any} */ ({ id, family, band, best: { score: { total } } });
const S = (total, gate) => /** @type {any} */ ({ total, ...(gate ? { gate } : {}) });
const full = () => { let s = newSession(4); for (let i = 0; i < 10; i++) s = advance(recordShot(addDeal(s, E(i, 2, 'hard', 90)), S(i === 3 ? 0 : 60 + 2 * i, i === 3 ? 'scratch' : undefined))); return s; };

test('addDeal records the slot; the first shot counts and later shots never change it', () => {
  let s = addDeal(newSession(5), E(11, 2, 'hard', 88));
  assert.deepEqual(s, { seed: 5, slot: 0, done: false, slots: [{ id: 11, family: 2, band: 'hard', rerolls: 0, noAlt: false, score: null, gate: null, best: 88 }] });
  s = recordShot(recordShot(recordShot(s, S(73)), S(99)), S(0, 'scratch'));
  assert.deepEqual([s.slots[0].score, s.slots[0].gate], [73, null]);
  const g = recordShot(addDeal(newSession(1), E(3)), S(0, 'no-rail'));
  assert.deepEqual([g.slots[0].score, g.slots[0].gate], [0, 'no-rail']);
  assert.throws(() => addDeal(s, E(12)), /deal out of order/);
});
test('functions are pure: inputs are never mutated', () => {
  const s0 = addDeal(newSession(1), E(1)), copy = structuredClone(s0);
  recordShot(s0, S(80)); applyReroll(s0, E(2)); applyReroll(s0, null); advance(recordShot(s0, S(80)));
  assert.deepEqual(s0, copy);
});
test('reroll: an entry replaces the slot; null sets noAlt and keeps the layout; no reroll after a shot', () => {
  let s = applyReroll(addDeal(newSession(5), E(11)), E(12, 2, 'medium', 75));
  assert.deepEqual(s.slots[0], { id: 12, family: 2, band: 'medium', rerolls: 1, noAlt: false, score: null, gate: null, best: 75 });
  s = applyReroll(s, null);
  assert.deepEqual([s.slots[0].id, s.slots[0].rerolls, s.slots[0].noAlt], [12, 1, true]);
  assert.throws(() => applyReroll(recordShot(s, S(70)), E(13)), /reroll after the first shot/);
});
test('advance stops at slot 9 and sets done after it; it needs a scored slot', () => {
  assert.throws(() => advance(addDeal(newSession(1), E(0))), /slot not scored/);
  assert.throws(() => advance(newSession(1)), /slot not scored/);
  let s = newSession(1);
  for (let i = 0; i < 10; i++) { s = advance(recordShot(addDeal(s, E(i)), S(70))); assert.deepEqual([s.slot, s.done], i < 9 ? [i + 1, false] : [9, true]); }
  assert.deepEqual(usedIds(s), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});
test('average rounds the mean of scored slots and is null before the first', () => {
  let s = addDeal(newSession(1), E(1)); assert.equal(average(s), null);
  s = recordShot(addDeal(advance(recordShot(s, S(70))), E(2)), S(71)); assert.equal(average(s), 71);
  assert.equal(average(addDeal(advance(s), E(3))), 71);
});
test('summary rows match the slots', () => {
  const s = full(), m = summary(s);
  assert.equal(m.average, average(s)); assert.equal(m.good, s.slots.filter((x) => /** @type {number} */ (x.score) >= 70).length);
  assert.deepEqual(m.rows, s.slots.map((x, i) => ({ n: i + 1, id: x.id, family: x.family, band: x.band, score: x.score, gate: x.gate, best: x.best })));
  assert.deepEqual([m.rows[3].score, m.rows[3].gate], [0, 'scratch']);
});
test('session determinism through the UI path: 200 seeds give exactly dealSession ids', () => {
  for (let seed = 0; seed < 200; seed++) {
    let s = newSession(seed);
    for (let i = 0; i < 10; i++) s = advance(recordShot(addDeal(s, /** @type {any} */ (dealSlot(bank, seed, s.slot, usedIds(s)))), S(50)));
    assert.equal(s.done, true); assert.deepEqual(usedIds(s), dealSession(bank, seed).map((x) => x?.id));
  }
});
test('the state round-trips through createSessionStore', () => {
  const m = new Map(), storage = /** @type {any} */ ({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } });
  const s = full();
  assert.equal(createSessionStore('study-safety', null, { storage }).save(s), true);
  assert.deepEqual(createSessionStore('study-safety', null, { storage }).load(), s);
});
test('RF1: validSession rejects stale or corrupt stored state', () => {
  const ok = addDeal(newSession(3), E(1));
  for (const good of [newSession(3), ok, full()]) assert.equal(validSession(good), true);
  for (const bad of [null, 7, {}, { ...ok, seed: -1 }, { ...ok, seed: 2 ** 31 }, { ...ok, slot: 10 }, { ...ok, slots: 'x' },
    { ...ok, slots: [...ok.slots, ok.slots[0]] }, { ...ok, slot: 1 }, { ...ok, done: true },
    { ...ok, slots: [{ ...ok.slots[0], band: 'x' }] }, { ...ok, slots: [{ ...ok.slots[0], family: 4 }] },
    { ...ok, slots: [{ ...ok.slots[0], score: 101 }] }, { ...ok, slots: [{ ...ok.slots[0], gate: 'x' }] }]) assert.equal(validSession(bad), false, JSON.stringify(bad));
});
