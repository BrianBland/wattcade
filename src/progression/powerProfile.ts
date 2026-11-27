/**
 * The shared power profile: the rider's best mean power over standard durations, kept up to date from every real ride
 * in any game, and read by any game that wants personal targets (sprint zones, chaser speeds, interval targets...).
 *
 * Pure and deterministic: no clock, no storage. The shell folds each finished real ride in with `updatePowerProfile`
 * and persists `Profile.power`; games read it with `powerCurve(ctx.profile)`. "Recent" is measured from the rider's
 * last ride (`lastRideAt`), not the wall clock, so a sim reading it is reproducible.
 */
import type { PowerEffort, PowerProfile, Profile, SessionRecord, SessionSample, Watts } from '../contracts';

/** The durations the profile tracks (seconds). Sprint (5–30 s), anaerobic (1 min), VO2 (5 min), threshold (20 min). */
export const POWER_DURATIONS = [5, 15, 30, 60, 300, 1200] as const;
export type PowerDuration = typeof POWER_DURATIONS[number];

/**
 * A typical mean-max curve shape as FTP multiples. Only the ratios between durations matter: they extend a measured
 * point to a duration the rider hasn't done, and give a starting curve from FTP alone.
 */
export const TYPICAL_SHAPE: Readonly<Record<PowerDuration, number>> = { 5: 2.3, 15: 1.9, 30: 1.6, 60: 1.3, 300: 1.08, 1200: 1.0 };
/**
 * An effort counts as **hard** (close to the rider's limit, so it is safe to set targets from) when it reaches this
 * FTP multiple. Below it the number is only a lower bound: an easy ride also has a "best 5 s".
 */
export const HARD_FTP: Readonly<Record<PowerDuration, number>> = { 5: 1.5, 15: 1.3, 30: 1.15, 60: 1.0, 300: 0.9, 1200: 0.88 };

export interface PowerOptions {
  /** Samples above this are sensor glitches and ignored (W). */
  maxW?: number;
  /** Efforts older than this (days before the last ride) leave `recent`; `allTime` keeps the best forever. */
  keepDays?: number;
  /** Form: a best keeps full value for this many days... */
  graceDays?: number;
  /** ...then loses this share per day... */
  fadePerDay?: number;
  /** ...down to this share of what you rode. */
  fadeFloor?: number;
  /** Most `recent` efforts kept per duration. */
  maxRecent?: number;
}
export const POWER_DEFAULTS: Required<PowerOptions> = { maxW: 2500, keepDays: 365, graceDays: 42, fadePerDay: 0.003, fadeFloor: 0.8, maxRecent: 48 };
const DAY_MS = 86_400_000;

// ---------- measuring a ride ----------

/** Clean 1 Hz power: glitch samples (non-finite, negative, above `maxW`) and lone spikes become their neighbours' mean. */
export function cleanPower(samples: readonly SessionSample[], maxW = POWER_DEFAULTS.maxW): number[] {
  const raw = samples.map((s) => (Number.isFinite(s.power) && s.power >= 0 && s.power <= maxW ? s.power : NaN));
  const at = (i: number) => (i >= 0 && i < raw.length && Number.isFinite(raw[i]) ? raw[i] : NaN);
  const neighbours = (i: number) => { const a = at(i - 1), b = at(i + 1); return Number.isFinite(a) && Number.isFinite(b) ? (a + b) / 2 : Number.isFinite(a) ? a : Number.isFinite(b) ? b : 0; };
  return raw.map((p, i) => {
    if (!Number.isFinite(p)) return neighbours(i);
    const a = at(i - 1), b = at(i + 1);
    // one sample far above both sides is a dropout/reconnect artefact, not a pedal stroke
    if (Number.isFinite(a) && Number.isFinite(b) && p > 2.5 * Math.max(a, b) + 300) return (a + b) / 2;
    return p;
  });
}

/**
 * Best mean power over each duration (W), from 1 Hz samples. A window never spans a gap in the recording (a pause or
 * a dropped second), so a 5 min best is 5 min of real riding. Durations longer than every stretch are left out.
 */
export function meanMax(samples: readonly SessionSample[], durations: readonly number[] = POWER_DURATIONS, maxW?: number): Record<number, number> {
  const p = cleanPower(samples, maxW);
  const out: Record<number, number> = {};
  let start = 0;
  const segment = (a: number, b: number) => { // [a, b)
    const n = b - a;
    const pre = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + p[a + i];
    for (const d of durations) {
      if (n < d) continue;
      let best = 0;
      for (let i = d; i <= n; i++) best = Math.max(best, pre[i] - pre[i - d]);
      out[d] = Math.max(out[d] ?? 0, best / d);
    }
  };
  for (let i = 1; i <= samples.length; i++) {
    if (i === samples.length || !(samples[i].t - samples[i - 1].t <= 1.5)) { segment(start, i); start = i; }
  }
  return out;
}

