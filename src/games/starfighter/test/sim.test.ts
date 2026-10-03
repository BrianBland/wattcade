import { describe, it, expect } from 'vitest';
import { createGameSession, runHeadless, testProfile, NullInput, TimelineInput, TuningRegistry } from '../../../core';
import type { InputState } from '../../../contracts';
import { module } from '../index';
import { scenarios } from '../scenarios';
import { progressLine } from '../card';
import { UPGRADES, autoInvest, metaMods, upgradeCost } from '../sim/meta';
import { BOSSES, SECTORS, sectorTheme } from '../sim/content';
import type { SfSnapshot } from '../sim/types';

describe('scenarios via runHeadless', () => {
  for (const sc of scenarios) {
    it(sc.name, () => {
      const r = runHeadless({ game: module, script: sc.script, minutes: sc.minutes, seed: sc.seed, simOpts: sc.simOpts });
      expect(sc.assert(r.summary, r.stats, r)).toEqual([]);
    });
  }
});

function rigged(simOpts: Record<string, unknown> = { skipHangar: true }, tune: Record<string, number> = {}) {
  const held = new Set<string>(), pressed = new Set<string>(), released = new Set<string>();
  const st = { held, pressed, released, paddleL: 0, paddleR: 0, paddleIdleS: 99, source: 'script' } as unknown as InputState;
  const input = { beginTick() { pressed.clear(); released.clear(); }, state: () => st };
  const profile = testProfile();
  const reg = new TuningRegistry({ profileId: profile.id, storage: null });
  const session = createGameSession({ game: module, profile, input, fake: { script: 'sprints' }, seed: 3, simOpts, tuningRegistry: reg });
  for (const [k, v] of Object.entries(tune)) reg.set('starfighter.' + k, v); // keys exist once the sim registered them
  return { session, held, pressed, snap: () => session.sim.snapshot() as SfSnapshot };
}

describe('guns', () => {
  for (const [btn, side] of [['shiftUpL', 'L'], ['left', 'L'], ['shiftDnR', 'R'], ['y', 'R']] as const) {
    it(`${btn} fires only the ${side} gun`, () => {
      const h = rigged();
      h.session.step(30 * 5);
      h.held.add(btn);
      const sides = new Set<string>();
      for (let i = 0; i < 90; i++) { h.session.step(1); for (const b of h.snap().shots) if (b.kind === 'shot') sides.add(b.side); }
      expect([...sides]).toEqual([side]);
    });
  }
  it('idle triggers fire nothing', () => {
    const h = rigged();
    let n = 0;
    for (let i = 0; i < 150; i++) { h.session.step(1); n += h.snap().shots.length; }
    expect(n).toBe(0);
  });
});

describe('hud', () => {
  it('exposes zone target and no gears; attack run and boss want zone 4', () => {
    const h = rigged({ autopilot: true });
    h.session.step(1); // autopilot leaves the hangar on the first tick
    const hud = h.session.sim.hud!();
    expect(hud.gears).toBe(false);
    expect(hud.targetZone).toMatchObject({ min: 2, max: 2 });
    h.session.step(30 * 155);
    expect(h.session.sim.hud!().targetZone).toMatchObject({ min: 4, max: 4 });
  });
});

describe('sectors and bosses', () => {
  it('every sector theme has a boss and the five bosses are all different', () => {
    expect(new Set(SECTORS.map(s => s.boss)).size).toBe(Object.keys(BOSSES).length);
    expect(sectorTheme(6).name).toBe(sectorTheme(1).name);
  });
  it('the Twin Lancer is two halves: both must fall to clear the sector', () => {
    const h = rigged({ autopilot: true, sector: 3 }, { cruiseS: 20, attackS: 20 });
    let parts = 0, defeated = false;
    for (let i = 0; i < 30 * 240 && !defeated; i++) {
      h.session.step(1);
      const s = h.snap();
      parts = Math.max(parts, s.enemies.filter(e => e.kind === 'boss').length);
      defeated = s.bossesDefeated > 0;
    }
    expect(parts).toBe(2);
    expect(defeated).toBe(true);
  });
  it('a boss that is not beaten in time escapes; the run moves on without the clear bonus', () => {
    const h = rigged({ autopilot: true }, { cruiseS: 20, attackS: 20, bossTimeoutS: 30, bossHpMult: 5 });
    h.session.step(30 * 90);
    const sm = h.session.sim.summary();
    expect(sm.bossesEscaped).toBe(1);
    expect(sm.sector).toBe(2);
  });
});

describe('ships and lives', () => {
  it('idle loses all three ships, then the run is over and scrap is banked', () => {
    const r = runHeadless({ game: module, script: 'idle', minutes: 10, seed: 1, simOpts: { autopilot: true } });
    expect(r.isOver).toBe(true);
    expect(r.summary.deaths).toBe(3);
    expect(r.events.filter(e => e.type === 'shipLost').length).toBe(2);
  });
  it('lives = 0 means unlimited ships', () => {
    const r = runHeadless({ game: module, script: 'idle', minutes: 8, seed: 1, simOpts: { autopilot: true }, tuning: { 'starfighter.lives': 0 } });
    expect(r.isOver).toBe(false);
    expect(Number(r.summary.deaths)).toBeGreaterThan(3);
  });
});

