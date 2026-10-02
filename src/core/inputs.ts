import type { Button, InputState, Seconds } from '../contracts';

/** Structural input source (InputHub satisfies it). */
export interface InputSource {
  beginTick(dt: Seconds): void;
  state(): Readonly<InputState>;
}

export interface TimelineEvent { t: Seconds; press?: Button; release?: Button; paddleL?: number; paddleR?: number }

/** Minimal local scripted input for the headless runner. */
export class TimelineInput implements InputSource {
  private t = 0; private idx = 0;
  private held = new Set<Button>();
  private s: { -readonly [K in keyof InputState]: InputState[K] };
  private timeline: TimelineEvent[];
  constructor(timeline: TimelineEvent[] = []) {
    this.timeline = [...timeline].sort((a, b) => a.t - b.t);
    this.s = { held: this.held, pressed: new Set(), released: new Set(), paddleL: 0, paddleR: 0, paddleIdleS: 0, source: 'script' };
  }
  beginTick(dt: Seconds): void {
    this.t += dt;
    const pressed = new Set<Button>(); const released = new Set<Button>();
    while (this.idx < this.timeline.length && this.timeline[this.idx].t <= this.t) {
      const e = this.timeline[this.idx++];
      if (e.press && !this.held.has(e.press)) { this.held.add(e.press); pressed.add(e.press); }
      if (e.release && this.held.has(e.release)) { this.held.delete(e.release); released.add(e.release); }
      if (e.paddleL !== undefined) this.s.paddleL = e.paddleL;
      if (e.paddleR !== undefined) this.s.paddleR = e.paddleR;
    }
    this.s.pressed = pressed; this.s.released = released;
    this.s.paddleIdleS = Math.abs(this.s.paddleL) > 0.15 || Math.abs(this.s.paddleR) > 0.15 ? 0 : this.s.paddleIdleS + dt;
  }
  state(): Readonly<InputState> { return this.s; }
}

export class NullInput extends TimelineInput { constructor() { super([]); } }
