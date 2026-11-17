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
const TARGET: Record<string, string> = { leap: 'GAP', smash: 'WALL', loop: 'LOOP', outrun: 'CAVE', dive: 'SURFACE' };

/** Where the thing you're counting down to is (world m), what it's called, and the seconds left; null if nothing. */
export function countdown(s: FullSendSnapshot): { label: string; x: number; m: number; s: number; phase: 'approach' | 'effort' } | null {
  const p = s.piece;
  if (!p || s.menu) return null;
  const left = Math.max(0, s.phaseS - s.phaseT);
  if (s.phase === 'approach') { const x = s.x + s.v * left; return { label: 'SPRINT', x, m: x - s.x, s: left, phase: 'approach' }; }
  if (s.phase !== 'effort') return null;
  const x = p.kind === 'dive' ? p.x0 + p.len : p.x0;
  return { label: TARGET[p.kind], x, m: Math.max(0, x - s.x), s: left, phase: 'effort' };
}

/** In-world signs whose x falls in [from, to] (world m): just the start gantry with its 3-2-1 lights now; everything you
 *  need to read is on the one big distant sign (`signMessage`). */
export function planSigns(s: FullSendSnapshot, from: number, to: number): SignSpec[] {
  if (s.menu || s.phase === 'done') return [];
  const c = countdown(s), p = s.piece;
  if (!c || !p) return [];
  const out: SignSpec[] = [];
  if (c.phase === 'approach') {
    const lights = c.s > 3 ? 0 : c.s > 2 ? 1 : c.s > 1 ? 2 : c.s > 0.05 ? 3 : 4;
    out.push({ kind: 'gate', x: c.x, tone: 'red', title: 'START', lights });
  } else if (p.kind === 'dive') out.push({ kind: 'gate', x: c.x, tone: 'green', title: 'AIR', lights: 4 });
  return out.filter((q) => q.x >= from && q.x <= to);
}

/** What the big distant sign says right now (it's an LED board, so it updates live), or null for no sign.
 *  `m` is the (monotone) countdown distance. */
export function signMessage(s: FullSendSnapshot, m: number | null): SignSpec | null {
  if (s.menu || s.phase === 'done' || s.phase === 'payoff') return null;
  const p = s.piece, c = countdown(s), dist = `${Math.max(0, Math.round((m ?? c?.m ?? 0) / 10) * 10)} m`;
  if (s.phase === 'approach' && p && c) return { kind: 'count', x: 0, tone: 'yellow', title: p.title.toUpperCase(), big: dist, sub: `SPRINT IN · ${PIECE_VERB[p.kind]}` };
  if (s.phase === 'effort' && p && c) {
    const safe = p.kind === 'outrun' || p.kind === 'dive';
    return { kind: 'count', x: 0, tone: safe ? 'green' : 'red', title: c.label, big: dist, sub: safe ? (p.kind === 'dive' ? 'to the surface' : 'to the cave') : PIECE_VERB[p.kind] };
  }
  if (s.fork) {
    const f = s.fork;
    return { kind: 'fork', x: 0, tone: 'green', title: `FORK · CHOOSE IN ${Math.ceil(f.closesInS)} s`, sub: '◀ ▶ on the road',
      options: f.options.map((o, i) => ({ title: o.title.toUpperCase(), biome: BIOME_NAMES[o.biome as BiomeId], on: f.pick === i })) };
  }
  if ((s.phase === 'warmup' || s.phase === 'recovery') && s.next) {
    return { kind: 'next', x: 0, tone: 'blue', title: `NEXT ▸ ${s.next.title.toUpperCase()}`, big: mmss(s.next.inS), sub: BIOME_NAMES[s.next.biome] };
  }
  if (s.phase === 'cooldown') return { kind: 'next', x: 0, tone: 'green', title: 'COOL-DOWN', big: mmss(s.phaseS - s.phaseT), sub: 'Finish line ahead' };
  return null;
}

/** The distant sign stands on a far parallax layer, so it crosses the screen slowly. A new message (a new phase, a fork
 *  opening) puts up a fresh sign just inside the right edge; when one drifts off the left, the next comes in on the right.
 *  `u` = CSS px the far layer has scrolled since the message changed. Returns its box (CSS px) or null between signs. */
export const DISTANT = { parallax: 0.08, w: 340, h: 128, gapPx: 60, margin: 24 };
export function distantSignRect(cssW: number, uh: number, u: number): { x: number; y: number; w: number; h: number } | null {
  const w = Math.min(DISTANT.w, cssW * 0.6), h = DISTANT.h * (w / DISTANT.w);
  const x0 = cssW - w - DISTANT.margin, span = x0 + w + DISTANT.gapPx + DISTANT.margin + w; // off the left, then in from the right
  const v = ((u % span) + span) % span;
  const x = v <= x0 + w ? x0 - v : cssW + DISTANT.gapPx + w - (v - (x0 + w)) - w + 0; // wrapping: re-enter from the right edge
  if (x + w < 0 || x > cssW) return null;
  return { x, y: Math.max(70, uh * 0.17), w, h };
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
