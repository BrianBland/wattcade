// The dungeon floor in the 32 px zone art: floors, damp wall bases, 1.5-tile wall faces, capstone wall tops with lit trims,
// pits, pools/mud/lava, baked decor and wall hangings. Rasterised lazily in chunks (same scheme as the 16 px background).
import { TILE, type World } from '../sim/world';
import { ATLAS, sheetImage, zoneOf, type ZoneId, type Rect } from './art32';

export const T32 = 32;
const RISE = 16, FH = 48, TEX = 512, CHUNK = 8;
const hash = (x: number, y: number) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
/** Wall-face torches: deterministic, spaced along faces. */
export const torchAt32 = (x: number, y: number) => (x + y * 3) % 7 === 0 && hash(x, y) > 0.35;

/** A standing prop baked into the floor: `cx`/`foot` are world px (centre and ground line). */
export interface Decor { x: number; y: number; name: string; cx: number; foot: number }
/** A flat detail painted on the floor, top-left at world px. */
export interface Decal { name: string; px: number; py: number; ch?: number }
/** Floor pieces that glow (lava fissures, rune seals): redrawn over the lighting. */
export const GLOW_DECALS: Record<string, { c: [number, number, number]; r: number; i: number }> = {
  fissure: { c: [255, 120, 40], r: 70, i: 0.9 }, fissure2: { c: [255, 120, 40], r: 60, i: 0.85 }, rune: { c: [190, 120, 255], r: 90, i: 0.9 },
  shards: { c: [180, 130, 255], r: 70, i: 0.7 }, shards2: { c: [180, 130, 255], r: 56, i: 0.6 }, shards3: { c: [180, 130, 255], r: 90, i: 0.8 },
};
/** A prop that gives off its own light. */
export interface PropLight { key: string; x: number; y: number; r: number; c: [number, number, number]; i: number; name: string; cx: number; foot: number }
export interface FloorInfo {
  zone: ZoneId; torches: Array<{ x: number; y: number }>; pillars: Array<{ x: number; y: number }>;
  swamp: Array<{ x: number; y: number }>; decor: Decor[]; decals: Decal[]; lit: PropLight[]; glow: Decal[];
}
/** Per zone: furniture for corners and back walls, small things for side walls, and which props glow (colour, radius, intensity). */
const DRESS: Record<ZoneId, { big: string[]; small: string[] }> = {
  keep: { big: ['barrel', 'crate', 'barrel', 'pillar', 'borne'], small: ['candelabra', 'crate', 'barrel'] },
  crypt: { big: ['sarcophagus', 'tomb', 'coffin', 'urn'], small: ['urn', 'candles', 'urn'] },
  catacombs: { big: ['skulls', 'sack', 'skulls', 'borne'], small: ['skullCandle', 'sack', 'skullCandle'] },
  deep: { big: ['stalagmite0', 'crystalL', 'stalagmite1', 'crystalM', 'stalagmite2', 'crystalL'], small: ['glowcaps', 'crystalS', 'glowcaps'] },
};
export const PROP_LIGHT: Record<string, { c: [number, number, number]; r: number; i: number; glow: boolean }> = {
  candelabra: { c: [255, 200, 120], r: 70, i: 0.75, glow: false },
  candles: { c: [255, 200, 120], r: 62, i: 0.7, glow: false },
  skullCandle: { c: [255, 190, 110], r: 64, i: 0.7, glow: false },
  crystalS: { c: [170, 110, 255], r: 80, i: 0.85, glow: true },
  crystalM: { c: [170, 110, 255], r: 100, i: 0.95, glow: true },
  crystalL: { c: [180, 120, 255], r: 130, i: 1.05, glow: true },
  glowcaps: { c: [90, 230, 200], r: 50, i: 0.65, glow: true },
};
export function floorInfo(w: World): FloorInfo {
  const zone = zoneOf(w.theme), at = (x: number, y: number) => (x < 0 || y < 0 || x >= w.w || y >= w.h ? TILE.WALL : w.tiles[y * w.w + x]);
  const torches: FloorInfo['torches'] = [], pillars: FloorInfo['pillars'] = [], swamp: FloorInfo['swamp'] = [];
  for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) {
    const k = at(x, y);
    if (k === TILE.WALL && at(x, y + 1) !== TILE.WALL && torchAt32(x, y)) torches.push({ x, y });
    if (k === TILE.PILLAR) pillars.push({ x, y });
    if (k === TILE.SWAMP) swamp.push({ x, y });
  }
  const { decor, decals } = dress(w, zone, at);
  const lit: PropLight[] = [];
  for (const d of decor) { const L = PROP_LIGHT[d.name]; if (L) lit.push({ key: `d${d.cx},${d.foot}`, x: d.cx, y: d.foot - 10, r: L.r, c: L.c, i: L.i, name: d.name, cx: d.cx, foot: d.foot }); }
  const glow = decals.filter((d) => GLOW_DECALS[d.name]), Z = ATLAS.zones[zone];
  for (const d of glow) {
    const L = GLOW_DECALS[d.name], r = Z.rects['decal:' + d.name]; if (!r) continue;
    const n = r[2] > 70 ? 3 : r[2] > 50 ? 2 : 1;
    for (let i = 0; i < n; i++) { const x = d.px + Math.round(r[2] * (i + 0.5) / n), y = d.py + (r[3] >> 1); lit.push({ key: `g${x},${y}`, x, y, r: L.r, c: L.c, i: L.i, name: '', cx: x, foot: y }); }
  }
  return { zone, torches, pillars, swamp, decor, decals, lit, glow };
}

