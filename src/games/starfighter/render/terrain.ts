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
