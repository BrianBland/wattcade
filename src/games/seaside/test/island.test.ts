import { describe, expect, it } from 'vitest';
import { STORY } from '../sim/story';
import { gradeAt } from '../sim/workout';
import type { SeasideSnapshot } from '../sim/types';
import { VoxelGrid } from '../voxel/grid';
import { approachLane, HALL, HEAD, headWorld, islandRoute, islandSpan, PLATEAU_Y, radialH, RAILS, roadY, SEA_Y, SHORE_R } from '../world/islandLayout';
import { islandStructures, massifTop } from '../world/islandBuild';
import { islandGround, islandWorld } from '../world/island';
import { I } from '../world/islandPalette';
import { headPoint, ISLAND_WORLD, islandShot, statuePoint } from '../render/islandShots';
import { bellyShot } from '../render/bellyShots';

const scene = (id: string) => STORY.find((s) => s.id === id)!;
const snap = (id: string, progress: number) =>
  ({ sceneId: id, sceneT: 0, speed: 5, wake: null, parts: null, drill: null, pull: null, scene: { progress } }) as unknown as Parameters<typeof islandShot>[0];

describe('the island (#191)', () => {
  it('lays every ride scene along the route within 2 % of its rail length, the beach between paddle and boardwalk', () => {
    for (const id of ['paddle', 'boardwalk', 'cutStones', 'monkeyMouth', 'temple'] as const) {
      const [a, b] = islandSpan(id), l = scene(id).length;
      expect('m' in l && l.m).toBe(RAILS[id]);
      expect(Math.abs(b - a - RAILS[id]) / RAILS[id]).toBeLessThan(0.02);
    }
    expect(islandSpan('beach')[0]).toBeCloseTo(islandSpan('paddle')[1], 6);
    expect(islandSpan('boardwalk')[0]).toBeCloseTo(islandSpan('beach')[0], 6);
    expect(islandRoute().length).toBeGreaterThan(islandSpan('temple')[1]);
  });

  it('paddles in at sea level from far out, and is perfectly round (the ground depends on the radius alone)', () => {
    const r = islandRoute(), p0 = r.at(0);
    expect(Math.hypot(p0.x, p0.z)).toBeGreaterThan(SHORE_R + 600);
    expect(roadY(100)).toBe(SEA_Y);
    expect(radialH(SHORE_R + 50)).toBeLessThan(SEA_Y);
    expect(radialH(SHORE_R - 10)).toBeGreaterThan(SEA_Y);
    for (const a of [0, 1, 2, 3, 4, 5]) expect(islandGround(250 * Math.cos(a), 250 * Math.sin(a))).toBeCloseTo(islandGround(250, 0), 0);
  });

  it('builds the road to the trainer: boardwalk swells and the stone road’s climb, flat across the plateau', () => {
    for (const id of ['boardwalk', 'cutStones'] as const) {
      const [a, b] = islandSpan(id), tr = scene(id).trainer;
      if (tr.mode !== 'sim') throw new Error('sim ride');
      let worst = 0;
      for (let p = 0.03; p < 0.97; p += 0.04) {
        const s = a + p * (b - a), slope = ((roadY(s + 1) - roadY(s - 1)) / 2) * 100;
        worst = Math.max(worst, Math.abs(slope - gradeAt(tr, p)));
      }
      expect(worst).toBeLessThan(0.25);
    }
    const [m0] = islandSpan('monkeyMouth'), [, t1] = islandSpan('temple');
    expect(roadY(t1) - roadY(m0)).toBeCloseTo(0, 2);
    expect(PLATEAU_Y()).toBeGreaterThan(40); // a real climb
  });

  it('keeps the ground under the stone road at the road, and the boardwalk on stilts above it', () => {
    const r = islandRoute(), [b0, b1] = islandSpan('boardwalk'), [c0, c1] = islandSpan('cutStones');
    for (let s = b0 + 200; s < b1 - 20; s += 97) { const p = r.at(s); expect(p.y - radialH(Math.hypot(p.x, p.z))).toBeGreaterThan(0.4); }
    for (let s = c0 + 40; s < c1 - 80; s += 89) { const p = r.at(s); expect(Math.abs(p.y - radialH(Math.hypot(p.x, p.z)))).toBeLessThan(0.6); }
  });

  it('keeps the canopy off the path', () => {
    const w = islandWorld(), r = w.route;
    for (const s of [islandSpan('boardwalk')[0] + 1500, islandSpan('cutStones')[0] + 700]) {
      const p = r.at(s), S = 16, g = new VoxelGrid(0.5, [Math.floor(p.x / 16) * 16, 0, Math.floor(p.z / 16) * 16]);
      const reg = { x0: g.origin[0], x1: g.origin[0] + S, z0: g.origin[2], z1: g.origin[2] + S };
      if (w.terrain.kind !== 'height') throw new Error('heightfield');
      w.terrain.fill(g, reg, { lines: false, skipSea: false, scrub: true, corridor: null });
      const leaves = new Set([I.leafDark, I.leafMid, I.jungle2, I.leafLime, I.jungle3, I.bark]);
      for (const [k, ch] of g.chunks) {
        const [cx, cy, cz] = VoxelGrid.unkey(k);
        for (let i = 0; i < ch.length; i++) {
          if (!leaves.has(ch[i])) continue;
          const x = g.origin[0] + (cx * 32 + Math.floor(i / 1024) + 0.5) * 0.5, z = g.origin[2] + (cz * 32 + (i % 32) + 0.5) * 0.5, y = (cy * 32 + (Math.floor(i / 32) % 32) + 0.5) * 0.5;
          const n = r.nearest(x, z, 20);
          if (n && y > n.y + 0.5) expect(Math.abs(n.d)).toBeGreaterThan(7);
        }
      }
    }
  });

  it('keeps the approach clear: the line of sight to the head stays inside the tree-free lane', () => {
    const [m0] = islandSpan('monkeyMouth'), e = islandRoute().at(m0 + 5), face = headPoint(14);
    for (let k = 0.05; k < 0.95; k += 0.05) expect(approachLane(e.x + (face.x - e.x) * k, e.z + (face.z - e.z) * k)).toBeLessThan(20);
    // and the head faces the approach
    const to = [e.x - HEAD.at[0], e.z - HEAD.at[1]], d = Math.hypot(to[0], to[1]);
    expect((to[0] * -HEAD.fwd[0] + to[1] * -HEAD.fwd[1]) / d).toBeGreaterThan(0.95);
  });

  it('leaves the ridden line open through the mouth and down the hall, with the massif round it', () => {
    const [st] = islandStructures(), y0 = PLATEAU_Y();
    for (let w = -12; w < HALL.len - 16; w += 3) {
      const [x, z] = headWorld(0, w), col = st.column(x, z, 0.25);
      if (!col) continue;
      for (let y = 0.2; y < 3.5; y += 0.25) expect(col(y0 + y)).toBe(0);
    }
    const [x, z] = headWorld(HALL.half + 4, 60);
    expect(st.column(x, z, 0.25)!(y0 + 5)).not.toBe(0); // rock beside the hall
    expect(massifTop(0, 80)).toBeGreaterThan(HALL.h + 5);
    const [fx, fz] = headWorld(0, -3);
    let face = 0; const fc = st.column(fx, fz, 0.25)!;
    for (let y = 0; y < 40; y += 0.5) if (fc(y0 + y)) face++;
    expect(face).toBeGreaterThan(10); // the face is there above the mouth
  });
});