describe('hangar', () => {
  it('meta: auto-invest buys cheapest first; warp start capped by best sector', () => {
    const l = {} as Record<string, number>;
    const r = autoInvest(1000, l);
    const cheapest = Math.min(...UPGRADES.map(d => upgradeCost(d, l[d.id] ?? 0)));
    expect(r.bought.length).toBeGreaterThan(0);
    expect(cheapest).toBeGreaterThan(r.bank);
    expect(metaMods({ warp: 10 }, 6).maxStartSector).toBe(5);
    expect(metaMods({ warp: 1 }, 30).maxStartSector).toBe(2);
    expect(metaMods({}, 30).maxStartSector).toBe(1);
  });
  it('D-pad + A buys an upgrade, B launches; the save keeps the bank', () => {
    const profile = testProfile();
    (profile.gameData as Record<string, unknown>).starfighter = { bank: 1000, upgrades: {}, bestSector: 1, runs: 0, autoInvest: false };
    let saved: any = null;
    const input = new TimelineInput([
      { t: 0.2, press: 'down' }, { t: 0.3, release: 'down' }, // -> Cannons
      { t: 0.5, press: 'a' }, { t: 0.6, release: 'a' },       // buy (240)
      { t: 0.8, press: 'b' }, { t: 0.9, release: 'b' },       // launch
    ]);
    const s = createGameSession({ game: module, profile, input, fake: { script: 'z2' }, seed: 3, onSave: (d) => { saved = d; } });
    expect((s.sim.snapshot() as SfSnapshot).phase).toBe('hangar');
    expect(s.sim.hud!().targetZone?.label).toBe('Hangar');
    s.step(40);
    expect((s.sim.snapshot() as SfSnapshot).phase).toBe('run');
    expect(saved.upgrades.cannons).toBe(1);
    expect(saved.bank).toBe(1000 - UPGRADES.find(u => u.id === 'cannons')!.base);
    expect(saved.runs).toBe(1);
  });
  it('a tap on a row buys it; a tap on Launch starts the run', () => {
    const profile = testProfile();
    (profile.gameData as Record<string, unknown>).starfighter = { bank: 5000, upgrades: {}, bestSector: 1, runs: 0, autoInvest: false };
    let saved: any = null;
    const s = createGameSession({ game: module, profile, input: new NullInput(), fake: { script: 'z2' }, seed: 3, onSave: (d) => { saved = d; } });
    const rows = (s.sim.snapshot() as SfSnapshot).hangar!.rows;
    s.sim.receive!({ type: 'hangarRow', row: rows.findIndex(r => r.id === 'pod') });
    s.step(1);
    expect(saved.upgrades.pod).toBe(1);
    s.sim.receive!({ type: 'hangarRow', row: 0 });
    s.step(1);
    const snap = s.sim.snapshot() as SfSnapshot;
    expect(snap.phase).toBe('run');
    expect(snap.livesMax).toBe(4); // 3 ships + 1 escape pod
  });
  it('pedalling in the hangar launches on its own', () => {
    const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'z2' }, seed: 3 });
    s.step(30 * 10);
    expect((s.sim.snapshot() as SfSnapshot).phase).toBe('hangar');
    s.step(30 * 30);
    expect((s.sim.snapshot() as SfSnapshot).phase).toBe('run');
  });
  it('scrap carries over between rides and auto-invest spends it at launch', () => {
    const profile = testProfile();
    const ride = () => {
      const s = createGameSession({ game: module, profile, input: new NullInput(), fake: { script: 'sprints' }, seed: 4, simOpts: { autopilot: true }, onSave: (d) => { profile.gameData.starfighter = d; } });
      s.step(30 * 60 * 6); s.sim.dispose?.();
      return s.sim.summary();
    };
    ride();
    const after1 = profile.gameData.starfighter as any;
    expect(after1.bank).toBeGreaterThan(500);
    expect(after1.runs).toBe(1);
    ride();
    const after2 = profile.gameData.starfighter as any;
    expect(Object.values(after2.upgrades as Record<string, number>).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    expect(after2.runs).toBe(2);
    expect(after2.totals.kills).toBeGreaterThan(after1.totals.kills);
  });
  it('an old Crank Fighter save keeps its best score', () => {
    const profile = testProfile();
    (profile.gameData as Record<string, unknown>).starfighter = { best: 98765 };
    let saved: any = null;
    const s = createGameSession({ game: module, profile, input: new NullInput(), fake: { script: 'z2' }, seed: 3, simOpts: { autopilot: true }, onSave: (d) => { saved = d; } });
    s.step(30);
    expect(saved.best).toBe(98765);
    expect(saved.v).toBe(2);
  });
});

