// ===== Basics =====
export type Seconds = number; export type Watts = number; export type Rpm = number; export type Bpm = number;
export const FIXED_DT: Seconds = 1 / 30;

export interface Clock { now(): Seconds; timeScale: number; }

// ===== Profiles & progression =====
export type ZoneSource = 'auto' | 'power' | 'hr'; // auto = HR if connected & fresh (<5s), else power
export type AimMode = 'auto' | 'rotate' | 'axes' | 'buttons';
export interface ProfileSettings {
  difficulty: number;      // 0.5..1.5, default 1.0
  zoneSource: ZoneSource;
  aimMode: AimMode;        // default 'rotate' (paddles) with auto-aim fallback when paddles idle
  paddleDeadzone: number;  // 0..100, default 15
  paddleInvertL: boolean; paddleInvertR: boolean;
  maxGradePct: number;     // safety cap, default 12
  ergCapFtpFraction: number; // default 1.5
}
export interface Profile {
  id: string; name: string; color: string;           // color = hex, used for the player avatar in all games
  ftp: Watts; maxHr: Bpm; weightKg: number;
  xp: number; level: number; achievements: string[];
  lifetime: { kj: number; seconds: number; sessions: number; sprints: number };
  gameData: Record<string, unknown>;                  // per-game persistent saves, keyed by game id
  lastPlayed: Record<string, number>;                 // game id -> epoch ms
  settings: ProfileSettings;
  createdAt: number;
}

// ===== Bike state =====
export type TrainerMode = 'sim' | 'erg' | 'resistance' | 'none';
export interface DeviceSample { power?: Watts; cadence?: Rpm; speedKph?: number; hr?: Bpm; resistanceLevel?: number; }
export interface BikeState {
  t: Seconds;
  connected: { trainer: boolean; hr: boolean; controller: boolean; fake: boolean };
  raw: { power: Watts; cadence: Rpm; speedKph: number; hr: Bpm | null; resistanceLevel: number | null; lastPacketAgeS: number };
  power3s: Watts; power10s: Watts; cadence3s: Rpm; hr5s: Bpm | null;
  crankRevs: number;         // cumulative, integrated from cadence (fractional)
  powerZone: 1|2|3|4|5|6|7;  // Coggan: <55,56-75,76-90,91-105,106-120,121-150,>150 %FTP (power3s)
  hrZone: 1|2|3|4|5 | null;  // %maxHr: <60,60-70,70-80,80-90,>=90
  effortZone: 1|2|3|4|5;     // per profile.zoneSource; power zones 6/7 clamp to 5
  ftpFraction: number;       // power3s / ftp
  sprinting: boolean;        // power3s >= tuning 'core.sprintFtp' (default 1.2) × FTP for >= 2s
  sprintCount: number;
  kj: number; activeSeconds: number; // active = cadence > 20
  gear: number;              // virtual gear index, 1..11, neutral 6
  trainerMode: TrainerMode;  // mode of the last applied command
}

// ===== Input =====
export type Button = 'up'|'down'|'left'|'right'|'a'|'b'|'y'|'z'
  |'shiftUpL'|'shiftDnL'|'shiftUpR'|'shiftDnR'|'powerUpL'|'powerUpR'|'onOffL'|'onOffR';
export interface InputState {
  held: ReadonlySet<Button>;
  pressed: ReadonlySet<Button>;   // went down since previous sim tick
  released: ReadonlySet<Button>;
  paddleL: number; paddleR: number; // -1..1 after deadzone/invert
  paddleIdleS: number;              // seconds since either paddle was outside deadzone
  source: 'ride' | 'keyboard' | 'gamepad' | 'touch' | 'script';
}
export type SystemAction = 'pause' | 'toggleDebug' | 'panic';

// ===== Trainer =====
export type TrainerCommand =
  | { mode: 'sim'; gradePct: number; windMps?: number; crr?: number; cw?: number }
  | { mode: 'erg'; watts: Watts }
  | { mode: 'resistance'; levelPct: number }  // 0..100 of supported range
  | { mode: 'none' };
export interface TrainerCapabilities { sim: boolean; erg: boolean; resistance: boolean; resistanceRange?: [number, number, number]; powerRange?: [number, number, number] }
export interface TrainerDevice {
  readonly kind: 'ftms' | 'fake';
  readonly capabilities: TrainerCapabilities;
  apply(cmd: TrainerCommand): Promise<{ ok: boolean; result?: number; detail?: string }>;
  onSample(cb: (s: DeviceSample) => void): () => void;
  onStatus(cb: (s: { connected: boolean; detail?: string }) => void): () => void;
  disconnect(): Promise<void>;
}
export interface HrDevice { onSample(cb: (s: DeviceSample) => void): () => void; onStatus(cb: (s: { connected: boolean }) => void): () => void; disconnect(): Promise<void>; }
export interface ControllerRawState { buttons: ReadonlySet<Button>; paddleL: number; paddleR: number } // paddles raw -100..100
export interface ControllerDevice {
  onState(cb: (s: ControllerRawState) => void): () => void;
  onStatus(cb: (s: { connected: boolean; firmware?: string; battery?: number; warning?: string }) => void): () => void;
  disconnect(): Promise<void>;
}

