// Chapter 3b (#193), pure: the beats the sim and the renderer share. Drill II's last minute (the tunnel tilts forward
// on its own, cracks spider out, the floor drops away) and the fall: you tip into the hole, rubble falls alongside,
// then black; a white dot dead ahead grows into the Earth; silence, then the one music cue as it swells.

/** Seconds of Drill II's plan, counted back from its end, in which the floor goes. */
export const TILT_S = 60;

/** The fall's beats (s into the cutscene): tipped over, all black, the dot appears, the music cue. */
export const FALL = { tipS: 5, blackS: 18, dotS: 30, cueS: 100 } as const;

export interface FallView {
  /** Tipping forward into the hole 0..1. */ tip: number;
  /** Metres fallen. */ drop: number;
  /** The tunnel's light gone 0..1 (pure black). */ black: number;
  /** The Earth's angular radius (rad), 0 before the dot. */ earth: number;
  /** How much of it is still just a white dot 0..1 (1 = a point of light, 0 = blue, green, clouds). */ white: number;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** The fall at `t` s into a cutscene of `planS` s. The Earth grows exponentially (a dot for a long while, then it
 *  swells), reaching ~0.3 rad as re-entry takes over. */
export function fallView(t: number, planS: number): FallView {
  const tip = smooth(0, FALL.tipS, t);
  // accelerate out of the tunnel, then a steady drop (nothing to see it against once it's black)
  const drop = t < 3 ? 0.6 * t * t : 5.4 + 3.6 * (t - 3) + 6 * smooth(3, 12, t) * (t - 3);
  const k = clamp01((t - FALL.dotS) / Math.max(1, planS - FALL.dotS));
  const earth = t < FALL.dotS ? 0 : 0.0015 * Math.exp(Math.log(200) * k);
  return { tip, drop, black: smooth(FALL.tipS * 0.6, FALL.blackS, t), earth, white: 1 - smooth(0.006, 0.05, earth) };
}