describe('the island director (#191)', () => {
  it('shoots only the island scenes, and the belly director leaves them alone', () => {
    for (const id of ISLAND_WORLD) { expect(islandShot(snap(id, 0.5))).not.toBeNull(); expect(bellyShot(snap(id, 0.5) as never)).toBeNull(); }
    expect(islandShot(snap('cavern', 0.5))).toBeNull();
  });

  it('fades in from white, fishes from the waterline, looks up at the head and ends on the statue', () => {
    expect(islandShot(snap('paddle', 0))!.fx.white).toBe(1);
    expect(islandShot(snap('paddle', 0.5))!.fx.white).toBe(0);
    const beach = islandShot(snap('beach', 0.4))!;
    expect(beach.rod).toBe(true);
    expect(beach.target.y).toBeLessThan(beach.eye.y);
    const mid = islandShot(snap('monkeyMouth', 0.4))!;
    expect(mid.target.y - mid.eye.y).toBeGreaterThan(3); // looking up at the face
    const end = islandShot(snap('temple', 0.99))!, sp = statuePoint();
    const dir = [end.target.x - end.eye.x, end.target.z - end.eye.z], to = [sp.x - end.eye.x, sp.z - end.eye.z];
    expect((dir[0] * to[0] + dir[1] * to[1]) / Math.hypot(...dir) / Math.hypot(...to)).toBeGreaterThan(0.95);
    expect(end.fx.inside).toBe(1);
  });
});
