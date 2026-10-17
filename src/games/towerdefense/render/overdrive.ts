// Overdrive and called-effort payoff visuals: pure helpers (colours, bands, timings) used by the renderer.
import type { EffortKind } from '../sim/efforts';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
export function mixHex(a: string, b: string, f: number): string {
  const x = hex(a), y = hex(b), k = clamp01(f);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join('');
}

/** Smooths the sim's on/off Overdrive into a 0..1 blend (fast in, slower out). */
export function stepBlend(cur: number, on: boolean, dt: number): number {
  const rate = on ? 6 : 2;
  return clamp01(cur + ((on ? 1 : 0) - cur) * Math.min(1, dt * rate));
}

/** Cable look at heat 0..1: core goes white-hot, pulses brighten, grow and travel faster. */
export function cableHeat(heat: number) {
  const h = clamp01(heat);
  return {
    core: mixHex('#2b393d', '#fff1c8', h), sheath: mixHex('#6d6f72', '#ffb05a', h * 0.8),
    glow: h > 0.02 ? { color: '#ff9a3a', alpha: 0.35 * h, width: 2.4 } : null,
    pulseColor: mixHex('#75edff', '#ffffff', h), pulseSize: 1 + 0.7 * h, pulseSpeed: 1 + 0.8 * h,
  };
}

export interface Band { x: number; y: number; w: number; h: number; alpha: number }
/** Heat-shimmer bands along the left, right and top edges of the play area (above `uh`, the HUD line). */
export function shimmerBands(t: number, W: number, uh: number, heat: number, n = 7): Band[] {
  const h = clamp01(heat); if (h <= 0.01) return [];
  const out: Band[] = [], edge = Math.max(24, W * 0.05);
  for (let i = 0; i < n; i++) {
    const y = ((i / n + t * 0.18) % 1) * uh, sway = Math.sin(t * 5 + i * 1.7) * 0.5 + 0.5, a = 0.1 + 0.12 * sway;
    out.push({ x: 0, y, w: edge * (0.6 + 0.4 * sway), h: uh / n * 0.8, alpha: a * h });
    out.push({ x: W - edge * (0.6 + 0.4 * sway), y: (y + uh / (2 * n)) % uh, w: edge * (0.6 + 0.4 * sway), h: uh / n * 0.8, alpha: a * h });
  }
  for (let i = 0; i < 5; i++) { const x = ((i / 5 + t * 0.12) % 1) * W; out.push({ x, y: 0, w: W / 5 * 0.8, h: edge * 0.7, alpha: (0.08 + 0.06 * Math.sin(t * 4 + i)) * h }); }
  return out.filter((b) => b.alpha > 0 && b.y < uh);
}

/** A flinch impulse decays over ~0.45 s; returns the current strength (0..1). */
export const FLINCH_S = 0.45;
export const flinchAt = (since: number) => (since < 0 || since > FLINCH_S ? 0 : Math.exp(-since * 7) * Math.sin(Math.min(1, since / 0.04) * Math.PI / 2));

/** Ring colour and sting for each called effort's payoff. */
export const PAYOFF_STYLE: Record<EffortKind, { color: string; label: string }> = {
  spin: { color: '#8fd8ff', label: 'SPIN-UP' }, grind: { color: '#ff9a3a', label: 'GRIND' }, hold: { color: '#c38dff', label: 'HOLD' },
};
