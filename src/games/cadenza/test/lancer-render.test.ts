// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createGameSession, NullInput, testProfile } from '../../../core';
import { synthTimeline } from '../../../media/synth/queue';
import { module } from '../index';
import { Blocks } from '../render/blocks';
import { Hud, bandBarView } from '../render/hud';
import { layout } from '../render/layout';
import { Path } from '../render/path';
import type { CadenzaSnapshot } from '../sim/sim';
import { buildTrack } from '../sim/track';

const meshes = (b: Blocks) => b.group.children.filter((c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh);
const material = (m: THREE.InstancedMesh) => m.material as THREE.ShaderMaterial;

describe('Lancer render', () => {
  const track = buildTrack(synthTimeline({ style: 'rock', songs: 1, seed: 2, short: true }), { difficulty: 'pro', mode: 'mono', seed: 2, perBandGap: true });
  const path = new Path(track), from = 0, to = track.durationS;

  it('standard ships keep one cube mesh with band effects off', () => {
    const [cubes, mines, shards] = meshes(new Blocks(path, from, to));
    expect(meshes(new Blocks(path, from, to))).toHaveLength(3);
    expect(material(cubes).uniforms.uBand.value).toBe(-1);
    expect(cubes.count).toBe(track.blocks.filter((b) => b.color >= 0).length);
    expect(mines.count).toBe(Math.max(1, track.blocks.filter((b) => b.color < 0).length));
    expect(shards.count).toBe(900);
  });

  it('the Lancer gets one mesh per band shape: flat bar, diamond, tetrahedron', () => {
    const all = meshes(new Blocks(path, from, to, { bands: true }));
    expect(all).toHaveLength(5);
    const [low, mid, high] = all;
    for (const [j, m] of [low, mid, high].entries()) {
      expect(material(m).uniforms.uBand.value).toBe(j);
      expect(m.count).toBe(Math.max(1, track.blocks.filter((b) => b.color >= 0 && b.band === j).length));
    }
    expect(low.geometry).toBeInstanceOf(THREE.BoxGeometry);
    const box = new THREE.Box3().setFromBufferAttribute(low.geometry.getAttribute('position') as THREE.BufferAttribute).getSize(new THREE.Vector3());
    expect(box.x).toBeGreaterThan(box.y * 3); // a flat bar
    expect(material(mid).defines.BARY).toBe(1); expect(material(high).defines.BARY).toBe(1);
    expect(mid.geometry.getAttribute('position').count).toBe(24); // octahedron, non-indexed
    expect(high.geometry.getAttribute('position').count).toBe(12); // tetrahedron
  });

  it('HUD band bars: hidden for other ships, three bars with target tick, low pulse (steady under reduced flashing) and flow', () => {
    const play = (ship: string) => {
      const timeline = synthTimeline({ style: 'edm', songs: 1, short: true, seed: 2 });
      const s = createGameSession({ game: module, profile: testProfile({ achievements: ['cz_sets'], gameData: { cadenza: { ship } } }), input: new NullInput(),
        media: { timeline }, fake: { script: 'target-follow' }, simOpts: { autopilot: true, difficulty: 'pro' } });
      s.step(30 * 20); return s.sim.snapshot() as CadenzaSnapshot;
    };
    const hud = new Hud(document.body), el = () => document.querySelector<HTMLElement>('.ws-bands')!;
    hud.place(layout(1180, 820, 150));
    hud.update(play('triad'), '#00f0ff', 1);
    expect(el().style.display).toBe('none');
    const snap = play('lancer');
    snap.bands = { ...snap.bands!, level: [0.2, 0.9, 0.5], rate: [2, 4, 8], low: [true, false, false], flowOn: false };
    hud.update(snap, '#00f0ff', 2);
    expect(el().style.display).toBe('');
    const bars = [...el().querySelectorAll<HTMLElement>('.ws-band')];
    expect(bars).toHaveLength(3);
    expect(bars.map((b) => b.classList.contains('low'))).toEqual([true, false, false]);
    expect(bars[0].querySelector<HTMLElement>('i')!.style.height).toBe('20%');
    expect(bars[1].querySelector<HTMLElement>('u')!.style.bottom).toBe('70%');
    expect(el().classList.contains('steady')).toBe(false);
    hud.update({ ...snap, reducedFlash: true, bands: { ...snap.bands!, flowOn: true } }, '#00f0ff', 3);
    expect(el().classList.contains('steady')).toBe(true); expect(el().classList.contains('flow')).toBe(true);
    expect(bandBarView(1.4, 8)).toEqual({ fill: 100, rate: 100 });
    hud.dispose();
  });
});
