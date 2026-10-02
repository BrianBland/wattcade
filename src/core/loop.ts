import { FIXED_DT } from '../contracts';
import type { SimClock } from './clock';

export const MAX_STEPS_PER_FRAME = 3000;

/** Fixed-timestep accumulator. `onStep` performs one full tick (input -> bike -> mixer -> sim). */
export class GameLoop {
  paused = false;
  private acc = 0;
  constructor(private clock: SimClock, private onStep: (dt: number) => void, private effectiveScale: () => number = () => clock.timeScale) {}

  frame(realDtS: number): number {
    if (this.paused) return 0;
    this.acc += realDtS * this.effectiveScale();
    let n = Math.floor(this.acc / FIXED_DT + 1e-9);
    if (n > MAX_STEPS_PER_FRAME) { n = MAX_STEPS_PER_FRAME; this.acc = 0; } else this.acc -= n * FIXED_DT;
    for (let i = 0; i < n; i++) this.onStep(FIXED_DT);
    return n;
  }
  step(n: number): void { for (let i = 0; i < n; i++) this.onStep(FIXED_DT); }
  pause(): void { this.paused = true; }
  resume(): void { this.paused = false; }
}
