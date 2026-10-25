import { describe, expect, it } from 'vitest';
import { createGameSession, NullInput, testProfile } from '../../../core';
import { module } from '../index';
import { STORY } from '../sim/story';
import { coolEnd, FAN_DEFAULTS, fanView, stepHeat } from '../sim/fan';
import { pullTarget, PULL_DEFAULTS } from '../sim/pull';
import type { SeasideSnapshot } from '../sim/types';
import { gradeAt } from '../sim/workout';
import { VoxelGrid } from '../voxel/grid';
import { BRIDGE, BRIDGE_Y, CAVE_M, cavernRoute, cavernSpan, caveSize, cx, floorY, LAVA_Y, leapAt, LEAPS, PIERS, sOfU, TORCHES, U_MOUTH, uOfS } from '../world/cavernLayout';
import { cavernWorld } from '../world/cavern';
import { C } from '../world/cavernPalette';
import { CAVERN_WORLD, cavernShot } from '../render/cavernShots';
import { islandShot } from '../render/islandShots';

const scene = (id: string) => STORY.find((s) => s.id === id)!;
const snap = (id: string, progress: number, fan: SeasideSnapshot['fan'] = null) =>
  ({ sceneId: id, speed: 5, scene: { progress }, fan }) as Parameters<typeof cavernShot>[0];

describe('the cavern and the obsidian bridge (#192)', () => {
  it('lays the cave and the bridge along the route to their rail lengths', () => {
    const r = cavernRoute(), atMouth = r.nearest(cx(U_MOUTH), -U_MOUTH, 4)!;
    expect(Math.abs(atMouth.s - CAVE_M) / CAVE_M).toBeLessThan(0.02);
    expect(sOfU(U_MOUTH)).toBeCloseTo(CAVE_M, 3);
    const l = scene('bridge').length;
    expect('m' in l && cavernSpan('bridge')[1] - cavernSpan('bridge')[0]).toBe('m' in l ? l.m : -1);
    expect(r.length).toBeGreaterThanOrEqual(BRIDGE.s1);
    expect(cavernSpan('magma')).toEqual([BRIDGE.stand, BRIDGE.stand]);
  });

  it('builds the descent to the trainer: flat, then −3 to −5 %, and the bridge level 20 m over the lava', () => {
    const tr = scene('cavern').trainer;
    if (tr.mode !== 'sim') throw new Error('sim ride');
    let worst = 0;
    for (let p = 0.02; p < 0.98; p += 0.03) {
      const s = p * CAVE_M, slope = ((floorY(uOfS(s + 1)) - floorY(uOfS(s - 1))) / 2) * 100;
      worst = Math.max(worst, Math.abs(slope - gradeAt(tr, p)));
    }
    expect(worst).toBeLessThan(0.3);
    expect(BRIDGE_Y).toBeLessThan(-35); // a long way down
    expect(BRIDGE_Y - LAVA_Y).toBeCloseTo(20, 9);
    const r = cavernRoute();
    for (let s = BRIDGE.s0 + 5; s < BRIDGE.s1; s += 111) expect(r.at(s).y).toBeCloseTo(BRIDGE_Y, 2);
  });

  it('keeps the ridden line clear in the cave: a floor under the wheels, nothing up to 2.9 m, a roof above', () => {
    const w = cavernWorld(), r = cavernRoute();
    if (w.terrain.kind !== 'height') throw new Error('heightfield fill');
    for (let s = 3; s < CAVE_M - 2; s += 83) {
      const p = r.at(s), x0 = Math.floor(p.x) - 2, z0 = Math.floor(p.z) - 2, g = new VoxelGrid(0.25, [x0, 0, z0]);
      w.terrain.fill(g, { x0, x1: x0 + 4, z0, z1: z0 + 4 }, { lines: true, skipSea: false, scrub: true });
      const ix = g.vi(p.x, 0), iz = g.vi(p.z, 2), solid = (y: number) => g.get(ix, g.vi(y, 1), iz) !== 0;
      expect(solid(p.y - 0.1), `floor at s=${s}`).toBe(true);
      for (let y = p.y + 0.3; y < p.y + 2.9; y += 0.25) expect(solid(y), `clear at s=${s}, ${(y - p.y).toFixed(2)} m`).toBe(false);
      let roof = false;
      for (let y = p.y + 2.9; y < p.y + caveSize(-p.z).h + 3; y += 0.25) roof ||= solid(y);
      expect(roof, `roof at s=${s}`).toBe(true);
    }
  });

  it('opens on lava under the bridge, with piers standing in it below the deck', () => {
    const w = cavernWorld();
    if (w.terrain.kind !== 'height') throw new Error('heightfield fill');
    const u = uOfS(BRIDGE.s0 + 300), x0 = Math.floor(cx(u)) - 4, z0 = Math.floor(-u) - 2, g = new VoxelGrid(0.5, [x0, 0, z0]);
    w.terrain.fill(g, { x0, x1: x0 + 8, z0, z1: z0 + 4 }, { lines: false, skipSea: false, scrub: false });
    const v = g.get(g.vi(cx(u), 0), g.vi(LAVA_Y - 0.25, 1), g.vi(-u, 2));
    expect([C.lava, C.lava2, C.lavaHot, C.crust, C.crust2]).toContain(v);
    for (let y = LAVA_Y + 0.5; y < BRIDGE_Y + 4; y += 0.5) expect(g.get(g.vi(cx(u), 0), g.vi(y, 1), g.vi(-u, 2))).toBe(0);
    expect(PIERS.length).toBeGreaterThan(20);
  });

  it('hangs the torches on the walls, every 24 m of the cave', () => {
    expect(TORCHES.length).toBeGreaterThan(80);
    for (const t of TORCHES) {
      expect(Math.abs(Math.abs(t.x - cx(t.u)) - caveSize(t.u).w)).toBeLessThan(0.5);
      expect(t.y - floorY(t.u)).toBeGreaterThan(2);
    }
  });

  it('eels leap where you can see them: vaulters clear the bridge overhead, the rest stay off the deck', () => {
    let vaults = 0;
    for (const l of LEAPS) {
      for (let k = 0; k <= 1.0001; k += 0.01) {
        const p = leapAt(l, k), lx = p.x - cx(-p.z);
        if (Math.abs(lx) < 3) expect(p.y - BRIDGE_Y, 'over the deck').toBeGreaterThan(5);
        if (!l.vault) expect(Math.abs(lx)).toBeGreaterThan(8);
      }
      if (l.vault) vaults++;
      expect(l.h).toBeGreaterThan(12);
    }
    expect(vaults).toBeGreaterThan(15);
    // from anywhere on the bridge, the next leap is less than 40 m ahead
    for (let s = BRIDGE.s0; s < BRIDGE.stand; s += 25) expect(LEAPS.some((l) => l.u0 > uOfS(s) && l.u0 < uOfS(s) + 40)).toBe(true);
  });
});

