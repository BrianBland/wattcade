import { describe, expect, it } from 'vitest';
import { createGameSession, testProfile, TimelineInput } from '../../../core';
import { boxTop, HEDGES, KICKERS, OBSTACLES, TREES, BUILDINGS, buildingAt, CORE, HALF, heightAt, LINES, PARKED_BIKES, PICKUPS, SPAWN, TRAM_ROUTES, GEN_BLOCKS } from '../sim/world';
import { newTrams, stepTram, TRAM } from '../sim/trams';
import { module } from '../index';

const snap = (s: { sim: { snapshot(): unknown } }) => s.sim.snapshot() as any;
const mk = (tl: ConstructorParameters<typeof TimelineInput>[0], simOpts: Record<string, unknown> = {}) =>
  createGameSession({ game: module, profile: testProfile(), input: new TimelineInput(tl), fake: { script: 'z2' }, seed: 1, simOpts } as any);

describe('steering: paddles = handlebars, D-pad = locks', () => {
  it('paddles are proportional: a half paddle turns less than a full one, and nothing snaps you back', () => {
    const turn = (v: number) => { const s = mk([{ t: 2, paddleL: v }, { t: 2.6, paddleL: 0 }], { cyclists: 0 }); s.step(30 * 2); const h0 = snap(s).rider.heading; s.step(30 * 3); return { dh: Math.abs(snap(s).rider.heading - h0), r: snap(s).rider }; };
    const half = turn(0.5), full = turn(1);
    expect(half.dh).toBeGreaterThan(0.1); expect(full.dh).toBeGreaterThan(half.dh * 1.4);
    expect(full.r.line).toBe(-1); // released paddle: no line re-acquired
  });
  it('a ▶ tap locks the line ahead and the bike rides it hands-off; taps cycle; paddle cancels', () => {
    const s = mk([{ t: 1, press: 'right' }, { t: 1.05, release: 'right' }], { cyclists: 0 });
    s.step(30 * 1.2); expect(snap(s).steerLock).toEqual({ kind: 'line', id: 0 });
    s.step(30 * 4); expect(Math.abs(snap(s).rider.x)).toBeLessThan(1.5); expect(snap(s).steerLock?.kind).toBe('line');
  });
  it('D-pad cycles line → cyclist ahead, then chases the locked cyclist', () => {
    const s = mk([{ t: 1.5, press: 'right' }, { t: 1.55, release: 'right' }, { t: 1.8, press: 'right' }, { t: 1.85, release: 'right' }], { cyclists: 0, cyclistsAt: [{ x: -1.2, z: -80, kind: 'bmx', line: 0, dir: 1, cruise: 3 }] });
    s.step(30 * 1.6); expect(snap(s).steerLock?.kind).toBe('line');
    s.step(30 * 0.4); expect(snap(s).steerLock).toMatchObject({ kind: 'npc', id: 2000 });
    const gap = () => { const q = snap(s), n = q.npcs.find((m: any) => m.id === 2000); return Math.hypot(n.x - q.rider.x, n.z - q.rider.z); };
    const g0 = gap(); s.step(30 * 2); expect(gap()).toBeLessThan(g0);
  });
  it('with nothing to lock onto, held arrows are plain (ramped) steering', () => {
    const s = mk([{ t: 1, press: 'left' }, { t: 2.5, release: 'left' }], { cyclists: 0, spawn: { x: -100, z: 62, heading: 0 } });
    s.step(30); const h0 = snap(s).rider.heading; s.step(30 * 1.5);
    expect(snap(s).steerLock).toBeNull(); expect(Math.abs(snap(s).rider.heading - h0)).toBeGreaterThan(0.5);
  });
  it('D-pad does not spin in the air (paddles do)', () => {
    const s = mk([{ t: 4, press: 'y' }, { t: 4.05, release: 'y' }, { t: 4.05, press: 'left' }, { t: 4.5, release: 'left' }], { cyclists: 0 });
    s.step(30 * 4.4); expect(Math.abs(snap(s).rider.spin)).toBeLessThan(0.01);
  });
});

