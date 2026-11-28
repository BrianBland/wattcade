import type { World, EnemyKind, ShrineKind } from './world';
import type { Element, Gear, Rarity, Slot, UniqueFx, Weapon, WeaponStyle } from './loot';
import type { UpgradeId } from './meta';
import type { RunResult } from './descent';
import type { ArchetypeId, HeroChassis, JerseyKit } from './archetypes';
import type { NodeState, SkillTier } from './skillTree';
import type { LootOfferView, StatDelta } from './lootOffer';
import type { StatusEffectView, StatusKind } from './statusEffects';
export type { LootOfferView, StatDelta, StatusEffectView, StatusKind };

export type EliteMod = 'undying' | 'splitting' | 'shielded' | 'swift' | 'volatile';
export interface EnemyView {
  id: number; kind: EnemyKind | 'boss'; x: number; y: number; r: number; hp: number; maxHp: number; exposed: boolean;
  hurt: number; face: number; slowed: boolean; dot: boolean; tell: number; // tell 0..1 = wind-up / fuse / charge
  variant: number; elite: EliteMod | null; shieldFrac: number;
}
export interface BulletView { x: number; y: number; r: number; friendly: boolean; style: WeaponStyle | 'enemy'; color: string; angle: number; age: number; variant?: number; drone?: boolean }
export interface DropView { id: number; kind: 'coin' | 'potion' | 'weapon' | 'gear'; x: number; y: number; rarity: Rarity; style?: WeaponStyle; slot?: Slot; element?: Element; variant?: number; unique?: UniqueFx; plus?: number }
export interface Fx {
  kind: 'text' | 'chain' | 'boom' | 'hit' | 'death' | 'levelup' | 'muzzle' | 'banner';
  x: number; y: number; t0: number; life: number; color: string;
  text?: string; r?: number; pts?: Array<{ x: number; y: number }>; big?: boolean;
}
export interface Toast { text: string; color: string; t0: number }
export interface Hazard { x: number; y: number; r: number; left: number; total: number }
export interface ShrineView { kind: ShrineKind; label: string; progress: number; leftS: number; state: 'idle' | 'active' | 'done' | 'failed'; x: number; y: number; room: number }
export type CurseKind = 'frenzy' | 'hexed' | 'swarm' | 'darkness' | 'mire' | 'fragile' | 'bulwark';
export interface CurseView { kind: CurseKind; name: string; desc: string; color: string; left: number; total: number }

export interface SkillNodeView {
  id: string;
  tier: SkillTier;
  fork?: 'A' | 'B';
  pair?: string;
  name: string;
  short: string;
  detail: string;
  cycling: string;
  rank: number;
  maxRank: number;
  state: NodeState;
  relicBonus: boolean;
}

export interface SkillBranchView {
  id: string;
  name: string;
  theme: string;
  color: string;
  points: number;
  nodes: SkillNodeView[];
}

export interface SkillQuickCardView {
  nodeId: string;
  branchId: string;
  branchName: string;
  branchColor: string;
  tier: SkillTier;
  fork?: 'A' | 'B';
  name: string;
  short: string;
  detail: string;
  cycling: string;
  rank: number;
  maxRank: number;
  siblingForkName?: string;
}

export interface SkillOfferView {
  mode: 'quick' | 'full';
  sel: number;          // selected quick card index (0..2)
  focusNodeId: string;  // focused node in full tree view
  age: number;
  autoS: number;
  /** True when opened from Pause Menu or manual D-pad Up (auto-pick timer paused). */
  manual: boolean;
  reason: string;       // e.g. 'Level Up! · Room Cleared' or 'Build & Skill Tree'
  cards: SkillQuickCardView[];
}

export interface SkillTreeView {
  unspentSP: number;
  spentSP: number;
  paragonRanks?: number;
  buildTitle: string;
  forks: string[];
  capstones: string[];
  relicName: string | null;
  relicBranchName: string | null;
  branches: SkillBranchView[];
  offer: SkillOfferView | null;
}

export interface ArchetypeView {
  id: ArchetypeId;
  name: string;
  shortName: string;
  subtitle: string;
  color: string;
  chassis: HeroChassis;
  kit: JerseyKit;
  overlays: string[];
  workoutTag: string;
  cadenceSweet: [number, number];
}

export interface CampArchetypeCard {
  id: ArchetypeId;
  name: string;
  shortName: string;
  subtitle: string;
  jersey: string;
  chassis: HeroChassis;
  kit: JerseyKit;
  color: string;
  workoutTag: string;
  ergLabel: string;
  gradeLabel: string;
  cadenceSweet: [number, number];
  pitch: string;
  unlocked: boolean;
  unlockReq: string;
  unlockPct: number;
  branches: Array<{ name: string; color: string }>;
  profileErg: readonly number[];
  profileGrade: readonly number[];
}

