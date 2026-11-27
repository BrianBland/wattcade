import type { BikeState, GameRenderer, InputState, Insets, Profile } from '../../../contracts';
import type { DungeonSnapshot, EnemyView, BulletView, DropView, Fx, EliteMod, CampView } from '../sim/types';
import { desaturate } from '../../kit/actionButton';
import { runLayout, bossHudLayout } from './layout';
import { play, type SfxName } from '../../../audio/sfx';
import { TILE, type World } from '../sim/world';
import { ELEMENT_COLORS, RARITY_COLORS, SLOTS, type Weapon } from '../sim/loot';
import { BOSS_ART, anim, heroPalette, sprite, sprite2, type AnimState } from './sprites';
import { heldWeapon, gearSprite, weaponGrip, colorRamp, type WeaponLook } from './weapons';
import { holdPose } from './hold';
import { drawProjectile, drawPixelFx, flameSprite } from './effects';
import { pixelPanel, pixelMeter, pixelText, pixelSocket, pixelGem, mixHex } from './chrome';
import { fillText, fillTextShadow, displayText, displayWidth, strokeText, pixelFont, textWidth as textW, fitPixelText, fontScale } from './font';
import { drawFlagstone, drawMarsh } from './terrain';
import { loadArt, artReady, clearDerivedArtCache, ATLAS, hexRgb, sheetImage, zoneRect, cut, charFrame, anim as anim32 } from './art32';
import { drawStanceSwap, drawPoolLights, drawFog, drawGrit, drawEmbers, drawRefracting, drawCrystalFloor, drawNumber32, isNumberText } from './fx32';
import { buildBackground32, floorInfo, drawLava, drawPoolGlints, PROP_LIGHT, type FloorBg32, type FloorInfo } from './world32';
import { muzzleTip, drawMuzzle32, wicks, drawItem32, drawHero32, drawEnemy32, drawFlail32, weaponArt, FLAIL_HAND, drawShot32, drawWeaponIcon32, drawCoin32, drawPuff, drawShrine32, drawSigil, drawZoneProp, zonePropSize } from './actors32';
import { heroPerkLook, drawPerkPicker, drawPerkBadges, drawPerkParticles, drawDrone } from './perks32';
import { lineOfSight, shade, LIGHT_SCALE, type Light, type Los } from './light32';
import { TILE_PX, pixelViewport, paddleZoom, pinchZoom, pixelDisc, pixelLine, pixelRing, pixelTarget, type ZoomState } from './pixel';
import { runResultLine } from './runResult';

const DNF_S = 2.1;
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
const KIND_LABEL: Record<string, string> = { chaser: 'Coneling', bat: 'Saddle Sore', spitter: 'Gel Slime', archer: 'Lost Rider', brute: 'Wrench Troll', bomber: 'CO2 Gremlin', summoner: 'Directeur Sportif' };
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

