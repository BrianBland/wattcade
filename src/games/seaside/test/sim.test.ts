import { describe, expect, it } from 'vitest';
import { createGameSession, NullInput, runHeadless, testProfile } from '../../../core';
import { module } from '../index';
import { STORY } from '../sim/story';
import type { SeasideSave, SeasideSnapshot } from '../sim/types';

const session = (save?: unknown, simOpts?: Record<string, unknown>) => {
  const saves: unknown[] = [];
  const s = createGameSession({
    game: module, profile: testProfile({ gameData: save ? { seaside: save } : {} }), input: new NullInput(),
    fake: { script: 'z2' }, seed: 1, simOpts, onSave: (d) => saves.push(d),
  });
  return { s, saves, snap: () => s.sim.snapshot() as SeasideSnapshot };
};

describe('seaside sim', () => {
  it('starts fresh at the title with the Morning card and no menu', () => {
    const { s, snap } = session();
    expect(s.sim.inMenu?.()).toBe(false);
    s.step(3);
    expect(snap().sceneId).toBe('title');
    expect(snap().chapterCard?.name).toBe('Morning');
  });
  it('offers continue / chapter select from the profile save, and the renderer can pick', () => {
    const save: SeasideSave = { v: 1, rides: 1, chapterSelect: true, checkpoint: { sceneId: 'belly', progress: 0 } };
    const { s, snap } = session(save);
    expect(s.sim.inMenu?.()).toBe(true);
    expect(snap().menu?.items.map((i) => i.id)).toEqual(['continue', 'new', 'ch1', 'ch2']);
    s.sim.receive?.({ type: 'menu', index: 3 });
    s.step(1);
    expect(s.sim.inMenu?.()).toBe(false);
    expect(snap().sceneId).toBe('cavern');
  });
  it('saves at chapter boundaries and resumes there', () => {
    const { s, saves } = session(undefined, { chapter: 0 });
    const chapterSave = () => saves.find((d) => (d as SeasideSave).checkpoint?.progress === 0) as SeasideSave | undefined;
    let guard = 0;
    while (!chapterSave() && guard++ < 30 * 60 * 60) s.step(30);
    expect(chapterSave()?.checkpoint).toEqual({ sceneId: 'eyesOpen', progress: 0 });
    const r = session(chapterSave(), { skipMenu: true });
    r.s.step(1);
    expect(r.snap().sceneId).toBe('eyesOpen');
    expect(r.snap().chapter).toBe(1);
  });
  it('keeps unknown save fields and unlocks chapter select at the end', () => {
    const { s, saves, snap } = session({ v: 1, rides: 0, chapterSelect: false, checkpoint: { sceneId: 'angel', progress: 0.9 }, coins: 42 }, { skipMenu: true });
    s.step(30 * 30);
    expect(snap().over).toBe(true);
    expect(saves.at(-1)).toMatchObject({ rides: 1, chapterSelect: true, checkpoint: null, coins: 42 });
  });
  it('rail speed and routeS advance on a ride, not in effort-gated scenes', () => {
    const { s, snap } = session({ v: 1, rides: 0, chapterSelect: false, checkpoint: { sceneId: 'highway', progress: 0 } }, { skipMenu: true });
    s.step(30 * 20);
    expect(snap().speed).toBeGreaterThan(3);
    expect(snap().routeS).toBeGreaterThan(50);
    const { s: s2, snap: snap2 } = session({ v: 1, rides: 0, chapterSelect: false, checkpoint: { sceneId: 'turnout1', progress: 0 } }, { skipMenu: true });
    const r0 = snap2().routeS; s2.step(30 * 20);
    expect(snap2().speed).toBe(0);
    expect(snap2().routeS).toBe(r0);
    expect(snap2().scene.progress).toBeGreaterThan(0);
  });
  it('not sprinting adds 10–15 min to the ride (fish fights are not paid back by the pace nudge)', () => {
    const min = (script: string) => Number(runHeadless({ game: module, script, minutes: 170, seed: 1 }).summary['Ride minutes']);
    const gap = min('z2') - min('target-follow');
    expect(gap).toBeGreaterThanOrEqual(10);
    expect(gap).toBeLessThanOrEqual(15);
  }, 60_000); // two full headless rides
  it('covers every storyboard scene once', () => {
    expect(STORY.length).toBe(33);
  });
});
