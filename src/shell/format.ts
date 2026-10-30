import type { UnitSystem } from '../contracts';
import { formatDistance, formatElevation, formatSpeed } from '../units';
export function formatDuration(totalS: number): string {
  const s = Math.max(0, Math.round(totalS));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0'), ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
export function formatNum(n: number | null | undefined, digits = 0): string {
  return n == null || !Number.isFinite(n) ? '--' : n.toFixed(digits);
}
export function formatWatts(n: number | null | undefined): string { return n == null ? '-- W' : `${Math.round(n)} W`; }
export function formatPct(frac: number, digits = 0): string { return `${(frac * 100).toFixed(digits)}%`; }
/** Fractions per zone summing to 1 (all zeros when no data). */
export function zoneFractions(zoneSeconds: number[]): number[] {
  const total = zoneSeconds.reduce((a, b) => a + b, 0);
  return zoneSeconds.map((z) => (total > 0 ? z / total : 0));
}
/** Display value of a game-summary / debug value. */
export function formatValue(v: number | string | boolean): string {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2);
  return String(v);
}
/** Packets per second from two stat samples. */
export function packetsPerSecond(prev: { packets: number }, cur: { packets: number }, dtS: number): number {
  return dtS > 0 ? Math.max(0, (cur.packets - prev.packets) / dtS) : 0;
}
/** Level progress given cumulative XP thresholds. */
export function levelProgress(xp: number, xpAtLevel: number, xpAtNext: number): number {
  const span = xpAtNext - xpAtLevel;
  return span <= 0 ? 0 : Math.min(1, Math.max(0, (xp - xpAtLevel) / span));
}
/** "distanceKm" -> "Distance km", "roomsCleared" -> "Rooms cleared". */
export function prettyKey(k: string): string {
  const s = k.replace(/_/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
/** Average a series into at most `n` buckets (nulls ignored; a bucket of only nulls stays null). */
export function downsample(xs: ReadonlyArray<number | null>, n: number): Array<number | null> {
  if (xs.length <= n) return xs.slice();
  const out: Array<number | null> = [];
  for (let i = 0; i < n; i++) {
    const a = Math.floor((i * xs.length) / n), b = Math.floor(((i + 1) * xs.length) / n);
    let s = 0, c = 0;
    for (let j = a; j < b; j++) { const v = xs[j]; if (v != null) { s += v; c++; } }
    out.push(c ? s / c : null);
  }
  return out;
}
/** "3 days ago" style, from epoch ms. */
export function timeAgo(then: number | undefined, now = Date.now()): string {
  if (!then) return 'Not played yet';
  const m = Math.max(0, (now - then) / 60000);
  if (m < 2) return 'Just now';
  if (m < 60) return `${Math.round(m)} min ago`;
  const h = m / 60; if (h < 24) return `${Math.round(h)} h ago`;
  const d = h / 24; return d < 2 ? 'Yesterday' : `${Math.round(d)} days ago`;
}

/** Consistent labels and rider-selected units across the result banner and ride summary. */
export const rideMetricLabel=(key:string)=>({distanceKm:'Distance',climbM:'Climb',topKph:'Top speed',avgKph:'Avg speed'}[key]??prettyKey(key));
export function rideMetricValue(key:string,value:number|string|boolean,units:UnitSystem):string {
 if(typeof value==='number'){
  if(key==='distanceKm')return formatDistance(value,units);
  if(key==='climbM')return formatElevation(value,units);
  if(key==='topKph'||key==='avgKph')return formatSpeed(value,units);
 }
 return formatValue(value);
}
