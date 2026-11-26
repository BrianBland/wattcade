// The dungeon floor in the 32 px zone art: floors, damp wall bases, 1.5-tile wall faces, capstone wall tops with lit trims,
// pits, pools/mud/lava, baked decor and wall hangings. Rasterised lazily in chunks (same scheme as the 16 px background).
import { TILE, type World } from '../sim/world';
import { ATLAS, sheetImage, zoneOf, type ZoneId, type Rect } from './art32';

export const T32 = 32;
const RISE = 16, FH = 48, TEX = 512, CHUNK = 8;
const hash = (x: number, y: number) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
/** Wall-face torches: deterministic, spaced along faces. */
export const torchAt32 = (x: number, y: number) => (x + y * 3) % 7 === 0 && hash(x, y) > 0.35;

export interface Decor { x: number; y: number; name: string }
export interface FloorInfo {
  zone: ZoneId; torches: Array<{ x: number; y: number }>; pillars: Array<{ x: number; y: number }>;
  swamp: Array<{ x: number; y: number }>; decor: Decor[];
}
export function floorInfo(w: World): FloorInfo {
  const zone = zoneOf(w.theme), at = (x: number, y: number) => (x < 0 || y < 0 || x >= w.w || y >= w.h ? TILE.WALL : w.tiles[y * w.w + x]);
  const torches: FloorInfo['torches'] = [], pillars: FloorInfo['pillars'] = [], swamp: FloorInfo['swamp'] = [], decor: Decor[] = [];
  const Z = ATLAS.zones[zone], inRoom = (x: number, y: number) => w.rooms.some((r) => x >= r.x0 && y >= r.y0 && x < r.x0 + r.w && y < r.y0 + r.h);
  for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) {
    const k = at(x, y);
    if (k === TILE.WALL && at(x, y + 1) !== TILE.WALL && torchAt32(x, y)) torches.push({ x, y });
    if (k === TILE.PILLAR) pillars.push({ x, y });
    if (k === TILE.SWAMP) swamp.push({ x, y });
    // decor stands against the back wall of rooms, never on doors, stairs, pits or water, and never next to a door
    if (k === TILE.FLOOR && at(x, y - 1) === TILE.WALL && inRoom(x, y) && at(x - 1, y) !== TILE.DOOR && at(x + 1, y) !== TILE.DOOR && hash(x * 7, y * 13) > 0.82)
      decor.push({ x, y, name: Z.decor[Math.floor(hash(x, y * 5) * Z.decor.length)] });
  }
  return { zone, torches, pillars, swamp, decor };
}

const chunkPool: HTMLCanvasElement[] = [];
export interface FloorBg32 { draw(g: CanvasRenderingContext2D, sx: number, sy: number, sw: number, sh: number): void; prefill(budgetMs: number, fx?: number, fy?: number): void; release(): void }
const masks = new Map<number, HTMLCanvasElement>();
/** damp-band masks for a floor tile: bit 1 wall above, 2 wall left, 4 wall right */
function dampMask(bits: number): HTMLCanvasElement {
  let c = masks.get(bits);
  if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = T32; const g = c.getContext('2d')!; g.fillStyle = '#fff';
  for (let y = 0; y < T32; y++) for (let x = 0; x < T32; x++) {
    let on = false; const chk = (x + y) % 2 === 0;
    if (bits & 1) on = on || y < 5 || (y < 11 && (chk || y < 9));
    if (bits & 2) on = on || x < 2 || (x < 4 && chk);
    if (bits & 4) on = on || x > 29 || (x > 27 && chk);
    if (on) g.fillRect(x, y, 1, 1);
  }
  masks.set(bits, c); return c;
}
const scratch = (() => { let c: HTMLCanvasElement | null = null; return () => { if (!c) { c = document.createElement('canvas'); c.width = c.height = T32; } return c; }; })();

