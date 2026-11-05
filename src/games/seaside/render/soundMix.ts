// The Seaside mix (#197), pure: what every scene sounds like, from the snapshot and the bike. `render/sound.ts` plays it.
// Beds are looping filtered noise (surf, tyres, wind, lava hiss…), voices are continuous synth tones that follow the bike
// (drill pitch from cadence, the fan, the reel's drag, Lou's radio organ), one-shots come from `SoundTicker` (rhythms
// and the moments the snapshot changes: a cast, a bite, a part snapping on), and `musicFor` says which cue plays how loud.
// Silence is on purpose in the fall until the Earth starts to grow.
import type { BikeState } from '../../../contracts';
import { FALL } from '../sim/gate';
import { STORY } from '../sim/story';
import type { SeasideSnapshot } from '../sim/types';
import { ANGEL, CLIFF } from './endingShots';

export type BedId = 'surf' | 'tyres' | 'gravel' | 'wind' | 'underwater' | 'lava' | 'fire' | 'crackle' | 'static' | 'lap'
  | 'insect1' | 'insect2' | 'insect3' | 'insect4';
/** Noise band per bed: centre Hz, Q, and level at full volume. */
export const BEDS: Record<BedId, { freq: number; q: number; vol: number }> = {
  surf: { freq: 420, q: 0.5, vol: 0.22 }, tyres: { freq: 900, q: 1.2, vol: 0.07 }, gravel: { freq: 2600, q: 0.9, vol: 0.06 },
  wind: { freq: 320, q: 0.45, vol: 0.2 }, underwater: { freq: 140, q: 0.35, vol: 0.32 }, lava: { freq: 3600, q: 0.6, vol: 0.08 },
  fire: { freq: 240, q: 0.4, vol: 0.4 }, crackle: { freq: 2200, q: 3, vol: 0.05 }, static: { freq: 1600, q: 2.2, vol: 0.04 },
  lap: { freq: 650, q: 0.7, vol: 0.12 },
  insect1: { freq: 4300, q: 9, vol: 0.05 }, insect2: { freq: 5700, q: 10, vol: 0.04 }, insect3: { freq: 7100, q: 12, vol: 0.035 },
  insect4: { freq: 8600, q: 14, vol: 0.03 },
};
export const INSECTS: readonly BedId[] = ['insect1', 'insect2', 'insect3', 'insect4'];

export type VoiceId = 'drill' | 'fan' | 'drag' | 'tone' | 'choir' | 'radio';
export interface VoiceLevel { gain: number; freq: number; filterHz?: number }

export type CueId = 'title' | 'bigOne' | 'island' | 'earth' | 'liftoff';

/** The one-shots, by name; `render/sound.ts` maps each to a recipe. */
export type Shot = 'gull' | 'plank' | 'heartbeat' | 'drip' | 'groan' | 'lavaBoom' | 'lavaBlurp' | 'bubble' | 'flap' | 'click'
  | 'cast' | 'lureIn' | 'bite' | 'splash' | 'catch' | 'escape' | 'buy' | 'boltOn' | 'layer' | 'crack' | 'gasp' | 'horn'
  | 'paddle' | 'birdCall' | 'torch';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const COAST = new Set(['title', 'highway', 'turnout1', 'rollers', 'toPier', 'pier', 'bigOne', 'sunset', 'cliff']);
const BELLY = new Set(['eyesOpen', 'belly', 'spareParts', 'drill1']);
const CAVE = new Set(['cavern', 'bridge', 'magma', 'fan', 'toGate', 'drill2']);
const LAVA = new Set(['bridge', 'magma', 'fan', 'toGate']);
const SHOPS = new Set(['shop1', 'pierStand']);

type Snap = Pick<SeasideSnapshot, 'sceneId' | 'sceneT' | 'speed' | 'scene' | 'fishing' | 'drill' | 'fan' | 'flight' | 'shop' | 'menu' | 'pull'>;
type Bike = Pick<BikeState, 'cadence3s' | 'power3s'>;

