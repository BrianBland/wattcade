import { describe, expect, it } from 'vitest';
import { baseFtp, chapterPlanS, checkpointsOf, effortAt, makeGraph, planElapsed, resumePoint, routeAt, totalPlanS } from '../sim/graph';
import { STORY } from '../sim/story';

const g = makeGraph(STORY);

describe('story graph', () => {
  it('has unique ids, chapters in order and every kind authored', () => {
    expect(new Set(STORY.map((s) => s.id)).size).toBe(STORY.length);
    const ch = STORY.map((s) => s.chapter);
    expect(ch).toEqual([...ch].sort());
    expect(g.chapterStart).toEqual([0, STORY.findIndex((s) => s.chapter === 1), STORY.findIndex((s) => s.chapter === 2)]);
    expect(new Set(STORY.map((s) => s.kind))).toEqual(new Set(['ride', 'fish', 'shop', 'drill', 'cutscene', 'fan', 'flight']));
  });
  it('plans about 2 h in three 30–50 min chapters', () => {
    expect(totalPlanS(g) / 60).toBeGreaterThan(108);
    expect(totalPlanS(g) / 60).toBeLessThan(132);
    for (const c of [0, 1, 2] as const) { expect(chapterPlanS(g, c) / 60).toBeGreaterThanOrEqual(30); expect(chapterPlanS(g, c) / 60).toBeLessThanOrEqual(50); }
  });
  it('effort plans sum to the scene duration', () => {
    for (const s of STORY) expect(s.effort.reduce((a, [d]) => a + d, 0), s.id).toBeCloseTo(s.planS, 0);
  });
  it('gates fishing, drilling and the fan on effort; rides on distance', () => {
    for (const s of STORY) {
      if (s.kind === 'drill' || s.kind === 'fan' || (s.kind === 'fish' && s.id !== 'bigOne')) expect('effortS' in s.length, s.id).toBe(true);
      if (s.kind === 'ride') expect('m' in s.length, s.id).toBe(true);
    }
  });
  it('monologue lines are at most 8 words, in order', () => {
    for (const s of STORY) {
      for (const l of s.monologue) expect(l.text.split(/\s+/).length, l.text).toBeLessThanOrEqual(8);
      const at = s.monologue.map((l) => l.at);
      expect(at).toEqual([...at].sort((a, b) => a - b));
    }
  });
  it('reads planned effort by position and excludes sprints from the base', () => {
    const t1 = STORY.find((s) => s.id === 'turnout1')!;
    expect(effortAt(t1, 60)).toBeCloseTo(0.55);
    expect(effortAt(t1, 125)).toBeCloseTo(1.35);
    expect(effortAt(t1, 1e9)).toBeCloseTo(0.58);
    expect(baseFtp(t1)).toBeGreaterThan(0.55);
    expect(baseFtp(t1)).toBeLessThan(0.6);
  });
  it('accumulates plan time and route distance (rail scenes only)', () => {
    const i = STORY.findIndex((s) => s.id === 'rollers');
    expect(planElapsed(g, i, 0.5)).toBe(g.planT0[i] + STORY[i].planS / 2);
    expect(routeAt(g, i + 1, 0.7)).toBe(g.routeS0[i + 1]); // shop holds position
    expect(g.routeS0[i + 1]).toBeGreaterThan(g.routeS0[i]);
  });
  it('puts checkpoints only inside long scenes', () => {
    expect(checkpointsOf(STORY.find((s) => s.id === 'drill1')!)).toEqual([0.5]);
    expect(checkpointsOf(STORY.find((s) => s.id === 'title')!)).toEqual([]);
  });
  it('resumes from a checkpoint and falls back to the start for bad saves', () => {
    expect(resumePoint(g, { checkpoint: { sceneId: 'cavern', progress: 0 } })).toEqual({ index: g.chapterStart[2], progress: 0 });
    expect(resumePoint(g, { checkpoint: { sceneId: 'drill1', progress: 0.5 } }).progress).toBe(0.5);
    expect(resumePoint(g, { checkpoint: { sceneId: 'gone', progress: 0.5 } })).toEqual({ index: 0, progress: 0 });
    expect(resumePoint(g, { checkpoint: null })).toEqual({ index: 0, progress: 0 });
  });
});
