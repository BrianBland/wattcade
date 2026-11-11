import type { GameContext, GameHud, GameSim, Seconds } from '../../../contracts';
import { makeTerrain, type BiomeId, type Terrain } from '../../warmup/sim/terrain';
import { chaserFor, MEDAL_FTP, pieceTitle, TOURS, type ChaserKind, type PieceKind, type Tour, type TourSet } from './tour';
import { bumpH, takesOff } from './track';
import { leapRange, loopExit, loopRadius, loopSpeed, MEDAL_NAMES, medalFor, powerZone, smashCount, spool, targetSpeed, type Medal } from './physics';

export interface FullSendOpts { seed?: number; tour?: string; terrainSeed?: number }

export type Phase = 'warmup' | 'approach' | 'effort' | 'payoff' | 'recovery' | 'cooldown' | 'done';
/** How the bike is moving right now. */
export type Mode = 'road' | 'hop' | 'air' | 'fall' | 'rescue' | 'smash' | 'bounce' | 'loop' | 'drop' | 'tow';

/** One set piece on the road. `x0` is where it starts (ramp lip, wall face, loop entry, water's edge). */
export interface PieceView {
  kind: PieceKind; biome: BiomeId; title: string; finale: boolean;
  x0: number;
  /** leap: gap width · smash: wall length · loop: radius · dive: tunnel length · outrun: 0. */
  len: number;
  n: number; spacing: number; count: number; hitAt: number[]; toppledAt: number;
  chaser: ChaserKind; gap: number; caught: number; caughtAt: number;
  air: number; surfaced: boolean;
  /** Live score as an FTP fraction (built-up speed, or the mean so far for dive/outrun). */
  live: number;
  medal: Medal | -1;
  th: [number, number, number];
}
export interface SetResult { kind: PieceKind; biome: BiomeId; title: string; medal: Medal; detail: string }

export interface FullSendSnapshot {
  t: number; tour: string; tourName: string;
  phase: Phase; phaseT: number; phaseS: number;
  setIndex: number; setCount: number;
  x: number; y: number; v: number; pitch: number; mode: Mode; camX: number;
  hill: number; grade: number; terrainSeed: number; stretch: number; maxGrade: number; bumpScale: number;
  biome: BiomeId; from: BiomeId; to: BiomeId; mix: number;
  piece: PieceView | null;
  next: { kind: PieceKind; title: string; biome: BiomeId; inS: number } | null;
  speedPerFtp: number; ftpFrac: number;
  trick: { name: string; age: number } | null; style: number;
  last: (SetResult & { age: number }) | null;
  results: SetResult[];
  topKph: number; longestJumpM: number; airS: number; smashed: number; rodeM: number;
  /** 0..1 hay/debris stuck to the rider after a smash. */
  hay: number;
  /** Last landing off a hop (sim time) and how hard it was (m/s); hops so far. */
  landAt: number; landImpact: number; hops: number;
  hooks: Record<string, unknown>;
}

