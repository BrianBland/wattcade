// Carved inscriptions for the gate's stones (#193), in a few styles: each cut into the stone as a dark shadowed groove
// with a lit lip, the bottom laid with old pigment that only just glows. Rows are ruled like a worn inscription band.
// A canvas texture for a normal-blended decal. Styles: runic staves, ogham notches, gilded cuneiform wedges, painted
// cartouches, smouldering sigils.
import * as THREE from 'three';
import { rnd } from '../stills/later/kit';

/** Mineral pigments, in sets: each stone takes one set, so neighbours differ. */
export const PIGMENTS: readonly (readonly string[])[] = [
  ['#c8862a', '#a8402a'], // ochre, rust
  ['#4f9a86', '#c8862a'], // verdigris, ochre
  ['#3a5aa8', '#d8cbb0'], // lapis, bone
  ['#a8402a', '#d8a84a'], // rust, old gold
  ['#d8a84a', '#4f9a86'], // old gold, verdigris
  ['#7a4a9a', '#c8862a'], // murex, ochre
];

type Seg = [number, number, number, number];
/** One rune in a unit cell (x 0..1, y 0..1 down): one or two staves, then twigs, chevrons, a lozenge or crossing bars. */
export function runeStrokes(seed: number): Seg[] {
  const r = (k: number) => rnd(seed, k, 811), out: Seg[] = [];
  const twin = r(1) < 0.3, xs = twin ? [0.3, 0.7] : [0.5];
  for (const x of xs) out.push([x, 0.08, x, 0.92]);
  const x0 = xs[0], x1 = xs[xs.length - 1];
  const n = 1 + Math.floor(r(2) * 3);
  for (let i = 0; i < n; i++) {
    const kind = Math.floor(r(10 + i) * 7), y = 0.15 + r(20 + i) * 0.5, side = r(30 + i) < 0.5 ? -1 : 1, s = 0.28;
    switch (kind) {
      case 0: out.push([x1, y, x1 + side * s, y + s * 0.8]); break; // a twig down and out
      case 1: out.push([x1, y + s * 0.8, x1 + side * s, y]); break; // a twig up and out
      case 2: out.push([x0 - s, y, x0, y + s * 0.6], [x0, y + s * 0.6, x0 + s, y]); break; // a chevron on the stave
      case 3: out.push([x0 - s * 0.7, y + 0.1, x1 + s * 0.7, y + 0.25]); break; // a slanted crossbar
      case 4: { const c = y + 0.18; out.push([x0, c - 0.18, x0 + s, c], [x0 + s, c, x0, c + 0.18]); break; } // a bow (ᚦ / ᛒ)
      case 5: { const c = 0.5; out.push([x0 - s * 0.8, c, x0, c - 0.3], [x0, c - 0.3, x0 + s * 0.8, c], [x0 + s * 0.8, c, x0, c + 0.3], [x0, c + 0.3, x0 - s * 0.8, c]); break; } // a lozenge
      default: out.push([x0 - s, 0.12, x0, 0.32], [x0, 0.32, x0 + s, 0.12]); // an arrowhead (ᛏ)
    }
  }
  return out.map((sg) => sg.map((v) => Math.max(0.06, Math.min(0.94, v))) as Seg);
}

/** A glyph in a unit cell: `cut` paths are stroked as grooves, `fill` paths are cut as filled hollows, `paint` is laid
 *  flat on the stone (no cut) before the grooves. */
interface Glyph { cut: Path2D; fill: Path2D; paint: Path2D }
type GlyphFn = (r: (k: number) => number, s: number) => Glyph;
const glyph = (): Glyph => ({ cut: new Path2D(), fill: new Path2D(), paint: new Path2D() });

