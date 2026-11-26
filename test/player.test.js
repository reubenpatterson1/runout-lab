// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { simulate } from '../src/engine/simulate.js';
import { positionsAt, visibleAt, traceAt, movedIds, sceneAt, TRACE_CUE, TRACE_OTHER } from '../src/ui/player.js';
import { near } from './helpers.js';
const bank = JSON.parse(readFileSync(new URL('../data/safety-bank.json', import.meta.url), 'utf8'));
const e = bank.entries[0];
const sim = simulate(e.layout, e.best.shot, { record: true });
const tr = sim.trajectories.cue;
const base = { colours: {}, labels: {}, cueId: 'cue' };

test('positionsAt equals the samples at sample times and interpolates linearly between them', () => {
  for (const k of [0, 1, 50, tr.length - 1]) assert.deepEqual(positionsAt(sim, tr[k].t).cue, { x: tr[k].x, y: tr[k].y });
  const a = tr[50], b = tr[51], p = positionsAt(sim, a.t + 0.25 * (b.t - a.t)).cue;
  assert.ok(near(p.x, a.x + 0.25 * (b.x - a.x), 1e-9) && near(p.y, a.y + 0.25 * (b.y - a.y), 1e-9));
  const b1 = e.layout.balls.find((x) => x.id === 'b1');
  assert.deepEqual(positionsAt(sim, 1.234).b1, { x: b1.x, y: b1.y });
});
test('t beyond duration returns the final positions; t below 0 returns the start', () => {
  const end = positionsAt(sim, sim.duration + 5);
  for (const f of sim.final) assert.deepEqual(end[f.id], { x: f.x, y: f.y });
  assert.deepEqual(positionsAt(sim, -1).cue, { x: tr[0].x, y: tr[0].y });
});
test('a ball disappears from the time of its pocket event', () => {
  const sp = simulate(e.layout, { ...e.best.shot, speed: 130 }, { record: true }); // measured: the cue scratches at t ≈ 0.767
  const ev = sp.events.find((x) => x.type === 'pocket');
  assert.ok(ev && ev.a === 'cue');
  assert.ok(visibleAt(sp, ev.t - 1e-6).includes('cue')); assert.ok(!visibleAt(sp, ev.t).includes('cue'));
  assert.deepEqual([...visibleAt(sp, sp.duration)].sort(), sp.final.map((x) => x.id).sort());
  assert.ok(!sceneAt(sp, sp.duration, base).balls.some((x) => x.id === 'cue'));
});
test('traces: cue first in chalk, other movers amber; ghosts at their start; final scene balls', () => {
  assert.deepEqual(movedIds(sim), ['cue', 'ob']);
  assert.deepEqual(traceAt(sim, 'cue', 0), [{ x: tr[0].x, y: tr[0].y }]);
  const full = traceAt(sim, 'cue', sim.duration);
  assert.equal(full.length, tr.length); assert.deepEqual(full[full.length - 1], { x: tr[tr.length - 1].x, y: tr[tr.length - 1].y });
  const sc = sceneAt(sim, sim.duration, base);
  assert.equal(TRACE_CUE, '#54b6d6'); assert.equal(TRACE_OTHER, 'rgba(231,162,62,0.5)');
  assert.deepEqual((sc.traces ?? []).map((t) => [t.id, t.colour]), [['cue', TRACE_CUE], ['ob', TRACE_OTHER]]);
  const ob0 = sim.trajectories.ob[0];
  assert.deepEqual(sc.ghosts, [{ x: tr[0].x, y: tr[0].y }, { x: ob0.x, y: ob0.y }]);
  assert.deepEqual(sc.balls.map((x) => x.id).sort(), sim.final.map((x) => x.id).sort());
});
