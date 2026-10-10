// Grand Theft Pedal sim: pure + deterministic (ctx.rng, fixed dt). Playground v1.
import type { GameContext, GameHud, GameSim } from '../../../contracts';
import { BIKES, isBikeKind, type BikeKind } from './bikes';
import { candidateLines, newBody, stepBody, type Body, type Params, type StepOut } from './physics';
import { behindTram, newTrams, stepTram, TRAM, tramAt, tramRoofY, type Tram } from './trams';
import { inPatch, lob, MAX_AMMO, pickLock, PICKUP_AMMO, radialLaunch, START_AMMO, stepProjectile, WEAPONS, type Blast, type Patch, type Projectile, type WeaponKind } from './weapons';
import { canSee, newCop, stepCop, type Cop, type CopKind, type CopParams } from './cops';
import { findPath, navNodes, visible, type NavNode } from './nav';
import { GATE_R, payout, progress, skipping, RIVAL_KINDS, RIVAL_NAMES, RIVAL_PACE, ROUTES, rubberBand, type Route } from './race';
import { DEALER, DEALER_STOCK, FENCE, fencePrice, GANG, GANG_REWARD, HECKLES, hotList, SHOUTS, TURF, UNWITNESSED } from './crime';
import { onGrass, onStairs, HALF, boxTop, BRIDGE, bridgeAngle, buildingAt, hash, CANAL, COOP, heightAt, LINES, nearestOnLine, PARKED_BIKES, PICKUPS, SPAWN } from './world';

export interface SimOpts {
  seed?: number;
  /** test/scene setup: start pose, explicit pedestrians (replaces the random crowd), starting heat, cops on/off, ammo */
  spawn?: { x: number; z: number; heading: number; mode?: 'bike' | 'foot' }; /** how a ride begins: on foot with no bike (the game) or already riding (tests/scenes). Default 'foot'. */ start?: 'bike' | 'foot'; /** starting bike kind when riding (tests/scenes) */ startKind?: BikeKind; /** scene hook: light mood override (render only) */ mood?: number; npcs?: Array<{ x: number; z: number }>; heat?: number; cops?: boolean; /** NPC cyclists (default: tunable, or 0 when `npcs` is given) */ cyclists?: number;
  /** explicit cyclists (tests/captures): ride `line` (default nearest path) in direction `dir` */ cyclistsAt?: Array<{ x: number; z: number; kind: BikeKind; line?: number; dir?: 1 | -1; cruise?: number }>; /** false = no trams (isolated tests) */ trams?: boolean;
  ammo?: Partial<Record<WeaponKind, number>>; startWeapon?: WeaponKind; copSpawn?: Array<{ kind: CopKind; x: number; z: number }>;
  /** autopilot also fires the locked weapon every few seconds */ autoFire?: boolean;
  /** scene setup: replace the parked bikes */ bikesAt?: Array<{ kind: BikeKind; x: number; z: number; heading: number }>;
  /** render look override (else the gtpedal.artStyle tunable) */ artStyle?: 'cel' | 'classic';
  /** scene/test hook: fire the current weapon at these sim times (s) */ fireAt?: number[]; autopilot?: boolean; /** autopilot sends it at the drawbridge instead of waiting */ daredevil?: boolean; /** daredevil autopilot asks the fake bike (target-follow script) for this × FTP; default 1.0 */ sprintFtp?: number;
  /** crime layer (witnesses, ambient reactions, rival gang). Default on, off for autopilot unless set. */ crime?: boolean; /** spawn the rival gang (default: with crime, unless explicit npcs) */ gang?: boolean; /** starting cash (tests/scenes; else the save) */ cash?: number; /** street races (default on, off for autopilot) */ races?: boolean; /** test/capture hook: steer the rider gate-to-gate during a race (power still from the trainer/script) */ autoRace?: boolean; /** race difficulty override (else tunable raceDiff) */ raceDiff?: number }
export type Mode = 'bike' | 'foot' | 'ragdoll';
export interface ParkedBike { id: number; x: number; z: number; heading: number; kind: BikeKind; flat: boolean; mine?: boolean }
export interface Npc { id: number; x: number; z: number; y: number; vx: number; vy: number; vz: number; heading: number; line: number; dir: 1 | -1; airS: number; alive: boolean; flailS: number; stunS: number;
  /** riding this bike (NPC cyclist) or null on foot */ bike: BikeKind | null; speed: number; cruise: number; /** angry after being bike-jacked: chases + shakes fist */ angryS: number; /** wobbly after getting up */ groggyS?: number; /** riding the back seat of your tandem */ stoker?: boolean;
  /** rival gang member */ gang?: boolean; /** witness on the phone: s left until the call goes through, and the heat it adds */ callS?: number; callHeat?: number;
  /** ambient reaction (render: pose + speech bubble) */ react?: 'shout' | 'flip' | 'heckle' | 'dodge'; reactS?: number; say?: string; /** tumble roll angle while skidding */ roll?: number;
  /** street-race rival */ racer?: boolean; racePassed?: number; raceName?: string; remountS?: number }
export type SteerLock = { kind: 'line' | 'npc' | 'bike'; id: number } | null;
export interface Pickup { kind: WeaponKind; x: number; z: number; readyAt: number }
export interface Snapshot {
  t: number; mode: Mode; rider: Body & { kind: BikeKind | null; flat: boolean; boost: number };
  ragdoll: { x: number; y: number; z: number; spin: number } | null;
  bikes: ParkedBike[]; npcs: Npc[]; bridge: number; weapon: WeaponKind; lock: number;
  /** locked target position (null = none) */ lockAt: { x: number; y: number; z: number; cop: boolean } | null;
  trams: Tram[]; onTram: boolean; hitched: boolean;
  cops: Cop[]; projectiles: Projectile[]; patches: Patch[]; blasts: Blast[]; pickups: Pickup[]; ammo: Record<WeaponKind, number>;
  /** render-only art style: 'cel' = calm cel-shaded world everywhere, 'classic' = plain blocks (debug) */ art: 'cel' | 'classic';
  busted: boolean; lostS: number; paint: number; spinOutS: number; lastEvent: string; lastEventAt: number;
  cam: { airLag: number; groundLag: number; airPull: number; airRise: number; airFov: number; lookMix: number };
  footTarget: number; steerLock: { kind: 'line' | 'npc' | 'bike'; id: number; x?: number; z?: number } | null; jackId: number; jackCamT: number; /** weapon wind-up in progress (aim, pin pull, light the rag, throw) */ cast: { w: WeaponKind; t0: number; dur: number } | null; lastShot: { w: WeaponKind; t: number } | null; stoker: number; stokerAt: { x: number; z: number; near: boolean } | null; goal: string; /** riding alongside a tram: Y = boosted hop onto the roof */ tramHopReady: boolean; look: { grit: number; mood: number }; fx: { speedLines: number; dust: number; shake: number; squash: number; smoke: number; speedLineMin: number }; heat: number; slope: number; gradePct: number; lastTrick: string; lastTrickAt: number;
  /** crime layer */ cash: number; rep: number; hot: BikeKind[]; fence: { near: boolean; price: number; hot: boolean } | null;
  dealer: { near: boolean; menu: { sel: number; items: Array<{ w: WeaponKind; qty: number; price: number; afford: boolean }> } | null };
  race: RaceSnap | null;
  gang: { provoked: boolean; left: number; respawnS: number }; msg: { text: string; at: number } | null;
  stats: Record<string, number>;
  /** fake-bike script hooks (target-follow reads powerFtp) */
  hooks?: { powerFtp: number };
}

export interface RaceResult { id: number; name: string; you: boolean; place: number; time: number | null; payout: number }
export interface RaceSnap { id: string; name: string; state: 'countdown' | 'racing' | 'done'; countdown: number; time: number; passed: number; total: number; lap: number; laps: number;
  pos: number; field: number; next: { x: number; z: number } | null; after: { x: number; z: number } | null; missed: boolean; drafting: boolean; results: RaceResult[] | null; best: number | null; buyIn: number; won: number }
const blocked = (x: number, z: number, y: number, br: number) => !!buildingAt(x, z) || heightAt(x, z, br) - y > 0.8;
const bank = (z: number) => (z < (CANAL.z0 + CANAL.z1) / 2 ? CANAL.z0 - 2 : CANAL.z1 + 2);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const AUTO_ROUTE: Array<[number, number]> = [[0, 86], [85, 86], [85, 8], [0, 8], [0, -100]];
/** daredevil: shuttle up and down the avenue over the drawbridge */
const DARE_ROUTE: Array<[number, number]> = [[0, 70], [0, -95]];
export interface GtpSave { raceBest?: Record<string, number>; races?: number; cash?: number; rep?: number; sales?: number; rides?: number; stealsTotal?: number; bestAirS?: number; gradeScale?: number; gradeMax?: number }

/** Structural twin of the shell's GameSetting (src/shell/gameSettings.ts); sims don't import the shell. */
export interface PauseSetting { key: string; label: string; value: number; min: number; max: number; step: number; digits?: number; unit?: string; hint?: string }

