import { describe, expect, it } from 'vitest';
import { createGameSession, testProfile, TimelineInput } from '../../../core';
import { module } from '../index';
import { buildBike } from '../render/chars';
import { buildingAt, heightAt, onGrass } from '../sim/world';
import { DEALER, DEALER_STOCK, FENCE, fencePrice, HOT_PERIOD, hotList, TURF } from '../sim/crime';

const snap = (s: { sim: { snapshot(): unknown } }) => s.sim.snapshot() as any;
const tap = (t: number, b: string) => [{ t, press: b }, { t: t + 0.05, release: b }];
function mk(tl: any[], simOpts: Record<string, unknown>, script = 'idle', gameData?: Record<string, unknown>) {
  const p = testProfile(); if (gameData) (p.gameData as Record<string, unknown>).gtpedal = gameData;
  const evs: Array<{ type: string; data?: any }> = []; let saved: any = null;
  const s = createGameSession({ game: module, profile: p, input: new TimelineInput(tl as any), fake: { script }, seed: 1, onEmit: (e: any) => evs.push(e), onSave: (d: unknown) => { saved = d; }, simOpts: { cyclists: 0, trams: false, cops: false, ...simOpts } } as any);
  return { s, evs, saved: () => saved, run: (sec: number) => s.step(Math.round(sec * 30)) };
}

describe('fence / chop shop', () => {
  it('prices by type, flats pay less, hot-list pays a bonus; the hot list rotates deterministically', () => {
    expect(fencePrice('ebike', false, false)).toBeGreaterThan(fencePrice('city', false, false));
    expect(fencePrice('fixie', true, false)).toBeLessThan(fencePrice('fixie', false, false) * 0.6);
    expect(fencePrice('bmx', false, true)).toBeGreaterThan(fencePrice('bmx', false, false));
    const lists = Array.from({ length: 8 }, (_, i) => hotList(i * HOT_PERIOD + 1).join());
    expect(hotList(5).length).toBe(2); expect(hotList(5)).toEqual(hotList(6)); expect(new Set(lists).size).toBeGreaterThan(2);
  });
  it('ride a stolen bike in, stop, Ⓐ sells it: cash goes up and is saved', () => {
    const g = mk(tap(0.5, 'a'), { start: 'bike', startKind: 'ebike', spawn: { x: FENCE.x, z: FENCE.z, heading: 0 } }, 'idle', { cash: 25 });
    g.run(0.3); expect(snap(g.s).fence).toMatchObject({ near: true });
    const price = snap(g.s).fence.price;
    g.run(0.5);
    expect(snap(g.s).mode).toBe('foot'); expect(snap(g.s).cash).toBe(25 + price); expect(price).toBeGreaterThanOrEqual(160);
    expect(g.evs.some((e) => e.type === 'fenceSale')).toBe(true); expect(g.saved().cash).toBe(25 + price);
  });
  it('away from the fence Ⓐ just dismounts (nothing sold)', () => {
    const g = mk(tap(0.5, 'a'), { start: 'bike', spawn: { x: 0, z: -100, heading: 0 }, cash: 0 });
    g.run(1); expect(snap(g.s).mode).toBe('foot'); expect(snap(g.s).cash).toBe(0);
  });
});

