// Shells and blasts as painted sprites (blastTex.ts), at the tower and alien art's pixel density: the Fireball's
// rolling molten ball and its flame burst, the Mortar's iron shell, its detonation flash, thrown gravel and hot
// shrapnel that arc, bounce and settle, dust puffs, a crater that fades from the road, and the flame puffs of trails
// and the Flamethrower's jet. Debris lives in screen space (like the renderer's particles); craters keep field
// coordinates. Sizes are in field units times `k` (px per unit).
import { heatColor } from './fireTex';
import {
  BALL_FRAMES, BURST_FRAMES, FLASH_FRAMES, JET_FRAMES, JET_H, JET_W, PUFF_HEATS, ballFrame, burstFrame, chunkSprite, jetFrame,
  craterSprite, dustSprite, flashFrame, puffSprite, shellSprite, type Sprite,
} from './blastTex';

const TAU = Math.PI * 2;
/** The road is seen slightly from above: ground footprints squash vertically (matches burnFx). */
const SQUASH = 0.82;
/** Field units per debris-sprite pixel: a 6–14 px stone is about half to one field unit across. */
export const CHUNK_UNIT = 0.075;
/** Flame-puff size unit (field units): trail and spray puffs are 1–3 of these. */
export const PUFF_UNIT = 0.32;
/** Debris/dust/crater caps, so a mortar battery can't flood a frame. */
export const MAX_CHUNKS = 260, MAX_PUFFS = 60, MAX_CRATERS = 14, MAX_EMBERS = 520;
/** Seconds a crater stays on the road (the last third fades). */
export const CRATER_S_LIFE = 6;
/** Seconds per frame for the Mortar flash and the Fireball burst. */
export const FLASH_DT = 0.045, BURST_DT = 0.06;
/** Which baked flame puff to draw for a heat in [0, 1] (0 = soot). */
export const puffIndex = (h: number) => Math.max(0, Math.min(PUFF_HEATS - 1, Math.round(h * (PUFF_HEATS - 1))));

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
interface Jet { x: number; y: number; a: number; len: number; wide: number; reach: number; alpha: number; glow: number; frame: number }
interface Ember { x: number; y: number; vx: number; vy: number; age: number; life: number; size: number; heat: number; /** Size multiplier reached at the end of its life (a spray's flames billow as they travel). */ grow?: number; /** Upward drift, px/s² (flames rise). */ rise?: number }

interface Sprites { ball: HTMLCanvasElement[]; burst: HTMLCanvasElement[]; flash: HTMLCanvasElement[]; shell: HTMLCanvasElement; dust: HTMLCanvasElement[]; gravel: HTMLCanvasElement[]; metal: HTMLCanvasElement[]; crater: HTMLCanvasElement[]; puff: HTMLCanvasElement[]; jet: HTMLCanvasElement[] }
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
    puff: n(PUFF_HEATS, (i) => puffSprite(i / (PUFF_HEATS - 1), 7 + i)),
    jet: n(JET_FRAMES, (i) => jetFrame(i / JET_FRAMES)),
  };
}
/** Bakes the sprites (tens of ms) during the level's loading hold; drawing bakes on demand if this never ran. */
export function prepareBlastSprites() { sprites ??= bake(); }
const sp = () => (sprites ??= bake());
const heatCss = (h: number) => { const [r, g, b] = heatColor(h); return `rgb(${r | 0},${g | 0},${b | 0})`; };

