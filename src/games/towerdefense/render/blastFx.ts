// Shells and blasts drawn as pixel art (sprites from blastTex.ts, nearest-neighbour scaled on a texel grid):
// the Fireball's rolling molten ball and its flame burst, the Mortar's iron shell, its detonation flash, thrown
// gravel and hot shrapnel that arc, bounce and settle, dust puffs and a crater that fades from the road.
// Debris lives in screen space (like the renderer's particles); craters keep field coordinates.
import { heatColor } from './fireTex';
import {
  BALL_FRAMES, BALL_S, BURST_FRAMES, BURST_S, CRATER_S, DUST_S, FLASH_FRAMES, FLASH_S, ballFrame, burstFrame, chunkSprite,
  craterSprite, dustSprite, flashFrame, shellSprite, type Sprite,
} from './blastTex';

const TAU = Math.PI * 2;
/** The road is seen slightly from above: ground footprints squash vertically (matches burnFx). */
const SQUASH = 0.82;
/** Texel size in field units: the pixel grid every blast sprite and debris chunk sits on. */
export const TEXEL = 0.3;
/** Debris/dust/crater caps, so a mortar battery can't flood a frame. */
export const MAX_CHUNKS = 260, MAX_PUFFS = 60, MAX_CRATERS = 14, MAX_EMBERS = 520;
/** Seconds a crater stays on the road (the last third fades). */
export const CRATER_S_LIFE = 6;
/** Seconds per frame for the Mortar flash and the Fireball burst. */
export const FLASH_DT = 0.045, BURST_DT = 0.06;

/** Device-pixel-aligned texel size in CSS px, at least one device pixel. */
export function texelPx(k: number, dpr: number): number { return Math.max(1, Math.round(TEXEL * k * dpr)) / dpr; }
/** Draw scale for a sprite `S` texels wide wanted `want` px across: a whole multiple of the texel, so every blast shares one pixel grid. */
export const fitTexel = (want: number, S: number, tx: number) => tx * Math.max(1, Math.round(want / (S * tx)));
/** Snap a coordinate onto the texel grid so debris moves in whole pixels. */
export const snap = (v: number, tx: number) => Math.round(v / tx) * tx;

export interface Chunk { x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; life: number; spr: number; metal: boolean; hot: number; bounces: number; px: number; py: number }
/**
 * One step of a thrown chunk: ballistic flight in height `z` over the ground point (x, y), a damped bounce or two,
 * then it lies still. Pure (mutates `c`), so the arc is testable.
 */
export function stepChunk(c: Chunk, dt: number, gravity: number) {
  c.age += dt; c.px = c.x; c.py = c.y - c.z;
  c.hot = Math.max(0, c.hot - dt / 0.35);
  if (c.bounces >= 3) return;
  c.x += c.vx * dt; c.y += c.vy * dt; c.vz -= gravity * dt; c.z += c.vz * dt;
  if (c.z <= 0) {
    c.z = 0; c.bounces++;
    if (c.bounces >= 3 || Math.abs(c.vz) < gravity * 0.06) { c.bounces = 3; c.vx = c.vy = c.vz = 0; return; }
    c.vz = -c.vz * 0.32; c.vx *= 0.45; c.vy *= 0.45;
  }
}

interface Puff { x: number; y: number; vx: number; vy: number; age: number; life: number; spr: number; size: number }
interface Seq { x: number; y: number; age: number; size: number }
interface Crater { x: number; y: number; bornT: number; r: number; spr: number }
interface Ember { x: number; y: number; vx: number; vy: number; age: number; life: number; size: number; heat: number; /** Size multiplier reached at the end of its life (a spray's flames billow as they travel). */ grow?: number; /** Upward drift, px/s² (flames rise). */ rise?: number }

interface Sprites { ball: HTMLCanvasElement[]; burst: HTMLCanvasElement[]; flash: HTMLCanvasElement[]; shell: HTMLCanvasElement; dust: HTMLCanvasElement[]; gravel: HTMLCanvasElement[]; metal: HTMLCanvasElement[]; crater: HTMLCanvasElement[] }
let sprites: Sprites | null = null;
function toCanvas(s: Sprite): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = s.w; c.height = s.h;
  const img = new ImageData(s.w, s.h); img.data.set(s.data); c.getContext('2d')!.putImageData(img, 0, 0);
  return c;
}
function bake(): Sprites {
  const n = (k: number, f: (i: number) => Sprite) => Array.from({ length: k }, (_, i) => toCanvas(f(i)));
  return {
    ball: n(BALL_FRAMES, (i) => ballFrame(i / BALL_FRAMES, 4)), burst: n(BURST_FRAMES, (i) => burstFrame(i)),
    flash: n(FLASH_FRAMES, (i) => flashFrame(i)), shell: toCanvas(shellSprite()), dust: n(4, (i) => dustSprite(i * 7 + 1)),
    gravel: n(14, (i) => chunkSprite(i + 1, 'gravel')), metal: n(8, (i) => chunkSprite(i + 101, 'shrapnel')), crater: n(3, (i) => craterSprite(i * 5 + 2)),
  };
}
/** Bakes the sprites (a few ms) during the level's loading hold; drawing bakes on demand if this never ran. */
export function prepareBlastSprites() { sprites ??= bake(); }
const sp = () => (sprites ??= bake());

