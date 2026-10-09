import type { MediaTimeline, SectionKind, ZoneTarget } from '../../../contracts';
import { makeRng } from '../../../core/rng';

/**
 * The ride, built from the music (pure, deterministic). Everything is sampled on the program clock at `hz`.
 *  - Every section is a zone: new hue, a speed step, and an effort target.
 *  - Builds climb (real trainer grade), drops crest and dive (grade falls away, sprint target), breaks are flat.
 *  - Blocks sit on the song's hits; their colour follows hit strength × intensity; greys fill dense passages.
 */
export type Difficulty = 'casual' | 'pro' | 'elite';
export type Mode = 'mono' | 'classic';
export const DIFFICULTIES: readonly Difficulty[] = ['casual', 'pro', 'elite'];

export const DIFF: Record<Difficulty, { lanes: number; minGap: number; thr: number; grey: number; buildZone: 3 | 4; dropZone: 4 | 5; sprintS: number; holdZone: 3 | 4 }> = {
  casual: { lanes: 3, minGap: 0.36, thr: 0.35, grey: 0.05, buildZone: 3, dropZone: 4, sprintS: 10, holdZone: 3 },
  pro: { lanes: 3, minGap: 0.22, thr: 0.22, grey: 0.12, buildZone: 4, dropZone: 5, sprintS: 15, holdZone: 3 },
  elite: { lanes: 5, minGap: 0.11, thr: 0.12, grey: 0.18, buildZone: 4, dropZone: 5, sprintS: 20, holdZone: 4 },
};
/** ERG watts (FTP fraction) per effort phase, for the ERG option. */
export const ERG_FTP = { cruise: 0.65, climb: [0.75, 0.92], sprint: 1.12, hold: 0.88, recover: 0.5 } as const;
/** Lower bound of each power zone as an FTP fraction (Coggan, as core uses). */
export const ZONE_FLOOR = [0, 0, 0.56, 0.76, 0.91, 1.06] as const;
/** Block colours (purple → red) and their points. Grey = −1. */
export const COLOR_POINTS = [10, 20, 30, 50, 80] as const;
/** Seconds a build's helix takes (one full banked turn). */
export const HELIX_S = 9;
/** A drop's launch roll (s), and the block-free margin before / after it. */
export const LAUNCH = { s: 2.6, clearBefore: 0.6, clearAfter: 0.3 } as const;

export interface Block { t: number; lane: number; color: number; zone: number }
export interface Zone {
  n: number; kind: SectionKind; t0: number; t1: number; energy: number; hue: number; song: number;
  target: ZoneTarget; floorFtp: number;
  /** Drops: the sprint lasts until here (capped by difficulty); the rest of the drop is a lower hold. */
  sprintEnd?: number;
}
export type Phase = 'cruise' | 'climb' | 'sprint' | 'hold' | 'recover';
export interface Effort { phase: Phase; target: ZoneTarget; floorFtp: number; ergFtp: number; left: number }
export interface Track {
  durationS: number; hz: number; lanes: number;
  dist: Float64Array;   // metres travelled at each sample
  speed: Float32Array;  // m/s
  height: Float32Array; // visual track height (m, exaggerated by the renderer)
  grade: Float32Array;  // trainer grade % (before difficulty / hill scale)
  curve: Float32Array;  // heading (rad)
  zones: Zone[]; blocks: Block[];
  /** Bank (roll, rad; + = rolls right) per sample, and tunnel membership per sample (renderer only). */
  roll: Float32Array; tunnel: Uint8Array; tunnels: Array<{ t0: number; t1: number }>;
  /**
   * Set pieces: builds that spiral up a banked 360° helix (the coil you rode is below you), and every drop opens with
   * a launch: a 360° corkscrew roll on the drop with no blocks, where the rider punches it (rated by the sim).
   */
  stunts: Array<{ kind: 'helix' | 'launch'; t0: number; t1: number; zone: number }>;
  /** From the music, for the renderer's pulses and skyline (program seconds / curves at hz). */
  beats: number[]; downbeats: number[]; phrases: number[]; bands: [number[], number[], number[]]; intensity: number[];
}
export interface TrackOpts { difficulty: Difficulty; mode: Mode; seed: number; vBase?: number; maxGrade?: number }

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
export function hexHue(hex: string | undefined): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? ''); if (!m) return 200;
  const n = parseInt(m[1], 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return 200;
  const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return Math.round(h * 60);
}

