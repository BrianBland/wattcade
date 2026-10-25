// The fish catalogue: what bites at each fishing stop, how heavy it runs and what Lou pays for it (#188 banks it).
// Pure data plus the pick; the sprint itself stays sized by the story plan (`PullPlan.size`).

export type FishId = 'perch' | 'greenling' | 'rockfish' | 'lingcod' | 'parrotfish' | 'tang' | 'magmaEel';
export type FishingLocation = 'turnout' | 'pier' | 'beach' | 'lava';

export interface FishKind {
  id: FishId; name: string;
  /** Weight range (kg) and body length range (m, for the model). */
  kg: [number, number]; lenM: [number, number];
  /** Lou's price per kg ($). */
  perKg: number;
  /** How hard it fights 0..1: with the size, sets the trainer surge (`fishHeft`). */
  fight: number;
}

export const FISH: Record<FishId, FishKind> = {
  perch: { id: 'perch', name: 'Surf perch', kg: [0.2, 0.9], lenM: [0.18, 0.34], perKg: 6, fight: 0.1 },
  greenling: { id: 'greenling', name: 'Kelp greenling', kg: [0.5, 1.8], lenM: [0.28, 0.48], perKg: 8, fight: 0.35 },
  rockfish: { id: 'rockfish', name: 'Rockfish', kg: [0.6, 2.4], lenM: [0.3, 0.52], perKg: 9, fight: 0.45 },
  lingcod: { id: 'lingcod', name: 'Lingcod', kg: [2, 9], lenM: [0.6, 1.1], perKg: 12, fight: 0.85 },
  parrotfish: { id: 'parrotfish', name: 'Parrotfish', kg: [1, 4], lenM: [0.35, 0.7], perKg: 10, fight: 0.55 },
  tang: { id: 'tang', name: 'Yellow tang', kg: [0.15, 0.6], lenM: [0.15, 0.25], perKg: 14, fight: 0.15 },
  magmaEel: { id: 'magmaEel', name: 'Magma eel', kg: [1.5, 7], lenM: [0.8, 1.6], perKg: 20, fight: 1 },
};

export interface Spot {
  id: string; name: string;
  /** Relative odds per species. */
  mix: Partial<Record<FishId, number>>;
  /** Where the spot sits in the view: −1 (left) .. 1 (right), and how far out (0 near .. 1 far). */
  x: number; far: number;
}

/** Two or three spots per stop, each with its own mix (storyboard: rocks / kelp / pier end). */
export const SPOTS: Record<FishingLocation, Spot[]> = {
  turnout: [
    { id: 'rocks', name: 'Rocks', mix: { perch: 3, rockfish: 1 }, x: -0.6, far: 0.35 },
    { id: 'kelp', name: 'Kelp bed', mix: { greenling: 3, perch: 1, rockfish: 1 }, x: 0.1, far: 0.7 },
    { id: 'point', name: 'The point', mix: { rockfish: 3, greenling: 1 }, x: 0.65, far: 0.55 },
  ],
  pier: [
    { id: 'pilings', name: 'Pilings', mix: { perch: 2, rockfish: 2 }, x: -0.55, far: 0.3 },
    { id: 'sand', name: 'Sand flat', mix: { perch: 2, greenling: 2 }, x: 0.05, far: 0.55 },
    { id: 'end', name: 'Pier end', mix: { lingcod: 3, rockfish: 1 }, x: 0.6, far: 0.9 },
  ],
  beach: [
    { id: 'reef', name: 'Reef', mix: { parrotfish: 3, tang: 1 }, x: -0.45, far: 0.65 },
    { id: 'shallows', name: 'Shallows', mix: { tang: 3, parrotfish: 1 }, x: 0.45, far: 0.3 },
  ],
  lava: [
    { id: 'crust', name: 'Crust', mix: { magmaEel: 1 }, x: -0.4, far: 0.35 },
    { id: 'vent', name: 'Vent', mix: { magmaEel: 1 }, x: 0.45, far: 0.8 },
  ],
};

/** A hooked fish. `credit` < 1 when the hook set itself (late strike). */
export interface FishCatch {
  id: FishId; name: string; kg: number; lenM: number; value: number;
  /** 0..1 within the species' range (the model's scale, the card's "big one" flourish). */
  size: number;
  credit: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * clamp01(k);

/**
 * Pick the fish on the hook: species by the spot's odds, size from the plan's sprint size, the cast distance
 * (farther = bigger) and a little luck. Deterministic for a given `rng`.
 */
export function pickFish(spot: Spot, planSize: number, cast: number, credit: number, rng: () => number): FishCatch {
  const entries = Object.entries(spot.mix) as Array<[FishId, number]>;
  const total = entries.reduce((a, [, w]) => a + w, 0);
  let r = rng() * total, id = entries[entries.length - 1][0];
  for (const [k, w] of entries) { if ((r -= w) < 0) { id = k; break; } }
  const f = FISH[id];
  const size = clamp01(0.35 * planSize + 0.35 * cast * (0.5 + 0.5 * spot.far) + 0.3 * rng());
  const kg = +lerp(f.kg[0], f.kg[1], size).toFixed(2);
  return { id, name: f.name, kg, lenM: +lerp(f.lenM[0], f.lenM[1], size).toFixed(2), value: Math.max(1, Math.round(kg * f.perKg * credit)), size: +size.toFixed(2), credit };
}

/** The trainer surge for a hooked fish, 0..1: the species' fight, a little more for a big one. */
export const fishHeft = (c: Pick<FishCatch, 'id' | 'size'>) => FISH[c.id].fight * (0.6 + 0.4 * c.size);

/** What the rider says when one gets away (≤ 8 words; picked by rng). */
export const ESCAPE_LINES: Record<FishingLocation, string[]> = {
  turnout: ['He had somewhere to be.', 'Catch and release. On purpose.', "That's fine. I'm fine."],
  pier: ['The pier keeps that one.', 'Next time, buddy.', 'I let him win.'],
  beach: ['Even the fish are on island time.', 'Fine. Coconuts, then.'],
  lava: ['Too hot to hold anyway.', 'It melted my knot.'],
};
