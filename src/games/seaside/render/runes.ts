// Carved runes for the gate's inscriptions (#193): angular staves and twigs cut into the stone, each groove a dark
// shadowed channel with a lit lip, the bottom laid with old mineral pigment (ochre, rust, verdigris, lapis, bone, gold)
// that only just glows. Rows are ruled like a worn inscription band. A canvas texture for a normal-blended decal.
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

/** A carved inscription: `cols` × `rows` runes, ruled bands between rows; pigments from `pigments` (default: all). */
export function runeTexture(cols: number, rows: number, seed: number, pigments: readonly string[] = ALL): THREE.CanvasTexture {
  const cell = 96, cv = document.createElement('canvas');
  cv.width = cols * cell; cv.height = rows * cell;
  const g = cv.getContext('2d')!;
  g.lineCap = 'square'; g.lineJoin = 'miter';
  const R = (i: number, k: number) => rnd(i, k, seed);
  const groove = (segs: Seg[], ox: number, oy: number, w: number, h: number, pigment: string) => {
    const path = (dx: number, dy: number) => { g.beginPath(); for (const [a, b, c, d] of segs) { g.moveTo(ox + a * w + dx, oy + b * h + dy); g.lineTo(ox + c * w + dx, oy + d * h + dy); } };
    g.lineWidth = 13; g.strokeStyle = 'rgba(255,214,170,0.22)'; path(-2, -2); g.stroke(); // the lit lip
    g.lineWidth = 12; g.strokeStyle = 'rgba(8,4,6,0.92)'; path(2, 3); g.stroke(); // the shadow inside the cut
    g.lineWidth = 9; g.strokeStyle = 'rgba(22,12,12,0.96)'; path(0, 0); g.stroke(); // the groove
    g.lineWidth = 5.5; g.strokeStyle = pigment; g.globalAlpha = 0.9; path(0.5, 1); g.stroke(); g.globalAlpha = 1; // pigment in the bottom
  };
  // ruled bands: a cut line above and below each row
  for (let r = 0; r <= rows; r++) groove([[0.02, 0, cols - 0.02, 0]], 0, r * cell + (r === 0 ? 6 : r === rows ? -6 : 0), cell, 1, ALL[Math.floor(R(r, 900) * ALL.length)]);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c;
    if (R(i, 3) < 0.08) continue; // worn away
    const pad = cell * 0.16, pg = pigments[Math.floor(R(i, 4) * pigments.length)];
    groove(runeStrokes(Math.floor(R(i, 5) * 1e6)), c * cell + pad + (R(i, 1) - 0.5) * 4, r * cell + pad + (R(i, 2) - 0.5) * 4, cell - 2 * pad, cell - 2 * pad, pg);
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
