import { describe, expect, it } from 'vitest';
import { createGameSession, testProfile, TimelineInput } from '../../../core';
import { module } from '../index';
import { alignAt, FLIGHT_DEFAULTS, FLIGHT_START, flapPhase, inRibbon, reentryView, ribbonAt, ribbonFactor, steerFrom, stepFlight, WINGS } from '../sim/flight';
import { STORY } from '../sim/story';
import type { FlightView, SeasideSave, SeasideSnapshot } from '../sim/types';
import { CYPRESS, cypressAt, flightShot, glideAt, glideCam, LAND_S, WINGS_LEN } from '../render/flightShots';
import { rideCam, rideSpan } from '../render/morningShots';

const T = FLIGHT_DEFAULTS;
const held = (...b: string[]) => ({ paddleL: 0, paddleR: 0, held: new Set(b) });
const near = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, eps = 1e-6) =>
  expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeLessThan(eps);

describe('wing flight (#194)', () => {
  it('steers from paddles, keys and touch alike', () => {
    expect(steerFrom({ paddleL: 0, paddleR: 0.6, held: new Set() })).toBeCloseTo(0.6);
    expect(steerFrom(held('left'))).toBe(-1);
    expect(steerFrom({ paddleL: 1, paddleR: 0, held: new Set(['right']) })).toBe(0);
    expect(steerFrom({ paddleL: 0, paddleR: 1, held: new Set(['right']) })).toBe(1);
  });

  it('banks you across the line of flight, and draws you onto the road at the end whatever you do', () => {
    let s = FLIGHT_START;
    for (let i = 0; i < 60; i++) s = stepFlight(s, 1, 0.2, 12, 1 / 30, T);
    expect(s.bank).toBeGreaterThan(0.4);
    expect(s.x).toBeGreaterThan(3);
    for (let i = 0; i < 600; i++) s = stepFlight(s, 1, 0.2, 12, 1 / 30, T);
    expect(s.x).toBeLessThanOrEqual(WINGS.reach);
    // holding the bank right through the landing still lands you on the road
    for (let p = 0.8; p <= 1; p += 0.0005) s = stepFlight(s, 1, p, 12, 1 / 30, T);
    expect(Math.abs(s.x)).toBeLessThan(0.5);
    expect(Math.abs(s.bank)).toBeLessThan(0.01);
  });

  it('weaves the ribbon, fading onto the road; missing it only slows the glide', () => {
    const xs = Array.from({ length: 50 }, (_, i) => ribbonAt(i / 60));
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(40);
    expect(Math.abs(ribbonAt(1))).toBe(0);
    expect(alignAt(1)).toBe(1);
    expect(inRibbon(ribbonAt(0.3) + T.ribbonHalf - 0.1, 0.3, T)).toBe(true);
    expect(inRibbon(ribbonAt(0.3) + T.ribbonHalf + 0.1, 0.3, T)).toBe(false);
    expect(ribbonFactor(true, 0.3, T)).toBeCloseTo(1 + T.ribbonBoost);
    expect(ribbonFactor(false, 0.3, T)).toBeCloseTo(T.offRibbon);
    expect(ribbonFactor(false, 1, T)).toBe(1);
    expect(T.offRibbon).toBeGreaterThan(0.5);
  });

  it('beats the wings with the crank', () => {
    expect(flapPhase(0, 2)).toBe(0);
    expect(flapPhase(3, 2)).toBeCloseTo(0.5);
    expect(flapPhase(4.5, 2)).toBeCloseTo(0.25);
  });

  it('re-entry: the fire builds, the sprint grows the wings, then the cloud deck and out under it', () => {
    const sp = { atS: 6, planS: 25 };
    const a = reentryView(1, sp, null, 0, null), b = reentryView(5, sp, null, 0, null);
    expect(b.fire).toBeGreaterThan(a.fire);
    const mid = reentryView(18, sp, { t: 12.5, durS: 25 }, 1.2, null), weak = reentryView(18, sp, { t: 12.5, durS: 25 }, 0.3, null);
    expect(mid.wings).toBeCloseTo(0.5);
    expect(mid.fire).toBeGreaterThan(weak.fire);
    expect(weak.fire).toBeGreaterThan(0.5); // can't fail: effort only scales it
    const after = reentryView(40, sp, null, 0, 1);
    expect(after.wings).toBe(1);
    expect(after.fire).toBeLessThan(0.5);
    expect(reentryView(44, sp, null, 0, 1).cloud).toBeGreaterThan(0.4);
    const end = reentryView(60, sp, null, 0, 1);
    expect(end).toMatchObject({ cloud: 0, out: 1, fire: 0 });
  });
});

