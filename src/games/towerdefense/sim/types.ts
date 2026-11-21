// Snapshot view-model shared by the sim, renderer and tests. Plain data only.
import type { Element, Kind, Matchup, TowerKind, Weapon } from './defs';
import type { BuildSuggestion } from './construction';
import type { WaveRole } from './waves';
import type { TdLevel } from './level';
import type { LevelSpec } from './campaign';


/** How a hit landed under the matchup matrix. */
export type HitClass = 'strong' | 'neutral' | 'resisted';
export interface EnemyView {
  /** `route`: -1 on the road, else the Glider flight it follows; `flying` = route >= 0. `lane`: which road it walks (default 0). */
  id: number; kind: Kind; route: number; lane?: number; flying: boolean; x: number; y: number; angle: number; dist: number; radius: number;
  /** Current element: fixed colour, a prism's current colour, or a boss's (fixed) colour. */
  element: Element; gold: boolean; hp: number; maxHp: number; hurt: number;
  charging: boolean; /** seconds until a prism changes colour, and the colour it changes to */
  shiftIn: number; next: Element | null; progress: number;
  /** a Bulwark Tyrant's shield plates left (0..1 of their size when raised; 0 = none) */
  shield: number;
  bossPhase: number; telegraph: boolean; exposed: boolean; staggerS: number;
  /** last hit (sim time), its matchup class and the damage dealt that tick: renderer hit feedback */
  hitT: number; hitCls: HitClass; hitDmg: number;
  /** seconds of Mortar concussion left (absent when not concussed) */
  dazed?: number;
}
export type Fx =
  | { id: number; t0: number; life: number; kind: 'tracer'; x0: number; y0: number; x1: number; y1: number; hit: boolean }
  | { id: number; t0: number; life: number; kind: 'beam'; angle: number; spread: boolean; width?: number }
  | { id: number; t0: number; life: number; kind: 'zap'; pts: Array<{ x: number; y: number }>; /** firing tower's pad: the renderer starts the arc at its art's muzzle */ pad?: number }
  | { id: number; t0: number; life: number; kind: 'lens'; x0: number; y0: number; x1: number; y1: number; /** firing tower's pad: the renderer starts the beam at its crystal */ pad?: number }
  | { id: number; t0: number; life: number; kind: 'boom'; x: number; y: number; r: number; /** A Mortar shell (gravel and shrapnel), not a Fireball. */ mortar?: boolean }
  /** an ignition burst; `chain` groups bursts from one fire kill, `ordinal` counts them (1, 2, …) */
  | { id: number; t0: number; life: number; kind: 'burst'; x: number; y: number; r: number; chain: number; ordinal: number }
  | { id: number; t0: number; life: number; kind: 'hitStop'; seconds: number }
  /** the boss arrives: the renderer plays its name card (the HUD banner stays quiet meanwhile) */
  | { id: number; t0: number; life: number; kind: 'bossIntro'; wave: number; color: Element }
  /** `eid`/`ekind`: the alien that died (renderer leaves its corpse); `fire`: its last hit was fire (red brood bursts). */
  | { id: number; t0: number; life: number; kind: 'death'; x: number; y: number; color: Element | 'gold'; big: boolean; eid: number; ekind: Kind; fire: boolean; /** body radius (a boss's is scaled) */ r?: number }
  | { id: number; t0: number; life: number; kind: 'text'; x: number; y: number; text: string; color: string }
  | { id: number; t0: number; life: number; kind: 'baseHit'; dmg: number };
