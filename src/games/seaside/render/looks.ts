// Look presets: per-material switches (bevel, cool light) + post-processing. The "dream" dial follows the story:
// mundane-but-faintly-dreamy in the Morning, stranger by Midday, a fever dream by Evening. Scene changes never
// switch looks hard: LookDirector blends every parameter from the current state to the next preset.
import * as THREE from 'three';
import { LOOK } from '../voxel/three';
import { POST_DEFAULTS, type PostParams } from './post';

export interface LookPreset { label: string; bevel: number; cool: number; post: Partial<PostParams> | null }

export const LOOKS: Record<string, LookPreset> = {
  raw: { label: 'A · raw boxes', bevel: 0, cool: 0, post: null },
  crafted: { label: 'B · bevelled cubes + cool shadows', bevel: 1, cool: 1, post: null },
  illustrated: { label: 'C · + ink outlines + split-tone grade', bevel: 1, cool: 1, post: { outline: 0.9, grade: 0.9 } },
  pixel: { label: 'D · chunky pixels (⅓ res) + dither', bevel: 0.8, cool: 1, post: { pixel: 3, outline: 0.9, grade: 0.9, posterize: 18, dither: 0.9 } },
  morning: { label: 'E · Morning: mundane, faintly dreamy', bevel: 1, cool: 1, post: { outline: 0.55, grade: 0.8, pastel: 0.3, saturation: 0.95, bloom: 0.35, threshold: 0.92, halation: 0.6, dream: 0.18 } },
  midday: { label: 'F · Midday: stranger', bevel: 1, cool: 1, post: { outline: 0.8, ink: new THREE.Color(0x3a1d4a), grade: 1, pastel: 0.15, saturation: 1.15, bloom: 0.6, threshold: 0.8, halation: 0.8, dream: 0.55 } },
  // per-scene grades for the later-story stills
  belly: { label: 'Belly (Midday)', bevel: 1, cool: 0.6, post: { outline: 0.7, ink: new THREE.Color(0x3a0a2a), grade: 0.8, saturation: 1.1, bloom: 0.9, threshold: 0.95, halation: 0.5, dream: 0.4 } },
  jungle: { label: 'Monkey mouth (Midday)', bevel: 1, cool: 1, post: { outline: 0.8, ink: new THREE.Color(0x1f2a12), grade: 0.9, pastel: 0.1, saturation: 1.1, bloom: 0.45, threshold: 0.85, halation: 0.6, dream: 0.45 } },
  lava: { label: 'Obsidian bridge (Evening)', bevel: 1, cool: 0.7, post: { outline: 0.9, ink: new THREE.Color(0x2a0606), grade: 1, saturation: 1.2, bloom: 1.25, threshold: 0.85, halation: 1, dream: 0.75 } },
  reentry: { label: 'Re-entry (Evening)', bevel: 1, cool: 0.5, post: { outline: 0.8, ink: new THREE.Color(0x3a0a1a), grade: 1, saturation: 1.2, bloom: 1.1, threshold: 0.9, halation: 1, dream: 0.9 } },
  fever: { label: 'G · Evening: fever dream', bevel: 1, cool: 1, post: { outline: 1, ink: new THREE.Color(0x5a0f3a), grade: 1, saturation: 1.3, bloom: 1.2, threshold: 0.5, halation: 1, dream: 1, posterize: 24, dither: 0.5 } },
};

export function applyLook(name: string, detail?: number): LookPreset {
  const l = LOOKS[name] ?? LOOKS.raw;
  LOOK.bevel.value = l.bevel; LOOK.cool.value = l.cool; LOOK.detail.value = detail ?? (l.bevel > 0 ? 1 : 0);
  return l;
}

/** A fully resolved look: material switches + every post parameter. */
export interface LookState { bevel: number; cool: number; detail: number; post: PostParams }

export function resolveLook(name: string): LookState {
  const l = LOOKS[name] ?? LOOKS.raw;
  return { bevel: l.bevel, cool: l.cool, detail: l.bevel > 0 ? 1 : 0, post: { ...POST_DEFAULTS, ink: POST_DEFAULTS.ink.clone(), ...l.post, ...(l.post?.ink ? { ink: l.post.ink.clone() } : {}) } };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const NUM_KEYS = (Object.keys(POST_DEFAULTS) as Array<keyof PostParams>).filter((k) => typeof POST_DEFAULTS[k] === 'number' && k !== 'pixel');

/** Blend two looks (t 0 → a, 1 → b). `pixel` is a render-target size, so it switches at the midpoint (it is a mode, not a grade). */
export function mixLook(a: LookState, b: LookState, t: number): LookState {
  const post = { ...a.post, ink: a.post.ink.clone().lerp(b.post.ink, t), pixel: t < 0.5 ? a.post.pixel : b.post.pixel };
  for (const k of NUM_KEYS) (post[k] as number) = lerp(a.post[k] as number, b.post[k] as number, t);
  return { bevel: lerp(a.bevel, b.bevel, t), cool: lerp(a.cool, b.cool, t), detail: lerp(a.detail, b.detail, t), post };
}

const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/**
 * Chunky-pixel levels: 0 = native, 1 = half resolution, 2 = a third, with a posterize + dither grade so the fallback
 * reads as a deliberate look. Used by the user setting and the automatic perf fallback (render/perf.ts).
 */
export function chunky(p: PostParams, level: number): PostParams {
  if (level <= 0) return p;
  return { ...p, pixel: Math.max(p.pixel, 1 + level), posterize: p.posterize > 0 ? Math.min(p.posterize, 24) : 24, dither: Math.max(p.dither, 0.7) };
}

/**
 * Drives the look over time: `set(name, dream)` starts a blend from wherever the look is now (even mid-blend) to the
 * new preset over `blendS` seconds; the dream dial is eased separately (it rises slowly over the story).
 */
export class LookDirector {
  private from: LookState; private to: LookState; private base: LookState; private cur: LookState;
  private name: string; private t = 1;
  private dream: number; private dreamTarget: number | null = null;
  /** Chunky-pixel level floor (setting or perf fallback). */ pixelLevel = 0;

  constructor(name: string, private blendS = 6, private dreamRate = 0.08) {
    this.name = name; this.from = this.to = this.base = this.cur = resolveLook(name);
    this.dream = this.cur.post.dream;
  }

  get current(): LookState { return this.cur; }
  get target(): string { return this.name; }

  /** Target preset and (optionally) the story's dream value, 0..1. */
  set(name: string, dream?: number): void {
    if (name !== this.name) { this.from = this.base; this.to = resolveLook(name); this.name = name; this.t = 0; }
    this.dreamTarget = dream ?? null;
  }

  /** Jump straight to the target (camera cuts, first frame). */
  snap(): void { this.t = 1; this.dream = this.dreamTarget ?? this.to.post.dream; this.step(0); }

  step(dt: number): LookState {
    this.t = Math.min(1, this.t + dt / Math.max(1e-3, this.blendS));
    const base = (this.base = mixLook(this.from, this.to, ease(this.t)));
    const want = this.dreamTarget ?? base.post.dream, maxStep = this.dreamRate * dt;
    this.dream += Math.max(-maxStep, Math.min(maxStep, want - this.dream));
    this.cur = { ...base, post: chunky({ ...base.post, dream: this.dream }, this.pixelLevel) };
    return this.cur;
  }
}

/** Push a resolved look's material switches into the shared voxel uniforms. */
export function applyLookState(l: LookState): void { LOOK.bevel.value = l.bevel; LOOK.cool.value = l.cool; LOOK.detail.value = l.detail; }
