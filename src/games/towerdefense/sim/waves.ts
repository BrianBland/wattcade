// Wave composition. Pure: everything random comes from the `rng` argument.
import { ELEMENTS, KIND_FROM, KINDS, type Element, type Kind } from './defs';

export interface Spawn { at: number; kind: Kind; lane: number }
export interface WavePlan {
  wave: number; boss: boolean; mainLane: number; spawns: Spawn[];
  /** The wave's main colour: most of its heavies, and the turret's weapon for the whole wave. */
  brood: Element;
  /** Heavy count per lane per colour (gold = boss, prism = shifting) for the forecast panel. */
  lanes: Array<Record<Element | 'gold' | 'prism', number>>;
}
export interface WaveOpts {
  spawnWindowS: number; countScale: number;
  brood: Element;
  /** Share of the wave's heavies that are the brood colour (the rest are off-colour, for the towers). */
  broodShare: number;
}
export interface BroodOrderOpts {
  /** No colour more than this many waves in a row. */
  maxRun: number;
  /** Every run of this many consecutive waves has all three colours (< 3 = off). */
  coverWaves: number;
}

/**
 * The next wave's brood colour, given the colours so far (oldest first). A seeded mix that never repeats
 * a colour more than `maxRun` times and keeps all three colours in every `coverWaves` consecutive waves.
 */
export function nextBrood(history: readonly Element[], rng: () => number, o: BroodOrderOpts): Element {
  const run = Math.max(1, Math.round(o.maxRun)), cover = Math.round(o.coverWaves);
  const missing = (seq: readonly Element[]) => ELEMENTS.filter((c) => !seq.includes(c)).length;
  const ok = (c: Element, strict: boolean) => {
    const seq = [...history, c];
    if (seq.length > run && seq.slice(-run - 1).every((x) => x === c)) return false;
    if (!strict || cover < 3) return true;
    if (seq.length >= cover && missing(seq.slice(-cover)) > 0) return false;
    // never leave the next window needing two colours at once
    return missing(seq.slice(-(cover - 1))) <= 1;
  };
  let pool = ELEMENTS.filter((c) => ok(c, true));
  if (!pool.length) pool = ELEMENTS.filter((c) => ok(c, false));
  if (!pool.length) pool = ELEMENTS;
  return pool[Math.floor(rng() * pool.length) % pool.length];
}

/** Heavy kinds of each colour and their mix within that colour. The first kind can appear in any wave. */
const COLOUR_KINDS: Record<Element, Array<{ kind: Kind; w: number }>> = {
  blue: [{ kind: 'stinger', w: 1 }],
  red: [{ kind: 'brute', w: 0.65 }, { kind: 'charger', w: 0.35 }],
  purple: [{ kind: 'armor', w: 0.7 }, { kind: 'carrier', w: 0.3 }],
};
function pickKind(el: Element, w: number, rng: () => number): Kind {
  const ks = COLOUR_KINDS[el].filter((k, i) => i === 0 || w >= KIND_FROM[k.kind]);
  let r = rng() * ks.reduce((s, k) => s + k.w, 0);
  for (const k of ks) { r -= k.w; if (r <= 0) return k.kind; }
  return ks[ks.length - 1].kind;
}

/** How many of each kind wave `w` sends before brood colouring: `heavies` = coloured heavies, plus darts, prisms, boss. */
export function waveCounts(w: number, countScale = 1): { heavies: number; dart: number; prism: number; boss: number } {
  const boss = w % 5 === 0;
  const k = (boss ? 0.6 : 1) * countScale;
  const n = (from: Kind, f: number) => (w >= KIND_FROM[from] ? Math.max(0, Math.round(f * k)) : 0);
  // the pre-brood mix of brutes, bastions, chargers and carriers, now recoloured by the brood
  const heavies = n('brute', 2 + w * 0.8) + n('armor', 1 + Math.floor(w / 4)) + n('charger', Math.floor((w - 3) / 3)) + n('carrier', Math.floor((w - 5) / 4));
  return { heavies, dart: n('dart', 4 * Math.floor((w - 1) / 3)), prism: n('prism', Math.floor((w - 8) / 3)), boss: boss ? 1 : 0 };
}

export function planWave(w: number, rng: () => number, o: WaveOpts): WavePlan {
  const mainLane = Math.floor(rng() * 3) % 3;
  const second = w >= 8 ? (mainLane + 1 + (rng() < 0.5 ? 0 : 1)) % 3 : -1;
  const pickLane = () => {
    const r = rng();
    if (r < (second >= 0 ? 0.45 : 0.6)) return mainLane;
    if (second >= 0 && r < 0.75) return second;
    return Math.floor(rng() * 3) % 3;
  };
  const window = o.spawnWindowS + Math.min(10, w * 0.25);
  const spawns: Spawn[] = [];
  const counts = waveCounts(w, o.countScale);
  if (counts.boss) spawns.push({ at: 3, kind: 'boss', lane: mainLane });
  for (let p = 0; p < counts.dart / 4; p++) { // darts come in packs of 4 down one lane
    const at = 2 + rng() * window, lane = pickLane();
    for (let i = 0; i < 4; i++) spawns.push({ at: at + i * 0.35, kind: 'dart', lane });
  }
  const main = Math.max(1, Math.round(counts.heavies * o.broodShare));
  const off = ELEMENTS.filter((c) => c !== o.brood);
  for (let i = 0; i < Math.max(main, counts.heavies); i++) {
    const el = i < main ? o.brood : off[Math.floor(rng() * 2) % 2];
    spawns.push({ at: 1 + rng() * window, kind: pickKind(el, w, rng), lane: pickLane() });
  }
  for (let i = 0; i < counts.prism; i++) spawns.push({ at: 1 + rng() * window, kind: 'prism', lane: pickLane() });
  spawns.sort((a, b) => a.at - b.at);
  const lanes = [0, 1, 2].map(() => ({ blue: 0, red: 0, purple: 0, gold: 0, prism: 0 }));
  for (const s of spawns) lanes[s.lane][KINDS[s.kind].color]++;
  return { wave: w, boss: counts.boss > 0, mainLane, spawns, brood: o.brood, lanes };
}
