// @ts-check
/** @typedef {import('./table-view.js').Scene} Scene */

export const TRACE_CUE = '#54b6d6';
export const TRACE_OTHER = 'rgba(231,162,62,0.5)';

/**
 * @param {{trajectories: Record<string, {t:number,x:number,y:number}[]>}} sim
 * @param {number} t
 * @returns {Record<string, {x:number,y:number}>}
 */
export function positionsAt(sim, t) {
  /** @type {Record<string, {x:number,y:number}>} */
  const out = {};
  for (const id of Object.keys(sim.trajectories)) {
    const tr = sim.trajectories[id];
    if (t < tr[0].t) { out[id] = { x: tr[0].x, y: tr[0].y }; continue; }
    let lo = 0, hi = tr.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (tr[mid].t <= t) lo = mid; else hi = mid - 1;
    }
    const s = tr[lo];
    if (lo === tr.length - 1 || s.t === t) { out[id] = { x: s.x, y: s.y }; continue; }
    const n = tr[lo + 1], f = (t - s.t) / (n.t - s.t);
    out[id] = { x: s.x + f * (n.x - s.x), y: s.y + f * (n.y - s.y) };
  }
  return out;
}

/**
 * @param {{trajectories: Record<string, unknown>, events: {t:number,type:string,a?:string}[]}} sim
 * @param {number} t
 * @returns {string[]}
 */
export function visibleAt(sim, t) {
  const gone = new Set();
  for (const ev of sim.events) if (ev.type === 'pocket' && ev.t <= t) gone.add(ev.a);
  return Object.keys(sim.trajectories).filter((id) => !gone.has(id));
}

/**
 * @param {{trajectories: Record<string, {t:number,x:number,y:number}[]>}} sim
 * @param {string} id
 * @param {number} t
 * @returns {{x:number,y:number}[]}
 */
export function traceAt(sim, id, t) {
  const pts = sim.trajectories[id].filter((s) => s.t < t).map((s) => ({ x: s.x, y: s.y }));
  pts.push(positionsAt(sim, t)[id]);
  return pts;
}

/**
 * @param {{trajectories: Record<string, {t:number,x:number,y:number}[]>}} sim
 * @returns {string[]}
 */
export function movedIds(sim) {
  return Object.keys(sim.trajectories).filter((id) => {
    const tr = sim.trajectories[id];
    return tr.some((s) => s.x !== tr[0].x || s.y !== tr[0].y);
  });
}

/**
 * @param {any} sim
 * @param {number} t
 * @param {{colours: Record<string,string>, labels: Record<string,string>, cueId: string}} base
 * @returns {Scene}
 */
export function sceneAt(sim, t, base) {
  const pos = positionsAt(sim, t);
  const moved = movedIds(sim);
  const order = [...moved.filter((id) => id === base.cueId), ...moved.filter((id) => id !== base.cueId)];
  return {
    balls: visibleAt(sim, t).map((id) => ({ id, x: pos[id].x, y: pos[id].y })),
    colours: base.colours,
    labels: base.labels,
    traces: order.map((id) => ({ id, pts: traceAt(sim, id, t), colour: id === base.cueId ? TRACE_CUE : TRACE_OTHER })),
    ghosts: moved.map((id) => ({ x: sim.trajectories[id][0].x, y: sim.trajectories[id][0].y })),
  };
}

/**
 * @param {{draw: (scene: Scene) => void}} view
 * @param {any} sim
 * @param {{colours: Record<string,string>, labels: Record<string,string>, cueId: string}} base
 * @param {{onDone: () => void, reducedMotion?: boolean}} opts
 * @returns {{skip: () => void, cancel: () => void}}
 */
export function play(view, sim, base, opts) {
  const reduced = opts.reducedMotion ?? matchMedia('(prefers-reduced-motion: reduce)').matches;
  let done = false, stopped = false, raf = 0;
  const finish = () => {
    view.draw(sceneAt(sim, sim.duration, base));
    if (!done) { done = true; opts.onDone(); }
  };
  if (reduced) {
    view.draw(sceneAt(sim, sim.duration, base));
    queueMicrotask(() => { if (!stopped && !done) { done = true; opts.onDone(); } });
  } else {
    const t0 = performance.now();
    const frame = (/** @type {number} */ now) => {
      if (stopped) return;
      const t = (now - t0) / 1000;
      if (t >= sim.duration) { stopped = true; finish(); return; }
      view.draw(sceneAt(sim, t, base));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  }
  return {
    skip() {
      if (done) return;
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      finish();
    },
    cancel() {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
    },
  };
}
