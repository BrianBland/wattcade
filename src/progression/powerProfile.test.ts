import { describe, expect, it } from 'vitest';
import type { SessionRecord, SessionSample } from '../contracts';
import { cleanPower, formFactor, meanMax, powerCurve, typicalShape, updatePowerProfile, POWER_DURATIONS, TYPICAL_SHAPE } from './powerProfile';

const DAY = 86_400_000;
const samples = (watts: number[], t0 = 1): SessionSample[] => watts.map((power, i) => ({ t: t0 + i, power, cadence: 90, hr: null, grade: null, mode: 'erg' }));
const ride = (watts: number[], startedAt = 1_000 * DAY, gameId = 'g'): SessionRecord => ({
  id: `r${startedAt}`, profileId: 'p', gameId, startedAt, durationS: watts.length, samples: samples(watts), events: [],
  stats: { avgPower: 0, maxPower: 0, kj: 0, avgHr: null, zoneSeconds: [0, 0, 0, 0, 0], sprints: 0 }, gameSummary: {},
});
const steady = (w: number, s: number) => Array(s).fill(w);
/** 20 min at `base`, then a 30 s effort at `sprint` with 5 s at `kick` in it. */
const sprintRide = (base: number, sprint: number, kick: number) => [...steady(base, 1200), ...steady(sprint, 25), ...steady(kick, 5), ...steady(base, 60)];

describe('meanMax', () => {
  it('finds the best window for each duration', () => {
    const m = meanMax(samples(sprintRide(150, 500, 900)));
    expect(m[5]).toBe(900);
    expect(m[30]).toBeCloseTo((25 * 500 + 5 * 900) / 30);
    expect(m[1200]).toBeGreaterThan(150);
  });
  it('leaves out durations longer than the ride, and never spans a gap', () => {
    const s = [...samples(steady(300, 40)), ...samples(steady(300, 40), 100)];
    const m = meanMax(s);
    expect(m[30]).toBe(300);
    expect(m[60]).toBeUndefined();
  });
  it('drops sensor glitches and lone spikes', () => {
    expect(cleanPower(samples([200, 4000, 200]))).toEqual([200, 200, 200]);
    expect(cleanPower(samples([200, 1500, 210]))).toEqual([200, 205, 210]);
    expect(cleanPower(samples([200, 600, 700, 650]))[1]).toBe(600); // a real jump is kept
    expect(meanMax(samples([...steady(200, 10), 3000, ...steady(200, 10)]))[5]).toBe(200);
  });
  it('is non-increasing with duration', () => {
    const m = meanMax(samples(sprintRide(180, 450, 1000)));
    const ws = POWER_DURATIONS.map((d) => m[d]);
    for (let i = 1; i < ws.length; i++) expect(ws[i]).toBeLessThanOrEqual(ws[i - 1]);
  });
});

describe('updatePowerProfile', () => {
  it('starts a profile from the first ride and reports the bests', () => {
    const { power, improved } = updatePowerProfile(undefined, ride(sprintRide(150, 500, 900)));
    expect(power.rides).toBe(1);
    expect(power.bests['5'].allTime).toMatchObject({ w: 900, gameId: 'g' });
    expect(improved.map((i) => i.durationS)).toEqual([5, 15, 30, 60, 300, 1200]);
    expect(improved.every((i) => i.allTime)).toBe(true);
  });
  it('keeps the all-time best and only reports what improved', () => {
    const a = updatePowerProfile(undefined, ride(sprintRide(150, 500, 900), 1000 * DAY)).power;
    const { power, improved } = updatePowerProfile(a, ride([...steady(500, 25), ...steady(1000, 5)], 1001 * DAY, 'h'));
    expect(power.bests['5'].allTime).toMatchObject({ w: 1000, gameId: 'h' });
    expect(improved.map((i) => i.durationS)).toContain(5);
    expect(improved.map((i) => i.durationS)).not.toContain(1200);
    expect(power.bests['1200']).toEqual(a.bests['1200']);
  });
  it('does not change the profile it was given', () => {
    const a = updatePowerProfile(undefined, ride(sprintRide(150, 500, 900))).power;
    const snap = JSON.stringify(a);
    updatePowerProfile(a, ride(sprintRide(150, 600, 1100), 1001 * DAY));
    expect(JSON.stringify(a)).toBe(snap);
  });
  it('keeps recent efforts as a frontier: older entries only if higher than every newer one', () => {
    let p = updatePowerProfile(undefined, ride(steady(800, 10), 1000 * DAY)).power;
    p = updatePowerProfile(p, ride(steady(700, 10), 1010 * DAY)).power;
    p = updatePowerProfile(p, ride(steady(750, 10), 1020 * DAY)).power;
    expect(p.bests['5'].recent.map((e) => e.w)).toEqual([800, 750]);
    p = updatePowerProfile(p, ride(steady(900, 10), 1030 * DAY)).power;
    expect(p.bests['5'].recent.map((e) => e.w)).toEqual([900]);
  });
  it('accepts a ride recorded before the latest one (a recovered ride)', () => {
    let p = updatePowerProfile(undefined, ride(steady(700, 10), 1010 * DAY)).power;
    p = updatePowerProfile(p, ride(steady(800, 10), 1000 * DAY)).power;
    expect(p.lastRideAt).toBe(1010 * DAY);
    expect(p.bests['5'].recent.map((e) => e.w)).toEqual([800, 700]);
  });
  it('forgets recent efforts after keepDays but keeps the all-time best', () => {
    let p = updatePowerProfile(undefined, ride(steady(900, 10), 1000 * DAY)).power;
    p = updatePowerProfile(p, ride(steady(500, 10), 1400 * DAY)).power;
    expect(p.bests['5'].recent.map((e) => e.w)).toEqual([500]);
    expect(p.bests['5'].allTime.w).toBe(900);
  });
  it('an empty ride changes nothing but recent pruning', () => {
    const p = updatePowerProfile(undefined, ride(sprintRide(150, 500, 900))).power;
    const q = updatePowerProfile(p, ride([], 1001 * DAY)).power;
    expect(q.rides).toBe(1);
    expect(q.bests).toEqual(p.bests);
  });
});

