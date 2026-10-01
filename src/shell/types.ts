import type { BikeState, GameModule, Profile, SessionRecord } from '../contracts';

export type DeviceKind = 'trainer' | 'controller' | 'hr';
export interface DeviceUiStatus { connected: boolean; detail?: string; busy?: boolean; error?: string }
export type DeviceStatusMap = Record<DeviceKind, DeviceUiStatus>;

export interface AwardView {
  xpGained: number; levelBefore: number; levelAfter: number; newAchievements: Array<{ id: string; name: string }>;
}
export interface AchievementView { id: string; name: string; desc: string; unlocked: boolean }
export interface LevelView { level: number; progress: number; xp: number; nextXp: number }

/** Minimal view of core's GameSession used by the shell. */
export interface SessionLike {
  frame(realDtS: number): void;
  pause(): void; resume(): void;
  finish(): SessionRecord;
  ctx: { bike(): Readonly<BikeState> };
  sim: { isOver(): boolean; snapshot(): unknown };
}
export type Screen =
  | { name: 'profiles' } | { name: 'editor'; profileId: string | null } | { name: 'connect' }
  | { name: 'menu' } | { name: 'achievements' }
  | { name: 'game'; game: GameModule }
  | { name: 'summary'; record: SessionRecord; award: AwardView };
export type { Profile };
