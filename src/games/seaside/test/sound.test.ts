import { describe, expect, it } from 'vitest';
import { FALL } from '../sim/gate';
import { STORY } from '../sim/story';
import type { SeasideSnapshot } from '../sim/types';
import { CUES, cueNotes } from '../render/musicScore';
import { BEDS, bedsFor, INSECTS, musicFor, PLANK_M, SoundTicker, voicesFor, type CueId } from '../render/soundMix';

const at = (sceneId: string, progress: number, extra: Partial<SeasideSnapshot> = {}): SeasideSnapshot => {
  const sc = STORY.find((x) => x.id === sceneId)!;
  return {
    sceneId, sceneT: progress * sc.planS, routeS: 0, speed: 'm' in sc.length ? 7 : 0, scene: { index: 0, count: 0, kind: sc.kind, title: sc.title, progress },
    menu: null, shop: null, fishing: null, drill: null, fan: null, flight: null, pull: null, parts: null, over: false,
    economy: { v: 1, cash: 0, debt: 0, rod: 'pier', rods: ['pier'], extras: [], creel: [], receipts: [], bonusUsed: [] },
    ...extra,
  } as unknown as SeasideSnapshot;
};
const loud = (b: ReturnType<typeof bedsFor>) => Object.values(b).some((v) => (v ?? 0) > 0.05);
const bike = (cadence3s: number) => ({ cadence3s, power3s: 150 });

describe('the Seaside mix follows the scene graph (#197)', () => {
  it('gives every scene a bed but the fall, which is silent until the Earth grows', () => {
    for (const sc of STORY) {
      const b = bedsFor(at(sc.id, 0.5, sc.id === 'reentry' ? { flight: { phase: 'reentry', fire: 0.8, wings: 0.5, effort: 1, spectacle: 1, cloud: 0, out: 0 } } : {}));
      if (sc.id === 'fall') expect(loud(b)).toBe(false);
      else expect(loud(b), sc.id).toBe(true);
      for (const [k, v] of Object.entries(b)) { expect(v, `${sc.id} ${k}`).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); expect(BEDS).toHaveProperty(k); }
    }
    expect(musicFor(at('fall', (FALL.cueS - 1) / 180))).toBeNull();
    expect(musicFor(at('fall', 0.99))?.cue).toBe('earth');
  });

  it('drops the insects out one species at a time in the ruins', () => {
    const count = (p: number) => INSECTS.filter((k) => (bedsFor(at('cutStones', p))[k] ?? 0) > 0.5).length;
    expect(count(0.3)).toBe(4);
    let prev = 4;
    for (let p = 0.3; p <= 1; p += 0.01) { const n = count(p); expect(n).toBeLessThanOrEqual(prev); expect(prev - n).toBeLessThanOrEqual(1); prev = n; }
    expect(count(1)).toBe(1);
  });

  it('plays music on five cues only: the title, the Big One, the island, the Earth, the lift-off', () => {
    const seen = new Set<CueId>();
    for (const sc of STORY) for (let p = 0; p <= 1; p += 0.02) {
      const m = musicFor(at(sc.id, p)); if (!m || m.gain < 0.01) continue;
      seen.add(m.cue);
      expect(['title', 'highway', 'bigOne', 'paddle', 'fall', 'reentry', 'angel'], `${sc.id} plays ${m.cue}`).toContain(sc.id);
    }
    expect([...seen].sort()).toEqual(['bigOne', 'earth', 'island', 'liftoff', 'title']);
    expect(musicFor(at('bigOne', 0.97))!.gain).toBe(0); // cut at the jump
    expect(musicFor(at('under', 0.5))).toBeNull();
  });

  it('follows the bike: drill pitch and the fan from cadence', () => {
    const drill = (rpm: number) => voicesFor(at('drill1', 0.5, { drill: { phase: 'bore', k: 0.5, layer: 0, layerK: 0, depth: 0, total: 1, ftp: 0.8, left: 10 } }), bike(rpm), 0).drill!;
    expect(drill(80).freq).toBeGreaterThan(drill(60).freq);
    expect(drill(0).gain).toBe(0);
    const fan = (rpm: number) => voicesFor(at('fan', 0.5, { fan: { glow: 0.5, heat: 0, inBand: true, eat: 0 } }), bike(rpm), 0).fan!;
    expect(fan(0).gain).toBe(0);
    expect(fan(90).filterHz!).toBeGreaterThan(fan(60).filterHz!);
  });
});

describe('one-shots (#197)', () => {
  const rng = () => 0.99; // no random extras
  it('drums the boardwalk planks in time with the distance ridden', () => {
    const t = new SoundTicker(); let n = 0;
    for (let i = 0; i <= 300; i++) n += t.step(at('boardwalk', 0.5, { routeS: i * 0.25 }), bike(80), 1 / 30, rng).filter((x) => x === 'plank').length;
    expect(n).toBe(Math.floor(300 * 0.25 / PLANK_M));
  });

  it('beats the belly’s heart, and holds everything while paused', () => {
    const t = new SoundTicker(); let n = 0;
    for (let i = 0; i < 30 * 60; i++) n += t.step(at('belly', 0.5), bike(80), 1 / 30, rng).filter((x) => x === 'heartbeat').length;
    expect(n).toBeGreaterThanOrEqual(63); expect(n).toBeLessThanOrEqual(64);
    for (let i = 0; i < 300; i++) expect(t.step(at('belly', 0.5), bike(80), 0, () => 0)).toEqual([]);
  });

  it('marks the fishing moments, each wingbeat, a purchase and a part', () => {
    const t = new SoundTicker(), fish = (phase: string) => ({ phase, tension: 0.5 }) as never;
    const seq = ['spot', 'cast', 'wait', 'bite', 'pull', 'haul', 'card'].flatMap((ph) => t.step(at('pier', 0.5, { fishing: fish(ph) }), bike(0), 1 / 30, rng));
    expect(seq).toEqual(['cast', 'lureIn', 'bite', 'splash', 'catch']);
    const w = (down: boolean) => ({ flight: { phase: 'wings', down } as never });
    t.step(at('wings', 0.5, w(false)), bike(70), 1 / 30, rng);
    expect(t.step(at('wings', 0.5, w(true)), bike(70), 1 / 30, rng)).toContain('flap');
    expect(t.step(at('wings', 0.5, w(true)), bike(70), 1 / 30, rng)).not.toContain('flap');
    const shop = at('shop1', 0.5); shop.economy = { ...shop.economy, rods: ['pier', 'surf'] };
    expect(t.step(shop, bike(0), 1 / 30, rng)).toContain('buy');
  });

  it('toots twice as Lou’s car passes under the cliff', () => {
    const t = new SoundTicker(); let horns = 0;
    for (let p = 0; p <= 1; p += 0.001) horns += t.step(at('cliff', p), bike(70), 1 / 30, rng).filter((x) => x === 'horn').length;
    expect(horns).toBe(2);
  });
});

describe('the generative cues (#197)', () => {
  it('play from the first bar, in tune and in range', () => {
    for (const cue of Object.keys(CUES) as CueId[]) {
      const notes = [0, 1, 2, 3].flatMap((b) => cueNotes(cue, b));
      expect(notes.length, cue).toBeGreaterThan(0);
      for (const n of notes) { expect(n.midi).toBeGreaterThanOrEqual(24); expect(n.midi).toBeLessThanOrEqual(108); expect(n.vol).toBeLessThanOrEqual(0.1); }
    }
  });
});