export function buildBackground32(w: World, info: FloorInfo): FloorBg32 | null {
  const sheet = sheetImage(info.zone); if (!sheet) return null;
  const Z = ATLAS.zones[info.zone], R = Z.rects, ramp = Z.ramp;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w.w || y >= w.h ? TILE.WALL : w.tiles[y * w.w + x]);
  const isW = (x: number, y: number) => at(x, y) === TILE.WALL, face = (x: number, y: number) => isW(x, y) && !isW(x, y + 1);
  const blit = (g: CanvasRenderingContext2D, r: Rect, ox: number, oy: number, sw: number, sh: number, dx: number, dy: number) => g.drawImage(sheet, r[0] + ox, r[1] + oy, sw, sh, dx, dy, sw, sh);
  const decorAt = new Map<number, string>(); for (const d of info.decor) decorAt.set(d.y * w.w + d.x, d.name);
  const floorTile = (g: CanvasRenderingContext2D, x: number, y: number) => {
    const px = x * T32, py = y * T32, tx = (x * T32) % TEX, ty = (y * T32) % TEX;
    blit(g, R.floor, tx, ty, T32, T32, px, py);
    const bits = (isW(x, y - 1) ? 1 : 0) | (isW(x - 1, y) ? 2 : 0) | (isW(x + 1, y) ? 4 : 0);
    if (bits) { // damp, darker band where the floor meets the walls (one ramp step, chunky dither edge)
      const s = scratch(), sg = s.getContext('2d')!; sg.globalCompositeOperation = 'source-over'; sg.clearRect(0, 0, T32, T32);
      sg.drawImage(sheet, R.floorDark[0] + tx, R.floorDark[1] + ty, T32, T32, 0, 0, T32, T32);
      sg.globalCompositeOperation = 'destination-in'; sg.drawImage(dampMask(bits), 0, 0); sg.globalCompositeOperation = 'source-over';
      g.drawImage(s, px, py);
    }
  };
  const tile = (g: CanvasRenderingContext2D, x: number, y: number, facesOnly: boolean) => {
    const k = at(x, y), px = x * T32, py = y * T32;
    if (k === TILE.WALL) {
      if (face(x, y)) {
        blit(g, R.face, (x * T32) % TEX, 0, T32, FH, px, py - RISE);
        if (isW(x - 1, y) && !face(x - 1, y)) { g.fillStyle = ramp[2]; g.fillRect(px, py - RISE, 1, FH); g.fillStyle = ramp[3]; g.fillRect(px + 1, py - RISE, 1, FH); }
        if (isW(x + 1, y) && !face(x + 1, y)) { g.fillStyle = ramp[2]; g.fillRect(px + 31, py - RISE, 1, FH); g.fillStyle = ramp[4]; g.fillRect(px + 30, py - RISE, 1, FH); }
        if (!facesOnly) { // hangings and torch brackets on the face
          const tr = R.torch, hang = Z.hang;
          if (torchAt32(x, y) && tr) blit(g, tr, 0, 0, tr[2], tr[3], px + 16 - (tr[2] >> 1), py - 2);
          else if (hang.length && hash(x * 3, y * 11) > 0.84) { const hr = R['hang:' + hang[Math.floor(hash(x, y) * hang.length)]]; if (hr) blit(g, hr, 0, 0, hr[2], hr[3], px + 16 - (hr[2] >> 1), py - RISE + 4); }
        }
        return;
      }
      if (facesOnly) return;
      let near = false;
      for (let dy = -1; dy <= 2 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (!isW(x + dx, y + dy)) { near = true; break; }
      if (!near) { g.fillStyle = '#07060b'; g.fillRect(px, py, T32, T32); return; }   // solid rock far from any room
      blit(g, R.top, (x * T32) % TEX, (y * T32) % TEX, T32, T32, px, py);
      // the lit rim where a wall top meets the room: outermost pixel first
      const band = (edge: 'r' | 'l' | 't', from = 0) => {
        const cols = { r: [4, 7, 6, 2], l: [5, 7, 6, 2], t: [8, 7, 6, 2] }[edge];
        cols.forEach((c, i) => { g.fillStyle = ramp[c];
          if (edge === 'r') g.fillRect(px + 31 - i, py + from, 1, T32 - from);
          else if (edge === 'l') g.fillRect(px + i, py + from, 1, T32 - from);
          else g.fillRect(px, py + i, T32, 1); });
      };
      if (!isW(x + 1, y) || face(x + 1, y)) band('r'); else if (face(x + 1, y + 1)) band('r', RISE);
      if (!isW(x - 1, y) || face(x - 1, y)) band('l'); else if (face(x - 1, y + 1)) band('l', RISE);
      if (!isW(x, y - 1)) band('t');
      return;
    }
    if (facesOnly) return;
    floorTile(g, x, y);
    if (k === TILE.PIT) {
      g.fillStyle = '#030206'; g.fillRect(px, py, T32, T32);
      if (at(x, y - 1) !== TILE.PIT) { const rows = [5, 5, 4, 4, 4, 3, 5, 4, 3, 3, 3, 2, 4, 3, 2, 2, 1, 1]; rows.forEach((c, i) => { g.fillStyle = ramp[c]; g.fillRect(px, py + i, T32, 1); }); }
      if (at(x - 1, y) !== TILE.PIT) { g.fillStyle = ramp[3]; g.fillRect(px, py, 2, T32); }
      if (at(x + 1, y) !== TILE.PIT) { g.fillStyle = ramp[1]; g.fillRect(px + 30, py, 2, T32); }
      if (at(x, y + 1) !== TILE.PIT) { g.fillStyle = ramp[6]; g.fillRect(px, py + 31, T32, 1); g.fillStyle = ramp[4]; g.fillRect(px, py + 30, T32, 1); }
      return;
    }
    if (k === TILE.SWAMP) { drawPoolBase(g, info.zone, ramp, x, y, (dx, dy) => at(x + dx, y + dy) === TILE.SWAMP); return; }
    const dn = decorAt.get(y * w.w + x);
    if (dn) { const r = R['decor:' + dn]; if (r && r[2] <= 34) { // contact shadow, then the prop standing at the back of the tile
      g.fillStyle = '#04020880'; g.fillRect(px + 16 - (r[2] >> 1) + 2, py + 13, r[2] - 4, 3);
      blit(g, r, 0, 0, r[2], r[3], px + 16 - (r[2] >> 1), py + 15 - r[3]); } }
  };
  const cw = Math.ceil(w.w / CHUNK), ch = Math.ceil(w.h / CHUNK), S = CHUNK * T32;
  const chunks: (HTMLCanvasElement | null)[] = new Array(cw * ch).fill(null);
  let built = 0;
  const make = (i: number) => {
    const cx = i % cw, cy = (i / cw) | 0, c = chunkPool.pop() ?? document.createElement('canvas');
    if (c.width !== S) c.width = c.height = S;
    const g = c.getContext('2d')!; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, S, S); g.imageSmoothingEnabled = false; g.translate(-cx * S, -cy * S);
    const yEnd = Math.min(w.h, (cy + 1) * CHUNK);
    for (let y = cy * CHUNK; y < yEnd; y++) for (let x = cx * CHUNK; x < Math.min(w.w, (cx + 1) * CHUNK); x++) tile(g, x, y, false);
    if (yEnd < w.h) for (let x = cx * CHUNK; x < Math.min(w.w, (cx + 1) * CHUNK); x++) tile(g, x, yEnd, true);   // faces rising in from the row below
    chunks[i] = c; built++; return c;
  };
  return {
    draw(g, sx, sy, sw, sh) {
      for (let cy = Math.max(0, Math.floor(sy / S)); cy <= Math.min(ch - 1, Math.floor((sy + sh) / S)); cy++)
        for (let cx = Math.max(0, Math.floor(sx / S)); cx <= Math.min(cw - 1, Math.floor((sx + sw) / S)); cx++)
          g.drawImage(chunks[cy * cw + cx] ?? make(cy * cw + cx), cx * S, cy * S);
    },
    release() { for (let i = 0; i < chunks.length; i++) { const c = chunks[i]; if (c) { if (chunkPool.length < 200) chunkPool.push(c); chunks[i] = null; } } built = 0; },
    prefill(budgetMs, fx = 0, fy = 0) {
      const t0 = performance.now();
      while (built < chunks.length && performance.now() - t0 < budgetMs) {
        let best = -1, bd = Infinity;
        for (let i = 0; i < chunks.length; i++) if (!chunks[i]) { const d = Math.hypot((i % cw + 0.5) * S - fx, (((i / cw) | 0) + 0.5) * S - fy); if (d < bd) { bd = d; best = i; } }
        make(best);
      }
    },
  };
}

