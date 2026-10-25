import { describe, expect, it } from 'vitest';
import { STORY } from '../sim/story';
import { BIG_ONE, bigOneView, MORNING_WORLD, morningShot, rideSpan } from '../render/morningShots';
import { bridge, CH1, coastRoute, edgeD, pierGeom, PULLOUTS, roadY, ROLLERS_PROFILE, SEA_LEVEL, spanAt, TOWN_Y, zOfS } from '../world/coastLayout';
import { corridorCarve, fillCorridor } from '../world/corridor';
import { coastStructures, fillStructures, PIER_FISH_BACK, textAt, textWidth } from '../world/coastBuild';
import { coastWorld, groundAt } from '../world/coast';
import { VoxelGrid } from '../voxel/grid';
import { flatWorld } from './fixtures';
import { RouteSpline } from '../world/route';

const scene = (id: string) => STORY.find((s) => s.id === id)!;
const snap = (id: string, progress: number, extra: Record<string, unknown> = {}) =>
  ({ sceneId: id, sceneT: 0, speed: 8, pull: null, scene: { progress }, ...extra }) as Parameters<typeof morningShot>[0];
const finite = (v: { x: number; y: number; z: number }) => [v.x, v.y, v.z].every(Number.isFinite);

describe('Chapter 1 layout (#189)', () => {
  it('lays each ride scene on a stretch of coast within 2 % of its rail length', () => {
    for (const id of ['highway', 'rollers', 'toPier']) {
      const [a, b] = rideSpan(id)!, sc = scene(id);
      expect('m' in sc.length).toBe(true);
      const m = (sc.length as { m: number }).m;
      expect(Math.abs(b - a - m) / m).toBeLessThan(0.02);
    }
    // in order along one route that ends at the end of the pier
    expect(rideSpan('highway')![1]).toBeLessThan(rideSpan('rollers')![0]);
    expect(rideSpan('rollers')![1]).toBeLessThan(rideSpan('toPier')![0]);
    expect(rideSpan('toPier')![1]).toBeCloseTo(coastRoute().length - PIER_FISH_BACK, 3);
  });

  it('builds the rollers to the scene’s trainer profile', () => {
    const tr = scene('rollers').trainer;
    expect(tr.mode === 'sim' && tr.profile).toEqual(ROLLERS_PROFILE);
    // the crest of the profile is the high point of the road between Turnout 1 and the bridge
    const [a, b] = rideSpan('rollers')!, y = (s: number) => roadY(zOfS(s));
    const crest = a + 0.65 * (b - a);
    expect(y(crest)).toBeGreaterThan(y(a) + 30);
    expect(y(crest)).toBeGreaterThan(y(a + 0.9 * (b - a)));
  });

  it('pulls off at Turnout 1 and Lou’s lot on the sea side, flat and close to the edge', () => {
    for (const s of [CH1.turnout, CH1.shop]) {
      expect(PULLOUTS.some((p) => s > p.s0 && s < p.s1)).toBe(true);
      expect(edgeD(zOfS(s))).toBeLessThan(-14); // room to stand / park
      expect(edgeD(zOfS(s))).toBeGreaterThan(-40); // and the sea right there
    }
  });

  it('bridges the gorge: the deck spans a drop of tens of metres, the harbour and pier sit at town height', () => {
    const b = bridge(), r = coastRoute(), mid = r.at((b.s0 + b.s1) / 2);
    expect(b.s1 - b.s0).toBeGreaterThan(80);
    expect(spanAt((b.s0 + b.s1) / 2)).toBe(true);
    expect(mid.y - groundAt(mid.x, mid.z)).toBeGreaterThan(30);
    const P = pierGeom();
    expect(P.end - P.start).toBeCloseTo(CH1.pierLen, 0);
    expect(spanAt(P.start + 10)).toBe(true);
    expect(r.at(P.end).y).toBeCloseTo(TOWN_Y, 3);
    const end = r.at(P.end);
    expect(groundAt(end.x, end.z)).toBeLessThan(SEA_LEVEL - 10); // deep water off the end
  });
});