const runic: GlyphFn = (r, s) => {
  const g = glyph();
  for (const [a, b, c, d] of runeStrokes(Math.floor(r(0) * 1e6))) { g.cut.moveTo(a * s, b * s); g.cut.lineTo(c * s, d * s); }
  return g;
};
/** Ogham: a stem line down the cell, groups of 1–5 notches off it (left, right, across or aslant). */
const ogham: GlyphFn = (r, s) => {
  const g = glyph(), x = s / 2;
  g.cut.moveTo(x, 0); g.cut.lineTo(x, s);
  for (let k = 0; k < 2; k++) {
    const n = 1 + Math.floor(r(10 + k) * 5), kind = Math.floor(r(20 + k) * 4), y0 = s * (0.1 + k * 0.48), dy = s * 0.08;
    for (let i = 0; i < n; i++) {
      const y = y0 + i * dy, L = s * 0.3;
      if (kind === 0) { g.cut.moveTo(x - L, y); g.cut.lineTo(x, y); } else if (kind === 1) { g.cut.moveTo(x, y); g.cut.lineTo(x + L, y); } else if (kind === 2) { g.cut.moveTo(x - L * 0.8, y + dy * 0.6); g.cut.lineTo(x + L * 0.8, y - dy * 0.6); } else { g.cut.moveTo(x - 6, y); g.cut.lineTo(x + 6, y); }
    }
  }
  return g;
};
/** Cuneiform: clusters of wedges, each a triangular head pressed in with a thin tail, mostly level or upright. */
const cuneiform: GlyphFn = (r, s) => {
  const g = glyph(), n = 2 + Math.floor(r(1) * 4);
  for (let i = 0; i < n; i++) {
    const a = [0, Math.PI / 2, Math.PI / 4, 0][Math.floor(r(10 + i) * 4)], len = s * (0.3 + r(20 + i) * 0.35), hw = s * 0.09;
    const cx = s * (0.2 + r(30 + i) * 0.6), cy = s * (0.2 + r(40 + i) * 0.6), ca = Math.cos(a), sa = Math.sin(a);
    const hx = cx - ca * len / 2, hy = cy - sa * len / 2, tx = cx + ca * len / 2, ty = cy + sa * len / 2;
    g.fill.moveTo(hx - sa * hw, hy + ca * hw); g.fill.lineTo(hx + sa * hw, hy - ca * hw); g.fill.lineTo(hx + ca * hw * 2.2, hy + sa * hw * 2.2); g.fill.closePath();
    g.cut.moveTo(hx + ca * hw * 2, hy + sa * hw * 2); g.cut.lineTo(Math.max(4, Math.min(s - 4, tx)), Math.max(4, Math.min(s - 4, ty)));
  }
  return g;
};
/** Cartouches: a rounded frame cut round a painted field, with a sign inside (a ringed dot, a spiral, a comb, waves). */
const cartouche: GlyphFn = (r, s) => {
  const g = glyph(), m = s * 0.08, w = s - 2 * m, rad = s * 0.18;
  g.cut.roundRect(m, m, w, w, rad); g.paint.roundRect(m, m, w, w, rad);
  const c = s / 2, kind = Math.floor(r(1) * 4);
  if (kind === 0) { g.cut.moveTo(c + s * 0.22, c); g.cut.arc(c, c, s * 0.22, 0, Math.PI * 2); g.fill.arc(c, c, s * 0.07, 0, Math.PI * 2); }
  else if (kind === 1) { for (let t = 0; t < 14; t += 0.25) { const rr = s * 0.02 * t, x = c + Math.cos(t) * rr, y = c + Math.sin(t) * rr * 0.9; if (t === 0) g.cut.moveTo(x, y); else g.cut.lineTo(x, y); } }
  else if (kind === 2) { g.cut.moveTo(s * 0.25, s * 0.3); g.cut.lineTo(s * 0.75, s * 0.3); for (let i = 0; i < 4; i++) { const x = s * (0.28 + i * 0.147); g.cut.moveTo(x, s * 0.3); g.cut.lineTo(x, s * 0.7); } }
  else for (let k = 0; k < 3; k++) { const y = s * (0.32 + k * 0.18); g.cut.moveTo(s * 0.22, y); for (let x = 0.22; x <= 0.78; x += 0.04) g.cut.lineTo(s * x, y + Math.sin(x * 22) * s * 0.04); }
  if (r(2) < 0.5) for (let i = 0; i < 3; i++) g.fill.arc(s * (0.3 + i * 0.2), s * 0.84, s * 0.035, 0, Math.PI * 2);
  return g;
};
/** Sigils: a ring (sometimes two), chords between points on it, a crescent or a small ring at a node. */
const sigil: GlyphFn = (r, s) => {
  const g = glyph(), c = s / 2, R = s * 0.36, pts: [number, number][] = [];
  g.cut.moveTo(c + R, c); g.cut.arc(c, c, R, 0, Math.PI * 2);
  if (r(1) < 0.35) { g.cut.moveTo(c + R * 0.55, c); g.cut.arc(c, c, R * 0.55, 0, Math.PI * 2); }
  const n = 3 + Math.floor(r(2) * 3);
  for (let i = 0; i < n; i++) { const a = r(10 + i) * Math.PI * 2; pts.push([c + Math.cos(a) * R, c + Math.sin(a) * R]); }
  for (let i = 0; i < n - 1; i++) { g.cut.moveTo(...pts[i]); g.cut.lineTo(...pts[i + 1]); }
  const [px, py] = pts[0]; g.fill.arc(px, py, s * 0.05, 0, Math.PI * 2);
  if (r(3) < 0.5) { g.cut.moveTo(c + s * 0.12, c - s * 0.1); g.cut.arc(c, c - s * 0.1, s * 0.12, 0, Math.PI, false); }
  return g;
};

