// Pure, deterministic elemental combat proc helpers for Purgatour.
// Turns weapon elements (storm, frost, fire, venom, arcane) into visible, build-defining combat payoffs
// on crits, Strikes, and status-primed kills, with strict recursion/cap guards so balance stays tight.
import type { Element } from './loot';
import type { ArchetypeId } from './archetypes';

export interface ProcTarget {
  id: number;
  x: number;
  y: number;
  r: number;
  alive: boolean;
  kind: string;
  slowT: number;
  dotT: number;
  dotDps: number;
}

export interface ChainResult {
  targets: ProcTarget[];
  pts: Array<{ x: number; y: number }>;
  dmgMult: number;
}

export interface AreaProcResult {
  kind: 'frost' | 'fire' | 'venom' | 'arcane';
  color: string;
  radius: number;
  dmgMult: number;
  targets: ProcTarget[];
  pullTiles: number;
  applySlowS: number;
  applyDotS: number;
}

/**
 * Storm chain-lightning proc on crits or Strikes: finds up to `maxJumps` nearby enemies
 * within `jumpRange` tiles starting from `origin` (excluding `origin.id`). Pure.
 */
export function stormChainTargets(
  origin: ProcTarget,
  pool: readonly ProcTarget[],
  maxJumps = 2,
  jumpRange = 4.2,
): ChainResult {
  const visited = new Set<number>([origin.id]);
  const targets: ProcTarget[] = [];
  const pts: Array<{ x: number; y: number }> = [{ x: origin.x, y: origin.y }];
  let cx = origin.x, cy = origin.y;

  for (let jump = 0; jump < maxJumps; jump++) {
    let best: ProcTarget | null = null, bestD = jumpRange;
    for (const e of pool) {
      if (!e.alive || visited.has(e.id)) continue;
      const d = Math.hypot(e.x - cx, e.y - cy);
      if (d < bestD) { bestD = d; best = e; }
    }
    if (!best) break;
    visited.add(best.id);
    targets.push(best);
    pts.push({ x: best.x, y: best.y });
    cx = best.x; cy = best.y;
  }
  return { targets, pts, dmgMult: 0.45 };
}

/**
 * Status-primed kill burst (Frost shatter / Fire death ignition / Venom spore cloud).
 * Returns null if the slain enemy wasn't primed or element has no on-kill detonation. Pure.
 */
export function onKillElementProc(
  slain: ProcTarget,
  element: Element,
  pool: readonly ProcTarget[],
): AreaProcResult | null {
  if (element === 'frost' && slain.slowT > 0) {
    const r = 2.4;
    return {
      kind: 'frost',
      color: '#7ef2ff',
      radius: r,
      dmgMult: 0.38,
      targets: pool.filter((e) => e.alive && e.id !== slain.id && Math.hypot(e.x - slain.x, e.y - slain.y) <= r + e.r),
      pullTiles: 0,
      applySlowS: 1.4,
      applyDotS: 0,
    };
  }
  if (element === 'fire' && slain.dotT > 0) {
    const r = 2.1;
    return {
      kind: 'fire',
      color: '#ff7a2a',
      radius: r,
      dmgMult: 0.4,
      targets: pool.filter((e) => e.alive && e.id !== slain.id && Math.hypot(e.x - slain.x, e.y - slain.y) <= r + e.r),
      pullTiles: 0,
      applySlowS: 0,
      applyDotS: 2.0,
    };
  }
  if (element === 'venom' && slain.dotT > 0) {
    const r = 2.5;
    return {
      kind: 'venom',
      color: '#6dff6d',
      radius: r,
      dmgMult: 0.22,
      targets: pool.filter((e) => e.alive && e.id !== slain.id && Math.hypot(e.x - slain.x, e.y - slain.y) <= r + e.r),
      pullTiles: 0,
      applySlowS: 0,
      applyDotS: 3.0,
    };
  }
  return null;
}

/**
 * Arcane gravity pulse on crits or Strikes: gently tugs nearby non-boss foes inward and deals splash damage. Pure.
 */
export function arcanePulseProc(
  originX: number,
  originY: number,
  excludeId: number,
  pool: readonly ProcTarget[],
  radius = 2.8,
): AreaProcResult {
  return {
    kind: 'arcane',
    color: '#c77dff',
    radius,
    dmgMult: 0.3,
    targets: pool.filter((e) => e.alive && e.id !== excludeId && Math.hypot(e.x - originX, e.y - originY) <= radius + e.r),
    pullTiles: 0.45,
    applySlowS: 0,
    applyDotS: 0,
  };
}

export interface ArchetypeStrikeStyle {
  color: string;
  accent: string;
  tag: string;
  knockbackMult: number;
  shardCount: number;
}

/** Distinct visual & tactical flavor for Rider Action A (Strike) per Hero Archetype. Pure. */
export const ARCHETYPE_STRIKE: Record<ArchetypeId, ArchetypeStrikeStyle> = {
  rouleur:  { color: '#66d9ff', accent: '#c9f3ff', tag: 'AEGIS SLAM',  knockbackMult: 1.45, shardCount: 0 },
  puncheur: { color: '#ffe45e', accent: '#ffffff', tag: 'VOLT VOLLEY', knockbackMult: 1.0,  shardCount: 5 },
  grimpeur: { color: '#ff7a2a', accent: '#ffd84a', tag: 'COL CRUSHER', knockbackMult: 1.25, shardCount: 0 },
};
