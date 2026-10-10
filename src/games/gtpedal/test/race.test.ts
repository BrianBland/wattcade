import { describe, expect, it } from 'vitest';
import { createGameSession, testProfile, TimelineInput } from '../../../core';
import { module } from '../index';
import { GATE_R, payout, progress, rubberBand, ROUTES, skipping } from '../sim/race';
import { buildingAt } from '../sim/world';

const snap = (s: { sim: { snapshot(): unknown } }) => s.sim.snapshot() as any;
const tap = (t: number, b: string) => [{ t, press: b }, { t: t + 0.05, release: b }];
const canal = ROUTES.find((r) => r.id === 'canal')!;
function race(o: { ftp?: number; diff?: number; cash?: number; tl?: any[]; extra?: Record<string, unknown>; gameData?: Record<string, unknown> } = {}) {
  const p = testProfile(); if (o.gameData) (p.gameData as Record<string, unknown>).gtpedal = o.gameData;
  const evs: any[] = []; let saved: any = null;
  const s = createGameSession({ game: module, profile: p, input: new TimelineInput((o.tl ?? tap(0.3, 'a')) as any), fake: { script: 'target-follow' }, seed: 1, onEmit: (e: any) => evs.push(e), onSave: (d: unknown) => { saved = d; },
    simOpts: { start: 'bike', cyclists: 0, trams: false, cops: false, gang: false, autoRace: true, sprintFtp: o.ftp ?? 1, raceDiff: o.diff ?? 1, cash: o.cash ?? 100, spawn: { x: canal.start.x, z: canal.start.z, heading: 0 }, ...o.extra } } as any);
  const until = (pred: (q: any) => boolean, maxS = 90) => { for (let i = 0; i < maxS * 10; i++) { s.step(3); if (pred(snap(s))) return true; } return false; };
  return { s, evs, saved: () => saved, until };
}

describe('street races: routes + pure logic', () => {
  it('4 routes in different districts; gates sit on open ground', () => {
    expect(ROUTES.length).toBe(4); expect(new Set(ROUTES.map((r) => r.district)).size).toBe(4);
    for (const r of ROUTES) for (const [x, z] of [[r.start.x, r.start.z], ...r.gates]) expect(buildingAt(x, z)).toBeNull();
  });
  it('payout by place: winner takes prize + pot share, then shares, then nothing', () => {
    const p = [0, 1, 2, 3].map((i) => payout(canal, i, 5));
    expect(p[0]).toBe(canal.prize + Math.round(canal.buyIn * 5 * 0.6)); expect(p[0]).toBeGreaterThan(p[1]); expect(p[1]).toBeGreaterThan(p[2]); expect(p[3]).toBe(0);
  });
  it('rubber band eases leaders, pushes the trailing pack, clamped', () => {
    expect(rubberBand(60, 0.1)).toBeCloseTo(0.9); expect(rubberBand(-60, 0.1)).toBeCloseTo(1.1); expect(rubberBand(500, 0.1)).toBeCloseTo(0.9); expect(rubberBand(0, 0.1)).toBe(1);
  });
  it('progress grows toward each gate; skipping detects a missed checkpoint', () => {
    expect(progress(canal, 0, 0, -80)).toBeGreaterThan(progress(canal, 0, 0, -95)); expect(progress(canal, 1, 0, -60)).toBeGreaterThanOrEqual(1);
    expect(skipping(canal, 1, 0, -15 + 3)).toBe(false); // at the gate you owe
    expect(skipping(canal, 1, 0, 28)).toBe(true);        // rode past gate 2 (0,-15) without touching it, nearly at gate 3
    expect(GATE_R).toBeGreaterThan(4);
  });
});

