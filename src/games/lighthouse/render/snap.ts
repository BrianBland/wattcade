// View-model the renderer reads from LighthouseSim.snapshot().
import type { BuildingType, Mode, ShipCheck, ShipKind, ShipState, StormPhase } from '../sim/sim';

export interface ShipView {
  id: number; kind: ShipKind; name: string; progress: number; lane: number; state: ShipState; age: number; dock: number; etaS: number; check: ShipCheck;
}
export interface Snap {
  t: number; fog: number; chop: number; lamp: number; zone: number; requirement: number;
  inZone: boolean; above: boolean; below: boolean;
  limits: { fog: number; chop: number; lamp: number };
  day: number;
  ships: ShipView[]; nextShipS: number;
  buildings: Array<BuildingType | null>; grow: number[]; meadow: number;
  mode: Mode; view: number;
  cursor: { plot: number; building: BuildingType; canBuild: boolean };
  canBuildAny: boolean;
  options: Array<{ type: BuildingType; label: string; cost: { coin: number; timber: number }; effect: string; owned: number; max: number; selected: boolean; reason: string | null }>;
  toasts: Array<{ id: number; text: string; color: string; age: number }>;
  cues: Array<{ name: string; id: number }>;
  coin: number; timber: number;
  storm: { phase: StormPhase; timeInPhase: number; warnS: number; duration: number; integrity: number; intensity: number; surge: boolean; nextInS: number; lightningAge: number; failed: boolean };
  bellAge: number;
}
