// Shared, deterministic recommendation for the rider and Auto-crew.
import { ELEMENTS, MATCHUP, TOWER_WEAPON, LANE_NAMES, LEVEL_DMG, PADS, TOWERS, TOWER_KINDS, TOWER_MAX_LEVEL, towerBuildCost, towerUpgradeCost, type Element, type Matchup, type TowerKind } from './defs';
import type { LaneForecast } from './types';

export interface CrewTower { pad: number; kind: TowerKind; level: number }
export interface BuildSuggestion {
  wave: number; kind: 'build' | 'upgrade' | 'repair'; pad: number; tower?: TowerKind;
  /** Expected current level; prevents replaying an upgrade against a changed tower. */
  level: number; targetLevel: number; cost: number; label: string;
}
export interface ConstructionState {
  wave: number; brood: Element; lanes: readonly LaneForecast[]; towers: readonly CrewTower[];
  scrap: number; costMult: number; baseHp: number; baseMaxHp: number; repairCost: number;
  matchup?: Matchup;
}

export function suggestBuild(s: ConstructionState): BuildSuggestion | null {
  if (s.baseHp < s.baseMaxHp * 0.4 && s.scrap >= s.repairCost) return {
    wave: s.wave, kind: 'repair', pad: 6, level: 0, targetLevel: 0, cost: s.repairCost, label: 'Repair base',
  };
  const candidates: Array<{ suggestion: BuildSuggestion; score: number }> = [];
  for (const p of PADS) {
    const existing = s.towers.find(t => t.pad === p.id);
    for (const kind of existing ? [existing.kind] : TOWER_KINDS) {
      if (existing && existing.level >= TOWER_MAX_LEVEL) continue;
      const el = TOWERS[kind].element, lane = s.lanes[p.lane];
      if (!lane) continue;
      const matrix = s.matchup ?? MATCHUP, row = matrix[TOWER_WEAPON[kind]];
      const off = ELEMENTS.filter(e => e !== s.brood);
      const count = (e: Element) => lane[e] + lane.prism / 3 + lane.gold + (e === 'blue' ? 3 : 0);
      const target = off.reduce((a, b) => count(b) > count(a) ? b : a);
      if (row[target] < 1) continue;
      // The turret handles the brood; towers cover the other colours, including the blue stream.
      // Counts alone overvalue the swarm. Weight heavies by their base damage, and account
      // for long-range towers already covering adjacent lanes so all six pads don't become Teslas.
      const severity = { blue: 1, red: 5, purple: 8 }[el];
      const demand = (lane[el] * severity + lane.prism * 2 + lane.gold * 10 + (el === 'blue' ? 3 : 0)) * (el === s.brood ? 0.25 : 1) * row[target];
      const coverage = s.towers.filter(t => TOWERS[t.kind].element === el)
        .reduce((n, t) => n + LEVEL_DMG[t.level - 1] * (PADS[t.pad].lane === p.lane ? 1 : 0.5), 0);
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
      const score = (demand + 0.15) / (1 + coverage) * gain / Math.max(1, cost) * (p.near ? 1.15 : 1);
      candidates.push({ score, suggestion: {
        wave: s.wave, kind: existing ? 'upgrade' : 'build', pad: p.id, tower: kind,
        level: existing?.level ?? 0, targetLevel, cost,
        label: `${existing ? `Upgrade ${TOWERS[kind].name} to Lv ${targetLevel}` : TOWERS[kind].name} · ${LANE_NAMES[p.lane]} ${p.near ? 'Near' : 'Far'}`,
      } });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.suggestion.pad - b.suggestion.pad);
  if (candidates.length) return candidates[0].suggestion;
  if (s.baseHp < s.baseMaxHp && s.scrap >= s.repairCost) return {
    wave: s.wave, kind: 'repair', pad: 6, level: 0, targetLevel: 0, cost: s.repairCost, label: 'Repair base',
  };
  return null;
}
