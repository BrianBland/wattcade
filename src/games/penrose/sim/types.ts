/**
 * Shared pure-data types for Penrose Pedals sim and renderer.
 * Zero Three.js or DOM imports.
 */

import type { CadenceTarget, ZoneTarget } from '../../../contracts';
import type { Mat4, OccluderBox, Quat, Vec2, Vec3 } from './math';
import type { SimRoad } from './road';

export type FaceKey = 'y' | 'a' | 'b' | 'z';
export const FACE_KEYS: readonly FaceKey[] = ['y', 'a', 'b', 'z'];

export type ThemeId = 'dusk' | 'garden' | 'town' | 'prism' | 'night' | 'brass' | 'cube';

export type MachineKind =
  | 'turntable'
  | 'crossDisc'
  | 'peelSwitch'
  | 'faucetLift'
  | 'cadenceLift'
  | 'seesaw'
  | 'camera'
  | 'gyro'
  | 'windSock'
  | 'conveyor'
  | 'companion'
  | 'clutchBridge'
  | 'doors'
  | 'seam'
  | 'drawbridge'
  | 'wallArm'
  | 'awning'
  | 'wallLift'
  | 'tide'
  | 'pool'
  | 'vane';

/**
 * Control interaction model:
 * - autoLatch: press engages, pedaling drives smoothly to next detent, auto-disengages on lock.
 * - toggle: press engages/disengages continuously (clutchBridge, seesaw, conveyor, faucetLift, companion).
 * - step: momentary click advances state immediately (matchingDoors banner cycle).
 * - switch: instant boolean flip (gravity seam).
 * - passive: no button — driven directly by cadence, effort, or wind.
 */
export type MachineMode = 'autoLatch' | 'toggle' | 'step' | 'switch' | 'passive';

export interface BikeInput {
  cadence: number;
  /** Real FTP fraction (power3s / ftp). */
  ftpFraction: number;
  /** True when sprinting or power/cadence surge in ERG. */
  sprinting: boolean;
  /** Normalized gear multiplier (0.75..1.35, 1.0 at neutral gear). */
  gearScale: number;
  /** True when trainer is in ERG mode (enables cadence-surge parity for effort machines). */
  ergMode: boolean;
  /** Optional directional nudge from paddles / D-pad (-1, 0, +1). */
  nudge: -1 | 0 | 1;
}

export interface SimTunables {
  gradeBase: number;
  gradePerLoad: number;
  gradeSlopeMax: number;
  gradeWindHead: number;
  gradeWindTail: number;
  effortAtFtp: number;
  seesawHoldFtp: number;
  seesawPeakFtp: number;
  beamPushFtp: number;
  surgeRpm: number;
  wheelSpeedBase: number;
  wheelSpeedMin: number;
  wheelSpeedMax: number;
  autoLatch: boolean;
}

export interface SimMachine {
  id: string;
  kind: MachineKind;
  mode: MachineMode;
  key?: FaceKey;
  name: string;
  on: boolean;
  /** Current scalar state (degrees, height m, spring 0..1, length m, banner index, etc.). */
  value: number;
  /** Normalized progress 0..1 for HUD & visual meters. */
  progress: number;
  /** True when aligned/locked/ready at a useful state. */
  ready: boolean;
  /** Short status label shown in controller ActionIndicators. */
  status: string;
  /** Signed resistance load contributed this tick (-0.5..1.5). */
  load: number;
  /** World-space position of the machine's interactive cap (Three/world coords). */
  capPos: Vec3;
  /** Cap outward normal (Three/world coords, default [0,1,0]). */
  capNormal: Vec3;
  /** Bloom scale size. */
  size: number;
  /** Optional visibility/liveness predicate (e.g. active wall of The Cube). */
  live?: () => boolean;
  /** Optional custom press handler (overrides default toggle). */
  press?: (dirHint?: -1 | 0 | 1) => void;
  /** Step machine state; returns signed load. */
  tick: (dt: number, drive: number, bike: BikeInput, tun: SimTunables, emit: (e: Omit<SimEvent, 'id'>) => void) => number;
  /** Optional current world transform for renderer synchronization. */
  transform?: () => Mat4;
  /** Optional extra visual state payload (e.g. door match, pool wind, lift floor, clutch catch). */
  extra?: () => Record<string, number | boolean | string>;
}

