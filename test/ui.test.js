// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionStore } from '../src/ui/session-store.js';
import { createWakeLock } from '../src/ui/wake-lock.js';

function mapStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } };
}
function fakeEnv({ reject = false, supported = true, defer = false } = {}) {
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const calls = { request: 0, released: 0 };
  const sentinels = [];
  const deferred = [];
  const nav = supported ? { wakeLock: { async request() {
    calls.request++;
    if (reject) throw new Error('denied');
    const s = Object.assign(new EventTarget(), { release() { calls.released++; s.dispatchEvent(new Event('release')); return Promise.resolve(); } });
    sentinels.push(s);
    if (defer) return new Promise((res) => deferred.push(() => res(s)));
    return s;
  } } } : {};
  const reasons = [];
  const wl = createWakeLock({ nav: /** @type {any} */ (nav), doc: /** @type {any} */ (doc), onFallback: (r) => reasons.push(r) });
  return { doc, calls, sentinels, reasons, wl, deferred };
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

test('wake lock: request rejects → denied; no re-request after stop', async () => {
  const { wl, doc, calls, reasons } = fakeEnv({ reject: true });
  assert.equal(await wl.start(), false);
  assert.deepEqual(reasons, ['denied']);
  assert.equal(calls.request, 1);
  await wl.stop();
  doc.dispatchEvent(new Event('visibilitychange'));
  await new Promise((r) => setImmediate(r));
  assert.equal(calls.request, 1);
});

const tick = () => new Promise((r) => setImmediate(r));

test('wake lock: stop removes the visibilitychange listener', async () => {
  const { wl, doc } = fakeEnv();
  const added = [], removed = [];
  const a = doc.addEventListener.bind(doc), r = doc.removeEventListener.bind(doc);
  doc.addEventListener = (t, f) => { added.push([t, f]); a(t, f); };
  doc.removeEventListener = (t, f) => { removed.push([t, f]); r(t, f); };
  await wl.start(); await wl.stop();
  assert.equal(added.length, 1); assert.equal(added[0][0], 'visibilitychange');
  assert.deepEqual(removed, added);
});

test('wake lock: stop while held releases the sentinel, no tip', async () => {
  const { wl, calls, reasons } = fakeEnv();
  await wl.start(); assert.equal(wl.held(), true);
  await wl.stop();
  assert.equal(wl.held(), false); assert.equal(calls.released, 1); assert.deepEqual(reasons, []);
});

test('wake lock: stop while request in flight does not leak the lock', async () => {
  const { wl, calls, reasons, deferred, sentinels } = fakeEnv({ defer: true });
  const p = wl.start();
  await tick(); assert.equal(calls.request, 1);
  await wl.stop();
  deferred[0]();
  assert.equal(await p, false);
  await tick();
  assert.equal(wl.held(), false); assert.equal(calls.released, 1); assert.equal(sentinels.length, 1); assert.deepEqual(reasons, []);
});

test('wake lock: back-to-back visible events issue one request', async () => {
  const { wl, doc, calls, deferred } = fakeEnv({ defer: true });
  const p = wl.start();
  await tick();
  doc.dispatchEvent(new Event('visibilitychange')); doc.dispatchEvent(new Event('visibilitychange'));
  await tick();
  assert.equal(calls.request, 1);
  deferred[0](); assert.equal(await p, true);
  assert.equal(calls.request, 1); assert.equal(wl.held(), true);
});

test('wake lock: start when already held does not orphan the sentinel', async () => {
  const { wl, calls } = fakeEnv();
  await wl.start();
  assert.equal(await wl.start(), true);
  assert.equal(calls.request, 1); assert.equal(wl.held(), true);
});

test('wake lock: start resets dedupe so a second session can signal again', async () => {
  const { wl, sentinels, reasons } = fakeEnv();
  await wl.start(); sentinels[0].dispatchEvent(new Event('release'));
  assert.deepEqual(reasons, ['released']);
  await wl.stop();
  await wl.start(); sentinels[1].dispatchEvent(new Event('release'));
  assert.deepEqual(reasons, ['released', 'released']);
});

test('wake lock: start while hidden returns false, acquires on next visible', async () => {
  const { wl, doc, calls, reasons } = fakeEnv();
  doc.visibilityState = 'hidden';
  assert.equal(await wl.start(), false);
  assert.equal(calls.request, 0); assert.deepEqual(reasons, []);
  doc.visibilityState = 'visible'; doc.dispatchEvent(new Event('visibilitychange'));
  await tick();
  assert.equal(calls.request, 1); assert.equal(wl.held(), true);
});

test('session: throwing getItem/removeItem tolerated', () => {
  const st = { getItem() { throw new Error('x'); }, setItem() {}, removeItem() { throw new Error('y'); } };
  const s = createSessionStore('t', { n: 1 }, { storage: st });
  assert.deepEqual(s.load(), { n: 1 });
  assert.doesNotThrow(() => s.clear());
});

test('session: load returns clones from memory and from storage', () => {
  const st = mapStorage(), a = createSessionStore('c', { n: 0 }, { storage: st });
  a.save({ n: 5 });
  a.load().n = 99; assert.deepEqual(a.load(), { n: 5 });
  const b = createSessionStore('c', { n: 0 }, { storage: st });
  b.load().n = 99; assert.deepEqual(b.load(), { n: 5 });
});

test('session: throwing localStorage getter degrades to memory-only', () => {
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
  try {
    const s = createSessionStore('g', { n: 0 });
    assert.deepEqual(s.load(), { n: 0 });
    assert.equal(s.save({ n: 4 }), false);
    assert.deepEqual(s.load(), { n: 4 });
    assert.doesNotThrow(() => s.clear());
    assert.deepEqual(s.load(), { n: 0 });
  } finally {
    if (desc) Object.defineProperty(globalThis, 'localStorage', desc); else delete globalThis.localStorage;
  }
});
