// @ts-check

/**
 * @param {number} x
 * @param {number} y
 * @returns {{x:number, y:number}}
 */
export function clampSpin(x, y) {
  const len = Math.hypot(x, y);
  if (len > 1) { x /= len; y /= len; }
  const r = (/** @type {number} */ v) => { const q = Math.round(v * 20) / 20; return q === 0 ? 0 : q; };
  return { x: r(x), y: r(y) };
}

/** @param {number} dx @param {number} dy @param {number} radius */
export function spinFromOffset(dx, dy, radius) {
  return clampSpin(dx / radius, -dy / radius);
}

/** @param {{x:number, y:number}} spin */
export function spinText(spin) {
  const parts = [];
  if (spin.y !== 0) parts.push(`${spin.y > 0 ? 'follow' : 'draw'} ${Math.abs(spin.y).toFixed(2)}`);
  if (spin.x !== 0) parts.push(`${spin.x > 0 ? 'right' : 'left'} ${Math.abs(spin.x).toFixed(2)}`);
  return parts.length ? parts.join(' · ') : 'center';
}

/**
 * @param {{x:number, y:number}} spin
 * @param {string} key
 * @returns {{x:number, y:number}|null}
 */
export function spinKey(spin, key) {
  if (key === 'ArrowUp') return clampSpin(spin.x, spin.y + 0.1);
  if (key === 'ArrowDown') return clampSpin(spin.x, spin.y - 0.1);
  if (key === 'ArrowRight') return clampSpin(spin.x + 0.1, spin.y);
  if (key === 'ArrowLeft') return clampSpin(spin.x - 0.1, spin.y);
  if (key === '0' || key === 'Home') return { x: 0, y: 0 };
  return null;
}

const PAD_RADIUS = 48;
const TIP = 12;

/**
 * @param {HTMLElement} container
 * @param {{onChange: (spin: {x:number, y:number}) => void}} opts
 */
export function createSpinPad(container, opts) {
  let spin = { x: 0, y: 0 };
  let disabled = false;
  const root = document.createElement('div');
  root.className = 'spin';
  const pad = document.createElement('div');
  pad.className = 'spin-pad';
  pad.tabIndex = 0;
  pad.setAttribute('role', 'group');
  pad.setAttribute('aria-label', 'Cue tip position');
  const tip = document.createElement('div');
  tip.className = 'spin-tip';
  pad.appendChild(tip);
  const label = document.createElement('div');
  label.className = 'spin-label';
  label.setAttribute('aria-live', 'polite');
  root.append(pad, label);

  function show() {
    tip.style.left = `${PAD_RADIUS + spin.x * PAD_RADIUS - TIP / 2}px`;
    tip.style.top = `${PAD_RADIUS - spin.y * PAD_RADIUS - TIP / 2}px`;
    label.textContent = spinText(spin);
  }
  /** @param {{x:number, y:number}} s */
  function user(s) {
    spin = s;
    show();
    opts.onChange(spin);
  }
  /** @param {PointerEvent} e */
  function fromPointer(e) {
    const r = pad.getBoundingClientRect();
    user(spinFromOffset(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2), r.width / 2));
  }
  /** @param {PointerEvent} e */
  const onDown = (e) => {
    if (disabled) return;
    pad.setPointerCapture?.(e.pointerId);
    fromPointer(e);
  };
  /** @param {PointerEvent} e */
  const onMove = (e) => {
    if (disabled || !pad.hasPointerCapture?.(e.pointerId)) return;
    fromPointer(e);
  };
  /** @param {KeyboardEvent} e */
  const onKey = (e) => {
    if (disabled) return;
    const s = spinKey(spin, e.key);
    if (!s) return;
    e.preventDefault();
    user(s);
  };
  pad.addEventListener('pointerdown', onDown);
  pad.addEventListener('pointermove', onMove);
  pad.addEventListener('keydown', onKey);
  show();
  container.appendChild(root);

  return {
    get: () => spin,
    /** @param {{x:number, y:number}} s */
    set(s) { spin = { x: s.x, y: s.y }; show(); },
    /** @param {boolean} b */
    setDisabled(b) {
      disabled = b;
      pad.setAttribute('aria-disabled', String(b));
      pad.tabIndex = b ? -1 : 0;
    },
    destroy() {
      pad.removeEventListener('pointerdown', onDown);
      pad.removeEventListener('pointermove', onMove);
      pad.removeEventListener('keydown', onKey);
      root.remove();
    },
  };
}
