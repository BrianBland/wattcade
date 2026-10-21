import { describe, expect, it } from 'vitest';
import { createGameSession, NullInput, SCRIPTS, testProfile, TimelineInput } from '../../../core';
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
  const press = (times: Array<[number, 'left' | 'right']>) => new TimelineInput(times.flatMap(([t, b]) => [{ t, press: b }, { t: t + 0.05, release: b }]));
  it('cycling is free: the stance commits 0.4 s after the last press, then a 0.5 s swap', () => {
    const s = createGameSession({ game: module, profile: testProfile(), fake: { script: 'z2' }, seed: 5, simOpts: { skipCamp: true },
      input: press([[0.5, 'right'], [0.7, 'right']]) }); // ranger -> skirmisher -> vanguard
    const st = () => (s.sim.snapshot() as any).stance;
    expect(st().id).toBe('ranger');
    s.step(30); // 1.0 s: still picking, still ranger
    expect(st().id).toBe('ranger'); expect(st().swapping).toBe('vanguard');
    s.step(30); // 2.0 s: committed at 1.15, swapped by 1.65
    expect(st().id).toBe('vanguard'); expect(st().swapping).toBeNull(); expect(st().ready).toBe(1);
    expect((s.sim.snapshot() as any).weapon.base).toMatch(/flame|pellet/);
    expect(s.finish().events.filter((e) => e.type === 'stance')).toHaveLength(1); // one swap, not two
  });
  it('cycling back to the current stance before it commits does nothing', () => {
    const s = createGameSession({ game: module, profile: testProfile(), fake: { script: 'z2' }, seed: 5, simOpts: { skipCamp: true },
      input: press([[0.5, 'right'], [0.7, 'left']]) });
    s.step(60);
    expect((s.sim.snapshot() as any).stance.id).toBe('ranger');
    expect(s.finish().events.filter((e) => e.type === 'stance')).toHaveLength(0);
  });
  it('rapid swapping is not an exploit: no style bonus until settled, and spamming puts out less damage than staying put', () => {
    const run = (spam: boolean) => {
      const times: Array<[number, 'left' | 'right']> = [];
      if (spam) for (let t = 41; t < 100; t += 1.2) times.push([t, times.length % 2 ? 'left' : 'right']);
      SCRIPTS['test-band96'] = { ...SCRIPTS.z2, name: 'test-band96', cadence: () => 96 }; // in the Ranger band
      const s = createGameSession({ game: module, profile: testProfile(), fake: { script: 'test-band96' }, seed: 3, input: press(times),
        simOpts: { autopilot: true, skipCamp: true, invulnerable: true } });
      s.step(30 * 40); const a = (s.sim.snapshot() as any).stats.output;
      let styled = 0;
      for (let n = 0; n < 30 * 60; n++) { s.step(1); if ((s.sim.snapshot() as any).stance.styleOn) styled++; }
      return { dmg: (s.sim.snapshot() as any).stats.output - a, styled, swaps: s.finish().events.filter((e) => e.type === 'stance').length };
    };
    const still = run(false), spam = run(true);
    expect(spam.dmg).toBeLessThan(still.dmg);
    expect(still.styled).toBeGreaterThan(30 * 30); // staying in band earns the bonus
    expect(spam.swaps).toBeGreaterThan(40);
    expect(spam.styled).toBeLessThan(30 * 2); // only the ~1.9 s before the first swap lands; never re-settles
  });
});

describe('riding style changes how power is delivered, not how much', () => {
  // Deterministic and fast: an invulnerable hero (no deaths) rides the same 40 s at 86 rpm, then splits to 76 / 86 / 96 rpm
  // at the same power; we compare damage output per second spent firing over the next 50 s. Movement is flat over
  // 60-90 rpm (see the cadenceSpeed test), so progress follows the same power. The long multi-seed ride version lives in
  // test/balance.test.ts (BALANCE=1).
  const mk = (rpm: number) => { const name = `test-split${rpm}`; SCRIPTS[name] = { ...SCRIPTS.z2, name, cadence: (t: number) => (t < 40 ? 86 : rpm) }; return name; };
  const scripts = { 76: mk(76), 86: mk(86), 96: mk(96) } as const;
  const dps = (rpm: 76 | 86 | 96, stance: string) => {
    let out = 0, secs = 0;
    for (const seed of [3, 11, 15]) {
      const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: scripts[rpm] }, seed,
        simOpts: { autopilot: true, skipCamp: true, invulnerable: true, stance } });
      s.step(30 * 40); const a = (s.sim.snapshot() as any).stats;
      s.step(30 * 50); const b = (s.sim.snapshot() as any).stats;
      out += b.output - a.output; secs += b.fireT - a.fireT;
    }
    expect(secs).toBeGreaterThan(30); // enough fighting in the window to measure
    return out / secs;
  };
  it('grind (76 rpm) vs spin (96 rpm) at the same power deal damage within 10% for every stance', () => {
    for (const st of ['vanguard', 'ranger', 'skirmisher']) {
      const lo = dps(76, st), mid = dps(86, st), hi = dps(96, st);
      expect(Math.abs(lo - hi) / Math.max(lo, hi), `${st} 76:${lo.toFixed(1)} 96:${hi.toFixed(1)}`).toBeLessThanOrEqual(0.1);
      expect(Math.abs((lo + hi) / 2 - mid) / mid, `${st} vs 86 rpm ${mid.toFixed(1)}`).toBeLessThanOrEqual(0.1);
    }
  });
});

describe('stance cadence target (shell HUD)', () => {
  it("shows the active stance's band, and a called spin-up takes priority", () => {
    const s = createGameSession({ game: module, profile: testProfile(), fake: { script: 'z2' }, seed: 13, input: new NullInput(), simOpts: { autopilot: true, stance: 'vanguard' } });
    s.step(30 * 5);
    expect(s.sim.hud!().targetCadence).toMatchObject({ min: 70, max: 82, label: 'Vanguard style' });
    let spun = false;
    for (let n = 0; n < 30 * 1200 && !spun; n++) { s.step(1); spun = (s.sim.snapshot() as any).hooks.seg === 'spinup'; }
    expect(spun).toBe(true);
    expect(s.sim.hud!().targetCadence).toMatchObject({ label: 'Spin up!' });
    expect(s.sim.hud!().targetCadence?.max).toBeUndefined();
  });
});
