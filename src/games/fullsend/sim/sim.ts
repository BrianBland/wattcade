import type { GameContext, GameHud, GameSim, Seconds } from '../../../contracts';
import { BIOMES, makeTerrain, type BiomeId, type Terrain } from '../../warmup/sim/terrain';
import { CHASER_REACH, chaserFor, MEDAL_FTP, pieceTitle, TOUR_IDS, TOURS, tourMinutes, type ChaserKind, type PieceKind, type Tour, type TourSet } from './tour';
import { AIR_CELL, airItemAt, kickerLip, bumpH, MEGA, megaSlope, takesOff, windAt, type AirKind } from './track';
import { landingGrade, type Landing } from './physics';
import { leapRange, MEDAL_NAMES, medalFor, powerZone, smashCount, spool, targetSpeed, type Medal } from './physics';

export interface FullSendOpts {
  seed?: number; tour?: string; terrainSeed?: number;
  /** Test/demo pilot: steers every hop to match the slope it will land on. */
  autolean?: boolean;
  /** false = skip the setup screen (tests / headless). It's also skipped whenever `tour` is given. */
  menu?: boolean;
  /** Route at each fork: 'main' (default, the tour's planned branch), 'alt', or 'alternate' (alt on odd sets). */
  forks?: 'main' | 'alt' | 'alternate';
  /** Test/demo pilot: holds the jet (and asks for the power via hooks.powerFtp) when a ring is ahead and above. */
  autojet?: boolean;
  /** Arriving from the overworld (warm-up lobby): start in its biome at its speed, so the hand-off doesn't cut. */
  lobby?: { biome?: string; v?: number };
}

export type Phase = 'warmup' | 'approach' | 'effort' | 'payoff' | 'recovery' | 'cooldown' | 'done';
/** How the bike is moving right now. */
export type Mode = 'road' | 'hop' | 'air' | 'fall' | 'rescue' | 'smash' | 'bounce' | 'loop' | 'drop' | 'tow';
/** Altitude layer: momentum launches you from the road to the sky islands and on to the moon; falling off lands you in the sea. */
export type Tier = 'ground' | 'sky' | 'moon' | 'sea';
const TIER_UP: Record<Tier, Tier> = { ground: 'sky', sky: 'moon', moon: 'moon', sea: 'ground' };

/** One set piece on the road. `x0` is where it starts (ramp lip, wall face, loop entry, water's edge). */
export interface PieceView {
  kind: PieceKind; biome: BiomeId; title: string; finale: boolean;
  x0: number;
  /** leap: gap width · smash: wall length · loop: radius · dive: tunnel length · outrun: the bolt-hole cave's length. */
  len: number;
  n: number; spacing: number; count: number; hitAt: number[]; toppledAt: number;
  chaser: ChaserKind; gap: number; caught: number; caughtAt: number;
  /** outrun: when the chaser slammed into the cave mouth (sim time), or -99. */
  crashAt: number;
  air: number; surfaced: boolean;
  /** Live score as an FTP fraction (built-up speed, or the mean so far for dive/outrun). */
  live: number;
  medal: Medal | -1;
  th: [number, number, number];
}
/** What Full Send keeps in profile.gameData.fullsend. */
export interface FullSendSave {
  ver: 1; lastTour?: string; reducedFlash?: boolean; rides?: number; tipsSeen?: string[];
  best?: Record<string, { golds: number; medals: string; topKph: number; longestChain: number; rings: number }>;
  moonVisits?: number; maxAltM?: number;
}
export interface ForkOption { kind: PieceKind; biome: BiomeId; title: string }
export interface SetResult { kind: PieceKind; biome: BiomeId; title: string; medal: Medal; detail: string }

export interface FullSendSnapshot {
  t: number; tour: string; tourName: string;
  phase: Phase; phaseT: number; phaseS: number;
  setIndex: number; setCount: number;
  x: number; y: number; v: number; vy: number; pitch: number; mode: Mode; camX: number;
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
  /** Landing speed bonus (fraction) and the last hop landing's grade. */
  flow: number; landGrade: Landing | null;
  /** Altitude layer, the lift meter (0..1; full = the next takeoff launches you up a layer), height above the road (m),
   *  the layer you're flying to (or falling to), and a counter that bumps when the height is re-based (renderer snaps its camera). */
  tier: Tier; lift: number; alt: number; toTier: Tier | null; warp: number;
  /** While falling off a sky island or the moon: where the edge is (no road beyond it). */
  edgeX: number | null;
  /** Lip x of the mega ramp that launches you up a layer (it stays in the scene until you've left it behind), or null. */
  mega: number | null;
  /** The layer you're falling from (re-entry from the moon burns), when you last hit or left water, the jet (on / held but
   *  under the power line), the heights rings and stars float at on this layer (null = none here), and what you've caught. */
  fromTier: Tier | null; splashAt: number; jet: 'on' | 'weak' | null; jetFtp: number;
  airH: [number, number] | null; got: Array<{ id: number; kind: AirKind; at: number }>;
  rings: number; stars: number; chain: number;
  /** A fork in the road before the next set: two branches (same sprint length), the one you're on, and seconds left to choose. */
  fork: { set: number; options: [ForkOption, ForkOption]; pick: 0 | 1; closesInS: number } | null;
  /** Biomes you've been through this ride, in order. */
  visited: BiomeId[];
  /** The setup screen (before the ride), or null once riding. */
  menu: { row: number; tour: string; tours: Array<{ id: string; name: string; minutes: number; best: string | null }>; reducedFlash: boolean; left: number } | null;
  reducedFlash: boolean;
  /** A one-time tip (first ride only), and how long it's been up. */
  tip: { id: string; text: string; age: number } | null;
  /** Wind on the cruise (−1 headwind … +1 tailwind), when the last bad landing threw you, and smash hits for shake. */
  wind: number; crashAt: number;
  /** Started from the overworld (the renderer eases in from its framing). */
  fromLobby: boolean;
  /** The last landed flip and how long ago; rotation from leaning since takeoff (rad, + = back). */
  flip: { name: string; age: number } | null; spun: number;
  /** In a leap: what's leaping out of the pit (world m), when one last hit you, and the bullet-time factor (1 = normal). */
  hazards: HazardView[]; scorchAt: number; leapSlow: number;
  /** Speed round a loop (m/s; 0 when not in one). */
  loopV: number;
  hooks: Record<string, unknown>;
}

/** Something that leaps out of a canyon pit at the rider (fireball, ice shard, piranha), peaking on your arc. */
export interface Hazard { x: number; t0: number; vy: number; g: number; hit: boolean }
export interface HazardView { x: number; y: number; vy: number; hit: boolean }
/** Hazards for a leap from `x0` across `len` at launch speed (vx, vy0) with gravity g: each peaks where your arc crosses it,
 *  ± a bit, so holding your line gets you hit and steering round them doesn't. Pure and seeded. */
export function leapHazards(n: number, x0: number, len: number, vx: number, vy0: number, g: number, seed: number, floorY = -10): Hazard[] {
  const out: Hazard[] = [], hg = 30;
  for (let i = 0; i < n; i++) {
    const h = (k: number) => { const q = Math.sin((seed + i * 97.13 + k * 13.7) * 12.9898) * 43758.5453; return q - Math.floor(q); };
    const x = x0 + len * (0.25 + 0.5 * (n === 1 ? 0.5 : i / (n - 1))) + (h(1) - 0.5) * len * 0.08;
    const tx = (x - x0) / vx, ry = vy0 * tx - (g * tx * tx) / 2 + (h(2) - 0.5) * 3; // your arc there, give or take
    const rise = Math.sqrt((2 * Math.max(4, ry - floorY)) / hg);
    out.push({ x, t0: tx - rise, vy: hg * rise, g: hg, hit: false });
  }
  return out;
}
export const hazardY = (z: Hazard, t: number, floorY = -10) => floorY + z.vy * (t - z.t0) - (z.g * (t - z.t0) ** 2) / 2;

/** The far rim's landing ramp drops this steeply (rad); the renderer draws it to match. */
export const LANDING_RAMP_SLOPE = 0.3;

