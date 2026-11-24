// Painted fire and blast animations (public/td/fx/): the Flamethrower burst, the Fireball and its impact, the Mortar
// shell, impact and debris, red-brood ignition, embers and the Fireball's ground fire. Each sequence is one
// horizontal strip of equal frames, packed by docs/towerdefense/art-briefs/fx/pack.py.
import { loadImage, loadManifest } from './assets';

export type FxName =
  | 'flame-start' | 'flame-sustain' | 'flame-out'
  | 'fireball-ball' | 'fireball-trail' | 'fireball-impact'
  | 'mortar-shell' | 'mortar-impact' | 'mortar-crater' | 'mortar-gravel' | 'mortar-shrapnel'
  | 'ignite-burst' | 'ember' | 'ground-flare'
  | 'ground-tuft-0' | 'ground-tuft-1' | 'ground-tuft-2' | 'ground-tuft-3'
  | 'ground-dying-0' | 'ground-dying-1' | 'ground-dying-2' | 'ground-dying-3';

export interface Strip { img: CanvasImageSource; w: number; h: number; n: number }

const strips = new Map<FxName, Strip>();
let loading: Promise<void> | null = null;

/** Loads every strip once (during the level's loading hold). A missing strip only leaves that effect undrawn. */
export function loadFxArt(base: string): Promise<void> {
  return (loading ??= (async () => {
    const root = `${base}td/fx/`;
    const manifest = await loadManifest<Record<FxName, { w: number; h: number; n: number }>>(`${root}manifest.json`);
    await Promise.all(Object.entries(manifest).map(async ([name, m]) => {
      const img = await loadImage(`${root}${name}.webp`).catch(() => null);
      if (img) strips.set(name as FxName, { img, ...m });
    }));
  })().catch(() => { loading = null; }));
}

export const fxStrip = (name: FxName): Strip | undefined => strips.get(name);

/**
 * Draws frame `i` (clamped) of a strip into the box (x, y, w, h). Returns false when the strip isn't loaded.
 */
export function drawFx(g: CanvasRenderingContext2D, name: FxName, i: number, x: number, y: number, w: number, h: number): boolean {
  const s = strips.get(name);
  if (!s) return false;
  const f = Math.max(0, Math.min(s.n - 1, Math.floor(i)));
  g.drawImage(s.img, f * s.w, 0, s.w, s.h, x, y, w, h);
  return true;
}

/** Frame index of a one-shot sequence `n` frames long at `fps`, `age` seconds in; null once it has played. */
export function oneShot(age: number, fps: number, n: number): number | null {
  if (age < 0) return null;
  const i = Math.floor(age * fps);
  return i < n ? i : null;
}

/** Frame rates the art was painted for. */
export const FX_FPS = { flame: 20, fireballImpact: 16, mortarImpact: 20, ignite: 20, loop: 16, ground: 18, flare: 20 } as const;
