import { describe, it, expect } from 'vitest';
import { createGameSession, testProfile, NullInput, TuningRegistry } from '../../../core';
import { synthTimeline } from '../../../media/synth/queue';
import { module } from '../index';
import { arcChain, arcHops, flakAim, inBurst, missileCount, railCount, spread, WEAPON } from '../sim/weapons';
import { gunshipAvailable, migrateSave } from '../sim/save';
import { CRAFTS, perks } from '../sim/progression';
import type { CraftId, SfSnapshot } from '../sim/types';
import type { MediaTimeline } from '../../../contracts';

const longMusic = () => synthTimeline({ style: 'mixed', songs: 20, seed: 1 });
const allUnlocked = { v: 3, best: 0, legacyBest: 0, runs: 1, onTargetS: 0, unlockCredit: 1000, craft: 'cruiser', totals: { kills: 0, bosses: 0 },
  unlocked: ['cruiser', 'gunship', 'escort', 'striker'], craftS: { cruiser: 0, gunship: 0, escort: 0, striker: 0 } };
function rig(craft: CraftId, timeline: MediaTimeline, script = 'z2', raw: Record<string, unknown> = allUnlocked) {
  const profile = testProfile(); profile.gameData.starfighter = raw;
  const tuning = new TuningRegistry({ profileId: profile.id, storage: null });
  const s = createGameSession({ game: module, profile, input: new NullInput(), fake: { script }, seed: 3, simOpts: { skipHangar: true, craft }, media: { timeline }, tuningRegistry: tuning });
  return { s, snap: () => s.sim.snapshot() as SfSnapshot };
}
const pos = (id: number, x: number, y: number) => ({ id, x, y });
const near = (xs: number[], grid: number[], tol = 0.04) => xs.filter(x => grid.some(g => Math.abs(g - x) < tol)).length / Math.max(1, xs.length);

describe('beat weapon rules (pure)', () => {
  it('four craft fill the hangar grid, each with its own weapon', () => {
    expect(CRAFTS).toHaveLength(4);
    expect(new Set(CRAFTS.map(c => WEAPON[c])).size).toBe(4);
  });
  it('missiles: more per beat as the arsenal grows, a bigger salvo on the bar line', () => {
    expect(missileCount(1, false)).toBe(1); expect(missileCount(3, false)).toBe(2); expect(missileCount(8, false)).toBe(3);
    for (let tier = 1; tier <= 8; tier++) expect(missileCount(tier, true)).toBeGreaterThan(missileCount(tier, false));
    expect(missileCount(4, true, 1)).toBe(missileCount(4, true) + 1);
  });
  it('spread aims at distinct targets first, then cycles', () => {
    expect(spread([1, 2, 3], 5)).toEqual([1, 2, 3, 1, 2]); expect(spread([], 3)).toEqual([]);
  });
  it('arc lightning jumps to the nearest unstruck enemy within range', () => {
    const a = pos(1, 0, 0), b = pos(2, 6, 0), c = pos(3, 12, 0), far = pos(4, 60, 0);
    expect(arcChain(a, [a, b, c, far], 5, 16).map(e => e.id)).toEqual([1, 2, 3]);
    expect(arcChain(a, [a, b, c], 1, 16).map(e => e.id)).toEqual([1, 2]);
    expect(arcHops(1)).toBe(1); expect(arcHops(8)).toBeGreaterThan(arcHops(4));
  });
  it('flak aims at the thickest cluster and its burst catches the cluster', () => {
    const wing = [pos(1, 0, 0), pos(2, 5, 0), pos(3, 10, 0)], lone = pos(4, 40, 10);
    const aim = flakAim([lone, ...wing], 6.5)!; expect(aim.id).toBe(2);
    expect(inBurst([lone, ...wing], aim.x, aim.y, 6.5).map(e => e.id).sort()).toEqual([1, 2, 3]);
    expect(flakAim([], 6.5)).toBeNull();
  });
  it('rails go twin at tier 4; level perks add salvo projectiles, never base damage', () => {
    expect(railCount(1)).toBe(1); expect(railCount(4)).toBe(2); expect(railCount(4, perks('striker', 4).salvo)).toBe(3);
    expect(perks('cruiser', 9).salvo).toBe(2); expect(perks('gunship', 9).flakRadius).toBeGreaterThan(perks('gunship', 1).flakRadius);
  });
});

