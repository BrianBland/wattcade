import { describe, expect, it } from 'vitest';
import type { Button } from '../../../contracts';
import { createGameSession, NullInput, runHeadless, testProfile, TimelineInput } from '../../../core';
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

describe('Wattsurf controls', () => {
  const ride = (timeline: Array<{ t: number; press?: Button; release?: Button; paddleL?: number; paddleR?: number }>, secs: number) => {
    const s = createGameSession({ game: module, profile: testProfile(), input: new TimelineInput(timeline), media: { timeline: synthTimeline({ style: 'edm', songs: 1, short: true }) }, fake: { script: 'z2' }, simOpts: { difficulty: 'pro' } });
    s.step(Math.round(secs * 30));
    return s.sim.snapshot() as WattsurfSnapshot;
  };
  it('D-pad and Z/A step exactly one lane per press', () => {
    expect(ride([{ t: 1, press: 'left' }, { t: 1.1, release: 'left' }], 2).x).toBeCloseTo(-1, 3);
    expect(ride([{ t: 1, press: 'a' }, { t: 1.1, release: 'a' }], 2).x).toBeCloseTo(1, 3);
    expect(ride([{ t: 1, press: 'z' }, { t: 1.1, release: 'z' }, { t: 1.5, press: 'a' }, { t: 1.6, release: 'a' }], 2.5).x).toBeCloseTo(0, 3);
  });
  it('paddles set absolute position: pull = that side, rest = centre, the stronger paddle leads', () => {
    expect(ride([{ t: 1, paddleR: 1 }], 2).x).toBeCloseTo(1, 3);
    expect(ride([{ t: 1, paddleL: 0.8 }], 2).x).toBeCloseTo(-1, 3);
    expect(ride([{ t: 1, paddleR: 1 }, { t: 1.5, paddleR: 0 }], 2.5).x).toBeCloseTo(0, 3);          // let go → centre
    expect(ride([{ t: 1, paddleL: 0.5, paddleR: 0.9 }], 2).x).toBeCloseTo(1, 3);                     // right is stronger
    expect(ride([{ t: 1, paddleR: 0.2 }], 2).x).toBeCloseTo(0, 3);                                     // a light touch stays put
    // while the paddles rest, buttons work as usual
    expect(ride([{ t: 1, paddleR: 1 }, { t: 1.3, paddleR: 0 }, { t: 1.6, press: 'z' }, { t: 1.7, release: 'z' }], 2.5).x).toBeCloseTo(-1, 3);
  });
  it('elite (5 lanes): half a pull is one lane over, a full pull is the edge; holding a button repeats', () => {
    const elite = (tl: Parameters<typeof ride>[0], secs: number) => {
      const s = createGameSession({ game: module, profile: testProfile(), input: new TimelineInput(tl), media: { timeline: synthTimeline({ style: 'edm', songs: 1, short: true }) }, fake: { script: 'z2' }, simOpts: { difficulty: 'elite' } });
      s.step(Math.round(secs * 30)); return (s.sim.snapshot() as WattsurfSnapshot).x;
    };
    expect(elite([{ t: 1, paddleR: 0.5 }], 2)).toBeCloseTo(1, 3);
    expect(elite([{ t: 1, paddleL: 1 }], 2)).toBeCloseTo(-2, 3);
    expect(elite([{ t: 1, press: 'right' }], 3)).toBeCloseTo(2, 3);
  });
  it('ERG mode sets trainer watts per phase instead of grade', () => {
    const r = runHeadless({ game: module, script: 'z2', minutes: 4, seed: 1, simOpts: { autopilot: true, trainer: 'erg' }, media: { synth: { style: 'edm', songs: 1 } } });
    const erg = r.mixerCommands.filter((c) => c.mode === 'erg').map((c) => (c as { watts: number }).watts);
    expect(erg.length).toBeGreaterThan(3);
    expect(Math.max(...erg)).toBeGreaterThan(200); // sprint ≈ 1.12 FTP of a 200 W FTP
    expect(r.mixerCommands.some((c) => c.mode === 'sim' && c.gradePct > 1)).toBe(false);
    expect(r.summary.trainer).toBe('erg');
  });
});
