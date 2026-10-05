import { makeRng } from '../../core/rng';
import { scoreDuration, scoreNotes, type Note, type SynthScore } from './score';

/**
 * Render a synth score to mono PCM. Plain DSP loops (no Web Audio), so it runs in Node for tests and in a
 * worker for fake-mode playback. Deterministic for (score, sr).
 */
export function renderScore(s: SynthScore, sr = 22050): Float32Array {
  const len = Math.ceil(scoreDuration(s) * sr);
  const out = new Float32Array(len);
  const rng = makeRng(s.seed * 31 + 5);
  const noise = () => rng() * 2 - 1;
  // section gain envelope, so louder sections really are louder
  const barLen = 240 / s.bpm;
  const gainAt: number[] = [];
  for (const sec of s.sections) for (let j = 0; j < sec.bars; j++) gainAt.push(0.45 + 0.55 * sec.energy);
  const sectionGain = (t: number) => gainAt[Math.max(0, Math.min(gainAt.length - 1, Math.floor((t - s.leadInS) / barLen)))] ?? 0.5;
  for (const n of scoreNotes(s)) addNote(out, sr, n, sectionGain(n.t), noise);
  let peak = 0; for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(out[i]));
  const k = peak > 0 ? 0.9 / peak : 1;
  for (let i = 0; i < len; i++) out[i] *= k;
  return out;
}

function addNote(out: Float32Array, sr: number, n: Note, g: number, noise: () => number) {
  const i0 = Math.round(n.t * sr), N = Math.min(out.length - i0, Math.ceil(n.dur * sr));
  if (N <= 0) return;
  const v = n.vel * g;
  switch (n.inst) {
    case 'kick': {
      let ph = 0;
      for (let i = 0; i < N; i++) {
        const tau = i / sr, f = 45 + 80 * Math.exp(-tau / 0.03);
        ph += (2 * Math.PI * f) / sr;
        out[i0 + i] += 0.9 * v * Math.sin(ph) * Math.exp(-tau / 0.12);
      }
      break;
    }
    case 'snare': {
      let prev = 0;
      for (let i = 0; i < N; i++) {
        const tau = i / sr, x = noise(), hp = x - prev; prev = x;
        out[i0 + i] += v * (0.35 * hp * Math.exp(-tau / 0.07) + 0.25 * Math.sin(2 * Math.PI * 190 * tau) * Math.exp(-tau / 0.04));
      }
      break;
    }
    case 'hat': case 'crash': {
      let p1 = 0, p2 = 0;
      const decay = n.inst === 'hat' ? 0.018 : 0.45;
      for (let i = 0; i < N; i++) {
        const tau = i / sr, x = noise(), d1 = x - p1; p1 = x; const d2 = d1 - p2; p2 = d1; // 2nd-order difference = bright
        out[i0 + i] += v * (n.inst === 'hat' ? 0.18 : 0.12) * d2 * Math.exp(-tau / decay);
      }
      break;
    }
    case 'bass': {
      let ph = 0, lp = 0;
      for (let i = 0; i < N; i++) {
        const tau = i / sr; ph = (ph + n.f / sr) % 1;
        const saw = 2 * ph - 1; lp += 0.08 * (saw - lp);
        const env = Math.min(1, tau / 0.005) * Math.min(1, (N - i) / (0.01 * sr));
        out[i0 + i] += 0.45 * v * lp * env;
      }
      break;
    }
    case 'pad': {
      const phs = [0, 0.33, 0.66], det = [1, 1.003, 0.997];
      let lp = 0;
      for (let i = 0; i < N; i++) {
        let x = 0;
        for (let k = 0; k < 3; k++) { phs[k] = (phs[k] + (n.f * det[k]) / sr) % 1; x += 2 * phs[k] - 1; }
        lp += 0.05 * (x / 3 - lp);
        const env = Math.min(1, i / (0.03 * sr)) * Math.min(1, (N - i) / (0.05 * sr));
        out[i0 + i] += 0.14 * v * lp * env;
      }
      break;
    }
    case 'lead': {
      let ph = 0;
      for (let i = 0; i < N; i++) {
        const tau = i / sr; ph = (ph + n.f / sr) % 1;
        out[i0 + i] += 0.07 * v * (ph < 0.5 ? 1 : -1) * Math.exp(-tau / 0.05);
      }
      break;
    }
    case 'riser': {
      let lp = 0;
      for (let i = 0; i < N; i++) {
        const p = i / N, a = 0.02 + 0.3 * p * p;
        lp += a * (noise() - lp);
        out[i0 + i] += 0.25 * v * p * p * lp;
      }
      break;
    }
  }
}
