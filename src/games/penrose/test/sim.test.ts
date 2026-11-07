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
    const s = createGameSession({ game: module, profile, input, fake: { script: 'z2' }, seed: 1 });
    return { s, profile, press: (b: string) => { next = press(b); s.step(1); next = null; } };
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
    expect(cmds.map((c) => c.kind)).toEqual(['restart', 'solve', 'next', 'prev']);
    expect(new Set(cmds.map((c) => c.id)).size).toBe(4);
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
});
