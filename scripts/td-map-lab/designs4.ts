import type { Design, P } from './lib.ts';
import { Path } from './path.ts';
import { designs as d3 } from './designs3.ts';
import { ROAD_WAYPOINTS, ROAD_PADS } from '../../src/games/towerdefense/sim/road';
const FLY: P[] = [{ x: 6, y: -6 }, { x: 40, y: -6 }, { x: 74, y: -6 }];
const T: P = { x: 40, y: 101 };
const base = { hw: 4, shoulder: 1, flyers: FLY, turret: T, tr: 8 };
const HIVE = [{ x: 74, y: -40 }, { x: 71, y: -24 }];
// A2 fixed: switchbacks (radius 11) kept 10+ clear of both the dive and the return channel.
const climb = new Path(...HIVE, { x: 72, y: -8 }).line({ x: 72, y: 66 }).arc({ x: 61, y: 66 }, 90)
  .line({ x: 34, y: 77 }).arc({ x: 34, y: 66 }, 180).line({ x: 49, y: 55 }).arc({ x: 49, y: 44 }, -180)
  .line({ x: 34, y: 33 }).arc({ x: 34, y: 22 }, 180).line({ x: 49, y: 11 }).arc({ x: 49, y: 0 }, -90)
  .line({ x: 22, y: 0 }).arc({ x: 22, y: 11 }, -90).line({ x: 11, y: 74 }).arc({ x: 24, y: 74 }, -55).line(T);
// C2: one ring around a centre above the turret, then straight out over a single bridge.
const C: P = { x: 40, y: 50 };
const ring = new Path(...HIVE, { x: 70, y: -6 }, { x: 66, y: 6 }).spiral(C, 300, 27, 0.92).spiral(C, 210, 14, 0.92);
ring.line({ x: 40, y: 90 }).line(T);
const pick = (n: string) => d3.find(d => d.name.startsWith(n))!;
export const designs: Design[] = [
  { name: 'Now · current road', wp: [...ROAD_WAYPOINTS], turret: T, hw: 5.5, shoulder: 1.25, flyers: FLY, pads: [...ROAD_PADS] },
  pick('A1'),
  { ...base, name: 'A2 · Dive, climb, return', wp: climb.pts },
  pick('B'),
  { ...base, name: 'C · Ring in, bridge out', bridges: [], wp: ring.pts },
  pick('D'),
];
