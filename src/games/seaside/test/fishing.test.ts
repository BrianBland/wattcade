import { describe, expect, it } from 'vitest';
import { makeRng } from '../../../core';
import { FISH, pickFish, SPOTS, type FishId } from '../sim/catalogue';
import { FISHING_DEFAULTS as T, FishingStop, type FishingEvent, type FishingInput } from '../sim/fishing';
import { PULL_DEFAULTS as P, pullTarget } from '../sim/pull';
import { STORY } from '../sim/story';
import type { PullPlan } from '../sim/types';

const DT = 0.1;
const SLOTS: PullPlan[] = [{ atS: 120, planS: 6, size: 0.1 }, { atS: 240, planS: 8, size: 0.15 }];
const idle: FishingInput = { a: false, step: 0, frac: 0, rpm: 0, due: false, running: false };

/** Tick until `until` says stop (or `maxS`), collecting events. `inp` may depend on the stop's state. */
function drive(f: FishingStop, inp: (f: FishingStop) => Partial<FishingInput>, until: (f: FishingStop, ev: FishingEvent[]) => boolean, maxS = 900) {
  const log: Array<FishingEvent & { t: number }> = [];
  for (let t = 0; t < maxS; t += DT) {
    const ev = f.tick(DT, { ...idle, ...inp(f) }, T, P);
    log.push(...ev.map((e) => ({ ...e, t: +t.toFixed(1) })));
    if (until(f, ev)) break;
  }
  return log;
}
const first = (log: FishingEvent[], type: FishingEvent['type']) => log.find((e) => e.type === type);

describe('fishing stop', () => {
  it('picks a spot with the paddles (wrapping) or a tap, and casts on A at a distance set by cadence', () => {
    const f = new FishingStop('pier', SLOTS, makeRng(1));
    expect(f.phase).toBe('spot');
    f.tick(DT, { ...idle, step: -1 }, T, P);
    expect(f.spot).toBe(2);
    f.tick(DT, { ...idle, tap: 1 }, T, P);
    expect(f.spot).toBe(1);
    const ev = f.tick(DT, { ...idle, tap: 1, rpm: 80 }, T, P); // tapping the picked spot casts
    expect(ev).toEqual([{ type: 'cast', spot: 'sand', cast: 0.5 }]);
    expect(f.phase).toBe('cast');
    const far = new FishingStop('pier', SLOTS, makeRng(1));
    far.tick(DT, { ...idle, a: true, rpm: 130 }, T, P);
    expect(far.cast).toBe(1);
  });

  it('casts by itself after a while (idle, scripted riders)', () => {
    const f = new FishingStop('turnout', SLOTS, makeRng(1));
    const log = drive(f, () => ({}), (_f, ev) => ev.some((e) => e.type === 'cast'));
    expect(log[0].t).toBeCloseTo(T.autoCastS, 0);
    expect(f.cast).toBe(0);
  });

  it('bites only once the slot is due (or after the longest wait), sooner with a twitching lure', () => {
    const wait = (rpm: number, due: (t: number) => boolean) => {
      const f = new FishingStop('turnout', SLOTS, makeRng(3));
      let t = 0;
      const log = drive(f, () => ({ a: f.phase === 'spot', rpm, due: due((t += DT)) }), (_f, ev) => ev.some((e) => e.type === 'bite'));
      return { t: log.at(-1)!.t, early: (first(log, 'bite') as { early: boolean }).early, f };
    };
    const notDue = wait(80, () => false);
    expect(notDue.early).toBe(true);
    expect(notDue.t).toBeCloseTo(T.castS + T.maxWaitS, 0);
    const due = wait(80, (t) => t > 30);
    expect(due.early).toBe(false);
    expect(due.t).toBeGreaterThanOrEqual(30 + T.biteMinS - 0.2);
    expect(due.t).toBeLessThanOrEqual(30 + T.biteMaxS + 0.2);
    const twitch = wait(100, (t) => t > 30);
    expect(twitch.t).toBeLessThan(due.t);
    expect(due.f.holds()).toBe(true);
  });

  it('a strike inside the window is full credit; otherwise the hook sets itself at half credit', () => {
    const hook = (strikeAt: number | null) => {
      const f = new FishingStop('pier', SLOTS, makeRng(5));
      drive(f, () => ({ a: f.phase === 'spot', due: true }), (x) => x.phase === 'bite');
      const log = drive(f, (x) => ({ a: strikeAt !== null && x.phaseT >= strikeAt }), (x) => x.phase === 'pull');
      return { ev: first(log, 'hook') as Extract<FishingEvent, { type: 'hook' }>, t: f.phaseT, f };
    };
    expect(hook(0.5).ev.fish.credit).toBe(1);
    expect(hook(0.5).ev.late).toBe(false);
    const auto = hook(null);
    expect(auto.ev.fish.credit).toBe(T.lateCredit);
    expect(auto.ev.late).toBe(true);
    expect(auto.f.pull!.ftp).toBeCloseTo(pullTarget(SLOTS[0].size, P).ftp);
  });

  /** Fish the whole stop at a steady power (fraction of FTP), never touching a button. */
  const fishStop = (frac: number, seed = 7) => {
    const f = new FishingStop('turnout', SLOTS, makeRng(seed));
    const log = drive(f, () => ({ frac, rpm: 85, due: true }), (x) => x.phase === 'done', 3600);
    return { f, log };
  };

  it('at the target the fish tires in its planned time; a z2 rider still lands it, slowly', () => {
    const hard = fishStop(1.3);
    const landed = hard.log.filter((e) => e.type === 'landed') as Array<Extract<FishingEvent, { type: 'landed' }>>;
    expect(landed.length).toBe(2);
    expect(landed.every((e) => e.pull.t < 1.2 * e.pull.durS)).toBe(true);
    const z2 = fishStop(0.65);
    const zl = z2.log.filter((e) => e.type === 'landed') as Array<Extract<FishingEvent, { type: 'landed' }>>;
    expect(zl.length).toBe(2);
    expect(zl.every((e) => e.pull.t > 5 * e.pull.durS)).toBe(true);
    expect(z2.f.caught.length).toBe(2);
    // haul-up, then the card, then the next spot
    const order = z2.log.map((e) => e.type).join();
    expect(order).toBe('cast,bite,hook,landed,slot,cast,bite,hook,landed,slot,done');
  });

  it('only a rider who stops pedalling loses a fish: it escapes, a retry, then the stop moves on', () => {
    const { f, log } = fishStop(0);
    const esc = log.filter((e) => e.type === 'escaped') as Array<Extract<FishingEvent, { type: 'escaped' }>>;
    expect(esc.map((e) => e.retry)).toEqual([true, false, true, false]);
    expect(log.filter((e) => e.type === 'slot').length).toBe(2);
    expect(f.phase).toBe('done');
    expect(f.caught.length).toBe(0);
    // below "pedalling" the fish never tires; just above it, it does (slowly)
    const lose = fishStop(P.pedalFtp - 0.05), keep = fishStop(P.pedalFtp + 0.05);
    expect(lose.f.caught.length).toBe(0);
    expect(keep.f.caught.length).toBe(2);
  });

  it('is deterministic per seed', () => {
    const a = fishStop(0.65, 11).log, b = fishStop(0.65, 11).log;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(new FishingStop('pier', SLOTS, makeRng(1), 2).phase).toBe('done'); // resumed past every slot
  });

  it('the view carries phase, spot, tension and stamina, and the fish once hooked', () => {
    const f = new FishingStop('beach', SLOTS, makeRng(2));
    drive(f, () => ({ a: f.phase === 'spot' || f.phase === 'bite', due: true, frac: 0.5, running: true }), (x) => x.phase === 'pull' && x.phaseT > 2);
    const v = f.view(T);
    expect(v.phase).toBe('pull');
    expect(v.spots.map((s) => s.id)).toEqual(['reef', 'shallows']);
    expect(v.tension).toBeGreaterThan(0.7);
    expect(v.stamina).toBeLessThan(1);
    expect(['parrotfish', 'tang']).toContain(v.fish?.id);
  });
});

