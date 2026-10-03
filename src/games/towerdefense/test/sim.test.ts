import { describe, it, expect } from 'vitest';
import { createGameSession, makeRng, runHeadless, testProfile, TimelineInput } from '../../../core';
import type { InputState, Profile } from '../../../contracts';
import { module } from '../index';
import { scenarios } from '../scenarios';
import { progressLine } from '../card';
import { BASE_X, BASE_Y, KIND_FROM, KINDS, PADS, TOWERS, laneAt, laneLength, towerBuildCost } from '../sim/defs';
import { planWave, waveCounts } from '../sim/waves';
import { UPGRADES, autoInvest, metaMods, upgradeCost } from '../sim/meta';
import { readSave } from '../sim/sim';
import type { TdSnapshot } from '../sim/types';

const snap = (s: { sim: { snapshot(): unknown } }) => s.sim.snapshot() as TdSnapshot;

describe('scenarios via runHeadless', () => {
  for (const sc of scenarios) {
    it(sc.name, () => {
      const r = runHeadless({ game: module, script: sc.script, minutes: sc.minutes, seed: sc.seed, simOpts: sc.simOpts });
      expect(sc.assert(r.summary, r.stats, r)).toEqual([]);
    });
  }
});

describe('field geometry', () => {
  it('lanes run from off the top/sides to the base', () => {
    for (let l = 0; l < 3; l++) {
      const a = laneAt(l, 0), b = laneAt(l, laneLength(l));
      expect(a.y < 20 || a.x < 0 || a.x > 100).toBe(true);
      expect(Math.hypot(b.x - BASE_X, b.y - BASE_Y)).toBeLessThan(1e-6);
      expect(laneLength(l)).toBeGreaterThan(80);
    }
  });
  it('six pads inside the field, well apart', () => {
    expect(PADS).toHaveLength(6);
    for (const p of PADS) { expect(p.x).toBeGreaterThan(5); expect(p.x).toBeLessThan(95); expect(p.y).toBeGreaterThan(5); expect(p.y).toBeLessThan(85); }
    for (const a of PADS) for (const b of PADS) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(9);
  });
});

describe('waves', () => {
  it('kinds only appear from their first wave, bosses every 5', () => {
    for (let w = 1; w <= 30; w++) {
      const p = planWave(w, makeRng(w), { spawnWindowS: 20, countScale: 1 });
      for (const s of p.spawns) expect(w).toBeGreaterThanOrEqual(KIND_FROM[s.kind]);
      expect(p.boss).toBe(w % 5 === 0);
      expect(p.spawns.filter((s) => s.kind === 'boss').length).toBe(w % 5 === 0 ? 1 : 0);
      // forecast counts every spawn once, in its lane
      const total = p.lanes.reduce((n, l) => n + l.blue + l.red + l.purple + l.gold + l.prism, 0);
      expect(total).toBe(p.spawns.length);
      for (let i = 1; i < p.spawns.length; i++) expect(p.spawns[i].at).toBeGreaterThanOrEqual(p.spawns[i - 1].at);
    }
  });
  it('is deterministic per rng and grows with the wave', () => {
    const a = planWave(9, makeRng(4), { spawnWindowS: 20, countScale: 1 }), b = planWave(9, makeRng(4), { spawnWindowS: 20, countScale: 1 });
    expect(a).toEqual(b);
    const heavy = (w: number) => Object.entries(waveCounts(w)).reduce((n, [k, c]) => n + (KINDS[k as keyof typeof KINDS].heavy ? c ?? 0 : 0), 0);
    expect(heavy(20)).toBeGreaterThan(heavy(4));
  });
});