/** Hand-dressing rules, applied per room: corner clusters, furniture along the back wall, small things hugging the side walls,
 *  and floor details (rubble, bones, graves, chalk, relics, a carpet) scattered over open floor. Never near doors or stairs. */
function dress(w: World, zone: ZoneId, at: (x: number, y: number) => number): { decor: Decor[]; decals: Decal[] } {
  const decor: Decor[] = [], decals: Decal[] = [], D = DRESS[zone], Z = ATLAS.zones[zone];
  const W = (x: number, y: number) => at(x, y) === TILE.WALL, F = (x: number, y: number) => at(x, y) === TILE.FLOOR;
  const busy = (x: number, y: number) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const k = at(x + dx, y + dy); if (k === TILE.DOOR || k === TILE.STAIRS) return true; } return false; };
  const taken = new Set<number>(), pick = (list: string[], h: number) => list[Math.floor(h * list.length) % list.length];
  const size = (n: string) => Z.rects['decor:' + n] ?? Z.rects['decal:' + n];
  const put = (x: number, y: number, name: string, cx: number, foot: number) => { if (size(name)) { decor.push({ x, y, name, cx, foot }); taken.add(y * w.w + x); } };
  for (const r of w.rooms) {
    const x1 = r.x0 + r.w - 1, y1 = r.y0 + r.h - 1;
    for (const q of [r.chest, r.shrine]) if (q) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) taken.add((Math.floor(q.y) + dy) * w.w + Math.floor(q.x) + dx);
    for (let y = r.y0; y <= y1; y++) for (let x = r.x0; x <= x1; x++) {
      if (!F(x, y) || busy(x, y) || taken.has(y * w.w + x)) continue;
      const top = W(x, y - 1), left = W(x - 1, y), right = W(x + 1, y), h = hash(x * 7 + 1, y * 13 + 5), h2 = hash(x * 3, y * 29 + 11);
      const px = x * T32, py = y * T32;
      if (top && (left || right)) {               // corner: a big piece and a small one beside it
        if (h < 0.75) {
          const big = pick(D.big.filter((n) => n !== 'pillar'), h2), sm = pick(D.small, h * 7 % 1), side = left ? 1 : -1;
          put(x, y, big, px + 16 - side * 4, py + 14);
          put(x, y, sm, px + 16 + side * 10, py + 24);
        }
      } else if (top) {                            // back wall: a run of furniture with gaps
        if (h < 0.5) put(x, y, pick(D.big, h2), px + 16 + Math.round((h2 - 0.5) * 6), py + 14);
        else if (h < 0.72) put(x, y, pick(D.small, h2), px + 16 + Math.round((h2 - 0.5) * 10), py + 12);
      } else if (left !== right) {                 // side walls: small things against the stone
        if (h < 0.3) put(x, y, pick(D.small, h2), px + (left ? 7 : 25), py + 18 + Math.round(h2 * 8));
      } else if (W(x, y + 1) && !left && !right) { // front wall
        if (h < 0.12) put(x, y, pick(D.small, h2), px + 16, py + 26);
      }
    }
    // a centrepiece near the middle of the open floor (tried at a few offsets), ringed by small lit props
    const roll = hash(r.x0 * 13, r.y0 * 7), big = r.w >= 7 && r.h >= 5;
    const clear = (x0: number, y0: number, wt: number, ht: number) => { for (let y = y0; y < y0 + ht; y++) for (let x = x0; x < x0 + wt; x++) if (!F(x, y) || busy(x, y) || taken.has(y * w.w + x)) return false; return true; };
    const fits = (name: string, x: number, y: number) => { const rc = size(name); if (!rc) return null;
      const t = [Math.floor((x - (rc[2] >> 1)) / T32), Math.floor((y - (rc[3] >> 1)) / T32), Math.floor((x + (rc[2] >> 1)) / T32), Math.floor((y + (rc[3] >> 1)) / T32)];
      return clear(t[0], t[1], t[2] - t[0] + 1, t[3] - t[1] + 1) ? t : null; };
    const place = (name: string, x: number, y: number, force = false) => { const rc = size(name), t = force && rc ? [Math.floor((x - (rc[2] >> 1)) / T32), Math.floor((y - (rc[3] >> 1)) / T32), Math.floor((x + (rc[2] >> 1)) / T32), Math.floor((y + (rc[3] >> 1)) / T32)] : fits(name, x, y); if (!t || !rc) return false;
      decals.push({ name, px: x - (rc[2] >> 1), py: y - (rc[3] >> 1) });
      for (let ty = t[1]; ty <= t[3]; ty++) for (let tx = t[0]; tx <= t[2]; tx++) taken.add(ty * w.w + tx); return true; };
    const ring = (name: string, x0: number, y0: number, dx: number, dy: number) => { for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = x0 + sx * dx, y = y0 + sy * dy, tx = Math.floor(x / T32), ty = Math.floor(y / T32);
      if (F(tx, ty) && !busy(tx, ty)) decor.push({ x: tx, y: ty, name, cx: x, foot: y + 4 }); } };
    const offsets = [[0, 0], [0, -2], [0, 2], [-3, 0], [3, 0], [-3, -2], [3, -2], [-3, 2], [3, 2]];
    const centre = (fn: (x: number, y: number) => boolean) => { for (const [ox, oy] of offsets) { const x = (r.x0 + (r.w >> 1) + ox) * T32 + 16, y = (r.y0 + (r.h >> 1) + oy) * T32 + 16; if (fn(x, y)) return true; } return false; };
    if (zone === 'keep') {
      const cx = r.x0 + (r.w >> 1);
      if (r.h >= 6 && roll < 0.45 && clear(cx, r.y0, 1, Math.min(r.h, 6)) && W(cx, r.y0 - 1)) decals.push({ name: 'carpet', px: cx * T32 - 6, py: r.y0 * T32, ch: Math.min(r.h - 1, 10) * T32 });
      else if (big) centre((x, y) => place('rosette', x, y) && (ring('candelabra', x, y, 44, 30), true));
    } else if (zone === 'crypt' && big) {
      const grid = (cols: number, rows: number) => (x: number, y: number) => {
        const pts: Array<[string, number, number]> = [];
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) pts.push([hash(i + r.x0, j + r.y0) < 0.6 ? 'ledger' : 'ledger2', x + Math.round((i - (cols - 1) / 2) * 42), y + Math.round((j - (rows - 1) / 2) * 34)]);
        if (!pts.every(([n, px, py]) => fits(n, px, py))) return false;
        for (const [n, px, py] of pts) place(n, px, py, true);
        ring('candles', x, y, cols * 21 + 18, rows * 17 + 12); return true; };
      centre(grid(r.w >= 11 ? 3 : 2, r.h >= 7 ? 2 : 1)) || centre(grid(2, 1)) || centre(grid(1, 1));
    } else if (zone === 'catacombs') {
      if (big) centre((x, y) => place('mosaic', x, y) && (ring('skullCandle', x, y, 40, 26), true));
      if (roll < 0.4) centre((x, y) => place('chalk', x + 70, y + 40));
    } else if (zone === 'deep') {
      if (big && roll < 0.45 && centre((x, y) => place('rune', x, y) && (ring('crystalM', x, y, 46, 30), true))) { /* rune room */ }
      else { centre((x, y) => place('fissure', x, y) && (ring('glowcaps', x, y, 56, 30), true)); if (big) centre((x, y) => place('fissure2', x + 60, y + 64)); }
      // beds of crystal shards breaking through the floor, scattered over the open space
      const beds = big ? 3 : 1;
      for (let k = 0, got = 0; k < 30 && got < beds; k++) {
        const name = k % 3 === 0 && big ? 'shards3' : k % 2 ? 'shards2' : 'shards', rc = size(name); if (!rc) continue;
        const x = (r.x0 + 1) * T32 + Math.floor(hash(r.x0 + k, r.y0 * 3 + 1) * Math.max(1, (r.w - 2) * T32 - rc[2])) + (rc[2] >> 1);
        const y = (r.y0 + 1) * T32 + Math.floor(hash(r.x0 * 5, r.y0 + k * 7) * Math.max(1, (r.h - 2) * T32 - rc[3])) + (rc[3] >> 1);
        if (place(name, x, y)) got++;
      }
    }
    // floor details on open floor tiles that nothing stands on (weighted toward the zone's common clutter)
    const weights: Record<string, number> = { rubble: 3, broken: 1, bones: 2, bonesF: 2, wheel: 0.4, frame: 0.4 };
    const pool: string[] = []; for (const d of Z.decals) for (let k = 0; k < Math.round((weights[d] ?? 0) * 2); k++) pool.push(d);
    if (Z.decals.includes('grate') && roll > 0.5) { const cx = r.x0 + (r.w >> 1), cy = r.y0 + (r.h >> 1), tx = cx + (roll > 0.75 ? 2 : -2); if (F(tx, cy + 1) && !busy(tx, cy + 1) && !taken.has((cy + 1) * w.w + tx)) { decals.push({ name: 'grate', px: tx * T32 + 9, py: (cy + 1) * T32 + 9 }); taken.add((cy + 1) * w.w + tx); } }
    const n = Math.round((r.w * r.h) / 7);
    for (let i = 0, placed = 0; i < n * 3 && placed < n && pool.length; i++) {
      const tx = r.x0 + Math.floor(hash(r.x0 * 17 + i, r.y0 * 5) * r.w), ty = r.y0 + Math.floor(hash(r.x0, r.y0 * 11 + i * 3) * r.h);
      if (!F(tx, ty) || busy(tx, ty) || taken.has(ty * w.w + tx) || W(tx, ty - 1)) continue;
      const name = pool[Math.floor(hash(tx * 5, ty * 7 + i) * pool.length)], rc = size(name); if (!rc) continue;
      decals.push({ name, px: tx * T32 + 2 + Math.floor(hash(tx, ty * 3) * (30 - rc[2])), py: ty * T32 + 2 + Math.floor(hash(tx * 3, ty) * (30 - rc[3])) });
      taken.add(ty * w.w + tx); placed++;
    }
  }
  // carpets and graves go under everything else
  const under = (n: string) => Number(['carpet', 'rosette', 'mosaic', 'rune', 'ledger', 'ledger2'].includes(n));
  decals.sort((a, b) => under(b.name) - under(a.name));
  return { decor, decals };
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
        const fv = Z.faceVar && R.faceVar && at(x, y) === TILE.WALL && !torchAt32(x, y) && hash(x * 5 + 3, y * 7) < (info.zone === 'catacombs' ? 0.08 : 0.3) ? Math.floor(hash(x, y * 9) * Z.faceVar) : -1;
        if (fv >= 0) blit(g, R.faceVar, fv * T32, 0, T32, FH, px, py - RISE);
        else blit(g, R.face, (x * T32) % TEX, 0, T32, FH, px, py - RISE);
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
    if (k === TILE.SWAMP) { drawPoolBase(g, info.zone, ramp, x, y, (dx, dy) => at(x + dx, y + dy) === TILE.SWAMP, (dx, dy, ww, hh) => blit(g, R.floor, (x * T32) % TEX + dx, (y * T32) % TEX + dy, ww, hh, x * T32 + dx, y * T32 + dy)); return; }
  };
  const props = [...info.decor].sort((a, b) => a.foot - b.foot);
  const cw = Math.ceil(w.w / CHUNK), ch = Math.ceil(w.h / CHUNK), S = CHUNK * T32;
  const chunks: (HTMLCanvasElement | null)[] = new Array(cw * ch).fill(null);
  let built = 0;
  const make = (i: number) => {
    const cx = i % cw, cy = (i / cw) | 0, c = chunkPool.pop() ?? document.createElement('canvas');
    if (c.width !== S) c.width = c.height = S;
    const g = c.getContext('2d')!; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, S, S); g.imageSmoothingEnabled = false; g.translate(-cx * S, -cy * S);
    const yEnd = Math.min(w.h, (cy + 1) * CHUNK);
    for (let y = cy * CHUNK; y < yEnd; y++) for (let x = cx * CHUNK; x < Math.min(w.w, (cx + 1) * CHUNK); x++) tile(g, x, y, false);
    // floor details, then standing props (back to front) with contact shadows; both may straddle chunk edges
    const X0 = cx * S, Y0 = cy * S, hit = (x: number, y: number, ww: number, hh: number) => x < X0 + S && x + ww > X0 && y < Y0 + S && y + hh > Y0;
    for (const d of info.decals) { const r = R['decal:' + d.name], hh = r ? Math.min(r[3], d.ch ?? r[3]) : 0; if (r && hit(d.px, d.py, r[2], hh)) blit(g, r, 0, 0, r[2], hh, d.px, d.py); }
    for (const d of props) {
      const r = R['decor:' + d.name]; if (!r) continue;
      const x = d.cx - (r[2] >> 1), y = d.foot - r[3];
      if (!hit(x - 2, y, r[2] + 4, r[3] + 3)) continue;
      const sw = Math.max(6, Math.round(r[2] * 0.75)); g.fillStyle = '#04020899';
      g.fillRect(d.cx - (sw >> 1), d.foot - 2, sw, 3); g.fillRect(d.cx - (sw >> 1) + 2, d.foot + 1, sw - 4, 1);
      blit(g, r, 0, 0, r[2], r[3], x, y);
    }
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

