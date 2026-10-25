// A cheap test world: flat ground at y = 0 (grass 1, rock 2) with a curved route and a ground corridor.
import { VoxelGrid } from '../voxel/grid';
import { definePalette } from '../voxel/palette';
import type { CorridorDef, WorldDef } from '../world/def';
import { roadSurface } from '../world/corridor';
import { RouteSpline } from '../world/route';

export const PAL = definePalette({ grass: 0x40a040, rock: 0x808080, asphalt: 0x333333, yellow: 0xffff00, white: 0xffffff, gravel: 0xaaaaaa, dirt: 0x806040 });
const P = PAL.idx;

export const flatCorridor: CorridorDef = {
  half: 3, support: 'ground', thickness: 0.5, clearance: 4, voxel: 0.125, farVoxel: 0.5, near: 100, seg: 32, range: 600,
  surface: roadSurface({ asphalt: [P.asphalt], yellow: P.yellow, white: P.white, gravel: [P.gravel], dirt: P.dirt, paved: 2.5, lane: 1.5 }),
};

export function flatWorld(over: Partial<WorldDef> = {}): WorldDef {
  const route = new RouteSpline([[0, 0, 0], [0, 0, -200], [150, 0, -400], [150, 0, -900]], 4);
  return {
    id: 'flat', palette: PAL, isWater: () => false, bounds: { x0: -300, x1: 500, z0: -1000, z1: 100 }, route, eye: 1.5,
    terrain: {
      kind: 'height', height: () => 0,
      fill(g: VoxelGrid, reg, o) {
        const s = g.size;
        for (let x = Math.floor(reg.x0 / s); x < Math.ceil(reg.x1 / s); x++) for (let z = Math.floor(reg.z0 / s); z < Math.ceil(reg.z1 / s); z++) {
          const wx = (x + 0.5) * s, wz = (z + 0.5) * s, c = o.corridor?.at(wx, wz, s) ?? null;
          if (c === 'skip') continue;
          let top = -1; // ground surface at y = 0
          if (typeof c === 'number') top = Math.min(top, Math.floor(c / s) - 1);
          g.set(x - Math.round(g.origin[0] / s), top, z - Math.round(g.origin[2] / s), P.grass);
          g.set(x - Math.round(g.origin[0] / s), top - 1, z - Math.round(g.origin[2] / s), P.rock);
        }
      },
    },
    corridor: flatCorridor, sky: { zenith: 0, horizon: 0, fog: 0, fogDensity: 0, sunDir: [0.5, 0.5, 0.5], sunColor: 0, sunI: 1, hemiSky: 0, hemiGround: 0, hemiI: 1 },
    look: 'raw', lod: { minTile: 8 }, ...over,
  };
}
