import type { BikeState, GameRenderer, InputState, Insets, Profile } from '../../../contracts';
import type { DungeonSnapshot, EnemyView, BulletView, DropView, Fx, EliteMod, CampView } from '../sim/types';
import { desaturate, drawActionButton, effortFlourish, effortTint } from '../../kit/actionButton';
import { runLayout } from './layout';
import { play, type SfxName } from '../../../audio/sfx';
import { TILE, type World } from '../sim/world';
import { ELEMENT_COLORS, RARITY_COLORS, SLOTS, type Weapon } from '../sim/loot';
import { BOSS_ART, anim, glow, heroPalette, sprite, sprite2, weaponSprite, type AnimState } from './sprites';

const TILES_ACROSS = 16; // camera zoom
const ACTION_COLOR: Record<string, string> = { strike: '#ffd84a', ward: '#7fe7ff', rally: '#8fd8ff', potion: '#ff6b8a' };
const BT = 16;           // background px per tile
const MM = 2;            // minimap px per tile
const THEMES = [
  { floor: ['#4a4552', '#433e4b', '#504a58'], grout: '#2c2832', wallTop: '#2a2533', wallFace: ['#5d5468', '#4a4256'], swamp: '#1e3a2c' },
  { floor: ['#3e4d3f', '#384637', '#435443'], grout: '#243024', wallTop: '#1f2a20', wallFace: ['#55704f', '#435a3f'], swamp: '#1f3a1c' },
  { floor: ['#6b5a44', '#62523e', '#74624a'], grout: '#3d3226', wallTop: '#33291e', wallFace: ['#8a7356', '#6f5c44'], swamp: '#3a4220' },
  { floor: ['#3d3550', '#362f48', '#453c5a'], grout: '#221d30', wallTop: '#1a1626', wallFace: ['#584c78', '#463c62'], swamp: '#1c2f3e' },
];
// Effort-zone aura: Z1 none, Z2 faint blue … Z5 strong red.
const AURA: Array<{ c: string; a: number; r: number } | null> = [null, null,
  { c: '#5aa0ff', a: 0.35, r: 1.3 }, { c: '#40e0c0', a: 0.45, r: 1.5 }, { c: '#ff9a2a', a: 0.6, r: 1.8 }, { c: '#ff2a2a', a: 0.85, r: 2.3 }];
const ENEMY_TINT: Record<string, string> = { chaser: '#e66', bat: '#a7f', spitter: '#5d5', archer: '#eee', brute: '#c84', bomber: '#f72', summoner: '#a5f', boss: '#c0a' };
/** New bosses reuse a base sprite with their own palette until #91 draws them. */
const ELITE_COLORS: Record<EliteMod, string> = { undying: '#7dff5a', splitting: '#ffd84a', shielded: '#66ccff', swift: '#ff5af0', volatile: '#ff7a2a' };
const ELITE_LABEL: Record<EliteMod, string> = { undying: 'Undying', splitting: 'Splitting', shielded: 'Warded', swift: 'Swift', volatile: 'Volatile' };
const KIND_LABEL: Record<string, string> = { chaser: 'Goblin', bat: 'Bat', spitter: 'Slime', archer: 'Skeleton', brute: 'Ogre', bomber: 'Bomber', summoner: 'Necromancer' };
const SHRINE_COLORS = { fury: '#ff8c2a', endurance: '#5aa9ff', sprint: '#ffd84a', whirl: '#8fd8ff' } as const;
// rate limits (s) for spammy sound cues
/** Tile scale in arenas (boss rooms, rooms 17+ wide or 13+ tall). */
const ARENA_ZOOM = 0.8;
const CUE_GAP: Partial<Record<SfxName, number>> = { shoot: 0.06, shootHeavy: 0.08, zap: 0.06, flame: 0.1, hit: 0.05, crit: 0.08, coin: 0.05, kill: 0.04, explode: 0.08, hurt: 0.2, door: 0.2 };

const hash = (x: number, y: number) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/** Wall-face torches: deterministic, spaced along faces. */
const torchAt = (x: number, y: number) => (x + y * 3) % 7 === 0 && hash(x, y) > 0.35;
let torches: Array<{ x: number; y: number }> = [];
function buildBackground(w: World): HTMLCanvasElement {
  torches = [];
  const c = document.createElement('canvas'); c.width = w.w * BT; c.height = w.h * BT;
  const g = c.getContext('2d')!;
  const th = THEMES[w.theme % THEMES.length];
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w.w || y >= w.h ? TILE.WALL : w.tiles[y * w.w + x]);
  for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) {
    const k = at(x, y), px = x * BT, py = y * BT, r = hash(x, y);
    if (k === TILE.WALL) {
      const below = at(x, y + 1), isW = (dx: number, dy: number) => at(x + dx, y + dy) === TILE.WALL;
      const nearFloor = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]].some(([dx, dy]) => !isW(dx, dy));
      if (below !== TILE.WALL) { // wall face: shaded bricks, lit rim on top, dark foot
        g.fillStyle = th.wallFace[0]; g.fillRect(px, py, BT, BT);
        for (let row = 0; row < 4; row++) {
          const off = row % 2 ? 4 : 0;
          for (let bx = -off; bx < BT; bx += 8) { const v = hash(x * 4 + bx, y * 4 + row); g.fillStyle = v > 0.66 ? 'rgba(255,255,255,0.07)' : v < 0.25 ? 'rgba(0,0,0,0.14)' : 'rgba(0,0,0,0)'; g.fillRect(px + Math.max(0, bx), py + row * 4, Math.min(7, BT - Math.max(0, bx)), 3); }
          g.fillStyle = th.wallFace[1];
          for (let bx = -off; bx < BT; bx += 8) g.fillRect(px + bx + 7, py + row * 4, 1, 4);
          g.fillRect(px, py + row * 4 + 3, BT, 1);
        }
        g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(px, py, BT, 1);
        g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(px, py + BT - 2, BT, 2);
        if (!isW(-1, 0)) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(px, py, 1, BT); }
        if (!isW(1, 0)) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(px + BT - 1, py, 1, BT); }
        if (torchAt(x, y)) torches.push({ x, y });
      } else if (nearFloor) { // wall top, autotiled: rim + outline on every edge that borders open floor
        g.fillStyle = th.wallTop; g.fillRect(px, py, BT, BT);
        g.fillStyle = 'rgba(255,255,255,0.04)'; if (hash(x, y) > 0.5) g.fillRect(px + 3, py + 3, 4, 2);
        const rim = 'rgba(255,255,255,0.16)', edge = '#07060b';
        if (!isW(0, -1)) { g.fillStyle = edge; g.fillRect(px, py, BT, 1); g.fillStyle = rim; g.fillRect(px, py + 1, BT, 1); }
        if (!isW(-1, 0)) { g.fillStyle = edge; g.fillRect(px, py, 1, BT); g.fillStyle = rim; g.fillRect(px + 1, py, 1, BT); }
        if (!isW(1, 0)) { g.fillStyle = edge; g.fillRect(px + BT - 1, py, 1, BT); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(px + BT - 2, py, 1, BT); }
        for (const [dx, dy, cx2, cy2] of [[-1, -1, 0, 0], [1, -1, BT - 2, 0], [-1, 1, 0, BT - 2], [1, 1, BT - 2, BT - 2]]) if (isW(dx, 0) && isW(0, dy) && !isW(dx, dy)) { g.fillStyle = edge; g.fillRect(px + cx2, py + cy2, 2, 2); }
      }
      continue;
    }
    g.fillStyle = th.floor[Math.floor(r * 3)]; g.fillRect(px, py, BT, BT);
    g.fillStyle = th.grout; g.fillRect(px, py + BT - 1, BT, 1); g.fillRect(px + BT - 1, py, 1, BT);
    if (r > 0.7) { g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(px + 3 + Math.floor(r * 7), py + 4 + Math.floor(r * 50) % 7, 2, 1); }
    if (r < 0.08) { g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(px + 2, py + 2, 5, 3); }
    if (k === TILE.PIT) {
      g.fillStyle = '#030206'; g.fillRect(px, py, BT, BT);
      if (at(x, y - 1) !== TILE.PIT) { g.fillStyle = th.grout; g.fillRect(px, py, BT, 3); g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(px, py + 3, BT, 3); }
      continue;
    }
    if (k === TILE.PILLAR) { // brazier pedestal (flame drawn live)
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(px + 8, py + 13, 7, 3, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#5a5262'; g.fillRect(px + 4, py + 4, 8, 9); g.fillStyle = '#3a3442'; g.fillRect(px + 3, py + 3, 10, 3); g.fillRect(px + 4, py + 11, 8, 2);
      continue;
    }
    if (k === TILE.SWAMP) {
      g.fillStyle = th.swamp; g.fillRect(px, py, BT, BT);
      g.strokeStyle = 'rgba(150,230,140,0.22)'; g.lineWidth = 1;
      g.beginPath(); g.ellipse(px + 4 + Math.floor(r * 8), py + 4 + Math.floor(r * 53) % 8, 3, 1.5, 0, 0, Math.PI * 2); g.stroke();
      if (r > 0.6) { g.fillStyle = 'rgba(190,255,170,0.25)'; g.fillRect(px + Math.floor(r * 37) % 12, py + Math.floor(r * 11), 2, 2); }
    }
    if (at(x, y - 1) === TILE.WALL && k !== TILE.SWAMP) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(px, py, BT, 4); } // wall shadow
  }
  for (const q of torches) { const px = q.x * BT, py = q.y * BT; g.fillStyle = '#2a1e14'; g.fillRect(px + 7, py + 7, 2, 6); g.fillStyle = '#6b4a2a'; g.fillRect(px + 6, py + 6, 4, 2); }
  return c;
}

