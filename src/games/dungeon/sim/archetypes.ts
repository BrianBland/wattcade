// Hero Archetypes (pure, deterministic).
// Each archetype couples a cycling workout profile (DirectorCfg overrides in both ERG and Grade)
// with a distinct combat silhouette, weapon family, and 3 Diablo-style skill trees.
import type { DirectorCfg, Seg, SegTarget } from './director';
import type { WeaponStyle } from './loot';

export type ArchetypeId = 'rouleur' | 'puncheur' | 'grimpeur';
export type HeroChassis = 'vanguard' | 'skirmisher' | 'arcanist' | 'ranger';
export type JerseyKit = 'yellow' | 'green' | 'polka' | 'rainbow';

export interface ArchetypeDef {
  id: ArchetypeId;
  name: string;
  shortName: string;
  subtitle: string;
  jersey: string;
  kit: JerseyKit;
  chassis: HeroChassis;
  color: string;
  workoutTag: string;
  ergLabel: string;
  gradeLabel: string;
  cadenceSweet: [number, number];
  pitch: string;
  unlockedDefault: boolean;
  unlockReq: string;
  weaponStyles: WeaponStyle[];
  starterStyle: WeaponStyle;
  hpMult: number;
  dmgTaken: number;
  moveMult: number;
  strafe: number;
  standoff(base: number): number;
  /** Workout profile overrides applied over base DirectorCfg tunables. */
  director: {
    ambushS?: number;
    recoverS?: number;
    spinRpm?: number;
    targets: Partial<Record<Seg, Partial<Pick<SegTarget, 'erg' | 'grade' | 'zone' | 'label'>>>>;
  };
  /** 12-point preview curves for Camp workout intensity visualization. */
  profileErg: readonly number[];
  profileGrade: readonly number[];
  relicName: string;
  relicBranchIndex: number;
}

