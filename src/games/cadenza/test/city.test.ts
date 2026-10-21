import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { synthTimeline } from '../../../media/synth/queue';
import { buildTrack, extendTrack } from '../sim/track';
import { Path, newFrame } from '../render/path';
import { City } from '../render/city';
import { RoadClearance } from '../render/cityPlacement';

const timeline = synthTimeline({ style: 'edm', songs: 1, seed: 1 });
const options = { difficulty: 'pro', mode: 'mono', seed: 1 } as const;

describe('city road clearance', () => {
  it('keeps complete tower footprints away from every road pass after a streamed extension', () => {
    const initial = buildTrack({ ...timeline, durationS: 60, sections: timeline.sections.filter(s => s.t0 < 60).map(s => ({ ...s, t1: Math.min(60, s.t1) })) }, options);
    const path = new Path(extendTrack(initial, buildTrack(timeline, options), 50));
    const city = new City(path, 12), clearance = new RoadClearance(path);
    const towers = city.group.children[0] as THREE.InstancedMesh;
    expect(towers.count).toBeGreaterThan(20);
    const matrix = new THREE.Matrix4(), pos = new THREE.Vector3(), scale = new THREE.Vector3(), rot = new THREE.Quaternion();
    for (let i = 0; i < towers.count; i++) {
      towers.getMatrixAt(i, matrix); matrix.decompose(pos, rot, scale);
      expect(pos.y).toBeCloseTo(clearance.groundY, 3);
      // Independent corridor check, including the full rotated footprint.
      const radius = path.halfWidth + Math.hypot(scale.x, scale.z) / 2 + 11.9;
      const fr = newFrame(); let nearest = Infinity;
      for (let d = 0; d < path.length + 400; d += 8) {
        path.at(d, fr);
        nearest = Math.min(nearest, (pos.x - fr.p.x) ** 2 + (pos.z - fr.p.z) ** 2);
      }
      expect(nearest).toBeGreaterThan(radius ** 2);
    }
  });
  it('rejects road centres during a launch even when the rolled right vector is vertical', () => {
    const path = new Path(buildTrack(timeline, options)), corridor = new RoadClearance(path), fr = newFrame();
    const launch = path.track.stunts.find(s => s.kind === 'launch')!;
    path.at(path.distAt(launch.t0 + (launch.t1 - launch.t0) / 4), fr);
    expect(corridor.allows(fr.p.x, fr.p.z, 10, path.halfWidth)).toBe(false);
  });
});
