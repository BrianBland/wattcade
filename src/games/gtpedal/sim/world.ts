// Grand Theft Pedal neighbourhood: pure data + analytic height field. No DOM / three.
export interface Box { x0: number; z0: number; x1: number; z1: number; h: number; color: number }
export type LineKind = 'path' | 'ramp' | 'rail' | 'tram';
export interface Line { id: number; kind: LineKind; pts: Array<[number, number]> }
/** A kicker/berm: height rises linearly along `dir` from 0 to h over len, then drops off (a launch lip). */
export interface Kicker { x: number; z: number; dir: number; len: number; w: number; h: number }

export const HALF = 120;
export const CANAL = { z0: -14, z1: -4, depth: 5 };
export const BRIDGE = { x0: -9, x1: 9 }; // central avenue crosses the canal here; two leaves hinge at z0/z1
export const BOWL = { x: -70, z: 50, r: 16, depth: 4.5 };
export const PLAZA = { x0: 30, z0: 30, x1: 80, z1: 80, drop: 2, stairsZ: 30, stairsLen: 4 };
export const TRAM_Z = 18;

export const BUILDINGS: Box[] = [
  { x0: 20, z0: -60, x1: 45, z1: -30, h: 18, color: 0xe8b86b },
  { x0: 55, z0: -70, x1: 90, z1: -35, h: 26, color: 0xd98c7a },
  { x0: -90, z0: -70, x1: -55, z1: -40, h: 14, color: 0x9fc4d8 },
  { x0: -40, z0: -65, x1: -18, z1: -30, h: 22, color: 0xc7a3d9 },
  { x0: 95, z0: 30, x1: 115, z1: 80, h: 30, color: 0xb5d98a },
  { x0: 20, z0: 90, x1: 60, z1: 112, h: 16, color: 0xe6d56a },
  { x0: -110, z0: 90, x1: -80, z1: 112, h: 20, color: 0x8ad9c8 },
];

export const KICKERS: Kicker[] = [
  { x: -40, z: 40, dir: Math.PI / 2, len: 8, w: 6, h: 2.2 },   // park kicker heading +x
  { x: -30, z: 70, dir: Math.PI, len: 10, w: 8, h: 3 },         // berm facing -z... heading direction = -z
  { x: 0, z: 36, dir: 0, len: 9, w: 5, h: 2.5 },                // avenue kicker heading +z
];

/** Drawbridge leaf angle (radians) at sim time t: closed, rising, open, falling. */
export function bridgeAngle(t: number, periodS: number, maxRad: number): number {
  const p = ((t % periodS) + periodS) % periodS / periodS;
  if (p < 0.4) return 0;
  if (p < 0.55) return maxRad * (p - 0.4) / 0.15;
  if (p < 0.85) return maxRad;
  return maxRad * (1 - (p - 0.85) / 0.15);
}

function kickerH(k: Kicker, x: number, z: number): number {
  const dx = x - k.x, dz = z - k.z;
  const fx = Math.sin(k.dir), fz = Math.cos(k.dir); // heading convention: dir 0 = +z, PI/2 = +x
  const along = dx * fx + dz * fz, side = -dx * fz + dz * fx;
  const back = k.len * 0.5; // gentle back side so riding into it from behind is a steep roller, not a wall
  const edge = Math.abs(side) - k.w / 2, SIDE = 3; // sides roll off over SIDE m so they're never walls
  if (edge > SIDE || along < 0 || along > k.len + back) return 0;
  const sideMul = edge <= 0 ? 1 : 1 - edge / SIDE;
  if (along > k.len) return k.h * sideMul * (1 - (along - k.len) / back);
  const u = along / k.len; return k.h * sideMul * u * u; // concave face: quarter-pipe-ish
}

