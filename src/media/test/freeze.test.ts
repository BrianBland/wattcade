import { describe, expect, it } from 'vitest';
import type { MediaTimeline } from '../../contracts';
import { FREEZE_FLOOR_S, coveredThrough, freezeHorizon, freezeMerge, rhythmConfidence, songCoverage, structureConfidence } from '../online/freeze';
import { RollingQueue, estimatedAnalysis } from '../online/rolling';
import { buildTimeline } from '../mix/timeline';
import { planMix, type MixItem } from '../mix/plan';
import type { SongAnalysis } from '../types';

const grid = (bpm: number, t0: number, t1: number) => { const out: number[] = []; for (let t = t0; t < t1 - 1e-9; t += 60 / bpm) out.push(Math.round(t * 1000) / 1000); return out; };
const tl = (shift: number, durationS = 120): MediaTimeline => ({
  durationS, hz: 10, intensity: Array.from({ length: durationS * 10 }, (_, i) => (i % 7) / 7 + shift), bands: [[], [], []].map(() => new Array(durationS * 10).fill(shift)) as MediaTimeline['bands'],
  beats: grid(120, shift, durationS), downbeats: grid(30, shift, durationS), phrases: grid(30 / 8, shift, durationS),
  onsets: grid(120, shift, durationS).map((t) => ({ t, s: 0.5, band: 0 as const })),
  sections: [{ t0: 0, t1: 40 + shift, kind: 'intro', energy: 0.5 }, { t0: 40 + shift, t1: 80 + shift, kind: 'drop', energy: 0.5 }, { t0: 80 + shift, t1: durationS, kind: 'outro', energy: 0.5 }],
  songs: [], confidence: 'metadata',
});

describe('freezeMerge', () => {
  it('keeps everything before the horizon from the previous revision and takes the rest from the new one', () => {
    const prev = tl(0), next = tl(0.25), h = 50;
    const m = freezeMerge(prev, next, h);
    expect(m.beats.filter((t) => t < h)).toEqual(prev.beats.filter((t) => t < h));
    expect(m.beats.filter((t) => t >= h)).toEqual(next.beats.filter((t) => t >= h));
    expect(m.onsets.filter((o) => o.t < h)).toEqual(prev.onsets.filter((o) => o.t < h));
    expect(m.intensity.slice(0, 500)).toEqual(prev.intensity.slice(0, 500));
    expect(m.intensity.slice(500)).toEqual(next.intensity.slice(500));
    expect(m.sections.map((s) => [s.t0, s.kind])).toEqual([[0, 'intro'], [40, 'drop'], [80.25, 'outro']]);
    expect(m.sections[1].t1).toBe(80.25);   // the frozen section's end meets the fresh one
    expect(m.frozenUntilS).toBe(h);
    expect(prev.beats[1]).toBe(0.5);         // inputs untouched
  });
  it('horizon: monotonic, playhead + 3 s floor limited to analysed time, past every announced cue', () => {
    expect(freezeHorizon(0, 10, [])).toBe(10 + FREEZE_FLOOR_S);
    expect(freezeHorizon(20, 10, [])).toBe(20);
    expect(freezeHorizon(0, 10, [31.5])).toBeCloseTo(31.501);
    expect(freezeHorizon(0, 0, [], [])).toBe(0);                       // nothing analysed yet: estimates stay open
    expect(freezeHorizon(0, 0, [], [{ t0: 0, t1: 1.5, rhythm: 1, structure: 1 }])).toBe(1.5);
    expect(coveredThrough([{ t0: 0, t1: 30, rhythm: 1, structure: 1 }, { t0: 30, t1: 60, rhythm: 1, structure: 1 }], 5)).toBe(60);
  });
});

describe('coverage confidence', () => {
  const song = (beats: number[]): SongAnalysis => ({ ...estimatedAnalysis(120), bpm: 120, beats, sections: [{ t0: 0, t1: 60, kind: 'verse', energy: 0.5 }, { t0: 60, t1: 120, kind: 'drop', energy: 0.5 }] });
  it('rhythm: high on a steady grid, low on jittered or missing beats; structure: share of the overlapped sections seen', () => {
    expect(rhythmConfidence(song(grid(120, 0, 120)), 0, 30)).toBeGreaterThan(0.95);
    const jitter = grid(120, 0, 120).map((t, i) => t + ((i * 7919) % 13) / 13 * 0.12);
    expect(rhythmConfidence(song(jitter), 0, 30)).toBeLessThan(0.6);
    expect(rhythmConfidence(song(grid(120, 0, 10)), 0, 30)).toBeLessThan(0.4);
    expect(rhythmConfidence(song([]), 0, 30)).toBe(0);
    const a = song(grid(120, 0, 120));
    expect(structureConfidence(a, [[0, 30]], 0, 30)).toBe(0.5);
    expect(structureConfidence(a, [[0, 60]], 0, 30)).toBe(1);
    const cov = songCoverage(a, [[0, 30], [30, 60]], (s) => s + 5, 0, 200);
    expect(cov.map((c) => [c.t0, c.t1, c.structure])).toEqual([[5, 35, 1], [35, 65, 1]]);
  });
  it('whole-file timelines leave coverage and frozenUntilS out', () => {
    const items: MixItem[] = [{ id: 'a', title: 'a', artist: '', analysis: { ...estimatedAnalysis(90), confidence: 'full' } as SongAnalysis }];
    const t = buildTimeline(planMix(items, 'automix'), items);
    expect('coverage' in t).toBe(false); expect('frozenUntilS' in t).toBe(false);
  });
});

