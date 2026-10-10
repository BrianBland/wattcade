// Measure rolling-analysis seam drift (#64): `npx tsx scripts/rolling-drift.ts [--json] [--md] [wav files…]`.
// Compares whole-file analysis, the old per-window structure (30 s), feature-accumulated structure (30 s), and plain 60/90 s windows.
import { readFileSync } from 'node:fs';
import { analyzePcm } from '../src/media/analysis/analyze';
import { concatFixtures, driftReport, replayRolling, seamsOf, silence } from '../src/media/online/drift';
import { retainedFeatureBytes } from '../src/media/online/rolling';
import { renderScore } from '../src/media/synth/render';
import { makeScore, type SynthStyle } from '../src/media/synth/score';
import { scoreAnalysis } from '../src/media/synth/truth';
import { ANALYSIS_SR } from '../src/media/types';

const sr = ANALYSIS_SR, args = process.argv.slice(2), json = args.includes('--json'), md = args.includes('--md');
type Ref = { beats: number[]; downbeats: number[]; phrases: number[] };
const song = (style: SynthStyle, seed: number) => { const s = makeScore(style, seed), t = scoreAnalysis(s); return { pcm: renderScore(s, sr), ref: { beats: t.beats, downbeats: t.downbeats, phrases: t.phrases } as Ref, bpm: t.bpm }; };
const fixtures: Array<{ name: string; pcm: Float32Array; ref?: Ref; bpm?: number }> = [];
if (!args.includes('--no-synth')) {
for (const [st, seed] of [['edm', 1], ['rock', 1], ['ambient', 2], ['edm', 3], ['rock', 2]] as const) fixtures.push({ name: `${st}#${seed}`, ...song(st, seed) });
{ const a = song('edm', 1), b = song('edm', 3); const c = concatFixtures([a, { pcm: silence(12, sr) }, b], sr); fixtures.push({ name: 'edm+12s silence+edm', pcm: c.pcm, ref: c.ref, bpm: a.bpm }); }
{ const a = song('edm', 1), b = song('ambient', 1); const c = concatFixtures([a, b], sr); fixtures.push({ name: `tempo ${a.bpm}->${b.bpm}`, pcm: c.pcm, ref: c.ref, bpm: a.bpm }); }
}
// Real audio: 16-bit PCM WAV (mono or stereo, any rate) → reference = whole-file analysis (no ground truth).
function readWav(path: string): Float32Array {
  const d = readFileSync(path); let o = 12, fmt = { ch: 1, rate: sr, bits: 16 }, data: Buffer | null = null;
  while (o + 8 <= d.length) { const id = d.toString('ascii', o, o + 4), n = d.readUInt32LE(o + 4);
    if (id === 'fmt ') fmt = { ch: d.readUInt16LE(o + 10), rate: d.readUInt32LE(o + 12), bits: d.readUInt16LE(o + 22) };
    if (id === 'data') data = d.subarray(o + 8, o + 8 + n); o += 8 + n + (n & 1); }
  if (!data || fmt.bits !== 16) throw new Error(`${path}: need 16-bit PCM WAV`);
  const frames = data.length / 2 / fmt.ch, mono = new Float32Array(frames);
  for (let i = 0; i < frames; i++) { let s = 0; for (let c = 0; c < fmt.ch; c++) s += data.readInt16LE((i * fmt.ch + c) * 2); mono[i] = s / fmt.ch / 32768; }
  const outN = Math.floor(frames * sr / fmt.rate), out = new Float32Array(outN);
  for (let i = 0; i < outN; i++) { const x = i * fmt.rate / sr, k = Math.floor(x), f = x - k; out[i] = (mono[k] ?? 0) * (1 - f) + (mono[k + 1] ?? mono[k] ?? 0) * f; }
  return out;
}
for (const path of args.filter((a) => !a.startsWith('--'))) fixtures.push({ name: path.split('/').pop()!, pcm: readWav(path) });

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const rows: any[] = [];
for (const f of fixtures) {
  const dur = f.pcm.length / sr, full = analyzePcm(f.pcm, sr);
  const ref = f.ref ? { bpm: f.bpm!, ...f.ref } : { bpm: full.bpm, beats: full.beats, downbeats: full.downbeats, phrases: full.phrases };
  const variant = (name: string, chunkS: number, features: boolean) => {
    const r = replayRolling(f.pcm, sr, { chunkS, features }), seams = seamsOf(dur, chunkS), seams30 = seamsOf(dur, 30);
    const rep = driftReport(r.merged, ref, seams), rep30 = driftReport(r.merged, ref, seams30);
    return { variant: name, phraseF: r3(rep.phraseF), downbeatF: r3(rep.downbeatF), beatF: r3(rep.beatF), seamBeatF: r3(rep.seamBeatF), seam30BeatF: r3(rep30.seamBeatF),
      maxPhaseJumpMs: Math.round(Math.max(0, ...rep.seams.map((s) => Math.abs(s.phaseJumpS ?? 0))) * 1000), bpm: r.merged.bpm, featureBytes: retainedFeatureBytes(r.merged) };
  };
  const fr = driftReport(full, ref, seamsOf(dur, 30));
  rows.push({ fixture: f.name, durationS: Math.round(dur), refBpm: ref.bpm, groundTruth: !!f.ref,
    decodedAudioBytes: Math.round(dur * 44100 * 2 * 4), windowAudioBytes: Math.round(34 * 44100 * 2 * 4),
    variants: [{ variant: 'whole file', phraseF: r3(fr.phraseF), downbeatF: r3(fr.downbeatF), beatF: r3(fr.beatF), seamBeatF: null, seam30BeatF: r3(fr.seamBeatF), maxPhaseJumpMs: null, bpm: full.bpm, featureBytes: 0 },
      variant('30 s before', 30, false), variant('30 s features (new)', 30, true), variant('60 s plain', 60, false), variant('90 s plain', 90, false)] });
  if (!json && !md) console.log(JSON.stringify(rows.at(-1)));
}
if (json) console.log(JSON.stringify(rows, null, 2));
if (md) {
  console.log('| Song | Variant | Phrase F | Downbeat F | Beat F near 30 s seams | Max phase jump | BPM (ref) | Retained features |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const r of rows) for (const v of r.variants) console.log(`| ${r.fixture}${r.groundTruth ? '' : ' (ref = whole file)'} | ${v.variant} | ${v.phraseF} | ${v.downbeatF} | ${v.seam30BeatF} | ${v.maxPhaseJumpMs ?? '—'}${v.maxPhaseJumpMs === null ? '' : ' ms'} | ${v.bpm} (${r.refBpm}) | ${v.featureBytes ? `${(v.featureBytes / 1024).toFixed(1)} KB` : '—'} |`);
  console.log('\n| Song | Duration | Decoded audio, whole song (stereo f32 44.1 kHz) | One 34 s window | Retained features (30 s, new) |\n|---|---|---|---|---|');
  for (const r of rows) console.log(`| ${r.fixture} | ${r.durationS} s | ${(r.decodedAudioBytes / 1e6).toFixed(1)} MB | ${(r.windowAudioBytes / 1e6).toFixed(1)} MB | ${(r.variants[2].featureBytes / 1024).toFixed(1)} KB |`);
}
