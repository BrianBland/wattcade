import { describe, expect, it } from 'vitest';
import { createGameSession, NullInput, TimelineInput, testProfile } from '../../../core';
import { module } from '../index';
import { LEVELS, levelPlan } from '../sim/levels';
import { planMinutes } from '../sim/plan';
import type { WatershedSnapshot } from '../sim/sim';

const TICK = 30;   // session steps per second
const snap = (s: { sim: { snapshot(): unknown } }) => s.sim.snapshot() as WatershedSnapshot;
const withSave = (levels: Record<string, number>) => { const p = testProfile(); p.gameData = { ...p.gameData, watershed: { rides: 1, levels } }; return p; };

describe('watershed level picker', () => {
  it('a new rider starts on level 1; locked levels are skipped on the way to Free Ride', () => {
    const s = createGameSession({ game: module, profile: testProfile(), input: new TimelineInput([{ t: 1, press: 'right' }, { t: 1.2, release: 'right' }]), fake: { script: 'z2' }, seed: 3 });
    const m0 = snap(s).menu!;
    expect(m0.levels.map((l) => l.id)).toEqual([...LEVELS.map((l) => l.id), 'free']);
    expect(m0.levels[m0.level].id).toBe('first-spring');
    expect(m0.levels.filter((l) => !l.locked).map((l) => l.id)).toEqual(['first-spring', 'free']);
    s.step(2 * TICK);
    expect(snap(s).menu!.levels[snap(s).menu!.level].id).toBe('free');
    // a tap on a locked level does nothing
    s.sim.receive?.({ type: 'level', id: 'dam-buster' });
    s.step(1);
    expect(snap(s).menu!.levels[snap(s).menu!.level].id).toBe('free');
  });

  it('starting a level rides its plan with its goal on screen', () => {
    const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'z2' }, seed: 3 });
    s.sim.receive?.({ type: 'warmup', skip: true });
    s.sim.receive?.({ type: 'start' });
    s.step(2);
    const v = snap(s);
    expect(s.sim.inMenu?.()).toBe(false);
    expect(v.rideS).toBe(planMinutes(levelPlan(LEVELS[0], true)) * 60);
    expect(v.level?.id).toBe('first-spring');
    expect(v.level?.goal.state).toBe('active');
    expect(v.level?.bonus.length).toBe(2);
    expect(v.events.length).toBe(0);    // no random geology inside a level
  });

  it('a returning rider gets the next level, and the result is saved as drops', () => {
    let saved: { levels?: Record<string, number>; lastLevel?: string } | undefined;
    const s = createGameSession({ game: module, profile: withSave({ 'first-spring': 2 }), input: new NullInput(), fake: { script: 'idle' }, seed: 3, onSave: (d) => { saved = d as typeof saved; } });
    const m = snap(s).menu!;
    expect(m.levels[m.level].id).toBe('grist-mill');
    expect(m.drops).toBe(2);
    expect(m.levels.find((l) => l.id === 'first-spring')!.drops).toBe(2);
    expect(m.levels.find((l) => l.id === 'beaver-crew')!.locked).toBe(true);
    s.sim.receive?.({ type: 'level', id: 'first-spring' });
    s.sim.receive?.({ type: 'warmup', skip: true });
    s.sim.receive?.({ type: 'start' });
    s.step(2);
    expect(saved?.lastLevel).toBe('first-spring');
    s.step(Math.ceil(snap(s).rideS) * TICK + TICK);   // a rider who never pedals: the goal fails, the best result stays
    expect(s.sim.isOver()).toBe(true);
    const sum = s.sim.summary();
    expect(sum.level).toBe('first-spring');
    expect(sum.levelGoal).toBe(0);
    expect(saved?.levels?.['first-spring']).toBe(2);
    expect(saved?.levels?.['grist-mill']).toBe(undefined);
  }, 60_000);
});

describe('watershed campaign tools', () => {
  const riverStart = (id: string) => planMinutes(levelPlan(LEVELS.find((l) => l.id === id)!, true).filter((b) => b.phase === 'rain')) * 60;

  it('A in the beaver level sends the crew to gate the saddle by the current; time in the band builds it', () => {
    const t0 = riverStart('beaver-crew') + 5;
    const s = createGameSession({ game: module, profile: testProfile(), input: new TimelineInput([{ t: t0, press: 'a' }, { t: t0 + 0.2, release: 'a' }]), fake: { script: 'cadence-follow' }, seed: 3, simOpts: { level: 'beaver-crew', skipWarmup: true } });
    s.step(Math.ceil(t0 - 1) * TICK);
    expect(snap(s).jobs.dam).toBe(null);
    s.step(2 * TICK);
    const d = snap(s).jobs.dam!;
    expect(d.kind).toBe('gate');
    expect(snap(s).ridges).toContain(d.y);                    // snapped onto the ridge, at one of its saddles
    s.step(25 * TICK);                                         // ~20 s in the band builds it
    expect(snap(s).jobs.dam!.build).toBe(1);
    expect(s.sim.hud!().controls?.find((c) => c.button === 'a')?.shortLabel).toBe('Gate');
  }, 60_000);

  it('the flood level raises a levee around Millbrook while the rider holds the band', () => {
    const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'cadence-follow' }, seed: 3, simOpts: { level: 'millbrook-flood', skipWarmup: true } });
    const v = snap(s).jobs.village, k = (v.y) * snap(s).nx + v.x + v.r + 2;   // a cell on the levee ring
    const h0 = snap(s).h[k];
    expect(snap(s).jobs.levee).toBe(0);
    s.step((riverStart('millbrook-flood') + 90) * TICK);
    expect(snap(s).jobs.levee!).toBeGreaterThan(0.4);
    expect(snap(s).h[k]).toBeGreaterThan(h0 + 0.5);
  }, 60_000);

  it('the dam level starts with an old log dam across the natural crossing', () => {
    const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'z2' }, seed: 3, simOpts: { level: 'dam-buster' } });
    const v = snap(s), d = v.jobs.dam!;
    expect(d.kind).toBe('log');
    expect(d.build).toBe(1);
    expect(d.y).toBe(v.ridges[0]);
    expect(v.h[d.y * v.nx + d.x]).toBeGreaterThan(v.h0[d.y * v.nx + d.x] - 0.01);
    expect(v.jobs.objective?.target).toEqual({ x: d.x, y: d.y });
  });
});
