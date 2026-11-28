// Pure diegetic combat status effects & terrain effort physics for Purgatour.
// Heavy encounters and enemy hits (Slimed, Headwind, Crippled) introduce real cycling drag/grade
// (and matched ERG wattage demand), and pushing real watts overcomes the drag rather than gearing down.

export type StatusKind = 'slimed' | 'headwind' | 'crippled';

export interface StatusDef {
  kind: StatusKind;
  label: string;
  color: string;
  gradeAdd: number;      // extra trainer grade % while active
  ergAdd: number;        // extra ERG FTP fraction while active
  demandedFtp: number;   // FTP fraction needed to power cleanly through this debuff
  moveSlow: number;      // base move-speed penalty when soft-pedaling (0..0.5)
  rollCdMult: number;    // dodge-roll cooldown multiplier while afflicted
  desc: string;
}

export const STATUS_DEFS: Record<StatusKind, StatusDef> = {
  slimed: {
    kind: 'slimed',
    label: 'SLIMED',
    color: '#6dff6d',
    gradeAdd: 2.5,
    ergAdd: 0.08,
    demandedFtp: 0.76,
    moveSlow: 0.26,
    rollCdMult: 1.2,
    desc: 'Sticky gel drag - push watts to pull free',
  },
  headwind: {
    kind: 'headwind',
    label: 'HEADWIND',
    color: '#88ddff',
    gradeAdd: 3.0,
    ergAdd: 0.1,
    demandedFtp: 0.82,
    moveSlow: 0.22,
    rollCdMult: 1.1,
    desc: 'Gale resistance - dig in to push forward',
  },
  crippled: {
    kind: 'crippled',
    label: 'CRIPPLED',
    color: '#ff6e7a',
    gradeAdd: 2.0,
    ergAdd: 0.07,
    demandedFtp: 0.74,
    moveSlow: 0.28,
    rollCdMult: 1.4,
    desc: 'Heavy legs - hold power to stay upright',
  },
};

export interface StatusEffectView {
  kind: StatusKind;
  label: string;
  color: string;
  leftS: number;
  totalS: number;
  gradeAdd: number;
}

export type StatusTimers = Record<StatusKind, { left: number; total: number }>;

export function emptyStatuses(): StatusTimers {
  return {
    slimed: { left: 0, total: 0 },
    headwind: { left: 0, total: 0 },
    crippled: { left: 0, total: 0 },
  };
}

export function applyStatus(st: StatusTimers, kind: StatusKind, durS: number): boolean {
  const wasActive = st[kind].left > 0;
  st[kind].left = Math.max(st[kind].left, durS);
  st[kind].total = Math.max(st[kind].total, durS);
  return !wasActive;
}

export function tickStatuses(st: StatusTimers, dt: number): void {
  for (const k of ['slimed', 'headwind', 'crippled'] as const) {
    if (st[k].left > 0) {
      st[k].left = Math.max(0, st[k].left - dt);
      if (st[k].left === 0) st[k].total = 0;
    }
  }
}

export function activeStatusViews(st: StatusTimers): StatusEffectView[] {
  const out: StatusEffectView[] = [];
  for (const k of ['slimed', 'headwind', 'crippled'] as const) {
    if (st[k].left > 0.05) {
      const d = STATUS_DEFS[k];
      out.push({ kind: k, label: d.label, color: d.color, leftS: st[k].left, totalS: Math.max(0.5, st[k].total), gradeAdd: d.gradeAdd });
    }
  }
  return out;
}