describe('flight camera (#194)', () => {
  const wings = (p: number, x = 0): Parameters<typeof flightShot>[0] => ({
    sceneId: 'wings', speed: 14, scene: { progress: p },
    flight: { phase: 'wings', x, bank: 0, ribbon: 0, inRibbon: true, flap: 0, down: true, align: alignAt(p) } as FlightView,
  });

  it('touches down exactly on the Sunset ride’s camera', () => {
    const shot = flightShot(wings(1, 20))!;
    const cam = rideCam(LAND_S);
    near(shot.eye, cam.eye); near(shot.target, cam.target);
    expect(rideSpan('sunset')![0]).toBe(LAND_S);
    const sunset = STORY.find((s) => s.id === 'sunset')!;
    expect(rideSpan('sunset')![1] - LAND_S).toBeCloseTo((sunset.length as { m: number }).m);
    expect(LAND_S - WINGS_LEN).toBeGreaterThan(0);
  });

  it('skims the cypress on the cliff edge, whatever the steering', () => {
    const c = cypressAt();
    for (const x0 of [-60, 0, 60]) {
      // banked hard away the whole time, at the scene's pace (two minutes of glide)
      let f = { x: x0, bank: 0 };
      for (let p = 0.8; p < CYPRESS.p; p += 1 / (120 * 30)) f = stepFlight(f, Math.sign(x0), p, 14, 1 / 30, T);
      const at = glideAt(CYPRESS.p, f.x);
      expect(Math.hypot(at.x - c.x, at.z - c.z)).toBeLessThan(1);
      expect(at.y - (c.y + CYPRESS.height)).toBeCloseTo(CYPRESS.clear, 3);
    }
  });

  it('re-entry falls onto the glide’s first pose', () => {
    const re = { phase: 'reentry', ...reentryView(60, { atS: 6, planS: 25 }, null, 0, 1) } as FlightView;
    const shot = flightShot({ sceneId: 'reentry', speed: 0, scene: { progress: 1 }, flight: re })!;
    const g = glideCam(0, 0);
    near(shot.eye, g.eye, 1e-3); near(shot.target, g.target, 1e-3);
    expect(shot.fx.terrain).toBe(true);
  });

  it('flies over the sea, high, before swinging in over the cliff', () => {
    const early = glideAt(0.1), late = glideAt(0.99);
    expect(early.y).toBeGreaterThan(late.y + 200);
    for (let p = 0; p <= 1; p += 0.02) expect([glideAt(p).x, glideAt(p).y, glideAt(p).z].every(Number.isFinite)).toBe(true);
  });
});

describe('flight in the sim (#194)', () => {
  const at = (sceneId: string, timeline: ConstructorParameters<typeof TimelineInput>[0] = []) => {
    const save: SeasideSave = { v: 1, rides: 0, chapterSelect: false, checkpoint: { sceneId, progress: 0 } };
    const s = createGameSession({ game: module, profile: testProfile({ gameData: { seaside: save } }), input: new TimelineInput(timeline), fake: { script: 'z2' }, seed: 1, simOpts: { skipMenu: true } });
    return { s, snap: () => s.sim.snapshot() as SeasideSnapshot };
  };

  it('banking right carries you across; the wings still land and hand over to the Sunset ride untouched', () => {
    const r = at('wings', [{ t: 0.5, press: 'right' }]);
    r.s.step(30 * 10);
    const f = r.snap().flight;
    expect(f?.phase).toBe('wings');
    expect(f && f.phase === 'wings' && f.x).toBeGreaterThan(10);
    const idle = at('wings');
    let guard = 0;
    while (idle.snap().sceneId === 'wings' && guard++ < 30 * 60 * 6) idle.s.step(30);
    expect(idle.snap().sceneId).toBe('sunset');
  });

  it('re-entry reports the fire, and finishes on its own', () => {
    const r = at('reentry');
    r.s.step(30 * 5);
    const f = r.snap().flight;
    expect(f?.phase).toBe('reentry');
    expect(f && f.phase === 'reentry' && f.fire).toBeGreaterThan(0.5);
    let guard = 0;
    while (r.snap().sceneId === 'reentry' && guard++ < 30 * 60 * 3) r.s.step(30);
    expect(r.snap().sceneId).toBe('wings');
  });
});
