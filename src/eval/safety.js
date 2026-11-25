// @ts-check
import { simulate } from '../engine/simulate.js';
import { combineScore, cueRestriction, directThreat } from './position.js';
import { visibility } from '../geometry/visibility.js';
import { kickLanes, kickEase } from './kick.js';

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

/** @typedef {{n1:number,w1:number,n2:number,w2:number}} Lanes */
/** @typedef {(balls: import('../types.js').Ball[], cueId: string, targetIds: string[]) => Lanes} KickFn */
/** @typedef {{final: import('../types.js').Ball[], targets: string[], V: number, D: number, Q: number, same: boolean, near: boolean}|null} Variant */
/**
 * Position phase result (R27c). `gated` is set (a finished SafetyScore) when the nominal run is gated;
 * otherwise `variants` holds the 9 robustness slots (null = gated slot; slot 4 is the nominal run).
 * @typedef {{gated: import('../types.js').SafetyScore|null, nTargets: string[], nominalFinal: import('../types.js').Ball[], variants: Variant[]}} SafetyPrep
 */

/**
 * @param {import('../types.js').Ball[]} balls
 * @param {string} cueId
 * @param {string[]} targetIds
 */
function positionVDQ(balls, cueId, targetIds) {
  const cue = /** @type {import('../types.js').Ball} */ (balls.find((b) => b.id === cueId));
  let V = 0, D = 0;
  for (const tid of targetIds) {
    const t = /** @type {import('../types.js').Ball} */ (balls.find((b) => b.id === tid));
    const v = visibility(cue, t, balls, [cueId]);
    V = Math.max(V, v);
    D = Math.max(D, directThreat(cue, t, balls, cueId, v));
  }
  return { V, D, Q: cueRestriction(cue) };
}

/**
 * Position phase: simulate the nominal and 8 variant shots and compute V/D/Q for each. No kick lanes.
 * @param {import('../types.js').Layout} layout
 * @param {import('../types.js').Shot} shot
 * @returns {SafetyPrep}
 */
export function prepareSafety(layout, shot) {
  const cueId = layout.cueId;
  const nominal = simulate(layout, shot, { record: false });
  const nominalGate = gateFor(nominal, layout);
  if (nominalGate) {
    return {
      gated: {
        total: 0, gate: nominalGate, V: 0, directThreat: 0, cueRestriction: 0,
        kick: { rails: 3, n1: 0, w1: 0, n2: 0, w2: 0, K: 0 },
        robustness: { scores: [0, 0, 0, 0, 0, 0, 0, 0, 0], sd: 0 }, label: null,
      },
      nTargets: [], nominalFinal: nominal.final, variants: [],
    };
  }
  const nTargets = opponentTargets(layout.rules, nominal.final, cueId);
  if (!nTargets.length) throw new Error('invalid layout: no opponent targets');
  /** @param {import('../types.js').Ball[]} fin */
  const allNear = (fin) => fin.every((p) => {
    const q = nominal.final.find((r) => r.id === p.id);
    return !!q && Math.hypot(p.x - q.x, p.y - q.y) <= 2.25;
  });
  /** @type {Variant[]} */
  const variants = [];
  for (let i = 0; i < ROBUST_GRID.length; i++) {
    if (i === 4) { variants.push({ final: nominal.final, targets: nTargets, ...positionVDQ(nominal.final, cueId, nTargets), same: true, near: true }); continue; }
    const { speedF, aimOff } = ROBUST_GRID[i];
    const sim = simulate(layout, { aimDeg: shot.aimDeg + aimOff, speed: shot.speed * speedF, spin: shot.spin }, { record: false });
    if (gateFor(sim, layout)) { variants.push(null); continue; }
    const targets = opponentTargets(layout.rules, sim.final, cueId);
    const same = targets.length === nTargets.length && targets.every((id, k) => id === nTargets[k]);
    variants.push({ final: sim.final, targets, ...positionVDQ(sim.final, cueId, targets), same, near: allNear(sim.final) });
  }
  return { gated: null, nTargets, nominalFinal: nominal.final, variants };
}

/**
 * Upper bound on the final total (assumes K = 1 wherever kick lanes would be needed).
 * @param {SafetyPrep} prep
 * @returns {number}
 */
export function optimisticTotal(prep) {
  if (prep.gated) return 0;
  const scores = prep.variants.map((v) => (v ? combineScore({ V: v.V, D: v.D, K: v.V < 1 ? 1 : 0, Q: v.Q }) : 0));
  return aggregate(scores, null).total;
}

/**
 * Kick phase: compute lanes (via `kick`) and assemble the SafetyScore.
 * @param {import('../types.js').Layout} layout
 * @param {SafetyPrep} prep
 * @param {KickFn} kick
 * @returns {import('../types.js').SafetyScore}
 */
export function finishSafety(layout, prep, kick) {
  if (prep.gated) return prep.gated;
  const cueId = layout.cueId;
  const nom = /** @type {NonNullable<Variant>} */ (prep.variants[4]);
  /** @type {Lanes} */
  let nomLanes = { n1: 0, w1: 0, n2: 0, w2: 0 };
  let nomK = 0;
  if (nom.V < 1) { nomLanes = kick(nom.final, cueId, nom.targets); nomK = 1 - kickEase(nomLanes); }
  const nomScore = combineScore({ V: nom.V, D: nom.D, K: nomK, Q: nom.Q });
  const scores = [];
  for (let i = 0; i < prep.variants.length; i++) {
    if (i === 4) { scores.push(nomScore); continue; }
    const v = prep.variants[i];
    if (!v) { scores.push(0); continue; }
    let K = 0;
    if (v.V < 1) {
      const reuse = nom.V < 1 && v.same && v.near;
      K = 1 - kickEase(reuse ? nomLanes : kick(v.final, cueId, v.targets));
    }
    scores.push(combineScore({ V: v.V, D: v.D, K, Q: v.Q }));
  }
  const agg = aggregate(scores, null);
  const rails = nom.V > 0 ? 0 : nomLanes.n1 ? 1 : nomLanes.n2 ? 2 : 3;
  return {
    total: agg.total, V: nom.V, directThreat: nom.D, cueRestriction: nom.Q,
    kick: { rails, ...nomLanes, K: nomK },
    robustness: { scores, sd: agg.sd }, label: agg.label,
  };
}

/**
 * @param {import('../types.js').Layout} layout
 * @param {import('../types.js').Shot} shot
 * @returns {import('../types.js').SafetyScore}
 */
export function scoreSafety(layout, shot) {
  return finishSafety(layout, prepareSafety(layout, shot), kickLanes);
}