export interface SimKey {
  id: string;
  /** World position of key pickup. */
  pos: Vec3;
  got: boolean;
  /** Pickup fade progress 0..1. */
  anim: number;
}

export interface SimGate {
  id: string;
  pos: Vec3;
  dir: Vec3;
  open: boolean;
  angle: number;
}

export interface SimEvent {
  id: number;
  kind:
    | 'engage'
    | 'disengage'
    | 'latch'
    | 'perspJoin'
    | 'gapHidden'
    | 'key'
    | 'gateOpen'
    | 'doorMatch'
    | 'portal'
    | 'checkpoint'
    | 'fall'
    | 'win'
    | 'chapterWin'
    | 'clutchWarn'
    | 'clutchSlip'
    | 'springTip'
    | 'bannerStep'
    | 'seamToggle'
    | 'crankTick';
  pos?: Vec3;
  text?: string;
  pitch?: number;
  intensity?: number;
}

// ---- Declarative Visual Specs for Three.js Renderer ----

export type VisualProp =
  | { kind: 'box'; x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; pal?: 'stone' | 'deck' | 'accent' | 'idle' | 'turf' | 'roof' | 'mech' | 'mechDark' | string; keep?: boolean; roadLike?: boolean; groupId?: string }
  | { kind: 'cyl'; x: number; y: number; r: number; z0: number; z1: number; pal?: string; seg?: number; rTop?: number; groupId?: string; rotX?: number; rotZ?: number }
  | { kind: 'dome'; x: number; y: number; z: number; r: number; pal?: string; groupId?: string }
  | { kind: 'roof'; x0: number; y0: number; x1: number; y1: number; z: number; h: number; pal?: string; groupId?: string }
  | { kind: 'tree'; x: number; y: number; z: number; s: number; groupId?: string }
  | { kind: 'loopSlab'; x0: number; y0: number; x1: number; y1: number; z: number; w?: number; pal?: string }
  | { kind: 'arch'; face: 'x' | 'y'; plane: number; u: number; v: number; w: number; h: number; pal?: string; groupId?: string }
  | { kind: 'cliff'; x: number; y: number; z: number; zBase: number; ang?: number; edgeOfWorld?: boolean }
  | { kind: 'lighthouse'; x: number; y: number; z0: number; z1: number; r: number }
  | { kind: 'windmill'; x: number; y: number; z: number; machineId: string }
  | { kind: 'sea'; x0: number; y0: number; x1: number; y1: number; machineId: string; gaugeX: number; gaugeY: number; hi: number }
  | { kind: 'pool'; machineId: string; pool: [number, number, number, number]; wz: number; skyRoadPts?: Vec3[]; skyRoadH?: number; gate?: { pos: Vec3; axis: 'x' | 'y'; h0: number; h1: number } }
  | { kind: 'doorPair'; machineId: string; near: Vec3; nearAng: number; far: Vec3; farAng: number; banners: string[]; want: number; fixed?: boolean }
  | { kind: 'seamBar'; machineId: string; pos: Vec3; axis: 'x' | 'y' }
  | { kind: 'clutchVisual'; machineId: string; from: Vec3; to: Vec3; maxLen: number }
  | { kind: 'conveyorVisual'; machineId: string; x: number; y0: number; dy: number; laneCount: number }
  | { kind: 'companionVisual'; machineId: string; a: Vec3; b: Vec3; markDist?: number }
  | { kind: 'liftColumn'; machineId: string; x: number; y: number; zBase: number; step: number; floors: number; deckBox?: [number, number, number, number]; trees?: Array<[number, number]> }
  | { kind: 'turntableVisual'; machineId: string; pivot: Vec3; rad: number; baseDeg: number }
  | { kind: 'crossDiscVisual'; machineId: string; center: Vec3; rad: number; baseDeg: number }
  | { kind: 'seesawVisual'; machineId: string; pivot: Vec3; baseDeg: number; side: number }
  | { kind: 'cameraDial'; machineId: string; pos: Vec3; detents: number[] }
  | { kind: 'windSockVisual'; machineId: string; x: number; y: number; z: number }
  | { kind: 'drawbridgeVisual'; machineId: string; hinge: Vec3; len: number; w: number; axis?: 'z' | 'x' }
  | { kind: 'cubeVisual'; h: number; H: number; cr: number; storey: number };

