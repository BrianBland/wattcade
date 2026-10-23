// The seam between the Seaside sim and its renderer (and other Seaside issues). #184 owns the base fields;
// later issues add fields additively and say so in their PR.

export type SceneKind = 'ride' | 'fish' | 'shop' | 'drill' | 'cutscene' | 'fan' | 'flight';
export type ChapterId = 0 | 1 | 2;
export const CHAPTER_NAMES = ['Morning', 'Midday', 'Evening'] as const;

/**
 * How a scene ends. `m` = metres along the route rail (speed from power); `effortS` = seconds of work at the
 * scene's base effort (harder = sooner, effort-gated); `s` = fixed seconds (cutscenes, set pieces, shops).
 */
export type SceneLength = { m: number } | { effortS: number } | { s: number };

/** The scene's base trainer command (#186 layers surges, ERG blocks and pulses on top). */
export type TrainerPlan =
  | { mode: 'sim'; gradePct: number }
  | { mode: 'erg'; ftpFraction: number }
  | { mode: 'resistance'; levelPct: number }
  | { mode: 'none' };

/** Post-processing preset names from the prototype (`render/looks.ts` on the storyboard branch). */
export type LookName = 'morning' | 'midday' | 'belly' | 'jungle' | 'lava' | 'reentry' | 'fever';

export interface MonologueLine {
  text: string;
  /** Scene progress (0..1) at which the line queues. */
  at: number;
}

export interface Scene {
  id: string;
  chapter: ChapterId;
  kind: SceneKind;
  title: string;
  length: SceneLength;
  /** Storyboard duration (s): the pace target. */
  planS: number;
  /** Storyboard effort plan: [seconds, fraction of FTP] segments that sum to planS. */
  effort: Array<[number, number]>;
  trainer: TrainerPlan;
  monologue: MonologueLine[];
  look: LookName;
  /** 0 mundane .. 1 fever dream, at the scene's start (eases to the next scene's value). */
  dream: number;
}

export interface MonologueView { id: number; text: string; age: number; life: number }
export interface MenuView { items: Array<{ id: string; label: string }>; index: number; autoIn: number }

export interface SeasideSnapshot {
  chapter: ChapterId;
  sceneId: string;
  /** Seconds spent in the current scene. */
  sceneT: number;
  /** Metres along the route rail. */
  routeS: number;
  /** Virtual speed (m/s); 0 in effort-gated and fixed-time scenes. */
  speed: number;
  /** Planned effort right now, as a fraction of FTP. */
  effortTarget: number;
  monologue: MonologueView | null;
  look: { name: LookName; dream: number };
  // ---- additive (#184) ----
  scene: { index: number; count: number; kind: SceneKind; title: string; progress: number };
  /** Seconds since the chapter card appeared (null when none is showing). */
  chapterCard: { name: string; age: number } | null;
  menu: MenuView | null;
  over: boolean;
  /** For headless scripts (`target-follow`). */
  hooks: { powerFtp: number };
}

/** profile.gameData.seaside. Unknown fields are preserved on save (other issues add their own). */
export interface SeasideSave {
  v: 1;
  /** Full rides finished. */
  rides: number;
  /** Unlocked after the first full ride. */
  chapterSelect: boolean;
  /** Where an unfinished ride resumes (chapter boundaries and checkpoints in long scenes). */
  checkpoint: { sceneId: string; progress: number } | null;
}
