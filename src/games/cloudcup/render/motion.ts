import type { RaceView } from '../sim/race';
import type { BikePose } from '../sim/motion';

export function displayRace(s: RaceView, fraction: number): RaceView {
  if (fraction >= 1 || s.menu || !s.time || s.at >= s.finishAt) return s;
  const mix = (from: number, to: number) => from + (to - from) * fraction;
  const motion = (from: BikePose, to: BikePose) => ({
    at: mix(from.at, to.at),
    x: mix(from.x, to.x),
    lift: mix(from.lift, to.lift),
    lean: mix(from.lean, to.lean),
  });
  const prev = s.previous;
  return {
    ...s,
    ...motion(prev.player, s),
    cameraX: mix(prev.cameraX, s.cameraX),
    speed: mix(prev.speed, s.speed),
    time: mix(prev.time, s.time),
    rivals: s.rivals.map((r, i) => ({ ...r, ...motion(prev.rivals[i], r) })),
  };
}
