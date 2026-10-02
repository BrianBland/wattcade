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
