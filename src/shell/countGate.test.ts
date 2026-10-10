import { describe, expect, it } from 'vitest';
import { canPause, openingPhase, startTarget } from './countGate';

describe('startTarget', () => {
  it('never counts down while the game menu is open', () => {
    expect(startTarget('intro', true)).toBe('menu');
    expect(startTarget('menu', true)).toBeNull();
  });
  it('counts down from the intro or after the menu closes', () => {
    expect(startTarget('intro', false)).toBe('count');
    expect(startTarget('menu', false)).toBe('count');
  });
  it('ignores other phases', () => {
    for (const p of ['count', 'play', 'ending'] as const) expect(startTarget(p, false)).toBeNull();
  });
});

describe('openingPhase', () => {
  it("skips the generic intro card when the game shows its own menu", () => {
    expect(openingPhase(true)).toBe('menu');
    expect(openingPhase(false)).toBe('intro');
  });
  it('can pause (and so leave) from a game menu or while riding, not mid-countdown', () => {
    expect(canPause('menu')).toBe(true); expect(canPause('play')).toBe(true);
    for (const p of ['intro', 'count', 'ending'] as const) expect(canPause(p)).toBe(false);
  });
});
