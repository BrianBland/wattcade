import type { SongAnalysis } from '../types';
import { analyzePcm } from './analyze';
import { renderScore } from '../synth/render';
import { encodeWav } from '../player/wav';
import type { SynthScore } from '../synth/score';
import type { WorkerReply, WorkerRequest } from './worker';

/** Talks to the analysis worker (one at a time, FIFO). Falls back to the main thread where workers don't exist. */
let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; progress?: (p: number, stage: string) => void }>();

function getWorker(): Worker | null {
  if (worker || typeof Worker === 'undefined') return worker;
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<WorkerReply>) => {
    const m = e.data, p = pending.get(m.id); if (!p) return;
    if (m.kind === 'progress') p.progress?.(m.p, m.stage);
    else { pending.delete(m.id); if (m.kind === 'done') p.resolve(m.result); else p.reject(new Error(m.message)); }
  };
  worker.onerror = (e) => { for (const p of pending.values()) p.reject(new Error(e.message || 'analysis worker failed')); pending.clear(); worker = null; };
  return worker;
}

type Req = WorkerRequest extends infer R ? (R extends { id: number } ? Omit<R, 'id'> : never) : never;
function call<T>(req: Req, transfer: Transferable[], progress?: (p: number, stage: string) => void): Promise<T> {
  const w = getWorker();
  const id = nextId++;
  if (!w) return Promise.reject(new Error('no worker'));
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, progress });
    w.postMessage({ ...req, id }, transfer);
  });
}

export async function analyzeInWorker(pcm: Float32Array, sr: number, progress?: (p: number, stage: string) => void): Promise<SongAnalysis> {
  if (typeof Worker === 'undefined') return analyzePcm(pcm, sr, { progress });
  return call<SongAnalysis>({ kind: 'analyze', pcm, sr }, [pcm.buffer], progress);
}

export async function renderSynthWav(score: SynthScore, sr = 32000): Promise<Uint8Array> {
  if (typeof Worker === 'undefined') return encodeWav(renderScore(score, sr), sr);
  return call<Uint8Array>({ kind: 'synth', score, sr }, []);
}
