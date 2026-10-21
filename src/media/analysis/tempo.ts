/** Fold a tempo onto the octave of a reference tempo (half/double-time ambiguity). */
export function foldTempo(bpm: number, ref: number): number {
  if (!(bpm > 0) || !(ref > 0)) return bpm;
  let b = bpm; while (b < ref / Math.SQRT2) b *= 2; while (b > ref * Math.SQRT2) b /= 2; return b;
}
