import { describe, expect, it } from 'vitest';
import type { Button } from '../../../contracts';
import { scenarios } from '../scenarios';
import { createGameSession, NullInput, runHeadless, testProfile, TimelineInput } from '../../../core';
import { synthTimeline } from '../../../media/synth/queue';
import { module } from '../index';
import { isChainMilestone, rateLaunch, type CadenzaSnapshot, type CadenzaSave } from '../sim/sim';
import { rideTimeline } from './fixtures';

describe('Cadenza sim', () => {
  it('waits in its menu (music not started), then rides once started', () => {
    const timeline = synthTimeline({ style: 'edm', songs: 1, short: true });
    const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), media: { timeline }, fake: { script: 'z2' } });
    s.step(30 * 5);
    expect(s.sim.inMenu?.()).toBe(true);
    expect(s.media!.positionS()).toBe(0);
    s.step(30 * 25); // auto-starts after 25 s
    expect(s.sim.inMenu?.()).toBe(false);
    const snap = s.sim.snapshot() as CadenzaSnapshot;
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

  it('eases trainer demand for protected recovery even when the music is still a build', () => {
    const timeline = rideTimeline([[0, 110, 'build'], [110, 150, 'drop'], [150, 220, 'build']], [0, 100]);
    for (const trainer of ['grade', 'erg']) {
      const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), media: { timeline }, fake: { script: 'target-follow' }, simOpts: { difficulty: 'pro', autopilot: true, trainer } });
      s.step(30 * 100);
      const snap = s.sim.snapshot() as CadenzaSnapshot;
      expect(snap.zone.kind).toBe('build'); expect(snap.effort.phase).toBe('recover'); expect(snap.effort.instruction).toBe('Break');
      expect(snap.shield).toBeGreaterThan(90);
      const command = s.mixer.command!;
      if (command.mode === 'sim') expect(command.gradePct).toBeLessThan(0.7);
      else if (command.mode === 'erg') expect(command.watts).toBeLessThan(testProfile().ftp * 0.6);
      else throw new Error('Expected a trainer demand');
    }
  });

  it('a dropout locks the multiplier until the rider holds the target for the reboot time', () => {
    const r = runHeadless({ game: module, script: 'idle', minutes: 8, seed: 5, simOpts: { difficulty: 'elite' }, media: { synth: { style: 'edm', songs: 1 } } });
    expect(Number(r.summary.dropouts)).toBeGreaterThan(0);
    expect(r.events.some((e) => e.type === 'reboot')).toBe(true); // breaks/outros (recover zones) reboot even at 0 W
  });

  it('riding under the target fades in, then drains the shield; riding over a zone ceiling overcharges', () => {
    const timeline = rideTimeline([[0, 40, 'intro'], [40, 100, 'build'], [100, 140, 'drop'], [140, 200, 'break']]);
    const at = (script: string, kind: string) => {
      const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), media: { timeline }, fake: { script }, simOpts: { autopilot: true, difficulty: 'pro' } });
      const z = timeline.sections.find((x) => x.kind === kind)!;
      while (s.media!.positionS() < z.t0 + 10) s.step(30);
      return s.sim.snapshot() as CadenzaSnapshot;
    };
    const climbing = at('z2', 'build'); // 0.65 FTP against a Z4 floor
    expect(climbing.effort.ok).toBe(false);
    expect(climbing.effort.under).toBeGreaterThan(0.6);
    expect(climbing.shield).toBeLessThan(100);
    expect(climbing.effort.over).toBe(0);
    const cruising = at('intervals', 'intro'); // 1.05 FTP against a Z2–3 cruise
    expect(cruising.effort.ok).toBe(true);
    expect(cruising.effort.under).toBe(0);
    expect(cruising.effort.over).toBeGreaterThan(0.4);
    expect(cruising.effort.ceilingWatts).toBeGreaterThan(cruising.effort.watts);
  });

  it('rates each drop\'s launch roll by the effort over it and pays a bonus', () => {
    const r = runHeadless({ game: module, script: 'sprints', minutes: 6, seed: 3, simOpts: { autopilot: true }, media: { synth: { style: 'edm', songs: 1 } } });
    const ls = r.events.filter((e) => e.type === 'launch');
    expect(ls.length).toBeGreaterThan(0);
    for (const l of ls) expect(['perfect', 'great', 'good', 'weak']).toContain(l.data?.rating);
    const idle = runHeadless({ game: module, script: 'idle', minutes: 6, seed: 3, simOpts: { autopilot: true }, media: { synth: { style: 'edm', songs: 1 } } });
    expect(idle.events.filter((e) => e.type === 'launch').every((e) => e.data?.rating === 'weak' && e.data?.bonus === 0)).toBe(true);
    expect(rateLaunch(1.2).r).toBe('perfect'); expect(rateLaunch(1.0).r).toBe('great'); expect(rateLaunch(0.9).r).toBe('good'); expect(rateLaunch(0.5).r).toBe('weak');
  });

  it('recaps every finished song (score, accuracy, launches, effort strip) and flags chain milestones', () => {
    const timeline = synthTimeline({ style: 'edm', songs: 2, short: true });
    const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), media: { timeline }, fake: { script: 'target-follow' }, simOpts: { autopilot: true } });
    const cues: string[] = [];
    while (!s.sim.isOver()) { s.step(30); for (const c of (s.sim.snapshot() as CadenzaSnapshot).cues) if (!cues.includes(`${c.id}:${c.type}`)) cues.push(`${c.id}:${c.type}`); }
    const snap = s.sim.snapshot() as CadenzaSnapshot;
    expect(snap.recaps.map((r) => r.n)).toEqual([1, 2]);
    const [a, b] = snap.recaps;
    expect(a.score + b.score).toBeLessThanOrEqual(snap.score); // + the last zone's clean bonus, paid at the very end
    expect(a.score + b.score).toBeGreaterThan(snap.score * 0.9);
    expect(a.accuracyPct).toBeGreaterThan(80);
    expect(a.onTargetPct).toBeGreaterThan(80);
    expect(Math.abs(a.strip.length - (timeline.songs[0].t1 - timeline.songs[0].t0))).toBeLessThan(3);
    expect(cues.some((c) => c.endsWith(':chain'))).toBe(true);
    expect(isChainMilestone(25) && isChainMilestone(100) && !isChainMilestone(75)).toBe(true);
  });

  it('is deterministic', () => {
    const run = () => runHeadless({ game: module, script: 'mash', minutes: 4, seed: 7, simOpts: { autopilot: true }, media: { synth: { style: 'rock', songs: 1 } } }).summary;
    expect(run()).toEqual(run());
  });
});