/** Bed levels 0..1 (× `BEDS[id].vol`) for this moment. */
export function bedsFor(s: Snap): Partial<Record<BedId, number>> {
  const id = s.sceneId, p = s.scene.progress, v = s.speed, b: Partial<Record<BedId, number>> = {};
  if (s.menu) return { surf: 0.6 };
  if (s.shop || SHOPS.has(id)) return (s.shop?.id ?? id) === 'pierStand' ? { surf: 0.5, static: 1 } : { surf: 0.18, static: 1 };
  if (COAST.has(id)) {
    b.surf = id === 'bigOne' ? 1 - 0.8 * smooth(0.5, 0.95, p) : id === 'sunset' ? 0.8 : 1;
    b.tyres = clamp01(v / 9);
    if (id === 'turnout1' || id === 'pier') b.gravel = id === 'turnout1' ? 0.6 : 0;
    if (id === 'sunset') { b.insect1 = 0.5; b.insect3 = 0.3; } // crickets
    if (id === 'cliff') { const air = smooth(0.02, 0.12, p); b.tyres = (b.tyres ?? 0) * (1 - air); b.wind = 0.3 + 0.4 * air; }
  }
  if (BELLY.has(id)) b.underwater = 0.3; // the gut's muffled churn under the heartbeat
  if (id === 'under') { b.underwater = 1 - 0.6 * smooth(0.5, 1, p); }
  if (id === 'breakthrough') { b.underwater = 1 - smooth(0.6, 0.9, p); b.lap = smooth(0.85, 1, p); }
  if (id === 'paddle' || id === 'beach') { b.lap = 1; b.surf = 0.35; }
  if (id === 'beach') b.crackle = 1;
  if (id === 'boardwalk' || id === 'cutStones' || id === 'monkeyMouth') {
    // the insects build along the boardwalk, all four in the cut stones, then drop out one species at a time in the ruins
    const n = id === 'boardwalk' ? 1 + 3 * p : id === 'cutStones' ? 4 - 3 * smooth(0.55, 1, p) : 1 - p;
    INSECTS.forEach((k, i) => { b[k] = clamp01(n - i); });
  }
  if (id === 'temple') { b.lap = 0.3; b.wind = 0.12; } // the pool, the hall's air
  if (CAVE.has(id)) { b.wind = id === 'cavern' ? 0.15 + 0.5 * smooth(0.4, 0.8, p) : 0.1; b.crackle = id === 'cavern' ? 0.7 : 0.3; }
  if (LAVA.has(id)) b.lava = id === 'fan' ? 0.4 + 0.6 * (s.fan?.glow ?? 0) : 1;
  if (id === 'reentry' && s.flight?.phase === 'reentry') { b.fire = s.flight.fire; b.wind = 0.6 * s.flight.cloud + 0.6 * s.flight.out; }
  if (id === 'wings') b.wind = 0.45 + 0.4 * clamp01(v / 18);
  if (id === 'angel') { const t = p * ANGEL_S; b.wind = 0.7 * (1 - smooth(ANGEL.easeS, ANGEL.whiteS, t)); b.surf = smooth(ANGEL.birdS, ANGEL.birdS + 3, t) * 0.7; }
  // the fall: nothing at all
  return b;
}
const ANGEL_S = STORY.find((x) => x.id === 'angel')!.planS;

