export const POWER_BOUNDS = [0.55, 0.75, 0.9, 1.05] as const;
export const HR_BOUNDS = [0.6, 0.7, 0.8, 0.9] as const;
export const ZONE_COLORS = ['#8a8aa0', '#3b82ff', '#2de26a', '#ffd23b', '#ff4d4d'];
/** Width given to the open-ended zones (Z1 below first bound, Z5 above last) as a span of fraction. */
const OPEN_SPAN = 0.3;

export interface ZonePos { zone: 1 | 2 | 3 | 4 | 5; within: number; pos: number }

/** Where a fraction (ftpFraction or hr/maxHr) sits: its zone, 0..1 within the zone, 0..1 across the 5-segment bar. */
export function zonePosition(frac: number, bounds: readonly number[]): ZonePos {
  const f = Number.isFinite(frac) ? Math.max(0, frac) : 0;
  const edges = [Math.max(0, bounds[0] - OPEN_SPAN), ...bounds, bounds[3] + OPEN_SPAN];
  let z = 0;
  while (z < 4 && f >= edges[z + 1]) z++;
  const lo = edges[z], hi = edges[z + 1];
  const within = Math.min(1, Math.max(0, (f - lo) / (hi - lo)));
  return { zone: (z + 1) as ZonePos['zone'], within, pos: (z + within) / 5 };
}
export const boundsFor = (source: 'power' | 'hr') => (source === 'hr' ? HR_BOUNDS : POWER_BOUNDS);

/** Resolve the effective source for the widget. */
export function effectiveSource(setting: 'auto' | 'power' | 'hr', hr: number | null): 'power' | 'hr' {
  return setting === 'hr' || (setting === 'auto' && hr != null) ? 'hr' : 'power';
}

/** Rolling history: one bar per `every` seconds, capped. */
export interface Bar { power: number; hr: number | null; zone: number }
export class History {
  bars: Bar[] = []; private acc = 0; private sp = 0; private sh = 0; private n = 0; private shn = 0;
  constructor(private every = 2, private max = 90) {}
  push(dt: number, power: number, hr: number | null, zone: number): void {
    this.acc += dt; this.sp += power; this.n++; if (hr != null) { this.sh += hr; this.shn++; }
    if (this.acc >= this.every) {
      this.bars.push({ power: this.sp / this.n, hr: this.shn ? this.sh / this.shn : null, zone });
      if (this.bars.length > this.max) this.bars.shift();
      this.acc = 0; this.sp = this.sh = this.n = this.shn = 0;
    }
  }
}
