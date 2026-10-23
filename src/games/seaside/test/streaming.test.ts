import { describe, expect, it } from 'vitest';
import { TileStreamer } from '../world/streaming';
import { flatWorld } from './fixtures';

/** Ride the test world at `speed` with a pool finishing `perTick` jobs per tick; record when keys were asked for and shown. */
function ride(speed: number, seconds: number, perTick: number) {
  const w = flatWorld(), st = new TileStreamer<object>(w, { keepS: 4 });
  const requested = new Map<string, number>(), shown = new Map<string, number>();
  const dt = 0.1;
  let t = 0;
  for (; t <= seconds; t += dt) {
    const s = speed * t, p = w.route.at(s);
    st.update({ x: p.x, y: p.y + w.eye, z: p.z }, t, { routeS: s, speed });
    for (const k of st.tiles.keys()) if (!requested.has(k)) requested.set(k, t);
    for (let i = 0; i < perTick; i++) { const j = st.next(); if (!j) break; st.done(j.key, {}); }
    if (st.ready()) for (const l of st.wanted) if (!shown.has(l.key)) shown.set(l.key, t);
  }
  return { w, st, requested, shown, s: speed * t };
}

describe('route streaming', () => {
  it('requests tiles ahead of a moving camera before they are needed on screen', () => {
    const { requested, shown } = ride(10, 50, 24);
    const late: string[] = [];
    let fine = 0;
    for (const [k, ts] of shown) {
      const S = Number(k.split(',')[2]);
      if (ts < 3 || !(S <= 16)) continue; // after warm-up; fine terrain tiles near the rider
      fine++;
      if (requested.get(k)! > ts - 0.5) late.push(k);
    }
    expect(fine).toBeGreaterThan(100);
    expect(late.length / fine).toBeLessThan(0.05); // ≥ 95 % were prefetched at least half a second early
  });

  it('evicts tiles behind the camera once they fall out of range', () => {
    const { w, st, s } = ride(10, 50, 24);
    expect(st.stats.evicted).toBeGreaterThan(0);
    const cam = w.route.at(s);
    for (const [k, e] of st.tiles) {
      if (e.job.kind !== 'tile' || e.job.S > 16) continue;
      const cx = e.job.x0 + e.job.S / 2, cz = e.job.z0 + e.job.S / 2, n = w.route.nearest(cx, cz, 400);
      // fine tiles exist only within ~80 m of the camera (or a prefetch point ahead); a few seconds' grace, then gone
      if (n && n.s < s) expect(Math.hypot(cx - cam.x, cz - cam.z), `fine tile ${k} kept behind`).toBeLessThan(200);
    }
    expect(st.tiles.size).toBeLessThan(1000); // the cache stays bounded over a long ride
    for (const e of st.tiles.values()) if (e.job.kind === 'road') expect(e.job.s0 + e.job.len).toBeGreaterThan(s - 650);
  });

  it('keeps the road corridor fine near the camera and coarse beyond', () => {
    const w = flatWorld(), st = new TileStreamer<object>(w);
    const p = w.route.at(300);
    const road = st.select({ x: p.x, y: 1.5, z: p.z }, true).filter((l) => l.job.kind === 'road');
    for (const l of road) if (l.job.kind === 'road') expect(l.job.voxel).toBe(l.d < 100 ? 0.125 : 0.5);
    expect(road.some((l) => l.d === 0)).toBe(true);
  });

  it('anchors detail to the route: tiles beside the path keep their level as the rider passes', () => {
    const w = flatWorld(), st = new TileStreamer<object>(w);
    const side = w.route.offset(150, 9), keyAt = (s: number) => {
      const p = w.route.at(s);
      return st.select({ x: p.x, y: 1.5, z: p.z }, true).find((l) => l.job.kind === 'tile' && side.x >= l.job.x0 && side.x < l.job.x0 + l.job.S && side.z >= l.job.z0 && side.z < l.job.z0 + l.job.S)!.key;
    };
    const keys = new Set([120, 135, 150, 165, 180].map(keyAt));
    expect(keys.size).toBe(1);
  });
});
