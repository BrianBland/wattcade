// Pure: which road signs stand where (world metres), and the big on-screen countdown. The renderer draws the posts in
// the pixel buffer (behind the rider) and the boards + text at full resolution, high enough to clear the rider.
import { BIOME_NAMES, type BiomeId } from '../../warmup/sim/terrain';
import type { FullSendSnapshot } from '../sim/sim';
import { PIECE_VERB } from '../sim/tour';

export type SignTone = 'green' | 'yellow' | 'red' | 'blue';
export interface SignSpec {
  /** next = billboard for the next set piece · count = distance board · gate = start / finish gantry · fork = route sign. */
  kind: 'next' | 'count' | 'gate' | 'fork';
  x: number; tone: SignTone;
  title: string; sub?: string; big?: string;
  /** Gate start lights: 0 = dark, 1..3 = that many red lit, 4 = all green (GO). */
  lights?: number;
  /** Fork boards: both branches and which one is picked. */
  options?: Array<{ title: string; biome: string; on: boolean }>;
}

const mmss = (sec: number) => { const v = Math.max(0, Math.ceil(sec)); return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`; };
const TARGET: Record<string, string> = { leap: 'GAP', smash: 'WALL', loop: 'LOOP', outrun: 'ESCAPE', dive: 'SURFACE' };

/** Where the thing you're counting down to is (world m), what it's called, and the seconds left; null if nothing. */
export function countdown(s: FullSendSnapshot): { label: string; x: number; m: number; s: number; phase: 'approach' | 'effort' } | null {
  const p = s.piece;
  if (!p || s.menu) return null;
  const left = Math.max(0, s.phaseS - s.phaseT);
  if (s.phase === 'approach') { const x = s.x + s.v * left; return { label: 'SPRINT', x, m: x - s.x, s: left, phase: 'approach' }; }
  if (s.phase !== 'effort') return null;
  const x = p.kind === 'dive' ? p.x0 + p.len : p.kind === 'outrun' ? s.x + s.v * left : p.x0;
  return { label: TARGET[p.kind], x, m: Math.max(0, x - s.x), s: left, phase: 'effort' };
}

/** Board spacing (world m). The view is only ~100 m wide, so these keep a board on screen most of the time. */
export const SIGN = { count: 70, fork: 90, next: 240, gateClear: 30 };

/** Signs whose x falls in [from, to] (world m). */
export function planSigns(s: FullSendSnapshot, from: number, to: number): SignSpec[] {
  if (s.menu || s.phase === 'done') return [];
  const out: SignSpec[] = [];
  const grid = (step: number, off: number, f: (x: number) => void) => { for (let x = Math.ceil((from - off) / step) * step + off; x <= to; x += step) f(x); };
  if (s.fork) {
    const f = s.fork;
    grid(SIGN.fork, 40, (x) => out.push({ kind: 'fork', x, tone: 'green', title: `FORK · ${Math.ceil(f.closesInS)} s`, sub: '◀ ▶ on the road to choose',
      options: f.options.map((o, i) => ({ title: o.title.toUpperCase(), biome: BIOME_NAMES[o.biome as BiomeId], on: f.pick === i })) }));
    return out;
  }
  const c = countdown(s), p = s.piece;
  // Distance boards on a fixed world grid (so one is nearly always in view), each showing the metres left to the target,
  // rounded to 10 m. None right next to the gate.
  const counts = (target: number, tone: SignTone, title: string) => grid(SIGN.count, 0, (x) => {
    const dm = Math.round((target - x) / 10) * 10;
    if (dm >= SIGN.gateClear) out.push({ kind: 'count', x, tone, title, big: `${dm} m` });
  });
  if (c && p) {
    if (c.phase === 'approach') {
      const lights = c.s > 3 ? 0 : c.s > 2 ? 1 : c.s > 1 ? 2 : c.s > 0.05 ? 3 : 4;
      out.push({ kind: 'gate', x: c.x, tone: 'red', title: p.title.toUpperCase(), sub: PIECE_VERB[p.kind], lights });
      counts(c.x, 'yellow', 'SPRINT IN');
    } else {
      if (p.kind === 'outrun' || p.kind === 'dive') out.push({ kind: 'gate', x: c.x, tone: 'green', title: c.label, sub: p.kind === 'dive' ? 'Air up there' : 'Safe!', lights: 4 });
      counts(c.x, p.kind === 'outrun' || p.kind === 'dive' ? 'green' : 'red', c.label);
    }
  } else if ((s.phase === 'warmup' || s.phase === 'recovery') && s.next) {
    const n = s.next;
    grid(SIGN.next, 120, (x) => out.push({ kind: 'next', x, tone: 'blue', title: `NEXT ▸ ${n.title.toUpperCase()}`, sub: `${BIOME_NAMES[n.biome]} · ${mmss(n.inS)}` }));
  } else if (s.phase === 'cooldown') {
    grid(SIGN.next, 120, (x) => out.push({ kind: 'next', x, tone: 'green', title: 'COOL-DOWN', sub: `Finish in ${mmss(s.phaseS - s.phaseT)}` }));
  }
  return out.filter((q) => q.x >= from && q.x <= to);
}

/** Keeps an on-screen countdown from ever counting up (the wall is re-anchored as you speed up, so the raw distance can
 *  rise for a moment). One per countdown: a new key (set / phase) starts fresh. */
export class MonotoneCountdown {
  private key = ''; private min = Infinity;
  value(key: string, m: number): number {
    if (key !== this.key) { this.key = key; this.min = Infinity; }
    this.min = Math.min(this.min, m);
    return this.min;
  }
}