/** Continuous voices that follow the bike. */
export function voicesFor(s: Snap, bike: Bike, clock: number): Partial<Record<VoiceId, VoiceLevel>> {
  const out: Partial<Record<VoiceId, VoiceLevel>> = {}, cad = Math.max(0, bike.cadence3s);
  if (s.drill && (s.sceneId === 'drill1' || s.sceneId === 'drill2')) {
    const on = s.drill.phase === 'bore' || s.drill.phase === 'crack' ? 1 : s.drill.phase === 'start' ? s.drill.k : 0.15;
    out.drill = { gain: 0.09 * on * clamp01(cad / 40), freq: 38 + cad * 1.35, filterHz: 500 + cad * 9 };
  }
  if (s.fan && s.sceneId === 'fan') out.fan = { gain: 0.16 * clamp01(cad / 50) * (1 - s.fan.eat), freq: 0, filterHz: 260 + cad * 9 };
  const f = s.fishing;
  if (f && (f.phase === 'pull' || f.phase === 'haul')) out.drag = { gain: 0.05 * f.tension, freq: 0, filterHz: 1800 + 2200 * f.tension };
  if (s.sceneId === 'monkeyMouth' || s.sceneId === 'temple') {
    out.tone = { gain: s.sceneId === 'monkeyMouth' ? 0.12 * smooth(0, 0.9, s.scene.progress) : 0.06, freq: 55 };
    if (s.sceneId === 'temple') out.choir = { gain: 0.05 * smooth(0, 0.3, s.scene.progress), freq: 110 };
  }
  if (s.shop || SHOPS.has(s.sceneId)) out.radio = { gain: 0.025, freq: radioNote(clock), filterHz: 1400 }; // same ballgame, same inning
  return out;
}

/** The ballpark organ on Lou's radio: a little vamp, looped. */
const RADIO = [67, 72, 76, 79, 76, 72, 74, 71, 67, 72, 76, 79, 81, 79, 76, 72];
export const radioNote = (t: number) => 440 * 2 ** ((RADIO[Math.floor(t / 0.32) % RADIO.length] - 69) / 12);

/** Which music cue plays and how loud (0..1). Five places only: the title, the Big One, the island, the Earth, the end. */
export function musicFor(s: Pick<SeasideSnapshot, 'sceneId' | 'sceneT' | 'scene' | 'menu'>): { cue: CueId; gain: number } | null {
  const id = s.sceneId, t = s.sceneT, p = s.scene.progress;
  if (s.menu) return null;
  if (id === 'title') return { cue: 'title', gain: smooth(0, 3, t) };
  if (id === 'highway' && t < 12) return { cue: 'title', gain: 1 - smooth(0, 12, t) };
  if (id === 'bigOne') return { cue: 'bigOne', gain: smooth(0.05, 0.35, p) * (1 - smooth(0.88, 0.94, p)) }; // cut at the jump
  if (id === 'paddle' && t < 80) return { cue: 'island', gain: smooth(2, 8, t) * (1 - smooth(60, 80, t)) };
  if (id === 'fall' && t >= FALL.cueS) return { cue: 'earth', gain: smooth(FALL.cueS, FALL.cueS + 10, t) };
  if (id === 'reentry' && t < 4) return { cue: 'earth', gain: 1 - smooth(0, 4, t) };
  if (id === 'angel') return { cue: 'liftoff', gain: smooth(ANGEL.easeS, ANGEL.easeS + 6, t) * (1 - 0.6 * smooth(ANGEL.whiteS, ANGEL.birdS + 8, t)) };
  return null;
}