/** Cached CSS colours for the fire ramp's hard steps. */
const HEAT_CSS = Array.from({ length: 8 }, (_, i) => { const [r, g, b] = heatColor(i / 7); return `rgb(${r | 0},${g | 0},${b | 0})`; });
const heatCss = (h: number) => HEAT_CSS[Math.max(0, Math.min(7, Math.round(h * 7)))];
const SOOT = ['#3a2c26', '#2a201c'];

export class Blasts {
  private chunks: Chunk[] = [];
  private puffs: Puff[] = [];
  private flashes: Seq[] = [];
  private bursts: Seq[] = [];
  private craters: Crater[] = [];
  private embers: Ember[] = [];

  /** A Mortar shell lands at screen (x, y): flash, a crater, gravel and shrapnel thrown out, dust rolling up. */
  mortar(x: number, y: number, fieldX: number, fieldY: number, r: number, k: number, t: number) {
    const R = r * k;
    this.flashes.push({ x, y, age: 0, size: R * 0.65 });
    this.craters.push({ x: fieldX, y: fieldY, bornT: t, r: r * 0.62, spr: Math.floor(Math.random() * 3) });
    if (this.craters.length > MAX_CRATERS) this.craters.shift();
    for (let i = 0; i < 34 && this.chunks.length < MAX_CHUNKS; i++) {
      const metal = i < 9, a = Math.random() * TAU, v = R * (metal ? 1.8 + Math.random() * 1.6 : 0.7 + Math.random() * 1.3);
      const set = metal ? sp().metal.length : sp().gravel.length, d = R * 0.15 * Math.random();
      this.chunks.push({
        x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * SQUASH, z: k * 0.5, vx: Math.cos(a) * v, vy: Math.sin(a) * v * SQUASH,
        vz: k * (metal ? 10 + Math.random() * 16 : 16 + Math.random() * 30), age: 0, life: metal ? 0.9 + Math.random() * 0.6 : 1.6 + Math.random() * 1.2,
        spr: Math.floor(Math.random() * set), metal, hot: metal ? 1 : 0, bounces: 0, px: x, py: y,
      });
    }
    for (let i = 0; i < 8 && this.puffs.length < MAX_PUFFS; i++) {
      const a = Math.random() * TAU, d = R * 0.35 * Math.random();
      this.puffs.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * SQUASH, vx: Math.cos(a) * R * 0.35, vy: Math.sin(a) * R * 0.2 - k * (5 + Math.random() * 4), age: -i * 0.03, life: 0.6 + Math.random() * 0.35, spr: i % 4, size: R * (0.45 + Math.random() * 0.35) });
    }
  }
  /** A Fireball (or a red alien's ignition) bursts at screen (x, y): a pixel flame burst over a ring of sparks. */
  fireball(x: number, y: number, r: number, k: number) {
    this.bursts.push({ x, y: y - r * k * 0.2, age: 0, size: r * k * 2.1 });
  }

  step(dt: number, k: number) {
    const gravity = 90 * k;
    for (const c of this.chunks) stepChunk(c, dt, gravity);
    this.chunks = this.chunks.filter((c) => c.age < c.life);
    for (const p of this.puffs) { p.age += dt; if (p.age > 0) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - 2.5 * dt; p.vy *= 1 - 1.5 * dt; } }
    this.puffs = this.puffs.filter((p) => p.age < p.life);
    for (const f of this.flashes) f.age += dt;
    this.flashes = this.flashes.filter((f) => f.age < FLASH_FRAMES * FLASH_DT);
    for (const b of this.bursts) b.age += dt;
    this.bursts = this.bursts.filter((b) => b.age < BURST_FRAMES * BURST_DT);
    for (const e of this.embers) { e.age += dt; e.x += e.vx * dt; e.y += e.vy * dt; e.vy -= (e.rise ?? k * 6) * dt; e.vx *= 1 - (e.grow ? 2.2 : 0) * dt; e.vy *= 1 - (e.grow ? 2.2 : 0) * dt; }
    this.embers = this.embers.filter((e) => e.age < e.life);
  }

  /** Ground layer, under the actors: craters, fading out after a few seconds. */
  drawGround(g: CanvasRenderingContext2D, P: (x: number, y: number) => { x: number; y: number }, k: number, t: number) {
    if (!this.craters.length) return;
    this.craters = this.craters.filter((c) => t - c.bornT < CRATER_S_LIFE && t >= c.bornT);
    const s = sp(); g.save(); g.imageSmoothingEnabled = false;
    for (const c of this.craters) {
      const age = t - c.bornT, a = Math.min(1, age / 0.08) * Math.min(1, (CRATER_S_LIFE - age) / (CRATER_S_LIFE / 3));
      const { x, y } = P(c.x, c.y), w = c.r * 2 * k, tx = w / CRATER_S;
      g.globalAlpha = a * 0.92; g.drawImage(s.crater[c.spr], snap(x - w / 2, tx), snap(y - w * SQUASH / 2, tx), w, w * SQUASH);
    }
    g.restore();
  }

  /** Over the actors: dust, debris, flashes and bursts. `dpr` aligns the texel grid to device pixels. */
  draw(g: CanvasRenderingContext2D, k: number, dpr: number) {
    const s = sp(), tx = texelPx(k, dpr);
    g.save(); g.imageSmoothingEnabled = false;
    for (const p of this.puffs) {
      if (p.age <= 0) continue;
      const f = p.age / p.life, size = p.size * (0.7 + 0.7 * f), q = fitTexel(size, DUST_S, tx);
      g.globalAlpha = 0.95 * (1 - f * f); const w = DUST_S * q;
      g.drawImage(s.dust[p.spr], snap(p.x - w / 2, q), snap(p.y - w / 2, q), w, w);
    }
    for (const c of this.chunks) {
      const img = (c.metal ? s.metal : s.gravel)[c.spr], fade = Math.min(1, (c.life - c.age) / 0.35);
      const x = snap(c.x, tx), y = snap(c.y - c.z, tx);
      if (c.z > 0.5) { g.globalAlpha = 0.3 * fade; g.fillStyle = '#000'; g.fillRect(x, snap(c.y, tx), img.width * tx, tx); }
      g.globalAlpha = fade;
      if (c.metal && c.hot > 0.05 && c.bounces < 3) { // hot shrapnel trails a glowing pixel streak
        g.fillStyle = heatCss(0.45 + 0.5 * c.hot); g.fillRect(snap(c.px, tx), snap(c.py, tx), tx, tx);
      }
      g.drawImage(img, x, y, img.width * tx, img.height * tx);
      if (c.hot > 0.05) { g.globalAlpha = fade * c.hot; g.fillStyle = heatCss(0.55 + 0.45 * c.hot); g.fillRect(x, y, img.width * tx, img.height * tx); }
    }
    for (const f of this.flashes) {
      const i = Math.min(FLASH_FRAMES - 1, Math.floor(f.age / FLASH_DT)), q = fitTexel(f.size * 2, FLASH_S, tx), w = FLASH_S * q;
      g.globalAlpha = 1; g.drawImage(s.flash[i], snap(f.x - w / 2, q), snap(f.y - w / 2, q), w, w);
    }
    for (const b of this.bursts) {
      const i = Math.min(BURST_FRAMES - 1, Math.floor(b.age / BURST_DT)), q = fitTexel(b.size, BURST_S, tx), w = BURST_S * q;
      g.globalAlpha = 1; g.drawImage(s.burst[i], snap(b.x - w / 2, q), snap(b.y - w / 2, q), w, w);
    }
    for (const e of this.embers) {
      const f = e.age / e.life, h = e.heat * (1 - f), q = Math.max(tx, snap(e.size * (e.grow ? 1 + (e.grow - 1) * f : 1 - 0.5 * f), tx));
      g.globalAlpha = 1; g.fillStyle = h > 0.22 ? heatCss(h) : SOOT[f > 0.85 ? 1 : 0];
      if (h <= 0.22 && f > 0.92) continue;
      g.fillRect(snap(e.x, tx), snap(e.y, tx), q, q);
    }
    g.restore();
  }

  /**
   * A Fireball in flight at screen (x, y) `lift` above its ground point, heading (dx, dy): the rolling molten ball,
   * a pixel flame trail shed behind it, a stepped shadow on the road.
   */
  drawFireball(g: CanvasRenderingContext2D, x: number, y: number, lift: number, dx: number, dy: number, k: number, dpr: number, t: number, dt: number) {
    const s = sp(), tx = texelPx(k, dpr), q = fitTexel(3.4 * k, BALL_S, tx), w = BALL_S * q;
    const gx = snap(x, tx), gy = snap(y, tx);
    g.save(); g.imageSmoothingEnabled = false;
    g.fillStyle = 'rgba(0,0,0,0.32)'; // stepped pixel shadow
    g.fillRect(gx - 3 * tx, gy - tx, 6 * tx, 2 * tx); g.fillRect(gx - 2 * tx, gy - 2 * tx, 4 * tx, 4 * tx);
    const by = y - lift, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
    // Shed flame pixels behind the ball; rates are per second so frame rate doesn't change the trail.
    for (let n = Math.round(60 * dt + Math.random() * 0.5); n > 0; n--) {
      if (this.embers.length > MAX_EMBERS) break;
      const sd = (Math.random() - 0.5) * w * 0.6;
      this.embers.push({ x: x - ux * w * 0.35 - uy * sd, y: by - uy * w * 0.35 + ux * sd, vx: -ux * k * (6 + Math.random() * 8) + (Math.random() - 0.5) * k * 3, vy: -uy * k * (6 + Math.random() * 8) - k * 2, age: 0, life: 0.25 + Math.random() * 0.3, size: q * (1 + Math.floor(Math.random() * 3)), heat: 0.75 + Math.random() * 0.25 });
    }
    g.drawImage(s.ball[Math.floor(t * 16) % BALL_FRAMES], snap(x - w / 2, q), snap(by - w / 2, q), w, w);
    g.restore();
  }

  /** A Mortar shell in flight: the pixel iron ball, a stepped shadow, and fuse sparks spitting behind it. */
  drawShell(g: CanvasRenderingContext2D, x: number, y: number, lift: number, scale: number, k: number, dpr: number, dt: number) {
    const s = sp(), tx = texelPx(k, dpr), q = fitTexel(1.9 * k * scale, s.shell.width, tx), w = s.shell.width * q;
    g.save(); g.imageSmoothingEnabled = false;
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(snap(x, tx) - 2 * tx, snap(y, tx) - tx, 4 * tx, 2 * tx);
    if (Math.random() < 30 * dt && this.embers.length < MAX_EMBERS) this.embers.push({ x: x + (Math.random() - 0.5) * w * 0.4, y: y - lift - w * 0.4, vx: (Math.random() - 0.5) * k * 4, vy: -k * 3, age: 0, life: 0.25, size: tx, heat: 0.9 });
    g.drawImage(s.shell, snap(x - w / 2, q), snap(y - lift - w / 2, q), w, w);
    g.restore();
  }

  /**
   * The Flamethrower's duckbill burner at screen (x, y), aimed `a` (0 = up the screen), `w` px across: idle, flame licks
   * curl off the mouth, more and hotter every level (L1 a banked ember, L5 white-hot); firing, it sprays a fan of
   * pixel flames `range` px long across `half` radians either side.
   */
  burner(x: number, y: number, a: number, w: number, level: number, k: number, dpr: number, dt: number, fire?: { range: number; half: number }) {
    const tx = texelPx(k, dpr), L = Math.max(1, Math.min(5, level)), ax = Math.sin(a), ay = -Math.cos(a);
    const idle = [5, 9, 14, 20, 28][L - 1], heat = [0.55, 0.64, 0.74, 0.86, 1][L - 1];
    for (let n = idle * dt + Math.random(); n >= 1 && this.embers.length < MAX_EMBERS; n--) {
      const u = (Math.random() - 0.5) * w * 0.8, v = k * (1.5 + Math.random() * 2.5) * (0.8 + 0.1 * L);
      this.embers.push({ x: x + ay * -u, y: y + ax * u, vx: ax * v, vy: ay * v, age: 0, life: 0.22 + Math.random() * 0.12 * L, size: tx * (1 + Math.floor(Math.random() * (L >= 4 ? 3 : 2))), heat: heat * (0.85 + Math.random() * 0.15), rise: k * 14 });
    }
    if (!fire) return;
    for (let n = (110 + 30 * L) * dt + Math.random(); n >= 1 && this.embers.length < MAX_EMBERS; n--) {
      const sa = a + (Math.random() - 0.5) * 2 * fire.half * 0.85, life = 0.32 + Math.random() * 0.14, v = fire.range / life * (1.1 + Math.random() * 0.5);
      const u = (Math.random() - 0.5) * w * 0.7;
      this.embers.push({ x: x + ay * -u, y: y + ax * u, vx: Math.sin(sa) * v, vy: -Math.cos(sa) * v, age: 0, life, size: tx * (1 + Math.floor(Math.random() * 2)), heat: Math.min(1, heat + 0.12), grow: 1.6 + Math.random() * 0.9, rise: k * 10 });
    }
  }

  get busy() { return this.chunks.length + this.puffs.length + this.flashes.length + this.bursts.length + this.embers.length; }
  clear() { this.chunks = []; this.puffs = []; this.flashes = []; this.bursts = []; this.craters = []; this.embers = []; }
}