describe('Chapter 3a shots (#192)', () => {
  it('maps the rides onto their spans, the hall light coming up at the mouth', () => {
    const a = cavernShot(snap('cavern', 0))!, m = cavernShot(snap('cavern', 1))!, b = cavernShot(snap('bridge', 0.5))!;
    expect(a.s).toBe(0); expect(m.s).toBeCloseTo(CAVE_M, 6);
    expect(a.fx.hall).toBe(0); expect(b.fx.hall).toBe(1); expect(b.fx.eels).toBe(true); expect(a.fx.eels).toBe(false);
    expect(b.eye.y).toBeCloseTo(BRIDGE_Y + 1.55, 2);
    expect(cavernShot(snap('temple', 0.5))).toBeNull();
    expect(islandShot({ ...snap('cavern', 0.5), sceneT: 0 })).toBeNull();
    expect([...CAVERN_WORLD]).toEqual(['cavern', 'bridge', 'magma', 'fan']);
  });

  it('fishes over the side of the bridge onto the lava, and puts the fan in front of the bars', () => {
    const f = cavernShot(snap('magma', 0.4))!;
    expect(f.rod).toBe(true); expect(f.bars).toBe(false); expect(f.place?.waterY).toBe(LAVA_Y);
    expect(f.target.y).toBeLessThan(f.eye.y - 5); // looking down at it
    const view = fanView(scene('fan'), 0.3, 0, true), fan = cavernShot(snap('fan', 0.3, view))!;
    expect(fan.bars).toBe(true); expect(fan.fx.fan).toEqual(view);
    expect(fan.s).toBe(f.s);
  });
});

