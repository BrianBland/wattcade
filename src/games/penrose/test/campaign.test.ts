import { describe, expect, it } from 'vitest';
import { FIXED_DT } from '../../../contracts';
import { createGameSession, NullInput, runHeadless, testProfile } from '../../../core';
import { module } from '..';
import { scenarios } from '../scenarios';
import { getLevelDef, LEVEL_CATALOG, LEVEL_COUNT } from '../sim/catalog';
import { SimWorld } from '../sim/world';
import type { BikeInput, PenroseSnapshot, SimTunables } from '../sim/types';

const DEFAULT_TUN: SimTunables = {
  gradeBase: 1, gradePerLoad: 4.5, gradeSlopeMax: 3, gradeWindHead: 2.5, gradeWindTail: 1.5,
  effortAtFtp: 160, seesawHoldFtp: 0.68, seesawPeakFtp: 1.02, beamPushFtp: 0.96, surgeRpm: 86,
  wheelSpeedBase: 1.85, wheelSpeedMin: 0.78, wheelSpeedMax: 1.3, autoLatch: true,
};

function runLevel(index: number, autopilot: boolean, maxSecs: number): { outcome: string; falls: number; secs: number } {
  const def = getLevelDef(index);
  let won = false, falls = 0;
  const world = new SimWorld(def, def.build(), {
    onWon: () => { won = true; },
    onFell: () => { falls++; },
  });
  world.autopilot = autopilot;
  const bike: BikeInput = { cadence: 80, ftpFraction: 0.72, sprinting: false, gearScale: 1, ergMode: false, nudge: 0 };
  const steps = Math.round(maxSecs / FIXED_DT);
  for (let i = 0; i < steps; i++) {
    world.step(FIXED_DT, bike, 0, DEFAULT_TUN);
    if (won) return { outcome: 'won', falls, secs: +(i * FIXED_DT).toFixed(1) };
    if (world.state === 'restart') return { outcome: 'fell', falls, secs: +(i * FIXED_DT).toFixed(1) };
  }
  return { outcome: 'play', falls, secs: maxSecs };
}

describe('penrose campaign — every level solves deterministically in Node', () => {
  for (let i = 0; i < LEVEL_COUNT; i++) {
    const entry = LEVEL_CATALOG[i];
    it(`L${i + 1} (${entry.item}) solves cleanly on autopilot`, () => {
      const r = runLevel(i, true, 180);
      expect(r.outcome, `${entry.item} ended with ${r.outcome} at ${r.secs}s (falls=${r.falls})`).toBe('won');
      expect(r.falls, `${entry.item} should solve without falling`).toBe(0);
    });
  }

  it('all campaign levels survive 60s of steady 80 rpm cruising without falling', () => {
    // Passive-cadence/effort levels that intentionally exit on default 80 rpm (n-pool calm, seesaw resting) are checked separately
    const allowExit = new Set(['seesaw']);
    const failures: string[] = [];
    for (let i = 0; i < LEVEL_COUNT; i++) {
      const entry = LEVEL_CATALOG[i];
      if (allowExit.has(entry.item)) continue;
      const r = runLevel(i, false, 60);
      if (r.outcome === 'fell' || r.falls > 0) failures.push(`${entry.item}: ${r.outcome} (${r.falls} falls at ${r.secs}s)`);
    }
    expect(failures).toEqual([]);
  });
});

describe('penrose headless scenarios', () => {
  for (const sc of scenarios) {
    it(`scenario: ${sc.name}`, () => {
      const r = runHeadless({ game: module, script: sc.script, minutes: sc.minutes, seed: sc.seed, simOpts: sc.simOpts });
      const failures = sc.assert(r.summary, r.stats, { mixerCommands: r.mixerCommands, isOver: r.isOver, events: r.events });
      expect(failures).toEqual([]);
    });
  }
});

