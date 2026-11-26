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

let cfM: HTMLCanvasElement | null = null, cfR: HTMLCanvasElement | null = null;
/** Deep crystal floor slabs: the lit scene seen through the glass (shifted, violet), plus a slow sheen sweeping across.
 *  Drawn under the actors, so it uses the previous frame's lit view (origin lox, loy). `mask` is the 512 px floor-crystal mask (tiled like the floor texture); `clip` adds the open-tile path in world px. */
export function drawCrystalFloor(g: CanvasRenderingContext2D, sheet: CanvasImageSource, mask: [number, number, number, number], lit: HTMLCanvasElement, lox: number, loy: number,
  ox: number, oy: number, W: number, H: number, t: number, clip: (c: CanvasRenderingContext2D) => void) {
  const mk = (c: HTMLCanvasElement | null) => { const n = c ?? document.createElement('canvas'); if (n.width !== W || n.height !== H) { n.width = W; n.height = H; } return n; };
  cfM = mk(cfM); cfR = mk(cfR);
  const m = cfM.getContext('2d')!, r = cfR.getContext('2d')!, S = mask[2];
  m.setTransform(1, 0, 0, 1, 0, 0); m.clearRect(0, 0, W, H); m.imageSmoothingEnabled = false;
  m.save(); m.translate(-ox, -oy); clip(m); m.clip();
  for (let y = Math.floor(oy / S) * S; y < oy + H; y += S) for (let x = Math.floor(ox / S) * S; x < ox + W; x += S) m.drawImage(sheet, mask[0], mask[1], S, mask[3], x, y, S, mask[3]);
  m.restore();
  // what the glass shows: the lit room displaced, deepened to violet, with a cyan fringe the other way
  r.setTransform(1, 0, 0, 1, 0, 0); r.globalAlpha = 1; r.globalCompositeOperation = 'copy'; r.imageSmoothingEnabled = false;
  const wob = Math.round(Math.sin(t * 0.9) * 1);
  r.drawImage(lit, lox - ox + 3 + wob, loy - oy - 3);
  r.globalCompositeOperation = 'multiply'; r.fillStyle = '#b98cff'; r.fillRect(0, 0, W, H);
  r.globalCompositeOperation = 'lighter'; r.globalAlpha = 0.35; r.drawImage(lit, lox - ox - 3, loy - oy + 3 - wob); r.globalAlpha = 1;
  r.globalCompositeOperation = 'multiply'; r.globalAlpha = 0.4; r.fillStyle = '#8fe6ff'; r.fillRect(0, 0, W, H); r.globalAlpha = 1;
  // a sheen: a band of 1 px diagonal lines drifting across the glass
  r.globalCompositeOperation = 'lighter'; r.fillStyle = '#5a3a8a';
  const period = 260, off = ((t * 40) % period + period) % period;
  for (let b = -H; b < W; b += period) for (let k = 0; k < 10; k += 2) { r.beginPath(); const x0 = b + off + k; r.moveTo(x0, 0); r.lineTo(x0 + 1, 0); r.lineTo(x0 + 1 + H * 0.6, H); r.lineTo(x0 + H * 0.6, H); r.fill(); }
  r.globalCompositeOperation = 'destination-in'; r.drawImage(cfM, 0, 0);
  r.globalCompositeOperation = 'source-over';
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.2; g.drawImage(cfR, 0, 0); g.restore();
}

// ---------------------------------------------------------------- damage numbers
const DIG: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'], '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '011', '001', '111'], '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'], '7': ['111', '001', '010', '010', '010'], '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'], '+': ['000', '010', '111', '010', '000'], '-': ['000', '000', '111', '000', '000'],
};
const numCache = new Map<string, HTMLCanvasElement>();
/** A number as chunky world-pixel digits with a 1 px dark outline and a lighter top row (cached per text+colour+size). */
function numberSprite(text: string, color: string, s: number): HTMLCanvasElement {
  const key = text + color + s; let c = numCache.get(key); if (c) return c;
  // glyphs at scale s, then a 1 px 4-neighbour dark rim at final resolution (no filled box between digits)
  const gw = text.length * 4 - 1, W = gw * s + 2, H = 5 * s + 2; c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!, on = (px: number, py: number) => {
    const x = Math.floor((px - 1) / s), y = Math.floor((py - 1) / s); if (px < 1 || py < 1 || x >= gw || y >= 5) return false;
    const ch = text[Math.floor(x / 4)], gl = ch && DIG[ch]; return !!gl && x % 4 < 3 && gl[y][x % 4] === '1'; };
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    if (on(px, py)) { g.fillStyle = py - 1 < s ? '#ffffff' : py - 1 >= 4 * s ? shadeHex(color, 0.7) : color; g.fillRect(px, py, 1, 1); }
    else if (on(px - 1, py) || on(px + 1, py) || on(px, py - 1) || on(px, py + 1)) { g.fillStyle = '#100d1c'; g.fillRect(px, py, 1, 1); }
  }
  if (numCache.size > 400) numCache.clear(); numCache.set(key, c); return c;
}
function shadeHex(hex: string, k: number): string {
  const m = /^#?([0-9a-f]{6})/i.exec(hex); if (!m) return hex; const n = parseInt(m[1], 16);
  const f = (v: number) => Math.round(v * k).toString(16).padStart(2, '0');
  return '#' + f(n >> 16) + f((n >> 8) & 255) + f(n & 255);
}
export const isNumberText = (t: string | undefined) => !!t && /^[+-]?\d{1,6}$/.test(t);
/** Damage/coin numbers in world pixels: they hop up, hang, then fall back a little while fading; crits are double size and shake. */
export function drawNumber32(g: CanvasRenderingContext2D, text: string, color: string, x: number, y: number, k: number, big: boolean, seed: number) {
  const s = big ? 2 : 1, c = numberSprite(text, color, s);
  const rise = k < 0.35 ? 1 - (1 - k / 0.35) ** 3 : 1 - (k - 0.35) * 0.25;
  const dx = (seed % 7 - 3) * (2 + k * 2), shake = big && k < 0.15 ? ((Math.floor(k * 60) % 2) * 2 - 1) : 0;
  g.globalAlpha = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
  g.drawImage(c, Math.round(x - c.width / 2 + dx + shake), Math.round(y - rise * (big ? 18 : 13) - c.height));
  g.globalAlpha = 1;
}