export function createRenderer(): GameRenderer {
  let canvas: HTMLCanvasElement | null = null;
  let g: CanvasRenderingContext2D | null = null;
  let color = '#4cc9f0';
  let bg: HTMLCanvasElement | null = null, bgFor: unknown = null;
  let mini: HTMLCanvasElement | null = null;
  let pillars: Array<{ x: number; y: number }> = [];
  let lightC: HTMLCanvasElement | null = null;
  let lastCue = -1;
  let send: ((a: unknown) => void) | undefined;
  let insetCss = 0; // HUD band (CSS px) at the bottom; the world renders under it, foreground UI stays above
  let campHits: Array<{ x: number; y: number; w: number; h: number; row: number }> = [];
  const onPointer = (e: PointerEvent) => {
    if (!canvas) return;
    const r = canvas.getBoundingClientRect(), px = (e.clientX - r.left) * (canvas.width / r.width), py = (e.clientY - r.top) * (canvas.height / r.height);
    const ah = actionHits.find((h) => px >= h.x && px <= h.x + h.w && py >= h.y && py <= h.y + h.h);
    if (ah) { e.preventDefault(); send?.({ type: 'action', id: ah.id }); return; }
    if (!campHits.length) return;
    const hit = campHits.find((h) => px >= h.x && px <= h.x + h.w && py >= h.y && py <= h.y + h.h);
    if (hit) { e.preventDefault(); send?.({ type: 'campRow', row: hit.row }); }
  };
  let dpr = 1;
  let camX = NaN, camY = NaN, camT = 0, zoom = 1, camFor: unknown = null;
  let actionHits: Array<{ x: number; y: number; w: number; h: number; id: string }> = [];
  /** Dev measurement: boxes the dungeon HUD covers this frame (device px); read by dev-shot to report HUD area. */
  let hudBoxes: Array<[number, number, number, number]> = [];
  function hudBox(x: number, y: number, w: number, h: number) { if (w > 0 && h > 0) hudBoxes.push([x, y, w, h]); }

  function drawSprite(name: string, x: number, y: number, ps: number, face = 1, flash = false, over?: Record<string, string>, bob = 0) {
    const s = sprite(name, over, flash), gg = g!;
    const w = s.width * ps, h = s.height * ps;
    gg.save(); gg.translate(Math.round(x), Math.round(y + bob));
    if (face < 0) gg.scale(-1, 1);
    gg.drawImage(s, -w / 2, -h, w, h);
    gg.restore();
  }
  function drawCanvas(c: HTMLCanvasElement, x: number, y: number, ps: number, face = 1, bob = 0) {
    const gg = g!, w = c.width * ps, h = c.height * ps;
    gg.save(); gg.translate(Math.round(x), Math.round(y + bob)); if (face < 0) gg.scale(-1, 1);
    gg.drawImage(c, -w / 2, -h, w, h); gg.restore();
  }
  const moved = new Map<number, { x: number; y: number }>();
  // render-only juice: coins fly to the HUD counter; a ring pulses on the hero when an action becomes ready
  let coinSeen = new Map<number, { x: number; y: number }>();
  const flyers: Array<{ x: number; y: number; t0: number }> = [];
  let coinPulseT = -9, heroScr = { x: 0, y: 0 };
  const readyPrev = new Map<string, number>();
  const pulses: Array<{ t0: number; color: string; label: string }> = [];
  function shadow(x: number, y: number, rx: number) {
    const gg = g!; gg.fillStyle = 'rgba(0,0,0,0.35)';
    gg.beginPath(); gg.ellipse(x, y, rx, rx * 0.4, 0, 0, Math.PI * 2); gg.fill();
  }
  function glowAt(color: string, x: number, y: number, r: number, a = 1) {
    const gg = g!; gg.globalAlpha = a; gg.drawImage(glow(color), x - r, y - r, r * 2, r * 2); gg.globalAlpha = 1;
  }

  function drawBullet(b: BulletView, TS: number, t: number) {
    const gg = g!, x = b.x * TS, y = b.y * TS, r = Math.max(2, b.r * TS), ca = Math.cos(b.angle), sa = Math.sin(b.angle);
    gg.globalCompositeOperation = 'lighter';
    switch (b.style) {
      case 'enemy':
        glowAt('#ff2a4a', x, y, r * 2.6, 0.75);
        gg.fillStyle = '#ff8a9a'; gg.beginPath(); gg.arc(x, y, r * 0.55, 0, Math.PI * 2); gg.fill(); break;
      case 'bolt': {
        gg.strokeStyle = b.color; gg.lineWidth = r * 0.9; gg.lineCap = 'round'; gg.globalAlpha = 0.6;
        gg.beginPath(); gg.moveTo(x - ca * r * 4, y - sa * r * 4); gg.lineTo(x, y); gg.stroke(); gg.globalAlpha = 1;
        glowAt(b.color, x, y, r * 3); gg.fillStyle = '#fff'; gg.beginPath(); gg.arc(x, y, r * 0.45, 0, Math.PI * 2); gg.fill(); break;
      }
      case 'pellet':
        gg.strokeStyle = b.color; gg.lineWidth = r; gg.lineCap = 'round';
        gg.beginPath(); gg.moveTo(x - ca * r * 3, y - sa * r * 3); gg.lineTo(x, y); gg.stroke();
        glowAt(b.color, x, y, r * 3, 0.7); break;
      case 'arrow': {
        gg.globalCompositeOperation = 'source-over';
        gg.strokeStyle = '#e8dcc0'; gg.lineWidth = Math.max(2, TS * 0.05);
        gg.beginPath(); gg.moveTo(x - ca * TS * 0.55, y - sa * TS * 0.55); gg.lineTo(x, y); gg.stroke();
        gg.globalCompositeOperation = 'lighter';
        gg.strokeStyle = b.color; gg.globalAlpha = 0.35; gg.lineWidth = r;
        gg.beginPath(); gg.moveTo(x - ca * TS * 1.6, y - sa * TS * 1.6); gg.lineTo(x - ca * TS * 0.4, y - sa * TS * 0.4); gg.stroke(); gg.globalAlpha = 1;
        glowAt(b.color, x, y, r * 2.2); break;
      }
      case 'flame': {
        const k = Math.min(1, b.age / 0.45), rr = r * (1 + k * 2.2);
        glowAt(k < 0.35 ? '#fff3b0' : b.color, x, y, rr * 1.6, 0.9 * (1 - k * 0.7));
        glowAt('#ff6a1a', x, y, rr, 0.5 * (1 - k)); break;
      }
      case 'spark': {
        gg.strokeStyle = b.color; gg.lineWidth = 2;
        gg.beginPath(); gg.moveTo(x, y);
        for (let i = 1; i <= 4; i++) { const j = (hash(Math.floor(t * 30), i) - 0.5) * TS * 0.25; gg.lineTo(x - ca * i * TS * 0.2 - sa * j, y - sa * i * TS * 0.2 + ca * j); }
        gg.stroke(); glowAt(b.color, x, y, r * 3); break;
      }
      case 'orb': {
        const p = 1 + Math.sin(b.age * 18) * 0.15;
        glowAt(b.color, x, y, r * 3.2 * p); glowAt('#ffffff', x, y, r * 1.1, 0.9);
        gg.strokeStyle = b.color; gg.lineWidth = 2; gg.beginPath(); gg.arc(x, y, r * 1.6 * p, b.age * 9, b.age * 9 + 4); gg.stroke(); break;
      }
      case 'star': {
        glowAt(b.color, x, y, r * 2.6, 0.7);
        gg.globalCompositeOperation = 'source-over';
        gg.save(); gg.translate(x, y); gg.rotate(b.age * 22); gg.fillStyle = '#e8eef8'; gg.strokeStyle = b.color; gg.lineWidth = 1.5;
        gg.beginPath();
        for (let i = 0; i < 8; i++) { const rr = i % 2 ? r * 0.45 : r * 1.4, a = (i / 8) * Math.PI * 2; gg.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        gg.closePath(); gg.fill(); gg.stroke(); gg.restore(); break;
      }
    }
    gg.globalCompositeOperation = 'source-over';
  }

  function drawFx(f: Fx, t: number, TS: number) {
    const gg = g!, k = (t - f.t0) / f.life;
    if (k < 0 || k > 1) return;
    const x = f.x * TS, y = f.y * TS;
    switch (f.kind) {
      case 'text': {
        const pop = f.big ? 1 + 0.5 * Math.max(0, 1 - k / 0.18) : 1; // crits pop, then settle
        gg.globalAlpha = 1 - k * k; gg.font = `bold ${Math.round(TS * (f.big ? 0.42 : 0.26) * pop)}px sans-serif`; gg.textAlign = 'center';
        gg.lineWidth = 3; gg.strokeStyle = '#000'; gg.strokeText(f.text!, x, y - k * TS * 0.7); gg.fillStyle = f.color; gg.fillText(f.text!, x, y - k * TS * 0.7);
        gg.globalAlpha = 1; gg.textAlign = 'left'; break;
      }
      case 'chain': {
        gg.globalCompositeOperation = 'lighter'; gg.strokeStyle = f.color; gg.globalAlpha = 1 - k;
        for (const lw of [5, 2]) {
          gg.lineWidth = lw; gg.beginPath();
          f.pts!.forEach((p, i) => {
            if (i === 0) { gg.moveTo(p.x * TS, p.y * TS); return; }
            const q = f.pts![i - 1];
            for (let s = 1; s <= 4; s++) {
              const u = s / 4, j = s < 4 ? (hash(Math.floor(t * 40) + i, s) - 0.5) * TS * 0.5 : 0;
              gg.lineTo((q.x + (p.x - q.x) * u) * TS + j, (q.y + (p.y - q.y) * u) * TS - j);
            }
          });
          gg.stroke(); gg.strokeStyle = '#fff';
        }
        gg.globalAlpha = 1; gg.globalCompositeOperation = 'source-over'; break;
      }
      case 'boom': {
        const r = f.r! * TS * (0.4 + k * 0.6);
        gg.globalCompositeOperation = 'lighter';
        glowAt(f.color, x, y, r * 1.4, 1 - k); glowAt('#ffffff', x, y, r * 0.5, (1 - k) * 0.8);
        gg.strokeStyle = f.color; gg.globalAlpha = 1 - k; gg.lineWidth = 3; gg.beginPath(); gg.arc(x, y, r, 0, Math.PI * 2); gg.stroke();
        gg.globalAlpha = 1; gg.globalCompositeOperation = 'source-over'; break;
      }
      case 'hit': case 'muzzle':
        gg.globalCompositeOperation = 'lighter'; glowAt(f.color, x, y, TS * (f.kind === 'muzzle' ? 0.35 : 0.3) * (1 + k), 1 - k); gg.globalCompositeOperation = 'source-over'; break;
      case 'death': {
        gg.fillStyle = f.color; gg.globalAlpha = 1 - k;
        for (let i = 0; i < 8; i++) { const a = i * 0.785 + f.t0, d = k * TS * (f.r ?? 1) * 0.8; gg.fillRect(x + Math.cos(a) * d - 3, y - TS * 0.3 + Math.sin(a) * d - 3, 6, 6); }
        gg.globalAlpha = 1; break;
      }
      case 'levelup': {
        gg.globalCompositeOperation = 'lighter'; gg.strokeStyle = f.color; gg.globalAlpha = 1 - k;
        for (let i = 0; i < 2; i++) { gg.lineWidth = 4 - i * 2; gg.beginPath(); gg.ellipse(x, y - k * TS * 0.6 * (i + 1), (f.r ?? 1) * TS * (0.4 + k * 0.6), (f.r ?? 1) * TS * 0.3 * (0.4 + k * 0.6), 0, 0, Math.PI * 2); gg.stroke(); }
        gg.globalAlpha = 1; gg.globalCompositeOperation = 'source-over'; break;
      }
    }
  }

  function weaponIcon(gg: CanvasRenderingContext2D, w: Pick<Weapon, 'base'>, x: number, y: number, s: number, col: string) {
    gg.save(); gg.translate(x, y); gg.strokeStyle = col; gg.fillStyle = col; gg.lineWidth = Math.max(2, s * 0.12); gg.lineCap = 'round';
    gg.beginPath();
    switch (w.base) {
      case 'bolt': gg.moveTo(-s * 0.4, s * 0.4); gg.lineTo(s * 0.3, -s * 0.3); gg.stroke(); gg.beginPath(); gg.arc(s * 0.32, -s * 0.32, s * 0.16, 0, 7); gg.fill(); break;
      case 'pellet': gg.moveTo(-s * 0.45, s * 0.2); gg.lineTo(s * 0.3, -s * 0.1); gg.lineTo(s * 0.45, -s * 0.25); gg.moveTo(-s * 0.45, s * 0.2); gg.lineTo(-s * 0.35, s * 0.45); gg.stroke(); break;
      case 'arrow': gg.arc(0, 0, s * 0.42, -1.2, 1.2); gg.moveTo(s * 0.15, -s * 0.39); gg.lineTo(s * 0.15, s * 0.39); gg.moveTo(-s * 0.4, 0); gg.lineTo(s * 0.45, 0); gg.stroke(); break;
      case 'flame': gg.moveTo(-s * 0.4, s * 0.45); gg.lineTo(s * 0.15, -s * 0.1); gg.stroke(); gg.beginPath(); gg.moveTo(s * 0.1, -s * 0.05); gg.quadraticCurveTo(s * 0.5, -s * 0.2, s * 0.25, -s * 0.5); gg.quadraticCurveTo(s * 0.1, -s * 0.25, s * 0.1, -s * 0.05); gg.fill(); break;
      case 'spark': gg.moveTo(s * 0.1, -s * 0.45); gg.lineTo(-s * 0.2, s * 0.05); gg.lineTo(s * 0.15, s * 0.05); gg.lineTo(-s * 0.1, s * 0.45); gg.stroke(); break;
      case 'orb': gg.moveTo(-s * 0.35, s * 0.45); gg.lineTo(s * 0.05, -s * 0.05); gg.stroke(); gg.beginPath(); gg.arc(s * 0.18, -s * 0.18, s * 0.26, 0, 7); gg.fill(); break;
      case 'star': for (let i = 0; i < 8; i++) { const rr = i % 2 ? s * 0.16 : s * 0.45, a = (i / 8) * Math.PI * 2; gg.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } gg.closePath(); gg.fill(); break;
    }
    gg.restore();
  }
  function gearIcon(gg: CanvasRenderingContext2D, slot: string, x: number, y: number, s: number, col: string) {
    gg.save(); gg.translate(x, y); gg.fillStyle = col; gg.strokeStyle = col; gg.lineWidth = Math.max(2, s * 0.12);
    gg.beginPath();
    if (slot === 'helm') { gg.arc(0, s * 0.1, s * 0.38, Math.PI, 0); gg.lineTo(s * 0.38, s * 0.3); gg.lineTo(-s * 0.38, s * 0.3); gg.fill(); }
    else if (slot === 'armor') { gg.moveTo(-s * 0.4, -s * 0.3); gg.lineTo(-s * 0.15, -s * 0.4); gg.lineTo(0, -s * 0.25); gg.lineTo(s * 0.15, -s * 0.4); gg.lineTo(s * 0.4, -s * 0.3); gg.lineTo(s * 0.3, s * 0.4); gg.lineTo(-s * 0.3, s * 0.4); gg.fill(); }
    else if (slot === 'boots') { gg.moveTo(-s * 0.2, -s * 0.4); gg.lineTo(s * 0.05, -s * 0.4); gg.lineTo(s * 0.05, s * 0.1); gg.lineTo(s * 0.4, s * 0.2); gg.lineTo(s * 0.4, s * 0.4); gg.lineTo(-s * 0.2, s * 0.4); gg.fill(); }
    else { gg.arc(0, s * 0.08, s * 0.3, 0, 7); gg.stroke(); gg.beginPath(); gg.arc(0, -s * 0.25, s * 0.12, 0, 7); gg.fill(); }
    gg.restore();
  }

  function drawDrop(d: DropView, TS: number, t: number) {
    const gg = g!, x = d.x * TS, y = d.y * TS, bob = Math.sin(t * 4 + d.id) * TS * 0.06;
    if (d.kind === 'coin') {
      const s = sprite('coin'), sc = TS / 22, sx = Math.max(0.15, Math.abs(Math.cos(t * 5 + d.id)));
      gg.drawImage(s, x - (s.width * sc * sx) / 2, y - s.height * sc + bob, s.width * sc * sx, s.height * sc);
      return;
    }
    if (d.kind === 'potion') { drawSprite('potion', x, y, TS / 16, 1, false, undefined, bob); return; }
    const col = RARITY_COLORS[d.rarity];
    gg.globalCompositeOperation = 'lighter';
    if (d.rarity >= 2) { // light pillar (uniques get a tall pulsing one)
      const hgt = TS * (d.rarity === 5 ? 4 + Math.sin(t * 6) * 0.5 : 2);
      const gr = gg.createLinearGradient(0, y - hgt, 0, y);
      gr.addColorStop(0, col + '00'); gr.addColorStop(1, col + '88');
      gg.fillStyle = gr; gg.fillRect(x - TS * (d.rarity === 5 ? 0.22 : 0.12), y - hgt, TS * (d.rarity === 5 ? 0.44 : 0.24), hgt);
    }
    glowAt(col, x, y - TS * 0.3 + bob, TS * 0.6, 0.6);
    gg.globalCompositeOperation = 'source-over';
    if (d.kind === 'weapon') weaponIcon(gg, { base: d.style! }, x, y - TS * 0.3 + bob, TS * 0.6, col);
    else gearIcon(gg, d.slot!, x, y - TS * 0.3 + bob, TS * 0.55, col);
  }

  function drawEnemy(e: EnemyView, TS: number, t: number) {
    const gg = g!, x = e.x * TS, y = e.y * TS + e.r * TS * 0.9;
    const isBoss = e.kind === 'boss', ba = isBoss ? BOSS_ART[e.variant % BOSS_ART.length] : undefined;
    const name = ba ? ba.art : e.kind, scale = ba?.scale ?? 1, pal = ba?.pal;
    // animation state (render-only): hurt flinch, wind-up = attack pose, moving = walk cycle
    const prev = moved.get(e.id), mv = !!prev && Math.hypot(e.x - prev.x, e.y - prev.y) > 0.004;
    moved.set(e.id, { x: e.x, y: e.y });
    const st: AnimState = e.hurt < 0.12 ? 'hurt' : e.tell > 0.05 ? 'attack' : mv ? 'walk' : 'idle';
    const fr = anim(name, st, t + e.id * 0.13, e.kind === 'bat' ? 10 : 7);
    const def = sprite2(name, fr.state, fr.idx, pal, false, scale);
    const ps = (e.r * 2.4 * TS) / Math.max(def.width, def.height) * (isBoss ? 1.25 : 1.15);
    const flash = e.hurt < 0.06;
    const bob = e.kind === 'bat' ? Math.sin(t * 14 + e.id) * TS * 0.12 : -Math.abs(Math.sin(t * 8 + e.id)) * TS * 0.05;
    shadow(x, y, e.r * TS * 0.9);
    if (e.elite) { gg.globalCompositeOperation = 'lighter'; glowAt(ELITE_COLORS[e.elite], x, y - e.r * TS, e.r * TS * (2 + Math.sin(t * 5 + e.id) * 0.2), 0.55); gg.globalCompositeOperation = 'source-over'; }
    if (e.tell > 0) { gg.globalCompositeOperation = 'lighter'; glowAt(e.kind === 'bomber' ? '#ff7a2a' : '#ff3b3b', x, y - e.r * TS, e.r * TS * (1.5 + e.tell), 0.3 + e.tell * 0.6); gg.globalCompositeOperation = 'source-over'; }
    if (e.exposed) { gg.strokeStyle = `rgba(255,224,138,${0.6 + 0.4 * Math.sin(t * 10)})`; gg.lineWidth = Math.max(2, TS * 0.08); gg.setLineDash([TS * 0.25, TS * 0.15]); gg.beginPath(); gg.arc(x, y - e.r * TS, e.r * TS * 1.9, t * 2, t * 2 + Math.PI * 2); gg.stroke(); gg.setLineDash([]); }
    if (e.exposed) { gg.globalCompositeOperation = 'lighter'; glowAt('#ffe08a', x, y - e.r * TS, e.r * TS * 2.6, 0.75 + Math.sin(t * 9) * 0.2); gg.globalCompositeOperation = 'source-over'; }
    const sq = e.kind === 'spitter' ? 1 + Math.sin(t * 6 + e.id) * 0.08 : 1;
    gg.save(); gg.translate(x, y); gg.scale(1 / sq, sq); gg.translate(-x, -y);
    drawCanvas(def, x, y, ps, e.face, bob);
    if (flash) { gg.globalAlpha = 0.4; drawCanvas(sprite2(name, fr.state, fr.idx, pal, true, scale), x, y, ps, e.face, bob); gg.globalAlpha = 1; }
    gg.restore();
    if (e.shieldFrac > 0) { gg.strokeStyle = `rgba(102,204,255,${0.3 + 0.6 * e.shieldFrac})`; gg.lineWidth = 3; gg.beginPath(); gg.arc(x, y - e.r * TS, e.r * TS * 1.5, 0, Math.PI * 2); gg.stroke(); }
    if (e.elite) {
      const ly = y - def.height * ps - 14;
      gg.font = `bold ${Math.round(TS * 0.22)}px sans-serif`; gg.textAlign = 'center'; gg.lineWidth = 3; gg.strokeStyle = '#000';
      const label = `${ELITE_LABEL[e.elite]} ${KIND_LABEL[e.kind] ?? ''}`;
      gg.strokeText(label, x, ly); gg.fillStyle = ELITE_COLORS[e.elite]; gg.fillText(label, x, ly); gg.textAlign = 'left';
    }
    if (e.slowed) { gg.fillStyle = 'rgba(127,231,255,0.25)'; gg.fillRect(x - e.r * TS, y - e.r * TS * 2.2, e.r * TS * 2, e.r * TS * 2.2); }
    if (e.dot && Math.floor(t * 8) % 2) { gg.globalCompositeOperation = 'lighter'; glowAt('#7dff5a', x, y - e.r * TS * 1.8, TS * 0.2, 0.8); gg.globalCompositeOperation = 'source-over'; }
    if (isBoss && scale === 2) { // crown (bosses drawn from minion art)
      const cy = y - def.height * ps + bob - 4, cw = TS * 0.6;
      gg.fillStyle = '#ffd84a'; gg.beginPath(); gg.moveTo(x - cw / 2, cy); gg.lineTo(x - cw / 2, cy - cw * 0.45); gg.lineTo(x - cw / 4, cy - cw * 0.2); gg.lineTo(x, cy - cw * 0.55); gg.lineTo(x + cw / 4, cy - cw * 0.2); gg.lineTo(x + cw / 2, cy - cw * 0.45); gg.lineTo(x + cw / 2, cy); gg.fill();
    } else if (e.hp < e.maxHp) {
      const bw = TS * 0.7, by = y - def.height * ps - 8;
      gg.fillStyle = '#000a'; gg.fillRect(x - bw / 2 - 1, by - 1, bw + 2, 5);
      gg.fillStyle = '#e44'; gg.fillRect(x - bw / 2, by, bw * Math.max(0, e.hp) / e.maxHp, 3);
    }
  }

  return {
    mount(container: HTMLElement, c: { profile: Readonly<Profile>; send?: (a: unknown) => void; insets?: Insets }) {
      color = c.profile.color; send = c.send; insetCss = c.insets?.bottom ?? 0;
      canvas = document.createElement('canvas');
      canvas.style.cssText = 'width:100%;height:100%;display:block;background:#07060b';
      container.appendChild(canvas);
      canvas.addEventListener('pointerdown', onPointer);
      g = canvas.getContext('2d');
      dpr = Math.min(2, (globalThis as { devicePixelRatio?: number }).devicePixelRatio ?? 1);
      this.resize?.(container.clientWidth || 800, container.clientHeight || 600);
    },
    setInsets(i) { insetCss = i.bottom; },
    resize(w, h) { if (canvas) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); } },
    render(snapshot: unknown, bike: Readonly<BikeState>, _input: Readonly<InputState>) {
      const s = snapshot as DungeonSnapshot;
      if (!canvas || !g || !s.world) return;
      // sound cues (skip any backlog from before mount)
      if (lastCue < 0) lastCue = s.cues.length ? s.cues[s.cues.length - 1].id : 0;
      for (const c of s.cues) if (c.id > lastCue) { lastCue = c.id; play(c.name as SfxName, { minGapS: CUE_GAP[c.name as SfxName] }); }
      if (s.phase === 'camp' && s.camp) { actionHits = []; drawCamp(s.camp, canvas.width, canvas.height, s.t); return; }
      campHits = []; if (s.phase !== 'run') actionHits = [];
      const gg = g, W = canvas.width, H = canvas.height, w = s.world, t = s.t, p = s.player;
      // camera: smooth follow, and zoom out in arenas (boss rooms and big rooms) so the whole fight fits
      const bossE = s.boss?.active ? s.enemies.find((e) => e.kind === 'boss') : undefined;
      const here = w.rooms.find((r) => p.x >= r.x0 && p.x < r.x0 + r.w && p.y >= r.y0 && p.y < r.y0 + r.h);
      const dtR = Math.max(0, Math.min(0.1, t - camT)); camT = t;
      const zt = bossE || (here && (here.boss || here.w >= 17 || here.h >= 13)) ? ARENA_ZOOM : 1;
      zoom += (zt - zoom) * Math.min(1, dtR * 2.5);
      const TS = Math.max(20, Math.round((W / TILES_ACROSS) * zoom));
      gg.imageSmoothingEnabled = false;
      gg.fillStyle = '#07060b'; gg.fillRect(0, 0, W, H);
      if (bgFor !== w) {
        bgFor = w; bg = buildBackground(w); mini = null; pillars = [];
        for (let i = 0; i < w.tiles.length; i++) if (w.tiles[i] === TILE.PILLAR) pillars.push({ x: i % w.w, y: Math.floor(i / w.w) });
      }
      const IB = insetCss * dpr, uu = Math.max(1, Math.min(W, H) / 600) * dpr * 0.75 + 0.25;
      const VH = runLayout(W, H, IB, uu).playH; // VH: play view above the slim stance row (which sits above the HUD)
      // frame the fight: during a boss, the camera centres between the hero and the boss so neither hides under the dock
      const fx0 = bossE ? p.x + (bossE.x - p.x) * 0.45 : p.x, fy0 = bossE ? p.y + (bossE.y - p.y) * 0.45 : p.y;
      if (camFor !== w || !Number.isFinite(camX) || Math.hypot(fx0 - camX, fy0 - camY) > 8) { camX = fx0; camY = fy0; camFor = w; }
      else { const kf = Math.min(1, dtR * 6); camX += (fx0 - camX) * kf; camY += (fy0 - camY) * kf; }
      const cx = camX * TS - W / 2, cy = camY * TS - VH / 2;
      gg.save(); gg.translate(-Math.round(cx), -Math.round(cy));
      // background (visible part only)
      const k = TS / BT;
      const sx = Math.max(0, cx / k), sy = Math.max(0, cy / k), sw = Math.min(bg!.width - sx, W / k + 1), sh = Math.min(bg!.height - sy, H / k + 1);
      if (sw > 0 && sh > 0) gg.drawImage(bg!, sx, sy, sw, sh, sx * k, sy * k, sw * k, sh * k);
      // doors, stairs, chests
      const x0 = Math.max(0, Math.floor(cx / TS)), x1 = Math.min(w.w, Math.ceil((cx + W) / TS));
      const y0 = Math.max(0, Math.floor(cy / TS)), y1 = Math.min(w.h, Math.ceil((cy + H) / TS));
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const kk = w.tiles[y * w.w + x];
        if (kk === TILE.DOOR) {
          const locked = w.rooms[w.doorRoom[y * w.w + x]]?.locked;
          if (locked) {
            gg.fillStyle = '#3a2a1a'; gg.fillRect(x * TS, y * TS, TS, TS);
            gg.fillStyle = '#9aa3b5'; for (let i = 1; i < 5; i++) gg.fillRect(x * TS + (i * TS) / 5 - 2, y * TS, 4, TS);
            gg.globalCompositeOperation = 'lighter'; glowAt('#ff3b3b', x * TS + TS / 2, y * TS + TS / 2, TS * 0.8, 0.35); gg.globalCompositeOperation = 'source-over';
          } else { gg.fillStyle = 'rgba(122,90,42,0.5)'; gg.fillRect(x * TS, y * TS, TS, TS * 0.12); gg.fillRect(x * TS, y * TS + TS * 0.88, TS, TS * 0.12); }
        } else if (kk === TILE.STAIRS) {
          for (let i = 0; i < 4; i++) { gg.fillStyle = ['#1a1622', '#110e18', '#0a0810', '#040306'][i]; gg.fillRect(x * TS + i * TS * 0.08, y * TS + i * TS * 0.22, TS - i * TS * 0.16, TS - i * TS * 0.22); }
          gg.strokeStyle = '#8a7a5a'; gg.lineWidth = 2; gg.strokeRect(x * TS, y * TS, TS, TS);
          if (s.stairsOpen) { gg.globalCompositeOperation = 'lighter'; glowAt('#ffd84a', x * TS + TS / 2, y * TS + TS / 2, TS * (1.2 + Math.sin(t * 3) * 0.2), 0.7); gg.globalCompositeOperation = 'source-over'; }
        }
      }
      for (const r of w.rooms) if (r.chest) {
        const x = r.chest.x * TS, y = r.chest.y * TS, cw = TS * 0.8, ch = TS * 0.55;
        gg.fillStyle = '#6b3f1d'; gg.fillRect(x - cw / 2, y - ch, cw, ch);
        gg.fillStyle = '#ffd84a'; gg.fillRect(x - cw / 2, y - ch * 0.62, cw, ch * 0.12); gg.fillRect(x - 3, y - ch * 0.7, 6, ch * 0.3);
        if (r.chest.opened) { gg.fillStyle = '#2a1608'; gg.fillRect(x - cw / 2, y - ch - ch * 0.4, cw, ch * 0.4); }
        else { gg.fillStyle = '#8a5428'; gg.fillRect(x - cw / 2, y - ch - ch * 0.2, cw, ch * 0.3); }
      }
      // fog over unseen rooms
      gg.fillStyle = '#07060b';
      for (const r of w.rooms) if (!r.seen) gg.fillRect((r.x0 - 1) * TS, (r.y0 - 1) * TS, (r.w + 2) * TS, (r.h + 2) * TS);

      // brazier flames
      gg.globalCompositeOperation = 'lighter';
      for (const q of pillars) {
        if (q.x < x0 - 1 || q.x > x1 || q.y < y0 - 1 || q.y > y1) continue;
        const fl = 1 + Math.sin(t * 9 + q.x * 3 + q.y) * 0.15;
        glowAt('#ff8c2a', (q.x + 0.5) * TS, (q.y + 0.25) * TS, TS * 1.1 * fl, 0.35);
        glowAt('#ffe08a', (q.x + 0.5) * TS, (q.y + 0.15) * TS - TS * 0.1 * fl, TS * 0.3 * fl, 0.9);
      }
      for (const q of torches) {
        if (q.x < x0 - 1 || q.x > x1 || q.y < y0 - 1 || q.y > y1) continue;
        const fl = 1 + Math.sin(t * 11 + q.x * 5) * 0.12 + Math.sin(t * 23 + q.y) * 0.06;
        glowAt('#ff8c2a', (q.x + 0.5) * TS, (q.y + 0.3) * TS, TS * 0.9 * fl, 0.3);
        glowAt('#ffe08a', (q.x + 0.5) * TS, (q.y + 0.3) * TS, TS * 0.22 * fl, 1);
      }
      gg.globalCompositeOperation = 'source-over';
      // shrines
      for (const sh of s.shrines) {
        if (!w.rooms[sh.room].seen) continue;
        const x = sh.x * TS, y = sh.y * TS, col = sh.state === 'failed' ? '#666666' : SHRINE_COLORS[sh.kind];
        const a = sh.state === 'active' ? 0.8 + Math.sin(t * 6) * 0.2 : sh.state === 'idle' ? 0.45 : 0.15;
        gg.globalCompositeOperation = 'lighter'; glowAt(col, x, y - TS * 0.5, TS * 1.4, a); gg.globalCompositeOperation = 'source-over';
        gg.fillStyle = '#4a4458'; gg.beginPath(); gg.moveTo(x - TS * 0.28, y + TS * 0.2); gg.lineTo(x - TS * 0.18, y - TS * 1.0); gg.lineTo(x, y - TS * 1.2); gg.lineTo(x + TS * 0.18, y - TS * 1.0); gg.lineTo(x + TS * 0.28, y + TS * 0.2); gg.fill();
        gg.fillStyle = col; gg.fillRect(x - TS * 0.06, y - TS * 0.85, TS * 0.12, TS * 0.5);
        if (sh.state === 'active') { gg.strokeStyle = col; gg.lineWidth = 4; gg.beginPath(); gg.arc(x, y - TS * 0.5, TS * 0.9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * sh.progress); gg.stroke(); }
      }
      // volatile-elite blasts about to go off
      for (const h of s.hazards) {
        const k2 = 1 - h.left / h.total;
        gg.fillStyle = `rgba(255,90,40,${0.15 + 0.25 * k2})`; gg.beginPath(); gg.arc(h.x * TS, h.y * TS, h.r * TS * k2, 0, Math.PI * 2); gg.fill();
        gg.strokeStyle = '#ff7a2a'; gg.lineWidth = 2; gg.beginPath(); gg.arc(h.x * TS, h.y * TS, h.r * TS, 0, Math.PI * 2); gg.stroke();
      }
      for (const d of s.drops) drawDrop(d, TS, t);
      heroScr = { x: p.x * TS - Math.round(cx), y: p.y * TS - Math.round(cy) };
      { // coin magnet: a coin that vanished next to the hero was picked up -> fly it to the HUD counter
        const now = new Map<number, { x: number; y: number }>();
        for (const d of s.drops) if (d.kind === 'coin') now.set(d.id, { x: d.x, y: d.y });
        for (const [id, q] of coinSeen) if (!now.has(id) && Math.hypot(q.x - p.x, q.y - p.y) < 2.5 && flyers.length < 24)
          flyers.push({ x: q.x * TS - Math.round(cx), y: q.y * TS - Math.round(cy), t0: t });
        coinSeen = now;
      }
      for (const a of s.actions) { // ready pulse on the frame an action finishes refilling
        const was = readyPrev.get(a.id);
        if (was !== undefined && was < 1 && a.ready >= 1 && pulses.length < 4) pulses.push({ t0: t, color: ACTION_COLOR[a.id] ?? '#ffd84a', label: `${a.label} ready` });
        readyPrev.set(a.id, a.ready);
      }
      // AI intent: dotted path to the hero's next goal
      if (s.ai.path.length) {
        gg.fillStyle = 'rgba(255,255,255,0.35)';
        // dots evenly spaced along the (smoothed, possibly diagonal) polyline from the hero, up to ~16 tiles
        let ax = s.player.x, ay = s.player.y, carry = 0.6, drawn = 0;
        for (const q of s.ai.path) {
          const dx = q.x - ax, dy = q.y - ay, d = Math.hypot(dx, dy);
          for (let k = carry; k < d && drawn < 27; k += 0.6, drawn++) { gg.beginPath(); gg.arc((ax + dx * k / d) * TS, (ay + dy * k / d) * TS, Math.max(2, TS * 0.06), 0, Math.PI * 2); gg.fill(); }
          carry = ((carry - d) % 0.6 + 0.6) % 0.6 || 0.6; ax = q.x; ay = q.y;
        }
        const end = s.ai.path[s.ai.path.length - 1];
        gg.strokeStyle = 'rgba(255,255,255,0.5)'; gg.lineWidth = 2; gg.beginPath(); gg.arc(end.x * TS, end.y * TS, TS * 0.28, 0, Math.PI * 2); gg.stroke();
      }

      // aura (effort zone) under the hero
      const aura = AURA[bike.effortZone];
      if (aura) {
        const pulse = 1 + Math.sin(t * (2 + bike.effortZone)) * 0.08;
        gg.globalCompositeOperation = 'lighter';
        glowAt(aura.c, p.x * TS, p.y * TS, aura.r * TS * pulse, aura.a);
        if (bike.effortZone >= 4) for (let i = 0; i < 6; i++) { // rising embers
          const a = i * 1.047 + t * 0.7, ph = (t * 0.9 + i * 0.37) % 1;
          glowAt(aura.c, p.x * TS + Math.cos(a) * TS * 0.6, p.y * TS - ph * TS * 1.4, TS * 0.12, (1 - ph) * aura.a);
        }
        gg.globalCompositeOperation = 'source-over';
      }

      // y-sorted actors
      type A = { y: number; d: () => void };
      const actors: A[] = s.enemies.map((e) => ({ y: e.y, d: () => drawEnemy(e, TS, t) }));
      actors.push({ y: p.y, d: () => {
        const px = p.x * TS, py = p.y * TS + p.r * TS * 1.1, face = Math.cos(s.aim.angle) >= 0 ? 1 : -1;
        const bob = p.moving ? -Math.abs(Math.sin(t * 10)) * TS * 0.07 : 0;
        shadow(px, py, TS * 0.32);
        const shot = s.bullets.some((b) => b.friendly && b.age < 0.12 && Math.hypot(b.x - p.x, b.y - p.y) < 1.6);
        const hst: AnimState = p.hurt < 0.12 ? 'hurt' : shot ? 'attack' : p.moving ? 'walk' : 'idle';
        const hf = anim('hero', hst, t, 9), hs = TS / 15, hpal = heroPalette(color);
        if (p.rolling) { gg.globalAlpha = 0.3; drawCanvas(sprite2('hero', 'walk', 0, hpal), px - Math.cos(s.aim.angle) * TS * 0.3, py, hs, face); gg.globalAlpha = 1; }
        gg.globalAlpha = p.invuln && Math.floor(t * 12) % 2 ? 0.45 : 1;
        drawCanvas(sprite2('hero', hf.state, hf.idx, hpal), px, py, hs, face, bob);
        if (p.hurt < 0.08) { gg.globalAlpha = 0.5; drawCanvas(sprite2('hero', hf.state, hf.idx, undefined, true), px, py, hs, face, bob); }
        gg.globalAlpha = 1;
        if (p.warded) { gg.strokeStyle = `rgba(127,231,255,${0.6 + Math.sin(t * 12) * 0.25})`; gg.lineWidth = 3; gg.beginPath(); gg.arc(p.x * TS, p.y * TS, TS * 0.75, 0, Math.PI * 2); gg.stroke(); }
        // weapon held toward the aim
        const hx = p.x * TS, hy = p.y * TS, ca = Math.cos(s.aim.angle), sa = Math.sin(s.aim.angle), wc = RARITY_COLORS[s.weapon.rarity];
        { // the stance's weapon (by style) in the hero's hand, rotated toward the aim
          const ws = weaponSprite(s.weapon.base), sz = ws.width * hs * 0.9, kick = shot ? -TS * 0.06 : 0;
          gg.save(); gg.translate(hx + ca * (TS * 0.28 + kick), hy + sa * (TS * 0.28 + kick) + bob + TS * 0.05);
          gg.rotate(s.aim.angle + Math.PI / 4); if (ca < 0) gg.scale(1, -1);
          gg.drawImage(ws, -sz * 0.35, -sz * 0.65, sz, sz); gg.restore();
          gg.globalCompositeOperation = 'lighter'; glowAt(ELEMENT_COLORS[s.weapon.element], hx + ca * TS * 0.55, hy + sa * TS * 0.55 + bob, TS * (shot ? 0.32 : 0.2), shot ? 0.9 : 0.5); gg.globalCompositeOperation = 'source-over';
          gg.fillStyle = wc; gg.fillRect(hx + ca * TS * 0.55 - 1, hy + sa * TS * 0.55 + bob - 1, 3, 3);
        }
      } });
      actors.sort((a, b) => a.y - b.y);
      for (const a of actors) a.d();

      for (const b of s.bullets) drawBullet(b, TS, t);
      for (const f of s.fx) drawFx(f, t, TS);
      // orbiting blades (unique)
      for (const o of s.orbit) {
        const ox = o.x * TS, oy = o.y * TS, col = ELEMENT_COLORS[s.weapon.element];
        gg.globalCompositeOperation = 'lighter'; glowAt(col, ox, oy, TS * 0.5, 0.8); gg.globalCompositeOperation = 'source-over';
        gg.save(); gg.translate(ox, oy); gg.rotate(t * 14); gg.fillStyle = '#eef4ff'; gg.beginPath();
        for (let i = 0; i < 8; i++) { const rr = i % 2 ? TS * 0.08 : TS * 0.26, a = (i / 8) * Math.PI * 2; gg.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        gg.fill(); gg.restore();
      }

      // AI intent: target marker (the path is drawn under the actors)
      const tgt = s.ai.targetId ? s.enemies.find((e) => e.id === s.ai.targetId) : undefined;
      if (tgt) {
        const rx = tgt.x * TS, ry = tgt.y * TS, rr = (tgt.r + 0.35) * TS, sp = t * 2;
        gg.strokeStyle = tgt.kind === 'boss' ? '#ff5a5a' : '#ffd84a'; gg.lineWidth = 2.5;
        for (let i = 0; i < 4; i++) { const a = sp + (i * Math.PI) / 2; gg.beginPath(); gg.arc(rx, ry, rr, a, a + 0.8); gg.stroke(); }
      }
      gg.restore();

      // torch-light vignette
      const dark = s.curse?.kind === 'darkness';
      const vg = gg.createRadialGradient(W / 2, VH / 2, TS * (dark ? 1.4 : 3.5), W / 2, VH / 2, Math.max(W, H) * (dark ? 0.32 : 0.7));
      vg.addColorStop(0, 'rgba(7,6,11,0)'); vg.addColorStop(1, `rgba(7,6,11,${dark ? 0.97 : 0.55})`);
      gg.fillStyle = vg; gg.fillRect(0, 0, W, H);
      if (!dark) { // light map at 1/4 res: ambient dark, holes punched by the hero, torches and braziers (flickering)
        const LW = Math.ceil(W / 4), LH = Math.ceil(H / 4);
        if (!lightC || lightC.width !== LW || lightC.height !== LH) { lightC = document.createElement('canvas'); lightC.width = LW; lightC.height = LH; }
        const lg = lightC.getContext('2d')!, ox = Math.round(cx), oy = Math.round(cy), q4 = (v: number) => v / 4;
        lg.globalCompositeOperation = 'source-over'; lg.clearRect(0, 0, LW, LH); lg.fillStyle = 'rgba(7,6,11,0.42)'; lg.fillRect(0, 0, LW, LH);
        lg.globalCompositeOperation = 'destination-out';
        const hole = (x: number, y: number, r: number, a: number) => { lg.globalAlpha = a; lg.drawImage(glow('#ffffff'), q4(x - ox - r), q4(y - oy - r), q4(2 * r), q4(2 * r)); };
        hole(p.x * TS, p.y * TS, TS * 5, 1);
        for (const q of torches) if (q.x >= x0 - 4 && q.x <= x1 + 4 && q.y >= y0 - 4 && q.y <= y1 + 4) hole((q.x + 0.5) * TS, (q.y + 0.6) * TS, TS * (3 + Math.sin(t * 11 + q.x * 5) * 0.2), 0.9);
        for (const q of pillars) if (q.x >= x0 - 4 && q.x <= x1 + 4 && q.y >= y0 - 4 && q.y <= y1 + 4) hole((q.x + 0.5) * TS, (q.y + 0.3) * TS, TS * (3.4 + Math.sin(t * 9 + q.x * 3) * 0.25), 0.9);
        lg.globalAlpha = 1; lg.globalCompositeOperation = 'source-over';
        gg.imageSmoothingEnabled = true; gg.drawImage(lightC, 0, 0, W, H); gg.imageSmoothingEnabled = false;
      }
      if (s.curse) { // cursed: pulsing coloured edges
        const cv = gg.createRadialGradient(W / 2, VH / 2, Math.min(W, H) * 0.4, W / 2, VH / 2, Math.max(W, H) * 0.7);
        cv.addColorStop(0, s.curse.color + '00'); cv.addColorStop(1, s.curse.color + Math.round(0x30 + 0x20 * Math.sin(t * 3)).toString(16));
        gg.fillStyle = cv; gg.fillRect(0, 0, W, H);
      }
      if (p.hurt < 0.3) { // red edge pulse when hit
        const hv = gg.createRadialGradient(W / 2, VH / 2, Math.min(W, H) * 0.35, W / 2, VH / 2, Math.max(W, H) * 0.65);
        hv.addColorStop(0, 'rgba(255,0,0,0)'); hv.addColorStop(1, `rgba(255,0,0,${0.35 * (1 - p.hurt / 0.3)})`);
        gg.fillStyle = hv; gg.fillRect(0, 0, W, H);
      }

      drawHud(s, W, H, bike);
    },
    unmount() { canvas?.removeEventListener('pointerdown', onPointer); canvas?.remove(); canvas = null; g = null; bg = null; bgFor = null; mini = null; },
  };

  function drawCamp(c: CampView, W: number, H: number, t: number) {
    const gg = g!, u = Math.max(1, Math.min(W, H) / 600) * dpr * 0.75 + 0.25, fs = Math.round(15 * u);
    const UH = H - insetCss * dpr; // camp scene sits above the HUD; the backdrop is full-bleed
    const bgG = gg.createRadialGradient(W / 2, UH * 0.95, 10, W / 2, UH * 0.95, Math.max(W, H) * 0.8);
    bgG.addColorStop(0, '#3a1e10'); bgG.addColorStop(0.4, '#140c14'); bgG.addColorStop(1, '#05040a');
    gg.fillStyle = bgG; gg.fillRect(0, 0, W, H);
    gg.globalCompositeOperation = 'lighter'; // campfire
    glowAt('#ff8c2a', W / 2, UH * 0.93, 140 * u * (1 + Math.sin(t * 7) * 0.06), 0.7); glowAt('#ffe08a', W / 2, UH * 0.94, 40 * u, 0.9);
    gg.globalCompositeOperation = 'source-over';
    drawSprite('hero', W / 2 - 70 * u, UH * 0.97, 5 * u, 1, false, heroPalette(color));
    gg.textAlign = 'center'; gg.fillStyle = '#ffd84a'; gg.font = `900 ${Math.round(30 * u)}px sans-serif`;
    gg.fillText('Camp', W / 2, 44 * u);
    gg.fillStyle = '#ccc'; gg.font = `${fs}px sans-serif`;
    gg.fillText(`Bank ● ${c.bank}   ·   Best floor ${c.bestFloor}   ·   Runs ${c.runs}`, W / 2, 70 * u);
    if (c.lastDeath) { gg.fillStyle = '#ff8a8a'; gg.font = `bold ${Math.round(fs * 0.9)}px sans-serif`;
      gg.fillText(`You fell on floor ${c.lastDeath.floor}. Every coin was banked. Cool down, level up, go again.`, W / 2, UH * 0.82); }
    const rowH = 30 * u, lw = Math.min(W - 40 * u, 620 * u), lx = W / 2 - lw / 2;
    const maxRows = Math.max(4, Math.floor((UH * 0.72 - 90 * u) / rowH));
    const first = Math.max(0, Math.min(c.sel - Math.floor(maxRows / 2), c.rows.length - maxRows));
    campHits = [];
    c.rows.slice(first, first + maxRows).forEach((r, i) => {
      const idx = first + i, y = 90 * u + i * rowH, sel = idx === c.sel;
      campHits.push({ x: lx, y, w: lw, h: rowH - 4 * u, row: idx });
      gg.fillStyle = sel ? 'rgba(255,216,74,0.18)' : 'rgba(0,0,0,0.45)'; gg.fillRect(lx, y, lw, rowH - 4 * u);
      if (sel) { gg.strokeStyle = '#ffd84a'; gg.lineWidth = 2; gg.strokeRect(lx, y, lw, rowH - 4 * u); }
      gg.textAlign = 'left'; gg.font = `bold ${fs}px sans-serif`;
      gg.fillStyle = r.kind === 'start' ? '#7dff5a' : '#fff';
      gg.fillText(r.name, lx + 10 * u, y + rowH * 0.62);
      gg.font = `${Math.round(12 * u)}px sans-serif`; gg.fillStyle = '#aaa';
      gg.fillText(r.desc, lx + 190 * u, y + rowH * 0.62, lw - 330 * u);
      gg.textAlign = 'right';
      if (r.kind === 'upgrade') {
        gg.fillStyle = '#ddd'; gg.fillText(`Lv ${r.level}/${r.max}`, lx + lw - 90 * u, y + rowH * 0.62);
        gg.fillStyle = r.cost === undefined ? '#7dff5a' : r.affordable ? '#ffd84a' : '#775';
        gg.font = `bold ${Math.round(13 * u)}px sans-serif`;
        gg.fillText(r.cost === undefined ? 'MAX' : `● ${r.cost}`, lx + lw - 10 * u, y + rowH * 0.62);
      }
    });
    gg.textAlign = 'center'; gg.font = `${fs}px sans-serif`; gg.fillStyle = '#bbb';
    const left = Math.ceil(c.autoStartLeft);
    gg.fillText(`Tap a row, or D-pad + Z to buy/select · B begin  —  auto-start after ${left}s of pedaling`, W / 2, UH - 18 * u);
    gg.textAlign = 'left';
  }

  function bar(x: number, y: number, w: number, h: number, frac: number, col: string, label: string) {
    const gg = g!;
    gg.fillStyle = '#000b'; gg.fillRect(x - 2, y - 2, w + 4, h + 4);
    gg.fillStyle = '#2a2433'; gg.fillRect(x, y, w, h);
    gg.fillStyle = col; gg.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
    gg.fillStyle = 'rgba(255,255,255,0.18)'; gg.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h * 0.35);
    gg.fillStyle = '#fff'; gg.font = `bold ${Math.round(h * 0.75)}px sans-serif`; gg.fillText(label, x + 6, y + h * 0.78);
  }

  /** Dev measurement: boxes the dungeon HUD covers this frame (device px); read by dev-shot to report HUD area. */
  function drawHud(s: DungeonSnapshot, W: number, H: number, _bike: Readonly<BikeState>) {
    hudBoxes = []; (globalThis as { __dgHud?: unknown }).__dgHud = { boxes: hudBoxes, W, H };
    const gg = g!, p = s.player, u = Math.max(1, Math.min(W, H) / 600) * dpr * 0.75 + 0.25;
    const L = 14 * u, fs = Math.round(13 * u);
    gg.textAlign = 'left';
    // compact status panel (top-left): thin HP + XP bars, then Lv/floor, coins, potions and the Second Wind pip on one line.
    // `hu` scales from CSS pixels, so the iPad's large device scale doesn't double it (and it clears the boss bar).
    const hu = (Math.max(1, Math.min(W, H) / dpr / 600) * 0.75 + 0.25) * dpr, PW = 150 * hu;
    {
      const x = L, y = L, hpLow = p.hp < p.maxHp * 0.4;
      gg.fillStyle = 'rgba(10,8,16,0.6)'; gg.fillRect(x - 3 * hu, y - 3 * hu, PW + 6 * hu, 38 * hu); hudBox(x - 3 * hu, y - 3 * hu, PW + 6 * hu, 38 * hu);
      gg.fillStyle = '#2a2433'; gg.fillRect(x, y, PW, 11 * hu);
      gg.fillStyle = hpLow ? '#e44' : '#3c3'; gg.fillRect(x, y, PW * Math.max(0, Math.min(1, p.hp / p.maxHp)), 11 * hu);
      gg.fillStyle = '#fff'; gg.font = `bold ${Math.round(9 * hu)}px sans-serif`;
      gg.fillText(`${Math.min(Math.round(p.maxHp), Math.ceil(Math.max(0, p.hp)))} / ${Math.round(p.maxHp)}`, x + 4 * hu, y + 8.5 * hu);
      gg.fillStyle = '#2a2433'; gg.fillRect(x, y + 13 * hu, PW, 3 * hu);
      gg.fillStyle = '#b06cff'; gg.fillRect(x, y + 13 * hu, PW * Math.max(0, Math.min(1, p.xp / p.xpNext)), 3 * hu);
      const ly = y + 28 * hu; gg.font = `bold ${Math.round(10 * hu)}px sans-serif`;
      gg.fillStyle = '#fff'; gg.fillText(`Lv${p.level} F${s.floor}`, x, ly);
      const cp = Math.max(0, 1 - (s.t - coinPulseT) / 0.25);
      if (cp > 0) { gg.save(); gg.font = `bold ${Math.round(10 * hu * (1 + 0.35 * cp))}px sans-serif`; }
      gg.fillStyle = cp > 0 ? '#fff4b0' : '#ffd84a'; gg.fillText(`● ${p.coins}`, x + 44 * hu, ly);
      if (cp > 0) gg.restore();
      const tx = x + 47 * hu, ty = ly - 3.5 * hu;
      for (let i = flyers.length - 1; i >= 0; i--) {
        const f = flyers[i], k = (s.t - f.t0) / 0.45;
        if (k >= 1 || k < 0) { flyers.splice(i, 1); if (k >= 1) coinPulseT = s.t; continue; }
        const e = k * k * (3 - 2 * k), fx2 = f.x + (tx - f.x) * e, fy2 = f.y + (ty - f.y) * e - Math.sin(k * Math.PI) * 40 * hu;
        drawSprite('coin', fx2, fy2 + 3 * hu, (1.4 - 0.6 * k) * hu);
      }
      for (let k = 0; k < p.potionCap; k++) { gg.globalAlpha = k < p.potions ? 1 : 0.25; drawSprite('potion', x + 86 * hu + k * 9 * hu, ly - 3.5 * hu, 1.1 * hu); }
      gg.globalAlpha = 1;
      // Second Wind: a small wing pip that fills while it recharges and glows when ready (no numbers)
      const sw = p.secondWind, sx = x + PW - 26 * hu, sy = ly - 8 * hu, w = 26 * hu, h = 9 * hu, ready = sw >= 1;
      gg.fillStyle = 'rgba(0,0,0,0.55)'; gg.fillRect(sx, sy, w, h);
      gg.fillStyle = ready ? '#ffe08a' : desaturate('#ffe08a', 0.7, 0.35); gg.fillRect(sx, sy, w * Math.min(1, sw), h);
      if (ready || p.secondWindFlash > 0) { gg.strokeStyle = `rgba(255,224,138,${ready ? 0.5 + 0.4 * Math.sin(s.t * 4) : p.secondWindFlash})`; gg.lineWidth = Math.max(1, hu); gg.strokeRect(sx - 1, sy - 1, w + 2, h + 2); }
      gg.fillStyle = ready ? '#2a1d00' : '#ddd'; gg.font = `bold ${Math.round(7 * hu)}px sans-serif`; gg.textAlign = 'center'; gg.fillText('2nd W', sx + w / 2, sy + h - 2 * hu); gg.textAlign = 'left';
    }
    // slim stance row (bottom-left): [stance badge][weapon icon] Lv · element, then tiny chips for the other stances.
    // Actions and cooldowns live on the shell's controller-overlay diamond (also the touch target).
    const LY = runLayout(W, H, insetCss * dpr, u, s.stance.list.length - 1);
    actionHits = [];
    {
      const st = s.stance, wcol = RARITY_COLORS[s.weapon.rarity], R = LY.card, cy = R.y + R.h / 2;
      gg.fillStyle = 'rgba(10,8,16,0.72)'; gg.fillRect(R.x, R.y, R.w, R.h); hudBox(R.x, R.y, R.w, R.h);
      gg.strokeStyle = st.color; gg.lineWidth = Math.max(1, u); gg.strokeRect(R.x, R.y, R.w, R.h);
      // stance badge: its colour with the initial; swapping shows the pick's colour
      const pickC = st.swapping ? s.stance.list.find((x) => x.id === st.swapping)?.color ?? st.color : st.color;
      gg.fillStyle = pickC; gg.fillRect(R.x + 2 * u, R.y + 2 * u, R.h - 4 * u, R.h - 4 * u);
      gg.fillStyle = '#0a0810'; gg.font = `900 ${Math.round(13 * u)}px sans-serif`; gg.textAlign = 'center';
      gg.fillText((st.swapping ? s.stance.list.find((x) => x.id === st.swapping)?.name ?? st.name : st.name)[0], R.x + R.h / 2, cy + 4.5 * u);
      weaponIcon(gg, s.weapon, R.x + R.h + 11 * u, cy, 16 * u, wcol);
      gg.textAlign = 'left'; gg.fillStyle = '#eee'; gg.font = `bold ${Math.round(11 * u)}px sans-serif`;
      const elem = ` ${s.weapon.element}`;
      // weapon name (rarity colour, ellipsized to fit) then Lv/element
      const tail = ` Lv${s.weapon.level}${s.weapon.plus ? '+' + s.weapon.plus : ''}${elem}${st.styleOn ? ' ✓' : ''}`;
      const tx = R.x + R.h + 23 * u, room = R.x + R.w - 4 * u - tx;
      gg.font = `${Math.round(10.5 * u)}px sans-serif`; const tw = gg.measureText(tail).width;
      gg.font = `bold ${Math.round(11 * u)}px sans-serif`;
      let name = s.weapon.name; const nameRoom = Math.max(0, room - tw);
      if (gg.measureText(name).width > nameRoom) { while (name.length > 1 && gg.measureText(name + '…').width > nameRoom) name = name.slice(0, -1); name = name.trimEnd() + '…'; }
      gg.fillStyle = wcol; gg.fillText(name, tx, cy + 4 * u);
      const nx = tx + gg.measureText(name).width;
      gg.font = `${Math.round(10.5 * u)}px sans-serif`; gg.fillStyle = '#ccc'; gg.fillText(tail, nx, cy + 4 * u, Math.max(1, R.x + R.w - 4 * u - nx));
      // other stances: weapon icon + level; the D-pad pick fills, the AI suggestion pulses
      const others = s.stance.list.filter((x) => x.id !== st.id), C = LY.stance, n = Math.max(1, others.length);
      const cw = (C.w - (n - 1) * 3 * u) / n;
      others.forEach((o, k) => {
        const x = C.x + k * (cw + 3 * u), picked = st.swapping === o.id, sug = st.suggest === o.id;
        hudBox(x, C.y, cw, C.h);
        gg.fillStyle = picked ? o.color : 'rgba(10,8,16,0.6)'; gg.fillRect(x, C.y, cw, C.h);
        gg.globalAlpha = sug && !picked ? 0.6 + 0.4 * Math.sin(s.t * 5) : 1;
        gg.strokeStyle = o.color; gg.lineWidth = sug || picked ? 2 : 1; gg.strokeRect(x, C.y, cw, C.h);
        if (o.base) weaponIcon(gg, { base: o.base as Weapon['base'] }, x + cw * 0.36, C.y + C.h / 2, C.h * 0.55, picked ? '#0a0810' : o.color);
        gg.fillStyle = picked ? '#0a0810' : '#fff'; gg.font = `bold ${Math.round(9 * u)}px sans-serif`; gg.textAlign = 'right';
        gg.fillText(o.level ? String(o.level) : '–', x + cw - 2 * u, C.y + C.h - 3 * u); gg.textAlign = 'left'; gg.globalAlpha = 1;
      });
      // equipped gear: slot icon + item level, border/tint in the item's rarity colour
      let gx = C.x + C.w + 6 * u;
      for (const sl of SLOTS) {
        const it = s.gear[sl]; if (!it) continue;
        const gw = C.h, rc = RARITY_COLORS[it.rarity];
        hudBox(gx, C.y, gw, C.h);
        gg.fillStyle = 'rgba(10,8,16,0.6)'; gg.fillRect(gx, C.y, gw, C.h);
        gg.strokeStyle = rc; gg.lineWidth = Math.max(1, u); gg.strokeRect(gx, C.y, gw, C.h);
        gearIcon(gg, sl, gx + gw * 0.4, C.y + C.h * 0.42, C.h * 0.5, rc);
        gg.fillStyle = '#fff'; gg.font = `bold ${Math.round(8.5 * u)}px sans-serif`; gg.textAlign = 'right';
        gg.fillText(String(it.level), gx + gw - 2 * u, C.y + C.h - 2.5 * u); gg.textAlign = 'left';
        gx += gw + 3 * u;
      }
    }

    // active shrine banner
    const act = s.shrines.find((x) => x.state === 'active');
    if (act) {
      const bw = Math.min(W * 0.4, 420 * u), bx = W / 2 - bw / 2, by = L + (s.boss?.active ? 78 : 0) * u + 28 * u;
      bar(bx, by, bw, 14 * u, act.progress, SHRINE_COLORS[act.kind], '');
      gg.fillStyle = '#fff'; gg.textAlign = 'center'; gg.font = `bold ${fs}px sans-serif`;
      gg.fillText(`${act.label} — ${Math.ceil(act.leftS)}s`, W / 2, by - 6 * u); gg.textAlign = 'left';
    }
    // active curse
    if (s.curse) {
      const c = s.curse, bw = Math.min(W * 0.4, 420 * u), bx = W / 2 - bw / 2;
      const by = L + (s.boss?.active ? 78 : 0) * u + (act ? 50 : 0) * u + 28 * u;
      bar(bx, by, bw, 14 * u, c.left / c.total, c.color, '');
      gg.fillStyle = c.color; gg.textAlign = 'center'; gg.font = `bold ${fs}px sans-serif`;
      gg.fillText(`☠ ${c.name}: ${c.desc} · ${Math.ceil(c.left)}s`, W / 2, by - 6 * u, bw + 60 * u); gg.textAlign = 'left';
    }
    // big banners (uniques, curses)
    let bannerRow = 0; // stack banners that overlap in time (e.g. EXPLORE straight into AMBUSH), newest lowest
    for (const f of s.fx) if (f.kind === 'banner') {
      const k2 = (s.t - f.t0) / f.life; if (k2 < 0 || k2 > 1) continue;
      const row = bannerRow++;
      gg.globalAlpha = Math.min(1, (1 - k2) * 3); gg.textAlign = 'center';
      gg.font = `900 ${Math.round(30 * u)}px sans-serif`; gg.lineWidth = 6; gg.strokeStyle = '#000';
      const by = H * 0.3 + row * 40 * u - Math.min(1, k2 * 6) * 10 * u;
      gg.strokeText(f.text!, W / 2, by); gg.fillStyle = f.color; gg.fillText(f.text!, W / 2, by);
      gg.globalAlpha = 1; gg.textAlign = 'left';
    }
    // action-ready pulses (screen space, around the hero)
    for (let i = pulses.length - 1; i >= 0; i--) {
      const q = pulses[i], k = (s.t - q.t0) / 0.7;
      if (k < 0 || k > 1) { pulses.splice(i, 1); continue; }
      gg.strokeStyle = q.color; gg.globalAlpha = 1 - k; gg.lineWidth = 3 * u;
      gg.beginPath(); gg.arc(heroScr.x, heroScr.y, (18 + 40 * k) * u, 0, Math.PI * 2); gg.stroke();
      gg.font = `bold ${Math.round(11 * u)}px sans-serif`; gg.textAlign = 'center'; gg.lineWidth = 3; gg.strokeStyle = '#000';
      gg.strokeText(q.label, heroScr.x, heroScr.y - (34 + 14 * k) * u); gg.fillStyle = q.color; gg.fillText(q.label, heroScr.x, heroScr.y - (34 + 14 * k) * u);
      gg.globalAlpha = 1; gg.textAlign = 'left';
    }
    // toasts
    gg.font = `bold ${Math.round(11 * hu)}px sans-serif`;
    s.toasts.forEach((tt, i) => {
      const age = s.t - tt.t0; gg.globalAlpha = Math.max(0, Math.min(1, (6 - age) / 1.5));
      gg.lineWidth = 3; gg.strokeStyle = '#000'; gg.strokeText(tt.text, L, L + (52 + i * 15) * hu); gg.fillStyle = tt.color; gg.fillText(tt.text, L, L + (52 + i * 15) * hu);
    });
    gg.globalAlpha = 1;

    // minimap with fog (top-right)
    const w = s.world, mm = Math.max(1, Math.round(MM * u * 0.8));
    const mScale = Math.min(0.55, (110 * u) / Math.max(1, w.w * mm)); // drawn at ~half size, capped at ~110u wide
    if (!mini || mini.width !== w.w * mm) { mini = document.createElement('canvas'); mini.width = w.w * mm; mini.height = w.h * mm; }
    const m = mini.getContext('2d')!;
    m.clearRect(0, 0, mini.width, mini.height);
    for (const r of w.rooms) {
      if (!r.seen) continue;
      m.fillStyle = r.id === s.room ? '#8a8fa0' : r.cleared ? '#4a6a52' : r.boss ? '#6a3a5a' : '#555a66';
      m.fillRect(r.x0 * mm, r.y0 * mm, r.w * mm, r.h * mm);
      if (r.chest && !r.chest.opened) { m.fillStyle = '#ffd84a'; m.fillRect((r.chest.x - 1) * mm, (r.chest.y - 1) * mm, 2 * mm, 2 * mm); }
    }
    for (let i = 0; i < w.tiles.length; i++) if (w.tiles[i] === TILE.DOOR && w.rooms[w.doorRoom[i]]?.seen) { m.fillStyle = '#7a6a4a'; m.fillRect((i % w.w) * mm, Math.floor(i / w.w) * mm, mm, mm); }
    const br = w.rooms.find((r) => r.boss);
    if (br?.seen) { m.fillStyle = s.stairsOpen ? '#ffd84a' : '#a07a2a'; m.fillRect((w.stairs.x - 1) * mm, (w.stairs.y - 1) * mm, 2 * mm, 2 * mm); }
    const mw = mini.width * mScale, mh = mini.height * mScale, mx0 = W - mw - L, my0 = L, mk = mm * mScale;
    gg.fillStyle = 'rgba(0,0,0,0.35)'; gg.fillRect(mx0 - 3, my0 - 3, mw + 6, mh + 6); hudBox(mx0 - 3, my0 - 3, mw + 6, mh + 6);
    gg.globalAlpha = 0.8; gg.drawImage(mini, mx0, my0, mw, mh); gg.globalAlpha = 1;
    for (const e of s.enemies) if (e.kind === 'boss' || w.rooms[s.room] && e.x >= w.rooms[s.room].x0 && e.x <= w.rooms[s.room].x0 + w.rooms[s.room].w && e.y >= w.rooms[s.room].y0 && e.y <= w.rooms[s.room].y0 + w.rooms[s.room].h) {
      gg.fillStyle = ENEMY_TINT[e.kind] ?? '#e55'; gg.fillRect(mx0 + e.x * mk - 1, my0 + e.y * mk - 1, 2.5 * u, 2.5 * u);
    }
    gg.fillStyle = color; gg.fillRect(mx0 + p.x * mk - 2 * u, my0 + p.y * mk - 2 * u, 4 * u, 4 * u);

    if (s.boss && s.boss.active) {
      const bw0 = Math.min(W * 0.4, 420 * u), bx0 = Math.max(W / 2 - bw0 / 2, L + PW + 12 * hu), bw = Math.min(bw0, W - bx0 - L - 130 * u), bx = bx0, by = L;
      const B = s.boss, exp = B.cycle === 'exposed', wind = B.cycle === 'windup';
      hudBox(bx - 2, by - 2, bw + 4, 48 * u);
      bar(bx, by, bw, 18 * u, B.hp / B.maxHp, exp ? '#ffd84a' : B.tide > 0 ? '#9a5ab0' : '#c0a', `${B.name}  ·  phase ${B.phase}`);
      gg.fillStyle = '#fff'; for (const sp of B.splits) gg.fillRect(bx + bw * sp - 1, by, 2, 18 * u); // phase marks
      gg.textAlign = 'center'; gg.font = `bold ${Math.round(13 * u)}px sans-serif`;
      gg.fillStyle = exp ? '#ffe08a' : wind ? '#ff7a2a' : B.tide > 0 ? '#7dff5a' : '#ddd';
      gg.fillText(exp ? 'EXPOSED: x2 damage. Sprint and Strike now!' : wind ? 'Big attack coming: Ward to parry' : B.cycle === 'stagger' ? 'Staggered!' : B.tide > 0 ? `Turning Tide: boss takes +${Math.round(B.tide * 100)}%` : 'Watch for the big attack', W / 2, by + 40 * u);
      gg.textAlign = 'left';
    } else if (s.stairsOpen) {
      gg.fillStyle = '#ffd84a'; gg.textAlign = 'center'; gg.font = `bold ${fs}px sans-serif`;
      gg.fillText('Stairs open — descend!', W / 2, L + 14 * u); gg.textAlign = 'left';
    }
  }
}