describe('Cadenza controls', () => {
  const ride = (timeline: Array<{ t: number; press?: Button; release?: Button; paddleL?: number; paddleR?: number }>, secs: number) => {
    const s = createGameSession({ game: module, profile: testProfile(), input: new TimelineInput(timeline), media: { timeline: synthTimeline({ style: 'edm', songs: 1, short: true }) }, fake: { script: 'z2' }, simOpts: { difficulty: 'pro' } });
    s.step(Math.round(secs * 30));
    return s.sim.snapshot() as CadenzaSnapshot;
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
      s.step(Math.round(secs * 30)); return (s.sim.snapshot() as CadenzaSnapshot).x;
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

it('applies rolling timeline revisions without resetting score or collected blocks', () => {
  const timeline = { ...synthTimeline({ style: 'edm', songs: 1, short: true }), revision: 0, updateFromS: undefined as number | undefined };
  const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), media: { timeline }, fake: { script: 'target-follow' }, simOpts: { autopilot: true } });
  s.step(30 * 20);
  const before = s.sim.snapshot() as CadenzaSnapshot;
  const kept = before.track.blocks.filter((b) => b.t < 60).length;
  const states = [...before.blockState.slice(0, kept)];
  const summary = s.sim.summary();
  timeline.onsets = timeline.onsets.filter((o) => o.t < 60);
  timeline.revision++; timeline.updateFromS = 60;
  s.step(1);
  const after = s.sim.snapshot() as CadenzaSnapshot;
  expect(after.track).not.toBe(before.track);
  expect(after.track.blocks.slice(0, kept)).toEqual(before.track.blocks.slice(0, kept));
  expect([...after.blockState.slice(0, kept)]).toEqual(states);
  expect(Number(s.sim.summary().score)).toBeGreaterThanOrEqual(Number(summary.score));
  expect(timeline.updateFromS).toBeUndefined();
});

describe('cadenza scenarios (runHeadless)', () => {
  for (const sc of scenarios) {
    it(sc.name, () => {
      const r = runHeadless({ game: module, script: sc.script, minutes: sc.minutes, seed: sc.seed, simOpts: sc.simOpts, media: sc.media });
      expect(sc.assert(r.summary, r.stats, r), JSON.stringify(r.summary)).toEqual([]);
    });
  }
});
