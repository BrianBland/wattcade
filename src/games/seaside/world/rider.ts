// First-person props in camera-local metres (camera looks down −z): gloves, drop bars, the fishing rod, and a leaned bike.
import { VoxelGrid } from '../voxel/grid';
import { definePalette } from '../voxel/palette';

export const KIT = definePalette({
  glove: 0x6a707a, glove2: 0x5f6570, gloveTop: 0xa9b0b9, gloveGrip: 0x3a3e45, warmer: 0x3b4150, warmer2: 0x363c4a,
  tape: 0xf1eee6, tape2: 0xe4e0d6, hood: 0x2b2e34, lever: 0xb9bec4, stem: 0x1e2024,
  frame: 0xe8553a, frame2: 0xd84a31, decal: 0xf4f1e8, spacer: 0x1a1c1f,
  unit: 0x26292e, screen: 0x9fb8a0, screenDark: 0x54705a,
  btnA: 0x3cc36b, btnB: 0xe0457a, btnY: 0x3d8fe6, btnZ: 0xf29b2e,
  rod: 0x1f5fcf, rod2: 0x2b70e0, wrap: 0xf3f0e6, cork: 0xc9a06a, cork2: 0xb88e5a, reel: 0x2b2d31, reelSilver: 0xc0c6cc, line: 0xf2f2f2,
  tyre: 0x232427, rim: 0x2b2d31, spoke: 0xb7bcc2, saddle: 0x1d1e21, chain: 0x8e959c,
  bobRed: 0xe5372e, bobWhite: 0xf7f7f2,
});
const K = KIT.idx;

function glove(g: VoxelGrid, side: 1 | -1, hood: readonly number[]) {
  const [hx, hy, hz] = hood; // centre of the top of the hood
  const sx = (v: number) => hx + v * side;
  // back of the hand / palm resting on the hood
  g.wellipsoid([sx(0.004), hy + 0.026, hz + 0.03], [0.036, 0.024, 0.05], (x, y) => (y * g.size > hy + 0.04 ? K.gloveTop : K.glove));
  // fingers wrapping over the outside of the hood and down the lever
  for (let i = 0; i < 4; i++) {
    const z = hz - 0.02 + i * 0.019;
    const k = i === 0 ? 1.08 : 1 - i * 0.04;
    g.wsegment([sx(0.018), hy + 0.035, z], [sx(0.036 * k), hy + 0.012, z - 0.006], 0.0105, K.glove2);
    g.wsegment([sx(0.036 * k), hy + 0.012, z - 0.006], [sx(0.03 * k), hy - 0.022, z - 0.016], 0.0095, K.glove2);
  }
  // thumb along the inside
  g.wsegment([sx(-0.024), hy + 0.022, hz + 0.045], [sx(-0.03), hy + 0.012, hz - 0.01], 0.011, K.glove);
  // cuff and arm warmer heading back toward the shoulder
  g.wsegment([sx(0.004), hy + 0.03, hz + 0.075], [sx(0.03), hy + 0.0, hz + 0.16], 0.032, K.gloveGrip);
  g.wsegment([sx(0.03), hy + 0.0, hz + 0.16], [sx(0.11), hy - 0.12, hz + 0.5], 0.04, K.warmer);
}

