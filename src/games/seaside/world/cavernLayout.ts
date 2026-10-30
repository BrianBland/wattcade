// Chapter 3a's underworld (#192), pure. Travelled along −z and keyed to u = −z (metres in from the temple's back door):
// a cut-stone passage that turns into a winding natural cave (the walls warming grey → brown → red-brown, a chamber now
// and then), its floor the cavern scene's trainer grade integrated along the rail (flat, then the long descent: the
// slope you see is the grade you feel), opening at the mouth onto a volcanic hall where a bike-width obsidian bridge
// runs level over a lava river 20 m below, on to the gate (#193). Magma fishing and the cooling fan stand on the bridge
// where the bridge scene ends; leaping eels and the torch cages are placed from here too. Chapter 3b (#193) rides on
// along it: glyphs painted on loose rocks, then on columns lining the way, then the gate wall, where the drill goes in.
import { GATE_LAYERS } from '../sim/belly';
import { STORY } from '../sim/story';
import { gradeAt } from '../sim/workout';
import { RouteSpline } from './route';

const scene = (id: string) => STORY.find((s) => s.id === id)!;
const railM = (id: string) => { const l = scene(id).length; return 'm' in l ? l.m : 0; };
/** Rail metres: the cave ride, the bridge ride, and Toward the gate (#193) on along the bridge. */
export const CAVE_M = railM('cavern'), BRIDGE_M = railM('bridge'), GATE_M = railM('toGate');

const DU = 0.5, U0 = -16, U1 = 4800, N = Math.round((U1 - U0) / DU) + 1;
const idx = (u: number) => Math.max(0, Math.min(N - 1.001, (u - U0) / DU));
const table = (f: (u: number) => number) => { const t = new Float64Array(N); for (let i = 0; i < N; i++) t[i] = f(U0 + i * DU); return t; };
const read = (t: Float64Array, u: number) => { const f = idx(u), i = Math.floor(f), k = f - i; return t[i] + (t[i + 1] - t[i]) * k; };
export const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Arc length along a centreline table from u = 0. */
function arc(cx: Float64Array): Float64Array {
  const t = new Float64Array(N), i0 = Math.round(-U0 / DU);
  for (let i = i0 + 1; i < N; i++) t[i] = t[i - 1] + Math.hypot(DU, cx[i] - cx[i - 1]);
  for (let i = i0 - 1; i >= 0; i--) t[i] = t[i + 1] - Math.hypot(DU, cx[i + 1] - cx[i]);
  return t;
}
function uAt(S: Float64Array, s: number): number {
  let lo = 0, hi = N - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] < s) lo = m; else hi = m; }
  return U0 + (lo + Math.max(0, Math.min(1, (s - S[lo]) / (S[hi] - S[lo] || 1)))) * DU;
}

/** The cave winds: bends tight enough that the way on is always out of sight. Straight for the stone passage. */
const caveSway = (u: number) => smooth(40, 140, u) * (9 * Math.sin(u / 38) + 4 * Math.sin(u / 17 + 1) - 4 * Math.sin(1));
const CAVE_S = arc(table(caveSway));
/** Where the cave opens onto the hall (u). */
export const U_MOUTH = uAt(CAVE_S, CAVE_M);
const hallSway = (u: number) => caveSway(U_MOUTH) + 18 * Math.sin((u - U_MOUTH) / 260);
const CX = table((u) => (u < U_MOUTH ? caveSway(u) : lerp(caveSway(u), hallSway(u), smooth(U_MOUTH, U_MOUTH + 150, u))));
const S = arc(CX);
export const cx = (u: number) => read(CX, u);
export const sOfU = (u: number) => read(S, u);
export const uOfS = (s: number) => uAt(S, s);

/** Floor of the centreline: the cavern grade integrated over its rail; level on from the mouth (the bridge). */
const CAVE_TR = scene('cavern').trainer;
const Y = (() => {
  const t = new Float64Array(N);
  for (let i = 1; i < N; i++) {
    const s = (S[i] + S[i - 1]) / 2, g = s > 0 && s < CAVE_M && CAVE_TR.mode === 'sim' ? gradeAt(CAVE_TR, s / CAVE_M) : 0;
    t[i] = t[i - 1] + (g / 100) * (S[i] - S[i - 1]);
  }
  return t;
})();
export const floorY = (u: number) => read(Y, u);
/** The bridge deck height, the lava river 20 m below it, and the tops of the hall walls. */
export const BRIDGE_Y = floorY(U_MOUTH), LAVA_Y = BRIDGE_Y - 20, WALL_TOP = BRIDGE_Y + 55;
/** The bridge's rail: from the mouth to the gate landing. Magma fishing and the fan stand where the bridge scene ends. */
export const BRIDGE = { s0: CAVE_M, s1: CAVE_M + BRIDGE_M + GATE_M, stand: CAVE_M + BRIDGE_M, half: 0.9, thickness: 0.55 };
export const U_GATE = uOfS(BRIDGE.s1), HALL_END = U_GATE + 40;
/** The gate wall's face (u), on a multiple of 8 m so every LOD's voxels put the face exactly there (the painted
 *  inscription lies on it). The route ends just short of it. */
