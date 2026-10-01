import type { BikeState, ControllerRawState, InputState, TrainerCommand } from '../contracts';

export interface TuningEntry {
  key: string; kind: 'num' | 'bool' | 'choice'; value: number | boolean | string; def: number | boolean | string;
  min?: number; max?: number; step?: number; options?: readonly string[]; help?: string;
}
export interface MixerView {
  activeEffects: Array<Record<string, unknown>>; chosenMode: string; lastCommand: TrainerCommand | null; lastResult: string;
}
export interface DeviceStatsView { packets: number; lastPacketAt: number; lastStatusHex?: string | string[] }
export interface DebugSnapshot {
  bike: Readonly<BikeState> | null;
  input: Readonly<InputState> | null;
  rawController: ControllerRawState | null;
  mixer: MixerView | null;
  game: Record<string, number | string | boolean>;
  tuning: TuningEntry[];
  difficulty: number; timeScale: number; fake: boolean;
  fakeScript: string; scripts: string[];
  stats: { trainer?: DeviceStatsView; hr?: DeviceStatsView; controller?: DeviceStatsView };
  trainerDetail?: string;
  controllerInfo: { firmware?: string; battery?: number; warning?: string };
}
/** Everything the overlay can do; implemented in shell/services.ts. */
export interface DebugActions {
  setDifficulty(v: number): void;
  setTimeScale(v: number): void;
  panic(on: boolean): void;
  applyTest(cmd: TrainerCommand): void;
  setTuning(key: string, v: number | boolean | string): void;
  resetTuning(): void;
  setFakeScript(name: string): void;
  fakeAdjust(k: 'cadence' | 'power' | 'hr', delta: number): void;
}