/** Drop bars on hoods, Zwift-Ride style buttons, stem, head unit, top of the head tube. Origin = bar clamp. */
export function buildBars(): VoxelGrid {
  const g = new VoxelGrid(0.006);
  const W = 0.205;
  // tops
  g.wsegment([-W + 0.02, 0, 0], [W - 0.02, 0, 0], 0.013, K.tape);
  for (const sd of [1, -1] as const) {
    const pts = [[W - 0.02, 0, 0], [W, -0.004, -0.03], [W + 0.008, -0.012, -0.07], [W + 0.01, -0.03, -0.1], [W + 0.012, -0.075, -0.115], [W + 0.012, -0.12, -0.09], [W + 0.012, -0.14, -0.04], [W + 0.012, -0.145, 0.03]];
    for (let i = 0; i < pts.length - 1; i++) g.wsegment([pts[i][0] * sd, pts[i][1], pts[i][2]], [pts[i + 1][0] * sd, pts[i + 1][1], pts[i + 1][2]], 0.013, i % 2 ? K.tape2 : K.tape);
    // hood body
    const hx = (W + 0.008) * sd;
    g.wellipsoid([hx, 0.012, -0.095], [0.016, 0.026, 0.05], K.hood);
    g.wellipsoid([hx, 0.03, -0.13], [0.013, 0.018, 0.016], K.hood); // the peak
    g.wsegment([hx, 0.0, -0.145], [hx * 1.01, -0.11, -0.125], 0.0075, K.lever);
    // controller buttons on the inside face of the hood
    const btn = sd > 0 ? [K.btnA, K.btnB, K.btnY] : [K.btnZ, K.btnY, K.btnB];
    btn.forEach((c, i) => g.wellipsoid([hx - 0.016 * sd, 0.016, -0.075 - i * 0.017], [0.004, 0.0055, 0.0055], c));
    glove(g, sd, [hx, 0.036, -0.1]);
  }
  // stem, spacers, head tube
  g.wsegment([0, -0.004, 0], [0, -0.035, 0.11], 0.02, K.stem);
  g.wsegment([0, -0.02, 0.11], [0, -0.06, 0.11], 0.017, K.spacer);
  g.wsegment([0, -0.06, 0.11], [0, -0.32, 0.17], 0.024, K.frame);
  g.wsegment([0, -0.07, 0.115], [0, -0.09, 0.12], 0.026, K.decal);
  // head unit on an out-front mount
  g.wsegment([0, 0.004, 0], [0, 0.012, -0.05], 0.007, K.stem);
  g.wbox([-0.026, 0.012, -0.11], [0.026, 0.03, -0.035], K.unit);
  g.wbox([-0.02, 0.031, -0.104], [0.02, 0.034, -0.04], K.screen);
  g.wbox([-0.016, 0.031, -0.09], [0.002, 0.034, -0.08], K.screenDark);
  g.wbox([-0.016, 0.031, -0.07], [0.012, 0.034, -0.06], K.screenDark);
  return g;
}

/** Spinning rod held in the right hand, left hand on the reel crank. Origin = right hand. Returns the tip in grid-local metres. */
export function buildRod(dir: readonly [number, number, number], len = 2.1, blank = true): { grid: VoxelGrid; tip: [number, number, number] } {
  const g = new VoxelGrid(0.007);
  const n = Math.hypot(...dir), d = dir.map((v) => v / n) as [number, number, number];
  const at = (t: number) => [d[0] * t, d[1] * t, d[2] * t] as const;
  // cork grip from behind the hand to the reel seat
  g.wsegment(at(-0.32), at(-0.02), 0.017, K.cork);
  for (let t = -0.3; t < 0; t += 0.06) g.wsegment(at(t), at(t + 0.006), 0.0175, K.cork2);
  g.wsegment(at(-0.02), at(0.07), 0.013, K.reel);
  // blank, tapering, with white thread wraps
  const steps = blank ? 40 : 0;
  for (let i = 0; i < steps; i++) {
    const t0 = 0.07 + (len - 0.07) * (i / steps), t1 = 0.07 + (len - 0.07) * ((i + 1) / steps);
    const r = 0.011 - 0.0075 * (i / steps);
    g.wsegment(at(t0), at(t1), Math.max(r, 0.0036), i % 7 === 3 ? K.wrap : i % 2 ? K.rod : K.rod2);
  }
  // reel under the rod
  const reelC = [at(0.03)[0], at(0.03)[1] - 0.06, at(0.03)[2]];
  g.wsegment(at(0.03), reelC, 0.006, K.reel);
  g.wellipsoid(reelC, [0.028, 0.026, 0.03], K.reel);
  g.wellipsoid([reelC[0], reelC[1], reelC[2] - 0.035], [0.024, 0.024, 0.012], K.reelSilver);
  g.wsegment([reelC[0] - 0.03, reelC[1], reelC[2]], [reelC[0] - 0.06, reelC[1] - 0.03, reelC[2] + 0.01], 0.005, K.reelSilver);
  // right glove wrapped around the grip at the reel seat
  g.wellipsoid([0.012, 0.012, 0.025], [0.034, 0.03, 0.05], (x, y) => (y * g.size > 0.03 ? K.gloveTop : K.glove));
  for (let i = 0; i < 4; i++) g.wsegment([0.02, -0.01, 0.0 + i * 0.019], [-0.016, -0.026, 0.004 + i * 0.019], 0.0105, K.glove2);
  g.wsegment([-0.018, 0.02, 0.01], [-0.012, 0.016, -0.045], 0.011, K.glove);
  g.wsegment([0.015, 0.0, 0.08], [0.06, -0.08, 0.35], 0.034, K.warmer);
  // left glove on the crank knob
  const knob = [reelC[0] - 0.065, reelC[1] - 0.035, reelC[2] + 0.012];
  g.wellipsoid([knob[0] - 0.02, knob[1] - 0.01, knob[2] + 0.02], [0.034, 0.028, 0.044], K.glove);
  g.wsegment([knob[0] - 0.03, knob[1] - 0.02, knob[2] + 0.06], [knob[0] - 0.1, knob[1] - 0.12, knob[2] + 0.36], 0.036, K.warmer2);
  const tip = at(len) as unknown as [number, number, number];
  return { grid: g, tip: [tip[0], tip[1], tip[2]] };
}

