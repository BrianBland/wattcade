import { describe, expect, it } from 'vitest';
import { createGameSession, NullInput, testProfile } from '../../../core';
import { module } from '../index';
import { BELLY_LAYERS, drillView, GATE_LAYERS } from '../sim/belly';
import { FALL, fallView, TILT_S } from '../sim/gate';
import { STORY } from '../sim/story';
import type { SeasideSnapshot } from '../sim/types';
import { VoxelGrid } from '../voxel/grid';
import { BIT_REACH } from '../render/bellyShots';
import { cavernShot } from '../render/cavernShots';
import { BRIDGE, BRIDGE_Y, cavernRoute, cavernSpan, cx, GATE, GATE_DEPTH, GATE_S, GATE_TUNNEL_R, GATE_U, gateAxis, glyphPanel, GLYPH_STONES, LAVA_Y, STOP_S, uOfS } from '../world/cavernLayout';
import { cavernWorld } from '../world/cavern';
import { C } from '../world/cavernPalette';
import { PIGMENTS, runeStrokes } from '../render/runes';
import { buildGateCracks, buildGateFace, buildGateTunnel, FLOOR_HOLE } from '../world/gateProps';

const scene = (id: string) => STORY.find((s) => s.id === id)!;
const shot = (id: string, progress: number, drill: SeasideSnapshot['drill'] = null) =>
  cavernShot({ sceneId: id, speed: 5, scene: { progress }, drill } as Parameters<typeof cavernShot>[0])!;

/** Fill a small box of the cavern world at voxel size s. */
function sample(x0: number, z0: number, w: number, d: number, s = 0.25) {
  const wd = cavernWorld();
  if (wd.terrain.kind !== 'height') throw new Error('heightfield fill');
  const g = new VoxelGrid(s, [Math.floor(x0), 0, Math.floor(z0)]);
  wd.terrain.fill(g, { x0: Math.floor(x0), x1: Math.floor(x0) + w, z0: Math.floor(z0), z1: Math.floor(z0) + d }, { lines: false, skipSea: false, scrub: false });
  return (x: number, y: number, z: number) => g.get(g.vi(x, 0), g.vi(y, 1), g.vi(z, 2));
}

