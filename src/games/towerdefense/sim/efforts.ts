import type { Weapon } from './defs';

export type EffortKind = 'spin' | 'grind' | 'hold';
export interface EffortView {
  kind: EffortKind; wave: number; state: 'announced' | 'active' | 'won' | 'failed';
  countdownS: number; heldS: number; needS: number; leftS: number;
  minRpm: number; maxRpm: number; minFtp: number; maxFtp: number; targetFtp: number;
}
export interface EffortSchedule { nextWave: number; lastWave: number }
/** Boss ladders have their own sprint calls. Ordinary calls are spaced 2–3 waves apart. */
export function scheduleCall(s: EffortSchedule, wave: number, boss: boolean, weapon: Weapon, rng: () => number, gapMin: number, gapMax: number): EffortKind | null {
  if (boss || wave < s.nextWave || wave <= s.lastWave + 1) return null;
  s.lastWave = wave;
  const lo = Math.max(2, Math.round(gapMin)), hi = Math.max(lo, Math.round(gapMax));
  s.nextWave = wave + lo + Math.floor(rng() * (hi - lo + 1));
  return { gatling: 'spin', flame: 'grind', rail: 'hold' }[weapon] as EffortKind;
}
export function effortMet(e: EffortView, cadence: number, ftp: number): boolean {
  return cadence >= Math.max(15, e.minRpm) && cadence <= e.maxRpm && ftp >= e.minFtp && ftp <= e.maxFtp;
}
