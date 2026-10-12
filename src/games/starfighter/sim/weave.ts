import type { MediaTimeline, SectionKind } from '../../../contracts';
import { after, clamp } from './director';
/**
 * Music-locked weave: the ship sways around its planned lane so that each swing peaks exactly on a beat. Pure function
 * of program time (beats, sections, intensity are known ahead), so choreographed fire can still be authored to miss it.
 *  - period: beats per half-swing by section (breaks and intros sway slowly across the bar; drops swing every beat).
 *  - amplitude follows smoothed intensity; it relaxes while a lane change is under way (`moving` 0..1).
 */
export const WEAVE = { amp: { intro: 3, verse: 4.5, build: 5.5, drop: 6.5, break: 3.5, outro: 3 } as Record<SectionKind, number>,
  beatsPerSwing: { intro: 2, verse: 2, build: 2, drop: 1, break: 4, outro: 4 } as Record<SectionKind, number>, maxSpeed: 30 };
export function createWeave(tl: MediaTimeline | undefined) {
  const beats = tl?.beats ?? [], fallback = 0.5;
  const sectionAt = (p: number): SectionKind => { const s = tl?.sections; if (!s?.length) return 'verse'; let k: SectionKind = s[0].kind; for (const x of s) { if (x.t0 <= p) k = x.kind; else break; } return k; };
  const intensityAt = (p: number) => { if (!tl?.intensity.length) return 0.6; let a = 0, n = 0; for (let d = -2; d <= 2; d += 0.5) { const i = Math.round((p + d) * tl.hz); if (i >= 0 && i < tl.intensity.length) { a += tl.intensity[i]; n++; } } return n ? a / n : 0.6; };
  /** Fractional beat index at program time p (interpolated between beat times). */
  const beatPos = (p: number) => {
    if (beats.length < 2) return p / fallback;
    const i = after(beats, p) - 1;
    if (i < 0) return (p - beats[0]) / (beats[1] - beats[0]);
    const b0 = beats[i], b1 = beats[i + 1] ?? b0 + (b0 - beats[i - 1]);
    return i + clamp((p - b0) / Math.max(1e-3, b1 - b0), 0, 1);
  };
  const rawLen = (p: number) => { if (beats.length < 2) return fallback; const i = clamp(after(beats, p) - 1, 0, beats.length - 2); return beats[i + 1] - beats[i]; };
  /** Beat length averaged over ±1.5 s so the amplitude cap glides across tempo changes between songs. */
  const beatLen = (p: number) => { let a = 0; for (let k = -10; k <= 10; k++) a += rawLen(p + k * 0.15); return a / 21; };
  /** Sway for one section kind: peaks on beats, amplitude capped so peak sway speed stays under maxSpeed. */
  const sway = (k: SectionKind, p: number, b: number, inten: number) => {
    const bps = WEAVE.beatsPerSwing[k], cap = WEAVE.maxSpeed * beatLen(p) * bps / Math.PI;
    return Math.min(WEAVE.amp[k] * (0.55 + 0.6 * inten), cap) * Math.cos(Math.PI * b / bps);
  };
  const bounds = tl?.sections ?? [];
  /** Next swing peak (a beat where the sway is momentarily still) at or after p; lane changes start and end there. */
  const peakAfter = (p: number): number => {
    if (beats.length < 2) { const step = fallback * 2; return Math.ceil(p / step - 1e-9) * step; }
    for (let i = after(beats, p - 1e-6); i < beats.length && beats[i] < p + 4; i++) if (i % WEAVE.beatsPerSwing[sectionAt(beats[i])] === 0) return beats[i];
    return p;
  };
  const at = (p: number, moving = 0) => {
    const b = beatPos(p), inten = clamp(intensityAt(p), 0, 1), k = sectionAt(p);
    let v = sway(k, p, b, inten);
    // Cross-fade over ±1 s at section boundaries so tempo and size of the sway change smoothly.
    for (const sec of bounds) {
      if (Math.abs(sec.t0 - p) < 1 && sec.t0 > 0) {
        const before = sectionAt(sec.t0 - 0.01), after_ = sec.kind, u = clamp((p - (sec.t0 - 1)) / 2, 0, 1), e = u * u * (3 - 2 * u);
        v = sway(before, p, b, inten) * (1 - e) + sway(after_, p, b, inten) * e; break;
      }
    }
    // Lane changes take over completely while they run; they start and end on beats, so the rhythm stays intact.
    return v * (1 - clamp(moving, 0, 1));
  };
  return { at, peakAfter };
}
