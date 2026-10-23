// Catchable fish models (#187; ported from the storyboard prototype and extended to the whole catalogue).
// Local metres, nose toward +x, centred on the origin.
import type { FishId } from '../sim/catalogue';
import { VoxelGrid } from '../voxel/grid';
import { hash2 } from '../voxel/noise';
import { definePalette } from '../voxel/palette';

export const FISH_PAL = definePalette({
  eye: 0x141414, eyeRing: 0xf2d24a, belly: 0xeef0e6,
  perch: 0x9fb8a8, perch2: 0x86a596, perchBar: 0x5f7d6e, perchFin: 0xd98a5a,
  green: 0x7d8f4a, green2: 0x6a7a3c, greenSpot: 0xc46a3a, greenFin: 0x5d6a34,
  rock: 0xe8603c, rock2: 0xd84f2f, rockBelly: 0xf6c29a, rockFin: 0xf08a5c,
  ling: 0x8a7f5a, ling2: 0x6f6646, lingBlot: 0x4e5a3a, lingBelly: 0xd8d2b8, lingFin: 0x5f573c,
  parrot: 0x3fc4b0, parrot2: 0x2fa89a, parrotPink: 0xf08ac0, parrotBeak: 0xe8e2c8,
  tang: 0xf6d22a, tang2: 0xe8c218, tangSpine: 0xffffff,
  eel: 0x2a1410, eel2: 0x3a1a12, eelGlow: 0xff8a1a, eelGlow2: 0xffc04a,
});
const F = FISH_PAL.idx;

/** Body colours, belly, fins, height and width (fractions of the length), and an optional pattern over the flank
 *  (`wx`, `wy` in body lengths; `x`, `y` voxel indices). */
interface Look { body: [number, number]; belly: number; fin: number; h: number; w: number; pattern?: (wx: number, wy: number, x: number, y: number) => number | null }

const LOOKS: Record<FishId, Look> = {
  perch: { body: [F.perch, F.perch2], belly: F.belly, fin: F.perchFin, h: 0.17, w: 0.075, pattern: (wx, wy) => (Math.floor((wx + 1) / 0.14) % 2 === 0 && wy > -0.02 ? F.perchBar : null) },
  greenling: { body: [F.green, F.green2], belly: F.belly, fin: F.greenFin, h: 0.14, w: 0.07, pattern: (_wx, _wy, x, y) => (hash2(x, y, 9) < 0.08 ? F.greenSpot : null) },
  rockfish: { body: [F.rock, F.rock2], belly: F.rockBelly, fin: F.rockFin, h: 0.19, w: 0.085 },
  lingcod: { body: [F.ling, F.ling2], belly: F.lingBelly, fin: F.lingFin, h: 0.13, w: 0.07, pattern: (_wx, _wy, x, y) => (hash2(Math.floor(x / 3), Math.floor(y / 3), 4) < 0.3 ? F.lingBlot : null) },
  parrotfish: { body: [F.parrot, F.parrot2], belly: F.parrotPink, fin: F.parrotPink, h: 0.2, w: 0.09 },
  tang: { body: [F.tang, F.tang2], belly: F.tang, fin: F.tang2, h: 0.36, w: 0.06 },
  magmaEel: { body: [F.eel, F.eel2], belly: F.eel2, fin: F.eelGlow, h: 0.05, w: 0.045, pattern: (_wx, _wy, x, y) => (hash2(x, y, 2) < 0.14 ? (hash2(x, y, 3) < 0.5 ? F.eelGlow : F.eelGlow2) : null) },
};

/** A fish `len` metres long (voxel size scales with it so big fish don't cost more). */
export function buildFish(id: FishId, len = 0.3): VoxelGrid {
  const voxel = Math.max(0.008, len / 28);
  const g = new VoxelGrid(voxel), L = LOOKS[id];
  if (id === 'magmaEel') {
    // a long body in a gentle S, glowing cracks, a dorsal frill of embers
    const n = 24;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n, p = (t: number) => [len * (0.5 - t), Math.sin(t * Math.PI * 2) * len * 0.04, 0];
      g.wsegment(p(t0), p(t1), len * L.h * (1 - 0.6 * t0), hash2(i, 0, 5) < 0.3 ? F.eelGlow : i % 2 ? F.eel : F.eel2);
      if (i % 3 === 1) g.wsegment(p(t0), [p(t0)[0], p(t0)[1] + len * 0.07, 0], voxel * 0.8, F.eelGlow2);
    }
  } else {
    g.wellipsoid([0, 0, 0], [len * 0.5, len * L.h, len * L.w], (x, y) => {
      const wy = y * voxel, wx = x * voxel;
      if (wy < -len * L.h * 0.35) return L.belly;
      const pat = L.pattern?.(wx / len, wy / len, x, y);
      if (pat !== null && pat !== undefined) return pat;
      return hash2(x, y, 3) < 0.5 ? L.body[0] : L.body[1];
    });
    // tail fan, dorsal fin, pelvic fin
    for (let i = 0; i <= 6; i++) { const t = i / 6; g.wsegment([-len * 0.46, 0, 0], [-len * 0.66, (t - 0.5) * len * (L.h * 2.2), 0], voxel * 1.2, L.fin); }
    for (let i = 0; i < 6; i++) g.wsegment([-len * 0.22 + i * len * 0.075, len * L.h * 0.8, 0], [-len * 0.2 + i * len * 0.075, len * (L.h * 1.45) - i * len * 0.012, 0], voxel * 0.8, id === 'tang' ? F.tangSpine : L.fin);
    g.wsegment([len * 0.05, -len * L.h * 0.7, 0], [-len * 0.05, -len * L.h * 1.2, 0], voxel, L.fin);
    if (id === 'parrotfish') g.wellipsoid([len * 0.47, -len * 0.02, 0], [len * 0.05, len * 0.05, len * 0.04], F.parrotBeak);
    if (id === 'lingcod') g.wsegment([len * 0.5, -len * 0.04, -len * 0.04], [len * 0.5, -len * 0.04, len * 0.04], voxel, F.eye); // the big mouth
  }
  for (const s of [1, -1]) {
    const ex = len * (id === 'magmaEel' ? 0.46 : 0.34), ez = s * len * (id === 'magmaEel' ? 0.035 : L.w * 0.8);
    g.wellipsoid([ex, len * 0.04, ez], [len * 0.04, len * 0.04, voxel], id === 'magmaEel' ? F.eelGlow2 : F.eyeRing);
    g.wellipsoid([ex + len * 0.005, len * 0.045, ez * 1.12], [len * 0.022, len * 0.022, voxel], F.eye);
  }
  return g;
}