describe('cruise challenges (zone + cadence targets)', () => {
  const rider = (cadence: number, ftp: number) => ({ name: 't', description: '', cadence: () => cadence, powerFtp: () => ftp });
  function ride(sector: number, cadence: number, ftp: number, hr: number | null) {
    const events: Array<{ type: string; data?: any }> = [];
    const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'idle' }, seed: 2, simOpts: { autopilot: true, sector }, onEmit: (e) => events.push(e) });
    s.fakeBike!.useScript(rider(cadence, ftp));
    s.fakeBike!.manual.hr = hr;
    return { s, events, snap: () => s.sim.snapshot() as SfSnapshot };
  }
  const done = (events: Array<{ type: string; data?: any }>, type: string) => events.find((e) => e.type === type)?.data?.completed;

  it('attack runs and bosses are judged on power; cruise keeps the profile zone source', () => {
    const { s } = ride(1, 90, 0.65, null);
    s.step(30 * 5);
    expect(s.sim.hud!().targetZone).toMatchObject({ min: 2, max: 2 });
    expect(s.sim.hud!().targetZone?.source).toBeUndefined();
    s.step(30 * 150);
    expect(s.sim.hud!().targetZone).toMatchObject({ min: 4, max: 4, source: 'power' });
  });
  it('odd sectors: Slipstream is judged on power even when HR sits in Z1', () => {
    const { s, events, snap } = ride(1, 90, 0.95, 100);
    let source: unknown, cad: unknown = 'unset';
    for (let i = 0; i < 150 && done(events, 'slipstreamDone') === undefined; i++) {
      s.step(30);
      if (snap().challenge?.state === 'active') { source = s.sim.hud!().targetZone?.source; cad = s.sim.hud!().targetCadence; expect(s.ctx.bike().effortZone).toBe(1); }
    }
    expect(source).toBe('power');
    expect(cad).toBeUndefined();
    expect(done(events, 'slipstreamDone')).toBe(true);
    expect(Number(s.sim.summary().slipstreams)).toBe(1);
  });
  it('even sectors: Spin-Up asks for cadence in zone 2; spinning fast earns Rapid Fire', () => {
    const { s, events, snap } = ride(2, 100, 0.6, null);
    let tc: unknown, tz: unknown;
    for (let i = 0; i < 150 && done(events, 'spinUpDone') === undefined; i++) {
      s.step(30);
      if (snap().challenge?.kind === 'spinup' && snap().challenge?.state === 'active') { tc = s.sim.hud!().targetCadence; tz = s.sim.hud!().targetZone; }
    }
    expect(tc).toMatchObject({ min: 95 });
    expect(tz).toMatchObject({ min: 2, max: 2 });
    expect(done(events, 'spinUpDone')).toBe(true);
    expect(snap().rapidLeft).toBeGreaterThan(0);
    s.step(30 * 40);
    expect(Number(s.sim.summary().rapidFireS)).toBe(30);
    expect(s.sim.summary().slipstreams).toBe(0);
  });
  it('Spin-Up: a slow cadence misses it, even at high power', () => {
    const { s, events } = ride(2, 80, 1.0, null);
    for (let i = 0; i < 150 && done(events, 'spinUpDone') === undefined; i++) s.step(30);
    expect(done(events, 'spinUpDone')).toBe(false);
    expect(s.sim.summary().spinUps).toBe(0);
  });
  it('Rapid Fire doubles trigger pulls per crank rev', () => {
    const held = new Set<string>(['shiftUpL', 'shiftUpR']);
    const st = { held, pressed: new Set(), released: new Set(), paddleL: 0, paddleR: 0, paddleIdleS: 99, source: 'script' } as unknown as InputState;
    const s = createGameSession({ game: module, profile: testProfile(), input: { beginTick() {}, state: () => st }, fake: { script: 'idle' }, seed: 2, simOpts: { skipHangar: true, sector: 2 } });
    s.fakeBike!.useScript(rider(100, 0.6));
    const snap = () => s.sim.snapshot() as SfSnapshot;
    const pulls = (secs: number) => { // each pull leaves one muzzle flash
      let n = 0; const seen = new Set<number>();
      for (let i = 0; i < 30 * secs; i++) { s.step(1); for (const f of snap().fx) if (f.kind === 'muzzle' && !seen.has(f.id)) { seen.add(f.id); n++; } }
      return n;
    };
    s.step(30 * 5);
    const before = pulls(10);
    for (let i = 0; i < 150 && !(snap().rapidLeft > 0); i++) s.step(30);
    expect(snap().rapidLeft).toBeGreaterThan(10);
    const during = pulls(10);
    expect(during / before).toBeGreaterThan(1.8);
  });
});

describe('card', () => {
  it('progress line', () => {
    expect(progressLine(undefined)).toBeNull();
    expect(progressLine({ best: 1234 })).toBe('best 1,234');
    expect(progressLine({ best: 1234, bestSector: 5, bank: 900 })).toBe('Sector 5 · best 1,234 · 900 scrap');
  });
});

describe('determinism', () => {
  it('same seed -> identical summary', () => {
    const run = () => runHeadless({ game: module, script: 'sprints', minutes: 6, seed: 7, simOpts: { autopilot: true } }).summary;
    expect(run()).toEqual(run());
  });
});
