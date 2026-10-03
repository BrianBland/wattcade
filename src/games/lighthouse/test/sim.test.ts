import { describe, expect, it } from 'vitest';
import { createGameSession, NullInput, testProfile, TimelineInput } from '../../../core';
import type { Button } from '../../../contracts';
import { module } from '../index';
import { islandHeight, LIGHTHOUSE_Y, PIER_LEN, PLOTS } from '../sim/layout';
import { neighbours, upgradeCost } from '../sim/town';

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
    expect(z2.grow[6]).toBeGreaterThan(0.08);
    expect(z2.meadow).toBeGreaterThan(0.005);
    expect(idle.grow[6]).toBe(0);
    expect(idle.meadow).toBe(0);
  });

  it('a garden next door boosts a home; one across the island does not', () => {
    const income = (garden: number | null) => {
      const b = PLOTS.map(() => null as string | null); b[5] = 'cottage';
      if (garden !== null) b[garden] = 'garden';
      const s = createGameSession({ game: module, profile: withSave({ buildings: b, coin: 0, timber: 0 }), input: new NullInput(), fake: { script: 'idle' }, seed: 3 });
      s.step(30 * 100);
      return snap(s).coin;
    };
    const base = income(null);
    expect(neighbours(5)).toContain(6);
    expect(neighbours(5)).not.toContain(3);
    expect(income(6)).toBeGreaterThan(base * 1.15);
    expect(income(3)).toBeCloseTo(base, 5);
  });
});