describe('penrose bike physics & ergonomics (Phase 1)', () => {
  it('auto-latches 2-position turntable and drops resistance on lock', () => {
    const def = getLevelDef(0); // turntable
    const world = new SimWorld(def, def.build(), { onWon: () => {}, onFell: () => {} });
    const bike: BikeInput = { cadence: 85, ftpFraction: 0.75, sprinting: false, gearScale: 1, ergMode: false, nudge: 0 };
    expect(world.toggleMachine('y', 0, DEFAULT_TUN)).toBe(true);
    expect(world.built.machines[0].on).toBe(true);

    let peakLoad = 0;
    let latched = false;
    for (let i = 0; i < 180; i++) {
      world.step(FIXED_DT, bike, 0, DEFAULT_TUN);
      if (world.lastLoad > peakLoad) peakLoad = world.lastLoad;
      if (!world.built.machines[0].on) { latched = true; break; }
    }
    expect(peakLoad).toBeGreaterThan(0.4);
    expect(latched).toBe(true);
    expect(Math.abs(world.built.machines[0].value - -90)).toBeLessThan(0.5);
    expect(world.lastLoad).toBe(0);
    expect(world.recentEvents().some((e) => e.kind === 'latch')).toBe(true);
  });

  it('see-saw uses FTP-relative effort (not fake gear power) and supports ERG cadence surge', () => {
    const idx = LEVEL_CATALOG.findIndex((e) => e.item === 'seesaw');
    const def = getLevelDef(idx);
    // Low FTP (0.55) even with high gearScale (1.35) must NOT tip the see-saw
    const wLow = new SimWorld(def, def.build(), { onWon: () => {}, onFell: () => {} });
    wLow.built.machines[0].on = true;
    const lowBike: BikeInput = { cadence: 75, ftpFraction: 0.55, sprinting: false, gearScale: 1.35, ergMode: false, nudge: 0 };
    for (let i = 0; i < 120; i++) wLow.step(FIXED_DT, lowBike, 0, DEFAULT_TUN);
    expect(wLow.built.machines[0].progress).toBeLessThan(0.2);

    // High FTP (1.20) even with low gearScale (0.75) MUST tip the see-saw
    const wHigh = new SimWorld(def, def.build(), { onWon: () => {}, onFell: () => {} });
    wHigh.built.machines[0].on = true;
    const highBike: BikeInput = { cadence: 85, ftpFraction: 1.20, sprinting: true, gearScale: 0.75, ergMode: false, nudge: 0 };
    for (let i = 0; i < 180; i++) wHigh.step(FIXED_DT, highBike, 0, DEFAULT_TUN);
    expect(wHigh.built.machines[0].progress).toBeGreaterThan(0.95);

    // ERG mode at 0.75 FTP with cadence surge (92 rpm) MUST also tip the see-saw!
    const wErg = new SimWorld(def, def.build(), { onWon: () => {}, onFell: () => {} });
    wErg.built.machines[0].on = true;
    const ergBike: BikeInput = { cadence: 92, ftpFraction: 0.75, sprinting: false, gearScale: 1.0, ergMode: true, nudge: 0 };
    for (let i = 0; i < 180; i++) wErg.step(FIXED_DT, ergBike, 0, DEFAULT_TUN);
    expect(wErg.built.machines[0].progress).toBeGreaterThan(0.95);
  });

  it('wheel gracefully pauses when rider stops pedaling (cadence = 0)', () => {
    const def = getLevelDef(0);
    const world = new SimWorld(def, def.build(), { onWon: () => {}, onFell: () => {} });
    // Let spawn finish at 80 rpm
    const pedaling: BikeInput = { cadence: 80, ftpFraction: 0.75, sprinting: false, gearScale: 1, ergMode: false, nudge: 0 };
    for (let i = 0; i < 40; i++) world.step(FIXED_DT, pedaling, 0, DEFAULT_TUN);
    expect(world.wheel.mode).toBe('road');
    const stopped: BikeInput = { cadence: 0, ftpFraction: 0, sprinting: false, gearScale: 1, ergMode: false, nudge: 0 };
    for (let i = 0; i < 45; i++) world.step(FIXED_DT, stopped, 0, DEFAULT_TUN);
    const sBefore = world.wheel.s;
    for (let i = 0; i < 30; i++) world.step(FIXED_DT, stopped, 0, DEFAULT_TUN);
    expect(Math.abs(world.wheel.s - sBefore)).toBeLessThan(0.05);
  });

  it('publishes real frame-0 controls, touchControls:[], and live cadence/zone targets', () => {
    const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'z2' }, seed: 1, simOpts: { level: 0 } });
    const hud0 = s.sim.hud!();
    expect(hud0.touchControls).toEqual([]);
    expect(hud0.controls?.some((c) => c.button === 'y')).toBe(true);

    // Check cadence target on m-lift
    const liftIdx = LEVEL_CATALOG.findIndex((e) => e.item === 'm-lift');
    const sLift = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'z2' }, seed: 1, simOpts: { level: liftIdx } });
    expect(sLift.sim.hud!().targetCadence).toBeDefined();

    // Check zone target on m-tide
    const tideIdx = LEVEL_CATALOG.findIndex((e) => e.item === 'm-tide');
    const sTide = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'z2' }, seed: 1, simOpts: { level: tideIdx } });
    expect(sTide.sim.hud!().targetZone?.source).toBe('power');

    // Snapshot exposes clean typed data
    const snap = s.sim.snapshot() as PenroseSnapshot;
    expect(snap.levelId).toBe('turntable');
    expect(snap.machines.length).toBe(1);
  });
});
