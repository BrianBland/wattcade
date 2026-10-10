import { describe, expect, it } from 'vitest';
import { createGameSession, NullInput, testProfile } from '../../../core';
import { RollingQueue, estimatedAnalysis } from '../../../media/online/rolling';
import { freezeMerge } from '../../../media/online/freeze';
import type { MediaTimeline } from '../../../contracts';
import type { MixItem } from '../../../media/mix/plan';
import { module } from '../index';
import { trackCues } from '../sim/announcements';
import { buildTrack, DIFF, effortAt } from '../sim/track';
import { planRide } from '../sim/ride';
import type { CadenzaSnapshot } from '../sim/sim';
import { rideTimeline } from './fixtures';

const options = { difficulty: 'pro' as const, mode: 'mono' as const, seed: 1 };
const grid = (step: number, start: number, end: number) => Array.from({ length: Math.max(0, Math.ceil((end - start) / step)) }, (_, i) => start + i * step);
const session = (timeline: MediaTimeline, announce?: (id: string, t: number) => void) => createGameSession({
  game: module, profile: testProfile(), input: new NullInput(), media: { timeline, announce },
  fake: { script: 'z2' }, simOpts: { difficulty: 'pro', menu: false },
});

describe('Cadenza rolling cues', () => {
  it('keeps every announced identity and exact time through many shifting RollingQueue revisions', async () => {
    let revision = 0;
    const item: MixItem = { id: 'rolling', title: 'Rolling', artist: '', analysis: estimatedAnalysis(300) };
    const q = new RollingQueue([item], 'continuous', 40, async (_, __, duration) => {
      revision++;
      return { buffer: { duration } as AudioBuffer, analysis: {
        ...estimatedAnalysis(duration), bpm: 120, beats: grid(0.5, 0, duration),
        downbeats: grid(2, 0, duration), phrases: grid(16, 0, duration),
      } };
    });
    const shift = () => {
      const a = item.analysis, delta = revision * 0.05;
      a.beats = grid(0.5, delta, 300); a.downbeats = grid(2, delta, 300); a.phrases = grid(16, delta, 300);
      a.onsets = a.beats.map((t) => ({ t, s: 0.8, band: 0 as const }));
      a.sections = [
        { t0: 0, t1: 40 + delta, kind: 'build', energy: 0.5 },
        { t0: 40 + delta, t1: 70 + delta, kind: 'drop', energy: 1 },
        { t0: 70 + delta, t1: 180 + delta, kind: 'verse', energy: 0.5 },
        { t0: 180 + delta, t1: 210 + delta, kind: 'drop', energy: 1 },
        { t0: 210 + delta, t1: 300, kind: 'outro', energy: 0.3 },
      ];
    };
    shift(); await q.prepare(0);
    const announced = new Map<string, number>();
    let calls = 0;
    const s = session(q.timeline, (id, t) => {
      expect(announced.has(id)).toBe(false); // each identity is announced once
      announced.set(id, t); calls++; q.announce(id, t);
    });
    s.step(1);
    for (let p = 7; p < 280; p += 7) {
      s.step(7 * 30);
      const old = (s.sim.snapshot() as CadenzaSnapshot).track;
      const frozen = q.timeline.frozenUntilS ?? 0;
      shift(); await q.prepare(p); s.step(1);
      const track = (s.sim.snapshot() as CadenzaSnapshot).track;
      const cues = new Map(trackCues(track).map((c) => [c.id, c.t]));
      for (const [id, t] of announced) expect(cues.get(id), `${id} after revision ${q.timeline.revision}`).toBe(t);
      const cut = Math.ceil(frozen * old.hz);
      for (const key of ['dist', 'speed', 'height', 'grade', 'curve', 'roll', 'tunnel'] as const)
        expect(track[key].slice(0, cut)).toEqual(old[key].slice(0, cut));
      expect(track.zones.filter((z) => z.t0 < frozen).map(({ t1: _, ...z }) => z))
        .toEqual(old.zones.filter((z) => z.t0 < frozen).map(({ t1: _, ...z }) => z));
    }
    expect(revision).toBeGreaterThan(8);
    expect(calls).toBeGreaterThan(50);
    expect([...announced.keys()].some((id) => id.startsWith('cadenza:launch:'))).toBe(true);
    expect([...announced.keys()].some((id) => id.startsWith('cadenza:effort:'))).toBe(true);
    q.dispose();
  });

  it('honors a published horizon before playback and without announce()', () => {
    const tl = { ...rideTimeline([[0, 40, 'build'], [40, 80, 'drop'], [80, 160, 'verse']]), revision: 0, frozenUntilS: 55 };
    const s = session(tl), before = (s.sim.snapshot() as CadenzaSnapshot).track;
    Object.assign(tl, freezeMerge(tl, rideTimeline([[0, 60, 'break'], [60, 160, 'build']]), 55), { revision: 1, updateFromS: 0 });
    s.step(1);
    const after = (s.sim.snapshot() as CadenzaSnapshot).track;
    expect(after.dist.slice(0, 550)).toEqual(before.dist.slice(0, 550));
    expect(trackCues(after).filter((c) => c.t < 55)).toEqual(trackCues(before).filter((c) => c.t < 55));
    expect(effortAt(after, 42, 'pro')).toEqual(effortAt(before, 42, 'pro'));
  });

  it('protects a shown launch 10 seconds ahead even when the source does not freeze its revision', () => {
    const tl = { ...rideTimeline([[0, 40, 'build'], [40, 80, 'drop'], [80, 160, 'verse']]), revision: 0, frozenUntilS: 0 };
    const calls = new Map<string, number>();
    const s = session(tl, (id, t) => { calls.set(id, t); });
    s.step(30 * 30);
    expect(calls.get('cadenza:launch:40')).toBe(40);
    const before = (s.sim.snapshot() as CadenzaSnapshot).track;
    tl.sections = rideTimeline([[0, 45, 'verse'], [45, 90, 'drop'], [90, 160, 'build']]).sections;
    tl.revision++; s.step(1);
    const after = (s.sim.snapshot() as CadenzaSnapshot).track;
    const final = new Map(trackCues(after).map((c) => [c.id, c.t]));
    for (const [id, t] of calls) expect(final.get(id)).toBe(t);
    expect(after.stunts.find((x) => x.kind === 'launch' && x.t0 === 40)).toEqual(before.stunts.find((x) => x.kind === 'launch'));
  });
});