describe('deeper progression', () => {
  const town = (entries: Record<number, string>) => { const b = PLOTS.map(() => null as string | null); for (const [i, k] of Object.entries(entries)) b[Number(i)] = k; return b; };

  it('districts open from milestones; locked plots say why', () => {
    const events: string[] = [];
    const b = town({ 4: 'cottage', 5: 'cottage', 6: 'garden', 7: 'cottage' });
    const s = createGameSession({ game: module, profile: withSave({ buildings: b, coin: 999, timber: 999 }), input: new NullInput(), fake: { script: 'z2' }, seed: 1, onEmit: (e) => events.push(e.type) });
    const hill = PLOTS.findIndex((p) => p.district === 'hillside');
    s.sim.receive!({ type: 'plot', plot: hill }); s.step(1);
    expect(snap(s).districts.find((d: any) => d.id === 'hillside').open).toBe(false);
    expect(snap(s).cursor.canBuild).toBe(false);
    expect(snap(s).options.find((o: any) => o.selected).reason).toMatch(/opens with The Hillside/);
    s.sim.receive!({ type: 'plot', plot: 8 }); s.sim.receive!({ type: 'select', building: 'garden' }); s.sim.receive!({ type: 'build' });
    s.step(1);
    expect(events).toContain('districtUnlocked');
    expect(snap(s).districts.find((d: any) => d.id === 'hillside').open).toBe(true);
  });

  it('upgrades need the area to have grown, then raise the level', () => {
    const run = (g: number) => {
      const b = town({ 5: 'cottage' });
      const s = createGameSession({ game: module, profile: withSave({ buildings: b, grow: PLOTS.map((_, i) => (i === 5 ? g : 0)), coin: 999, timber: 999 }), input: new NullInput(), fake: { script: 'idle' }, seed: 1 });
      s.sim.receive!({ type: 'plot', plot: 5 }); s.sim.receive!({ type: 'build' });
      s.step(1);
      return snap(s);
    };
    const young = run(0.2);
    expect(young.levels[5]).toBe(1);
    const grown = run(0.6);
    expect(grown.levels[5]).toBe(2);
    expect(grown.coin).toBeLessThan(999 - upgradeCost('cottage', 1).coin + 1);
  });

  it('shore-only buildings stay on the beach', () => {
    const s = createGameSession({ game: module, profile: withSave({ coin: 999, timber: 999 }), input: new NullInput(), fake: { script: 'z2' }, seed: 1 });
    for (const k of ['shipyard', 'lifeboat']) {
      s.sim.receive!({ type: 'select', building: k }); s.step(1);
      expect(PLOTS[snap(s).cursor.plot].shore).toBe(true);
      s.sim.receive!({ type: 'plot', plot: 6 }); s.sim.receive!({ type: 'select', building: k }); s.step(1);
      expect(PLOTS[snap(s).cursor.plot].shore).toBe(true); // selecting snaps back to a beach plot
    }
  });

  it('the lifeboat rescues a ship that would have been lost, then needs to recover', () => {
    const events: string[] = [];
    const s = createGameSession({ game: module, profile: withSave({ buildings: town({ 3: 'lifeboat' }), coin: 0, timber: 0 }), input: new NullInput(), fake: { script: 'idle' }, seed: 2, onEmit: (e) => events.push(e.type) });
    s.step(30 * 60 * 4);
    expect(events.filter((e) => e === 'shipRescued').length).toBeGreaterThanOrEqual(1);
    expect(events).toContain('shipLost'); // the cooldown means it can't save everyone
    expect(snap(s).stats.shipsRescued).toBe(events.filter((e) => e === 'shipRescued').length);
  });

  it('lens tiers need their district, then upgrade the lighthouse', () => {
    const fresh = createGameSession({ game: module, profile: withSave({ coin: 9999, timber: 9999 }), input: new NullInput(), fake: { script: 'z2' }, seed: 1 });
    fresh.sim.receive!({ type: 'select', building: 'lens' }); fresh.sim.receive!({ type: 'build' }); fresh.step(1);
    expect(snap(fresh).lens).toBe(1);
    const b = town({ 4: 'cottage', 5: 'cottage', 6: 'garden', 7: 'cottage', 8: 'garden' });
    const s = createGameSession({ game: module, profile: withSave({ buildings: b, coin: 9999, timber: 9999 }), input: new NullInput(), fake: { script: 'z2' }, seed: 1 });
    s.sim.receive!({ type: 'select', building: 'lens' }); s.sim.receive!({ type: 'build' }); s.step(1);
    expect(snap(s).lens).toBe(2);
    expect(snap(s).limits.fog).toBeGreaterThan(snap(fresh).limits.fog);
  });

  it('Steady Light builds while riding in zone (storms included) and breaks when you drop out', () => {
    const ready = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'storm-ready' }, seed: 1 });
    ready.step(30 * 60 * 8);
    expect(snap(ready).streak.mult).toBeCloseTo(1.1, 5);
    const z2 = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'z2' }, seed: 1 });
    z2.step(30 * 60 * 4.5);
    const before = snap(z2).streak.s;
    z2.step(30 * 60 * 2); // first storm arrives; a Z2-only rider falls out of the storm requirement
    expect(before).toBeGreaterThan(150);
    expect(snap(z2).streak.s).toBeLessThan(before);
  });

  it('storms are judged on power: a rider whose HR stays low still weathers them', () => {
    const events: string[] = [];
    const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'storm-ready' }, seed: 1, onEmit: (e) => events.push(e.type) });
    s.fakeBike!.manual.hr = 100; // HR Z1 the whole time
    let source: unknown;
    for (let i = 0; i < 60 * 9 && !events.includes('stormWeathered'); i++) { s.step(30); if (snap(s).storm.phase === 'storm') source = s.sim.hud!().targetZone?.source; }
    expect(source).toBe('power');
    expect(events).toContain('stormWeathered');
    expect(events).not.toContain('stormFailed');
  });

  it('clockwork wind-up asks for cadence in calm weather and pays out', () => {
    const events: Array<{ type: string; data?: any }> = [];
    const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'idle' }, seed: 1, onEmit: (e) => events.push(e) });
    s.fakeBike!.useScript({ name: 'spin', description: '', cadence: () => 95, powerFtp: () => 0.65 });
    let tc: unknown;
    for (let i = 0; i < 260 && !events.some((e) => e.type === 'clockworkWound'); i++) { s.step(30); if (snap(s).wind) tc = s.sim.hud!().targetCadence; }
    expect(tc).toMatchObject({ min: 90 });
    expect(events.find((e) => e.type === 'clockworkWound')?.data).toEqual({ completed: true });
    expect(snap(s).lamp).toBeGreaterThan(0.9);
  });

  it('Z opens the Keeper\'s Log in watch mode', () => {
    const s = createGameSession({ game: module, profile: testProfile(), input: taps([0.1, 'z']), fake: { script: 'z2' }, seed: 1 });
    s.step(10);
    expect(snap(s).logOpen).toBe(true);
  });
});
