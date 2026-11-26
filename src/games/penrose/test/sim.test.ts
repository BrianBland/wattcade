import { describe, expect, it } from 'vitest';
import { createGameSession, NullInput, testProfile } from '../../../core';
import type { InputState } from '../../../contracts';
import { module } from '..';
import type { PenroseSnapshot } from '../sim/sim';

const press = (b: string): InputState => ({ held: new Set([b]) as InputState['held'], pressed: new Set([b]) as InputState['pressed'], released: new Set(), paddleL: 0, paddleR: 0, paddleIdleS: 0, source: 'script' });

describe('penrose sim (bike ↔ engine bridge)', () => {
  const mk = (saved?: unknown) => {
    const profile = testProfile(); if (saved) profile.gameData.penrose = saved;
    let next: InputState | null = null; const base = new NullInput();
    const input = { beginTick: (dt: number) => base.beginTick(dt), state: () => next ?? base.state() };
    let last: unknown;
    const s = createGameSession({ game: module, profile, input, fake: { script: 'z2' }, seed: 1, onSave: (d) => { last = d; } });
    return { s, profile, saved: () => last, press: (b: string) => { next = press(b); s.step(1); next = null; } };
  };

  it('resumes at the saved level', () => {
    const { s } = mk({ done: ['x'], at: 7 });
    s.step(1);
    const snap = s.sim.snapshot() as PenroseSnapshot;
    expect(snap.start).toBe(7);
    expect(snap.done).toEqual(['x']);
  });

  it('turns face buttons into toggle commands only for machines in the level', () => {
    const { s, press } = mk();
    press('y');
    expect((s.sim.snapshot() as PenroseSnapshot).cmds).toEqual([]);
    s.sim.receive!({ type: 'level', index: 0, id: 'turntable', name: 'The turntable switch', machines: [{ key: 'y', name: 'Turntable' }] });
    s.step(1);
    press('y'); press('a');
    const cmds = (s.sim.snapshot() as PenroseSnapshot).cmds;
    expect(cmds.map((c) => c.kind === 'toggle' && c.key)).toEqual(['y']);
    expect(s.sim.hud!().controls?.map((c) => c.button)).toEqual(['y']);
  });

  it('records clears (not autopilot solves) and saves them', () => {
    const { s } = mk();
    s.sim.receive!({ type: 'level', index: 0, id: 'turntable', name: 'T', machines: [] });
    s.sim.receive!({ type: 'won', index: 0, id: 'turntable', solved: true });
    s.sim.receive!({ type: 'won', index: 0, id: 'turntable', solved: false });
    s.sim.receive!({ type: 'level', index: 1, id: 'next', name: 'N', machines: [] });
    s.step(1);
    expect(s.sim.summary()).toMatchObject({ levelsCleared: 1, firstClears: 1, levelsDone: 1, at: 2 });
    expect(module.progressLine!({ done: ['turntable'], at: 1 })).toBe('1 level solved');
  });

  it('pause-menu picks become numbered commands', () => {
    const { s } = mk();
    for (const a of s.sim.menuActions!()) s.sim.receive!(a.action);
    s.step(1);
    const cmds = (s.sim.snapshot() as PenroseSnapshot).cmds;
    expect(cmds.map((c) => c.kind)).toEqual(['hint', 'restart', 'solve', 'next', 'prev']);
    expect(new Set(cmds.map((c) => c.id)).size).toBe(5);
  });

  it('machine load raises the trainer grade', () => {
    const { s } = mk();
    s.step(2);
    const grade = () => s.mixer.debug().activeEffects.find((e) => e.id === 'penrose')?.gradePct ?? NaN;
    const lo = grade();
    s.sim.receive!({ type: 'load', v: 1 });
    s.step(2);
    expect(grade()).toBeGreaterThan(lo);
  });

  describe('mastery tracking for achievements', () => {
    const lv = (index: number, chapter: number, id = `L${index}`) => ({ type: 'level', index, id, name: id, machines: [], chapter });
    const won = (index: number, id = `L${index}`) => ({ type: 'won', index, id, solved: false });
    const feed = (s: ReturnType<typeof mk>['s'], ...as: unknown[]) => { for (const a of as) { s.sim.receive!(a); s.step(1); } };

    it('a fall or a hint on a visit spoils the clean clear; falls carry over the reload of the same level', () => {
      const { s, saved } = mk();
      feed(s, { type: 'catalog', chapters: [[], [], ['L0', 'L1', 'L2']] });
      feed(s, lv(0, 2), won(0));                                       // clean
      feed(s, lv(1, 2), { type: 'fell', index: 1 }, lv(1, 2), won(1));  // fell, level reloads, then clears
      feed(s, lv(2, 2), { type: 'cmd', kind: 'hint' }, won(2));         // peeked
      expect(s.sim.summary()).toMatchObject({ cleanLevels: 1, levelsRidden: 3, chaptersDone: 0b100 });
      expect((saved() as { clean: string[] }).clean).toEqual(['L0']);
    });

    it('a run of clean clears from chapter 4 on breaks on a skip, a fall or a solve', () => {
      const { s } = mk();
      feed(s, lv(0, 3), won(0), lv(1, 3), won(1), lv(2, 3));
      feed(s, lv(3, 3), won(3));                                        // L2 was skipped: the run starts again
      feed(s, lv(4, 3), won(4), lv(5, 3), won(5));
      expect(s.sim.summary().bestStreak).toBe(3);
      feed(s, lv(6, 0), won(6));                                        // chapter 1 doesn't extend it
      expect(s.sim.summary().bestStreak).toBe(3);
    });

    it('a chapter cleared unaided in one ride counts once; solves never count', () => {
      const { s } = mk();
      const ch = 4, ids = ['A', 'B'];
      feed(s, { type: 'catalog', chapters: [[], [], [], [], ids] });
      feed(s, lv(0, ch, 'A'), { type: 'won', index: 0, id: 'A', solved: true }, lv(1, ch, 'B'), won(1, 'B'));
      expect(s.sim.summary()).toMatchObject({ unaidedChapters: 0, levelsRidden: 1 });
      feed(s, lv(0, ch, 'A'), won(0, 'A'));
      expect(s.sim.summary().unaidedChapters).toBe(1);
      expect(s.sim.summary().chaptersDone).toBe(1 << ch);
    });

    it('times the tide fully in while pedalling', () => {
      const { s } = mk();
      feed(s, lv(0, 4), { type: 'tide', v: 1 });
      s.step(5 * 60);
      expect(Number(s.sim.summary().tideFullS)).toBeGreaterThanOrEqual(4);
      feed(s, lv(1, 4));                                                // a new level starts with the tide out
      const before = Number(s.sim.summary().tideFullS); s.step(120);
      expect(Number(s.sim.summary().tideFullS)).toBe(before);
    });
  });
});

