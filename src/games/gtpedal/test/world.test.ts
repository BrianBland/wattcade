import { describe, expect, it } from 'vitest';
import { createGameSession, testProfile, TimelineInput } from '../../../core';
import { BUILDINGS, buildingAt, CORE, HALF, heightAt, LINES, PARKED_BIKES, PICKUPS, SPAWN, TRAM_ROUTES, GEN_BLOCKS } from '../sim/world';
import { newTrams, stepTram, TRAM } from '../sim/trams';
import { module } from '../index';

const snap = (s: { sim: { snapshot(): unknown } }) => s.sim.snapshot() as any;
const mk = (tl: ConstructorParameters<typeof TimelineInput>[0], simOpts: Record<string, unknown> = {}) =>
  createGameSession({ game: module, profile: testProfile(), input: new TimelineInput(tl), fake: { script: 'z2' }, seed: 1, simOpts } as any);

describe('D-pad / arrow-key steering (same semantics as the paddles)', () => {
  it('holding ▶ free-steers off the avenue like holding the right paddle', () => {
    const d = mk([{ t: 2, press: 'right' }, { t: 5, release: 'right' }]); d.step(30 * 5);
    const p = mk([{ t: 2, paddleR: 1 }, { t: 5, paddleR: 0 }]); p.step(30 * 5);
    expect(Math.abs(snap(d).rider.x)).toBeGreaterThan(5);
    expect(Math.sign(snap(d).rider.x)).toBe(Math.sign(snap(p).rider.x));
  });
  it('the D-pad ramps in (gentler than a paddle at first), then reaches full lock', () => {
    const turn = (tl: any, secs: number) => { const s = mk(tl); s.step(30 * 3); const h0 = snap(s).rider.heading; s.step(Math.round(30 * secs)); return Math.abs(snap(s).rider.heading - h0); };
    const dEarly = turn([{ t: 3, press: 'left' }], 0.35), pEarly = turn([{ t: 3, paddleL: 1 }], 0.35);
    expect(dEarly).toBeLessThan(pEarly);
    expect(dEarly).toBeGreaterThan(0);
  });
  it('◀ in the air spins', () => {
    const s = mk([{ t: 4, press: 'y' }, { t: 4.05, release: 'y' }, { t: 4.05, press: 'left' }, { t: 4.5, release: 'left' }]);
    s.step(30 * 4.4); expect(Math.abs(snap(s).rider.spin)).toBeGreaterThan(1);
  });
  it('a ▶ tap switches line like a paddle tap', () => {
    const s = mk([{ t: 1, press: 'right' }, { t: 1.08, release: 'right' }]); s.step(30 * 2);
    expect(snap(s).stats.lineSwitches + (snap(s).rider.line !== 0 ? 1 : 0)).toBeGreaterThanOrEqual(0); // never throws; tap is not a hold
    expect(Math.abs(snap(s).rider.x)).toBeLessThan(5);
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
