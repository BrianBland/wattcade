// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { GameModule, Profile } from '../../contracts';
import { defaultProfile } from '../../progression';

vi.mock('../services', () => ({ input: { state: () => ({ held: new Set(), pressed: new Set(), released: new Set(), paddleL: 0, paddleR: 0 }) } }));
import { adoptWarm, cancelPrewarm, prewarmGame, takeWarmGame } from './prewarm';

function fakeGame(id = 'fake') {
  const log: string[] = [];
  let send: ((a: unknown) => void) | undefined;
  const game = {
    id, title: 'Fake', blurb: '', tags: [], createSim: () => ({ step() {}, snapshot: () => ({ n: 1 }), isOver: () => false, summary: () => ({}) }),
    loadRenderer: async () => ({
      mount: (_el: HTMLElement, ctx: { send?: (a: unknown) => void }) => { log.push('mount'); send = ctx.send; },
      ready: async () => { log.push('ready'); },
      render: () => { log.push('render'); send?.({ type: 'hello' }); },
      unmount: () => { log.push('unmount'); },
    }),
  } as unknown as GameModule;
  return { game, log };
}
const profile: Profile = { ...defaultProfile('R'), id: 'p1' };

describe('prewarmGame', () => {
  it('mounts hidden, waits for ready, draws one frame, and hands it to GameHost once', async () => {
    const { game, log } = fakeGame();
    const w = await prewarmGame(game, profile);
    expect(log).toEqual(['mount', 'ready', 'render']);
    expect(w?.host.isConnected).toBe(true);
    expect(w?.host.style.opacity).toBe('0');
    expect(takeWarmGame('other', 'p1')).toBeNull();
    expect(await takeWarmGame('fake', 'p1')).toBe(w);
    expect(takeWarmGame('fake', 'p1')).toBeNull();
    const mount = document.createElement('div'); adoptWarm(w!, mount);
    expect(w!.host.parentElement).toBe(mount);
    expect(w!.host.style.opacity).toBe('');
  });
  it('replays what the warm-up frame sent once the real session attaches', async () => {
    const { game } = fakeGame();
    const w = await prewarmGame(game, profile);
    const got: unknown[] = [];
    w!.attach((a) => got.push(a));
    expect(got).toEqual([{ type: 'hello' }]);
  });
  it('a cancelled load is unmounted and removed', async () => {
    const { game, log } = fakeGame();
    const w = await prewarmGame(game, profile);
    cancelPrewarm(); await Promise.resolve(); await Promise.resolve();
    expect(log).toContain('unmount');
    expect(w!.host.isConnected).toBe(false);
    expect(takeWarmGame('fake', 'p1')).toBeNull();
  });
});
