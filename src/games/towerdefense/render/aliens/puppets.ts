// Cut-out alien puppets in the browser: loading, composing a pose onto a canvas, and pre-rendered frame sets.
// Walk cycles, strike and death poses are rendered once per species / on-screen size / tint into small canvases at
// device resolution (with the soft brood-colour outline baked in), so each alien costs one drawImage per frame.
import { buildRig, flapPeriod, matrices, mul, pose, scale, translate, type Affine, type AlienManifest, type PoseIn, type Rig } from './rig';
import { loadImage as loadImg, loadManifest } from '../assets';
import { OUTLINE_ALPHA, SPECIES_LIST, type Species, type SpeciesId } from './species';

export interface Puppet { species: Species; rig: Rig; img: Map<string, HTMLImageElement>; glow: Map<string, HTMLImageElement> }

export async function loadPuppets(base: string): Promise<Map<SpeciesId, Puppet>> {
  const out = new Map<SpeciesId, Puppet>();
  await Promise.all(SPECIES_LIST.map(async (s) => {
    const dir = `${base}td/aliens/${s.id}/`;
    const m = await loadManifest<AlienManifest>(dir + 'manifest.json');
    const img = new Map<string, HTMLImageElement>(), glow = new Map<string, HTMLImageElement>();
    await Promise.all(m.parts.map(async (p) => { img.set(p.name, await loadImg(dir + p.file)); glow.set(p.name, await loadImg(dir + p.glow)); }));
    out.set(s.id, { species: s, rig: buildRig(m), img, glow });
  }));
  return out;
}

const canvas = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
const setT = (g: CanvasRenderingContext2D, m: Affine) => g.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);

/** Draws a posed puppet with `base` mapping manifest pixels to the canvas. `tint` recolours shell (lightly) and glow. */
export function compose(g: CanvasRenderingContext2D, P: Puppet, pin: PoseIn, base: Affine, tint?: string, glowAlpha = 0.9, skip?: ReadonlySet<string>) {
  const M = matrices(P.rig, pose(P.rig, P.species, pin));
  const pass = (gg: CanvasRenderingContext2D, which: Map<string, HTMLImageElement>) => {
    for (const key of P.rig.order) {
      if (skip?.has(key)) continue;
      const name = key.split('#')[0], pt = P.rig.parts.get(name)!;
      setT(gg, mul(base, M.get(key)!)); gg.drawImage(which.get(name)!, pt.offset[0], pt.offset[1], pt.w, pt.h);
    }
    gg.setTransform(1, 0, 0, 1, 0, 0);
  };
  if (!tint) {
    pass(g, P.img);
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = glowAlpha; pass(g, P.glow);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    return;
  }
  // tinted (Stalker): needs its own layers so source-atop only touches the creature
  const W = g.canvas.width, H = g.canvas.height, body = canvas(W, H), bg = body.getContext('2d')!;
  pass(bg, P.img);
  bg.globalCompositeOperation = 'source-atop'; bg.globalAlpha = 0.34; bg.fillStyle = tint; bg.fillRect(0, 0, W, H);
  const gl = canvas(W, H), gg = gl.getContext('2d')!;
  pass(gg, P.glow);
  gg.globalCompositeOperation = 'source-atop'; gg.globalAlpha = 0.9; gg.fillStyle = tint; gg.fillRect(0, 0, W, H);
  g.drawImage(body, 0, 0);
  g.globalCompositeOperation = 'lighter'; g.globalAlpha = glowAlpha; g.drawImage(gl, 0, 0); g.globalAlpha = 0.5 * glowAlpha; g.drawImage(gl, 0, 0);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
}

