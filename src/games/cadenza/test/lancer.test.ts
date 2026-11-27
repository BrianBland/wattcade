import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { MediaOnset } from '../../../contracts';
import { createGameSession, NullInput, testProfile } from '../../../core';
import { synthTimeline } from '../../../media/synth/queue';
import { module } from '../index';
import { shipBehavior, SHIPS } from '../ships';
import type { CadenzaSnapshot } from '../sim/sim';
import { buildTrack, DIFF, extendTrack, PER_BAND_GAP } from '../sim/track';
import { rideTimeline } from './fixtures';

const digest = (blocks: Array<{ t: number; lane: number; color: number; zone: number }>) =>
  createHash('sha1').update(blocks.map((b) => `${b.t},${b.lane},${b.color},${b.zone}`).join(';')).digest('hex').slice(0, 16);

describe('Lancer band ship: track', () => {
  it('only the Lancer has a gameplay behaviour', () => {
    expect(SHIPS.map((s) => [s.id, shipBehavior(s.id)])).toEqual([['triad', null], ['lancer', 'bands'], ['manta', null]]);
  });

  it('is byte-identical to the standard track without perBandGap (digests recorded on main eb82d53)', () => {
    const want: Record<string, [number, string]> = {
      'edm casual': [158, 'a175bf766ed46661'], 'edm pro': [305, '10b7395edc30f66c'], 'edm elite': [434, 'fcd0ace3c40af676'],
      'rock casual': [174, '0a568961cb9fe40f'], 'rock pro': [305, '2a2ce22e98e71a75'], 'rock elite': [423, '6aac8610eb73f576'],
    };
    for (const style of ['edm', 'rock'] as const) for (const difficulty of ['casual', 'pro', 'elite'] as const) {
      const t = buildTrack(synthTimeline({ style, songs: 1, seed: 3, short: true }), { difficulty, mode: 'mono', seed: 3 });
      expect([t.blocks.length, digest(t.blocks)], `${style} ${difficulty}`).toEqual(want[`${style} ${difficulty}`]);
    }
  });

  it('tags every block with its onset band and keeps it through extendTrack', () => {
    const tl = synthTimeline({ style: 'rock', songs: 1, seed: 2 });
    const a = buildTrack(tl, { difficulty: 'pro', mode: 'mono', seed: 2, perBandGap: true });
    const bandsAt = new Map<number, number[]>();
    for (const o of tl.onsets) { const k = Math.round(o.t * 1000) / 1000; bandsAt.set(k, [...(bandsAt.get(k) ?? []), o.band]); }
    for (const b of a.blocks) { expect([0, 1, 2]).toContain(b.band); expect(bandsAt.get(b.t)).toContain(b.band); }
    const b = buildTrack(tl, { difficulty: 'pro', mode: 'mono', seed: 9, perBandGap: true });
    const ext = extendTrack(a, b, 60);
    for (const k of ext.blocks) expect([0, 1, 2]).toContain(k.band);
    expect(ext.blocks.filter((k) => k.t < 60)).toEqual(a.blocks.filter((k) => k.t < 60).map((k) => ({ ...k, zone: expect.any(Number) })));
  });

  it('perBandGap keeps a per-band gap and a global floor, and stops dense highs starving the lows (metal-like fixture)', () => {
    // a blast-beat: hi-hats / cymbals every 0.1 s, kick every 0.45 s just after a hat, snare every 0.9 s
    const base = rideTimeline([[0, 40, 'verse'], [40, 100, 'drop']]);
    const onsets: MediaOnset[] = [];
    for (let t = 3; t < 98; t += 0.1) onsets.push({ t: Math.round(t * 1000) / 1000, band: 2, s: 0.9 });
    for (let t = 3.03; t < 98; t += 0.45) onsets.push({ t: Math.round(t * 1000) / 1000, band: 0, s: 0.9 });
    for (let t = 3.27; t < 98; t += 0.9) onsets.push({ t: Math.round(t * 1000) / 1000, band: 1, s: 0.9 });
    onsets.sort((a, b) => a.t - b.t);
    const tl = { ...base, onsets };
    for (const difficulty of ['casual', 'pro', 'elite'] as const) {
      const d = DIFF[difficulty];
      const plain = buildTrack(tl, { difficulty, mode: 'mono', seed: 4 }), per = buildTrack(tl, { difficulty, mode: 'mono', seed: 4, perBandGap: true });
      const share = (bs: typeof plain.blocks, band: number) => bs.filter((b) => b.band === band).length / Math.max(1, bs.length);
      expect(share(per.blocks, 0), difficulty).toBeGreaterThan(0.25);
      expect(share(per.blocks, 0), difficulty).toBeGreaterThan(share(plain.blocks, 0));
      const last = [-9, -9, -9];
      for (let i = 0; i < per.blocks.length; i++) {
        const b = per.blocks[i], band = b.band!;
        if (i) expect(b.t - per.blocks[i - 1].t).toBeGreaterThanOrEqual(d.minGap * PER_BAND_GAP.floor - 1e-6);
        expect(b.t - last[band]).toBeGreaterThanOrEqual(d.minGap * PER_BAND_GAP.band[band] - 1e-6);
        last[band] = b.t;
      }
    }
  });
});

