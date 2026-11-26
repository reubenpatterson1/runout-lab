// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHash, matchRoute, safetyMode } from '../src/ui/router.js';

test('parseHash: path and decoded params', () => {
  for (const h of ['', '#', '#/']) assert.deepEqual(parseHash(h), { path: '/', params: {} });
  assert.deepEqual(parseHash('#/study'), { path: '/study', params: {} });
  assert.deepEqual(parseHash('#/study/safety?deal=123'), { path: '/study/safety', params: { deal: '123' } });
  assert.deepEqual(parseHash('#/study/safety?example=open-hook&x=a%20b'), { path: '/study/safety', params: { example: 'open-hook', x: 'a b' } });
  assert.deepEqual(parseHash('#/table/'), { path: '/table', params: {} });
});
test('matchRoute: every row of the route table; unknown routes go home and are not known', () => {
  assert.deepEqual(['', '#', '#/', '#/study', '#/study/safety', '#/study/safety?deal=5', '#/study/safety?example=rail-tuck', '#/table'].map((h) => matchRoute(h).screen),
    ['home', 'home', 'home', 'study', 'safety', 'safety', 'safety', 'table']);
  assert.deepEqual(matchRoute('#/study/safety?deal=5'), { screen: 'safety', params: { deal: '5' }, known: true });
  for (const h of ['#/nope', '#study', '#/study/escape', '#/tablex']) assert.deepEqual(matchRoute(h), { screen: 'home', params: {}, known: false });
});
test('safetyMode: deal must be digits, deal beats example, an invalid deal is a missing layout', () => {
  assert.deepEqual(safetyMode({}), { mode: 'session' });
  assert.deepEqual(safetyMode({ deal: '85723992' }), { mode: 'deal', id: 85723992 });
  assert.deepEqual(safetyMode({ deal: '7', example: 'open-hook' }), { mode: 'deal', id: 7 });
  assert.deepEqual(safetyMode({ example: 'open-hook' }), { mode: 'example', slug: 'open-hook' });
  for (const d of ['', '12abc', '-3', '1.5', ' 4']) assert.deepEqual(safetyMode({ deal: d, example: 'open-hook' }), { mode: 'missing' });
});
test('RF2: malformed links never throw', () => {
  assert.deepEqual(parseHash('#/study/safety?deal=%E0%A4%A'), { path: '/study/safety', params: { deal: '%E0%A4%A' } });
  assert.deepEqual(parseHash('#/study/safety?deal'), { path: '/study/safety', params: { deal: '' } });
  assert.deepEqual(parseHash('#/study/safety?deal=1&deal=2'), { path: '/study/safety', params: { deal: '2' } });
  assert.deepEqual(parseHash('#/study/safety?&&a=1&q=b=c'), { path: '/study/safety', params: { a: '1', q: 'b=c' } });
});