describe('beat weapons in flight', () => {
  it('Escort arc lightning strikes on beats and chains through a wing', () => {
    const tl = longMusic(), r = rig('escort', tl); const at: number[] = []; let hops = 0;
    r.s.ctx.emit = ((ev: { type: string; data?: Record<string, number> }) => { if (ev.type === 'arc') { at.push(r.s.ctx.media!.positionS()); hops = Math.max(hops, ev.data?.hops ?? 0); } }) as typeof r.s.ctx.emit;
    r.s.step(30 * 120);
    expect(at.length).toBeGreaterThan(100); expect(near(at, tl.beats)).toBeGreaterThan(0.95); expect(hops).toBeGreaterThanOrEqual(2);
    expect(r.snap().weapon).toBe('arc'); expect(Number(r.s.sim.summary().kills)).toBeGreaterThan(20);
  }, 20_000);
  it('Striker rails fire instantly on eighth notes', () => {
    const tl = longMusic(), r = rig('striker', tl); const at: number[] = []; let sawRail = false;
    r.s.ctx.emit = ((ev: { type: string }) => { if (ev.type === 'rail') at.push(r.s.ctx.media!.positionS()); }) as typeof r.s.ctx.emit;
    for (let i = 0; i < 120; i++) { r.s.step(30); sawRail ||= r.snap().rails.length > 0; }
    const eighths = tl.beats.flatMap((b, i) => [b, (b + (tl.beats[i + 1] ?? b + 0.5)) / 2]);
    expect(at.length).toBeGreaterThan(200); expect(near(at, eighths)).toBeGreaterThan(0.95); expect(sawRail).toBe(true);
    expect(Number(r.s.sim.summary().kills)).toBeGreaterThan(20);
  }, 20_000);
  it('Gunship flak shells launch on beats and burst on beats, often catching several enemies', () => {
    const tl = longMusic(), r = rig('gunship', tl); const bursts: number[] = [];
    r.s.ctx.emit = ((ev: { type: string }) => { if (ev.type === 'flakBurst') bursts.push(r.s.ctx.media!.positionS()); }) as typeof r.s.ctx.emit;
    let maxShells = 0; for (let i = 0; i < 30 * 120; i++) { r.s.step(1); maxShells = Math.max(maxShells, r.snap().shells.length); }
    expect(bursts.length).toBeGreaterThan(100); expect(near(bursts, tl.beats)).toBeGreaterThan(0.9); expect(maxShells).toBeLessThanOrEqual(16);
    expect(r.snap().weapon).toBe('flak'); expect(Number(r.s.sim.summary().kills)).toBeGreaterThan(20);
  }, 20_000);
  it('idle riders fire no beat weapon', () => {
    for (const c of CRAFTS) { const r = rig(c, longMusic(), 'idle'); r.s.step(30 * 60); expect(Number(r.s.sim.summary().volleys)).toBe(0); }
  }, 20_000);
});

describe('Staccato Gunship (the spin craft)', () => {
  it('unlocks at Cruiser level 2 and stays unlocked', () => {
    const base = { ...allUnlocked, unlockCredit: 0, unlocked: ['cruiser'] };
    expect(gunshipAvailable(migrateSave({ ...base, craftS: { cruiser: 44 * 60, escort: 0 } }))).toBe(false);
    expect(gunshipAvailable(migrateSave({ ...base, craftS: { cruiser: 45 * 60, escort: 0 } }))).toBe(true);
    expect(rig('gunship', longMusic(), 'z2', { ...base, craftS: { cruiser: 0 } }).snap().craft).toBe('cruiser');
    const r = rig('gunship', longMusic(), 'z2', { ...base, craftS: { cruiser: 45 * 60 } });
    expect(r.snap().craft).toBe('gunship'); expect(r.snap().crafts.gunship.unlocked).toBe(true);
  });
  it('rides light gears (no headwind) and asks a faster spin than the Cruiser in pushes and burns', () => {
    const asks = (c: CraftId) => { const r = rig(c, longMusic(), 'cadence-follow'); let rpm = 0;
      for (let i = 0; i < 400; i++) { r.s.step(30); if (r.snap().drive.level === 'burn') rpm = Math.max(rpm, r.snap().drive.rpm ?? 0); }
      return { rpm, grade: Math.max(0, ...r.s.commands.flatMap(cmd => cmd.mode === 'sim' ? [cmd.gradePct] : [])), gears: r.s.sim.hud!().gears }; };
    const g = asks('gunship'), c = asks('cruiser');
    expect(g.gears).toBe(true); expect(g.grade).toBe(0); expect(c.grade).toBeGreaterThan(0);
    expect(g.rpm).toBeGreaterThanOrEqual(c.rpm + 6);
  }, 30_000);
});
