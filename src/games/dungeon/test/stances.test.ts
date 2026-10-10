import { describe, expect, it } from 'vitest';
import { createGameSession, runHeadless, SCRIPTS, testProfile, TimelineInput } from '../../../core';
import { module } from '../index';
import { STANCES, stanceOfStyle, stancesFor, styleActive, suggestStance } from '../sim/stances';

describe('stances (pure)', () => {
  it('slot weapons by style; orbs go to the Ranger until the Arcanist is unlocked', () => {
    expect(stanceOfStyle('flame', false)).toBe('vanguard');
    expect(stanceOfStyle('arrow', false)).toBe('ranger');
    expect(stanceOfStyle('star', false)).toBe('skirmisher');
    expect(stanceOfStyle('orb', false)).toBe('ranger');
    expect(stanceOfStyle('orb', true)).toBe('arcanist');
    expect(stancesFor(false)).toEqual(['vanguard', 'ranger', 'skirmisher']);
    expect(stancesFor(true)).toContain('arcanist');
  });
  it('style bonus needs the cadence band, zone 2+ power, and no called cadence; bands stay within 70-100 rpm', () => {
    expect(styleActive('vanguard', 76, 2, false)).toBe(true);
    expect(styleActive('vanguard', 76, 1, false)).toBe(false); // easy riding in a "good" cadence earns nothing
    expect(styleActive('vanguard', 90, 3, false)).toBe(false);
    expect(styleActive('ranger', 96, 3, true)).toBe(false);    // a game cadence ask wins
    for (const s of Object.values(STANCES)) { expect(s.band[0]).toBeGreaterThanOrEqual(70); expect(s.band[1]).toBeLessThanOrEqual(100); }
  });
  it('suggests a stance but only for clear situations', () => {
    expect(suggestStance({ boss: true, shielded: false, crowd: 1, elite: false, arcanist: false })).toBe('vanguard');
    expect(suggestStance({ boss: false, shielded: false, crowd: 6, elite: false, arcanist: false })).toBe('skirmisher');
    expect(suggestStance({ boss: false, shielded: false, crowd: 2, elite: false, arcanist: false })).toBeNull();
  });
});

describe('stance changes (D-pad)', () => {
  it('right switches after the swap delay, and the cooldown blocks a second change', () => {
    const s = createGameSession({ game: module, profile: testProfile(), fake: { script: 'z2' }, seed: 5, simOpts: { skipCamp: true },
      input: new TimelineInput([{ t: 0.5, press: 'right' }, { t: 0.55, release: 'right' }, { t: 2.5, press: 'right' }, { t: 2.55, release: 'right' }]) });
    const st = () => (s.sim.snapshot() as any).stance;
    expect(st().id).toBe('ranger');
    s.step(30); // 1.0 s: swapping
    expect(st().swapping).toBe('skirmisher');
    s.step(60); // 3.0 s: swapped; second press at 2.5 s was refused (8 s cooldown)
    expect(st().id).toBe('skirmisher'); expect(st().swapping).toBeNull();
    expect(st().ready).toBeLessThan(1);
    expect((s.sim.snapshot() as any).weapon.base).toBe('star');
  });
});

describe('riding style changes how power is delivered, not how much', () => {
  const mk = (name: string, rpm: number) => { SCRIPTS[name] = { ...SCRIPTS.z2, name, cadence: (t: number) => rpm + 2 * Math.sin(t / 5) }; };
  mk('test-rpm76', 76); mk('test-rpm96', 96);
  const rooms = (script: string, stance: string) => [11, 12, 13].reduce((a, seed) =>
    a + (runHeadless({ game: module, script, minutes: 15, seed, simOpts: { autopilot: true, stance } }).summary['Rooms cleared'] as number), 0);
  it('grind (76 rpm) vs spin (96 rpm) at the same power land within 10% for every stance, and near that stance at z2', () => {
    for (const st of ['vanguard', 'ranger', 'skirmisher']) {
      const base = rooms('z2', st);
      const lo = rooms('test-rpm76', st), hi = rooms('test-rpm96', st);
      expect(Math.abs(lo - hi) / Math.max(lo, hi), `${st} ${lo} vs ${hi}`).toBeLessThanOrEqual(0.1);
      expect(Math.abs((lo + hi) / 2 - base) / base, `${st} vs z2 ${base}`).toBeLessThanOrEqual(0.15);
    }
  }, 90_000); // 27 quarter-hour headless rides
});
