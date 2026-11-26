// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/study/safety-copy.js';
import { B, L } from './helpers.js';
const score = (o = {}) => /** @type {any} */ ({ total: 78, V: 0, directThreat: 0, cueRestriction: 0.256,
  kick: { rails: 1, n1: 2, w1: 3.14159, n2: 0, w2: 0, K: 0.4 }, robustness: { scores: [61.4, 70, 80.6, 75, 78, 79, 80, 81, 95.5], sd: 9 }, label: 'Forgiving', ...o });
const gated = score({ total: 0, gate: 'scratch', label: null });

test('gate strings and short gate names', () => {
  assert.deepEqual(C.GATE_TEXT, { scratch: 'Scratch: ball in hand to your opponent', 'wrong-ball-first': 'Foul: wrong ball first', 'no-rail': 'Foul: no rail after contact', 'ob-pocketed': 'Not a safety: you pocketed the object ball' });
  assert.deepEqual(C.GATE_SHORT, { scratch: 'Scratch', 'wrong-ball-first': 'Wrong ball first', 'no-rail': 'No rail', 'ob-pocketed': 'Pocketed the object ball' });
});
test('verdict at every band edge (24/25, 49/50, 69/70, 84/85) and tone', () => {
  assert.deepEqual([0, 24, 25, 49, 50, 69, 70, 84, 85, 100].map(C.verdict), ['Sells out', 'Sells out', 'Weak', 'Weak', 'Playable', 'Playable', 'Good safety', 'Good safety', 'Lock-up', 'Lock-up']);
  assert.deepEqual([24, 25, 69, 70].map((t) => C.verdictTone(score({ total: t }))), ['red', 'amber', 'amber', 'green']);
  assert.equal(C.verdictTone(gated), 'red');
  assert.deepEqual([49, 50, 64, 65, 79, 80].map(C.sessionVerdict), ['Giving them shots', 'Leaky', 'Leaky', 'Solid', 'Solid', 'Lock-down defence']);
});
test('breakdown rows: kick rows for rails 1, 2 and 3, direct threat when visible, none when gated (B1)', () => {
  assert.deepEqual(C.breakdownRows(score()), ['Hidden: 100%', 'Their best escape: 1-rail kick · 2 lanes, widest 3.1°', 'Cue ball on a rail: 26%', 'Robustness: Forgiving · range 61–96']);
  assert.equal(C.breakdownRows(score({ kick: { rails: 2, n1: 0, w1: 0, n2: 1, w2: 2, K: 0.85 } }))[1], 'Their best escape: 2-rail kick · 1 lane, widest 2.0°');
  assert.equal(C.breakdownRows(score({ kick: { rails: 3, n1: 0, w1: 0, n2: 0, w2: 0, K: 1 } }))[1], 'No 1- or 2-rail kick for them');
  assert.deepEqual(C.breakdownRows(score({ V: 0.25, directThreat: 0.404, kick: { rails: 0, n1: 0, w1: 0, n2: 0, w2: 0, K: 0 }, label: 'Touchy' })),
    ['Hidden: 75%', 'Direct shot threat: 40%', 'Cue ball on a rail: 26%', 'Robustness: Touchy · range 61–96']);
  assert.deepEqual(C.breakdownRows(gated), []);
});
test('status, context, no-alternative, hint and announcement lines', () => {
  assert.equal(C.statusLine({ mode: 'session', slot: 2, band: 'medium', family: 2, average: 72, edited: false }), 'Deal 3 of 10 · Medium · Rail tuck or freeze · Avg 72');
  assert.equal(C.statusLine({ mode: 'session', slot: 0, band: 'hard', family: 1, average: null, edited: false }), 'Deal 1 of 10 · Hard · Hook behind a blocker');
  assert.equal(C.statusLine({ mode: 'deal', id: 85723992, band: 'medium', family: 1, edited: true }), 'Layout #85723992 · Medium · Hook behind a blocker · Edited layout');
  assert.equal(C.statusLine({ mode: 'example', name: 'rail tuck', edited: false }), 'Example · Rail tuck');
  assert.deepEqual([C.contextLine(true), C.contextLine(false)], ['Counts for the session', "Practice: doesn't count"]);
  assert.equal(C.noAltText('easy'), 'No other easy layout left for this family. Play this one or move on.');
  const shot = { aimDeg: 1, speed: 40, spin: { x: 0, y: 0 } };
  assert.deepEqual(C.hintLines({ shot, score: score() }), ['Best found: 78', ...C.breakdownRows(score())]);
  assert.deepEqual(C.hintLines({ shot, score: score({ total: 65 }) }).slice(0, 2), ['Best found: 65', 'No safety scoring 70 found']);
  assert.deepEqual(C.hintLines(null), ['No legal safety found from here']);
  assert.equal(C.announceText(score()), 'Good safety. Score 78'); assert.equal(C.announceText(gated), 'Scratch: ball in hand to your opponent. Score 0');
});
test('canvas labels for designated, 8-ball and 9-ball layouts', () => {
  const d = [B('cue', 10, 10), B('ob', 50, 25), B('b1', 30, 20), B('b2', 30, 30), B('b3', 40, 40)];
  assert.equal(C.tableLabel(L(d), 12.44), 'Table. Cue ball, object ball, 3 blockers. Aim 12.4 degrees.');
  assert.equal(C.tableLabel(L(d.slice(0, 3)), 12.44), 'Table. Cue ball, object ball, 1 blocker. Aim 12.4 degrees.');
  assert.equal(C.tableLabel(L(d.slice(0, 2)), 360), 'Table. Cue ball, object ball. Aim 0.0 degrees.');
  const e8 = L([B('cue', 5, 5), B('9', 10, 10), B('10', 20, 10), B('1', 30, 10), B('2', 40, 10), B('3', 50, 10), B('8', 60, 10)], ['1', '2', '3'], '8ball', ['9', '10']);
  assert.equal(C.tableLabel(e8, 3.4832), 'Table. Cue ball; your balls 1, 2, 3; their balls 9, 10; the 8. Aim 3.5 degrees.');
  const e9 = L([B('cue', 5, 5), B('2', 10, 10), B('9', 20, 10), B('4', 30, 10), B('7', 40, 10), B('5', 50, 10)], ['2'], '9ball');
  assert.equal(C.tableLabel(e9, -114.956), 'Table. Cue ball; balls 2, 4, 5, 7, 9; lowest ball 2. Aim -115.0 degrees.');
});
test('links, summary cells, names and fixed strings', () => {
  assert.equal(C.dealLink('https://h/runout-lab/?x=1#/study/safety?deal=1', 85723992), 'https://h/runout-lab/?x=1#/study/safety?deal=85723992');
  assert.equal(C.dealLink('https://h/runout-lab/', 5), 'https://h/runout-lab/#/study/safety?deal=5');
  assert.deepEqual([C.scoreCell({ score: 73, gate: null }), C.scoreCell({ score: 0, gate: 'no-rail' })], ['73', '0 (No rail)']);
  assert.equal(C.familyName(7), '9-ball: lowest ball in clutter');
  assert.deepEqual(C.EXAMPLE_LINKS, [{ slug: 'open-hook', label: 'Open hook' }, { slug: 'rail-tuck', label: 'Rail tuck' }, { slug: 'behind-the-8', label: 'Behind the 8' }]);
  assert.equal(C.searchingText(3), 'Searching for a good safety… 3 s');
  assert.deepEqual([C.LOADING_TEXT, C.LOAD_ERROR_TEXT, C.SHOT_ERROR_TEXT, C.SCORING_TEXT, C.NEW_SESSION_CONFIRM, C.COPIED_TEXT],
    ['Loading layouts…', "Couldn't load the layouts. Check your connection, then try again.", 'Something went wrong. Try the shot again.', 'Scoring…', "Start a new session? This session's scores will be cleared.", 'Copied']);
});
