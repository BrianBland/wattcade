import { ELEMENTS, type Element } from './defs';

export interface BossTiming {
  phaseCountdownS: number; exposedEveryS: number; telegraphS: number; exposedS: number;
}
export interface BossState {
  colors: Element[]; phase: number; pending: boolean; countdownS: number;
  age: number; telegraph: boolean; exposed: boolean; windowLeftS: number; staggerS: number;
}
export function bossColors(first: Element, count: number): Element[] {
  return Array.from({ length: Math.max(2, Math.min(3, Math.round(count))) }, (_, i) => ELEMENTS[(ELEMENTS.indexOf(first) + i) % 3]);
}
export function createBossState(colors: Element[]): BossState {
  return { colors, phase: 0, pending: false, countdownS: 0, age: 0, telegraph: false, exposed: false, windowLeftS: 0, staggerS: 0 };
}
/** HP gates preserve every phase even when a charged rail or strong tower would skip one. */
export function bossHpFloor(s: BossState, maxHp: number): number {
  return maxHp * (s.colors.length - s.phase - 1) / s.colors.length;
}
export function advanceBoss(s: BossState, dt: number, hpFraction: number, o: BossTiming): Array<'phaseAnnounced' | 'phaseStarted' | 'telegraph' | 'exposed'> {
  const events: Array<'phaseAnnounced' | 'phaseStarted' | 'telegraph' | 'exposed'> = [];
  s.staggerS = Math.max(0, s.staggerS - dt);
  if (s.pending) {
    s.countdownS = Math.max(0, s.countdownS - dt);
    if (s.countdownS <= 1e-8) {
      s.phase++; s.pending = false; s.countdownS = 0; s.staggerS = 0.6;
      events.push('phaseStarted');
    }
  } else if (s.phase < s.colors.length - 1 && hpFraction <= (s.colors.length - s.phase - 1) / s.colors.length + 1e-8) {
    s.pending = true; s.countdownS = o.phaseCountdownS;
    events.push('phaseAnnounced');
  }
  s.age += dt;
  // First Exposed window opens at everyS, then repeats everyS after that.
  const every = Math.max(o.exposedEveryS, o.telegraphS + o.exposedS + 0.1);
  const cycle = (s.age + o.telegraphS) % every;
  const on = s.age >= every - o.telegraphS;
  const telegraph = on && cycle < o.telegraphS;
  const exposed = on && cycle >= o.telegraphS && cycle < o.telegraphS + o.exposedS;
  if (telegraph && !s.telegraph) events.push('telegraph');
  if (exposed && !s.exposed) events.push('exposed');
  s.telegraph = telegraph; s.exposed = exposed;
  s.windowLeftS = telegraph ? o.telegraphS - cycle : exposed ? o.telegraphS + o.exposedS - cycle : Math.max(0, every - cycle);
  return events;
}
