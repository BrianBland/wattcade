/** Limit drawing independently of the simulation/input cadence; preserve fractional intervals. */
export class FrameGate {
  private next = 0;
  constructor(private readonly hz = 60) {}
  ready(now: number): boolean {
    if (now + 0.01 < this.next) return false;
    const interval = 1000 / this.hz;
    this.next = this.next === 0 || now - this.next >= interval
      ? now + interval : this.next + interval;
    return true;
  }
}