const TRICKS = ['No-Hander', 'Superman', 'Can-Can', 'Tabletop', 'Seat Grab', 'Heel Clicker'];
/** Name for a landed flip: n full turns, back (nose up, positive pitch) or front. */
export const flipName = (n: number, back: boolean) => `${n >= 3 ? 'Triple ' : n === 2 ? 'Double ' : ''}${back ? 'Backflip' : 'Frontflip'}`;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
/** An angle wrapped to (−π, π]. */
const wrapPi = (a: number) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
const medalScore = (m: string) => [...m].reduce((a, c) => a + ({ G: 3, S: 2, B: 1 } as Record<string, number>)[c] || a, 0);

/** Full Send: a rocket-bike sprint workout. A fixed tour of set pieces; each one is a sprint, recoveries in between. */
export function createFullSendSim(ctx: GameContext, opts: FullSendOpts = {}): GameSim & { snapshot(): FullSendSnapshot } {
  const T = ctx.tuning;
  const tun = {
    kmhPerFtp: T.num('kmhPerFtp', 200, 80, 400, 10, 'Rocket speed (km/h) at 1.0 FTP; speed is linear in power'),
    spoolS: T.num('spoolS', 2.5, 0.5, 8, 0.25, 'Seconds for the rocket to spool toward the speed your power asks for'),
    cruiseCap: T.num('cruiseCap', 0.85, 0.5, 1.5, 0.05, 'Outside sprints, power above this FTP fraction adds no speed (recovery stays recovery)'),
    approachS: T.num('approachS', 20, 5, 60, 1, 'Seconds of warning before each sprint'),
    tourScale: T.num('tourScale', 1, 0.1, 2, 0.05, 'Scales warm-up, recovery and cool-down lengths (not the sprints)'),
    gravity: T.num('gravity', 28, 9.8, 160, 1, 'Game gravity (m/s²) for leaps: lower = longer, higher jumps'),
    leapSlowMo: T.num('leapSlowMo', 0.3, 0.1, 1, 0.05, 'Bullet time at the top of a leap (eases in from the lip and back out for the landing)'),
    leapDodge: T.num('leapDodge', 6, 0, 15, 0.5, 'How far (m) you can steer up or down off your arc in a leap, to dodge what comes out of the pit'),
    leapHazards: T.num('leapHazards', 3, 0, 6, 1, 'Hazards that leap out of the pit at you (fireballs, ice shards, piranhas)'),
    launchDeg: T.num('launchDeg', 35, 15, 55, 1, 'Ramp angle at the canyon lip'),
    slowMo: T.num('slowMo', 0.45, 0.15, 1, 0.05, 'Slow-motion factor for leaps, loops and smashes'),
    smashN: T.num('smashN', 36, 3, 60, 1, 'Hay-bale columns (or crates, stalls…) in a smash wall'),
    smashHoldS: T.num('smashHoldS', 6, 0, 20, 0.5, 'Seconds the debris stuck to you keeps dragging after a smash'),
    loopGravity: T.num('loopGravity', 24, 6, 120, 1, 'Gravity in loops (lower = bigger loop, longer ride round it)'),
    loopSpoolS: T.num('loopSpoolS', 0.7, 0.3, 5, 0.1, 'In a loop your pedalling drives the bike: seconds for speed to follow your power (stop pedalling and you fall off)'),
    loopSlowMo: T.num('loopSlowMo', 0.6, 0.2, 1, 0.05, 'Slow-motion factor in loops (stretches the ride round so the trainer grade can follow)'),
    chaseGap: T.num('chaseGap', 18, 5, 60, 1, 'Starting gap (m) to whatever is chasing you in an Outrun'),
    chaseMaxGap: T.num('chaseMaxGap', 24, 10, 80, 1, 'It never falls further behind than this (m), so it stays on screen'),
    caveLen: T.num('caveLen', 40, 20, 80, 1, 'Outrun: how deep the bolt-hole cave at the end is (m)'),
    caveStop: T.num('caveStop', 0.6, 0.2, 0.95, 0.05, 'Outrun: how deep into the cave you coast to a stop (fraction of its length)'),
    caveCreep: T.num('caveCreep', 4, 0, 10, 0.5, 'Outrun: rolling speed you keep in the cave (m/s)'),
    caveChargeS: T.num('caveChargeS', 1.6, 0.6, 4, 0.1, 'Outrun: seconds for the chaser to reach the cave mouth after you duck in'),
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
    leanRate: T.num('leanRate', 3.5, 0.5, 8, 0.25, 'How fast you can lean the bike in the air (rad/s at full paddle / D-pad)'),
    flipRate: T.num('flipRate', 7, 2, 14, 0.5, 'Hold a full lean and the bike tucks into a flip: rotation speeds up to this (rad/s)'),
    flipFlow: T.num('flipFlow', 0.05, 0, 0.3, 0.01, 'Flow (speed bonus) per full flip on a clean landing'),
    flowMax: T.num('flowMax', 0.3, 0, 1, 0.05, 'Most extra cruising speed clean landings can build (fraction)'),
    flowPerfect: T.num('flowPerfect', 0.08, 0, 0.3, 0.01, 'Speed bonus for a perfect landing'),
    flowGood: T.num('flowGood', 0.03, 0, 0.3, 0.01, 'Speed bonus for a good landing'),
    flowDecay: T.num('flowDecay', 0.006, 0, 0.1, 0.002, 'How fast the landing bonus fades (per second)'),
    badKeep: T.num('badKeep', 0.8, 0.3, 1, 0.05, 'Fraction of speed you keep after a bad landing'),
    leanDrift: T.num('leanDrift', 0.25, 0, 3, 0.05, 'How fast the bike drifts on its own toward its flight path in the air (1/s)'),
    gradeAirS: T.num('gradeAirS', 0.35, 0, 2, 0.05, 'Hops shorter than this land as plain "ok" (no bonus) unless badly crossed up'),
    perfectDeg: T.num('perfectDeg', 8, 1, 30, 1, 'Landing within this many degrees of the slope is perfect'),
    goodDeg: T.num('goodDeg', 15, 2, 40, 1, 'Within this many degrees is good'),
    badDeg: T.num('badDeg', 28, 5, 60, 1, 'Beyond this many degrees is a bad landing (bounce, lose speed)'),
    hopAirGradeS: T.num('hopAirGradeS', 0.8, 0.2, 3, 0.1, 'Hops longer than this (s) ease the trainer to the airtime grade'),
    smashGrade: T.num('smashGrade', 3, 0, 8, 0.5, 'Grade % while plowing through a wall'),
    diveGrade: T.num('diveGrade', 2, 0, 8, 0.5, 'Extra grade % underwater (water drag)'),
    launchGain: T.num('launchGain', 1.2, 0, 4, 0.1, 'Extra hop launch at full flow (fraction of takeoff lift): momentum = bigger air'),
    hopVyMax: T.num('hopVyMax', 26, 5, 80, 1, 'Cap on a hop\'s upward launch speed (m/s), so moon hops stay on screen-ish'),
    liftFillS: T.num('liftFillS', 30, 5, 300, 5, 'Seconds of max flow to fill the lift meter (full = launch up to the next layer)'),
    liftFloor: T.num('liftFloor', 0.08, 0, 0.3, 0.01, 'Flow below this drains the lift meter instead (up high, empty = you fall off)'),
    liftBad: T.num('liftBad', 0.25, 0, 1, 0.05, 'Lift lost on a bad landing'),
    skyLaunch: T.num('skyLaunch', 55, 20, 120, 1, 'Launch speed (m/s, straight up) of a sky launch / breach'),
    moonLaunch: T.num('moonLaunch', 70, 20, 150, 1, 'Launch speed (m/s, straight up) of a moon shot'),
    moonGravity: T.num('moonGravity', 0.35, 0.1, 1, 0.05, 'Hop gravity on the moon, as a fraction of normal (floaty hops)'),
    seaGravity: T.num('seaGravity', 0.6, 0.1, 1, 0.05, 'Hop gravity underwater, as a fraction of normal'),
    plungeM: T.num('plungeM', 45, 10, 200, 5, 'How far you fall off a sky island or the moon before splashing into the sea (m, each half)'),
    moonS: T.num('moonS', 60, 10, 600, 5, 'Seconds of cruising you get on the moon before you drift off and fall'),
    skyStartLift: T.num('skyStartLift', 0.3, 0, 1, 0.05, 'Lift meter on arrival at the sky islands (grace before you can fall off)'),
    jetFtp: T.num('jetFtp', 1.0, 0.5, 2, 0.05, 'Jet (hold B / up in the air, up high) fires only while you hold at least this FTP fraction'),
    jetAccel: T.num('jetAccel', 45, 5, 150, 1, 'Jet thrust (m/s² upward) while it fires'),
    jetVyMax: T.num('jetVyMax', 22, 5, 80, 1, 'Fastest the jet climbs (m/s)'),
    jetGrade: T.num('jetGrade', 2, -2, 8, 0.5, 'Grade % on the trainer while jetting'),
    ringFlow: T.num('ringFlow', 0.06, 0, 0.3, 0.01, 'Flow (speed bonus) for flying through a ring'),
    ringLift: T.num('ringLift', 0.12, 0, 1, 0.01, 'Lift for a ring (on the moon: extra moon time, as a fraction of moonS)'),
    starLift: T.num('starLift', 0.03, 0, 0.5, 0.01, 'Lift for a star'),
    chainStep: T.num('chainStep', 0.15, 0, 1, 0.05, 'Each clean landing in a row multiplies the next one\'s flow by this much more (up to 5 in a row)'),
    moonFallM: T.num('moonFallM', 170, 45, 400, 5, 'How far you fall off the moon (re-entry) before the sea (m)'),
    reentryV: T.num('reentryV', 38, 15, 80, 1, 'Re-entry: top falling speed off the moon (m/s), so the burn lasts'),
    moonExitVy: T.num('moonExitVy', 25, 5, 80, 1, 'Launch speed (m/s up) off the moon when your moon time runs out'),
    megaLead: T.num('megaLead', 220, 80, 600, 10, 'How far ahead (m) the mega ramp appears once you are due to go up a layer (or off the moon)'),
    cadenceSpool: T.num('cadenceSpool', 0.5, 0, 2, 0.05, 'How much cadence speeds up the rocket (spool time × 90 rpm / cadence, softened by this)'),
    windGrade: T.num('windGrade', 1.5, 0, 5, 0.25, 'Grade % a full headwind adds (a tailwind takes it off) on the cruise'),
    windSpeed: T.num('windSpeed', 0.06, 0, 0.3, 0.01, 'Speed change (fraction) from a full head- / tailwind on the cruise'),
    menuAutoS: T.num('menuAutoS', 30, 5, 120, 5, 'Seconds the setup screen waits before starting with the highlighted tour'),
    seaS: T.num('seaS', 40, 5, 300, 5, 'Seconds underwater after a fall before you breach back up to the road'),
    seaGrade: T.num('seaGrade', 1.5, 0, 6, 0.5, 'Extra grade % on the sea floor (water drag)'),
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

  const save: FullSendSave = { ver: 1, ...(ctx.load<FullSendSave>() ?? {}) };
  let tour: Tour = TOURS[opts.tour ?? save.lastTour ?? 'classic'] ?? TOURS.classic;
  let menu = opts.menu !== false && opts.tour === undefined;
  let menuRow = 0, menuT = 0, reducedFlash = !!save.reducedFlash;
  const actions: Array<{ type: string; value?: unknown }> = [];
  const tipsSeen = new Set(save.tipsSeen ?? []);
  let tip: { id: string; text: string; at: number } | null = null, lastTipEnd = -99;
  let wind = 0, crashAt = -99;
  const terrainSeed = opts.terrainSeed ?? Math.floor(ctx.rng() * 1e9);
  let maxGrade = tun.maxGrade();
  let terrain: Terrain = makeTerrain(terrainSeed, maxGrade);
  ctx.resistance.useVirtualGears(true);

  // ---- state ----
  let phase: Phase = 'warmup', phaseT = 0, setIndex = -1;
  const lobbyBiome = (BIOMES as readonly string[]).includes(opts.lobby?.biome ?? '') ? opts.lobby!.biome as BiomeId : null;
  let x = 0, y = 0, v = lobbyBiome ? Math.max(0, Math.min(30, Number(opts.lobby?.v) || 0)) : 0, vx = 0, vy = 0, pitch = 0, mode: Mode = 'road', modeT = 0, camX = 0;
  let hill = 1, grade = 0, frac = 0;
  let cur: BiomeId = lobbyBiome ?? tour.sets[0].biome, next: BiomeId = cur, mix = 0;
  let piece: PieceView | null = null;
  let fracSum = 0, fracN = 0;
  let loopV0 = 0, loopV = 0, loopPhi = 0, loopDir = 1;
  let fallFromX = 0, fallFromY = 0, rescueToX = 0;
  let trick: { name: string; t0: number } | null = null, trickCount = 0, style = 0;
  let last: (SetResult & { at: number }) | null = null;
  const results: SetResult[] = [];
  let top = 0, longestJump = 0, airS = 0, smashed = 0, launchX = 0;
  /** 0..1 debris (hay) stuck to the rider after a smash; it drags (trainer grade) until it falls off. */
  let hay = 0;
  /** Extra cruising speed earned by clean landings (fraction), the last landing's grade, and whether we're bouncing off a bad one. */
  let flow = 0, flowPeak = 0, landGrade: Landing | null = null, bouncing = false, perfects = 0, bads = 0;
  let hopT0 = 0, hopAir = 0, hops = 0, longestHop = 0, landAt = -99, landImpact = 0;
  let pendingMedal: Medal = 0;
  /** Altitude: layer, lift meter, where we're flying to (or falling to), the scenery we're leaving, and stats. */
  let tier: Tier = 'ground', lift = 0, toTier: Tier | null = null, plunging = false, transFrom: BiomeId = cur, transMix = 0, warp = 0, tierT = 0, edgeX: number | null = null;
  let megaX: number | null = null, megaArmed = false; // the mega ramp ahead (or just behind) and whether it still launches you
  let launchVy = 1, skyVisits = 0, moonVisits = 0, splashdowns = 0, peakAlt = 0;
  let fromTier: Tier | null = null, splashAt = -99, jet: 'on' | 'weak' | null = null, jetS = 0, moonDoneAt = -1;
  let chaseX = 0, chaseV = 0, caveDecel = 0; // outrun payoff: the chaser charging the cave mouth
  const caught = new Set<number>(); const got: Array<{ id: number; kind: AirKind; at: number }> = [];
  let rings = 0, stars = 0, chain = 0, longestChain = 0, prevX = 0, wantPower: number | undefined;
  /** Rotation from leaning since takeoff (rad, + = back), how long a full lean has been held, and the last landed flip. */
  let spun = 0, leanHeld = 0, flips = 0, flip: { name: string; at: number } | null = null;
  /** In a leap: the ballistic height (y adds your steering), steering offset, flight time (bullet-time seconds), what's
   *  coming out of the pit, and hits taken. */
  let leapY = 0, dodge = 0, leapT = 0, hazards: Hazard[] = [], scorched = 0, scorchAt = -99;

  const scale = () => tun.tourScale();
  /** Branch taken at each set's fork (0 = the tour's plan, 1 = its alternative). */
  let route: Array<0 | 1> = tour.sets.map((_, i) => (opts.forks === 'alt' || (opts.forks === 'alternate' && i % 2 === 1) ? 1 : 0));
  const setAt = (i: number): TourSet | null => {
    const b = tour.sets[i];
    if (!b) return null;
    return route[i] === 1 && b.alt ? { ...b, kind: b.alt.kind, biome: b.alt.biome } : b;
  };
  const set = (): TourSet | null => (setIndex >= 0 && setIndex < tour.sets.length ? setAt(setIndex) : null);
  /** The set whose fork is ahead (the first set during the warm-up, the next one during a recovery), or -1. */
  const forkSet = () => (phase === 'warmup' ? 0 : phase === 'recovery' && setIndex + 1 < tour.sets.length ? setIndex + 1 : -1);
  /** When the fork is open (phase seconds): late in the warm-up, early in a recovery, before the scenery changes. */
  const forkWindow = (): [number, number] => (phase === 'warmup' ? [phaseS() * 0.55, phaseS() * 0.75] : [phaseS() * 0.05, phaseS() * 0.3]);
  const visited: BiomeId[] = [];
  const visit = (b: BiomeId) => { if (visited[visited.length - 1] !== b) visited.push(b); };

  // ---- setup screen, saves and first-ride tips ----
  const MENU_ROWS = 3; // tour · fewer flashes · start
  function chooseTour(id: string) {
    tour = TOURS[id] ?? TOURS.classic;
    cur = lobbyBiome ?? tour.sets[0].biome; next = cur; mix = 0;
    route = tour.sets.map((_, i) => (opts.forks === 'alt' || (opts.forks === 'alternate' && i % 2 === 1) ? 1 : 0));
  }
  function startRide() {
    menu = false;
    save.lastTour = tour.id; save.reducedFlash = reducedFlash; ctx.save(save);
  }
  function updateMenu(dt: Seconds) {
    const inp = ctx.input();
    for (const a of actions.splice(0)) {
      if (a.type === 'tour' && typeof a.value === 'string') chooseTour(a.value);
      else if (a.type === 'flash') reducedFlash = !reducedFlash;
      else if (a.type === 'start') { startRide(); return; }
      menuT = 0;
    }
    if (inp.pressed.size) menuT = 0;
    if (inp.pressed.has('up')) menuRow = (menuRow + MENU_ROWS - 1) % MENU_ROWS;
    if (inp.pressed.has('down')) menuRow = (menuRow + 1) % MENU_ROWS;
    const dir = inp.pressed.has('left') || inp.pressed.has('shiftDnL') || inp.pressed.has('shiftDnR') ? -1 : inp.pressed.has('right') || inp.pressed.has('shiftUpL') || inp.pressed.has('shiftUpR') ? 1 : 0;
    if (dir && menuRow === 0) { const i = TOUR_IDS.indexOf(tour.id as never); chooseTour(TOUR_IDS[(i + dir + TOUR_IDS.length) % TOUR_IDS.length]); }
    if (dir && menuRow === 1) reducedFlash = !reducedFlash;
    if (inp.pressed.has('a')) { if (menuRow === 1) reducedFlash = !reducedFlash; else { startRide(); return; } }
    menuT += dt;
    if (menuT >= tun.menuAutoS()) startRide();
  }
  /** Show a tip once per rider (saved as soon as it's shown), one at a time. */
  function offerTip(id: string, text: string, now: number) {
    if (tipsSeen.has(id) || tip || now - lastTipEnd < 3) return;
    tip = { id, text, at: now }; tipsSeen.add(id);
    save.tipsSeen = [...tipsSeen]; ctx.save(save);
  }
  function finishRide() {
    const sm = sim.summary();
    const golds = Number(sm.gold), b = save.best?.[tour.id];
    const medals = String(sm.medals);
    if (!b || golds > b.golds || (golds === b.golds && medalScore(medals) > medalScore(b.medals))) {
      save.best = { ...(save.best ?? {}), [tour.id]: { golds, medals, topKph: Number(sm.topKph), longestChain: Number(sm.longestChain), rings: Number(sm.rings) } };
    }
    save.rides = (save.rides ?? 0) + 1;
    save.moonVisits = (save.moonVisits ?? 0) + moonVisits;
    save.maxAltM = Math.max(save.maxAltM ?? 0, Math.round(peakAlt));
    ctx.save(save);
  }
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
  /** The next ring ahead on this layer that you haven't caught (for the jet pilot). */
  function nextRing() {
    const H = airH();
    if (!H) return null;
    for (let k = Math.floor(x / AIR_CELL); k <= Math.floor(x / AIR_CELL) + 3; k++) {
      const it = airItemAt(k, terrainSeed, H[0], H[1]);
      if (it && it.kind === 'ring' && it.x > x && !caught.has(it.id)) return it;
    }
    return null;
  }
  const tierBiome = (t: Tier): BiomeId => (t === 'sky' ? 'sky' : t === 'moon' ? 'moon' : t === 'sea' ? 'underwater' : cur);
  const gScale = () => (plunging ? 1 : tier === 'moon' ? tun.moonGravity() : tier === 'sea' ? tun.seaGravity() : 1); // falling: Earth's pull
  const airH = (): [number, number] | null => (toTier ? null : tier === 'sky' ? [4, 16] : tier === 'moon' ? [6, 30] : null);
  const cruising = () => phase === 'warmup' || phase === 'recovery' || phase === 'cooldown';
  const shown = (): BiomeId => tierBiome(tier);
  /** Leave the road straight up: a sky launch, a moon shot, or a breach out of the sea. */
  function launchUp(now: number) {
    const to = TIER_UP[tier];
    transFrom = shown(); fromTier = tier; toTier = to; transMix = 0; plunging = false;
    launchVy = tier === 'sky' ? tun.moonLaunch() : tun.skyLaunch();
    setMode('hop'); vy = launchVy; hopT0 = now; bouncing = false; landGrade = null;
    ctx.emit({ type: 'launch', data: { from: tier, to } });
  }
  /** Run out of lift up high: drop off the edge, fall past the clouds, and splash into the sea. */
  function plunge(now: number) {
    transFrom = shown(); fromTier = tier; toTier = 'sea'; transMix = 0; plunging = true; edgeX = x;
    megaArmed = false; megaX = null;
    setMode('hop'); vy = 4; hopT0 = now; bouncing = false; landGrade = null;
  }
  /** Moon time's up: the next ramp throws you off the moon, and it's a long way down (re-entry, then the sea). */
  function leaveMoon(now: number) {
    transFrom = shown(); fromTier = 'moon'; toTier = 'sea'; transMix = 0; plunging = true; edgeX = x + 12; moonDoneAt = -1;
    setMode('hop'); vy = tun.moonExitVy(); hopT0 = now; bouncing = false; landGrade = null;
    ctx.emit({ type: 'launch', data: { from: 'moon', to: 'sea' } });
  }

  /** Grade round a loop: climbs to `loopGrade` at the top, then eases off to the airtime grade on the way down. */
  function loopGradeAt(phi: number): number {
    const u = ((phi % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return u <= Math.PI ? tun.runupGrade() + (tun.loopGrade() - tun.runupGrade()) * (u / Math.PI)
      : tun.loopGrade() + (tun.airGrade() - tun.loopGrade()) * ((u - Math.PI) / Math.PI);
  }

  function startSet(i: number) {
    setIndex = i;
    const s = setAt(i)!, t = th[s.kind]();
    const lay = toTier ?? tier; // up on the sky islands or the moon, the set piece happens up there
    const biome: BiomeId = lay === 'sky' || lay === 'moon' ? tierBiome(lay) : s.biome;
    const g = tun.gravity(), vB = targetSpeed(t[0], speedPerFtp()) * 0.97;
    const len = s.kind === 'leap' ? leapRange(vB, tun.launchDeg(), g)
      : s.kind === 'loop' ? (0.26 * vB * vB) / tun.loopGravity() // big: bronze power gets you round if you keep pedalling; coasting doesn't
        : s.kind === 'dive' ? vB * s.effortS
          : s.kind === 'smash' ? (tun.smashN() - 1) * 2.4 + 4 : s.kind === 'outrun' ? tun.caveLen() : 0;
    piece = {
      kind: s.kind, biome, title: pieceTitle(s.kind, biome), finale: !!s.finale,
      x0: x + 1e4, len, n: s.kind === 'smash' ? Math.round(tun.smashN()) : 0, spacing: 2.4, count: 0, hitAt: [], toppledAt: -1,
      chaser: chaserFor(biome), gap: tun.chaseGap(), caught: 0, caughtAt: -99, crashAt: -99, air: 1, surfaced: false,
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
      pendingMedal = medal; leapY = 0; dodge = 0; leapT = 0; spun = 0; pitch = a * 0.5;
      const pit = piece.biome === 'sky' ? 0 : Math.round(tun.leapHazards());
      hazards = leapHazards(pit, piece.x0, piece.len, vx, vy, tun.gravity(), terrainSeed % 1000 + setIndex * 7);
    } else if (piece.kind === 'smash') {
      piece.count = smashCount(live / 0.97, piece.th, piece.n);
      pendingMedal = medal; setMode('smash');
    } else if (piece.kind === 'loop') {
      loopV0 = v; loopV = v; loopPhi = 0; loopDir = 1;
      pendingMedal = medal; setMode('loop');
    }
  }
  function payoff(dt: Seconds, now: number) {
    if (!piece) { endPayoff(); return; }
    const g = tun.gravity(), sm = tun.slowMo(), dts = dt * sm;
    modeT += dt;
    if (piece.kind === 'leap') {
      const far = piece.x0 + piece.len;
      if (mode === 'air') {
        // bullet time: eases in off the lip, deepest at the top, eases out for the landing
        const prog = clamp((x - launchX) / Math.max(1, far - launchX), 0, 1);
        const bt = 1 - (1 - tun.leapSlowMo()) * Math.sin(Math.PI * prog) ** 1.5, dtb = dt * bt;
        x += vx * dtb; leapY += vy * dtb; vy -= g * dtb; airS += dt; leapT += dtb;
        // steer: lean back to float up off your arc, forward to drop under it (the arc itself, so where you land, is
        // set by your sprint); the offset melts away before the landing so nobody misses the rim by steering
        const lean = opts.autolean ? dodgeFor(prog) : leanInput();
        const room = 1 - clamp((prog - 0.8) / 0.15, 0, 1);
        dodge += ((lean * tun.leapDodge() * room) - dodge) * Math.min(1, dt * 3);
        y = leapY + dodge;
        const ln = opts.autolean ? 0 : lean;
        leanStep(ln * 0.6, Math.atan2(vy, vx), dt);
        if (Math.abs(ln) < 0.1 && leanHeld === 0) pitch += (Math.atan2(vy, vx) * 0.5 - pitch) * 2 * dt; // hands off: the bike settles to match the landing ramp
        for (const z of hazards) { // what leaps out of the pit
          if (z.hit) continue;
          if (Math.abs(z.x - x) < 2.6 && Math.abs(hazardY(z, leapT) - y) < 2.4) {
            z.hit = true; scorched++; scorchAt = now; crashAt = now; flow = 0; chain = 0; spun = 0;
            ctx.emit({ type: 'hazard', data: { biome: piece.biome } });
          }
        }
        if (leapY <= 0 && x >= far) { // landed on the far rim: graded against the landing ramp, flips count
          const lg = landingGrade(wrapPi(pitch + LANDING_RAMP_SLOPE), tun.perfectDeg(), tun.goodDeg(), tun.badDeg());
          y = 0; leapY = 0; dodge = 0; v = Math.hypot(vx, vy) * (lg === 'bad' ? tun.badKeep() : 0.9); longestJump = Math.max(longestJump, x - launchX);
          landGrade = lg; landAt = now; landImpact = 12;
          if (lg === 'bad') { bads++; crashAt = now; flow = 0; chain = 0; spun = 0; }
          else { if (lg === 'perfect') { perfects++; flow = Math.min(tun.flowMax(), flow + tun.flowPerfect() * 2); } landFlips(2, now); }
          pitch = 0;
          if (trick) { if (now - trick.t0 >= 0.9) style++; trick = null; }
          finishPiece(pendingMedal, `${Math.round(x - launchX)} m`);
          setMode('road');
          piece.surfaced = true; // reused as "landed"
        } else if (leapY < 0 && x < far) { setMode('fall'); y = leapY; dodge = 0; }
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
        // you pedal round: speed chases what your power asks for, while gravity pulls back on the way up
        const vt = targetSpeed(frac, speedPerFtp());
        piece.live = frac; // the meter shows what you're putting in round the loop
        if (loopDir > 0) {
          loopV += ((vt - loopV) / tun.loopSpoolS() - g * Math.sin(loopPhi)) * dts;
          if (loopV <= 0.5 && loopPhi < Math.PI / 2) { loopDir = -1; loopV = 0; } // never reached the side: roll back
          else {
            loopPhi += (Math.max(0.5, loopV) / R) * dts;
            const grip = (loopV * loopV) / R + g * Math.cos(loopPhi); // < 0 = not fast enough to stick to the roof
            if (loopPhi > Math.PI / 2 && loopPhi < 1.5 * Math.PI && grip < 0) { vy = 0; setMode('drop'); }
          }
        } else {
          loopV += g * Math.sin(loopPhi) * dts; loopPhi -= (loopV / R) * dts;
          if (loopPhi <= 0) { loopPhi = 0; x = piece.x0; y = 0; v = Math.max(loopV, loopV0 * 0.3); finishPiece(0, 'rolled back'); endPayoff(); return; }
        }
        if (mode === 'loop' && loopPhi >= Math.PI * 2) {
          loopPhi = 0; x = piece.x0; y = 0; v = Math.max(loopV, loopV0 * 0.8);
          finishPiece(pendingMedal, 'pedalled round'); setMode('road'); piece.surfaced = true;
        }
        if (mode === 'loop') { x = piece.x0 + R * Math.sin(loopPhi); y = R * (1 - Math.cos(loopPhi)); pitch = loopPhi; }
      } else if (mode === 'drop') {
        vy -= g * dts; y += vy * dts; pitch += dt * 5;
        if (y <= 0) { y = 0; pitch = 0; v = loopV0 * 0.35; x = piece.x0 + R + 4; finishPiece(0, 'fell off · keep pedalling!'); endPayoff(); }
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
      // you duck into the cave and coast to a stop in the dark; the chaser, far too big for the hole, charges into the rock
      v = Math.max(tun.caveCreep(), v - caveDecel * dt);
      if (piece.crashAt < 0) {
        const stop = piece.x0 - CHASER_REACH[piece.chaser];
        chaseX = Math.min(stop, chaseX + chaseV * dt);
        if (chaseX >= stop) { piece.crashAt = now; ctx.emit({ type: 'chaserCrash', data: { chaser: piece.chaser } }); }
      }
      piece.gap = x - chaseX;
      if ((piece.crashAt >= 0 && now - piece.crashAt > 2.2) || modeT > 6) endPayoff();
    }
  }

  /** Test/demo pilot in a leap: steer away from the next hazard that would hit you. */
  function dodgeFor(prog: number): number {
    if (prog > 0.8) return 0;
    for (const z of hazards) {
      if (z.hit || z.x < x - 3 || z.x > x + 18) continue;
      const tz = leapT + (z.x - x) / Math.max(1, vx), zy = hazardY(z, tz), ry = leapY + vy * (tz - leapT);
      if (Math.abs(zy - ry) < 5) return zy > ry ? -1 : 1;
    }
    return 0;
  }
  /** Lean input: left paddle / D-pad left = back (nose up), right = forward (nose down). */
  function leanInput(): number {
    const input = ctx.input();
    return clamp(Math.abs(input.paddleL) - Math.abs(input.paddleR) + (input.held.has('left') ? 1 : 0) - (input.held.has('right') ? 1 : 0), -1, 1);
  }
  /** Rotate the bike in the air. Hold a full lean and it tucks into a flip (faster, and it stops drifting back toward the
   *  flight path); `path` is the flight path angle it drifts toward otherwise. */
  function leanStep(lean: number, path: number, dt: Seconds) {
    leanHeld = Math.abs(lean) > 0.9 ? leanHeld + dt : 0;
    const tuck = clamp((leanHeld - 0.25) / 0.3, 0, 1);
    const d = lean * (tun.leanRate() + (tun.flipRate() - tun.leanRate()) * tuck) * dt;
    pitch += d; spun += d;
    pitch += (path + 2 * Math.PI * Math.round((pitch - path) / (2 * Math.PI)) - pitch) * tun.leanDrift() * (1 - tuck) * dt;
  }
  /** Count the full turns since takeoff on a clean landing: flow, style, and a call-out. */
  function landFlips(mult: number, now: number) {
    const n = Math.floor((Math.abs(spun) + 0.6) / (2 * Math.PI)), back = spun > 0;
    spun = 0;
    if (n < 1) return;
    flips += n; style++;
    flip = { name: flipName(n, back), at: now };
    flow = Math.min(tun.flowMax(), flow + tun.flipFlow() * n * mult);
    ctx.emit({ type: 'trick', data: { name: flip.name, flips: n } });
  }

  const sim = {
    update(dt: Seconds) {
      const now = ctx.clock.now();
      if (menu) { updateMenu(dt); y = roadH(x); return; } // sit on the road while the setup sign is up
      actions.length = 0;
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
      flow = Math.max(0, flow - tun.flowDecay() * dt);
      // clean landings buy cruising speed for the same watts (never during a sprint, so medals stay effort-only)
      const boost = phase === 'effort' ? 1 : 1 + flow;
      // wind on the cruise (ground and sky): a headwind slows you and adds grade, a tailwind the reverse
      wind = cruising() && (tier === 'ground' || tier === 'sky') && !toTier ? windAt(x, terrainSeed) : 0;
      // spinning faster spools the rocket faster (form, not watts)
      const cad = bike.cadence3s || 0, cadK = cad > 20 ? 1 + tun.cadenceSpool() * (cad / 90 - 1) : 1;
      const spoolS = tun.spoolS() / clamp(cadK, 0.6, 1.6);
      if (phase !== 'payoff' || ((mode === 'road' || mode === 'hop') && piece?.kind !== 'outrun')) v = spool(v, targetSpeed(pf, speedPerFtp()) * boost * (1 + wind * tun.windSpeed()), dt, spoolS);

      // phase machine
      // a fork in the road: ◀ / ▶ picks the branch while it's open (the plan is the default)
      const fs = forkSet(), fw = forkWindow();
      if (fs >= 0 && tour.sets[fs].alt && !opts.forks && phaseT >= fw[0] && phaseT < fw[1]) {
        offerTip('fork', 'Fork ahead! On the road, press ◀ or ▶ to pick your next set piece and scenery.', now);
        if (mode === 'road' && input.pressed.has('left')) route[fs] = 0; // on the road only: in the air, ◀ ▶ lean
        if (mode === 'road' && input.pressed.has('right')) route[fs] = 1;
      }
      if (phase === 'warmup') {
        const nx = setAt(0)!;
        if (nx.biome !== cur && phaseT >= fw[1]) {
          next = nx.biome; mix = Math.min(1, mix + dt / tun.blendS());
          if (mix >= 1) { cur = next; mix = 0; if (tier === 'ground' && !toTier) ctx.emit({ type: 'biomeReached', data: { biome: cur } }); }
        }
        if (phaseT >= phaseS()) { if (mix > 0) { cur = next; mix = 0; } startSet(0); }
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
          piece.x0 = x + v * Math.max(0, phaseS() - phaseT); // the cave you're racing for
          if (piece.gap <= 0) { piece.caught++; piece.caughtAt = now; piece.gap = 25; v *= 0.6; }
          if (phaseT >= phaseS()) {
            const m = medalFor(piece.live, piece.th);
            finishPiece(piece.caught ? (Math.min(m, 1) as Medal) : m, piece.caught ? `caught ${piece.caught}×` : `${Math.round(piece.gap)} m clear`);
            piece.surfaced = true; go('payoff'); setMode('road');
            piece.x0 = x; chaseX = x - piece.gap;
            caveDecel = (v * v) / (2 * tun.caveStop() * piece.len); // coast to a stop well inside, whatever your speed
            chaseV = Math.max(vChase, (piece.x0 - CHASER_REACH[piece.chaser] - chaseX) / tun.caveChargeS()); // it lunges for you as you slip inside
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
        const nx = setAt(setIndex + 1);
        if (nx && nx.biome !== cur) {
          next = nx.biome;
          if (phaseT >= forkWindow()[1]) mix = Math.min(1, mix + dt / tun.blendS());
          if (mix >= 1) { cur = next; mix = 0; if (tier === 'ground' && !toTier) ctx.emit({ type: 'biomeReached', data: { biome: cur } }); }
        }
        if (phaseT >= phaseS()) { if (mix > 0) { cur = next; mix = 0; } startSet(setIndex + 1); }
      } else if (phase === 'cooldown') {
        if (phaseT >= phaseS()) { go('done'); ctx.emit({ type: 'tourComplete', data: { tour: tour.id } }); finishRide(); }
      }

      // altitude: keep your flow up and the lift meter fills; up high, an empty meter drops you off the edge
      tierT += dt;
      if (cruising() && !toTier) {
        lift = tier === 'moon' ? Math.max(0, lift - dt / tun.moonS()) // the moon is a prize: a fixed stay, then you drift off
          : clamp(lift + ((flow - tun.liftFloor()) / Math.max(0.01, tun.flowMax())) * dt / tun.liftFillS(), 0, 1);
        if (tier === 'sky' && lift <= 0 && mode === 'road') plunge(now);
        if (tier === 'moon' && lift <= 0 && moonDoneAt < 0) moonDoneAt = now; // out of moon time: a mega ramp throws you off
        const due = tier === 'moon' ? moonDoneAt >= 0 : tier === 'sea' ? tierT >= tun.seaS() || lift >= 1 : lift >= 1;
        if (due && !megaArmed && mode === 'road') { megaX = x + tun.megaLead(); megaArmed = true; ctx.emit({ type: 'megaRamp', data: { tier } }); }
      }
      if (megaArmed && megaX !== null && !cruising() && x < megaX - MEGA.len - MEGA.padFrom) { megaArmed = false; megaX = null; } // a set piece came first
      if (!megaArmed && megaX !== null && x > megaX + 400) megaX = null;
      if (tier === 'sea' && !toTier && mode === 'road') { // breach back to the road: after a while, or for any set piece but a dive
        const needRoad = !!piece && phase === 'approach' && piece.kind !== 'dive';
        if (needRoad) { megaArmed = false; megaX = null; launchUp(now); } // a set piece is coming: straight up, no time for the ramp
      }

      // jet (up high only): hold B / up and pedal above the power line, and the rocket lifts you
      const canJet = (tier === 'sky' || tier === 'moon') && !toTier && (mode === 'road' || mode === 'hop') && phase !== 'effort' && phase !== 'payoff';
      let wantJet = input.held.has('b') || input.held.has('up');
      wantPower = undefined;
      if (opts.autojet && canJet) {
        const r = nextRing();
        wantJet = !!r && r.h > y - roadH(r.x) + 1 && (r.x - x) / Math.max(1, v) < 1.6;
        if (wantJet) wantPower = tun.jetFtp() + 0.15;
      }
      jet = canJet && wantJet ? (frac >= tun.jetFtp() ? 'on' : 'weak') : null;
      if (jet === 'on' && mode === 'road') { setMode('hop'); vy = 3; hopT0 = now; y = roadH(x); } // jet off the road any time

      // movement on the road
      // (leap, smash and loop payoffs move the bike themselves)
      const selfMoving = phase === 'payoff' && !!piece && atEnd(piece.kind);
      if (!selfMoving && (mode === 'road' || mode === 'hop')) {
        x += v * dt;
        const ground = roadH(x), slope = slopeAt(x), gH = tun.hopGravity();
        if (megaArmed && megaX !== null && x >= megaX && !toTier) { // off the lip of the mega ramp: up a layer (or off the moon)
          megaArmed = false; y = ground + MEGA.h; pitch = (MEGA.deg * Math.PI) / 180; spun = 0;
          if (tier === 'moon') leaveMoon(now); else launchUp(now);
        }
        if (mode === 'road') {
          const lipSlope = tun.bumps() && hill > 0.5 ? kickerLip(x - v * dt, x, terrainSeed) : null;
          const nearMega = megaArmed && megaX !== null && x > megaX - MEGA.len - MEGA.padFrom - 40; // stay down for the run-in
          if (v > 5 && !nearMega && (lipSlope !== null || takesOff(v, curvAt(x), gH * gScale()))) {
            y = ground;
            { setMode('hop'); vy = Math.min(tun.hopVyMax(), v * (lipSlope !== null ? lipSlope * hill * tun.bumpScale() : slope) * (1 + tun.launchGain() * flow / Math.max(0.01, tun.flowMax()))); hopT0 = now; }
          }
          else { y = ground; pitch = Math.atan(slope + megaSlope(megaArmed ? megaX : null, x)); v = Math.max(0, v - tun.slopeGravity() * slope * dt); }
        }
        if (mode === 'hop') {
          if (jet === 'on') { if (vy < tun.jetVyMax()) vy = Math.min(tun.jetVyMax(), vy + tun.jetAccel() * dt); jetS += dt; }
          vy -= gH * gScale() * dt; y += vy * dt;
          peakAlt = Math.max(peakAlt, y - ground);
          if (toTier && !plunging) { // flying up: the scenery dissolves on the way, and you arrive at the top of the arc
            const was = transMix;
            transMix = clamp(1 - vy / launchVy, 0, 1);
            if (fromTier === 'sea' && was < 0.35 && transMix >= 0.35) splashAt = now; // breaking the surface
            if (vy <= 0) {
              tier = toTier; toTier = null; tierT = 0; transMix = 0; fromTier = null; megaX = null;
              lift = tier === 'moon' ? 1 : tier === 'sky' ? tun.skyStartLift() : 0;
              if (tier === 'sky') skyVisits++; else if (tier === 'moon') moonVisits++;
              ctx.emit({ type: 'biomeReached', data: { biome: shown() } });
            }
          } else if (plunging) { // falling: past the clouds, into the sea (re-based halfway so the sea floor is under you)
            const fallM = fromTier === 'moon' ? tun.moonFallM() : tun.plungeM(); // from the moon it's a long way down
            if (fromTier === 'moon') vy = Math.max(vy, -tun.reentryV()); // air drag: a long, steady burn you can watch
            transMix = clamp((ground - y) / fallM, 0, 1);
            if (ground - y >= fallM) {
              tier = 'sea'; toTier = null; plunging = false; transMix = 0; tierT = 0; megaX = null; lift = 0; flow = 0; splashdowns++; warp++; landGrade = null;
              fromTier = null; splashAt = now; chain = 0;
              y = ground + tun.plungeM(); vy = Math.min(vy, -10); bouncing = true; edgeX = null; // the splashdown is never graded
              ctx.emit({ type: 'biomeReached', data: { biome: shown() } });
            }
          }
          // lean: left paddle / D-pad left = back (nose up), right = forward (nose down); a slight drift toward the flight path
          const lean = opts.autolean
            ? clamp((Math.atan(slopeAt(x + v * Math.min(0.25, (vy + Math.sqrt(vy * vy + 2 * gH * gScale() * Math.max(0, y - ground))) / (gH * gScale())))) - pitch) * 4, -1, 1)
            : leanInput();
          leanStep(lean, Math.atan2(vy, Math.max(1, v)), dt);
          if (y <= ground && !plunging) {
            const rel = vy - v * slope; // how hard you hit, relative to the slope you land on
            y = ground; landAt = now; landImpact = -rel;
            if (trick && now - trick.t0 >= 0.9) { style++; trick = null; }
            hopAir += now - hopT0; hops++; longestHop = Math.max(longestHop, now - hopT0);
            const raw = landingGrade(wrapPi(pitch - Math.atan(slope)), tun.perfectDeg(), tun.goodDeg(), tun.badDeg());
            const airT = now - hopT0; // a crest skip (barely leaves the road) is never graded; tiny hops earn nothing but can still go wrong
            const lg: Landing = airT < 0.15 || (raw !== 'bad' && airT < tun.gradeAirS()) ? 'ok' : raw;
            if (!bouncing) landGrade = lg; // the bounce after a bad landing keeps its 'bad' call-out
            if (lg === 'bad') spun = 0; // a flip that lands crossed up doesn't count
            if (lg === 'bad' && !bouncing) { // bad landing: bounce and lose speed (and the flow bonus)
              bads++; flow = 0; chain = 0; crashAt = now; v *= tun.badKeep(); bouncing = true; lift = Math.max(0, lift - tun.liftBad());
              vy = v * slope + 3 + Math.abs(rel) * 0.25; hopT0 = now; pitch = Math.atan(slope) + 0.35;
            } else {
              const mult = 1 + tun.chainStep() * Math.min(chain, 4); // clean landings in a row are worth more
              if (!bouncing && (lg === 'perfect' || lg === 'good')) { chain++; longestChain = Math.max(longestChain, chain); }
              else if (!bouncing && airT >= tun.gradeAirS()) chain = 0;
              if (!bouncing) landFlips(mult, now);
              if (!bouncing && lg === 'perfect') { perfects++; flow = Math.min(tun.flowMax(), flow + tun.flowPerfect() * mult); }
              else if (!bouncing && lg === 'good') flow = Math.min(tun.flowMax(), flow + tun.flowGood() * mult);
              flowPeak = Math.max(flowPeak, flow);
              if (rel < -7 && !bouncing && lg === 'ok') { vy = v * slope - rel * 0.22; hopT0 = now; bouncing = true; } // a little bounce off a hard flat landing
              else { bouncing = false; setMode('road'); pitch = Math.atan(slope); spun = 0; }
            }
          }
        }
      }
      // rings and stars up high: fly through them
      const H = airH();
      if (H && x > prevX) {
        for (let k = Math.floor(prevX / AIR_CELL); k <= Math.floor(x / AIR_CELL); k++) {
          const it = airItemAt(k, terrainSeed, H[0], H[1]);
          if (!it || caught.has(it.id) || it.x <= prevX || it.x > x) continue;
          const alt = y - (x - it.x) * (vy || 0) / Math.max(1, v) - roadH(it.x); // height as we crossed it
          if (Math.abs(alt - it.h) > (it.kind === 'ring' ? 3 : 2.2)) continue;
          caught.add(it.id); got.push({ id: it.id, kind: it.kind, at: now }); if (got.length > 12) got.shift();
          if (it.kind === 'ring') {
            rings++; flow = Math.min(tun.flowMax(), flow + tun.ringFlow()); v *= 1.04;
            lift = Math.min(1, lift + tun.ringLift() * (tier === 'moon' ? 0.5 : 1));
          } else { stars++; lift = Math.min(1, lift + tun.starLift() * (tier === 'moon' ? 0.5 : 1)); }
          ctx.emit({ type: 'collect', data: { kind: it.kind, tier } });
        }
      }
      prevX = x;
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
      if (tier === 'sea' && mode === 'road' && phase !== 'effort') gr += tun.seaGrade();
      if (wind && mode === 'road') gr -= wind * tun.windGrade();
      if (jet === 'on') gr = Math.max(gr, tun.jetGrade());
      if (mode === 'hop' && now - hopT0 > tun.hopAirGradeS()) gr = tun.airGrade(); // a long hop: light legs
      // debris stuck to you after a smash keeps dragging until it falls off
      if (mode !== 'smash' && mode !== 'bounce' && hay > 0) {
        if (!(phase === 'payoff' && mode === 'air')) gr += tun.smashGrade() * hay;
        hay = Math.max(0, hay - dt / Math.max(0.5, tun.smashHoldS()));
      }
      grade = +gr.toFixed(1);
      ctx.resistance.set({ id: 'terrain', mode: 'sim', gradePct: grade });

      if (!toTier) visit(tier === 'ground' ? (mix < 0.5 ? cur : next) : shown());
      // first-ride tips
      if (tip && now - tip.at > 7) { tip = null; lastTipEnd = now; }
      if (phase === 'approach' && phaseT < 6) offerTip('gears', 'Sprint coming: shift up a few gears now, then go all out when it says GO.', now);
      if (mode === 'hop' && now - hopT0 > 0.5 && !toTier) offerTip('lean', 'Airtime! Lean with the paddles or ◀ ▶ so you land parallel to the slope.', now);
      if (landGrade === 'perfect' || landGrade === 'good') offerTip('landing', 'Clean landing: that adds FLOW, free speed for the same watts. Land crossed up and you bounce.', now);
      if (tier === 'ground' && lift > 0.25) offerTip('lift', 'Keep the flow going to fill LIFT. When it\'s full, your next jump launches you into the sky.', now);
      if (tier === 'sky' && !toTier) offerTip('sky', `Sky Islands! Hold B and pedal above ${Math.round(tun.jetFtp() * 100)}% FTP to jet up to the rings.`, now);
      if (tier === 'moon' && !toTier) offerTip('moon', 'The Moon: low gravity and limited time. Rings give you more moon time.', now);
      if (tier === 'sea' && !toTier) offerTip('sea', 'Splashdown! Keep pedalling: you\'ll breach back up to the road.', now);
      if (wind < -0.3) offerTip('wind', 'Headwind: it\'s heavier for a while. A tailwind gives it back.', now);
      top = Math.max(top, v);
      ctx.debug('fullsend.phase', phase); ctx.debug('fullsend.kph', +(v * 3.6).toFixed(0)); ctx.debug('fullsend.grade', grade);
      if (piece) ctx.debug('fullsend.live', +piece.live.toFixed(2));
    },
    hud(): GameHud {
      if (menu) return { gears: false, controls: [{ button: 'dpad', label: 'Choose tour / options' }, { button: 'a', label: 'Start the ride', shortLabel: 'Start' }] };
      const s = set();
      const air = mode === 'air' || mode === 'hop';
      const controls: GameHud['controls'] = [
        { button: 'paddles', label: 'Lean in the air: left = back, right = forward. Land parallel to the road for speed', shortLabel: 'Lean', active: air },
        { button: 'left', label: 'Lean back (in the air)', shortLabel: 'Back', active: air, displayOrder: 0 },
        { button: 'right', label: 'Lean forward (in the air)', shortLabel: 'Fwd', active: air, displayOrder: 1 },
        { button: 'a', label: 'Trick (in the air)', shortLabel: 'Trick', active: air },
        { button: 'b', label: `Jet (sky and moon): hold and pedal above ${Math.round(tun.jetFtp() * 100)}% FTP to climb to the rings`, shortLabel: 'Jet', active: (tier === 'sky' || tier === 'moon') && !toTier },
      ];
      const base = { gears: true, controls, touchControls: ['left', 'right', 'a', 'b'] as GameHud['touchControls'] };
      if (phase === 'effort' && s && piece) {
        return { ...base, targetZone: { min: powerZone(piece.th[0]), max: 5, label: piece.title, source: 'power' } };
      }
      if (phase === 'approach' && piece) return { ...base, targetZone: { min: 1, max: 3, label: `Get ready: ${piece.title}` } };
      const fs = forkSet(), fw = forkWindow();
      if (fs >= 0 && tour.sets[fs].alt && phaseT >= fw[0] && phaseT < fw[1]) {
        const b = tour.sets[fs];
        base.controls = [
          { button: 'left', label: `Route: ${pieceTitle(b.kind, b.biome)}`, shortLabel: 'Route ◀', active: true, displayOrder: 0 },
          { button: 'right', label: `Route: ${pieceTitle(b.alt!.kind, b.alt!.biome)}`, shortLabel: 'Route ▶', active: true, displayOrder: 1 },
          ...controls.filter((c) => c.button !== 'left' && c.button !== 'right'),
        ];
      }
      if (jet) return { ...base, targetZone: { min: powerZone(tun.jetFtp()), max: 5, label: 'Jet: push!', source: 'power' } };
      if (phase === 'warmup') return { ...base, targetZone: { min: 1, max: 2, label: 'Warm-up' } };
      return { ...base, targetZone: { min: 1, max: 2, label: phase === 'cooldown' || phase === 'done' ? 'Cool-down' : 'Recover' } };
    },
    snapshot(): FullSendSnapshot {
      const now = ctx.clock.now();
      const nx = phase === 'warmup' ? setAt(0) : phase === 'recovery' ? setAt(setIndex + 1) : null;
      const fs = forkSet(), fw = forkWindow();
      const fork = fs >= 0 && tour.sets[fs].alt && phaseT >= fw[0] && phaseT < fw[1] ? {
        set: fs, pick: route[fs],
        options: [0, 1].map((r) => { const b = tour.sets[fs], k = r ? b.alt!.kind : b.kind, bi = r ? b.alt!.biome : b.biome; return { kind: k, biome: bi, title: pieceTitle(k, bi) }; }) as [ForkOption, ForkOption],
        closesInS: fw[1] - phaseT,
      } : null;
      const nextInfo = phase === 'approach' && piece ? { kind: piece.kind, title: piece.title, biome: piece.biome, inS: phaseS() - phaseT }
        : nx ? { kind: nx.kind, title: pieceTitle(nx.kind, nx.biome), biome: nx.biome, inS: phaseS() - phaseT + tun.approachS() } : null;
      return {
        t: now, tour: tour.id, tourName: tour.name, phase, phaseT, phaseS: phaseS(), setIndex, setCount: tour.sets.length,
        x, y, v, vy: mode === 'hop' || mode === 'air' ? vy : 0, pitch, mode, camX, hill, grade, terrainSeed, stretch: tun.hillStretch(), maxGrade, bumpScale: tun.bumps() ? tun.bumpScale() : 0,
        ...(toTier ? { biome: transMix < 0.5 ? transFrom : tierBiome(toTier), from: transFrom, to: tierBiome(toTier), mix: transMix }
          : tier !== 'ground' ? { biome: shown(), from: shown(), to: shown(), mix: 0 }
            : { biome: mix < 0.5 ? cur : next, from: cur, to: next, mix }),
        piece: piece ? { ...piece, hitAt: [...piece.hitAt] } : null,
        next: nextInfo, speedPerFtp: speedPerFtp(), ftpFrac: frac,
        trick: trick ? { name: trick.name, age: now - trick.t0 } : null, style,
        last: last ? { ...last, age: now - last.at } : null,
        results: [...results],
        topKph: top * 3.6, longestJumpM: longestJump, airS, smashed, rodeM: x, hay, landAt, landImpact, hops, flow, landGrade,
        tier, lift, alt: y - roadH(x), toTier, warp, edgeX, mega: megaX,
        fork, visited: [...visited],
        menu: menu ? { row: menuRow, tour: tour.id, reducedFlash, left: Math.max(0, tun.menuAutoS() - menuT),
          tours: TOUR_IDS.map((id) => { const b = save.best?.[id]; return { id, name: TOURS[id].name, minutes: tourMinutes(TOURS[id], tun.approachS()), best: b ? `${b.medals} · ${b.golds} gold` : null }; }) } : null,
        reducedFlash, tip: tip ? { id: tip.id, text: tip.text, age: now - tip.at } : null, wind, crashAt,
        fromTier, splashAt, jet, jetFtp: tun.jetFtp(), airH: airH(), got: got.map((g) => ({ ...g })), rings, stars, chain,
        fromLobby: !!lobbyBiome, loopV: mode === 'loop' ? loopV : 0,
        flip: flip ? { name: flip.name, age: now - flip.at } : null, spun,
        hazards: phase === 'payoff' && piece?.kind === 'leap' && (mode === 'air' || mode === 'fall') ? hazards.map((z) => ({ x: z.x, y: hazardY(z, leapT), vy: z.vy - z.g * (leapT - z.t0), hit: z.hit })) : [],
        scorchAt, leapSlow: phase === 'payoff' && piece?.kind === 'leap' && mode === 'air' ? 1 - (1 - tun.leapSlowMo()) * Math.sin(Math.PI * clamp((x - launchX) / Math.max(1, piece.x0 + piece.len - launchX), 0, 1)) ** 1.5 : 1,
        hooks: { shielded: phase === 'effort', seg: phase, lobbyBiome: cur, ...(wantPower !== undefined ? { powerFtp: wantPower } : {}) },
      };
    },
    isOver: () => !menu && phase === 'done',
    inMenu: () => menu,
    receive(a: unknown) { if (a && typeof a === 'object' && 'type' in a) actions.push(a as { type: string; value?: unknown }); },
    summary() {
      const n = (m: number) => results.filter((r) => r.medal === m).length;
      return {
        tour: tour.name, sets: results.length, gold: n(3), silver: n(2), bronze: n(1), missed: n(0),
        topKph: Math.round(top * 3.6), longestJumpM: Math.round(longestJump), smashed, tricks: style, hops, perfectLandings: perfects, badLandings: bads, flowPeakPct: Math.round(flowPeak * 100), hopAirS: +hopAir.toFixed(1), longestHopS: +longestHop.toFixed(2),
        skyVisits, moonVisits, splashdowns, peakAltM: Math.round(peakAlt), rings, stars, jetS: +jetS.toFixed(1), longestChain, flips, scorched,
        distanceKm: +(x / 1000).toFixed(1), route: route.map((r) => (r ? 'B' : 'A')).join(''), biomesSeen: new Set(visited).size, medals: results.map((r) => MEDAL_NAMES[r.medal][0]).join(''),
      };
    },
    dispose() { ctx.resistance.clear('terrain'); },
  };
  return sim;
}
