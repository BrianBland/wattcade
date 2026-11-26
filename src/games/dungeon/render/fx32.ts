// Zone atmosphere for the 32 px renderer: Crypt ground fog, falling grit, rising Deep embers, and refracting crystals.
// All of it is pixel-stepped (dithered alpha, 1 px motes) so it matches the art; positions come from time and hashes only.
const hash = (x: number, y: number) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

let fogC: HTMLCanvasElement | null = null;
/** A 192x96 tileable fog sheet: soft banks rendered as ordered dither, so it reads as pixel fog, not a blur. */
function fogTexture(): HTMLCanvasElement {
  if (fogC) return fogC;
  const W = 192, H = 96, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!, d = g.createImageData(W, H), p = d.data;
  const banks = Array.from({ length: 9 }, (_, i) => ({ x: hash(i, 1) * W, y: hash(i, 2) * H, rx: 30 + hash(i, 3) * 40, ry: 8 + hash(i, 4) * 10 }));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = 0;
    for (const b of banks) for (const ox of [-W, 0, W]) for (const oy of [-H, 0, H]) {
      const dx = (x - b.x - ox) / b.rx, dy = (y - b.y - oy) / b.ry, q = 1 - dx * dx - dy * dy; if (q > 0) v += q;
    }
    v = Math.min(1, v * 0.9);
    const th = (BAY[(y & 3) * 4 + (x & 3)] + 0.5) / 16, o = (y * W + x) * 4;
    if (v > th) { p[o] = 200; p[o + 1] = 235; p[o + 2] = 230; p[o + 3] = v > 0.75 ? 120 : 80; }
  }
  g.putImageData(d, 0, 0); fogC = c; return c;
}
/** Low drifting fog over the view (world px origin ox, oy). Draw before lighting so the fog is lit like the floor. */
export function drawFog(g: CanvasRenderingContext2D, ox: number, oy: number, W: number, H: number, t: number) {
  const f = fogTexture();
  const layer = (sx: number, sy: number, a: number) => {
    const x0 = Math.floor(ox - ((ox + t * sx) % f.width + f.width) % f.width), y0 = Math.floor(oy - ((oy + t * sy) % f.height + f.height) % f.height);
    g.globalAlpha = a;
    for (let y = y0; y < oy + H; y += f.height) for (let x = x0; x < ox + W; x += f.width) g.drawImage(f, x, y);
  };
  layer(5, 1.5, 0.45); layer(-8, 0.8, 0.28); g.globalAlpha = 1;
}
/** Specks of grit falling from the ceiling (Keep, Catacombs) or a few dust motes (Crypt). Before lighting. */
export function drawGrit(g: CanvasRenderingContext2D, zone: string, ox: number, oy: number, W: number, H: number, t: number) {
  const n = zone === 'crypt' ? 14 : 22, col = zone === 'catacombs' ? '#ae9674' : zone === 'crypt' ? '#b8c1cc' : '#aba09c';
  g.fillStyle = col;
  for (let i = 0; i < n; i++) {
    const sp = zone === 'crypt' ? 6 : 22 + hash(i, 9) * 26, life = H / sp, ph = (t / life + hash(i, 5)) % 1, cyc = Math.floor(t / life + hash(i, 5));
    const x = ox + hash(i, cyc) * W + Math.sin(t * 1.3 + i) * (zone === 'crypt' ? 6 : 1), y = oy + ph * H;
    g.globalAlpha = ph < 0.1 ? ph * 10 * 0.7 : 0.7; g.fillRect(Math.round(x), Math.round(y), 1, hash(i, 3) > 0.7 ? 2 : 1);
  }
  g.globalAlpha = 1;
}
/** Deep: embers drifting up out of the lava glow, flickering. After lighting (they glow). */
export function drawEmbers(g: CanvasRenderingContext2D, ox: number, oy: number, W: number, H: number, t: number) {
  for (let i = 0; i < 26; i++) {
    const sp = 14 + hash(i, 4) * 18, life = H / sp, ph = (t / life + hash(i, 6)) % 1, cyc = Math.floor(t / life + hash(i, 6));
    const x = ox + hash(i, cyc + 50) * W + Math.sin(t * 1.7 + i * 2) * 4, y = oy + H - ph * H;
    const k = Math.floor(t * 12 + i) % 5;
    g.globalAlpha = ph > 0.8 ? (1 - ph) * 5 : 1;
    g.fillStyle = k === 0 ? '#ffe08a' : k < 3 ? '#ff8a2a' : '#d24a16'; g.fillRect(Math.round(x), Math.round(y), 1, 1);
  }
  g.globalAlpha = 1;
}

let refC: HTMLCanvasElement | null = null;
/** A crystal that bends the light behind it: the lit scene under its silhouette, shifted and split into violet/cyan,
 *  then its own facets laid over at partial strength. `lit` is the lit view canvas whose (0,0) is world (ox, oy). */
export function drawRefracting(g: CanvasRenderingContext2D, sprite: HTMLCanvasElement, x: number, y: number, lit: HTMLCanvasElement, ox: number, oy: number, t: number) {
  const w = sprite.width, h = sprite.height;
  if (!refC) refC = document.createElement('canvas');
  if (refC.width < w || refC.height < h) { refC.width = Math.max(refC.width, w); refC.height = Math.max(refC.height, h); }
  const r = refC.getContext('2d')!; r.setTransform(1, 0, 0, 1, 0, 0); r.clearRect(0, 0, refC.width, refC.height); r.imageSmoothingEnabled = false;
  const wob = Math.round(Math.sin(t * 1.5 + x * 0.1) * 1);
  // behind-the-crystal view, displaced up-left (violet channel) and down-right (cyan channel)
  r.globalCompositeOperation = 'source-over'; r.drawImage(lit, x - ox + 3 + wob, y - oy - 4, w, h, 0, 0, w, h);
  r.globalCompositeOperation = 'multiply'; r.fillStyle = '#c69aff'; r.fillRect(0, 0, w, h);
  r.globalCompositeOperation = 'lighter'; r.globalAlpha = 0.5; r.drawImage(lit, x - ox - 2, y - oy + 2 - wob, w, h, 0, 0, w, h); r.globalAlpha = 1;
  r.globalCompositeOperation = 'multiply'; r.fillStyle = '#9ae8ff'; r.globalAlpha = 0.35; r.fillRect(0, 0, w, h); r.globalAlpha = 1;
  r.globalCompositeOperation = 'destination-in'; r.drawImage(sprite, 0, 0);
  r.globalCompositeOperation = 'source-over';
  g.drawImage(sprite, Math.round(x), Math.round(y));
  g.globalAlpha = 0.75; g.drawImage(refC, 0, 0, w, h, Math.round(x), Math.round(y), w, h);
  g.globalAlpha = 0.28; g.globalCompositeOperation = 'lighter'; g.drawImage(sprite, Math.round(x), Math.round(y));
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
}
