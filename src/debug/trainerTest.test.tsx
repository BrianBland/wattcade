// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { TrainerTest, TRAINER_TESTS } from './TrainerTest';

describe('TrainerTest panel', () => {
  it('calls applyTest with each preset command', () => {
    const apply = vi.fn();
    const root = document.createElement('div');
    render(<TrainerTest applyTest={apply} />, root);
    const btns = root.querySelectorAll('button');
    expect(btns.length).toBe(TRAINER_TESTS.length);
    btns.forEach((b) => (b as HTMLButtonElement).click());
    expect(apply).toHaveBeenCalledWith({ mode: 'sim', gradePct: 5 });
    expect(apply).toHaveBeenCalledWith({ mode: 'erg', watts: 200 });
    expect(apply).toHaveBeenCalledWith({ mode: 'resistance', levelPct: 50 });
    expect(apply).toHaveBeenCalledTimes(TRAINER_TESTS.length);
  });
});
