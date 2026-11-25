// @ts-check
/** @typedef {import('../types.js').Layout} Layout */
import { unitBalls } from './families.js';

/**
 * @param {{x:number,y:number}} cue @param {{x:number,y:number}} ob
 * @param {{c:{x:number,y:number}, kind:'single'|'pair'}[]} units
 * @returns {Layout}
 */
function build(cue, ob, units) {
  const axis = Math.atan2(ob.y - cue.y, ob.x - cue.x) * (180 / Math.PI);
  const blk = units.flatMap((un) => unitBalls(un.c, axis, un.kind));
  return {
    balls: [
      { id: 'cue', ...cue },
      { id: 'ob', ...ob },
      ...blk.map((p, i) => ({ id: 'b' + (i + 1), x: p.x, y: p.y })),
    ],
    cueId: 'cue',
    rules: { kind: 'designated', legalIds: ['ob'] },
  };
}

/** Fixed fallback layouts (true scale). Not seed-replayable; identified by name. */
export const FIXED_LAYOUTS = [
  { name: 'open hook', layout: build({ x: 26, y: 25 }, { x: 64, y: 25 }, [{ c: { x: 42, y: 18 }, kind: 'pair' }, { c: { x: 46, y: 32 }, kind: 'pair' }]) },
  { name: 'rail tuck', layout: build({ x: 40, y: 12 }, { x: 78, y: 40 }, [{ c: { x: 52, y: 30 }, kind: 'pair' }]) },
  { name: 'behind the 8', layout: build({ x: 22, y: 25 }, { x: 54, y: 25 }, [{ c: { x: 42, y: 29 }, kind: 'single' }]) },
];
