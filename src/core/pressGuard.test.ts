import { describe, expect, it } from 'vitest';
import { PressGuard, COMMIT_GUARD_S } from './pressGuard';

describe('PressGuard', () => {
  it('passes the first commit and swallows a second inside the hold', () => {
    const g = new PressGuard(0.25);
    expect(g.pass(10)).toBe(true);
    expect(g.pass(10)).toBe(false);     // same tick (e.g. hardware A and a touch tap together)
    expect(g.pass(10.2)).toBe(false);
    expect(g.pass(10.25)).toBe(true);
  });
  it('does not extend the hold with swallowed presses (a chattering button still gets through after the hold)', () => {
    const g = new PressGuard(0.25);
    g.pass(0); g.pass(0.1); g.pass(0.2);
    expect(g.pass(0.26)).toBe(true);
  });
  it('arm starts a hold without a commit, reset clears it, a zero hold never blocks', () => {
    const g = new PressGuard(0.25);
    g.arm(5); expect(g.pass(5.1)).toBe(false);
    g.reset(); expect(g.pass(5.1)).toBe(true);
    expect(g.pass(5.1, 0)).toBe(true);
  });
  it('a clock that goes backwards (a restarted sim) does not lock commits out', () => {
    const g = new PressGuard();
    g.pass(100);
    expect(g.pass(0)).toBe(true);
    expect(COMMIT_GUARD_S).toBeGreaterThan(0);
  });
});
