// Automatic chunky-pixel fallback: watches real frame times and steps the render resolution down (native → ½ → ⅓)
// when the frame rate stays under `minFps`, and back up only after a long stretch well above it. Pure (no DOM).
export interface GovernorOpts {
  minFps?: number; /** fps that counts as comfortably fast */ upFps?: number;
  /** seconds below minFps before stepping down / above upFps before stepping up */ downAfterS?: number; upAfterS?: number;
  /** ignore the first seconds (shader compiles, first tiles) and the seconds after each change */ settleS?: number;
  maxLevel?: number;
}

export class PerfGovernor {
  level = 0;
  /** Smoothed frames per second. */ fps = 60;
  private o: Required<GovernorOpts>;
  private settle: number; private below = 0; private above = 0;
  /** After stepping back up and immediately down again, stay down (no oscillation). */ private locked = false;
  private lastUp = -Infinity; private t = 0;

  constructor(o: GovernorOpts = {}, startLevel = 0) {
    this.o = { minFps: 40, upFps: 57, downAfterS: 2.5, upAfterS: 30, settleS: 3, maxLevel: 2, ...o };
    this.level = startLevel; this.settle = this.o.settleS;
  }

  /** Feed one frame's real duration (s). Returns true when the level changed. */
  sample(dt: number): boolean {
    if (!(dt > 0) || dt > 0.5) return false; // hidden tab, breakpoints
    this.t += dt;
    this.fps += (1 / dt - this.fps) * Math.min(1, dt / 0.75); // ~0.75 s time constant
    if (this.settle > 0) { this.settle -= dt; return false; }
    this.below = this.fps < this.o.minFps ? this.below + dt : 0;
    this.above = this.fps > this.o.upFps ? this.above + dt : 0;
    if (this.below >= this.o.downAfterS && this.level < this.o.maxLevel) {
      if (this.t - this.lastUp < 15) this.locked = true;
      return this.change(this.level + 1);
    }
    if (!this.locked && this.above >= this.o.upAfterS && this.level > 0) { this.lastUp = this.t; return this.change(this.level - 1); }
    return false;
  }

  private change(level: number): boolean {
    this.level = level; this.below = this.above = 0; this.settle = this.o.settleS;
    return true;
  }
}

export type PixelSetting = 'auto' | 'on' | 'off';
/** The chunky-pixel user setting, from the game save (`profile.gameData.seaside.pixelLook`), default auto. */
export function pixelSetting(save: unknown): PixelSetting {
  const v = (save as { pixelLook?: unknown } | null | undefined)?.pixelLook;
  return v === 'on' || v === 'off' ? v : 'auto';
}
