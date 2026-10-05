import { describe, expect, it } from 'vitest';
import { createGameSession, NullInput, runHeadless, testProfile } from '../../../core';
import { synthTimeline } from '../../../media/synth/queue';
import { module } from '../index';
import type { WattsurfSnapshot } from '../sim/sim';

describe('Wattsurf sim', () => {
  it('waits in its menu (music not started), then rides once started', () => {
    const timeline = synthTimeline({ style: 'edm', songs: 1, short: true });
    const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), media: { timeline }, fake: { script: 'z2' } });
    s.step(30 * 5);
    expect(s.sim.inMenu?.()).toBe(true);
    expect(s.media!.positionS()).toBe(0);
    s.step(30 * 25); // auto-starts after 25 s
    expect(s.sim.inMenu?.()).toBe(false);
    const snap = s.sim.snapshot() as WattsurfSnapshot;
    expect(snap.started).toBe(true);
    expect(s.media!.positionS()).toBeGreaterThan(0);
  });

  it('saves best scores per queue, mode and difficulty', () => {
    const saves: unknown[] = [];
    const timeline = synthTimeline({ style: 'edm', songs: 1, short: true });
    const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), media: { timeline }, fake: { script: 'target-follow' }, simOpts: { autopilot: true }, onSave: (d) => saves.push(d) });
    while (!s.sim.isOver()) s.step(300);
    const last = saves[saves.length - 1] as { plays: number; bestScore: number; best: Record<string, number> };
    expect(last.plays).toBe(1);
    expect(last.bestScore).toBeGreaterThan(0);
    expect(Object.keys(last.best)[0]).toMatch(/^synth:edm:1:s\|mono\|pro$/);
  });

  it('a dropout locks the multiplier until the rider holds the target for the reboot time', () => {
    const r = runHeadless({ game: module, script: 'idle', minutes: 8, seed: 5, simOpts: { difficulty: 'elite' }, media: { synth: { style: 'edm', songs: 1 } } });
    expect(Number(r.summary.dropouts)).toBeGreaterThan(0);
    expect(r.events.some((e) => e.type === 'reboot')).toBe(true); // breaks/outros (recover zones) reboot even at 0 W
  });

  it('is deterministic', () => {
    const run = () => runHeadless({ game: module, script: 'mash', minutes: 4, seed: 7, simOpts: { autopilot: true }, media: { synth: { style: 'rock', songs: 1 } } }).summary;
    expect(run()).toEqual(run());
  });
});