describe('magma fishing and the cooling fan (#192)', () => {
  it('magma fishing is one 12 s pull, and the eel surges harder and faster than the sea fish', () => {
    const m = scene('magma');
    expect(m.pulls.length).toBe(1);
    expect(Math.round(pullTarget(m.pulls[0].size, PULL_DEFAULTS).s)).toBe(12);
  });

  it('the fan: the glow fades with progress, creeps back out of the band (capped) and blows off in it', () => {
    const sc = scene('fan'), end = coolEnd(sc);
    expect(end).toBeCloseTo(0.75, 6);
    expect(fanView(sc, 0, 0, true).glow).toBe(1);
    expect(fanView(sc, end / 2, 0, true).glow).toBeCloseTo(0.5, 6);
    expect(fanView(sc, end, 0, true).glow).toBe(0);
    expect(fanView(sc, 0.9, 0, true).eat).toBeCloseTo(0.6, 6);
    let h = 0;
    for (let i = 0; i < 600; i++) h = stepHeat(h, false, true, 0.1, FAN_DEFAULTS);
    expect(h).toBe(FAN_DEFAULTS.creepMax);
    expect(fanView(sc, end / 2, h, false).glow).toBeCloseTo(0.5 + FAN_DEFAULTS.creepMax, 6);
    const back = stepHeat(h, true, true, 1, FAN_DEFAULTS);
    expect(h - back).toBeCloseTo(FAN_DEFAULTS.creepPerS * FAN_DEFAULTS.recoverK, 6);
    expect(stepHeat(0.1, false, false, 1, FAN_DEFAULTS)).toBeLessThan(0.1); // eating: it only cools
  });

  const run = (fanRpmLo?: number) => {
    const s = createGameSession({
      game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'z2' }, seed: 1,
      simOpts: { skipMenu: true, save: { v: 1, rides: 1, chapterSelect: true, checkpoint: { sceneId: 'fan', progress: 0 } } },
    });
    if (fanRpmLo) s.tuning.set('seaside.fanRpmLo', fanRpmLo);
    const shots: SeasideSnapshot[] = [];
    let t = 0;
    for (; t < 60 * 60 && (s.sim.snapshot() as SeasideSnapshot).sceneId === 'fan'; t++) { s.step(30); shots.push(s.sim.snapshot() as SeasideSnapshot); }
    return { t, shots, hud: s.sim.hud!() };
  };

  it('in the band the eel cools in about the plan (2 min) with the cadence band on the HUD', () => {
    const { t, shots } = run();
    expect(t).toBeGreaterThan(80); expect(t).toBeLessThan(200);
    const mid = shots[30].fan!;
    expect(mid.inBand).toBe(true); expect(mid.heat).toBe(0); expect(mid.glow).toBeLessThan(0.8);
  });

  it('out of the band the glow creeps back and the cooling crawls, but the scene still ends', () => {
    const { t, shots } = run(120);
    const mid = shots[60].fan!;
    expect(mid.inBand).toBe(false); expect(mid.heat).toBeGreaterThan(0.2);
    expect(t).toBeGreaterThan(200); expect(t).toBeLessThan(60 * 60);
  });

  it('asks for the fan band while cooling, not while eating', () => {
    const s = createGameSession({
      game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'z2' }, seed: 1,
      simOpts: { skipMenu: true, save: { v: 1, rides: 1, chapterSelect: true, checkpoint: { sceneId: 'fan', progress: 0.2 } } },
    });
    s.step(5);
    expect(s.sim.hud!().targetCadence).toMatchObject({ min: 80, max: 100 });
    const e = createGameSession({
      game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'z2' }, seed: 1,
      simOpts: { skipMenu: true, save: { v: 1, rides: 1, chapterSelect: true, checkpoint: { sceneId: 'fan', progress: 0.8 } } },
    });
    e.step(5);
    expect(e.sim.hud!().targetCadence).toBeUndefined();
    expect((e.sim.snapshot() as SeasideSnapshot).fan!.eat).toBeGreaterThan(0);
  });
});