// ---------- updating the profile ----------

export interface PowerImprovement { durationS: PowerDuration; w: Watts; prevW: Watts; allTime: boolean }

/** Keep only efforts that can still be a window's best: oldest first, each strictly higher than every later one. */
function frontier(list: PowerEffort[], newest: number, o: Required<PowerOptions>): PowerEffort[] {
  const sorted = list.filter((e) => newest - e.at <= o.keepDays * DAY_MS).sort((a, b) => a.at - b.at);
  const kept: PowerEffort[] = [];
  let top = -Infinity;
  for (let i = sorted.length - 1; i >= 0; i--) if (sorted[i].w > top) { kept.push(sorted[i]); top = sorted[i].w; }
  return kept.reverse().slice(-o.maxRecent);
}

/**
 * Fold one finished ride into the profile. Call it only for rides on real devices at normal speed (never the fake
 * bike). Returns the new profile (the old one is not changed) and the durations where this ride set a best: `allTime`
 * when it beat every ride, otherwise a best for your current form.
 */
export function updatePowerProfile(prev: Readonly<PowerProfile> | undefined, record: Readonly<SessionRecord>, opts: PowerOptions = {}): { power: PowerProfile; improved: PowerImprovement[] } {
  const o = { ...POWER_DEFAULTS, ...opts };
  const base: PowerProfile = prev ? { ...prev, bests: { ...prev.bests } } : { v: 1, bests: {}, rides: 0, lastRideAt: 0 };
  const mm = meanMax(record.samples, POWER_DURATIONS, o.maxW);
  const at = record.startedAt;
  const newest = Math.max(base.lastRideAt, at);
  const before = prev ? powerCurve({ ftp: 0, power: prev }, { ...o, now: newest }) : null;
  const improved: PowerImprovement[] = [];
  for (const d of POWER_DURATIONS) {
    const w = Math.round(mm[d] ?? 0);
    const slot = base.bests[String(d)];
    if (!(w > 0)) { if (slot) base.bests[String(d)] = { ...slot, recent: frontier(slot.recent, newest, o) }; continue; }
    const e: PowerEffort = { w, at, gameId: record.gameId };
    const allTime = !slot || w > slot.allTime.w ? e : slot.allTime;
    base.bests[String(d)] = { allTime, recent: frontier([...(slot?.recent ?? []), e], newest, o) };
    const prevForm = before?.best(d)?.formW ?? 0;
    if (w > prevForm) improved.push({ durationS: d, w, prevW: Math.round(prevForm), allTime: allTime === e });
  }
  if (Object.keys(mm).length) { base.rides += 1; base.lastRideAt = newest; }
  return { power: base, improved };
}

// ---------- reading the profile ----------

export interface PowerBest extends PowerEffort {
  /** What this effort is worth now: `w` faded by its age (see `PowerOptions`). Targets should use this. */
  formW: Watts;
  /** Close to the rider's limit (`HARD_FTP`), so targets can be set from it. */
  hard: boolean;
  allTimeW: Watts;
}
export interface PowerEstimate {
  w: Watts;
  /** measured = this exact duration; interpolated = between two measured ones; extrapolated = from the nearest one by the typical shape; ftp = no data, FTP × typical shape. */
  source: 'measured' | 'interpolated' | 'extrapolated' | 'ftp';
  /** Every measured point it comes from is a hard effort. False for `ftp`. */
  hard: boolean;
}
export interface PowerCurve {
  /** The FTP the curve is relative to: the profile's, or the estimate when that is higher. */
  ftp: Watts;
  /** 95 % of a hard 20 min best (for your form), else null. Never lowered by easy rides. */
  ftpEstimate: Watts | null;
  /** The best for one tracked duration for your current form, or null if none yet. */
  best(d: PowerDuration): PowerBest | null;
  /** Your power for any duration (seconds) from the measured points; never null. */
  at(durationS: number): PowerEstimate;
  /** `at(d).w` as a fraction of `ftp`. */
  fraction(durationS: number): number;
  /** True when a hard effort is on record for some tracked duration in [minS, maxS]. */
  hasHard(minS: number, maxS: number): boolean;
  /** Every tracked duration, for display. */
  table(): Array<{ durationS: PowerDuration; best: PowerBest | null }>;
}

