import type { BikeState, GameRenderer, InputState, Insets, Profile } from '../../../contracts';
import type { DungeonSnapshot, EnemyView, BulletView, DropView, Fx, EliteMod, CampView } from '../sim/types';
import { desaturate } from '../../kit/actionButton';
import { runLayout, bossHudLayout } from './layout';
import { play, type SfxName } from '../../../audio/sfx';
import { TILE, type World } from '../sim/world';
import { ELEMENT_COLORS, RARITY_COLORS, SLOTS, type Weapon } from '../sim/loot';
import { BOSS_ART, anim, heroPalette, sprite, sprite2, type AnimState } from './sprites';
import { heldWeapon, gearSprite, type WeaponLook } from './weapons';
import { drawProjectile, drawPixelFx, flameSprite } from './effects';
import { pixelPanel, pixelMeter, pixelText } from './chrome';
import { fillText, strokeText, pixelFont, textWidth as textW, fitPixelText, fontScale } from './font';
import { drawFlagstone, drawMarsh } from './terrain';
import { TILE_PX, pixelViewport, paddleZoom, pinchZoom, pixelDisc, pixelLine, pixelRing, pixelTarget, type ZoomState } from './pixel';

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
const ELITE_COLORS: Record<EliteMod, string> = { undying: '#7dff5a', splitting: '#ffd84a', shielded: '#66ccff', swift: '#ff5af0', volatile: '#ff7a2a' };
const ELITE_LABEL: Record<EliteMod, string> = { undying: 'Undying', splitting: 'Splitting', shielded: 'Warded', swift: 'Swift', volatile: 'Volatile' };
const KIND_LABEL: Record<string, string> = { chaser: 'Goblin', bat: 'Bat', spitter: 'Slime', archer: 'Skeleton', brute: 'Ogre', bomber: 'Bomber', summoner: 'Necromancer' };
const SHRINE_COLORS = { fury: '#ff8c2a', endurance: '#5aa9ff', sprint: '#ffd84a', whirl: '#8fd8ff' } as const;
// rate limits (s) for spammy sound cues
const CUE_GAP: Partial<Record<SfxName, number>> = { shoot: 0.06, shootHeavy: 0.08, zap: 0.06, flame: 0.1, hit: 0.05, crit: 0.08, coin: 0.05, kill: 0.04, explode: 0.08, hurt: 0.2, door: 0.2 };

const hash = (x: number, y: number) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/** Wall-face torches: deterministic, spaced along faces. */
const torchAt = (x: number, y: number) => (x + y * 3) % 7 === 0 && hash(x, y) > 0.35;
let torches: Array<{ x: number; y: number }> = [];
const NEIGH8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]] as const;

/** Floor background, rasterised lazily in CHUNK x CHUNK tile pieces. Drawing a whole floor at once (~10^4 canvas calls)
 *  took 17-31 ms, ~110 ms at 4x CPU, on the first frame of every floor; now that frame draws only the chunks in view and the
 *  rest are filled in a few at a time on later frames (prefill). */
const CHUNK = 8;
/** Chunk canvases are reused across floors: dropping a floor's ~180 canvases at once made a 40-50 ms (4x CPU) major GC
 *  about 2 s after every floor change. */
const chunkPool: HTMLCanvasElement[] = [];
export interface FloorBg { draw(gg: CanvasRenderingContext2D, sx: number, sy: number, sw: number, sh: number, k: number): void; prefill(budgetMs: number, fx?: number, fy?: number): void; release(): void; readonly built: number; readonly total: number }
export function buildBackground(w: World): FloorBg {
  const th = THEMES[w.theme % THEMES.length];
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w.w || y >= w.h ? TILE.WALL : w.tiles[y * w.w + x]);
  torches = []; // found up front: chunks rasterise lazily, but the light map needs every torch from the first frame
  for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) if (at(x, y) === TILE.WALL && at(x, y + 1) !== TILE.WALL && torchAt(x, y)) torches.push({ x, y });
  const cw = Math.ceil(w.w / CHUNK), ch = Math.ceil(w.h / CHUNK);
  const chunks: (HTMLCanvasElement | null)[] = new Array(cw * ch).fill(null);
  let built = 0;
  const sink = (() => { const k = document.createElement('canvas'); k.width = k.height = 1; return k.getContext('2d'); })();
  const tile = (g: CanvasRenderingContext2D, x: number, y: number) => {
    const k = at(x, y), px = x * BT, py = y * BT, r = hash(x, y);
    if (k === TILE.WALL) {
      const below = at(x, y + 1), isW = (dx: number, dy: number) => at(x + dx, y + dy) === TILE.WALL;
      const nearFloor = NEIGH8.some(([dx, dy]) => !isW(dx, dy));
      if (below !== TILE.WALL) { // wall face: shaded bricks, lit rim on top, dark foot
        g.fillStyle = th.wallFace[0]; g.fillRect(px, py, BT, BT);
        for (let row = 0; row < 4; row++) {
          const off = row % 2 ? 4 : 0;
          for (let bx = -off; bx < BT; bx += 8) { const v = hash(x * 4 + bx, y * 4 + row); g.fillStyle = v > 0.66 ? 'rgba(255,255,255,0.07)' : v < 0.25 ? 'rgba(0,0,0,0.14)' : 'rgba(0,0,0,0)'; g.fillRect(px+Math.max(0,bx),py+row*4,Math.min(7,BT-Math.max(0,bx)),3); if(v>.3){g.fillStyle='#ffffff15';g.fillRect(px+Math.max(0,bx)+1,py+row*4,Math.min(5,BT-Math.max(0,bx)-1),1);} }
          g.fillStyle = th.wallFace[1];
          for (let bx = -off; bx < BT; bx += 8) g.fillRect(px + bx + 7, py + row * 4, 1, 4);
          g.fillRect(px, py + row * 4 + 3, BT, 1);
        }
        g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(px, py, BT, 1);
        g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(px, py + BT - 2, BT, 2);
        if (!isW(-1, 0)) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(px, py, 1, BT); }
        if (!isW(1, 0)) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(px + BT - 1, py, 1, BT); }
        if (torchAt(x, y)) { g.fillStyle = '#2a1e14'; g.fillRect(px + 7, py + 7, 2, 6); g.fillStyle = '#6b4a2a'; g.fillRect(px + 6, py + 6, 4, 2); } // torch bracket (flame drawn live)
      } else if (nearFloor) { // wall top, autotiled: rim + outline on every edge that borders open floor
        g.fillStyle = th.wallTop; g.fillRect(px, py, BT, BT);
        g.fillStyle = 'rgba(255,255,255,0.04)'; if (hash(x, y) > 0.5) g.fillRect(px + 3, py + 3, 4, 2);
        const rim = 'rgba(255,255,255,0.16)', edge = '#07060b';
        if (!isW(0, -1)) { g.fillStyle = edge; g.fillRect(px, py, BT, 1); g.fillStyle = rim; g.fillRect(px, py + 1, BT, 1); }
        if (!isW(-1, 0)) { g.fillStyle = edge; g.fillRect(px, py, 1, BT); g.fillStyle = rim; g.fillRect(px + 1, py, 1, BT); }
        if (!isW(1, 0)) { g.fillStyle = edge; g.fillRect(px + BT - 1, py, 1, BT); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(px + BT - 2, py, 1, BT); }
        for (const [dx, dy, cx2, cy2] of [[-1, -1, 0, 0], [1, -1, BT - 2, 0], [-1, 1, 0, BT - 2], [1, 1, BT - 2, BT - 2]]) if (isW(dx, 0) && isW(0, dy) && !isW(dx, dy)) { g.fillStyle = edge; g.fillRect(px + cx2, py + cy2, 2, 2); }
      }
      return;
    }
    drawFlagstone(g,x,y,th,at(x,y-1)===TILE.WALL);
    if (k === TILE.PIT) {
      g.fillStyle = '#030206'; g.fillRect(px, py, BT, BT);
      if (at(x, y - 1) !== TILE.PIT) { g.fillStyle = th.grout; g.fillRect(px, py, BT, 3); g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(px, py + 3, BT, 3); }
      return;
    }
    if (k === TILE.PILLAR) { // brazier pedestal (flame drawn live)
      pixelDisc(g,px+8,py+13,7,'#100d1c66',0.4);
      g.fillStyle = '#5a5262'; g.fillRect(px + 4, py + 4, 8, 9); g.fillStyle = '#3a3442'; g.fillRect(px + 3, py + 3, 10, 3); g.fillRect(px + 4, py + 11, 8, 2);
      return;
    }
    if(k===TILE.SWAMP)drawMarsh(g,x,y,th,(dx,dy)=>at(x+dx,y+dy)===TILE.SWAMP);
  };
  const make = (i: number) => {
    const cx = i % cw, cy = (i / cw) | 0, c = chunkPool.pop() ?? document.createElement('canvas');
    if (c.width !== CHUNK * BT) c.width = c.height = CHUNK * BT;
    const g = c.getContext('2d')!; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); g.translate(-cx * CHUNK * BT, -cy * CHUNK * BT);
    for (let y = cy * CHUNK; y < Math.min(w.h, (cy + 1) * CHUNK); y++) for (let x = cx * CHUNK; x < Math.min(w.w, (cx + 1) * CHUNK); x++) tile(g, x, y);
    sink?.drawImage(c, 0, 0, 1, 1); // make the canvas rasterise now (inside the prefill budget), not on its first on-screen draw
    chunks[i] = c; built++;
    return c;
  };
  return {
    get built() { return built; }, total: chunks.length,
    /** Blit background px rect (sx,sy,sw,sh) at scale k, building any chunk in view that isn't ready. */
    draw(gg, sx, sy, sw, sh, k) {
      const S = CHUNK * BT;
      for (let cy = Math.max(0, Math.floor(sy / S)); cy <= Math.min(ch - 1, Math.floor((sy + sh) / S)); cy++)
        for (let cx = Math.max(0, Math.floor(sx / S)); cx <= Math.min(cw - 1, Math.floor((sx + sw) / S)); cx++) {
          const c = chunks[cy * cw + cx] ?? make(cy * cw + cx);
          const x0 = Math.round(cx * S * k), y0 = Math.round(cy * S * k); // whole-px edges: no seams between chunks
          gg.drawImage(c, x0, y0, Math.round((cx + 1) * S * k) - x0, Math.round((cy + 1) * S * k) - y0);
        }
    },
    /** Hand this floor's chunk canvases back to the pool (call once, when the floor is replaced). */
    release() { for (let i = 0; i < chunks.length; i++) { const c = chunks[i]; if (c) { if (chunkPool.length < 400) chunkPool.push(c); chunks[i] = null; } } built = 0; },
    /** Build not-yet-built chunks nearest background px (fx,fy) first, until budgetMs is spent. */
    prefill(budgetMs, fx = 0, fy = 0) {
      const t0 = performance.now(), S = CHUNK * BT;
      while (built < chunks.length && performance.now() - t0 < budgetMs) {
        let best = -1, bd = Infinity;
        for (let i = 0; i < chunks.length; i++) if (!chunks[i]) { const d = Math.hypot((i % cw + 0.5) * S - fx, (((i / cw) | 0) + 0.5) * S - fy); if (d < bd) { bd = d; best = i; } }
        make(best);
      }
    },
  };
}

