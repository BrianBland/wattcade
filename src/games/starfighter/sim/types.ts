import type { SectionKind } from '../../../contracts';
import type { Drive } from './drive';
export type CraftId = 'cruiser' | 'escort';
export interface SfSave {
  v: 3; best: number; legacyBest: number; runs: number; onTargetS: number; unlockCredit: number;
  craft: CraftId; totals: { kills: number; bosses: number }; legacy?: Record<string, unknown>;
  /** On-target seconds flown in each craft (craft levels), and craft unlocked so far (sticky). */
  craftS: Record<CraftId, number>; unlocked: CraftId[];
}
export interface EnemyView {
  id: number; kind: 'drone' | 'armor' | 'weaver' | 'gunner' | 'turret' | 'tank' | 'boss';
  parentId?: number; mountX?: number; ground?: boolean; heading?: number;
  /** Formation this enemy entered with (clear-rate tracking). */
  formation?: number;
  /** Elite wings cross the far field and leave; only a rider who targets them can clear them. */
  elite?: boolean; fled?: boolean;
  /** Escaped past the ship: still flying (peeling away / scrolling off-screen), no longer in combat; `resolved` = counted. */
  passing?: boolean; resolved?: boolean;
  /** Ground units are anchored to the world (they swing beneath the ship in turns). */
  wx?: number; wz?: number;
  /** Lancers fire telegraphed beat beams instead of bullets; `beamReadyAt` is the age they may warn again. */
  lancer?: boolean; beamReadyAt?: number;
  /** 0..1 muzzle charge shown before the enemy fires. */
  warn?: number;
  entry?: { fromX: number; fromY: number; toX: number; toY: number; duration: number };
  x: number; y: number; hp: number; maxHp: number; age: number; fireAt: number; bossStyle: number;
}
export interface ShotView { id: number; x: number; y: number; vx: number; vy: number; damage: number; kind: 'pulse' | 'missile' | 'wing'; tier: number }
export interface LaserView { id: number; targetId: number; sx: number; sy: number; x: number; y: number; at: number; hitAt: number; side: number; height: number; damage: number; hit: boolean; tier: number; full?: boolean; heavy?: boolean; amp?: number }
export interface BoltView { id: number; kind: 'pink' | 'amber'; height: number; x: number; y: number; vx: number; vy: number; grazed?: boolean; /** Fired aimed at a rider missing the drive: it can hit an on-band ship. */ open?: boolean; /** Part of a gated wall: drawn larger. */ wall?: boolean }
/** A lancer's beam: a dashed warning from `warnAt`, an instant beam at `fireAt` (on a bar line) until `until`. */
export interface BeamView { id: number; ownerId: number; x: number; y: number; warnAt: number; fireAt: number; until: number; fired?: boolean; open?: boolean }
export interface FxView { id: number; x: number; y: number; at: number; size?: number; ground?: boolean; /** Route distance when a ground effect started (it stays put on the terrain). */ s?: number; kind: 'boom' | 'intercept' | 'nova' | 'upgrade' | 'graze' | 'perfect' | 'beam' | 'volley' }
/** A biome's frame: its origin pose and route distance there (straight biomes are laid out along it). */
export interface WorldFrame { x: number; z: number; h: number; s: number; biome: number; seed: number }
export interface SfSnapshot {
  t: number; phase: 'hangar' | 'run';
  /** Downbeat pulse (1 at a bar line, decaying), alongside `beat`. */
  bar: number;
  /** Beat count (changes on every beat) and current low/mid/high band energy 0..1, for music-reactive lighting. */
  beatIndex: number; bands: [number, number, number];
  /** Selected formation (paddles cycle formations), and where an untargeted elite wing is relative to it. */
  selectedGroup: number | null; eliteHint: -1 | 0 | 1; elites: { cleared: number; seen: number }; done: boolean; craft: CraftId; escortUnlocked: boolean; ergAvailable: boolean;
  /** Persistent craft progress (hangar + HUD); `tester` = everything unlocked for playtesting. */
  crafts: Record<CraftId, { level: number; progress: number; next: string | null; minutesToNext: number | null; unlocked: boolean; arsenalCap: number }>; tester: boolean;
  heavy: boolean; ace: boolean; fullLock: number; eaten: number;
  /** Visual height offset from the weave pattern, the current weave pattern, and the latest barrel roll (sim time). */
  lift: number; pattern: string; roll: { at: number; dur: number; dir: number } | null;
  /** 0..1 smoothed music intensity: weapons swell with the track (Beat Hazard's idea), enemy density with it. */
  amp: number;
  menuLeft: number; sector: number; sectorName: string; section: SectionKind; intensity: number; beat: number;
  song: string; shipX: number; shipY: number; bank: number; dodge: number; hull: number; shield: number; quality: number;
  effort: { status: 'on' | 'under' | 'over' | 'recover' | 'settling'; targetWatts: number; floorWatts: number; ceilingWatts: number; erg: boolean };
  /** Next drive change, announced ahead: Escort watts or the Cruiser's spin ask. */
  upcoming: { label: string; level: Drive; left: number; watts: number | null; rpm: number | null } | null;
  /** Music drive now: level, ground speed (units/s), whether the rider meets it (`exposed`: missed past the grace, some fire connects), the Cruiser's spin ask, speed relative to cruising. */
  drive: { level: Drive; speed: number; met: boolean; exposed: boolean; rpm: number | null; rel: number };
  charge: number; coverLeft: number; rejoinLeft: number; gunLevel: number; wingmen: number; missiles: boolean;
  score: number; kills: number; salvage: number; combo: number; deaths: number;
  selectedId: number | null; locks: number[]; lockCapacity: number; lockProgress: number; volleyFlash: number; lasers: LaserView[];
  enemies: EnemyView[]; shots: ShotView[]; bolts: BoltView[]; fx: FxView[]; beams: BeamView[];
  boss: { name: string; stage: string; hp: number; maxHp: number; left: number } | null;
  bossIn: number | null; banner: string;
  /** Ride clear rate over resolved formations, perfect formations, and the most recently resolved formation. */
  clear: { rate: number; perfects: number; streak: number; last: { pct: number; perfect: boolean; at: number } | null };
  /** Current place in the ride (song or mix segment) and the next one's biome, `switchIn` sim seconds ahead. */
  /** World pose of the ship's route point, turn rate (rad/s, + = left), biome frames, and the route ahead (world x,z). */
  world: { x: number; z: number; h: number; turn: number; s: number };
  frames: { cur: WorldFrame; next: WorldFrame };
  routeAhead: number[];
  segment: { index: number; title: string; biome: number; seed: number; nextBiome: number; nextSeed: number; switchIn: number; breather: boolean };
  /** End-of-segment scorecard, shown during the breather. */
  scorecard: { title: string; grade: 'S' | 'A' | 'B' | 'C' | 'D'; score: number; clearPct: number; onTargetPct: number; perfects: number; elites: string; boss: string; at: number } | null;
  hooks: { powerFtp: number; cadence: number; boss: boolean; drive: Drive };
}
