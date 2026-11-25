// @ts-check
import { createHandler } from './handle.js';
const handle = createHandler(async () => {
  const t0 = performance.now(); const res = await fetch(new URL('../../data/safety-bank.json', import.meta.url));
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const text = await res.text(); const t1 = performance.now(); const bank = JSON.parse(text);
  return { bank, timing: { fetchMs: t1 - t0, parseMs: performance.now() - t1 } };
});
self.onmessage = async (e) => { self.postMessage(await handle(e.data)); };