export interface TerrainConfig {
  strip?: boolean;
  carve?: boolean;
  anchors?: Array<[number, number, number]>;
  carves?: Array<[number, number, number]>;
}

export interface LevelHints {
  /** One-sentence nudge shown first (tier 1). */
  nudge: string;
  /** Concise full explanation (tier 2). */
  explain: string;
  /** Optional machine id to pulse/highlight when nudge is shown. */
  focusMachine?: string;
}

export interface SimLevelDef {
  id: string;
  item: string;
  name: string;
  chapter: string;
  chapterIndex: number;
  theme: ThemeId;
  yaws: number[];
  cruise?: [number, number];
  hints: LevelHints;
  /** Framing center & bounding points in sketch coords. */
  center: Vec3;
  pts: Vec3[];
  pad?: number;
  terrain?: TerrainConfig | boolean;
  scenery?: boolean;
  ambient?: boolean;
  /** Build the deterministic level instance. */
  build: () => BuiltSimLevel;
}

export interface BuiltSimLevel {
  roads: SimRoad[];
  machines: SimMachine[];
  keys: SimKey[];
  gates: SimGate[];
  occluders: OccluderBox[];
  visuals: VisualProp[];
  /** Initial wheel spawn. */
  spawn: () => { road: SimRoad; s: number; dir: 1 | -1 };
  /** Optional checkpoint resolver (station loop or Cube wall). */
  checkpoint?: () => { road: SimRoad; s: number; dir: 1 | -1 } | null;
  /** Optional per-tick custom updater (e.g., Cube wall turning, key gate checks, station checkpoints). */
  onTick?: (dt: number, wheel: WheelState, bike: BikeInput, emit: (e: Omit<SimEvent, 'id'>) => void) => void;
  /** Live bike target guidance for the shared shell HUD. */
  hudTarget?: (wheel: WheelState) => { cadence?: CadenceTarget; zone?: ZoneTarget; hintNudge?: string; focusMachine?: string };
  /** Built-in deterministic autopilot for headless scenarios & "Watch a solve". */
  solve: (wheel: WheelState, out: { cad: number; ftp: number; gearScale: number }) => void;
  /** Optional extra camera yaw/roll/sink state getter (used by Cube & cameraCrank). */
  cameraState?: () => { yawDeg: number; rollDeg: number; cubeRotY?: number; cubeSink?: number; wallIndex?: number };
  /** Optional tide level 0..1 getter (for Spring Tide achievement). */
  tideLevel?: () => number | null;
  /** Optional hidden-gap status for diegetic ghost-bridge rendering. */
  hiddenGaps?: () => Array<{ a: Vec3; b: Vec3; hidden: boolean }>;
  /** Optional custom frame override. */
  frameOverride?: { center: Vec3; pts: Vec3[]; pad?: number };
  /** Optional terrain anchors & carves collected during build. */
  anchors?: Array<[number, number, number]>;
  carves?: Array<[number, number, number]>;
  terrainIgnoreRoadIds?: Set<string>;
}

export type WheelMode = 'spawn' | 'road' | 'hop' | 'fall' | 'win' | 'dead';

