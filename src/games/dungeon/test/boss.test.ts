import { describe, expect, it } from 'vitest';
import { DEFAULT_BOSS as C, bigEvery, bossDamageMult, bossStunned, newBoss, phaseFor, stepBoss, strikeBoss, tideBonus } from '../sim/boss';

const tick = (s: ReturnType<typeof newBoss>, secs: number, hpFrac = 1, wardUp = false) => {
  const ev: string[] = [];
  for (let k = 0; k < Math.round(secs * 20); k++) ev.push(...stepBoss(s, { dt: 0.05, hpFrac, wardUp }));
  return ev;
};

describe('boss framework (pure)', () => {
  it('three phases split by HP, with a stagger between them', () => {
    expect([phaseFor(1), phaseFor(0.6), phaseFor(0.2)]).toEqual([1, 2, 3]);
    const s = newBoss();
    expect(tick(s, 0.1, 0.6)).toContain('phase');
    expect(s.phase).toBe(2); expect(s.cycle).toBe('stagger'); expect(bossStunned(s)).toBe(true);
    tick(s, C.staggerS + 0.1, 0.6); expect(s.cycle).toBe('idle');
    expect(tick(s, 0.1, 0.3)).toContain('phase'); expect(s.phase).toBe(3);
    expect(bigEvery(3)).toBeLessThan(bigEvery(1));
  });
  it('telegraph, big attack, then an exposed window with x2 damage', () => {
    const s = newBoss();
    const ev = tick(s, C.bigEveryS * 0.6 + 0.1);
    expect(ev).toContain('windup'); expect(s.cycle).toBe('windup');
    expect(bossDamageMult(s)).toBe(1);
    const ev2 = tick(s, C.windupS);
    expect(ev2).toEqual(expect.arrayContaining(['bigAttack', 'exposed']));
    expect(bossDamageMult(s)).toBe(C.exposedMult); expect(bossStunned(s)).toBe(true);
    expect(tick(s, C.exposedS)).toContain('exposedEnd'); expect(s.cycle).toBe('idle');
  });
  it('Ward up at the big attack parries (longer window); one timed Strike extends it', () => {
    const s = newBoss(); tick(s, C.bigEveryS * 0.6 + 0.1); tick(s, C.windupS, 1, true);
    expect(s.parried).toBe(true); expect(s.left).toBeGreaterThan(C.exposedS + C.parryBonusS - 0.2);
    const before = s.left;
    expect(strikeBoss(s)).toBe(true); expect(s.left).toBeCloseTo(before + C.strikeBonusS, 5);
    expect(strikeBoss(s)).toBe(false); // once per window
    const idle = newBoss(); expect(strikeBoss(idle)).toBe(false);
  });
  it('Turning Tide ramps boss damage taken after a long fight', () => {
    expect(tideBonus(C.tideAfterS - 1)).toBe(0);
    expect(tideBonus(C.tideAfterS + 50)).toBeCloseTo(0.5, 5);
    expect(tideBonus(9999)).toBe(C.tideMax);
    const s = newBoss(); expect(tick(s, C.tideAfterS + 0.1, 0.9)).toContain('tide');
  });
});
