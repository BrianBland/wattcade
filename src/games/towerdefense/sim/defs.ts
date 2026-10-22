// Dynamo Defense catalogues and field geometry. Pure data + math; no DOM, no rng.
import { FIELD_H, FLYER_SPAWNS, ROAD, ROAD_PADS, ROAD_PAD_NAMES, SPAWN_Y, TURRET } from './road';
export type Element = 'blue' | 'red' | 'purple';
export type Weapon = 'gatling' | 'flame' | 'rail';
export type Kind = 'mini' | 'dart' | 'brute' | 'charger' | 'armor' | 'carrier' | 'prism' | 'boss';
export type TowerKind = 'tesla' | 'flamer' | 'lens';

export const ELEMENTS: Element[] = ['blue', 'red', 'purple'];
export const WEAPONS: Weapon[] = ['gatling', 'flame', 'rail'];
export const WEAPON_ELEMENT: Record<Weapon, Element> = { gatling: 'blue', flame: 'red', rail: 'purple' };
export const ELEMENT_WEAPON: Record<Element, Weapon> = { blue: 'gatling', red: 'flame', purple: 'rail' };
export type Matchup = Record<Weapon, Record<Element, number>>;
/** Crystal shatters under bullets, fuel bladders ignite, sealed plates need piercing. */
export const MATCHUP: Matchup = {
  gatling: { blue: 1.5, red: 1, purple: 0.5 },
  flame: { blue: 0.5, red: 1.5, purple: 1 },
  rail: { blue: 1, red: 0.5, purple: 1.5 },
};
export const TOWER_WEAPON: Record<TowerKind, Weapon> = { tesla: 'gatling', flamer: 'flame', lens: 'rail' };

/** Cover the largest off-colour push with a strong tower; never suggest resistance to that push. */
export function suggestedTower(counts: Record<Element, number>, brood: Element, matrix: Matchup = MATCHUP): TowerKind {
  const off = ELEMENTS.filter((e) => e !== brood);
  const target = off.reduce((a, b) => counts[b] > counts[a] ? b : a);
  const safe = TOWER_KINDS.filter((k) => matrix[TOWER_WEAPON[k]][target] >= 1);
  return (safe.length ? safe : TOWER_KINDS).reduce((a, b) =>
    matrix[TOWER_WEAPON[b]][target] > matrix[TOWER_WEAPON[a]][target] ? b : a);
}
export const WEAPON_NAME: Record<Weapon, string> = { gatling: 'Gatling', flame: 'Fireball', rail: 'Railgun' };

/** color: fixed element, 'gold' = boss (announced phases), 'prism' = cycles on its own. */
export interface KindDef {
  name: string; hp: number; speed: number; dmg: number; color: Element | 'gold' | 'prism';
  radius: number; scrap: number; heavy: boolean;
}
// speed in field units / s (the road is ~245 units long; Gliders fly ~100 straight to the turret)
export const KINDS: Record<Kind, KindDef> = {
  mini:    { name: 'Skitter', hp: 10,  speed: 4.6, dmg: 1,  color: 'blue',   radius: 1.4, scrap: 1,  heavy: false },
  dart:    { name: 'Glider',        hp: 7,   speed: 8.5, dmg: 1,  color: 'blue',   radius: 1.2, scrap: 1,  heavy: false },
  brute:   { name: 'Warrior',       hp: 70,  speed: 3.5, dmg: 5,  color: 'red',    radius: 2.7, scrap: 5,  heavy: true },
  charger: { name: 'Ram',     hp: 55,  speed: 2.8, dmg: 6,  color: 'red',    radius: 2.4, scrap: 6,  heavy: true },
  armor:   { name: 'Bulwark',     hp: 95,  speed: 2.3, dmg: 8,  color: 'purple', radius: 3.2, scrap: 8,  heavy: true },
  carrier: { name: 'Broodmother',     hp: 150, speed: 1.9, dmg: 10, color: 'purple', radius: 3.6, scrap: 12, heavy: true },
  prism:   { name: 'Stalker',       hp: 90,  speed: 3.0, dmg: 6,  color: 'prism',  radius: 2.6, scrap: 10, heavy: true },
  boss:    { name: 'Hive Tyrant',     hp: 260, speed: 1.6, dmg: 30, color: 'gold',   radius: 5.2, scrap: 60, heavy: true },
};
/** First wave each kind can appear in. */
export const KIND_FROM: Record<Kind, number> = { mini: 1, dart: 2, brute: 1, charger: 3, armor: 2, carrier: 4, prism: 6, boss: 4 };

/** `air`: can hit flying Gliders. `cone`: half-angle of a continuous cone (flamer), hitting everything inside. */
export interface TowerDef { name: string; element: Element; cost: number; range: number; period: number; dmg: number; desc: string; air: boolean; cone?: number }
export const TOWERS: Record<TowerKind, TowerDef> = {
  tesla:  { name: 'Tesla Coil',  element: 'blue',   cost: 60,  range: 24, period: 0.8, dmg: 2.1,  desc: 'Chain lightning (3 targets)', air: true },
  flamer: { name: 'Flamethrower', element: 'red',    cost: 80,  range: 15, period: 0.25, dmg: 1.2, desc: 'Short fire cone · ground only', air: false, cone: 0.55 },
  lens:   { name: 'Prism Lens',  element: 'purple', cost: 100, range: 44, period: 3.2, dmg: 17, desc: 'Charged beam at the toughest', air: true },
};
export const TOWER_KINDS: TowerKind[] = ['tesla', 'flamer', 'lens'];
export const TOWER_MAX_LEVEL = 5;
/** Damage / range multipliers per tower level (index = level - 1). */
export const LEVEL_DMG = [1, 1.8, 3, 4.6, 6.6];
export const LEVEL_RANGE = [1, 1.12, 1.25, 1.32, 1.4];
const LEVEL_COST = [1.4, 2.4, 4, 7];
/** Scrap to go from `level` to level + 1. */
export function towerUpgradeCost(kind: TowerKind, level: number, costMult = 1): number {
  return Math.round(TOWERS[kind].cost * LEVEL_COST[Math.min(LEVEL_COST.length - 1, level - 1)] * costMult);
}
export function towerBuildCost(kind: TowerKind, costMult = 1): number { return Math.round(TOWERS[kind].cost * costMult); }