export function createRenderer(): GameRenderer {
  let canvas: HTMLCanvasElement | null = null;
  let g: CanvasRenderingContext2D | null = null;
  let color = '#4cc9f0';
  let bg: FloorBg | null = null, bgFor: unknown = null;
  let mini: HTMLCanvasElement | null = null;
  let pillars: Array<{ x: number; y: number }> = [];
  let worldCanvas: HTMLCanvasElement | null = null;
  let pixelScale = 1;
  let lightC: HTMLCanvasElement | null = null;
  let lastCue = -1;
  let send: ((a: unknown) => void) | undefined;
  let insetCss = 0; // HUD band (CSS px) at the bottom; the world renders under it, foreground UI stays above
  let hudOcclusions: Insets['occlusions'];
  let zoom: ZoomState = { steps: 0, held: 0 };
  let pinchEnabled = false;
  const touches = new Map<number, { x: number; y: number }>();
  let pinch: { span: number; scale: number } | null = null;
  const touchSpan = () => {
    const [a, b] = [...touches.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const beginPinch = () => {
    if (!canvas) return;
    const span = touchSpan();
    pinch = span >= 8 ? { span, scale: pixelViewport(canvas.width, canvas.height, zoom.steps).scale } : null;
  };
  const endTouch = (e: PointerEvent) => {
    touches.delete(e.pointerId); pinch = null;
    if (canvas?.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  };
  const clearPinch = () => {
    for (const id of touches.keys()) if (canvas?.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    touches.clear(); pinch = null;
  };
  const moveTouch = (e: PointerEvent) => {
    if (!canvas || !touches.has(e.pointerId)) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size !== 2) return;
    e.preventDefault();
    if (!pinch) { beginPinch(); return; }
    zoom.steps = pinchZoom(canvas.width, canvas.height, pinch.scale, touchSpan() / pinch.span);
  };
  let campHits: Array<{ x: number; y: number; w: number; h: number; row: number }> = [];
  const onPointer = (e: PointerEvent) => {
    if (!canvas) return;
    if (e.pointerType === 'touch' && pinchEnabled) {
      e.preventDefault();
      if (touches.size < 2) {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        canvas.setPointerCapture(e.pointerId);
        if (touches.size === 2) beginPinch();
      }
      return;
    }
    const r = canvas.getBoundingClientRect(), px = (e.clientX - r.left) * (canvas.width / r.width), py = (e.clientY - r.top) * (canvas.height / r.height);
    const ah = actionHits.find((h) => px >= h.x && px <= h.x + h.w && py >= h.y && py <= h.y + h.h);
    if (ah) { e.preventDefault(); send?.({ type: 'action', id: ah.id }); return; }
    if (!campHits.length) return;
    const hit = campHits.find((h) => px >= h.x && px <= h.x + h.w && py >= h.y && py <= h.y + h.h);
    if (hit) { e.preventDefault(); send?.({ type: 'campRow', row: hit.row }); }
  };
  let dpr = 1;
  let camX = NaN, camY = NaN, camT = 0, camFor: unknown = null;
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
    gg.drawImage(c, -Math.floor(w / 2), -h, w, h); gg.restore();
  }
  const moved = new Map<number, { x: number; y: number }>();
  // render-only juice: coins fly to the HUD counter; a ring pulses on the hero when an action becomes ready
  let coinSeen = new Map<number, { x: number; y: number }>();
  const flyers: Array<{ x: number; y: number; t0: number }> = [];
  let coinPulseT = -9, heroScr = { x: 0, y: 0 };
  const readyPrev = new Map<string, number>();
  const pulses: Array<{ t0: number; color: string; label: string }> = [];
  const eliteLabels: Array<{ x: number; y: number; text: string; color: string }> = [];
  function shadow(x: number, y: number, rx: number) { pixelDisc(g!,x,y,rx,'#100d1c88',0.4); }
  // Subtle hard-edged ambient color bands. Combat itself never relies on glow for its silhouette.
  function glowAt(color: string, x: number, y: number, r: number, a = 1) {
    const gg=g!,old=gg.globalAlpha;
    gg.globalAlpha=old*a*0.07;pixelDisc(gg,x,y,r,color);
    gg.globalAlpha=old*a*0.10;pixelDisc(gg,x,y,r*0.6,color);
    gg.globalAlpha=old;
  }

  function drawBullet(b: BulletView, TS: number, _t: number) { drawProjectile(g!,b,TS); }

  function drawFx(f: Fx, t: number, TS: number) {
    const gg=g!,k=(t-f.t0)/f.life;if(k<0||k>1)return;
    if(f.kind!=='text'){drawPixelFx(gg,f,t,TS);return;}
    const pop=f.big?1+0.5*Math.max(0,1-k/0.18):1;
    gg.globalAlpha=1-k*k;gg.font = pixelFont(Math.round(TS*(f.big?0.32:0.22)*pop));gg.textAlign='center';
    gg.lineWidth=3;gg.strokeStyle='#100d1c';strokeText(gg, f.text!,f.x*TS,f.y*TS-k*TS*0.7);gg.fillStyle=f.color;fillText(gg, f.text!,f.x*TS,f.y*TS-k*TS*0.7);
    gg.globalAlpha=1;gg.textAlign='left';
  }

  function weaponIcon(gg: CanvasRenderingContext2D, w: WeaponLook, x: number, y: number, size: number, _col: string) {
    const c=heldWeapon(w),sc=Math.max(1,Math.floor(size/14));gg.drawImage(c,Math.round(x-c.width*sc/2),Math.round(y-c.height*sc/2),c.width*sc,c.height*sc);
  }
  function gearIcon(gg: CanvasRenderingContext2D, slot: string, x: number, y: number, size: number, col: string) {
    const c=gearSprite(slot,col),sc=Math.max(1,Math.floor(size/10));gg.drawImage(c,Math.round(x-c.width*sc/2),Math.round(y-c.height*sc/2),c.width*sc,c.height*sc);
  }

  function drawDrop(d: DropView, TS: number, t: number) {
    const gg=g!,x=Math.round(d.x*TS),y=Math.round(d.y*TS),bob=Math.floor(Math.sin(t*4+d.id)*1.2);
    if(d.kind==='coin'){
      const c=sprite('coin'),edge=Math.floor(t*5+d.id)%4===0,w=edge?2:c.width;
      gg.drawImage(c,x-Math.floor(w/2),y-c.height+bob,w,c.height);return;
    }
    if(d.kind==='potion'){drawSprite('potion',x,y,1,1,false,undefined,bob);return;}
    const col=RARITY_COLORS[d.rarity];
    if(d.rarity>=2){pixelRing(gg,x,y,6,col,true,0.4);gg.fillStyle=col;gg.fillRect(x-1,y-13+bob,1,2);if(d.rarity===5){gg.fillRect(x-4,y-18+bob,1,1);gg.fillRect(x+4,y-16-bob,1,1);}}
    if(d.kind==='weapon')weaponIcon(gg,{base:d.style!,element:d.element,rarity:d.rarity,variant:d.variant,unique:d.unique,plus:d.plus},x,y-5+bob,14,col);
    else gearIcon(gg,d.slot!,x,y-5+bob,10,col);
  }

  function drawEnemy(e: EnemyView, TS: number, t: number) {
    const gg = g!, x = e.x * TS, y = e.y * TS + e.r * TS * 0.9;
    const isBoss = e.kind === 'boss', ba = isBoss ? BOSS_ART[e.variant % BOSS_ART.length] : undefined;
    const name = ba ? ba.art : e.kind, scale = ba?.scale ?? 1, pal = ba?.pal;
    // animation state (render-only): hurt flinch, wind-up = attack pose, moving = walk cycle
    const prev = moved.get(e.id), mv = !!prev && Math.hypot(e.x - prev.x, e.y - prev.y) > 0.004;
    if (prev) { prev.x = e.x; prev.y = e.y; } else { if (moved.size > 512) moved.clear(); moved.set(e.id, { x: e.x, y: e.y }); } // reuse entries; bounded
    const st: AnimState = e.tell > 0.05 ? 'attack' : e.hurt < 0.12 ? 'hurt' : mv ? 'walk' : 'idle';
    const fr = anim(name, st, t + e.id * 0.13, e.kind === 'bat' ? 10 : 7);
    const def = sprite2(name, fr.state, fr.idx, pal, false, scale);
    const ps = 1; // all actor pixels are the same size as one background pixel
    const flash = e.hurt < 0.06;
    const bob = e.kind === 'bat' ? Math.sin(t * 14 + e.id) * TS * 0.12 : -Math.abs(Math.sin(t * 8 + e.id)) * TS * 0.05;
    shadow(x, y, e.r * TS * 0.9);
    if (e.elite) { gg.globalCompositeOperation = 'lighter'; glowAt(ELITE_COLORS[e.elite], x, y - e.r * TS, e.r * TS * (2 + Math.sin(t * 5 + e.id) * 0.2), 0.55); gg.globalCompositeOperation = 'source-over'; }
    if (e.tell > 0) { gg.globalCompositeOperation = 'lighter'; glowAt(e.kind === 'bomber' ? '#ff7a2a' : '#ff3b3b', x, y - e.r * TS, e.r * TS * (1.5 + e.tell), 0.3 + e.tell * 0.6); gg.globalCompositeOperation = 'source-over'; }
    if (e.exposed) pixelRing(gg,x,y-e.r*TS,e.r*TS*1.9,'#ffe08a',true);
    if (e.exposed) { gg.globalCompositeOperation = 'lighter'; glowAt('#ffe08a', x, y - e.r * TS, e.r * TS * 2.6, 0.75 + Math.sin(t * 9) * 0.2); gg.globalCompositeOperation = 'source-over'; }
    gg.save();
    drawCanvas(def, x, y, ps, e.face, bob);
    if (flash) { gg.globalAlpha = 0.4; drawCanvas(sprite2(name, fr.state, fr.idx, pal, true, scale), x, y, ps, e.face, bob); gg.globalAlpha = 1; }
    gg.restore();
    if(e.shieldFrac>0)pixelRing(gg,x,y-e.r*TS,e.r*TS*1.5,'#7fe7ff',false,1,e.shieldFrac);
    if (e.elite) {
      eliteLabels.push({ x, y: y - def.height * ps - 3,
        text: `${ELITE_LABEL[e.elite]} ${KIND_LABEL[e.kind] ?? ''}`, color: ELITE_COLORS[e.elite] });
    }
    if (e.slowed) { gg.fillStyle = 'rgba(127,231,255,0.25)'; gg.fillRect(x - e.r * TS, y - e.r * TS * 2.2, e.r * TS * 2, e.r * TS * 2.2); }
    if (e.dot && Math.floor(t * 8) % 2) { gg.globalCompositeOperation = 'lighter'; glowAt('#7dff5a', x, y - e.r * TS * 1.8, TS * 0.2, 0.8); gg.globalCompositeOperation = 'source-over'; }
    if (!isBoss && e.hp < e.maxHp) {
      const bw=12,by=Math.round(y-def.height*ps-3);gg.fillStyle='#100d1c';gg.fillRect(Math.round(x-bw/2)-1,by-1,bw+2,3);
      gg.fillStyle='#ef7070';gg.fillRect(Math.round(x-bw/2),by,Math.round(bw*Math.max(0,e.hp)/e.maxHp),1);
    }
  }

  return {
    mount(container: HTMLElement, c: { profile: Readonly<Profile>; send?: (a: unknown) => void; insets?: Insets }) {
      color = c.profile.color; send = c.send; insetCss = c.insets?.bottom ?? 0;
      hudOcclusions = c.insets?.occlusions;
      canvas = document.createElement('canvas');
      canvas.style.cssText = 'width:100%;height:100%;display:block;background:#07060b;touch-action:none';
      container.appendChild(canvas);
      canvas.addEventListener('pointerdown', onPointer);
      canvas.addEventListener('pointermove', moveTouch);
      canvas.addEventListener('pointerup', endTouch);
      canvas.addEventListener('pointercancel', endTouch);
      canvas.addEventListener('lostpointercapture', endTouch);
      window.addEventListener('blur', clearPinch);
      g = canvas.getContext('2d');
      dpr = Math.min(2, (globalThis as { devicePixelRatio?: number }).devicePixelRatio ?? 1);
      this.resize?.(container.clientWidth || 800, container.clientHeight || 600);
    },
    setInsets(i) { insetCss = i.bottom; hudOcclusions = i.occlusions; },
    resize(w, h) { if (canvas) { clearPinch(); canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); } },
    render(snapshot: unknown, bike: Readonly<BikeState>, input: Readonly<InputState>) {
      const s = snapshot as DungeonSnapshot;
      if (!canvas || !g || !s.world) return;
      pinchEnabled = s.phase === 'run';
      // sound cues (skip any backlog from before mount)
      if (lastCue < 0) lastCue = s.cues.length ? s.cues[s.cues.length - 1].id : 0;
      for (const c of s.cues) if (c.id > lastCue) { lastCue = c.id; play(c.name as SfxName, { minGapS: CUE_GAP[c.name as SfxName] }); }
      if (s.phase === 'camp' && s.camp) { actionHits = []; clearPinch(); drawCamp(s.camp, canvas.width, canvas.height, s.t); return; }
      campHits = []; if (s.phase !== 'run') actionHits = [];
      const output=g, OW=canvas.width, OH=canvas.height, w=s.world,t=s.t,p=s.player;
      // Orientation-balanced framing; room boundaries and boss phases never change the selected zoom.
      const bossE = s.boss?.active ? s.enemies.find((e) => e.kind === 'boss') : undefined;
      const dtR = Math.max(0, Math.min(0.1, t - camT)); camT = t;
      zoom = paddleZoom(zoom, OW, OH, input.paddleL, input.paddleR);
      const V=pixelViewport(OW,OH,zoom.steps);pixelScale=V.scale;
      if(!worldCanvas)worldCanvas=document.createElement('canvas');
      if(worldCanvas.width!==V.width||worldCanvas.height!==V.height){worldCanvas.width=V.width;worldCanvas.height=V.height;}
      g=worldCanvas.getContext('2d')!;
      const gg=g,W=V.width,H=V.height,TS=TILE_PX;
      gg.imageSmoothingEnabled = false;
      gg.fillStyle = '#07060b'; gg.fillRect(0, 0, W, H);
      if (bgFor !== w) {
        bgFor = w; bg?.release(); bg = buildBackground(w); mini = null; pillars = [];
        for (let i = 0; i < w.tiles.length; i++) if (w.tiles[i] === TILE.PILLAR) pillars.push({ x: i % w.w, y: Math.floor(i / w.w) });
      }
      const uiU=(Math.max(1,Math.min(OW,OH)/dpr/600)*0.75+0.25)*dpr;
      const VH=runLayout(OW,OH,insetCss*dpr,uiU,s.stance.list.length-1).playH/pixelScale;
      // frame the fight: during a boss, the camera centres between the hero and the boss so neither hides under the dock
      const fx0 = bossE ? p.x + (bossE.x - p.x) * 0.45 : p.x, fy0 = bossE ? p.y + (bossE.y - p.y) * 0.45 : p.y;
      if (camFor !== w || !Number.isFinite(camX)) { camX = fx0; camY = fy0; camFor = w; }
      else { const kf = 1 - Math.exp(-dtR * 6); camX += (fx0 - camX) * kf; camY += (fy0 - camY) * kf; }
      const cx = camX * TS - W / 2, cy = camY * TS - VH / 2;
      gg.save(); gg.translate(-Math.round(cx), -Math.round(cy));
      // background (visible part only)
      const k = TS / BT;
      const sx = Math.max(0, cx / k), sy = Math.max(0, cy / k), sw = Math.min(w.w * BT - sx, W / k + 1), sh = Math.min(w.h * BT - sy, H / k + 1);
      if (sw > 0 && sh > 0) bg!.draw(gg, sx, sy, sw, sh, k);
      bg!.prefill(3, sx + sw / 2, sy + sh / 2); // fill in off-screen chunks, nearest the camera first, a little each frame
      // doors, stairs, chests
      const x0 = Math.max(0, Math.floor(cx / TS)), x1 = Math.min(w.w, Math.ceil((cx + W) / TS));
      const y0 = Math.max(0, Math.floor(cy / TS)), y1 = Math.min(w.h, Math.ceil((cy + H) / TS));
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const kk = w.tiles[y * w.w + x];
        if (kk === TILE.DOOR) {
          const locked = w.rooms[w.doorRoom[y * w.w + x]]?.locked;
          if (locked) {
            gg.fillStyle = '#3a2a1a'; gg.fillRect(x * TS, y * TS, TS, TS);
            gg.fillStyle='#9aa3b5';for(let i=1;i<5;i++)gg.fillRect(x*TS+i*3,y*TS,1,TS);
            gg.globalCompositeOperation = 'lighter'; glowAt('#ff3b3b', x * TS + TS / 2, y * TS + TS / 2, TS * 0.8, 0.35); gg.globalCompositeOperation = 'source-over';
          } else { gg.fillStyle = 'rgba(122,90,42,0.5)'; gg.fillRect(x * TS, y * TS, TS, 2); gg.fillRect(x * TS, y * TS + TS * 0.88, TS, 2); }
        } else if (kk === TILE.STAIRS) {
          for (let i = 0; i < 4; i++) { gg.fillStyle = ['#1a1622', '#110e18', '#0a0810', '#040306'][i]; gg.fillRect(x*TS+i,y*TS+i*3,TS-i*2,TS-i*3); }
          pixelTarget(gg,x*TS+8,y*TS+8,8,'#8a7a5a');
          if (s.stairsOpen) { gg.globalCompositeOperation = 'lighter'; glowAt('#ffd84a', x * TS + TS / 2, y * TS + TS / 2, TS * (1.2 + Math.sin(t * 3) * 0.2), 0.7); gg.globalCompositeOperation = 'source-over'; }
        }
      }
      for(const r of w.rooms)if(r.chest){
        const x=Math.round(r.chest.x*TS),y=Math.round(r.chest.y*TS);
        gg.fillStyle='#35251f';gg.fillRect(x-7,y-10,14,10);gg.fillStyle='#975f38';gg.fillRect(x-6,y-9,12,8);
        gg.fillStyle='#c48b50';gg.fillRect(x-5,y-9,10,2);gg.fillStyle='#e8bf65';gg.fillRect(x-6,y-5,12,1);gg.fillRect(x-1,y-6,2,3);
        if(r.chest.opened){gg.fillStyle='#211820';gg.fillRect(x-6,y-11,12,4);}
      }
      // fog over unseen rooms
      gg.fillStyle = '#07060b';
      for (const r of w.rooms) if (!r.seen) gg.fillRect((r.x0 - 1) * TS, (r.y0 - 1) * TS, (r.w + 2) * TS, (r.h + 2) * TS);

      // Authored 8px flame frames replace blurry torch and brazier dots.
      for(const q of pillars){if(q.x<x0-1||q.x>x1||q.y<y0-1||q.y>y1)continue;const f=flameSprite(t+q.x*.13);gg.drawImage(f,q.x*TS+3,q.y*TS-3);}
      for(const q of torches){if(q.x<x0-1||q.x>x1||q.y<y0-1||q.y>y1)continue;const f=flameSprite(t+q.y*.17);gg.drawImage(f,q.x*TS+3,q.y*TS-1);}
      for(const sh of s.shrines){
        if(!w.rooms[sh.room].seen)continue;
        const x=Math.round(sh.x*TS),y=Math.round(sh.y*TS),col=sh.state==='failed'?'#777080':SHRINE_COLORS[sh.kind];
        pixelRing(gg,x,y,12,col,true,0.4);gg.fillStyle='#2d293d';gg.fillRect(x-5,y-3,11,5);gg.fillStyle='#675b79';gg.fillRect(x-3,y-15,7,13);gg.fillRect(x-1,y-18,3,3);
        gg.fillStyle='#8a7b9e';gg.fillRect(x-3,y-15,1,11);gg.fillStyle=col;gg.fillRect(x,y-12,1,6);
        if(sh.state==='active')pixelRing(gg,x,y-8,15,col,false,1,sh.progress);
      }
      for(const h of s.hazards){const k=1-h.left/h.total,x=h.x*TS,y=h.y*TS;pixelDisc(gg,x,y,h.r*TS*k,'#f45f3433');pixelRing(gg,x,y,h.r*TS,'#ff8a4a',true);}
      for (const d of s.drops) drawDrop(d, TS, t);
      heroScr = { x: (p.x*TS-Math.round(cx))*pixelScale,y:(p.y*TS-Math.round(cy))*pixelScale };
      { // coin magnet: a coin that vanished next to the hero was picked up -> fly it to the HUD counter
        const now = new Map<number, { x: number; y: number }>();
        for (const d of s.drops) if (d.kind === 'coin') now.set(d.id, { x: d.x, y: d.y });
        for (const [id, q] of coinSeen) if (!now.has(id) && Math.hypot(q.x - p.x, q.y - p.y) < 2.5 && flyers.length < 24)
          flyers.push({ x: (q.x*TS-Math.round(cx))*pixelScale,y:(q.y*TS-Math.round(cy))*pixelScale,t0:t });
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
          for(let k=carry;k<d&&drawn<27;k+=0.6,drawn++)gg.fillRect(Math.round((ax+dx*k/d)*TS),Math.round((ay+dy*k/d)*TS),1,1);
          carry = ((carry - d) % 0.6 + 0.6) % 0.6 || 0.6; ax = q.x; ay = q.y;
        }
        const end = s.ai.path[s.ai.path.length - 1];
        pixelTarget(gg,end.x*TS,end.y*TS,4,'#ffffff66');
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
      eliteLabels.length = 0;
      const actors: A[] = s.enemies.map((e) => ({ y: e.y, d: () => drawEnemy(e, TS, t) }));
      actors.push({ y: p.y, d: () => {
        const px = p.x * TS, py = p.y * TS + p.r * TS * 1.1, face = Math.cos(s.aim.angle) >= 0 ? 1 : -1;
        const bob = p.moving ? -Math.abs(Math.sin(t * 10)) * TS * 0.07 : 0;
        shadow(px, py, TS * 0.32);
        const shot = s.bullets.some((b) => b.friendly && b.age < 0.12 && Math.hypot(b.x - p.x, b.y - p.y) < 1.6);
        const hst: AnimState = p.hurt < 0.12 ? 'hurt' : shot ? 'attack' : p.moving ? 'walk' : 'idle';
        const hf = anim('hero',hst,t,9),hs=1,hpal=heroPalette(color);
        if (p.rolling) { gg.globalAlpha = 0.3; drawCanvas(sprite2('hero', 'walk', 0, hpal), px - Math.cos(s.aim.angle) * TS * 0.3, py, hs, face); gg.globalAlpha = 1; }
        gg.globalAlpha = p.invuln && Math.floor(t * 12) % 2 ? 0.45 : 1;
        drawCanvas(sprite2('hero', hf.state, hf.idx, hpal), px, py, hs, face, bob);
        if (p.hurt < 0.08) { gg.globalAlpha = 0.5; drawCanvas(sprite2('hero', hf.state, hf.idx, undefined, true), px, py, hs, face, bob); }
        gg.globalAlpha = 1;
        if(p.warded)pixelRing(gg,p.x*TS,p.y*TS,TS*0.8,'#7fe7ff',true);
        // weapon held toward the aim
        const hx = p.x * TS, hy = p.y * TS, ca=Math.cos(s.aim.angle),sa=Math.sin(s.aim.angle);
        {
          const ws=heldWeapon(s.weapon,s.aim.angle),kick=shot?-1:0;
          const wx=Math.round(hx+ca*(6+kick)),wy=Math.round(hy+sa*(6+kick)+bob);
          gg.drawImage(ws,wx-Math.floor(ws.width/2),wy-Math.floor(ws.height/2));
        }
      } });
      actors.sort((a, b) => a.y - b.y);
      for (const a of actors) a.d();

      for (const b of s.bullets) drawBullet(b, TS, t);
      for(const f of s.fx)if(f.kind!=='text')drawFx(f,t,TS);
      // Orbit blades and target marker use the same native-pixel masks as ordinary shots.
      for(const o of s.orbit)drawProjectile(gg,{x:o.x,y:o.y,r:0.2,friendly:true,style:'star',color:ELEMENT_COLORS[s.weapon.element],angle:t*14,age:t},TS);
      const tgt=s.ai.targetId?s.enemies.find(e=>e.id===s.ai.targetId):undefined;
      if(tgt)pixelTarget(gg,tgt.x*TS,tgt.y*TS,(tgt.r+0.35)*TS,tgt.kind==='boss'?'#ff6a70':'#ffd84a');
      gg.restore();

      // Restrained stepped darkness, drawn at native resolution. No smoothed light-map upscale.
      const dark=s.curse?.kind==='darkness';
      if(!lightC)lightC=document.createElement('canvas');
      if(lightC.width!==W||lightC.height!==H){lightC.width=W;lightC.height=H;}
      const lg=lightC.getContext('2d')!;lg.globalCompositeOperation='source-over';lg.clearRect(0,0,W,H);lg.fillStyle=dark?'#07060bf5':'#07060b38';lg.fillRect(0,0,W,H);
      lg.globalCompositeOperation='destination-out';
      const lamp=(x:number,y:number,r:number)=>{for(const [f,a] of [[1,.25],[.8,.35],[.6,.55],[.35,1]]){lg.globalAlpha=a;pixelDisc(lg,x-Math.round(cx),y-Math.round(cy),r*f,'#ffffff');}};
      lamp(p.x*TS,p.y*TS,TS*(dark?3:5));
      if(!dark){for(const q of torches)if(q.x>=x0-3&&q.x<=x1+3&&q.y>=y0-3&&q.y<=y1+3)lamp((q.x+.5)*TS,(q.y+.5)*TS,TS*3);for(const q of pillars)if(q.x>=x0-3&&q.x<=x1+3&&q.y>=y0-3&&q.y<=y1+3)lamp((q.x+.5)*TS,(q.y+.5)*TS,TS*3);}
      lg.globalAlpha=1;lg.globalCompositeOperation='source-over';gg.drawImage(lightC,0,0);
      if(s.curse){gg.fillStyle=s.curse.color+'12';gg.fillRect(0,0,W,H);}
      if(p.hurt<0.3){gg.fillStyle='#f4516133';gg.fillRect(0,0,W,2);gg.fillRect(0,H-2,W,2);gg.fillRect(0,0,2,H);gg.fillRect(W-2,0,2,H);}
      g=output;output.imageSmoothingEnabled=false;
      output.drawImage(worldCanvas,0,0,W*pixelScale,H*pixelScale);
      output.save();output.translate(-Math.round(cx)*pixelScale,-Math.round(cy)*pixelScale);
      for(const f of s.fx)if(f.kind==='text')drawFx(f,t,TS*pixelScale);
      output.font = pixelFont(10 * dpr); output.textAlign = 'center'; output.strokeStyle = '#100d1c';
      for (const label of eliteLabels) {
        strokeText(output, label.text, label.x * pixelScale, label.y * pixelScale);
        output.fillStyle = label.color; fillText(output, label.text, label.x * pixelScale, label.y * pixelScale);
      }
      output.restore();
      drawHud(s,OW,OH,bike);
    },
    unmount() {
      clearPinch(); pinchEnabled = false;
      canvas?.removeEventListener('pointerdown', onPointer);
      canvas?.removeEventListener('pointermove', moveTouch);
      canvas?.removeEventListener('pointerup', endTouch);
      canvas?.removeEventListener('pointercancel', endTouch);
      canvas?.removeEventListener('lostpointercapture', endTouch);
      window.removeEventListener('blur', clearPinch);
      canvas?.remove(); canvas = null; g = null; bg?.release(); bg = null; bgFor = null;
      mini=null;worldCanvas=null;lightC=null;zoom.held=0;
    },
  };

  function drawCamp(c: CampView, W: number, H: number, t: number) {
    const gg = g!, u = (Math.max(1, Math.min(W, H) / dpr / 600) * 0.75 + 0.25) * dpr, fs = Math.round(15 * u);
    const compact = W < 700 * dpr;
    const UH = H - insetCss * dpr; // camp scene sits above the HUD; the backdrop is full-bleed
    const V=pixelViewport(W,H),scale=V.scale;
    if(!worldCanvas)worldCanvas=document.createElement('canvas');
    if(worldCanvas.width!==V.width||worldCanvas.height!==V.height){worldCanvas.width=V.width;worldCanvas.height=V.height;}
    const cg=worldCanvas.getContext('2d')!;cg.imageSmoothingEnabled=false;cg.fillStyle='#15111f';cg.fillRect(0,0,V.width,V.height);
    const ground=Math.round(UH/scale*.84);
    for(let yy=ground;yy<V.height;yy+=16)for(let xx=0;xx<V.width;xx+=16){cg.fillStyle=hash(xx,yy)>.5?'#302737':'#2a2332';cg.fillRect(xx,yy,15,15);}
    pixelDisc(cg,V.width/2,UH/scale*.93,32,'#633b3033',.4);pixelDisc(cg,V.width/2,UH/scale*.93,20,'#b86a3633',.4);
    const fc=flameSprite(t),hx=Math.round(V.width/2-20),hy=Math.round(UH/scale*.95);
    const hero=sprite2('hero','idle',0,heroPalette(color));cg.drawImage(hero,hx-9,hy-18);
    cg.fillStyle='#704830';cg.fillRect(Math.round(V.width/2)-5,hy-2,11,2);cg.drawImage(fc,Math.round(V.width/2)-5,hy-10);
    gg.imageSmoothingEnabled=false;gg.drawImage(worldCanvas,0,0,V.width*scale,V.height*scale);
    pixelText(gg,'CAMP',W/2,18*u,Math.max(3,Math.round(4*dpr)),'#ffd84a',true);
    gg.textAlign='center';
    gg.fillStyle = '#ccc'; gg.font = pixelFont(fs);
    fillText(gg, `Bank ● ${c.bank}   ·   Best floor ${c.bestFloor}   ·   Runs ${c.runs}`, W / 2, 70 * u, W - 24 * u);
    if (c.lastDeath) { gg.fillStyle = '#ff8a8a'; gg.font = pixelFont(Math.round(fs * 0.9));
      fillText(gg, compact ? `Fell on floor ${c.lastDeath.floor}. Coins banked.` : `You fell on floor ${c.lastDeath.floor}. Every coin was banked. Cool down, level up, go again.`, W / 2, UH * 0.82, W - 24 * u); }
    const rowH = (compact ? 48 : 32) * u, lw = Math.min(W - 24 * u, 620 * u), lx = W / 2 - lw / 2;
    const maxRows = Math.max(4, Math.floor((UH * 0.72 - 90 * u) / rowH));
    const first = Math.max(0, Math.min(c.sel - Math.floor(maxRows / 2), c.rows.length - maxRows));
    campHits = [];
    c.rows.slice(first, first + maxRows).forEach((r, i) => {
      const idx = first + i, y = 90 * u + i * rowH, sel = idx === c.sel;
      campHits.push({ x: lx, y, w: lw, h: rowH - 4 * u, row: idx });
      pixelPanel(gg,lx,y,lw,rowH-4*u,sel?'#ffd84a':'#493c59',sel?'#493925ee':'#181320ee',dpr);
      if(sel){gg.fillStyle='#ffd84a';gg.fillRect(lx+4*dpr,y+7*dpr,2*dpr,Math.max(2*dpr,rowH-18*dpr));}
      const baseline = y + 20 * u, costX = lx + lw - 10 * u, levelX = costX - 86 * u;
      let descRight = lx + lw - 10 * u;
      gg.textAlign = 'right';
      if (r.kind === 'upgrade') {
        gg.font = pixelFont(Math.round(12 * u));
        const level = `Lv ${r.level}/${r.max}`;
        descRight = levelX - textW(gg, level) - 12 * u;
        gg.fillStyle = '#ddd'; fillText(gg, level, levelX, baseline);
        gg.fillStyle = r.cost === undefined ? '#7dff5a' : r.affordable ? '#ffd84a' : '#775';
        gg.font = pixelFont(Math.round(13 * u));
        fillText(gg, r.cost === undefined ? 'MAX' : `● ${r.cost}`, costX, baseline, 76 * u);
      }
      gg.textAlign = 'left'; gg.font = pixelFont(fs);
      gg.fillStyle = r.kind === 'start' ? '#7dff5a' : '#fff';
      fillText(gg, r.name, lx + 10 * u, baseline, compact ? descRight - lx - 10 * u : 170 * u);
      gg.font = pixelFont(Math.round(12 * u)); gg.fillStyle = '#aaa';
      const descX = lx + (compact ? 10 : 190) * u;
      fillText(gg, r.desc, descX, compact ? y + 37 * u : baseline, (compact ? lx + lw - 10 * u : descRight) - descX);
    });
    gg.textAlign = 'center'; gg.font = pixelFont(fs); gg.fillStyle = '#bbb';
    const left = Math.ceil(c.autoStartLeft);
    if (compact) {
      gg.font = pixelFont(12 * u);
      fillText(gg, 'Tap a row to buy · B to begin', W / 2, UH - 30 * u, W - 24 * u);
      fillText(gg, `D-pad + Z · Auto-start in ${left}s`, W / 2, UH - 14 * u, W - 24 * u);
    } else fillText(gg, `Tap a row, or D-pad + Z to buy/select · B begin  —  auto-start after ${left}s of pedaling`, W / 2, UH - 18 * u, W - 24 * u);
    gg.textAlign = 'left';
  }

  function bar(x: number, y: number, w: number, h: number, frac: number, col: string, label: string) {
    const gg = g!;
    pixelPanel(gg,x-2*dpr,y-2*dpr,w+4*dpr,h+4*dpr,'#82718f','#171320ee',dpr);
    pixelMeter(gg,x,y,w,h,frac,col,dpr);
    gg.fillStyle = '#fff'; gg.font = pixelFont(Math.round(h * 0.75)); fillText(gg, label, x + 6, y + h * 0.78, w - 12);
  }

  /** Dev measurement: boxes the dungeon HUD covers this frame (device px); read by dev-shot to report HUD area. */
  function drawHud(s: DungeonSnapshot, W: number, H: number, _bike: Readonly<BikeState>) {
    hudBoxes = []; (globalThis as { __dgHud?: unknown }).__dgHud = { boxes: hudBoxes, W, H };
    const gg = g!, p = s.player, u = (Math.max(1, Math.min(W, H) / dpr / 600) * 0.75 + 0.25) * dpr;
    const L = 14 * u, fs = Math.round(13 * u);
    gg.textAlign = 'left';
    // compact status panel (top-left): thin HP + XP bars, then Lv/floor, coins, potions and the Second Wind pip on one line.
    // `hu` scales from CSS pixels, so the iPad's large device scale doesn't double it (and it clears the boss bar).
    const hu = (Math.max(1, Math.min(W, H) / dpr / 600) * 0.75 + 0.25) * dpr, PW = 150 * hu;
    {
      const x = L, y = L, hpLow = p.hp < p.maxHp * 0.4;
      pixelPanel(gg,x-3*hu,y-3*hu,PW+6*hu,38*hu,'#746481','#15111fee',dpr); hudBox(x - 3 * hu, y - 3 * hu, PW + 6 * hu, 38 * hu);
      pixelMeter(gg,x,y,PW,11*hu,p.hp/p.maxHp,hpLow?'#e96d75':'#68ba78',dpr);
      gg.fillStyle = '#fff'; gg.font = pixelFont(Math.round(9 * hu));
      fillText(gg, `${Math.min(Math.round(p.maxHp), Math.ceil(Math.max(0, p.hp)))} / ${Math.round(p.maxHp)}`, x + 4 * hu, y + 8.5 * hu);
      pixelMeter(gg,x,y+13*hu,PW,3*hu,p.xp/p.xpNext,'#b58ad9',dpr);
      const ly = y + 28 * hu; gg.font = pixelFont(Math.round(10 * hu));
      gg.fillStyle = '#fff'; fillText(gg, `Lv${p.level} F${s.floor}`, x, ly);
      const cp = Math.max(0, 1 - (s.t - coinPulseT) / 0.25);
      if (cp > 0) { gg.save(); gg.font = pixelFont(Math.round(10 * hu * (1 + 0.35 * cp))); }
      gg.fillStyle = cp > 0 ? '#fff4b0' : '#ffd84a'; fillText(gg, `● ${p.coins}`, x + 44 * hu, ly);
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
      gg.fillStyle = ready ? '#2a1d00' : '#ddd'; gg.font = pixelFont(Math.round(7 * hu)); gg.textAlign = 'center'; fillText(gg, '2nd W', sx + w / 2, sy + h - 2 * hu); gg.textAlign = 'left';
    }
    // slim stance row (bottom-left): [stance badge][weapon icon] Lv · element, then tiny chips for the other stances.
    // Actions and cooldowns live in the shell HUD; use its occupied shape to share the row.
    const LY = runLayout(W, H, insetCss * dpr, u, s.stance.list.length - 1,
      W > H && W / dpr > 700 && H / dpr > 500
        ? hudOcclusions?.map(r => ({ x: r.x * dpr, y: r.y * dpr, w: r.w * dpr, h: r.h * dpr })) : undefined);
    actionHits = [];
    {
      const st = s.stance, wcol = RARITY_COLORS[s.weapon.rarity], R = LY.card, cy = R.y + R.h / 2;
      pixelPanel(gg,R.x,R.y,R.w,R.h,st.color,'#171320ee',dpr); hudBox(R.x, R.y, R.w, R.h);

      // stance badge: its colour with the initial; swapping shows the pick's colour
      const pickC = st.swapping ? s.stance.list.find((x) => x.id === st.swapping)?.color ?? st.color : st.color;
      gg.fillStyle = pickC; gg.fillRect(R.x + 2 * u, R.y + 2 * u, R.h - 4 * u, R.h - 4 * u);
      gg.fillStyle = '#0a0810'; gg.font = pixelFont(Math.round(13 * u)); gg.textAlign = 'center';
      pixelText(gg,(st.swapping?s.stance.list.find(x=>x.id===st.swapping)?.name??st.name:st.name)[0],R.x+R.h/2,cy-7*dpr,2*dpr,'#15111f',true);
      weaponIcon(gg, s.weapon, R.x + R.h + 11 * u, cy, 16 * u, wcol);
      gg.textAlign = 'left'; gg.fillStyle = '#eee'; gg.font = pixelFont(Math.round(11 * u));
      const elem = ` ${s.weapon.element}`;
      // weapon name (rarity colour, ellipsized to fit) then Lv/element
      const tail = ` Lv${s.weapon.level}${s.weapon.plus ? '+' + s.weapon.plus : ''}${elem}${st.styleOn ? ' ✓' : ''}`;
      const tx = R.x + R.h + 23 * u, room = R.x + R.w - 4 * u - tx;
      gg.font = pixelFont(Math.round(10.5 * u)); const tw = textW(gg, tail);
      gg.font = pixelFont(Math.round(11 * u));
      const nameRoom = Math.max(0, room - tw), name = fitPixelText(s.weapon.name, fontScale(Math.round(11 * u)), nameRoom);
      gg.fillStyle = wcol; fillText(gg, name, tx, cy + 4 * u);
      const nx = tx + textW(gg, name);
      gg.font = pixelFont(Math.round(10.5 * u)); gg.fillStyle = '#ccc'; fillText(gg, tail, nx, cy + 4 * u, Math.max(1, R.x + R.w - 4 * u - nx));
      // other stances: weapon icon + level; the D-pad pick fills, the AI suggestion pulses
      const others = s.stance.list.filter((x) => x.id !== st.id), C = LY.stance, n = Math.max(1, others.length);
      const cw = (C.w - (n - 1) * 3 * u) / n;
      others.forEach((o, k) => {
        const x = C.x + k * (cw + 3 * u), picked = st.swapping === o.id, sug = st.suggest === o.id;
        hudBox(x, C.y, cw, C.h);
        pixelPanel(gg,x,C.y,cw,C.h,o.color,picked?o.color:'#171320ee',dpr);
        gg.globalAlpha = sug && !picked ? 0.6 + 0.4 * Math.sin(s.t * 5) : 1;
        if(sug||picked){gg.fillStyle=o.color;gg.fillRect(Math.round(x+cw/2)-2*dpr,C.y+2*dpr,4*dpr,dpr);}
        if (o.base) weaponIcon(gg, {base:o.base as Weapon['base'],element:o.element,rarity:o.rarity as Weapon['rarity'],variant:o.variant,unique:o.unique,plus:o.plus}, x + cw * 0.36, C.y + C.h / 2, C.h * 0.55, picked ? '#0a0810' : o.color);
        gg.fillStyle = picked ? '#0a0810' : '#fff'; gg.font = pixelFont(Math.round(9 * u)); gg.textAlign = 'right';
        fillText(gg, o.level ? String(o.level) : '–', x + cw - 2 * u, C.y + C.h - 3 * u); gg.textAlign = 'left'; gg.globalAlpha = 1;
      });
      // equipped gear: slot icon + item level, border/tint in the item's rarity colour
      let gx = C.x + C.w + 6 * u;
      for (const sl of SLOTS) {
        const it = s.gear[sl]; if (!it) continue;
        const gw = C.h, rc = RARITY_COLORS[it.rarity];
        hudBox(gx, C.y, gw, C.h);
        pixelPanel(gg,gx,C.y,gw,C.h,rc,'#171320ee',dpr);
        gearIcon(gg, sl, gx + gw * 0.4, C.y + C.h * 0.42, C.h * 0.5, rc);
        gg.fillStyle = '#fff'; gg.font = pixelFont(Math.round(8.5 * u)); gg.textAlign = 'right';
        fillText(gg, String(it.level), gx + gw - 2 * u, C.y + C.h - 2.5 * u); gg.textAlign = 'left';
        gx += gw + 3 * u;
      }
    }

    // active shrine banner
    const act = s.shrines.find((x) => x.state === 'active');
    const infoTop=s.boss?.active?bossHudLayout(W,H,insetCss*dpr,hu).y+78*hu:L+28*hu;
    if (act) {
      const bw = Math.min(W * 0.4, 420 * u), bx = W / 2 - bw / 2, by=infoTop;
      bar(bx, by, bw, 14 * u, act.progress, SHRINE_COLORS[act.kind], '');
      gg.fillStyle = '#fff'; gg.textAlign = 'center'; gg.font = pixelFont(fs);
      fillText(gg, `${act.label} — ${Math.ceil(act.leftS)}s`, W / 2, by - 6 * u); gg.textAlign = 'left';
    }
    // active curse
    if (s.curse) {
      const c = s.curse, bw = Math.min(W * 0.4, 420 * u), bx = W / 2 - bw / 2;
      const by=infoTop+(act?50*hu:0);
      bar(bx, by, bw, 14 * u, c.left / c.total, c.color, '');
      gg.fillStyle = c.color; gg.textAlign = 'center'; gg.font = pixelFont(fs);
      fillText(gg, `☠ ${c.name}: ${c.desc} · ${Math.ceil(c.left)}s`, W / 2, by - 6 * u, bw + 60 * u); gg.textAlign = 'left';
    }
    // big banners (uniques, curses)
    let bannerRow = 0; // stack banners that overlap in time (e.g. EXPLORE straight into AMBUSH), newest lowest
    for (const f of s.fx) if (f.kind === 'banner') {
      const k2 = (s.t - f.t0) / f.life; if (k2 < 0 || k2 > 1) continue;
      const row = bannerRow++;
      gg.globalAlpha = Math.min(1, (1 - k2) * 3); gg.textAlign = 'center';
      gg.font = pixelFont(Math.round(30 * u)); gg.lineWidth = 6; gg.strokeStyle = '#000';
      const by = LY.playH * 0.3 + row * 40 * u - Math.min(1, k2 * 6) * 10 * u;
      if(/^[A-Z0-9 ]{1,24}$/.test(f.text!)){const q=Math.max(1,Math.min(Math.round(4*dpr),Math.floor((W-40*hu)/(f.text!.length*6-1))));pixelText(gg,f.text!,W/2+q,by-7*q+q,q,'#100d1c',true);pixelText(gg,f.text!,W/2,by-7*q,q,f.color,true);}
      else{strokeText(gg, f.text!,W/2,by,W-40*hu);gg.fillStyle=f.color;fillText(gg, f.text!,W/2,by,W-40*hu);}
      gg.globalAlpha = 1; gg.textAlign = 'left';
    }
    // action-ready pulses (screen space, around the hero)
    for (let i = pulses.length - 1; i >= 0; i--) {
      const q = pulses[i], k = (s.t - q.t0) / 0.7;
      if (k < 0 || k > 1) { pulses.splice(i, 1); continue; }
      gg.strokeStyle = q.color; gg.globalAlpha = 1 - k; gg.lineWidth = 3 * u;
      gg.save();gg.scale(pixelScale,pixelScale);pixelRing(gg,heroScr.x/pixelScale,heroScr.y/pixelScale,(18+40*k)*u/pixelScale,q.color,true);gg.restore();
      gg.font = pixelFont(Math.round(11 * u)); gg.textAlign = 'center'; gg.lineWidth = 3; gg.strokeStyle = '#000';
      strokeText(gg, q.label, heroScr.x, heroScr.y - (34 + 14 * k) * u); gg.fillStyle = q.color; fillText(gg, q.label, heroScr.x, heroScr.y - (34 + 14 * k) * u);
      gg.globalAlpha = 1; gg.textAlign = 'left';
    }
    // toasts
    gg.font = pixelFont(Math.round(11 * hu));
    s.toasts.forEach((tt, i) => {
      const age = s.t - tt.t0; gg.globalAlpha = Math.max(0, Math.min(1, (6 - age) / 1.5));
      gg.lineWidth = 3; gg.strokeStyle = '#000'; strokeText(gg, tt.text, L, L + (52 + i * 15) * hu, W - 2 * L); gg.fillStyle = tt.color; fillText(gg, tt.text, L, L + (52 + i * 15) * hu, W - 2 * L);
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
    pixelPanel(gg,mx0-3,my0-3,mw+6,mh+6,'#655572','#171320cc',dpr); hudBox(mx0 - 3, my0 - 3, mw + 6, mh + 6);
    gg.globalAlpha = 0.8; gg.drawImage(mini, mx0, my0, mw, mh); gg.globalAlpha = 1;
    for (const e of s.enemies) if (e.kind === 'boss' || w.rooms[s.room] && e.x >= w.rooms[s.room].x0 && e.x <= w.rooms[s.room].x0 + w.rooms[s.room].w && e.y >= w.rooms[s.room].y0 && e.y <= w.rooms[s.room].y0 + w.rooms[s.room].h) {
      gg.fillStyle = ENEMY_TINT[e.kind] ?? '#e55'; gg.fillRect(mx0 + e.x * mk - 1, my0 + e.y * mk - 1, 2.5 * u, 2.5 * u);
    }
    gg.fillStyle = color; gg.fillRect(mx0 + p.x * mk - 2 * u, my0 + p.y * mk - 2 * u, 4 * u, 4 * u);

    if (s.boss && s.boss.active) {
      const BR=bossHudLayout(W,H,insetCss*dpr,hu),bw=BR.w,bx=BR.x,by=BR.y;
      const B = s.boss, exp = B.cycle === 'exposed', wind = B.cycle === 'windup';
      hudBox(bx,by,bw,BR.h);
      bar(bx, by, bw, 18 * hu, B.hp / B.maxHp, exp ? '#ffd84a' : B.tide > 0 ? '#9a5ab0' : '#c0a', `${B.name}  ·  phase ${B.phase}`);
      gg.fillStyle = '#fff'; for (const sp of B.splits) gg.fillRect(bx + bw * sp - 1, by, 2,18*hu); // phase marks
      gg.textAlign = 'center'; gg.font = pixelFont(Math.round(13 * u));
      gg.fillStyle = exp ? '#ffe08a' : wind ? '#ff7a2a' : B.tide > 0 ? '#7dff5a' : '#ddd';
      fillText(gg, exp ? 'EXPOSED: x2 damage. Sprint and Strike now!' : wind ? 'Big attack coming: Ward to parry' : B.cycle === 'stagger' ? 'Staggered!' : B.tide > 0 ? `Turning Tide: boss takes +${Math.round(B.tide * 100)}%` : 'Watch for the big attack',bx+bw/2,by+36*hu,bw);
      gg.textAlign = 'left';
    } else if (s.stairsOpen) {
      gg.fillStyle = '#ffd84a'; gg.textAlign = 'center'; gg.font = pixelFont(fs);
      fillText(gg, 'Stairs open — descend!', W / 2, L + 14 * u); gg.textAlign = 'left';
    }
  }
}
