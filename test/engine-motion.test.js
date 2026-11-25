// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strike, advanceBall } from '../src/engine/motion.js';
import { cushionRebound } from '../src/engine/cushion.js';
const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const outDeg = (r) => (Math.atan2(Math.abs(r.vt), Math.abs(r.vn)) * 180) / Math.PI;
const at45 = (s, wz = 0) => cushionRebound({ vn: s * Math.SQRT1_2, vt: s * Math.SQRT1_2, wz });

test('strike: centre ball slides, 0.8 follow is natural roll, english sets wz', () => {
  const c = strike({ aimDeg: 0, speed: 50, spin: { x: 0, y: 0 } }); assert.equal(c.state, 'sliding'); near(c.vx, 50, 1e-12); near(c.wx, 0, 1e-12);
  assert.equal(strike({ aimDeg: 0, speed: 50, spin: { x: 0, y: 0.8 } }).state, 'rolling');
  near(strike({ aimDeg: 0, speed: 50, spin: { x: 1, y: 0 } }).wz, 62.5, 1e-9);
  near(strike({ aimDeg: 0, speed: 50, spin: { x: 0, y: -1 } }).wx, -62.5, 1e-9);
  near(Math.hypot(strike({ aimDeg: 0, speed: 40, spin: { x: 1, y: 1 } }).wz, strike({ aimDeg: 0, speed: 40, spin: { x: 1, y: 1 } }).wx), 50, 1e-9);
});
test('sliding centre-ball reaches 5/7 speed at t_r = |u|/(3.5 mu g), then rolls to a stop', () => {
  const b = { id: 'cue', x: 10, y: 25, state: 'sliding', ...strike({ aimDeg: 0, speed: 50, spin: { x: 0, y: 0 } }) };
  const tr = 50 / (3.5 * 0.2 * 386.09); const r = advanceBall(b, tr + 1e-9);
  near(r.roll, tr, 1e-6); assert.equal(b.state, 'rolling'); near(Math.hypot(b.vx, b.vy), (5 / 7) * 50, 1e-4);
  const s = advanceBall(b, 30); assert.equal(b.state, 'stopped'); near(s.stop, ((5 / 7) * 50) / (0.01 * 386.09), 1e-4);
  near(b.x, 10 + (50 * tr - 0.5 * 77.218 * tr * tr) + ((5 / 7) * 50) ** 2 / (2 * 3.8609), 1e-3);
});
test('side spin decays at 20 in/s^2 and never moves a stopped ball', () => {
  const b = { id: 'o', x: 30, y: 30, vx: 0, vy: 0, wx: 0, wy: 0, wz: 30, state: 'stopped' };
  advanceBall(b, 1); near(b.wz, 10, 1e-9); assert.equal(b.x, 30); advanceBall(b, 1); assert.equal(b.wz, 0);
});
test('Cushions: soft spinless near mirror (within 2 deg)', () => { near(outDeg(at45(10)), 45, 2); });
test('Cushions: harder rebounds shorter (at least 5 deg short at 150 in/s)', () => { assert.ok(outDeg(at45(150)) <= 40); assert.ok(outDeg(at45(150)) < outDeg(at45(10))); });
test('Cushions: running english lengthens, reverse shortens (>= 3 deg)', () => {
  const none = outDeg(at45(40)); assert.ok(outDeg(at45(40, -30)) >= none + 3); assert.ok(outDeg(at45(40, 30)) <= none - 3);
});
test('Cushions: below V_REST the ball does not bounce', () => { assert.equal(cushionRebound({ vn: 0.3, vt: 5, wz: 0 }).vn, 0); });
test('advanceBall composes across step sizes', () => {
  const mk = () => ({ id: 'c', x: 20, y: 20, state: 'sliding', ...strike({ aimDeg: 30, speed: 120, spin: { x: 0.4, y: -0.6 } }) });
  const a = mk(), b = mk();
  advanceBall(a, 40);
  for (let i = 0; i < 4000; i++) advanceBall(b, 0.01);
  near(a.x, b.x, 1e-6); near(a.y, b.y, 1e-6); near(a.vx, b.vx, 1e-6); near(a.vy, b.vy, 1e-6);
});
