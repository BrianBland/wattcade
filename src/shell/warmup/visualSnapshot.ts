import { FIXED_DT } from '../../contracts';
import type { WarmupSnapshot } from '../../games/warmup/sim/sim';
import { biomeAt } from '../../games/warmup/sim/terrain';

/** Interpolate display positions between 30 Hz ticks; never write back to the riding simulation. */
export class VisualSnapshot {
  private previous: WarmupSnapshot | null = null;
  private current: WarmupSnapshot | null = null;
  private session: unknown;

  sample(s: WarmupSnapshot, alpha: number, session: unknown): WarmupSnapshot {
    if (session !== this.session || !this.current || s.t < this.current.t || s.terrainSeed !== this.current.terrainSeed) {
      this.session = session; this.previous = this.current = s;
    } else if (s.t > this.current.t) {
      this.previous = s.t - this.current.t > FIXED_DT * 1.5 ? s : this.current;
      this.current = s;
    }
    const p = this.previous!;
    const a = Math.max(0, Math.min(1, alpha));
    const lerp = (x: number, y: number) => x + (y - x) * a;
    const d = lerp(p.d, s.d), b = biomeAt(d, s.biomeM, s.startBiome, s.blendM);
    return { ...s, d, grade: lerp(p.grade, s.grade), hill: lerp(p.hill, s.hill), driveIn: lerp(p.driveIn, s.driveIn),
      biome: b.dom, from: b.cur, to: b.next, mix: b.mix, toNextM: b.toNextM,
      nextBiome: biomeAt(d + b.toNextM + 1, s.biomeM, s.startBiome, 1).dom };
  }
}
