/** The DOM the engine draws into, built by the renderer (see renderer.ts). */
export interface EngineDom {
  /** Full-bleed element whose background is the level's sky. */
  sky: HTMLElement;
  /** The play area (above the shell HUD); the WebGL canvas is appended here. */
  stage: HTMLElement;
  /** Tap targets over each machine, positioned in stage pixels. */
  badges: HTMLElement;
  /** The fade card between levels (expects `.feb` and `.ftt` children). */
  fade: HTMLElement;
  ui: {
    cad: { value: number };
    cadOut: HTMLElement; read: HTMLElement; mach: HTMLElement;
    status: HTMLElement; hint: HTMLElement;
  };
}

/** `item` is the campaign entry it was built from: a level id, '<tier>:<seed>' or 'cg:<seed>' (see ../campaign.ts). */
export interface LevelInfo { id: string; name: string; chapter?: string; item?: string }
export interface MachineInfo { key: 'a' | 'b' | 'y' | 'z'; name: string; on: boolean }

export interface EngineHooks {
  onWon(index: number): void;
  onFell(index: number): void;
  onLevel(index: number, def: LevelInfo, level: unknown): void;
  onAutopilot(on: boolean): void;
}

export interface PenroseEngine {
  readonly levels: LevelInfo[];
  readonly index: number;
  readonly autopilot: boolean;
  /** cad in rpm, gear 1..12; effort, when set, replaces the modelled watts the tide reads. */
  rider: { cad: number; gear: number; effort: number | null };
  load(index: number, quiet?: boolean): void;
  restart(): void;
  setAutopilot(on: boolean): void;
  /** Engage or release the machine on this face button; false if the level has none. */
  toggle(key: string): boolean;
  machines(): MachineInfo[];
  /** Total machine load, 0..1, for trainer resistance. */
  load01(): number;
  resize(): void;
  tick(dt: number): void;
  /** Advance the level without drawing (scripted checks). */
  simulate(dt: number): void;
  dispose(): void;
  /** Level-design tooling (seed sweeps, previews, the screen audit); used by scripts/penrose-*.mjs through dev/penrose.html. */
  tools: {
    tiers(): Array<{ index: number; id: string; label: string; zone: number }>;
    candidates(tier: number, seeds: number[]): unknown[];
    plan(tier: number, seed: number): unknown;
    curtainPlan(seed: number): unknown;
    handBuilt(): string[];
    preview(item: string): number;
    audit(o?: { step?: number }): unknown[];
  };
}
