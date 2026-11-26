// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controlState, openAction } from '../src/study/safety-state.js';
import { newSession, addDeal, recordShot, advance } from '../src/study/safety-session.js';
const KEYS = ['aim', 'shoot', 'newLayout', 'next', 'startSession', 'retry', 'hint', 'tryShot', 'moveBalls', 'restore', 'done', 'skip', 'cancel'];
const ctx = (o) => /** @type {any} */ ({ mode: 'session', phase: 'aiming', pending: null, scored: false, noAlt: false, last: false, edited: false, hintShot: false, ...o });
const want = (on = [], off = [], nextLabel = 'Next layout') => ({ ...Object.fromEntries(KEYS.map((k) => [k, on.includes(k) ? 'enabled' : off.includes(k) ? 'disabled' : 'hidden'])), nextLabel });
const E = (id) => /** @type {any} */ ({ id, family: 2, band: 'medium', best: { score: { total: 80 } } });

test('session aiming before and after the first shot (B4)', () => {
  assert.deepEqual(controlState(ctx({})), want(['aim', 'shoot', 'newLayout']));
  assert.deepEqual(controlState(ctx({ noAlt: true })), want(['aim', 'shoot'], ['newLayout']));
  assert.deepEqual(controlState(ctx({ scored: true, last: true })), want(['aim', 'shoot', 'next', 'moveBalls'], [], 'Finish session'));
});
test('single mode aiming and result', () => {
  assert.deepEqual(controlState(ctx({ mode: 'single' })), want(['aim', 'shoot', 'startSession', 'moveBalls']));
  assert.deepEqual(controlState(ctx({ mode: 'single', phase: 'result', edited: true })), want(['retry', 'hint', 'moveBalls', 'restore']));
});
test('session result, then after a hint', () => {
  assert.deepEqual(controlState(ctx({ phase: 'result', scored: true })), want(['retry', 'hint', 'next', 'moveBalls']));
  assert.deepEqual(controlState(ctx({ phase: 'result', scored: true, hintShot: true })), want(['retry', 'hint', 'tryShot', 'next', 'moveBalls']));
});
test('editing shows only Done and Restore', () => {
  assert.deepEqual(controlState(ctx({ mode: 'single', phase: 'editing', edited: true })), want(['done', 'restore']));
  assert.deepEqual(controlState(ctx({ mode: 'single', phase: 'editing' })), want(['done']));
});
test('RF4: while anything is pending, only Skip (replay) or Cancel (search) is enabled', () => {
  for (const mode of ['session', 'single']) for (const phase of ['aiming', 'result']) for (const scored of [false, true]) for (const edited of [false, true]) for (const pending of ['replay', 'search', 'load']) {
    const s = controlState(ctx({ mode, phase, scored, edited, pending, hintShot: true }));
    const enabled = KEYS.filter((k) => s[k] === 'enabled');
    assert.deepEqual(enabled, pending === 'replay' ? ['skip'] : pending === 'search' ? ['cancel'] : [], JSON.stringify({ mode, phase, scored, edited, pending }));
  }
});
test('openAction: new, deal, load and summary; corrupt state starts new (RF1)', () => {
  assert.deepEqual(openAction(null), { kind: 'new' }); assert.deepEqual(openAction({ junk: 1 }), { kind: 'new' });
  const s0 = newSession(4); assert.deepEqual(openAction(s0), { kind: 'deal' });
  assert.deepEqual(openAction(addDeal(s0, E(42))), { kind: 'load', id: 42 });
  assert.deepEqual(openAction(advance(recordShot(addDeal(s0, E(42)), /** @type {any} */ ({ total: 70 })))), { kind: 'deal' });
  let s = newSession(4); for (let i = 0; i < 10; i++) s = advance(recordShot(addDeal(s, E(i)), /** @type {any} */ ({ total: 70 })));
  assert.deepEqual(openAction(s), { kind: 'summary' });
});
