// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionStore } from '../src/ui/session-store.js';
import { createWakeLock } from '../src/ui/wake-lock.js';

function mapStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } };
}
function fakeEnv({ reject = false, supported = true } = {}) {
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const calls = { request: 0 };
  const sentinels = [];
  const nav = supported ? { wakeLock: { async request() {
    calls.request++;
    if (reject) throw new Error('denied');
    const s = Object.assign(new EventTarget(), { release() { s.dispatchEvent(new Event('release')); return Promise.resolve(); } });
    sentinels.push(s);
    return s;
  } } } : {};
  const reasons = [];
  const wl = createWakeLock({ nav: /** @type {any} */ (nav), doc: /** @type {any} */ (doc), onFallback: (r) => reasons.push(r) });
  return { doc, calls, sentinels, reasons, wl };
}

test('session survives refresh, clears, tolerates corrupt data and quota errors', () => {
  const st = mapStorage(), a = createSessionStore('table', { logs: [] }, { storage: st });
  a.save({ logs: ['Hooked'] }); assert.deepEqual(createSessionStore('table', { logs: [] }, { storage: st }).load(), { logs: ['Hooked'] });
  a.clear(); assert.deepEqual(createSessionStore('table', { logs: [] }, { storage: st }).load(), { logs: [] });
  st.setItem('runout-lab:session:table', '{bad'); assert.deepEqual(createSessionStore('table', { logs: [] }, { storage: st }).load(), { logs: [] });
  st.setItem('runout-lab:session:table', JSON.stringify({ v: 2, data: 1 })); assert.deepEqual(createSessionStore('table', { logs: [] }, { storage: st }).load(), { logs: [] });
  const q = createSessionStore('t', { n: 0 }, { storage: { getItem: () => null, setItem() { throw new Error('quota'); }, removeItem() {} } });
  assert.equal(q.save({ n: 3 }), false); assert.deepEqual(q.load(), { n: 3 });
  const init = { n: 0 }, s = createSessionStore('x', init, { storage: mapStorage() }); s.load().n = 9; assert.equal(init.n, 0);
});

test('wake lock: unsupported → fallback once', async () => {
  const { wl, reasons, calls } = fakeEnv({ supported: false });
  assert.equal(wl.supported, false);
  assert.equal(await wl.start(), false);
  assert.deepEqual(reasons, ['unsupported']);
  assert.equal(calls.request, 0);
  assert.equal(wl.held(), false);
});

test('wake lock: acquire, normal hide/show re-acquires with no tip', async () => {
  const { wl, doc, sentinels, calls, reasons } = fakeEnv();
  assert.equal(await wl.start(), true);
  assert.equal(wl.held(), true);
  doc.visibilityState = 'hidden';
  sentinels[0].dispatchEvent(new Event('release'));
  assert.deepEqual(reasons, []);
  assert.equal(wl.held(), false);
  doc.visibilityState = 'visible';
  doc.dispatchEvent(new Event('visibilitychange'));
  await new Promise((r) => setImmediate(r));
  assert.equal(calls.request, 2);
  assert.equal(wl.held(), true);
  assert.deepEqual(reasons, []);
});

test('wake lock: released while visible → tip; deduped', async () => {
  const { wl, doc, sentinels, reasons } = fakeEnv();
  await wl.start();
  sentinels[0].dispatchEvent(new Event('release'));
  assert.deepEqual(reasons, ['released']);
  doc.dispatchEvent(new Event('visibilitychange'));
  await new Promise((r) => setImmediate(r));
  assert.equal(wl.held(), true);
  sentinels[1].dispatchEvent(new Event('release'));
  assert.deepEqual(reasons, ['released']);
});

test('wake lock: request rejects → denied; stop removes listener', async () => {
  const { wl, doc, calls, reasons } = fakeEnv({ reject: true });
  assert.equal(await wl.start(), false);
  assert.deepEqual(reasons, ['denied']);
  assert.equal(calls.request, 1);
  await wl.stop();
  doc.dispatchEvent(new Event('visibilitychange'));
  await new Promise((r) => setImmediate(r));
  assert.equal(calls.request, 1);
});
