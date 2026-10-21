// Per-biome scenery one-shots (birds, wind, whales...). A pure scheduler: given the time, the biome weights and the
// rider's speed it says which sounds to play now; the renderer plays them. Quiet by design.
import type { SfxName } from '../../../audio/sfx';
import type { BiomeId } from '../sim/terrain';

export interface Voice { sfx: SfxName; every: [number, number]; vol: number; pitch?: [number, number]; /** Only while this landmark is on screen (see `landmarkNear`). */ near?: Landmark }
export type SceneId = BiomeId | 'driveIn';

export const SOUNDSCAPE: Record<SceneId, Voice[]> = {
  countryside: [
    { sfx: 'songbird', every: [5, 11], vol: 1, pitch: [0.85, 1.2] }, { sfx: 'birdChirp', every: [7, 15], vol: 1, pitch: [0.8, 1.15] },
    { sfx: 'cow', every: [25, 50], vol: 0.8, pitch: [0.85, 1.1] },
  ],
  seaside: [{ sfx: 'waveWash', every: [6, 11], vol: 1 }, { sfx: 'gull', every: [9, 20], vol: 0.8, pitch: [0.85, 1.15] }],
  underwater: [{ sfx: 'bubblePop', every: [1.5, 4], vol: 1, pitch: [0.7, 1.4] }, { sfx: 'whale', every: [20, 40], vol: 1, pitch: [0.8, 1.1] }],
  jungle: [
    { sfx: 'birdTrill', every: [4, 9], vol: 1, pitch: [0.75, 1.2] }, { sfx: 'birdWhistle', every: [5, 12], vol: 1, pitch: [0.8, 1.2] },
    { sfx: 'monkeyHoot', every: [20, 40], vol: 1, pitch: [0.85, 1.15] },
    { sfx: 'waterfall', every: [2.8, 3.2], vol: 1, near: 'waterfall' },
  ],
  desert: [{ sfx: 'windGust', every: [8, 16], vol: 1, pitch: [0.8, 1.2] }, { sfx: 'hawk', every: [18, 35], vol: 1, pitch: [0.9, 1.1] }],
  volcano: [{ sfx: 'rumble', every: [9, 18], vol: 1, pitch: [0.8, 1.2] }, { sfx: 'lavaBubble', every: [1.5, 4.5], vol: 1, pitch: [0.6, 1.3] }],
  snow: [{ sfx: 'windHowl', every: [9, 18], vol: 1, pitch: [0.85, 1.2] }],
  moon: [{ sfx: 'ufoWarble', every: [10, 22], vol: 1, pitch: [0.8, 1.25] }],
  autumn: [{ sfx: 'songbird', every: [8, 17], vol: 0.65, pitch: [0.8, 1.1] }, { sfx: 'windGust', every: [16, 30], vol: 0.45 }],
  marsh: [{ sfx: 'croak', every: [7, 15], vol: 0.35, pitch: [0.8, 1.1] }, { sfx: 'plop', every: [11, 21], vol: 0.22 }, { sfx: 'birdWhistle', every: [18, 32], vol: 0.45 }],
  market: [{ sfx: 'cricket', every: [3, 7], vol: 0.5 }, { sfx: 'bell', every: [24, 42], vol: 0.15, pitch: [1.3, 1.6] }],
  sky: [{ sfx: 'whale', every: [24, 42], vol: 0.35, pitch: [1.1, 1.35] }, { sfx: 'birdChirp', every: [10, 22], vol: 0.5 }, { sfx: 'windGust', every: [18, 32], vol: 0.3 }],
  driveIn: [{ sfx: 'cricket', every: [1.2, 3], vol: 1, pitch: [0.9, 1.1] }, { sfx: 'windGust', every: [14, 28], vol: 0.6, pitch: [0.8, 1] }],
};

export interface Shot { sfx: SfxName; vol: number; pitch: number }

/** Backdrop landmarks a voice can be tied to. Span matches the painted repeat in `worldPolish.ts`. */
export type Landmark = 'waterfall';
const LANDMARKS: Record<Landmark, { span: number; at: number }> = { waterfall: { span: 360, at: 100 } };
/** 1 under the landmark, falling to 0 across half its repeat. The jungle falls sit at this spot in each 360 px of backdrop scroll. */
export function landmarkNear(id: Landmark, scroll: number, viewW: number): number {
  const { span, at } = LANDMARKS[id];
  const x = ((at - scroll) % span + span) % span;
  const dx = Math.min(Math.abs(x - viewW * 0.5), span - Math.abs(x - viewW * 0.5));
  return Math.max(0, 1 - dx / (span * 0.5));
}

/** Below this speed factor the scenery goes silent (a parked screensaver is quiet). */
export const MIN_SPEED_FACTOR = 0.05;
/** 0 when stopped .. 1 from `fullAt` m/s, like the ambient bed. */
export const speedFactor = (v: number, fullAt = 6) => Math.max(0, Math.min(1, v / fullAt));

export class Soundscape {
  private next = new Map<string, number>();
  constructor(private rng: () => number) {}
  private interval(v: Voice, w: number) { const [a, b] = v.every; return (a + this.rng() * (b - a)) / Math.max(0.25, w); }

  /** Sounds due at time `t` (s). `weights` are the scene's share per biome (sum 1): a voice fires with probability = its weight, so boundaries crossfade. */
  tick(t: number, weights: ReadonlyArray<readonly [SceneId, number]>, speed: number, ducked = false, near: (id: Landmark) => number = () => 1): Shot[] {
    const out: Shot[] = [];
    for (const [id, w] of weights) {
      if (w < 0.05) continue;
      SOUNDSCAPE[id].forEach((v, i) => {
        const key = `${id}:${i}`;
        let at = this.next.get(key);
        if (at === undefined) { at = t + this.rng() * v.every[1]; this.next.set(key, at); }
        if (t < at) return;
        const place = v.near ? near(v.near) : 1;
        this.next.set(key, t + this.interval(v, w * Math.max(0.25, place)));
        if (ducked || speed < MIN_SPEED_FACTOR || place < 0.15 || this.rng() > w) return;
        const [p0, p1] = v.pitch ?? [1, 1];
        out.push({ sfx: v.sfx, vol: v.vol * w * speed * place, pitch: p0 + this.rng() * (p1 - p0) });
      });
    }
    return out;
  }
}
