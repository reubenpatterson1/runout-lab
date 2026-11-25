// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BANDS } from '../../src/deal/families.js';
import { scoreSafety } from '../../src/eval/safety.js';
const bank = JSON.parse(readFileSync(fileURLToPath(new URL('../../data/safety-bank.json', import.meta.url)), 'utf8'));

/** @param {number} family */
export function revalidateFamily(family) {
  test(`bank family ${family} re-validation`, (t) => {
    let n = 0;
    for (const band of BANDS) {
      const all = bank.entries.filter((/** @type {any} */ e) => e.family === family && e.band === band);
      for (const e of process.env.RUNOUT_FULL === '1' ? all : all.slice(0, 2)) {
        assert.deepEqual(scoreSafety(e.layout, e.best.shot), e.best.score);
        assert.ok(e.best.score.total >= 70);
        n++;
      }
    }
    t.diagnostic(`family ${family}: re-scored ${n}`);
  });
}
