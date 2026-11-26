// @ts-check

export const SPEED_MIN_UI = 8;
export const SPEED_MAX_UI = 130;
export const SPEED_DEFAULT = 40;

/** @param {number} v */
export function clampSpeed(v) {
  return Math.min(SPEED_MAX_UI, Math.max(SPEED_MIN_UI, v));
}

/** @param {number} v */
export function speedWord(v) {
  if (v < 25) return 'soft';
  if (v < 60) return 'medium';
  if (v < 95) return 'firm';
  return 'hard';
}

/** @param {number} v */
export function speedText(v) {
  const n = Math.round(v);
  return `${n} in/s · ${speedWord(n)}`;
}

/** @param {number} v @param {1|-1} dir */
export function stepSpeed(v, dir) {
  return clampSpeed(Math.round(v) + dir);
}

/**
 * @param {HTMLElement} container
 * @param {{onChange: (v: number) => void}} opts
 */
export function createSpeedControl(container, opts) {
  let value = SPEED_DEFAULT;
  const root = document.createElement('div');
  root.className = 'speed';
  root.innerHTML =
    '<div class="speed-row">' +
    '<button type="button" class="speed-btn" data-dir="-1" aria-label="Slower">&minus;</button>' +
    '<input type="range" min="8" max="130" step="1" aria-label="Speed">' +
    '<button type="button" class="speed-btn" data-dir="1" aria-label="Faster">+</button>' +
    '</div><output class="speed-out" aria-live="polite"></output>';
  const input = /** @type {HTMLInputElement} */ (root.querySelector('input'));
  const out = /** @type {HTMLOutputElement} */ (root.querySelector('output'));
  const buttons = /** @type {HTMLButtonElement[]} */ ([...root.querySelectorAll('button')]);

  function show() {
    input.value = String(Math.round(value));
    out.textContent = speedText(value);
  }
  /** @param {number} v */
  function user(v) {
    value = clampSpeed(v);
    show();
    opts.onChange(value);
  }
  const onInput = () => user(Number(input.value));
  input.addEventListener('input', onInput);
  /** @type {[HTMLButtonElement, () => void][]} */
  const handlers = buttons.map((b) => {
    const h = () => user(stepSpeed(value, /** @type {1|-1} */ (Number(b.dataset.dir))));
    b.addEventListener('click', h);
    return [b, h];
  });
  show();
  container.appendChild(root);

  return {
    get: () => value,
    /** @param {number} v */
    set(v) { value = clampSpeed(v); show(); },
    /** @param {boolean} b */
    setDisabled(b) {
      input.disabled = b;
      for (const btn of buttons) btn.disabled = b;
    },
    destroy() {
      input.removeEventListener('input', onInput);
      for (const [b, h] of handlers) b.removeEventListener('click', h);
      root.remove();
    },
  };
}