// ----- field geometry: one road (sim/road.ts) from the hive to the turret; Gliders fly straight -----
export { FIELD_W, FIELD_H, TURRET } from './road';
export const BASE_X = TURRET.x;
export const BASE_Y = TURRET.y;
/** An alien this close to the end of the road (or its flight) has reached the turret. */
export const BASE_R = 8;

type P = { x: number; y: number };
/** The walkable road: ROAD from where it crosses the spawn edge to the turret, with cumulative distances. */
const ROAD_TABLE = (() => {
  const first = Math.max(0, ROAD.findIndex((p) => p.y >= SPAWN_Y) - 1);
  const pts = ROAD.slice(first), cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return { pts, cum, len: cum[cum.length - 1] };
})();
export const ROAD_LENGTH = ROAD_TABLE.len;
/** Point `d` units along the road from the spawn edge, with the unit normal (pointing to the walker's left). */
export function roadAt(d: number): { x: number; y: number; nx: number; ny: number } {
  const { pts, cum, len } = ROAD_TABLE, dd = Math.max(0, Math.min(len, d));
  let lo = 0, hi = pts.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= dd) lo = m; else hi = m; }
  const seg = cum[hi] - cum[lo] || 1, k = (dd - cum[lo]) / seg, a = pts[lo], b = pts[hi];
  const tx = b.x - a.x, ty = b.y - a.y, tl = Math.hypot(tx, ty) || 1;
  return { x: a.x + tx * k, y: a.y + ty * k, nx: ty / tl, ny: -tx / tl };
}
/** Road distance of the nearest road point to (x, y). */
export function roadDistanceOf(x: number, y: number): number {
  let best = Infinity, at = 0;
  for (let i = 0; i < ROAD_TABLE.pts.length; i++) { const p = ROAD_TABLE.pts[i], d = Math.hypot(p.x - x, p.y - y); if (d < best) { best = d; at = ROAD_TABLE.cum[i]; } }
  return at;
}
/** The road for drawing (every `step` samples, always ending at the turret). */
export function roadPolyline(step = 4): P[] {
  const pts = ROAD_TABLE.pts;
  return pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
}
/** Glider flight `route` (an index into FLYER_SPAWNS): straight from its spawn to the turret. */
export const flightLength = (route: number): number => Math.hypot(TURRET.x - FLYER_SPAWNS[route].x, TURRET.y - FLYER_SPAWNS[route].y);
export function flightAt(route: number, d: number): { x: number; y: number; nx: number; ny: number } {
  const a = FLYER_SPAWNS[route], len = flightLength(route), k = Math.max(0, Math.min(1, d / len));
  const tx = (TURRET.x - a.x) / len, ty = (TURRET.y - a.y) / len;
  return { x: a.x + (TURRET.x - a.x) * k, y: a.y + (TURRET.y - a.y) * k, nx: ty, ny: -tx };
}

/** Aim angle from the base to a point: 0 = straight up, negative = left. */
export const angleTo = (x: number, y: number): number => Math.atan2(x - BASE_X, BASE_Y - y);
export const distTo = (x: number, y: number): number => Math.hypot(x - BASE_X, y - BASE_Y);
export const AIM_LIMIT = 1.45;

/** Build pads beside the road. `s` = road distance of the nearest stretch. */
export interface Pad { id: number; x: number; y: number; name: string; s: number }
export const PADS: Pad[] = ROAD_PADS.map((p, id) => ({ id, x: p.x, y: p.y, name: ROAD_PAD_NAMES[id], s: roadDistanceOf(p.x, p.y) }));
/** The workshop's pseudo-pad for the base (repair). */
export const BASE_PAD = PADS.length;

/**
 * Pads and the base (BASE_PAD) in on-screen order for ◀▶. Portrait reads in rows, top to bottom and left to
 * right; a turned (landscape) field reads in columns, left (turret) to right (hive) and top to bottom. Points
 * within `band` world units across the main axis share a row/column. Pure, so the sim and tests agree.
 */
export function padOrder(turned: boolean, band = 12): number[] {
  const pts = [...PADS.map(p => ({ id: p.id, x: p.x, y: p.y })), { id: BASE_PAD, x: BASE_X, y: BASE_Y }]
    // screen axes: `main` runs down the rows (portrait) or across the columns (landscape); `cross` along them
    .map(p => turned ? { id: p.id, main: FIELD_H - p.y, cross: p.x } : { id: p.id, main: p.y, cross: p.x })
    .sort((a, b) => a.main - b.main || a.cross - b.cross);
  const rows: Array<typeof pts> = [];
  for (const p of pts) {
    const row = rows.at(-1);
    if (row && p.main - row[0].main <= band) row.push(p); else rows.push([p]);
  }
  return rows.flatMap(r => r.sort((a, b) => a.cross - b.cross).map(p => p.id));
}
