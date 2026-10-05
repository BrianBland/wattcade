import { ANALYSIS_SR } from '../types';

/**
 * Decode any browser-playable audio file to mono PCM at `sr` (default the analysis rate). decodeAudioData
 * resamples to its context's rate, so an OfflineAudioContext at `sr` does the resampling for us.
 */
export async function decodeMono(data: ArrayBuffer, sr = ANALYSIS_SR): Promise<{ pcm: Float32Array; durationS: number }> {
  const Ctx: typeof OfflineAudioContext = (globalThis as any).OfflineAudioContext ?? (globalThis as any).webkitOfflineAudioContext;
  if (!Ctx) throw new Error('This browser cannot decode audio');
  const ctx = new Ctx(1, 1, sr);
  const buf: AudioBuffer = await new Promise((resolve, reject) => {
    // Safari's older callback form, plus the promise form
    const p = ctx.decodeAudioData(data, resolve, (e) => reject(e ?? new Error('Could not decode this file')));
    if (p && typeof (p as Promise<AudioBuffer>).then === 'function') (p as Promise<AudioBuffer>).then(resolve, reject);
  });
  const n = buf.length, ch = buf.numberOfChannels, pcm = new Float32Array(n);
  for (let c = 0; c < ch; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) pcm[i] += d[i] / ch; }
  return { pcm, durationS: n / buf.sampleRate };
}