describe('RollingQueue: repeated revisions', () => {
  it('announced cues never move or disappear, frozen spans stay byte-stable, coverage grows', async () => {
    // Each window re-analyses the whole song so far with a slightly different grid (as structure recompute can).
    let rev = 0;
    const item: MixItem = { id: 'a', title: 'a', artist: '', analysis: estimatedAnalysis(300) };
    const q = new RollingQueue([item], 'continuous', 40, async (_, start, duration) => {
      rev++;
      return { buffer: { duration } as AudioBuffer, analysis: { ...estimatedAnalysis(duration), bpm: 120, beats: grid(120, 0, duration), downbeats: grid(30, 0, duration), phrases: grid(30 / 8, 0, duration) } };
    });
    const shiftAll = () => {
      const a = item.analysis, d = 0.05 * rev;
      a.beats = grid(120, d, a.durationS); a.downbeats = grid(30, d, a.durationS); a.phrases = grid(30 / 8, d, a.durationS);
      a.sections = [{ t0: 0, t1: 100 + d, kind: 'verse', energy: 0.5 }, { t0: 100 + d, t1: 300, kind: 'drop', energy: 0.5 }];
    };
    const announced: Array<{ id: string; t: number; list: 'beats' | 'downbeats' | 'phrases' }> = [];
    let frozen = 0, snapshot: MediaTimeline | null = null;
    for (let p = 0; p < 280; p += 7) {
      const before = q.timeline.revision ?? 0;
      shiftAll();
      await q.prepare(p);
      const t = q.timeline;
      // announce the first downbeat ~9 s ahead (like an effort prompt) and a phrase start when one is in range
      const d = t.downbeats.find((x) => x > p + 9 && x < (t.coverage?.at(-1)?.t1 ?? 0));
      if (d !== undefined) { const id = `d${announced.length}`; q.announce(id, d); announced.push({ id, t: d, list: 'downbeats' }); }
      const ph = t.phrases.find((x) => x > p + 8 && x < (t.coverage?.at(-1)?.t1 ?? 0));
      if (ph !== undefined && !announced.some((a) => a.t === ph)) { q.announce(`p${ph}`, ph); announced.push({ id: `p${ph}`, t: ph, list: 'phrases' }); }
      for (const a of announced) expect(t[a.list], `${a.id} @ ${a.t} after revision ${t.revision}`).toContain(a.t);
      expect(t.frozenUntilS ?? 0).toBeGreaterThanOrEqual(frozen);
      if (snapshot && (t.revision ?? 0) > before) {
        const h = snapshot.frozenUntilS ?? 0;
        for (const k of ['beats', 'downbeats', 'phrases'] as const) expect(t[k].filter((x) => x < h)).toEqual(snapshot[k].filter((x) => x < h));
        expect(t.sections.filter((s) => s.t0 < h).map((s) => [s.t0, s.kind])).toEqual(snapshot.sections.filter((s) => s.t0 < h).map((s) => [s.t0, s.kind]));
        expect(t.intensity.slice(0, Math.floor(h * t.hz))).toEqual(snapshot.intensity.slice(0, Math.floor(h * t.hz)));
      }
      frozen = t.frozenUntilS ?? 0;
      snapshot = structuredClone(t);
    }
    expect(rev).toBeGreaterThan(8);
    expect(announced.length).toBeGreaterThan(10);
    const cov = q.timeline.coverage ?? [];
    expect(cov.length).toBeGreaterThan(8);
    expect(cov.every((c) => c.rhythm >= 0 && c.rhythm <= 1 && c.structure >= 0 && c.structure <= 1 && c.t1 > c.t0)).toBe(true);
    expect(cov[0].rhythm).toBeGreaterThan(0.9);
    expect(q.timeline.confidence).toBe('metadata');
  });
  it('the floor never freezes not-yet-analysed estimates ahead of the playhead', async () => {
    const item: MixItem = { id: 'a', title: 'a', artist: '', analysis: estimatedAnalysis(120) };
    const q = new RollingQueue([item], 'continuous', 40, async (_, __, duration) => ({ buffer: { duration } as AudioBuffer, analysis: { ...estimatedAnalysis(duration), bpm: 120, beats: grid(120, 0, duration) } }));
    await q.prepare(0);
    expect(q.timeline.beats.slice(0, 3).map((x) => x + 0)).toEqual([0, 0.5, 1]);   // the first window's beats in [0, 3) made it in
  });
});