describe('weapon dealer', () => {
  it('Ⓐ opens the menu, ◀ ▶ (or paddle taps) browse, Ⓐ buys if you can afford it, Ⓑ leaves', () => {
    const tl = [...tap(0.5, 'a'), ...tap(1, 'right'), ...tap(1.5, 'a'), { t: 2, paddleR: 1 }, { t: 2.1, paddleR: 0 }, ...tap(2.5, 'a'), ...tap(3, 'a'), ...tap(3.5, 'a'), ...tap(4, 'b')];
    const cash0 = DEALER_STOCK[1].price + DEALER_STOCK[2].price * 2;
    const g = mk(tl, { start: 'foot', spawn: { x: DEALER.x, z: DEALER.z, heading: 0 }, cash: cash0, ammo: { molotov: 0, oil: 0 } });
    g.run(0.8); expect(snap(g.s).dealer.menu).toMatchObject({ sel: 0 });
    g.run(0.5); expect(snap(g.s).dealer.menu.sel).toBe(1);
    g.run(0.5); expect(snap(g.s).cash).toBe(cash0 - DEALER_STOCK[1].price); expect(snap(g.s).ammo.molotov).toBe(DEALER_STOCK[1].qty);
    g.run(0.5); expect(snap(g.s).dealer.menu.sel).toBe(2); // paddle tap browses too
    g.run(1); expect(snap(g.s).ammo.oil).toBe(DEALER_STOCK[2].qty * 2); expect(snap(g.s).cash).toBe(0);
    g.run(0.5); expect(g.evs.some((e) => e.type === 'broke')).toBe(true); expect(snap(g.s).cash).toBe(0);
    g.run(0.6); expect(snap(g.s).dealer.menu).toBeNull(); expect(snap(g.s).stats.shots).toBe(0); // Ⓑ closed, didn't fire
  });
});

describe('witnesses', () => {
  const steal = (npcs: Array<{ x: number; z: number }>, extra: any[] = [], o: Record<string, unknown> = {}) =>
    mk([...tap(0.5, 'a'), ...extra], { start: 'foot', spawn: { x: 0, z: -100, heading: 0 }, npcs, bikesAt: [{ kind: 'city', x: 0.5, z: -99.5, heading: 0 }], ...o });
  it('a bystander who sees a steal gets on the phone; heat lands only when the call goes through', () => {
    const g = steal([{ x: 4, z: -94 }]);
    g.run(1); const q = snap(g.s);
    expect(q.mode).toBe('bike'); expect(q.npcs[0].callS).toBeGreaterThan(0); expect(q.heat).toBeLessThan(0.3);
    g.run(4); expect(snap(g.s).heat).toBeGreaterThan(0.6); expect(g.evs.some((e) => e.type === 'calledIn')).toBe(true);
  });
  it('unwitnessed crimes carry less heat', () => {
    const g = steal([{ x: 60, z: -40 }]); g.run(6);
    expect(snap(g.s).heat).toBeLessThan(0.3); expect(g.evs.some((e) => e.type === 'witness')).toBe(false);
  });
  it('knock the caller down before the call goes through and it fizzles', () => {
    const g = steal([{ x: 2, z: -88 }], [], { ammo: { bazooka: 3 }, startWeapon: 'bazooka', fireAt: [1.2] });
    g.run(6);
    expect(g.evs.some((e) => e.type === 'callStopped')).toBe(true); expect(g.evs.some((e) => e.type === 'calledIn')).toBe(false);
  });
});

describe('ambient reactions', () => {
  it('blast past pedestrians: they dodge and shout / flip you off; some heckle', () => {
    const g = mk([], { start: 'bike', spawn: { x: 0, z: -100, heading: 0 }, npcs: [{ x: 0.8, z: -70 }, { x: -0.8, z: -55 }] }, 'z2');
    g.run(12);
    expect(g.evs.some((e) => e.type === 'npcReact')).toBe(true);
    expect(g.evs.some((e) => e.type === 'heckle')).toBe(true);
  });
});

