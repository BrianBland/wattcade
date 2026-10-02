import { describe, expect, it } from 'vitest';
import { createGameSession, NullInput, testProfile, TimelineInput } from '../../../core';
import type { Button } from '../../../contracts';
import { module } from '../index';
import { islandHeight, LIGHTHOUSE_Y, PIER_LEN, PLOTS } from '../sim/layout';

const taps = (...seq: Array<[number, Button]>) => new TimelineInput(seq.flatMap(([t, b]) => [{ t, press: b }, { t: t + 0.1, release: b }]));
const snap = (s: { sim: { snapshot(): unknown } }) => s.sim.snapshot() as any;
function withSave(data: Record<string, unknown>) {
  const p = testProfile();
  (p.gameData as Record<string, unknown>).lighthouse = { v: 2, buildings: PLOTS.map(() => null), grow: [], meadow: 0, shipsDockedTotal: 0, stormsWeatheredTotal: 0, ...data };
  return p;
}

describe('layout', () => {
  it('plots sit on land, apart from each other; shore plots reach the water; lighthouse on the cliff', () => {
    for (const p of PLOTS) expect(islandHeight(p.x, p.z)).toBeGreaterThan(0.5);
    for (let i = 0; i < PLOTS.length; i++) for (let j = i + 1; j < PLOTS.length; j++) expect(Math.hypot(PLOTS[i].x - PLOTS[j].x, PLOTS[i].z - PLOTS[j].z)).toBeGreaterThan(4);
    for (const p of PLOTS.filter((q) => q.shore)) expect(islandHeight(p.x, p.z + PIER_LEN)).toBeLessThan(0);
    expect(LIGHTHOUSE_Y).toBeGreaterThan(6);
  });
});

describe('build mode (bike-friendly)', () => {
  it('A opens the menu on an affordable building and a good plot; A again builds it and closes', () => {
    let saved: any = null;
    const s = createGameSession({ game: module, profile: testProfile(), input: taps([0.2, 'a'], [0.6, 'a']), fake: { script: 'z2' }, seed: 1, onSave: (d) => { saved = d; } });
    s.step(12);
    expect(snap(s).mode).toBe('build');
    expect(snap(s).cursor.building).toBe('garden'); // the only thing a fresh keeper can afford
    s.step(20);
    const b = snap(s);
    expect(b.mode).toBe('watch');
    const plot = b.buildings.indexOf('garden');
    expect(plot).toBeGreaterThanOrEqual(0);
    expect(PLOTS[plot].shore).toBe(false);
    expect(saved.v).toBe(2);
    expect(saved.buildings[plot]).toBe('garden');
  });

  it('piers only go on the beach, and left/right only visits free beach plots', () => {
    const seen = new Set<number>();
    const input = taps([0.1, 'right'], [0.3, 'right'], [0.5, 'right']);
    const s2 = createGameSession({ game: module, profile: withSave({ coin: 999, timber: 999 }), input, fake: { script: 'z2' }, seed: 1 });
    s2.sim.receive!({ type: 'select', building: 'pier' });
    for (let i = 0; i < 25; i++) { s2.step(1); seen.add(snap(s2).cursor.plot); }
    expect([...seen].every((p) => PLOTS[p].shore)).toBe(true);
    expect(seen.size).toBeGreaterThan(1);
    s2.sim.receive!({ type: 'build' });
    s2.step(1);
    const b = snap(s2).buildings as Array<string | null>;
    expect(PLOTS[b.indexOf('pier')].shore).toBe(true);
  });

  it('B closes the menu, and it closes by itself when left alone', () => {
    const s = createGameSession({ game: module, profile: testProfile(), input: taps([0.1, 'a'], [0.5, 'b']), fake: { script: 'z2' }, seed: 1 });
    s.step(10); expect(snap(s).mode).toBe('build');
    s.step(10); expect(snap(s).mode).toBe('watch');
    const s2 = createGameSession({ game: module, profile: testProfile(), input: taps([0.1, 'a']), fake: { script: 'z2' }, seed: 1 });
    s2.step(30 * 10); expect(snap(s2).mode).toBe('build');
    s2.step(30 * 25); expect(snap(s2).mode).toBe('watch');
  });

  it('a tap on a plot opens the build menu on that plot; Y cycles the camera', () => {
    const s = createGameSession({ game: module, profile: testProfile(), input: taps([0.1, 'y']), fake: { script: 'z2' }, seed: 1 });
    s.sim.receive!({ type: 'plot', plot: 7 });
    s.step(6);
    expect(snap(s).mode).toBe('build');
    expect(snap(s).cursor.plot).toBe(7);
    expect(snap(s).view).toBe(0); // Y is ignored inside the build menu
    s.sim.receive!({ type: 'mode', mode: 'watch' });
    s.step(1);
    s.sim.receive!({ type: 'view' });
    s.step(1);
    expect(snap(s).view).toBe(1);
  });
});

describe('saves and growth', () => {
  it('discards saves from the old 14-plot layout', () => {
    const p = testProfile();
    (p.gameData as Record<string, unknown>).lighthouse = { buildings: ['cottage', 'pier'], coin: 999, timber: 999, shipsDockedTotal: 3, stormsWeatheredTotal: 1 };
    const s = createGameSession({ game: module, profile: p, input: new NullInput(), fake: { script: 'z2' }, seed: 1 });
    expect(snap(s).coin).toBe(20);
    expect((snap(s).buildings as unknown[]).every((b) => b === null)).toBe(true);
  });

  it('greenery and island bloom grow only while riding in zone', () => {
    const run = (script: string) => {
      const b = PLOTS.map(() => null as string | null); b[6] = 'cottage'; b[7] = 'garden';
      const s = createGameSession({ game: module, profile: withSave({ buildings: b, coin: 0, timber: 0 }), input: new NullInput(), fake: { script }, seed: 2 });
      s.step(30 * 300);
      return snap(s);
    };
    const z2 = run('z2'), idle = run('idle');
    expect(z2.grow[7]).toBeGreaterThan(z2.grow[6]); // gardens grow fastest
    expect(z2.grow[6]).toBeGreaterThan(0.2);
    expect(z2.meadow).toBeGreaterThan(0.05);
    expect(idle.grow[6]).toBe(0);
    expect(idle.meadow).toBe(0);
  });

  it('gardens boost cottage income', () => {
    const income = (gardens: number) => {
      const b = PLOTS.map(() => null as string | null); b[5] = 'cottage';
      for (let i = 0; i < gardens; i++) b[10 + i] = 'garden';
      const s = createGameSession({ game: module, profile: withSave({ buildings: b, coin: 0, timber: 0 }), input: new NullInput(), fake: { script: 'idle' }, seed: 3 });
      s.step(30 * 100);
      return snap(s).coin;
    };
    expect(income(2)).toBeGreaterThan(income(0) * 1.15);
  });
});