export function createGtpSim(ctx: GameContext, opts: SimOpts = {}): GameSim & { settings(): PauseSetting[] } {
  const T = ctx.tuning;
  const tun = {
    drive: T.num('drive', 9, 1, 30, 0.5, 'm/s² of drive at 1.0 FTP'),
    drag: T.num('drag', 0.012, 0, 0.1, 0.001, 'air drag k·v²'),
    rollDecay: T.num('rollDecay', 0.08, 0, 1, 0.01, 'rolling decay per m/s (low = generous coasting)'),
    topSpeed: T.num('topSpeed', 18, 5, 40, 0.5, 'base top speed m/s'),
    gravity: T.num('gravity', 14, 3, 30, 0.5, 'arcade gravity m/s²'),
    launchMul: T.num('launchMul', 1.35, 0.5, 3, 0.05, 'vertical speed kept off a lip'),
    climbMul: T.num('climbMul', 0.6, 0, 2, 0.05, 'how much slopes slow you'),
    gradeScale: T.num('gradeScale', 0.6, 0, 2, 0.05, 'trainer grade per % of slope'),
    gradeMax: T.num('gradeMax', 8, 0, 15, 0.5, 'trainer grade cap %'),
    turnRate: T.num('turnRate', 1.8, 0.3, 5, 0.1, 'rad/s free steer'),
    snapR: T.num('snapR', 4, 0.5, 15, 0.5, 'line snap radius m'),
    snapPull: T.num('snapPull', 4, 0.5, 15, 0.5, 'heading ease to line per s'),
    crashSpeed: T.num('crashSpeed', 7, 2, 20, 0.5, 'wall hit speed that ragdolls you'),
    ragdollS: T.num('ragdollS', 1.7, 0.5, 6, 0.1, 'player: seconds lying on the ground after a crash before getting up'),
    ragGravity: T.num('ragGravity', 36, 10, 80, 1, 'gravity for tumbling bodies (player ragdoll, NPCs, cops): heavy, not floaty'),
    npcDownS: T.num('npcDownS', 3.2, 0.5, 8, 0.1, 'NPCs/cops lie on the ground this long after a knockdown'),
    groggyS: T.num('groggyS', 1.4, 0, 5, 0.1, 'groggy wobble after getting up'),
    kbBlast: T.num('kbBlast', 8.5, 0, 20, 0.5, 'horizontal knockback m/s of an explosion at its centre (blast away from the centre)'),
    kbBike: T.num('kbBike', 5.5, 0, 15, 0.5, 'sideways knockback m/s when you plough into someone (plus a share of your speed forward)'),
    kbJack: T.num('kbJack', 6, 0, 15, 0.5, 'sideways yank m/s of a jacked rider'),
    kbHop: T.num('kbHop', 6.5, 2, 15, 0.5, 'upward m/s of a knockback (≈0.35 s arc at ragGravity 36)'),
    kbKeep: T.num('kbKeep', 0.8, 0, 1, 0.05, 'share of horizontal speed kept on the thud (rest of it is skid / tumble)'),
    tumbleFric: T.num('tumbleFric', 6.5, 1, 30, 0.5, 'm/s² friction of the post-thud tumble/skid'),
    slideFric: T.num('slideFric', 9, 1, 30, 0.5, 'm/s² friction of the post-thud slide'),
    trickBoost: T.num('trickBoost', 0.15, 0, 1, 0.05, 'top speed boost per landed trick'),
    boostCap: T.num('boostCap', 0.45, 0, 2, 0.05, 'max stacked boost'),
    boostS: T.num('boostS', 4, 0.5, 15, 0.5, 'boost decay time s'),
    hopV: T.num('hopV', 5, 1, 12, 0.5, 'hop vertical speed m/s'),
    grindR: T.num('grindR', 1.5, 0.3, 4, 0.1, 'grind catch radius m'),
    stealR: T.num('stealR', 3, 1, 8, 0.5, 'steal reach m'),
    lockRange: T.num('lockRange', 40, 5, 100, 1, 'lock-on range m'),
    lockCone: T.num('lockCone', 0.6, 0.1, 1.5, 0.05, 'lock-on half cone rad'),
    bazookaV: T.num('bazookaV', 12.5, 3, 40, 1, 'launch speed of a bazooka hit'),
    flatTopMul: T.num('flatTopMul', 0.5, 0.1, 1, 0.05, 'top speed with a flat'),
    heatCoolS: T.num('heatCoolS', 14, 2, 120, 1, 's per heat star cooled'),
    bridgePeriodS: T.num('bridgePeriodS', 40, 10, 120, 1, 'drawbridge cycle s'),
    bridgeMaxDeg: T.num('bridgeMaxDeg', 15, 0, 45, 1, 'drawbridge max leaf angle (gap grows with it, see world GAP)'),
    effortTop: T.num('effortTop', 0.5, 0, 1, 0.05, 'share of top speed that scales with effort (FTP sprint clears the bridge)'),
    camAirLag: T.num('camAirLag', 1.6, 0.2, 10, 0.1, 'camera vertical follow rate in the air (1/s; low = lag, airtime visible)'),
    camGroundLag: T.num('camGroundLag', 6, 1, 20, 0.5, 'camera vertical follow rate on the ground (1/s)'),
    camAirPull: T.num('camAirPull', 7, 0, 20, 0.5, 'extra pull-back (m) at full airtime'),
    camAirRise: T.num('camAirRise', 2.5, 0, 10, 0.5, 'extra camera height (m) at full airtime'),
    camAirFov: T.num('camAirFov', 10, 0, 30, 1, 'extra field of view (deg) at full airtime'),
    camLookMix: T.num('camLookMix', 0.5, 0, 1, 0.05, 'in the air, look point between ground (0) and rider (1)'),
    rocketSpeed: T.num('rocketSpeed', 35, 10, 80, 1, 'bazooka rocket m/s'),
    bazookaR: T.num('bazookaR', 4, 1, 10, 0.5, 'bazooka blast radius m'),
    grenadeFuse: T.num('grenadeFuse', 1.2, 0.2, 4, 0.1, 'grenade fuse after landing s'),
    grenadeR: T.num('grenadeR', 6, 1, 15, 0.5, 'grenade blast radius m'),
    grenadeV: T.num('grenadeV', 11, 3, 40, 1, 'grenade launch speed'),
    oilS: T.num('oilS', 30, 3, 120, 1, 'oil slick lifetime s'),
    glassS: T.num('glassS', 40, 3, 120, 1, 'glass patch lifetime s'),
    fireS: T.num('fireS', 8, 1, 30, 0.5, 'molotov fire lifetime s'),
    flailS: T.num('flailS', 3, 0.5, 10, 0.5, 'how long people run around on fire s'),
    spinOutS: T.num('spinOutS', 1.2, 0.2, 4, 0.1, 'oil spin-out duration s'),
    flatWobble: T.num('flatWobble', 0.7, 0, 3, 0.05, 'flat-tyre wobble rad/s'),
    pickupS: T.num('pickupS', 30, 5, 180, 1, 'ammo crate respawn s'),
    segwaySpeed: T.num('segwaySpeed', 15, 3, 30, 0.5, 'Segway cop top speed on flats'),
    horseSpeed: T.num('horseSpeed', 12, 3, 30, 0.5, 'horse cop top speed (any terrain)'),
    segwayRampMul: T.num('segwayRampMul', 0.3, 0.05, 1, 0.05, 'Segway speed share on slopes'),
    stairsMul: T.num('stairsMul', 0.2, 0.05, 1, 0.05, 'Segway speed share on stairs'),
    sightR: T.num('sightR', 70, 10, 200, 5, 'cop sight range m'),
    tackleR: T.num('tackleR', 1.8, 0.5, 4, 0.1, 'cop tackle reach m'),
    loseS: T.num('loseS', 8, 1, 60, 1, 'seconds out of every cop\'s sight to lose them'),
    loseDist: T.num('loseDist', 30, 0, 100, 1, 'and at least this far from the nearest cop m'),
    copSpawnD: T.num('copSpawnD', 75, 20, 150, 5, 'cops appear about this far away (off-screen, out of sight preferred)'),
    copSpawnS: T.num('copSpawnS', 3, 0.5, 30, 0.5, 'seconds between cop spawns while short of the heat quota'),
    artStyle: T.choice<'cel' | 'classic'>('artStyle', 'cel', ['cel', 'classic'], "render look: 'cel' = calm cel-shaded city everywhere (default); 'classic' = plain blocks (debug fallback)"),
    dpadRampS: T.num('dpadRampS', 0.5, 0.05, 2, 0.05, 'D-pad/arrow steer ramps from 35% to full over this many s'),
    steerSmoothS: T.num('steerSmoothS', 0.12, 0, 0.6, 0.02, 'paddle → handlebar smoothing time constant s (0 = raw)'),
    rampAssist: T.num('rampAssist', 0, 0, 1, 0.1, 'optional alignment assist on ramps/rails while free steering (0 = off)'),
    lockR: T.num('lockR', 12, 4, 30, 1, 'D-pad lock: lines within this many m are candidates'),
    runSpeed: T.num('runSpeed', 7, 2, 12, 0.5, 'on-foot speed at footFtp × FTP (m/s); power 0 = stand still'),
    footFtp: T.num('footFtp', 1, 0.3, 2, 0.05, 'fraction of FTP that gives full running speed'),
    footTurn: T.num('footTurn', 3, 0.5, 8, 0.5, 'on-foot paddle turn rate rad/s'),
    jackR: T.num('jackR', 2.8, 1, 6, 0.2, 'bike-jack reach m'),
    callS: T.num('callS', 3.2, 0.5, 10, 0.1, 'witness phone call: s until the heat lands'),
    witnessR: T.num('witnessR', 22, 5, 60, 1, 'how far bystanders notice a crime m'),
    callEscapeR: T.num('callEscapeR', 45, 10, 120, 1, 'get this far from a caller and the call fizzles m'),
    raceDiff: T.num('raceDiff', 1, 0, 2, 1, 'street race difficulty: 0 easy (~0.6 FTP wins), 1 normal (~0.75), 2 hard (~FTP+)'),
    raceRubber: T.num('raceRubber', 0.08, 0, 0.3, 0.01, 'rival rubber-band strength (± pace at 60 m gap)'),
    raceRivals: T.num('raceRivals', 4, 1, 5, 1, 'rival racers'),
    raceHeat: T.num('raceHeat', 0.05, 0, 0.5, 0.01, 'heat/s while racing (cops come to watch), up to 2.5 stars'),
    draftAccel: T.num('draftAccel', 0.8, 0, 3, 0.1, 'drafting push m/s² tucked in behind a rival'),
    gangSpeed: T.num('gangSpeed', 8.5, 2, 20, 0.5, 'rival gang chase speed m/s'),
    cyclists: T.num('cyclists', 40, 0, 80, 1, 'NPC cyclists going about their business (recycled to stay near you)'),
    peds: T.num('peds', 30, 0, 60, 1, 'extra pedestrians strolling the paths (recycled to stay near you)'),
    recycleR: T.num('recycleR', 95, 50, 300, 5, 'traffic farther than this from you respawns near you (behind the camera or 70-95 m ahead)'),
    tramHopV: T.num('tramHopV', 1.2, 0.3, 3, 0.1, 'tram hop: clearance over the roof, m'),
    fxSpeedLines: T.num('fxSpeedLines', 1, 0, 2, 0.1, 'VFX: speed-line strength'),
    fxSpeedLineMin: T.num('fxSpeedLineMin', 11, 4, 25, 0.5, 'VFX: speed lines above this m/s'),
    fxDust: T.num('fxDust', 1, 0, 2, 0.1, 'VFX: landing dust puffs'),
    fxShake: T.num('fxShake', 1, 0, 2, 0.1, 'VFX: screen shake on blasts/crashes'),
    fxSquash: T.num('fxSquash', 1, 0, 2, 0.1, 'VFX: squash & stretch on landings'),
    grit: T.num('grit', 1, 0, 1, 0.05, 'grit pass: grade desaturation/dust/grain (render only)'),
    mood: T.num('mood', 0, 0, 2, 1, 'light: 0 hazy late afternoon, 1 overcast, 2 late dusk (render only)'),
    fxSmoke: T.num('fxSmoke', 1, 0, 2, 0.1, 'VFX: cartoon smoke puffs'),
  };
  const P = (): Params => ({ drive: tun.drive(), drag: tun.drag(), rollDecay: tun.rollDecay(), topSpeed: tun.topSpeed(), gravity: tun.gravity(),
    launchMul: tun.launchMul(), climbMul: tun.climbMul(), turnRate: tun.turnRate(), snapR: tun.snapR(), snapPull: tun.snapPull(), assist: tun.rampAssist(),
    crashSpeed: tun.crashSpeed(), grindR: tun.grindR(), effortTop: tun.effortTop() });

  let hasHadBike = true;
  let t = 0, mode: Mode = 'bike', kind: BikeKind = 'city', flat = false, boost = 0, heat = 0, heatCool = 0;
  let rag: { x: number; y: number; z: number; vx: number; vy: number; vz: number; spin: number; s: number; down?: number } | null = null;
  let weaponI = 0, lock = -1, footTarget = -1, slope = 0, gradePct = 0, lastGrade = -99, lastTrick = '', lastTrickAt = -99;
  let routeI = 0, autoCool = 0, autoBrake = false;
  const body = newBody(SPAWN.x, SPAWN.z, SPAWN.heading);
  const grind = { s: 0 };
  const stats = { busts: 0, lostCops: 0, repaints: 0, copsLaunched: 0, shots: 0, flats: 0, pickups: 0, spinOuts: 0, distanceM: 0, airS: 0, maxAirS: 0, jumps: 0, crashes: 0, steals: 0, tricks: 0, grinds: 0, launches: 0, bridgeJumps: 0, splashes: 0, lineSwitches: 0, jacks: 0, cyclistsKnocked: 0, stokers: 0, tramHits: 0, tramRides: 0, hitches: 0, races: 0, raceWins: 0, checkpoints: 0, raceShoves: 0, draftS: 0, sales: 0, cashEarned: 0, buys: 0, witnessCalls: 0, callsStopped: 0, gangBeaten: 0, gangEscapes: 0, gangKnocks: 0, heckles: 0 };
  const trams: Tram[] = opts.trams === false ? [] : newTrams();
  let onTram: { id: number; ox: number; oz: number } | null = null, hitch = -1;
  let nextBikeId = 0;
  const bikes: ParkedBike[] = opts.bikesAt ? opts.bikesAt.map((b) => ({ id: nextBikeId++, ...b, flat: false })) : PARKED_BIKES.map((b) => ({ id: nextBikeId++, x: b.x, z: b.z, heading: 0, kind: isBikeKind(b.kind) ? b.kind : 'city', flat: false }));
  const npcs: Npc[] = [];
  const mkNpcBare = (i: number, x: number, z: number, line: number): Npc => ({ id: i, x, z, y: heightAt(x, z), vx: 0, vy: 0, vz: 0, heading: 0, line, dir: 1, airS: 0, alive: true, flailS: 0, stunS: 0, bike: null, speed: 0, cruise: 1.4, angryS: 0 });
  const mkNpc = (i: number, x: number, z: number, line: number): Npc => ({ id: i, x, z, y: heightAt(x, z), vx: 0, vy: 0, vz: 0, heading: 0, line, dir: ctx.rng() < 0.5 ? 1 : -1, airS: 0, alive: true, flailS: 0, stunS: 0, bike: null, speed: 0, cruise: 1.4, angryS: 0 });
  if (opts.npcs) opts.npcs.forEach((p, i) => npcs.push(mkNpc(i, p.x, p.z, -1)));
  else for (let i = 0; i < 14; i++) {
    const l = LINES[Math.floor(ctx.rng() * LINES.length)], p = l.pts[Math.floor(ctx.rng() * l.pts.length)];
    npcs.push(mkNpc(i, p[0], p[1], l.id));
  }
  if (!opts.npcs && opts.cyclists === undefined) for (let i = 0; i < Math.round(tun.peds()); i++) { // extra strollers (world hash, no rng)
    const walk = LINES.filter((l) => l.kind === 'path'), l = walk[Math.floor(hash(i, 31) * walk.length) % walk.length], sg = Math.floor(hash(i, 32) * (l.pts.length - 1)), u = hash(i, 33);
    const [ax, az] = l.pts[sg], [bx, bz] = l.pts[sg + 1];
    npcs.push({ ...mkNpcBare(3000 + i, ax + (bx - ax) * u + (hash(i, 34) - 0.5) * 3, az + (bz - az) * u + (hash(i, 35) - 0.5) * 3, l.id), dir: i % 2 ? 1 : -1, cruise: 1.1 + hash(i, 36) * 0.7 });
  }
  { // NPC cyclists: deterministic placement (world hash, no rng draws) on the path network, varied bikes
    const paths = LINES.filter((l) => l.kind === 'path');
    const KINDS: BikeKind[] = ['city', 'city', 'fixie', 'bmx', 'cargo', 'ebike', 'city', 'tandem', ...(opts.autopilot ? [] : ['scooter', 'scooter'] as BikeKind[])]; // autopilot world unchanged
    const n = opts.cyclists ?? (opts.npcs ? 0 : Math.round(tun.cyclists()));
    for (let i = 0; i < n; i++) {
      const l = paths[Math.floor(hash(i, 9) * paths.length) % paths.length], sg = Math.floor(hash(i, 3) * (l.pts.length - 1)), u = hash(i, 4);
      const [ax, az] = l.pts[sg], [bx, bz] = l.pts[sg + 1];
      const c: Npc = { ...mkNpcBare(1000 + i, ax + (bx - ax) * u, az + (bz - az) * u, l.id), dir: i % 2 ? 1 : -1, bike: KINDS[i % KINDS.length] };
      c.cruise = 4.5 + hash(i, 5) * 2.5 * BIKES[c.bike!].top; c.speed = c.cruise; npcs.push(c);
    }
    (opts.cyclistsAt ?? []).forEach((q, k) => {
      const line = q.line ?? paths.reduce((a, l) => (nearestOnLine(l, q.x, q.z).d < nearestOnLine(a, q.x, q.z).d ? l : a)).id;
      const c: Npc = { ...mkNpcBare(2000 + k, q.x, q.z, line), dir: q.dir ?? 1, bike: q.kind, cruise: q.cruise ?? 5 }; c.speed = c.cruise; npcs.push(c);
    });
  }
  if (opts.spawn) { body.x = opts.spawn.x; body.z = opts.spawn.z; body.heading = opts.spawn.heading; body.y = heightAt(body.x, body.z); if (opts.spawn.mode === 'foot') mode = 'foot'; if (opts.spawn.mode === 'bike') mode = 'bike'; }
  if (opts.startKind) kind = opts.startKind;
  if ((opts.start ?? 'foot') === 'foot' && !opts.spawn?.mode) {
    mode = 'foot'; hasHadBike = false;
    // first goal: steal a bike — send two pool cyclists past the start so there's something to jack right away
    const pool = npcs.filter((n) => n.id >= 1000 && n.id < 2000 && n.bike);
    const l0 = LINES[0];
    [[-26, 1], [34, -1]].forEach(([dz, dir], k) => { const c = pool[k]; if (!c || nearestOnLine(l0, body.x, body.z + dz).d > 3) return; c.x = body.x + (dir > 0 ? -1.2 : 1.2); c.z = body.z + dz; c.line = 0; c.dir = dir as 1 | -1; c.cruise = Math.min(c.cruise, 4.5); c.speed = c.cruise; c.y = heightAt(c.x, c.z); });
  }
  let dpadRamp = 0;
  let airStartZ = 0, walkRepath = 0;
  let walkPath: NavNode[] = [];
  const people = () => [...npcs, ...cops] as Array<Npc | Cop>;
  const cops: Cop[] = [];
  const projectiles: Projectile[] = [], patches: Patch[] = [], blasts: Blast[] = [];
  const pickups: Pickup[] = PICKUPS.map((p) => ({ ...p, readyAt: 0 }));
  const ammo: Record<WeaponKind, number> = { ...START_AMMO, ...(opts.ammo ?? {}) };
  let nextFx = 0, copId = 100, copSpawnT = 0, lostS = 0, coopCool = 0, busted = false, paint = 0, spinOutS = 0, lastEvent = '', lastEventAt = -99, autoFireT = 4;
  const event = (type: string, data?: Record<string, number | string | boolean>) => { lastEvent = type; lastEventAt = t; ctx.emit(data ? { type, data } : { type }); };
  const addHeat = (h: number) => { heat = Math.min(5, heat + h); heatCool = 0; };
  const CP = (): CopParams => ({ segwaySpeed: tun.segwaySpeed(), horseSpeed: tun.horseSpeed(), segwayRampMul: tun.segwayRampMul(), stairsMul: tun.stairsMul(), sightR: tun.sightR(), tackleR: tun.tackleR(), gravity: tun.ragGravity(), downS: tun.npcDownS(), kbKeep: tun.kbKeep(), tumbleFric: tun.tumbleFric() });
  if (opts.heat != null) heat = opts.heat;
  for (const c of opts.copSpawn ?? []) cops.push(newCop(copId++, c.kind, c.x, c.z));
  if (opts.startWeapon) weaponI = WEAPONS.indexOf(opts.startWeapon);
  const prev = ctx.load<GtpSave>() ?? {};
  // ---- crime layer: cash, fence, dealer, witnesses, rival gang ----
  const crimeOn = opts.crime ?? !opts.autopilot;
  let cash = opts.cash ?? prev.cash ?? 0, rep = prev.rep ?? 0, msg: { text: string; at: number } | null = null, heckleCool = 3;
  let menu: { sel: number } | null = null, padEdge = { l: 0, r: 0 };
  const gang = { provoked: false, outS: 0, done: false, respawnS: 0, throwT: 2, knockCool: 0, ids: [] as number[] };
  const say = (text: string) => { msg = { text, at: t }; };
  const spawnGang = () => {
    gang.ids = [];
    for (let i = 0; i < GANG.size; i++) {
      const a = (i / GANG.size) * Math.PI * 2, x = TURF.x + Math.cos(a) * 10, z = TURF.z + Math.sin(a) * 10, id = 500 + i;
      const old = npcs.findIndex((n) => n.id === id); if (old >= 0) npcs.splice(old, 1);
      npcs.push({ ...mkNpcBare(id, x, z, -1), bike: 'scooter', speed: 4, cruise: 4, heading: a + Math.PI / 2, gang: true }); gang.ids.push(id);
    }
    gang.provoked = false; gang.done = false; gang.outS = 0;
  };
  if (opts.gang ?? (crimeOn && !opts.npcs)) spawnGang();
  /** A crime: some heat now; the rest only if a bystander who saw it gets a call through. */
  const crime = (base: number, x: number, z: number) => {
    if (!crimeOn) { addHeat(base); return; }
    addHeat(base * UNWITNESSED);
    const ws = npcs.filter((n) => !n.bike && !n.gang && !n.racer && !n.stoker && n.airS <= 0 && n.stunS <= 0 && n.flailS <= 0 && n.angryS <= 0 && !(n.callS! > 0) && Math.hypot(n.x - x, n.z - z) < tun.witnessR() && visible(n.x, n.z, x, z))
      .sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z)).slice(0, 2);
    for (const n of ws) { n.callS = tun.callS(); n.callHeat = base * (1 - UNWITNESSED) + 0.4; n.reactS = 0; }
    if (ws.length) event('witness', { n: ws.length });
  };
  const fenceNear = () => mode === 'bike' && !body.air && Math.hypot(body.x - FENCE.x, body.z - FENCE.z) < FENCE.r;
  const dealerNear = () => mode !== 'ragdoll' && !body.air && Math.hypot(body.x - DEALER.x, body.z - DEALER.z) < DEALER.r;
  const hot = () => hotList(t, opts.seed ?? 0);
  const sell = () => {
    const isHot = hot().includes(kind), price = fencePrice(kind, flat, isHot);
    dropStoker(false); cash += price; stats.sales++; stats.cashEarned += price;
    mode = 'foot'; body.speed = 0; body.line = -1; steerLock = null;
    say(`SOLD ${BIKES[kind].label} · +$${price}${isHot ? ' (HOT LIST!)' : flat ? ' (flat tyre…)' : ''}`);
    event('fenceSale', { kind, price, hot: isHot }); persist();
  };
  // ---- street races ----
  const raceOn = opts.races ?? !opts.autopilot;
  const raceBest: Record<string, number> = { ...(prev.raceBest ?? {}) };
  let racesRun = 0;
  type RaceSt = { r: Route; state: 'countdown' | 'racing' | 'done'; t0: number; passed: number; ids: number[]; fin: Map<number, number>; missS: number; awayS: number; doneAt: number; bottleT: number; shoveT: number; results: RaceResult[] | null; won: number; drafting: boolean };
  let race: RaceSt | null = null;
  const routeNear = () => mode === 'bike' && !body.air ? ROUTES.find((r) => Math.hypot(body.x - r.start.x, body.z - r.start.z) < 5) : undefined;
  const raceTotal = (r: Route) => r.gates.length * r.laps;
  const segLen = (r: Route) => r.gates.reduce((a, g, i) => a + Math.hypot(g[0] - (i ? r.gates[i - 1][0] : r.start.x), g[1] - (i ? r.gates[i - 1][1] : r.start.z)), 0) / r.gates.length;
  const gridAt = (r: Route, slot: number) => { const f = [Math.sin(r.start.heading), Math.cos(r.start.heading)], rt = [-f[1], f[0]], row = Math.floor((slot + 1) / 2), side = slot === 0 ? 0 : slot % 2 ? 1 : -1; return { x: r.start.x - f[0] * row * 3 + rt[0] * side * 2.2, z: r.start.z - f[1] * row * 3 + rt[1] * side * 2.2 }; };
  const startRace = (r: Route) => {
    if (cash < r.buyIn) { say(`Organizer: "Buy-in's $${r.buyIn}. Beat it."`); event('raceBroke'); return; }
    cash -= r.buyIn; racesRun++; stats.races++;
    const ids: number[] = [];
    for (let i = 0; i < Math.round(tun.raceRivals()); i++) {
      const id = 600 + i, g = gridAt(r, i + 1), old = npcs.findIndex((n) => n.id === id); if (old >= 0) npcs.splice(old, 1);
      npcs.push({ ...mkNpcBare(id, g.x, g.z, -1), heading: r.start.heading, bike: RIVAL_KINDS[i % RIVAL_KINDS.length], racer: true, racePassed: 0, raceName: RIVAL_NAMES[i % RIVAL_NAMES.length] }); ids.push(id);
    }
    race = { r, state: 'countdown', t0: t, passed: 0, ids, fin: new Map(), missS: 0, awayS: 0, doneAt: 0, bottleT: 12, shoveT: 2, results: null, won: 0, drafting: false };
    dropStoker(false); steerLock = null; body.line = -1;
    say(`${r.name}${r.buyIn ? ` · buy-in $${r.buyIn}` : ''} · ${r.laps > 1 ? `${r.laps} laps` : 'sprint'}`); event('raceEnter', { route: r.id });
  };
  const raceProg = (passed: number, x: number, z: number) => race ? progress(race.r, passed, x, z) : 0;
  const endRace = (finished: boolean) => {
    if (!race || race.state === 'done') return;
    const rc = race, total = raceTotal(rc.r), field = rc.ids.length + 1, tNow = t - rc.t0 - 3;
    const ents = [{ id: -1, name: 'YOU', you: true, time: finished ? tNow : null, prog: finished ? total : raceProg(rc.passed, body.x, body.z) },
      ...rc.ids.map((id) => { const n = npcs.find((q) => q.id === id); return { id, name: n?.raceName ?? 'rival', you: false, time: rc.fin.get(id) ?? null, prog: n ? raceProg(n.racePassed ?? 0, n.x, n.z) : 0 }; })];
    ents.sort((a, b) => (a.time != null) !== (b.time != null) ? (a.time != null ? -1 : 1) : a.time != null ? a.time - b.time! : b.prog - a.prog);
    rc.results = ents.map((e, i) => ({ id: e.id, name: e.name, you: e.you, place: i, time: e.time, payout: e.you && finished ? payout(rc.r, i, field) : 0 }));
    const me = rc.results.find((e) => e.you)!;
    rc.won = me.payout; cash += me.payout; stats.cashEarned += me.payout; if (finished && me.place === 0) stats.raceWins++;
    if (finished && (raceBest[rc.r.id] == null || tNow < raceBest[rc.r.id])) raceBest[rc.r.id] = Math.round(tNow * 100) / 100;
    rc.state = 'done'; rc.doneAt = t;
    say(finished ? `${['1ST', '2ND', '3RD', '4TH', '5TH', '6TH'][me.place]} · ${tNow.toFixed(1)}s${me.payout ? ` · +$${me.payout}` : ''}` : 'Race abandoned');
    event(finished ? 'raceFinish' : 'raceQuit', { place: me.place, payout: me.payout }); persist();
  };
  /** Rival racer: hammer gate to gate (cutting corners = shortcuts), rubber-banded to you, shove, lob a bottle, remount when knocked off. */
  function stepRacer(n: Npc, dt: number, bridge: number) {
    const rc = race!; const total = raceTotal(rc.r);
    if (rc.state === 'countdown') { n.speed = 0; return; }
    if (!n.bike) { // knocked off: grab a dropped bike nearby, jack a cyclist, or produce a spare after a bit
      n.remountS = (n.remountS ?? 5) - dt;
      const b = bikes.filter((q) => Math.hypot(q.x - n.x, q.z - n.z) < 15).sort((a, c) => Math.hypot(a.x - n.x, a.z - n.z) - Math.hypot(c.x - n.x, c.z - n.z))[0];
      const cy = npcs.find((q) => q.bike && !q.racer && !q.gang && Math.hypot(q.x - n.x, q.z - n.z) < 2);
      if (cy) { n.bike = cy.bike; cy.bike = null; cy.airS = 0.01; cy.vy = 3; cy.vx = 2; cy.angryS = 6; n.remountS = undefined; event('rivalJack'); return; }
      if (b) { n.heading = Math.atan2(b.x - n.x, b.z - n.z); if (Math.hypot(b.x - n.x, b.z - n.z) < 1.2) { n.bike = b.kind; bikes.splice(bikes.indexOf(b), 1); n.remountS = undefined; return; } const nx = n.x + Math.sin(n.heading) * 4.5 * dt, nz = n.z + Math.cos(n.heading) * 4.5 * dt; if (!buildingAt(nx, nz)) { n.x = nx; n.z = nz; } n.y = heightAt(n.x, n.z, bridge); return; }
      if (n.remountS <= 0) { n.bike = RIVAL_KINDS[(n.id - 600) % RIVAL_KINDS.length]; n.remountS = undefined; }
      return;
    }
    const done = (n.racePassed ?? 0) >= total;
    const [gx, gz] = done ? [n.x + Math.sin(n.heading) * 5, n.z + Math.cos(n.heading) * 5] : rc.r.gates[(n.racePassed ?? 0) % rc.r.gates.length];
    if (!done && Math.hypot(gx - n.x, gz - n.z) < GATE_R) { n.racePassed = (n.racePassed ?? 0) + 1; if (n.racePassed >= total) { rc.fin.set(n.id, t - rc.t0 - 3); event('rivalFinish'); } }
    const lane = ((n.id % 5) - 2) * 1.1; // spread across the road
    const h0 = Math.atan2(gx - n.x, gz - n.z), tx = gx - Math.cos(h0) * lane, tz = gz + Math.sin(h0) * lane;
    let want = done ? 0 : RIVAL_PACE[Math.max(0, Math.min(2, Math.round(opts.raceDiff ?? tun.raceDiff())))] * (n.bike === 'scooter' ? 0.86 : 0.95 + 0.05 * BIKES[n.bike].top);
    const gapM = (raceProg(n.racePassed ?? 0, n.x, n.z) - (rc.state === 'racing' ? raceProg(rc.passed, body.x, body.z) : 0)) * segLen(rc.r);
    want *= rubberBand(gapM, tun.raceRubber());
    if (onStairs(n.x, n.z)) want *= n.bike === 'scooter' ? 0.3 : 0.7; else if (onGrass(n.x, n.z)) want *= n.bike === 'scooter' ? 0.45 : 0.8;
    let hd = Math.atan2(tx - n.x, tz - n.z);
    const free = (h: number) => { const px = n.x + Math.sin(h) * 3, pz = n.z + Math.cos(h) * 3; return !buildingAt(px, pz) && heightAt(px, pz, bridge) > -2; };
    const wet = (h: number, d: number) => heightAt(n.x + Math.sin(h) * d, n.z + Math.cos(h) * d, bridge) < -2;
    if (wet(hd, 3) || wet(hd, 6)) want = 0; // drawbridge up: wait at the gap
    else if (!free(hd)) { const alt = [0.5, -0.5, 1, -1].map((o) => hd + o).find(free); if (alt != null) hd = alt; else want = 0; }
    if (tramAt(trams, n.x + Math.sin(hd) * 4, n.z + Math.cos(hd) * 4, 1.2)) want = Math.min(want, 2); // brake for a tram
    n.heading += Math.max(-3 * dt, Math.min(3 * dt, wrap(hd - n.heading)));
    n.speed += Math.max(-7 * dt, Math.min(3.2 * dt, want - n.speed));
    const nx = n.x + Math.sin(n.heading) * n.speed * dt, nz = n.z + Math.cos(n.heading) * n.speed * dt;
    if (!buildingAt(nx, nz) && heightAt(nx, nz, bridge) > -2) { n.x = nx; n.z = nz; } else n.speed *= 0.3;
    n.y = heightAt(n.x, n.z, bridge);
    // dirty tricks
    const pd = Math.hypot(body.x - n.x, body.z - n.z);
    if (rc.state === 'racing' && mode === 'bike' && pd < 1.5 && rc.shoveT <= 0) {
      rc.shoveT = 4; stats.raceShoves++; const sx = (body.x - n.x) / Math.max(0.1, pd), sz = (body.z - n.z) / Math.max(0.1, pd);
      if (!buildingAt(body.x + sx * 0.8, body.z + sz * 0.8)) { body.x += sx * 0.8; body.z += sz * 0.8; } body.speed *= 0.88; event('raceShove');
      if (body.speed > 10 && hash(n.id, Math.floor(t)) < 0.15) crash(sx * tun.kbBike() + Math.sin(body.heading) * 3, sz * tun.kbBike() + Math.cos(body.heading) * 3, 2);
    }
    if (rc.state === 'racing' && rc.bottleT <= 0 && pd > 6 && pd < 20 && gapM < 0 && !done) {
      rc.bottleT = 14 + hash(n.id, Math.floor(t)) * 6; const sy = n.y + 1.5, lx = body.x + Math.sin(body.heading) * body.speed * 0.8, lz = body.z + Math.cos(body.heading) * body.speed * 0.8;
      projectiles.push({ id: nextFx++, kind: 'bottle', x: n.x, y: sy, z: n.z, ...lob(n.x, sy, n.z, lx, heightAt(lx, lz, bridge), lz, 0.6, tun.gravity()), fuse: 9, landed: false, age: 0 }); event('rivalBottle');
    }
  }
  // rider-facing pause-menu settings (persisted); fall back to the debug tunables
  const user = { gradeScale: prev.gradeScale, gradeMax: prev.gradeMax };
  const gScale = () => user.gradeScale ?? tun.gradeScale(), gMax = () => user.gradeMax ?? tun.gradeMax();
  let curBridge = 0, padSm = 0, arrowSteer = false;
  let steerLock: SteerLock = null;
  let cast: { w: WeaponKind; t0: number; dur: number } | null = null, lastShot: { w: WeaponKind; t: number } | null = null;
  let groggy = 0, stoker = -1, screamT = 2;
  const WINDUP: Record<WeaponKind, number> = { bazooka: 0.2, grenade: 0.45, bottle: 0.3, molotov: 0.4, oil: 0.12 };
  const TANDEM_SOLO = { ...BIKES.tandem, power: 0.45, top: 0.62, turn: 0.45 }, TANDEM_DUO = { ...BIKES.tandem, power: 1.8, top: 1.3 };
  const bikeSpec = () => kind === 'tandem' ? (stoker >= 0 ? TANDEM_DUO : TANDEM_SOLO) : kind === 'scooter' ? scooterSpec(body.x, body.z) : BIKES[kind];
  /** tiny wheels: grass bogs a scooter right down, stairs rattle it to a crawl */
  const scooterSpec = (x: number, z: number) => onStairs(x, z) ? { ...BIKES.scooter, power: 0.3, top: 0.22 } : onGrass(x, z) ? { ...BIKES.scooter, power: 0.35, top: 0.3, turn: 1.2 } : BIKES.scooter;
  /** A bystander close enough to snatch onto the tandem's back seat. */
  const stokerCand = (r: number): Npc | undefined => mode !== 'bike' || kind !== 'tandem' || stoker >= 0 ? undefined : npcs.filter((n) => !n.bike && !n.stoker && !n.gang && !n.racer && !(n.callS! > 0) && n.airS <= 0 && n.stunS <= 0 && n.angryS <= 0 && n.alive && Math.hypot(n.x - body.x, n.z - body.z) < r)
    .sort((a, b) => Math.hypot(a.x - body.x, a.z - body.z) - Math.hypot(b.x - body.x, b.z - body.z))[0];
  const dropStoker = (tumble: boolean) => {
    const n = npcs.find((q) => q.id === stoker); stoker = -1; if (!n) return;
    n.stoker = false; n.x = body.x - Math.sin(body.heading) * 1.2; n.z = body.z - Math.cos(body.heading) * 1.2; n.y = heightAt(n.x, n.z, curBridge);
    if (tumble) { n.airS = 0.01; n.vy = tun.kbHop(); n.vx = Math.sin(body.heading) * body.speed * 0.4 - Math.cos(body.heading) * tun.kbBike(); n.vz = Math.cos(body.heading) * body.speed * 0.4 + Math.sin(body.heading) * tun.kbBike(); } else n.stunS = 0.5;
    n.flailS = 3;
  };
  let jackCamT = -99, tramHop: number = -1, recycleT = 0.5, recycleN = 0;
  let bridgeTry: { effort: number } | null = null;
  let saveAt = 30, saved = false;
  const persist = () => ctx.save({ raceBest: { ...raceBest }, races: (prev.races ?? 0) + racesRun, cash: Math.round(cash), rep, sales: (prev.sales ?? 0) + stats.sales, rides: (prev.rides ?? 0) + 1, stealsTotal: (prev.stealsTotal ?? 0) + stats.steals, bestAirS: Math.max(prev.bestAirS ?? 0, Math.round(stats.maxAirS * 10) / 10),
    ...(user.gradeScale != null ? { gradeScale: user.gradeScale } : {}), ...(user.gradeMax != null ? { gradeMax: user.gradeMax } : {}) } satisfies GtpSave);

  const trick = (name: string, mag: number) => {
    boost = Math.min(tun.boostCap(), boost + tun.trickBoost() * mag);
    lastTrick = name; lastTrickAt = t; stats.tricks++;
    ctx.emit({ type: 'trick', data: { name } });
  };
  const crash = (vx: number, vz: number, up: number, confiscate = false) => {
    if (stoker >= 0) dropStoker(true);
    if (!confiscate) stats.crashes++;
    const bz = heightAt(body.x, body.z, curBridge) < -2 || (body.z > CANAL.z0 && body.z < CANAL.z1) ? bank(body.z) : body.z;
    if (!confiscate && mode === 'bike') bikes.push({ id: nextBikeId++, x: body.x, z: bz, heading: body.heading, kind, flat, mine: true });
    rag = { x: body.x, y: body.y + 0.6, z: body.z, vx, vy: Math.max(tun.kbHop() * 0.6, Math.min(up * 0.55, 6)), vz, spin: 0, s: 0 }; // heavy, low tumble
    mode = 'ragdoll'; body.speed = 0; body.air = false; body.line = -1; boost = 0;
    if (!confiscate) ctx.emit({ type: 'crash', data: { x: Math.round(body.x), z: Math.round(body.z), y: Math.round(body.y * 10) / 10 } });
  };
  const mount = (b: ParkedBike) => {
    bikes.splice(bikes.indexOf(b), 1);
    kind = b.kind; flat = b.flat; mode = 'bike'; body.line = -1; footTarget = -1; hasHadBike = true;
    if (!b.mine) { stats.steals++; crime(0.5, b.x, b.z); }
    if (!b.mine) ctx.emit({ type: 'steal', data: { kind } });
  };
  type LockCand = { kind: 'line' | 'npc' | 'bike'; id: number; side: number; d: number };
  /** Bike lock candidates, left→right: lines roughly along your heading within lockR + NPC cyclists ahead. */
  const bikeLockCands = (): LockCand[] => {
    const out: LockCand[] = candidateLines(body, tun.lockR(), 0.9).map((c) => ({ kind: 'line' as const, id: c.line.id, side: c.side, d: c.d }));
    for (const n of npcs) if (n.bike && n.airS <= 0) {
      const dx = n.x - body.x, dz = n.z - body.z, d = Math.hypot(dx, dz);
      if (d > 35 || d < 1 || Math.abs(wrap(Math.atan2(dx, dz) - body.heading)) > 0.8) continue;
      out.push({ kind: 'npc', id: n.id, side: -dx * Math.cos(body.heading) + dz * Math.sin(body.heading), d });
    }
    return out.sort((a, b) => a.side - b.side);
  };
  /** On-foot lock candidates, left→right by bearing: parked bikes, cyclists, pedestrians. */
  const footLockCands = (): LockCand[] => {
    const out: LockCand[] = [];
    const add = (kind: 'bike' | 'npc', id: number, x: number, z: number, r: number) => { const d = Math.hypot(x - body.x, z - body.z); if (d < r && d > 0.3) out.push({ kind, id, d, side: -wrap(Math.atan2(x - body.x, z - body.z) - body.heading) }); };
    for (const b of bikes) add('bike', b.id, b.x, b.z, 60);
    for (const n of npcs) if (n.airS <= 0) add('npc', n.id, n.x, n.z, 40);
    return out.sort((a, b) => a.side - b.side);
  };
  /** Position of the current target lock (bike / npc); clears a stale lock. */
  const lockPos = (): { x: number; z: number } | null => {
    if (!steerLock || steerLock.kind === 'line') return null;
    if (steerLock.kind === 'bike') { const b = bikes.find((q) => q.id === steerLock!.id); if (b) return b; }
    else { const n = npcs.find((q) => q.id === steerLock!.id); if (n && n.airS <= 0 && Math.hypot(n.x - body.x, n.z - body.z) < 70) return n; }
    steerLock = null; return null;
  };
  const jackable = (): Npc | undefined => npcs.filter((n) => n.bike && n.airS <= 0 && n.stunS <= 0 && Math.hypot(n.x - body.x, n.z - body.z) < tun.jackR())
    .sort((a, b) => Math.hypot(a.x - body.x, a.z - body.z) - Math.hypot(b.x - body.x, b.z - body.z))[0];
  /** A tram you're riding right alongside (close to its side, within its length): Y hops onto the roof. */
  const hopTram = () => mode !== 'bike' || body.air ? null : trams.find((tr) => Math.abs(tr.x - body.x) < TRAM.len / 2 + 0.5 && Math.abs(tr.z - body.z) > TRAM.w / 2 + 0.35 && Math.abs(tr.z - body.z) < TRAM.w / 2 + 2.6) ?? null;
  /** Rip a cyclist off their bike and ride away on it. */
  const jack = (n: Npc) => {
    const was = mode;
    if (was === 'bike') bikes.push({ id: nextBikeId++, x: body.x, z: body.z, heading: body.heading, kind, flat, mine: true }); // old bike clatters to the ground
    hasHadBike = true; kind = n.bike!; flat = false; mode = 'bike'; body.line = -1; body.grindAuto = false; steerLock = null; footTarget = -1;
    if (was === 'foot') { body.heading = n.heading; body.speed = n.speed * 0.7; } else body.speed *= 0.85;
    body.x = n.x; body.z = n.z; body.y = heightAt(n.x, n.z, curBridge);
    const rx = -Math.cos(n.heading), rz = Math.sin(n.heading); // yanked off to the right
    const fx = Math.sin(body.heading), fz = Math.cos(body.heading), fwd = body.speed + 2.5; // flung ahead & aside so the chase cam sees the tumble
    n.bike = null; n.speed = 0; n.airS = 0.01; n.vx = fx * fwd * 0.45 + rx * tun.kbJack(); n.vz = fz * fwd * 0.45 + rz * tun.kbJack(); n.angryS = 10; jackCamT = t; n.vy = tun.kbHop();
    stats.jacks++; stats.steals++; crime(1, body.x, body.z); event('bikejack', { kind });
  };
  /** Knock a cyclist off (weapons, oil, trams, collisions): their bike drops where they were. */
  const dropBike = (n: Npc) => { if (!n.bike) return; bikes.push({ id: nextBikeId++, x: n.x, z: n.z, heading: n.heading, kind: n.bike, flat: false }); n.bike = null; n.speed = 0; stats.cyclistsKnocked++; };

  /** Rival gang rider: cruise the turf; once provoked, chase you (or a nearby cop), ram, and lob bottles. */
  function stepGanger(n: Npc, dt: number, bridge: number) {
    const cop = cops.find((c) => c.airS <= 0 && c.stunS <= 0 && Math.hypot(c.x - n.x, c.z - n.z) < 18);
    const pd = Math.hypot(body.x - n.x, body.z - n.z);
    let tx = TURF.x + Math.cos(t * 0.3 + n.id) * 12, tz = TURF.z + Math.sin(t * 0.3 + n.id) * 12, want = 4;
    let tgt: 'you' | 'cop' | null = null;
    if (gang.provoked && mode !== 'ragdoll') { tx = body.x; tz = body.z; want = tun.gangSpeed(); tgt = 'you'; }
    if (cop && (!tgt || Math.hypot(cop.x - n.x, cop.z - n.z) < pd)) { tx = cop.x; tz = cop.z; want = tun.gangSpeed(); tgt = 'cop'; }
    if (onStairs(n.x, n.z)) want *= 0.25; else if (onGrass(n.x, n.z)) want *= 0.4; // scooters: zippy on paving, hopeless on grass
    const dh = wrap(Math.atan2(tx - n.x, tz - n.z) - n.heading); n.heading += Math.max(-2.6 * dt, Math.min(2.6 * dt, dh));
    n.speed += Math.max(-6 * dt, Math.min(3 * dt, want - n.speed));
    const nx = n.x + Math.sin(n.heading) * n.speed * dt, nz = n.z + Math.cos(n.heading) * n.speed * dt;
    if (!buildingAt(nx, nz) && heightAt(nx, nz, bridge) > -2 && Math.abs(nx) < HALF - 2 && Math.abs(nz) < HALF - 2) { n.x = nx; n.z = nz; } else { n.heading += 1.8; n.speed *= 0.5; }
    n.y = heightAt(n.x, n.z, bridge);
    if (tgt === 'you' && pd < 1.5 && gang.knockCool <= 0 && !(onTram)) { // ram you off
      gang.knockCool = 5; stats.gangKnocks++; event('gangKnock');
      crash(Math.sin(n.heading) * 3 + Math.cos(n.heading) * tun.kbBike(), Math.cos(n.heading) * 3 - Math.sin(n.heading) * tun.kbBike(), 3);
    } else if (tgt === 'cop' && cop && Math.hypot(cop.x - n.x, cop.z - n.z) < 1.6) { cop.airS = 0.01; cop.vy = tun.kbHop(); cop.vx = Math.sin(n.heading) * 3 + Math.cos(n.heading) * tun.kbBike(); cop.vz = Math.cos(n.heading) * 3 - Math.sin(n.heading) * tun.kbBike(); event('gangVsCop'); }
    if (tgt) { // lob a bottle now and then
      const td = tgt === 'you' ? pd : Math.hypot(tx - n.x, tz - n.z);
      if (n.id === gang.ids[Math.floor(t / 3) % gang.ids.length] && gang.throwT <= 0 && td > 5 && td < 24) {
        gang.throwT = 2.2; const sy = n.y + 1.5;
        projectiles.push({ id: nextFx++, kind: 'bottle', x: n.x, y: sy, z: n.z, ...lob(n.x, sy, n.z, tx, heightAt(tx, tz, bridge), tz, 0.6, tun.gravity()), fuse: 9, landed: false, age: 0 });
        event('gangThrow');
      }
    }
  }
  function update(dt: number) {
    t += dt;
    const inp = ctx.input(), bk = ctx.bike();
    const ftp = Math.max(50, ctx.profile.ftp || 200);
    const effort = Math.max(0, Math.min(2, bk.power3s / ftp));
    const bridgeAt = (tt: number) => bridgeAngle(tt, tun.bridgePeriodS(), (tun.bridgeMaxDeg() * Math.PI) / 180);
    const bridge = bridgeAt(t); curBridge = bridge;
    const auto = !!opts.autopilot;
    // paddles: tap vs hold
    for (const tr of trams) stepTram(tr, dt);
    // PADDLES: proportional free steering (handlebars), smoothed; in the air they spin you. No line snapping.
    const pl = Math.abs(inp.paddleL), pr = Math.abs(inp.paddleR);
    const padRaw = Math.max(-1, Math.min(1, (pl > 0.12 ? pl : 0) - (pr > 0.12 ? pr : 0)));
    const sm = tun.steerSmoothS();
    padSm = sm > 0 ? padSm + (padRaw - padSm) * (1 - Math.exp(-dt / sm)) : padRaw;
    if (padRaw === 0 && Math.abs(padSm) < 0.02) padSm = 0;
    const paddleActive = padRaw !== 0;
    // D-PAD / arrows: taps cycle a lock (line or target) and the bike/walker auto-steers along it; with nothing to
    // lock onto, a held arrow is plain ramped steering. Any paddle input cancels the lock.
    const dL = inp.held.has('left'), dR = inp.held.has('right');
    const tapL = inp.pressed.has('left'), tapR = inp.pressed.has('right');
    dpadRamp = dL || dR ? Math.min(1, dpadRamp + dt / tun.dpadRampS()) : 0;
    if (paddleActive && steerLock) { steerLock = null; body.line = -1; body.grindAuto = false; arrowSteer = false; }
    if ((tapL || tapR) && !auto && !menu) {
      const c = mode === 'bike' ? bikeLockCands() : mode === 'foot' ? footLockCands() : [];
      if (!c.length) arrowSteer = true;
      else {
        arrowSteer = false;
        const cur = steerLock ? c.find((e) => e.kind === steerLock!.kind && e.id === steerLock!.id) : undefined;
        let pick: LockCand | undefined;
        if (!cur) pick = tapL ? [...c].filter((e) => e.side <= 0.5).sort((a, b) => b.side - a.side)[0] ?? c[0] : c.filter((e) => e.side >= -0.5).sort((a, b) => a.side - b.side)[0] ?? c[c.length - 1];
        else pick = tapL ? [...c].reverse().find((e) => e.side < cur.side - 0.3) : c.find((e) => e.side > cur.side + 0.3);
        if (pick && (!steerLock || pick.kind !== steerLock.kind || pick.id !== steerLock.id)) { steerLock = { kind: pick.kind, id: pick.id }; stats.lineSwitches++; if (pick.kind === 'line') { body.line = pick.id; body.grindAuto = false; } else body.line = -1; }
      }
    }
    if (!dL && !dR) arrowSteer = arrowSteer && false;
    const arrow = arrowSteer && (dL || dR) ? ((dL ? 1 : 0) - (dR ? 1 : 0)) * (0.35 + 0.65 * dpadRamp) : 0;
    let steer = paddleActive || padSm !== 0 ? padSm : arrow;
    let freeSteer = true;
    const airSpin = padRaw;
    const eat = new Set<string>();
    const press = (b: 'a' | 'b' | 'y' | 'z') => inp.pressed.has(b) && !eat.has(b);
    // ---- fence & dealer (Ⓐ near them takes priority over jack / dismount) ----
    if (menu) {
      const edgeL = pl > 0.6 && padEdge.l <= 0.6, edgeR = pr > 0.6 && padEdge.r <= 0.6, n = DEALER_STOCK.length;
      if (tapL || edgeL) menu.sel = (menu.sel + n - 1) % n; if (tapR || edgeR) menu.sel = (menu.sel + 1) % n;
      if (press('a')) {
        const it = DEALER_STOCK[menu.sel];
        if (cash >= it.price) { cash -= it.price; ammo[it.w] = Math.min(MAX_AMMO + it.qty, ammo[it.w] + it.qty); weaponI = WEAPONS.indexOf(it.w); stats.buys++; say(`Bought ${it.qty}× ${it.w} · −$${it.price}`); event('buy', { weapon: it.w, price: it.price }); persist(); }
        else { say(`Van Guy: "Come back with $${it.price}, pal."`); event('broke'); }
      }
      if (press('b') || !dealerNear()) { menu = null; event('dealerClose'); }
      eat.add('a'); eat.add('b');
    } else if (!auto && press('a') && dealerNear()) { menu = { sel: 0 }; eat.add('a'); say('Van Guy: "Psst. Lookin’ to buy?"'); event('dealerOpen'); }
    else if (!auto && press('a') && fenceNear() && body.speed < 4) { sell(); eat.add('a'); }
    else if (!auto && raceOn && !race && press('a') && routeNear() && !jackable()) { startRace(routeNear()!); eat.add('a'); }
    padEdge = { l: pl, r: pr };
    // weapons cycle
    if (inp.pressed.has('shiftUpL') || inp.pressed.has('shiftUpR')) weaponI = (weaponI + 1) % WEAPONS.length;
    if (inp.pressed.has('shiftDnL') || inp.pressed.has('shiftDnR')) weaponI = (weaponI + WEAPONS.length - 1) % WEAPONS.length;

    if (mode === 'ragdoll' && rag) {
      rag.s += dt; rag.vy -= tun.ragGravity() * dt; rag.x += rag.vx * dt; rag.y += rag.vy * dt; rag.z += rag.vz * dt; if (!rag.down) rag.spin += dt * 9;
      { const lim = HALF - 2; if (Math.abs(rag.x) > lim) { rag.x = Math.sign(rag.x) * lim; rag.vx *= -0.4; } if (Math.abs(rag.z) > lim) { rag.z = Math.sign(rag.z) * lim; rag.vz *= -0.4; } }
      if (buildingAt(rag.x, rag.z)) { rag.vx *= -0.4; rag.vz *= -0.4; rag.x += rag.vx * dt * 2; rag.z += rag.vz * dt * 2; }
      const g = heightAt(rag.x, rag.z, bridge);
      if (rag.y <= g) { // thud, short slide, lie there
        if (!rag.down) { rag.down = 0.0001; rag.vx *= tun.kbKeep(); rag.vz *= tun.kbKeep(); event('thud'); }
        rag.y = g; rag.vy = 0; rag.down += dt;
        const v = Math.hypot(rag.vx, rag.vz), nv = Math.max(0, v - tun.tumbleFric() * dt); if (v > 0) { rag.vx *= nv / v; rag.vz *= nv / v; rag.spin += nv * dt / 0.35; }
      }
      if ((rag.down ?? 0) > tun.ragdollS() || rag.s > 8) {
        if (g < -2) rag.z = bank(rag.z);
        if (busted) { // escorted to the nearest path, a little way off, on foot
          const N = navNodes(); let best = N[0], bd = Infinity;
          for (const nd of N) { const d = Math.abs(Math.hypot(nd.x - rag.x, nd.z - rag.z) - 15); if (d < bd) { bd = d; best = nd; } }
          rag.x = best.x; rag.z = best.z; busted = false;
        }
        body.x = rag.x; body.z = rag.z; body.y = heightAt(body.x, body.z, bridge); rag = null; mode = 'foot'; groggy = tun.groggyS();
      }
    } else if (mode === 'foot') {
      // power → walk / jog / run (scaled by FTP); zero power = stand still
      const spd = effort <= 0.02 ? 0 : tun.runSpeed() * Math.min(1.3, Math.pow(effort / tun.footFtp(), 0.8));
      if (auto) { let bb: ParkedBike | undefined, bd = Infinity; for (const b of bikes) { const d = Math.hypot(b.x - body.x, b.z - body.z); if (d < bd) { bd = d; bb = b; } } steerLock = bb ? { kind: 'bike', id: bb.id } : null; }
      const tp = lockPos();
      let d = Infinity;
      if (groggy > 0) groggy -= dt;
      if (tp && auto) { // autopilot only: walk to it along the nav graph
        d = Math.hypot(tp.x - body.x, tp.z - body.z);
        walkRepath -= dt;
        if (walkRepath <= 0) { walkPath = findPath(body.x, body.z, tp.x, tp.z); walkRepath = 1; }
        while (walkPath.length > 1 && Math.hypot(walkPath[0].x - body.x, walkPath[0].z - body.z) < 1.5) walkPath.shift();
        const wp = walkPath[0] ?? tp;
        body.heading = Math.atan2(wp.x - body.x, wp.z - body.z);
      } else { // like a bike: paddles turn proportionally, power walks you forward; a D-pad lock only nudges you toward it when you're not steering
        body.heading = wrap(body.heading + steer * tun.footTurn() * dt);
        if (tp && Math.abs(steer) < 0.05) { const da = wrap(Math.atan2(tp.x - body.x, tp.z - body.z) - body.heading); body.heading = wrap(body.heading + Math.sign(da) * Math.min(Math.abs(da), tun.footTurn() * 0.4 * dt)); }
        if (tp) d = Math.hypot(tp.x - body.x, tp.z - body.z);
        if (groggy > 0) body.heading = wrap(body.heading + Math.sin(t * 7) * dt * 1.2); // woozy
      }
      body.speed = 0;
      if (spd > 0 && d > 1.2) {
        for (const off of [0, 0.7, -0.7, 1.4, -1.4]) { // slide along walls, trunks and hedges instead of sticking
          const sp2 = groggy > 0 ? spd * 0.45 : spd, h = body.heading + off, nx = body.x + Math.sin(h) * sp2 * dt, nz = body.z + Math.cos(h) * sp2 * dt;
          if (!buildingAt(nx, nz) && heightAt(nx, nz, bridge) > -3 && Math.abs(nx) < HALF - 1 && Math.abs(nz) < HALF - 1) { body.x = nx; body.z = nz; body.speed = sp2 * Math.cos(off); break; }
        }
        body.y = heightAt(body.x, body.z, bridge);
      }
      const jn = jackable();
      const lockedBike = steerLock?.kind === 'bike' ? bikes.find((b) => b.id === steerLock!.id) : undefined;
      const nearBike = lockedBike && Math.hypot(lockedBike.x - body.x, lockedBike.z - body.z) < tun.stealR() ? lockedBike
        : bikes.filter((b) => Math.hypot(b.x - body.x, b.z - body.z) < tun.stealR()).sort((a, b) => Math.hypot(a.x - body.x, a.z - body.z) - Math.hypot(b.x - body.x, b.z - body.z))[0];
      if (press('a') || auto) { if (jn && !auto) jack(jn); else if (nearBike) mount(nearBike); }
      if (opts.autoRace && race && mode === 'foot') { const ob = bikes.find((b) => Math.hypot(b.x - body.x, b.z - body.z) < 6); if (ob) mount(ob); }
      footTarget = steerLock?.kind === 'bike' ? bikes.findIndex((b) => b.id === steerLock!.id) : nearBike ? bikes.indexOf(nearBike) : -1;
    } else {
      // on bike: D-pad lock steering (line follow in stepBody, or chase a cyclist), else paddles/arrows free steer
      if (steerLock?.kind === 'line' && body.line !== steerLock.id) steerLock = null; // ran off the end / lost it
      if (steerLock?.kind === 'line') freeSteer = false;
      else if (steerLock?.kind === 'npc') { // chase: aim to pull up alongside (on their left) — jack range, no ploughing
        const tp = lockPos() as Npc | null;
        if (tp) { const lx = Math.cos(tp.heading) * 1.6, lz = -Math.sin(tp.heading) * 1.6; steer = Math.max(-1, Math.min(1, wrap(Math.atan2(tp.x + lx - body.x, tp.z + lz - body.z) - body.heading) * 2.5)); }
      }
      else if (steerLock) steerLock = null;
      if (opts.autoRace && race?.state === 'racing' && race.passed < raceTotal(race.r)) {
        const [gx, gz] = race.r.gates[race.passed % race.r.gates.length];
        const err = wrap(Math.atan2(gx - body.x, gz - body.z) - body.heading);
        steer = Math.max(-1, Math.min(1, err * 2.2)); freeSteer = true; steerLock = null;
        if (Math.abs(err) > 0.5 && body.speed > 10) body.speed -= 6 * dt; // brake into corners
      }
      if (press('a')) {
        const jn = jackable(), sc = stokerCand(tun.jackR() + 0.6);
        if (jn) { dropStoker(false); jack(jn); }
        else if (sc) { stoker = sc.id; sc.stoker = true; sc.flailS = 0; stats.stokers++; crime(0.5, sc.x, sc.z); event('stoker'); screamT = 1; }
        else { dropStoker(false); bikes.push({ id: nextBikeId++, x: body.x, z: body.z, heading: body.heading, kind, flat, mine: true }); mode = 'foot'; body.speed = 0; body.line = -1; steerLock = null; }
      }
      if (auto) {
        autoCool -= dt;
        const route = opts.daredevil ? DARE_ROUTE : AUTO_ROUTE;
        routeI %= route.length;
        const [wx, wz] = route[routeI];
        if (Math.hypot(wx - body.x, wz - body.z) < 8) routeI = (routeI + 1) % route.length;
        const midZ = (CANAL.z0 + CANAL.z1) / 2;
        let [gx, gz] = [wx, wz];
        if ((wz - midZ) * (body.z - midZ) < 0 && Math.abs(body.x) > 6) { gx = 0; gz = body.z > midZ ? CANAL.z1 + 8 : CANAL.z0 - 8; } // cross the canal on the bridge only
        let want = Math.atan2(gx - body.x, gz - body.z);
        // daredevil lane-keeping: pure pursuit down the avenue centre between the turnarounds
        const goingN = wz > body.z;
        if ((opts.daredevil ? body.z > -70 && body.z < 45 : Math.abs(body.x) < 20 && body.z > -55 && body.z < 25 && Math.abs(wz - body.z) > 20)) want = Math.atan2(-body.x, goingN ? 15 : -15);
        const probe = (w: number) => { const sx = Math.sin(w), sz = Math.cos(w); if (blocked(body.x + sx * 6, body.z + sz * 6, body.y, bridge)) return true; for (const d of [2, 4, 6.5]) for (const o of [-0.9, 0, 0.9]) { const b = buildingAt(body.x + sx * d + sz * o, body.z + sz * d - sx * o); if (b && body.y < boxTop(b)) return true; } return false; };
        for (let k = 1; k <= 5 && probe(want); k++) want += 0.5; // probe around walls, trunks and hedges
        const da = wrap(want - body.heading);
        const toCanal = (body.z < CANAL.z0 && Math.cos(body.heading) > 0.5 ? CANAL.z0 - body.z : body.z > CANAL.z1 && Math.cos(body.heading) < -0.5 ? body.z - CANAL.z1 : 99);
        autoBrake = (!opts.daredevil && toCanal < 50 && bridgeAt(t + (toCanal + 22) / Math.max(10, body.speed)) + bridge > 0.01 && Math.abs(body.x) < 20) || (Math.abs(da) > 0.5 && body.speed > 4);
        if (trams.some((tr) => { const dz = tr.z - body.z, toward = dz * Math.cos(body.heading) > 0; return toward && Math.abs(dz) < 6 + body.speed * 1.6 && Math.abs(dz) > 1.8 && Math.abs(tr.x + tr.dir * tr.speed * 1.5 - body.x) < TRAM.len / 2 + 10 && (tr.speed > 0.3 || Math.abs(tr.x - body.x) < TRAM.len / 2 + 2); })) autoBrake = true; // wait for the tram
        freeSteer = true; steer = Math.max(-1, Math.min(1, da * 2));
        { // pass cyclists instead of ploughing through them
          const fx = Math.sin(body.heading), fz = Math.cos(body.heading);
          const cy = npcs.find((q) => q.bike && q.airS <= 0 && (() => { const dx = q.x - body.x, dz = q.z - body.z, al = dx * fx + dz * fz; return al > 0 && al < 3 + body.speed * 0.6 && Math.abs(dx * fz - dz * fx) < 1.6; })());
          void cy; // cyclists yield to a faster rider coming up behind (see npc loop)
        }
        const near = bikes.find((b) => b.kind !== kind && Math.hypot(b.x - body.x, b.z - body.z) < tun.stealR());
        if (near && autoCool <= 0 && !opts.daredevil) { autoCool = 30; bikes.push({ id: nextBikeId++, x: body.x, z: body.z, heading: body.heading, kind, flat }); mount(near); }
        else { const jn = jackable(); if (jn && autoCool <= 0 && !opts.daredevil) { autoCool = 30; jack(jn); } }
      }
      if (mode === 'bike') {
        if (press('y') && !body.air) {
          const th = onTram ? null : hopTram();
          if (th) { const rise = tramRoofY(th) + tun.tramHopV() - body.y; body.vy = Math.sqrt(2 * tun.gravity() * Math.max(0.5, rise)); tramHop = th.id; event('tramHop'); }
          else body.vy = tun.hopV() * bikeSpec().air;
          body.air = true; body.line = -1;
        }
        if (tramHop >= 0) { // boosted hop: drift sideways onto the roof once above the side, stay over the car
          const tr = trams[tramHop];
          if (!body.air || onTram) tramHop = -1;
          else {
            if (body.y > tramRoofY(tr) - 0.6) body.z += (tr.z - body.z) * Math.min(1, 6 * dt);
            const lim = TRAM.len / 2 - 1.2; body.x += tr.dir * tr.speed * dt * 0.5; if (body.x > tr.x + lim) body.x -= (body.x - tr.x - lim) * Math.min(1, 4 * dt); if (body.x < tr.x - lim) body.x += (tr.x - lim - body.x) * Math.min(1, 4 * dt);
          }
        }
        const spinIn = body.air ? (auto ? 0 : airSpin) : 0;
        if (flat && !body.air) body.heading = wrap(body.heading + Math.sin(t * 9) * tun.flatWobble() * dt * 3); // wobbly flat
        if (spinOutS > 0) { spinOutS -= dt; body.heading = wrap(body.heading + 9 * dt); body.speed *= 1 - 1.5 * dt; body.line = -1; }
        const wasAir = body.air;
        const spec = bikeSpec();
        const idle: StepOut = { crashed: false, landed: false, spinLanded: 0, slope: 0, splash: false, impact: 0, grindEnded: 0 };
        if (hitch < 0 && !auto && !body.air && inp.held.has('z')) {
          const ht = trams.find((tr) => tr.speed > 0.5 && behindTram(tr, body.x, body.z));
          if (ht) { hitch = ht.id; stats.hitches++; event('hitch'); }
        }
        let o: StepOut;
        if (onTram && body.air) { // hopped off the roof: keep the tram's momentum
          const tr = trams[onTram.id]; body.speed = tr.speed + 3; onTram = null;
        }
        if (onTram) { // tram surfing: ride along on the roof, steer to turn round
          const tr = trams[onTram.id];
          body.x = tr.x + onTram.ox; body.z = tr.z + onTram.oz; body.y = tramRoofY(tr); body.vy = 0; body.speed = tr.speed;
          body.heading = wrap(body.heading + steer * dt * 2.5); o = idle;
        } else if (hitch >= 0 && inp.held.has('z') && !body.air && trams[hitch].dwell <= 0) { // hitched behind the rear bumper
          const tr = trams[hitch];
          body.x = tr.x - tr.dir * (TRAM.len / 2 + 1.6); body.z = tr.z; body.heading = tr.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
          body.speed = tr.speed; body.y = heightAt(body.x, body.z, bridge); body.line = -1; o = idle;
        } else {
          hitch = -1;
          o = stepBody(body, P(), { brake: auto && autoBrake, effort, steer, freeSteer, spinIn, grindHeld: inp.held.has('z') || auto, bike: spec, topMul: flat ? tun.flatTopMul() : 1, boost }, dt, bridge, grind);
        }
        slope = o.slope;
        stats.distanceM += body.speed * dt;
        if (!wasAir && body.air) {
          airStartZ = body.z;
          if (body.z > CANAL.z0 - 1 && body.z < CANAL.z1 + 1 && Math.abs(body.x) < BRIDGE.x1 && bridge > 0.02) bridgeTry = { effort };
        }
        if (body.air) { stats.airS += dt; stats.maxAirS = Math.max(stats.maxAirS, body.airS); }
        if (o.landed) {
          stats.jumps++;
          const mid = (CANAL.z0 + CANAL.z1) / 2;
          if ((airStartZ < mid && body.z > CANAL.z1) || (airStartZ > mid && body.z < CANAL.z0)) { stats.bridgeJumps++; ctx.emit({ type: 'bridgeJump' }); }
          // a landing across the middle = cleared; a hop that lands back on the same leaf isn't an attempt
          if (bridgeTry && (airStartZ < mid) !== (body.z < mid)) ctx.emit({ type: 'bridgeAttempt', data: { cleared: true, effort: Math.round(bridgeTry.effort * 100) / 100 } });
          bridgeTry = null;
          const turns = Math.abs(o.spinLanded) / Math.PI;
          const off = Math.abs(wrap(o.spinLanded));
          if (turns >= 0.9 && off > 1.0 && off < 2.2) crash(Math.sin(body.heading) * body.speed, Math.cos(body.heading) * body.speed, 4); // landed sideways
          else if (turns >= 0.9) trick(`${Math.round(turns) * 180}`, Math.round(turns));
          else if (body.airS === 0 && o.impact > 4) trick('air', 0.5);
        }
        if (o.grindEnded > 0.6) { stats.grinds++; trick('grind', Math.min(3, o.grindEnded)); }
        if ((o.crashed || o.splash) && bridgeTry) { ctx.emit({ type: 'bridgeAttempt', data: { cleared: false, effort: Math.round(bridgeTry.effort * 100) / 100 } }); bridgeTry = null; }
        if (o.crashed) crash(-Math.sin(body.heading) * body.speed * 0.4, -Math.cos(body.heading) * body.speed * 0.4, 6 + body.speed * 0.4);
        else if (o.splash) {
          stats.splashes++;
          crash(0, 0, 3);
        }
        // trams: land on the roof from the air, get flattened by a moving one, bounce off a parked one
        if (mode === 'bike' && !onTram && hitch < 0) {
          const tr = tramAt(trams, body.x, body.z, 0.3);
          if (tr) {
            const roof = tramRoofY(tr);
            if (wasAir && body.vy <= 0 && body.y <= roof + 0.6 && body.y >= roof - 1.4) {
              onTram = { id: tr.id, ox: body.x - tr.x, oz: body.z - tr.z }; body.air = false; body.y = roof; body.vy = 0; body.line = -1;
              stats.tramRides++; trick('tram surf', 1);
            } else if (body.y < roof - 1.4) {
              const side = body.z >= tr.z ? 1 : -1;
              if (tr.speed > 1) { stats.tramHits++; event('tramHit'); crash(tr.dir * (tr.speed * 1.6 + 4), side * 3, 9); }
              else { body.z = tr.z + side * (TRAM.w / 2 + 0.6); body.speed *= 0.3; }
            }
          }
        }
        if (mode === 'bike') addHeat(spec.heat * dt);
      }
    }
    boost = Math.max(0, boost - (tun.boostCap() / tun.boostS()) * dt);
    // ---- weapons: lock on (nearest person ahead, incl. cops) + fire ----
    const ppl = people();
    lock = pickLock(body.x, body.z, body.heading, ppl, tun.lockRange(), tun.lockCone(), lock);
    const ground = (x: number, z: number) => heightAt(x, z, bridge);
    const solid = (x: number, z: number, y: number) => { const b = buildingAt(x, z); return !!b && y < boxTop(b); };
    let fire = (press('b') && !menu) || !!opts.fireAt?.some((ft) => t - dt < ft && t >= ft);
    if (auto && opts.autoFire) { autoFireT -= dt; if (autoFireT <= 0 && lock >= 0) { fire = true; autoFireT = 5; } if (ammo[WEAPONS[weaponI]] <= 0) weaponI = (weaponI + 1) % WEAPONS.length; }
    // wind-up before the release (render shows aim / pin pull / lighting the rag / the throw)
    if (fire && !cast && mode !== 'ragdoll' && ammo[WEAPONS[weaponI]] > 0) cast = { w: WEAPONS[weaponI], t0: t, dur: WINDUP[WEAPONS[weaponI]] };
    if (mode === 'ragdoll') cast = null;
    const release = !!cast && t - cast.t0 >= cast.dur - 1e-9;
    const wk = cast ? cast.w : WEAPONS[weaponI];
    if (release && cast) { cast = null; lastShot = { w: wk, t }; }
    if (release && ammo[wk] > 0) {
      ammo[wk]--; stats.shots++;
      const tgt = lock >= 0 ? ppl[lock] : null;
      const fx = Math.sin(body.heading), fz = Math.cos(body.heading);
      const tx = tgt ? tgt.x : body.x + fx * 20, tz = tgt ? tgt.z : body.z + fz * 20, ty = ground(tx, tz);
      const sy = body.y + 1.4, g = tun.gravity();
      const mk = (kind: Projectile['kind'], v: { vx: number; vy: number; vz: number }) => projectiles.push({ id: nextFx++, kind, x: body.x + fx, y: sy, z: body.z + fz, ...v, fuse: tun.grenadeFuse(), landed: false, age: 0 });
      if (wk === 'bazooka') { const d = Math.max(0.1, Math.hypot(tx - body.x, tz - body.z, ty + 0.9 - sy)); const v = tun.rocketSpeed(); mk('rocket', { vx: ((tx - body.x) / d) * v, vy: ((ty + 0.9 - sy) / d) * v, vz: ((tz - body.z) / d) * v }); }
      else if (wk === 'grenade') mk('grenade', lob(body.x, sy, body.z, tx, ty, tz, 0.9, g));
      else if (wk === 'bottle') mk('bottle', lob(body.x, sy, body.z, tx, ty, tz, 0.6, g));
      else if (wk === 'molotov') mk('molotov', lob(body.x, sy, body.z, tx, ty, tz, 0.7, g));
      else patches.push({ id: nextFx++, kind: 'oil', x: body.x - fx * 2.5, z: body.z - fz * 2.5, r: 2.5, ttl: tun.oilS() }); // oil: drop behind you
      event('fire', { weapon: wk });
    }
    const boom = (x: number, y: number, z: number, r: number, v: number, cause: string) => {
      blasts.push({ id: nextFx++, x, y, z, r, at: t, kind: 'boom' });
      const hit = radialLaunch(ppl, x, z, r, v, tun.kbBlast());
      let civ = 0, cop = 0;
      for (const i of hit) if (i >= npcs.length) { cop++; (ppl[i] as Cop).state = 'chase'; } else civ++;
      stats.launches += hit.length; stats.copsLaunched += cop;
      if (hit.length) { if (civ) crime(Math.min(1.5, civ * 0.5), x, z); addHeat(cop); event('launch', { weapon: cause, n: hit.length, cops: cop }); }
    };
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const pr = projectiles[i];
      const r = stepProjectile(pr, dt, tun.gravity(), ground, solid);
      const near = pr.kind === 'rocket' && ppl.some((q) => q.alive && Math.hypot(q.x - pr.x, q.z - pr.z) < 1.5 && Math.abs(q.y + 0.9 - pr.y) < 2);
      let done = false;
      if (pr.kind === 'rocket' && (r !== 'flying' || near || pr.age > 2)) { boom(pr.x, pr.y, pr.z, tun.bazookaR(), tun.bazookaV(), 'bazooka'); done = true; }
      else if (pr.kind === 'grenade') { if (r !== 'flying' && !pr.landed) { pr.landed = true; pr.vx = pr.vy = pr.vz = 0; } if (pr.landed && pr.fuse <= 0) { boom(pr.x, pr.y, pr.z, tun.grenadeR(), tun.grenadeV(), 'grenade'); done = true; } }
      else if (pr.kind === 'bottle' && r !== 'flying') { patches.push({ id: nextFx++, kind: 'glass', x: pr.x, z: pr.z, r: 2, ttl: tun.glassS() }); blasts.push({ id: nextFx++, x: pr.x, y: pr.y, z: pr.z, r: 1.5, at: t, kind: 'shatter' }); done = true; }
      else if (pr.kind === 'molotov' && r !== 'flying') { patches.push({ id: nextFx++, kind: 'fire', x: pr.x, z: pr.z, r: 3, ttl: tun.fireS() }); blasts.push({ id: nextFx++, x: pr.x, y: pr.y, z: pr.z, r: 3, at: t, kind: 'poof' }); addHeat(0.5); done = true; }
      if (done || pr.age > 8) projectiles.splice(i, 1);
    }
    for (let i = patches.length - 1; i >= 0; i--) { patches[i].ttl -= dt; if (patches[i].ttl <= 0) patches.splice(i, 1); }
    for (let i = blasts.length - 1; i >= 0; i--) if (t - blasts[i].at > 1.2) blasts.splice(i, 1);
    // patches vs the rider
    if (mode === 'bike' && !body.air) {
      if (!flat && inPatch(patches, body.x, body.z, 'glass')) { flat = true; stats.flats++; event('flat'); }
      if (spinOutS <= 0 && inPatch(patches, body.x, body.z, 'oil')) { spinOutS = tun.spinOutS(); stats.spinOuts++; event('spinOut'); }
    }
    // ---- pickups ----
    for (const pk of pickups) if (t >= pk.readyAt && mode !== 'ragdoll' && Math.hypot(pk.x - body.x, pk.z - body.z) < 2.5) {
      ammo[pk.kind] = Math.min(MAX_AMMO, ammo[pk.kind] + PICKUP_AMMO[pk.kind]); pk.readyAt = t + tun.pickupS(); stats.pickups++; event('pickup', { weapon: pk.kind });
    }
    // ---- street race: countdown hold, gates, missed / quit, drafting, heat ----
    if (race) {
      const rc: RaceSt = race, total = raceTotal(rc.r);
      rc.bottleT -= dt; rc.shoveT -= dt;
      if (rc.state === 'countdown') {
        const g = gridAt(rc.r, 0);
        if (mode === 'bike') { body.x = g.x; body.z = g.z; body.heading = rc.r.start.heading; body.speed = 0; body.y = heightAt(g.x, g.z, bridge); }
        if (t - rc.t0 >= 3) { rc.state = 'racing'; event('raceGo'); say('GO GO GO!'); }
      } else if (rc.state === 'racing') {
        const [gx, gz] = rc.r.gates[rc.passed % rc.r.gates.length];
        const dG = Math.hypot(gx - body.x, gz - body.z);
        if (mode !== 'ragdoll' && dG < GATE_R) { rc.passed++; stats.checkpoints++; event('checkpoint', { n: rc.passed }); if (rc.passed >= total) endRace(true); }
        if (race && rc.state === 'racing') {
          const skipped = skipping(rc.r, rc.passed, body.x, body.z);
          rc.missS = skipped ? rc.missS + dt : Math.max(0, rc.missS - dt * 2);
          if (rc.missS > 0.5 && rc.missS - dt <= 0.5) { say('MISSED CHECKPOINT! Go back ↩'); event('missedCheckpoint'); }
          rc.awayS = dG > 150 || (mode === 'foot') ? rc.awayS + dt : 0;
          if (rc.awayS > (mode === 'foot' ? 12 : 5)) endRace(false);
          if (heat < 2.5) addHeat(tun.raceHeat() * dt);
          // drafting: tucked in 1.5-7 m behind a rival going your way
          rc.drafting = false;
          if (mode === 'bike' && !body.air && body.speed > 6) for (const id of rc.ids) {
            const n = npcs.find((q) => q.id === id); if (!n?.bike) continue;
            const fx = Math.sin(n.heading), fz = Math.cos(n.heading), dx = n.x - body.x, dz = n.z - body.z, along = dx * fx + dz * fz, lat = Math.abs(dx * fz - dz * fx);
            if (along > 1.5 && along < 7 && lat < 1.3 && Math.cos(n.heading - body.heading) > 0.8) { rc.drafting = true; break; }
          }
          if (rc.drafting) { body.speed += tun.draftAccel() * dt; stats.draftS += dt; }
        }
      } else if (t - rc.doneAt > 8) { // results shown; the field disperses
        for (const id of rc.ids) { const i = npcs.findIndex((q) => q.id === id); if (i >= 0) npcs.splice(i, 1); }
        race = null;
      }
    }
    // ---- pedestrians: walk lines, fly when launched, slip on oil, flail when on fire ----
    if (stoker >= 0) { // passenger: rides your back seat (rendered on the tandem), screams now and then
      if (mode !== 'bike' || kind !== 'tandem') dropStoker(false);
      else { screamT -= dt; if (screamT <= 0) { screamT = 2.5 + hash(Math.floor(t), 7) * 2.5; event('scream'); } }
    }
    const pdist = (n: Npc) => Math.hypot(n.x - body.x, n.z - body.z);
    heckleCool -= dt; gang.knockCool -= dt;
    for (const n of npcs) {
      if (n.stoker) { n.x = body.x; n.z = body.z; n.y = body.y; n.heading = body.heading; continue; }
      if ((n.callS ?? 0) > 0) { // witness on the phone: knock them down or get away before the call goes through
        if (n.airS > 0 || n.stunS > 0 || n.flailS > 0) { n.callS = 0; stats.callsStopped++; event('callStopped'); }
        else if (pdist(n) > tun.callEscapeR()) { n.callS = 0; stats.callsStopped++; event('callLost'); }
        else { n.callS! -= dt; if (n.callS! <= 0) { n.callS = 0; addHeat(n.callHeat ?? 0.5); stats.witnessCalls++; say('📞 A witness called it in!'); event('calledIn'); } }
      }
      if ((n.reactS ?? 0) > 0) { n.reactS! -= dt; if (n.reactS! <= 0) { n.react = undefined; n.say = undefined; } }
      if (n.airS > 0) {
        if (n.bike) dropBike(n);
        n.airS += dt; n.vy -= tun.ragGravity() * dt; n.y += n.vy * dt; n.x += n.vx * dt; n.z += n.vz * dt;
        if (buildingAt(n.x, n.z)) { n.vx *= -0.5; n.vz *= -0.5; n.x += n.vx * dt * 2; n.z += n.vz * dt * 2; }
        const g = heightAt(n.x, n.z, bridge);
        if (n.y <= g) { n.y = g; n.vy = 0; n.vx *= tun.kbKeep(); n.vz *= tun.kbKeep(); n.roll = 0; n.airS = 0; n.stunS = tun.npcDownS(); n.groggyS = tun.groggyS(); if (g < -2) { n.z = bank(n.z); n.y = heightAt(n.x, n.z, bridge); n.vx = n.vz = 0; } }
        continue;
      }
      const tn = tramAt(trams, n.x, n.z, 0.3);
      if (tn && tn.speed > 1) { n.vy = 6; n.vx = tn.dir * (tn.speed + 5); n.vz = (n.z >= tn.z ? 1 : -1) * 3; n.airS = 0.01; stats.launches++; event('tramLaunch'); continue; }
      if (inPatch(patches, n.x, n.z, 'fire') && n.flailS <= 0) { n.flailS = tun.flailS(); event('onFire'); dropBike(n); }
      if (n.bike && mode === 'bike' && !body.air && body.speed > 5 && Math.hypot(n.x - body.x, n.z - body.z) < 1.1) { // you plough into a cyclist
        { const fx = Math.sin(body.heading), fz = Math.cos(body.heading), sd = (n.x - body.x) * fz - (n.z - body.z) * fx >= 0 ? 1 : -1, fw = Math.min(5, body.speed * 0.35); // sideways off your line + some of your speed
          n.vy = tun.kbHop(); n.vx = fx * fw + fz * sd * tun.kbBike(); n.vz = fz * fw - fx * sd * tun.kbBike(); }
        n.airS = 0.01; body.speed *= 0.93; event('cyclistKnocked'); continue;
      }
      if (n.stunS <= 0 && inPatch(patches, n.x, n.z, 'oil')) { n.vy = 2.5; n.airS = 0.01; n.vx = Math.sin(n.heading) * 2; n.vz = Math.cos(n.heading) * 2; continue; } // slip!
      if (n.stunS > 0) { // lying there after the thud, sliding to a stop
        n.stunS -= dt; const v = Math.hypot(n.vx, n.vz), nv = Math.max(0, v - tun.tumbleFric() * dt);
        if (v > 0) { n.vx *= nv / v; n.vz *= nv / v; n.roll = (n.roll ?? 0) + nv * dt / 0.35; const nx = n.x + n.vx * dt, nz = n.z + n.vz * dt; if (!buildingAt(nx, nz)) { n.x = nx; n.z = nz; n.y = heightAt(n.x, n.z, bridge); } else n.vx = n.vz = 0; }
        continue;
      }
      if ((n.groggyS ?? 0) > 0) n.groggyS! -= dt;
      if (n.gang && n.bike) { stepGanger(n, dt, bridge); continue; }
      if (n.racer) { if (race) stepRacer(n, dt, bridge); continue; }
      if (crimeOn && !n.bike && !n.gang && n.angryS <= 0 && n.flailS <= 0 && !(n.callS! > 0) && !(n.reactS! > 0) && mode !== 'ragdoll') { // ambient: dodge + shout / flip off, or heckle
        const d = pdist(n), hh = hash(n.id, Math.floor(t * 0.5));
        if (mode === 'bike' && body.speed > 6 && d < 3.2) {
          const sx = -Math.cos(body.heading), sz = Math.sin(body.heading), side = (n.x - body.x) * sx + (n.z - body.z) * sz >= 0 ? 1 : -1;
          const nx = n.x + sx * side * 1.1, nz = n.z + sz * side * 1.1; if (!buildingAt(nx, nz)) { n.x = nx; n.z = nz; }
          n.react = hh < 0.5 ? 'flip' : 'shout'; n.say = SHOUTS[Math.floor(hh * 97) % SHOUTS.length]; n.reactS = 1.8; event('npcReact', { react: n.react });
        } else if (n.id % 5 === 0 && d < 9 && heckleCool <= 0) { n.react = 'heckle'; n.say = HECKLES[Math.floor(hash(n.id, Math.floor(t)) * HECKLES.length) % HECKLES.length]; n.reactS = 2.6; heckleCool = 7; stats.heckles++; event('heckle'); }
      }
      let sp = n.bike ? n.speed : n.cruise * ((n.groggyS ?? 0) > 0 ? 0.35 : 1);
      if (n.angryS > 0 && !n.bike) { // jacked: chase you, shaking a fist, then give up
        n.angryS -= dt; n.heading = Math.atan2(body.x - n.x, body.z - n.z); const dd = Math.hypot(body.x - n.x, body.z - n.z); sp = dd > 1.8 && dd < 16 ? 4.2 : 0; // out-run them: they stop and shake a fist
      } else if ((n.callS ?? 0) > 0 || ((n.reactS ?? 0) > 0.6 && n.react !== 'dodge')) { n.heading = Math.atan2(body.x - n.x, body.z - n.z); sp = 0; // stop, face you (phone to the ear / middle finger)
      } else if (n.flailS > 0) { n.flailS -= dt; n.heading += Math.sin(n.flailS * 9 + n.id) * dt * 7; sp = 5; }
      else if (n.line >= 0) {
        const l = LINES[n.line], np = nearestOnLine(l, n.x, n.z);
        const end = n.dir > 0 ? l.pts[Math.min(l.pts.length - 1, np.seg + 1)] : l.pts[np.seg];
        if (Math.hypot(end[0] - n.x, end[1] - n.z) < (n.bike ? 2.2 : 1)) { n.dir = n.dir > 0 ? -1 : 1; n.x += (np.px - n.x) * 0.1; }
        if (n.bike) { // keep right, loose flow: ease off behind slower traffic and behind you
          const h0 = Math.atan2(end[0] - np.px, end[1] - np.pz), rx = -Math.cos(h0), rz = Math.sin(h0);
          const bx = body.x - n.x, bz = body.z - n.z, behind = -(bx * Math.sin(h0) + bz * Math.cos(h0));
          const off = mode === 'bike' && behind > 0 && behind < 14 && Math.hypot(bx, bz) < 14 && body.speed > n.speed ? 3.2 : 1.2; // pull over for faster traffic
          n.heading = Math.atan2(end[0] + rx * off - n.x + (np.px + rx * off - n.x) * 0.8, end[1] + rz * off - n.z + (np.pz + rz * off - n.z) * 0.8);
          let want = n.cruise;
          const fx = Math.sin(n.heading), fz = Math.cos(n.heading);
          const ahead = (x: number, z: number) => { const dx = x - n.x, dz = z - n.z, a = dx * fx + dz * fz, lat = Math.abs(dx * fz - dz * fx); return a > 0 && a < 5 && lat < 1.6; };
          for (const o of npcs) if (o !== n && o.airS <= 0 && ahead(o.x, o.z) && (!o.bike || Math.cos(o.heading - n.heading) > 0.3)) want = Math.min(want, o.bike ? Math.max(1.5, o.speed * 0.9) : 1.5); // same-direction traffic only (oncoming keep right)
          if (mode !== 'ragdoll' && ahead(body.x, body.z)) want = Math.min(want, mode === 'bike' ? Math.max(1, body.speed) : 1);
          n.speed += Math.max(-6 * dt, Math.min(2 * dt, want - n.speed)); sp = n.speed;
        } else n.heading = Math.atan2(end[0] - n.x, end[1] - n.z);
      } else sp = 0; // scripted bystanders stand still
      const nx = n.x + Math.sin(n.heading) * sp * dt, nz = n.z + Math.cos(n.heading) * sp * dt;
      if (!buildingAt(nx, nz) && heightAt(nx, nz, bridge) > -2) { n.x = nx; n.z = nz; } else if (n.bike) n.dir = n.dir > 0 ? -1 : 1; else n.heading += 2; // cyclists turn back
      n.y = heightAt(n.x, n.z, bridge);
    }
    // ---- traffic recycling: far cyclists/strollers respawn on a path 60-100 m from you (deterministic hash) ----
    recycleT -= dt;
    if (recycleT <= 0) {
      recycleT = 0.5;
      const paths = LINES.filter((l) => l.kind === 'path'), far = tun.recycleR();
      for (const n of npcs) {
        if (n.id < 1000 || n.id >= 2000 && n.id < 3000 || n.airS > 0 || n.angryS > 0 || n.flailS > 0 || (n.id < 3000 && !n.bike)) continue;
        if (Math.hypot(n.x - body.x, n.z - body.z) < far) continue;
        for (let k = 0; k < 16; k++) {
          const h = recycleN++, l = paths[Math.floor(hash(h, 41) * paths.length) % paths.length], sg = Math.floor(hash(h, 42) * (l.pts.length - 1)), u = hash(h, 43);
          const [ax, az] = l.pts[sg], [bx, bz] = l.pts[sg + 1], x = ax + (bx - ax) * u, z = az + (bz - az) * u, d = Math.hypot(x - body.x, z - body.z);
          const fwd = (x - body.x) * Math.sin(body.heading) + (z - body.z) * Math.cos(body.heading); if (!(fwd < -d * 0.3 ? d > 22 && d < 80 : d > 70 && d < 95) || buildingAt(x, z)) continue; // pop in behind the camera or out in the haze
          n.x = x; n.z = z; n.line = l.id; n.y = heightAt(x, z, bridge); n.dir = hash(h, 44) < 0.5 ? 1 : -1; if (n.bike) n.speed = n.cruise; n.stunS = 0;
          break;
        }
      }
    }
    // ---- rival gang: provoke on entering the turf, beat them (all knocked off their bikes) or escape ----
    if (gang.ids.length) {
      gang.throwT -= dt;
      const members = gang.ids.map((id) => npcs.find((n) => n.id === id)).filter((n): n is Npc => !!n);
      const riding = members.filter((n) => n.bike);
      const td = Math.hypot(body.x - TURF.x, body.z - TURF.z);
      if (gang.done) { gang.respawnS -= dt; if (gang.respawnS <= 0 && td > TURF.r + 30) spawnGang(); }
      else if (!riding.length) { gang.done = true; gang.provoked = false; gang.respawnS = 120; cash += GANG_REWARD.beat; rep += GANG_REWARD.rep.beat; stats.gangBeaten++; stats.cashEarned += GANG_REWARD.beat; say(`Gearheads WRECKED · +$${GANG_REWARD.beat} · rep +${GANG_REWARD.rep.beat}`); event('gangBeaten'); persist(); }
      else if (!gang.provoked && td < TURF.r && mode !== 'ragdoll') { gang.provoked = true; gang.outS = 0; say('Gearheads: "This is OUR turf!"'); event('gangProvoked'); }
      else if (gang.provoked) {
        gang.outS = td > TURF.r + 45 ? gang.outS + dt : 0;
        if (gang.outS > 4) { gang.provoked = false; cash += GANG_REWARD.escape; rep += GANG_REWARD.rep.escape; stats.gangEscapes++; stats.cashEarned += GANG_REWARD.escape; say(`Lost the Gearheads · +$${GANG_REWARD.escape} · rep +${GANG_REWARD.rep.escape}`); event('gangEscaped'); }
      }
      for (const n of members) if (!n.bike && n.airS <= 0 && n.stunS <= 0 && !gang.done) n.angryS = Math.max(n.angryS, 0.5); // knocked-off members run at you
    }
    // ---- cops: quota by heat, pursue on the nav graph, tackle ----
    const copsOn = opts.cops !== false;
    const wantSeg = heat >= 1 ? Math.min(3, Math.ceil(heat - 0.01)) : 0, wantHorse = heat >= 4.5 ? 2 : heat >= 3 ? 1 : 0;
    copSpawnT -= dt;
    if (copsOn && copSpawnT <= 0 && mode !== 'ragdoll') {
      const have = (k: CopKind) => cops.filter((c) => c.kind === k && c.state !== 'patrol').length;
      const kindNeeded: CopKind | null = have('horse') < wantHorse ? 'horse' : have('segway') < wantSeg ? 'segway' : null;
      if (kindNeeded) {
        const N = navNodes(); let pick = -1, bd = Infinity;
        for (let i = 0; i < N.length; i++) { const d = Math.hypot(N[i].x - body.x, N[i].z - body.z); const score = Math.abs(d - tun.copSpawnD()) + (visible(N[i].x, N[i].z, body.x, body.z, 3) ? 0 : -10) + ctx.rng() * 8; if (d > tun.copSpawnD() * 0.6 && score < bd) { bd = score; pick = i; } }
        if (pick >= 0) { const c = newCop(copId++, kindNeeded, N[pick].x, N[pick].z); c.lastSeen = { x: body.x, z: body.z }; c.state = 'search'; cops.push(c); event('copSpawn', { kind: kindNeeded }); }
        copSpawnT = tun.copSpawnS();
      }
    }
    const catchable = mode !== 'ragdoll' && !(mode === 'bike' && body.air);
    let anySees = false, nearest = Infinity;
    for (let i = cops.length - 1; i >= 0; i--) {
      const c = cops[i];
      if (c.airS <= 0 && c.stunS <= 0) {
        if (inPatch(patches, c.x, c.z, 'fire') && c.flailS <= 0) { c.flailS = tun.flailS(); event('onFire', { cop: true }); }
        if (inPatch(patches, c.x, c.z, 'oil')) { c.stunS = 2; c.speed = 0; event('copSpinOut'); }
        if (!c.flat && c.kind === 'segway' && inPatch(patches, c.x, c.z, 'glass')) c.flat = true;
      }
      const tc = c.airS === 0 ? tramAt(trams, c.x, c.z, 0.3) : null;
      if (tc && tc.speed > 1) { c.vy = 6; c.vx = tc.dir * (tc.speed + 5); c.vz = (c.z >= tc.z ? 1 : -1) * 3; c.airS = 0.01; stats.copsLaunched++; event('tramLaunch'); }
      const tackled = heat >= 1 && c.state !== 'patrol' && stepCop(c, CP(), dt, { x: body.x, z: body.z, y: body.y, catchable }, bridge);
      if (c.state === 'patrol') { // retiring: walk off and vanish
        c.repathS -= dt; if (c.repathS < -6) { cops.splice(i, 1); continue; }
        c.x += Math.sin(c.heading) * 3 * dt; c.z += Math.cos(c.heading) * 3 * dt; c.y = heightAt(c.x, c.z, bridge);
      }
      if (c.state !== 'patrol') { nearest = Math.min(nearest, Math.hypot(c.x - body.x, c.z - body.z)); if (c.airS <= 0 && c.stunS <= 0 && canSee(c, body.x, body.z, tun.sightR())) anySees = true; }
      if (tackled) { // BUSTED: knocked off, bike confiscated, heat reset
        stats.busts++; busted = true;
        crash(Math.sin(c.heading) * 6, Math.cos(c.heading) * 6, 7, true);
        heat = 0; event('busted', { by: c.kind });
        for (const k of cops) { k.state = 'patrol'; k.repathS = 0; }
        break;
      }
    }
    // lose them: out of every cop's sight long enough, and not too close
    if (heat >= 1 && cops.some((c) => c.state !== 'patrol')) {
      lostS = anySees ? 0 : lostS + dt;
      if (lostS > tun.loseS() && nearest > tun.loseDist()) { heat = 0; lostS = 0; stats.lostCops++; event('lostCops'); for (const k of cops) { k.state = 'patrol'; k.repathS = 0; } }
    } else lostS = 0;
    // repaint at the co-op
    coopCool -= dt;
    if (mode === 'bike' && heat > 0 && coopCool <= 0 && Math.hypot(body.x - COOP.x, body.z - COOP.z) < COOP.r) {
      heat = 0; paint++; coopCool = 15; stats.repaints++; event('repaint');
      for (const k of cops) { k.state = 'patrol'; k.repathS = 0; k.lastSeen = null; }
    }
    // with no cops on you, leftover sub-star heat cools off
    if (heat > 0 && heat < 1) { heatCool += dt; if (heatCool > tun.heatCoolS()) { heat = 0; heatCool = 0; } }
    // trainer grade on climbs (bike, grounded)
    gradePct = mode === 'bike' && !body.air ? Math.max(0, Math.min(gMax(), slope * 100 * gScale())) : 0;
    const q = Math.round(gradePct * 2) / 2;
    if (q !== lastGrade) { lastGrade = q; if (q > 0) ctx.resistance.set({ id: 'terrain', mode: 'sim', gradePct: q }); else ctx.resistance.clear('terrain'); }
    if (t >= saveAt) { saveAt = t + 30; saved = true; persist(); }
    ctx.debug('mode', mode); ctx.debug('speed', Math.round(body.speed * 10) / 10); ctx.debug('line', body.line); ctx.debug('heat', Math.round(heat * 10) / 10);
  }

  return {
    update,
    isOver: () => false,
    hud(): GameHud {
      if (menu) return { controls: [{ button: 'a', label: `Buy ${DEALER_STOCK[menu.sel].qty}× ${DEALER_STOCK[menu.sel].w} $${DEALER_STOCK[menu.sel].price}`, active: cash >= DEALER_STOCK[menu.sel].price }, { button: 'dpad', label: '◀ ▶ browse (or tap a paddle)' }, { button: 'b', label: 'Leave' }] };
      if (dealerNear()) return { controls: [{ button: 'a', label: 'Talk to Van Guy (buy)', active: true }, { button: 'b', label: `Fire ${WEAPONS[weaponI]} ×${ammo[WEAPONS[weaponI]]}` }, { button: 'paddles', label: 'Steer · pedal' }] };
      if (!race && raceOn && routeNear()) { const r = routeNear()!; return { controls: [{ button: 'a', label: `Enter ${r.name}${r.buyIn ? ` ($${r.buyIn} buy-in)` : ''}`, active: cash >= r.buyIn }, { button: 'b', label: `Fire ${WEAPONS[weaponI]} ×${ammo[WEAPONS[weaponI]]}` }, { button: 'paddles', label: 'Steer · pedal' }] }; }
      if (fenceNear()) return { controls: [{ button: 'a', label: body.speed < 4 ? `SELL ${BIKES[kind].label} $${fencePrice(kind, flat, hot().includes(kind))}` : 'Stop to sell', active: body.speed < 4 }, { button: 'b', label: `Fire ${WEAPONS[weaponI]} ×${ammo[WEAPONS[weaponI]]}` }, { button: 'paddles', label: 'Steer · pedal' }] };
      const jn = mode !== 'ragdoll' ? jackable() : undefined;
      const lockLbl = steerLock ? (steerLock.kind === 'line' ? 'Locked line · ◀ ▶ next' : steerLock.kind === 'npc' ? 'Locked target · ◀ ▶ next' : 'Locked bike · ◀ ▶ next') : 'Lock line / target';
      return { controls: mode === 'bike'
        ? [{ button: 'a', label: jn ? 'JACK BIKE!' : stokerCand(tun.jackR() + 0.6) ? 'GRAB STOKER!' : 'Dismount', active: !!jn || !!stokerCand(tun.jackR() + 0.6) }, { button: 'b', label: `Fire ${WEAPONS[weaponI]} ×${ammo[WEAPONS[weaponI]]}` }, { button: 'y', label: hopTram() ? 'TRAM HOP!' : 'Hop', active: !!hopTram() }, { button: 'z', label: 'Grind · hitch tram' }, { button: 'dpad', label: lockLbl, active: !!steerLock }, { button: 'paddles', label: body.air ? 'Spin' : 'Steer (cancels lock)' }, { button: 'shiftersL', label: 'Weapon' }, { button: 'shiftersR', label: 'Weapon' }]
        : [{ button: 'a', label: jn ? 'JACK BIKE!' : 'Steal bike', active: !!jn || footTarget >= 0 }, { button: 'b', label: `Fire ${WEAPONS[weaponI]} ×${ammo[WEAPONS[weaponI]]}` }, { button: 'dpad', label: steerLock ? lockLbl : 'Lock a target (optional)', active: !!steerLock }, { button: 'paddles', label: 'Steer · pedal = walk / run' }] };
    },
    snapshot(): Snapshot {
      return { t, mode, rider: { ...body, kind: mode === 'bike' ? kind : null, flat, boost }, ragdoll: rag ? { x: rag.x, y: rag.y, z: rag.z, spin: rag.spin } : null,
        bikes: bikes.map((b) => ({ ...b })), npcs: npcs.map((n) => ({ ...n })), bridge: bridgeAngle(t, tun.bridgePeriodS(), (tun.bridgeMaxDeg() * Math.PI) / 180),
        hooks: opts.daredevil || opts.sprintFtp != null ? { powerFtp: opts.sprintFtp ?? 1 } : undefined,
        weapon: WEAPONS[weaponI], lock, footTarget,
        steerLock: steerLock ? { ...steerLock, ...(steerLock.kind === 'line' ? {} : (() => { const q = steerLock.kind === 'bike' ? bikes.find((b) => b.id === steerLock!.id) : npcs.find((n) => n.id === steerLock!.id); return q ? { x: q.x, z: q.z } : {}; })()) } : null,
        jackId: mode !== 'ragdoll' ? jackable()?.id ?? -1 : -1,
        lockAt: (() => { const q = people()[lock]; return lock >= 0 && q ? { x: q.x, y: q.y, z: q.z, cop: lock >= npcs.length } : null; })(),
        trams: trams.map((tr) => ({ ...tr })), onTram: !!onTram, hitched: hitch >= 0, tramHopReady: !!hopTram(), jackCamT, cast: cast ? { ...cast } : null, lastShot: lastShot ? { ...lastShot } : null, stoker, stokerAt: (() => { const c = stokerCand(30); return c ? { x: c.x, z: c.z, near: Math.hypot(c.x - body.x, c.z - body.z) < tun.jackR() + 0.6 } : null; })(),
        cash, rep, hot: hot(), msg,
        race: race ? (() => { const rc: RaceSt = race!, total = raceTotal(rc.r), n = rc.r.gates.length, me = raceProg(rc.passed, body.x, body.z);
          const ahead = rc.ids.filter((id) => { const q = npcs.find((m) => m.id === id); return q && (rc.fin.has(id) || raceProg(q.racePassed ?? 0, q.x, q.z) > me); }).length;
          const g = rc.passed < total ? rc.r.gates[rc.passed % n] : null, g2 = rc.passed + 1 < total ? rc.r.gates[(rc.passed + 1) % n] : null;
          return { id: rc.r.id, name: rc.r.name, state: rc.state, countdown: Math.max(0, 3 - (t - rc.t0)), time: Math.max(0, t - rc.t0 - 3), passed: rc.passed, total, lap: Math.min(rc.r.laps, Math.floor(rc.passed / n) + 1), laps: rc.r.laps,
            pos: ahead + 1, field: rc.ids.length + 1, next: g ? { x: g[0], z: g[1] } : null, after: g2 ? { x: g2[0], z: g2[1] } : null, missed: rc.missS > 0.5, drafting: rc.drafting, results: rc.results, best: raceBest[rc.r.id] ?? null, buyIn: rc.r.buyIn, won: rc.won }; })() : null,
        fence: Math.hypot(body.x - FENCE.x, body.z - FENCE.z) < FENCE.r + 25 && mode === 'bike' ? { near: fenceNear() && body.speed < 4, price: fencePrice(kind, flat, hot().includes(kind)), hot: hot().includes(kind) } : null,
        dealer: { near: dealerNear(), menu: menu ? { sel: menu.sel, items: DEALER_STOCK.map((it) => ({ ...it, afford: cash >= it.price })) } : null },
        gang: { provoked: gang.provoked, left: gang.ids.filter((id) => npcs.find((n) => n.id === id)?.bike).length, respawnS: gang.done ? gang.respawnS : 0 },
        goal: mode === 'foot' && !hasHadBike ? 'Grab a bike: jack a passing cyclist (Ⓐ) · ◀ ▶ to lock one' : mode === 'bike' && kind === 'tandem' && stoker < 0 ? 'Tandem needs a stoker! Grab a bystander (Ⓐ)' : '',
        look: { grit: tun.grit(), mood: Math.round(opts.mood ?? tun.mood()) },
        fx: { speedLines: tun.fxSpeedLines(), speedLineMin: tun.fxSpeedLineMin(), dust: tun.fxDust(), shake: tun.fxShake(), squash: tun.fxSquash(), smoke: tun.fxSmoke() },
        cops: cops.map((c) => ({ ...c, path: [] })), projectiles: projectiles.map((p) => ({ ...p })), patches: patches.map((p) => ({ ...p })), blasts: blasts.map((b) => ({ ...b })),
        pickups: pickups.map((p) => ({ ...p })), ammo: { ...ammo }, art: opts.artStyle ?? tun.artStyle(), busted, lostS, paint, spinOutS, lastEvent, lastEventAt,
        cam: { airLag: tun.camAirLag(), groundLag: tun.camGroundLag(), airPull: tun.camAirPull(), airRise: tun.camAirRise(), airFov: tun.camAirFov(), lookMix: tun.camLookMix() }, heat, slope, gradePct, lastTrick, lastTrickAt, stats: { ...stats } };
    },
    /** Pause-menu settings (read structurally by src/shell/gameSettings.ts). */
    settings(): PauseSetting[] {
      return [
        { key: 'gradeScale', label: 'Hill feel', value: gScale(), min: 0, max: 2, step: 0.05, digits: 2, unit: '×', hint: 'Trainer grade per % of slope' },
        { key: 'gradeMax', label: 'Max grade', value: gMax(), min: 0, max: 15, step: 0.5, digits: 1, unit: '%', hint: 'Cap on climbs (profile cap still applies)' },
      ];
    },
    receive(a: unknown) {
      const m = a as { type?: string; key?: string; value?: number } | null;
      if (m?.type === 'quitRace') { endRace(false); return; }
      if (m?.type !== 'setting' || typeof m.value !== 'number' || !Number.isFinite(m.value)) return;
      if (m.key === 'gradeScale') user.gradeScale = Math.max(0, Math.min(2, m.value));
      else if (m.key === 'gradeMax') user.gradeMax = Math.max(0, Math.min(15, m.value));
      else return;
      lastGrade = -99; // re-apply on the next tick
      persist();
    },
    summary() {
      if (saved || t > 5) persist();
      const r: Record<string, number | string> = {};
      for (const [k, v] of Object.entries(stats)) r[k] = Math.round(v * 10) / 10;
      r.bike = kind; r.heat = Math.round(heat); r.cash = Math.round(cash); r.rep = rep;
      return r;
    },
    dispose() { ctx.resistance.clear('terrain'); },
  };
}
