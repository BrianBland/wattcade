/// <reference lib="webworker" />
// Analysis worker: runs analyzePcm off the main thread, and renders synth songs to WAV.
import { analyzePcm } from './analyze';
import type { BeatFeature } from './structure';
import { renderScore } from '../synth/render';
import type { SynthScore } from '../synth/score';
import { encodeWav } from '../player/wav';

export type WorkerRequest =
  | { id: number; kind: 'analyze'; pcm: Float32Array; sr: number }
  | { id: number; kind: 'window'; pcm: Float32Array; sr: number; tempoHint?: number }
  | { id: number; kind: 'synth'; score: SynthScore; sr: number };
export type WorkerReply =
  | { id: number; kind: 'progress'; p: number; stage: string }
  | { id: number; kind: 'done'; result: unknown }
  | { id: number; kind: 'error'; message: string };

const post = (m: WorkerReply, transfer: Transferable[] = []) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m, transfer);

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const m = e.data;
  try {
    if (m.kind === 'analyze') {
      const result = analyzePcm(m.pcm, m.sr, { progress: (p, stage) => post({ id: m.id, kind: 'progress', p, stage }) });
      post({ id: m.id, kind: 'done', result });
    } else if (m.kind === 'window') {
      let beats: BeatFeature[] = [];
      const analysis = analyzePcm(m.pcm, m.sr, { tempoHint: m.tempoHint, onBeatFeatures: (b) => { beats = b; } });
      post({ id: m.id, kind: 'done', result: { analysis, beats } });
    } else {
      const wav = encodeWav(renderScore(m.score, m.sr), m.sr);
      post({ id: m.id, kind: 'done', result: wav }, [wav.buffer]);
    }
  } catch (err) {
    post({ id: m.id, kind: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