// ===== Resistance =====
export interface ResistanceEffect {
  id: string;                 // re-setting the same id replaces it
  mode: 'sim' | 'erg' | 'resistance';
  priority?: number;          // default 0; the mode of the highest-priority active effect wins
  gradePct?: number;          // sim: additive
  watts?: Watts;              // erg: absolute target
  ftpFraction?: number;       // erg: target = ftpFraction × FTP (used if watts absent)
  levelPct?: number;          // resistance: additive, 0..100
  ttl?: Seconds;              // auto-expire after ttl sim-seconds
}
export interface ResistanceController {
  set(effect: ResistanceEffect): void;
  clear(id: string): void;
  clearAll(): void;
  useVirtualGears(enabled: boolean, side?: 'L' | 'R'): void; // shifters change gear (only that hood's if `side` is given); applies in sim mode only
}

// ===== Tuning =====
export interface Tuning {
  num(key: string, def: number, min: number, max: number, step?: number, help?: string): () => number;
  bool(key: string, def: boolean, help?: string): () => boolean;
  choice<T extends string>(key: string, def: T, options: readonly T[], help?: string): () => T;
}

// ===== Games =====
export type GameEvent = { type: string; data?: Record<string, number | string | boolean> };
export interface GameContext {
  clock: Clock;
  profile: Readonly<Profile>;
  bike(): Readonly<BikeState>;
  input(): Readonly<InputState>;
  resistance: ResistanceController;
  tuning: Tuning;
  rng(): number;                                   // seeded, [0,1)
  emit(e: GameEvent): void;                        // → session log, achievements, sfx hook
  debug(key: string, value: number | string | boolean): void; // shown in debug overlay "game" section
  save(data: unknown): void;                       // persist into profile.gameData[gameId]
  load<T>(): T | undefined;
}
/** What a control does right now, for the shell's on-screen controller legend. */
export type ControlTarget = Button | 'dpad' | 'paddles' | 'shiftersL' | 'shiftersR';
export interface ControlHint { button: ControlTarget; label: string; active?: boolean }
/**
 * A zone band. `source: 'power'` = judged on min(5, powerZone): use it for any effort shorter than ~2 min,
 * because HR lags 30–60 s and can't follow a sprint. Default 'effort' = effortZone (HR-aware), for long holds.
 */
export interface ZoneTarget { min: 1|2|3|4|5; max: 1|2|3|4|5; label?: string; source?: 'power' | 'effort' }
/** A cadence band in rpm (cadence3s); `max` omitted = no upper limit. */
export interface CadenceTarget { min: Rpm; max?: Rpm; label?: string }
/** Optional per-tick HUD info the shell renders over every game (zone widget, gear chip, controller legend). */
export interface GameHud {
  targetZone?: ZoneTarget;         // zone band the game wants now
  targetCadence?: CadenceTarget;   // cadence band the game wants now (shown next to the rpm readout)
  controls?: ControlHint[];        // current button mapping; shown in the controller legend
  gears?: boolean;                 // true if shifters change virtual gears in this game right now
}
export interface GameSim {
  update(dt: Seconds): void;       // called with FIXED_DT
  hud?(): GameHud;                 // read by the shell each frame; keep it cheap and plain-data
  snapshot(): unknown;             // plain data view-model consumed by renderer and tests
  isOver(): boolean;
  /** Optional: true while the sim shows its own pre-game menu (camp, loadout). The shell runs the sim through it and starts the 3-2-1-GO countdown only after it ends. */
  inMenu?(): boolean;
  summary(): Record<string, number | string>;
  dispose?(): void;
  /** Optional: UI actions from the renderer (e.g. taps on a canvas menu); apply them on the next update(). */
  receive?(action: unknown): void;
}
/** CSS px the shell's HUD covers on each edge of the (edge-to-edge) render surface. Draw backgrounds full-bleed; keep foreground UI and the play focus inside. */
export interface Insets { top: number; right: number; bottom: number; left: number }
export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
export interface GameRenderer {
  mount(container: HTMLElement, ctx: { profile: Readonly<Profile>; send?: (action: unknown) => void; insets?: Insets }): void; // send -> GameSim.receive
  /** Called after mount and whenever the HUD size changes. */
  setInsets?(insets: Insets): void;
  render(snapshot: unknown, bike: Readonly<BikeState>, input: Readonly<InputState>): void;
  resize?(w: number, h: number): void;
  unmount(): void;
}
export interface GameModule {
  id: string; title: string; blurb: string;
  tags: Array<'zone2' | 'sprint' | 'intervals'>;
  createSim(ctx: GameContext, opts?: { seed?: number }): GameSim;
  loadRenderer(): Promise<GameRenderer>;           // must use dynamic import()
  /** Optional: one short line for the arcade card from this rider's save (profile.gameData[id]), e.g. "Best floor 7". Pure. */
  progressLine?(save: unknown): string | null;
  /** Optional: animated banner art for the arcade card (Canvas 2D, ~16:7). `t` = seconds; `color` = rider colour. Keep it tiny. */
  drawCard?(g: CanvasRenderingContext2D, w: number, h: number, t: number, color: string): void;
}

// ===== Sessions =====
export interface SessionSample { t: Seconds; power: Watts; cadence: Rpm; hr: Bpm | null; grade: number | null; mode: TrainerMode }
export interface SessionRecord {
  id: string; profileId: string; gameId: string; startedAt: number; durationS: number;
  samples: SessionSample[];                         // 1 Hz (kept for future FIT export)
  events: Array<{ t: Seconds } & GameEvent>;
  stats: { avgPower: number; maxPower: number; kj: number; avgHr: number | null; zoneSeconds: number[]; sprints: number };
  gameSummary: Record<string, number | string>;
}
