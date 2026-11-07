import type { Design, P } from './lib.ts';
import { Path } from './path.ts';
import { designs as d4 } from './designs4.ts';
const FLY: P[] = [{ x: 6, y: -6 }, { x: 40, y: -6 }, { x: 74, y: -6 }];
const T: P = { x: 40, y: 101 };
const base = { hw: 4, shoulder: 1, flyers: FLY, turret: T, tr: 8 };
const HIVE = [{ x: 74, y: -40 }, { x: 71, y: -24 }];
const C: P = { x: 40, y: 48 };
/** Ring in, then leave toward the lower left on the deck, crossing the ring away from its close pass, and curve into the turret. */
function ringOut(innerSweep: number, exit: P) {
  const p = new Path(...HIVE, { x: 70, y: -6 }, { x: 66, y: 6 }).spiral(C, 300, 27, 0.92).spiral(C, innerSweep, 14, 0.92);
  return p.line(exit).arc({ x: exit.x + 13, y: exit.y }, -70).line(T).pts;
}
export const designs: Design[] = [
  d4.find(d => d.name.startsWith('C'))!,
  { ...base, name: 'C2 · exit on the deck, lower left', bridges: [], over: 'last', wp: ringOut(240, { x: 12, y: 84 }) },
  { ...base, name: 'C3 · exit on the deck, left side', bridges: [], over: 'last', wp: ringOut(200, { x: 6, y: 70 }) },
];
