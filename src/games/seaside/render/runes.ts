// Painted glyphs for the gate's inscriptions (#193): rings, eyes, spirals, fish, suns, moons and more in glowing
// orange, gold and cyan paint. Laid out like a real inscription, not a grid: glyphs of every size in ragged lines with
// word dots, a serpent band carrying the text round a few great glyphs, or a patchwork of panels. `runeLayout` and
// `glyphPath` are pure.
import * as THREE from 'three';
import { rnd } from '../stills/later/kit';

/** Glowing paint, in sets: each stone takes one set, so neighbours differ (orange, gold and cyan, as first painted). */
export const PIGMENTS: readonly (readonly string[])[] = [
  ['#ffb347', '#7affea'], // orange, cyan
  ['#ffd27a', '#7affea'], // gold, cyan
  ['#ffb347', '#ffd27a'], // orange, gold
  ['#7affea'], // cyan
  ['#ffb347'], // orange
  ['#7affea', '#ffb347', '#ffd27a'],
];
const ALL = PIGMENTS.flat();

/** The painted glyph kinds (rings, eyes, spirals, fish, ladders, suns, gates, waves, moons, bolts, …). */
export const GLYPH_KINDS = 14;
/** Draw glyph `kind` into `g`, centred on 0, 0 within ±s (round-capped strokes). */
export function glyphPath(g: Pick<CanvasPath, 'moveTo' | 'lineTo' | 'arc' | 'quadraticCurveTo' | 'bezierCurveTo' | 'closePath'>, kind: number, s: number): void {
  const ring = (x: number, y: number, r: number) => { g.moveTo(x + r, y); g.arc(x, y, r, 0, Math.PI * 2); };
  switch (kind % GLYPH_KINDS) {
    case 0: ring(0, 0, s); ring(0, 0, s * 0.35); break; // ringed eye
    case 1: g.moveTo(-s, 0); g.quadraticCurveTo(0, -s * 1.2, s, 0); g.quadraticCurveTo(0, s * 1.2, -s, 0); ring(0, 0, s * 0.18); break; // eye
    case 2: for (let a = 0; a < 12; a += 0.25) { const rr = (a / 12) * s, x = Math.cos(a) * rr, y = Math.sin(a) * rr; if (a === 0) g.moveTo(x, y); else g.lineTo(x, y); } break; // spiral
    case 3: g.moveTo(-s, 0); g.quadraticCurveTo(0, -s * 0.8, s * 0.5, 0); g.quadraticCurveTo(0, s * 0.8, -s, 0); g.moveTo(s * 0.5, 0); g.lineTo(s, -s * 0.5); g.lineTo(s, s * 0.5); g.closePath(); break; // fish
    case 4: g.moveTo(-s * 0.5, -s); g.lineTo(-s * 0.5, s); g.moveTo(s * 0.5, -s); g.lineTo(s * 0.5, s); for (let k = -2; k <= 2; k++) { g.moveTo(-s * 0.5, k * s * 0.4); g.lineTo(s * 0.5, k * s * 0.4); } break; // ladder
    case 5: ring(0, 0, s * 0.4); for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; g.moveTo(Math.cos(a) * s * 0.6, Math.sin(a) * s * 0.6); g.lineTo(Math.cos(a) * s, Math.sin(a) * s); } break; // sun
    case 6: g.moveTo(-s, s); g.lineTo(0, -s); g.lineTo(s, s); g.moveTo(-s * 0.5, s * 0.2); g.lineTo(s * 0.5, s * 0.2); break; // mountain / gate
    case 7: g.moveTo(-s, -s * 0.3); g.bezierCurveTo(-s * 0.3, -s * 1.2, s * 0.3, s * 0.6, s, -s * 0.3); g.moveTo(0, s * 0.2); g.lineTo(0, s); g.moveTo(-s * 0.6, s); g.lineTo(s * 0.6, s); break; // wave over a stand
    case 8: g.moveTo(s * 0.3, -s * 0.95); g.arc(0, 0, s, -1.25, 1.25, true); g.quadraticCurveTo(-s * 0.5, 0, s * 0.3, -s * 0.95); break; // crescent moon
    case 9: g.moveTo(s * 0.4, -s); g.lineTo(-s * 0.4, -s * 0.1); g.lineTo(s * 0.4, s * 0.1); g.lineTo(-s * 0.4, s); break; // bolt
    case 10: g.moveTo(0, -s); g.lineTo(s, s * 0.8); g.lineTo(-s, s * 0.8); g.closePath(); ring(0, s * 0.25, s * 0.2); break; // eye in a triangle
    case 11: ring(0, 0, s); g.moveTo(0, -s); g.lineTo(0, s); g.moveTo(-s, 0); g.lineTo(s, 0); break; // cross in a ring
    case 12: for (let k = -1; k <= 1; k++) { g.moveTo(-s, k * s * 0.55); for (let x = -1; x <= 1.001; x += 0.125) g.lineTo(x * s, k * s * 0.55 + Math.sin(x * 6) * s * 0.18); } break; // three waves
    default: g.moveTo(-s, -s * 0.1); g.quadraticCurveTo(-s * 0.5, -s * 0.8, 0, s * 0.1); g.quadraticCurveTo(s * 0.5, -s * 0.8, s, -s * 0.1); ring(0, s * 0.6, s * 0.15); // a bird over a seed
  }
}

