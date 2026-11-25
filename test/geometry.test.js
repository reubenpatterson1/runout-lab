// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { R } from '../src/engine/constants.js';
import { clearance, segmentPointDistance } from '../src/geometry/clearance.js';
import { visibility, firstBallOnRay } from '../src/geometry/visibility.js';
import { lanesFromSamples, mirrorLanes } from '../src/geometry/kick-lanes.js';
import { B, near } from './helpers.js';

test('clearance', () => {
  const a = { x: 0, y: 0 }, b = { x: 10, y: 0 };
  assert.equal(clearance(a, b, [B('k', 5, 0)], []), -2 * R); assert.ok(near(clearance(a, b, [B('k', 5, 3 * R)], []), R, 1e-12));
  assert.equal(clearance(a, b, [B('k', 5, 0)], ['k']), Infinity);
});
test('visibility: open 1, hooked 0, half-blocked ~0.5, frozen-to-blocker 0', () => {
  const cue = B('cue', 30, 25), ob = B('ob', 60, 25), V = (/** @type {import('../src/types.js').Ball} */ blk) => visibility(cue, ob, [cue, ob, blk], ['cue']);
  assert.equal(visibility(cue, ob, [cue, ob], ['cue']), 1); assert.equal(V(B('b1', 36, 25)), 0);
  const h = V(B('b1', 36, 22.75)); assert.ok(h >= 0.4 && h <= 0.6, String(h)); assert.equal(V(B('b1', 30 + 2 * R, 25)), 0);
});
test('lanesFromSamples wraps circularly', () => {
  assert.deepEqual(lanesFromSamples([1, 1, 0, 0, 1], 1), { n1: 1, w1: 3, n2: 0, w2: 0 });
  assert.deepEqual(lanesFromSamples([2, 0, 2, 2, 0], 1), { n1: 0, w1: 0, n2: 2, w2: 2 });
});
test('mirrorLanes: open table has top, bottom and head-rail one-rail lanes; a blocker removes one', () => {
  const cue = B('cue', 30, 25), ob = B('ob', 60, 25);
  assert.equal(mirrorLanes(cue, [cue, ob], ['ob'], ['cue']).n1, 3);
  assert.equal(mirrorLanes(cue, [cue, ob, B('b1', 45, 2.5)], ['ob'], ['cue']).n1, 2);
});
test('firstBallOnRay: tie goes to lower layout index; miss is null; segmentPointDistance basic', () => {
  const from = { x: 0, y: 0 }, dir = { x: 1, y: 0 };
  assert.equal(firstBallOnRay(from, dir, [B('b', 10, 0), B('a', 10, 0)], [])?.id, 'b');
  assert.equal(firstBallOnRay(from, dir, [B('a', 10, 10)], []), null);
  assert.ok(near(firstBallOnRay(from, dir, [B('a', 10, 0)], [])?.t ?? NaN, 10 - 2 * R, 1e-12));
  assert.ok(near(segmentPointDistance({ x: 5, y: 3 }, from, { x: 10, y: 0 }), 3, 1e-12));
});
test('mirrorLanes: open table two-rail count and widths', () => {
  const cue = B('cue', 30, 25), ob = B('ob', 60, 25);
  const m = mirrorLanes(cue, [cue, ob], ['ob'], ['cue']);
  assert.equal(m.n2, 4); assert.ok(near(m.w1, 4.5733, 1e-3), String(m.w1)); assert.ok(near(m.w2, 2.5811, 1e-3), String(m.w2));
});
test('mirrorLanes: side-mouth span excludes top/bottom bounces at x=50', () => {
  const cue = B('cue', 30, 25), ob = B('ob', 70, 25);
  assert.equal(mirrorLanes(cue, [cue, ob], ['ob'], ['cue']).n1, 1);
});
test('visibility: a tie between target and a later-indexed blocker counts as blocked', () => {
  const cue = B('cue', 30, 25), ob = B('ob', 32.25, 25), blk = B('b1', 30, 27.25);
  assert.equal(visibility(cue, ob, [cue, ob, blk], ['cue']), 0.5);
});
test('mirrorLanes: a cue frozen to a rail gets no one-rail lane off that rail (R20)', () => {
  const ob = B('ob', 60, 10);
  const frozen = B('cue', 30, R), off = B('cue', 30, R + 0.5);
  const f = mirrorLanes(frozen, [frozen, ob], ['ob'], ['cue']);
  const o = mirrorLanes(off, [off, ob], ['ob'], ['cue']);
  assert.ok(near(o.w1, 8.21, 0.05), String(o.w1)); assert.ok(f.w1 < 4, String(f.w1)); assert.ok(f.n1 < o.n1);
});
