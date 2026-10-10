import type { SectionKind } from '../../../contracts';
export type CraftId = 'cruiser' | 'escort';
export interface SfSave {
  v: 3; best: number; legacyBest: number; runs: number; onTargetS: number; unlockCredit: number;
  craft: CraftId; totals: { kills: number; bosses: number }; legacy?: Record<string, unknown>;
}
export interface EnemyView {
  id: number; kind: 'drone' | 'armor' | 'weaver' | 'gunner' | 'turret' | 'tank' | 'boss';
  parentId?: number; mountX?: number; ground?: boolean; heading?: number;
  entry?: { fromX: number; fromY: number; toX: number; toY: number; duration: number };
  x: number; y: number; hp: number; maxHp: number; age: number; fireAt: number; bossStyle: number;
}
export interface ShotView { id: number; x: number; y: number; vx: number; vy: number; damage: number; kind: 'pulse' | 'missile' | 'wing' }
export interface LaserView { id: number; targetId: number; sx: number; sy: number; x: number; y: number; at: number; side: number; height: number; damage: number; hit: boolean }
export interface BoltView { id: number; kind: 'pink' | 'amber'; height: number; x: number; y: number; vx: number; vy: number }
export interface FxView { id: number; x: number; y: number; at: number; size?: number; ground?: boolean; kind: 'boom' | 'intercept' | 'nova' | 'upgrade' }
export interface SfSnapshot {
  t: number; phase: 'hangar' | 'run'; done: boolean; craft: CraftId; escortUnlocked: boolean; ergAvailable: boolean; unlockMinutes: number;
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
  hooks: { powerFtp: number; cadence: number; boss: boolean };
}
