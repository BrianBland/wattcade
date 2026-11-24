// Shells, blasts and the Flamethrower's fire. The big effects are painted animation strips (fxArt.ts, public/td/fx/):
// the Fireball's rolling ball, flame trail and impact, red-brood ignition, the Mortar's tumbling shell, impact,
// craters and thrown gravel and shrapnel, and the Flamethrower's burst. Small flame puffs (idle licks at the burner,
// shell fuse sparks, smoke) stay baked from blastTex.ts. Debris lives in screen space (like the renderer's
// particles); craters keep field coordinates. Sizes are in field units times `k` (px per unit).
import { PUFF_HEATS, puffSprite, type Sprite } from './blastTex';
import { FX_FPS, drawFx, fxStrip, oneShot, type FxName } from './fxArt';

const TAU = Math.PI * 2;
/** The road is seen slightly from above: ground footprints squash vertically (matches burnFx). */
const SQUASH = 0.82;
/** Field units per debris-sprite pixel: a painted stone (about 24 px on its 40 px canvas) is about one unit across. */
export const CHUNK_UNIT = 0.034;
/** Flame-puff size unit (field units): trail and spray puffs are 1–3 of these. */
export const PUFF_UNIT = 0.32;
/** Debris/crater/puff caps, so a mortar battery can't flood a frame. */
export const MAX_CHUNKS = 260, MAX_CRATERS = 14, MAX_EMBERS = 520;
/** Seconds a crater stays on the road (the last third fades). */
export const CRATER_S_LIFE = 6;
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

/** A one-shot painted animation playing at screen (x, y), `size` px square. */
interface Seq { x: number; y: number; age: number; size: number; name: FxName; fps: number }
interface Crater { x: number; y: number; bornT: number; r: number; spr: number }
interface Jet { x: number; y: number; a: number; len: number; wide: number; name: FxName; frame: number }
interface Ember { x: number; y: number; vx: number; vy: number; age: number; life: number; size: number; heat: number; /** Size multiplier reached at the end of its life (a spray's flames billow as they travel). */ grow?: number; /** Upward drift, px/s² (flames rise). */ rise?: number }

let puffs: HTMLCanvasElement[] | null = null;
function toCanvas(s: Sprite): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = s.w; c.height = s.h;
  const img = new ImageData(s.w, s.h); img.data.set(s.data); c.getContext('2d')!.putImageData(img, 0, 0);
  return c;
}
const bakePuffs = () => Array.from({ length: PUFF_HEATS }, (_, i) => toCanvas(puffSprite(i / (PUFF_HEATS - 1), 7 + i)));
/** Bakes the flame puffs (a few ms) during the level's loading hold; drawing bakes on demand if this never ran. */
export function prepareBlastSprites() { puffs ??= bakePuffs(); }
const sp = () => (puffs ??= bakePuffs());

/** Frames in the Flamethrower burst's painted start (fire racing out to range) and out (receding into the mouth). */
const FLAME_START_N = 6, FLAME_OUT_N = 6;
/** How long a burst's fire takes to reach full range, and to pull back into the mouth after the burst (s). */
export const FLAME_REACH_S = FLAME_START_N / FX_FPS.flame, FLAME_RECEDE_S = FLAME_OUT_N / FX_FPS.flame;
/**
 * Which painted frame shows `age` seconds into a burst lasting `dur`: the start strip as the fire races out, the
 * sustain loop while it holds, then the out strip as it recedes into the mouth; null before and after.
 */
export function flameFrame(age: number, dur: number, sustainN = 12): { name: FxName; i: number } | null {
  if (age < 0) return null;
  const f = FX_FPS.flame;
  if (age > dur) { const i = oneShot(age - dur, f, FLAME_OUT_N); return i == null ? null : { name: 'flame-out', i }; }
  if (age < FLAME_REACH_S && age < dur) return { name: 'flame-start', i: Math.floor(age * f) };
  return { name: 'flame-sustain', i: Math.floor((age - FLAME_REACH_S) * f) % sustainN };
}