const lg = Math.log;
/** The typical shape at any duration (log-log between the table points, the end slopes beyond). */
export function typicalShape(d: number): number {
  const ds = POWER_DURATIONS;
  const x = Math.max(1, d);
  let i = 0;
  while (i < ds.length - 2 && x > ds[i + 1]) i++;
  const a = ds[i], b = ds[i + 1];
  const f = (lg(x) - lg(a)) / (lg(b) - lg(a));
  return Math.exp(lg(TYPICAL_SHAPE[a]) + f * (lg(TYPICAL_SHAPE[b]) - lg(TYPICAL_SHAPE[a])));
}

/** Age fade: full value for `graceDays`, then `fadePerDay`, down to `fadeFloor`. */
export function formFactor(ageMs: number, o: PowerOptions = {}): number {
  const { graceDays, fadePerDay, fadeFloor } = { ...POWER_DEFAULTS, ...o };
  const days = Math.max(0, ageMs / DAY_MS - graceDays);
  return Math.max(fadeFloor, 1 - fadePerDay * days);
}

/**
 * Read a rider's power curve. `opts.now` (epoch ms) measures form from that time; by default it is the last ride, so a
 * sim gets the same answer every time. Rides you haven't done yet are filled in from the ones you have.
 */
export function powerCurve(profile: Pick<Profile, 'ftp' | 'power'> | Readonly<Pick<Profile, 'ftp' | 'power'>>, opts: PowerOptions & { now?: number } = {}): PowerCurve {
  const power = profile.power;
  const now = opts.now ?? power?.lastRideAt ?? 0;
  const raw: Partial<Record<PowerDuration, PowerEffort & { formW: number; allTimeW: number }>> = {};
  for (const d of POWER_DURATIONS) {
    const slot = power?.bests[String(d)];
    if (!slot) continue;
    let pick: PowerEffort = slot.allTime, form = slot.allTime.w * formFactor(now - slot.allTime.at, opts);
    for (const e of slot.recent) { const f = e.w * formFactor(now - e.at, opts); if (f > form) { form = f; pick = e; } }
    raw[d] = { ...pick, formW: form, allTimeW: slot.allTime.w };
  }
  // a mean-max curve never rises with duration: a 600 W minute means at least 600 W for 30 s too
  let floor = 0;
  for (let i = POWER_DURATIONS.length - 1; i >= 0; i--) {
    const r = raw[POWER_DURATIONS[i]];
    if (!r) continue;
    r.formW = Math.max(r.formW, floor); floor = r.formW;
  }
  const t20 = raw[1200];
  const setFtp = profile.ftp > 0 ? profile.ftp : 0;
  const ftpEstimate = t20 && setFtp > 0 && t20.formW >= HARD_FTP[1200] * setFtp ? Math.round(0.95 * t20.formW) : null;
  const ftp = Math.max(setFtp, ftpEstimate ?? 0) || 200;
  const best = (d: PowerDuration): PowerBest | null => {
    const r = raw[d];
    return r ? { w: r.w, at: r.at, gameId: r.gameId, formW: Math.round(r.formW), allTimeW: r.allTimeW, hard: r.formW >= HARD_FTP[d] * ftp } : null;
  };
  const anchors = POWER_DURATIONS.filter((d) => raw[d]).map((d) => ({ d, w: raw[d]!.formW, hard: raw[d]!.formW >= HARD_FTP[d] * ftp }));
  const at = (durationS: number): PowerEstimate => {
    const x = Math.max(1, durationS);
    if (!anchors.length) return { w: Math.round(ftp * typicalShape(x)), source: 'ftp', hard: false };
    const exact = anchors.find((a) => Math.abs(a.d - x) < 1e-6);
    if (exact) return { w: Math.round(exact.w), source: 'measured', hard: exact.hard };
    const hi = anchors.findIndex((a) => a.d > x);
    if (hi > 0) {
      const a = anchors[hi - 1], b = anchors[hi];
      const f = (lg(x) - lg(a.d)) / (lg(b.d) - lg(a.d));
      return { w: Math.round(Math.exp(lg(a.w) + f * (lg(b.w) - lg(a.w)))), source: 'interpolated', hard: a.hard && b.hard };
    }
    const n = hi === 0 ? anchors[0] : anchors[anchors.length - 1];
    let w = n.w * typicalShape(x) / typicalShape(n.d);
    if (x > n.d) w = Math.min(w, n.w); // never above what you did for less time
    return { w: Math.round(w), source: 'extrapolated', hard: n.hard };
  };
  return {
    ftp, ftpEstimate, best, at,
    fraction: (d) => at(d).w / ftp,
    hasHard: (minS, maxS) => anchors.some((a) => a.hard && a.d >= minS && a.d <= maxS),
    table: () => POWER_DURATIONS.map((d) => ({ durationS: d, best: best(d) })),
  };
}

/** "5 s", "1 min", "20 min". */
export const durationLabel = (d: number): string => (d < 60 ? `${d} s` : `${Math.round(d / 60)} min`);