describe('corridor spans and structures', () => {
  it('keeps the terrain under a span (a bridge deck crosses a void instead of skipping the ground)', () => {
    const w = flatWorld(), c = { ...w.corridor!, span: (s: number) => s > 100 && s < 150 };
    const carve = corridorCarve(w.route, c)!, at = (s: number) => { const p = w.route.at(s); return carve.at(p.x, p.z, 0.125); };
    expect(at(50)).toBe('skip');
    expect(typeof at(120)).toBe('number');
  });

  it('never builds past the ends of a route', () => {
    const route = new RouteSpline([[0, 0, 0], [0, 0, -40]], 4), w = flatWorld({ route });
    const g = fillCorridor(route, w.corridor!, 0, route.length, 0.25);
    let minZ = Infinity, maxZ = -Infinity;
    for (const [k, ch] of g.chunks) {
      const [, , cz] = VoxelGrid.unkey(k);
      for (let i = 0; i < ch.length; i++) if (ch[i]) { const z = g.origin[2] + (cz * 32 + (i % 32) + 0.5) * g.size; minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    }
    expect(minZ).toBeGreaterThan(-41.5); // within a voxel or so of the ends, not the corridor's half-width beyond
    expect(maxZ).toBeLessThan(1.5);
  });

  it('puts the pier rails along the edges and nothing out over the water past its end', () => {
    coastWorld();
    const list = coastStructures(groundAt), r = coastRoute(), P = pierGeom(), t = r.tangent(P.end), e = r.at(P.end);
    const probe = (x: number, z: number, y: number) => { for (const st of list) { const c = st.column(x, z, 0.125); const v = c?.(y); if (v) return v; } return 0; };
    const side = r.offset(P.end - 30.06, 6.08);
    expect(probe(side.x, side.z, P.y + 1.04)).not.toBe(0); // top rail
    expect(probe(e.x + t.x * 3, e.z + t.z * 3, P.y + 1.04)).toBe(0);
    const g = new VoxelGrid(0.25, [Math.floor(e.x) - 8, 0, Math.floor(e.z) - 8]);
    fillStructures(g, { x0: g.origin[0], x1: g.origin[0] + 16, z0: g.origin[2], z1: g.origin[2] + 16 }, list);
    expect(g.count()).toBeGreaterThan(0);
  });

  it('spells signs in a 5×7 pixel font', () => {
    expect(textWidth('PIER', 0.1)).toBeCloseTo(2.3, 6);
    expect(textAt('I', 0.05, 0.65, 0.1)).toBe(true); // the I's top bar
    expect(textAt('I', 0.05, 0.35, 0.1)).toBe(false);
    expect(textAt('PIER', 0.55, 0.3, 0.1)).toBe(false); // the gap between letters
  });
});

describe('Morning shots', () => {
  it('shoots every Morning world scene from a finite pose, at any progress', () => {
    for (const id of MORNING_WORLD) for (const p of [0, 0.25, 0.5, 0.75, 1]) {
      const s = morningShot(snap(id, p))!;
      expect(s, id).not.toBeNull();
      expect(finite(s.eye) && finite(s.target), `${id} ${p}`).toBe(true);
      expect(Math.hypot(s.eye.x - s.target.x, s.eye.y - s.target.y, s.eye.z - s.target.z)).toBeGreaterThan(1);
    }
    expect(morningShot(snap('shop1', 0.5))).toBeNull();
    expect(morningShot(snap('belly', 0.5))).toBeNull();
  });

  it('rides along the road with the bars, and stands still with the rod at the stops', () => {
    const ride = morningShot(snap('highway', 0.5))!, stop = morningShot(snap('turnout1', 0.5))!;
    expect(ride.bars && ride.rod === null && ride.speed > 0).toBe(true);
    expect(!stop.bars && stop.rod === 'fish' && stop.speed === 0).toBe(true);
    const a = morningShot(snap('toPier', 0.2))!.s, b = morningShot(snap('toPier', 0.4))!.s;
    expect(b).toBeGreaterThan(a);
  });

  it('runs the Big One: fog-free glassy water, gulls leave, the shadow, the bite, the yank, then under water', () => {
    const plan = scene('bigOne').planS, at = (t: number) => morningShot(snap('bigOne', t / plan))!;
    expect(at(10).fx.calm).toBe(0);
    expect(at(BIG_ONE.calmAt + 15).fx.calm).toBe(1);
    expect(at(BIG_ONE.gullsAt - 1).fx.gulls).toBe(0);
    expect(at(BIG_ONE.gullsAt + 10).fx.gulls).toBe(1);
    expect(at(BIG_ONE.shadowAt - 1).fx.shadow).toBeNull();
    expect(at(BIG_ONE.biteAt).fx.shadow).toBe(1);
    expect(at(BIG_ONE.yankAt - 1).rod).toBe('bigOne');
    const before = at(BIG_ONE.yankAt - 1), after = at(BIG_ONE.yankAt + BIG_ONE.yankS + 5);
    expect(after.eye.y).toBeLessThan(SEA_LEVEL);
    expect(after.fx.under).toBe(1);
    expect(after.rod).toBeNull();
    expect(before.fx.under).toBe(0);
    // the rod: cast, wait, bite, then a pull it can't win
    expect(bigOneView(BIG_ONE.castAt + 1, null).phase).toBe('cast');
    expect(bigOneView(BIG_ONE.biteAt - 0.5, null).phase).toBe('bite');
    const pull = bigOneView(BIG_ONE.biteAt + 10, { size: 1, ftp: 1.5, durS: 25, t: 10, stamina: 1, setPiece: true });
    expect(pull.phase).toBe('pull');
    expect(pull.stamina).toBe(1);
  });

  it('goes down through the blue to black under the closing mouth', () => {
    const plan = scene('under').planS, at = (t: number) => morningShot(snap('under', t / plan))!;
    expect(at(5).fx.mouth).toBe(0);
    expect(at(60).fx.mouth).toBeGreaterThan(0.3);
    expect(at(plan).fx.black).toBe(1);
    expect(at(60).eye.y).toBeLessThan(at(5).eye.y - 20);
  });
});

it('uses the coast fishing shots during optional shop turnouts, leaving the counters alone', () => {
  for (const [shop, stop] of [['shop1', 'turnout1'], ['pierStand', 'pier']]) {
    const bonus = morningShot(snap(shop, 0.2, { fishing: { phase: 'wait' } }));
    expect(bonus).toEqual(morningShot(snap(stop, 0.2)));
    expect(bonus?.rod).toBe('fish');
    expect(morningShot(snap(shop, 0.2))).toBeNull();
  }
});