export const ARCHETYPES: Record<ArchetypeId, ArchetypeDef> = {
  rouleur: {
    id: 'rouleur',
    name: 'The Rouleur',
    shortName: 'Rouleur',
    subtitle: 'Endurance Diesel · Aura Knight',
    jersey: 'Yellow Jersey',
    kit: 'yellow',
    chassis: 'vanguard',
    color: '#ffd84a',
    workoutTag: 'Z2-Z3 Steady Base',
    ergLabel: '62-94% FTP',
    gradeLabel: '0.5-4.0%',
    cadenceSweet: [80, 95],
    pitch: 'Smooth Zone 2/tempo base ride. High HP, Ward parries, thorns, orbiting chainrings, and deep bidon sustain.',
    unlockedDefault: true,
    unlockReq: 'Unlocked from start',
    weaponStyles: ['bolt', 'pellet', 'axe'],
    starterStyle: 'bolt',
    hpMult: 1.1,
    dmgTaken: 0.92,
    moveMult: 1.0,
    strafe: 0.45,
    standoff: (b) => Math.max(3.2, Math.min(b, 4.5)),
    director: {
      ambushS: 44,
      recoverS: 60,
      spinRpm: 95,
      targets: {
        warmup: { erg: 0.5, grade: -1, label: 'Warm up' },
        explore: { erg: 0.65, grade: 0.5, zone: [2, 2], label: 'Diesel Base: Z2' },
        ambush: { erg: 0.88, grade: 3.0, zone: [3, 4], label: 'Tempo Ambush: Z3-4' },
        recover: { erg: 0.55, grade: -1, label: 'Recover: Z1-2' },
        spinup: { erg: 0.65, grade: -1, label: 'Cadence Spin! >95 rpm' },
        boss: { erg: 0.94, grade: 4.0, zone: [3, 4], label: 'Boss: Steady Tempo' },
        cooldown: { erg: 0.5, grade: -1, label: 'Cool down' },
      },
    },
    profileErg: [52, 64, 66, 86, 60, 66, 68, 88, 60, 92, 94, 52],
    profileGrade: [0, 0.5, 1.0, 3.0, 0, 0.5, 1.0, 3.2, 0, 3.8, 4.0, 0],
    relicName: 'Chainring of the Peloton',
    relicBranchIndex: 0,
  },
  puncheur: {
    id: 'puncheur',
    name: 'The Puncheur',
    shortName: 'Puncheur',
    subtitle: 'Crit Sprinter · Storm Assassin',
    jersey: 'Green Jersey',
    kit: 'green',
    chassis: 'skirmisher',
    color: '#6dff8a',
    workoutTag: 'Z2 Cruise + Z5 Sprints',
    ergLabel: '58-118% FTP',
    gradeLabel: '0.0-5.5%',
    cadenceSweet: [90, 108],
    pitch: 'Polarized crit ride: easy Z2 cruise punctuated by short explosive Z5 sprints, chain lightning, and crit cascades.',
    unlockedDefault: true,
    unlockReq: 'Unlocked from start',
    weaponStyles: ['spark', 'star', 'knife', 'bolt'],
    starterStyle: 'spark',
    hpMult: 0.94,
    dmgTaken: 1.0,
    moveMult: 1.1,
    strafe: 0.9,
    standoff: (b) => Math.max(3.6, Math.min(b, 5.2)),
    director: {
      ambushS: 26,
      recoverS: 55,
      spinRpm: 105,
      targets: {
        warmup: { erg: 0.5, grade: -1, label: 'Warm up' },
        explore: { erg: 0.58, grade: 0, zone: [2, 2], label: 'Cruise: Easy Z2' },
        ambush: { erg: 1.12, grade: 5.5, zone: [4, 5], label: 'Sprint Ambush! Z4-5' },
        recover: { erg: 0.52, grade: -1, label: 'Recover: Soft pedal' },
        spinup: { erg: 0.62, grade: -1, label: 'Crit Spin-Up! >105 rpm' },
        boss: { erg: 1.04, grade: 4.5, zone: [4, 5], label: 'Boss: Sprint Punches' },
        cooldown: { erg: 0.48, grade: -1, label: 'Cool down' },
      },
    },
    profileErg: [50, 58, 114, 54, 60, 118, 52, 58, 112, 104, 118, 48],
    profileGrade: [0, 0, 5.2, 0, 0.5, 5.5, 0, 0, 5.0, 4.5, 5.5, 0],
    relicName: 'Spark-Plug Cassette',
    relicBranchIndex: 0,
  },
  grimpeur: {
    id: 'grimpeur',
    name: 'The Grimpeur',
    shortName: 'Grimpeur',
    subtitle: 'Mountain Goat · Molten Siege',
    jersey: 'Polka-Dot Jersey',
    kit: 'polka',
    chassis: 'arcanist',
    color: '#ff6e5a',
    workoutTag: 'Z3-Z4 Sustained Climbs',
    ergLabel: '72-106% FTP',
    gradeLabel: '2.0-7.5%',
    cadenceSweet: [60, 78],
    pitch: 'Climbing workout: longer, steeper climbs where low-cadence heavy torque fuels molten slams, burn novas, and boss executes.',
    unlockedDefault: false,
    unlockReq: 'Reach Floor 4 or finish 10 climbs',
    weaponStyles: ['flame', 'orb', 'arrow', 'spear'],
    starterStyle: 'flame',
    hpMult: 1.12,
    dmgTaken: 0.88,
    moveMult: 0.98,
    strafe: 0.42,
    standoff: (b) => Math.min(b, 3.4),
    director: {
      ambushS: 50,
      recoverS: 60,
      spinRpm: 92,
      targets: {
        warmup: { erg: 0.54, grade: 0.5, label: 'Warm up' },
        explore: { erg: 0.72, grade: 2.0, zone: [2, 3], label: 'False Flat: Z2-3' },
        ambush: { erg: 0.98, grade: 6.5, zone: [3, 4], label: 'Steep Climb! Z3-4' },
        recover: { erg: 0.58, grade: 0.5, label: 'Crest Recovery' },
        spinup: { erg: 0.68, grade: 0.5, label: 'Shake Out! >92 rpm' },
        boss: { erg: 1.06, grade: 7.5, zone: [4, 4], label: 'Summit Boss: HC Climb' },
        cooldown: { erg: 0.52, grade: 0, label: 'Descent cool down' },
      },
    },
    profileErg: [54, 72, 96, 98, 62, 76, 98, 100, 64, 104, 106, 52],
    profileGrade: [0.5, 2.0, 6.2, 6.5, 0.5, 2.5, 6.5, 6.8, 1.0, 7.2, 7.5, 0],
    relicName: 'Polka-Dot Censer',
    relicBranchIndex: 0,
  },
};

