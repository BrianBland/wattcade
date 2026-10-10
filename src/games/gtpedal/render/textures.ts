// Procedural textures generated at load from code (no image files, no canvas: works in tests too).
// - faceAtlas: 4×4 cells (64 px): rows = 4 face variants, cols = expressions (neutral, angry, scared, dazed)
// - fabric: tileable grey detail (folds, seams, weave, grime) multiplied into clothing colours
import * as THREE from 'three';

export const EXPR = { neutral: 0, angry: 1, scared: 2, dazed: 3 } as const;
export type Expr = (typeof EXPR)[keyof typeof EXPR];

type Px = { d: Uint8Array; N: number };
const put = (p: Px, x: number, y: number, c: number[], a = 1) => {
  if (x < 0 || y < 0 || x >= p.N || y >= p.N) return;
  const i = (y * p.N + x) * 4, k = a * (c[3] ?? 255) / 255;
  for (let j = 0; j < 3; j++) p.d[i + j] = Math.round(p.d[i + j] * (1 - k) + c[j] * k);
  p.d[i + 3] = Math.max(p.d[i + 3], Math.round(255 * Math.min(1, a)));
};
/** filled ellipse, centre (cx,cy), radii (rx,ry), soft-ish edge */
function ell(p: Px, cx: number, cy: number, rx: number, ry: number, c: number[]) {
  for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
    const q = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry); if (q < 1.05) put(p, x, y, c, q < 0.9 ? 1 : (1.05 - q) / 0.15);
  }
}
/** thick line segment */
function seg(p: Px, x0: number, y0: number, x1: number, y1: number, w: number, c: number[]) {
  const mnx = Math.floor(Math.min(x0, x1) - w), mxx = Math.ceil(Math.max(x0, x1) + w), mny = Math.floor(Math.min(y0, y1) - w), mxy = Math.ceil(Math.max(y0, y1) + w);
  const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1;
  for (let y = mny; y <= mxy; y++) for (let x = mnx; x <= mxx; x++) {
    const t = Math.max(0, Math.min(1, ((x + 0.5 - x0) * dx + (y + 0.5 - y0) * dy) / L2)), d = Math.hypot(x + 0.5 - x0 - dx * t, y + 0.5 - y0 - dy * t);
    if (d < w / 2 + 0.6) put(p, x, y, c, d < w / 2 - 0.4 ? 1 : (w / 2 + 0.6 - d));
  }
}
const INK = [43, 29, 20], WHITE = [244, 238, 226], MOUTH = [110, 45, 40], STUB = [60, 45, 35, 70];

