// Catchable fish models (local metres, nose toward +x, centred on the origin).
import { VoxelGrid } from '../voxel/grid';
import { definePalette } from '../voxel/palette';
import { hash2 } from '../voxel/noise';

export const FISH = definePalette({
  perch: 0x9fb8a8, perch2: 0x86a596, perchBar: 0x5f7d6e, belly: 0xeef0e6, fin: 0xd98a5a, eye: 0x141414, eyeRing: 0xf2d24a,
  rock: 0xe8603c, rock2: 0xd84f2f, rockBelly: 0xf6c29a, rockFin: 0xf08a5c,
});
const F = FISH.idx;

export function buildFish(kind: 'perch' | 'rockfish', len = 0.3, voxel = 0.012): VoxelGrid {
  const g = new VoxelGrid(voxel);
  const red = kind === 'rockfish';
  g.wellipsoid([0, 0, 0], [len * 0.5, len * 0.17, len * 0.075], (x, y) => {
    const wy = y * voxel, wx = x * voxel;
    if (wy < -len * 0.06) return red ? F.rockBelly : F.belly;
    if (!red && Math.floor((wx + 1) / (len * 0.14)) % 2 === 0 && wy > -len * 0.02) return F.perchBar;
    return hash2(x, y, 3) < 0.5 ? (red ? F.rock : F.perch) : red ? F.rock2 : F.perch2;
  });
  for (let i = 0; i <= 6; i++) { const t = i / 6; g.wsegment([-len * 0.46, 0, 0], [-len * 0.66, (t - 0.5) * len * 0.38, 0], voxel * 1.2, red ? F.rockFin : F.fin); }
  for (let i = 0; i < 6; i++) g.wsegment([-len * 0.22 + i * len * 0.075, len * 0.14, 0], [-len * 0.2 + i * len * 0.075, len * 0.25 - i * len * 0.012, 0], voxel * 0.8, red ? F.rockFin : F.fin);
  g.wsegment([len * 0.05, -len * 0.12, 0], [-len * 0.05, -len * 0.2, 0], voxel, red ? F.rockFin : F.fin);
  for (const s of [1, -1]) { g.wellipsoid([len * 0.34, len * 0.04, s * len * 0.06], [len * 0.045, len * 0.045, voxel], F.eyeRing); g.wellipsoid([len * 0.345, len * 0.045, s * len * 0.068], [len * 0.025, len * 0.025, voxel], F.eye); }
  return g;
}