function targetFor(kind: SectionKind, d: (typeof DIFF)[Difficulty]): ZoneTarget {
  // all power-based: sections are 10–60 s, far too short for heart rate to follow
  switch (kind) {
    case 'build': return { min: d.buildZone, max: (d.buildZone + 1) as 4 | 5, label: 'Climb', source: 'power' };
    case 'drop': return { min: d.dropZone, max: 5, label: 'Sprint!', source: 'power' };
    case 'break': case 'outro': return { min: 1, max: 2, label: 'Recover', source: 'power' };
    default: return { min: 2, max: 3, label: 'Cruise', source: 'power' };
  }
}

/** The effort asked for at program time p: drops sprint for at most `sprintS`, then hold a lower zone. */
export function effortAt(track: Track, p: number, difficulty: Difficulty): Effort {
  const z = track.zones[zoneIndexAt(track, p)], d = DIFF[difficulty];
  const prog = clamp((p - z.t0) / Math.max(1, z.t1 - z.t0), 0, 1);
  switch (z.kind) {
    case 'drop':
      if (p < (z.sprintEnd ?? z.t1)) return { phase: 'sprint', target: z.target, floorFtp: z.floorFtp, ergFtp: ERG_FTP.sprint, left: (z.sprintEnd ?? z.t1) - p };
      return { phase: 'hold', target: { min: d.holdZone, max: (d.holdZone + 1) as 4 | 5, label: 'Hold it', source: 'power' }, floorFtp: ZONE_FLOOR[d.holdZone], ergFtp: ERG_FTP.hold, left: z.t1 - p };
    case 'build': return { phase: 'climb', target: z.target, floorFtp: z.floorFtp, ergFtp: ERG_FTP.climb[0] + (ERG_FTP.climb[1] - ERG_FTP.climb[0]) * prog, left: z.t1 - p };
    case 'break': case 'outro': return { phase: 'recover', target: z.target, floorFtp: 0, ergFtp: ERG_FTP.recover, left: z.t1 - p };
    default: return { phase: 'cruise', target: z.target, floorFtp: z.floorFtp, ergFtp: ERG_FTP.cruise, left: z.t1 - p };
  }
}

export function sampleAt(arr: ArrayLike<number>, hz: number, p: number): number {
  if (!arr.length) return 0;
  const x = clamp(p * hz, 0, arr.length - 1), i = Math.floor(x), f = x - i;
  return i + 1 < arr.length ? arr[i] * (1 - f) + arr[i + 1] * f : arr[i];
}
export function zoneIndexAt(track: Track, p: number): number {
  const z = track.zones;
  let lo = 0, hi = z.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (z[m].t0 <= p) lo = m; else hi = m - 1; }
  return lo;
}