/** Pool body ramps, deep → shallow → lip highlight: Keep slate water, Crypt teal ghost-water, Catacombs mud, Deep cooled crust. */
export const POOL_RAMP: Record<ZoneId, string[]> = {
  keep: ['#0b1628', '#10203a', '#16304e', '#24507a', '#5e8fc0'],
  crypt: ['#071a1c', '#0a2826', '#0f3a36', '#1c5e57', '#58b0a2'],
  catacombs: ['#140c07', '#1c120c', '#2e1f14', '#46301e', '#6e5440'],
  deep: ['#120402', '#1a0604', '#3a1008', '#5a1a0a', '#7a2a10'],
};
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** Static base of a pool tile: depth-shaded body (dithered steps from the bank in), a dark stone lip, lit coping on the far bank. */
function drawPoolBase(g: CanvasRenderingContext2D, zone: ZoneId, ramp: string[], x: number, y: number, sw: (dx: number, dy: number) => boolean, floor: (dx: number, dy: number, w: number, h: number) => void) {
  const px = x * T32, py = y * T32, P = POOL_RAMP[zone];
  const N = !sw(0, -1), S = !sw(0, 1), Wn = !sw(-1, 0), E = !sw(1, 0);
  const cNW = !N && !Wn && !sw(-1, -1), cNE = !N && !E && !sw(1, -1), cSW = !S && !Wn && !sw(-1, 1), cSE = !S && !E && !sw(1, 1);
  // distance (px) to the nearest bank; the top bank counts double (the far side reads as a shelf going down)
  for (let yy = 0; yy < T32; yy++) for (let xx = 0; xx < T32; xx++) {
    let d = 99;
    if (N) d = Math.min(d, yy * 0.6); if (S) d = Math.min(d, 31 - yy); if (Wn) d = Math.min(d, xx); if (E) d = Math.min(d, 31 - xx);
    if (cNW) d = Math.min(d, Math.hypot(xx, yy)); if (cNE) d = Math.min(d, Math.hypot(31 - xx, yy));
    if (cSW) d = Math.min(d, Math.hypot(xx, 31 - yy)); if (cSE) d = Math.min(d, Math.hypot(31 - xx, 31 - yy));
    const v = Math.min(3, d / 4.5) + (BAYER4[(yy & 3) * 4 + (xx & 3)] / 16 - 0.5) * 0.9;
    const k = v < 0.3 ? 3 : v < 1.3 ? 2 : v < 2.5 ? 1 : 0;
    g.fillStyle = P[k]; g.fillRect(px + xx, py + yy, 1, 1);
  }
  // far bank: lit coping, a dark lip, then the wet shelf; side and near banks get a dark 1 px lip
  if (N) { g.fillStyle = ramp[3]; g.fillRect(px, py, T32, 1); g.fillStyle = ramp[2]; g.fillRect(px, py + 1, T32, 2); g.fillStyle = '#07060b'; g.fillRect(px, py + 3, T32, 1); g.fillStyle = P[4]; g.globalAlpha = 0.5; g.fillRect(px, py + 4, T32, 1); g.globalAlpha = 1; }
  if (Wn) { g.fillStyle = '#07060b'; g.fillRect(px, py, 1, T32); }
  if (E) { g.fillStyle = '#07060b'; g.fillRect(px + 31, py, 1, T32); }
  if (S) { g.fillStyle = P[3]; g.fillRect(px, py + 30, T32, 1); g.fillStyle = ramp[6]; g.fillRect(px, py + 31, T32, 1); }
  // round the outer corners: the floor comes back in a stepped quarter circle, with the bank colour along its edge
  const ROUND = [7, 5, 3, 2, 1, 1];
  for (const [cxs, cys] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    if (sw(cxs, 0) || sw(0, cys)) continue;
    ROUND.forEach((n, i) => {
      const yy = cys < 0 ? i : 31 - i, xx = cxs < 0 ? 0 : 32 - n;
      floor(xx, yy, n, 1);
      g.fillStyle = cys < 0 ? (i < 3 ? ramp[3] : '#07060b') : ramp[6]; g.fillRect(px + (cxs < 0 ? n : 31 - n), py + yy, 1, 1);
    });
  }
  if (zone === 'catacombs') for (let i = 0; i < 4; i++) { // mud: lumps and a scum skin
    const hx = Math.floor(hash(x * 5 + i, y * 3) * 26) + 2, hy = 7 + Math.floor(hash(x, y * 7 + i) * 20);
    g.fillStyle = P[3]; g.fillRect(px + hx, py + hy, 3, 1); g.fillStyle = P[0]; g.fillRect(px + hx, py + hy + 1, 3, 1);
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
/** Lava over visible swamp tiles of the Deep, with organic curved volcanic basalt shorelines & caldera crusts. Emissive: call after lighting. */
export function drawLava(g: CanvasRenderingContext2D, tiles: Array<{ x: number; y: number }>, isSwamp: (x: number, y: number) => boolean, t: number) {
  const tex = lavaTexture(t);
  const ROUND = [14, 11, 9, 7, 6, 5, 4, 3, 2, 2, 1, 1];
  const waveX = (wy: number, seed: number) =>
    Math.max(1, Math.min(9, Math.round(4.5 + Math.sin(wy * 0.13 + seed) * 2.6 + Math.sin(wy * 0.29 + seed * 2.1) * 1.4)));
  const waveY = (wx: number, seed: number) =>
    Math.max(1, Math.min(9, Math.round(4.8 + Math.sin(wx * 0.13 + seed) * 2.6 + Math.sin(wx * 0.27 + seed * 1.9) * 1.4)));

  for (const q of tiles) {
    const px = q.x * T32, py = q.y * T32, ox = (q.x * T32) % 64, oy = (q.y * T32) % 64;
    const N = !isSwamp(q.x, q.y - 1), S = !isSwamp(q.x, q.y + 1), Wn = !isSwamp(q.x - 1, q.y), E = !isSwamp(q.x + 1, q.y);
    const cNW = N && Wn, cNE = N && E, cSW = S && Wn, cSE = S && E;
    // Concave inner corners (two adjacent lava neighbors, diagonal is rock) get a rounded basalt headland
    const inNW = !N && !Wn && !isSwamp(q.x - 1, q.y - 1);
    const inNE = !N && !E && !isSwamp(q.x + 1, q.y - 1);
    const inSW = !S && !Wn && !isSwamp(q.x - 1, q.y + 1);
    const inSE = !S && !E && !isSwamp(q.x + 1, q.y + 1);

    g.save();
    // Soft molten ambient glow bleeding onto adjacent volcanic stone banks
    g.fillStyle = 'rgba(255, 104, 24, 0.15)';
    if (N) g.fillRect(px + (cNW ? 8 : 0), py - 2, T32 - (cNW ? 8 : 0) - (cNE ? 8 : 0), 5);
    if (S) g.fillRect(px + (cSW ? 8 : 0), py + 29, T32 - (cSW ? 8 : 0) - (cSE ? 8 : 0), 4);
    if (Wn) g.fillRect(px - 2, py + (cNW ? 8 : 0), 5, T32 - (cNW ? 8 : 0) - (cSW ? 8 : 0));
    if (E) g.fillRect(px + 29, py + (cNE ? 8 : 0), 4, T32 - (cNE ? 8 : 0) - (cSE ? 8 : 0));

    // World-space curved shoreline insets (continuous across tile seams!)
    const leftEdge = (yy: number) => {
      let l = Wn ? waveX(py + yy, 0.7) : 0;
      if (cNW && yy < ROUND.length) l = Math.max(l, ROUND[yy]);
      if (cSW && 31 - yy < ROUND.length) l = Math.max(l, ROUND[31 - yy]);
      if (inNW && yy < 5) l = Math.max(l, 5 - yy);
      if (inSW && 31 - yy < 5) l = Math.max(l, 5 - (31 - yy));
      return l;
    };
    const rightEdge = (yy: number) => {
      let r = E ? waveX(py + yy, 3.4) : 0;
      if (cNE && yy < ROUND.length) r = Math.max(r, ROUND[yy]);
      if (cSE && 31 - yy < ROUND.length) r = Math.max(r, ROUND[31 - yy]);
      if (inNE && yy < 5) r = Math.max(r, 5 - yy);
      if (inSE && 31 - yy < 5) r = Math.max(r, 5 - (31 - yy));
      return r;
    };
    const topEdge = (xx: number) => {
      let tp = N ? waveY(px + xx, 1.9) : 0;
      if (cNW && xx < ROUND.length) tp = Math.max(tp, ROUND[xx]);
      if (cNE && 31 - xx < ROUND.length) tp = Math.max(tp, ROUND[31 - xx]);
      return tp;
    };
    const botEdge = (xx: number) => {
      let bt = S ? waveY(px + xx, 4.6) : 0;
      if (cSW && xx < ROUND.length) bt = Math.max(bt, ROUND[xx]);
      if (cSE && 31 - xx < ROUND.length) bt = Math.max(bt, ROUND[31 - xx]);
      return bt;
    };

    // Clip to organic flowing volcanic caldera silhouette and blit live lava texture
    g.beginPath();
    for (let yy = 0; yy < T32; yy++) {
      const l = leftEdge(yy), r = rightEdge(yy);
      const x0 = l, x1 = T32 - r;
      if (x1 <= x0) continue;
      if ((N && yy < 14) || (S && yy >= T32 - 14)) {
        for (let xx = x0; xx < x1; xx += 2) {
          const okN = !N || yy >= topEdge(xx);
          const okS = !S || 31 - yy >= botEdge(xx);
          if (okN && okS) g.rect(px + xx, py + yy, Math.min(2, x1 - xx), 1);
        }
      } else {
        g.rect(px + x0, py + yy, x1 - x0, 1);
      }
    }
    g.clip();
    g.drawImage(tex, ox, oy, T32, T32, px, py, T32, T32);

    // Cooled dark basalt crust rim hugging the inside of every curved shoreline
    for (let yy = 0; yy < T32; yy++) {
      const l = leftEdge(yy), r = rightEdge(yy);
      if (l > 0) {
        g.fillStyle = '#2d0b05'; g.fillRect(px + l, py + yy, 2, 1);
        g.fillStyle = '#7d240b'; g.fillRect(px + l + 2, py + yy, 1, 1);
      }
      if (r > 0) {
        g.fillStyle = '#2d0b05'; g.fillRect(px + T32 - r - 2, py + yy, 2, 1);
        g.fillStyle = '#7d240b'; g.fillRect(px + T32 - r - 3, py + yy, 1, 1);
      }
    }
    if (N) for (let xx = 0; xx < T32; xx += 2) {
      const tb = topEdge(xx);
      g.fillStyle = '#240804'; g.fillRect(px + xx, py + tb, 2, 2);
      g.fillStyle = '#7d240b'; g.fillRect(px + xx, py + tb + 2, 2, 1);
    }
    if (S) for (let xx = 0; xx < T32; xx += 2) {
      const bb = botEdge(xx);
      g.fillStyle = '#2d0b05'; g.fillRect(px + xx, py + T32 - bb - 2, 2, 2);
      g.fillStyle = '#7d240b'; g.fillRect(px + xx, py + T32 - bb - 3, 2, 1);
    }

    // Cooled floating volcanic basalt crust islands inside larger magma interiors
    if (!N && !S && !Wn && !E && hashF(q.x * 7, q.y * 5) < 0.45) {
      const ix = px + 6 + Math.floor(hashF(q.x * 3, q.y * 11) * 12);
      const iy = py + 7 + Math.floor(hashF(q.x * 11, q.y * 3) * 12);
      g.fillStyle = '#1d0704'; g.fillRect(ix, iy + 2, 10, 4); g.fillRect(ix + 2, iy, 6, 8);
      g.fillStyle = '#47150a'; g.fillRect(ix + 2, iy + 1, 5, 3);
      g.fillStyle = '#8a2d0f'; g.fillRect(ix + 1, iy + 5, 6, 1);
    }

    // Glowing magma pop bubble
    const b = (t * 0.7 + hashF(q.x, q.y)) % 1;
    if (b < 0.26) {
      const bx = px + 8 + Math.floor(hashF(q.x * 3, q.y) * 16);
      const by = py + 8 + Math.floor(hashF(q.x, q.y * 3) * 15);
      g.fillStyle = b < 0.13 ? '#ffe08a' : '#d24a16';
      g.fillRect(bx, by, b < 0.13 ? 3 : 2, 2);
    }
    g.restore();
  }
}
const hashF = (x: number, y: number) => hash(x * 31 + 7, y * 17 + 3);
/** Live water: drifting ripple bands, glints, and drip rings now and then; mud just heaves slowly. Call before lighting. */
export function drawPoolGlints(g: CanvasRenderingContext2D, zone: ZoneId, tiles: Array<{ x: number; y: number }>, t: number, isSwamp?: (x: number, y: number) => boolean) {
  if (zone === 'deep') return;
  const P = POOL_RAMP[zone], mud = zone === 'catacombs';
  for (const q of tiles) {
    const px = q.x * T32, py = q.y * T32, top = isSwamp && !isSwamp(q.x, q.y - 1) ? 6 : 0, bot = isSwamp && !isSwamp(q.x, q.y + 1) ? 3 : 0;
    const lft = isSwamp && !isSwamp(q.x - 1, q.y) ? 2 : 0, rgt = isSwamp && !isSwamp(q.x + 1, q.y) ? 2 : 0;
    // ripple bands: short highlight dashes that slide sideways on a slow swell (world-space phase, so tiles join up)
    g.fillStyle = P[mud ? 3 : 4];
    for (let yy = top + 3; yy < T32 - bot - 1; yy += 5) {
      const wy = py + yy, sp = mud ? 0.6 : 3.2, ph = Math.sin(wy * 0.21 + t * (mud ? 0.4 : 1.1)) * 6 + t * sp * (((wy >> 2) & 1) ? 1 : -1);
      for (let xx = lft; xx < T32 - rgt; xx++) {
        const wx = px + xx, v = Math.sin((wx + ph) * 0.35) + Math.sin((wx - ph * 0.7) * 0.13 + wy);
        if (v > 1.55) { g.globalAlpha = mud ? 0.35 : v > 1.8 ? 0.55 : 0.3; g.fillRect(wx, wy + (v > 1.8 ? 0 : 1), 1, 1); }
      }
    }
    g.globalAlpha = 1;
    if (mud) { const b = (t * 0.25 + hashF(q.x, q.y)) % 1; if (b < 0.15) { const bx = px + 6 + Math.floor(hashF(q.x * 3, q.y) * 20), by = py + 10 + Math.floor(hashF(q.x, q.y * 3) * 14); g.fillStyle = P[3]; g.fillRect(bx, by - (b < 0.07 ? 1 : 0), 2, 1); } continue; }
    // glints
    g.fillStyle = '#e8f4ff';
    for (let i = 0; i < 2; i++) {
      const ph = (t * 0.5 + hashF(q.x + i, q.y)) % 1; if (ph > 0.3) continue;
      const x = px + 4 + Math.floor(hashF(q.x, q.y + i) * 22) + Math.round(Math.sin(t * 2 + i)), y = py + top + 4 + Math.floor(hashF(q.x * 2 + i, q.y) * (22 - top));
      g.fillRect(x, y, ph < 0.15 ? 3 : 1, 1);
    }
    // drip rings: a stepped ellipse that grows and fades
    const cyc = 4.5, r = ((t + hashF(q.x * 7, q.y * 5) * cyc) % cyc) / 1.2;
    if (r < 1 && hashF(q.x, q.y * 11) < 0.35) {
      const cx0 = px + 8 + Math.floor(hashF(q.x * 9, q.y) * 16), cy0 = py + top + 8 + Math.floor(hashF(q.x, q.y * 9) * Math.max(1, 16 - top)), R = 1 + r * 9;
      g.fillStyle = P[4]; g.globalAlpha = 0.7 * (1 - r);
      for (let a = 0; a < 20; a++) { const an = a / 20 * Math.PI * 2; g.fillRect(Math.round(cx0 + Math.cos(an) * R), Math.round(cy0 + Math.sin(an) * R * 0.45), 1, 1); }
      g.globalAlpha = 1;
    }
  }
}
