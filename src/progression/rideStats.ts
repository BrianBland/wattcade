import type { SessionRecord, SessionSample } from '../contracts';

/** Pure ride maths for achievements. Samples are 1 Hz. */

const G = 9.81, RHO = 1.2, CDA = 0.32, CRR = 0.005, BIKE_KG = 9;

/** Steady road speed (m/s) for `power` W on `gradePct`, bisected from P = v·m·g·(crr + grade) + ½ρCdA·v³. */
export function speedFor(power: number, gradePct: number, riderKg: number): number {
  const m = riderKg + BIKE_KG, slope = gradePct / 100;
  const f = (v: number) => v * m * G * (CRR + slope) + 0.5 * RHO * CDA * v * v * v - power;
  if (f(0.1) >= 0) return 0;      // too little power to roll (or flat and resting)
  let lo = 0.1, hi = 25;
  if (f(hi) < 0) return hi;       // steep descent: capped at 90 km/h
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (f(mid) < 0) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

/** Virtual distance (km) and climbing (m) for a ride: a flat road unless the trainer was in sim mode with a grade. */
export function virtualRide(samples: readonly SessionSample[], riderKg: number): { km: number; climbM: number } {
  let m = 0, climb = 0;
  for (const s of samples) {
    const grade = s.mode === 'sim' && s.grade != null ? s.grade : 0;
    const v = speedFor(Math.max(0, s.power), grade, riderKg);
    m += v;
    if (grade > 0) climb += v * grade / 100;
  }
  return { km: m / 1000, climbM: climb };
}

/** Best average of `key` over any `windowS` consecutive samples (0 if the ride is shorter). */
export function peakAvg(samples: readonly SessionSample[], windowS: number, key: 'power' | 'cadence' = 'power'): number {
  if (samples.length < windowS) return 0;
  let sum = 0, best = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i][key];
    if (i >= windowS) sum -= samples[i - windowS][key];
    if (i >= windowS - 1) best = Math.max(best, sum / windowS);
  }
  return best;
}

/** Longest run of consecutive samples meeting `pred`, in seconds. */
export function longestRun(samples: readonly SessionSample[], pred: (s: SessionSample) => boolean): number {
  let run = 0, best = 0;
  for (const s of samples) { run = pred(s) ? run + 1 : 0; if (run > best) best = run; }
  return best;
}

export const activeSeconds = (r: Readonly<SessionRecord>): number => r.samples.filter((s) => s.cadence > 20).length;

/** Variability index (normalized power / average power) over pedalling samples; 0 if too short to judge. */
export function variabilityIndex(samples: readonly SessionSample[]): number {
  const ps = samples.filter((s) => s.cadence > 20).map((s) => s.power);
  if (ps.length < 60) return 0;
  const avg = ps.reduce((a, b) => a + b, 0) / ps.length;
  if (avg <= 0) return 0;
  let sum = 0, acc4 = 0, n = 0;
  for (let i = 0; i < ps.length; i++) {
    sum += ps[i];
    if (i >= 30) sum -= ps[i - 30];
    if (i >= 29) { acc4 += (sum / 30) ** 4; n++; }
  }
  return (acc4 / n) ** 0.25 / avg;
}

// ---------- calendar (local time) ----------
/** Days since 1970-01-01 in the rider's local calendar. */
export function localDay(ms: number): number {
  const d = new Date(ms);
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
}
export const localHour = (ms: number): number => new Date(ms).getHours();
/** 0 = Sunday … 6 = Saturday (day 0, 1970-01-01, was a Thursday). */
export const weekday = (day: number): number => (((day + 4) % 7) + 7) % 7;
/** Monday-based week number. */
export const weekOf = (day: number): number => Math.floor((day + 3) / 7);

/** Consecutive weeks with a ride, ending at the week of the latest ride day. */
export function weekStreak(days: readonly number[]): number {
  if (!days.length) return 0;
  const weeks = new Set(days.map(weekOf));
  let w = weekOf(days[days.length - 1]), n = 0;
  while (weeks.has(w)) { n++; w--; }
  return n;
}

/** Add `day` to a sorted unique day list, keeping the most recent `keep`. */
export function addDay(days: readonly number[] | undefined, day: number, keep = 120): number[] {
  const s = new Set(days ?? []); s.add(day);
  return [...s].sort((a, b) => a - b).slice(-keep);
}

export const popcount = (n: number): number => { let c = 0; for (let x = n >>> 0; x; x &= x - 1) c++; return c; };
