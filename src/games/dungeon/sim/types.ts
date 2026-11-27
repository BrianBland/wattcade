import type { World, EnemyKind, ShrineKind } from './world';
import type { Element, Gear, Rarity, Slot, UniqueFx, Weapon, WeaponStyle } from './loot';
import type { UpgradeId } from './meta';
import type { KitId, PerkId } from './perks';
import type { RunResult } from './descent';
import type { LootOfferView, StatDelta } from './lootOffer';
export type { LootOfferView, StatDelta };

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
/** Perks held this descent, the hero's race kit, the Domestique drones, and the open offer (null while playing). */
export interface PerkView {
  ranks: Array<{ id: PerkId; rank: number; name: string; color: string; rarity: number }>;
  kit: KitId | null; light: number; drones: Array<{ x: number; y: number; shot: number }>;
  offer: null | {
    sel: number; suggest: number; age: number; autoS: number; boss: string; floor: number;
    cards: Array<{ id: PerkId; name: string; rarity: number; rarityName: string; cat: string; color: string; rank: number; max: number; blurb: string; desc: string; /** which card: the stance name, the ride style, or Wildcard */ slot: string; slotKind: 'stance' | 'ride' | 'wild' }>;
  };
}
export interface CampView {
  bank: number; sel: number; autoStartS: number; autoStartLeft: number; startFloor: number; maxStartFloor: number; autoInvest: boolean;
  rows: Array<{ kind: 'start' | 'floor' | 'tier' | 'upgrade' | 'auto' | 'erg'; id?: UpgradeId; name: string; desc: string; level?: number; max?: number; cost?: number; affordable?: boolean }>;
  bestFloor: number; runs: number;
  lastDeath?: { floor: number; banked: number }; // set when camp follows a death
  /** optional (older sim chunks omit them): how the last descent ended, the descent length, the chosen Category, total wins */
  lastRun?: RunResult; floors?: number; tier?: string; wins?: number;
}
export interface DungeonSnapshot {
  t: number;
  phase: 'camp' | 'run';
  camp: CampView | null;
  world: World;
  floor: number;
  /** optional: the fixed descent (older sim chunks omit it) */
  run?: { floors: number; zone: string; final: boolean; tier: string; tierIndex: number };
  player: {
    x: number; y: number; r: number; hp: number; maxHp: number; potions: number; potionCap: number;
    invuln: boolean; onSwamp: boolean; speedMult: number; moving: boolean; rolling: boolean; warded: boolean; rallied: boolean; hurt: number;
    secondWind: number; secondWindFlash: number; // Second Wind ready 0..1; flash 1->0 after it fires
    firedUpLeft?: number; // seconds remaining on post-sprint Fired Up damage buff
    level: number; xp: number; xpNext: number; coins: number; bank: number;
  };
  weapon: Weapon;
  gear: Partial<Record<Slot, Gear>>;
  aim: { angle: number };
  /** The hero AI's intent: waypoints to its next goal (tile centres) and the enemy it is targeting (0 = none). */
  stance: {
    id: string; name: string; role: string; color: string; band: [number, number];
    styleOn: boolean; styleHidden: boolean; swapping: string | null; ready: number; suggest: string | null;
    list: Array<{ id: string; name: string; color: string; weapon: string; base: string; level: number; rarity: number; element?: Element; variant?: number; unique?: UniqueFx; plus?: number }>;
  };
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
  boss: { active: boolean; name: string; hp: number; maxHp: number; phase: 1 | 2 | 3; cycle: 'idle' | 'windup' | 'exposed' | 'stagger'; left: number; fightT: number; tide: number; splits: [number, number] } | null;
  /** optional: an older sim chunk may not send it */
  perks?: PerkView;
  /** optional: active non-blocking loot choice prompt (default auto-resolves; Y flips) */
  lootOffer?: LootOfferView | null;
  stats: { roomsCleared: number; kills: number; deaths: number; damageDealt: number; /** hero damage output while firing, normalised per weapon (sum of per-shot damage / weapon rate), and seconds spent firing */ output: number; fireT: number; bossDefeated: number; floorsCleared: number; elites: number; uniques: number; curses: number };
  hooks: { boss: boolean; shielded: boolean; swamp: boolean; seg: string; cadence: number; powerFtp: number };
}
