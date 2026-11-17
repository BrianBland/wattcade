import { FIXED_DT } from '../../../contracts';

interface SteeringSnapshot { x: number; previousX: number; steeringTick: number }

/** Bridge fixed simulation ticks at display refresh rate, rather than snapping on each tick. */
export class SteeringInterpolation {
  private tick = -1;
  private receivedAt = 0;
  private from = 0;
  private to = 0;

  sample(s: SteeringSnapshot, now: number, reset = false): number {
    if (this.tick < 0 || reset || s.steeringTick < this.tick) {
      this.tick = s.steeringTick; this.receivedAt = now; this.from = this.to = s.x;
    } else if (s.steeringTick !== this.tick) {
      this.tick = s.steeringTick; this.receivedAt = now; this.from = s.previousX; this.to = s.x;
    }
    const alpha = Math.max(0, Math.min(1, (now - this.receivedAt) / FIXED_DT));
    return this.from + (this.to - this.from) * alpha;
  }
}
