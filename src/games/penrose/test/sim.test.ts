import { describe, expect, it } from 'vitest';
import type { InputState } from '../../../contracts';
import { createGameSession, NullInput, testProfile } from '../../../core';
import { module } from '..';
import { LEVEL_CATALOG } from '../sim/catalog';
import type { PenroseSnapshot } from '../sim/types';

const press = (b: string): InputState => ({
  held: new Set([b]) as InputState['held'],
  pressed: new Set([b]) as InputState['pressed'],
  released: new Set(),
  paddleL: 0,
  paddleR: 0,
  paddleIdleS: 0,
  source: 'script',
});

describe('penrose pure-TS sim', () => {
  const mk = (saved?: unknown, opts?: Record<string, unknown>, script: 'z2' | 'intervals' | 'steady' = 'z2') => {
    const profile = testProfile();
    if (saved) profile.gameData.penrose = saved;
    let next: InputState | null = null;
    const base = new NullInput();
    const input = { beginTick: (dt: number) => base.beginTick(dt), state: () => next ?? base.state() };
    let last: unknown;
    const s = createGameSession({
      game: module,
      profile,
      input,
      fake: { script },
      seed: 1,
      simOpts: opts,
      onSave: (d) => { last = d; },
    });
    return {
      s,
      profile,
      saved: () => last,
      snap: () => s.sim.snapshot() as PenroseSnapshot,
      press: (b: string) => {
        next = press(b);
        s.step(1);
        next = null;
      },
    };
  };

  it('resumes at the saved level and exposes real controls on frame 0', () => {
    const { snap, s } = mk({ done: ['turntable'], at: 3 });
    expect(snap().levelIndex).toBe(3);
    expect(snap().done).toEqual(['turntable']);
    const hud = s.sim.hud!();
    expect(hud.controls?.length).toBeGreaterThan(0);
    expect(hud.touchControls).toEqual([]);
  });

  it('turns face buttons into machine toggles only for keys present in the level', () => {
    const { snap, press, s } = mk(undefined, { level: 0 });
    expect(snap().levelId).toBe('turntable');
    expect(s.sim.hud!().controls?.map((c) => c.button)).toEqual(['y', 'up']);

    press('a'); // unused button on level 0
    expect(snap().machines[0].on).toBe(false);

    press('y'); // engages turntable
    expect(snap().machines[0].on).toBe(true);
    expect(s.sim.hud!().controls?.[0].active).toBe(true);
  });

  it('D-pad Up cycles 2-tier hints (0 -> nudge -> explain -> 0)', () => {
    const { snap, press } = mk(undefined, { level: 0 });
    expect(snap().hintTier).toBe(0);
    press('up');
    expect(snap().hintTier).toBe(1);
    expect(snap().hintText.length).toBeGreaterThan(10);
    press('up');
    expect(snap().hintTier).toBe(2);
    expect(snap().hintText.length).toBeGreaterThan(20);
    press('up');
    expect(snap().hintTier).toBe(0);
  });

  it('pause-menu includes Chapters & Levels picker and navigates cleanly', () => {
    const { s, snap } = mk(undefined, { level: 0 });
    const actions = s.sim.menuActions!();
    const ids = actions.map((a) => a.id);
    expect(ids).toEqual(['picker', 'hint', 'restart', 'solve', 'next', 'prev']);

    // Open picker, jump to level 10, close
    s.sim.receive!({ type: 'cmd', kind: 'picker' });
    s.step(1);
    expect(snap().pickerOpen).toBe(true);

    s.sim.receive!({ type: 'goto', index: 10 });
    s.step(1);
    expect(snap().pickerOpen).toBe(false);
    expect(snap().levelIndex).toBe(10);
    expect(s.sim.checkpoint!()).toEqual({ at: 10 });
  });

  it('machine load raises the trainer grade and drops cleanly on auto-latch disengage', () => {
    const { s, press } = mk(undefined, { level: 0 });
    s.step(60);
    const grade = () => s.mixer.debug().activeEffects.find((e) => e.id === 'penrose')?.gradePct ?? NaN;
    const baseGrade = grade();

    press('y');
    s.step(30);
    const crankingGrade = grade();
    expect(crankingGrade).toBeGreaterThan(baseGrade);

    // Pedal until auto-latch completes the 90° swing and releases resistance
    s.step(300);
    expect(grade()).toBeLessThan(crankingGrade);
  });

  it('records rider clears and saves them, while autopilot solves never count as clears', () => {
    // 1. Autopilot solve on level 0 advances to level 1 but does NOT count as a rider clear
    const auto = mk(undefined, { level: 0, autopilot: true });
    for (let i = 0; i < 60 * 35; i++) {
      auto.s.step(1);
      if (auto.snap().levelIndex !== 0) break;
    }
    expect(auto.snap().levelIndex).toBe(1);
    expect(auto.s.sim.summary()).toMatchObject({ levelsCleared: 0, levelsDone: 0 });

    // 2. Manual clear on level 0 (engage turntable once, pedal through goal)
    const manual = mk(undefined, { level: 0 });
    manual.press('y');
    for (let i = 0; i < 60 * 30; i++) {
      manual.s.step(1);
      if (manual.snap().levelIndex !== 0) break;
    }
    expect(manual.snap().levelIndex).toBe(1);
    expect(manual.s.sim.summary()).toMatchObject({ levelsCleared: 1, firstClears: 1, levelsDone: 1 });
    expect(module.progressLine!({ done: ['turntable'], at: 1 })).toBe('1 level solved');
  });

  it('times the tide fully in on m-tide during high effort', () => {
    const tideIdx = LEVEL_CATALOG.findIndex((lv) => lv.id === 'm-tide');
    expect(tideIdx).toBeGreaterThan(0);
    const { s } = mk(undefined, { level: tideIdx }, 'intervals');
    // Step through an interval peak so tide rises to 100%
    s.step(60 * 90);
    expect(Number(s.sim.summary().tideFullS)).toBeGreaterThan(0);
  });
});
