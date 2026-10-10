import type { MediaTimeline, SectionKind } from '../../../contracts';
export const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
export function after(xs: readonly number[], t: number): number {
  let lo = 0, hi = xs.length;
  while (lo < hi) { const m = (lo + hi) >>> 1; if (xs[m] <= t + 1e-6) lo = m + 1; else hi = m; }
  return lo;
}
export function cadenceFor(bpm: number): number | null {
  const candidates = [1, 0.5, 0.75, 2 / 3].map(r => bpm * r).filter(r => r >= 70 && r <= 100);
  return candidates.length ? Math.round(candidates.sort((a, b) => Math.abs(a - 90) - Math.abs(b - 90))[0]) : null;
}
export const sectionTarget = (kind: SectionKind) => kind === 'break' || kind === 'outro' ? 0.56 : kind === 'build' ? 0.68 : kind === 'drop' ? 0.7 : 0.65;
export const sectionLabel = (kind: SectionKind) => ({ intro: 'Departure', verse: 'Cruise', build: 'Armor inbound', drop: 'Full spectrum', break: 'Quiet orbit', outro: 'Homeward' })[kind];
/** Freeze the next eight seconds of section cues; revisions never move an announced change. */
export function createDirector(timeline?: MediaTimeline) {
  let kind: SectionKind = timeline?.sections[0]?.kind ?? 'verse';
  const announced = new Map<number, SectionKind>();
  let lastBoundary = -1, lastBeat = -1, lastPhrase = -1, lastDownbeat = -1, lastHit = -1, lastSub = -1, barT = -99;
  return {
    step(p: number) {
      for (const section of timeline?.sections ?? []) {
        if (section.t0 > p && section.t0 <= p + 8 && section.t0 > lastBoundary && !announced.has(section.t0)) announced.set(section.t0, section.kind);
      }
      for (const [t, k] of [...announced].sort((a, b) => a[0] - b[0])) {
        if (t <= p) { kind = k; lastBoundary = t; announced.delete(t); }
      }
      const beats = timeline?.beats ?? [], phrases = timeline?.phrases ?? [];
      const bi = after(beats, p) - 1, pi = after(phrases, p) - 1;
      const bt = bi >= 0 ? beats[bi] : Math.floor(p / 0.6) * 0.6;
      const pt = pi >= 0 ? phrases[pi] : Math.floor(p / 16) * 16;
      const beat = bt > lastBeat + 1e-6, phrase = pt > lastPhrase + 1e-6;
      if (beat) lastBeat = bt; if (phrase) lastPhrase = pt;
      const downbeats = timeline?.downbeats ?? [], di = after(downbeats, p) - 1;
      const downbeat = di >= 0 && downbeats[di] > lastDownbeat + 1e-6;
      if (downbeat) lastDownbeat = downbeats[di];
      if (di >= 0) barT = downbeats[di]; else if (!downbeats.length) barT = Math.floor(p / 2.4) * 2.4;
      // Sixteenth-note grid from the local beat length (fallback grid without analysis).
      const beatLen = bi >= 0 && beats[bi + 1] !== undefined ? beats[bi + 1] - beats[bi] : 0.6;
      const subKey = Math.floor(bt / beatLen * 4 + 1e-6) + Math.floor((p - bt) / (beatLen / 4) + 1e-6);
      const sixteenth = subKey !== lastSub; lastSub = subKey;
      const onsets = timeline?.onsets ?? []; let lo = 0, hi = onsets.length;
      while (lo < hi) { const m = (lo + hi) >>> 1; if (onsets[m].t <= p) lo = m + 1; else hi = m; }
      const onset = onsets[lo - 1];
      const hit = !!onset && onset.t > lastHit + 1e-6 && p - onset.t < 0.1;
      if (onset) lastHit = Math.max(lastHit, onset.t);
      const upcoming = [...announced].sort((a, b) => a[0] - b[0])[0];
      const k = Math.min(Math.max(0, Math.floor(p * (timeline?.hz ?? 10))), (timeline?.intensity.length ?? 1) - 1);
      const intensity = clamp(timeline?.intensity[k] ?? 0.5, 0, 1);
      const song = timeline?.songs.find(s => s.t0 <= p && s.t1 > p);
      let rpm: number | null = null;
      if (phrase && timeline?.confidence === 'full' && bi >= 8) {
        const gaps = beats.slice(bi - 7, bi + 1).map((b, i, a) => i ? b - a[i - 1] : 0).slice(1);
        const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        if (avg > 0 && gaps.every(g => Math.abs(g - avg) < avg * 0.08)) rpm = cadenceFor(60 / avg);
      }
      return { kind, intensity, beat, downbeat, hit, phrase, rpm, sixteenth, beatPulse: Math.exp(-Math.max(0, p - bt) * 7), barPulse: Math.exp(-Math.max(0, p - barT) * 3),
        song: song?.title ?? 'Deep space transmission', upcoming: upcoming ? { at: upcoming[0], kind: upcoming[1] } : null };
    },
    bossAt(earliest: number) {
      const phrases = timeline?.phrases ?? [];
      const i = after(phrases, earliest - 0.001);
      return phrases[i] !== undefined && phrases[i] <= earliest + 16 ? phrases[i] : earliest;
    },
  };
}
