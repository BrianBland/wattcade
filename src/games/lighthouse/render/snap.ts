// View-model the renderer reads from LighthouseSim.snapshot().
import type { BuildingType, Mode, RowKey, ShipCheck, ShipKind, ShipState, StormPhase } from '../sim/sim';
import type { DistrictId } from '../sim/layout';

export interface ShipView {
  id: number; kind: ShipKind; name: string; progress: number; lane: number; state: ShipState; age: number; dock: number; rescued: boolean; etaS: number; check: ShipCheck;
}
export interface Snap {
  t: number; fog: number; chop: number; lamp: number; zone: number; requirement: number;
  inZone: boolean; above: boolean; below: boolean;
  limits: { fog: number; chop: number; lamp: number };
  day: number;
  ships: ShipView[]; nextShipS: number;
  buildings: Array<BuildingType | null>; levels: number[]; grow: number[]; meadow: number; lens: number;
  districts: Array<{ id: DistrictId; name: string; open: boolean }>;
  nextDistrict: { name: string; goals: Array<{ label: string; have: number; need: number }> } | null;
  streak: { s: number; mult: number; nextS: number; off: number };
  rescue: { ship: number; at: number; plot: number; age: number; readyInS: number };
  mode: Mode; view: number; logOpen: boolean;
  cursor: { plot: number; row: RowKey; building: BuildingType | null; level: number; canBuild: boolean; links: number[]; bonus: string };
  canBuildAny: boolean;
  options: Array<{ type: RowKey; icon: string; label: string; cost: { coin: number; timber: number } | null; effect: string; owned: number; max: number; selected: boolean; reason: string | null }>;
  toasts: Array<{ id: number; text: string; color: string; age: number }>;
  cues: Array<{ name: string; id: number }>;
  coin: number; timber: number;
  storm: { phase: StormPhase; timeInPhase: number; warnS: number; duration: number; integrity: number; intensity: number; surge: boolean; nextInS: number; lightningAge: number; failed: boolean };
  bellAge: number;
  totals: { shipsDockedTotal: number; stormsWeatheredTotal: number };
  stats: {
    shipsDocked: number; shipsLost: number; shipsRescued: number; buildingsBuilt: number; upgrades: number; stormsWeathered: number; stormsFailed: number;
    coinEarned: number; bestStreakS: number; districtsOpened: number; bloomGained: number; minutesInZoneS: number;
  };
}
