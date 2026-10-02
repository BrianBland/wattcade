// Pure economy math + number formatting for HAMSTERGRID.
import { UNITS } from './data';

export interface EconParams {
  out0: number; outStep: number;    // generator i base output = out0 × outStep^i (W)
  cost0: number; costStep: number;  // generator i base cost = cost0 × costStep^i (J)
  growth: number;                   // per-owned cost growth (classic 1.15)
}
export const DEFAULT_ECON: EconParams = { out0: 1.5, outStep: 11, cost0: 400, costStep: 13, growth: 1.15 };

export const genOut = (e: EconParams, i: number) => e.out0 * Math.pow(e.outStep, i);
export const genBaseCost = (e: EconParams, i: number) => e.cost0 * Math.pow(e.costStep, i);
/** Cost of buying `k` more when `owned` are owned (geometric series). */
export function genCost(e: EconParams, i: number, owned: number, k = 1, discount = 1): number {
  const first = genBaseCost(e, i) * Math.pow(e.growth, owned);
  return discount * first * (Math.pow(e.growth, k) - 1) / (e.growth - 1);
}
export const legCost = (k: number) => 1500 * Math.pow(30, k);
export const monoCost = (k: number) => 2e4 * Math.pow(60, k);

/** Kardashev rating: K = (log10 P - 6) / 10. */
export const kardashev = (w: number) => (w > 0 ? (Math.log10(w) - 6) / 10 : -0.6);

const SI = ['', 'k', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y', 'R', 'Q'];
export function fmt(x: number, unit = ''): string {
  if (!Number.isFinite(x)) return `∞ ${unit}`.trim();
  const neg = x < 0; x = Math.abs(x);
  let s: string;
  if (x < 1000) s = x < 10 ? x.toFixed(1).replace(/\.0$/, '') : Math.round(x).toString();
  else {
    const e3 = Math.floor(Math.log10(x) / 3);
    if (e3 < SI.length) { const v = x / Math.pow(1000, e3); s = `${v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.round(v)} ${SI[e3]}`; }
    else { const e = Math.floor(Math.log10(x)); s = `${(x / Math.pow(10, e)).toFixed(2)}e${e} `; }
    return `${neg ? '-' : ''}${s}${unit}`.trim();
  }
  return `${neg ? '-' : ''}${s} ${unit}`.trim();
}
export const fmtJ = (x: number) => fmt(x, 'J');
export const fmtW = (x: number) => fmt(x, 'W');

/** "≈ 3.2 toasters": the largest unit not bigger than w. */
export function equivalence(w: number): string {
  if (w <= 0) return 'nothing. The hamsters are waiting.';
  let u = UNITS[0];
  for (const x of UNITS) if (w >= x[0]) u = x;
  const n = w / u[0];
  const num = n < 10 ? n.toFixed(1) : fmt(n);
  return `≈ ${num} ${n >= 1.05 || n < 0.95 ? u[2] : u[1]}`;
}

export function fmtDur(s: number): string {
  s = Math.max(0, Math.ceil(s));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}`;
  if (s < 86400 * 2) return `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
  return 'forever';
}
