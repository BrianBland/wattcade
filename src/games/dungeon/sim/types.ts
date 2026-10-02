import type { World, EnemyKind } from './world';
import type { Gear, Rarity, Slot, Weapon, WeaponStyle } from './loot';

export interface EnemyView {
  id: number; kind: EnemyKind | 'boss'; x: number; y: number; r: number; hp: number; maxHp: number; shielded: boolean;
  hurt: number; face: number; slowed: boolean; dot: boolean; tell: number; // tell 0..1 = wind-up / fuse / charge
  variant: number;
}
export interface BulletView { x: number; y: number; r: number; friendly: boolean; style: WeaponStyle | 'enemy'; color: string; angle: number; age: number }
export interface DropView { id: number; kind: 'coin' | 'potion' | 'weapon' | 'gear'; x: number; y: number; rarity: Rarity; style?: WeaponStyle; slot?: Slot }
export interface Fx {
  kind: 'text' | 'chain' | 'boom' | 'hit' | 'death' | 'levelup' | 'muzzle';
  x: number; y: number; t0: number; life: number; color: string;
  text?: string; r?: number; pts?: Array<{ x: number; y: number }>; big?: boolean;
}
export interface Toast { text: string; color: string; t0: number }
export interface DungeonSnapshot {
  t: number;
  world: World;
  floor: number;
  player: {
    x: number; y: number; r: number; hp: number; maxHp: number; potions: number; dashCd: number; dashCdMax: number;
    invuln: boolean; onSwamp: boolean; speedMult: number; moving: boolean; dashing: boolean; hurt: number;
    level: number; xp: number; xpNext: number; coins: number;
  };
  weapon: Weapon;
  gear: Partial<Record<Slot, Gear>>;
  aim: { angle: number; auto: boolean };
  enemies: EnemyView[];
  bullets: BulletView[];
  drops: DropView[];
  fx: Fx[];
  toasts: Toast[];
  room: number;
  stairsOpen: boolean;
  boss: { active: boolean; name: string; hp: number; maxHp: number; shielded: boolean; shieldLeftS: number; nextShieldS: number } | null;
  stats: { roomsCleared: number; kills: number; deaths: number; damageDealt: number; bossDefeated: number; floorsCleared: number };
  hooks: { boss: boolean; shielded: boolean; swamp: boolean };
}
