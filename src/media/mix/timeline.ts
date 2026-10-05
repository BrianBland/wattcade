import type { MediaOnset, MediaSection, MediaTimeline } from '../../contracts';
import { CURVE_HZ } from '../types';
import { autoAt, progTime, songTime, type MixItem, type MixPlan } from './plan';

const r3 = (x: number) => Math.round(x * 1000) / 1000;

function sampleCurve(curve: number[], durationS: number, s: number): number {
  if (!curve.length || s < 0 || s > durationS) return 0;
  const x = s * CURVE_HZ, a = Math.min(curve.length - 1, Math.floor(x)), b = Math.min(curve.length - 1, a + 1), f = x - Math.floor(x);
  return curve[a] * (1 - f) + curve[b] * f;
}

/**
 * Map every song's analysis onto the program clock. Events (beats, onsets, sections…) come from the song that
 * owns that stretch of the program (the switch happens at the bass swap / crossfade midpoint); curves are
 * blended by each deck's gain, so a transition reads as a smooth handover.
 */
export function buildTimeline(plan: MixPlan, items: MixItem[]): MediaTimeline {
  const beats: number[] = [], downbeats: number[] = [], phrases: number[] = [];
  const onsets: MediaOnset[] = [], sections: MediaSection[] = [];
  const songs: MediaTimeline['songs'] = [];
  for (const e of plan.entries) {
    const it = items[e.index], a = it.analysis;
    const [o0, o1] = e.own;
    const map = (s: number) => progTime(e.segs, s);
    const inOwn = (p: number) => p >= o0 - 1e-6 && p < o1 - 1e-6;
    const put = (dst: number[], ts: number[]) => { for (const t of ts) { const p = map(t); if (inOwn(p)) dst.push(r3(p)); } };
    put(beats, a.beats); put(downbeats, a.downbeats); put(phrases, a.phrases);
    for (const o of a.onsets) { const p = map(o.t); if (inOwn(p)) onsets.push({ ...o, t: r3(p) }); }
    for (const s of a.sections) {
      const p0 = Math.max(o0, map(s.t0)), p1 = Math.min(o1, map(s.t1));
      if (p1 - p0 > 0.5) sections.push({ ...s, t0: r3(p0), t1: r3(p1) });
    }
    songs.push({
      t0: r3(o0), t1: r3(o1), id: it.id, title: it.title, artist: it.artist, bpm: a.bpm, key: a.key.camelot,
      palette: it.palette ?? [], ...(it.credit ? { credit: it.credit } : {}),
    });
  }
  // song boundaries are phrase starts too
  for (const s of songs.slice(1)) phrases.push(s.t0);
  const durationS = r3(plan.durationS);
  const n = Math.max(1, Math.ceil(durationS * CURVE_HZ));
  const intensity: number[] = new Array(n), bands: [number[], number[], number[]] = [new Array(n), new Array(n), new Array(n)];
  for (let k = 0; k < n; k++) {
    const p = k / CURVE_HZ;
    let w = 0, iv = 0; const bv = [0, 0, 0];
    for (const e of plan.entries) {
      if (p < e.startP || p > e.endP) continue;
      const g = Math.max(0, autoAt(e.gain, p)); if (g <= 0) continue;
      const a = items[e.index].analysis, s = songTime(e.segs, p);
      iv += g * sampleCurve(a.intensity, a.durationS, s);
      for (let b = 0; b < 3; b++) bv[b] += g * sampleCurve(a.bands[b], a.durationS, s);
      w += g;
    }
    intensity[k] = w > 0 ? r3(iv / w) : 0;
    for (let b = 0; b < 3; b++) bands[b][k] = w > 0 ? r3(bv[b] / w) : 0;
  }
  // sorted, and events closer than 60 ms (the same beat seen from both decks at a handover) merged into one
  const uniq = (xs: number[]) => xs.sort((x, y) => x - y).filter((t, i, a) => i + 1 >= a.length || a[i + 1] - t >= 0.06);
  return {
    durationS, hz: CURVE_HZ, intensity, bands,
    beats: uniq(beats), downbeats: uniq(downbeats), phrases: uniq(phrases),
    onsets: onsets.sort((x, y) => x.t - y.t || x.band - y.band), sections: sections.sort((x, y) => x.t0 - y.t0), songs,
    confidence: items.every((i) => i.analysis.confidence === 'full') ? 'full' : 'metadata',
  };
}