describe('street races: flow', () => {
  it('Ⓐ at the start line enters (buy-in), 3 s countdown holds you, rivals line up, then GO', () => {
    const r = race();
    r.s.step(15); expect(snap(r.s).race).toMatchObject({ id: 'canal', state: 'countdown', field: 5 }); expect(snap(r.s).cash).toBe(100 - canal.buyIn);
    expect(snap(r.s).npcs.filter((n: any) => n.racer)).toHaveLength(4);
    r.s.step(60); expect(snap(r.s).race.state).toBe('countdown'); expect(Math.hypot(snap(r.s).rider.x - canal.start.x, snap(r.s).rider.z - canal.start.z)).toBeLessThan(0.5);
    expect(r.until((q) => q.race.state === 'racing', 3)).toBe(true); expect(r.evs.some((e) => e.type === 'raceGo')).toBe(true);
  });
  it('gates in order → finish → results, payout by place, best time saved per profile', () => {
    const r = race({ ftp: 1.25, diff: 2, gameData: { cash: 0 } });
    expect(r.until((q) => q.race?.state === 'done')).toBe(true);
    const q = snap(r.s), me = q.race.results.find((e: any) => e.you);
    expect(r.evs.filter((e) => e.type === 'checkpoint')).toHaveLength(canal.gates.length);
    expect(me.place).toBe(0); expect(me.time).toBeGreaterThan(10); expect(q.cash).toBe(100 - canal.buyIn + me.payout);
    expect(r.saved().raceBest.canal).toBeCloseTo(me.time, 1); expect(q.race.best).toBeCloseTo(me.time, 1);
    r.until((qq) => !qq.race, 10); expect(snap(r.s).npcs.some((n: any) => n.racer)).toBe(false); // field disperses
  });
  it('effort matters: on hard, ~0.6 FTP loses, ~FTP+ wins (rubber-banded rivals)', () => {
    const place = (ftp: number, diff: number) => { const r = race({ ftp, diff }); r.until((q) => q.race?.state === 'done'); return snap(r.s).race.results.find((e: any) => e.you).place; };
    expect(place(0.6, 2)).toBeGreaterThan(0); expect(place(1.25, 2)).toBe(0); expect(place(0.75, 1)).toBe(0);
  });
  it('no cash, no race', () => {
    const r = race({ cash: 5 }); r.s.step(20); expect(snap(r.s).race).toBeNull(); expect(r.evs.some((e) => e.type === 'raceBroke')).toBe(true);
  });
  it('heat rises while racing (cops come to watch)', () => {
    const r = race({ ftp: 0.8 }); r.until((q) => q.race?.state === 'racing'); r.s.step(30 * 10); expect(snap(r.s).heat).toBeGreaterThan(0.3);
  });
  it('quit by getting off: abandoned, no payout', () => {
    const r = race({ ftp: 0.8, tl: [...tap(0.3, 'a'), ...tap(6, 'a')], extra: { autoRace: false } });
    expect(r.until((q) => q.race?.state === 'done', 30)).toBe(true); expect(r.evs.some((e) => e.type === 'raceQuit')).toBe(true);
    expect(snap(r.s).race.results.find((e: any) => e.you).payout).toBe(0);
  });
  it('quit from the menu (receive quitRace)', () => {
    const r = race(); r.s.step(30 * 4); (r.s.sim as any).receive({ type: 'quitRace' }); expect(snap(r.s).race.state).toBe('done');
  });
  it('rivals can be knocked off by weapons, then remount', () => {
    const r = race({ ftp: 0.6, diff: 2, extra: { ammo: { bazooka: 5 }, startWeapon: 'bazooka', fireAt: [9, 12] } });
    let off = false, back = false;
    for (let i = 0; i < 30 * 30; i++) { r.s.step(1); const rs = snap(r.s).npcs.filter((n: any) => n.racer); if (rs.some((n: any) => !n.bike)) off = true; if (off && rs.every((n: any) => n.bike)) { back = true; break; } }
    expect(off).toBe(true); expect(back).toBe(true);
  });
  it('drafting: tucked in behind a rival gives a push', () => {
    const r = race({ ftp: 0.6, diff: 1 }); r.until((q) => q.race?.state === 'done');
    expect(snap(r.s).stats.draftS).toBeGreaterThan(0);
  });
  it('autopilot never races', () => {
    const r = race({ extra: { autopilot: true } }); r.s.step(30); expect(snap(r.s).race).toBeNull();
  });
});
