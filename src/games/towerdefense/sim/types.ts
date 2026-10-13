// Snapshot view-model shared by the sim, renderer and tests. Plain data only.
import type { Element, Kind, TowerKind, Weapon } from './defs';
import type { UpgradeId } from './meta';

export interface EnemyView {
  id: number; kind: Kind; lane: number; x: number; y: number; angle: number; dist: number; radius: number;
  /** Current weakness: fixed colour, a prism's current colour, or a boss's shield colour. */
  element: Element; gold: boolean; hp: number; maxHp: number; hurt: number;
  charging: boolean; /** seconds until a boss / prism changes colour, and the colour it changes to */
  shiftIn: number; next: Element | null; progress: number;
}
export type Fx =
  | { id: number; t0: number; life: number; kind: 'tracer'; x0: number; y0: number; x1: number; y1: number; hit: boolean }
  | { id: number; t0: number; life: number; kind: 'beam'; angle: number; spread: boolean }
  | { id: number; t0: number; life: number; kind: 'zap'; pts: Array<{ x: number; y: number }> }
  | { id: number; t0: number; life: number; kind: 'lens'; x0: number; y0: number; x1: number; y1: number }
  | { id: number; t0: number; life: number; kind: 'boom'; x: number; y: number; r: number }
  | { id: number; t0: number; life: number; kind: 'death'; x: number; y: number; color: Element | 'gold'; big: boolean }
  | { id: number; t0: number; life: number; kind: 'text'; x: number; y: number; text: string; color: string }
  | { id: number; t0: number; life: number; kind: 'emp' }
  | { id: number; t0: number; life: number; kind: 'baseHit'; dmg: number };
export interface ShellView { x0: number; y0: number; x1: number; y1: number; k: number }
export interface TowerView { pad: number; kind: TowerKind; level: number; angle: number; charge: number; firedAt: number }
export interface WorkshopRow { kind: 'build' | 'upgrade' | 'sell' | 'repair'; tower?: TowerKind; label: string; desc: string; cost: number; affordable: boolean }
export interface WorkshopView { pad: number; row: number; rows: WorkshopRow[]; idleLeft: number }
export interface GarageRow { kind: 'start' | 'upgrade' | 'auto'; id?: UpgradeId; name: string; desc: string; level?: number; max?: number; cost?: number; affordable?: boolean }
export interface GarageView { bank: number; sel: number; rows: GarageRow[]; startWave: number; maxStartWave: number; autoLeft: number; autoS: number; autoInvest: boolean; bestWave: number; runs: number }
export interface SurgeView { state: 'active' | 'won' | 'failed'; progress: number; needS: number; leftS: number; zone: number; t0: number }
export interface SpinView { state: 'active' | 'won' | 'failed'; held: number; needS: number; leftS: number; rpm: number; t0: number }
export interface Banner { text: string; sub: string; color: string; t0: number; big: boolean }
export type TrainerMode = 'sim' | 'resistance' | 'erg';
/** A wave's brood: its main colour, the turret weapon it calls for, and that weapon's trainer mode. */
export interface BroodInfo {
  wave: number; color: Element; weapon: Weapon; mode: TrainerMode;
  /** trainer setting, e.g. 'resistance 35%' */ setting: string;
  /** one-line riding cue, e.g. 'grind 70–80 rpm' */ cue: string;
}
/** The current (or, during the lull, the coming) wave's brood; `countdownS` = lull seconds left (0 once the wave is on). */
export interface BroodView extends BroodInfo { countdownS: number; lullS: number; rampS: number }
export type LaneForecast = Record<Element | 'gold' | 'prism', number>;

export interface TdSnapshot {
  t: number; phase: 'garage' | 'run'; garage: GarageView | null;
  wave: number; waveElapsed: number; waveMaxS: number; wavesSurvived: number; lull: number; grace: number;
  forecast: { wave: number; boss: boolean; mainLane: number; lanes: LaneForecast[] };
  brood: BroodView; nextBrood: BroodInfo | null;
  baseHp: number; baseMaxHp: number; cores: number; coresMax: number; baseHurt: number;
  /** read-only: follows `brood.weapon` */
  weapon: Weapon; swapLeft: number; swapS: number;
  aimAngle: number; autoAim: boolean; lane: number; targetId: number;
  railCharges: number; railMaxCharges: number; railProgress: number; railCharging: boolean; zHold: number; railDumpHoldS: number;
  flaming: boolean; flameRange: number; flameHalfAngle: number; flamePower: number; /** enemy the rail's targeting laser is burning (0 = none) */ laserId: number;
  grid: number; overdrive: boolean;
  surge: SurgeView | null;
  /** cadence drill; `overclock` = seconds of double Gatling fire left */
  spin: SpinView | null; overclock: number;
  scrap: number; partsRun: number; bank: number;
  towers: TowerView[]; shells: ShellView[]; workshop: WorkshopView | null;
  enemies: EnemyView[]; fx: Fx[]; banner: Banner | null;
  cues: Array<{ name: string; id: number }>;
  over: boolean; bestWave: number;
  kills: Record<string, number>;
  hooks: { storm: boolean; surge: boolean };
}