/** Static base of a pool tile: water (Keep, Crypt), mud (Catacombs), or cooled crust under live lava (Deep). */
function drawPoolBase(g: CanvasRenderingContext2D, zone: ZoneId, ramp: string[], x: number, y: number, sw: (dx: number, dy: number) => boolean) {
  const px = x * T32, py = y * T32;
  const body = zone === 'catacombs' ? ['#1c120c', '#2e1f14', '#46301e', '#5e4430'] : zone === 'deep' ? ['#1a0604', '#3a1008', '#5a1a0a', '#7a2a10'] : ['#121a2a', '#1e3048', '#36557a', '#6a93b8'];
  g.fillStyle = body[1]; g.fillRect(px, py, T32, T32);
  if (!sw(0, -1)) { g.fillStyle = ramp[3]; g.fillRect(px, py, T32, 1); g.fillStyle = ramp[2]; g.fillRect(px, py + 1, T32, 2); g.fillStyle = body[0]; g.fillRect(px, py + 3, T32, 2); }
  if (!sw(-1, 0)) { g.fillStyle = body[2]; g.fillRect(px, py, 1, T32); }
  if (!sw(1, 0)) { g.fillStyle = body[0]; g.fillRect(px + 31, py, 1, T32); }
  if (!sw(0, 1)) { g.fillStyle = ramp[6]; g.fillRect(px, py + 31, T32, 1); }
  if (zone !== 'deep') for (let i = 0; i < 3; i++) { // still highlights on the surface
    const hx = Math.floor(hash(x * 5 + i, y * 3) * 24), hy = 6 + Math.floor(hash(x, y * 7 + i) * 22), ln = 3 + Math.floor(hash(x + i, y) * 6);
    g.fillStyle = body[2]; g.fillRect(px + hx, py + hy, ln, 1);
  }
}