describe('the causeway and the gate (#193)', () => {
  it('rides Toward the gate along the bridge to a stop in front of the wall', () => {
    const [a, b] = cavernSpan('toGate'), l = scene('toGate').length;
    expect(a).toBe(BRIDGE.stand);
    expect(Math.abs(b - a - ('m' in l ? l.m : 0))).toBeLessThan(30); // the rail, plus the last of the causeway
    expect(GATE_S - STOP_S).toBeGreaterThan(BIT_REACH);
    expect(cavernRoute().length).toBeGreaterThan(STOP_S);
    expect(cavernSpan('drill2')).toEqual([STOP_S, STOP_S]);
  });

  it('glyphs come first on loose rocks, then on columns lining the way, then on the gate', () => {
    const kinds = GLYPH_STONES.map((s) => s.kind);
    expect(kinds.lastIndexOf('rock')).toBeLessThan(kinds.indexOf('column'));
    expect(kinds.filter((k) => k === 'rock').length).toBeGreaterThan(8);
    expect(kinds.filter((k) => k === 'column').length).toBeGreaterThan(40);
    for (const s of GLYPH_STONES) {
      expect(s.s).toBeGreaterThan(BRIDGE.stand); expect(s.s).toBeLessThan(STOP_S - 20);
      expect(Math.abs(s.face - cx(s.u))).toBeGreaterThan(BRIDGE.half + 1); // never on the deck
    }
  });

  it('paints the glyphs on the stones: each panel lies on its stone’s path-side face', () => {
    for (const st of GLYPH_STONES.filter((_, i) => i % 9 === 0)) {
      const p = glyphPanel(st), at = sample(st.face - 3, st.z - 2, 6, 4, 0.25);
      expect(p.facing).toBe(-st.side);
      expect(Math.abs(p.x - st.face)).toBeLessThan(0.05);
      expect(p.y + p.h / 2).toBeLessThanOrEqual(st.top + 1e-6);
      expect(p.y - p.h / 2).toBeGreaterThan(LAVA_Y);
      for (const dz of [-0.3, 0, 0.3]) for (const dy of [-0.3, 0.3]) {
        const y = p.y + dy * p.h, z = st.z + dz * p.w;
        expect(at(st.face + st.side * 0.12, y, z), `${st.kind} at s=${st.s.toFixed(0)}: stone behind the paint`).not.toBe(0);
        expect(at(st.face - st.side * 0.12, y, z), `${st.kind} at s=${st.s.toFixed(0)}: air in front of it`).toBe(0);
      }
    }
  });

  it('runes are straight cuts on a stave, inside their cell, in varied pigments', () => {
    const shapes = new Set<string>();
    for (let k = 0; k < 200; k++) {
      const r = runeStrokes(k);
      expect(r.some(([a, b, c, d]) => a === c && b < 0.1 && d > 0.9)).toBe(true); // a full-height stave
      for (const sg of r) for (const v of sg) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
      shapes.add(JSON.stringify(r.map((sg) => sg.map((v) => v.toFixed(2)))));
    }
    expect(shapes.size).toBeGreaterThan(150);
    expect(new Set(PIGMENTS.flat()).size).toBeGreaterThanOrEqual(6);
  });

  it('the gate is a sheer panel between pilasters, no door; the bore is open behind it', () => {
    const x = cx(GATE_U), at = sample(x - 12, -GATE_U - 6, 24, 9, 0.25);
    expect(at(x + 3, BRIDGE_Y + 6, -GATE_U - 0.1)).toBe(C.obsidian); // the panel
    expect(at(x + GATE.half + 1, BRIDGE_Y + 6, -GATE_U + GATE.out - 0.2)).not.toBe(0); // a pilaster, proud of it
    expect(at(x + 3, BRIDGE_Y + 6, -GATE_U + 0.3)).toBe(0);
    const A = gateAxis();
    expect(A.y - GATE_TUNNEL_R).toBeCloseTo(BRIDGE_Y, 6); // the bore's floor is the deck
    for (let z = A.z + 0.2; z > A.z - GATE_DEPTH - 0.4; z -= 0.5) expect(at(A.x, A.y, z), `bore at ${(A.z - z).toFixed(1)} m`).toBe(0);
    expect(GATE_DEPTH).toBeCloseTo(GATE_LAYERS.reduce((a, l) => a + l.m, 0), 9);
  });

  it('the tunnel walls band the layers, the geode lined with crystals; faces cover the bore; cracks stay on the walls', () => {
    const w = buildGateTunnel('walls'), f = buildGateTunnel('floor');
    expect(w.lit.count()).toBeGreaterThan(1000); expect(w.glow.count()).toBeGreaterThan(50); expect(f.lit.count()).toBeGreaterThan(100);
    const R1 = GATE_TUNNEL_R + 0.45;
    GATE_LAYERS.forEach((_, i) => {
      const face = buildGateFace(i).lit;
      for (const [x, y] of [[0, 0], [R1 - 0.05, 0], [0, -R1 + 0.05], [-0.7, 0.7]]) {
        let hit = false;
        for (let z = 0.04; z > -0.5 && !hit; z -= 0.04) hit = face.get(face.vi(x, 0), face.vi(y, 1), face.vi(z, 2)) !== 0;
        expect(hit, `${GATE_LAYERS[i].id} face covers (${x}, ${y})`).toBe(true);
      }
    });
    expect(FLOOR_HOLE.z0).toBeCloseTo(-GATE_DEPTH, 9);
    for (let k = 0; k < 3; k++) expect(buildGateCracks(k).count()).toBeGreaterThan(buildGateCracks(Math.max(0, k - 1)).count() * (k ? 1.2 : 0.99));
  });
});

