// Shared, deterministic recommendation for the rider and Auto-crew.
import {
  BASE_PAD, ELEMENTS, MATCHUP, TOWER_WEAPON, LEVEL_DMG, PADS, ROAD_LENGTH, TOWERS, TOWER_KINDS, TOWER_MAX_LEVEL, flightAt, flightLength,
  roadAt, towerBuildCost, towerUpgradeCost, type Element, type Matchup, type TowerKind,
} from './defs';
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
}

/** Road (and, for anti-air towers, flight path) within a tower kind's level-1 range of each pad, in units. */
export const PAD_COVER: Record<TowerKind, number[]> = Object.fromEntries(TOWER_KINDS.map((kind) => [kind, PADS.map((p) => {
  const r = TOWERS[kind].range, near = (q: { x: number; y: number }) => Math.hypot(q.x - p.x, q.y - p.y) <= r;
  let cover = 0;
  for (let d = 0; d < ROAD_LENGTH; d++) if (near(roadAt(d))) cover++;
  if (TOWERS[kind].air) for (let route = 0; route < 3; route++) for (let d = 0; d < flightLength(route); d++) if (near(flightAt(route, d))) cover += 0.5;
  return cover;
})])) as Record<TowerKind, number[]>;

export function suggestBuild(s: ConstructionState): BuildSuggestion | null {
  if (s.baseHp < s.baseMaxHp * 0.4 && s.scrap >= s.repairCost) return {
    wave: s.wave, kind: 'repair', pad: BASE_PAD, level: 0, targetLevel: 0, cost: s.repairCost, label: 'Repair base',
  };
  const candidates: Array<{ suggestion: BuildSuggestion; score: number }> = [];
  const c = s.counts;
  const off = ELEMENTS.filter(e => e !== s.brood);
  const count = (e: Element) => c[e] + c.prism / 3 + c.gold + (e === 'blue' ? 3 : 0);
  const target = off.reduce((a, b) => count(b) > count(a) ? b : a);
  for (const p of PADS) {
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
      const severity = { blue: 1, red: 5, purple: 8 }[el];
      const air = TOWERS[kind].air ? c.air * 0.5 : 0;
      const demand = (c[el] * severity + c.prism * 2 + c.gold * 10 + (el === 'blue' ? 3 : 0) + air) * (el === s.brood ? 0.25 : 1) * row[target];
      const coverage = s.towers.filter(t => TOWERS[t.kind].element === el).reduce((n, t) => n + LEVEL_DMG[t.level - 1] * 0.6, 0);
      const best = Math.max(...PAD_COVER[kind]), placement = 0.4 + 0.6 * PAD_COVER[kind][p.id] / Math.max(1, best);
      let cost = existing ? 0 : towerBuildCost(kind, s.costMult), targetLevel = existing?.level ?? 1;
      // A work order may fund several upgrade levels. Its complete cost and final level are
      // shown before acceptance, keeping one press per lull comparable to the old crew economy.
      if (existing) while (targetLevel < TOWER_MAX_LEVEL) {
        const next = towerUpgradeCost(kind, targetLevel, s.costMult);
        if (cost + next > s.scrap) break;
        cost += next; targetLevel++;
      }
      if (existing && targetLevel === existing.level) continue;
      if (cost > s.scrap) continue;
      const gain = existing ? LEVEL_DMG[targetLevel - 1] - LEVEL_DMG[existing.level - 1] : 1;
      const score = (demand + 0.15) / (1 + coverage) * gain / Math.max(1, cost) * placement;
      candidates.push({ score, suggestion: {
        wave: s.wave, kind: existing ? 'upgrade' : 'build', pad: p.id, tower: kind,
        level: existing?.level ?? 0, targetLevel, cost,
        label: `${existing ? `Upgrade ${TOWERS[kind].name} to Lv ${targetLevel}` : TOWERS[kind].name} · ${p.name}`,
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
