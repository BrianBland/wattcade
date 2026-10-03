import type { BossKind, EKind, PowerKind } from './content';
import type { UpgradeId } from './meta';

export type Side = 'L' | 'R';
export type Stage = 'cruise' | 'attack' | 'boss' | 'warp';

export interface EnemyView {
  id: number; kind: EKind; x: number; y: number; r: number; hp: number; maxHp: number;
  golden: boolean; hurt: number; tell: number; // tell 0..1 = wind-up before a dive / shot / lance
  boss?: BossKind; part?: 'core' | 'L' | 'R'; diving?: boolean;
}
export interface ShotView { x: number; y: number; vx: number; vy: number; kind: 'shot' | 'missile' | 'wing'; side: Side }
export interface HazardView { kind: 'rock' | 'bolt' | 'orb'; x: number; y: number; r: number; spin: number }
export interface LanceView { x: number; w: number; tell: number; active: boolean; y0: number }
export interface DropView { id: number; kind: 'scrap' | 'power'; power?: PowerKind; x: number; y: number; value: number }
export interface FxView {
  id: number; kind: 'boom' | 'spark' | 'text' | 'nova' | 'pickup' | 'hurt' | 'muzzle';
  x: number; y: number; t0: number; color: string; size: number; text?: string;
}
export interface Banner { text: string; sub?: string; color: string; t0: number; life: number }
export interface ToastView { text: string; color: string; t0: number }
export interface HangarRow {
  kind: 'launch' | 'upgrade' | 'auto';
  id?: UpgradeId; name: string; desc: string; level?: number; max?: number; cost?: number; affordable?: boolean;
}
export interface HangarView {
  bank: number; sel: number; rows: HangarRow[]; startSector: number; maxStartSector: number;
  autoInvest: boolean; autoLaunchS: number; autoLaunchLeft: number; bestSector: number; best: number; runs: number;
}
/** The optional cruise challenge: Slipstream (power zone 3+) on odd sectors, Spin-Up (cadence) on even ones. */
export interface ChallengeView {
  kind: 'slipstream' | 'spinup'; state: 'idle' | 'active' | 'done' | 'failed';
  progress: number; need: number; left: number; x: number; rpm: number;
}

export interface SfSnapshot {
  t: number; phase: 'hangar' | 'run'; hangar: HangarView | null;
  stage: Stage; stageLeft: number; sector: number; sectorName: string; theme: number; scroll: number;
  shipX: number; hp: number; hpMax: number; shield: number; shieldMax: number; invuln: number; lives: number; livesMax: number;
  score: number; combo: number; mult: number; thrust: number; overdrive: boolean; odWidth: number;
  gunL: boolean; gunR: boolean; credits: number; gunLevel: number; missilesLeft: number; wingmen: Array<{ x: number; y: number; temp: boolean }>;
  scrap: number; bank: number;
  enemies: EnemyView[]; shots: ShotView[]; hazards: HazardView[]; lances: LanceView[]; drops: DropView[];
  fx: FxView[]; banners: Banner[]; toasts: ToastView[]; cues: Array<{ name: string; id: number }>;
  boss: { name: string; hp: number; maxHp: number; leftS: number } | null;
  challenge: ChallengeView | null;
  rapidLeft: number; // Rapid Fire seconds left (Spin-Up reward)
  bossesDefeated: number; kills: number; over: boolean; hitFlash: number; shake: number; frozen: boolean;
  hooks: { boss: boolean; challenge: boolean };
}
