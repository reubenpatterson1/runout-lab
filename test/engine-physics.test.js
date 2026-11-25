// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../src/engine/simulate.js';
import { validateLayout } from '../src/engine/layout.js';
import { R, MAX_T, MAX_EVENTS } from '../src/engine/constants.js';
import { B, L, aimAt, fullnessAim, angleDeg, ev, polylineDistance, mulberry, randomLayout } from './helpers.js';
const shot = (aimDeg, speed, x = 0, y = 0) => ({ aimDeg, speed, spin: { x, y } });
const contactOf = (s, id = 'ob') => ev(s, (e) => e.type === 'ball' && (e.a === 'cue' || e.b === 'cue') && (e.a === id || e.b === id));
const stopAfter = (s, t) => ev(s, (e) => e.type === 'stop' && e.a === 'cue' && e.t > t);
const rollAfter = (s, t) => ev(s, (e) => e.type === 'roll' && e.a === 'cue' && e.t > t);

test('Stop shot: straight-in stun stops within 0.25 ball-widths of contact', () => {
  const s = simulate(L([B('cue', 45.5, 25), B('ob', 50, 25)]), shot(0, 80));
  const c = contactOf(s), st = stopAfter(s, c.t); assert.ok(Math.hypot(st.x - c.x, st.y - c.y) <= 0.25 * 2 * R);
});
test('Stun cut: cue leaves along the tangent line within 2 deg', () => {
  const cue = B('cue', 40, 25), ob = B('ob', 46, 25), s = simulate(L([cue, ob]), shot(fullnessAim(cue, ob, 0.5), 80));
  const c = contactOf(s), p = s.trajectories.cue.find((q) => q.t >= c.t + 0.1);
  const n = { x: ob.x - c.x, y: ob.y - c.y }, tan = { x: -n.y, y: n.x }, d = { x: p.x - c.x, y: p.y - c.y };
  assert.ok(Math.min(angleDeg(d, tan), angleDeg(d, { x: -tan.x, y: -tan.y })) <= 2);
});
test('30 deg rule: rolling half-ball 30±4, quarter and three-quarter 27–36', () => {
  for (const [f, lo, hi] of [[0.5, 26, 34], [0.25, 27, 36], [0.75, 27, 36]]) {
    const cue = B('cue', 20, 25), ob = B('ob', 40, 25), aim = fullnessAim(cue, ob, f);
    const s = simulate(L([cue, ob]), shot(aim, 20, 0, 0.8)), c = contactOf(s), r = rollAfter(s, c.t), st = stopAfter(s, r.t);
    const a = angleDeg({ x: Math.cos((aim * Math.PI) / 180), y: Math.sin((aim * Math.PI) / 180) }, { x: st.x - r.x, y: st.y - r.y });
    assert.ok(a >= lo && a <= hi, `f=${f} a=${a}`);
  }
});
test('Draw: twice the distance comes back measurably less', () => {
  const back = (x0) => { const s = simulate(L([B('cue', x0, 25), B('ob', 52, 25)]), shot(0, 50, 0, -1)); const c = contactOf(s); return c.x - stopAfter(s, c.t).x; };
  const d10 = back(42), d20 = back(32); assert.ok(d10 > 2 * R); assert.ok(d20 < d10 - 2 * R);
});
test('Cushions (engine): running english lengthens off the top rail', () => {
  const xAt = (sx) => { const s = simulate(L([B('cue', 30, 30)], []), shot(-45, 60, sx, 0)); const k = ev(s, (e) => e.type === 'cushion' && e.a === 'cue');
    return s.trajectories.cue.find((q) => q.t >= k.t + 0.3).x; };
  assert.ok(xAt(0.8) > xAt(0) && xAt(0) > xAt(-0.8));
});
test('Kicks: firm one-rail mirror kick misses the mirror target by more than one ball-width', () => {
  const target = { x: 75, y: 15 }, aim = aimAt({ x: 25, y: 15 }, { x: 75, y: 2 * (50 - R) - 15 });
  const s = simulate(L([B('cue', 25, 15)], []), shot(aim, 120)), k = ev(s, (e) => e.type === 'cushion' && e.a === 'cue');
  assert.ok(polylineDistance(s.trajectories.cue.filter((q) => q.t >= k.t), target) > 2 * R);
});
test('Blockers in the path get hit and move', () => {
  const s = simulate(L([B('cue', 20, 25), B('b1', 40, 25), B('ob', 60, 25)]), shot(0, 60));
  assert.equal(s.firstContactId, 'b1'); const b1 = s.final.find((b) => b.id === 'b1'); assert.ok(Math.hypot(b1.x - 40, b1.y - 25) > 2);
});
test('RF1 frozen pair, stun cradle: Newton cradle in one instant', () => {
  const s = simulate(L([B('cue', 50 - 2 * R - 0.5, 25), B('ob', 50, 25), B('b1', 50 + 2 * R, 25)]), shot(0, 40));
  const e1 = contactOf(s), e2 = ev(s, (e) => e.type === 'ball' && [e.a, e.b].sort().join() === 'b1,ob');
  assert.ok(Math.abs(e2.t - e1.t) < 1e-9); const f = Object.fromEntries(s.final.map((b) => [b.id, b]));
  assert.ok(Math.hypot(f.ob.x - 50, f.ob.y - 25) < 1); assert.ok(f.b1.x - (50 + 2 * R) > 5);
  assert.ok(Math.hypot(f.cue.x - e1.x, f.cue.y - e1.y) < 1);
});
test('RF1 frozen pair, rolling cradle: cue follows through and pushes ob', () => {
  const s = simulate(L([B('cue', 30, 25), B('ob', 50, 25), B('b1', 50 + 2 * R, 25)]), shot(0, 40));
  const e1 = contactOf(s), e2 = ev(s, (e) => e.type === 'ball' && [e.a, e.b].sort().join() === 'b1,ob');
  assert.ok(Math.abs(e2.t - e1.t) < 1e-9); const f = Object.fromEntries(s.final.map((b) => [b.id, b]));
  assert.ok(f.b1.x - (50 + 2 * R) > 5); assert.ok(f.ob.x - 50 > 0.5);
});
test('RF1 rail-frozen ball driven into the rail rebounds in the same instant', () => {
  const s = simulate(L([B('cue', 30, 40), B('ob', 30, 50 - R)]), shot(90, 30)), c = contactOf(s);
  assert.ok(ev(s, (e) => e.type === 'cushion' && e.a === 'ob' && Math.abs(e.t - c.t) < 1e-9)); assert.ok(s.settled);
  assert.ok(validateLayout({ ...L(s.final), rules: { kind: 'designated', legalIds: ['ob'] } }).ok);
});
test('RF1 ball rolling frozen along a rail makes no cushion events', () => {
  const s = simulate(L([B('cue', 20, R)], []), shot(0, 30)); assert.equal(s.events.filter((e) => e.type === 'cushion').length, 0);
  assert.ok(Math.abs(s.final[0].y - R) < 1e-9);
});
test('RF2 simultaneous two-ball contact: both hit at one instant, settles, deterministic', () => {
  const lay = L([B('cue', 20, 25), B('ob', 40, 25 - 1.2), B('b1', 40, 25 + 1.2)]), a = simulate(lay, shot(0, 50));
  const ta = contactOf(a, 'ob').t, tb = contactOf(a, 'b1').t; assert.ok(Math.abs(ta - tb) < 1e-9); assert.ok(a.settled);
  assert.deepEqual(simulate(lay, shot(0, 50)), a);
});
test('RF2 frozen triangle break settles in bounded events', () => {
  const c = { x: 60, y: 25 }, rr = (2 * R) / Math.sqrt(3), tri = [0, 120, 240].map((k, i) => B(['ob', 'b1', 'b2'][i], c.x + rr * Math.cos(((180 + k) * Math.PI) / 180), c.y + rr * Math.sin(((180 + k) * Math.PI) / 180)));
  const s = simulate(L([B('cue', 30, 25), ...tri]), shot(0, 120)); assert.ok(s.settled); assert.ok(s.events.length < 200);
});
test('Determinism and termination: 200 random shots settle in bounded time', () => {
  const rnd = mulberry(42);
  for (let i = 0; i < 200; i++) {
    const lay = randomLayout(1000 + i, 6), sh = { aimDeg: rnd() * 360, speed: 10 + rnd() * 150, spin: { x: rnd() * 1.2 - 0.6, y: rnd() * 2 - 1 } };
    const s = simulate(lay, sh); assert.ok(s.settled && s.duration < MAX_T && s.events.length < MAX_EVENTS);
    if (i < 20) assert.deepEqual(simulate(lay, sh), s);
  }
});

