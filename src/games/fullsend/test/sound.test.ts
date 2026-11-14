import { describe, expect, it } from 'vitest';
import { createGameSession, testProfile, NullInput } from '../../../core';
import { module } from '../index';
import type { FullSendSnapshot } from '../sim/sim';
import { soundBeds, soundCues, type Cue } from '../render/soundCues';

describe('sound cues', () => {
  it('a ride fires countdown ticks, GO, landings and medals, and nothing on the first frame', () => {
    const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'hook-responsive' }, simOpts: { tour: 'quick', autolean: true }, seed: 3 });
    const snap = () => (s.sim as unknown as { snapshot(): FullSendSnapshot }).snapshot();
    let prev: FullSendSnapshot | null = null;
    const seen = new Map<Cue, number>();
    expect(soundCues(null, snap())).toEqual([]);
    for (let i = 0; i < 30 * 60 * 9; i++) {
      s.step(1);
      const cur = snap();
      for (const c of soundCues(prev, cur)) seen.set(c, (seen.get(c) ?? 0) + 1);
      prev = cur;
    }
    for (const c of ['tick', 'go', 'land', 'perfect', 'medal', 'launch', 'arrive', 'smash'] as Cue[]) expect(seen.get(c) ?? 0, c).toBeGreaterThan(0);
    expect(seen.get('tick')! % 3).toBe(0);
  });
  it('beds: the rocket follows power, the wind speed, and the music follows the layer', () => {
    const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'z2' }, simOpts: { tour: 'quick' }, seed: 3 });
    s.step(30 * 30);
    const b = soundBeds((s.sim as unknown as { snapshot(): FullSendSnapshot }).snapshot());
    expect(b.rocket).toBeGreaterThan(0.15);
    expect(b.wind).toBeGreaterThan(0);
    expect(b.music).toBe('ground');
  });
});
