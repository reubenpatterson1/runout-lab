// @ts-check
import { R } from '../engine/constants.js';
import { POCKETS, JAWS } from '../engine/table.js';

export const RAIL_IN = 5;

/**
 * @typedef {{x:number,y:number}} Pt
 * @typedef {import('../types.js').Ball} Ball
 * @typedef {{balls: Ball[], colours: Record<string,string>, labels: Record<string,string>, aim?: {from:{x:number,y:number}, to:{x:number,y:number}, ghost:{x:number,y:number}|null}, handle?: {x:number,y:number}, traces?: {id:string, pts:{x:number,y:number}[], colour:string}[], ghosts?: {x:number,y:number}[], highlight?: string[]}} Scene
 */

const BALLCOL = ['#e9c63b', '#2f6fb0', '#cf4631', '#6e44a0', '#e2872d', '#2f8f5b', '#7c3a32', '#141414'];

/** @param {number} cssWidth */
export function viewTransform(cssWidth) {
  const pxPerIn = cssWidth / 110;
  return {
    pxPerIn,
    cssHeight: 60 * pxPerIn,
    /** @param {Pt} p */
    toScreen: (p) => ({ x: (p.x + RAIL_IN) * pxPerIn, y: (p.y + RAIL_IN) * pxPerIn }),
    /** @param {number} x @param {number} y */
    toTable: (x, y) => ({ x: x / pxPerIn - RAIL_IN, y: y / pxPerIn - RAIL_IN }),
  };
}

/** @param {number} pxPerIn */
export function ballRadiusPx(pxPerIn) {
  return Math.max(R * pxPerIn, 3.5);
}

/** @param {string} id */
function ballNum(id) {
  if (!/^\d+$/.test(id)) return 0;
  const n = Number(id);
  return n >= 1 && n <= 15 ? n : 0;
}

/** @param {string} id */
export function ballColour(id) {
  if (id === 'cue') return '#f2eedd';
  if (id === 'ob') return '#cf4631';
  if (/^b\d+$/.test(id)) return '#2f6fb0';
  const n = ballNum(id);
  if (n) return BALLCOL[(n > 8 ? n - 8 : n) - 1];
  return '#2f6fb0';
}

/** @param {string} id */
export function ballStriped(id) {
  return ballNum(id) >= 9;
}

/** @param {string} id */
export function ballLabel(id) {
  return ballNum(id) ? id : '';
}

