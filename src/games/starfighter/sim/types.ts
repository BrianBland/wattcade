import type { SectionKind } from '../../../contracts';
export type CraftId = 'cruiser' | 'escort';
export interface SfSave {
  v: 3; best: number; legacyBest: number; runs: number; onTargetS: number; unlockCredit: number;
  craft: CraftId; totals: { kills: number; bosses: number }; legacy?: Record<string, unknown>;
  /** On-target seconds flown in each craft (craft levels), and craft unlocked so far (sticky). */
  craftS: Record<CraftId, number>; unlocked: CraftId[];
}
export interface EnemyView {
  id: number; kind: 'drone' | 'armor' | 'weaver' | 'gunner' | 'turret' | 'tank' | 'boss';
  parentId?: number; mountX?: number; ground?: boolean; heading?: number;
  /** Formation this enemy entered with (clear-rate tracking). */
  formation?: number;
  /** Elite wings cross the far field and leave; only a rider who targets them can clear them. */
  elite?: boolean; fled?: boolean;
  /** 0..1 muzzle charge shown before the enemy fires. */
  warn?: number;
  entry?: { fromX: number; fromY: number; toX: number; toY: number; duration: number };
  x: number; y: number; hp: number; maxHp: number; age: number; fireAt: number; bossStyle: number;
}
export interface ShotView { id: number; x: number; y: number; vx: number; vy: number; damage: number; kind: 'pulse' | 'missile' | 'wing' }
export interface LaserView { id: number; targetId: number; sx: number; sy: number; x: number; y: number; at: number; hitAt: number; side: number; height: number; damage: number; hit: boolean }
export interface BoltView { id: number; kind: 'pink' | 'amber'; height: number; x: number; y: number; vx: number; vy: number; grazed?: boolean; /** Part of a gated wall: drawn larger. */ wall?: boolean }
export interface FxView { id: number; x: number; y: number; at: number; size?: number; ground?: boolean; kind: 'boom' | 'intercept' | 'nova' | 'upgrade' | 'graze' | 'perfect' | 'beam' }
export interface SfSnapshot {
  t: number; phase: 'hangar' | 'run';
  /** Downbeat pulse (1 at a bar line, decaying), alongside `beat`. */
  bar: number;
  /** Selected formation (paddles cycle formations), and where an untargeted elite wing is relative to it. */
  selectedGroup: number | null; eliteHint: -1 | 0 | 1; elites: { cleared: number; seen: number }; done: boolean; craft: CraftId; escortUnlocked: boolean; ergAvailable: boolean;
  /** Persistent craft progress (hangar + HUD); `tester` = everything unlocked for playtesting. */
  crafts: Record<CraftId, { level: number; progress: number; next: string | null; unlocked: boolean }>; tester: boolean;
  heavy: boolean; ace: boolean; fullLock: number; eaten: number;
  menuLeft: number; sector: number; sectorName: string; section: SectionKind; intensity: number; beat: number;
  song: string; shipX: number; shipY: number; bank: number; dodge: number; hull: number; shield: number; quality: number;
  effort: { status: 'on' | 'under' | 'over' | 'recover' | 'settling'; targetWatts: number; floorWatts: number; ceilingWatts: number; erg: boolean };
  upcoming: { label: string; left: number; watts: number } | null;
  cadence: { min: number; max: number; left: number; progress: number } | null;
  charge: number; coverLeft: number; rejoinLeft: number; gunLevel: number; wingmen: number; missiles: boolean;
  score: number; kills: number; salvage: number; combo: number; deaths: number;
  selectedId: number | null; locks: number[]; lockCapacity: number; lockProgress: number; volleyFlash: number; lasers: LaserView[];
  enemies: EnemyView[]; shots: ShotView[]; bolts: BoltView[]; fx: FxView[];
  boss: { name: string; stage: string; hp: number; maxHp: number; left: number } | null;
  bossIn: number | null; banner: string;
  /** Ride clear rate over resolved formations, perfect formations, and the most recently resolved formation. */
  clear: { rate: number; perfects: number; streak: number; last: { pct: number; perfect: boolean; at: number } | null };
  hooks: { powerFtp: number; cadence: number; boss: boolean };
}