/** Ground height (m). `bridge` = current leaf angle in radians. */
export function heightAt(x: number, z: number, bridge = 0): number {
  if (Math.abs(x) > HALF || Math.abs(z) > HALF) return 6; // edge walls
  if (z > CANAL.z0 && z < CANAL.z1) {
    if (x > BRIDGE.x0 && x < BRIDGE.x1) {
      const mid = (CANAL.z0 + CANAL.z1) / 2, tan = Math.tan(bridge);
      const fromHinge = z < mid ? z - CANAL.z0 : CANAL.z1 - z;
      const gapHalf = bridge > 0.02 ? 0.6 + bridge * 2 : 0; // gap opens at the middle
      if (Math.abs(z - mid) < gapHalf) return -CANAL.depth;
      return fromHinge * tan;
    }
    return -CANAL.depth;
  }
  const bd = Math.hypot(x - BOWL.x, z - BOWL.z);
  if (bd < BOWL.r) { const u = bd / BOWL.r; return -BOWL.depth * (1 - u * u); }
  let h = 0;
  for (const k of KICKERS) h = Math.max(h, kickerH(k, x, z));
  if (x > PLAZA.x0 && x < PLAZA.x1 && z > PLAZA.z0 && z < PLAZA.z1) {
    const u = Math.min(1, (z - PLAZA.stairsZ) / PLAZA.stairsLen);
    const out = Math.max(0, Math.min(1, (z - (PLAZA.z1 - 10)) / 10)); // smooth ramp back up on the north side
    h -= PLAZA.drop * (Math.floor(u * 5) / 5) * (1 - out); // 5 steps down into the sunken plaza
  }
  return h;
}

export function buildingAt(x: number, z: number): Box | null {
  for (const b of BUILDINGS) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return b;
  return null;
}

const ring = (cx: number, cz: number, r: number, n: number): Array<[number, number]> =>
  Array.from({ length: n + 1 }, (_, i) => [cx + r * Math.cos((i / n) * Math.PI * 2), cz + r * Math.sin((i / n) * Math.PI * 2)] as [number, number]);

export const LINES: Line[] = [
  { id: 0, kind: 'path', pts: [[0, -110], [0, 110]] },                        // central avenue over the drawbridge
  { id: 1, kind: 'tram', pts: [[-115, TRAM_Z - 0.75], [115, TRAM_Z - 0.75]] }, // tram rails (two)
  { id: 2, kind: 'tram', pts: [[-115, TRAM_Z + 0.75], [115, TRAM_Z + 0.75]] },
  { id: 3, kind: 'path', pts: [[-110, 30], [-40, 30], [-40, 40], [-25, 40], [-10, 30], [20, 30]] }, // park path
  { id: 4, kind: 'ramp', pts: ring(BOWL.x, BOWL.z, BOWL.r - 2, 16) },          // bowl carve line
  { id: 5, kind: 'rail', pts: [[34, 30.5], [76, 30.5]] },                       // plaza stair handrail
  { id: 6, kind: 'path', pts: [[-110, 0], [110, 0]] },                         // canal-side promenade
  { id: 7, kind: 'path', pts: [[-110, 86], [110, 86]] },
];

export const PARKED_BIKES: Array<{ x: number; z: number; kind: string }> = [
  { x: 4, z: -100, kind: 'city' }, { x: -50, z: 26, kind: 'bmx' }, { x: 40, z: 22, kind: 'fixie' },
  { x: 60, z: 84, kind: 'cargo' }, { x: -20, z: 84, kind: 'ebike' }, { x: 80, z: 2, kind: 'tandem' },
  { x: -90, z: 4, kind: 'city' },
];
export const SPAWN = { x: 0, z: -100, heading: 0 };

/** Closest point on a line to (x,z): distance, tangent heading (dir 0 = +z), and segment index. */
export function nearestOnLine(l: Line, x: number, z: number): { d: number; px: number; pz: number; heading: number; seg: number } {
  let best = { d: Infinity, px: 0, pz: 0, heading: 0, seg: 0 };
  for (let i = 0; i < l.pts.length - 1; i++) {
    const [ax, az] = l.pts[i], [bx, bz] = l.pts[i + 1];
    const vx = bx - ax, vz = bz - az, len2 = vx * vx + vz * vz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / len2));
    const px = ax + vx * t, pz = az + vz * t, d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { d, px, pz, heading: Math.atan2(vx, vz), seg: i };
  }
  return best;
}
