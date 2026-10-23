import { describe, expect, it } from 'vitest';
import type { FishPhase, FishingView } from '../sim/fishing';
import { castTarget, fishPose } from '../render/fishingPose';

const view = (phase: FishPhase, phaseT: number, extra: Partial<FishingView> = {}): FishingView => ({
  location: 'turnout', phase, phaseT, spot: 1,
  spots: [{ id: 'a', name: 'A', x: -0.6, far: 0.3 }, { id: 'b', name: 'B', x: 0.2, far: 0.8 }],
  cast: 0.6, tension: 0, stamina: 1, twitch: false, nibbleAge: 99, caught: [], slot: 0, slots: 2, tries: 0, autoIn: -1,
  ...extra,
});
const FISH = { id: 'perch' as const, name: 'Surf perch', kg: 0.5, lenM: 0.25, value: 3, size: 0.4, credit: 1 };

describe('fishing pose', () => {
  it('casts toward the picked spot, farther with a harder spin', () => {
    expect(castTarget(view('wait', 0)).x).toBe(0.2);
    expect(castTarget(view('wait', 0, { cast: 1 })).far).toBeGreaterThan(castTarget(view('wait', 0, { cast: 0 })).far);
    const fly = [0, 0.5, 1, 1.5, 2, 2.6].map((u) => fishPose(view('cast', u), 0).end.fly);
    for (let i = 1; i < fly.length; i++) expect(fly[i]).toBeGreaterThanOrEqual(fly[i - 1]);
    expect(fly[0]).toBe(0); expect(fly.at(-1)).toBeCloseTo(1);
    expect(fishPose(view('cast', 0.55), 0).rodSwing).toBeLessThan(-0.8); // wound up over the shoulder
  });
  it('the bobber floats, dips on a nibble, plunges on the bite and is gone in the fight', () => {
    const rest = fishPose(view('wait', 5), 0), nib = fishPose(view('wait', 5, { nibbleAge: 0.05 }), 0);
    expect(rest.bobber && nib.bobber).toBe(true);
    expect(nib.end.lift).toBeLessThan(rest.end.lift);
    expect(nib.bend).toBeGreaterThan(rest.bend);
    expect(fishPose(view('bite', 0.5), 0).bobber).toBe(false);
    expect(fishPose(view('bite', 0.5), 0).end.lift).toBeLessThan(0);
    expect(fishPose(view('pull', 3, { tension: 0.5, stamina: 0.5, fish: FISH }), 0).bobber).toBe(false);
  });
  it('the rod bends with the load and the fish comes in as it tires', () => {
    const light = fishPose(view('pull', 3, { tension: 0.2, stamina: 1, fish: FISH }), 1), heavy = fishPose(view('pull', 3, { tension: 0.9, stamina: 0.2, fish: FISH }), 1);
    expect(heavy.bend).toBeGreaterThan(light.bend + 0.4);
    expect(heavy.end.far).toBeLessThan(light.end.far);
    expect(heavy.sag).toBe(0);
  });
  it('the fish leaps, is hauled up and dangles through the card; an escape leaves a slack line', () => {
    expect(fishPose(view('pull', 3, { fish: FISH }), 0).fish).toBeNull();
    const leap = fishPose(view('haul', 0.5, { fish: FISH }), 0).fish!;
    expect(leap.leap).toBeGreaterThan(0.1);
    expect(leap.hang).toBe(false);
    expect(fishPose(view('haul', 2.5, { fish: FISH }), 0).fish!.hang).toBe(true);
    expect(fishPose(view('card', 1, { fish: FISH }), 0).fish!.hang).toBe(true);
    const esc = fishPose(view('escape', 0.3, { fish: FISH }), 0);
    expect(esc.sag).toBe(1);
    expect(esc.fish).toBeNull();
    expect(esc.splashes.length).toBe(1);
  });
});

describe('fish models', () => {
  it('every species in the catalogue builds, within a small voxel budget', async () => {
    const { buildFish } = await import('../world/fish');
    const { FISH } = await import('../sim/catalogue');
    for (const k of Object.values(FISH)) {
      const small = buildFish(k.id, k.lenM[0]).count(), big = buildFish(k.id, k.lenM[1]).count();
      expect(small).toBeGreaterThan(100);
      expect(big).toBeLessThan(20_000);
    }
  });
});
