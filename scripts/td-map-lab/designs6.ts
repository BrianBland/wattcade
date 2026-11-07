import type { Design, P } from './lib.ts';
import { Path } from './path.ts';
import { designs as d4 } from './designs4.ts';
const FLY: P[] = [{ x: 6, y: -6 }, { x: 40, y: -6 }, { x: 74, y: -6 }];
const T: P = { x: 40, y: 101 };
const base = { hw: 4, shoulder: 1, flyers: FLY, turret: T, tr: 8 };
const HIVE = [{ x: 74, y: -40 }, { x: 71, y: -24 }];
/** Ring in around c, then a straight exit on the deck to `out`, and one smooth bend into the turret. */
function ringOut(c: P, outer: number, inner: number, r0: number, r1: number, out: P, bend: P) {
  return new Path(...HIVE, { x: 70, y: -6 }, { x: 66, y: 6 }).spiral(c, outer, r0, 0.92).spiral(c, inner, r1, 0.92)
    .line(out).line(bend).line(T).pts;
}
export const designs: Design[] = [
  d4.find(d => d.name.startsWith('C'))!,
  { ...base, name: 'C2a · deck exit, shorter ring', bridges: [], over: 'last', wp: ringOut({ x: 40, y: 48 }, 280, 220, 27, 14, { x: 16, y: 82 }, { x: 24, y: 94 }) },
  { ...base, name: 'C2b · deck exit, ring lifted', bridges: [], over: 'last', wp: ringOut({ x: 40, y: 44 }, 270, 210, 27, 13, { x: 15, y: 79 }, { x: 22, y: 93 }) },
  { ...base, name: 'C2c · deck exit, tighter ring', bridges: [], over: 'last', wp: ringOut({ x: 40, y: 46 }, 280, 200, 25, 12, { x: 17, y: 80 }, { x: 24, y: 94 }) },
];