/** @param {Ball[]} balls */
export function ballStyles(balls) {
  /** @type {Record<string,string>} */ const colours = {};
  /** @type {Record<string,string>} */ const labels = {};
  for (const b of balls) { colours[b.id] = ballColour(b.id); labels[b.id] = ballLabel(b.id); }
  return { colours, labels };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y @param {number} w @param {number} h @param {number} r
 */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** @param {HTMLCanvasElement} canvas */
export function createTableView(canvas) {
  /** @type {ReturnType<typeof viewTransform>} */
  let view = viewTransform(canvas.clientWidth || 110);
  /** @type {HTMLCanvasElement|null} */
  let base = null;
  /** @type {Scene|null} */
  let last = null;
  let dpr = 1;

  function buildBase() {
    const cssW = canvas.clientWidth || 110;
    view = viewTransform(cssW);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pw = Math.round(cssW * dpr), ph = Math.round(view.cssHeight * dpr);
    canvas.width = pw; canvas.height = ph;
    base = document.createElement('canvas');
    base.width = pw; base.height = ph;
    const g = /** @type {CanvasRenderingContext2D} */ (base.getContext('2d'));
    const k = view.pxPerIn;
    g.scale(dpr, dpr);
    g.fillStyle = '#1c140c';
    roundRect(g, 0, 0, cssW, view.cssHeight, 2.5 * k);
    g.fill();
    const tl = view.toScreen({ x: 0, y: 0 });
    const gr = g.createLinearGradient(0, tl.y, 0, tl.y + 50 * k);
    gr.addColorStop(0, '#19543a'); gr.addColorStop(0.5, '#14442f'); gr.addColorStop(1, '#0e3322');
    g.fillStyle = gr;
    g.fillRect(tl.x, tl.y, 100 * k, 50 * k);
    g.fillStyle = 'rgba(236,210,138,.85)';
    /** @param {number} x @param {number} y */
    const diamond = (x, y) => {
      const s = view.toScreen({ x, y });
      g.save(); g.translate(s.x, s.y); g.rotate(Math.PI / 4);
      g.fillRect(-0.6 * k, -0.6 * k, 1.2 * k, 1.2 * k);
      g.restore();
    };
    for (let i = 1; i <= 7; i++) {
      if (i === 4) continue;
      diamond(12.5 * i, -2.5); diamond(12.5 * i, 52.5);
    }
    for (let i = 1; i <= 3; i++) { diamond(-2.5, 12.5 * i); diamond(102.5, 12.5 * i); }
    g.fillStyle = '#05100a';
    for (const p of POCKETS) {
      const a = JAWS[p.jaws[0]], b = JAWS[p.jaws[1]];
      const c = view.toScreen({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      g.beginPath();
      g.arc(c.x, c.y, Math.hypot(a.x - b.x, a.y - b.y) / 2 * k, 0, Math.PI * 2);
      g.fill();
    }
  }

  /** @param {Scene} scene */
  function draw(scene) {
    last = scene;
    if (!base) buildBase();
    const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(/** @type {HTMLCanvasElement} */ (base), 0, 0);
    ctx.scale(dpr, dpr);
    const r = ballRadiusPx(view.pxPerIn);
    for (const gp of scene.ghosts ?? []) {
      const s = view.toScreen(gp);
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(137,147,137,.6)'; ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
    }
    for (const t of scene.traces ?? []) {
      if (!t.pts.length) continue;
      ctx.beginPath();
      t.pts.forEach((p, i) => { const s = view.toScreen(p); if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y); });
      ctx.strokeStyle = t.colour; ctx.lineWidth = 1.5; ctx.stroke();
    }
    if (scene.aim) {
      const f = view.toScreen(scene.aim.from), t = view.toScreen(scene.aim.to);
      ctx.strokeStyle = 'rgba(236,231,214,.75)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(t.x, t.y); ctx.stroke();
      if (scene.aim.ghost) {
        const gs = view.toScreen(scene.aim.ghost);
        ctx.beginPath(); ctx.arc(gs.x, gs.y, r, 0, Math.PI * 2); ctx.stroke();
      }
    }
    for (const b of scene.balls) {
      const s = view.toScreen(b);
      const colour = scene.colours[b.id] ?? '#2f6fb0';
      const striped = ballStriped(b.id);
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fillStyle = striped ? '#ffffff' : colour; ctx.fill();
      if (striped) {
        ctx.save(); ctx.clip();
        ctx.fillStyle = colour;
        ctx.fillRect(s.x - r, s.y - 0.55 * r, 2 * r, 1.1 * r);
        ctx.restore();
      }
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1; ctx.stroke();
      const label = scene.labels[b.id];
      if (label && r >= 7) {
        ctx.beginPath(); ctx.arc(s.x, s.y, 0.55 * r, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff'; ctx.fill();
        ctx.fillStyle = '#141414';
        ctx.font = `bold ${r}px "Space Mono", monospace`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(label, s.x, s.y);
      }
    }
    for (const id of scene.highlight ?? []) {
      const b = scene.balls.find((q) => q.id === id);
      if (!b) continue;
      const s = view.toScreen(b);
      ctx.beginPath(); ctx.arc(s.x, s.y, r + 2, 0, Math.PI * 2);
      ctx.strokeStyle = '#ecd28a'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    if (scene.handle) {
      const s = view.toScreen(scene.handle);
      ctx.beginPath(); ctx.arc(s.x, s.y, 9, 0, Math.PI * 2);
      ctx.fillStyle = '#ecd28a'; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 2; ctx.stroke();
    }
  }

  const ro = new ResizeObserver(() => {
    buildBase();
    if (last) draw(last);
  });
  ro.observe(canvas);

  return {
    draw,
    /** @param {number} clientX @param {number} clientY */
    toTable(clientX, clientY) {
      const rc = canvas.getBoundingClientRect();
      return view.toTable(clientX - rc.left, clientY - rc.top);
    },
    /** @param {Pt} p */
    toScreen: (p) => view.toScreen(p),
    get pxPerIn() { return view.pxPerIn; },
    destroy() { ro.disconnect(); },
  };
}
