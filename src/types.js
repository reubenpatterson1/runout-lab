// @ts-check
/** @typedef {{id: string, x: number, y: number}} Ball */
/** @typedef {{kind: 'designated'|'8ball'|'9ball', legalIds: string[], opponentIds?: string[]}} Rules */
/** @typedef {{balls: Ball[], cueId: string, rules: Rules}} Layout */
/** @typedef {{aimDeg: number, speed: number, spin: {x: number, y: number}}} Shot */
/** @typedef {{t: number, type: 'ball'|'cushion'|'jaw'|'pocket'|'roll'|'stop', a: string, b?: string|number, x: number, y: number, va?: {x:number,y:number}, vb?: {x:number,y:number}}} SimEvent */
/** @typedef {{trajectories: Record<string, {t:number,x:number,y:number}[]>, events: SimEvent[], final: Ball[], firstContactId: string|null, railsAfterContact: number, cueRailsBeforeContact: number, pocketed: string[], scratch: boolean, duration: number, settled: boolean}} SimResult */
/** @typedef {{rails: 0|1|2|3, n1: number, w1: number, n2: number, w2: number, K: number}} KickInfo */
/** @typedef {'scratch'|'wrong-ball-first'|'no-rail'|'ob-pocketed'} Gate */
/** @typedef {{total: number, gate?: Gate, V: number, directThreat: number, kick: KickInfo, cueRestriction: number, robustness: {scores: number[], sd: number}, label: 'Forgiving'|'Touchy'|null}} SafetyScore */
/** @typedef {'easy'|'medium'|'hard'} Band */
/** @typedef {{shot: Shot, score: SafetyScore}} Scored */
/** @typedef {{best: Scored|null, cheapCount: number, shareGe70: number}} SuggestResult */
/** @typedef {{ok: boolean, best: Scored|null, share: number, band: Band}} Validation */
/** @typedef {{family: number, seed: number, requestedBand: Band, band: Band, layout: Layout, validation: Validation, attempts: number, fallback: boolean, fixedName?: string}} DealResult */
export {};
