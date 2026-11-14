import { describe, expect, it } from 'vitest';
import type { GameModule } from '../../contracts';
import { entranceFor, MAX_APPROACH_S, OFFSCREEN_M, spawnAheadM } from './entrance';

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
    expect(entranceFor(game, 'enter', null, 1)).toMatchObject({ key: 1, kind: 'enter', style: 'gate', color: '#ff7a45', label: 'Full Send' });
    expect(entranceFor({ id: 'y', title: 'Y' } as GameModule, 'exit', null, 2)).toMatchObject({ style: 'portal', color: '#ffffff' });
  });
  it("paints the game's card art with the rider's colour", () => {
    const calls: string[] = [];
    const e = entranceFor({ ...game, drawCard: (_g, _w, _h, _t, c) => { calls.push(c); } } as GameModule, 'enter', { color: '#123456' }, 3);
    e.art!({} as CanvasRenderingContext2D, 10, 10, 0);
    expect(calls).toEqual(['#123456']);
  });
});
