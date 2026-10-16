// Original simple art, retained for the per-player Classic overworld mode.
// Desert mesas and buttes for the backdrop: flat caps, vertical cliffs over talus skirts, strata, sun-side shading.
// Shapes are a pure function of a seed (stable per world slot, no per-frame jitter); drawing uses primitives only.
import { hash01 } from '../../sim/terrain';
import { mixColor } from '../blend';
import { rect, type G } from './paint';

export interface MesaTheme { rock: string; shade: string; strata: [string, string]; cap: string; talus: string; haze: string }
export const DESERT_MESA: MesaTheme = { rock: '#c8784a', shade: '#7a3a2a', strata: ['#a85a32', '#e0a070'], cap: '#e6b080', talus: '#d9a070', haze: '#b9b4c8' };
export const DUSK_MESA: MesaTheme = { rock: '#7a4258', shade: '#2a1230', strata: ['#5e2f48', '#9a5a68'], cap: '#a8687a', talus: '#8a5062', haze: '#7a4a78' };

export interface MesaShape {
  halfW: number; h: number;
  /** Left outline from the foot of the talus up to the cap, as [dx from centre, height]; the right side mirrors it. */
  left: Array<[number, number]>;
  talusH: number; capH: number;
  /** Heights (0..1 of h) of horizontal strata bands. */
  strata: number[];
}

/** Deterministic butte/mesa outline: one or two stepped tiers, jagged cliff faces, a talus apron. `depth` 0 far .. 2 near. */
export function makeMesa(seed: number, depth: number): MesaShape {
  const r = (i: number) => hash01(seed * 31 + i * 7 + depth * 1000);
  const scale = [0.7, 0.9, 1.15][depth] ?? 1;
  const halfW = (13 + r(1) * 22) * scale, h = (20 + r(2) * 26) * scale;
  const tiers = r(3) < 0.5 ? 1 : 2;
  const talusH = Math.max(3, h * (0.18 + r(4) * 0.12)), talusW = talusH * (1.2 + r(5));
  const jag = (i: number) => (r(10 + i) - 0.5) * 2.4;
  const left: Array<[number, number]> = [[-(halfW + talusW), 0], [-halfW, talusH]];
  const cliffTo = (x: number, bottom: number, top: number, from: number, seg: number) => {
    for (let i = 1; i <= seg; i++) left.push([x + jag(i + from), bottom + ((top - bottom) * i) / seg]);
  };
  if (tiers === 1) { cliffTo(-halfW, talusH, h, 0, 4); }
  else {
    const h1 = h * (0.45 + r(6) * 0.15), inset = halfW * (0.3 + r(7) * 0.25);
    cliffTo(-halfW, talusH, h1, 0, 3);
    left.push([-halfW + inset * 0.5, h1 + 1.5], [-halfW + inset, h1 + 2]);      // ledge with a small slope
    cliffTo(-halfW + inset, h1 + 2, h, 5, 3);
  }
  left[left.length - 1] = [left[left.length - 1][0] - 0.8, h];                  // slight cap overhang
  const n = 3 + Math.floor(r(8) * 3);
  return { halfW, h, left, talusH, capH: Math.max(2, h * 0.08), strata: Array.from({ length: n }, (_, i) => 0.18 + (0.72 * (i + r(20 + i) * 0.6)) / n) };
}

/** Hazier and bluer the further away (depth 0 = farthest). */
export function mesaThemeAt(t: MesaTheme, depth: number): MesaTheme {
  const k = [0.62, 0.38, 0.12][depth] ?? 0;
  const m = (c: string) => mixColor(c, t.haze, k);
  return { rock: m(t.rock), shade: m(t.shade), strata: [m(t.strata[0]), m(t.strata[1])], cap: m(t.cap), talus: m(t.talus), haze: t.haze };
}

/** Draw one mesa centred on x with its foot at `base`; the sun is on the left, so the right side is in shadow. */
export function drawMesa(g: G, m: MesaShape, th: MesaTheme, x: number, base: number) {
  const pts: Array<[number, number]> = [...m.left, ...[...m.left].reverse().map(([dx, hh]) => [-dx, hh] as [number, number])];
  g.save();
  g.beginPath();
  pts.forEach(([dx, hh], i) => { const px = x + dx, py = base - hh; if (i) g.lineTo(px, py); else g.moveTo(px, py); });
  g.closePath(); g.clip();
  const x0 = x - m.halfW * 1.8, wd = m.halfW * 3.6;
  rect(g, th.rock, x0, base - m.h - 1, wd, m.h + 2);
  m.strata.forEach((f, i) => rect(g, th.strata[i % 2], x0, base - f * m.h, wd, i % 2 ? 1 : 2));
  rect(g, th.talus, x0, base - m.talusH, wd, m.talusH + 1);                          // scree apron
  g.globalAlpha = 0.5; rect(g, th.shade, x + m.halfW * 0.18, base - m.h - 1, m.halfW * 1.9, m.h + 2); g.globalAlpha = 1; // shadow side
  rect(g, th.cap, x - m.halfW * 1.2, base - m.h, m.halfW * 2.4, m.capH);              // sunlit flat cap
  g.globalAlpha = 0.5; rect(g, th.shade, x + m.halfW * 0.18, base - m.h, m.halfW * 1.9, m.capH); g.globalAlpha = 1;
  g.restore();
}

/** Mesa slot `k` of a depth row: stays put in the world, some slots are empty so the skyline has gaps. */
export function mesaSlot(k: number, depth: number, spacing: number): { x: number; shape: MesaShape } | null {
  if (hash01(k * 5 + depth * 53 + 3) < 0.2) return null;
  return { x: k * spacing + spacing * (0.2 + 0.6 * hash01(k * 13 + depth * 101 + 7)), shape: makeMesa(k * 17 + depth * 3, depth) };
}

const SPACING = [150, 120, 96], PAR = [0.55, 0.8, 1.15], DROP = [9, 13, 17];
/** Three parallax depths of mesas, far to near. `u` is the backdrop scroll in px, `y` the band base. */
export function drawMesaRange(g: G, w: number, y: number, u: number, theme: MesaTheme) {
  for (let depth = 0; depth < 3; depth++) {
    const th = mesaThemeAt(theme, depth), uu = u * PAR[depth], sp = SPACING[depth];
    for (let k = Math.floor(uu / sp) - 1; k <= Math.ceil((uu + w) / sp) + 1; k++) {
      const s = mesaSlot(k, depth, sp);
      if (s) drawMesa(g, s.shape, th, s.x - uu, y + DROP[depth]);
    }
  }
}
