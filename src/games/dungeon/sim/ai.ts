// Hero AI helpers (pure). The hero plays itself: it explores, fights, kites and dodges;
// the rider only triggers actions (Strike / Ward / Rally / Potion) and shifts gears.

/** Tile BFS from (sx,sy) to (tx,ty) over walkable tiles; returns waypoints (tile centres), excluding the start. */
export function findPath(w: number, h: number, solid: (x: number, y: number) => boolean, sx: number, sy: number, tx: number, ty: number): Array<{ x: number; y: number }> {
  const prev = new Int32Array(w * h).fill(-1);
  const start = sy * w + sx, goal = ty * w + tx;
  if (sx < 0 || sy < 0 || sx >= w || sy >= h || tx < 0 || ty < 0 || tx >= w || ty >= h) return [];
  prev[start] = start;
  const q = [start];
  for (let qi = 0; qi < q.length; qi++) {
    const c = q[qi];
    if (c === goal) break;
    const cx = c % w, cy = (c - cx) / w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy, ni = ny * w + nx;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || prev[ni] >= 0 || solid(nx, ny)) continue;
      prev[ni] = c; q.push(ni);
    }
  }
  if (prev[goal] < 0) return [];
  const out: Array<{ x: number; y: number }> = [];
  for (let c = goal; c !== start; c = prev[c]) out.push({ x: (c % w) + 0.5, y: Math.floor(c / w) + 0.5 });
  return out.reverse();
}

/** Preferred stand-off distance (tiles) from a target, by weapon range and enemy type. */
export function standoff(weaponRange: number, enemy: { kind: string; elite: string | null }): number {
  const reach = Math.min(5, Math.max(1.8, weaponRange * 0.6)); // flamers fight up close
  if (enemy.kind === 'bomber' || enemy.elite === 'volatile') return Math.max(reach, 3);
  if (enemy.kind === 'chaser' || enemy.kind === 'brute') return Math.min(reach, 3.5);
  return reach;
}

/** Safety-net potion: the AI drinks only when very low and the rider hasn't drunk recently, so the rider's Potion stays meaningful. */
export function shouldAutoPotion(hpFrac: number, potions: number, sinceLastPotionS: number, threshold: number, riderGraceS = 10): boolean {
  return potions > 0 && hpFrac < threshold && sinceLastPotionS >= riderGraceS;
}

export type ActionId = 'strike' | 'ward' | 'rally' | 'potion';
export { readyFrac, type Cooldown } from '../../../core/cooldown';