export const GATE_U = Math.ceil((U_GATE + 20) / 8) * 8;
/** Route metres of the face, and where you stop in front of it (the bit's reach and a little). */
export const GATE_S = sOfU(GATE_U), STOP_S = GATE_S - 2.6;
/** The gate: a sheer panel `half` m either side of the line, `h` m tall (an arch on top), between pilasters standing
 *  `out` m proud of the wall. No door. */
export const GATE = { half: 7, pilaster: 2, out: 2, h: 17, arch: 3 } as const;
/** Drill II's bore: its mouth on the gate (centre at the bit's height above the deck), boring along −z. */
export const GATE_TUNNEL_R = 1.3, GATE_DEPTH = GATE_LAYERS.reduce((a, l) => a + l.m, 0);
export const gateAxis = () => ({ x: cx(GATE_U), y: BRIDGE_Y + GATE_TUNNEL_R, z: -GATE_U });

// ---- the cave's cross-section -------------------------------------------------------------------------------------

/** Cave half-width and height (m) at u: the narrow stone passage, the natural cave, a chamber every ~430 m, the mouth. */
export function caveSize(u: number): { w: number; h: number; stone: number } {
  const stone = 1 - smooth(45, 110, u);
  const ph = ((((u - 215) % 430) + 430) % 430 - 215) / 38, room = Math.exp(-ph * ph) * smooth(300, 400, u);
  const mouth = smooth(U_MOUTH - 110, U_MOUTH, u);
  const w = lerp(Math.max(2.9, 3.5 + 1.3 * Math.sin(u / 41) + 0.7 * Math.sin(u / 13 + 2)) + 5 * room, 2.4, stone) + 7 * mouth;
  const h = lerp(5.2 + 1.4 * Math.sin(u / 57 + 1) + 6 * room, 4.4, stone) + 9 * mouth;
  return { w, h, stone };
}
/** Rock colour family along the descent: 0 grey, 1 brown, 2 red-brown. */
export const warmth = (u: number) => smooth(U_MOUTH * 0.22, U_MOUTH * 0.5, u) + smooth(U_MOUTH * 0.55, U_MOUTH * 0.85, u);

// ---- the hall -------------------------------------------------------------------------------------------------------

/** Lava river half-width at u (the banks start there, the cliffs ~30 m beyond). */
export const riverHalf = (u: number) => 46 + 14 * Math.sin(u / 170) + 8 * Math.sin(u / 61 + 1);

/** The bridge piers: one every 70 m of rail, standing in the lava. */
export const PIERS: ReadonlyArray<{ u: number; x: number; z: number }> = (() => {
  const out: Array<{ u: number; x: number; z: number }> = [];
  for (let s = BRIDGE.s0 + 45; s < BRIDGE.s1 - 20; s += 70) { const u = uOfS(s); out.push({ u, x: cx(u), z: -u }); }
  return out;
})();
export const PIER_R = 0.7, PIER_FLARE = 0.03;

// ---- the route --------------------------------------------------------------------------------------------------------

let routeCache: RouteSpline | null = null;
/** Down the middle of the cave and along the bridge: s = 0 at the temple's back door, ending at the gate landing. */
export function cavernRoute(): RouteSpline {
  if (!routeCache) {
    const pts: Array<[number, number, number]> = [];
    const end = GATE_U - 1.2; // the deck stops just short of the gate
    for (let u = 0; u < end; u += 2) pts.push([cx(u), floorY(u), -u]);
    pts.push([cx(end), floorY(end), -end]);
    routeCache = new RouteSpline(pts, 2);
  }
  return routeCache;
}

/** Route metres each scene runs over (the fishing and the fan stand at a point; the drill and the fall at the gate). */
export function cavernSpan(id: 'cavern' | 'bridge' | 'magma' | 'fan' | 'toGate' | 'drill2' | 'fall'): [number, number] {
  if (id === 'cavern') return [0, CAVE_M];
  if (id === 'bridge') return [CAVE_M, BRIDGE.stand];
  if (id === 'toGate') return [BRIDGE.stand, STOP_S];
  if (id === 'drill2' || id === 'fall') return [STOP_S, STOP_S];
  return [BRIDGE.stand, BRIDGE.stand];
}

/** A world point at depth u, `d` metres right of the centreline (travel is −z, so right is +x), on the floor. */
export const cavePoint = (u: number, d: number) => ({ x: cx(u) + d, y: floorY(u), z: -u });

