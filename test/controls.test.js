// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampSpin, spinFromOffset, spinText, spinKey } from '../src/ui/spin-pad.js';
import { clampSpeed, speedWord, speedText, stepSpeed } from '../src/ui/speed.js';

test('spin: offset over radius, screen up is follow, clamped to the unit disk, rounded to 0.05', () => {
  assert.deepEqual(spinFromOffset(0, -48, 48), { x: 0, y: 1 });
  assert.deepEqual(spinFromOffset(24, 12, 48), { x: 0.5, y: -0.25 });
  assert.deepEqual(spinFromOffset(96, 0, 48), { x: 1, y: 0 });
  assert.deepEqual(spinFromOffset(100, -100, 50), { x: 0.7, y: 0.7 });
  assert.deepEqual(spinFromOffset(0, 0, 48), { x: 0, y: 0 });
  assert.deepEqual(clampSpin(0.33, -0.12), { x: 0.35, y: -0.1 });
});
test('spin text and keys', () => {
  assert.equal(spinText({ x: 0, y: 0 }), 'center');
  assert.equal(spinText({ x: 0.2, y: 0.6 }), 'follow 0.60 · right 0.20');
  assert.equal(spinText({ x: -0.5, y: -0.8 }), 'draw 0.80 · left 0.50');
  assert.equal(spinText({ x: 0.3, y: 0 }), 'right 0.30');
  assert.deepEqual(spinKey({ x: 0, y: 0.95 }, 'ArrowUp'), { x: 0, y: 1 });
  assert.deepEqual(spinKey({ x: 0.7, y: 0.7 }, 'ArrowRight'), { x: 0.75, y: 0.65 });
  assert.deepEqual(spinKey({ x: 0.5, y: 0.5 }, 'Home'), { x: 0, y: 0 }); assert.deepEqual(spinKey({ x: 0.5, y: 0.5 }, '0'), { x: 0, y: 0 });
  assert.equal(spinKey({ x: 0, y: 0 }, 'a'), null);
});
test('speed words at each edge, rounded display, clamped steps', () => {
  assert.deepEqual([8, 24, 25, 59, 60, 94, 95, 130].map(speedWord), ['soft', 'soft', 'medium', 'medium', 'firm', 'firm', 'hard', 'hard']);
  assert.equal(speedText(40), '40 in/s · medium'); assert.equal(speedText(31.5), '32 in/s · medium'); assert.equal(speedText(24.6), '25 in/s · medium');
  assert.deepEqual([5, 52.3, 200].map(clampSpeed), [8, 52.3, 130]);
  assert.deepEqual([stepSpeed(31.5, 1), stepSpeed(130, 1), stepSpeed(8, -1)], [33, 130, 8]);
});