/** A rune placed on the panel: centre (x, y), box w × h, turned `rot` rad, `pig` indexes the pigment list. */
export interface RunePlace { x: number; y: number; w: number; h: number; rot: number; seed: number; pig: number }
export interface RuneLayout { runes: RunePlace[]; lines: Array<Array<[number, number]>>; dots: Array<[number, number, number]> }
export type LayoutKind = 'flow' | 'serpent' | 'panels';
export const LAYOUTS: readonly LayoutKind[] = ['flow', 'serpent', 'panels'];

/** Ragged lines of runes in [x0, x1] × [y0, y1]: each line its own height (now and then a line of great runes), runes of
 *  varied width in words split by dots, sometimes a cut rule under the line. `cell` is a typical rune height. */
function flow(out: RuneLayout, x0: number, y0: number, x1: number, y1: number, cell: number, r: (k: number) => number, k0: number) {
  let y = y0, k = k0;
  while (y < y1) {
    const big = r(k++) < 0.14, lh = Math.min(y1 - y, cell * (big ? 1.5 + r(k++) * 0.8 : 0.45 + r(k++) * 0.8));
    if (lh < cell * 0.3) break;
    const rag = Math.min(1, (x1 - x0) / (cell * 4)); // narrow panels (columns) aren't ragged
    let x = x0 + r(k++) * cell * 0.6 * rag;
    const end = x1 - r(k++) * cell * 0.8 * rag, base = y + lh / 2, tilt = (r(k++) - 0.5) * 0.04;
    while (x < end) {
      const n = 2 + Math.floor(r(k++) * 5), pig = Math.floor(r(k++) * 64);
      for (let i = 0; i < n && x < end; i++) {
        const w = lh * (0.7 + r(k++) * 0.4);
        if (x + w > x1) break;
        out.runes.push({ x: x + w / 2, y: base + (x - x0) * tilt + (r(k++) - 0.5) * lh * 0.06, w, h: lh * 0.92, rot: tilt + (r(k++) - 0.5) * 0.05, seed: Math.floor(r(k++) * 1e6), pig });
        x += w * (0.95 + r(k++) * 0.25);
      }
      x += lh * 0.12;
      if (x < end) { const d = Math.max(2.5, lh * 0.05); out.dots.push([x, base - lh * 0.12, d]); if (r(k++) < 0.5) out.dots.push([x, base + lh * 0.12, d]); }
      x += lh * 0.22;
    }
    if (r(k++) < 0.55 && y + lh + 4 < y1) out.lines.push([[x0, y + lh + 3], [(x0 + x1) / 2, y + lh + 3 + (r(k++) - 0.5) * 6], [x1, y + lh + 3]]);
    y += lh + cell * (0.08 + r(k++) * 0.18);
  }
  return k;
}

