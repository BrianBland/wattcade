// Dynamo Defense catalogues and field geometry. Pure data + math; no DOM, no rng.
export type Element = 'blue' | 'red' | 'purple';
export type Weapon = 'gatling' | 'flame' | 'rail';
export type Kind = 'mini' | 'dart' | 'brute' | 'charger' | 'armor' | 'carrier' | 'prism' | 'boss';
export type TowerKind = 'tesla' | 'mortar' | 'lens';

export const ELEMENTS: Element[] = ['blue', 'red', 'purple'];
export const WEAPONS: Weapon[] = ['gatling', 'flame', 'rail'];
export const WEAPON_ELEMENT: Record<Weapon, Element> = { gatling: 'blue', flame: 'red', rail: 'purple' };
export const ELEMENT_WEAPON: Record<Element, Weapon> = { blue: 'gatling', red: 'flame', purple: 'rail' };
export const WEAPON_BUTTON: Record<Weapon, 'a' | 'b' | 'y'> = { gatling: 'a', flame: 'b', rail: 'y' };

/** color: fixed element, 'gold' = boss (shield cycles), 'prism' = cycles on its own. */
export interface KindDef {
  name: string; hp: number; speed: number; dmg: number; color: Element | 'gold' | 'prism';
  radius: number; scrap: number; heavy: boolean;
}
// speed in field units / s (lanes are ~110-125 units long)
export const KINDS: Record<Kind, KindDef> = {
  mini:    { name: 'Swarm drone', hp: 10,  speed: 4.6, dmg: 1,  color: 'blue',   radius: 1.4, scrap: 1,  heavy: false },
  dart:    { name: 'Dart',        hp: 7,   speed: 8.5, dmg: 1,  color: 'blue',   radius: 1.2, scrap: 1,  heavy: false },
  brute:   { name: 'Brute',       hp: 70,  speed: 3.5, dmg: 5,  color: 'red',    radius: 2.7, scrap: 5,  heavy: true },
  charger: { name: 'Charger',     hp: 55,  speed: 2.8, dmg: 6,  color: 'red',    radius: 2.4, scrap: 6,  heavy: true },
  armor:   { name: 'Bastion',     hp: 95,  speed: 2.3, dmg: 8,  color: 'purple', radius: 3.2, scrap: 8,  heavy: true },
  carrier: { name: 'Carrier',     hp: 150, speed: 1.9, dmg: 10, color: 'purple', radius: 3.6, scrap: 12, heavy: true },
  prism:   { name: 'Prism',       hp: 90,  speed: 3.0, dmg: 6,  color: 'prism',  radius: 2.6, scrap: 10, heavy: true },
  boss:    { name: 'Goliath',     hp: 260, speed: 1.6, dmg: 30, color: 'gold',   radius: 5.2, scrap: 60, heavy: true },
};
/** First wave each kind can appear in. */
export const KIND_FROM: Record<Kind, number> = { mini: 1, dart: 4, brute: 1, charger: 6, armor: 2, carrier: 9, prism: 12, boss: 5 };

export interface TowerDef { name: string; element: Element; cost: number; range: number; period: number; dmg: number; desc: string }
export const TOWERS: Record<TowerKind, TowerDef> = {
  tesla:  { name: 'Tesla Coil',  element: 'blue',   cost: 60,  range: 24, period: 0.8, dmg: 6,  desc: 'Chain lightning (3 targets)' },
  mortar: { name: 'Mortar',      element: 'red',    cost: 80,  range: 36, period: 2.4, dmg: 26, desc: 'Lobbed shells, splash damage' },
  lens:   { name: 'Prism Lens',  element: 'purple', cost: 100, range: 44, period: 3.2, dmg: 48, desc: 'Charged beam at the toughest' },
};
export const TOWER_KINDS: TowerKind[] = ['tesla', 'mortar', 'lens'];
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

// ----- field geometry (100 x 100 units; base at the bottom centre) -----
export const FIELD = 100;
export const BASE_X = 50;
export const BASE_Y = 90;
export const BASE_R = 6;

type P = { x: number; y: number };
/** Each lane is a cubic Bézier from its spawn (off the top / side edge) to the base. */
const LANE_CTRL: Array<[P, P, P, P]> = [
  [{ x: -3, y: 16 }, { x: 28, y: 18 }, { x: 18, y: 66 }, { x: BASE_X, y: BASE_Y }],
  [{ x: 50, y: -3 }, { x: 34, y: 28 }, { x: 66, y: 52 }, { x: BASE_X, y: BASE_Y }],
  [{ x: 103, y: 16 }, { x: 72, y: 18 }, { x: 82, y: 66 }, { x: BASE_X, y: BASE_Y }],
];
export const LANE_NAMES = ['Left', 'Centre', 'Right'];
const SAMPLES = 160;
function bez(c: [P, P, P, P], t: number): P {
  const u = 1 - t, a = u * u * u, b = 3 * u * u * t, d = 3 * u * t * t, e = t * t * t;
  return { x: a * c[0].x + b * c[1].x + d * c[2].x + e * c[3].x, y: a * c[0].y + b * c[1].y + d * c[2].y + e * c[3].y };
}
interface LaneTable { pts: P[]; cum: number[]; len: number }
const LANES: LaneTable[] = LANE_CTRL.map((c) => {
  const pts: P[] = [], cum: number[] = [0];
  for (let i = 0; i <= SAMPLES; i++) pts.push(bez(c, i / SAMPLES));
  for (let i = 1; i <= SAMPLES; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return { pts, cum, len: cum[SAMPLES] };
});
export const laneLength = (lane: number): number => LANES[lane].len;
/** Point `d` units along a lane, with the unit normal (pointing to the walker's left). */
export function laneAt(lane: number, d: number): { x: number; y: number; nx: number; ny: number } {
  const L = LANES[lane];
  const dd = Math.max(0, Math.min(L.len, d));
  let lo = 0, hi = SAMPLES;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (L.cum[m] <= dd) lo = m; else hi = m; }
  const seg = L.cum[hi] - L.cum[lo] || 1, k = (dd - L.cum[lo]) / seg;
  const a = L.pts[lo], b = L.pts[hi];
  const tx = b.x - a.x, ty = b.y - a.y, tl = Math.hypot(tx, ty) || 1;
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, nx: ty / tl, ny: -tx / tl };
}
/** Polyline of a lane for drawing (every `step` samples). */
export function lanePolyline(lane: number, step = 4): P[] {
  return LANES[lane].pts.filter((_, i) => i % step === 0 || i === SAMPLES);
}

/** Aim angle from the base to a point: 0 = straight up, negative = left. */
export const angleTo = (x: number, y: number): number => Math.atan2(x - BASE_X, BASE_Y - y);
export const distTo = (x: number, y: number): number => Math.hypot(x - BASE_X, y - BASE_Y);
export const AIM_LIMIT = 1.45;

/** Six build pads: two beside each lane (near / far), on the lane's outer side. */
export interface Pad { id: number; lane: number; x: number; y: number; near: boolean }
export const PADS: Pad[] = (() => {
  const out: Pad[] = [];
  const spec: Array<[number, number, number]> = [ // lane, fraction along, side (+1 = walker's left)
    [0, 0.52, -1], [0, 0.78, 1], [1, 0.3, 1], [1, 0.6, -1], [2, 0.52, 1], [2, 0.78, -1],
  ];
  spec.forEach(([lane, f, side], i) => {
    const p = laneAt(lane, laneLength(lane) * f);
    out.push({ id: i, lane, x: p.x + p.nx * side * 8, y: p.y + p.ny * side * 8, near: f > 0.6 });
  });
  return out;
})();