function face(p: Px, ox: number, oy: number, variant: number, expr: number) {
  // cell-local coords: (0,0) bottom-left, 64×64; face centred at x 32, eyes at y ~36, mouth y ~18
  const X = (x: number) => ox + x, Y = (y: number) => oy + y;
  const sp = [10, 11.5, 9.5, 10.5][variant], er = [3.8, 3.4, 4.2, 3.6][variant], bw = [2.2, 3.2, 1.8, 2.6][variant], mw = [7, 6, 8, 7.5][variant];
  if (variant === 3) for (let i = 0; i < 40; i++) { const a = (i * 2.399) % 6.28, r = 7 + (i * 37 % 9); put(p, Math.round(X(32 + Math.cos(a) * r * 1.3)), Math.round(Y(15 + Math.sin(a) * r * 0.55)), STUB, 1); } // stubble
  for (const s of [-1, 1]) {
    const ex = 32 + s * sp, ey = 36;
    if (expr === 3) { // dazed: X eyes
      seg(p, X(ex - 3), Y(ey - 3), X(ex + 3), Y(ey + 3), 1.8, INK); seg(p, X(ex - 3), Y(ey + 3), X(ex + 3), Y(ey - 3), 1.8, INK);
      continue;
    }
    const big = expr === 2 ? 1.5 : 1;
    ell(p, X(ex), Y(ey), er * 1.25 * big, er * 1.45 * big, WHITE);
    ell(p, X(ex + (expr === 1 ? -s * 0.6 : 0)), Y(ey - (expr === 2 ? 0 : 0.4)), er * 0.72 * (expr === 2 ? 0.8 : 1), er * 0.82 * (expr === 2 ? 0.8 : 1), INK);
    // brows
    const by = ey + er * 1.45 * big + 3;
    if (expr === 1) seg(p, X(ex - s * 4.5), Y(by + 2), X(ex + s * 3.5), Y(by - 2.5), bw + 0.6, INK);       // angry: down toward the nose
    else if (expr === 2) seg(p, X(ex - s * 4), Y(by), X(ex + s * 4), Y(by + 2.5), bw, INK);                 // scared: up and in
    else seg(p, X(ex - 4), Y(by), X(ex + 4), Y(by + 0.6 * s * (variant % 2 ? 1 : -1)), bw, INK);             // neutral
  }
  // mouth
  if (expr === 0) seg(p, X(32 - mw / 2), Y(18), X(32 + mw / 2), Y(18.8 + (variant === 1 ? 1 : 0)), 1.8, INK);
  else if (expr === 1) { seg(p, X(32 - mw / 2), Y(16), X(32), Y(18.5), 2, INK); seg(p, X(32), Y(18.5), X(32 + mw / 2), Y(16), 2, INK); ell(p, X(32), Y(17.3), mw * 0.32, 1.1, WHITE); } // grimace with teeth
  else if (expr === 2) { ell(p, X(32), Y(16), 3.8, 5, INK); ell(p, X(32), Y(15.5), 2.6, 3.6, MOUTH); }   // AAAH
  else { for (let i = 0; i < 4; i++) seg(p, X(32 - 7 + i * 3.5), Y(17 + (i % 2 ? 1.5 : -1)), X(32 - 7 + (i + 1) * 3.5), Y(17 + (i % 2 ? -1 : 1.5)), 1.6, INK); } // woozy squiggle
}

let FACES: THREE.DataTexture | undefined;
export function faceAtlas(): THREE.DataTexture {
  if (FACES) return FACES;
  const N = 256, p: Px = { d: new Uint8Array(N * N * 4), N };
  for (let v = 0; v < 4; v++) for (let e = 0; e < 4; e++) face(p, e * 64, v * 64, v, e);
  FACES = new THREE.DataTexture(p.d, N, N); FACES.magFilter = THREE.LinearFilter; FACES.minFilter = THREE.LinearFilter; FACES.colorSpace = THREE.SRGBColorSpace; FACES.needsUpdate = true;
  return FACES;
}
/** atlas cell index for (variant, expression) */
export const faceCell = (variant: number, expr: number) => (variant % 4) * 4 + (expr % 4);

let FABRIC: THREE.DataTexture | undefined;
export function fabricTex(): THREE.DataTexture {
  if (FABRIC) return FABRIC;
  const N = 64, d = new Uint8Array(N * N * 4);
  const h = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N;
    let g = 0.9;
    g += (h(x, y) - 0.5) * 0.07;                                                            // weave speckle
    g -= Math.max(0, Math.sin((v * 3 + Math.sin(u * 6.28 * 2) * 0.12) * 6.28)) ** 6 * 0.16;    // fold creases
    g += Math.max(0, Math.sin((v * 3 + 0.08 + Math.sin(u * 6.28 * 2) * 0.12) * 6.28)) ** 8 * 0.06; // fold highlights
    if (x === 31 || x === 32) g -= 0.12; if ((x === 30 || x === 33) && y % 4 < 2) g -= 0.06;  // seam + stitching
    if (y < 5) g -= 0.08 * (1 - y / 5);                                                      // hem
    const gr = h(Math.floor(x / 6), Math.floor(y / 6)); if (gr > 0.86) g -= 0.1 * (gr - 0.86) / 0.14; // grime blotches
    const c = Math.round(255 * Math.max(0, Math.min(1, g))), i = (y * N + x) * 4;
    d[i] = c; d[i + 1] = c; d[i + 2] = Math.round(c * 0.97); d[i + 3] = 255;
  }
  FABRIC = new THREE.DataTexture(d, N, N); FABRIC.wrapS = FABRIC.wrapT = THREE.RepeatWrapping; FABRIC.magFilter = THREE.LinearFilter; FABRIC.minFilter = THREE.LinearFilter; FABRIC.needsUpdate = true;
  return FABRIC;
}