export const ARCHETYPE_ORDER: readonly ArchetypeId[] = ['rouleur', 'puncheur', 'grimpeur'];

export interface FutureArchetypeTeaser {
  name: string;
  role: string;
  workout: string;
  unlockHint: string;
}

export const FUTURE_ARCHETYPES: readonly FutureArchetypeTeaser[] = [
  { name: 'Time Trialist', role: 'Aero Arcanist', workout: 'Threshold Z3-Z4 Steady', unlockHint: 'Hold Z3+ for 8 min' },
  { name: 'Domestique', role: 'Lead-Out Summoner', workout: 'High-Cadence 95+ rpm', unlockHint: 'Avg 95+ rpm on a floor' },
  { name: 'Gravel Nomad', role: 'Frost/Venom Trapper', workout: 'Variable Rolling Surges', unlockHint: 'Clear Cat 4 descent' },
  { name: 'Track Sprinter', role: 'HIIT Blood Berserker', workout: 'Tabata Micro-HIIT', unlockHint: 'Fired Up 12× in one run' },
];

export interface UnlockProgress {
  bestFloor: number;
  climbs: number;
}

export const GRIMPEUR_FLOOR_GOAL = 4;
export const GRIMPEUR_CLIMB_GOAL = 10;

export function isArchetypeUnlocked(id: ArchetypeId, p: UnlockProgress): boolean {
  if (ARCHETYPES[id].unlockedDefault) return true;
  return p.bestFloor >= GRIMPEUR_FLOOR_GOAL || p.climbs >= GRIMPEUR_CLIMB_GOAL;
}

export function unlockedArchetypes(p: UnlockProgress): ArchetypeId[] {
  return ARCHETYPE_ORDER.filter((id) => isArchetypeUnlocked(id, p));
}

export function grimpeurProgress(p: UnlockProgress): {
  unlocked: boolean;
  climbs: number;
  climbGoal: number;
  floor: number;
  floorGoal: number;
  pct: number;
} {
  const unlocked = isArchetypeUnlocked('grimpeur', p);
  const floorPct = Math.min(1, Math.max(0, (p.bestFloor - 1) / (GRIMPEUR_FLOOR_GOAL - 1)));
  const climbPct = Math.min(1, Math.max(0, p.climbs / GRIMPEUR_CLIMB_GOAL));
  return {
    unlocked,
    climbs: p.climbs,
    climbGoal: GRIMPEUR_CLIMB_GOAL,
    floor: p.bestFloor,
    floorGoal: GRIMPEUR_FLOOR_GOAL,
    pct: unlocked ? 1 : Math.max(floorPct, climbPct),
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Derive the effective DirectorCfg for an archetype.
 * Applies cleanly to both ERG targets and Grade offsets while keeping warmup/cooldown safe.
 */
export function archetypeDirectorCfg(base: DirectorCfg, archId: ArchetypeId): DirectorCfg {
  const arch = ARCHETYPES[archId];
  const targets = {} as Record<Seg, SegTarget>;
  for (const seg of Object.keys(base.targets) as Seg[]) {
    const b = base.targets[seg];
    const ov = arch.director.targets[seg];
    const rawErg = ov?.erg ?? b.erg;
    const rawGrade = ov?.grade ?? b.grade;
    targets[seg] = {
      ...b,
      ...(ov ?? {}),
      erg: Number(clamp(rawErg, 0.42, 1.4).toFixed(2)),
      grade: Number(clamp(rawGrade, -3, 11).toFixed(1)),
    };
  }
  return {
    ...base,
    ambushS: arch.director.ambushS ?? base.ambushS,
    recoverS: arch.director.recoverS ?? base.recoverS,
    spinRpm: arch.director.spinRpm ?? base.spinRpm,
    targets,
  };
}