export class Blasts {
  private chunks: Chunk[] = [];
  private puffs: Puff[] = [];
  private flashes: Seq[] = [];
  private bursts: Seq[] = [];
  private craters: Crater[] = [];
  private embers: Ember[] = [];
  private jets: Jet[] = [];
  /** Each Flamethrower's jet, 0 (off) → 1 (full), so it shoots out and dies back instead of popping. */
  private jetOn = new Map<number, number>();
  private clock = 0;
  private jetRange = new Map<number, number>();

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
  /** A Fireball (or a red alien's ignition) bursts at screen (x, y): a painted flame burst over a ring of sparks. */
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
    this.clock += dt;
    for (const e of this.embers) { e.age += dt; e.x += e.vx * dt; e.y += e.vy * dt; e.vy -= (e.rise ?? k * 6) * dt; e.vx *= 1 - (e.grow ? 2.2 : 0) * dt; e.vy *= 1 - (e.grow ? 2.2 : 0) * dt; }
    this.embers = this.embers.filter((e) => e.age < e.life);
  }

  /** Ground layer, under the actors: craters, fading out after a few seconds. */
  drawGround(g: CanvasRenderingContext2D, P: (x: number, y: number) => { x: number; y: number }, k: number, t: number) {
    if (!this.craters.length) return;
    this.craters = this.craters.filter((c) => t - c.bornT < CRATER_S_LIFE && t >= c.bornT);
    const s = sp(); g.save();
    for (const c of this.craters) {
      const age = t - c.bornT, a = Math.min(1, age / 0.08) * Math.min(1, (CRATER_S_LIFE - age) / (CRATER_S_LIFE / 3));
      const { x, y } = P(c.x, c.y), w = c.r * 2 * k;
      g.globalAlpha = a * 0.92; g.drawImage(s.crater[c.spr], x - w / 2, y - w * SQUASH / 2, w, w * SQUASH);
    }
    g.restore();
  }

  /** Over the actors: dust, debris, flashes, bursts and flame puffs. */
  draw(g: CanvasRenderingContext2D, k: number) {
    const s = sp(), cu = CHUNK_UNIT * k;
    g.save();
    for (const p of this.puffs) {
      if (p.age <= 0) continue;
      const f = p.age / p.life, w = p.size * (0.7 + 0.7 * f);
      g.globalAlpha = 0.9 * (1 - f * f); g.drawImage(s.dust[p.spr], p.x - w / 2, p.y - w / 2, w, w);
    }
    for (const c of this.chunks) {
      const img = (c.metal ? s.metal : s.gravel)[c.spr], fade = Math.min(1, (c.life - c.age) / 0.35), w = img.width * cu, h = img.height * cu;
      const x = c.x - w / 2, y = c.y - c.z - h / 2;
      if (c.z > 0.5) { g.globalAlpha = 0.28 * fade; g.fillStyle = '#000'; g.beginPath(); g.ellipse(c.x, c.y, w * 0.45, h * 0.25, 0, 0, TAU); g.fill(); }
      if (c.metal && c.hot > 0.05 && c.bounces < 3) { // hot shrapnel draws a short glowing streak
        g.globalAlpha = fade * c.hot; g.strokeStyle = heatCss(0.45 + 0.5 * c.hot); g.lineWidth = Math.max(1, h * 0.5); g.lineCap = 'round';
        g.beginPath(); g.moveTo(c.px, c.py); g.lineTo(c.x, c.y - c.z); g.stroke();
      }
      g.globalAlpha = fade; g.drawImage(img, x, y, w, h);
      if (c.hot > 0.05) { const q = Math.max(w, h) * 1.4; g.globalAlpha = fade * c.hot; g.drawImage(s.puff[puffIndex(0.55 + 0.45 * c.hot)], c.x - q / 2, c.y - c.z - q / 2, q, q); }
    }
    for (const f of this.flashes) {
      const i = Math.min(FLASH_FRAMES - 1, Math.floor(f.age / FLASH_DT)), w = f.size * 2;
      g.globalAlpha = 1; g.drawImage(s.flash[i], f.x - w / 2, f.y - w / 2, w, w);
    }
    for (const b of this.bursts) {
      const i = Math.min(BURST_FRAMES - 1, Math.floor(b.age / BURST_DT)), w = b.size;
      g.globalAlpha = 1; g.drawImage(s.burst[i], b.x - w / 2, b.y - w / 2, w, w);
    }
    // Flamethrower jets: one continuous painted tongue of flame each, with a light pass on top.
    for (const j of this.jets) {
      const img = s.jet[j.frame];
      g.save(); g.translate(j.x, j.y); g.rotate(j.a - Math.PI / 2);
      // While it shoots out, only the first `reach` of the stream is drawn (it unrolls from the mouth).
      const sw = img.width * j.reach, dl = j.len * j.reach;
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = j.alpha; g.drawImage(img, 0, 0, sw, img.height, -j.len * 0.02, -j.wide / 2, dl, j.wide);
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = j.glow * j.alpha; g.drawImage(img, 0, 0, sw, img.height, -j.len * 0.02, -j.wide / 2, dl, j.wide);
      g.restore();
    }
    this.jets.length = 0;
    g.globalCompositeOperation = 'source-over';
    for (const e of this.embers) {
      const f = e.age / e.life, h = e.heat * (1 - f), w = e.size * (e.grow ? 1 + (e.grow - 1) * f : 1 - 0.5 * f);
      if (h <= 0.22 && f > 0.92) continue;
      // Hot flame adds light (overlapping puffs brighten like real fire); cooling soot darkens normally.
      g.globalCompositeOperation = h > 0.4 ? 'lighter' : 'source-over';
      g.globalAlpha = h > 0.22 ? 0.75 : 0.6 * (1 - f); g.drawImage(s.puff[h > 0.22 ? puffIndex(h) : 0], e.x - w / 2, e.y - w / 2, w, w);
    }
    g.globalCompositeOperation = 'source-over';
    g.restore();
  }

  /**
   * A Fireball in flight at screen (x, y) `lift` above its ground point, heading (dx, dy): the rolling molten ball,
   * flame puffs shed behind it, a soft shadow on the road.
   */
  drawFireball(g: CanvasRenderingContext2D, x: number, y: number, lift: number, dx: number, dy: number, k: number, t: number, dt: number) {
    const s = sp(), w = 3.4 * k, u = PUFF_UNIT * k;
    g.save();
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(x, y, w * 0.4, w * 0.2, 0, 0, TAU); g.fill();
    const by = y - lift, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
    // Shed flame puffs behind the ball; rates are per second so frame rate doesn't change the trail.
    for (let n = 70 * dt + Math.random(); n >= 1 && this.embers.length < MAX_EMBERS; n--) {
      const sd = (Math.random() - 0.5) * w * 0.6;
      this.embers.push({ x: x - ux * w * 0.3 - uy * sd, y: by - uy * w * 0.3 + ux * sd, vx: -ux * k * (6 + Math.random() * 8) + (Math.random() - 0.5) * k * 3, vy: -uy * k * (6 + Math.random() * 8) - k * 2, age: 0, life: 0.25 + Math.random() * 0.3, size: u * (0.9 + Math.random() * 1.1), heat: 0.75 + Math.random() * 0.25 });
    }
    g.drawImage(s.ball[Math.floor(t * 16) % BALL_FRAMES], x - w / 2, by - w / 2, w, w);
    g.restore();
  }

  /** A Mortar shell in flight: the iron ball, a soft shadow, and fuse sparks spitting behind it. */
  drawShell(g: CanvasRenderingContext2D, x: number, y: number, lift: number, scale: number, k: number, dt: number) {
    const s = sp(), w = 1.9 * k * scale;
    g.save();
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(x, y, w * 0.4, w * 0.2, 0, 0, TAU); g.fill();
    if (Math.random() < 30 * dt && this.embers.length < MAX_EMBERS) this.embers.push({ x: x + (Math.random() - 0.5) * w * 0.4, y: y - lift - w * 0.4, vx: (Math.random() - 0.5) * k * 4, vy: -k * 3, age: 0, life: 0.25, size: PUFF_UNIT * k * 1.4, heat: 0.9 });
    g.drawImage(s.shell, x - w / 2, y - lift - w / 2, w, w);
    g.restore();
  }

  /**
   * The Flamethrower's duckbill burner at screen (x, y), aimed `a` (0 = up the screen), `w` px across: idle, flame licks
   * curl off the mouth, more and hotter every level (L1 a banked ember, L5 white-hot); firing, it throws one
   * continuous jet of flame `range` px long that widens toward the cone's `half` angle, shooting out and dying back
   * smoothly (`key` tells towers apart), with a few licks streaming along it.
   */
  burner(x: number, y: number, a: number, w: number, level: number, k: number, dt: number, fire?: { range: number; half: number }, key = 0) {
    const u = PUFF_UNIT * k, L = Math.max(1, Math.min(5, level)), ax = Math.sin(a), ay = -Math.cos(a);
    const idle = [5, 9, 14, 20, 28][L - 1], heat = [0.55, 0.64, 0.74, 0.86, 1][L - 1];
    for (let n = idle * dt + Math.random(); n >= 1 && this.embers.length < MAX_EMBERS; n--) {
      const off = (Math.random() - 0.5) * w * 0.8, v = k * (1.5 + Math.random() * 2.5) * (0.8 + 0.1 * L);
      this.embers.push({ x: x + ay * -off, y: y + ax * off, vx: ax * v, vy: ay * v, age: 0, life: 0.22 + Math.random() * 0.12 * L, size: u * (0.5 + Math.random() * (L >= 4 ? 0.8 : 0.5)), heat: heat * (0.85 + Math.random() * 0.15), rise: k * 14 });
    }
    const was = this.jetOn.get(key) ?? 0, on = fire ? Math.min(1, was + dt / 0.08) : Math.max(0, was - dt / 0.14);
    this.jetOn.set(key, on);
    if (on <= 0) return;
    const R = fire?.range ?? this.jetRange.get(key) ?? 0;
    if (fire) this.jetRange.set(key, fire.range);
    // The painted stream's flame ends 85% along the sprite (smoke beyond); keep the sprite's aspect so its cel pixels stay square.
    const len = R / 0.85, ux = ax * R, uy = ay * R;
    this.jets.push({ x, y, a, len, wide: len * JET_H / JET_W, reach: fire ? 0.3 + 0.7 * on : 1, alpha: fire ? 1 : on, glow: 0.06 + 0.03 * L, frame: Math.floor(this.clock * 20 + key * 3.7) % JET_FRAMES });
    // Black smoke rolls off the head while it burns, and the whole stream leaves a smoky trail when it cuts off.
    const soot = (f: number) => {
      const off = (Math.random() - 0.5) * R * 0.25, v = k * (2 + Math.random() * 3);
      this.embers.push({ x: x + ux * f + ay * -off, y: y + uy * f + ax * off, vx: ax * v, vy: ay * v, age: 0, life: 0.5 + Math.random() * 0.4, size: u * (1.6 + Math.random() * 1.4) * (0.6 + f), heat: 0.15, rise: k * 6 });
    };
    if (fire) for (let n = 7 * dt + Math.random(); n >= 1 && this.embers.length < MAX_EMBERS; n--) soot(0.8 + Math.random() * 0.15);
    else if (was >= 0.99) for (let i = 0; i < 7 && this.embers.length < MAX_EMBERS; i++) soot(0.35 + i * 0.09);
  }

  get busy() { return this.chunks.length + this.puffs.length + this.flashes.length + this.bursts.length + this.embers.length; }
  clear() { this.chunks = []; this.puffs = []; this.flashes = []; this.bursts = []; this.craters = []; this.embers = []; this.jets = []; this.jetOn.clear(); }
}