export function buildTrack(tl: MediaTimeline, o: TrackOpts): Track {
  const d = DIFF[o.difficulty], hz = tl.hz || 10, n = Math.max(2, Math.ceil(tl.durationS * hz) + 1);
  const rng = makeRng(o.seed * 101 + 7), maxGrade = o.maxGrade ?? 7, vBase = o.vBase ?? 26;
  const sections = tl.sections.length ? tl.sections : [{ t0: 0, t1: tl.durationS, kind: 'verse' as SectionKind, energy: 0.5 }];
  const songOf = (t: number) => Math.max(0, tl.songs.findIndex((s) => t >= s.t0 && t < s.t1));
  const zones: Zone[] = sections.map((s, i) => {
    const song = songOf(s.t0), base = hexHue(tl.songs[song]?.palette?.[0]);
    const target = targetFor(s.kind, d);
    return {
      n: i + 1, kind: s.kind, t0: s.t0, t1: s.t1, energy: s.energy, song, hue: (base + i * 47) % 360, target,
      floorFtp: target.min <= 1 ? 0 : ZONE_FLOOR[target.min], ...(s.kind === 'drop' ? { sprintEnd: Math.min(s.t1, s.t0 + d.sprintS) } : {}),
    };
  });
  const zoneAt = (p: number) => {
    let lo = 0, hi = zones.length;
    while (lo + 1 < hi) { const m = (lo + hi) >> 1; if (zones[m].t0 <= p) lo = m; else hi = m; }
    return lo;
  };

  const speed = new Float32Array(n), dist = new Float64Array(n), height = new Float32Array(n), grade = new Float32Array(n), curve = new Float32Array(n);
  const roll = new Float32Array(n), tunnel = new Uint8Array(n);
  const phase = rng() * Math.PI * 2, curvePhase = rng() * Math.PI * 2;
  // hard banks: every drop throws you into a near-sideways turn; some longer verses get a softer one.
  // Long builds spiral up a full banked helix; every drop opens with a launch roll (360° corkscrew) before its bank.
  const banks: Array<{ t0: number; dur: number; ang: number; yaw?: number }> = [];
  const rolls: Array<{ t0: number; dur: number; ang: number }> = [];
  const stunts: Track['stunts'] = [];
  let dir = rng() < 0.5 ? 1 : -1;
  zones.forEach((z, zi) => {
    const len = z.t1 - z.t0;
    if (z.kind === 'drop' && len > 6) {
      rolls.push({ t0: z.t0, dur: LAUNCH.s, ang: dir * Math.PI * 2 }); stunts.push({ kind: 'launch', t0: z.t0, t1: z.t0 + LAUNCH.s, zone: zi });
      banks.push({ t0: z.t0 + LAUNCH.s + 0.3, dur: 4.5, ang: dir * 1.15 }); dir = -dir;
    } else if (z.kind === 'build' && len >= HELIX_S + 4) {
      const t0 = z.t1 - HELIX_S - 1;
      banks.push({ t0, dur: HELIX_S, ang: dir * 0.75, yaw: (dir * Math.PI * 2) / (0.75 * HELIX_S) }); // the envelope integrates to 0.75 × dur
      stunts.push({ kind: 'helix', t0, t1: t0 + HELIX_S, zone: zi }); dir = -dir;
    } else if (z.kind === 'verse' && len > 20 && rng() < 0.6) { banks.push({ t0: z.t0 + len * (0.3 + 0.3 * rng()), dur: 3.5, ang: dir * (0.6 + 0.3 * rng()) }); dir = -dir; }
  });
  const env = (t: number, b: { t0: number; dur: number }) => {
    const u = (t - b.t0) / b.dur; if (u <= 0 || u >= 1) return 0;
    const e = u < 0.25 ? u / 0.25 : u > 0.75 ? (1 - u) / 0.25 : 1;
    return e * e * (3 - 2 * e);
  };
  const ease = (t: number, b: { t0: number; dur: number }) => { const u = clamp((t - b.t0) / b.dur, 0, 1); return u * u * (3 - 2 * u); };
  // tunnels: breaks always, some verses; never longer than 45 s
  const tunnels: Array<{ t0: number; t1: number }> = [];
  for (const z of zones) if ((z.kind === 'break' || (z.kind === 'verse' && rng() < 0.45)) && z.t1 - z.t0 >= 6) tunnels.push({ t0: z.t0, t1: Math.min(z.t1, z.t0 + 45) });
  let ema = 0, g = 0, h = 0, head = 0, x = 0;
  const intensity = (p: number) => sampleAt(tl.intensity, hz, p);
  for (let i = 0; i < n; i++) {
    const p = i / hz, k = zoneAt(p), z = zones[k], prog = clamp((p - z.t0) / Math.max(1, z.t1 - z.t0), 0, 1);
    ema += (intensity(p) - ema) * (i ? 1 - Math.exp(-1 / hz / 2) : 1);
    const v = vBase * (1 + 0.02 * Math.min(z.n - 1, 15)) * (0.85 + 0.3 * ema) * (z.kind === 'drop' ? 1.15 : 1);
    speed[i] = v;
    if (i) x += ((speed[i - 1] + v) / 2) / hz;
    dist[i] = x;
    // trainer grade by section kind, then a ~2 s ease so changes feel like terrain, not steps
    let want: number;
    switch (z.kind) {
      case 'build': want = 2 + (maxGrade - 2) * prog ** 1.2; break;
      case 'drop': want = prog * (z.t1 - z.t0) < 2 ? maxGrade * (1 - (prog * (z.t1 - z.t0)) / 2) * 0.5 : 0; break;
      case 'break': want = 0.5; break;
      case 'outro': want = 1.5 * (1 - prog); break;
      case 'intro': want = 1 + 0.8 * Math.sin(x / 90 + phase); break;
      default: want = 1.5 + 1.5 * Math.sin(x / 95 + phase);
    }
    g += (Math.max(0, want) - g) * (i ? 1 - Math.exp(-1 / hz / 2) : 1);
    grade[i] = Math.round(g * 100) / 100;
    // the visual track: climbs with the grade, dives in drops (downhill rush), rolls elsewhere
    let vis = z.kind === 'drop' ? -6 - 4 * ema : z.kind === 'build' ? g : g - 1.2;
    let r = 0, yaw = 0;
    for (const b of banks) {
      const e = env(p, b); if (!e) continue;
      r += b.ang * e; yaw += (b.yaw ?? Math.sign(b.ang) * 0.4) * e;
      if (b.yaw) vis = Math.max(vis, 5 * e); // a helix climbs steeply enough to clear the coil below
    }
    for (const c of rolls) r += c.ang * ease(p, c);
    roll[i] = r;
    if (i) h += (vis / 100) * (((speed[i - 1] + v) / 2) / hz);
    height[i] = h;
    tunnel[i] = tunnels.some((tu) => p >= tu.t0 && p < tu.t1) ? 1 : 0;
    head += (0.0009 * Math.sin(x / 260 + curvePhase) + 0.0006 * Math.sin(x / 97 + 2 * curvePhase) * (0.5 + ema)) * (v / hz) + yaw / hz;
    curve[i] = head;
  }

  // blocks from hits
  const blocks: Block[] = [];
  const launches = stunts.filter((s) => s.kind === 'launch');
  const onsets = tl.onsets.filter((s) => s.s >= d.thr && s.t > 2 && s.t < tl.durationS - 1
    && !launches.some((l) => s.t > l.t0 - LAUNCH.clearBefore && s.t < l.t1 + LAUNCH.clearAfter)); // launches are block-free: just punch it
  const half = (d.lanes - 1) / 2;
  let lastT = -1, lane = 0;
  for (const s of onsets) {
    if (s.t - lastT < d.minGap) continue;
    const target = s.band === 0 ? 0 : s.band === 1 ? (rng() < 0.5 ? -1 : 1) : (rng() < 0.5 ? -half : half);
    lane = Math.round(clamp(lane + (target - lane) * 0.6 + (rng() - 0.5) * 1.4, -half, half));
    const c = Math.floor(clamp(0.45 * s.s + 0.55 * intensity(s.t), 0, 0.999) * 5);
    blocks.push({ t: Math.round(s.t * 1000) / 1000, lane, color: c, zone: zoneAt(s.t) });
    lastT = s.t;
  }
  // greys in dense passages (mono): never two in a row, never in a lane the previous block needs
  if (o.mode === 'mono') {
    for (let i = 2; i < blocks.length - 1; i++) {
      const dens = 2 / Math.max(0.05, blocks[i + 1].t - blocks[i - 1].t);
      if (blocks[i - 1].color < 0) continue;
      if (rng() < d.grey * clamp(dens / 3, 0.3, 2.5)) {
        blocks[i].color = -1;
        // fair greys: never in the lane of the block just before or just after (there's always a free lane)
        const used = new Set([blocks[i - 1].lane, blocks[i + 1].lane]);
        if (used.has(blocks[i].lane)) {
          const free: number[] = [];
          for (let l = -half; l <= half; l++) if (!used.has(l)) free.push(l);
          if (free.length) blocks[i].lane = free.sort((a, b) => Math.abs(a - blocks[i].lane) - Math.abs(b - blocks[i].lane))[0];
          else blocks[i].color = blocks[i - 1].color; // nowhere fair to put it: keep it a normal block
        }
      }
    }
  }
  return {
    durationS: tl.durationS, hz, lanes: d.lanes, dist, speed, height, grade, curve, zones, blocks, roll, tunnel, tunnels, stunts,
    beats: tl.beats, downbeats: tl.downbeats, phrases: tl.phrases, bands: tl.bands, intensity: tl.intensity,
  };
}