/** Wraps a composed creature in a soft outline of `color` (the silhouette offset in 8 directions underneath). */
export function outlined(c: HTMLCanvasElement, color: string, px: number, alpha = OUTLINE_ALPHA, buffers?: { sil: HTMLCanvasElement; out: HTMLCanvasElement }): HTMLCanvasElement {
  if (alpha <= 0) return c;
  const sil = buffers?.sil ?? canvas(c.width, c.height), sg = sil.getContext('2d')!;
  sg.globalCompositeOperation = 'source-over'; sg.clearRect(0, 0, sil.width, sil.height);
  sg.drawImage(c, 0, 0); sg.globalCompositeOperation = 'source-in'; sg.fillStyle = color; sg.fillRect(0, 0, c.width, c.height);
  const out = buffers?.out ?? canvas(c.width, c.height), og = out.getContext('2d')!;
  og.clearRect(0, 0, out.width, out.height);
  og.globalAlpha = alpha;
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; og.drawImage(sil, Math.cos(a) * px, Math.sin(a) * px); }
  og.globalAlpha = 1; og.drawImage(c, 0, 0);
  return out;
}

export interface Frame { c: HTMLCanvasElement; /** creature centre within c, device px */ ax: number; ay: number }
export interface FrameSet { walk: Frame[]; attack: Frame[]; death: Frame[]; corpse: Frame; /** device px per manifest px */ s: number }
export const WALK_FRAMES = 12, THUD_FRAMES = 16, FLAP_FRAMES = 32, ATTACK_FRAMES = 3, DEATH_FRAMES = 5;

/** Incremental frame baking. A rest pose is published first, then one pose per pump replaces its placeholders. */
function* frameSteps(P: Puppet, lengthDev: number, outline: string, tint?: string): Generator<FrameSet> {
  const m = P.rig.m, s = lengthDev / m.lengthPx, pad = Math.max(m.size[0], m.size[1]) * 0.22 * s;
  const W = m.size[0] * s + pad * 2, H = m.size[1] * s + pad * 2, base = mul(translate(pad, pad), scale(s, s));
  const ax = pad + m.centerX * s, ay = pad + m.centerY * s, line = Math.max(1, lengthDev / 90);
  const frame = (pin: PoseIn, dark = 0): Frame => {
    const c = canvas(W, H), g = c.getContext('2d')!;
    compose(g, P, pin, base, tint, dark ? 0.9 * (1 - dark) : 0.9);
    if (dark) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = `rgba(14,10,8,${dark})`; g.fillRect(0, 0, c.width, c.height); g.globalCompositeOperation = 'source-over'; }
    return { c: dark ? c : outlined(c, outline, line), ax, ay };
  };
  const n = P.species.flying ? FLAP_FRAMES : P.species.thud ? THUD_FRAMES : WALK_FRAMES;
  const rest = frame({ phase: 0 });
  const set: FrameSet = { s, walk: Array(n).fill(rest), attack: Array(ATTACK_FRAMES).fill(rest), death: Array(DEATH_FRAMES).fill(rest), corpse: rest };
  yield set;
  for (let i = 1; i < n; i++) { set.walk[i] = frame({ phase: i / n }); yield set; }
  for (let i = 0; i < ATTACK_FRAMES; i++) { set.attack[i] = frame({ phase: 0, attack: (i + 1) / ATTACK_FRAMES }); yield set; }
  for (let i = 0; i < DEATH_FRAMES; i++) { set.death[i] = frame({ phase: 0, dying: (i + 1) / DEATH_FRAMES }); yield set; }
  set.corpse = frame({ phase: 0, dying: 1 }, 0.55); yield set;
}
/** Synchronous baking for offline callers. The game uses the incremental queue below. */
export function buildFrames(P: Puppet, lengthDev: number, outline: string, tint?: string): FrameSet {
  let set!: FrameSet; for (const step of frameSteps(P, lengthDev, outline, tint)) set = step; return set;
}