/** Lights mirrored in still water: a broken column of wobbling dashes below each light, on pool pixels only. Emissive ('lighter'). */
export function drawPoolLights(g: CanvasRenderingContext2D, tiles: Array<{ x: number; y: number }>, isSwamp: (x: number, y: number) => boolean,
  lights: ReadonlyArray<{ x: number; y: number; r: number; c: readonly [number, number, number] }>, t: number, ts = 32) {
  if (!tiles.length || !lights.length) return;
  g.save(); g.globalCompositeOperation = 'lighter';
  for (const l of lights) {
    const lx = Math.round(l.x), reach = l.r * 1.1;
    for (const q of tiles) {
      const px = q.x * ts, py = q.y * ts; if (lx < px - 10 || lx > px + ts + 10) continue;
      const top = py + (isSwamp(q.x, q.y - 1) ? 0 : 6), bot = py + ts - (isSwamp(q.x, q.y + 1) ? 0 : 3);
      const x0 = px + (isSwamp(q.x - 1, q.y) ? 0 : 2), x1 = px + ts - (isSwamp(q.x + 1, q.y) ? 0 : 2);
      for (let y = top + ((top - Math.round(l.y)) & 1); y < bot; y += 2) {
        const d = y - l.y; if (d < 4 || d > reach) continue;
        const k = 1 - d / reach, w = Math.max(1, Math.round((2 + 4 * k) * (0.7 + 0.3 * Math.sin(t * 5 + y * 0.9)))), cx = lx + Math.round(Math.sin(t * 2.3 + y * 0.45) * (1 + d * 0.04));
        if ((Math.floor(t * 6 + y * 0.37) % 5) === 0) continue; // broken column
        const a = Math.max(x0, cx - (w >> 1)), b = Math.min(x1, cx - (w >> 1) + w); if (b <= a) continue;
        g.globalAlpha = 0.75 * k * k; g.fillStyle = `rgb(${l.c[0]},${l.c[1]},${l.c[2]})`; g.fillRect(a, y, b - a, 1);
        if (k > 0.6 && w > 3) { g.fillStyle = '#fff4dc'; g.globalAlpha = 0.35 * k; g.fillRect(cx, y, 1, 1); }
      }
    }
  }
  g.restore();
}

/** Stance swap (emissive, world px, x/y = hero's feet): the old colour snaps inward, a stepped ring of the new colour
 *  bursts out along the floor, a light pillar rises through the hero, and pixel sparks shed outward. k: 0→1 over ~0.5 s. */
export function drawStanceSwap(g: CanvasRenderingContext2D, x: number, y: number, k: number, color: string, from: string, t: number) {
  const X = Math.round(x), Y = Math.round(y), e = 1 - (1 - k) ** 3;
  g.save();
  // old colour collapses in the first fifth
  if (k < 0.22) { const r = Math.round(18 * (1 - k / 0.22)) + 2; g.fillStyle = from; g.globalAlpha = 0.8; stepRing(g, X, Y - 10, r, r, 1); }
  // light pillar
  const ph = Math.round(44 * Math.min(1, k * 3)), pw = Math.max(1, Math.round(10 * (1 - k)));
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = 0.55 * (1 - k); g.fillStyle = color; g.fillRect(X - pw, Y - ph, pw * 2, ph);
  g.globalAlpha = 0.7 * (1 - k); g.fillStyle = '#ffffff'; g.fillRect(X - (pw >> 1), Y - ph, Math.max(1, pw), ph);
  // floor ring (flattened for the 3/4 view), two steps thick, plus a fainter echo
  g.globalAlpha = 0.95 * (1 - k); g.fillStyle = color; stepRing(g, X, Y - 1, 4 + e * 26, (4 + e * 26) * 0.45, 2);
  g.globalAlpha = 0.5 * (1 - k); stepRing(g, X, Y - 1, 2 + e * 16, (2 + e * 16) * 0.45, 1);
  // sparks
  g.fillStyle = '#ffffff';
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2 + 0.3, d = 6 + e * (18 + (i % 3) * 6), sx = X + Math.round(Math.cos(a) * d), sy = Y - 12 + Math.round(Math.sin(a) * d * 0.7) - Math.round(k * 10);
    g.globalAlpha = (1 - k) * (i % 2 ? 1 : 0.7); g.fillStyle = i % 3 ? color : '#ffffff'; g.fillRect(sx, sy, k < 0.5 ? 2 : 1, k < 0.5 ? 2 : 1);
  }
  void t; g.restore();
}
function stepRing(g: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, th: number) {
  const n = Math.max(16, Math.round(rx * 1.6));
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; g.fillRect(Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry), th, th); }
}
