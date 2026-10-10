// Navigation graph for cops: nodes along the lines + around building corners, visibility edges, A*. Pure.
import { BUILDINGS, buildingAt, heightAt, HALF, LINES } from './world';

export interface NavNode { x: number; z: number }
/** Straight segment passable on the ground: no building, no water, no wall, inside the map. */
export function visible(ax: number, az: number, bx: number, bz: number, step = 2): boolean {
  const d = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(d / step));
  for (let i = 1; i < n; i++) {
    const x = ax + ((bx - ax) * i) / n, z = az + ((bz - az) * i) / n;
    if (Math.abs(x) > HALF - 1 || Math.abs(z) > HALF - 1 || buildingAt(x, z) || heightAt(x, z, 0) < -2) return false;
  }
  return true;
}

let NODES: NavNode[] | null = null, ADJ: number[][] | null = null;
export function navNodes(): NavNode[] {
  if (NODES) return NODES;
  const out: NavNode[] = [];
  for (const l of LINES) for (let i = 0; i < l.pts.length; i++) {
    const [x, z] = l.pts[i]; out.push({ x, z });
    if (i < l.pts.length - 1) {
      const [bx, bz] = l.pts[i + 1], d = Math.hypot(bx - x, bz - z), n = Math.floor(d / 20);
      for (let k = 1; k < n; k++) out.push({ x: x + ((bx - x) * k) / n, z: z + ((bz - z) * k) / n });
    }
  }
  for (const b of BUILDINGS) for (const [x, z] of [[b.x0 - 3, b.z0 - 3], [b.x1 + 3, b.z0 - 3], [b.x0 - 3, b.z1 + 3], [b.x1 + 3, b.z1 + 3]]) out.push({ x, z });
  NODES = out.filter((p) => Math.abs(p.x) < HALF - 2 && Math.abs(p.z) < HALF - 2 && !buildingAt(p.x, p.z) && heightAt(p.x, p.z, 0) > -2);
  return NODES;
}
function adj(): number[][] {
  if (ADJ) return ADJ;
  const N = navNodes();
  ADJ = N.map(() => []);
  for (let i = 0; i < N.length; i++) for (let j = i + 1; j < N.length; j++) {
    if (Math.hypot(N[i].x - N[j].x, N[i].z - N[j].z) > 60) continue;
    if (visible(N[i].x, N[i].z, N[j].x, N[j].z)) { ADJ[i].push(j); ADJ[j].push(i); }
  }
  return ADJ;
}

/** Waypoints from (fx,fz) to (tx,tz): direct if visible, else A* over the graph. Empty if unreachable. */
export function findPath(fx: number, fz: number, tx: number, tz: number): NavNode[] {
  if (visible(fx, fz, tx, tz)) return [{ x: tx, z: tz }];
  const N = navNodes(), A = adj();
  const starts = N.map((_, i) => i).filter((i) => Math.hypot(N[i].x - fx, N[i].z - fz) < 60 && visible(fx, fz, N[i].x, N[i].z));
  const goal = new Set(N.map((_, i) => i).filter((i) => Math.hypot(N[i].x - tx, N[i].z - tz) < 60 && visible(N[i].x, N[i].z, tx, tz)));
  if (!starts.length || !goal.size) return [];
  const g = new Map<number, number>(), from = new Map<number, number>(), open = new Set<number>();
  const h = (i: number) => Math.hypot(N[i].x - tx, N[i].z - tz);
  for (const s of starts) { g.set(s, Math.hypot(N[s].x - fx, N[s].z - fz)); open.add(s); }
  while (open.size) {
    let cur = -1, best = Infinity;
    for (const i of open) { const f = (g.get(i) ?? Infinity) + h(i); if (f < best) { best = f; cur = i; } }
    open.delete(cur);
    if (goal.has(cur)) {
      const path: NavNode[] = [{ x: tx, z: tz }];
      for (let c: number | undefined = cur; c !== undefined; c = from.get(c)) path.unshift(N[c]);
      return path;
    }
    for (const nb of A[cur]) {
      const ng = (g.get(cur) ?? 0) + Math.hypot(N[cur].x - N[nb].x, N[cur].z - N[nb].z);
      if (ng < (g.get(nb) ?? Infinity)) { g.set(nb, ng); from.set(nb, cur); open.add(nb); }
    }
  }
  return [];
}
