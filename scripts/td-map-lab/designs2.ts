import type { Design, P } from './lib.ts';
import { Path } from './path.ts';
const FLY: P[] = [{ x: 6, y: -6 }, { x: 40, y: -6 }, { x: 74, y: -6 }];
const T: P = { x: 40, y: 101 };
const base = { hw: 4, shoulder: 1, flyers: FLY, turret: T };
const HIVE = [{ x: 74, y: -40 }, { x: 71, y: -24 }];
// A. Dive down the right, retreat up a channel, then a tight zigzag down the left into the turret.
const dive = new Path(...HIVE, { x: 70, y: -8 }).line({ x: 70, y: 76 }).arc({ x: 59, y: 76 }, 180)   // down, U-turn at the bottom
  .line({ x: 48, y: 22 }).arc({ x: 37, y: 22 }, -180)                                               // retreat up, turn left over the top
  .line({ x: 26, y: 22 }).line({ x: 22, y: 22 }).arc({ x: 22, y: 33 }, -180).line({ x: 22, y: 44 })    // switchback 1
  .arc({ x: 22, y: 55 }, 180).arc({ x: 22, y: 77 }, -90).line({ x: 26, y: 88 }).line({ x: 34, y: 95 }).line(T);
// C. Spiral in toward a point above the turret, then leave the middle and bridge over the outer ring.
const C: P = { x: 40, y: 48 };
const spiralOut = new Path(...HIVE, { x: 70, y: -6 }, { x: 66, y: 4 }).spiral(C, 330, 22, 0.78).spiral(C, 250, 9, 0.78);
const sp = spiralOut.at;
spiralOut.line({ x: 40, y: 75 }).line({ x: 40, y: 92 }).line(T);
export const designs: Design[] = [
  { ...base, name: 'A · Dive + zigzag', wp: dive.pts },
  { ...base, name: 'B · Spiral, turret at centre', turret: { x: 40, y: 58 },
    wp: new Path(...HIVE, { x: 70, y: -6 }, { x: 68, y: 6 }).spiral({ x: 40, y: 58 }, 400, 20, 0.7).line({ x: 40, y: 58 }).pts },
  { ...base, name: 'C · Spiral in, bridge out', bridges: [], wp: spiralOut.pts },
  { ...base, name: 'D · Lasso, one bridge', bridges: [{ x: 40, y: 78 }], wp: new Path(...HIVE, { x: 68, y: -8 })
    .line({ x: 68, y: 67 }).arc({ x: 57, y: 67 }, 90).line({ x: 23, y: 78 }).arc({ x: 23, y: 65 }, 90).line({ x: 10, y: 31 })
    .arc({ x: 25, y: 31 }, 180).line({ x: 40, y: 78 }).line({ x: 40, y: 90 }).line(T).pts },
];