describe('garage meta', () => {
  it('auto-invest buys the cheapest upgrades and mods apply', () => {
    const l = {};
    const r = autoInvest(1000, l);
    expect(r.bought.length).toBeGreaterThan(3);
    expect(r.bank).toBeLessThan(Math.min(...UPGRADES.map((d) => upgradeCost(d, 0))) * 2);
    const m = metaMods({ plating: 2, capacity: 1, foundry: 2, headstart: 3 }, 20);
    expect(m.hpMult).toBeCloseTo(1.2); expect(m.railExtra).toBe(1); expect(m.towerCostMult).toBeCloseTo(0.9);
    expect(m.maxStartWave).toBe(7);
    expect(metaMods({ headstart: 9 }, 6).maxStartWave).toBe(4); // capped at best - 2
  });
  it('reads old saves and shows progress', () => {
    const s = readSave({ bestWave: 9 });
    expect(s).toMatchObject({ v: 2, bestWave: 9, bank: 0, runs: 0 });
    expect(progressLine({ bestWave: 9 })).toBe('Best: wave 9');
    expect(progressLine({ bestWave: 12, bank: 340 })).toBe('Best: wave 12 · 340 parts');
    expect(progressLine(undefined)).toBeNull();
  });
  it('a returning rider shops in the garage, then starts the run', () => {
    const profile: Profile = testProfile({ gameData: { towerdefense: { v: 2, runs: 1, bank: 500, bestWave: 5, upgrades: {} } } });
    let saved: any = null;
    const input = new TimelineInput([
      { t: 0.2, press: 'down' }, { t: 0.3, release: 'down' }, // -> Hull Plating (120)
      { t: 0.5, press: 'a' }, { t: 0.6, release: 'a' },       // buy
      { t: 0.8, press: 'b' }, { t: 0.9, release: 'b' },       // start now
    ]);
    const s = createGameSession({ game: module, profile, input, fake: { script: 'z2' }, seed: 3, onSave: (d) => { saved = d; } });
    s.step(3);
    expect(snap(s).phase).toBe('garage');
    expect(s.sim.hud!().controls!.some((c) => c.label === 'Buy / start')).toBe(true);
    s.step(30);
    expect(saved.upgrades.plating).toBe(1);
    expect(saved.bank).toBe(380);
    expect(snap(s).phase).toBe('run');
    expect(snap(s).baseMaxHp).toBeCloseTo(110);
    expect(saved.runs).toBe(2);
  });
  it('best wave counts from a Forward Base start', () => {
    const profile: Profile = testProfile({ gameData: { towerdefense: { v: 2, runs: 4, bank: 0, bestWave: 12, upgrades: { headstart: 3 } } } });
    let saved: any = null;
    const s = createGameSession({ game: module, profile, input: new TimelineInput([{ t: 0.2, press: 'b' }]), fake: { script: 'z2' }, seed: 3, onSave: (d) => { saved = d; } });
    s.step(30);
    expect(snap(s).wave).toBe(7); // 1 + 2 x 3
    s.step(30 * 60 * 4);
    expect(snap(s).wave).toBeGreaterThan(9);
    expect(saved.bestWave).toBe(Math.max(12, snap(s).wave - 1));
  });
  it('first run skips the garage; intro shows play controls', () => {
    const s = createGameSession({ game: module, profile: testProfile(), input: new TimelineInput([]), fake: { script: 'z2' }, seed: 3 });
    expect(s.sim.hud!().controls!.map((c) => c.label)).toContain('Gatling'); // before the first update (game intro)
    s.step(1);
    expect(snap(s).phase).toBe('run');
  });
});

describe('effort targets', () => {
  // step until a challenge starts, then ride it with fixed manual cadence/power
  function ride(kind: 'spin' | 'surge', cadence: number, power: number) {
    const s = createGameSession({ game: module, profile: testProfile(), input: new TimelineInput([]), fake: { script: 'z2' }, seed: 5, simOpts: { autopilot: true } });
    let n = 0;
    while (!snap(s)[kind] && n++ < 30 * 60 * 10) s.step(1);
    expect(snap(s)[kind]?.state).toBe('active');
    const hud = s.sim.hud!();
    s.fakeBike!.useScript(null); s.fakeBike!.manual.cadence = cadence; s.fakeBike!.manual.power = power;
    s.step(30 * 50);
    return { s, hud, sum: s.sim.summary() };
  }
  it('Spin-up is a cadence drill: 100 rpm overclocks the Gatling', () => {
    const { s, hud, sum } = ride('spin', 100, 130);
    expect(hud.targetCadence).toEqual({ min: 95, label: 'Spin up the Gatling' });
    expect(sum.spinsWon).toBe(1);
    expect(Number(sum.overclockSeconds)).toBeGreaterThan(0);
    expect(s.sim.hud!().targetCadence).toBeUndefined();
  });
  it('Spin-up is missed at 80 rpm', () => {
    const { sum } = ride('spin', 80, 130);
    expect(sum).toMatchObject({ spinsWon: 0, spinsFailed: 1 });
  });
  it('surges are short efforts judged on power, and say so to the HUD', () => {
    const { hud, sum } = ride('surge', 90, 200); // 1.0 FTP = power Z4 straight away, whatever HR does
    expect(hud.targetZone).toMatchObject({ min: 4, max: 5, source: 'power' });
    expect(sum.surgesWon).toBe(1);
  });
});

