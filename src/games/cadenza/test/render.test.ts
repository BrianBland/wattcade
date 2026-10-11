import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { estimatedAnalysis } from '../../../media/online/rolling';
import { buildTimeline } from '../../../media/mix/timeline';
import { planMix } from '../../../media/mix/plan';
import { buildTrack, extendTrack } from '../sim/track';
import { Path } from '../render/path';
import { buildTrackMeshes } from '../render/trackMesh';
import { City } from '../render/city';
import { Blocks, LIGHT_BAR } from '../render/blocks';
import { disposeObjects } from '../render/dispose';

function longTrack() {
  const items = [{ id: 'long', title: 'Mixtape', artist: 'Artist', analysis: estimatedAnalysis(14400) }];
  return buildTrack(buildTimeline(planMix(items, 'continuous'), items), { difficulty: 'pro', mode: 'mono', seed: 1 });
}
it('renders bounded, finite geometry near either end of a four-hour video', () => {
  const track = longTrack(), path = new Path(track);
  track.blocks = [{ t: 30, lane: 0, color: 0, zone: 0 }, { t: 14350, lane: 0, color: 0, zone: 0 }];
  for (const [from, to] of [[0, 120], [14300, 14400]]) {
    const world = buildTrackMeshes(path, from, to), city = new City(path, 1, from, to), blocks = new Blocks(path, from, to);
    expect((world.children[0] as THREE.Mesh).geometry.getAttribute('position').count).toBeLessThanOrEqual(2402);
    const towers = city.group.children[0] as THREE.InstancedMesh;
    expect(towers.count).toBeLessThan(1500);
    expect((blocks.group.children[0] as THREE.InstancedMesh).count).toBe(1);
    world.traverse((o) => { const a = (o as THREE.Mesh).geometry?.getAttribute('position'); if (a) expect(Array.from(a.array).every(Number.isFinite)).toBe(true); });
    const scene = new THREE.Scene(); city.addTo(scene); city.removeFrom(scene);
    expect(scene.children).toHaveLength(0);
    disposeObjects(world, blocks.group);
  }
});
it('preserves more than the JS argument limit of ridden samples when analyzing a late window', () => {
  const old = longTrack(), next = longTrack();
  old.intensity[130000] = 0.37; old.bands[2][130000] = 0.81;
  const extended = extendTrack(old, next, 14000);
  expect(extended.intensity[130000]).toBe(0.37);
  expect(extended.bands[2][130000]).toBe(0.81);
  expect(extended.dist[140001]).toBeGreaterThan(extended.dist[140000]);
});
it('releases shared geometry/materials once and instance buffers for every removed mesh', () => {
  const texture = new THREE.Texture(), g = new THREE.BoxGeometry(), m = new THREE.MeshBasicMaterial({ map: texture }), group = new THREE.Group();
  const a = new THREE.InstancedMesh(g, m, 1), b = new THREE.InstancedMesh(g, m, 1); group.add(a, b);
  const td = vi.spyOn(texture, 'dispose'), gd = vi.spyOn(g, 'dispose'), md = vi.spyOn(m, 'dispose'), ad = vi.spyOn(a, 'dispose'), bd = vi.spyOn(b, 'dispose');
  disposeObjects(group);
  expect(td).toHaveBeenCalledTimes(1); expect(gd).toHaveBeenCalledTimes(1); expect(md).toHaveBeenCalledTimes(1);
  expect(ad).toHaveBeenCalledTimes(1); expect(bd).toHaveBeenCalledTimes(1);
});

it('aligns light bars and their miss fragments with a banked road, then clears the fragments', () => {
  const track = longTrack();
  track.blocks = [{ t: 30, lane: 1, color: 0, zone: 0 }];
  track.roll.fill(0.7); track.curve.fill(0.4);
  const path = new Path(track), blocks = new Blocks(path, 0, 60);
  const [bars, , shards] = blocks.group.children as THREE.InstancedMesh[];
  const frame = path.at(path.distAt(30), { p: new THREE.Vector3(), r: new THREE.Vector3(), u: new THREE.Vector3(), f: new THREE.Vector3(), tunnel: 0, roll: 0 });
  const matrix = new THREE.Matrix4(); bars.getMatrixAt(0, matrix);
  expect(new THREE.Vector3().setFromMatrixColumn(matrix, 0).distanceTo(frame.r)).toBeLessThan(1e-6);
  expect(new THREE.Vector3().setFromMatrixColumn(matrix, 1).distanceTo(frame.u)).toBeLessThan(1e-6);
  expect((bars.geometry as THREE.BoxGeometry).parameters.width).toBeCloseTo(LIGHT_BAR.width);
  const state = new Uint8Array([0]), on = { absorb: vi.fn(), greyHit: vi.fn() };
  blocks.update(state, frame.p, path.distAt(30), frame.f, 30, 0, 0, on);
  state[0] = 2;
  blocks.update(state, frame.p, path.distAt(30), frame.f, 30, 0, 1, on);
  const active = () => {
    const live: THREE.Matrix4[] = [];
    for (let i = 0; i < shards.count; i++) { const m = new THREE.Matrix4(); shards.getMatrixAt(i, m); if (new THREE.Vector3().setFromMatrixScale(m).length() > 0) live.push(m); }
    return live;
  };
  expect(active()).toHaveLength(16);
  const fragment = active()[0];
  expect(new THREE.Vector3().setFromMatrixColumn(fragment, 1).normalize().distanceTo(frame.u)).toBeLessThan(1e-6);
  expect(new THREE.Vector3().setFromMatrixScale(fragment).y).toBeCloseTo(LIGHT_BAR.height);
  bars.getMatrixAt(0, matrix); expect(new THREE.Vector3().setFromMatrixScale(matrix).length()).toBe(0);
  blocks.update(state, frame.p, path.distAt(30), frame.f, 30, 1, 2, on);
  expect(active()).toHaveLength(0); expect(on.absorb).not.toHaveBeenCalled();
  disposeObjects(blocks.group);
});
it('pulses a collected bar and absorbs it once without replaying a previous miss', () => {
  const track = longTrack(); track.blocks = [{ t: 30, lane: 0, color: 0, zone: 0 }];
  const path = new Path(track), blocks = new Blocks(path, 0, 60), state = new Uint8Array([0]);
  const craft = new THREE.Vector3(), forward = new THREE.Vector3(0, 0, -1), on = { absorb: vi.fn(), greyHit: vi.fn() };
  const update = (now: number) => blocks.update(state, craft, path.distAt(30), forward, 30, 0.02, now, on);
  update(0); state[0] = 1; update(1);
  const bars = blocks.group.children[0] as THREE.InstancedMesh;
  expect(bars.geometry.getAttribute('aCollect').getX(0)).toBe(1);
  update(1.15); update(1.3);
  expect(on.absorb).toHaveBeenCalledTimes(1);
  expect(bars.geometry.getAttribute('aCollect').getX(0)).toBe(0);
  disposeObjects(blocks.group);
  const resumed = new Blocks(path, 0, 60); state[0] = 2;
  resumed.update(state, craft, path.distAt(30), forward, 30, 0.02, 2, on);
  const shards = resumed.group.children[2] as THREE.InstancedMesh, matrix = new THREE.Matrix4();
  for (let i = 0; i < shards.count; i++) { shards.getMatrixAt(i, matrix); expect(new THREE.Vector3().setFromMatrixScale(matrix).length()).toBe(0); }
  disposeObjects(resumed.group);
});
