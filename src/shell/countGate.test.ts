import { describe, expect, it } from 'vitest';
import { canPause, openingPhase, startTarget } from './countGate';

describe('startTarget', () => {
  it('never says GO while the game menu is open', () => {
    expect(startTarget('intro', true)).toBe('menu');
    expect(startTarget('menu', true)).toBeNull();
  });
  it('says GO from the controls card or once the menu closes', () => {
    expect(startTarget('intro', false)).toBe('go');
    expect(startTarget('menu', false)).toBe('go');
  });
  it('ignores other phases', () => {
    for (const p of ['play', 'ending'] as const) expect(startTarget(p, false)).toBeNull();
  });
});

describe('openingPhase', () => {
  it('shows the controls card first, even before a game menu', () => {
    expect(openingPhase(true, true)).toBe('intro');
    expect(openingPhase(true, false)).toBe('intro');
  });
  it('skips the card when the rider has seen these controls', () => {
    expect(openingPhase(false, true)).toBe('menu');
    expect(openingPhase(false, false)).toBe('go');
  });
  it('can pause (and so leave) from a game menu or while riding, not from the card or the ending', () => {
    expect(canPause('menu')).toBe(true); expect(canPause('play')).toBe(true);
    for (const p of ['intro', 'ending'] as const) expect(canPause(p)).toBe(false);
  });
});