describe('on foot: power = walk/jog/run', () => {
  const run = (script: string) => { const s = createGameSession({ game: module, profile: testProfile(), input: new TimelineInput([]), fake: { script }, seed: 1, simOpts: { cyclists: 0, npcs: [], spawn: { x: -100, z: 62, heading: 0, mode: 'foot' } } } as any); s.step(30 * 4); const r = snap(s).rider; return Math.hypot(r.x + 100, r.z - 62); };
  it('zero power stands still; more power runs further', () => {
    expect(run('idle')).toBeLessThan(0.01);
    expect(run('sprints')).toBeGreaterThan(0); expect(run('z2')).toBeGreaterThan(4);
  });
});

describe('bike-jacking + NPC cyclists', () => {
  it('A next to a moving cyclist yanks them off and you ride away on their bike (heat, angry NPC)', () => {
    const s = mk([{ t: 0.1, press: 'a' }, { t: 0.15, release: 'a' }], { npcs: [], cyclistsAt: [{ x: 1, z: -97, kind: 'cargo', line: 0, dir: 1 }], spawn: { x: 0, z: -98, heading: 0, mode: 'foot' } });
    s.step(6); const a = snap(s);
    expect(a.mode).toBe('bike'); expect(a.rider.kind).toBe('cargo'); expect(a.stats.jacks).toBe(1); expect(a.heat).toBeGreaterThan(0);
    const victim = a.npcs.find((n: any) => n.id === 2000); expect(victim.bike).toBeNull(); expect(victim.angryS).toBeGreaterThan(0); expect(victim.airS).toBeGreaterThan(0);
  });
  it('cyclists go about their business deterministically and keep moving', () => {
    const go = () => { const s = mk([], { cops: false }); s.step(30 * 20); return snap(s).npcs.filter((n: any) => n.bike).map((n: any) => [n.x, n.z]); };
    const a = go(), b = go(); expect(a).toEqual(b); expect(a.length).toBeGreaterThan(10);
    const s = mk([], { cops: false }); s.step(30); const p0 = snap(s).npcs.filter((n: any) => n.bike); s.step(30 * 5); const p1 = snap(s).npcs.filter((n: any) => n.bike);
    const moved = p0.filter((n: any) => { const m = p1.find((q: any) => q.id === n.id); return m && Math.hypot(n.x - m.x, n.z - m.z) > 5; }).length; expect(moved).toBeGreaterThan(p0.length * 0.6);
  });
  it('a cyclist knocked off (here by a tram) leaves the bike lying for anyone to take', () => {
    const s = mk([], { npcs: [], cyclistsAt: [{ x: -160, z: TRAM_ROUTES[0].z + 0.75, kind: 'bmx', line: 2, dir: -1 }], spawn: { x: 0, z: -100, heading: 0 }, cops: false });
    const b0 = snap(s).bikes.length; s.step(30 * 15);
    expect(snap(s).stats.cyclistsKnocked).toBeGreaterThanOrEqual(1); expect(snap(s).bikes.length).toBeGreaterThan(b0);
  });
});

describe('bigger map', () => {
  it('is ~2.8x the old area with districts outside the core and walkable streets', () => {
    expect((HALF * 2) ** 2 / (CORE * 2) ** 2).toBeGreaterThan(2.5);
    expect(GEN_BLOCKS.some((b) => b.kind === 'rowhouses') && GEN_BLOCKS.some((b) => b.kind === 'stall') && GEN_BLOCKS.some((b) => b.kind === 'villa')).toBe(true);
    expect(heightAt(-190, 60)).toBeGreaterThan(12); // hillside
    for (const l of LINES) if (l.kind !== 'ramp') for (const [x, z] of l.pts) expect(buildingAt(x, z), `line ${l.id} @${x},${z}`).toBeNull();
    for (const r of TRAM_ROUTES) for (let x = r.x0 - TRAM.len / 2; x <= r.x1 + TRAM.len / 2; x += 1) for (const dz of [-1.6, 0, 1.6]) expect(buildingAt(x, r.z + dz), `tram ${r.id} @${x}`).toBeNull();
    for (const p of [...PARKED_BIKES, ...PICKUPS, SPAWN]) expect(buildingAt(p.x, p.z)).toBeNull();
    expect(BUILDINGS.length).toBeGreaterThan(30);
  });
});