test('stopAtFirstContact halts at the first contact', () => {
  const s = simulate(L([B('cue', 20, 25), B('ob', 40, 25)]), shot(0, 60), { stopAtFirstContact: true });
  assert.equal(s.firstContactId, 'ob'); assert.equal(s.settled, false);
  assert.equal(s.events.filter((e) => e.type === 'ball').length, 1);
});
test('maxCushions 0 halts on the first cushion with settled=false', () => {
  const s = simulate(L([B('cue', 30, 30)], []), shot(-45, 60), { maxCushions: 0 });
  assert.equal(s.settled, false); assert.equal(s.cueRailsBeforeContact, 1);
  assert.equal(s.events.filter((e) => e.type === 'cushion').length, 1);
});
test('record:false gives empty trajectories', () => {
  const s = simulate(L([B('cue', 20, 25), B('ob', 40, 25)]), shot(0, 60), { record: false });
  assert.deepEqual(s.trajectories, {}); assert.ok(s.settled);
});
test('one-rail kick reports cueRailsBeforeContact === 1', () => {
  const aim = aimAt({ x: 25, y: 15 }, { x: 60, y: 2 * (50 - R) - 15 });
  const k = ev(simulate(L([B('cue', 25, 15)], []), shot(aim, 100)), (e) => e.type === 'cushion');
  const lane = simulate(L([B('cue', 25, 15)], []), shot(aim, 100)).trajectories.cue.find((q) => q.t > k.t && q.x >= 60);
  const s = simulate(L([B('cue', 25, 15), B('ob', lane.x, lane.y)]), shot(aim, 100));
  assert.equal(s.firstContactId, 'ob'); assert.equal(s.cueRailsBeforeContact, 1);
});
test('driving the OB into a rail gives railsAfterContact >= 1', () => {
  const s = simulate(L([B('cue', 30, 25), B('ob', 40, 25)]), shot(0, 150));
  assert.equal(s.firstContactId, 'ob'); assert.ok(s.railsAfterContact >= 1);
});
test('overlapping layout throws invalid layout: overlap', () => {
  assert.throws(() => simulate(L([B('cue', 20, 25), B('ob', 21, 25)]), shot(0, 50)), /invalid layout: overlap/);
});
test('no trajectory has two consecutive samples with equal t', () => {
  const s = simulate(L([B('cue', 20, 25), B('b1', 40, 25), B('ob', 60, 25)]), shot(0, 60));
  for (const tr of Object.values(s.trajectories)) for (let i = 1; i < tr.length; i++) assert.notEqual(tr[i].t, tr[i - 1].t);
});