export interface TerrainLoad {
  /** Extra grade % contributed by active combat statuses + heavy encounters (above base road). */
  extraGrade: number;
  /** Extra ERG FTP fraction contributed by active statuses + heavy encounters. */
  extraErg: number;
  /** Power (FTP fraction) required to ride at full speed & damage without bogging down. */
  demandedFtp: number;
  /** Hero movement speed multiplier accounting for power vs terrain/status drag (0.45..1.1). */
  moveMult: number;
  /** Outgoing damage multiplier accounting for pushing through terrain vs soft-pedaling (0.5..1.18). */
  dmgMult: number;
  /** Dodge-roll cooldown multiplier from crippling effects. */
  rollCdMult: number;
  /** True when rider is bogging down significantly below the terrain's power demand. */
  bogged: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Compute diegetic terrain load and rider effort response.
 * Heavy encounters (elites, ambushes, multi-phase boss climbs) and enemy-inflicted status debuffs
 * add tangible resistance; gearing down and soft-pedaling below `demandedFtp` bogs the hero down
 * so enemies close in, while putting down real watts powers cleanly through. Pure.
 */
export function evaluateTerrainLoad(i: {
  statuses: StatusTimers;
  baseErg: number;
  inCombat: boolean;
  hasElite: boolean;
  isAmbush: boolean;
  bossActive: boolean;
  bossPhase: 1 | 2 | 3;
  ftpFraction: number;
}): TerrainLoad {
  let extraGrade = 0;
  let extraErg = 0;
  let demandedFtp = i.inCombat ? Math.max(0.58, i.baseErg) : 0.45;
  let baseSlow = 0;
  let rollCdMult = 1;

  // Heavy encounter terrain (boss climbs start on the base climb in Phase 1 and steepen across Phases 2 & 3)
  if (i.bossActive) {
    const phaseGrade = i.bossPhase === 3 ? 3.5 : i.bossPhase === 2 ? 1.8 : 0;
    const phaseErg = i.bossPhase === 3 ? 0.12 : i.bossPhase === 2 ? 0.06 : 0;
    extraGrade += phaseGrade;
    extraErg += phaseErg;
    demandedFtp = Math.max(demandedFtp, 0.70 + (i.bossPhase - 1) * 0.08);
  } else if (i.isAmbush) {
    // Ambush already steps up the director's base grade/ERG; enforce high power demand so soft-pedaling bogs down
    demandedFtp = Math.max(demandedFtp, 0.82);
  } else if (i.hasElite) {
    extraGrade += 1.5;
    extraErg += 0.06;
    demandedFtp = Math.max(demandedFtp, 0.76);
  }

  // Diegetic enemy status debuffs
  for (const k of ['slimed', 'headwind', 'crippled'] as const) {
    if (i.statuses[k].left > 0) {
      const d = STATUS_DEFS[k];
      extraGrade += d.gradeAdd;
      extraErg += d.ergAdd;
      demandedFtp = Math.max(demandedFtp, d.demandedFtp);
      baseSlow = Math.max(baseSlow, d.moveSlow);
      rollCdMult = Math.max(rollCdMult, d.rollCdMult);
    }
  }

  // Cap combined extras so trainers stay rideable
  extraGrade = Math.min(7.5, extraGrade);
  extraErg = Math.min(0.32, extraErg);

  // Power-vs-terrain response: matching or exceeding demandedFtp overcomes status drag!
  const ratio = demandedFtp > 0 ? i.ftpFraction / demandedFtp : 1;
  // When ratio < 1 (soft-pedaling on a climb/debuff), hero bogs down; when ratio >= 1.05, powers right through
  const effortFactor = clamp(ratio, 0.45, 1.25);
  const slowMitigation = clamp((ratio - 0.72) / 0.38, 0, 1); // hitting ~110% of demand cancels status slow
  const effectiveSlow = baseSlow * (1 - slowMitigation * 0.88);
  const hillSlow = i.inCombat && ratio < 0.85 ? (0.85 - ratio) * 0.55 : 0;
  const moveMult = clamp(1 - effectiveSlow - hillSlow, 0.46, 1.08);

  // Damage response: soft-pedaling below heavy terrain demand penalizes punch; digging in rewards output
  const dmgMult = !i.inCombat
    ? 1
    : ratio < 0.82
      ? clamp(0.55 + (ratio / 0.82) * 0.45, 0.52, 1)
      : clamp(1 + (effortFactor - 0.95) * 0.55, 0.96, 1.18);

  return {
    extraGrade: Number(extraGrade.toFixed(1)),
    extraErg: Number(extraErg.toFixed(2)),
    demandedFtp: Number(demandedFtp.toFixed(2)),
    moveMult,
    dmgMult,
    rollCdMult,
    bogged: i.inCombat && ratio < 0.78 && (extraGrade >= 1.5 || baseSlow > 0),
  };
}