describe('fish catalogue', () => {
  it('every species is caught somewhere; each stop has 2–3 spots with their own mix', () => {
    const seen = new Set<FishId>();
    for (const spots of Object.values(SPOTS)) {
      expect(spots.length).toBeGreaterThanOrEqual(2);
      expect(spots.length).toBeLessThanOrEqual(3);
      expect(new Set(spots.map((s) => JSON.stringify(s.mix))).size === spots.length || spots.every((s) => Object.keys(s.mix).length === 1)).toBe(true);
      for (const s of spots) Object.keys(s.mix).forEach((k) => seen.add(k as FishId));
    }
    expect([...seen].sort()).toEqual(Object.keys(FISH).sort());
  });

  it('picks within the species range; farther casts and bigger sprints run bigger', () => {
    const rng = makeRng(4);
    let small = 0, big = 0;
    for (let i = 0; i < 200; i++) {
      const s = pickFish(SPOTS.pier[2], 0.1, 0, 1, rng), b = pickFish(SPOTS.pier[2], 0.9, 1, 1, rng);
      for (const c of [s, b]) {
        const k = FISH[c.id];
        expect(c.kg).toBeGreaterThanOrEqual(k.kg[0]);
        expect(c.kg).toBeLessThanOrEqual(k.kg[1]);
        expect(['lingcod', 'rockfish']).toContain(c.id);
      }
      small += s.size; big += b.size;
    }
    expect(big).toBeGreaterThan(small * 1.5);
    expect(pickFish(SPOTS.lava[0], 0.5, 0.5, 0.5, makeRng(1)).value).toBeLessThan(pickFish(SPOTS.lava[0], 0.5, 0.5, 1, makeRng(1)).value);
  });

  it('every fishing stop in the story (turnout, pier, beach, lava) has a location and its sprints as bite slots', () => {
    const stops = STORY.filter((s) => s.kind === 'fish' && 'effortS' in s.length);
    expect(stops.map((s) => `${s.id}:${s.fishing}`)).toEqual(['turnout1:turnout', 'pier:pier', 'beach:beach', 'magma:lava']);
    expect(stops.every((s) => s.pulls.length > 0)).toBe(true);
  });
});
