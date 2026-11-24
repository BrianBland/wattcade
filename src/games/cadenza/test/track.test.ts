import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { synthTimeline } from '../../../media/synth/queue';
import { extendTrack, buildTrack, DIFF, maxLaneJump, rateTrack, sampleAt, zoneIndexAt, type Difficulty, type Track } from '../sim/track';
import { rideTimeline } from './fixtures';

const tl = synthTimeline({ style: 'edm', songs: 2, seed: 1, mix: 'automix' });

describe('Cadenza track', () => {
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

  it('blocks follow the hits, respect spacing and the lanes option at every difficulty; harder means denser', () => {
    for (const lanes of [3, 5]) {
      const counts: number[] = [], h = (lanes - 1) / 2;
      for (const diff of ['casual', 'pro', 'elite'] as Difficulty[]) {
        const tr = buildTrack(tl, { difficulty: diff, mode: 'mono', seed: 1, lanes }), d = DIFF[diff];
        expect(tr.lanes).toBe(lanes);
        for (let i = 1; i < tr.blocks.length; i++) expect(tr.blocks[i].t - tr.blocks[i - 1].t).toBeGreaterThanOrEqual(d.minGap - 1e-9);
        for (const b of tr.blocks) { expect(Math.abs(b.lane)).toBeLessThanOrEqual(h); expect(b.color).toBeGreaterThanOrEqual(-1); expect(b.color).toBeLessThan(5); }
        if (lanes === 5) expect(tr.blocks.some((b) => Math.abs(b.lane) === 2)).toBe(true);
        counts.push(tr.blocks.length);
      }
      expect(counts[0]).toBeLessThan(counts[1]); expect(counts[1]).toBeLessThan(counts[2]);
    }
    // Lanes come from the ship, not difficulty: the default is 3, elite included.
    expect(buildTrack(tl, { difficulty: 'elite', mode: 'mono', seed: 1 }).lanes).toBe(3);
  });

  it('casual and pro 3-lane tracks are unchanged by the ship-lanes move and the reachability guard', () => {
    // Block fingerprints from main (eb82d53), before lanes moved onto ships.
    const before: Record<string, string> = {
      'casual:1': '6217a29546277722ac084a44f2b07e2b07fa2b51', 'casual:4': 'c370c14fce1d1983b3c3d45bcb342cf53e6173c3',
      'pro:1': '9de5f614b13e8be92a4b8381755acd30a39cbe65', 'pro:4': '0d9125a5943507caf09846b6a54b97db5ec99be5',
    };
    for (const [k, hash] of Object.entries(before)) {
      const [difficulty, seed] = k.split(':') as [Difficulty, string];
      for (const lanes of [undefined, 3]) {
        const tr = buildTrack(tl, { difficulty, mode: 'mono', seed: Number(seed), ...(lanes ? { lanes } : {}) });
        expect(createHash('sha1').update(JSON.stringify(tr.blocks)).digest('hex')).toBe(hash);
      }
    }
  });

  it('every block is reachable from the one before at 9 lanes/s (reachability guard)', () => {
    expect([0.11, 0.22, 0.36, 0.5].map(maxLaneJump)).toEqual([1, 2, 3, 4]);
    const reachable = (tr: Track, skipGreys: boolean) => {
      const bs = skipGreys ? tr.blocks.filter((b) => b.color >= 0) : tr.blocks;
      for (let i = 1; i < bs.length; i++) {
        const dt = bs[i].t - bs[i - 1].t, jump = Math.abs(bs[i].lane - bs[i - 1].lane);
        // Coloured blocks are what the rider must catch: within one lane, or what 9 lanes/s covers in the gap.
        expect(jump, `${tr.lanes} lanes, t=${bs[i].t}`).toBeLessThanOrEqual(Math.max(1, 9 * dt + 0.1));
      }
    };
    for (const lanes of [3, 5]) for (const difficulty of ['casual', 'pro', 'elite'] as Difficulty[]) for (const seed of [1, 4]) {
      reachable(buildTrack(tl, { difficulty, mode: 'classic', seed, lanes }), false); // no greys: every consecutive pair
      reachable(buildTrack(tl, { difficulty, mode: 'mono', seed, lanes }), true);
    }
    // The guard bites where it should: unguarded 5-lane elite would ask for 2+ lanes in 0.11 s.
    const elite5 = buildTrack(tl, { difficulty: 'elite', mode: 'classic', seed: 1, lanes: 5 });
    expect(elite5.blocks.some((b, i) => i > 0 && b.t - elite5.blocks[i - 1].t < 0.2 && Math.abs(b.lane - elite5.blocks[i - 1].lane) === 1)).toBe(true);
  });

  it('greys are always dodgeable: never next to each other, never in a neighbour block’s lane', () => {
    for (const lanes of [3, 5]) {
      const tr = buildTrack(tl, { difficulty: 'elite', mode: 'mono', seed: 4, lanes });
      const greys = tr.blocks.filter((b) => b.color < 0);
      expect(greys.length).toBeGreaterThan(5);
      tr.blocks.forEach((b, i) => {
        if (b.color >= 0 || i === 0 || i === tr.blocks.length - 1) return;
        expect(tr.blocks[i - 1].color).toBeGreaterThanOrEqual(0);
        expect(b.lane).not.toBe(tr.blocks[i - 1].lane);
        expect(b.lane).not.toBe(tr.blocks[i + 1].lane);
      });
    }
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

describe('effort phases', () => {
  it('drops sprint for at most the difficulty cap, then hold a lower zone', async () => {
    const { effortAt, DIFF } = await import('../sim/track');
    const long = rideTimeline([[0, 40, 'break'], [40, 80, 'build'], [80, 140, 'drop'], [140, 180, 'break']]);
    for (const diff of ['casual', 'pro', 'elite'] as Difficulty[]) {
      const tr = buildTrack(long, { difficulty: diff, mode: 'mono', seed: 1 });
      const drop = tr.zones.find((z) => z.kind === 'drop')!;
      expect(drop.t1 - drop.t0).toBeGreaterThan(DIFF[diff].sprintS);
      const a = effortAt(tr, drop.t0 + 1, diff), b = effortAt(tr, drop.t0 + DIFF[diff].sprintS + 1, diff);
      expect(a.phase).toBe('sprint'); expect(a.left).toBeCloseTo(DIFF[diff].sprintS - 1, 6);
      expect(b.phase).toBe('hold'); expect(b.floorFtp).toBeLessThan(a.floorFtp); expect(b.ergFtp).toBeLessThan(a.ergFtp);
      expect(a.target.source).toBe('power');
    }
  });
  it('every phase is power-based with ERG watts that rise through a climb', async () => {
    const { effortAt } = await import('../sim/track');
    const tr = buildTrack(rideTimeline([[0, 40, 'break'], [40, 80, 'build'], [80, 140, 'drop'], [140, 180, 'break']]), { difficulty: 'pro', mode: 'mono', seed: 1 });
    for (let p = 0; p < tr.durationS; p += 3) expect(effortAt(tr, p, 'pro').target.source).toBe('power');
    const build = tr.zones.find((z) => z.kind === 'build')!;
    expect(effortAt(tr, build.t1 - 0.5, 'pro').ergFtp).toBeGreaterThan(effortAt(tr, build.t0 + 0.5, 'pro').ergFtp);
    const brk = tr.zones.find((z) => z.kind === 'break')!;
    expect(effortAt(tr, brk.t0 + 1, 'pro')).toMatchObject({ phase: 'recover', floorFtp: 0 });
  });
});

describe('banks and tunnels', () => {
  it('planned sprints bank hard (≈ 66°); drops without a sprint stay calm; breaks are tunnels', () => {
    const tr = buildTrack(tl, { difficulty: 'pro', mode: 'mono', seed: 1 });
    for (const z of tr.zones.filter((x) => x.kind === 'drop')) {
      const i0 = Math.round(z.t0 * tr.hz), i1 = Math.round(Math.min(z.t1, z.t0 + 8) * tr.hz); // (after any opening corkscrew)
      const peak = Math.max(...Array.from(tr.roll.slice(i0, i1), (r) => Math.abs(Math.atan2(Math.sin(r), Math.cos(r))))); // a finished helix leaves 2π
      if (!tr.stunts.some((s) => s.kind === 'launch' && s.t0 === z.t0)) { expect(peak).toBeLessThan(0.1); continue; }
      expect(peak).toBeGreaterThan(1.1);
      expect(Math.abs(tr.curve[i1] - tr.curve[i0])).toBeGreaterThan(0.8); // the track actually turns
    }
    const inScrew = (i: number) => tr.stunts.some((s) => s.kind === 'launch' && i / tr.hz >= s.t0 - 0.1 && i / tr.hz <= s.t1 + 0.1);
    expect(Math.max(...Array.from(tr.roll, (r, i) => (inScrew(i) ? 0 : Math.abs(Math.atan2(Math.sin(r), Math.cos(r))))))).toBeLessThan(1.2);
    for (const z of tr.zones.filter((x) => x.kind === 'break')) expect(tr.tunnel[Math.round((z.t0 + 2) * tr.hz)]).toBe(1);
    for (const z of tr.zones.filter((x) => x.kind === 'drop')) expect(tr.tunnel[Math.round((z.t0 + 2) * tr.hz)]).toBe(0);
    expect(tr.tunnels.length).toBeGreaterThan(0);
  });
});

describe('stunts', () => {
  it('long builds spiral up a full banked helix that clears its own coil; every drop opens with a block-free launch roll', () => {
    const tr = buildTrack(tl, { difficulty: 'pro', mode: 'mono', seed: 1 });
    const helixes = tr.stunts.filter((s) => s.kind === 'helix'), screws = tr.stunts.filter((s) => s.kind === 'launch');
    expect(helixes.length).toBeGreaterThan(0);
    for (const h of helixes) {
      const i0 = Math.round(h.t0 * tr.hz), i1 = Math.round(h.t1 * tr.hz);
      expect(Math.abs(tr.curve[i1] - tr.curve[i0])).toBeGreaterThan(Math.PI * 1.8);   // ≈ a full turn
      expect((tr.height[i1] - tr.height[i0]) * 3).toBeGreaterThan(20);                  // the coil below is well clear
      expect(tr.zones[zoneIndexAt(tr, h.t1)].kind).toBe('build');                        // done before the drop hits
    }
    expect(screws.length).toBeGreaterThan(0);
    for (const c of screws) {
      const i0 = Math.round((c.t0 - 0.1) * tr.hz), i1 = Math.round((c.t1 + 0.1) * tr.hz);
      expect(Math.abs(tr.roll[i1] - tr.roll[i0])).toBeCloseTo(Math.PI * 2, 1);
      expect(tr.zones[c.zone].kind).toBe('drop');
      expect(tr.blocks.some((b) => b.t > c.t0 - 0.5 && b.t < c.t1 + 0.2)).toBe(false);
    }
  });
});

it('rolling road updates preserve ridden geometry and block indexes while extending the future', () => {
  const opts = { difficulty: 'pro' as const, mode: 'mono' as const, seed: 1 };
  const old = buildTrack(tl, opts);
  const next = buildTrack({ ...tl, sections: tl.sections.map((s) => ({ ...s, kind: s.kind === 'build' ? 'break' as const : s.kind })), onsets: tl.onsets.filter((o) => o.t > 60) }, opts);
  const result = extendTrack(old, next, 60), cut = 60 * old.hz;
  expect([...result.dist.slice(0, cut)]).toEqual([...old.dist.slice(0, cut)]);
  expect([...result.height.slice(0, cut)]).toEqual([...old.height.slice(0, cut)]);
  expect(result.blocks.filter((b) => b.t < 60)).toEqual(old.blocks.filter((b) => b.t < 60));
  expect(result.dist[cut]).toBeCloseTo(old.dist[cut]);
  expect(result.height[cut]).toBeCloseTo(old.height[cut]);
  expect([...result.dist].every((d, i, a) => i === 0 || d > a[i - 1])).toBe(true);
  expect(result.blocks.every((b) => result.zones[b.zone].t0 <= b.t && result.zones[b.zone].t1 >= b.t)).toBe(true);
});