describe('Drill II and the fall (#193)', () => {
  const d = scene('drill2');

  it('reuses the #190 drill: basalt, obsidian, then the geode over its two Z3 bores, depth only growing', () => {
    const tags: string[] = [];
    let depth = 0;
    for (let t = 0; t <= d.planS; t += 1) {
      const v = drillView(d, t), tag = `${v.phase}:${GATE_LAYERS[v.layer].id}`;
      if (tags[tags.length - 1] !== tag) tags.push(tag);
      expect(v.depth).toBeGreaterThanOrEqual(depth - 1e-9); depth = v.depth;
    }
    expect(tags).toEqual(['start:basalt', 'bore:basalt', 'bore:obsidian', 'bore:geode']);
    expect(depth).toBeCloseTo(GATE_DEPTH, 6);
    expect(d.trainer.mode).toBe('erg');
    // the belly's drill is unchanged
    expect(drillView(scene('drill1'), scene('drill1').planS).depth).toBeCloseTo(BELLY_LAYERS.reduce((a, l) => a + l.m, 0), 6);
  });

  it('the bit works a bit’s length from the face; the last minute tilts forward, cracks, and the fall goes over the edge', () => {
    const v = drillView(d, d.planS * 0.5), s = shot('drill2', 0.5, v), A = gateAxis();
    expect(s.eye.z - (A.z - v.depth)).toBeCloseTo(BIT_REACH, 6);
    expect(s.fx.gate!.crack).toBe(0);
    const late = shot('drill2', 1 - 10 / d.planS, drillView(d, d.planS - 10));
    expect(late.fx.gate!.crack).toBeGreaterThan(0.8);
    expect(late.target.y).toBeLessThan(late.eye.y - 0.5); // tilting forward
    expect(shot('drill2', 1 - (TILT_S + 5) / d.planS, drillView(d, d.planS - TILT_S - 5)).fx.gate!.crack).toBe(0);
    const f0 = shot('fall', 0), f1 = shot('fall', 0.5);
    expect(Math.hypot(f0.eye.x - late.eye.x, f0.eye.z - late.eye.z)).toBeLessThan(0.5);
    expect(f1.eye.y).toBeLessThan(LAVA_Y - 50); // gone down through the floor
    expect(f1.target.y).toBeLessThan(f1.eye.y - 9); // looking straight down
  });

  it('the fall: tip, black, a white dot that grows into the Earth, the cue as it swells', () => {
    const P = scene('fall').planS, at = (t: number) => fallView(t, P);
    expect(P).toBe(180);
    expect(at(FALL.tipS).tip).toBe(1); expect(at(FALL.blackS).black).toBe(1);
    expect(at(FALL.dotS - 1).earth).toBe(0);
    expect(at(FALL.dotS + 1).white).toBeGreaterThan(0.95);
    let prev = 0;
    for (let t = FALL.dotS; t <= P; t += 5) { const e = at(t).earth; expect(e).toBeGreaterThanOrEqual(prev); prev = e; }
    expect(at(P).earth).toBeGreaterThan(0.25); expect(at(P).white).toBe(0);
    expect(at(FALL.cueS).white).toBeLessThan(0.9); // the cue as it's turning blue
  });

  it('runs Drill II on the ERG plan and the fall in about 3 min, with the one music cue', () => {
    const s = createGameSession({
      game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'z2' }, seed: 1,
      simOpts: { skipMenu: true, save: { v: 1, rides: 1, chapterSelect: true, checkpoint: { sceneId: 'drill2', progress: 0 } } },
    });
    const events: Array<{ type: string; data?: unknown }> = [];
    const at = s.ctx.emit; s.ctx.emit = (e) => { events.push(e as { type: string }); at.call(s.ctx, e); };
    const ids: string[] = [], layers = new Set<string>();
    let fallT = 0;
    for (let i = 0; i < 30 * 60 * 20; i++) {
      s.step(1);
      const sn = s.sim.snapshot() as SeasideSnapshot;
      if (ids[ids.length - 1] !== sn.sceneId) ids.push(sn.sceneId);
      if (sn.drill) layers.add(GATE_LAYERS[sn.drill.layer].id);
      if (sn.sceneId === 'fall') fallT += 1 / 30;
      if (sn.sceneId === 'reentry') break;
    }
    expect(ids).toEqual(['drill2', 'fall', 'reentry']);
    expect([...layers]).toEqual(['basalt', 'obsidian', 'geode']);
    expect(fallT).toBeGreaterThan(175); expect(fallT).toBeLessThan(185);
    expect(events.filter((e) => e.type === 'cue')).toEqual([{ type: 'cue', data: { id: 'earth', scene: 'fall' } }]);
  });

  it('starts the route-side props near the gate: the toGate shot looks at the wall and unfolds the drill', () => {
    const end = shot('toGate', 0.999), mid = shot('toGate', 0.5);
    expect(mid.fx.gate!.unfold).toBeNull(); expect(mid.bars).toBe(true);
    expect(end.fx.gate!.unfold).toBeGreaterThan(0.9);
    expect(-end.eye.z).toBeGreaterThan(GATE_U - 4); expect(-end.target.z).toBeGreaterThan(GATE_U - 1);
    expect(Math.abs(uOfS(STOP_S) - (GATE_U - 2.6))).toBeLessThan(0.1);
  });
});
