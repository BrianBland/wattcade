// Measure rolling-analysis seam drift on synth fixtures (#64): `npx tsx scripts/rolling-drift.ts [--json]`.
import { analyzePcm } from '../src/media/analysis/analyze';
import { concatFixtures, driftReport, replayRolling, seamsOf, silence } from '../src/media/online/drift';
import { renderScore } from '../src/media/synth/render';
import { makeScore, type SynthStyle } from '../src/media/synth/score';
import { scoreAnalysis } from '../src/media/synth/truth';
import { ANALYSIS_SR } from '../src/media/types';

const sr = ANALYSIS_SR, json = process.argv.includes('--json');
const song = (style: SynthStyle, seed: number) => { const s = makeScore(style, seed), t = scoreAnalysis(s); return { pcm: renderScore(s, sr), ref: { beats: t.beats, downbeats: t.downbeats, phrases: t.phrases }, bpm: t.bpm }; };
const fixtures: Array<{ name: string; pcm: Float32Array; ref: { beats: number[]; downbeats: number[]; phrases: number[] }; bpm: number }> = [];
for (const [st, seed] of [['edm', 1], ['rock', 1], ['ambient', 2]] as const) { const x = song(st, seed); fixtures.push({ name: `${st}#${seed}`, ...x }); }
{ const a = song('edm', 1), b = song('edm', 3); const c = concatFixtures([a, { pcm: silence(12, sr) }, b], sr); fixtures.push({ name: 'edm+12s silence+edm', pcm: c.pcm, ref: c.ref, bpm: a.bpm }); }
{ const a = song('edm', 1), b = song('rock', 2); const c = concatFixtures([a, b], sr); fixtures.push({ name: `tempo change ${a.bpm}->${b.bpm}`, pcm: c.pcm, ref: c.ref, bpm: a.bpm }); }
const out = [];
for (const f of fixtures) {
  const dur = f.pcm.length / sr, seams = seamsOf(dur);
  const full = analyzePcm(f.pcm, sr), roll = replayRolling(f.pcm, sr);
  const rf = { bpm: f.bpm, ...f.ref };
  const F = driftReport(full, rf, seams), R = driftReport(roll.merged, rf, seams, roll.windows.map((w) => w.bpm));
  const r2 = (x: number | null) => (x === null ? null : Math.round(x * 1000) / 1000);
  const row = { fixture: f.name, durationS: Math.round(dur), seams: seams.length,
    full: { beatF: r2(F.beatF), downbeatF: r2(F.downbeatF), phraseF: r2(F.phraseF), seamBeatF: r2(F.seamBeatF) },
    rolling: { songBpm: roll.merged.bpm, fullBpm: full.bpm, refBpm: f.bpm, beatF: r2(R.beatF), downbeatF: r2(R.downbeatF), phraseF: r2(R.phraseF), interiorBeatF: r2(R.interiorBeatF), seamBeatF: r2(R.seamBeatF),
      worstSeamIbiError: r2(R.worstSeamIbiError), barPhaseLost: R.seams.filter((s) => s.barPhaseKept === false).length,
      maxPhaseJumpMs: Math.round(Math.max(0, ...R.seams.map((s) => Math.abs(s.phaseJumpS ?? 0))) * 1000),
      windowBpmRatios: R.windowBpmRatios } };
  out.push(row);
  if (!json) console.log(JSON.stringify(row));
}
if (json) console.log(JSON.stringify(out, null, 2));