export class Blasts {
  private chunks: Chunk[] = [];
  private seqs: Seq[] = [];
  private craters: Crater[] = [];
  private embers: Ember[] = [];
  private jets: Jet[] = [];
  /** Each Flamethrower's last burst: where and which way it fired (a finished burst recedes along it). */
  private jetBurst = new Map<number, { x: number; y: number; a: number; range: number; smoked: boolean }>();
  private clock = 0;

  /** A Mortar shell lands at screen (x, y): the painted detonation (flash, shockwave, dirt), a crater, debris. */
  mortar(x: number, y: number, fieldX: number, fieldY: number, r: number, k: number, t: number) {
    const R = r * k;
    this.seqs.push({ x, y, age: 0, size: R * 2.3, name: 'mortar-impact', fps: FX_FPS.mortarImpact });
    this.craters.push({ x: fieldX, y: fieldY, bornT: t, r: r * 0.62, spr: Math.floor(Math.random() * 3) });
    if (this.craters.length > MAX_CRATERS) this.craters.shift();
    // The impact art already throws dirt; a few loose stones and casing pieces carry on past it and settle.
    const nGravel = fxStrip('mortar-gravel')?.n ?? 1, nMetal = fxStrip('mortar-shrapnel')?.n ?? 1;
    for (let i = 0; i < 14 && this.chunks.length < MAX_CHUNKS; i++) {
      const metal = i < 5, a = Math.random() * TAU, v = R * (metal ? 1.8 + Math.random() * 1.6 : 0.7 + Math.random() * 1.3);
      const set = metal ? nMetal : nGravel, d = R * 0.15 * Math.random();
      this.chunks.push({
        x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * SQUASH, z: k * 0.5, vx: Math.cos(a) * v, vy: Math.sin(a) * v * SQUASH,
        vz: k * (metal ? 10 + Math.random() * 16 : 16 + Math.random() * 30), age: 0, life: metal ? 0.9 + Math.random() * 0.6 : 1.6 + Math.random() * 1.2,
        spr: Math.floor(Math.random() * set), metal, hot: metal ? 1 : 0, bounces: 0, px: x, py: y,
      });
    }
  }
  /** A Fireball bursts at screen (x, y), `r` field units across: the painted fire crown. */
  fireball(x: number, y: number, r: number, k: number) {
    this.seqs.push({ x, y: y - r * k * 0.2, age: 0, size: r * k * 2.6, name: 'fireball-impact', fps: FX_FPS.fireballImpact });
  }
  /** A red-brood alien bursts into flame at screen (x, y), the burst `w` px across. */
  ignite(x: number, y: number, w: number) {
    this.seqs.push({ x, y, age: 0, size: w, name: 'ignite-burst', fps: FX_FPS.ignite });
  }

  step(dt: number, k: number) {
    const gravity = 90 * k;
    for (const c of this.chunks) stepChunk(c, dt, gravity);
    this.chunks = this.chunks.filter((c) => c.age < c.life);
    for (const q of this.seqs) q.age += dt;
    this.seqs = this.seqs.filter((q) => oneShot(q.age, q.fps, fxStrip(q.name)?.n ?? 10) != null);
    this.clock += dt;
    for (const e of this.embers) { e.age += dt; e.x += e.vx * dt; e.y += e.vy * dt; e.vy -= (e.rise ?? k * 6) * dt; e.vx *= 1 - (e.grow ? 2.2 : 0) * dt; e.vy *= 1 - (e.grow ? 2.2 : 0) * dt; }
    this.embers = this.embers.filter((e) => e.age < e.life);
  }

  /** Ground layer, under the actors: craters, fading out after a few seconds. */
  drawGround(g: CanvasRenderingContext2D, P: (x: number, y: number) => { x: number; y: number }, k: number, t: number) {
    if (!this.craters.length) return;
    this.craters = this.craters.filter((c) => t - c.bornT < CRATER_S_LIFE && t >= c.bornT);
    g.save();
    for (const c of this.craters) {
      const age = t - c.bornT, a = Math.min(1, age / 0.08) * Math.min(1, (CRATER_S_LIFE - age) / (CRATER_S_LIFE / 3));
      const { x, y } = P(c.x, c.y), w = c.r * 2.6 * k;
      g.globalAlpha = a * 0.92; drawFx(g, 'mortar-crater', c.spr, x - w / 2, y - w * SQUASH / 2, w, w * SQUASH);
    }
    g.restore();
  }