/** The weapon a stance holds (from the stance chips), for previews of another stance's perk. */
function stanceWeapon(s: DungeonSnapshot, id: string): WeaponLook {
  const o = s.stance.list.find((x) => x.id === id);
  return o?.base ? { base: o.base as Weapon['base'], element: o.element, rarity: o.rarity as Weapon['rarity'], variant: o.variant, unique: o.unique, plus: o.plus } : s.weapon;
}
export function createRenderer(): GameRenderer {
  let canvas: HTMLCanvasElement | null = null;
  let g: CanvasRenderingContext2D | null = null;
  let color = '#4cc9f0';
  let bg: FloorBg | null = null, bgFor: unknown = null;
  let bg32: FloorBg32 | null = null, info: FloorInfo | null = null;
  const losCache = new Map<string, Los>();
  let litAt: { x: number; y: number } | null = null;
  const goo: Array<{ x: number; y: number; t: number }> = [], gooLast = new Map<number, { t: number; x: number; y: number }>();
  let litC: HTMLCanvasElement | null = null, lightImg: ImageData | null = null;
  /** zone light colours: wall torches, PILLAR light props, pools (lava only) */
  const ZL: Record<string, { torch: [number, number, number]; prop: [number, number, number]; amb: [number, number, number] }> = {
    keep: { torch: [255, 170, 90], prop: [255, 160, 80], amb: [0.58, 0.55, 0.68] }, crypt: { torch: [90, 230, 210], prop: [90, 230, 210], amb: [0.55, 0.6, 0.74] },
    catacombs: { torch: [255, 190, 110], prop: [255, 190, 110], amb: [0.56, 0.5, 0.48] }, deep: { torch: [170, 110, 255], prop: [170, 110, 255], amb: [0.47, 0.43, 0.56] } };
  let mini: HTMLCanvasElement | null = null;
  let pillars: Array<{ x: number; y: number }> = [];
  let worldCanvas: HTMLCanvasElement | null = null;
  let pixelScale = 1;
  // the DNF beat: when a run ends, the last frame freezes, the hero crumples (3-frame fall) and the screen fades before camp
  type HeroPin = { x: number; y: number; scale: number; angle: number; stance: string };
  let bossChip = 1, bossChipName = '';
  const flashAt = new Map<number, number>(), hpSeen = new Map<number, number>();
  let lastFlail: DungeonSnapshot['flail'] = null;
  let hideHero = false, lastRun: { s: DungeonSnapshot; bike: Readonly<BikeState>; input: Readonly<InputState> } | null = null;
  let swapFx: { t0: number; c: string; from: string } | null = null, lastStance = '';
  let lastHero: HeroPin | null = null, prevPhase = '', dnf: { t0: number; img: HTMLCanvasElement; hero: HeroPin } | null = null;
  let lightC: HTMLCanvasElement | null = null;
  let campSnap: HTMLCanvasElement | null = null;
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
  let perkHits: Array<{ x: number; y: number; w: number; h: number }> = [];
  let lootHits: Array<{ x: number; y: number; w: number; h: number; choice: 'equip' | 'drop' }> = [];
  const onPointer = (e: PointerEvent) => {
    if (!canvas) return;
    const r = canvas.getBoundingClientRect(), px = (e.clientX - r.left) * (canvas.width / r.width), py = (e.clientY - r.top) * (canvas.height / r.height);
    const lh = lootHits.find((h) => px >= h.x && px <= h.x + h.w && py >= h.y && py <= h.y + h.h);
    if (lh) { e.preventDefault(); send?.({ type: 'lootChoice', choice: lh.choice }); return; }
    if (e.pointerType === 'touch' && pinchEnabled) {
      e.preventDefault();
      if (touches.size < 2) {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        canvas.setPointerCapture(e.pointerId);
        if (touches.size === 2) beginPinch();
      }
      return;
    }
    const ph = perkHits.findIndex((h) => px >= h.x && px <= h.x + h.w && py >= h.y && py <= h.y + h.h);
    if (ph >= 0) { e.preventDefault(); send?.({ type: 'perk', i: ph }); return; }
    if (!campHits.length) return;
    const hit = campHits.find((h) => px >= h.x && px <= h.x + h.w && py >= h.y && py <= h.y + h.h);
    if (hit) { e.preventDefault(); send?.({ type: 'campRow', row: hit.row }); }
  };
  let dpr = 1;
  let camX = NaN, camY = NaN, camT = 0, camFor: unknown = null;
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

  /** Draw a sprite centred at (cx, cy), at the largest whole-pixel scale that fits maxW x maxH (min 1). */
  function iconFit(gg: CanvasRenderingContext2D, c: HTMLCanvasElement | null | undefined, cx: number, cy: number, maxW: number, maxH: number, silhouette = false) {
    if (!c) return;
    const k = Math.max(1, Math.floor(Math.min(maxW / c.width, maxH / c.height))), src = silhouette ? silhouetteOf(c) : c;
    gg.imageSmoothingEnabled = false;
    gg.drawImage(src, Math.round(cx - c.width * k / 2), Math.round(cy - c.height * k / 2), c.width * k, c.height * k);
  }
  const silCache = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();
  function silhouetteOf(c: HTMLCanvasElement) {
    let o = silCache.get(c); if (o) return o;
    o = document.createElement('canvas'); o.width = c.width; o.height = c.height; const x = o.getContext('2d')!;
    x.drawImage(c, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#d8cfe0'; x.fillRect(0, 0, c.width, c.height);
    silCache.set(c, o); return o;
  }
  function weaponIcon(gg: CanvasRenderingContext2D, w: WeaponLook, x: number, y: number, size: number, _col: string) {
    const c=heldWeapon(w),sc=Math.max(1,Math.floor(size/14));gg.drawImage(c,Math.round(x-c.width*sc/2),Math.round(y-c.height*sc/2),c.width*sc,c.height*sc);
  }
  function gearIcon(gg: CanvasRenderingContext2D, slot: string, x: number, y: number, size: number, col: string) {
    const c=gearSprite(slot,col),sc=Math.max(1,Math.floor(size/10));gg.drawImage(c,Math.round(x-c.width*sc/2),Math.round(y-c.height*sc/2),c.width*sc,c.height*sc);
  }

  function drawDrop(d: DropView, TS: number, t: number) {
    const gg=g!,x=Math.round(d.x*TS),y=Math.round(d.y*TS),bob=Math.floor(Math.sin(t*4+d.id)*1.2);
    if(d.kind==='coin'&&drawCoin32(gg,x,y+bob,t,d.id))return;
    if(d.kind==='coin'){
      const c=sprite('coin'),edge=Math.floor(t*5+d.id)%4===0,w=edge?2:c.width;
      gg.drawImage(c,x-Math.floor(w/2),y-c.height+bob,w,c.height);return;
    }
    if(d.kind==='potion'&&drawItem32(gg,'potion',x,y+2+bob))return;
    if(d.kind==='potion'){drawSprite('potion',x,y,1,1,false,undefined,bob);return;}
    const col=RARITY_COLORS[d.rarity];
    if(d.rarity>=2){pixelRing(gg,x,y,6,col,true,0.4);gg.fillStyle=col;gg.fillRect(x-1,y-13+bob,1,2);if(d.rarity===5){gg.fillRect(x-4,y-18+bob,1,1);gg.fillRect(x+4,y-16-bob,1,1);}}
    if(d.kind==='weapon'&&drawWeaponIcon32(gg,{base:d.style!,element:d.element,rarity:d.rarity,variant:d.variant,unique:d.unique,plus:d.plus},x,y-8+bob))return;
    if(d.kind==='weapon')weaponIcon(gg,{base:d.style!,element:d.element,rarity:d.rarity,variant:d.variant,unique:d.unique,plus:d.plus},x,y-5+bob,14,col);
    else if(!drawItem32(gg,d.slot!,x,y+1+bob))gearIcon(gg,d.slot!,x,y-5+bob,10,col);
  }

  /** The Gear Masher's chain and chainring; the fist position matches the boss2.free sprite. */
  function drawFlail(f: NonNullable<DungeonSnapshot['flail']>, b: EnemyView, TS: number) {
    const foot = b.y * TS + b.r * TS * 0.9, hx = b.x * TS + FLAIL_HAND.x * b.face, hy = foot + FLAIL_HAND.y;
    const handGround = { x: b.x + 0.7 * b.face, y: b.y - 0.4 };
    let gx: number, gy: number, sag = 2, spin = f.t * 16, onFloor = false;
    if (f.mode === 'whirl') {   // an overhead circle around the fist
      const r = (f.x - handGround.x) * TS * 0.75, q = (f.y - handGround.y) * TS * 0.4;
      gx = hx + r; gy = hy - 6 + q; spin = f.ang * 2;
    } else {
      const d = Math.hypot(f.x - handGround.x, f.y - handGround.y), lift = Math.min(1, d / 2.5);
      gx = f.x * TS + (hx - handGround.x * TS) * (1 - lift);
      gy = f.y * TS + (hy - handGround.y * TS) * (1 - lift) - (f.mode === 'rest' ? 4 : 10 * lift);
      if (f.mode === 'rest') { sag = 12; spin = 0; onFloor = true; }
      else if (f.mode === 'back') sag = 7;
    }
    drawFlail32(g!, { hx, hy, gx, gy, groundY: f.y * TS + 2, spin, sag, onFloor });
  }
  function drawEnemy(e: EnemyView, TS: number, t: number) {
    const gg = g!, x = e.x * TS, y = e.y * TS + e.r * TS * 0.9;
    const isBoss = e.kind === 'boss';
    // animation state (render-only): hurt flinch, wind-up = attack pose, moving = walk cycle
    const prev = moved.get(e.id), mv = !!prev && Math.hypot(e.x - prev.x, e.y - prev.y) > 0.004;
    if (prev) { prev.x = e.x; prev.y = e.y; } else { if (moved.size > 512) moved.clear(); moved.set(e.id, { x: e.x, y: e.y }); } // reuse entries; bounded
    // hit flash: a short pop per hit, rate-limited so damage over time or rapid fire never leaves it washed out
    // (damage-over-time ticks are too small to count as a hit)
    let fl0 = flashAt.get(e.id) ?? -9; const hp0 = hpSeen.get(e.id) ?? e.hp; hpSeen.set(e.id, e.hp);
    if (e.hurt < 0.06 && hp0 - e.hp > e.maxHp * (isBoss ? 0.004 : 0.03) && t - fl0 > 0.12) { fl0 = t; if (flashAt.size > 512) { flashAt.clear(); hpSeen.clear(); } flashAt.set(e.id, t); }
    const flash = t - fl0 < 0.06;
    const bob = e.kind === 'bat' ? Math.sin(t * 14 + e.id) * TS * 0.12 : -Math.abs(Math.sin(t * 8 + e.id)) * TS * 0.05;
    shadow(x, y, e.r * TS * 0.9);
    if (e.elite) { gg.globalCompositeOperation = 'lighter'; glowAt(ELITE_COLORS[e.elite], x, y - e.r * TS, e.r * TS * (2 + Math.sin(t * 5 + e.id) * 0.2), 0.55); gg.globalCompositeOperation = 'source-over'; }
    if (e.tell > 0) { gg.globalCompositeOperation = 'lighter'; glowAt(e.kind === 'bomber' ? '#ff7a2a' : '#ff3b3b', x, y - e.r * TS, e.r * TS * (1.5 + e.tell), 0.3 + e.tell * 0.6); gg.globalCompositeOperation = 'source-over'; }
    if (e.exposed) pixelRing(gg,x,y-e.r*TS,e.r*TS*1.9,'#ffe08a',true);
    if (e.exposed) { gg.globalCompositeOperation = 'lighter'; glowAt('#ffe08a', x, y - e.r * TS, e.r * TS * 2.6, 0.75 + Math.sin(t * 9) * 0.2); gg.globalCompositeOperation = 'source-over'; }
    let artH = 0;
    if (artReady()) artH = drawEnemy32(gg, x, y + (e.kind === 'bat' ? bob - TS * 0.35 : 0), { kind: e.kind, variant: e.variant, moving: mv, tell: e.tell, flash, face: e.face, t, id: e.id, free: isBoss && !!lastFlail && lastFlail.mode !== 'hand' });
    if (!artH) {
      const ba = isBoss ? BOSS_ART[e.variant % BOSS_ART.length] : undefined;
      const name = ba ? ba.art : e.kind, scale = ba?.scale ?? 1, pal = ba?.pal;
      const st: AnimState = e.tell > 0.05 ? 'attack' : e.hurt < 0.12 ? 'hurt' : mv ? 'walk' : 'idle';
      const fr = anim(name, st, t + e.id * 0.13, e.kind === 'bat' ? 10 : 7);
      const def = sprite2(name, fr.state, fr.idx, pal, false, scale);
      artH = def.height;
      gg.save();
      drawCanvas(def, x, y, 1, e.face, bob);
      if (flash) { gg.globalAlpha = 0.4; drawCanvas(sprite2(name, fr.state, fr.idx, pal, true, scale), x, y, 1, e.face, bob); gg.globalAlpha = 1; }
      gg.restore();
    }
    if(e.shieldFrac>0)pixelRing(gg,x,y-e.r*TS,e.r*TS*1.5,'#7fe7ff',false,1,e.shieldFrac);
    if (e.elite) {
      eliteLabels.push({ x, y: y - artH - 3,
        text: `${ELITE_LABEL[e.elite]} ${KIND_LABEL[e.kind] ?? ''}`, color: ELITE_COLORS[e.elite] });
    }
    if (e.slowed) { gg.fillStyle = '#7fe7ff'; for (let i = 0; i < 5; i++) { const a2 = i * 1.26 + t * 2; gg.fillRect(Math.round(x + Math.cos(a2) * e.r * TS), Math.round(y - 2 + Math.sin(a2) * e.r * TS * 0.35), i % 2 ? 1 : 2, 1); } }
    if (e.dot && Math.floor(t * 8) % 2) { gg.globalCompositeOperation = 'lighter'; glowAt('#7dff5a', x, y - e.r * TS * 1.8, TS * 0.2, 0.8); gg.globalCompositeOperation = 'source-over'; }
    if (!isBoss && e.hp < e.maxHp) {
      const bw=16,by=Math.round(y-artH-3);gg.fillStyle='#100d1c';gg.fillRect(Math.round(x-bw/2)-1,by-1,bw+2,3);
      gg.fillStyle='#ef7070';gg.fillRect(Math.round(x-bw/2),by,Math.round(bw*Math.max(0,e.hp)/e.maxHp),1);
    }
  }

  return {
    mount(container: HTMLElement, c: { profile: Readonly<Profile>; send?: (a: unknown) => void; insets?: Insets }) {
      color = c.profile.color; send = c.send; insetCss = c.insets?.bottom ?? 0; void loadArt();
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
    ready() { return loadArt(); },
    setInsets(i) { insetCss = i.bottom; hudOcclusions = i.occlusions; },
    resize(w, h) { if (canvas) { clearPinch(); canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); } },
    render(snapshot: unknown, bike: Readonly<BikeState>, input: Readonly<InputState>) {
      const s = snapshot as DungeonSnapshot;
      if (!canvas || !g || !s.world) return;
      pinchEnabled = s.phase === 'run' && !s.perks?.offer;
      // sound cues (skip any backlog from before mount)
      if (lastCue < 0) lastCue = s.cues.length ? s.cues[s.cues.length - 1].id : 0;
      for (const c of s.cues) if (c.id > lastCue) { lastCue = c.id; play(c.name as SfxName, { minGapS: CUE_GAP[c.name as SfxName] }); }
      if (prevPhase === 'run' && s.phase === 'camp' && s.camp?.lastDeath && lastHero && artReady()) {
        // re-draw the last run frame without the standing hero, so only the falling one shows
        if (lastRun) { hideHero = true; this.render(lastRun.s, lastRun.bike, lastRun.input); hideHero = false; }
        const img = document.createElement('canvas'); img.width = canvas.width; img.height = canvas.height; img.getContext('2d')!.drawImage(canvas, 0, 0);
        dnf = { t0: s.t, img, hero: lastHero };
      }
      prevPhase = s.phase; if (s.phase === 'run') lastRun = { s, bike, input }; else if (!dnf) lastRun = null;
      if (s.phase === 'run' && lastStance && s.stance.id !== lastStance) swapFx = { t0: s.t, c: s.stance.color, from: s.stance.list.find((x) => x.id === lastStance)?.color ?? '#ffffff' };
      lastStance = s.phase === 'run' ? s.stance.id : '';
      if (s.phase !== 'camp') dnf = null;
      if (dnf && s.phase === 'camp' && s.t - dnf.t0 < DNF_S) { drawDnf(s.t - dnf.t0); return; }
      if (s.phase === 'camp' && s.camp) { clearPinch(); drawCamp(s.camp, canvas.width, canvas.height, s.t, s.stance.id, s.weapon); return; }
      campHits = [];
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
      if (bgFor !== w || (!bg32 && artReady())) {
        if (bgFor !== w) { bg?.release(); bg = artReady() ? null : buildBackground(w); mini = null; }
        bgFor = w; pillars = []; goo.length = 0; gooLast.clear(); bg32?.release(); info = floorInfo(w); bg32 = buildBackground32(w, info); losCache.clear();
        if (bg32 && bg) { bg.release(); bg = null; }
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
      const Zn = info?.zone ?? 'keep', Zr = ATLAS.zones[Zn];
      if (bg32) { bg32.draw(gg, Math.max(0, cx), Math.max(0, cy), W, H); bg32.prefill(3, cx + W / 2, cy + H / 2); }
      else { if (sw > 0 && sh > 0) bg!.draw(gg, sx, sy, sw, sh, k); bg!.prefill(3, sx + sw / 2, sy + sh / 2); }
      // a path over the visible open (non-wall) tiles: atmosphere stays inside rooms and corridors, never over solid rock
      const openFloorClip = (c: CanvasRenderingContext2D = gg) => { c.beginPath();
        for (let ty = Math.max(0, Math.floor(cy / TS)); ty <= Math.min(w.h - 1, Math.floor((cy + H) / TS)); ty++) {
          let run = -1;
          for (let tx = Math.max(0, Math.floor(cx / TS)); tx <= Math.min(w.w, Math.floor((cx + W) / TS) + 1); tx++) {
            const open = tx < w.w && w.tiles[ty * w.w + tx] !== TILE.WALL;
            if (open && run < 0) run = tx; else if (!open && run >= 0) { c.rect(run * TS, ty * TS, (tx - run) * TS, TS); run = -1; }
          }
          if (run >= 0) c.rect(run * TS, ty * TS, (Math.min(w.w, Math.floor((cx + W) / TS) + 2) - run) * TS, TS);
        } };
      const isSwamp = (x: number, y: number) => x >= 0 && y >= 0 && x < w.w && y < w.h && w.tiles[y * w.w + x] === TILE.SWAMP;
      const inView = (q: { x: number; y: number }, m = 1) => q.x >= Math.floor(cx / TS) - m && q.x <= Math.ceil((cx + W) / TS) + m && q.y >= Math.floor(cy / TS) - m && q.y <= Math.ceil((cy + H) / TS) + m;
      if (bg32 && info) { const vis = info.swamp.filter((q) => inView(q, 0)); if (Zn === 'deep') drawLava(gg, vis, isSwamp, t); else drawPoolGlints(gg, Zn, vis, t, isSwamp); }
      if (bg32 && info && (Zn === 'keep' || Zn === 'crypt')) { // still water mirrors whoever stands at its edge (clipped to the pool, rippled)
        const vis = info.swamp.filter((q) => inView(q, 1));
        const near = (x: number, y: number) => vis.some((q) => Math.abs(q.x + 0.5 - x) < 2.2 && q.y + 0.5 - y > -0.5 && q.y + 0.5 - y < 3.5);
        const who: Array<{ fy: number; d: () => void }> = [];
        if (near(p.x, p.y)) { const fy = Math.round(p.y * TS + p.r * TS * 1.1); who.push({ fy, d: () => drawHero32(gg, p.x * TS, fy, { angle: s.aim.angle, moving: p.moving, t, stance: s.stance.id, hurt: false, weapon: s.weapon, kick: 0, ...heroPerkLook(s.perks, s.stance.id) }) }); }
        if (artReady()) for (const e of s.enemies) if (e.kind !== 'bat' && near(e.x, e.y)) { const fy = Math.round(e.y * TS + e.r * TS * 0.9); who.push({ fy, d: () => drawEnemy32(gg, e.x * TS, fy, { kind: e.kind, variant: e.variant, moving: false, tell: 0, flash: false, face: e.face, t, id: e.id }) }); }
        if (who.length) {
          gg.save(); gg.beginPath();
          for (const q of vis) { const bank = isSwamp(q.x, q.y - 1) ? 0 : 5; gg.rect(q.x * TS, q.y * TS + bank, TS, TS - bank); }
          gg.clip(); gg.globalAlpha = 0.3;
          for (const r of who) { gg.save(); gg.translate(Math.round(Math.sin(t * 3 + r.fy) * 1), 2 * r.fy + 1); gg.scale(1, -1); r.d(); gg.restore(); }
          gg.restore();
        }
      }
      { // Deep crystal slabs in the floor show the (previous frame's) lit room through the glass, under everything standing on them
        const cm = Zr.rects.crystalMask, zsheet = sheetImage(Zn);
        if (bg32 && cm && zsheet && litC && litAt) drawCrystalFloor(gg, zsheet, cm, litC, litAt.x, litAt.y, Math.round(cx), Math.round(cy), W, H, t, (c) => openFloorClip(c));
      }
      if (bg32 && artReady()) { // Gel Slimes leave fading goo where they land
        for (const e of s.enemies) if (e.kind === 'spitter') {
          const L = gooLast.get(e.id);
          if (!L || (t - L.t > 0.32 && Math.hypot(e.x - L.x, e.y - L.y) > 0.25)) { gooLast.set(e.id, { t, x: e.x, y: e.y }); goo.push({ x: e.x * TS, y: e.y * TS + e.r * TS * 0.9, t }); }
        }
        while (goo.length && (t - goo[0].t > 3.5 || goo.length > 160)) goo.shift();
        if (gooLast.size > 256) gooLast.clear();
        const gc = charFrame('goo', 0), ga = anim32('goo');
        if (gc && ga) for (const q of goo) { const k = (t - q.t) / 3.5; if (k < 0) continue; gg.globalAlpha = 0.7 * (1 - k) * (k < 0.08 ? k / 0.08 : 1); gg.drawImage(gc, Math.round(q.x - ga.ax), Math.round(q.y - ga.ay)); }
        gg.globalAlpha = 1;
      }
      // doors, stairs, chests
      const x0 = Math.max(0, Math.floor(cx / TS)), x1 = Math.min(w.w, Math.ceil((cx + W) / TS));
      const y0 = Math.max(0, Math.floor(cy / TS)), y1 = Math.min(w.h, Math.ceil((cy + H) / TS));
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const kk = w.tiles[y * w.w + x];
        if (kk === TILE.DOOR && bg32) {
          const locked = w.rooms[w.doorRoom[y * w.w + x]]?.locked, wallAt = (dx: number) => w.tiles[y * w.w + x + dx] === TILE.WALL;
          if (wallAt(-1) && wallAt(1)) drawZoneProp(gg, Zn, locked ? 'doorLocked' : 'doorOpen', x * TS, y * TS - 16);
          else if (locked) { // a gate across a side passage, seen along its length: a row of iron posts on a rail, back to front
            const gx = x * TS + 14, IRON = ['#15121c', '#3a3243', '#5e5462', '#8f8489'];
            gg.fillStyle = '#04020880'; gg.fillRect(gx - 2, y * TS + 2, 8, TS - 2);
            gg.fillStyle = IRON[0]; gg.fillRect(gx, y * TS - 13, 3, TS + 2); gg.fillRect(gx, y * TS - 6, 3, 1);
            for (let i = 0; i < 8; i++) { const yy = y * TS + 3 + i * 4;
              gg.fillStyle = IRON[0]; gg.fillRect(gx - 1, yy - 16, 5, 17);
              gg.fillStyle = IRON[1]; gg.fillRect(gx, yy - 15, 3, 15); gg.fillStyle = IRON[2]; gg.fillRect(gx, yy - 15, 1, 15);
              gg.fillStyle = IRON[3]; gg.fillRect(gx, yy - 17, 2, 2); }
            gg.fillStyle = IRON[2]; gg.fillRect(gx - 1, y * TS - 14, 1, TS + 2); gg.fillStyle = IRON[1]; gg.fillRect(gx + 3, y * TS - 7, 1, TS + 2);
          }
          if (locked) { gg.globalCompositeOperation = 'lighter'; glowAt('#ff3b3b', x * TS + TS / 2, y * TS + TS / 2, TS * 0.8, 0.35); gg.globalCompositeOperation = 'source-over'; }
        } else if (kk === TILE.STAIRS && bg32) {
          drawZoneProp(gg, Zn, 'stairs', x * TS, y * TS);
          if (s.stairsOpen) { gg.globalCompositeOperation = 'lighter'; glowAt('#ffd84a', x * TS + TS / 2, y * TS + TS / 2, TS * (1.2 + Math.sin(t * 3) * 0.2), 0.7); gg.globalCompositeOperation = 'source-over'; }
        } else if (kk === TILE.DOOR) {
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
      for(const r of w.rooms)if(r.chest&&bg32){
        const x=Math.round(r.chest.x*TS),y=Math.round(r.chest.y*TS);shadow(x,y,11);drawZoneProp(gg,Zn,'chest',x-12,y-15);
        if(r.chest.opened){gg.fillStyle='#211820';gg.fillRect(x-11,y-16,22,4);}
      } else if(r.chest){
        const x=Math.round(r.chest.x*TS),y=Math.round(r.chest.y*TS);
        gg.fillStyle='#35251f';gg.fillRect(x-7,y-10,14,10);gg.fillStyle='#975f38';gg.fillRect(x-6,y-9,12,8);
        gg.fillStyle='#c48b50';gg.fillRect(x-5,y-9,10,2);gg.fillStyle='#e8bf65';gg.fillRect(x-6,y-5,12,1);gg.fillRect(x-1,y-6,2,3);
        if(r.chest.opened){gg.fillStyle='#211820';gg.fillRect(x-6,y-11,12,4);}
      }
      // fog over unseen rooms
      gg.fillStyle = '#07060b';
      for (const r of w.rooms) if (!r.seen) gg.fillRect((r.x0 - 1) * TS, (r.y0 - 1) * TS, (r.w + 2) * TS, (r.h + 2) * TS);

      // Authored 8px flame frames replace blurry torch and brazier dots.
      if(!bg32)for(const q of pillars){if(q.x<x0-1||q.x>x1||q.y<y0-1||q.y>y1)continue;const f=flameSprite(t+q.x*.13);gg.drawImage(f,q.x*TS+3,q.y*TS-3);}
      if(!bg32)for(const q of torches){if(q.x<x0-1||q.x>x1||q.y<y0-1||q.y>y1)continue;const f=flameSprite(t+q.y*.17);gg.drawImage(f,q.x*TS+3,q.y*TS-1);}
      for(const sh of s.shrines){
        if(!w.rooms[sh.room].seen)continue;
        const x=Math.round(sh.x*TS),y=Math.round(sh.y*TS),col=sh.state==='failed'?'#777080':SHRINE_COLORS[sh.kind];
        if(artReady()){pixelRing(gg,x,y,16,col,true,0.4);if(sh.state==='active')pixelRing(gg,x,y-20,22,col,false,1,sh.progress);continue;}
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

      // Gear Masher telegraphs: where the slam (wind-up) or the throw will land
      if (s.flail && (s.flail.mode === 'whirl' || (s.flail.mode === 'out' && s.flail.t < 0.55))) {
        const f = s.flail, big = f.mode === 'whirl', fx_ = f.tx * TS, fy_ = f.ty * TS + 6;
        const col = Math.floor(t * (big ? 8 : 14)) % 2 ? '#ff5a6e' : '#ffb0a0';
        pixelRing(gg, fx_, fy_, (big ? 1.4 : 0.55) * TS, col, true, 0.5, big ? Math.min(1, f.t / 1.8) : 1);
        if (big) pixelTarget(gg, fx_, fy_, TS * 0.3, col);
      }
      // y-sorted actors
      type A = { y: number; d: () => void };
      eliteLabels.length = 0;
      const actors: A[] = s.enemies.map((e) => ({ y: e.y, d: () => drawEnemy(e, TS, t) }));
      lastFlail = s.flail;
      const fb = s.flail && s.enemies.find((e) => e.kind === 'boss');
      if (s.flail && fb && artReady() && s.flail.mode !== 'hand') { const f = s.flail; actors.push({ y: Math.max(f.y, fb.y + 0.01), d: () => drawFlail(f, fb, TS) }); }
      actors.push({ y: p.y, d: () => { if (hideHero) return;
        const px = p.x * TS, py = p.y * TS + p.r * TS * 1.1, face = Math.cos(s.aim.angle) >= 0 ? 1 : -1;
        const bob = p.moving ? -Math.abs(Math.sin(t * 10)) * TS * 0.07 : 0;
        const shot = s.bullets.some((b) => b.friendly && b.age < 0.12 && Math.hypot(b.x - p.x, b.y - p.y) < 1.6);
        if (artReady()) {
          shadow(px, py, TS * 0.3);
          const kick = shot ? 2 : 0;
          if (p.rolling) drawHero32(gg, px - Math.cos(s.aim.angle) * TS * 0.3, py, { angle: s.aim.angle, moving: true, t, stance: s.stance.id, hurt: false, weapon: s.weapon, kick: 0, alpha: 0.3, ...heroPerkLook(s.perks, s.stance.id) });
          drawHero32(gg, px, py + bob, { angle: s.aim.angle, moving: p.moving, t, stance: s.stance.id, hurt: p.hurt < 0.08, weapon: s.weapon, kick, alpha: p.invuln && Math.floor(t * 12) % 2 ? 0.45 : 1, ...heroPerkLook(s.perks, s.stance.id) });
          if(p.warded)pixelRing(gg,p.x*TS,p.y*TS-10,TS*0.7,'#7fe7ff',true);
          return;
        }
        shadow(px, py, TS * 0.32);
        const held = holdPose(p.x * TS, p.y * TS, s.aim.angle, weaponGrip(s.weapon), shot ? 1 : 0);
        const drawHeld = () => { const ws = heldWeapon(s.weapon, s.aim.angle); gg.drawImage(ws, Math.round(held.x) - Math.floor(ws.width / 2), Math.round(held.y + bob) - Math.floor(ws.height / 2)); };
        if (held.behind) drawHeld();
        const hst: AnimState = p.hurt < 0.12 ? 'hurt' : shot ? 'attack' : p.moving ? 'walk' : 'idle';
        const hf = anim('hero',hst,t,9),hs=1,hpal=heroPalette(color);
        if (p.rolling) { gg.globalAlpha = 0.3; drawCanvas(sprite2('hero', 'walk', 0, hpal), px - Math.cos(s.aim.angle) * TS * 0.3, py, hs, face); gg.globalAlpha = 1; }
        gg.globalAlpha = p.invuln && Math.floor(t * 12) % 2 ? 0.45 : 1;
        drawCanvas(sprite2('hero', hf.state, hf.idx, hpal), px, py, hs, face, bob);
        if (p.hurt < 0.08) { gg.globalAlpha = 0.5; drawCanvas(sprite2('hero', hf.state, hf.idx, undefined, true), px, py, hs, face, bob); }
        gg.globalAlpha = 1;
        if(p.warded)pixelRing(gg,p.x*TS,p.y*TS,TS*0.8,'#7fe7ff',true);
        // weapon gripped at its handle by the facing hand, pointing along the aim
        if(!held.behind)drawHeld();
      } });
      if (artReady()) (s.perks?.drones ?? []).forEach((d, k) => actors.push({ y: d.y + 0.6, d: () => drawDrone(gg, d.x * TS, d.y * TS, t, d.shot, k) }));
      if (bg32 && info) {
        const lr = zonePropSize(Zn, 'light');
        for (const q of info.pillars) if (inView(q, 2) && lr) actors.push({ y: q.y + 0.5, d: () => { const fx2 = q.x * TS + 16, fy2 = q.y * TS + 28; shadow(fx2, fy2, 9); drawZoneProp(gg, Zn, 'light', fx2 - (lr.w >> 1), fy2 - lr.h); } });
        for (const sh of s.shrines) if (w.rooms[sh.room].seen) actors.push({ y: sh.y, d: () => { shadow(sh.x * TS, sh.y * TS, 11); drawShrine32(gg, sh.kind, sh.x * TS, sh.y * TS, t, sh.state === 'failed'); } });
      }
      actors.sort((a, b) => a.y - b.y);
      for (const a of actors) a.d();
      if (bg32 && info) { // atmosphere that the lighting should shade: fog banks in the Crypt, falling grit elsewhere
        const fx0 = Math.round(cx), fy0 = Math.round(cy);
        gg.save(); openFloorClip(); gg.clip();
        if (Zn === 'crypt') drawFog(gg, fx0, fy0, W, H, t);
        if (Zn !== 'deep') drawGrit(gg, Zn, fx0, fy0, W, H, t);
        gg.restore();
      }

      const emissive = () => {
        if (s.stairsOpen && bg32) { // the way down: light motes rise out of the stairwell and a gold arrow bobs above it
          const sx = Math.floor(w.stairs.x) * TS, sy = Math.floor(w.stairs.y) * TS;
          for (let i = 0; i < 14; i++) { const ph = (t * 0.45 + i * 0.071) % 1, x0 = sx + 6 + ((i * 7) % 20) + Math.round(Math.sin(t * 2 + i) * 2);
            gg.globalAlpha = Math.sin(ph * Math.PI) * 0.9; gg.fillStyle = i % 3 ? '#ffd84a' : '#fff4c0'; gg.fillRect(x0, Math.round(sy + 26 - ph * 34), 1, i % 4 ? 1 : 2); }
          gg.globalAlpha = 1;
          const ay = Math.round(sy - 14 + Math.abs(Math.sin(t * 3)) * -4), ax = sx + 16;
          for (let r = 0; r < 5; r++) { gg.fillStyle = '#0a0810'; gg.fillRect(ax - 5 + r - 1, ay + r - 1, (5 - r) * 2 + 3, 3); }
          for (let r = 0; r < 5; r++) { gg.fillStyle = r < 2 ? '#fff4c0' : '#ffd84a'; gg.fillRect(ax - 5 + r, ay + r, (5 - r) * 2 + 1, 1); }
          gg.fillStyle = '#0a0810'; gg.fillRect(ax - 3, ay - 7, 7, 8); gg.fillStyle = '#ffd84a'; gg.fillRect(ax - 2, ay - 6, 5, 6); gg.fillStyle = '#fff4c0'; gg.fillRect(ax - 2, ay - 6, 1, 6);
        }
        if (s.perks?.ranks.length) drawPerkParticles(gg, s.perks, p.x * TS, p.y * TS + p.r * TS * 1.1, p.moving, t, p.hp >= p.maxHp, s.stance.id);
        if (swapFx) { const k = (t - swapFx.t0) / 0.5; if (k < 0 || k > 1) swapFx = null; else drawStanceSwap(gg, p.x * TS, p.y * TS + p.r * TS * 1.1, k, swapFx.c, swapFx.from, t); }
        for (const b of s.bullets) if (!(artReady() && drawShot32(gg, b, TS))) drawBullet(b, TS, t);
        for (const f of s.fx) {
          if (f.kind === 'death' && artReady()) drawPuff(gg, f.x * TS, f.y * TS + 8, (t - f.t0) / f.life);
          else if (f.kind === 'muzzle' && artReady()) { const tip = muzzleTip(p.x * TS, p.y * TS + p.r * TS * 1.1, s.aim.angle, s.weapon); drawMuzzle32(gg, tip.x, tip.y, s.aim.angle, f.color, (t - f.t0) / f.life); }
          else if (f.kind === 'text' && isNumberText(f.text)) { const k = (t - f.t0) / f.life; if (k >= 0 && k <= 1) drawNumber32(gg, f.text!, f.color, f.x * TS, f.y * TS, k, !!f.big, Math.round(f.t0 * 1000)); }
          else if (f.kind !== 'text') drawFx(f, t, TS);
        }
      };
      if (!bg32) emissive();
      // Orbit blades and target marker use the same native-pixel masks as ordinary shots.
      for (const o of s.orbit) {
        const ob: BulletView = { x: o.x, y: o.y, r: 0.2, friendly: true, style: 'star', color: ELEMENT_COLORS[s.weapon.element], angle: t * 14, age: t, variant: s.weapon.variant };
        if (!(artReady() && drawShot32(gg, ob, TS))) drawProjectile(gg, ob, TS);
      }
      const tgt=s.ai.targetId?s.enemies.find(e=>e.id===s.ai.targetId):undefined;
      if(tgt)pixelTarget(gg,tgt.x*TS,tgt.y*TS,(tgt.r+0.35)*TS,tgt.kind==='boss'?'#ff6a70':'#ffd84a');
      gg.restore();

      if (bg32 && info) {
        // Stepped per-pixel lighting with wall occlusion (light32.ts), then the emissive layer on top.
        const dark = s.curse?.kind === 'darkness', zl = ZL[Zn], ox = Math.round(cx), oy = Math.round(cy);
        const grid = { w: w.w, h: w.h, wall: (x: number, y: number) => x < 0 || y < 0 || x >= w.w || y >= w.h || w.tiles[y * w.w + x] === TILE.WALL };
        const L: Array<Light & { los?: Los }> = [], statics = new Set<object>();
        const add = (key: string | null, x: number, y: number, r: number, c: readonly [number, number, number], i: number, skipLos = false) => {
          if (x + r < ox || x - r > ox + W || y + r < oy || y - r > oy + H) return;
          let los: Los | undefined;
          if (!skipLos) {
            const tx = Math.floor(x / TS), ty = Math.floor(y / TS), rt = Math.ceil(r / TS);
            los = key ? losCache.get(key) : undefined;
            if (!los) { los = lineOfSight(grid, tx, ty, rt); if (key) losCache.set(key, los); }
          }
          const e = { x, y, r, c, i, ...(los ? { los } : {}) }; L.push(e); if (key) statics.add(e);
        };
        const fl = (k: number) => 1 + Math.sin(t * 9 + k * 2) * 0.04 + Math.sin(t * 23 + k) * 0.03;
        const lamp = s.perks?.light ?? 0;
        add(null, p.x * TS, p.y * TS - 12, TS * (dark ? 2.2 : 3.2) * (1 + lamp), [255, 236, 210], 0.55);
        if (lamp > 0) add(null, p.x * TS + Math.cos(s.aim.angle) * TS * 2.2, p.y * TS - 12 + Math.sin(s.aim.angle) * TS * 2.2, TS * 2.6 * (1 + lamp * 0.5), [255, 240, 190], 0.5 + lamp * 0.4); // the Headlamp beam
        for (const d of s.perks?.drones ?? []) add(null, d.x * TS, d.y * TS - 6, TS * 1.3, [140, 190, 255], 0.5, true);
        if (!dark) {
          for (const q of info.torches) add(`t${q.x},${q.y}`, q.x * TS + 16, (q.y + 1) * TS + 2, TS * 3.4 * fl(q.x), zl.torch, 0.95);
          for (const q of info.lit) add(q.key, q.x, q.y, q.r * fl(q.cx), q.c, q.i);
          for (const q of info.pillars) add(`p${q.x},${q.y}`, q.x * TS + 16, q.y * TS + 14, TS * 3.2 * fl(q.y), zl.prop, 0.95);
          if (Zn === 'deep') for (const q of info.swamp) if (q.x % 3 === 1 && q.y % 2 === 0) add(`l${q.x},${q.y}`, q.x * TS + 16, q.y * TS + 16, TS * 2.8, [255, 110, 40], 0.9);
          for (const sh of s.shrines) if (sh.state !== 'failed') add(`s${sh.room}`, sh.x * TS, sh.y * TS - 16, TS * 2.6, hexRgb(SHRINE_COLORS[sh.kind]), 0.7);
        }
        let nb = 0;
        for (const b of s.bullets) if (b.friendly && nb++ < 10) add(null, b.x * TS, b.y * TS, TS * 1.6, hexRgb(b.color.length === 7 ? b.color : '#ffd84a'), 0.8, true);
        for (const f of s.fx) if ((f.kind === 'boom' || f.kind === 'muzzle') && t - f.t0 < f.life) add(null, f.x * TS, f.y * TS, TS * 2.2 * (1 - (t - f.t0) / f.life), hexRgb(f.color.length === 7 ? f.color : '#ffb04a'), 1.2, true);
        // budget: every dynamic light, plus the 24 static lights nearest the middle of the view
        if (statics.size > 24) {
          const mx = ox + W / 2, my = oy + H / 2, d2 = (l: Light) => (l.x - mx) ** 2 + (l.y - my) ** 2;
          const keep = new Set([...L].filter((l) => statics.has(l)).sort((a, b) => d2(a) - d2(b)).slice(0, 24));
          for (let i = L.length - 1; i >= 0; i--) if (statics.has(L[i]) && !keep.has(L[i])) L.splice(i, 1);
        }
        const amb = dark ? [zl.amb[0] * 0.35, zl.amb[1] * 0.35, zl.amb[2] * 0.4] as const : zl.amb;
        const BW = Math.ceil(W / 2), BH = Math.ceil(H / 2);
        if (!lightC) lightC = document.createElement('canvas');
        if (lightC.width !== BW || lightC.height !== BH) { lightC.width = BW; lightC.height = BH; lightImg = null; }
        const lc = lightC.getContext('2d')!; if (!lightImg) lightImg = lc.createImageData(BW, BH);
        shade({ grid, ts: TS, rise: 16, ox, oy, W, H, amb, lights: L }, lightImg.data);
        lc.putImageData(lightImg, 0, 0);
        litAt = { x: ox, y: oy };
        if (!litC) litC = document.createElement('canvas');
        if (litC.width !== W || litC.height !== H) { litC.width = W; litC.height = H; }
        const lg = litC.getContext('2d')!; lg.imageSmoothingEnabled = false; lg.globalCompositeOperation = 'source-over';
        lg.drawImage(worldCanvas, 0, 0); lg.globalCompositeOperation = 'multiply'; lg.drawImage(lightC, 0, 0, BW * 2, BH * 2); lg.globalCompositeOperation = 'source-over';
        gg.save(); gg.setTransform(1, 0, 0, 1, 0, 0);
        gg.globalCompositeOperation = 'copy'; gg.drawImage(litC, 0, 0); gg.globalCompositeOperation = 'source-over';
        for (let i = 1; i < LIGHT_SCALE; i++) { gg.globalCompositeOperation = 'lighter'; gg.drawImage(litC, 0, 0); gg.globalCompositeOperation = 'source-over'; }
        gg.restore(); gg.save(); gg.translate(-ox, -oy);
        // emissive layer: flames, glowing props, shots, bursts
        if (Zn === 'keep' || Zn === 'crypt') drawPoolLights(gg, info.swamp.filter((q) => inView(q, 0)), isSwamp, L.filter((l) => statics.has(l)), t, TS);
        const fi = Math.floor(t * 10), fr = Zr.rects.flame;
        if (Zn !== 'deep' && fr) {
          for (const q of info.torches) if (inView(q)) drawZoneProp(gg, Zn, 'flame', q.x * TS + 13, q.y * TS - 10, fi + q.x, 4);
          const lr = zonePropSize(Zn, 'light');
          if (lr) for (const q of info.pillars) if (inView(q)) drawZoneProp(gg, Zn, 'flame', q.x * TS + 13, q.y * TS + 28 - lr.h - 9, fi + q.y, 4);
        }
        if (Zn === 'deep') { const lr = zonePropSize(Zn, 'light'), sp = cut(Zn, 'light'); if (lr && sp && litC) for (const q of info.pillars) if (inView(q)) drawRefracting(gg, sp, q.x * TS + 16 - (lr.w >> 1), q.y * TS + 28 - lr.h, litC, ox, oy, t); gg.save(); openFloorClip(); gg.clip(); drawEmbers(gg, ox, oy, W, H, t); gg.restore(); }
        for (const d of info.glow) { const gr = Zr.rects['decal:' + d.name]; if (!gr || d.px > ox + W || d.px + gr[2] < ox || d.py > oy + H || d.py + gr[3] < oy) continue;
          const sp = d.name.startsWith('shards') ? cut(Zn, 'decal:' + d.name) : null;
          if (sp && litC) { drawRefracting(gg, sp, d.px, d.py, litC, ox, oy, t); continue; }
          gg.globalAlpha = 0.7 + 0.3 * Math.sin(t * 1.7 + d.px * 0.05); drawZoneProp(gg, Zn, 'decal:' + d.name, d.px, d.py); gg.globalAlpha = 1; }
        for (const q of info.lit) { // glowing props shine through the dark; candles get flickering flames
          if (q.cx < ox - 40 || q.cx > ox + W + 40 || q.foot < oy - 40 || q.foot > oy + H + 60) continue;
          const pr = Zr.rects['decor:' + q.name]; if (!pr) continue;
          const x0 = q.cx - (pr[2] >> 1), y0 = q.foot - pr[3];
          if (PROP_LIGHT[q.name]?.glow) {
            const sp = Zn === 'deep' && q.name.startsWith('crystal') ? cut(Zn, 'decor:' + q.name) : null;
            if (sp && litC) drawRefracting(gg, sp, x0, y0, litC, ox, oy, t);
            else { gg.globalAlpha = 0.45 + 0.2 * Math.sin(t * 2.2 + q.cx * 0.1); drawZoneProp(gg, Zn, 'decor:' + q.name, x0, y0); gg.globalAlpha = 1; }
          }
          else for (const [wx, wy] of wicks(Zn, q.name)) {
            const k = Math.floor(t * 8 + wx * 3 + q.cx) % 4;
            gg.fillStyle = '#ff9a3a'; gg.fillRect(x0 + wx, y0 + wy - 2, 1, 2);
            gg.fillStyle = k === 0 ? '#ffd84a' : '#fff2c0'; gg.fillRect(x0 + wx, y0 + wy - 3 - (k === 3 ? 1 : 0), 1, 1);
          }
        }
        for (const sh of s.shrines) if (w.rooms[sh.room].seen && sh.state !== 'failed') { gg.globalAlpha = 0.5; drawShrine32(gg, sh.kind, sh.x * TS, sh.y * TS, t, false); gg.globalAlpha = 1; }
        emissive();
        for (const r of w.rooms) if (!r.seen) { gg.fillStyle = '#07060b'; gg.fillRect((r.x0 - 1) * TS, (r.y0 - 1) * TS - 16, (r.w + 2) * TS, (r.h + 2) * TS + 16); }
        gg.restore();
      } else {
      // (fallback before the art sheets load) Restrained stepped darkness, drawn at native resolution. No smoothed light-map upscale.
      const dark=s.curse?.kind==='darkness';
      if(!lightC)lightC=document.createElement('canvas');
      if(lightC.width!==W||lightC.height!==H){lightC.width=W;lightC.height=H;}
      const lg=lightC.getContext('2d')!;lg.globalCompositeOperation='source-over';lg.clearRect(0,0,W,H);lg.fillStyle=dark?'#07060bf5':'#07060b38';lg.fillRect(0,0,W,H);
      lg.globalCompositeOperation='destination-out';
      const lamp=(x:number,y:number,r:number)=>{for(const [f,a] of [[1,.25],[.8,.35],[.6,.55],[.35,1]]){lg.globalAlpha=a;pixelDisc(lg,x-Math.round(cx),y-Math.round(cy),r*f,'#ffffff');}};
      lamp(p.x*TS,p.y*TS,TS*(dark?3:5));
      if(!dark){for(const q of torches)if(q.x>=x0-3&&q.x<=x1+3&&q.y>=y0-3&&q.y<=y1+3)lamp((q.x+.5)*TS,(q.y+.5)*TS,TS*3);for(const q of pillars)if(q.x>=x0-3&&q.x<=x1+3&&q.y>=y0-3&&q.y<=y1+3)lamp((q.x+.5)*TS,(q.y+.5)*TS,TS*3);}
      lg.globalAlpha=1;lg.globalCompositeOperation='source-over';gg.drawImage(lightC,0,0);
      }
      if(s.curse){gg.fillStyle=s.curse.color+'12';gg.fillRect(0,0,W,H);}
      if(p.hurt<0.3){gg.fillStyle='#f4516133';gg.fillRect(0,0,W,2);gg.fillRect(0,H-2,W,2);gg.fillRect(0,0,2,H);gg.fillRect(W-2,0,2,H);}
      g=output;output.imageSmoothingEnabled=false;
      output.drawImage(worldCanvas,0,0,W*pixelScale,H*pixelScale);
      lastHero = { x: (p.x * TS - Math.round(cx)) * pixelScale, y: (p.y * TS + p.r * TS * 1.1 - Math.round(cy)) * pixelScale, scale: pixelScale, angle: s.aim.angle, stance: s.stance.id };
      output.save();output.translate(-Math.round(cx)*pixelScale,-Math.round(cy)*pixelScale);
      for(const f of s.fx)if(f.kind==='text'&&!(bg32&&isNumberText(f.text)))drawFx(f,t,TS*pixelScale);
      output.font = pixelFont(10 * dpr); output.textAlign = 'center'; output.strokeStyle = '#100d1c';
      for (const label of eliteLabels) {
        strokeText(output, label.text, label.x * pixelScale, label.y * pixelScale);
        output.fillStyle = label.color; fillText(output, label.text, label.x * pixelScale, label.y * pixelScale);
      }
      output.restore();
      drawHud(s,OW,OH,bike);
      perkHits = s.perks?.offer && artReady() ? drawPerkPicker(output, s.perks, OW, OH, insetCss * dpr, uiU, dpr, s.perks.offer.age, heroPerkLook(s.perks, s.stance.id),
        (hg, x, foot, look) => drawHero32(hg, x, foot, { moving: false, t, hurt: false, weapon: look.stance && look.stance !== s.stance.id ? stanceWeapon(s, look.stance) : s.weapon, kick: 0, ...look, stance: look.stance ?? s.stance.id, angle: look.angle ?? Math.PI * 0.5 })) : [];
    },
    unmount() {
      clearPinch(); pinchEnabled = false;
      canvas?.removeEventListener('pointerdown', onPointer);
      canvas?.removeEventListener('pointermove', moveTouch);
      canvas?.removeEventListener('pointerup', endTouch);
      canvas?.removeEventListener('pointercancel', endTouch);
      canvas?.removeEventListener('lostpointercapture', endTouch);
      window.removeEventListener('blur', clearPinch);
      canvas?.remove(); canvas = null; g = null;
      bg?.release(); bg = null; bg32?.release(); bg32 = null; bgFor = null; info = null;
      losCache.clear(); flashAt.clear(); hpSeen.clear(); moved.clear();
      coinSeen.clear(); readyPrev.clear(); gooLast.clear(); goo.length = 0; flyers.length = 0; pulses.length = 0;
      clearDerivedArtCache();
      mini = null; worldCanvas = null; lightC = null; lightImg = null; litC = null; litAt = null; campSnap = null;
      lastRun = null; dnf = null; zoom.held = 0;
    },
  };

  function drawDnf(k: number) {
    const gg = g!, d = dnf!, W = canvas!.width, H = canvas!.height, h = d.hero;
    gg.imageSmoothingEnabled = false; gg.globalAlpha = 1; gg.drawImage(d.img, 0, 0);
    gg.fillStyle = '#1a0610'; gg.globalAlpha = Math.min(0.75, k * 0.9); gg.fillRect(0, 0, W, H); gg.globalAlpha = 1;
    const dn = anim32('down.' + h.stance) ? 'down.' + h.stance : 'down', fr = charFrame(dn, Math.min(2, Math.floor(k * 5))), m = anim32(dn);
    if (fr && m) { const sc = h.scale, flip = Math.cos(h.angle) < 0;
      gg.save(); gg.translate(Math.round(h.x), Math.round(h.y)); if (flip) gg.scale(-1, 1);
      gg.drawImage(fr, -m.ax * sc, -m.ay * sc, fr.width * sc, fr.height * sc); gg.restore(); }
    if (k > 0.6) { const a = Math.min(1, (k - 0.6) * 3); gg.globalAlpha = a;
      const ty = Math.max(24 * dpr, Math.min(H * 0.34, h.y - 34 * h.scale - 70 * dpr));
      const S8 = Math.max(4, Math.round(8 * dpr)), S2 = Math.max(1, Math.round(2 * dpr));
      displayText(gg, 'DNF', W / 2, ty, S8, '#ff5a5a', true, '#1a0408');
      gg.globalAlpha = a * 0.85; displayText(gg, 'DID NOT FINISH', W / 2, ty + 70 * dpr, Math.max(2, Math.round(2.5 * dpr)), '#ffb0b0', true, '#1a0408'); gg.globalAlpha = 1; }
    if (k > DNF_S - 0.45) { gg.fillStyle = '#07060b'; gg.globalAlpha = Math.min(1, (k - (DNF_S - 0.45)) / 0.45); gg.fillRect(0, 0, W, H); gg.globalAlpha = 1; }
  }
  function drawCamp(c: CampView, W: number, H: number, t: number, stanceId: string, campWeapon: WeaponLook) {
    const gg = g!, u = (Math.max(1, Math.min(W, H) / dpr / 600) * 0.75 + 0.25) * dpr, fs = Math.round(15 * u);
    const compact = W < 700 * dpr;
    const UH = H - insetCss * dpr; // camp scene sits above the HUD; the backdrop is full-bleed
    const V=pixelViewport(W,H),scale=V.scale;
    if(!worldCanvas)worldCanvas=document.createElement('canvas');
    if(worldCanvas.width!==V.width||worldCanvas.height!==V.height){worldCanvas.width=V.width;worldCanvas.height=V.height;}
    const cg=worldCanvas.getContext('2d')!;cg.imageSmoothingEnabled=false;cg.fillStyle='#15111f';cg.fillRect(0,0,V.width,V.height);
    // layout first: the fire scene sits in the free band between the upgrade list and the hint line
    const rowH0=(compact?48:32)*u, maxRows0=Math.max(4,Math.floor((UH*0.72-90*u)/rowH0)), nRows=Math.min(c.rows.length,maxRows0);
    const menuBot=(90*u+nRows*rowH0+(c.lastRun||c.lastDeath?34*u:0))/scale, hintTop=(UH-(compact?46:36)*u)/scale;
    const fy=Math.round(Math.max(menuBot+28,menuBot+(hintTop-menuBot)*0.62)),hx=Math.round(V.width/2-26),hy=fy,fx=Math.round(V.width/2),ground=fy;
    const kim=sheetImage('keep'),KR=ATLAS.zones.keep.rects;
    if(kim&&artReady()){
      // the camp is a Keep guardroom: flagstones, a back wall with banners and torches, a log fire, and stepped firelight
      const fl=KR.floor;for(let yy=0;yy<V.height;yy+=fl[3])for(let xx=0;xx<V.width;xx+=fl[2])cg.drawImage(kim,fl[0],fl[1],fl[2],fl[3],xx,yy,fl[2],fl[3]);
      const wallY=Math.max(0,Math.round(Math.min(ground-60,6*u/scale))),fc=KR.face;
      cg.fillStyle='#07060b';cg.fillRect(0,0,V.width,wallY);
      for(let xx=0;xx<V.width;xx+=32){cg.drawImage(kim,fc[0]+(xx%512),fc[1],32,48,xx,wallY,32,48);}
      cg.fillStyle=ATLAS.zones.keep.ramp[8];cg.fillRect(0,wallY-1,V.width,1);
      const torchX:number[]=[];for(let xx=48;xx<V.width-16;xx+=128)torchX.push(xx);
      const tb=KR.torch,ban=KR['hang:banner'];
      torchX.forEach((xx,i)=>{if(i%2&&ban)cg.drawImage(kim,ban[0],ban[1],ban[2],ban[3],xx+40,wallY+4,ban[2],ban[3]);if(tb)cg.drawImage(kim,tb[0],tb[1],tb[2],tb[3],xx-3,wallY+14,tb[2],tb[3]);});
      cg.fillStyle='#04020866';cg.fillRect(0,wallY+48,V.width,4);
      const prop=(n:string,x:number,foot:number)=>{const r=KR['decor:'+n];if(r){cg.fillStyle='#04020888';cg.fillRect(x-(r[2]>>1)+2,foot-2,r[2]-4,3);cg.drawImage(kim,r[0],r[1],r[2],r[3],x-(r[2]>>1),foot-r[3],r[2],r[3]);}};
      const ro=KR['decal:rosette'];
      if(ro)cg.drawImage(kim,ro[0],ro[1],ro[2],ro[3],fx-(ro[2]>>1),fy-(ro[3]>>1)-2,ro[2],ro[3]);
      prop('candelabra',fx-140,fy-14);prop('candelabra',fx+136,fy-12);
      prop('barrel',fx-86,fy-6);prop('crate',fx-108,fy+4);prop('barrel',fx+90,fy+2);prop('borne',fx+62,fy-8);
      // log fire: two crossed logs, embers, and the Keep flame strip on top
      const L=['#2a1810','#46281a','#683c24','#8c5530'];
      for(let i=-8;i<=8;i++){cg.fillStyle=L[i<-6||i>6?0:i<0?2:1];cg.fillRect(fx+i,fy-2+Math.round(i/4),1,3);cg.fillRect(fx+i,fy-2-Math.round(i/4),1,3);}
      cg.fillStyle=L[3];cg.fillRect(fx-7,fy-3,3,1);cg.fillRect(fx+4,fy-4,3,1);
      cg.fillStyle='#ff8a2a';cg.fillRect(fx-3,fy-1,6,1);cg.fillStyle='#ffe08a';cg.fillRect(fx-1,fy-1,2,1);
      const ff=Math.floor(t*10),flr=KR.flame;if(flr){const fw=Math.floor(flr[2]/4);for(const [ox,k] of [[-5,0],[0,1],[4,2]] as const)cg.drawImage(kim,flr[0]+fw*((ff+k)%4),flr[1],fw,flr[3],fx+ox-(fw>>1),fy-flr[3]-1+(k===1?-3:0),fw,flr[3]);}
      drawHero32(cg,hx-6,hy,{angle:Math.PI*0.5,moving:false,t,stance:stanceId,hurt:false,weapon:campWeapon,kick:0});
      // stepped light: the fire (flickering) and the wall torches over a dim ambient
      const Wd=V.width,Hd=V.height,flick=1+Math.sin(t*9)*0.04+Math.sin(t*23)*0.03,grid={w:1,h:1,wall:()=>false};
            const lights=[{x:fx,y:fy-8,r:200*flick,c:[255,170,90] as const,i:1.1},...torchX.map((xx)=>({x:xx,y:wallY+18,r:110*flick,c:[255,176,80] as const,i:0.8})),...[-140,136].map((dx)=>({x:fx+dx,y:fy-24,r:70*flick,c:[255,200,120] as const,i:0.6}))];
      const BW=Math.ceil(Wd/2),BH=Math.ceil(Hd/2);
      if(!lightC)lightC=document.createElement('canvas');if(lightC.width!==BW||lightC.height!==BH){lightC.width=BW;lightC.height=BH;lightImg=null;}
      const lc=lightC.getContext('2d')!;if(!lightImg)lightImg=lc.createImageData(BW,BH);
      shade({grid,ts:32,rise:16,ox:0,oy:0,W:Wd,H:Hd,amb:[0.3,0.27,0.36],lights},lightImg.data);lc.putImageData(lightImg,0,0);
      cg.globalCompositeOperation='multiply';cg.imageSmoothingEnabled=false;cg.drawImage(lightC,0,0,BW*2,BH*2);cg.globalCompositeOperation='lighter';cg.globalAlpha=1;
      if(!campSnap)campSnap=document.createElement('canvas');if(campSnap.width!==Wd||campSnap.height!==Hd){campSnap.width=Wd;campSnap.height=Hd;}
      const sg=campSnap.getContext('2d')!;sg.clearRect(0,0,Wd,Hd);sg.drawImage(worldCanvas!,0,0);cg.drawImage(campSnap,0,0);cg.globalCompositeOperation='source-over';
      // a soft vignette keeps the menu readable over the lit room
      const vg=cg.createRadialGradient(fx,fy,20,fx,fy,Math.max(Wd,Hd)*0.75);vg.addColorStop(0,'rgba(8,6,12,0)');vg.addColorStop(1,'rgba(8,6,12,0.55)');cg.fillStyle=vg;cg.fillRect(0,0,Wd,Hd);
      if(flr){for(const [ox,k] of [[-5,0],[0,1],[4,2]] as const){const fw=Math.floor(flr[2]/4);cg.drawImage(kim,flr[0]+fw*((ff+k)%4),flr[1],fw,flr[3],fx+ox-(fw>>1),fy-flr[3]-1+(k===1?-3:0),fw,flr[3]);}
        torchX.forEach((xx,i)=>cg.drawImage(kim,flr[0]+Math.floor(flr[2]/4)*((ff+i)%4),flr[1],Math.floor(flr[2]/4),flr[3],xx-3,wallY+3,Math.floor(flr[2]/4),flr[3]));}
      const cd=KR['decor:candelabra'];if(cd)for(const dx of [-140,136])for(const [wx,wy] of wicks('keep','candelabra')){const x0=fx+dx-(cd[2]>>1),y0=fy-(dx<0?14:12)-cd[3],k=Math.floor(t*8+wx*3+dx)&3;
        cg.fillStyle='#ff9a3a';cg.fillRect(x0+wx,y0+wy-2,1,2);cg.fillStyle=k===0?'#ffd84a':'#fff2c0';cg.fillRect(x0+wx,y0+wy-3-(k===3?1:0),1,1);}
      for(let i=0;i<10;i++){const ph=(t*0.5+i*0.137)%1;cg.fillStyle=i%3?'#ff8a2a':'#ffe08a';cg.globalAlpha=1-ph;cg.fillRect(Math.round(fx+Math.sin(t*2+i*1.7)*6*ph),Math.round(fy-10-ph*60),1,1);}cg.globalAlpha=1;
    } else {
      for(let yy=ground;yy<V.height;yy+=16)for(let xx=0;xx<V.width;xx+=16){cg.fillStyle=hash(xx,yy)>.5?'#302737':'#2a2332';cg.fillRect(xx,yy,15,15);}
      const fc=flameSprite(t);const hero=sprite2('hero','idle',0,heroPalette(color));cg.drawImage(hero,hx-9,hy-18);
      cg.fillStyle='#704830';cg.fillRect(Math.round(V.width/2)-5,hy-2,11,2);cg.drawImage(fc,Math.round(V.width/2)-5,hy-10);
    }
    gg.imageSmoothingEnabled=false;gg.drawImage(worldCanvas,0,0,V.width*scale,V.height*scale);
    displayText(gg,c.lastRun?.won?'FINISHED':'CAMP',W/2,16*u,Math.max(3,Math.round(4*dpr)),'#ffd84a',true);
    gg.textAlign='center';
    gg.fillStyle = '#ccc'; gg.font = pixelFont(fs);
    fillText(gg, `Bank ● ${c.bank}   ·   Best floor ${c.bestFloor}${c.floors ? `/${c.floors}` : ''}   ·   ${c.wins ? `Wins ${c.wins}   ·   ` : ''}Runs ${c.runs}`, W / 2, 70 * u, W - 24 * u);
    const resY = 90 * u + nRows * rowH0 + 22 * u;
    if (c.lastRun) { const L = c.lastRun; gg.fillStyle = L.won ? '#ffd84a' : '#ff8a8a'; gg.font = pixelFont(Math.round(fs * 0.9));
      fillText(gg, runResultLine(L, compact), W / 2, resY, W - 24 * u); }
    else if (c.lastDeath) { gg.fillStyle = '#ff8a8a'; gg.font = pixelFont(Math.round(fs * 0.9));
      fillText(gg, compact ? `Fell on floor ${c.lastDeath.floor}. Coins banked.` : `You fell on floor ${c.lastDeath.floor}. Every coin was banked. Cool down, level up, go again.`, W / 2, resY, W - 24 * u); }
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
      fillText(gg, `D-pad + A/Z · Auto-start in ${left}s`, W / 2, UH - 14 * u, W - 24 * u);
    } else fillText(gg, `Tap a row, or D-pad + A/Z to buy/select · B begin  —  auto-start after ${left}s of pedaling`, W / 2, UH - 18 * u, W - 24 * u);
    gg.textAlign = 'left';
  }

  /** Boss bar: gold name plate with phase pips, a framed crimson meter with a lagging damage chip and notched phase marks. */
  function drawBossBar(gg: CanvasRenderingContext2D, x: number, y: number, w: number, hu: number, B: NonNullable<DungeonSnapshot['boss']>, t: number, exp: boolean, tide: boolean) {
    const f = Math.max(0, Math.min(1, B.hp / B.maxHp)), q = Math.max(1, Math.round(hu));
    if (bossChipName !== B.name) { bossChip = f; bossChipName = B.name; }
    bossChip = f > bossChip ? f : bossChip + (f - bossChip) * 0.06;
    // name plate
    gg.save(); gg.textBaseline = 'alphabetic'; gg.textAlign = 'left'; gg.font = pixelFont(Math.round(12 * hu));
    { const ns = Math.max(1, Math.min(fontScale(Math.round(12 * hu)), Math.floor(w * 0.72 / displayWidth(B.name, 1))));
      displayText(gg, B.name, x + hu, y + 11 * hu - 8 * ns, ns, exp ? '#fff4b0' : '#ffd84a'); }
    // phase pips (diamonds): filled for phases reached
    const n = B.splits.length + 1;
    for (let i = 0; i < n; i++) {
      const cx = Math.round(x + w - 6 * hu - (n - 1 - i) * 11 * hu), cy = Math.round(y + 6 * hu), r = Math.round(3.5 * hu), on = i < B.phase;
      gg.fillStyle = '#0a0810'; gg.beginPath(); gg.moveTo(cx, cy - r - q); gg.lineTo(cx + r + q, cy); gg.lineTo(cx, cy + r + q); gg.lineTo(cx - r - q, cy); gg.fill();
      gg.fillStyle = on ? (exp ? '#ffe08a' : '#c23a3a') : '#3a3243'; gg.beginPath(); gg.moveTo(cx, cy - r); gg.lineTo(cx + r, cy); gg.lineTo(cx, cy + r); gg.lineTo(cx - r, cy); gg.fill();
      if (on) { gg.fillStyle = '#ffffff66'; gg.fillRect(cx - q, cy - r + q, q, q); }
    }
    // frame + meter
    const by = Math.round(y + 15 * hu), bh = Math.round(12 * hu), bx = Math.round(x), bw = Math.round(w);
    pixelPanel(gg, bx - 2 * q, by - 2 * q, bw + 4 * q, bh + 4 * q, exp ? '#ffd84a' : '#82718f', '#120e18', q);
    const ramp = exp ? ['#7a4a12', '#f0b030', '#ffe08a'] : tide ? ['#2e2140', '#7a4ab0', '#c08aff'] : ['#3a0e16', '#922430', '#e0504a'];
    const fw = Math.round(bw * f), cw = Math.round(bw * Math.max(f, bossChip));
    gg.fillStyle = '#f1e8d6'; gg.fillRect(bx + fw, by, cw - fw, bh);                         // damage chip
    gg.fillStyle = ramp[1]; gg.fillRect(bx, by, fw, bh);
    gg.fillStyle = ramp[2]; gg.fillRect(bx, by, fw, 2 * q);
    gg.fillStyle = ramp[0]; gg.fillRect(bx, by + bh - 2 * q, fw, 2 * q);
    if (exp) { gg.fillStyle = `rgba(255,255,255,${0.25 + 0.2 * Math.sin(t * 12)})`; gg.fillRect(bx, by, fw, bh); }
    gg.fillStyle = '#0d0b1855'; for (let xx = 16 * q; xx < fw; xx += 16 * q) gg.fillRect(bx + xx, by + 2 * q, q, bh - 4 * q);
    for (const sp of B.splits) {                                                               // notched phase marks
      const mx = Math.round(bx + bw * sp);
      gg.fillStyle = '#0a0810'; gg.fillRect(mx - q, by - 2 * q, 2 * q, bh + 4 * q);
      gg.fillStyle = '#ffd84a'; gg.fillRect(mx - q, by - 3 * q, 2 * q, 2 * q); gg.fillRect(mx - q, by + bh + q, 2 * q, 2 * q);
    }
    gg.restore();
  }
  function bar(x: number, y: number, w: number, h: number, frac: number, col: string, label: string) {
    const gg = g!, q = Math.max(1, Math.round(dpr)), r = colorRamp(col);
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    pixelPanel(gg, x - 2 * q, y - 2 * q, w + 4 * q, h + 4 * q, '#82718f', '#120e18', q);
    const fw = Math.round(w * Math.max(0, Math.min(1, frac)));
    gg.fillStyle = r.base; gg.fillRect(x, y, fw, h);
    gg.fillStyle = r.light; gg.fillRect(x, y, fw, Math.min(2 * q, h));
    gg.fillStyle = r.dark; gg.fillRect(x, y + h - 2 * q, fw, 2 * q);
    gg.fillStyle = '#0d0b1855'; for (let xx = 16 * q; xx < fw; xx += 16 * q) gg.fillRect(x + xx, y + 2 * q, q, h - 4 * q);
    if (fw > 2 * q && fw < w) { gg.fillStyle = '#ffffff'; gg.fillRect(x + fw - q, y, q, h); }
    if (label) { gg.font = pixelFont(Math.round(h * 0.75)); gg.fillStyle = '#0a0810'; fillText(gg, label, x + 6 + q, y + h * 0.78 + q, w - 12); gg.fillStyle = '#fff'; fillText(gg, label, x + 6, y + h * 0.78, w - 12); }
  }


  /** Dev measurement: boxes the dungeon HUD covers this frame (device px); read by dev-shot to report HUD area. */
  function drawHud(s: DungeonSnapshot, W: number, H: number, _bike: Readonly<BikeState>) {
    hudBoxes = []; (globalThis as { __dgHud?: unknown }).__dgHud = { boxes: hudBoxes, W, H };
    const gg = g!, p = s.player, u = (Math.max(1, Math.min(W, H) / dpr / 600) * 0.75 + 0.25) * dpr;
    const L = 14 * u, fs = Math.round(13 * u);
    gg.textAlign = 'left';
    // compact status panel (top-left): thin HP + XP bars, then Lv/floor, coins, potions and the Second Wind pip on one line.
    // `hu` scales from CSS pixels, so the iPad's large device scale doesn't double it (and it clears the boss bar).
    const hu = (Math.max(1, Math.min(W, H) / dpr / 600) * 0.75 + 0.25) * dpr, PW = 172 * hu;
    {
      const x = L, y = L, hpLow = p.hp < p.maxHp * 0.4;
      const perkRow = s.perks?.ranks.length ? 17 * hu : 0;
      pixelPanel(gg,x-3*hu,y-3*hu,PW+6*hu,38*hu+perkRow,'#746481','#15111fee',dpr); hudBox(x - 3 * hu, y - 3 * hu, PW + 6 * hu, 38 * hu + perkRow);
      if (perkRow && s.perks) drawPerkBadges(gg, s.perks, x, y + 34 * hu, PW, hu, s.t);
      pixelMeter(gg,x,y,PW,11*hu,p.hp/p.maxHp,hpLow?'#e96d75':'#68ba78',dpr);
      gg.fillStyle = '#fff'; gg.font = pixelFont(Math.round(9 * hu));
      fillTextShadow(gg, `${Math.min(Math.round(p.maxHp), Math.ceil(Math.max(0, p.hp)))} / ${Math.round(p.maxHp)}`, x + 4 * hu, y + 8.5 * hu);
      pixelMeter(gg,x,y+13*hu,PW,3*hu,p.xp/p.xpNext,'#b58ad9',dpr);
      const ly = y + 28 * hu; gg.font = pixelFont(Math.round(10 * hu));
      gg.fillStyle = '#fff'; const lvTxt = `Lv${p.level} F${s.floor}${s.run ? `/${s.run.floors}` : ''}`; fillTextShadow(gg, lvTxt, x, ly); const coinX = Math.max(x + 44 * hu, x + textW(gg, lvTxt) + 6 * hu);
      const cp = Math.max(0, 1 - (s.t - coinPulseT) / 0.25);
      if (cp > 0) { gg.save(); gg.font = pixelFont(Math.round(10 * hu * (1 + 0.35 * cp))); }
      gg.fillStyle = cp > 0 ? '#fff4b0' : '#ffd84a'; fillTextShadow(gg, `● ${p.coins}`, coinX, ly); const coinEnd = coinX + textW(gg, `● ${p.coins}`);
      if (cp > 0) gg.restore();
      const tx = coinX + 3 * hu, ty = ly - 3.5 * hu;
      for (let i = flyers.length - 1; i >= 0; i--) {
        const f = flyers[i], k = (s.t - f.t0) / 0.45;
        if (k >= 1 || k < 0) { flyers.splice(i, 1); if (k >= 1) coinPulseT = s.t; continue; }
        const e = k * k * (3 - 2 * k), fx2 = f.x + (tx - f.x) * e, fy2 = f.y + (ty - f.y) * e - Math.sin(k * Math.PI) * 40 * hu;
        const cf = artReady() ? charFrame('coin', Math.floor(s.t * 8 + i)) : null;
        if (cf) { const sc = Math.max(1, Math.round((1.4 - 0.6 * k) * hu)); gg.drawImage(cf, Math.round(fx2 - cf.width * sc / 2), Math.round(fy2 - cf.height * sc / 2), cf.width * sc, cf.height * sc); }
        else drawSprite('coin', fx2, fy2 + 3 * hu, (1.4 - 0.6 * k) * hu);
      }
      const potX = Math.max(x + 86 * hu, coinEnd + 9 * hu), potStep = Math.min(9 * hu, (x + PW - 32 * hu - potX) / Math.max(1, p.potionCap - 1));
      for (let k = 0; k < p.potionCap; k++) { gg.globalAlpha = k < p.potions ? 1 : 0.25; if (!drawItem32(gg, 'potion', potX + k * potStep, ly + 4 * hu, Math.max(1, Math.round(hu * 0.6)))) drawSprite('potion', potX + k * potStep, ly - 3.5 * hu, 1.1 * hu); }
      gg.globalAlpha = 1;
      // Second Wind: a small wing pip that fills while it recharges and glows when ready (no numbers)
      const sw = p.secondWind, sx = x + PW - 26 * hu, sy = ly - 8 * hu, w = 26 * hu, h = 9 * hu, ready = sw >= 1;
      gg.fillStyle = 'rgba(0,0,0,0.55)'; gg.fillRect(sx, sy, w, h);
      gg.fillStyle = ready ? '#ffe08a' : desaturate('#ffe08a', 0.7, 0.35); gg.fillRect(sx, sy, w * Math.min(1, sw), h);
      if (ready || p.secondWindFlash > 0) { gg.strokeStyle = `rgba(255,224,138,${ready ? 0.5 + 0.4 * Math.sin(s.t * 4) : p.secondWindFlash})`; gg.lineWidth = Math.max(1, hu); gg.strokeRect(sx - 1, sy - 1, w + 2, h + 2); }
      gg.fillStyle = ready ? '#2a1d00' : '#ddd'; gg.font = pixelFont(Math.round(7 * hu)); gg.textAlign = 'center'; fillText(gg, '2nd W', sx + w / 2, sy + h - 2 * hu); gg.textAlign = 'left';
    }
    // inventory row (bottom-left): the active stance card, chips for the other stances, then the gear sockets.
    // Actions and cooldowns live in the shell HUD; use its occupied shape to share the row.
    const LY = runLayout(W, H, insetCss * dpr, u, s.stance.list.length - 1,
      W > H && W / dpr > 700 && H / dpr > 500
        ? hudOcclusions?.map(r => ({ x: r.x * dpr, y: r.y * dpr, w: r.w * dpr, h: r.h * dpr })) : undefined);
    {
      const q = Math.max(1, Math.round(dpr * Math.max(1, u / dpr))), st = s.stance, wcol = RARITY_COLORS[s.weapon.rarity], R = LY.card;
      pixelPanel(gg, R.x, R.y, R.w, R.h, mixHex(st.color, '#3a3243', 0.35), '#171320f0', q); hudBox(R.x, R.y, R.w, R.h);
      // stance crest: its colour with the initial; swapping shows the pick's colour
      const pick = st.swapping ? s.stance.list.find((x) => x.id === st.swapping) : undefined, pickC = pick?.color ?? st.color;
      const bs = R.h - 4 * q, bx = R.x + 2 * q, by = R.y + 2 * q;
      pixelPanel(gg, bx, by, bs, bs, mixHex(pickC, '#000000', 0.25), pickC, q);
      const ls = Math.max(1, Math.floor((bs - 4 * q) / 10)), letter = (pick?.name ?? st.name)[0];
      displayText(gg, letter, bx + bs / 2, by + (bs - 10 * ls) / 2 + ls / 2, ls, mixHex(pickC, '#ffffff', 0.25), true);
      // weapon in a socket, as big as fits in whole pixels
      const sw = Math.round(bs * 1.45), sx = bx + bs + q;
      pixelSocket(gg, sx, by, sw, bs, q);
      iconFit(gg, weaponArt(s.weapon)?.c, sx + sw / 2, by + bs / 2, sw - 3 * q, bs - 3 * q);
      pixelGem(gg, sx + sw - 4 * q, by + 4 * q, wcol, q);
      // name (rarity colour) over Lv · element
      const tx = sx + sw + 3 * q, room = R.x + R.w - 3 * q - tx;
      const f1 = Math.round(11 * u), sc1 = fontScale(f1), twoLines = R.h - 4 * q >= 16 * sc1;
      gg.textAlign = 'left'; gg.font = pixelFont(f1);
      const name = fitPixelText(s.weapon.name, sc1, room), tail = `Lv${s.weapon.level}${s.weapon.plus ? '+' + s.weapon.plus : ''} ${s.weapon.element}${st.styleOn ? ' ✓' : ''}`;
      if (twoLines) {
        const top = R.y + (R.h - 16 * sc1) / 2 + 7 * sc1;
        gg.fillStyle = wcol; fillTextShadow(gg, name, tx, top);
        gg.fillStyle = '#c8bfcc'; fillTextShadow(gg, tail, tx, top + 9 * sc1, room);
        gg.fillStyle = ELEMENT_COLORS[s.weapon.element] ?? '#fff';
        gg.fillRect(Math.round(tx + textW(gg, tail.split(' ')[0] + ' ') - 2 * sc1), Math.round(top + 9 * sc1 - 4 * sc1), sc1, sc1);
      } else {
        gg.fillStyle = wcol; fillTextShadow(gg, name, tx, R.y + R.h / 2 + 3.5 * sc1);
      }
      // other stances: a socket with their weapon and level; the D-pad pick lights up, the AI suggestion pulses
      const others = s.stance.list.filter((x) => x.id !== st.id), C = LY.stance, n = Math.max(1, others.length);
      const cw = (C.w - (n - 1) * 3 * u) / n;
      others.forEach((o, k) => {
        const x = C.x + k * (cw + 3 * u), picked = st.swapping === o.id, sug = st.suggest === o.id;
        hudBox(x, C.y, cw, C.h);
        gg.globalAlpha = sug && !picked ? 0.7 + 0.3 * Math.sin(s.t * 5) : 1;
        pixelPanel(gg, x, C.y, cw, C.h, picked ? o.color : mixHex(o.color, '#3a3243', 0.45), picked ? mixHex(o.color, '#171320', 0.55) : '#171320f0', q);
        gg.fillStyle = o.color; gg.fillRect(Math.round(x + 2 * q), Math.round(C.y + 2 * q), Math.round(cw - 4 * q), q);   // stance stripe
        if (o.base) iconFit(gg, weaponArt({ base: o.base as Weapon['base'], element: o.element, rarity: o.rarity as Weapon['rarity'], variant: o.variant, unique: o.unique, plus: o.plus })?.c,
          x + cw / 2, C.y + C.h / 2 + q / 2, cw - 6 * q, C.h - 7 * q);
        gg.fillStyle = '#fff'; gg.font = pixelFont(Math.round(9 * u)); gg.textAlign = 'right';
        fillTextShadow(gg, o.level ? String(o.level) : '–', x + cw - 3 * q, C.y + C.h - 3 * q); gg.textAlign = 'left'; gg.globalAlpha = 1;
      });
      // equipped gear: the item's own art in a socket, a rarity gem, and its level
      const G = LY.gear; let gx = G.x;
      for (const sl of SLOTS) {
        const it = s.gear[sl], gw = G.h;
        hudBox(gx, G.y, gw, G.h);
        pixelPanel(gg, gx, G.y, gw, G.h, it ? mixHex(RARITY_COLORS[it.rarity], '#3a3243', 0.4) : '#3a3243', '#171320e0', q);
        if (it) {
          const rc = RARITY_COLORS[it.rarity];
          iconFit(gg, charFrame('item.' + sl, 0), gx + gw / 2, G.y + G.h / 2, gw - 6 * q, G.h - 6 * q);
          pixelGem(gg, gx + 5 * q, G.y + 5 * q, rc, q);
          gg.fillStyle = '#fff'; gg.font = pixelFont(Math.round(8.5 * u)); gg.textAlign = 'right';
          fillTextShadow(gg, String(it.level), gx + gw - 3 * q, G.y + G.h - 3 * q); gg.textAlign = 'left';
        } else {   // empty socket shows a faint silhouette of what goes there
          gg.globalAlpha = 0.18; iconFit(gg, charFrame('item.' + sl, 0), gx + gw / 2, G.y + G.h / 2, gw - 6 * q, G.h - 6 * q, true); gg.globalAlpha = 1;
        }
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
      const sig = Math.max(2, Math.round(2 * u)), label = `${c.name}: ${c.desc} · ${Math.ceil(c.left)}s`;
      if (artReady()) drawSigil(gg, c.kind, bx - 14 * sig - 4 * u, by - 6 * u - 10 * sig, sig);
      fillText(gg, artReady() ? label : `☠ ${label}`, W / 2, by - 6 * u, bw + 60 * u); gg.textAlign = 'left';
    }
    // big banners (uniques, curses)
    let bannerRow = 0; // stack banners that overlap in time (e.g. EXPLORE straight into AMBUSH), newest lowest
    for (const f of s.fx) if (f.kind === 'banner') {
      const k2 = (s.t - f.t0) / f.life; if (k2 < 0 || k2 > 1) continue;
      const row = bannerRow++;
      gg.globalAlpha = Math.min(1, (1 - k2) * 3); gg.textAlign = 'center';
      gg.font = pixelFont(Math.round(30 * u)); gg.lineWidth = 6; gg.strokeStyle = '#000';
      const by = LY.playH * 0.3 + row * 40 * u - Math.min(1, k2 * 6) * 10 * u;
      { const q = Math.max(1, Math.min(Math.round(4 * dpr), Math.floor((W - 40 * hu) / displayWidth(f.text!, 1)))); displayText(gg, f.text!, W / 2, by - 8 * q, q, f.color, true); }
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
      gg.lineWidth = 3; gg.strokeStyle = '#000'; const ty0 = L + (52 + (s.perks?.ranks.length ? 17 : 0) + i * 15) * hu; strokeText(gg, tt.text, L, ty0, W - 2 * L); gg.fillStyle = tt.color; fillText(gg, tt.text, L, ty0, W - 2 * L);
    });
    gg.globalAlpha = 1;

    // minimap with fog (top-right)
    // crisp: one whole number of device pixels per tile, no resampling
    const w = s.world, mm = Math.max(1, Math.floor((118 * u) / Math.max(1, w.w)));
    if (!mini || mini.width !== w.w * mm || mini.height !== w.h * mm) { mini = document.createElement('canvas'); mini.width = w.w * mm; mini.height = w.h * mm; }
    const m = mini.getContext('2d')!;
    m.clearRect(0, 0, mini.width, mini.height);
    for (let i = 0; i < w.tiles.length; i++) if (w.tiles[i] === TILE.DOOR && w.rooms[w.doorRoom[i]]?.seen) { m.fillStyle = '#9a8458'; m.fillRect((i % w.w) * mm, Math.floor(i / w.w) * mm, mm, mm); }
    for (const r of w.rooms) {
      if (!r.seen) continue;
      const here = r.id === s.room, fill = here ? '#6e6a84' : r.cleared ? '#3c5844' : r.boss ? '#5a2a46' : '#46445a', edge = here ? '#d8d0f0' : r.cleared ? '#6a9a72' : r.boss ? '#c0507a' : '#7a7890';
      m.fillStyle = edge; m.fillRect(r.x0 * mm, r.y0 * mm, r.w * mm, r.h * mm);
      m.fillStyle = fill; m.fillRect(r.x0 * mm + 1, r.y0 * mm + 1, r.w * mm - 2, r.h * mm - 2);
      if (r.chest && !r.chest.opened) { m.fillStyle = '#2a1d00'; m.fillRect((r.chest.x - 1) * mm - 1, (r.chest.y - 1) * mm - 1, 2 * mm + 2, 2 * mm + 2); m.fillStyle = '#ffd84a'; m.fillRect((r.chest.x - 1) * mm, (r.chest.y - 1) * mm, 2 * mm, 2 * mm); }
    }
    const br = w.rooms.find((r) => r.boss);
    if (br?.seen) { const sx = Math.floor(w.stairs.x) * mm, sy = Math.floor(w.stairs.y) * mm; m.fillStyle = '#0a0810'; m.fillRect(sx - mm, sy - mm, 3 * mm, 3 * mm); m.fillStyle = s.stairsOpen ? '#ffd84a' : '#a07a2a'; for (let k = 0; k < 3; k++) m.fillRect(sx - mm + k * mm, sy - mm + k * mm, (3 - k) * mm, mm); }
    const mw = mini.width, mh = mini.height, mx0 = Math.round(W - mw - L), my0 = Math.round(L), mk = mm;
    pixelPanel(gg,mx0-4*dpr,my0-4*dpr,mw+8*dpr,mh+8*dpr,'#655572','#120e18dd',dpr); hudBox(mx0 - 4 * dpr, my0 - 4 * dpr, mw + 8 * dpr, mh + 8 * dpr);
    gg.imageSmoothingEnabled = false; gg.drawImage(mini, mx0, my0);
    for (const e of s.enemies) if (e.kind === 'boss' || w.rooms[s.room] && e.x >= w.rooms[s.room].x0 && e.x <= w.rooms[s.room].x0 + w.rooms[s.room].w && e.y >= w.rooms[s.room].y0 && e.y <= w.rooms[s.room].y0 + w.rooms[s.room].h) {
      const sz = Math.max(2, Math.round((e.kind === 'boss' ? 3 : 2) * dpr)); gg.fillStyle = ENEMY_TINT[e.kind] ?? '#e55'; gg.fillRect(Math.round(mx0 + e.x * mk - sz / 2), Math.round(my0 + e.y * mk - sz / 2), sz, sz);
    }
    { // the hero: an outlined diamond that pulses
      const hx0 = Math.round(mx0 + p.x * mk), hy0 = Math.round(my0 + p.y * mk), R = Math.round((2.5 + (Math.sin(s.t * 6) > 0 ? 0.5 : 0)) * dpr);
      for (const [rr, c] of [[R + dpr, '#0a0810'], [R, '#ffffff'], [Math.max(1, R - dpr), color]] as const) { gg.fillStyle = c; gg.beginPath(); gg.moveTo(hx0, hy0 - rr); gg.lineTo(hx0 + rr, hy0); gg.lineTo(hx0, hy0 + rr); gg.lineTo(hx0 - rr, hy0); gg.fill(); }
    }

    if (s.boss && s.boss.active) {
      const BR=bossHudLayout(W,H,insetCss*dpr,hu),bw=BR.w,bx=BR.x,by=BR.y;
      const B = s.boss, exp = B.cycle === 'exposed', wind = B.cycle === 'windup';
      hudBox(bx,by,bw,BR.h);
      drawBossBar(gg, bx, by, bw, hu, B, s.t, exp, B.tide > 0);
      gg.textAlign = 'center'; gg.font = pixelFont(Math.round(11 * u));
      gg.fillStyle = exp ? '#ffe08a' : wind ? '#ff7a2a' : B.tide > 0 ? '#7dff5a' : '#ddd';
      fillText(gg, exp ? 'EXPOSED: x2 damage. Sprint and Strike now!' : wind ? 'Big attack coming: Ward to parry' : B.cycle === 'stagger' ? 'Staggered!' : B.tide > 0 ? `Turning Tide: boss takes +${Math.round(B.tide * 100)}%` : 'Watch for the big attack',bx+bw/2,by+43*hu,bw);
      gg.textAlign = 'left';
    } else if (s.stairsOpen) {
      gg.fillStyle = '#ffd84a'; gg.textAlign = 'center'; gg.font = pixelFont(fs);
      fillText(gg, 'Stairs open — descend!', W / 2, L + 14 * u); gg.textAlign = 'left';
    }

    // non-blocking Loot Choice card (anchored cleanly under the top-right minimap, clamped above dock)
    lootHits = [];
    if (s.lootOffer && !s.perks?.offer) {
      const lo = s.lootOffer, col = RARITY_COLORS[lo.rarity], q = Math.max(1, Math.round(dpr));
      const cw = Math.min(Math.round(236 * hu), Math.round(W - 2 * L));
      const ch = Math.round(88 * hu);
      const cx0 = Math.round(W - cw - L);
      const cy0 = Math.round(Math.min(LY.playH - ch - 8 * hu, my0 + mh + 12 * dpr));
      pixelPanel(gg, cx0, cy0, cw, ch, col, '#14101ef2', q);
      hudBox(cx0, cy0, cw, ch);
      // icon socket
      const isz = Math.round(30 * hu), ix = cx0 + 6 * hu, iy = cy0 + 6 * hu;
      pixelSocket(gg, ix, iy, isz, isz, q);
      if (lo.kind === 'weapon' && lo.base) {
        iconFit(gg, weaponArt({ base: lo.base, element: lo.element ?? 'normal', rarity: lo.rarity, variant: lo.variant, unique: lo.unique, plus: lo.plus })?.c, ix + isz / 2, iy + isz / 2, isz - 4 * q, isz - 4 * q);
      } else if (lo.slot) {
        iconFit(gg, charFrame('item.' + lo.slot, 0), ix + isz / 2, iy + isz / 2, isz - 4 * q, isz - 4 * q);
      }
      pixelGem(gg, ix + isz - 4 * q, iy + 4 * q, col, q);
      // title + subtitle
      const tx = ix + isz + 6 * hu, tw = cx0 + cw - tx - 6 * hu;
      gg.textAlign = 'left';
      gg.font = pixelFont(Math.round(10 * hu));
      gg.fillStyle = col; fillTextShadow(gg, fitPixelText(lo.name, fontScale(Math.round(10 * hu)), tw), tx, iy + 10 * hu);
      gg.font = pixelFont(Math.round(8.5 * hu));
      gg.fillStyle = '#a89eb6';
      const sub = lo.kind === 'weapon' ? `${lo.stanceName ?? ''} Lv${lo.level} vs ${lo.currentName}` : `${lo.slot ?? ''} Lv${lo.level} vs ${lo.currentName}`;
      fillTextShadow(gg, fitPixelText(sub, fontScale(Math.round(8.5 * hu)), tw), tx, iy + 21 * hu);
      // stat delta pills
      let dx = cx0 + 6 * hu, dy = iy + isz + 11 * hu;
      gg.font = pixelFont(Math.round(8.5 * hu));
      for (const dt of lo.deltas) {
        const dw = textW(gg, dt.text) + 8 * hu;
        if (dx + dw > cx0 + cw - 4 * hu) break;
        const dc = dt.tone === 'good' ? '#7dff9a' : dt.tone === 'bad' ? '#ff7a8a' : '#8fd8ff';
        gg.fillStyle = '#221c30'; gg.fillRect(Math.round(dx), Math.round(dy - 9 * hu), Math.round(dw), Math.round(12 * hu));
        gg.fillStyle = dc; fillTextShadow(gg, dt.text, dx + 4 * hu, dy);
        dx += dw + 4 * hu;
      }
      // countdown bar for automatic default
      const barY = cy0 + ch - 27 * hu, barW = cw - 12 * hu;
      const defEquip = lo.defaultChoice === 'equip';
      pixelMeter(gg, cx0 + 6 * hu, barY, barW, 4 * hu, Math.max(0, lo.leftS / Math.max(0.1, lo.totalS)), defEquip ? '#7dff9a' : '#ffd84a', dpr);
      // two tappable action buttons: Default (auto) and [Y] Alternate
      const btnY = barY + 7 * hu, btnH = 16 * hu, half = Math.floor((barW - 6 * hu) / 2);
      const leftChoice: 'equip' | 'drop' = lo.defaultChoice;
      const rightChoice: 'equip' | 'drop' = defEquip ? 'drop' : 'equip';
      const leftLabel = defEquip ? `AUTO EQUIP ${Math.ceil(lo.leftS)}s` : `AUTO SELL +${lo.sellCoins}● ${Math.ceil(lo.leftS)}s`;
      const rightLabel = defEquip ? `[Y] DROP +${lo.sellCoins}●` : `[Y] EQUIP`;
      pixelPanel(gg, cx0 + 6 * hu, btnY, half, btnH, defEquip ? '#7dff9a' : '#ffd84a', '#1f2922ee', q);
      pixelPanel(gg, cx0 + 6 * hu + half + 6 * hu, btnY, half, btnH, '#8fd8ff', '#1e2036ee', q);
      gg.textAlign = 'center'; gg.font = pixelFont(Math.round(8 * hu));
      gg.fillStyle = defEquip ? '#b8ffc8' : '#ffe89a'; fillTextShadow(gg, leftLabel, cx0 + 6 * hu + half / 2, btnY + 11 * hu, half - 4 * hu);
      gg.fillStyle = '#bfe8ff'; fillTextShadow(gg, rightLabel, cx0 + 6 * hu + half + 6 * hu + half / 2, btnY + 11 * hu, half - 4 * hu);
      gg.textAlign = 'left';
      lootHits.push(
        { x: cx0 + 6 * hu, y: btnY, w: half, h: btnH, choice: leftChoice },
        { x: cx0 + 6 * hu + half + 6 * hu, y: btnY, w: half, h: btnH, choice: rightChoice },
      );
    }
  }
}
