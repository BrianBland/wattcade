import type { Clock, Seconds } from '../contracts';

export class SimClock implements Clock {
  private t: Seconds = 0;
  timeScale = 1;
  now(): Seconds { return this.t; }
  advance(dt: Seconds): void { this.t += dt; }
}
