// Shared, deterministic recommendation for the rider and Auto-crew.
import {
  ELEMENTS, MATCHUP, TOWER_WEAPON, LEVEL_DMG, TOWERS, TOWER_KINDS, TOWER_MAX_LEVEL, towerBuildCost, towerUpgradeCost, type Element, type Matchup, type TowerKind,
} from './defs';
import { LEVEL_0, levelGeometry, type TdGeometry } from './level';
import type { WaveForecast } from './types';

export interface CrewTower { pad: number; kind: TowerKind; level: number }
export interface BuildSuggestion {
  wave: number; kind: 'build' | 'upgrade' | 'repair'; pad: number; tower?: TowerKind;
  /** Expected current level; prevents replaying an upgrade against a changed tower. */
  level: number; targetLevel: number; cost: number; label: string;
}
export interface ConstructionState {
  wave: number; brood: Element; counts: WaveForecast; towers: readonly CrewTower[];
  scrap: number; costMult: number; baseHp: number; baseMaxHp: number; repairCost: number;
  matchup?: Matchup;
  /** Optional restriction for the workshop's highlighted pad; same recommendation rules. */
  pad?: number;
  /** The level's geometry (default: level 0). */
  geo?: TdGeometry;
}

/** Road (and, for anti-air towers, flight path) within a tower kind's level-1 range of each pad, in units. */
const coverCache = new WeakMap<TdGeometry, Record<TowerKind, number[]>>();
export function padCover(geo: TdGeometry): Record<TowerKind, number[]> {
  const hit = coverCache.get(geo);
  if (hit) return hit;
  const cover = Object.fromEntries(TOWER_KINDS.map((kind) => [kind, geo.pads.map((p) => {
    const r = TOWERS[kind].range, near = (q: { x: number; y: number }) => Math.hypot(q.x - p.x, q.y - p.y) <= r;
    let n = 0;
    for (const lane of geo.lanes) for (let d = 0; d < lane.length; d++) if (near(lane.at(d))) n += 1 / geo.lanes.length;
    if (TOWERS[kind].air) for (let route = 0; route < geo.routes; route++) for (let d = 0; d < geo.flightLength(route); d++) if (near(geo.flightAt(route, d))) n += 0.5;
    return n;
  })])) as Record<TowerKind, number[]>;
  coverCache.set(geo, cover);
  return cover;
}

export function suggestBuild(s: ConstructionState): BuildSuggestion | null {
  const geo = s.geo ?? levelGeometry(LEVEL_0), BASE_PAD = geo.basePad, PAD_COVER = padCover(geo);
  if (s.baseHp < s.baseMaxHp * 0.4 && s.scrap >= s.repairCost) return {
    wave: s.wave, kind: 'repair', pad: BASE_PAD, level: 0, targetLevel: 0, cost: s.repairCost, label: 'Repair base',
  };
  const candidates: Array<{ suggestion: BuildSuggestion; score: number }> = [];
  const c = s.counts;
  const off = ELEMENTS.filter(e => e !== s.brood);
  const severity = { blue: 1, red: 5, purple: 8 };
  // Use the same leak-danger weights for the resistance filter and the scores.
  // Raw swarm counts can otherwise exclude the ground-only Flamethrower before
  // the score sees a smaller but much more dangerous off-colour red push.
  const count = (e: Element) => c[e] * severity[e] + c.prism * 2 + c.gold * 10 + (e === 'blue' ? 3 : 0);
  const target = off.reduce((a, b) => count(b) > count(a) ? b : a);
  for (const p of geo.pads) {
    if (s.pad != null && p.id !== s.pad) continue;
    const existing = s.towers.find(t => t.pad === p.id);
    for (const kind of existing ? [existing.kind] : TOWER_KINDS) {
      if (existing && existing.level >= TOWER_MAX_LEVEL) continue;
      const el = TOWERS[kind].element;
      const matrix = s.matchup ?? MATCHUP, row = matrix[TOWER_WEAPON[kind]];
      if (row[target] < 1) continue;
      // The turret handles the brood; towers cover the other colours, including the blue stream and its Gliders.
      // Counts alone overvalue the swarm, so heavies are weighted by their base damage. Ground-only towers can't
      // answer the Gliders. Existing same-colour towers discount more of the same.
      const air = TOWERS[kind].air ? c.air * 0.5 : 0;
      const demand = (c[el] * severity[el] + c.prism * 2 + c.gold * 10 + (el === 'blue' ? 3 : 0) + air) * (el === s.brood ? 0.25 : 1) * row[target];
      const coverage = s.towers.filter(t => TOWERS[t.kind].element === el).reduce((n, t) => n + LEVEL_DMG[t.level - 1] * 0.6, 0);
      const best = Math.max(...PAD_COVER[kind]), placement = 0.4 + 0.6 * PAD_COVER[kind][p.id] / Math.max(1, best);
      let cost = existing ? 0 : towerBuildCost(kind, s.costMult), targetLevel = existing?.level ?? 1;
      // A work order may fund several upgrade levels. Its complete cost and final level are
      // shown before acceptance, keeping one press per lull comparable to the old crew economy.
      while (targetLevel < TOWER_MAX_LEVEL) {
        const next = towerUpgradeCost(kind, targetLevel, s.costMult);
        if (cost + next > s.scrap) break;
        cost += next; targetLevel++;
      }
      if (existing && targetLevel === existing.level) continue;
      if (cost > s.scrap) continue;
      // Rank a new pad's basic coverage independently of its funded levels. Otherwise
      // bundling can make an empty pad look less economical than an existing upgrade
      // and postpone filling the field. The accepted quote still pays every level.
      const gain = existing ? LEVEL_DMG[targetLevel - 1] - LEVEL_DMG[existing.level - 1] : 1;
      const rankedCost = existing ? cost : towerBuildCost(kind, s.costMult);
      const score = (demand + 0.15) / (1 + coverage) * gain / Math.max(1, rankedCost) * placement;
      candidates.push({ score, suggestion: {
        wave: s.wave, kind: existing ? 'upgrade' : 'build', pad: p.id, tower: kind,
        level: existing?.level ?? 0, targetLevel, cost,
        label: `${existing ? `Upgrade ${TOWERS[kind].name} to Lv ${targetLevel}` : `${TOWERS[kind].name}${targetLevel > 1 ? ` · Lv ${targetLevel}` : ''}`} · ${p.name}`,
      } });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.suggestion.pad - b.suggestion.pad);
  if (candidates.length) return candidates[0].suggestion;
  if (s.baseHp < s.baseMaxHp && s.scrap >= s.repairCost) return {
    wave: s.wave, kind: 'repair', pad: BASE_PAD, level: 0, targetLevel: 0, cost: s.repairCost, label: 'Repair base',
  };
  return null;
}