export interface WheelState {
  mode: WheelMode;
  t: number;
  road: SimRoad;
  s: number;
  dir: 1 | -1;
  spin: number;
  /** Current world position (Three/world coords). */
  pos: Vec3;
  /** Current road normal (world). */
  normal: Vec3;
  /** Current travel heading (world). */
  heading: Vec3;
  /** Fall velocity/position in camera plane. */
  fallPos: Vec2;
  fallVel: Vec2;
  fallCamZ: number;
  fallFrom: SimRoad | null;
  /** Hop interpolation endpoints. */
  hopA: Vec3;
  hopB: Vec3;
  hopLen: number;
  hopTo: { road: SimRoad; s?: number; k?: 0 | 1; dir?: 1 | -1 } | null;
  /** Last visited safe station checkpoint. */
  lastStation: { road: SimRoad; s: number; dir: 1 | -1; index: number } | null;
}

// ---- Snapshot & Save ----

export interface MachineSnapshot {
  id: string;
  kind: MachineKind;
  mode: MachineMode;
  key?: FaceKey;
  name: string;
  on: boolean;
  live: boolean;
  value: number;
  progress: number;
  ready: boolean;
  status: string;
  capPos: Vec3;
  capNormal: Vec3;
  size: number;
  transform?: Mat4;
  extra?: Record<string, number | boolean | string>;
}

export interface PenroseSave {
  done: string[];
  at: number;
  clean?: string[];
}

export interface PenroseSnapshot {
  /** Monotonically increasing counter whenever a new level (or restart) is loaded. */
  loadSeq: number;
  levelIndex: number;
  levelCount: number;
  chapterIndex: number;
  chapterName: string;
  levelId: string;
  levelName: string;
  theme: ThemeId;
  state: 'play' | 'won' | 'restart';
  wonT: number;
  restartT: number;
  autopilot: boolean;
  /** Active hint tier: 0 = hidden, 1 = nudge, 2 = full explain. */
  hintTier: 0 | 1 | 2;
  hintText: string;
  focusMachine: string | null;
  /** True when the in-game chapter/level picker overlay is open. */
  pickerOpen: boolean;
  /** Active camera yaw & roll in radians, plus optional paddle peek offset. */
  yawRad: number;
  rollRad: number;
  peekYawRad: number;
  cubeRotY: number;
  cubeSink: number;
  wallIndex: number;
  /** Wheel pose for rendering. */
  wheel: {
    mode: WheelMode;
    roadId: string;
    t: number;
    pos: Vec3;
    normal: Vec3;
    heading: Vec3;
    spin: number;
    spawnPos: Vec3;
    spawnNormal: Vec3;
    speedRatio: number;
    onWater: boolean;
  };
  /** Goal endpoint pose (if level has a goal road). */
  goal: { pos: Vec3; normal: Vec3; dir: Vec3 } | null;
  machines: MachineSnapshot[];
  keys: Array<{ id: string; pos: Vec3; got: boolean; anim: number }>;
  gates: Array<{ id: string; angle: number; open: boolean }>;
  hiddenGaps: Array<{ a: Vec3; b: Vec3; hidden: boolean }>;
  /** Road world-space transforms for dynamic roads (groupId -> Mat4). */
  roadTransforms: Record<string, Mat4>;
  /** In-band cruise indicator (true when cadence is inside level's cruise band). */
  inCruiseBand: boolean;
  /** Current cadence & load for subtle visual effects. */
  cadence: number;
  load: number;
  /** Recent semantic events since sim start (ring buffer; renderer tracks lastEventId). */
  events: SimEvent[];
  /** Catalog summary for chapter picker & progress display. */
  done: string[];
  clean: string[];
  /** Live reference to current built level definition (read-only by renderer on loadSeq change). */
  levelDef: SimLevelDef;
  builtLevel: BuiltSimLevel;
}

export type PenroseAction =
  | { type: 'toggle'; key: FaceKey }
  | { type: 'cmd'; kind: 'restart' | 'next' | 'prev' | 'solve' | 'hint' | 'picker' }
  | { type: 'goto'; index: number }
  | { type: 'closePicker' };