/** Torch cages on the cave walls every 24 m of rail, alternating sides (the renderer lights the few ahead). */
export interface Torch { s: number; u: number; side: number; x: number; y: number; z: number }
export const TORCH_EVERY = 24;
export function torchAt(k: number): Torch {
  const s = 10 + k * TORCH_EVERY, u = uOfS(s), side = k % 2 ? 1 : -1, { w } = caveSize(u);
  return { s, u, side, x: cx(u) + side * (w - 0.3), y: floorY(u) + 2.3, z: -u };
}
export const TORCHES: readonly Torch[] = Array.from({ length: Math.floor((CAVE_M - 40) / TORCH_EVERY) }, (_, k) => torchAt(k));

// ---- the leaping eels ------------------------------------------------------------------------------------------------

/** One eel's leap, in hall coordinates: from (lx0, u0) to (lx1, u1) on the lava, apex `h` m above it, looping every
 *  `period` s (airborne for `air` of it). Vaulters cross over the bridge. */
export interface Leap { u0: number; lx0: number; u1: number; lx1: number; h: number; period: number; phase: number; air: number; vault: boolean }
const rnd = (a: number, b: number) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export const LEAP_EVERY = 30;
export const LEAPS: readonly Leap[] = (() => {
  const out: Leap[] = [];
  for (let j = 0, u = U_MOUTH + 30; u < U_GATE - 20; j++, u += LEAP_EVERY) {
    const r = (k: number) => rnd(j, k), vault = j % 3 === 1, side = r(1) < 0.5 ? -1 : 1;
    if (vault) {
      const a = 14 + r(2) * 16, b = 14 + r(3) * 16;
      out.push({ u0: u, lx0: side * a, u1: u - 6 - r(4) * 10, lx1: -side * b, h: 30 + r(5) * 8, period: 5.5 + r(6) * 2, phase: r(7) * 8, air: 0.55, vault });
    } else {
      const a = 9 + r(2) * 24, b = Math.max(9, a + (r(3) - 0.5) * 18);
      out.push({ u0: u, lx0: side * a, u1: u - 8 - r(4) * 12, lx1: side * b, h: 14 + r(5) * 14, period: 3.4 + r(6) * 2.6, phase: r(7) * 8, air: 0.6, vault });
    }
  }
  return out;
})();
/** A leap at fraction k (0..1) of its flight: world position. */
export function leapAt(l: Leap, k: number): { x: number; y: number; z: number } {
  const u = lerp(l.u0, l.u1, k);
  return { x: cx(u) + lerp(l.lx0, l.lx1, k), y: LAVA_Y + 4 * l.h * k * (1 - k) - 0.5, z: -u };
}

// ---- the glyph stones (#193) -------------------------------------------------------------------------------------

/** A stone standing in the lava by the causeway with glyphs painted on the face toward the path: loose rocks first,
 *  then columns lining the way. A box (half-sizes hx across, hz along) whose path-side face is flat at x = `face`
 *  (snapped to the voxel grid, so the paint lies on it). */
export interface GlyphStone { kind: 'rock' | 'column'; s: number; u: number; side: number; x: number; z: number; hx: number; hz: number; top: number; face: number }
/** The causeway's stretch (Toward the gate), and where the rocks give way to the columns (fraction of it). */
const G0 = BRIDGE.stand, G1 = STOP_S, ROCKS_END = 0.45, COLS_START = 0.5, COLS_END = (G1 - 30 - G0) / (G1 - G0);
const snap = (x: number) => Math.round(x * 2) / 2;
export const GLYPH_STONES: readonly GlyphStone[] = (() => {
  const out: GlyphStone[] = [];
  const add = (kind: GlyphStone['kind'], s: number, side: number, inner: number, hx: number, hz: number, top: number) => {
    const u = uOfS(s), face = snap(cx(u) + side * inner), x = face + side * hx;
    out.push({ kind, s, u, side, x, z: -u, hx, hz, top, face });
  };
  for (let j = 0, s = G0 + 70; s < G0 + ROCKS_END * (G1 - G0); j++, s += 26) {
    const r = (k: number) => rnd(j, 40 + k), side = j % 2 ? 1 : -1;
    add('rock', s, side, 3 + r(1) * 3.5, 0.9 + r(2) * 0.7, 1.1 + r(3) * 0.9, BRIDGE_Y - 1.2 + r(4) * 3);
  }
  for (let s = G0 + COLS_START * (G1 - G0); s < G0 + COLS_END * (G1 - G0); s += 15) for (const side of [-1, 1]) add('column', s, side, 2.5, 0.5, 0.5, BRIDGE_Y + 7);
  return out;
})();
/** The painted panel on a stone: centre, size (m), facing (+1 = toward +x), and how far along the causeway it is. */
export function glyphPanel(st: GlyphStone): { x: number; y: number; z: number; w: number; h: number; facing: number } {
  const h = st.kind === 'column' ? 4.8 : Math.min(1.8, st.top - LAVA_Y - 0.6), y = st.top - (st.kind === 'column' ? 1.6 : 0.25) - h / 2;
  return { x: st.face - st.side * 0.02, y, z: st.z, w: 2 * st.hz * 0.82, h, facing: -st.side };
}
