import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { estimatedAnalysis } from '../../../media/online/rolling';
import { buildTimeline } from '../../../media/mix/timeline';
import { planMix } from '../../../media/mix/plan';
import { buildTrack, extendTrack } from '../sim/track';
import { Path } from '../render/path';
import { buildTrackMeshes } from '../render/trackMesh';
import { City } from '../render/city';
import { Blocks } from '../render/blocks';
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