describe('Cadenza coverage confidence', () => {
  const tl = () => rideTimeline([[0, 30, 'build'], [30, 60, 'drop'], [60, 180, 'verse'], [180, 210, 'drop'], [210, 330, 'verse'], [330, 360, 'drop'], [360, 480, 'verse'], [480, 510, 'drop'], [510, 550, 'verse']]);

  it('uses effort-only holds in low-confidence and unanalyzed spans, accepting 0.6 and 0.7', () => {
    const timeline = { ...tl(), coverage: [
      { t0: 0, t1: 60, rhythm: 0.5, structure: 1 },
      { t0: 300, t1: 360, rhythm: 0.7, structure: 1 },
      { t0: 450, t1: 510, rhythm: 0.6, structure: 1 },
    ] };
    const track = buildTrack(timeline, options);
    expect(track.rideBlocks.filter((b) => b.phase === 'sprint').map((b) => b.t0)).toEqual([330, 480]);
    expect(track.stunts.filter((b) => b.kind === 'launch').map((b) => b.t0)).toEqual([330, 480]);
    expect(effortAt(track, 35, 'pro').phase).toBe('hold');
    expect(effortAt(track, 185, 'pro')).toMatchObject({ phase: 'recover', countdown: null }); // periodic rest still applies
    expect(buildTrack({ ...timeline, coverage: [] }, options).stunts.some((b) => b.kind === 'launch')).toBe(false);
  });

  it('rejects challenges that cross a coverage gap or low-confidence boundary', () => {
    const timeline = rideTimeline([[0, 40, 'verse'], [40, 80, 'drop'], [80, 160, 'verse']]);
    for (const rhythm of [0.5, 0.599]) {
      const coverage = [{ t0: 0, t1: 45, rhythm: 1, structure: 1 }, { t0: 45, t1: 160, rhythm, structure: 1 }];
      expect(planRide({ ...timeline, coverage }, DIFF.pro).some((b) => b.phase === 'sprint')).toBe(false);
    }
    expect(planRide({ ...timeline, coverage: [{ t0: 0, t1: 45, rhythm: 1, structure: 1 }, { t0: 46, t1: 160, rhythm: 1, structure: 1 }] }, DIFF.pro).some((b) => b.phase === 'sprint')).toBe(false);
    expect(planRide({ ...timeline, coverage: [{ t0: 0, t1: 45, rhythm: 0.6, structure: 1 }, { t0: 45, t1: 160, rhythm: 0.7, structure: 1 }] }, DIFF.pro).some((b) => b.phase === 'sprint')).toBe(true);
  });

  it('leaves whole-file tracks identical, including when announce() is provided', () => {
    const timeline = tl(), expected = buildTrack(timeline, options);
    const s = session(timeline, () => {});
    s.step(1);
    expect((s.sim.snapshot() as CadenzaSnapshot).track).toEqual(expected);
    expect(buildTrack({ ...timeline, coverage: [{ t0: 0, t1: 550, rhythm: 1, structure: 1 }] }, options)).toEqual(expected);
  });
});
