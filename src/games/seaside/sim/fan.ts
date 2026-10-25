// The cooling fan (#192), pure: the bike drives a big fan and the magma eel on its stick cools in front of it. The
// glow fading is the progress bar: the scene's effort-gated progress cools it (crawling outside the cadence band,
// workout.ts), and while the cadence is out of the band the glow also creeps back a little (`heat`), which the band
// then blows off again. Never blocks: progress only ever moves forward, so `heat` is only ever a setback on screen.
// After the cooling segment of the effort plan comes the eating.
import type { Scene } from './types';

export interface FanTuning {
  /** Glow regained per second out of the band, and the most it can come back. */
  creepPerS: number; creepMax: number;
  /** In the band the regained glow blows off this many times faster than it crept back. */
  recoverK: number;
}

export const FAN_DEFAULTS: FanTuning = { creepPerS: 0.012, creepMax: 0.25, recoverK: 3 };

export interface FanView {
  /** How hot the eel glows 1 (molten) .. 0 (plain grey-green). */
  glow: number;
  /** Glow regained out of the band (part of `glow`). */
  heat: number;
  inBand: boolean;
  /** Eating 0..1 (after the cooling), else 0. */
  eat: number;
}

/** Scene progress where the cooling ends (the end of the effort plan's first segment) and the eating starts. */
export const coolEnd = (sc: Pick<Scene, 'effort' | 'planS'>) => sc.effort.length > 1 ? sc.effort[0][0] / sc.planS : 1;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Step the regained glow: it creeps back out of the band (only while cooling), and blows off in the band. */
export function stepHeat(heat: number, inBand: boolean, cooling: boolean, dt: number, t: FanTuning): number {
  if (!cooling) return Math.max(0, heat - t.creepPerS * t.recoverK * dt);
  return inBand ? Math.max(0, heat - t.creepPerS * t.recoverK * dt) : Math.min(t.creepMax, heat + t.creepPerS * dt);
}

export function fanView(sc: Pick<Scene, 'effort' | 'planS'>, progress: number, heat: number, inBand: boolean): FanView {
  const end = coolEnd(sc), cooled = clamp01(progress / end);
  return { glow: clamp01(1 - cooled + heat), heat, inBand, eat: end < 1 ? clamp01((progress - end) / (1 - end)) : 0 };
}
