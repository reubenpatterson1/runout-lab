// @ts-check
import { FAMILIES } from '../deal/families.js';
import { NO_GOOD_SAFETY_TEXT } from '../deal/bank.js';
import { normDeg } from '../ui/aim.js';

/**
 * @typedef {import('../types.js').SafetyScore} SafetyScore
 * @typedef {import('../types.js').Scored} Scored
 * @typedef {import('../types.js').Gate} Gate
 * @typedef {import('../types.js').Layout} Layout
 */

/** @type {Record<Gate, string>} */
export const GATE_TEXT = {
  scratch: 'Scratch: ball in hand to your opponent',
  'wrong-ball-first': 'Foul: wrong ball first',
  'no-rail': 'Foul: no rail after contact',
  'ob-pocketed': 'Not a safety: you pocketed the object ball',
};

/** @type {Record<Gate, string>} */
export const GATE_SHORT = {
  scratch: 'Scratch',
  'wrong-ball-first': 'Wrong ball first',
  'no-rail': 'No rail',
  'ob-pocketed': 'Pocketed the object ball',
};

export const LOADING_TEXT = 'Loading layouts…';
export const LOAD_ERROR_TEXT = "Couldn't load the layouts. Check your connection, then try again.";
export const SHOT_ERROR_TEXT = 'Something went wrong. Try the shot again.';
export const SCORING_TEXT = 'Scoring…';
export const NEW_SESSION_CONFIRM = "Start a new session? This session's scores will be cleared.";
export const COPIED_TEXT = 'Copied';

export const EXAMPLE_LINKS = [
  { slug: 'open-hook', label: 'Open hook' },
  { slug: 'rail-tuck', label: 'Rail tuck' },
  { slug: 'behind-the-8', label: 'Behind the 8' },
];

/** @param {number} total */
export function verdict(total) {
  if (total >= 85) return 'Lock-up';
  if (total >= 70) return 'Good safety';
  if (total >= 50) return 'Playable';
  if (total >= 25) return 'Weak';
  return 'Sells out';
}

/** @param {SafetyScore} score @returns {'red'|'amber'|'green'} */
export function verdictTone(score) {
  if (score.gate || score.total < 25) return 'red';
  return score.total >= 70 ? 'green' : 'amber';
}

/** @param {number} avg */
export function sessionVerdict(avg) {
  if (avg >= 80) return 'Lock-down defence';
  if (avg >= 65) return 'Solid';
  if (avg >= 50) return 'Leaky';
  return 'Giving them shots';
}

/** @param {SafetyScore} score @returns {string[]} */
export function breakdownRows(score) {
  if (score.gate) return [];
  /** @type {string[]} */
  const rows = [`Hidden: ${Math.round((1 - score.V) * 100)}%`];
  const k = score.kick;
  if (score.V > 0) {
    rows.push(`Direct shot threat: ${Math.round(score.directThreat * 100)}%`);
  } else if (k.rails === 1 || k.rails === 2) {
    const n = k.rails === 1 ? k.n1 : k.n2;
    const w = k.rails === 1 ? k.w1 : k.w2;
    rows.push(`Their best escape: ${k.rails}-rail kick · ${n} ${n === 1 ? 'lane' : 'lanes'}, widest ${w.toFixed(1)}°`);
  } else {
    rows.push('No 1- or 2-rail kick for them');
  }
  rows.push(`Cue ball on a rail: ${Math.round(score.cueRestriction * 100)}%`);
  const sc = score.robustness.scores;
  const range = `range ${Math.round(Math.min(...sc))}–${Math.round(Math.max(...sc))}`;
  rows.push(score.label ? `Robustness: ${score.label} · ${range}` : `Robustness: ${range}`);
  return rows;
}

/** @param {string} s */
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** @param {number} id */
export function familyName(id) {
  return /** @type {{id:number,name:string}} */ (FAMILIES.find((f) => f.id === id)).name;
}

/** @param {any} x @returns {string} */
export function statusLine(x) {
  /** @type {string[]} */
  let parts;
  if (x.mode === 'session') {
    parts = [`Deal ${x.slot + 1} of 10`, cap(x.band), familyName(x.family)];
    if (x.average !== null) parts.push(`Avg ${x.average}`);
  } else if (x.mode === 'deal') {
    parts = [`Layout #${x.id}`, cap(x.band), familyName(x.family)];
  } else {
    parts = ['Example', cap(x.name)];
  }
  if (x.edited) parts.push('Edited layout');
  return parts.join(' · ');
}

/** @param {boolean} counted */
export function contextLine(counted) {
  return counted ? 'Counts for the session' : "Practice: doesn't count";
}

/** @param {string} band */
export function noAltText(band) {
  return `No other ${band} layout left for this family. Play this one or move on.`;
}

/** @param {Scored|null} best @returns {string[]} */
export function hintLines(best) {
  if (!best) return ['No legal safety found from here'];
  return [`Best found: ${best.score.total}`, ...(best.score.total < 70 ? [NO_GOOD_SAFETY_TEXT] : []), ...breakdownRows(best.score)];
}

/** @param {SafetyScore} score */
export function announceText(score) {
  return `${score.gate ? GATE_TEXT[score.gate] : verdict(score.total)}. Score ${score.total}`;
}

/** @param {Layout} layout @param {number} aimDeg */
export function tableLabel(layout, aimDeg) {
  const a = normDeg(aimDeg).toFixed(1);
  const { balls, cueId, rules } = layout;
  const legal = rules.legalIds;
  if (rules.kind === '8ball') {
    const opp = rules.opponentIds ?? [];
    const yours = balls.filter((b) => legal.includes(b.id)).map((b) => b.id);
    const theirs = balls.filter((b) => opp.includes(b.id)).map((b) => b.id);
    const eight = balls.some((b) => b.id === '8' && !legal.includes('8') && !opp.includes('8')) ? '; the 8' : '';
    return `Table. Cue ball; your balls ${yours.join(', ')}; their balls ${theirs.join(', ')}${eight}. Aim ${a} degrees.`;
  }
  if (rules.kind === '9ball') {
    const ids = balls.filter((b) => b.id !== cueId).map((b) => b.id).sort((p, q) => Number(p) - Number(q));
    return `Table. Cue ball; balls ${ids.join(', ')}; lowest ball ${legal[0]}. Aim ${a} degrees.`;
  }
  const n = balls.filter((b) => b.id !== cueId && !legal.includes(b.id)).length;
  const blockers = n === 0 ? '' : `, ${n} ${n === 1 ? 'blocker' : 'blockers'}`;
  return `Table. Cue ball, object ball${blockers}. Aim ${a} degrees.`;
}

/** @param {string} href @param {number} id */
export function dealLink(href, id) {
  return href.split('#')[0] + '#/study/safety?deal=' + id;
}

/** @param {{score: number|null, gate: Gate|null}} row */
export function scoreCell(row) {
  return row.gate ? `0 (${GATE_SHORT[row.gate]})` : String(row.score);
}

/** @param {number} s */
export function searchingText(s) {
  return `Searching for a good safety… ${s} s`;
}
