// Mock-up toolkit: any road (waypoints), any road width, optional bridge crossings, and a pad search.
import { splineLine, distanceToRoad, PAD_R, TURRET_R, SPAWN_Y, FIELD_W, FIELD_H } from '../../src/games/towerdefense/sim/road';
export type P = { x: number; y: number };
export interface Design { name: string; wp: P[]; turret: P; tr?: number; hw: number; shoulder: number; bridges?: P[]; /** which pass rides the deck at each crossing */ over?: 'first' | 'last'; flyers: P[]; pads?: P[] }
export const minRoadFor = (d: Design) => d.hw + d.shoulder + PAD_R + 1;
export function makeRoad(d: Design) {
  const line = splineLine(d.wp);
  const road: Array<P & { s: number }> = []; let s = 0;
  for (let i = 1; i < line.length; i++) {
    const p = line[i]; if (p.y < SPAWN_Y) continue;
    if (Math.hypot(p.x - d.turret.x, p.y - d.turret.y) < (d.tr ?? TURRET_R)) break;
    s += Math.hypot(p.x - line[i - 1].x, p.y - line[i - 1].y); road.push({ ...p, s });
  }
  return { line, road, L: s };
}
/** Where the road crosses itself: road points far apart along it but almost on top of each other. */
export function crossings(road: Array<P & { s: number }>): P[] {
  const out: P[] = [];
  for (let i = 0; i < road.length; i++) for (let j = i + 1; j < road.length; j++)
    if (road[j].s - road[i].s > 30 && Math.hypot(road[i].x - road[j].x, road[i].y - road[j].y) < 1.2 && !out.some(o => Math.hypot(o.x - road[i].x, o.y - road[i].y) < 10)) out.push({ x: road[i].x, y: road[i].y });
  return out;
}
const nearBridge = (d: Design, p: P) => (d.bridges ?? []).some(b => Math.hypot(b.x - p.x, b.y - p.y) < 16);
/** Closest approach between two road stretches > 30 apart along it, ignoring the bridge crossings. */
export function selfClear(d: Design, road: Array<P & { s: number }>) {
  let best = Infinity;
  for (let i = 0; i < road.length; i += 2) for (let j = i + 2; j < road.length; j += 2)
    if (road[j].s - road[i].s > 30 && !(nearBridge(d, road[i]) && nearBridge(d, road[j]))) best = Math.min(best, Math.hypot(road[i].x - road[j].x, road[i].y - road[j].y));
  return best;
}
export function violation(d: Design, line: P[], pads: P[]) {
  let v = 0; const m = minRoadFor(d);
  pads.forEach((p, i) => {
    v += Math.max(0, m - distanceToRoad(p, line));
    v += Math.max(0, (d.tr ?? TURRET_R) + PAD_R + 2 - Math.hypot(p.x - d.turret.x, p.y - d.turret.y));
    v += Math.max(0, PAD_R - p.x) + Math.max(0, p.x - (FIELD_W - 9)) + Math.max(0, 14 - p.y) + Math.max(0, p.y - (FIELD_H - 15));
    for (let j = i + 1; j < pads.length; j++) v += Math.max(0, PAD_R * 2 + 4.01 - Math.hypot(p.x - pads[j].x, p.y - pads[j].y));
  });
  return v;
}
export function score(d: Design, R: ReturnType<typeof makeRoad>, pads: P[]) {
  const { road, L } = R;
  const within = (p: P, r: number) => pads.filter(q => Math.hypot(q.x - p.x, q.y - p.y) <= r).length;
  const flame = road.filter(p => within(p, 15) > 0).length / road.length;
  const tesla = road.reduce((n, p) => n + Math.min(3, within(p, 24)), 0) / road.length;
  let gap = 0, run = 0; for (const p of road) { run = within(p, 15) ? 0 : run + 1; gap = Math.max(gap, run); }
  const air = d.flyers.flatMap(a => Array.from({ length: 30 }, (_, i) => ({ x: a.x + (d.turret.x - a.x) * i / 29, y: a.y + (d.turret.y - a.y) * i / 29 })));
  const airCov = air.filter(p => within(p, 24) > 0).length / air.length;
  const twoPass = pads.filter(q => { const h = road.filter(p => Math.hypot(p.x - q.x, p.y - q.y) <= 15); return h.length && h.at(-1)!.s - h[0].s > 40; }).length;
  const near = road.filter(p => Math.hypot(p.x - d.turret.x, p.y - d.turret.y) <= 35);
  return { length: Math.round(L), flame: +flame.toFixed(3), tesla: +tesla.toFixed(2), gap: +(gap * L / road.length).toFixed(1), air: +airCov.toFixed(2), twoPass,
    closeAt: near.length ? +(near[0].s / L).toFixed(2) : 1, closeShare: +(near.length / road.length).toFixed(2), selfClear: +selfClear(d, road).toFixed(1) };
}
/** Anneals 12 pads on a fixed road (graded penalty so invalid starts can climb out). */
export function searchPads(d: Design, seed: number, start: P[], N = 50000) {
  const R = makeRoad(d);
  const obj = (pads: P[]) => { const bad = violation(d, R.line, pads); if (bad > 0) return -100 - bad;
    const s = score(d, R, pads); return s.flame * 3 + s.tesla * 0.4 + s.air * 0.5 - s.gap * 0.01 + s.twoPass * 0.03; };
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let pads = start.map(p => ({ ...p })), cv = obj(pads), best = { pads, v: cv };
  for (let it = 0; it < N; it++) {
    const T = 0.04 * (1 - it / N) + 0.001, np = pads.map(p => ({ ...p })), i = Math.floor(rnd() * np.length);
    np[i] = rnd() < 0.1 ? { x: 5 + rnd() * (FIELD_W - 14), y: 14 + rnd() * (FIELD_H - 29) } : { x: np[i].x + (rnd() - 0.5) * 5, y: np[i].y + (rnd() - 0.5) * 5 };
    const v = obj(np);
    if (v > cv || rnd() < Math.exp((v - cv) / T)) { pads = np; cv = v; if (v > best.v) best = { pads, v }; }
  }
  let out = best.pads.map(p => ({ x: Math.round(p.x * 2) / 2, y: Math.round(p.y * 2) / 2 }));
  if (obj(out) < -99) out = best.pads.map(p => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }));
  return { pads: out, v: +obj(out).toFixed(3), valid: violation(d, R.line, out) === 0, score: score(d, R, out) };
}
