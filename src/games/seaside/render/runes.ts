// Carved runes for the gate's inscriptions (#193): angular staves and twigs cut into the stone, each groove a dark
// shadowed channel with a lit lip, the bottom laid with old mineral pigment (ochre, rust, verdigris, lapis, bone, gold)
// that only just glows. Laid out like a real inscription, not a grid: runes of every size in ragged lines with word
// dots, a serpent band carrying the text round a few great runes, or a patchwork of panels. `runeLayout` is pure.
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
const ALL = PIGMENTS.flat();

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
    let x = x0 + r(k++) * cell * 0.6;
    const end = x1 - r(k++) * cell * 0.8, base = y + lh / 2, tilt = (r(k++) - 0.5) * 0.04;
    while (x < end) {
      const n = 2 + Math.floor(r(k++) * 5), pig = Math.floor(r(k++) * 64);
      for (let i = 0; i < n && x < end; i++) {
        const w = lh * (0.32 + r(k++) * 0.45);
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
      const w = bw * (0.38 + r(k++) * 0.3), [x, y] = pts[i], [nx, ny] = pts[Math.min(N, i + 2)];
      if (r(k++) < 0.18) { out.dots.push([x, y, 3]); i += 6; pig = Math.floor(r(k++) * 64); continue; }
      out.runes.push({ x, y, w, h: bw * 0.78, rot: Math.atan2(ny - y, nx - x), seed: Math.floor(r(k++) * 1e6), pig });
      let d = 0; while (i < N - 4 && d < w * 1.05) { d += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); i++; }
    }
    // the inside: two or three great runes over a few ragged lines
    const ix0 = pad + bw * 1.4, ix1 = W - pad - bw * 1.4, iy0 = pad + bw * 1.4, iy1 = H - pad - bw * 1.7, n = 2 + Math.floor(r(k++) * 2);
    const gh = (iy1 - iy0) * 0.5, gw = Math.min(gh * 0.55, (ix1 - ix0) / n * 0.8);
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
    if (pick < 0.25 && h > cell * 1.2) { const rh = h - 5 * g, rw = Math.min(w - 5 * g, rh * 0.6); out.runes.push({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: rw, h: rh, rot: 0, seed: Math.floor(r(k++) * 1e6), pig: Math.floor(r(k++) * 64) }); }
    else if (pick < 0.92) k = flow(out, x0 + 2.5 * g, y0 + 2.5 * g, x1 - 2.5 * g, y1 - 2.5 * g, cell * (0.5 + r(k++) * 0.6), r, k + 100);
  };
  split(pad, pad, W - pad, H - pad, 5);
  return out;
}

let current: LayoutKind = 'flow';
/** The layout the gate's inscription is built with (a review hook; the game ships 'flow'). */
export const runeLayoutKind = () => current;
export function setRuneLayout(k: string | null): void { current = (LAYOUTS as readonly string[]).includes(k ?? '') ? k as LayoutKind : 'flow'; }

/** A carved inscription on a `cols` × `rows` cell panel; pigments from `pigments` (default: all). */
export function runeTexture(cols: number, rows: number, seed: number, pigments: readonly string[] = ALL, kind: LayoutKind = 'flow', cell = 96): THREE.CanvasTexture {
  const cv = document.createElement('canvas'), W = cols * 96, H = rows * 96;
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!, lay = runeLayout(kind, W, H, seed, cell);
  g.lineCap = 'square'; g.lineJoin = 'miter';
  /** Cut `p` (in a local frame at x, y turned rot): a lit lip, a shadow in the cut, the groove, pigment in its bottom. */
  const carve = (p: Path2D, x: number, y: number, rot: number, wg: number, pigment: string) => {
    const pass = (dx: number, dy: number, w: number, c: string, a = 1) => { g.save(); g.translate(x + dx, y + dy); g.rotate(rot); g.globalAlpha = a; g.lineWidth = w; g.strokeStyle = c; g.stroke(p); g.restore(); };
    const o = Math.max(1, wg / 4.5);
    pass(-o, -o, wg + 4, 'rgba(255,214,170,0.22)');
    pass(o, o * 1.5, wg + 3, 'rgba(8,4,6,0.92)');
    pass(0, 0, wg, 'rgba(22,12,12,0.96)');
    pass(o / 4, o / 2, wg * 0.6, pigment, 0.9);
  };
  for (const ln of lay.lines) { const p = new Path2D(); ln.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); carve(p, 0, 0, 0, 6, ALL[Math.floor(rnd(ln.length, Math.round(ln[0][1]), seed) * ALL.length)]); }
  for (const [x, y, d] of lay.dots) { const p = new Path2D(); p.arc(0, 0, d, 0, Math.PI * 2); carve(p, x, y, 0, d * 1.6, ALL[Math.floor(rnd(Math.round(x), Math.round(y), seed) * ALL.length)]); }
  lay.runes.forEach((ru, i) => {
    if (rnd(i, 3, seed) < 0.06) return; // worn away
    const p = new Path2D();
    for (const [a, b, c, d] of runeStrokes(ru.seed)) { p.moveTo((a - 0.5) * ru.w, (b - 0.5) * ru.h); p.lineTo((c - 0.5) * ru.w, (d - 0.5) * ru.h); }
    carve(p, ru.x, ru.y, ru.rot, Math.max(4, Math.min(22, ru.h * 0.11)), pigments[ru.pig % pigments.length]);
  });
  // wear: chips knocked out of the paint and the cuts, and a few broad weathered patches
  const R = (i: number, k: number) => rnd(i, k, seed);
  g.globalCompositeOperation = 'destination-out';
  for (let k = 0; k < cols * rows * 3; k++) { g.beginPath(); g.arc(R(k, 7) * W, R(k, 8) * H, 1.5 + R(k, 9) * 4, 0, Math.PI * 2); g.fill(); }
  for (let k = 0; k < Math.ceil(cols * rows / 12); k++) {
    const x = R(k, 17) * W, y = R(k, 18) * H, rr = 40 + R(k, 19) * 110, gr = g.createRadialGradient(x, y, 0, x, y, rr);
    gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rr, y - rr, 2 * rr, 2 * rr);
  }
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
