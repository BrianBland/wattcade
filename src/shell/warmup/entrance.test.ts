import { describe, expect, it } from 'vitest';
import type { GameModule } from '../../contracts';
import { approachS, spawnNow, entranceFor, MAX_APPROACH_S, OFFSCREEN_M, spawnAheadM } from './entrance';

describe('spawnAheadM', () => {
  const ahead = 25;
  it('spawns just off screen when that is a few seconds of riding', () => {
    expect(spawnAheadM(9, ahead)).toBe(ahead + OFFSCREEN_M);
  });
  it('spawns nearer, inside the view, for slow riders', () => {
    expect(spawnAheadM(5, ahead)).toBeCloseTo(5 * MAX_APPROACH_S);
    expect(spawnAheadM(5, ahead)).toBeLessThan(ahead);
  });
  it('never spawns on top of a stopped rider', () => {
    expect(spawnAheadM(0, ahead)).toBe(ahead * 0.6);
    expect(spawnAheadM(-1, ahead)).toBe(ahead * 0.6);
  });
});

describe('entranceFor', () => {
  const game = { id: 'x', title: 'Full Send', accent: '#ff7a45', entry: 'gate' } as GameModule;
  it("uses the game's accent and entry style, defaulting to a white portal", () => {
    expect(entranceFor(game, 'enter', 1)).toMatchObject({ key: 1, kind: 'enter', style: 'gate', color: '#ff7a45', label: 'Full Send' });
    expect(entranceFor({ id: 'y', title: 'Y' } as GameModule, 'exit', 2)).toMatchObject({ style: 'portal', color: '#ffffff' });
  });
  it('never uses drawCard art: no clip (node, or none recorded) leaves the accent swirl', () => {
    const e = entranceFor({ ...game, entry: 'portal', drawCard: () => { throw new Error('drawn'); } } as GameModule, 'enter', 3, { mp4: 'a.mp4', poster: 'a.webp' });
    expect(e.art).toBeUndefined();
    expect(e.dispose).toBeUndefined();
  });
});

describe('spawning ahead of the load', () => {
  it('takes the ride time to the spawn point', () => {
    expect(approachS(10, 25)).toBeCloseTo(spawnAheadM(10, 25) / 10);
    expect(approachS(0, 25)).toBeCloseTo(spawnAheadM(0, 25) / 0.5); // stopped: as good as never
  });
  it('spawns once the rider would arrive after the padded estimate', () => {
    expect(spawnNow(0, 2, 3)).toBe(true); // 3 s ride > 2.5 s padded load: at once
    expect(spawnNow(0, 6, 3)).toBe(false);
    expect(spawnNow(4.5, 6, 3)).toBe(true);
  });
});