/** Rough training load of riding a track at its targets (for the picker): TSS-ish and minutes per zone. */
export function rateTrack(track: Track): { stars: number; tss: number; blocksPerMin: number; greyPct: number; minutesZ4: number } {
  const want: Record<SectionKind, number> = { intro: 0.62, verse: 0.65, build: 0.86, drop: 1.1, break: 0.5, outro: 0.55 };
  let f4 = 0, t = 0, z4 = 0;
  for (const z of track.zones) { const dt = z.t1 - z.t0, f = want[z.kind] * (z.floorFtp >= 0.91 ? 1.04 : 1); f4 += f ** 4 * dt; t += dt; if (z.floorFtp >= 0.91) z4 += dt; }
  const IF = t ? (f4 / t) ** 0.25 : 0, hours = t / 3600;
  const tss = Math.round(hours * IF * IF * 100);
  const bpm = track.blocks.length / Math.max(1, track.durationS / 60);
  const greys = track.blocks.filter((b) => b.color < 0).length;
  const score = clamp((IF - 0.6) / 0.35, 0, 1) * 0.6 + clamp(bpm / 120, 0, 1) * 0.4;
  return { stars: Math.max(1, Math.min(5, Math.round(1 + score * 4))), tss, blocksPerMin: Math.round(bpm), greyPct: Math.round((100 * greys) / Math.max(1, track.blocks.length)), minutesZ4: Math.round(z4 / 6) / 10 };
}

