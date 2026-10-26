// Painted glyphs for the gate's inscriptions (#193): rings, eyes, spirals, fish, suns, moons and more in glowing
// orange, gold and cyan paint. Laid out like a real inscription, not a grid: glyphs of every size in ragged lines with
// word dots, the gaps packed with smaller ones. `runeLayout` and `glyphPath` are pure.
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

/** A glyph placed on the panel: centre (x, y), box w × h, turned `rot` rad, `pig` indexes the paint list. */
export interface RunePlace { x: number; y: number; w: number; h: number; rot: number; seed: number; pig: number }
export interface RuneLayout { runes: RunePlace[]; dots: Array<[number, number, number]> }

/** Lay out an inscription on a W × H px panel (`cell` a typical glyph height): ragged lines, each its own height (now
 *  and then a line of great glyphs), glyphs of varied width in words split by dots; then the gaps (line ends, between
 *  lines, round the small glyphs of a big line) filled with smaller glyphs, scattered rather than in rows. */
export function runeLayout(W: number, H: number, seed: number, cell = 96): RuneLayout {
  const out: RuneLayout = { runes: [], dots: [] }, r = (k: number) => rnd(seed, k, 977), pad = cell * 0.12;
  const x0 = pad, y0 = pad, x1 = W - pad, y1 = H - pad, rag = Math.min(1, (x1 - x0) / (cell * 4)); // narrow panels (columns) aren't ragged
  let y = y0, k = 0;
  while (y < y1) {
    const big = r(k++) < 0.14, lh = Math.min(y1 - y, cell * (big ? 1.5 + r(k++) * 0.8 : 0.45 + r(k++) * 0.8));
    if (lh < cell * 0.3) break;
    let x = x0 + r(k++) * cell * 0.6 * rag;
    const end = x1 - r(k++) * cell * 0.8 * rag, base = y + lh / 2, tilt = (r(k++) - 0.5) * 0.04;
    while (x < end) {
      const n = 2 + Math.floor(r(k++) * 5), pig = Math.floor(r(k++) * 64);
      for (let i = 0; i < n && x < end; i++) {
        const w = lh * (0.7 + r(k++) * 0.4), h = lh * (0.6 + r(k++) * 0.32); // not all as tall as the line
        if (x + w > x1) break;
        out.runes.push({ x: x + w / 2, y: base + (x - x0) * tilt + (r(k++) - 0.5) * (lh - h), w, h, rot: tilt + (r(k++) - 0.5) * 0.05, seed: Math.floor(r(k++) * 1e6), pig });
        x += w * (0.95 + r(k++) * 0.25);
      }
      x += lh * 0.12;
      if (x < end) { const d = Math.max(2.5, lh * 0.05); out.dots.push([x, base - lh * 0.12, d]); if (r(k++) < 0.5) out.dots.push([x, base + lh * 0.12, d]); }
      x += lh * 0.22;
    }
    y += lh + cell * (0.04 + r(k++) * 0.14);
  }
  // fill the gaps: an occupancy grid of what's painted, then smaller and smaller glyphs wherever they fit
  const q = 4, gw = Math.ceil(W / q), gh = Math.ceil(H / q), occ = new Uint8Array(gw * gh);
  const span = (cx: number, cy: number, w: number, h: number, m: number) => [Math.max(0, Math.floor((cx - w / 2 - m) / q)), Math.max(0, Math.floor((cy - h / 2 - m) / q)), Math.min(gw - 1, Math.ceil((cx + w / 2 + m) / q)), Math.min(gh - 1, Math.ceil((cy + h / 2 + m) / q))];
  const mark = (cx: number, cy: number, w: number, h: number) => { const [a, b, c, d] = span(cx, cy, w, h, 0); for (let j = b; j <= d; j++) occ.fill(1, j * gw + a, j * gw + c + 1); };
  const free = (cx: number, cy: number, w: number, h: number, m: number) => {
    if (cx - w / 2 < x0 || cx + w / 2 > x1 || cy - h / 2 < y0 || cy + h / 2 > y1) return false;
    const [a, b, c, d] = span(cx, cy, w, h, m);
    for (let j = b; j <= d; j++) for (let i = a; i <= c; i++) if (occ[j * gw + i]) return false;
    return true;
  };
  for (const ru of out.runes) mark(ru.x, ru.y, ru.w * 0.9, ru.h * 0.9);
  for (const [x, y, d] of out.dots) mark(x, y, d * 2, d * 2);
  for (const f of [0.5, 0.36, 0.26, 0.19]) {
    const s = cell * f, step = s * 0.5, tries = Math.ceil((W * H) / (step * step));
    for (let t = 0; t < tries; t++) {
      const cx = x0 + r(k++) * (x1 - x0), cy = y0 + r(k++) * (y1 - y0), w = s * (0.8 + r(k++) * 0.4), h = s * (0.8 + r(k++) * 0.4);
      if (!free(cx, cy, w, h, s * 0.12)) continue;
      out.runes.push({ x: cx, y: cy, w, h, rot: (r(k++) - 0.5) * 0.3, seed: Math.floor(r(k++) * 1e6), pig: Math.floor(r(k++) * 64) });
      mark(cx, cy, w, h);
    }
  }
  return out;
}

/** A painted inscription on a `cols` × `rows` cell panel; paint from `pigments` (default: all). */
export function runeTexture(cols: number, rows: number, seed: number, pigments: readonly string[] = ALL, cell = 96): THREE.CanvasTexture {
  const cv = document.createElement('canvas'), W = cols * 96, H = rows * 96;
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!, lay = runeLayout(W, H, seed, cell);
  g.lineCap = 'round'; g.lineJoin = 'round';
  /** Paint `p` (in a local frame at x, y turned rot) in glowing `c`. */
  const paint = (p: Path2D, x: number, y: number, rot: number, w: number, c: string, a = 1) => {
    g.save(); g.translate(x, y); g.rotate(rot); g.globalAlpha = a; g.lineWidth = w; g.strokeStyle = c; g.shadowColor = c; g.shadowBlur = 6 + w; g.stroke(p); g.restore();
  };
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
