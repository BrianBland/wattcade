import { describe, expect, it } from 'vitest';
import { FIXED_DT } from '../contracts';
import { getGame } from '../games/registry';
import { awardSession } from '../progression/award';
import { createGameSession, DataHub, NullInput, testProfile } from './index';

const profile = () => testProfile();
const session = (hub: DataHub, gameId = 'cadenza') => createGameSession({
  game: getGame(gameId)!, profile: profile(), input: new NullInput(), dataHub: hub, fake: false,
  simOpts: { menu: false },
});

function ride(hub: DataHub, seconds: number, power: number, step: () => void) {
  for (let i = 0; i < Math.round(seconds / FIXED_DT); i++) {
    hub.store.ingestTrainer({ power, cadence: power > 0 ? 90 : 0 });
    step();
  }
}

describe('session recording with a shared bike connection', () => {
  it('does not award earlier energy or sprints again when games are started and immediately exited', () => {
    const hub = new DataHub();
    ride(hub, 1200, 300, () => hub.store.tick(FIXED_DT, profile()));
    expect(hub.store.get().kj).toBeCloseTo(360);
    expect(hub.store.get().sprintCount).toBe(1);

    let rider = profile();
    for (const gameId of ['cadenza', 'lighthouse', 'cadenza']) {
      const s = session(hub, gameId);
      ride(hub, 1, 0, () => s.step(1));
      const rec = s.finish();
      expect(rec.stats.kj).toBe(0);
      expect(rec.stats.sprints).toBe(0);
      // Isolate exercise XP from one-time achievement bonuses.
      const award = awardSession(rider, rec, []);
      expect(award.xpGained).toBe(0);
      rider = award.profile;
    }
    expect(rider.lifetime).toMatchObject({ kj: 0, sprints: 0 });
    // Recording a new game must preserve the shared device totals.
    expect(hub.store.get().kj).toBeCloseTo(360);
    expect(hub.store.get().sprintCount).toBe(1);
  });

  it('excludes intro, countdown and buffering activity, including gaps between recorded ticks', () => {
    const hub = new DataHub();
    const s = session(hub);
    const idle = () => s.idle(FIXED_DT);
    ride(hub, 10, 300, idle);
    expect(hub.store.get().sprintCount).toBe(1);
    ride(hub, 2, 0, () => s.step(1));
    ride(hub, 5, 0, idle);
    ride(hub, 10, 300, idle);
    expect(hub.store.get().sprintCount).toBe(2);
    ride(hub, 2, 0, () => s.step(1));
    const rec = s.finish();
    expect(rec.durationS).toBeCloseTo(4);
    expect(rec.stats.kj).toBe(0);
    expect(rec.stats.sprints).toBe(0);
    expect(awardSession(profile(), rec, []).xpGained).toBe(0);
  });

  it('still credits energy and newly detected sprints from the current game', () => {
    const hub = new DataHub();
    ride(hub, 10, 300, () => hub.store.tick(FIXED_DT, profile()));
    const s = session(hub);
    // An ongoing sprint from the previous ride does not count again.
    ride(hub, 5, 300, () => s.step(1));
    ride(hub, 5, 0, () => s.step(1));
    ride(hub, 12, 300, () => s.step(1));
    const rec = s.finish();
    expect(rec.durationS).toBeCloseTo(22);
    expect(rec.stats.kj).toBeCloseTo(5.1);
    expect(rec.stats.sprints).toBe(1);
    const award = awardSession(profile(), rec, []);
    expect(award.baseXp).toBe(0); // recorded work is below the two-minute reward minimum
  });

  it('awards a qualifying ride using only its own work', () => {
    const hub = new DataHub();
    ride(hub, 10, 300, () => hub.store.tick(FIXED_DT, profile()));
    const s = session(hub);
    ride(hub, 120, 150, () => s.step(1));
    ride(hub, 10, 300, () => s.step(1));
    const rec = s.finish();
    expect(rec.stats.kj).toBeCloseTo(21);
    expect(rec.stats.sprints).toBe(1);
    const award = awardSession(profile(), rec, []);
    expect(award.baseXp).toBe(32); // 21 kJ + 4 active + 2 zone 2 + 5 sprint
    expect(award.profile.lifetime).toMatchObject({ sessions: 1, sprints: 1 });
    expect(award.profile.lifetime.kj).toBeCloseTo(21);
  });
});
