import { describe, expect, it } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { GameModule } from '../contracts';
import { games } from '../games/registry';
import { carouselDims, carouselSlots, orderGames, ridesByGame, ridesLine } from './arcade';

const g = (id: string) => ({ id }) as GameModule;

describe('arcade picker', () => {
  it('lists games most polished first', () => {
    expect(games.map((x) => x.id)).toEqual(['cadenza', 'hamster', 'watershed', 'dungeon', 'lighthouse', 'towerdefense', 'starfighter']);
  });
  it('sorts by this rider\'s recent plays, then registry order', () => {
    const list = [g('a'), g('b'), g('c'), g('d')];
    expect(orderGames(list, { lastPlayed: {} }).map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(orderGames(list, { lastPlayed: { c: 100, d: 300, a: 200 } }).map((x) => x.id)).toEqual(['d', 'a', 'c', 'b']);
  });
  it('totals rides per game', () => {
    const r = ridesByGame([
      { gameId: 'a', durationS: 600, stats: { kj: 100 } as never },
      { gameId: 'a', durationS: 1800, stats: { kj: 300 } as never },
      { gameId: 'b', durationS: 60, stats: { kj: 5 } as never },
    ]);
    expect(r.a).toEqual({ rides: 2, seconds: 2400, kj: 400 });
    expect(ridesLine(r.a)).toBe('⏱ 40 min · 400 kJ');
    expect(ridesLine({ rides: 1, seconds: 4800, kj: 1234.4 })).toBe('⏱ 1 h 20 min · 1,234 kJ');
    expect(ridesLine({ rides: 3, seconds: 7200, kj: 0 })).toBe('⏱ 2 h');
    expect(ridesLine(undefined)).toBeNull();
  });
  it('centres the selection and lines the rest up on one row without overlaps', () => {
    for (const W of [700, 1024, 1366]) {
      const d = carouselDims(W);
      for (const active of [0, 3, 6]) {
        const s = carouselSlots(7, active, d);
        expect(s[active].x + s[active].w / 2).toBeCloseTo(W / 2);
        expect(s[active].w).toBeGreaterThan(d.sideW);
        for (let i = 1; i < 7; i++) expect(s[i].x).toBeGreaterThanOrEqual(s[i - 1].x + s[i - 1].w + d.gap - 0.01);
        s.forEach((x, i) => { if (i !== active) expect(x.z).toBeLessThan(s[active].z); });
        expect(s[active].opacity).toBe(1);
        // neighbours are on screen (at least partly)
        if (active > 0) expect(s[active - 1].opacity).toBeGreaterThan(0);
        if (active < 6) expect(s[active + 1].opacity).toBeGreaterThan(0);
      }
    }
  });
  it('fades cards that are off the strip', () => {
    const s = carouselSlots(7, 0, carouselDims(800));
    expect(s[6].opacity).toBe(0);
  });
  it('has a recorded clip and poster for every game (npm run capture:cards)', () => {
    for (const x of games) for (const ext of ['mp4', 'webp']) {
      const f = join(process.cwd(), 'public', 'cards', `${x.id}.${ext}`);
      expect(existsSync(f), f).toBe(true);
      expect(statSync(f).size).toBeLessThan(1_000_000);
    }
  });
});
