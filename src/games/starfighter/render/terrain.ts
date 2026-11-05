/** Pure, seeded terrain parameters shared by the ground shader and the instanced scenery (unit-tested). */
import { mulberry } from '../sim/rng';
export { mulberry };
export interface BiomeParams { seed: number; u: [number, number, number, number]; a: number; highway: boolean; highwayX: number }
/**
 * Shader params `u` by biome — city: street spacing/offset across and along; canyon: two river frequencies and phases.
 * Other biomes ignore them.
 */
export function biomeParams(biome: number, seed: number): BiomeParams {
  const r = mulberry(seed ^ 0x51ed27);
  if (biome === 1) {
    const sx = 30 + Math.floor(r() * 15), ox = r() * sx, sy = [48, 56, 64, 80][Math.floor(r() * 4)], oy = r() * sy;
    const highway = r() < 0.5, side = r() < 0.5 ? -1 : 1;
    return { seed, u: [sx, ox, sy, oy], a: 0, highway, highwayX: side * (58 + r() * 30) };
  }
  if (biome === 2) {
    const f1 = 0.009 + r() * 0.01, p1 = r() * 6.28, f2 = 0.022 + r() * 0.02, p2 = r() * 6.28;
    return { seed, u: [f1, p1, f2, p2], a: p1, highway: false, highwayX: 0 };
  }
  return { seed, u: [0, 0, 0, 0], a: 0, highway: false, highwayX: 0 };
}
/** Canyon river centre at a route distance (matches the shader). */
export const riverX = (travel: number, P: BiomeParams) => 15 * Math.sin(travel * P.u[0] + P.u[1]) + 7 * Math.sin(travel * P.u[2] + P.u[3]);
/** City street centre lines across x in [lo, hi] (matches the shader's mod(x - u1, u0) = u0/2). */
export function cityRoads(P: BiomeParams, lo: number, hi: number): { xs: number[] } {
  const [sx, ox] = P.u, xs: number[] = [];
  for (let x = ox + sx / 2 + Math.floor((lo - ox - sx / 2) / sx) * sx; x <= hi; x += sx) if (x >= lo) xs.push(x);
  return { xs };
}
/** An ocean island: world centre (x, z), radius, kind (0 jungle hill, 1 atoll ring, 2 volcano) and its own seed. */
export interface SeaIsland { x: number; z: number; r: number; kind: 0 | 1 | 2; seed: number }
export const SEA_CELL = 420;
/**
 * Islands overlapping the world box [x0, x1] × [z0, z1]: about half the 420-unit cells hold one (radius 30–95),
 * seeded per cell, so the shader (coast, lagoon, beach) and the scenery (hills, palms, villages) always agree.
 */
export function seaIslands(seed: number, x0: number, x1: number, z0: number, z1: number): SeaIsland[] {
  const out: SeaIsland[] = [], C = SEA_CELL;
  for (let i = Math.floor((x0 - 100) / C); i <= Math.floor((x1 + 100) / C); i++) for (let j = Math.floor((z0 - 100) / C); j <= Math.floor((z1 + 100) / C); j++) {
    const r = mulberry(seed ^ Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1) ^ 0x51a7);
    if (r() > 0.55) continue;
    const rad = 30 + r() * 65, x = (i + 0.25 + r() * 0.5) * C, z = (j + 0.25 + r() * 0.5) * C, u = r();
    out.push({ x, z, r: rad, kind: u < 0.55 ? 0 : u < 0.8 ? 1 : 2, seed: Math.floor(r() * 2 ** 31) });
  }
  return out;
}
