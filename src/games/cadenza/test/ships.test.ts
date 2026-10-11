// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Profile } from '../../../contracts';
import { createGameSession, NullInput, testProfile } from '../../../core';
import { synthTimeline } from '../../../media/synth/queue';
import { module } from '../index';
import type { CadenzaSave, CadenzaSnapshot } from '../sim/sim';
import { SHIPS } from '../sim/ships';
import { Hud } from '../render/hud';

const timeline = () => synthTimeline({ style: 'edm', songs: 1, short: true });
function session(profile: Profile, saves: unknown[] = []) {
  return createGameSession({ game: module, profile, input: new NullInput(), media: { timeline: timeline() }, fake: { script: 'z2' }, onSave: (d) => saves.push(d) });
}
const snap = (s: ReturnType<typeof session>) => s.sim.snapshot() as CadenzaSnapshot;

describe('Cadenza ships', () => {
  it('a new rider flies the Triad; the others show how to unlock them and cannot be picked', () => {
    const s = session(testProfile());
    expect(snap(s).ship).toBe('triad');
    expect(snap(s).menu).toMatchObject({ ships: ['triad'], locked: ['lancer', 'manta'] });
    s.sim.receive?.({ type: 'ship', value: 'manta' }); s.step(1);
    expect(snap(s).ship).toBe('triad');
    const hud = new Hud(document.body);
    hud.update(snap(s), '#00f0ff', 0);
    expect(document.body.textContent).toContain('Earn “Encore”');
    hud.dispose();
  });

  it('an earned ship can be picked, is saved, and is chosen again next ride', () => {
    const saves: unknown[] = [], profile = testProfile({ achievements: ['cz_sets'] });
    const s = session(profile, saves);
    expect(snap(s).menu?.ships).toEqual(['triad', 'lancer']);
    s.sim.receive?.({ type: 'ship', value: 'lancer' }); s.sim.receive?.({ type: 'start' }); s.step(1);
    expect(snap(s).menu).toBeNull();
    expect(snap(s).ship).toBe('lancer');
    expect(s.sim.summary().ship).toBe('lancer');
    const saved = saves[saves.length - 1] as CadenzaSave;
    expect(saved.ship).toBe('lancer');
    expect(snap(session(testProfile({ achievements: ['cz_sets'], gameData: { cadenza: saved } }))).ship).toBe('lancer');
    // ...but not once the achievement is gone (e.g. an older backup restored)
    expect(snap(session(testProfile({ gameData: { cadenza: saved } }))).ship).toBe('triad');
  });

  it('keeps a ship equipped in the old Locker slot', () => {
    const p = testProfile({ achievements: ['cz_launches'], cosmetics: { loadout: { ship: 'manta' } } });
    expect(snap(session(p)).ship).toBe('manta');
  });

  it('playstyles pull in different directions', () => {
    const { triad, lancer, manta } = SHIPS;
    expect(triad.greyDamage).toBeLessThan(1); expect(triad.recharge).toBeGreaterThan(1);
    expect(lancer.steer).toBeGreaterThan(triad.steer); expect(lancer.catch).toBeLessThan(triad.catch); expect(lancer.chainStep).toBeLessThan(triad.chainStep);
    expect(manta.catch).toBeGreaterThan(triad.catch); expect(manta.steer).toBeLessThan(triad.steer);
    for (const d of Object.values(SHIPS)) expect(d.blurb.length).toBeLessThan(110); // fits the menu
  });

  it('every ship finishes an autopilot set', () => {
    for (const ship of ['triad', 'lancer', 'manta'] as const) {
      const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), media: { timeline: timeline() }, fake: { script: 'target-follow' }, simOpts: { autopilot: true, ship } });
      while (!s.sim.isOver()) s.step(300);
      const sum = s.sim.summary();
      expect(sum.ship, ship).toBe(ship);
      expect(Number(sum.accuracyPct), ship).toBeGreaterThan(70);
    }
  });
});