/** One straight piece of rod blank along local +y (for an articulated, bendable rod). */
export function buildRodPiece(len: number, r0: number, r1: number, wrapAt: number | null): VoxelGrid {
  const n = Math.max(1, Math.round(len / 0.04));
  const g = new VoxelGrid(0.007, [-0.0035, 0, -0.0035]); // axis through voxel centres so the thin tip never vanishes
  for (let i = 0; i < n; i++) {
    const t0 = (len * i) / n, t1 = (len * (i + 1)) / n, r = r0 + (r1 - r0) * (i / n);
    g.wsegment([0, t0, 0], [0, t1, 0], Math.max(r, 0.0036), i % 2 ? KIT.idx.rod : KIT.idx.rod2);
  }
  if (wrapAt !== null) g.wsegment([0, wrapAt, 0], [0, wrapAt + 0.012, 0], Math.max(r0, 0.0036) + 0.002, KIT.idx.wrap);
  return g;
}

/** A road bike standing on its wheels, leaned slightly; origin = ground under the bottom bracket, facing −z. */
export function buildBike(g: VoxelGrid, base: readonly number[], lean = 0.12) {
  const [bx, by, bz] = base;
  const L = (p: readonly number[]) => [bx + p[0] + p[1] * lean, by + p[1], bz + p[2]];
  const wheel = (cz: number) => {
    const r = 0.34;
    for (let a = 0; a < Math.PI * 2; a += 0.04) {
      const p = L([0, 0.34 + Math.sin(a) * r, cz + Math.cos(a) * r]);
      g.wellipsoid(p, [0.03, 0.03, 0.03], K.tyre);
      const q = L([0, 0.34 + Math.sin(a) * (r - 0.03), cz + Math.cos(a) * (r - 0.03)]);
      g.wellipsoid(q, [0.018, 0.018, 0.018], K.rim);
    }
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) g.wsegment(L([0, 0.34, cz]), L([0, 0.34 + Math.sin(a) * 0.29, cz + Math.cos(a) * 0.29]), 0.004, K.spoke);
  };
  wheel(-0.5); wheel(0.5);
  const bb = [0, 0.3, 0.0], head = [0, 0.82, -0.42], seat = [0, 0.86, 0.12], rearHub = [0, 0.34, 0.5], frontHub = [0, 0.34, -0.5];
  g.wsegment(L(bb), L(head), 0.025, K.frame); g.wsegment(L(seat), L([0, 0.8, -0.4]), 0.022, K.frame2);
  g.wsegment(L(bb), L(seat), 0.024, K.frame); g.wsegment(L(bb), L(rearHub), 0.016, K.frame2); g.wsegment(L(seat), L(rearHub), 0.014, K.frame2);
  g.wsegment(L(head), L([0, 0.72, -0.44]), 0.026, K.frame); g.wsegment(L([0, 0.72, -0.44]), L(frontHub), 0.016, K.frame2);
  g.wsegment(L(seat), L([0, 0.98, 0.16]), 0.012, K.stem); g.wbox(L([-0.04, 0.98, 0.04]), L([0.04, 1.02, 0.28]), K.saddle);
  g.wsegment(L(head), L([0, 0.9, -0.48]), 0.018, K.stem);
  g.wsegment(L([-0.2, 0.92, -0.52]), L([0.2, 0.92, -0.52]), 0.013, K.tape);
  for (const s of [1, -1]) g.wsegment(L([0.2 * s, 0.92, -0.52]), L([0.2 * s, 0.8, -0.55]), 0.013, K.tape);
  g.wsegment(L([0.05, 0.3, 0]), L([0.05, 0.34, 0.5]), 0.006, K.chain);
  g.wellipsoid(L([0.05, 0.3, 0]), [0.012, 0.1, 0.1], K.chain);
}

/** A red-and-white bobber. */
export function buildBobber(g: VoxelGrid, c: readonly number[], r = 0.09) {
  g.wellipsoid(c, [r, r, r], (_x, y) => (y * g.size > c[1] ? K.bobRed : K.bobWhite));
  g.wsegment([c[0], c[1] + r * 0.8, c[2]], [c[0], c[1] + r * 1.6, c[2]], r * 0.18, K.bobRed);
}
