import type { Button, GameHud, GameSim, BikeState, GameModule, MediaTimeline, Profile, SessionRecord, TrainerCommand } from '../contracts';
import type { MixItem, MixPlan, QueueMode } from '../media';

export type DeviceKind = 'trainer' | 'controller' | 'hr';
export interface DeviceUiStatus { connected: boolean; detail?: string; busy?: boolean; error?: string }
export type DeviceStatusMap = Record<DeviceKind, DeviceUiStatus>;

export interface AwardView {
  xpGained: number; levelBefore: number; levelAfter: number; newAchievements: Array<{ id: string; name: string }>;
  /** Cosmetics unlocked by this ride (level rewards and achievement items). */
  newItems: Array<{ slot: string; id: string; name: string }>;
  /** Reward picks waiting after this ride. */
  picks: number;
}
export interface AchievementView {
  id: string; name: string; desc: string; unlocked: boolean; secret: boolean;
  /** Owning game id (undefined = rides anywhere) and the heading it is listed under. */
  gameId?: string; group: string;
  /** Progress toward a goal achievement (null when unlocked or a one-ride feat). */
  progress: { frac: number; label: string } | null;
}
export interface LevelView { level: number; progress: number; xp: number; nextXp: number }

/** Minimal view of core's GameSession used by the shell. */
export interface SessionLike {
  frame(realDtS: number): void;
  /** Advance bike/devices/mixer without the sim (intros); returns presses. */
  idle(realDtS: number): ReadonlySet<Button>;
  pause(): void; resume(): void;
  mixer?: { rampIn(seconds?: number): void; readonly command?: TrainerCommand | null };
  finish(): SessionRecord;
  ctx: { bike(): Readonly<BikeState>; debug?(key: string, value: number | string | boolean): void };
  media?: { positionS(): number; setTrim(trim: number | null): void };
  sim: { isOver(): boolean; snapshot(): unknown; hud?(): GameHud; inMenu?(): boolean; menuActions?: GameSim['menuActions']; receive?(action: unknown): void };
}
export type Screen =
  | { name: 'profiles' } | { name: 'editor'; profileId: string | null } | { name: 'connect' }
  | { name: 'menu' } | { name: 'achievements' } | { name: 'locker' } | { name: 'pick' }
  | { name: 'media'; game: GameModule }
  | { name: 'game'; game: GameModule; run?: number; media?: MediaRun }
  | { name: 'summary'; record: SessionRecord; award: AwardView }
  | { name: 'unlocks'; award: AwardView };
/** The music a game was started with (from the media picker). */
export interface MediaRun { ids: string[]; mode: QueueMode; items: MixItem[]; plan: MixPlan; timeline: MediaTimeline; rolling?: import('../media/online/rolling').RangeSource; timings?: import('../media/online/timing').MediaTimings }
export type { Profile };