/** Rhythms and moments → one-shots. Feed it every frame with the story-clock dt (0 while paused) and an rng. */
export class SoundTicker {
  private prev: Snap | null = null;
  private acc: Record<string, number> = {};
  private routeS = 0;
  private bought = -1; private parts = -1;
  step(s: Snap & Pick<SeasideSnapshot, 'routeS' | 'economy' | 'parts'>, bike: Bike, dt: number, rng: () => number): Shot[] {
    const out: Shot[] = [], prev = this.prev, id = s.sceneId, p = s.scene.progress, cad = Math.max(0, bike.cadence3s);
    const every = (key: string, periodS: number, shot: Shot) => {
      if (!(periodS > 0) || !Number.isFinite(periodS)) return;
      this.acc[key] = (this.acc[key] ?? 0) + dt;
      if (this.acc[key] >= periodS) { this.acc[key] %= periodS; out.push(shot); }
    };
    const chance = (perS: number, shot: Shot) => { if (rng() < perS * dt) out.push(shot); };
    if (dt > 0 && !s.menu) {
      if (COAST.has(id) && id !== 'cliff' && !s.shop) chance(id === 'pier' ? 0.12 : 0.05, 'gull');
      if (id === 'angel' && p * ANGEL_S >= ANGEL.birdS) chance(0.25, 'gull');
      if (id === 'boardwalk') { // the planks drum in time with the speed
        const ds = s.routeS - this.routeS;
        if (ds > 0 && ds < 5) { this.acc.plank = (this.acc.plank ?? 0) + ds; if (this.acc.plank >= PLANK_M) { this.acc.plank %= PLANK_M; out.push('plank'); } }
      }
      if (id === 'under' && p > 0.45) every('heart', 60 / 52, 'heartbeat');
      if (BELLY.has(id)) { every('heart', 60 / (id === 'belly' ? 64 : 58), 'heartbeat'); chance(0.12, 'drip'); chance(0.025, 'groan'); }
      if (id === 'breakthrough') chance(6 * (1 - smooth(0.6, 0.85, p)), 'bubble');
      if (CAVE.has(id) || id === 'temple') chance(id === 'temple' ? 0.15 : 0.25, 'drip');
      if (id === 'cavern') chance(0.08, 'torch');
      if (LAVA.has(id)) { chance(0.04, 'lavaBoom'); chance(0.3, 'lavaBlurp'); }
      if (id === 'paddle' && cad > 20) every('stroke', 60 / Math.max(30, cad) * 2, 'paddle');
      if (id === 'beach' || id === 'cutStones') chance(0.08, 'birdCall');
      if (s.fishing?.phase === 'wait' && cad > 15) every('reel', 60 / cad / 3, 'click'); // the ratchet, three clicks a turn
      if (id === 'cliff' && prev?.sceneId === 'cliff') { // two toots as Lou's car comes under you
        const a = prev.scene.progress, h1 = CLIFF.passP - 0.06, h2 = CLIFF.passP - 0.045;
        if ((a < h1 && p >= h1) || (a < h2 && p >= h2)) out.push('horn');
      }
    }
    if (prev && dt >= 0) {
      const f0 = prev.fishing, f1 = s.fishing;
      if (f1 && f1.phase !== f0?.phase) {
        const map: Partial<Record<string, Shot>> = { cast: 'cast', wait: 'lureIn', bite: 'bite', haul: 'splash', card: 'catch', escape: 'escape' };
        const shot = map[f1.phase]; if (shot) out.push(shot);
      }
      const w0 = prev.flight, w1 = s.flight;
      if (w1?.phase === 'wings' && w0?.phase === 'wings' && w1.down && !w0.down) out.push('flap');
      const d0 = prev.drill, d1 = s.drill;
      if (d0 && d1 && d1.layer !== d0.layer) out.push('layer');
      if (d1 && d1.phase === 'crack' && d0?.phase !== 'crack') out.push('crack');
      if (id === 'breakthrough' && (prev.sceneId !== id || prev.scene.progress < 0.88) && p >= 0.88) out.push('gasp');
    }
    // moments that come from the save: a purchase, a part snapping on (compare counts)
    const bought = s.economy.rods.length + s.economy.extras.length, parts = s.parts?.items.filter((i) => i.got).length ?? 0;
    if (this.bought >= 0 && bought > this.bought) out.push('buy');
    if (this.parts >= 0 && parts > this.parts) out.push('boltOn');
    this.bought = bought; this.parts = parts;
    this.prev = s; this.routeS = s.routeS;
    return out;
  }
}
/** Metres per plank beat on the boardwalk. */
export const PLANK_M = 1.3;
