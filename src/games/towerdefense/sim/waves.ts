// Wave composition. Pure: everything random comes from the `rng` argument.
import { ELEMENTS, KIND_FROM, KINDS, type Element, type Kind } from './defs';

/** `route`: -1 walks the road; 0..2 is a Glider flight from that FLYER_SPAWNS point. */
export interface Spawn { at: number; kind: Kind; route: number }
/**
 * Waves come in sets of five, like workout intervals: three work waves, a boss wave, then an easy recovery wave
 * (a light stream at recovery effort) before the next set.
 */
export type WaveRole = 'work' | 'boss' | 'easy';
export const SET_LENGTH = 5;
export function waveRole(w: number): WaveRole {
  const pos = (w - 1) % SET_LENGTH;
  return pos === 3 ? 'boss' : pos === 4 ? 'easy' : 'work';
}
/** 1-based set number and position in it, for announcements. */
export const setOf = (w: number) => ({ set: Math.floor((w - 1) / SET_LENGTH) + 1, pos: (w - 1) % SET_LENGTH + 1 });
export interface WavePlan {
  wave: number; boss: boolean; role: WaveRole; spawns: Spawn[];
  /** The wave's main colour: most of its heavies, and the turret's weapon for the whole wave. */
  brood: Element;
  /** Count per colour (gold = boss, prism = shifting) for the forecast panel; `air` = Gliders among the blue. */
  counts: Record<Element | 'gold' | 'prism', number> & { air: number };
}
export interface WaveOpts {
  spawnWindowS: number; countScale: number;
  brood: Element;
  /** Share of the wave's slots that are the brood colour (the rest are off-colour, for the towers). */
  broodShare: number;
  /** Blue has no heavies: each blue slot is a swarm pack of this many darts or drones. */
  swarmPack: number;
}
export interface BroodOrderOpts {
  /** No colour more than this many waves in a row. */
  maxRun: number;
  /** Every run of this many consecutive waves has all three colours (< 3 = off). */
  coverWaves: number;
  /** Prefer any other colour to this one (bosses take turns); only the run limit outranks it. */
  avoid?: Element;
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
  // Turn-taking (`avoid`) outranks colour cover, never the run limit.
  const allowed = (c: Element) => c !== o.avoid;
  let pool = ELEMENTS.filter((c) => ok(c, true) && allowed(c));
  if (!pool.length) pool = ELEMENTS.filter((c) => ok(c, false) && allowed(c));
  if (!pool.length) pool = ELEMENTS.filter((c) => ok(c, true));
  if (!pool.length) pool = ELEMENTS.filter((c) => ok(c, false));
  if (!pool.length) pool = ELEMENTS;
  return pool[Math.floor(rng() * pool.length) % pool.length];
}

export interface ClearHealOpts { heal: number; speedBonus: number; waveMinS: number; waveMaxS: number; leakZero: number }
/**
 * Base HP restored when a wave is cleared at `elapsedS` (before its timeout) after the base took `leakDmg` that wave.
 * A fast clear adds up to `speedBonus` (full at waveMinS, none at waveMaxS); leaks scale the whole heal down, to 0 at `leakZero` damage.
 */
export function clearHealFor(elapsedS: number, leakDmg: number, o: ClearHealOpts): number {
  const span = Math.max(1e-6, o.waveMaxS - o.waveMinS);
  const fast = Math.max(0, Math.min(1, (o.waveMaxS - elapsedS) / span));
  const clean = o.leakZero > 0 ? Math.max(0, 1 - leakDmg / o.leakZero) : leakDmg > 0 ? 0 : 1;
  return Math.round((o.heal + o.speedBonus * fast) * clean);
}

/** Heavy kinds of each colour and their mix within that colour. The first kind can appear in any wave. Blue is swarm only. */
const COLOUR_KINDS: Record<Exclude<Element, 'blue'>, Array<{ kind: Kind; w: number }>> = {
  red: [{ kind: 'brute', w: 0.65 }, { kind: 'charger', w: 0.35 }],
  purple: [{ kind: 'armor', w: 0.7 }, { kind: 'carrier', w: 0.3 }],
};
function pickKind(el: Exclude<Element, 'blue'>, w: number, rng: () => number): Kind {
  const ks = COLOUR_KINDS[el].filter((k, i) => i === 0 || w >= KIND_FROM[k.kind]);
  let r = rng() * ks.reduce((s, k) => s + k.w, 0);
  for (const k of ks) { r -= k.w; if (r <= 0) return k.kind; }
  return ks[ks.length - 1].kind;
}

/**
 * What wave `w` sends before brood colouring: `heavies` = colour slots (a heavy, or a swarm pack if blue), plus
 * Glider packs, prisms and the boss. Waves are long work intervals, so a wave carries several old waves' worth.
 */
export function waveCounts(w: number, countScale = 1): { heavies: number; dart: number; prism: number; boss: number } {
  const role = waveRole(w), boss = role === 'boss';
  const k = (boss ? 0.6 : role === 'easy' ? 0.25 : 1) * countScale;
  const n = (from: Kind, f: number) => (w >= KIND_FROM[from] ? Math.max(0, Math.round(f * k)) : 0);
  // the pre-brood mix of brutes, bastions, chargers and carriers, recoloured by the brood
  const heavies = n('brute', 5 + w * 2.4) + n('armor', 2 + w * 0.8) + n('charger', 1 + w * 0.7) + n('carrier', w * 0.4);
  return { heavies: Math.max(1, heavies), dart: n('dart', 4 * Math.ceil(w * 0.7)), prism: n('prism', 1 + (w - 6) * 0.5), boss: boss ? 1 : 0 };
}

export function planWave(w: number, rng: () => number, o: WaveOpts): WavePlan {
  const route = () => Math.floor(rng() * 3) % 3;
  const window = o.spawnWindowS;
  const spawns: Spawn[] = [];
  const counts = waveCounts(w, o.countScale);
  if (counts.boss) spawns.push({ at: 3, kind: 'boss', route: -1 });
  for (let p = 0; p < counts.dart / 4; p++) { // Gliders come in packs of 4 along one flight route
    const at = 2 + rng() * window, r = route();
    for (let i = 0; i < 4; i++) spawns.push({ at: at + i * 0.35, kind: 'dart', route: r });
  }
  const main = Math.max(1, Math.round(counts.heavies * o.broodShare));
  const off = ELEMENTS.filter((c) => c !== o.brood);
  const pack = Math.max(1, Math.round(o.swarmPack));
  for (let i = 0; i < Math.max(main, counts.heavies); i++) {
    const el = i < main ? o.brood : off[Math.floor(rng() * 2) % 2];
    const at = 1 + rng() * window;
    if (el === 'blue') { // a swarm pack: Gliders once they're unlocked, else drones on the road
      const air = w >= KIND_FROM.dart && rng() < 0.5, r = air ? route() : -1;
      for (let k = 0; k < pack; k++) spawns.push({ at: at + k * 0.35, kind: air ? 'dart' : 'mini', route: r });
    } else spawns.push({ at, kind: pickKind(el, w, rng), route: -1 });
  }
  for (let i = 0; i < counts.prism; i++) spawns.push({ at: 1 + rng() * window, kind: 'prism', route: -1 });
  spawns.sort((a, b) => a.at - b.at);
  const tally = { blue: 0, red: 0, purple: 0, gold: 0, prism: 0, air: 0 };
  for (const s of spawns) { tally[KINDS[s.kind].color]++; if (s.route >= 0) tally.air++; }
  return { wave: w, boss: counts.boss > 0, role: waveRole(w), spawns, brood: o.brood, counts: tally };
}
