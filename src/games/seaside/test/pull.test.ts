import { describe, expect, it } from 'vitest';
import { Pull, PULL_DEFAULTS as P, pullTarget, tireS } from '../sim/pull';
import { PERSONAL_PULL_DEFAULTS, personalShare } from '../sim/pull';
import { personalFtp, powerCurve } from '../../../progression/powerProfile';
import { STORY } from '../sim/story';

const run = (p: Pull, ftpFrac: number, maxS = 600) => {
  let r = 'pulling', t = 0;
  while (r === 'pulling' && t < maxS) { r = p.tick(0.1, ftpFrac, P); t += 0.1; }
  return { r, t };
};

describe('pulls (sprints)', () => {
  it('sizes targets 110–150 % FTP × 6–25 s', () => {
    expect(pullTarget(0, P)).toEqual({ ftp: 1.1, s: 6 });
    expect(pullTarget(1, P)).toEqual({ ftp: 1.5, s: 25 });
    expect(pullTarget(0.5, P).ftp).toBeCloseTo(1.3);
    expect(pullTarget(2, P)).toEqual(pullTarget(1, P));
  });
  it('a fish held at its target lands in its planned length; harder is sooner', () => {
    const t = pullTarget(0.3, P);
    const at = run(new Pull(0.3, t.ftp, t.s, false), t.ftp);
    expect(at.r).toBe('landed');
    expect(at.t).toBeCloseTo(t.s, 0);
    expect(run(new Pull(0.3, t.ftp, t.s, false), t.ftp * 1.3).t).toBeLessThan(at.t);
    const p = new Pull(0.3, t.ftp, t.s, false); run(p, t.ftp);
    expect(p.hit()).toBe(true);
  });
  it('without a sprint the fish tires on its own (slow, but landed); a stopped rider loses it, never soft-locks', () => {
    const t = pullTarget(0.35, P);
    const z2 = run(new Pull(0.35, t.ftp, t.s, false), 0.65);
    expect(z2.r).toBe('landed');
    expect(z2.t).toBeCloseTo(tireS(0.35, P), 0);
    expect(z2.t).toBeGreaterThan(5 * t.s);
    expect(z2.t).toBeLessThan(P.giveUpS);
    const idle = run(new Pull(0.35, t.ftp, t.s, false), 0);
    expect(idle.r).toBe('escaped');
    expect(idle.t).toBeCloseTo(P.giveUpS, 0);
  });
  it('set pieces always resolve after their window; effort scales the spectacle', () => {
    const lazy = new Pull(1, 1.5, 25, true), hard = new Pull(1, 1.5, 25, true);
    expect(run(lazy, 0).r).toBe('landed');
    expect(run(hard, 1.6).t).toBeCloseTo(25, 0);
    expect(lazy.spectacle()).toBe(0);
    expect(hard.spectacle()).toBeGreaterThan(1);
  });
  it('the story plans nine sprints, all inside the storyboard range', () => {
    const pulls = STORY.flatMap((s) => s.pulls.map((p) => ({ ...p, s })));
    expect(pulls.length).toBe(9);
    for (const p of pulls) {
      expect(p.planS).toBeGreaterThanOrEqual(6);
      expect(p.planS).toBeLessThanOrEqual(25);
      const e = p.s.effort.find(([, v]) => v >= 1)!;
      expect(e[1]).toBeGreaterThanOrEqual(1.1);
      expect(e[1]).toBeLessThanOrEqual(1.5);
    }
    expect(STORY.filter((s) => s.kind === 'fish' && 'effortS' in s.length).flatMap((s) => s.pulls).length).toBe(6);
  });
});

describe('personal pull targets (shared power profile)', () => {
  const effort = (w: number) => ({ allTime: { w, at: 1, gameId: 'x' }, recent: [{ w, at: 1, gameId: 'x' }] });
  const rider = (b5: number, b15: number, b30: number) => ({
    ftp: 200, power: { v: 1 as const, rides: 1, lastRideAt: 1, bests: { '5': effort(b5), '15': effort(b15), '30': effort(b30) } },
  });
  const targets = (r: ReturnType<typeof rider> | null) => {
    const curve = r ? powerCurve(r) : null;
    const personal = curve ? (size: number, s: number) => personalFtp(curve, 200, s, { share: personalShare(size, PERSONAL_PULL_DEFAULTS), minFtp: 1, maxFtp: 2.2 }) : undefined;
    return [0, 1].map((size) => pullTarget(size, { ...P, personal }).ftp);
  };
  it('keeps the 110–150 % FTP band for a rider with a typical curve (and with no profile)', () => {
    const [lo, hi] = targets(rider(460, 380, 320)); // 2.3 / 1.9 / 1.6 × FTP
    expect(lo).toBeCloseTo(1.1, 1); expect(hi).toBeCloseTo(1.5, 1);
    expect(targets(null)).toEqual([P.minFtp, P.maxFtp]);
  });
  it('asks a big sprinter for more and a diesel for less', () => {
    const [sLo, sHi] = targets(rider(800, 620, 480));
    expect(sLo).toBeGreaterThan(1.7); expect(sHi).toBeGreaterThan(2);
    const [dLo, dHi] = targets(rider(320, 290, 260)); // 1.6 / 1.45 / 1.3 × FTP
    expect(dLo).toBeCloseTo(1, 5); expect(dHi).toBeLessThan(1.3);
  });
  it('ignores easy efforts (only lower bounds)', () => {
    expect(targets(rider(250, 220, 200))).toEqual([P.minFtp, P.maxFtp]);
  });
});
