import { describe, expect, it } from 'vitest';
import { synthTimeline } from '../../../media/synth/queue';
import { buildTrack, DIFF, rateTrack, sampleAt, zoneIndexAt, type Difficulty } from '../sim/track';

const tl = synthTimeline({ style: 'edm', songs: 2, seed: 1, mix: 'automix' });

describe('Wattsurf track', () => {
  it('one zone per section, each with an effort target; drops are power sprints', () => {
    const tr = buildTrack(tl, { difficulty: 'pro', mode: 'mono', seed: 1 });
    expect(tr.zones.length).toBe(tl.sections.length);
    for (const z of tr.zones) {
      if (z.kind === 'drop') expect(z.target).toMatchObject({ min: 5, source: 'power' });
      if (z.kind === 'build') expect(z.target.source).toBe('power');
    }
    expect(buildTrack(tl, { difficulty: 'casual', mode: 'mono', seed: 1 }).zones.find((z) => z.kind === 'drop')!.target.min).toBe(4);
  });

  it('builds climb toward the max grade, drops fall away to flat, distance only grows', () => {
    const tr = buildTrack(tl, { difficulty: 'pro', mode: 'mono', seed: 1, maxGrade: 7 });
    for (const z of tr.zones) {
      if (z.kind === 'build') expect(sampleAt(tr.grade, tr.hz, z.t1 - 0.5)).toBeGreaterThan(4);
      if (z.kind === 'drop') expect(sampleAt(tr.grade, tr.hz, Math.min(z.t1 - 0.5, z.t0 + 8))).toBeLessThan(0.5);
    }
    expect(Math.max(...tr.grade)).toBeLessThanOrEqual(7);
    for (let i = 1; i < tr.dist.length; i++) expect(tr.dist[i]).toBeGreaterThan(tr.dist[i - 1]);
    // the track dives in drops (visually)
    const drop = tr.zones.find((z) => z.kind === 'drop')!;
    expect(sampleAt(tr.height, tr.hz, drop.t1 - 1)).toBeLessThan(sampleAt(tr.height, tr.hz, drop.t0 + 1));
  });

  it('blocks follow the hits, respect spacing and lanes; harder means denser', () => {
    const counts: number[] = [];
    for (const diff of ['casual', 'pro', 'elite'] as Difficulty[]) {
      const tr = buildTrack(tl, { difficulty: diff, mode: 'mono', seed: 1 }), d = DIFF[diff], h = (d.lanes - 1) / 2;
      for (let i = 1; i < tr.blocks.length; i++) expect(tr.blocks[i].t - tr.blocks[i - 1].t).toBeGreaterThanOrEqual(d.minGap - 1e-9);
      for (const b of tr.blocks) { expect(Math.abs(b.lane)).toBeLessThanOrEqual(h); expect(b.color).toBeGreaterThanOrEqual(-1); expect(b.color).toBeLessThan(5); }
      counts.push(tr.blocks.length);
    }
    expect(counts[0]).toBeLessThan(counts[1]); expect(counts[1]).toBeLessThan(counts[2]);
  });

  it('greys are always dodgeable: never next to each other, never in a neighbour block’s lane', () => {
    const tr = buildTrack(tl, { difficulty: 'elite', mode: 'mono', seed: 4 });
    const greys = tr.blocks.filter((b) => b.color < 0);
    expect(greys.length).toBeGreaterThan(5);
    tr.blocks.forEach((b, i) => {
      if (b.color >= 0 || i === 0 || i === tr.blocks.length - 1) return;
      expect(tr.blocks[i - 1].color).toBeGreaterThanOrEqual(0);
      expect(b.lane).not.toBe(tr.blocks[i - 1].lane);
      expect(b.lane).not.toBe(tr.blocks[i + 1].lane);
    });
  });

  it('is deterministic and finds zones by time', () => {
    const a = buildTrack(tl, { difficulty: 'pro', mode: 'mono', seed: 9 }), b = buildTrack(tl, { difficulty: 'pro', mode: 'mono', seed: 9 });
    expect(JSON.stringify(a.blocks)).toBe(JSON.stringify(b.blocks));
    for (const [i, z] of a.zones.entries()) expect(zoneIndexAt(a, (z.t0 + z.t1) / 2)).toBe(i);
  });

  it('rates harder sets higher', () => {
    const easy = rateTrack(buildTrack(synthTimeline({ style: 'ambient', songs: 1 }), { difficulty: 'casual', mode: 'mono', seed: 1 }));
    const hard = rateTrack(buildTrack(tl, { difficulty: 'elite', mode: 'mono', seed: 1 }));
    expect(hard.blocksPerMin).toBeGreaterThan(easy.blocksPerMin);
    expect(hard.stars).toBeGreaterThanOrEqual(easy.stars);
    expect(hard.tss).toBeGreaterThan(0);
  });
});