describe('Lancer band ship: sim', () => {
  const ride = (ship: string, achievements: string[] = ['cz_sets', 'cz_launches']) => {
    const timeline = synthTimeline({ style: 'edm', songs: 1, short: true, seed: 2 });
    const profile = testProfile({ achievements, gameData: { cadenza: { ship } } });
    const s = createGameSession({ game: module, profile, input: new NullInput(), media: { timeline }, fake: { script: 'target-follow' }, simOpts: { autopilot: true, difficulty: 'pro' } });
    return s;
  };

  it('only the Lancer reports band bars, and only once riding', () => {
    for (const ship of ['triad', 'manta']) {
      const s = ride(ship); s.step(30 * 30);
      const snap = s.sim.snapshot() as CadenzaSnapshot;
      expect(snap.ship).toBe(ship); expect(snap.bands).toBeUndefined();
      expect(s.sim.summary()).not.toHaveProperty('flowS');
    }
    const s = ride('lancer'); s.step(30 * 30);
    const snap = s.sim.snapshot() as CadenzaSnapshot;
    expect(snap.ship).toBe('lancer');
    expect(snap.bands).toBeDefined();
    expect(snap.bands!.level).toHaveLength(3); expect(snap.bands!.gain).toHaveLength(3);
    expect(snap.bands!.target).toBeCloseTo(0.7);
    expect(snap.bands!.rate.some((r) => r > 0.1)).toBe(true);
    expect(s.sim.summary()).toHaveProperty('flowS');
  });

  it('the Lancer only when unlocked; a locked saved Lancer plays the standard game', () => {
    const s = ride('lancer', []); s.step(30 * 10);
    const snap = s.sim.snapshot() as CadenzaSnapshot;
    expect(snap.ship).toBe('triad'); expect(snap.bands).toBeUndefined();
  });

  it('an autopilot Lancer keeps its bars up and scores like the same ride without bars changes nothing else', () => {
    const s = ride('lancer');
    while (!s.sim.isOver()) s.step(300);
    const snap = s.sim.snapshot() as CadenzaSnapshot;
    // autopilot catches nearly everything: bars stay above the low line
    for (const l of snap.bands!.level) expect(l).toBeGreaterThan(0.35);
    expect(snap.bands!.gain.every((g) => g > 0.99)).toBe(true);
    const sum = s.sim.summary();
    expect(Number(sum.collected)).toBeGreaterThan(0);
  });

  it('a rider who never steers lets bands go low (ducked), while a clean ride gets in the mix', () => {
    const go = (autopilot: boolean) => {
      const timeline = synthTimeline({ style: 'edm', songs: 1, seed: 2 });
      const s = createGameSession({ game: module, profile: testProfile({ achievements: ['cz_sets'], gameData: { cadenza: { ship: 'lancer' } } }), input: new NullInput(),
        media: { timeline }, fake: { script: 'target-follow' }, simOpts: { autopilot, difficulty: 'pro' } });
      let lowGain = 1, flowCues = 0;
      while (!s.sim.isOver()) { s.step(30); const b = (s.sim.snapshot() as CadenzaSnapshot).bands!; lowGain = Math.min(lowGain, ...b.gain); }
      flowCues = (s.sim.snapshot() as CadenzaSnapshot).cues.filter((c) => c.type === 'flow' && c.data?.on).length;
      return { lowGain, flowS: Number(s.sim.summary().flowS), flowCues };
    };
    const idle = go(false), clean = go(true);
    expect(idle.lowGain).toBeLessThan(0.3); expect(idle.flowS).toBe(0);
    expect(clean.lowGain).toBe(1); expect(clean.flowS).toBeGreaterThan(20); expect(clean.flowCues).toBeGreaterThan(0);
  });

  it('the Lancer track uses perBandGap; the others are untouched', () => {
    const a = ride('lancer'); a.step(30 * 2);
    const t = (a.sim.snapshot() as CadenzaSnapshot).track;
    const timeline = synthTimeline({ style: 'edm', songs: 1, short: true, seed: 2 });
    const per = buildTrack(timeline, { difficulty: 'pro', mode: 'mono', seed: 1, perBandGap: true });
    expect(t.blocks.map((b) => b.t)).toEqual(per.blocks.map((b) => b.t));
    const b = ride('triad'); b.step(30 * 2);
    expect((b.sim.snapshot() as CadenzaSnapshot).track.blocks.map((k) => k.t)).toEqual(buildTrack(timeline, { difficulty: 'pro', mode: 'mono', seed: 1 }).blocks.map((k) => k.t));
  });
});
