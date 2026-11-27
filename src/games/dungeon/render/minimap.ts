// Boxless translucent dungeon minimap for Purgatour's top-right corner.
// Draws only discovered rooms and doorways with dark silhouette halos (no heavy enclosing rectangle),
// harmonizing with the boxless top-left Player HUD and keeping HUD coverage ultra-lean.
import type { DungeonSnapshot } from '../sim/types';
import { TILE } from '../sim/world';
import type { Rect } from './layout';

const ENEMY_TINT: Record<string, string> = {
  chaser: '#e66', bat: '#a7f', spitter: '#5d5', archer: '#eee',
  brute: '#c84', bomber: '#f72', summoner: '#a5f', boss: '#ff4da6',
};

export interface MinimapCache {
  canvas: HTMLCanvasElement | null;
}

export function createMinimapCache(): MinimapCache {
  return { canvas: null };
}

/**
 * Render the boxless translucent minimap at top-right and return its tight explored bounding box
 * (in device px) for HUD area tracking.
 */
export function drawBoxlessMinimap(
  g: CanvasRenderingContext2D,
  s: DungeonSnapshot,
  W: number,
  L: number,
  u: number,
  dpr: number,
  heroColor: string,
  cache: MinimapCache,
): Rect {
  const w = s.world, p = s.player;
  const mm = Math.max(1, Math.floor((118 * u) / Math.max(1, w.w)));
  const mw = w.w * mm, mh = w.h * mm;
  if (!cache.canvas || cache.canvas.width !== mw || cache.canvas.height !== mh) {
    cache.canvas = document.createElement('canvas');
    cache.canvas.width = mw;
    cache.canvas.height = mh;
  }
  const m = cache.canvas.getContext('2d')!;
  m.clearRect(0, 0, mw, mh);

  // Track tight bounding box of actually seen rooms so hudBox stays lean
  let minRx = w.w, minRy = w.h, maxRx = 0, maxRy = 0;

  // 1. Dark silhouette halo underneath seen doors & rooms so map floats cleanly over any brick tile
  m.fillStyle = 'rgba(7, 5, 12, 0.78)';
  for (let i = 0; i < w.tiles.length; i++) {
    if (w.tiles[i] === TILE.DOOR && w.rooms[w.doorRoom[i]]?.seen) {
      const tx = i % w.w, ty = Math.floor(i / w.w);
      m.fillRect(tx * mm - 1, ty * mm - 1, mm + 2, mm + 2);
    }
  }
  for (const r of w.rooms) {
    if (!r.seen) continue;
    minRx = Math.min(minRx, r.x0); minRy = Math.min(minRy, r.y0);
    maxRx = Math.max(maxRx, r.x0 + r.w); maxRy = Math.max(maxRy, r.y0 + r.h);
    m.fillRect(r.x0 * mm - 1, r.y0 * mm - 1, r.w * mm + 2, r.h * mm + 2);
  }

  // 2. Doors (warm bronze connecting stubs)
  m.fillStyle = '#b49862';
  for (let i = 0; i < w.tiles.length; i++) {
    if (w.tiles[i] === TILE.DOOR && w.rooms[w.doorRoom[i]]?.seen) {
      m.fillRect((i % w.w) * mm, Math.floor(i / w.w) * mm, mm, mm);
    }
  }

  // 3. Discovered rooms (translucent stone-etched tint + crisp rim)
  for (const r of w.rooms) {
    if (!r.seen) continue;
    const here = r.id === s.room;
    const fill = here
      ? 'rgba(128, 120, 158, 0.72)'
      : r.cleared
        ? 'rgba(56, 94, 68, 0.62)'
        : r.boss
          ? 'rgba(116, 40, 74, 0.72)'
          : 'rgba(66, 62, 92, 0.62)';
    const edge = here
      ? '#ece4ff'
      : r.cleared
        ? '#78b886'
        : r.boss
          ? '#e85d92'
          : '#8d88a8';
    m.fillStyle = edge;
    m.fillRect(r.x0 * mm, r.y0 * mm, r.w * mm, r.h * mm);
    m.fillStyle = fill;
    m.fillRect(r.x0 * mm + 1, r.y0 * mm + 1, Math.max(1, r.w * mm - 2), Math.max(1, r.h * mm - 2));

    // Chest gold glint
    if (r.chest && !r.chest.opened) {
      m.fillStyle = '#181000';
      m.fillRect((r.chest.x - 1) * mm - 1, (r.chest.y - 1) * mm - 1, 2 * mm + 2, 2 * mm + 2);
      m.fillStyle = '#ffd84a';
      m.fillRect((r.chest.x - 1) * mm, (r.chest.y - 1) * mm, 2 * mm, 2 * mm);
    }
  }

  // 4. Shrine pips (azure/gold diamonds on discovered rooms with active/idle shrines)
  for (const sh of s.shrines) {
    if (!w.rooms[sh.room]?.seen || sh.state === 'done' || sh.state === 'failed') continue;
    const sx = Math.round(sh.x * mm), sy = Math.round(sh.y * mm);
    m.fillStyle = '#0a0810'; m.fillRect(sx - mm - 1, sy - mm - 1, mm * 2 + 2, mm * 2 + 2);
    m.fillStyle = sh.state === 'active' ? '#ffd84a' : '#7fe7ff';
    m.fillRect(sx - mm, sy - mm, mm * 2, mm * 2);
  }

  // 5. Boss stairwell / crown marker
  const br = w.rooms.find((r) => r.boss);
  if (br?.seen) {
    const sx = Math.floor(w.stairs.x) * mm, sy = Math.floor(w.stairs.y) * mm;
    m.fillStyle = '#0a0810'; m.fillRect(sx - mm - 1, sy - mm - 1, 3 * mm + 2, 3 * mm + 2);
    m.fillStyle = s.stairsOpen ? '#ffd84a' : '#b88635';
    for (let k = 0; k < 3; k++) m.fillRect(sx - mm + k * mm, sy - mm + k * mm, (3 - k) * mm, mm);
  }

  const mx0 = Math.round(W - mw - L), my0 = Math.round(L);
  g.imageSmoothingEnabled = false;
  g.drawImage(cache.canvas, mx0, my0);

  // 6. Live enemy pips inside current room (or boss)
  const curRoom = w.rooms[s.room];
  for (const e of s.enemies) {
    if (e.kind === 'boss' || (curRoom && e.x >= curRoom.x0 && e.x <= curRoom.x0 + curRoom.w && e.y >= curRoom.y0 && e.y <= curRoom.y0 + curRoom.h)) {
      const sz = Math.max(2, Math.round((e.kind === 'boss' ? 3.5 : 2) * dpr));
      g.fillStyle = '#0a0810';
      g.fillRect(Math.round(mx0 + e.x * mm - sz / 2) - 1, Math.round(my0 + e.y * mm - sz / 2) - 1, sz + 2, sz + 2);
      g.fillStyle = ENEMY_TINT[e.kind] ?? '#e55';
      g.fillRect(Math.round(mx0 + e.x * mm - sz / 2), Math.round(my0 + e.y * mm - sz / 2), sz, sz);
    }
  }

  // 7. Pulsing hero diamond
  const hx0 = Math.round(mx0 + p.x * mm), hy0 = Math.round(my0 + p.y * mm);
  const R = Math.round((2.6 + (Math.sin(s.t * 6) > 0 ? 0.6 : 0)) * dpr);
  for (const [rr, col] of [[R + dpr, '#0a0810'], [R, '#ffffff'], [Math.max(1, R - dpr), heroColor]] as const) {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(hx0, hy0 - rr); g.lineTo(hx0 + rr, hy0); g.lineTo(hx0, hy0 + rr); g.lineTo(hx0 - rr, hy0);
    g.fill();
  }

  if (maxRx <= minRx || maxRy <= minRy) return { x: mx0, y: my0, w: mw, h: mh };
  return {
    x: mx0 + minRx * mm - 2,
    y: my0 + minRy * mm - 2,
    w: (maxRx - minRx) * mm + 4,
    h: (maxRy - minRy) * mm + 4,
  };
}
