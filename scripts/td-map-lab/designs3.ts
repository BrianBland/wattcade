import type { Design, P } from './lib.ts';
import { Path } from './path.ts';
const FLY: P[] = [{ x: 6, y: -6 }, { x: 40, y: -6 }, { x: 74, y: -6 }];
const T: P = { x: 40, y: 101 };
const base = { hw: 4, shoulder: 1, flyers: FLY, turret: T, tr: 8 };
const HIVE = [{ x: 74, y: -40 }, { x: 71, y: -24 }];
// A1. Narrow trident: dive down the right, climb the middle, descend the left into the turret (pitch 22).
const trident = new Path(...HIVE, { x: 71, y: -8 }).line({ x: 71, y: 74 }).arc({ x: 60, y: 74 }, 180)
  .line({ x: 49, y: 26 }).arc({ x: 38, y: 26 }, -180).line({ x: 27, y: 80 }).arc({ x: 40, y: 80 }, -60).line(T);
// A2. Dive, climb away, return: dive down the right to the turret's shoulder, zigzag up across the field, return down the left edge.
const climb = new Path(...HIVE, { x: 72, y: -8 }).line({ x: 72, y: 66 }).arc({ x: 61, y: 66 }, 90)   // dive, turn left above the turret
  .line({ x: 34, y: 77 }).arc({ x: 34, y: 64 }, 180)                                                // U-turn up and back right
  .line({ x: 56, y: 51 }).arc({ x: 56, y: 38 }, -180)                                              // switchback left
  .line({ x: 22, y: 25 }).arc({ x: 22, y: 36 }, -90)                                               // turn down the left edge
  .line({ x: 11, y: 74 }).arc({ x: 24, y: 74 }, -55).line(T);                                      // return into the turret
// C. Spiral in toward a point well above the turret, then out under... over a bridge.
const C: P = { x: 40, y: 46 };
const sp = new Path(...HIVE, { x: 70, y: -6 }, { x: 66, y: 4 }).spiral(C, 300, 25, 0.8).spiral(C, 300, 11, 0.8);
sp.line({ x: 40, y: 88 }).line(T);
export const designs: Design[] = [
  { ...base, name: 'A1 · Narrow trident', wp: trident.pts },
  { ...base, name: 'A2 · Dive, climb, return', wp: climb.pts },
  { ...base, name: 'B · Spiral, turret at centre', turret: { x: 40, y: 58 },
    wp: new Path(...HIVE, { x: 70, y: -6 }, { x: 68, y: 6 }).spiral({ x: 40, y: 58 }, 470, 15, 0.66).line({ x: 40, y: 58 }).pts },
  { ...base, name: 'C · Spiral in, bridge out', bridges: [], wp: sp.pts },
  { ...base, name: 'D · Lasso, one bridge', bridges: [{ x: 40, y: 78 }], wp: new Path(...HIVE, { x: 68, y: -8 })
    .line({ x: 68, y: 67 }).arc({ x: 57, y: 67 }, 90).line({ x: 23, y: 78 }).arc({ x: 23, y: 65 }, 90).line({ x: 10, y: 31 })
    .arc({ x: 25, y: 31 }, 180).line({ x: 40, y: 78 }).line({ x: 40, y: 92 }).line(T).pts },
];
