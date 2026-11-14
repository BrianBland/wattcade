import type { Element } from './defs';

/**
 * One boss per brood colour. A boss keeps its colour, and so the turret's weapon and the trainer mode, for the
 * whole fight. HP gates still split it into phases; each phase escalates the colour's trick instead of switching:
 * - blue Swarm Tyrant (Gatling): births swarm packs, bigger and more often each phase;
 * - red Ram Tyrant (Fireball): warns, then charges down the road, longer and more often each phase;
 * - purple Bulwark Tyrant (Rail): raises shield plates at the start and at each phase; rail shots and openings break them.
 */
export const BOSS_NAME: Record<Element, string> = { blue: 'Swarm Tyrant', red: 'Ram Tyrant', purple: 'Bulwark Tyrant' };
export const BOSS_TRICK: Record<Element, string> = { blue: 'births swarm packs', red: 'charges down the road', purple: 'raises shield plates' };
/** What the next phase brings, for the phase countdown. */
export const BOSS_ESCALATION: Record<Element, string> = { blue: 'Bigger swarms', red: 'Longer charges', purple: 'New shield plates' };

export interface BossTiming {
  phaseCountdownS: number; exposedEveryS: number; telegraphS: number; exposedS: number;
}
export interface BossTricks {
  /** blue: seconds between packs in phase 1 (x0.75 per later phase) and minis per pack (+2 per phase) */
  swarmEveryS: number; swarmPack: number;
  /** red: seconds between charges in phase 1 (x0.8 per later phase), warning before each, charge length (+0.5 s per phase) */
  chargeEveryS: number; chargeWarnS: number; chargeS: number;
  /** purple: shield as a share of max HP, at the start and on each phase (+25 % per phase) */
  shieldShare: number;
}
export interface BossState {
  color: Element; phases: number; phase: number; pending: boolean; countdownS: number;
  age: number; telegraph: boolean; exposed: boolean; windowLeftS: number; staggerS: number;
  /** seconds until the colour's next trick; red's warning and charge seconds left */
  trickS: number; warnS: number; chargeS: number;
  /** purple's shield HP, and its size when raised */
  shield: number; shieldMax: number;
}
export type BossEvent = 'phaseAnnounced' | 'phaseStarted' | 'telegraph' | 'exposed' | 'swarm' | 'chargeWarn' | 'charge' | 'shield';

export function createBossState(color: Element, phases: number): BossState {
  return { color, phases: Math.max(2, Math.min(3, Math.round(phases))), phase: 0, pending: false, countdownS: 0,
    age: 0, telegraph: false, exposed: false, windowLeftS: 0, staggerS: 0, trickS: 0, warnS: 0, chargeS: 0, shield: 0, shieldMax: 0 };
}
/** HP gates preserve every phase even when a charged rail or strong tower would skip one. */
export function bossHpFloor(s: BossState, maxHp: number): number {
  return maxHp * (s.phases - s.phase - 1) / s.phases;
}
/** Minis in a blue pack this phase. */
export const swarmPackFor = (s: BossState, o: BossTricks) => Math.round(o.swarmPack) + 2 * s.phase;
const trickEvery = (s: BossState, o: BossTricks) =>
  s.color === 'blue' ? o.swarmEveryS * Math.pow(0.75, s.phase) : s.color === 'red' ? o.chargeEveryS * Math.pow(0.8, s.phase) : Infinity;
/** Raises purple's plates for the current phase. */
function raiseShield(s: BossState, maxHp: number, o: BossTricks) {
  s.shieldMax = s.shield = maxHp * o.shieldShare * (1 + 0.25 * s.phase);
}
/** The fight opens: purple raises its first plates, blue and red start their first trick timer. */
export function openBoss(s: BossState, maxHp: number, o: BossTricks): BossEvent[] {
  s.trickS = trickEvery(s, o);
  if (s.color !== 'purple') return [];
  raiseShield(s, maxHp, o);
  return ['shield'];
}

export function advanceBoss(s: BossState, dt: number, hpFraction: number, o: BossTiming, tricks?: BossTricks, maxHp = 0): BossEvent[] {
  const events: BossEvent[] = [];
  s.staggerS = Math.max(0, s.staggerS - dt);
  if (s.pending) {
    s.countdownS = Math.max(0, s.countdownS - dt);
    if (s.countdownS <= 1e-8) {
      s.phase++; s.pending = false; s.countdownS = 0; s.staggerS = 0.6;
      events.push('phaseStarted');
      if (tricks) {
        // a new phase opens with its trick: a pack, a charge warning, or fresh plates
        if (s.color === 'blue') { events.push('swarm'); s.trickS = trickEvery(s, tricks); }
        else if (s.color === 'red') s.trickS = 0;
        else { raiseShield(s, maxHp, tricks); events.push('shield'); }
      }
    }
  } else if (s.phase < s.phases - 1 && hpFraction <= (s.phases - s.phase - 1) / s.phases + 1e-8) {
    s.pending = true; s.countdownS = o.phaseCountdownS; s.warnS = 0; s.chargeS = 0;
    events.push('phaseAnnounced');
  }
  if (tricks && !s.pending && s.staggerS <= 0) {
    if (s.chargeS > 0) s.chargeS = Math.max(0, s.chargeS - dt);
    else if (s.warnS > 0) {
      s.warnS = Math.max(0, s.warnS - dt);
      if (s.warnS <= 1e-8) { s.chargeS = tricks.chargeS + 0.5 * s.phase; events.push('charge'); }
    } else {
      s.trickS -= dt;
      if (s.trickS <= 0) {
        s.trickS = trickEvery(s, tricks);
        if (s.color === 'blue') events.push('swarm');
        else if (s.color === 'red') { s.warnS = tricks.chargeWarnS; events.push('chargeWarn'); }
      }
    }
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

/**
 * Splits a hit on a shielded boss. Plates soak damage first; rail shots break them at `railMult`, everything
 * else at `otherMult`. The hit already carries Exposed and sprint bonuses, so an opening breaks plates fast too.
 * Returns the damage left for the boss's HP.
 */
export function shieldHit(s: BossState, damage: number, rail: boolean, railMult: number, otherMult: number): number {
  if (s.shield <= 0 || damage <= 0) return damage;
  const mult = rail ? railMult : otherMult, soak = Math.min(s.shield, damage * mult);
  s.shield -= soak;
  if (s.shield <= 1e-6) s.shield = 0;
  return Math.max(0, damage - soak / Math.max(1e-6, mult));
}
