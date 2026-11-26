// @ts-check

/** @param {string} s */
function decode(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

/**
 * @param {string} hash
 * @returns {{path: string, params: Record<string,string>}}
 */
export function parseHash(hash) {
  let h = hash.startsWith('#') ? hash.slice(1) : hash;
  const q = h.indexOf('?');
  let query = '';
  if (q >= 0) { query = h.slice(q + 1); h = h.slice(0, q); }
  let path = h === '' ? '/' : h;
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  /** @type {Record<string,string>} */
  const params = {};
  for (const part of query.split('&')) {
    if (part === '') continue;
    const i = part.indexOf('=');
    const k = i < 0 ? part : part.slice(0, i);
    const v = i < 0 ? '' : part.slice(i + 1);
    params[decode(k)] = decode(v);
  }
  return { path, params };
}

/** @type {Record<string, 'home'|'study'|'safety'|'table'>} */
const ROUTES = { '/': 'home', '/study': 'study', '/study/safety': 'safety', '/table': 'table' };

/**
 * @param {string} hash
 * @returns {{screen: 'home'|'study'|'safety'|'table', params: Record<string,string>, known: boolean}}
 */
export function matchRoute(hash) {
  const { path, params } = parseHash(hash);
  const screen = Object.hasOwn(ROUTES, path) ? ROUTES[path] : null;
  if (!screen) return { screen: 'home', params: {}, known: false };
  return { screen, params, known: true };
}

/**
 * @param {Record<string,string>} params
 * @returns {{mode: 'session'} | {mode: 'deal', id: number} | {mode: 'example', slug: string} | {mode: 'missing'}}
 */
export function safetyMode(params) {
  if (params.deal !== undefined) {
    return /^\d+$/.test(params.deal) ? { mode: 'deal', id: Number(params.deal) } : { mode: 'missing' };
  }
  if (params.example !== undefined) return { mode: 'example', slug: params.example };
  return { mode: 'session' };
}