/** A turret fireball in flight (`k` 0 → 1) toward a road point; it bursts with radius `r`. */
/** `tower`: a Mortar round lobbed from the pad at (x0, y0); otherwise the turret's fireball. */
export interface ShellView { x0: number; y0: number; x1: number; y1: number; k: number; r: number; tower?: true }
/** Burning road left by a fireball; `k` = share of its burn time left. */
export interface BurnView { x: number; y: number; r: number; k: number }
export interface TowerView { pad: number; kind: TowerKind; level: number; angle: number; charge: number; firedAt: number }
/** `locked`: a tower kind not yet earned with campaign stars (shown, never buildable). */
export interface WorkshopRow { kind: 'build' | 'upgrade' | 'sell' | 'repair'; tower?: TowerKind; label: string; desc: string; cost: number; affordable: boolean; locked?: boolean }
export interface WorkshopView { pad: number; row: number; rows: WorkshopRow[]; idleLeft: number; revision: number }
/** A ride-select row. `unlocks` shows the star count and the next unlock (A does nothing). */
export interface GarageRow { kind: 'start' | 'campaign' | 'quick' | 'intensity' | 'unlocks' | 'next' | 'finish'; name: string; desc: string }
/** A campaign level on the level select. `key` finds its baked map (`BAKED_LEVELS`) for the preview. */
export interface LevelTile {
  index: number; id: string; key: string; name: string; ground: string; roadStyle: string;
  minutes: number; pads: number; waves: number; bosses: number; stars: number; locked: boolean;
}
export interface GarageView {
  title: string; subtitle: string; breatherLeft: number; sel: number; rows: GarageRow[]; autoLeft: number; autoS: number; stars: number; endlessBest: number; runs: number;
  /** 'modes' = the ride select; 'campaign' = the level grid (5 levels per ground, one row each). */
  page: 'modes' | 'campaign';
  /** Every campaign level, in order (the grid on the campaign page, the next level's card on the modes page). */
  levels: LevelTile[];
  /** The selected tile on the campaign page; `open` = the furthest level open to play. */
  levelSel: number; open: number;
  /** The campaign level the Campaign card starts (the next open one, or the last one picked). */
  campaignSel: number;
  /** On a level's result page: the map Next level (or Retry) starts, so the renderer can ready it. */
  nextMap?: Pick<LevelSpec, 'seed' | 'roadStyle' | 'ground' | 'pads'>;
}
export interface Banner { text: string; sub: string; color: string; t0: number; big: boolean }
export type TrainerMode = 'sim' | 'resistance' | 'erg';
/** A wave's brood: its main colour, the turret weapon it calls for, and that weapon's trainer mode. */
export interface BroodInfo {
  wave: number; color: Element; weapon: Weapon; mode: TrainerMode;
  /** trainer setting, e.g. 'resistance 35%' */ setting: string;
  /** one-line riding cue, e.g. 'grind 70–80 rpm' */ cue: string;
}
/** The current (or, during the lull, the coming) wave's brood; `countdownS` = lull seconds left (0 once the wave is on), `lullS` = that lull's full length. */
export interface BroodView extends BroodInfo { countdownS: number; lullS: number; rampS: number }
/** A wave's aliens per colour (gold = boss, prism = shifting); `air` = Gliders among the blue. */
export type WaveForecast = Record<Element | 'gold' | 'prism', number> & { air: number };
export interface BossView {
  /** One boss per colour: it keeps its colour, weapon and trainer mode all fight; `name` e.g. Swarm Tyrant. */
  id: number; name: string; phase: number; phaseCount: number; color: Element; weapon: Weapon;
  /** the next phase is announced and starts after `countdownS` */
  pending: boolean; countdownS: number; telegraph: boolean; exposed: boolean; windowLeftS: number;
  /** red: a charge is announced ('warn') or under way ('on'); purple: shield plates left (0..1) */
  charge: 'warn' | 'on' | null; shield: number;
  /** HP left (0..1; 1 before it spawns) and seconds until it breaks through the base if still alive (the peak's cap) */
  hp: number; escapeS: number;
  /** Optional hold-Up / touch ERG push, preserving the phase's trainer mode; A stays construction. */
  sprintBoost: boolean;
}

/** Where the flow is in its set's curve. */
export type FlowStage = 'warm-up' | 'build' | 'peak' | 'boss' | 'trough';
/**
 * The enemy radar: the next `horizonS` seconds as blips by when they come into the turret's reach, across the level's `roads`
 * (plus the air when it has Glider routes); the colour leading the window, and a boss on the field (inS 0) or due.
 */
