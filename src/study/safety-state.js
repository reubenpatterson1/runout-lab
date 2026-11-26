// @ts-check
import { validSession } from './safety-session.js';

/** @typedef {'enabled'|'disabled'|'hidden'} Vis */
/** @typedef {{mode: 'session'|'single', phase: 'aiming'|'result'|'editing', pending: null|'replay'|'search'|'load', scored: boolean, noAlt: boolean, last: boolean, edited: boolean, hintShot: boolean}} Ctx */

const KEYS = ['aim', 'shoot', 'newLayout', 'next', 'startSession', 'retry', 'hint', 'tryShot', 'moveBalls', 'restore', 'done', 'skip', 'cancel'];

/**
 * @param {Ctx} ctx
 * @returns {Record<string, Vis> & {nextLabel: 'Next layout'|'Finish session'}}
 */
export function controlState(ctx) {
  /** @type {Record<string, Vis>} */
  const s = Object.fromEntries(KEYS.map((k) => [k, 'hidden']));
  const session = ctx.mode === 'session';
  if (ctx.phase === 'aiming') {
    s.aim = 'enabled';
    s.shoot = 'enabled';
    if (session && !ctx.scored) s.newLayout = ctx.noAlt ? 'disabled' : 'enabled';
    if (session && ctx.scored) s.next = 'enabled';
    if (!session) s.startSession = 'enabled';
    if (!session || ctx.scored) s.moveBalls = 'enabled';
    if (ctx.edited) s.restore = 'enabled';
  } else if (ctx.phase === 'result') {
    s.retry = 'enabled';
    s.hint = 'enabled';
    if (ctx.hintShot) s.tryShot = 'enabled';
    if (session) s.next = 'enabled';
    if (!session || ctx.scored) s.moveBalls = 'enabled';
    if (ctx.edited) s.restore = 'enabled';
  } else {
    s.done = 'enabled';
    if (ctx.edited) s.restore = 'enabled';
  }
  if (ctx.pending !== null) {
    for (const k of KEYS) if (s[k] === 'enabled') s[k] = 'disabled';
    if (ctx.pending === 'replay') s.skip = 'enabled';
    if (ctx.pending === 'search') s.cancel = 'enabled';
  }
  return /** @type {any} */ ({ ...s, nextLabel: ctx.last ? 'Finish session' : 'Next layout' });
}

/**
 * @param {unknown} stored
 * @returns {{kind: 'new'} | {kind: 'summary'} | {kind: 'deal'} | {kind: 'load', id: number}}
 */
export function openAction(stored) {
  if (!validSession(stored)) return { kind: 'new' };
  const s = /** @type {import('./safety-session.js').SafetySession} */ (stored);
  if (s.done) return { kind: 'summary' };
  if (s.slots.length === s.slot) return { kind: 'deal' };
  return { kind: 'load', id: s.slots[s.slot].id };
}
