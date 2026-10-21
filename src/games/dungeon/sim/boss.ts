// Boss fight framework (pure): three HP phases with a stagger between them, a telegraphed big attack that leaves
// the boss EXPOSED (stunned, takes extra damage), and a Turning Tide assist for long fights so a tired rider at Z2
// still wins, just more slowly. The sim owns positions and bullets; this owns the clock.

export type BossCycle = 'idle' | 'windup' | 'exposed' | 'stagger';
export interface BossCfg {
  phaseSplits: [number, number];  // HP fractions where phase 2 and 3 begin
  bigEveryS: number;              // seconds of idle before the next big attack (phase 1)
  bigEveryPhaseCut: number;       // shortened by this per later phase
  windupS: number;                // telegraph length
  exposedS: number;               // stun window after the big attack
  exposedMult: number;            // damage taken while exposed
  strikeBonusS: number;           // Strike landed while exposed extends the window
  parryBonusS: number;            // Ward up when the big attack lands: a parry, extends the window
  staggerS: number;               // stun between phases
  tideAfterS: number;             // Turning Tide begins after this long in the fight
  tideRate: number;               // extra damage taken per second of tide (fraction)
  tideMax: number;                // cap on the tide bonus (fraction)
}
export const DEFAULT_BOSS: BossCfg = {
  phaseSplits: [0.66, 0.33], bigEveryS: 20, bigEveryPhaseCut: 3, windupS: 2, exposedS: 5, exposedMult: 2,
  strikeBonusS: 1.5, parryBonusS: 2, staggerS: 1.5, tideAfterS: 120, tideRate: 0.01, tideMax: 1,
};

export interface BossState { phase: 1 | 2 | 3; cycle: BossCycle; cycleT: number; left: number; fightT: number; parried: boolean; struck: boolean }
export type BossEvent = 'phase' | 'windup' | 'bigAttack' | 'exposed' | 'exposedEnd' | 'tide';

export const newBoss = (cfg: BossCfg = DEFAULT_BOSS): BossState => ({ phase: 1, cycle: 'idle', cycleT: 0, left: cfg.bigEveryS * 0.6, fightT: 0, parried: false, struck: false });

export const phaseFor = (hpFrac: number, cfg: BossCfg = DEFAULT_BOSS): 1 | 2 | 3 => (hpFrac <= cfg.phaseSplits[1] ? 3 : hpFrac <= cfg.phaseSplits[0] ? 2 : 1);
export const bigEvery = (phase: number, cfg: BossCfg = DEFAULT_BOSS) => Math.max(6, cfg.bigEveryS - cfg.bigEveryPhaseCut * (phase - 1));
/** Turning Tide: extra damage fraction the boss takes after a long fight. */
export const tideBonus = (fightT: number, cfg: BossCfg = DEFAULT_BOSS) => Math.max(0, Math.min(cfg.tideMax, (fightT - cfg.tideAfterS) * cfg.tideRate));
/** Damage multiplier on the boss right now. */
export const bossDamageMult = (s: BossState, cfg: BossCfg = DEFAULT_BOSS) => (s.cycle === 'exposed' ? cfg.exposedMult : 1) * (1 + tideBonus(s.fightT, cfg));
/** The boss neither moves nor attacks while winding up? It telegraphs (moves slowly), and is helpless when exposed or staggered. */
export const bossStunned = (s: BossState) => s.cycle === 'exposed' || s.cycle === 'stagger';

/** Advance. `wardUp` = the rider's Ward is active (a parry if the big attack lands now). Mutates `s`. */
export function stepBoss(s: BossState, i: { dt: number; hpFrac: number; wardUp: boolean }, cfg: BossCfg = DEFAULT_BOSS): BossEvent[] {
  const ev: BossEvent[] = [];
  const before = s.fightT;
  s.fightT += i.dt; s.cycleT += i.dt; s.left -= i.dt;
  if (before < cfg.tideAfterS && s.fightT >= cfg.tideAfterS) ev.push('tide');
  const ph = phaseFor(i.hpFrac, cfg);
  if (ph > s.phase) { // phase change interrupts anything except another stagger
    s.phase = ph; s.cycle = 'stagger'; s.cycleT = 0; s.left = cfg.staggerS; ev.push('phase');
    return ev;
  }
  if (s.left > 0) return ev;
  switch (s.cycle) {
    case 'idle': s.cycle = 'windup'; s.cycleT = 0; s.left = cfg.windupS; ev.push('windup'); break;
    case 'windup':
      ev.push('bigAttack');
      s.parried = i.wardUp; s.struck = false;
      s.cycle = 'exposed'; s.cycleT = 0; s.left = cfg.exposedS + (s.parried ? cfg.parryBonusS : 0); ev.push('exposed');
      break;
    case 'exposed': ev.push('exposedEnd'); s.cycle = 'idle'; s.cycleT = 0; s.left = bigEvery(s.phase, cfg); break;
    case 'stagger': s.cycle = 'idle'; s.cycleT = 0; s.left = Math.min(bigEvery(s.phase, cfg), 6); break;
  }
  return ev;
}
/** A Strike landed: while exposed, the first one extends the window. Returns true if it did. */
export function strikeBoss(s: BossState, cfg: BossCfg = DEFAULT_BOSS): boolean {
  if (s.cycle !== 'exposed' || s.struck) return false;
  s.struck = true; s.left += cfg.strikeBonusS; return true;
}

/** A sprint started while the boss is idle breaks its guard: a short Exposed window right now
 *  (the next big attack is pushed back by the normal idle gap). Returns true if it broke. */
export function sprintBreak(s: BossState, breakS: number, cfg: BossCfg = DEFAULT_BOSS): boolean {
  if (s.cycle !== 'idle' || breakS <= 0) return false;
  void cfg;
  s.cycle = 'exposed'; s.cycleT = 0; s.left = breakS; s.parried = false; s.struck = false;
  return true;
}
