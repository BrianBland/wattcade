import { describe, expect, it } from 'vitest';
import { startTarget } from './countGate';

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