/** Lay out an inscription on a W × H px panel. */
export function runeLayout(kind: LayoutKind, W: number, H: number, seed: number, cell = 96): RuneLayout {
  const out: RuneLayout = { runes: [], lines: [], dots: [] }, r = (k: number) => rnd(seed, k, 977), pad = cell * 0.12;
  if (kind === 'flow') { flow(out, pad, pad, W - pad, H - pad, cell, r, 0); return out; }
  if (kind === 'serpent') {
    // a band round the panel (a squarish loop, open at the bottom), runes running along it, great runes inside
    const bw = cell * 0.9, cx = W / 2, cy = H / 2, a = W / 2 - pad - bw / 2, b = H / 2 - pad - bw / 2, N = 600;
    const at = (t: number): [number, number] => { const c = Math.cos(t), s = Math.sin(t); return [cx + a * Math.sign(c) * Math.abs(c) ** 0.35, cy + b * Math.sign(s) * Math.abs(s) ** 0.35]; };
    const t0 = Math.PI / 2 + 0.22, t1 = Math.PI / 2 + Math.PI * 2 - 0.22, pts: [number, number][] = [];
    for (let i = 0; i <= N; i++) pts.push(at(t0 + (t1 - t0) * i / N));
    const edge = (o: number) => pts.map(([x, y], i) => { const [px, py] = pts[Math.max(0, i - 1)], [nx, ny] = pts[Math.min(N, i + 1)], l = Math.hypot(nx - px, ny - py) || 1; return [x - (ny - py) / l * o, y + (nx - px) / l * o] as [number, number]; });
    out.lines.push(edge(bw / 2), edge(-bw / 2));
    let k = 0, i = 4, pig = 0;
    while (i < N - 4) {
      const w = bw * (0.8 + r(k++) * 0.3), [x, y] = pts[i], [nx, ny] = pts[Math.min(N, i + 2)];
      if (r(k++) < 0.18) { out.dots.push([x, y, 3]); i += 6; pig = Math.floor(r(k++) * 64); continue; }
      out.runes.push({ x, y, w, h: bw * 0.78, rot: Math.atan2(ny - y, nx - x), seed: Math.floor(r(k++) * 1e6), pig });
      let d = 0; while (i < N - 4 && d < w * 1.05) { d += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); i++; }
    }
    // the inside: two or three great runes over a few ragged lines
    const ix0 = pad + bw * 1.4, ix1 = W - pad - bw * 1.4, iy0 = pad + bw * 1.4, iy1 = H - pad - bw * 1.7, n = 2 + Math.floor(r(k++) * 2);
    const gh = (iy1 - iy0) * 0.5, gw = Math.min(gh * 0.95, (ix1 - ix0) / n * 0.8);
    for (let j = 0; j < n; j++) out.runes.push({ x: ix0 + (ix1 - ix0) * (j + 0.5) / n, y: iy0 + gh / 2, w: gw, h: gh, rot: (r(k++) - 0.5) * 0.06, seed: Math.floor(r(k++) * 1e6), pig: Math.floor(r(k++) * 64) });
    flow(out, ix0, iy0 + gh + cell * 0.2, ix1, iy1, cell * 0.6, r, k);
    return out;
  }
  // panels: the face split into framed fields of different sizes, each a great rune, a block of text or worn blank
  let k = 0;
  const split = (x0: number, y0: number, x1: number, y1: number, depth: number) => {
    const w = x1 - x0, h = y1 - y0;
    if (depth > 0 && (w > cell * 2.5 || h > cell * 2.5) && r(k++) < 0.85) {
      const vert = w > h ? r(k++) < 0.8 : r(k++) < 0.2, f = 0.3 + r(k++) * 0.4;
      if (vert) { const m = x0 + w * f; split(x0, y0, m, y1, depth - 1); split(m, y0, x1, y1, depth - 1); }
      else { const m = y0 + h * f; split(x0, y0, x1, m, depth - 1); split(x0, m, x1, y1, depth - 1); }
      return;
    }
    const g = cell * 0.1;
    out.lines.push([[x0 + g, y0 + g], [x1 - g, y0 + g], [x1 - g, y1 - g], [x0 + g, y1 - g], [x0 + g, y0 + g]]);
    const pick = r(k++);
    if (pick < 0.25 && h > cell * 1.2) { const rh = h - 5 * g, rw = Math.min(w - 5 * g, rh); out.runes.push({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: rw, h: rh, rot: 0, seed: Math.floor(r(k++) * 1e6), pig: Math.floor(r(k++) * 64) }); }
    else if (pick < 0.92) k = flow(out, x0 + 2.5 * g, y0 + 2.5 * g, x1 - 2.5 * g, y1 - 2.5 * g, cell * (0.5 + r(k++) * 0.6), r, k + 100);
  };
  split(pad, pad, W - pad, H - pad, 5);
  return out;
}

