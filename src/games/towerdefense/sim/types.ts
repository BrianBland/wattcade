// Snapshot view-model shared by the sim, renderer and tests. Plain data only.
import type { Element, Kind, Matchup, TowerKind, Weapon } from './defs';
import type { UpgradeId } from './meta';
import type { EffortKind, EffortView } from './efforts';
import type { BuildSuggestion } from './construction';

export type ActionId = 'rail' | 'overcharge' | 'slow';
export interface ActionView { id: ActionId; fill: number; ready: boolean; usable: boolean; activeS: number }

/** How a hit landed under the matchup matrix. */
export type HitClass = 'strong' | 'neutral' | 'resisted';
export interface EnemyView {
  id: number; kind: Kind; lane: number; x: number; y: number; angle: number; dist: number; radius: number;
  /** Current element: fixed colour, a prism's current colour, or a boss's phase colour. */
  element: Element; gold: boolean; hp: number; maxHp: number; hurt: number;
  charging: boolean; /** seconds until a boss / prism changes colour, and the colour it changes to */
  shiftIn: number; next: Element | null; progress: number;
  bossPhase: number; telegraph: boolean; exposed: boolean; staggerS: number;
  /** last hit (sim time), its matchup class and the damage dealt that tick: renderer hit feedback */
  hitT: number; hitCls: HitClass; hitDmg: number;
}
export type Fx =
  | { id: number; t0: number; life: number; kind: 'tracer'; x0: number; y0: number; x1: number; y1: number; hit: boolean }
  | { id: number; t0: number; life: number; kind: 'beam'; angle: number; spread: boolean }
  | { id: number; t0: number; life: number; kind: 'zap'; pts: Array<{ x: number; y: number }> }
  | { id: number; t0: number; life: number; kind: 'lens'; x0: number; y0: number; x1: number; y1: number }
  | { id: number; t0: number; life: number; kind: 'boom'; x: number; y: number; r: number }
  /** an ignition burst; `chain` groups bursts from one fire kill, `ordinal` counts them (1, 2, …) */
  | { id: number; t0: number; life: number; kind: 'burst'; x: number; y: number; r: number; chain: number; ordinal: number }
  | { id: number; t0: number; life: number; kind: 'hitStop'; seconds: number }
  /** the boss arrives: the renderer plays its name card (the HUD banner stays quiet meanwhile) */
  | { id: number; t0: number; life: number; kind: 'bossIntro'; wave: number }
  /** a called effort resolved: won = set-piece payoff, lost = a quiet 'missed' note */
  | { id: number; t0: number; life: number; kind: 'payoff'; effort: EffortKind; won: boolean }
  /** `eid`/`ekind`: the alien that died (renderer leaves its corpse); `fire`: its last hit was fire (red brood bursts). */
  | { id: number; t0: number; life: number; kind: 'death'; x: number; y: number; color: Element | 'gold'; big: boolean; eid: number; ekind: Kind; fire: boolean }
  | { id: number; t0: number; life: number; kind: 'text'; x: number; y: number; text: string; color: string }
  | { id: number; t0: number; life: number; kind: 'emp' }
  | { id: number; t0: number; life: number; kind: 'baseHit'; dmg: number };
export interface ShellView { x0: number; y0: number; x1: number; y1: number; k: number }
export interface TowerView { pad: number; kind: TowerKind; level: number; angle: number; charge: number; firedAt: number }
export interface WorkshopRow { kind: 'build' | 'upgrade' | 'sell' | 'repair' | 'crew'; tower?: TowerKind; label: string; desc: string; cost: number; affordable: boolean }
export interface WorkshopView { pad: number; row: number; rows: WorkshopRow[]; idleLeft: number; revision: number }
export interface GarageRow { kind: 'start' | 'upgrade' | 'auto'; id?: UpgradeId; name: string; desc: string; level?: number; max?: number; cost?: number; affordable?: boolean }
export interface GarageView { breatherLeft: number; bank: number; sel: number; rows: GarageRow[]; startWave: number; maxStartWave: number; autoLeft: number; autoS: number; autoInvest: boolean; bestWave: number; runs: number }
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
export interface BossView {
  id: number; phase: number; phaseCount: number; color: Element; weapon: Weapon;
  next: Element | null; countdownS: number; telegraph: boolean; exposed: boolean; windowLeftS: number;
  /** Optional hold-Up / touch ERG push, preserving the phase's trainer mode; A stays construction. */
  sprintBoost: boolean;
}

export interface TdSnapshot {
  t: number; phase: 'garage' | 'run'; garage: GarageView | null;
  wave: number; waveElapsed: number; waveMaxS: number; wavesSurvived: number; lull: number;
  forecast: { wave: number; boss: boolean; mainLane: number; lanes: LaneForecast[] };
  brood: BroodView; nextBrood: BroodInfo | null;
  boss: BossView | null; matchup: Matchup;
  effort: EffortView | null;
  baseHp: number; baseMaxHp: number; baseHurt: number;
  /** read-only: follows `brood.weapon` */
  weapon: Weapon; swapLeft: number; swapS: number;
  /** the turret always aims itself; `nudge` = the rider's decaying lane bias (k 1 → 0), null when none */
  aimAngle: number; targetId: number; nudge: { lane: number; k: number } | null;
  railCharges: number; railMaxCharges: number; railProgress: number; railCharging: boolean; zHold: number; railDumpHoldS: number;
  flaming: boolean; flameRange: number; flameHalfAngle: number; flamePower: number; /** enemy the rail's targeting laser is burning (0 = none) */ laserId: number;
  grid: number; overdrive: boolean; /** dynamo stalled (rider stopped): shields down, leaks hit harder */ stalled: boolean;
  surge: SurgeView | null;
  /** cadence drill; `overclock` = seconds of double Gatling fire left */
  spin: SpinView | null; overclock: number;
  scrap: number; partsRun: number; bank: number;
  autoCrew: boolean; suggestion: BuildSuggestion | null; constructionDone: boolean;
  actions: ActionView[]; refill: number; slowLane: number;
  /** Changes when a menu opens/closes; stale touch captures must not dispatch into a new context. */
  inputEpoch: number;
  towers: TowerView[]; shells: ShellView[]; workshop: WorkshopView | null;
  enemies: EnemyView[]; fx: Fx[]; banner: Banner | null;
  cues: Array<{ name: string; id: number }>;
  over: boolean; bestWave: number;
  kills: Record<string, number>;
  hooks: { storm: boolean; surge: boolean; cadence?: number; powerFtp?: number; shielded: boolean };
}
