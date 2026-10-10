import type { World, EnemyKind, ShrineKind } from './world';
import type { Gear, Rarity, Slot, Weapon, WeaponStyle } from './loot';
import type { UpgradeId } from './meta';

export type EliteMod = 'undying' | 'splitting' | 'shielded' | 'swift' | 'volatile';
export interface EnemyView {
  id: number; kind: EnemyKind | 'boss'; x: number; y: number; r: number; hp: number; maxHp: number; shielded: boolean;
  hurt: number; face: number; slowed: boolean; dot: boolean; tell: number; // tell 0..1 = wind-up / fuse / charge
  variant: number; elite: EliteMod | null; shieldFrac: number;
}
export interface BulletView { x: number; y: number; r: number; friendly: boolean; style: WeaponStyle | 'enemy'; color: string; angle: number; age: number }
export interface DropView { id: number; kind: 'coin' | 'potion' | 'weapon' | 'gear'; x: number; y: number; rarity: Rarity; style?: WeaponStyle; slot?: Slot }
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
export interface CampView {
  bank: number; sel: number; autoStartS: number; autoStartLeft: number; startFloor: number; maxStartFloor: number; autoInvest: boolean;
  rows: Array<{ kind: 'start' | 'floor' | 'upgrade' | 'auto'; id?: UpgradeId; name: string; desc: string; level?: number; max?: number; cost?: number; affordable?: boolean }>;
  bestFloor: number; runs: number;
  lastDeath?: { floor: number; banked: number }; // set when camp follows a death
}
export interface DungeonSnapshot {
  t: number;
  phase: 'camp' | 'run';
  camp: CampView | null;
  world: World;
  floor: number;
  player: {
    x: number; y: number; r: number; hp: number; maxHp: number; potions: number; potionCap: number;
    invuln: boolean; onSwamp: boolean; speedMult: number; moving: boolean; rolling: boolean; warded: boolean; rallied: boolean; hurt: number;
    secondWind: number; secondWindFlash: number; // Second Wind ready 0..1; flash 1->0 after it fires
    level: number; xp: number; xpNext: number; coins: number; bank: number;
  };
  weapon: Weapon;
  gear: Partial<Record<Slot, Gear>>;
  aim: { angle: number };
  /** The hero AI's intent: waypoints to its next goal (tile centres) and the enemy it is targeting (0 = none). */
  stance: {
    id: string; name: string; role: string; color: string; band: [number, number];
    styleOn: boolean; styleHidden: boolean; swapping: string | null; ready: number; suggest: string | null;
    list: Array<{ id: string; name: string; color: string; weapon: string }>;
  };
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
  boss: { active: boolean; name: string; hp: number; maxHp: number; shielded: boolean; shieldLeftS: number; nextShieldS: number } | null;
  stats: { roomsCleared: number; kills: number; deaths: number; damageDealt: number; bossDefeated: number; floorsCleared: number; elites: number; uniques: number; curses: number };
  hooks: { boss: boolean; shielded: boolean; swamp: boolean };
}