export interface RuneStyle {
  id: string; name: string; glyph: GlyphFn;
  /** Pigment sets: each stone takes one (`(i*7) % length`), the gate all of them. */
  pigments: readonly (readonly string[])[];
  /** Groove width (px in a 96 px cell), the pigment's width and alpha, the paint field's alpha; `gild` a bright thin
   *  line along the pigment (gold leaf catching the light); `rule` cut ruled bands between rows. */
  groove: number; pigment: number; pigmentA: number; paintA: number; gild?: string; rule: boolean;
  /** Decal brightness on the stones and on the gate. */
  base: number; gateBase: number;
}

export const RUNE_STYLES: readonly RuneStyle[] = [
  { id: 'runes', name: 'Runic staves, mineral pigments', glyph: runic, pigments: PIGMENTS, groove: 9, pigment: 5.5, pigmentA: 0.9, paintA: 0, rule: true, base: 1.25, gateBase: 1.1 },
  { id: 'ogham', name: 'Ogham notches, lime and red ochre', glyph: ogham, pigments: [['#ddd3bc', '#9a3b26'], ['#9a3b26'], ['#ddd3bc'], ['#b8b0a0', '#6a2a1e']], groove: 8, pigment: 4.5, pigmentA: 0.85, paintA: 0, rule: false, base: 1.2, gateBase: 1.05 },
  { id: 'cuneiform', name: 'Gilded cuneiform wedges', glyph: cuneiform, pigments: [['#b8913e', '#8a6228'], ['#b8913e', '#3c5a9a'], ['#8a6228', '#5f8f7a']], groove: 7, pigment: 4, pigmentA: 0.95, paintA: 0, gild: 'rgba(250,224,150,0.55)', rule: true, base: 1.2, gateBase: 1.05 },
  { id: 'cartouche', name: 'Painted cartouches, jade, cinnabar and Maya blue', glyph: cartouche, pigments: [['#4f94ae', '#b33a2a'], ['#3f8a5a', '#d0a040'], ['#b33a2a', '#3f8a5a'], ['#d0a040', '#4f94ae']], groove: 7, pigment: 3, pigmentA: 0.7, paintA: 0.42, rule: false, base: 1.1, gateBase: 1 },
  { id: 'sigil', name: 'Smouldering sigils, ember in the cuts', glyph: sigil, pigments: [['#a83a1c', '#d8702c'], ['#7a2416', '#c85a24'], ['#c85a24']], groove: 9, pigment: 3.5, pigmentA: 0.85, paintA: 0, gild: 'rgba(255,190,110,0.35)', rule: false, base: 1.3, gateBase: 1.15 },
];
let current: RuneStyle = RUNE_STYLES[0];
/** The style the gate set is built with (a review hook; the game ships the first). */
export const runeStyle = () => current;
export function setRuneStyle(id: string | null): void { current = RUNE_STYLES.find((s) => s.id === id) ?? RUNE_STYLES[0]; }