export interface CampView {
  bank: number; sel: number; autoStartS: number; autoStartLeft: number; startFloor: number; maxStartFloor: number; autoInvest: boolean;
  erg: boolean;
  selectedArchetype: ArchetypeId;
  archetypes: CampArchetypeCard[];
  grimpeur: { unlocked: boolean; climbs: number; climbGoal: number; floor: number; floorGoal: number; pct: number };
  rows: Array<{ kind: 'start' | 'archetype' | 'floor' | 'tier' | 'upgrade' | 'auto' | 'erg'; id?: UpgradeId; name: string; desc: string; level?: number; max?: number; cost?: number; affordable?: boolean }>;
  bestFloor: number; runs: number;
  lastDeath?: { floor: number; banked: number }; // set when camp follows a death
  lastRun?: RunResult; floors?: number; tier?: string; wins?: number;
}

export interface DungeonSnapshot {
  t: number;
  phase: 'camp' | 'run';
  camp: CampView | null;
  world: World;
  floor: number;
  run?: { floors: number; zone: string; final: boolean; tier: string; tierIndex: number };
  player: {
    x: number; y: number; r: number; hp: number; maxHp: number; shield: number; potions: number; potionCap: number;
    invuln: boolean; onSwamp: boolean; speedMult: number; moving: boolean; rolling: boolean; warded: boolean; rallied: boolean; hurt: number;
    secondWind: number; secondWindFlash: number; // Second Wind ready 0..1; flash 1->0 after it fires
    firedUpLeft?: number;
    level: number; xp: number; xpNext: number; coins: number; bank: number;
    unspentSP: number;
    blazingHalo?: boolean; turbineShock?: boolean; bulletTime?: boolean; mountainKing?: boolean; caldera?: boolean; phantom?: boolean;
  };
  weapon: Weapon;
  gear: Partial<Record<Slot, Gear>>;
  aim: { angle: number };
  archetype: ArchetypeView;
  statuses: StatusEffectView[];
  terrain: { extraGrade: number; demandedFtp: number; bogged: boolean };
  skillTree: SkillTreeView;
  pace: { seg: string; label: string; erg: boolean; segT: number };
  /** Current cooldown refill speed (x base) and the power zone driving it (1..5). */
  refill: { rate: number; zone: number };
  ai: { path: Array<{ x: number; y: number }>; targetId: number };
  /** Rider actions in HUD order; ready 0..1 (1 = ready), usable = pressing it would do something now. */
  actions: Array<{ id: 'strike' | 'ward' | 'rally' | 'potion'; button: 'a' | 'b' | 'y' | 'z'; label: string; ready: number; usable: boolean }>;
  enemies: EnemyView[];
  bullets: BulletView[];
  drops: DropView[];
  hazards: Hazard[];
  orbit: Array<{ x: number; y: number }>;
  shrines: ShrineView[];
  curse: CurseView | null;
  fx: Fx[];
  toasts: Toast[];
  cues: Array<{ name: string; id: number }>; // sound cues; renderer plays ids it hasn't seen
  room: number;
  stairsOpen: boolean;
  frozen: boolean;
  /** The Gear Masher's chainring on its chain (tiles); null for every other boss. tx/ty = where a throw or slam lands. */
  flail: { x: number; y: number; mode: 'hand' | 'out' | 'back' | 'whirl' | 'slam' | 'rest'; t: number; ang: number; tx: number; ty: number } | null;
  /** The Headwind Wyrm's 14-segment articulated snake body (tiles); null for every other boss. */
  wyrmSegs?: Array<{ x: number; y: number; ang: number }> | null;
  boss: { active: boolean; name: string; hp: number; maxHp: number; phase: 1 | 2 | 3; cycle: 'idle' | 'windup' | 'exposed' | 'stagger'; left: number; fightT: number; tide: number; splits: [number, number] } | null;
  /** Active non-blocking loot choice prompt (default auto-resolves; Y flips). */
  lootOffer?: LootOfferView | null;
  /** Floor 7 victory sequence (find your bike -> pedal across finish line -> celebrate). */
  finishSeq?: FinishSeqView | null;
  stats: { roomsCleared: number; kills: number; deaths: number; damageDealt: number; output: number; fireT: number; bossDefeated: number; floorsCleared: number; elites: number; uniques: number; curses: number; climbs: number; skillPoints: number };
  hooks: { boss: boolean; shielded: boolean; swamp: boolean; seg: string; cadence: number; powerFtp: number };
}

export interface FinishSeqView {
  stage: 'findBike' | 'rideToLine' | 'celebrate';
  bikeX: number; bikeY: number;
  lineX: number; lineY: number;
  progress: number;   // 0..1 riding from bike to finish line
  celebrateT: number; // seconds elapsed in celebration
}