describe('workshop', () => {
  it('▼ opens it on an empty pad, A builds, B closes', () => {
    const input = new TimelineInput([
      { t: 0.5, press: 'down' }, { t: 0.6, release: 'down' },
      { t: 0.8, press: 'up' }, { t: 0.9, release: 'up' },
    ]);
    const s = createGameSession({ game: module, profile: testProfile(), input, fake: { script: 'z2' }, seed: 3, simOpts: { skipGarage: true } });
    s.step(20);
    const ws = snap(s).workshop!;
    expect(ws).not.toBeNull();
    expect(ws.pad).toBeLessThan(6);
    expect(ws.rows.map((r) => r.tower)).toEqual(['tesla', 'mortar', 'lens']);
    expect(s.sim.hud!().controls!.some((c) => c.label === 'Build / upgrade')).toBe(true);
    // pick the tesla row by tap, then build it
    const scrap0 = snap(s).scrap;
    s.sim.receive!({ type: 'row', row: 0 }); s.step(1);
    expect(snap(s).towers).toHaveLength(1);
    expect(snap(s).towers[0].kind).toBe('tesla');
    expect(snap(s).scrap).toBeLessThanOrEqual(scrap0 - towerBuildCost('tesla') + 2);
    // the built pad now offers an upgrade and a refund
    expect(snap(s).workshop!.rows.map((r) => r.kind)).toEqual(['upgrade', 'sell']);
    s.sim.receive!({ type: 'close' }); s.step(1);
    expect(snap(s).workshop).toBeNull();
  });
  it('towers only fire on pedal power', () => {
    const run = (script: string) => {
      const s = createGameSession({ game: module, profile: testProfile(), input: new TimelineInput([]), fake: { script }, seed: 4, simOpts: { skipGarage: true } });
      s.sim.receive!({ type: 'pad', pad: 3 }); s.step(1); s.sim.receive!({ type: 'row', row: 0 }); s.step(30 * 60);
      return { towers: snap(s).towers.length, kills: Number(s.sim.summary().towerKills) };
    };
    expect(run('idle')).toEqual({ towers: 1, kills: 0 });
    expect(run('z2').kills).toBeGreaterThan(0);
  });
  it('tower stats are sane', () => {
    for (const t of Object.values(TOWERS)) { expect(t.range).toBeGreaterThan(15); expect(t.cost).toBeGreaterThan(0); }
  });
});

function rigged() {
  const held = new Set<string>(), pressed = new Set<string>(), released = new Set<string>();
  const st = { held, pressed, released, paddleL: 0, paddleR: 0, paddleIdleS: 99, source: 'script' } as unknown as InputState;
  let skip = false;
  const input = { beginTick() { if (skip) skip = false; else { pressed.clear(); released.clear(); } }, state: () => st };
  const session = createGameSession({ game: module, profile: testProfile(), input, fake: { script: 'intervals' }, seed: 3, simOpts: { skipGarage: true } });
  return { fresh: () => { skip = true; }, session, held, pressed, released, charges: () => snap(session).railCharges };
}

describe('rail', () => {
  it('caps charges at 3 and hold-Z dumps with railFired{charges:3}', () => {
    const h = rigged();
    h.session.step(30 * 120);
    expect(h.charges()).toBe(3);
    h.pressed.add('z'); h.held.add('z'); h.fresh();
    h.session.step(30);
    const ev = h.session.finish().events.find(e => e.type === 'railFired');
    expect(ev?.data?.charges).toBe(3);
  });
  it('tap Z fires one charge', () => {
    const h = rigged();
    h.session.step(30 * 120);
    h.pressed.add('z'); h.held.add('z'); h.fresh(); h.session.step(1);
    h.held.delete('z'); h.released.add('z'); h.fresh(); h.session.step(1);
    const evs = h.session.finish().events.filter(e => e.type === 'railFired');
    expect(evs.map(e => e.data?.charges)).toEqual([1]);
  });
});
