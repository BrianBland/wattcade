import { describe, expect, it } from 'vitest';
import type { GameContext, GameModule } from '../contracts';
import { FIXED_DT } from '../contracts';
import { synthTimeline } from '../media/synth/queue';
import { createGameSession, NullInput, runHeadless, testProfile } from '.';

/** A toy music game: sits in a menu for `menuS`, then counts beats it has passed. */
function musicGame(menuS: number): GameModule {
  return {
    id: 'toymusic', title: 'Toy music', blurb: '', tags: [], requires: { media: ['pcm'] },
    createSim(ctx: GameContext) {
      let beatIdx = 0, beatsSeen = 0;
      return {
        update() {
          const m = ctx.media!; const p = m.positionS();
          while (beatIdx < m.timeline.beats.length && m.timeline.beats[beatIdx] <= p) { beatIdx++; beatsSeen++; }
        },
        inMenu: () => ctx.clock.now() < menuS,
        snapshot: () => ({ pos: ctx.media?.positionS() ?? -1, started: ctx.media?.started() ?? false, beatsSeen }),
        isOver: () => (ctx.media?.positionS() ?? 0) >= (ctx.media?.timeline.durationS ?? 0),
        summary: () => ({ beatsSeen }),
      };
    },
    loadRenderer: () => Promise.reject(new Error('no renderer')),
  };
}

describe('media sessions', () => {
  it('program clock waits for the pre-game menu, then runs with the sim', () => {
    const timeline = synthTimeline({ style: 'edm', songs: 1, short: true });
    const s = createGameSession({ game: musicGame(2), profile: testProfile(), input: new NullInput(), media: { timeline } });
    s.step(30); // 1 s, still in the menu
    expect(s.media!.started()).toBe(false);
    expect(s.media!.positionS()).toBe(0);
    s.step(90); // 3 s more: menu ended at 2 s
    expect(s.media!.started()).toBe(true);
    expect(s.media!.positionS()).toBeCloseTo(2, 1);
  });

  it('setTrim locks the loop scale to the music clock (0 holds, null releases)', () => {
    const timeline = synthTimeline({ style: 'edm', songs: 1, short: true });
    const s = createGameSession({ game: musicGame(0), profile: testProfile(), input: new NullInput(), media: { timeline } });
    s.clock.timeScale = 10;
    s.media!.setTrim(1);
    s.frame(1);
    expect(s.media!.positionS()).toBeCloseTo(1, 1);
    s.media!.setTrim(0);
    s.frame(1);
    expect(s.media!.positionS()).toBeCloseTo(1, 1);
    s.media!.setTrim(null);
    s.frame(0.1);
    expect(s.media!.positionS()).toBeCloseTo(2, 1);
    expect(s.debugValues()['media.trim']).toBe('free');
  });

  it('runHeadless gives media games a synth queue and the sim sees every beat', () => {
    const r = runHeadless({ game: musicGame(0), script: 'z2', minutes: 20, seed: 1, media: { synth: { style: 'mixed', songs: 2, mix: 'automix' } } });
    const tl = synthTimeline({ style: 'mixed', songs: 2, mix: 'automix' });
    expect(r.isOver).toBe(true);
    expect(r.summary.beatsSeen).toBe(tl.beats.length);
    expect(r.simMinutes * 60).toBeCloseTo(tl.durationS, 0);
  });

  it('defaults to one synth song for media games; none for others', () => {
    const r = runHeadless({ game: musicGame(0), script: 'z2', minutes: 0.1, seed: 1 });
    expect(Number(r.summary.beatsSeen)).toBeGreaterThan(0);
    const s = createGameSession({ game: { ...musicGame(0), requires: undefined }, profile: testProfile(), input: new NullInput() });
    expect(s.ctx.media).toBeUndefined();
    expect(FIXED_DT).toBeCloseTo(1 / 30);
  });
});
