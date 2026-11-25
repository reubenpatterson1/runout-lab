// @ts-check
import { simulate } from '../engine/simulate.js';
import { scorePosition } from './position.js';

/** @type {{speedF: number, aimOff: number}[]} */
export const ROBUST_GRID = [];
for (const speedF of [0.92, 1, 1.08]) for (const aimOff of [-0.4, 0, 0.4]) ROBUST_GRID.push({ speedF, aimOff });

/**
 * @param {import('../types.js').SimResult} sim
 * @param {import('../types.js').Layout} layout
 * @returns {import('../types.js').Gate|null}
 */
export function gateFor(sim, layout) {
  if (sim.scratch) return 'scratch';
  if (sim.firstContactId === null || !layout.rules.legalIds.includes(sim.firstContactId)) return 'wrong-ball-first';
  if (sim.pocketed.some((id) => id !== layout.cueId)) return 'ob-pocketed';
  if (sim.railsAfterContact === 0) return 'no-rail';
  return null;
}

/**
 * Ids in layout order. 9-ball invariant: legalIds = [lowest id] and ids are numeric strings
 * (the dealer must satisfy this; the opponent then targets the lowest ball left after the shot).
 * @param {import('../types.js').Rules} rules
 * @param {import('../types.js').Ball[]} balls
 * @param {string} cueId
 * @returns {string[]}
 */
export function opponentTargets(rules, balls, cueId) {
  const onTable = balls.filter((b) => b.id !== cueId);
  if (rules.kind === 'designated') {
    const ids = rules.opponentIds ?? rules.legalIds;
    return onTable.filter((b) => ids.includes(b.id)).map((b) => b.id);
  }
  if (rules.kind === '8ball') {
    const ids = rules.opponentIds ?? [];
    const opp = onTable.filter((b) => ids.includes(b.id)).map((b) => b.id);
    if (opp.length) return opp;
    return onTable.some((b) => b.id === '8') ? ['8'] : [];
  }
  if (!onTable.length) return [];
  let low = onTable[0];
  for (const b of onTable) if (Number(b.id) < Number(low.id)) low = b;
  return [low.id];
}

/**
 * @param {number[]} scores
 * @param {import('../types.js').Gate|null} nominalGate
 * @returns {{total:number, sd:number, label:'Forgiving'|'Touchy'|null}}
 */
export function aggregate(scores, nominalGate) {
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const sd = Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length);
  if (nominalGate) return { total: 0, sd, label: null };
  return { total: Math.round(mean), sd, label: sd <= 12 ? 'Forgiving' : 'Touchy' };
}

/**
 * @param {import('../types.js').Layout} layout
 * @param {import('../types.js').Shot} shot
 * @returns {import('../types.js').SafetyScore}
 */
export function scoreSafety(layout, shot) {
  const cueId = layout.cueId;
  const nominal = simulate(layout, shot, { record: false });
  const nominalGate = gateFor(nominal, layout);
  if (nominalGate) {
    return {
      total: 0, gate: nominalGate, V: 0, directThreat: 0, cueRestriction: 0,
      kick: { rails: 3, n1: 0, w1: 0, n2: 0, w2: 0, K: 0 },
      robustness: { scores: [0, 0, 0, 0, 0, 0, 0, 0, 0], sd: 0 }, label: null,
    };
  }
  const nTargets = opponentTargets(layout.rules, nominal.final, cueId);
  if (!nTargets.length) throw new Error('invalid layout: no opponent targets');
  const nPos = scorePosition(nominal.final, cueId, nTargets);
  const nomLanes = { n1: nPos.kick.n1, w1: nPos.kick.w1, n2: nPos.kick.n2, w2: nPos.kick.w2 };
  /** @param {import('../types.js').Ball[]} fin */
  const allNear = (fin) => fin.every((p) => {
    const q = nominal.final.find((r) => r.id === p.id);
    return !!q && Math.hypot(p.x - q.x, p.y - q.y) <= 2.25;
  });
  const scores = [];
  for (let i = 0; i < ROBUST_GRID.length; i++) {
    if (i === 4) { scores.push(nPos.score); continue; }
    const { speedF, aimOff } = ROBUST_GRID[i];
    const sim = simulate(layout, { aimDeg: shot.aimDeg + aimOff, speed: shot.speed * speedF, spin: shot.spin }, { record: false });
    if (gateFor(sim, layout)) { scores.push(0); continue; }
    const targets = opponentTargets(layout.rules, sim.final, cueId);
    const same = targets.length === nTargets.length && targets.every((id, k) => id === nTargets[k]);
    const reuse = nPos.V < 1 && same && allNear(sim.final);
    scores.push(scorePosition(sim.final, cueId, targets, reuse ? { kick: nomLanes } : {}).score);
  }
  const agg = aggregate(scores, null);
  return {
    total: agg.total, V: nPos.V, directThreat: nPos.D, cueRestriction: nPos.Q, kick: nPos.kick,
    robustness: { scores, sd: agg.sd }, label: agg.label,
  };
}
