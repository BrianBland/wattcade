/**
 * Shipping lanes that steer around islands. A lane is a straight world line (along-lane `u`, lateral `o`); each
 * island near it bends the path sideways by a smooth bump wide enough that the hull keeps `clear` from the island's
 * centre, then rejoins the lane. Pure in (u, lane, islands), so a ship's path never jumps as islands come into range.
 */
export interface LaneIsland { u: number; o: number; clear: number }
/** Half-width of the bend around an island that needs `clear` (also bounds how far to look for islands). */
export const bendHalf = (clear: number) => 2 * clear + 120;
const bump = (x: number) => (Math.abs(x) >= 1 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * x));
const bumpSlope = (x: number) => (Math.abs(x) >= 1 ? 0 : -0.5 * Math.PI * Math.sin(Math.PI * x));
/** Lateral position at `u` for a ship whose lane sits at `o0`, and its slope do/du (for the heading). */
export function laneAt(u: number, o0: number, islands: readonly LaneIsland[]): { o: number; slope: number } {
  let o = o0, slope = 0;
  for (const I of islands) {
    const off = o0 - I.o, push = I.clear - Math.abs(off);
    if (push <= 0) continue;
    const side = off >= 0 ? 1 : -1, W = bendHalf(I.clear), x = (u - I.u) / W;
    o += side * push * bump(x); slope += side * push * bumpSlope(x) / W;
  }
  return { o, slope };
}