let current: LayoutKind = 'flow';
/** The layout the gate's inscription is built with (a review hook; the game ships 'flow'). */
export const runeLayoutKind = () => current;
export function setRuneLayout(k: string | null): void { current = (LAYOUTS as readonly string[]).includes(k ?? '') ? k as LayoutKind : 'flow'; }

/** A painted inscription on a `cols` × `rows` cell panel; paint from `pigments` (default: all). */
export function runeTexture(cols: number, rows: number, seed: number, pigments: readonly string[] = ALL, kind: LayoutKind = 'flow', cell = 96): THREE.CanvasTexture {
  const cv = document.createElement('canvas'), W = cols * 96, H = rows * 96;
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!, lay = runeLayout(kind, W, H, seed, cell);
  g.lineCap = 'round'; g.lineJoin = 'round';
  /** Paint `p` (in a local frame at x, y turned rot) in glowing `c`. */
  const paint = (p: Path2D, x: number, y: number, rot: number, w: number, c: string, a = 1) => {
    g.save(); g.translate(x, y); g.rotate(rot); g.globalAlpha = a; g.lineWidth = w; g.strokeStyle = c; g.shadowColor = c; g.shadowBlur = 6 + w; g.stroke(p); g.restore();
  };
  for (const ln of lay.lines) { const p = new Path2D(); ln.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); paint(p, 0, 0, 0, 3, ALL[Math.floor(rnd(ln.length, Math.round(ln[0][1]), seed) * ALL.length)], 0.55); }
  for (const [x, y, d] of lay.dots) { const p = new Path2D(); p.arc(0, 0, d * 0.5, 0, Math.PI * 2); paint(p, x, y, 0, d * 1.2, ALL[Math.floor(rnd(Math.round(x), Math.round(y), seed) * ALL.length)]); }
  lay.runes.forEach((ru, i) => {
    if (rnd(i, 3, seed) < 0.06) return; // worn away
    const q = (k: number) => rnd(ru.seed, k, 5), p = new Path2D(), s = Math.min(ru.w, ru.h) * 0.42, kind = Math.floor(q(1) * GLYPH_KINDS);
    // variety: a glyph may be squashed or stretched, mirrored, carry a small glyph inside or beside it, or a dot
    const sx = (q(4) < 0.5 ? -1 : 1) * (0.75 + q(5) * 0.5), sy = 0.75 + q(6) * 0.5, m = new DOMMatrix().scale(sx, sy);
    const main = new Path2D(); glyphPath(main, kind, s); p.addPath(main, m);
    const extra = q(7);
    if (extra < 0.18) { const inner = new Path2D(); glyphPath(inner, kind + 1 + Math.floor(q(8) * (GLYPH_KINDS - 1)), s * 0.3); p.addPath(inner); }
    else if (extra < 0.36) { const sat = new Path2D(); glyphPath(sat, Math.floor(q(9) * GLYPH_KINDS), s * 0.28); p.addPath(sat, new DOMMatrix().translate(s * 0.95, -s * 0.85)); }
    else if (extra < 0.6) { p.moveTo(s * 1.05, -s * 0.9); p.arc(s * 0.9, -s * 0.9, Math.max(2, s * 0.06), 0, Math.PI * 2); }
    paint(p, ru.x, ru.y, ru.rot, Math.max(3, Math.min(14, s * (0.1 + q(10) * 0.1))), pigments[ru.pig % pigments.length], 0.8 + q(11) * 0.2);
  });
  // wear: chips knocked out of the paint and the cuts, and a few broad weathered patches
  const R = (i: number, k: number) => rnd(i, k, seed);
  g.globalCompositeOperation = 'destination-out';
  for (let k = 0; k < cols * rows * 3; k++) { g.beginPath(); g.arc(R(k, 7) * W, R(k, 8) * H, 1.5 + R(k, 9) * 4, 0, Math.PI * 2); g.fill(); }
  for (let k = 0; k < Math.ceil(cols * rows / 12); k++) {
    const x = R(k, 17) * W, y = R(k, 18) * H, rr = 40 + R(k, 19) * 110, gr = g.createRadialGradient(x, y, 0, x, y, rr);
    gr.addColorStop(0, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rr, y - rr, 2 * rr, 2 * rr);
  }
  g.globalCompositeOperation = 'source-over';
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}

/** A glowing painted-glyph decal plane (w × h m) facing +z: additive, unfogged; its colour (> 1) sets the glow. */
export function runeDecal(tex: THREE.Texture, w: number, h: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  m.renderOrder = 2;
  return m;
}
