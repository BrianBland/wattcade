import { describe, expect, it } from 'vitest';
import type { MediaTimeline } from '../../../contracts';
import { createSegmenter, gradeSegment, planSegments, SEGMENT } from '../sim/segments';

/** A long single-track DJ mix: 16 s phrases, sections cycling verse/build/drop/break every 64 s. */
function mix(lengthS: number, songs?: Array<[number, number]>): MediaTimeline {
  const kinds = ['verse', 'build', 'drop', 'break'] as const, sections = [], phrases = [];
  for (let t = 0; t < lengthS; t += 64) sections.push({ t0: t, t1: Math.min(lengthS, t + 64), kind: kinds[(t / 64) % 4], energy: (t / 64) % 4 === 2 ? 0.9 : 0.5 });
  for (let t = 0; t < lengthS; t += 16) phrases.push(t);
  const spans = (songs ?? [[0, lengthS]]).map(([t0, t1], i) => ({ t0, t1, id: `song-${i}`, title: `Song ${i}`, artist: '', bpm: 120, key: '', palette: [] }));
  return { durationS: lengthS, hz: 10, intensity: [], bands: [[], [], []], beats: [], downbeats: [], phrases, onsets: [], sections, songs: spans, confidence: 'full' };
}
describe('segments', () => {
  it('splits an hour-long mix at seams into 2-7 minute places, each with one boss before its breather', () => {
    const plan = planSegments(mix(3600));
    expect(plan.length).toBeGreaterThan(8); expect(plan[0].t0).toBe(0); expect(plan[plan.length - 1].t1).toBe(3600);
    for (const [i, s] of plan.entries()) {
      expect(s.t1 - s.t0).toBeGreaterThanOrEqual(SEGMENT.minS); expect(s.t1 - s.t0).toBeLessThanOrEqual(SEGMENT.maxS);
      if (i) { expect(s.t0).toBe(plan[i - 1].t1); expect(s.biome).not.toBe(plan[i - 1].biome); expect(s.t0 % 64 === 0 || s.t0 % 16 === 0).toBe(true); }
      if (s.bossAt !== null) { expect(s.bossAt).toBeGreaterThan(s.t0); expect(s.bossAt).toBeLessThanOrEqual(s.t1 - SEGMENT.bossLeadS); }
    }
    expect(plan.filter(s => s.bossAt !== null).length).toBeGreaterThan(plan.length * 0.7);
  });
  it('merges very short songs, keeps one segment per normal song, and is stable for the same song', () => {
    const plan = planSegments(mix(600, [[0, 200], [200, 260], [260, 600]]));
    expect(plan.map(s => [s.t0, s.t1])).toEqual([[0, 200], [200, 600]]);
    expect(planSegments(mix(600, [[0, 200], [200, 260], [260, 600]]))[0].seed).toBe(plan[0].seed);
  });
  it('commits the current segment through timeline revisions and falls back to fixed windows without music', () => {
    const tl = mix(900, [[0, 300], [300, 900]]), seg = createSegmenter(tl, () => 360, () => 150);
    const first = seg.at(10).segment; tl.songs[0].t1 = 280; tl.songs[1].t0 = 280;
    expect(seg.at(290).segment).toBe(first); expect(seg.at(301).segment.t0).toBe(300);
    const none = createSegmenter(undefined, () => 360, () => 150);
    expect(none.at(10).segment).toMatchObject({ t0: 0, t1: 360, bossAt: 150 }); expect(none.at(400).segment.t0).toBe(360);
  });
  it('grades steady riding generously and idle riding as D, never asking for extra watts', () => {
    expect(gradeSegment({ onTargetFrac: 0.95, clearRate: 0.5, perfectFrac: 0.1, eliteFrac: null, boss: null }).grade).toBe('B');
    expect(gradeSegment({ onTargetFrac: 0.95, clearRate: 1, perfectFrac: 0.9, eliteFrac: 0.6, boss: 'defeated' }).grade).toBe('S');
    expect(gradeSegment({ onTargetFrac: 0, clearRate: 0, perfectFrac: 0, eliteFrac: null, boss: 'escaped' }).grade).toBe('D');
    // Clearing everything without ever chasing an elite tops out at A; S needs attention too.
    expect(gradeSegment({ onTargetFrac: 0.95, clearRate: 1, perfectFrac: 0.9, eliteFrac: 0, boss: 'defeated' }).grade).toBe('A');
  });
});