describe('trams', () => {
  it('shuttle deterministically, ease into every stop, dwell, and turn back at the ends', () => {
    const run = () => { const ts = newTrams(); const stops: number[] = []; let flips = 0, last = ts[0].dir; for (let i = 0; i < 30 * 240; i++) { for (const t of ts) stepTram(t, 1 / 30); const t0 = ts[0]; if (t0.dwell > 0 && (!stops.length || stops[stops.length - 1] !== t0.x)) stops.push(t0.x); if (t0.dir !== last) { flips++; last = t0.dir; } } return { stops, flips, x: ts.map((t) => t.x) }; };
    const a = run(), b = run();
    expect(a).toEqual(b);
    for (const s of TRAM_ROUTES[0].stops) expect(a.stops).toContain(s);
    expect(a.flips).toBeGreaterThanOrEqual(1);
  });
  it('a moving tram knocks you off head-on', () => {
    const s = mk([], { spawn: { x: -165, z: 18, heading: -Math.PI / 2 }, cops: false });
    let hit = false; for (let i = 0; i < 30 * 15 && !hit; i++) { s.step(1); hit = snap(s).stats.tramHits > 0; }
    expect(hit).toBe(true);
  });
  it('holding Z behind the rear bumper hitches a ride', () => {
    const s = mk([{ t: 0.05, press: 'z' }], { spawn: { x: -195.8, z: 18, heading: Math.PI / 2 }, cops: false });
    s.step(30 * 6);
    expect(snap(s).stats.hitches).toBeGreaterThanOrEqual(1);
    expect(snap(s).rider.x).toBeGreaterThan(-185);
  });
  it('launches pedestrians it runs into', () => {
    const s = mk([], { spawn: { x: 0, z: -100, heading: 0 }, npcs: [{ x: -140, z: 18 }], cops: false });
    s.step(30 * 40);
    expect(snap(s).stats.launches).toBeGreaterThanOrEqual(1);
  });
  it('appear in the snapshot', () => { const s = mk([]); s.step(30); expect(snap(s).trams.length).toBe(TRAM_ROUTES.length); });
});

