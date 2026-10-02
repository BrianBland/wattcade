import type { World, EnemyKind } from './world';

export interface EnemyView { id: number; kind: EnemyKind | 'boss'; x: number; y: number; r: number; hp: number; maxHp: number; shielded: boolean }
export interface BulletView { x: number; y: number; r: number; friendly: boolean }
export interface DungeonSnapshot {
  t: number;
  world: World;
  player: { x: number; y: number; r: number; hp: number; maxHp: number; potions: number; dashCd: number; dashCdMax: number; invuln: boolean; onSwamp: boolean; speedMult: number };
  aim: { angle: number; auto: boolean };
  enemies: EnemyView[];
  bullets: BulletView[];
  room: number;
  boss: { active: boolean; hp: number; maxHp: number; shielded: boolean; shieldLeftS: number; nextShieldS: number } | null;
  stats: { roomsCleared: number; kills: number; deaths: number; damageDealt: number; bossDefeated: number };
  hooks: { boss: boolean; shielded: boolean; swamp: boolean };
}
