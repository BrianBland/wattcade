import { SWING, rivalSwing } from '../sim/chain';
import type { RaceView } from '../sim/race';
import type { BikePose } from '../sim/motion';

export function displayRace(s: RaceView, fraction: number): RaceView {
  if (fraction >= 1 || s.menu || !s.time || s.finished) return s;
  const mix = (from: number, to: number) => from + (to - from) * fraction;
  const motion = (from: BikePose, to: BikePose) => ({
    at: mix(from.at, to.at),
    x: mix(from.x, to.x),
    lift: mix(from.lift, to.lift),
    lean: mix(from.lean, to.lean),
  });
  const timer = (previous: number, current: number, duration: number) =>
    mix(current > previous ? duration : previous, current);
  const prev = s.previous;
  return {
    ...s,
    ...motion(prev.player, s),
    swing: timer(prev.player.swing, s.swing, SWING),
    cameraX: mix(prev.cameraX, s.cameraX),
    speed: mix(prev.speed, s.speed),
    time: mix(prev.time, s.time),
    rivals: s.rivals.map((r, i) => ({
      ...r,
      ...motion(prev.rivals[i], r),
      strike: timer(prev.rivals[i].strike, r.strike, rivalSwing),
      windup: timer(prev.rivals[i].windup, r.windup, 1.15),
    })),
  };
}