describe('round 6: traffic, tram surfing, solid scenery, lines', () => {
  it('Y right alongside a tram is a boosted hop that lands you on the roof (tram surfing)', () => {
    const r = TRAM_ROUTES[1], s = mk([{ t: 0.3, press: 'y' }, { t: 0.35, release: 'y' }], { cyclists: 0, npcs: [], cops: false, spawn: { x: r.x1 - 3, z: r.z + TRAM.w / 2 + 1.2, heading: -Math.PI / 2 } });
    s.step(8); expect(snap(s).tramHopReady).toBe(true);
    s.step(30 * 2.5);
    expect(snap(s).onTram).toBe(true); expect(snap(s).stats.tramRides).toBe(1); expect(snap(s).stats.crashes).toBe(0);
    expect(snap(s).rider.y).toBeGreaterThan(heightAt(snap(s).rider.x, snap(s).rider.z) + TRAM.roof - 0.1);
  });
  it('a plain hop away from trams is still a small hop', () => {
    const s = mk([{ t: 1, press: 'y' }, { t: 1.05, release: 'y' }], { cyclists: 0, trams: false }); s.step(30); expect(snap(s).tramHopReady).toBe(false);
    let top = 0; for (let i = 0; i < 30; i++) { s.step(1); top = Math.max(top, snap(s).rider.y); } expect(top).toBeLessThan(2);
  });
  it('trees and hedges are solid: you bonk/crash instead of riding through, on a slope too', () => {
    expect(TREES.length).toBeGreaterThan(150); expect(HEDGES.length).toBeGreaterThan(20);
    const t = TREES.find((q) => q.seed >= 0 && Math.abs(q.x) < 150 && Math.abs(q.z) < 150 && !buildingAt(q.x - 12, q.z) && [2, 4, 6, 8, 10, 12].every((d) => !buildingAt(q.x - d, q.z) || buildingAt(q.x - d, q.z) === buildingAt(q.x, q.z)))!;
    const box = buildingAt(t.x, t.z)!; expect(box).toBeTruthy(); expect(boxTop(box)).toBeGreaterThan(heightAt(t.x, t.z) + 3);
    const s = mk([], { cyclists: 0, npcs: [], cops: false, trams: false, spawn: { x: t.x - 12, z: t.z, heading: Math.PI / 2 } });
    let inside = false; for (let i = 0; i < 30 * 5; i++) { s.step(1); const q = snap(s); if (q.rider.x > box.x0 && q.rider.x < box.x1 && q.rider.z > box.z0 && q.rider.z < box.z1) inside = true; }
    expect(inside).toBe(false); expect(snap(s).rider.x).toBeLessThan(t.x + 3);
    expect(OBSTACLES.every((o) => !LINES.some((l) => l.kind === 'path' && l.pts.some(([x, z]) => x > o.x0 && x < o.x1 && z > o.z0 && z < o.z1)))).toBe(true);
  });
  it('traffic is recycled around you: lively near the rider wherever you go', () => {
    const s = mk([], { cops: false, spawn: { x: 0, z: 124, heading: Math.PI / 2 } });
    s.step(30 * 40); const q = snap(s), near = (b: boolean) => q.npcs.filter((n: any) => !!n.bike === b && Math.hypot(n.x - q.rider.x, n.z - q.rider.z) < 100).length;
    expect(near(true)).toBeGreaterThanOrEqual(14); expect(near(false)).toBeGreaterThanOrEqual(8);
  });
  it('districts got more lines: kickers, quay copings, stoop ledges, market rail, hillside jumps; more crates', () => {
    expect(KICKERS.length).toBeGreaterThanOrEqual(12); expect(LINES.filter((l) => l.kind === 'rail').length).toBeGreaterThanOrEqual(9);
    expect(PICKUPS.length).toBeGreaterThanOrEqual(12);
    expect(KICKERS.filter((k) => k.x < -110).some((k) => heightAt(k.x, k.z) > 1)).toBe(true); // a jump on the hillside
    LINES.forEach((l, i) => expect(l.id).toBe(i));
  });
  it('a jacked victim tumbles ahead of you (in shot), then chases / shakes a fist', () => {
    const s = mk([{ t: 0.1, press: 'a' }, { t: 0.15, release: 'a' }], { cyclists: 0, npcs: [], cops: false, cyclistsAt: [{ x: 1, z: -97, kind: 'bmx', line: 0, dir: 1, cruise: 3 }], spawn: { x: 0, z: -98, heading: 0 } });
    s.step(6); expect(snap(s).stats.jacks).toBe(1);
    s.step(12); const q = snap(s), v = q.npcs.find((n: any) => n.id === 2000), fx = Math.sin(q.rider.heading), fz = Math.cos(q.rider.heading);
    expect((v.x - q.rider.x) * fx + (v.z - q.rider.z) * fz).toBeGreaterThan(-0.5); // not behind the camera
    s.step(30 * 3); expect(snap(s).npcs.find((n: any) => n.id === 2000).angryS).toBeGreaterThan(0);
  });
});