/** One radar blip: a spawn group (one road or the air, one colour, spawning within a few seconds of each other). */
export interface RadarBlip {
  /** seconds until it comes into the turret's reach (0 = in reach now); total HP; `prism` = Stalkers (the HUD cycles them through the colours) */
  etaS: number; hp: number; color: Element | 'prism';
  /** the road it walks (0-based), -1 = the air (Gliders); `n` aliens in it; `key` = its spawn window (stable jitter) */
  lane: number; n: number; key: number; boss?: boolean;
}
export interface RadarView {
  horizonS: number; roads: number; air: boolean; blips: RadarBlip[];
  /** a slowly decaying high-water mark of a blip's HP (blips size against it) */ scale: number;
  lead: Element | null; boss: { inS: number; color: Element } | null;
}

export interface TdSnapshot {
  t: number; phase: 'garage' | 'run'; garage: GarageView | null;
  /** A new level or run is waiting for the renderer's `levelReady` (only after it sent `loadGate`): nothing moves. */
  loading?: boolean;
  /** The maps the next Quick Ride and Endless run would generate, so the renderer can build them in the background. */
  nextMaps: Array<Pick<LevelSpec, 'seed' | 'roadStyle' | 'ground' | 'pads'>>;
  /** The map being played (same object for the whole session; the renderer derives its geometry from it). */
  level: TdLevel;
  wave: number; waveElapsed: number; waveMaxS: number; wavesSurvived: number; lull: number;
  /** The flow's stage, set (`sets` = the level's set count, 0 in Endless) and seconds until the next segment. */
  flow: { stage: FlowStage; set: number; sets: number; leftS: number } | null;
  radar: RadarView | null;
  forecast: { wave: number; boss: boolean; role: WaveRole; counts: WaveForecast };
  /** where the current wave sits in its set: three work waves, a boss, then an easy recovery wave */
  set: { set: number; pos: number; of: number; role: WaveRole; warmup: boolean };
  /** The level being played (null = Endless): its wave count and estimated minutes. */
  run: { id: string; name: string; kind: 'campaign' | 'quick'; minutes: number; waves: number; estMinutes: number } | null;
  intensity: 'easy' | 'steady' | 'hard';
  brood: BroodView;
  boss: BossView | null; matchup: Matchup;
  baseHp: number; baseMaxHp: number; baseHurt: number;
  /** read-only: follows `brood.weapon` */
  weapon: Weapon; swapLeft: number; swapS: number;
  /** the turret always aims itself; `lock` = the rider's decaying target lock (k 1 → 0), null when none */
  aimAngle: number; targetId: number; lock: { id: number; k: number } | null;
  /** Intensity tier I–V picked by the shifters, how many there are, the tier the flow calls for, and the current tier's rated ftpFraction. */
  tier: number; tierCount: number; suggestedTier: number; tierFtp: number;
  /** How much of the current tier's rated output the rider is making (0 … the effort cap): what scales the shots. */
  tierOutput: number;
  /** Railgun pulse: 1 when banked, progress toward the next pulse (railMaxCharges is 1). */
  railCharges: number; railMaxCharges: number; railProgress: number; railCharging: boolean; zHold: number; railDumpHoldS: number;
  /** Flamer lobbing fireballs; `flameRange` = how far it can lob */
  flaming: boolean; flameRange: number; flamePower: number; /** enemy the rail's targeting laser is burning (0 = none) */ laserId: number;
  grid: number; overdrive: boolean; /** dynamo stalled (rider stopped): shields down, leaks hit harder */ stalled: boolean;
  scrap: number;
  /** The pad the D-pad has selected (A opens the build menu there; the base is `basePad`); -1 in a menu or out of a run. */
  padCursor: number;
  /** Changes when a menu opens/closes; stale touch captures must not dispatch into a new context. */
  inputEpoch: number;
  towers: TowerView[]; shells: ShellView[]; burns: BurnView[]; workshop: WorkshopView | null;
  enemies: EnemyView[]; fx: Fx[]; banner: Banner | null;
  cues: Array<{ name: string; id: number }>;
  over: boolean; bestWave: number;
  kills: Record<string, number>;
  hooks: { storm: boolean; surge: boolean; cadence?: number; powerFtp?: number; shielded: boolean };
}