  /** Over the actors: debris, impacts and flame puffs. */
  draw(g: CanvasRenderingContext2D, k: number) {
    const s = sp(), cu = CHUNK_UNIT * k;
    g.save();
    for (const c of this.chunks) {
      const name = c.metal ? 'mortar-shrapnel' : 'mortar-gravel', st = fxStrip(name), fade = Math.min(1, (c.life - c.age) / 0.35);
      const w = (st?.w ?? 40) * cu, h = (st?.h ?? 40) * cu;
      if (c.z > 0.5) { g.globalAlpha = 0.28 * fade; g.fillStyle = '#000'; g.beginPath(); g.ellipse(c.x, c.y, w * 0.3, h * 0.15, 0, 0, TAU); g.fill(); }
      g.globalAlpha = fade; drawFx(g, name, c.spr, c.x - w / 2, c.y - c.z - h / 2, w, h);
      if (c.hot > 0.05) { const q = w * 0.7; g.globalAlpha = fade * c.hot; g.drawImage(s[puffIndex(0.55 + 0.45 * c.hot)], c.x - q / 2, c.y - c.z - q / 2, q, q); }
    }
    g.globalAlpha = 1;
    for (const q of this.seqs) drawFx(g, q.name, Math.floor(q.age * q.fps), q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
    // Flamethrower bursts: one painted fan of fire each, its mouth at the burner.
    for (const j of this.jets) {
      g.save(); g.translate(j.x, j.y); g.rotate(j.a - Math.PI / 2);
      drawFx(g, j.name, j.frame, -j.len * 0.02, -j.wide / 2, j.len, j.wide);
      g.restore();
    }
    this.jets.length = 0;
    g.globalCompositeOperation = 'source-over';
    for (const e of this.embers) {
      const f = e.age / e.life, h = e.heat * (1 - f), w = e.size * (e.grow ? 1 + (e.grow - 1) * f : 1 - 0.5 * f);
      if (h <= 0.22 && f > 0.92) continue;
      // Hot flame adds light (overlapping puffs brighten like real fire); cooling soot darkens normally.
      g.globalCompositeOperation = h > 0.4 ? 'lighter' : 'source-over';
      g.globalAlpha = h > 0.22 ? 0.75 : 0.6 * (1 - f); g.drawImage(s[h > 0.22 ? puffIndex(h) : 0], e.x - w / 2, e.y - w / 2, w, w);
    }
    g.globalCompositeOperation = 'source-over';
    g.restore();
  }

  /**
   * A Fireball in flight at screen (x, y) `lift` above its ground point, heading (dx, dy): the rolling molten ball
   * over its painted flame trail, and a soft shadow on the road.
   */
  drawFireball(g: CanvasRenderingContext2D, x: number, y: number, lift: number, dx: number, dy: number, k: number, t: number) {
    const w = 3.4 * k, sc = (w * 1.25) / 64, f = Math.floor(t * FX_FPS.loop);
    g.save();
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(x, y, w * 0.4, w * 0.2, 0, 0, TAU); g.fill();
    // The trail strip has the ball's centre at (112, 32) and streams back toward -x.
    g.translate(x, y - lift); g.rotate(Math.atan2(dy, dx));
    drawFx(g, 'fireball-trail', f % 6, -112 * sc, -32 * sc, 128 * sc, 64 * sc);
    drawFx(g, 'fireball-ball', f % 8, -32 * sc, -32 * sc, 64 * sc, 64 * sc);
    g.restore();
  }

  /** A Mortar shell in flight: the tumbling iron shell, a soft shadow, and fuse sparks spitting behind it. */
  drawShell(g: CanvasRenderingContext2D, x: number, y: number, lift: number, scale: number, k: number, dt: number) {
    const w = 1.9 * k * scale, q = w * 2.2;
    g.save();
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(x, y, w * 0.4, w * 0.2, 0, 0, TAU); g.fill();
    if (Math.random() < 30 * dt && this.embers.length < MAX_EMBERS) this.embers.push({ x: x + (Math.random() - 0.5) * w * 0.4, y: y - lift - w * 0.4, vx: (Math.random() - 0.5) * k * 4, vy: -k * 3, age: 0, life: 0.25, size: PUFF_UNIT * k * 1.4, heat: 0.9 });
    drawFx(g, 'mortar-shell', Math.floor(this.clock * FX_FPS.loop) % 8, x - q / 2, y - lift - q / 2, q, q);
    g.restore();
  }

  /**
   * The Flamethrower's duckbill burner at screen (x, y), aimed `a` (0 = up the screen), `w` px across: idle, flame licks
   * curl off the mouth, more and hotter every level (L1 a banked ember, L5 white-hot). A burst (`burst.age` seconds
   * into one lasting `burst.dur`) throws the painted fan of fire `range` px long: it races out from the mouth, holds,
   * and after the burst recedes back into the mouth along the burst's own line, leaving smoke where its front was.
   * `key` tells towers apart.
   */
  burner(x: number, y: number, a: number, w: number, level: number, k: number, dt: number, burst?: { age: number; dur: number; range: number }, key = 0) {
    const u = PUFF_UNIT * k, L = Math.max(1, Math.min(5, level)), ax = Math.sin(a), ay = -Math.cos(a);
    const idle = [5, 9, 14, 20, 28][L - 1], heat = [0.55, 0.64, 0.74, 0.86, 1][L - 1];
    for (let n = idle * dt + Math.random(); n >= 1 && this.embers.length < MAX_EMBERS; n--) {
      const off = (Math.random() - 0.5) * w * 0.8, v = k * (1.5 + Math.random() * 2.5) * (0.8 + 0.1 * L);
      this.embers.push({ x: x + ay * -off, y: y + ax * off, vx: ax * v, vy: ay * v, age: 0, life: 0.22 + Math.random() * 0.12 * L, size: u * (0.5 + Math.random() * (L >= 4 ? 0.8 : 0.5)), heat: heat * (0.85 + Math.random() * 0.15), rise: k * 14 });
    }
    const fr = burst ? flameFrame(burst.age, burst.dur, fxStrip('flame-sustain')?.n) : null;
    if (!burst || !fr) { this.jetBurst.delete(key); return; }
    const firing = burst.age <= burst.dur;
    let st = this.jetBurst.get(key);
    if (firing || !st) { st = { x, y, a, range: burst.range, smoked: false }; this.jetBurst.set(key, st); }
    // The painted fire's front billows about 90% along the 224×300 frame; keep its aspect so its pixels stay square.
    const R = st.range, len = R / 0.9, bx = Math.sin(st.a), by = -Math.cos(st.a);
    this.jets.push({ x: st.x, y: st.y, a: st.a, len, wide: len * 300 / 224, name: fr.name, frame: fr.i });
    // Black smoke rolls off the front while it burns, and hangs where the front was as the fire pulls back.
    const soot = (f: number) => {
      const off = (Math.random() - 0.5) * R * 0.35, v = k * (2 + Math.random() * 3);
      this.embers.push({ x: st!.x + bx * R * f + by * -off, y: st!.y + by * R * f + bx * off, vx: bx * v, vy: by * v, age: 0, life: 0.5 + Math.random() * 0.4, size: u * (1.6 + Math.random() * 1.4) * (0.6 + f), heat: 0.15, rise: k * 6 });
    };
    if (firing) { if (burst.age >= FLAME_REACH_S) for (let n = 7 * dt + Math.random(); n >= 1 && this.embers.length < MAX_EMBERS; n--) soot(0.8 + Math.random() * 0.15); }
    else if (!st.smoked) { st.smoked = true; for (let i = 0; i < 5 && this.embers.length < MAX_EMBERS; i++) soot(0.7 + i * 0.06); }
  }

  get busy() { return this.chunks.length + this.seqs.length + this.embers.length; }
  clear() { this.chunks = []; this.seqs = []; this.craters = []; this.embers = []; this.jets = []; this.jetBurst.clear(); }
}