// ---------------------------------------------------------------- live surfaces
const LAVA = ['#5a1206', '#9a2a0a', '#d24a16', '#ff8a2a', '#ffc04a', '#ffe08a'];
let lavaC: HTMLCanvasElement | null = null, lavaFrame = -1;
/** 64x64 flowing lava texture for the current time (stepped ramp, sine-band flow); rebuilt at 12 fps. */
export function lavaTexture(t: number): HTMLCanvasElement {
  const f = Math.floor(t * 12);
  if (!lavaC) { lavaC = document.createElement('canvas'); lavaC.width = lavaC.height = 64; }
  if (f === lavaFrame) return lavaC;
  lavaFrame = f; const g = lavaC.getContext('2d')!, d = g.createImageData(64, 64), p = d.data, tt = f / 12;
  const rgb = LAVA.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const a = 2 * Math.PI / 64;
    let v = Math.sin(x * a * 2 + tt * 1.1 + Math.sin(y * a * 3 + tt * 0.7) * 1.6) * 0.5 + Math.sin(y * a * 2 - tt * 0.8 + Math.sin(x * a + tt) * 1.2) * 0.35 + Math.sin((x + y) * a * 3 + tt * 1.7) * 0.2;
    v = (v + 1.05) / 2.1;
    const k = Math.max(0, Math.min(5, Math.floor(v * 6))), o = (y * 64 + x) * 4;
    p[o] = rgb[k][0]; p[o + 1] = rgb[k][1]; p[o + 2] = rgb[k][2]; p[o + 3] = 255;
  }
  g.putImageData(d, 0, 0); return lavaC;
}
/** Lava over visible swamp tiles of the Deep, with a cooled crust skin along every bank. Emissive: call after lighting. */
export function drawLava(g: CanvasRenderingContext2D, tiles: Array<{ x: number; y: number }>, isSwamp: (x: number, y: number) => boolean, t: number) {
  const tex = lavaTexture(t);
  for (const q of tiles) {
    const px = q.x * T32, py = q.y * T32, ox = (q.x * T32) % 64, oy = (q.y * T32) % 64;
    g.drawImage(tex, ox, oy, 32, 32, px, py, 32, 32);
    g.fillStyle = '#3a1008';
    if (!isSwamp(q.x, q.y - 1)) { g.fillRect(px, py, 32, 4); g.fillStyle = '#7a2a10'; g.fillRect(px, py + 4, 32, 1); g.fillStyle = '#3a1008'; }
    if (!isSwamp(q.x - 1, q.y)) g.fillRect(px, py, 2, 32);
    if (!isSwamp(q.x + 1, q.y)) g.fillRect(px + 30, py, 2, 32);
    if (!isSwamp(q.x, q.y + 1)) g.fillRect(px, py + 30, 32, 2);
    // a bubble now and then
    const b = (t * 0.7 + hashF(q.x, q.y)) % 1;
    if (b < 0.25) { const bx = px + 6 + Math.floor(hashF(q.x * 3, q.y) * 20), by = py + 8 + Math.floor(hashF(q.x, q.y * 3) * 16); g.fillStyle = b < 0.12 ? '#ffe08a' : '#9a2a0a'; g.fillRect(bx, by, 2, 2); }
  }
}
const hashF = (x: number, y: number) => hash(x * 31 + 7, y * 17 + 3);
/** Moving glints on water and mud. */
export function drawPoolGlints(g: CanvasRenderingContext2D, zone: ZoneId, tiles: Array<{ x: number; y: number }>, t: number) {
  if (zone === 'deep') return;
  g.fillStyle = zone === 'catacombs' ? '#6e5440' : '#9ac4e8';
  for (const q of tiles) for (let i = 0; i < 2; i++) {
    const ph = (t * 0.4 + hashF(q.x + i, q.y)) % 1; if (ph > 0.5) continue;
    const x = q.x * T32 + 4 + Math.floor(hashF(q.x, q.y + i) * 22) + Math.round(Math.sin(t * 2 + i) * 1), y = q.y * T32 + 8 + Math.floor(hashF(q.x * 2 + i, q.y) * 20);
    g.fillRect(x, y, ph < 0.25 ? 4 : 2, 1);
  }
}
