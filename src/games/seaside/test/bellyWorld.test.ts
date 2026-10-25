import { describe, expect, it } from 'vitest';
import { STORY } from '../sim/story';
import { BELLY_LAYERS, drillView, PARTS } from '../sim/belly';
import { gradeAt } from '../sim/workout';
import type { SeasideSnapshot } from '../sim/types';
import { bellyShot, bellySpan, BELLY_WORLD, BIT_REACH, drillCam } from '../render/bellyShots';
import { morningShot } from '../render/morningShots';
import { BELLY_M, drillAxis, GUT, gutRoute, gutY, PART_SPOTS, PARTS_M, sOfU, TUNNEL_R, uOfS } from '../world/bellyLayout';
import { bellyVoxel, bellyWorld } from '../world/belly';
import { buildCracks, buildFace, buildPart, buildTunnel, layerAtDepth } from '../world/bellyProps';

const scene = (id: string) => STORY.find((s) => s.id === id)!;
type Snap = Parameters<typeof bellyShot>[0];
const snap = (id: string, progress: number, extra: Partial<SeasideSnapshot> = {}): Snap =>
  ({ sceneId: id, sceneT: 0, speed: 2.5, wake: null, parts: null, drill: null, scene: { progress }, ...extra }) as Snap;

describe('the gut (#190)', () => {
  it('lays the belly and spare-parts rides end to end along the route, within 2 % of their rail lengths', () => {
    for (const [id, m] of [['belly', BELLY_M], ['spareParts', PARTS_M]] as const) {
      const [a, b] = bellySpan(id)!, l = scene(id).length;
      expect('m' in l && l.m).toBe(m);
      expect(Math.abs(b - a - m) / m).toBeLessThan(0.02);
    }
    expect(bellySpan('belly')![1]).toBeCloseTo(bellySpan('spareParts')![0], 6);
    // the spline's arc length agrees with the layout's
    expect(Math.abs(gutRoute().length - sOfU(GUT.rideEnd + 2)) / gutRoute().length).toBeLessThan(0.01);
    expect(uOfS(sOfU(321))).toBeCloseTo(321, 3);
  });

  it('heaves the floor with the belly ride’s swells: the slope you see is the grade you feel', () => {
    const tr = scene('belly').trainer;
    if (tr.mode !== 'sim') throw new Error('belly should be a sim ride');
    let worst = 0, peak = 0;
    for (let p = 0.05; p < 0.95; p += 0.05) {
      const s = p * BELLY_M, u0 = uOfS(s - 2), u1 = uOfS(s + 2), slope = ((gutY(u1) - gutY(u0)) / 4) * 100;
      worst = Math.max(worst, Math.abs(slope - gradeAt(tr, p)));
      peak = Math.max(peak, Math.abs(slope));
    }
    expect(peak).toBeGreaterThan(2); // ±3 % swells
    expect(worst).toBeLessThan(0.3);
    expect(gutY(GUT.partsU + 20)).toBeCloseTo(gutY(GUT.wall), 6); // flat for the parts and the drill
  });

  it('puts each spare part beside the line where the sim says it is in reach', () => {
    for (const p of PARTS) {
      const q = PART_SPOTS[p.id], [a, b] = bellySpan('spareParts')!;
      expect((sOfU(q.u) - a) / (b - a)).toBeCloseTo(p.at, 2);
      expect(Math.abs(q.d)).toBeGreaterThan(0.8); // not under the wheel
      expect(Math.abs(q.d)).toBeLessThan(2.5); // close enough to grab
    }
  });

  it('closes the gut with a stomach wall, holed where the drill goes in', () => {
    const A = drillAxis(), inWall = -(GUT.wall + 0.6);
    expect(bellyVoxel(A.x, A.y, inWall)).toBe(0); // the hole
    expect(bellyVoxel(A.x + TUNNEL_R + 1.2, A.y, inWall)).not.toBe(0); // wall round it
    expect(bellyVoxel(A.x, A.y + 0.3, -(GUT.wall - 1))).toBe(0); // open gut in front of it
    expect(bellyVoxel(A.x, A.y, -(GUT.wall + 3))).toBe(0); // nothing behind
    const w = bellyWorld();
    expect(w.bounds.z0).toBeLessThan(-GUT.wall);
    expect(gutRoute().at(gutRoute().length).z).toBeGreaterThan(-GUT.wall); // the ride stops short of it
  });
});

describe('the belly director (#190)', () => {
  it('shoots only Chapter 2a’s scenes, and the Morning director leaves them alone', () => {
    for (const id of BELLY_WORLD) { expect(bellyShot(snap(id, 0.5))).not.toBeNull(); expect(morningShot({ ...snap(id, 0.5), pull: null } as never)).toBeNull(); }
    expect(bellyShot(snap('paddle', 0.5))).toBeNull();
  });

  it('opens the eyes with the wake level and settles from looking up to looking ahead', () => {
    const shut = bellyShot(snap('eyesOpen', 0.1, { wake: 0 }))!, open = bellyShot(snap('eyesOpen', 0.9, { wake: 1 }))!;
    expect(shut.fx.lids).toBe(0);
    expect(open.fx.lids).toBe(1);
    expect(shut.target.y - shut.eye.y).toBeGreaterThan(open.target.y - open.eye.y);
    expect(shut.fx.haze).toBeGreaterThan(0.9);
  });

  it('keeps the bit a bit’s length from the face as it bores in, and backs off to clear the chips', () => {
    const d = scene('drill1'), A = drillAxis();
    let last = Infinity;
    for (let p = 0; p <= 1; p += 0.02) {
      const v = drillView(d, p * d.planS), s = bellyShot(snap('drill1', p, { drill: v }))!;
      expect(s.eye.z).toBeLessThanOrEqual(last + 0.41);
      last = s.eye.z;
      const gap = s.eye.z - (A.z - v.depth);
      expect(gap).toBeGreaterThanOrEqual(BIT_REACH - 1e-6);
      expect(gap).toBeLessThanOrEqual(BIT_REACH + 0.41);
      if (v.phase === 'bore') expect(s.fx.drill!.back).toBe(0);
    }
    expect(drillCam(0, 0).eye.z).toBeGreaterThan(A.z); // starts in the gut, in front of the wall
  });

  it('breaks through: water in, out of the hole, up toward the light, white at the surface', () => {
    const b = scene('breakthrough'), at = (t: number) => bellyShot(snap('breakthrough', t / b.planS))!;
    expect(at(0.05).fx.burst).toBeLessThan(0.1);
    expect(at(3).fx.flood).toBe(1);
    expect(at(20).eye.z).toBeLessThan(drillAxis().z - 3.5); // out through the wall
    expect(at(50).eye.y).toBeGreaterThan(at(20).eye.y + 20);
    expect(at(30).target.y).toBeGreaterThan(at(30).eye.y + 5); // looking up
    expect(at(b.planS - 0.1).fx.white).toBeGreaterThan(0.9);
    expect(at(30).fx.white).toBe(0);
  });
});

describe('belly props (#190)', () => {
  it('builds every part, the tunnel, a face per layer and the cracks', () => {
    for (const p of PARTS) expect(buildPart(p.id).count()).toBeGreaterThan(50);
    expect(buildTunnel().count()).toBeGreaterThan(1000);
    BELLY_LAYERS.forEach((_, i) => expect(buildFace(i).count()).toBeGreaterThan(500));
    expect(buildCracks(2).count()).toBeGreaterThan(buildCracks(0).count());
    expect([0, 1.39, 1.41, 2.7, 99].map(layerAtDepth)).toEqual([0, 0, 1, 2, 2]);
  });
});
