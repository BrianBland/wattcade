import { describe, expect, it } from 'vitest';
import { createGameSession, runHeadless, testProfile, NullInput, TimelineInput } from '../../../core';
import type { Button } from '../../../contracts';
import { module } from '../index';
import { generateWorld, TILE } from '../sim/world';
import { scenarios } from '../scenarios';
import { makeRng } from '../../../core';

describe('world', () => {
  it('generates 13 connected rooms', () => {
    const w = generateWorld(makeRng(5));
    expect(w.rooms.length).toBe(13);
    expect(w.links.length).toBe(12);
    expect(w.tiles.includes(TILE.DOOR)).toBe(true);
    expect(w.tiles.includes(TILE.SWAMP)).toBe(true);
  });
});

describe('swamp resistance (core mixer)', () => {
  it('commanded grade rises while on swamp tiles', () => {
    const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'z2' }, seed: 13, simOpts: { autopilot: true } });
    let sawBase = false, sawSwamp = false;
    for (let i = 0; i < 20 * 60 * 30 && !sawSwamp; i++) {
      s.step(1);
      const snap = s.sim.snapshot() as { hooks: { swamp: boolean } };
      const g = s.mixer.debug().lastCommand as { gradePct?: number } | null | undefined;
      const grade = g?.gradePct;
      if (grade !== undefined && !snap.hooks.swamp && i > 90) sawBase = sawBase || grade < 3.5;
      if (grade !== undefined && snap.hooks.swamp && i > 90) sawSwamp = sawSwamp || grade >= 4.5;
    }
    expect(sawBase).toBe(true);
    expect(sawSwamp).toBe(true);
  });
});

describe('auto-move and hud', () => {
  it('moves the player with no D-pad input and exposes hud()', () => {
    const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'z2' }, seed: 5 });
    const p0 = (s.sim.snapshot() as any).player;
    s.step(300);
    const p1 = (s.sim.snapshot() as any).player;
    expect(Math.hypot(p1.x - p0.x, p1.y - p0.y)).toBeGreaterThan(3);
    const h = s.sim.hud!();
    expect(h.gears).toBe(true);
    expect(h.targetZone).toMatchObject({ min: 2, max: 2 });
    expect(h.controls!.length).toBeGreaterThan(3);
  });
});

describe('buttons aim mode', () => {
  const buttonsProfile = () => { const p = testProfile(); p.settings.aimMode = 'buttons'; return p; };
  it('aims like the Ride diamond: Y up, Z left, A right, B down', () => {
    const want: Record<string, number> = { y: -Math.PI / 2, z: Math.PI, a: 0, b: Math.PI / 2 };
    for (const [b, ang] of Object.entries(want)) {
      const s = createGameSession({ game: module, profile: buttonsProfile(), input: new TimelineInput([{ t: 0, press: b as Button }]), fake: { script: 'z2' }, seed: 5 });
      s.step(5);
      expect(Math.abs(Math.cos((s.sim.snapshot() as any).aim.angle - ang) - 1), b).toBeLessThan(1e-9);
    }
  });
  it('dash and potion sit on the right shifters without shifting gear', () => {
    const s = createGameSession({ game: module, profile: buttonsProfile(), input: new TimelineInput([{ t: 0, press: 'shiftUpR' }]), fake: { script: 'z2' }, seed: 5 });
    const gear0 = s.mixer.gear; s.step(5);
    expect((s.sim.snapshot() as any).player.dashCd).toBeGreaterThan(0);
    expect(s.mixer.gear).toBe(gear0);
    const hints = new Map(s.sim.hud!().controls!.map((c) => [c.label, c.button]));
    expect(hints.get('Dash')).toBe('shiftUpR'); expect(hints.get('Potion')).toBe('shiftDnR'); expect(hints.get('Aim right')).toBe('a');
  });
});

describe('scenarios via runHeadless', () => {
  for (const sc of scenarios) {
    it(sc.name, () => {
      const r = runHeadless({ game: module, script: sc.script, minutes: sc.minutes, seed: sc.seed, simOpts: sc.simOpts });
      const fails = sc.assert(r.summary, r.stats, { mixerCommands: r.mixerCommands, isOver: r.isOver, events: r.events });
      expect(fails, JSON.stringify(r.summary)).toEqual([]);
    });
  }
  it('is deterministic', () => {
    const o = { game: module, script: 'z2', minutes: 3, seed: 4, simOpts: { autopilot: true } };
    expect(runHeadless(o).summary).toEqual(runHeadless(o).summary);
  });
});