/** Publish newly analyzed road ahead without changing collected blocks or the ridden path. */
export function extendTrack(old: Track, next: Track, fromS: number): Track {
  const cut = Math.min(old.dist.length - 1, Math.max(0, Math.ceil(fromS * old.hz)));
  if (!cut) return next;
  const at = cut / old.hz;
  const distOffset = old.dist[cut] - next.dist[cut], heightOffset = old.height[cut] - next.height[cut], curveOffset = old.curve[cut] - next.curve[cut];
  for (let i = cut; i < next.dist.length; i++) {
    next.dist[i] += distOffset; next.height[i] += heightOffset; next.curve[i] += curveOffset;
    const f = Math.min(1, (i - cut) / (3 * old.hz));
    for (const key of ['speed', 'grade', 'roll'] as const) next[key][i] = old[key][cut] * (1 - f) + next[key][i] * f;
  }
  for (const key of ['dist', 'speed', 'height', 'grade', 'curve', 'roll', 'tunnel'] as const) next[key].set(old[key].subarray(0, cut));
  const before = old.zones.filter((z) => z.t0 < at).map((z) => ({ ...z, t1: Math.min(z.t1, at) }));
  next.zones = [...before, ...next.zones.filter((z) => z.t1 > at).map((z) => ({ ...z, t0: Math.max(z.t0, at) }))].map((z, n) => ({ ...z, n }));
  next.blocks = [...old.blocks.filter((b) => b.t < at), ...next.blocks.filter((b) => b.t >= at)].map((b) => ({ ...b, zone: zoneIndexAt(next, b.t) }));
  next.stunts = [...old.stunts.filter((s) => s.t0 < at), ...next.stunts.filter((s) => s.t0 >= at)].map((s) => ({ ...s, zone: zoneIndexAt(next, s.t0) }));
  next.tunnels = [...old.tunnels.filter((s) => s.t0 < at).map((s) => ({ ...s, t1: Math.min(s.t1, at) })), ...next.tunnels.filter((s) => s.t1 > at).map((s) => ({ ...s, t0: Math.max(s.t0, at) }))];
  for (const key of ['beats', 'downbeats', 'phrases'] as const) next[key] = [...old[key].filter((t) => t < at), ...next[key].filter((t) => t >= at)];
  for (let i = 0; i < cut; i++) {
    next.intensity[i] = old.intensity[i];
    for (let b = 0; b < 3; b++) next.bands[b][i] = old.bands[b][i];
  }
  return next;
}