describe('rival gang', () => {
  it('cruises its turf, provoked when you ride in: chases, rams or lobs bottles', () => {
    const g = mk([], { start: 'bike', spawn: { x: TURF.x - TURF.r - 6, z: TURF.z, heading: Math.PI / 2 }, gang: true }, 'z2');
    g.run(0.5); expect(snap(g.s).gang).toMatchObject({ provoked: false, left: 4 });
    g.run(4); expect(snap(g.s).gang.provoked).toBe(true);
    g.run(12);
    expect(g.evs.some((e) => e.type === 'gangKnock' || e.type === 'gangThrow')).toBe(true);
  });
  it('fight back: knock them all off their bikes for cash + rep', () => {
    const g = mk([], { start: 'foot', spawn: { x: TURF.x, z: TURF.z, heading: 0 }, gang: true, cash: 0, ammo: { grenade: 99 }, startWeapon: 'grenade', fireAt: Array.from({ length: 60 }, (_, i) => 1 + i * 1.2) });
    for (let i = 0; i < 70 && !g.evs.some((e) => e.type === 'gangBeaten'); i++) g.run(1);
    for (let i = 0; i < 60 && !g.evs.some((e) => e.type === 'gangBeaten'); i++) g.run(1);
    expect(g.evs.some((e) => e.type === 'gangBeaten')).toBe(true); expect(snap(g.s).cash).toBeGreaterThanOrEqual(150); expect(snap(g.s).rep).toBeGreaterThanOrEqual(3);
  });
  it('the autopilot world has no gang / witnesses unless opted in', () => {
    const g = mk([], { autopilot: true, start: 'bike' }, 'z2'); g.run(1);
    expect(snap(g.s).npcs.some((n: any) => n.gang)).toBe(false);
  });
});

describe('Razor scooters', () => {
  const ride = (x: number, z: number, h: number, kind: string, sec = 8) => { const g = mk([], { start: 'bike', startKind: kind, spawn: { x, z, heading: h }, gang: false }, 'z2'); g.run(sec); return snap(g.s); };
  it('zippy but low top speed on paving; bogged down on grass', () => {
    const city = ride(0, -100, 0, 'city'), sc = ride(0, -100, 0, 'scooter');
    expect(sc.rider.kind).toBe('scooter'); expect(sc.rider.speed).toBeLessThan(city.rider.speed); expect(sc.rider.speed).toBeGreaterThan(3);
    let gx = 0, gz = 0; // find an open lawn
    outer: for (let x = 130; x < 190; x += 3) for (let z = -100; z < 100; z += 3) if (onGrass(x, z) && onGrass(x, z + 25) && !buildingAt(x, z) && !buildingAt(x, z + 25) && Math.abs(heightAt(x, z) - heightAt(x, z + 20)) < 0.3) { gx = x; gz = z; break outer; }
    expect(gx).not.toBe(0);
    const grass = ride(gx, gz, 0, 'scooter', 5), paved = ride(0, -100, 0, 'scooter', 5);
    expect(grass.rider.speed).toBeLessThan(paved.rider.speed * 0.6);
  });
  it('turns tighter than a bike', () => {
    const turn = (kind: string) => { const g = mk([{ t: 3, paddleL: 1 }, { t: 4, paddleL: 0 }], { start: 'bike', startKind: kind, spawn: { x: 0, z: -100, heading: 0 }, gang: false }, 'z2'); g.run(3); const h0 = snap(g.s).rider.heading; g.run(1); return Math.abs(snap(g.s).rider.heading - h0); };
    expect(turn('scooter')).toBeGreaterThan(turn('city'));
  });
  it('scooter riders are in traffic and can be jacked; the rival gang rides scooters', () => {
    const g = mk(tap(0.3, 'a'), { start: 'foot', spawn: { x: 0, z: -100, heading: 0 }, cyclistsAt: [{ x: 0.8, z: -99.5, kind: 'scooter', line: 0, dir: 1, cruise: 0.5 }] });
    g.run(2); expect(snap(g.s).mode).toBe('bike'); expect(snap(g.s).rider.kind).toBe('scooter');
    const gg = mk([], { start: 'bike', spawn: { x: 0, z: -100, heading: 0 }, gang: true }); gg.run(0.2);
    expect(snap(gg.s).npcs.filter((n: any) => n.gang).every((n: any) => n.bike === 'scooter')).toBe(true);
  });
  it('the scooter model is cheap and has a kicking foot target', () => {
    const b = buildBike('scooter'); let n = 0; b.root.traverse((q) => { if ((q as any).isMesh) n++; });
    expect(n).toBeLessThanOrEqual(8); expect(b.pedals).toHaveLength(2); expect(b.cranks).toHaveLength(0);
  });
});