describe('powerCurve', () => {
  const profile = (watts: number[], ftp = 200) => ({ ftp, power: updatePowerProfile(undefined, ride(watts)).power });

  it('falls back to FTP × the typical shape with no rides', () => {
    const c = powerCurve({ ftp: 250 });
    expect(c.at(5)).toEqual({ w: Math.round(250 * TYPICAL_SHAPE[5]), source: 'ftp', hard: false });
    expect(c.hasHard(1, 60)).toBe(false);
    expect(c.best(5)).toBeNull();
    expect(c.ftpEstimate).toBeNull();
  });
  it('reads measured points and interpolates between them in log-log', () => {
    const c = powerCurve(profile(sprintRide(150, 500, 900)));
    expect(c.at(5).source).toBe('measured');
    const w10 = c.at(10);
    expect(w10.source).toBe('interpolated');
    expect(w10.w).toBeLessThan(c.at(5).w);
    expect(w10.w).toBeGreaterThan(c.at(15).w);
  });
  it('extrapolates by the typical shape, never above a shorter effort', () => {
    const c = powerCurve(profile(steady(400, 40), 300)); // 5/15/30 s only
    const e = c.at(3);
    expect(e.source).toBe('extrapolated');
    expect(e.w).toBe(Math.round(400 * typicalShape(3) / typicalShape(5)));
    expect(c.at(60).w).toBeLessThanOrEqual(400);
  });
  it('calls an effort hard only when it is near your limit', () => {
    const easy = powerCurve(profile(steady(220, 1300), 250)); // a Z2/Z3 ride: its "best 5 s" is not a sprint
    expect(easy.best(5)!.hard).toBe(false);
    expect(easy.hasHard(5, 30)).toBe(false);
    const sprinted = powerCurve(profile(sprintRide(150, 500, 900), 250));
    expect(sprinted.best(5)!.hard).toBe(true);
    expect(sprinted.hasHard(5, 30)).toBe(true);
  });
  it('estimates FTP only from a hard 20 min, and never lowers it', () => {
    const hard = powerCurve(profile(steady(300, 1250), 280));
    expect(hard.ftpEstimate).toBe(285);
    expect(hard.ftp).toBe(285);
    const easy = powerCurve(profile(steady(150, 1250), 280));
    expect(easy.ftpEstimate).toBeNull();
    expect(easy.ftp).toBe(280);
  });
  it('fades old bests to follow form, measured from the last ride (deterministic)', () => {
    let p = updatePowerProfile(undefined, ride(steady(1000, 10), 1000 * DAY)).power;
    p = updatePowerProfile(p, ride(steady(700, 10), 1100 * DAY)).power;
    const c = powerCurve({ ftp: 250, power: p });
    expect(c.best(5)!.formW).toBe(Math.round(1000 * formFactor(100 * DAY)));
    expect(c.best(5)!.allTimeW).toBe(1000);
    expect(powerCurve({ ftp: 250, power: p }).at(5).w).toBe(c.at(5).w);
    expect(powerCurve({ ftp: 250, power: p }, { now: 1300 * DAY }).at(5).w).toBe(800); // faded to the floor
  });
  it('keeps the curve non-increasing across rides', () => {
    let p = updatePowerProfile(undefined, ride(steady(600, 70), 1000 * DAY)).power; // 600 W for a minute
    p = updatePowerProfile(p, ride(steady(500, 10), 1001 * DAY)).power;
    const c = powerCurve({ ftp: 250, power: p });
    expect(c.at(5).w).toBeGreaterThanOrEqual(c.at(60).w);
  });
});