/** A one-off darkened husk without the parts that flew off as gibs (heavy deaths are rare, so composing once is cheap). */
export function husk(P: Puppet, lengthDev: number, pin: PoseIn, skip: ReadonlySet<string>, tint?: string): Frame {
  const m = P.rig.m, s = lengthDev / m.lengthPx, pad = Math.max(m.size[0], m.size[1]) * 0.22 * s;
  const c = canvas(m.size[0] * s + pad * 2, m.size[1] * s + pad * 2), g = c.getContext('2d')!;
  compose(g, P, pin, mul(translate(pad, pad), scale(s, s)), tint, 0.3, skip);
  g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(14,10,8,0.55)'; g.fillRect(0, 0, c.width, c.height);
  return { c, ax: pad + m.centerX * s, ay: pad + m.centerY * s };
}

/** Round-robin baking: one pose per rendered frame, so multiple species get a rest pose promptly. */
export class FrameCache {
  private sets = new Map<string, FrameSet>();
  private queue: Array<{ key: string; steps: Generator<FrameSet> }> = [];
  constructor(private puppets: Map<SpeciesId, Puppet>, private createSteps = frameSteps) {}
  get(id: SpeciesId, lengthDev: number, outline: string, tint?: string): FrameSet | null {
    const key = `${id}|${Math.round(lengthDev)}|${outline}|${tint ?? ''}`;
    const hit = this.sets.get(key); if (hit) return hit;
    if (!this.queue.some((q) => q.key === key)) this.queue.push({ key, steps: this.createSteps(this.puppets.get(id)!, lengthDev, outline, tint) });
    return null;
  }
  pump() {
    const q = this.queue.shift(); if (!q) return;
    const step = q.steps.next();
    if (!step.done) { this.sets.set(q.key, step.value); this.queue.push(q); }
  }
  clear() { this.sets.clear(); this.queue = []; }
  get pending() { return this.queue.length; }
  puppet(id: SpeciesId) { return this.puppets.get(id)!; }
}

/** Live composition for one boss, reusing canvases and only redrawing when its sampled pose changes. */
export class LiveCanvas {
  private c: HTMLCanvasElement | null = null;
  private buffers: { sil: HTMLCanvasElement; out: HTMLCanvasElement } | undefined;
  private lastKey = '';
  private lastFrame: Frame | null = null;
  draw(P: Puppet, lengthDev: number, pin: PoseIn, outline: string): Frame {
    const m = P.rig.m, s = lengthDev / m.lengthPx, pad = Math.max(m.size[0], m.size[1]) * 0.22 * s;
    const W = Math.ceil(m.size[0] * s + pad * 2), H = Math.ceil(m.size[1] * s + pad * 2);
    if (!this.c || this.c.width !== W || this.c.height !== H) { this.c = canvas(W, H); this.buffers = { sil: canvas(W, H), out: canvas(W, H) }; }
    // Match the cached puppets' pose cadence; position and heading still interpolate every frame.
    const phase = Math.floor(((pin.phase % 1) + 1) % 1 * 16) / 16;
    const attack = Math.round((pin.attack ?? 0) * 5) / 5;
    const strike = Math.floor(((pin.t ?? 0) % 2.5) / 2.5 * 32) / 32 * 2.5;
    const key = `${W}|${H}|${outline}|${phase}|${attack}|${strike}`;
    if (key === this.lastKey && this.lastFrame) return this.lastFrame;
    this.lastKey = key;
    const g = this.c.getContext('2d')!; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
    compose(g, P, { ...pin, phase, attack, t: strike }, mul(translate(pad, pad), scale(s, s)));
    this.lastFrame = { c: outlined(this.c, outline, Math.max(1, lengthDev / 90), OUTLINE_ALPHA, this.buffers), ax: pad + m.centerX * s, ay: pad + m.centerY * s };
    return this.lastFrame;
  }
}

/** Loop length in seconds for fliers (wingbeat cycle); walkers are distance-driven. */
export const loopSeconds = (s: Species) => (s.flying ? flapPeriod(s) : 0);
