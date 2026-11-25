// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeHandlers } from '../src/sw-core.js';
import { registerServiceWorker } from '../src/sw-register.js';

/** Map-backed CacheStorage; each cache is a Map url -> Response and records addAll Requests. */
function fakeCaches(names = []) {
  const store = new Map();
  const addedBy = new Map();
  const mkCache = (name) => {
    const m = new Map();
    addedBy.set(name, []);
    return Object.assign(m, {
      async addAll(reqs) { for (const r of reqs) { addedBy.get(name).push(r); m.set(r.url, new Response('pre:' + r.url)); } },
      async match(req) { return m.get(typeof req === 'string' ? req : req.url); },
      async put(req, res) { m.set(typeof req === 'string' ? req : req.url, res); },
    });
  };
  for (const n of names) store.set(n, mkCache(n));
  return {
    async open(n) { if (!store.has(n)) store.set(n, mkCache(n)); return store.get(n); },
    async keys() { return [...store.keys()]; },
    async delete(n) { return store.delete(n); },
    added: (n) => addedBy.get(n) ?? [],
  };
}
const base = 'https://x.test/app/sw.js', origin = 'https://x.test';
const mk = (caches, fetch = async () => new Response('net')) => makeHandlers({ version: 7, files: ['./', 'index.html'], prefix: 'runout-lab-v', base, origin, caches, fetch, skipWaiting() {}, claim: async () => {} });

/** nav on EventTarget; register resolves reg (or rejects). */
function fakeNav({ controller, reg, reject = false }) {
  const sw = /** @type {any} */ (new EventTarget());
  sw.controller = controller;
  sw.register = async () => { if (reject) throw new Error('nope'); return reg; };
  return { nav: /** @type {any} */ ({ serviceWorker: sw }), sw };
}
const fakeReg = (waiting = null) => Object.assign(new EventTarget(), { waiting, installing: null });

test('install precaches every file with cache:reload into runout-lab-v7', async () => {
  const c = fakeCaches(); await mk(c).install();
  const reqs = c.added('runout-lab-v7');
  assert.deepEqual(reqs.map((r) => r.url), ['https://x.test/app/', 'https://x.test/app/index.html']);
  assert.ok(reqs.every((r) => r.cache === 'reload'));
});
test('RF5 activate deletes old versioned caches only', async () => {
  const c = fakeCaches(['runout-lab-v6', 'runout-lab-v7', 'other']); await mk(c).activate();
  assert.deepEqual(await c.keys(), ['runout-lab-v7', 'other']);
});
test('respond: cache-first, GET same-origin only, navigate offline falls back to index.html', async () => {
  const c = fakeCaches();
  const cache = await c.open('runout-lab-v7');
  await cache.put('https://x.test/app/index.html', new Response('INDEX'));
  await cache.put('https://x.test/app/hit', new Response('HIT'));
  let calls = 0;
  const h = mk(c, async () => { calls++; return new Response('net'); });
  const hit = await h.respond(new Request('https://x.test/app/hit'));
  assert.equal(await hit.text(), 'HIT'); assert.equal(calls, 0);
  const miss = await h.respond(new Request('https://x.test/app/miss'));
  assert.equal(await miss.text(), 'net'); assert.equal(calls, 1);
  assert.equal(h.respond(new Request('https://x.test/app/hit', { method: 'POST' })), null);
  assert.equal(h.respond(new Request('https://other.test/app/hit')), null);
  const off = mk(c, async () => { throw new TypeError('offline'); });
  const nav = await off.respond(/** @type {any} */ ({ method: 'GET', url: 'https://x.test/app/other', mode: 'navigate' }));
  assert.equal(await nav.text(), 'INDEX');
  await assert.rejects(off.respond(new Request('https://x.test/app/miss')), TypeError);
});
test('RF5 waiting worker at load → update signal → SKIP_WAITING → exactly one reload', async () => {
  const posted = [];
  const { nav, sw } = fakeNav({ controller: {}, reg: fakeReg({ postMessage: (m) => posted.push(m) }) });
  let applyFn = null, signals = 0, reloads = 0;
  const reg = await registerServiceWorker({ nav, onUpdateReady: (a) => { signals++; applyFn = a; }, reload: () => { reloads++; } });
  assert.ok(reg);
  assert.equal(signals, 1); assert.deepEqual(posted, []);
  applyFn();
  assert.deepEqual(posted, [{ type: 'SKIP_WAITING' }]);
  sw.dispatchEvent(new Event('controllerchange')); sw.dispatchEvent(new Event('controllerchange'));
  assert.equal(reloads, 1);
});
test('RF5 controllerchange without apply does not reload; first install (no controller) does not signal', async () => {
  let reloads = 0, signals = 0;
  const a = fakeNav({ controller: {}, reg: fakeReg({ postMessage() {} }) });
  await registerServiceWorker({ nav: a.nav, onUpdateReady: () => { signals++; }, reload: () => { reloads++; } });
  a.sw.dispatchEvent(new Event('controllerchange'));
  assert.equal(signals, 1); assert.equal(reloads, 0);

  let s2 = 0;
  const reg = fakeReg({ postMessage() {} });
  const b = fakeNav({ controller: null, reg });
  await registerServiceWorker({ nav: b.nav, onUpdateReady: () => { s2++; }, reload: () => {} });
  const installing = Object.assign(new EventTarget(), { state: 'installing' });
  reg.installing = installing; reg.dispatchEvent(new Event('updatefound'));
  installing.state = 'installed'; installing.dispatchEvent(new Event('statechange'));
  assert.equal(s2, 0);
});
test('RF5 updatefound → installed with controller → signal', async () => {
  const reg = fakeReg();
  const { nav } = fakeNav({ controller: {}, reg });
  let signals = 0;
  await registerServiceWorker({ nav, onUpdateReady: () => { signals++; }, reload: () => {} });
  assert.equal(signals, 0);
  const installing = Object.assign(new EventTarget(), { state: 'installing', postMessage() {} });
  reg.installing = installing; reg.dispatchEvent(new Event('updatefound'));
  installing.dispatchEvent(new Event('statechange')); assert.equal(signals, 0);
  installing.state = 'installed'; installing.dispatchEvent(new Event('statechange'));
  assert.equal(signals, 1);
});
test('no serviceWorker support or register rejection resolves null', async () => {
  assert.equal(await registerServiceWorker({ nav: /** @type {any} */ ({}), onUpdateReady() {} }), null);
  const { nav } = fakeNav({ controller: null, reg: null, reject: true });
  assert.equal(await registerServiceWorker({ nav, onUpdateReady() {} }), null);
});
