// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runBench } from '../scripts/bench.js';
test('bench runs one seeded case and reports load, parse and suggest stats', () => {
  const r = runBench({ limit: 1, unseeded: false });
  assert.equal(r.cases, 1); assert.equal(r.seeded.n, 1); assert.equal(r.belowStored, 0); assert.equal(r.unseeded, null);
  assert.ok(r.loadMs >= 0 && r.parseMs >= 0 && r.seeded.max >= 0);
});