/** A carved inscription: `cols` × `rows` glyphs; pigments from `pigments` (default: all of the style's). */
export function runeTexture(cols: number, rows: number, seed: number, pigments?: readonly string[], style: RuneStyle = current): THREE.CanvasTexture {
  const cell = 96, cv = document.createElement('canvas'), all = style.pigments.flat(), pg = pigments ?? all;
  cv.width = cols * cell; cv.height = rows * cell;
  const g = cv.getContext('2d')!;
  g.lineCap = 'square'; g.lineJoin = 'miter';
  const R = (i: number, k: number) => rnd(i, k, seed), wg = style.groove;
  const carve = (gl: Glyph, ox: number, oy: number, pigment: string) => {
    const at = (dx: number, dy: number, f: () => void) => { g.save(); g.translate(ox + dx, oy + dy); f(); g.restore(); };
    if (style.paintA) at(0, 0, () => { g.globalAlpha = style.paintA; g.fillStyle = pigment; g.fill(gl.paint); g.globalAlpha = 1; });
    const pass = (dx: number, dy: number, w: number, c: string, a = 1) => at(dx, dy, () => {
      g.globalAlpha = a; g.lineWidth = w; g.strokeStyle = c; g.fillStyle = c; g.stroke(gl.cut);
      if (w > 2) { g.stroke(gl.fill); g.fill(gl.fill); } g.globalAlpha = 1;
    });
    pass(-2, -2, wg + 4, 'rgba(255,214,170,0.22)'); // the lit lip
    pass(2, 3, wg + 3, 'rgba(8,4,6,0.92)'); // the shadow inside the cut
    pass(0, 0, wg, 'rgba(22,12,12,0.96)'); // the groove
    pass(0.5, 1, style.pigment, pigment, style.pigmentA); // pigment in the bottom
    if (style.gild) pass(-0.5, -0.5, 1.4, style.gild);
  };
  const line = (y: number, pigment: string) => { const p = new Path2D(); p.moveTo(cell * 0.02, y); p.lineTo(cols * cell - cell * 0.02, y); carve({ cut: p, fill: new Path2D(), paint: new Path2D() }, 0, 0, pigment); };
  if (style.rule) for (let r = 0; r <= rows; r++) line(r * cell + (r === 0 ? 6 : r === rows ? -6 : 0), all[Math.floor(R(r, 900) * all.length)]);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c;
    if (R(i, 3) < 0.08) continue; // worn away
    const pad = cell * 0.16, s = cell - 2 * pad, seedI = Math.floor(R(i, 5) * 1e6);
    carve(style.glyph((k) => rnd(seedI, k, 811), s), c * cell + pad + (R(i, 1) - 0.5) * 4, r * cell + pad + (R(i, 2) - 0.5) * 4, pg[Math.floor(R(i, 4) * pg.length)]);
  }
  // wear: chips knocked out of the paint and the cuts
  g.globalCompositeOperation = 'destination-out';
  for (let k = 0; k < cols * rows * 3; k++) { g.beginPath(); g.arc(R(k, 7) * cv.width, R(k, 8) * cv.height, 1.5 + R(k, 9) * 4, 0, Math.PI * 2); g.fill(); }
  g.globalCompositeOperation = 'source-over';
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}

/** A carved-rune decal plane (w × h m) facing +z: normal-blended (the cuts darken the stone), fogged like the stone. */
export function runeDecal(tex: THREE.Texture, w: number, h: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.renderOrder = 2;
  return m;
}