const TRICKS = ['No-Hander', 'Superman', 'Can-Can', 'Backflip', 'Seat Grab', 'Heel Clicker'];
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Full Send: a rocket-bike sprint workout. A fixed tour of set pieces; each one is a sprint, recoveries in between. */
export function createFullSendSim(ctx: GameContext, opts: FullSendOpts = {}): GameSim & { snapshot(): FullSendSnapshot } {
  const T = ctx.tuning;
  const tun = {
    kmhPerFtp: T.num('kmhPerFtp', 200, 80, 400, 10, 'Rocket speed (km/h) at 1.0 FTP; speed is linear in power'),
    spoolS: T.num('spoolS', 2.5, 0.5, 8, 0.25, 'Seconds for the rocket to spool toward the speed your power asks for'),
    cruiseCap: T.num('cruiseCap', 0.85, 0.5, 1.5, 0.05, 'Outside sprints, power above this FTP fraction adds no speed (recovery stays recovery)'),
    approachS: T.num('approachS', 20, 5, 60, 1, 'Seconds of warning before each sprint'),
    tourScale: T.num('tourScale', 1, 0.1, 2, 0.05, 'Scales warm-up, recovery and cool-down lengths (not the sprints)'),
    gravity: T.num('gravity', 80, 9.8, 160, 1, 'Game gravity (m/s²) for leaps'),
    launchDeg: T.num('launchDeg', 35, 15, 55, 1, 'Ramp angle at the canyon lip'),
    slowMo: T.num('slowMo', 0.45, 0.15, 1, 0.05, 'Slow-motion factor for leaps, loops and smashes'),
    smashN: T.num('smashN', 36, 3, 60, 1, 'Hay-bale columns (or crates, stalls…) in a smash wall'),
    smashHoldS: T.num('smashHoldS', 6, 0, 20, 0.5, 'Seconds the debris stuck to you keeps dragging after a smash'),
    loopGravity: T.num('loopGravity', 36, 6, 120, 1, 'Gravity in loops (lower = bigger loop, longer ride round it)'),
    loopSlowMo: T.num('loopSlowMo', 0.6, 0.2, 1, 0.05, 'Slow-motion factor in loops (stretches the ride round so the trainer grade can follow)'),
    chaseGap: T.num('chaseGap', 18, 5, 60, 1, 'Starting gap (m) to whatever is chasing you in an Outrun'),
    chaseMaxGap: T.num('chaseMaxGap', 24, 10, 80, 1, 'It never falls further behind than this (m), so it stays on screen'),
    airMargin: T.num('airMargin', 1.08, 1, 1.5, 0.01, 'Dive air supply relative to the time a bronze pace needs'),
    hillStretch: T.num('hillStretch', 6, 1, 20, 0.5, 'Horizontal stretch of the warm-up hills at rocket speed'),
    maxGrade: T.num('maxGrade', 3, 0, 8, 0.5, 'Steepest cruising grade %, sent to the trainer in sim mode'),
    hillFadeS: T.num('hillFadeS', 3, 0.5, 10, 0.5, 'Seconds to flatten the road before a set piece (and bring the hills back after)'),
    runupGrade: T.num('runupGrade', 1, -2, 6, 0.5, 'Grade % during a sprint run-up (gears supply the rest)'),
    loopGrade: T.num('loopGrade', 5, 0, 10, 0.5, 'Grade % the trainer climbs to at the end of a loop run-up and in the loop'),
    airGrade: T.num('airGrade', -2, -5, 2, 0.5, 'Grade % while airborne (light legs)'),
    bumps: T.bool('bumps', true, 'Rollers and kickers on the cruising road (hop off them at speed)'),
    bumpScale: T.num('bumpScale', 1.8, 0, 4, 0.1, 'Height of the rollers and kickers'),
    hopGravity: T.num('hopGravity', 30, 5, 80, 1, 'Gravity for hops off bumps: lower = more airtime, and you take off at lower speeds'),
    slopeGravity: T.num('slopeGravity', 15, 0, 40, 1, 'How much slopes speed you up or slow you down on top of your power (m/s² per unit slope)'),
    hopAirGradeS: T.num('hopAirGradeS', 0.8, 0.2, 3, 0.1, 'Hops longer than this (s) ease the trainer to the airtime grade'),
    smashGrade: T.num('smashGrade', 3, 0, 8, 0.5, 'Grade % while plowing through a wall'),
    diveGrade: T.num('diveGrade', 2, 0, 8, 0.5, 'Extra grade % underwater (water drag)'),
    blendS: T.num('blendS', 8, 1, 30, 1, 'Seconds the scenery takes to dissolve into the next biome'),
  };
  const th: Record<PieceKind, () => [number, number, number]> = {} as never;
  for (const k of Object.keys(MEDAL_FTP) as PieceKind[]) {
    const [b, s, g] = MEDAL_FTP[k];
    const fb = T.num(`${k}Bronze`, b, 0.5, 3, 0.05, `${k}: FTP fraction for bronze`);
    const fs = T.num(`${k}Silver`, s, 0.5, 3, 0.05, `${k}: FTP fraction for silver`);
    const fg = T.num(`${k}Gold`, g, 0.5, 3, 0.05, `${k}: FTP fraction for gold`);
    th[k] = () => [fb(), fs(), fg()];
  }

  const tour: Tour = TOURS[opts.tour ?? 'classic'] ?? TOURS.classic;
  const terrainSeed = opts.terrainSeed ?? Math.floor(ctx.rng() * 1e9);
  let maxGrade = tun.maxGrade();
  let terrain: Terrain = makeTerrain(terrainSeed, maxGrade);
  ctx.resistance.useVirtualGears(true);

  // ---- state ----
  let phase: Phase = 'warmup', phaseT = 0, setIndex = -1;
  let x = 0, y = 0, v = 0, vx = 0, vy = 0, pitch = 0, mode: Mode = 'road', modeT = 0, camX = 0;
  let hill = 1, grade = 0, frac = 0;
  let cur: BiomeId = tour.sets[0].biome, next: BiomeId = cur, mix = 0;
  let piece: PieceView | null = null;
  let fracSum = 0, fracN = 0;
  let loopV0 = 0, loopPhi = 0, loopDir = 1, loopOff: ReturnType<typeof loopExit> = null;
  let fallFromX = 0, fallFromY = 0, rescueToX = 0;
  let trick: { name: string; t0: number } | null = null, trickCount = 0, style = 0;
  let last: (SetResult & { at: number }) | null = null;
  const results: SetResult[] = [];
  let top = 0, longestJump = 0, airS = 0, smashed = 0, launchX = 0;
  /** 0..1 debris (hay) stuck to the rider after a smash; it drags (trainer grade) until it falls off. */
  let hay = 0;
  let hopT0 = 0, hopAir = 0, hops = 0, longestHop = 0, landAt = -99, landImpact = 0;
  let pendingMedal: Medal = 0;

  const scale = () => tun.tourScale();
  const set = (): TourSet | null => (setIndex >= 0 && setIndex < tour.sets.length ? tour.sets[setIndex] : null);
  const speedPerFtp = () => tun.kmhPerFtp() / 3.6;
  const roadH = (xx: number) => hill * (terrain.elev(xx / tun.hillStretch()) * tun.hillStretch() + (tun.bumps() ? tun.bumpScale() * bumpH(xx, terrainSeed) : 0));
  const slopeAt = (xx: number) => (roadH(xx + 0.25) - roadH(xx - 0.25)) / 0.5;
  const curvAt = (xx: number) => (roadH(xx + 0.5) - 2 * roadH(xx) + roadH(xx - 0.5)) / 0.25;
  const phaseS = (): number => {
    const s = set();
    switch (phase) {
      case 'warmup': return tour.warmupS * scale();
      case 'approach': return tun.approachS();
      case 'effort': return s?.effortS ?? 0;
      case 'recovery': return (s?.recoveryS ?? 0) * scale();
      case 'cooldown': return tour.cooldownS * scale();
      default: return 0;
    }
  };
  const go = (p: Phase) => { phase = p; phaseT = 0; };
  const setMode = (m: Mode) => { mode = m; modeT = 0; };
  /** Features reached at the end of the sprint ride toward you at your own speed, so the sprint lasts exactly `effortS`. */
  const atEnd = (kind: PieceKind) => kind === 'smash' || kind === 'leap' || kind === 'loop';

  /** Grade round a loop: climbs to `loopGrade` at the top, then eases off to the airtime grade on the way down. */
  function loopGradeAt(phi: number): number {
    const u = ((phi % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return u <= Math.PI ? tun.runupGrade() + (tun.loopGrade() - tun.runupGrade()) * (u / Math.PI)
      : tun.loopGrade() + (tun.airGrade() - tun.loopGrade()) * ((u - Math.PI) / Math.PI);
  }

  function startSet(i: number) {
    setIndex = i;
    const s = tour.sets[i], t = th[s.kind]();
    const g = tun.gravity(), vB = targetSpeed(t[0], speedPerFtp()) * 0.97;
    const len = s.kind === 'leap' ? leapRange(vB, tun.launchDeg(), g)
      : s.kind === 'loop' ? loopRadius(vB, tun.loopGravity())
        : s.kind === 'dive' ? vB * s.effortS
          : s.kind === 'smash' ? (tun.smashN() - 1) * 2.4 + 4 : 0;
    piece = {
      kind: s.kind, biome: s.biome, title: pieceTitle(s.kind, s.biome), finale: !!s.finale,
      x0: x + 1e4, len, n: s.kind === 'smash' ? Math.round(tun.smashN()) : 0, spacing: 2.4, count: 0, hitAt: [], toppledAt: -1,
      chaser: chaserFor(s.biome), gap: tun.chaseGap(), caught: 0, caughtAt: -99, air: 1, surfaced: false,
      live: 0, medal: -1, th: t,
    };
    fracSum = 0; fracN = 0;
    go('approach');
  }

  function finishPiece(medal: Medal, detail: string) {
    if (!piece) return;
    piece.medal = medal;
    const r: SetResult = { kind: piece.kind, biome: piece.biome, title: piece.title, medal, detail };
    results.push(r); last = { ...r, at: ctx.clock.now() };
    ctx.emit({ type: 'setPiece', data: { kind: piece.kind, biome: piece.biome, medal, finale: piece.finale } });
  }

  function endPayoff() {
    setMode('road');
    const s = set();
    if (!s || s.finale || setIndex >= tour.sets.length - 1) go('cooldown');
    else go('recovery');
  }

  /** The moment a reach-it-at-the-end feature arrives: switch to its payoff. */
  function arrive() {
    if (!piece) return;
    piece.x0 = x;
    const live = v / speedPerFtp();
    piece.live = live;
    const medal = medalFor(live / 0.97, piece.th);
    go('payoff');
    if (piece.kind === 'leap') {
      const a = (tun.launchDeg() * Math.PI) / 180;
      vx = v * Math.cos(a); vy = v * Math.sin(a); launchX = x; setMode('air');
      pendingMedal = medal;
    } else if (piece.kind === 'smash') {
      piece.count = smashCount(live / 0.97, piece.th, piece.n);
      pendingMedal = medal; setMode('smash');
    } else if (piece.kind === 'loop') {
      loopV0 = v; loopPhi = 0; loopDir = 1; loopOff = loopExit(v, piece.len, tun.loopGravity());
      pendingMedal = loopOff ? 0 : medal; setMode('loop');
    }
  }
  function payoff(dt: Seconds, now: number) {
    if (!piece) { endPayoff(); return; }
    const g = tun.gravity(), sm = tun.slowMo(), dts = dt * sm;
    modeT += dt;
    if (piece.kind === 'leap') {
      const far = piece.x0 + piece.len;
      if (mode === 'air') {
        x += vx * dts; y += vy * dts; vy -= g * dts; airS += dt;
        pitch = Math.atan2(vy, vx);
        if (y <= 0 && x >= far) { // landed on the far rim
          y = 0; v = Math.hypot(vx, vy) * 0.9; pitch = 0; longestJump = Math.max(longestJump, x - launchX);
          if (trick) { if (now - trick.t0 >= 0.9) style++; trick = null; }
          finishPiece(pendingMedal, `${Math.round(x - launchX)} m`);
          setMode('road');
          piece.surfaced = true; // reused as "landed"
        } else if (y < 0 && x < far) { setMode('fall'); }
      } else if (mode === 'fall') {
        x += vx * dts * 0.3; y += vy * dts; vy -= g * dts; pitch += dt * 4;
        if (y < -9 || modeT > 2) { fallFromX = x; fallFromY = y; rescueToX = far + 10; setMode('rescue'); trick = null; }
      } else if (mode === 'rescue') {
        const k = clamp(modeT / 2.6, 0, 1);
        x = fallFromX + (rescueToX - fallFromX) * k;
        y = fallFromY * (1 - k) + Math.sin(k * Math.PI) * 30;
        pitch = Math.sin(modeT * 6) * 0.4;
        if (k >= 1) { y = 0; pitch = 0; v = targetSpeed(tun.cruiseCap(), speedPerFtp()) * 0.5; finishPiece(0, 'rescued'); endPayoff(); return; }
      } else { // rolling away after landing
        x += v * dt; y = 0;
        if (modeT > 1.2) endPayoff();
      }
      return;
    }
    if (piece.kind === 'smash') {
      const wallEnd = piece.x0 + (piece.n - 1) * piece.spacing;
      if (mode === 'smash') {
        x += v * dts * 0.6;
        for (let i = piece.hitAt.length; i < piece.count; i++) {
          if (x >= piece.x0 + i * piece.spacing) { piece.hitAt.push(now); smashed++; hay = Math.min(1, hay + 0.07); } else break;
        }
        if (piece.count < piece.n && x >= piece.x0 + piece.count * piece.spacing - 1.2) {
          x = piece.x0 + piece.count * piece.spacing - 1.2; setMode('bounce');
        } else if (x > wallEnd + 3) {
          finishPiece(pendingMedal, `${piece.count}/${piece.n}`); setMode('road'); piece.surfaced = true;
        }
      } else if (mode === 'bounce') {
        if (modeT < 0.5) { x -= 8 * dt; y = Math.sin((modeT / 0.5) * Math.PI) * 2; } else y = 0;
        if (modeT >= 1.4 && piece.toppledAt < 0) piece.toppledAt = now;
        if (modeT >= 2.4) { v = 0; finishPiece(pendingMedal, `${piece.count}/${piece.n}`); endPayoff(); }
      } else {
        x += v * dt;
        if (modeT > 0.8) endPayoff();
      }
      return;
    }
    if (piece.kind === 'loop') {
      const R = piece.len, g = tun.loopGravity(), dts = dt * tun.loopSlowMo();
      if (mode === 'loop') {
        const sp = Math.max(loopSpeed(loopV0, R, g, loopPhi), loopOff?.slide ? 2 : 3);
        loopPhi += (loopDir * sp / R) * dts;
        if (!loopOff && loopPhi >= Math.PI * 2) {
          loopPhi = 0; x = piece.x0; y = 0; v = loopV0;
          finishPiece(pendingMedal, 'all the way round'); setMode('road'); piece.surfaced = true;
        } else if (loopOff && !loopOff.slide && loopPhi >= loopOff.angle) {
          vy = 0; setMode('drop');
        } else if (loopOff?.slide && loopDir > 0 && (loopPhi >= loopOff.angle || sp < 0.5)) {
          loopDir = -1;
        } else if (loopDir < 0 && loopPhi <= 0) {
          loopPhi = 0; v = loopV0 * 0.3; finishPiece(0, 'rolled back'); endPayoff(); return;
        }
        if (mode === 'loop') { x = piece.x0 + R * Math.sin(loopPhi); y = R * (1 - Math.cos(loopPhi)); pitch = loopPhi; }
      } else if (mode === 'drop') {
        vy -= g * dts; y += vy * dts; pitch += dt * 5;
        if (y <= 0) { y = 0; pitch = 0; v = loopV0 * 0.35; x = piece.x0 + R + 4; finishPiece(0, 'foam pit'); endPayoff(); }
      } else {
        x += v * dt;
        if (modeT > 0.8) endPayoff();
      }
      return;
    }
    if (piece.kind === 'dive') {
      if (modeT > 1.5) endPayoff();
      return;
    }
    if (piece.kind === 'outrun') {
      piece.gap += v * dt; // the chaser trips and gives up
      if (modeT > 3) endPayoff();
    }
  }

  const sim = {
    update(dt: Seconds) {
      const now = ctx.clock.now();
      if (phase === 'done') return;
      if (tun.maxGrade() !== maxGrade) { maxGrade = tun.maxGrade(); terrain = makeTerrain(terrainSeed, maxGrade); }
      const bike = ctx.bike(), input = ctx.input();
      frac = Math.max(0, bike.ftpFraction || 0);
      phaseT += dt;
      const s = set();

      // hills flatten for set pieces and come back for the cruise
      const wantHill = phase === 'warmup' || phase === 'recovery' || phase === 'cooldown' ? 1 : 0;
      const hs = dt / tun.hillFadeS();
      hill = wantHill > hill ? Math.min(1, hill + hs) : Math.max(0, hill - hs);

      // speed: sprint power counts only while sprinting; recovery is capped
      const pf = phase === 'effort' ? frac : Math.min(frac, tun.cruiseCap());
      if (phase !== 'payoff' || mode === 'road' || mode === 'hop') v = spool(v, targetSpeed(pf, speedPerFtp()), dt, tun.spoolS());

      // phase machine
      if (phase === 'warmup') {
        if (phaseT >= phaseS()) startSet(0);
      } else if (phase === 'approach' && s && piece) {
        piece.x0 = atEnd(s.kind) ? x + v * (phaseS() - phaseT + s.effortS) : x + v * (phaseS() - phaseT);
        if (phaseT >= phaseS()) {
          go('effort');
          if (s.kind === 'dive') piece.x0 = x;
          if (s.kind === 'outrun') { piece.gap = tun.chaseGap(); piece.x0 = x; }
        }
      } else if (phase === 'effort' && s && piece) {
        fracSum += Math.min(frac, 2.5); fracN++;
        if (atEnd(s.kind)) {
          piece.live = v / speedPerFtp();
          piece.x0 = x + v * Math.max(0, phaseS() - phaseT);
          if (phaseT >= phaseS()) arrive();
        } else if (s.kind === 'dive') {
          piece.live = fracSum / fracN;
          const airS = (piece.len / (targetSpeed(piece.th[0], speedPerFtp()) * 0.97)) * tun.airMargin();
          piece.air = Math.max(0, 1 - phaseT / airS);
          if (x >= piece.x0 + piece.len) {
            piece.surfaced = true;
            finishPiece(medalFor(piece.live, piece.th), `${Math.round(piece.air * 100)}% air left`);
            go('payoff'); setMode('road');
          } else if (piece.air <= 0) {
            setMode('tow'); go('payoff');
          }
        } else if (s.kind === 'outrun') {
          piece.live = fracSum / fracN;
          const vChase = targetSpeed(piece.th[0], speedPerFtp()) * 0.97;
          piece.gap = Math.min(tun.chaseMaxGap(), piece.gap + (v - vChase) * dt);
          if (piece.gap <= 0) { piece.caught++; piece.caughtAt = now; piece.gap = 25; v *= 0.6; }
          if (phaseT >= phaseS()) {
            const m = medalFor(piece.live, piece.th);
            finishPiece(piece.caught ? (Math.min(m, 1) as Medal) : m, piece.caught ? `caught ${piece.caught}×` : `${Math.round(piece.gap)} m clear`);
            piece.surfaced = true; go('payoff'); setMode('road');
          }
        }
      } else if (phase === 'payoff') {
        if (piece?.kind === 'dive' && mode === 'tow') {
          modeT += dt;
          const end = piece.x0 + piece.len, k = clamp(modeT / 3, 0, 1);
          x += (end - x) * Math.min(1, k * 0.5 + dt * 2);
          if (k >= 1) { x = end; piece.surfaced = true; finishPiece(0, 'turtle tow'); setMode('road'); v = targetSpeed(0.5, speedPerFtp()); }
        } else payoff(dt, now);
      } else if (phase === 'recovery') {
        const nx = tour.sets[setIndex + 1];
        if (nx && nx.biome !== cur) {
          next = nx.biome;
          if (phaseT >= phaseS() * 0.25) mix = Math.min(1, mix + dt / tun.blendS());
          if (mix >= 1) { cur = next; mix = 0; ctx.emit({ type: 'biomeReached', data: { biome: cur } }); }
        }
        if (phaseT >= phaseS()) { if (mix > 0) { cur = next; mix = 0; } startSet(setIndex + 1); }
      } else if (phase === 'cooldown') {
        if (phaseT >= phaseS()) { go('done'); ctx.emit({ type: 'tourComplete', data: { tour: tour.id } }); }
      }

      // movement on the road
      // (leap, smash and loop payoffs move the bike themselves)
      const selfMoving = phase === 'payoff' && !!piece && atEnd(piece.kind);
      if (!selfMoving && (mode === 'road' || mode === 'hop')) {
        x += v * dt;
        const ground = roadH(x), slope = slopeAt(x), gH = tun.hopGravity();
        if (mode === 'road') {
          if (v > 5 && takesOff(v, curvAt(x), gH)) { setMode('hop'); vy = v * slope; hopT0 = now; y = ground; }
          else { y = ground; pitch = Math.atan(slope); v = Math.max(0, v - tun.slopeGravity() * slope * dt); }
        }
        if (mode === 'hop') {
          vy -= gH * dt; y += vy * dt; pitch = Math.atan2(vy, Math.max(1, v));
          if (y <= ground) {
            const rel = vy - v * slope; // how hard you hit, relative to the slope you land on
            y = ground; landAt = now; landImpact = -rel;
            if (trick && now - trick.t0 >= 0.9) { style++; trick = null; }
            hopAir += now - hopT0; hops++; longestHop = Math.max(longestHop, now - hopT0);
            if (rel < -7) { vy = v * slope - rel * 0.22; hopT0 = now; } // a little bounce off a flat landing
            else { setMode('road'); pitch = Math.atan(slope); }
          }
        }
      }
      camX = phase === 'payoff' && piece?.kind === 'loop' && (mode === 'loop' || mode === 'drop') ? piece.x0 : x;

      // mid-air tricks (optional): A while airborne
      const airborne = mode === 'air' || mode === 'hop';
      if (airborne && input.pressed.has('a') && !trick) { trick = { name: TRICKS[trickCount % TRICKS.length], t0: now }; trickCount++; }
      if (!airborne && mode !== 'fall' && trick && now - trick.t0 > 0.9) trick = null;

      // trainer grade
      let gr = hill * terrain.grade(x / tun.hillStretch());
      if (phase === 'effort' && s) {
        if (s.kind === 'loop') gr = tun.runupGrade() + (tun.loopGrade() - tun.runupGrade()) * clamp((phaseT / phaseS() - 0.6) / 0.4, 0, 1);
        else if (s.kind === 'dive') gr = tun.diveGrade();
        else gr = tun.runupGrade();
      } else if (phase === 'payoff') {
        gr = mode === 'air' ? tun.airGrade() : mode === 'smash' || mode === 'bounce' ? tun.smashGrade() + 2 * hay
          : mode === 'loop' ? loopGradeAt(loopPhi) : mode === 'road' ? gr : 0;
      }
      if (mode === 'hop' && now - hopT0 > tun.hopAirGradeS()) gr = tun.airGrade(); // a long hop: light legs
      // debris stuck to you after a smash keeps dragging until it falls off
      if (mode !== 'smash' && mode !== 'bounce' && hay > 0) {
        if (!(phase === 'payoff' && mode === 'air')) gr += tun.smashGrade() * hay;
        hay = Math.max(0, hay - dt / Math.max(0.5, tun.smashHoldS()));
      }
      grade = +gr.toFixed(1);
      ctx.resistance.set({ id: 'terrain', mode: 'sim', gradePct: grade });

      top = Math.max(top, v);
      ctx.debug('fullsend.phase', phase); ctx.debug('fullsend.kph', +(v * 3.6).toFixed(0)); ctx.debug('fullsend.grade', grade);
      if (piece) ctx.debug('fullsend.live', +piece.live.toFixed(2));
    },
    hud(): GameHud {
      const s = set();
      const controls: GameHud['controls'] = [{ button: 'a', label: 'Trick (in the air)', shortLabel: 'Trick', active: mode === 'air' }];
      const base = { gears: true, controls, touchControls: ['a'] as GameHud['touchControls'] };
      if (phase === 'effort' && s && piece) {
        return { ...base, targetZone: { min: powerZone(piece.th[0]), max: 5, label: piece.title, source: 'power' } };
      }
      if (phase === 'approach' && piece) return { ...base, targetZone: { min: 1, max: 3, label: `Get ready: ${piece.title}` } };
      if (phase === 'warmup') return { ...base, targetZone: { min: 1, max: 2, label: 'Warm-up' } };
      return { ...base, targetZone: { min: 1, max: 2, label: phase === 'cooldown' || phase === 'done' ? 'Cool-down' : 'Recover' } };
    },
    snapshot(): FullSendSnapshot {
      const now = ctx.clock.now();
      const nx = phase === 'warmup' ? tour.sets[0] : phase === 'recovery' ? tour.sets[setIndex + 1] : null;
      const nextInfo = phase === 'approach' && piece ? { kind: piece.kind, title: piece.title, biome: piece.biome, inS: phaseS() - phaseT }
        : nx ? { kind: nx.kind, title: pieceTitle(nx.kind, nx.biome), biome: nx.biome, inS: phaseS() - phaseT + tun.approachS() } : null;
      return {
        t: now, tour: tour.id, tourName: tour.name, phase, phaseT, phaseS: phaseS(), setIndex, setCount: tour.sets.length,
        x, y, v, pitch, mode, camX, hill, grade, terrainSeed, stretch: tun.hillStretch(), maxGrade, bumpScale: tun.bumps() ? tun.bumpScale() : 0,
        biome: mix < 0.5 ? cur : next, from: cur, to: next, mix,
        piece: piece ? { ...piece, hitAt: [...piece.hitAt] } : null,
        next: nextInfo, speedPerFtp: speedPerFtp(), ftpFrac: frac,
        trick: trick ? { name: trick.name, age: now - trick.t0 } : null, style,
        last: last ? { ...last, age: now - last.at } : null,
        results: [...results],
        topKph: top * 3.6, longestJumpM: longestJump, airS, smashed, rodeM: x, hay, landAt, landImpact, hops,
        hooks: { shielded: phase === 'effort', seg: phase },
      };
    },
    isOver: () => phase === 'done',
    summary() {
      const n = (m: number) => results.filter((r) => r.medal === m).length;
      return {
        tour: tour.name, sets: results.length, gold: n(3), silver: n(2), bronze: n(1), missed: n(0),
        topKph: Math.round(top * 3.6), longestJumpM: Math.round(longestJump), smashed, tricks: style, hops, hopAirS: +hopAir.toFixed(1), longestHopS: +longestHop.toFixed(2),
        distanceKm: +(x / 1000).toFixed(1), medals: results.map((r) => MEDAL_NAMES[r.medal][0]).join(''),
      };
    },
    dispose() { ctx.resistance.clear('terrain'); },
  };
  return sim;
}
