// Grand Theft Pedal sim: pure + deterministic (ctx.rng, fixed dt). Playground v1.
import type { GameContext, GameHud, GameSim } from '../../../contracts';
import { BIKES, isBikeKind, type BikeKind } from './bikes';
import { newBody, stepBody, switchLine, type Body, type Params } from './physics';
import { inPatch, lob, MAX_AMMO, pickLock, PICKUP_AMMO, radialLaunch, START_AMMO, stepProjectile, WEAPONS, type Blast, type Patch, type Projectile, type WeaponKind } from './weapons';
import { canSee, newCop, stepCop, type Cop, type CopKind, type CopParams } from './cops';
import { findPath, navNodes, visible, type NavNode } from './nav';
import { BRIDGE, bridgeAngle, buildingAt, CANAL, COOP, heightAt, LINES, nearestOnLine, PARKED_BIKES, PICKUPS, SPAWN } from './world';

export interface SimOpts {
  seed?: number;
  /** test/scene setup: start pose, explicit pedestrians (replaces the random crowd), starting heat, cops on/off, ammo */
  spawn?: { x: number; z: number; heading: number; mode?: 'bike' | 'foot' }; npcs?: Array<{ x: number; z: number }>; heat?: number; cops?: boolean;
  ammo?: Partial<Record<WeaponKind, number>>; startWeapon?: WeaponKind; copSpawn?: Array<{ kind: CopKind; x: number; z: number }>;
  /** autopilot also fires the locked weapon every few seconds */ autoFire?: boolean;
  /** scene setup: replace the parked bikes */ bikesAt?: Array<{ kind: BikeKind; x: number; z: number; heading: number }>;
  /** render look override (else the gtpedal.artStyle tunable) */ artStyle?: 'sliver' | 'classic';
  /** scene/test hook: fire the current weapon at these sim times (s) */ fireAt?: number[]; autopilot?: boolean; /** autopilot sends it at the drawbridge instead of waiting */ daredevil?: boolean; /** daredevil autopilot asks the fake bike (target-follow script) for this × FTP; default 1.0 */ sprintFtp?: number }
export type Mode = 'bike' | 'foot' | 'ragdoll';
export interface ParkedBike { id: number; x: number; z: number; heading: number; kind: BikeKind; flat: boolean; mine?: boolean }
export interface Npc { id: number; x: number; z: number; y: number; vx: number; vy: number; vz: number; heading: number; line: number; dir: 1 | -1; airS: number; alive: boolean; flailS: number; stunS: number }
export interface Pickup { kind: WeaponKind; x: number; z: number; readyAt: number }
export interface Snapshot {
  t: number; mode: Mode; rider: Body & { kind: BikeKind | null; flat: boolean; boost: number };
  ragdoll: { x: number; y: number; z: number; spin: number } | null;
  bikes: ParkedBike[]; npcs: Npc[]; bridge: number; weapon: WeaponKind; lock: number;
  /** locked target position (null = none) */ lockAt: { x: number; y: number; z: number; cop: boolean } | null;
  cops: Cop[]; projectiles: Projectile[]; patches: Patch[]; blasts: Blast[]; pickups: Pickup[]; ammo: Record<WeaponKind, number>;
  /** render-only art style: 'sliver' = JSR look in the plaza corner, 'classic' = plain blocks everywhere */ art: 'sliver' | 'classic';
  busted: boolean; lostS: number; paint: number; spinOutS: number; lastEvent: string; lastEventAt: number;
  cam: { airLag: number; groundLag: number; airPull: number; airRise: number; airFov: number; lookMix: number };
  footTarget: number; heat: number; slope: number; gradePct: number; lastTrick: string; lastTrickAt: number;
  stats: Record<string, number>;
  /** fake-bike script hooks (target-follow reads powerFtp) */
  hooks?: { powerFtp: number };
}

const blocked = (x: number, z: number, y: number, br: number) => !!buildingAt(x, z) || heightAt(x, z, br) - y > 0.8;
const bank = (z: number) => (z < (CANAL.z0 + CANAL.z1) / 2 ? CANAL.z0 - 2 : CANAL.z1 + 2);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const AUTO_ROUTE: Array<[number, number]> = [[0, 86], [85, 86], [85, 8], [0, 8], [0, -100]];
/** daredevil: shuttle up and down the avenue over the drawbridge */
const DARE_ROUTE: Array<[number, number]> = [[0, 70], [0, -95]];
export type LineLeave = 'hold' | 'forks';
export interface GtpSave { rides?: number; stealsTotal?: number; bestAirS?: number; gradeScale?: number; gradeMax?: number }

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
    tapS: T.num('tapS', 0.35, 0.1, 1, 0.05, 'paddle tap vs hold threshold s'),
    walkSpeed: T.num('walkSpeed', 4, 1, 10, 0.5, 'auto-walk m/s'),
    crashSpeed: T.num('crashSpeed', 7, 2, 20, 0.5, 'wall hit speed that ragdolls you'),
    ragdollS: T.num('ragdollS', 2.2, 0.5, 6, 0.1, 'seconds flailing before standing up'),
    trickBoost: T.num('trickBoost', 0.15, 0, 1, 0.05, 'top speed boost per landed trick'),
    boostCap: T.num('boostCap', 0.45, 0, 2, 0.05, 'max stacked boost'),
    boostS: T.num('boostS', 4, 0.5, 15, 0.5, 'boost decay time s'),
    hopV: T.num('hopV', 5, 1, 12, 0.5, 'hop vertical speed m/s'),
    grindR: T.num('grindR', 1.5, 0.3, 4, 0.1, 'grind catch radius m'),
    stealR: T.num('stealR', 3, 1, 8, 0.5, 'steal reach m'),
    lockRange: T.num('lockRange', 40, 5, 100, 1, 'lock-on range m'),
    lockCone: T.num('lockCone', 0.6, 0.1, 1.5, 0.05, 'lock-on half cone rad'),
    bazookaV: T.num('bazookaV', 18, 3, 40, 1, 'launch speed of a bazooka hit'),
    flatTopMul: T.num('flatTopMul', 0.5, 0.1, 1, 0.05, 'top speed with a flat'),
    heatCoolS: T.num('heatCoolS', 20, 2, 120, 1, 's per heat star cooled'),
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
    grenadeV: T.num('grenadeV', 14, 3, 40, 1, 'grenade launch speed'),
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
    copSpawnS: T.num('copSpawnS', 3, 0.5, 30, 0.5, 'seconds between cop spawns while short of the heat quota'),
    artStyle: T.choice<'sliver' | 'classic'>('artStyle', 'sliver', ['sliver', 'classic'], "render look: 'sliver' = Jet Set Radio beauty pass on the plaza corner; 'classic' = plain blocks"),
    lineLeave: T.choice<LineLeave>('lineLeave', 'hold', ['hold', 'forks'], 'hold: holding a paddle always free-steers off a line; forks: on a line, a hold only switches lines at forks'),
  };
  const P = (): Params => ({ drive: tun.drive(), drag: tun.drag(), rollDecay: tun.rollDecay(), topSpeed: tun.topSpeed(), gravity: tun.gravity(),
    launchMul: tun.launchMul(), climbMul: tun.climbMul(), turnRate: tun.turnRate(), snapR: tun.snapR(), snapPull: tun.snapPull(),
    crashSpeed: tun.crashSpeed(), grindR: tun.grindR(), effortTop: tun.effortTop() });

  let t = 0, mode: Mode = 'bike', kind: BikeKind = 'city', flat = false, boost = 0, heat = 0, heatCool = 0;
  let rag: { x: number; y: number; z: number; vx: number; vy: number; vz: number; spin: number; s: number } | null = null;
  let weaponI = 0, lock = -1, footTarget = -1, slope = 0, gradePct = 0, lastGrade = -99, lastTrick = '', lastTrickAt = -99;
  let routeI = 0, autoCool = 0, autoBrake = false;
  const body = newBody(SPAWN.x, SPAWN.z, SPAWN.heading);
  const grind = { s: 0 };
  const held = { L: 0, R: 0 };
  const stats = { busts: 0, lostCops: 0, repaints: 0, copsLaunched: 0, shots: 0, flats: 0, pickups: 0, spinOuts: 0, distanceM: 0, airS: 0, maxAirS: 0, jumps: 0, crashes: 0, steals: 0, tricks: 0, grinds: 0, launches: 0, bridgeJumps: 0, splashes: 0, lineSwitches: 0 };
  let nextBikeId = 0;
  const bikes: ParkedBike[] = opts.bikesAt ? opts.bikesAt.map((b) => ({ id: nextBikeId++, ...b, flat: false })) : PARKED_BIKES.map((b) => ({ id: nextBikeId++, x: b.x, z: b.z, heading: 0, kind: isBikeKind(b.kind) ? b.kind : 'city', flat: false }));
  const npcs: Npc[] = [];
  const mkNpc = (i: number, x: number, z: number, line: number): Npc => ({ id: i, x, z, y: heightAt(x, z), vx: 0, vy: 0, vz: 0, heading: 0, line, dir: ctx.rng() < 0.5 ? 1 : -1, airS: 0, alive: true, flailS: 0, stunS: 0 });
  if (opts.npcs) opts.npcs.forEach((p, i) => npcs.push(mkNpc(i, p.x, p.z, -1)));
  else for (let i = 0; i < 14; i++) {
    const l = LINES[Math.floor(ctx.rng() * LINES.length)], p = l.pts[Math.floor(ctx.rng() * l.pts.length)];
    npcs.push(mkNpc(i, p[0], p[1], l.id));
  }
  if (opts.spawn) { body.x = opts.spawn.x; body.z = opts.spawn.z; body.heading = opts.spawn.heading; body.y = heightAt(body.x, body.z); if (opts.spawn.mode === 'foot') mode = 'foot'; }
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
  const CP = (): CopParams => ({ segwaySpeed: tun.segwaySpeed(), horseSpeed: tun.horseSpeed(), segwayRampMul: tun.segwayRampMul(), stairsMul: tun.stairsMul(), sightR: tun.sightR(), tackleR: tun.tackleR(), gravity: tun.gravity() });
  if (opts.heat != null) heat = opts.heat;
  for (const c of opts.copSpawn ?? []) cops.push(newCop(copId++, c.kind, c.x, c.z));
  if (opts.startWeapon) weaponI = WEAPONS.indexOf(opts.startWeapon);
  const prev = ctx.load<GtpSave>() ?? {};
  // rider-facing pause-menu settings (persisted); fall back to the debug tunables
  const user = { gradeScale: prev.gradeScale, gradeMax: prev.gradeMax };
  const gScale = () => user.gradeScale ?? tun.gradeScale(), gMax = () => user.gradeMax ?? tun.gradeMax();
  let forkHeld = false, curBridge = 0;
  let bridgeTry: { effort: number } | null = null;
  let saveAt = 30, saved = false;
  const persist = () => ctx.save({ rides: (prev.rides ?? 0) + 1, stealsTotal: (prev.stealsTotal ?? 0) + stats.steals, bestAirS: Math.max(prev.bestAirS ?? 0, Math.round(stats.maxAirS * 10) / 10),
    ...(user.gradeScale != null ? { gradeScale: user.gradeScale } : {}), ...(user.gradeMax != null ? { gradeMax: user.gradeMax } : {}) } satisfies GtpSave);

  const trick = (name: string, mag: number) => {
    boost = Math.min(tun.boostCap(), boost + tun.trickBoost() * mag);
    lastTrick = name; lastTrickAt = t; stats.tricks++;
    ctx.emit({ type: 'trick', data: { name } });
  };
  const crash = (vx: number, vz: number, up: number, confiscate = false) => {
    if (!confiscate) stats.crashes++;
    const bz = heightAt(body.x, body.z, curBridge) < -2 || (body.z > CANAL.z0 && body.z < CANAL.z1) ? bank(body.z) : body.z;
    if (!confiscate && mode === 'bike') bikes.push({ id: nextBikeId++, x: body.x, z: bz, heading: body.heading, kind, flat, mine: true });
    rag = { x: body.x, y: body.y + 1, z: body.z, vx, vy: up, vz, spin: 0, s: 0 };
    mode = 'ragdoll'; body.speed = 0; body.air = false; body.line = -1; boost = 0;
    if (!confiscate) ctx.emit({ type: 'crash', data: { x: Math.round(body.x), z: Math.round(body.z), y: Math.round(body.y * 10) / 10 } });
  };
  const mount = (b: ParkedBike) => {
    bikes.splice(bikes.indexOf(b), 1);
    kind = b.kind; flat = b.flat; mode = 'bike'; body.line = -1; footTarget = -1;
    if (!b.mine) { stats.steals++; addHeat(0.5); }
    if (!b.mine) ctx.emit({ type: 'steal', data: { kind } });
  };
  const footCandidates = () => bikes.map((b, i) => ({ i, d: Math.hypot(b.x - body.x, b.z - body.z), a: Math.atan2(b.x - body.x, b.z - body.z) }))
    .filter((c) => c.d < 60).sort((a, b) => wrap(a.a - body.heading) - wrap(b.a - body.heading));

  function update(dt: number) {
    t += dt;
    const inp = ctx.input(), bk = ctx.bike();
    const ftp = Math.max(50, ctx.profile.ftp || 200);
    const effort = Math.max(0, Math.min(2, bk.power3s / ftp));
    const bridgeAt = (tt: number) => bridgeAngle(tt, tun.bridgePeriodS(), (tun.bridgeMaxDeg() * Math.PI) / 180);
    const bridge = bridgeAt(t); curBridge = bridge;
    const auto = !!opts.autopilot;
    // paddles: tap vs hold
    const L = Math.abs(inp.paddleL) > 0.5, R = Math.abs(inp.paddleR) > 0.5;
    let tapL = false, tapR = false;
    if (L) held.L += dt; else { if (held.L > 0 && held.L < tun.tapS()) tapL = true; held.L = 0; }
    if (R) held.R += dt; else { if (held.R > 0 && held.R < tun.tapS()) tapR = true; held.R = 0; }
    let steer = (held.L >= tun.tapS() ? 1 : 0) - (held.R >= tun.tapS() ? 1 : 0);
    let freeSteer = steer !== 0;
    // airborne: paddles spin you (held, no tap threshold)
    const airSpin = (L ? 1 : 0) - (R ? 1 : 0);
    // 'forks' mode: on a line a hold doesn't leave it; it switches lines toward that side if there is one
    if (mode === 'bike' && !body.air && body.line >= 0 && tun.lineLeave() === 'forks' && steer !== 0) {
      if (!forkHeld) { const l = switchLine(body, steer > 0 ? -1 : 1, tun.snapR()); if (l !== body.line) { body.line = l; stats.lineSwitches++; } forkHeld = true; }
      steer = 0; freeSteer = false;
    }
    if (!L && !R) forkHeld = false;
    const press = (b: 'a' | 'b' | 'y' | 'z') => inp.pressed.has(b);
    // weapons cycle
    if (inp.pressed.has('shiftUpL') || inp.pressed.has('shiftUpR')) weaponI = (weaponI + 1) % WEAPONS.length;
    if (inp.pressed.has('shiftDnL') || inp.pressed.has('shiftDnR')) weaponI = (weaponI + WEAPONS.length - 1) % WEAPONS.length;

    if (mode === 'ragdoll' && rag) {
      rag.s += dt; rag.vy -= tun.gravity() * dt; rag.x += rag.vx * dt; rag.y += rag.vy * dt; rag.z += rag.vz * dt; rag.spin += dt * 9;
      if (buildingAt(rag.x, rag.z)) { rag.vx *= -0.4; rag.vz *= -0.4; rag.x += rag.vx * dt * 2; rag.z += rag.vz * dt * 2; }
      const g = heightAt(rag.x, rag.z, bridge);
      if (rag.y < g) { rag.y = g; rag.vy = Math.abs(rag.vy) * 0.3; rag.vx *= 0.6; rag.vz *= 0.6; }
      if (rag.s > tun.ragdollS()) {
        if (g < -2) rag.z = bank(rag.z);
        if (busted) { // escorted to the nearest path, a little way off, on foot
          const N = navNodes(); let best = N[0], bd = Infinity;
          for (const nd of N) { const d = Math.abs(Math.hypot(nd.x - rag.x, nd.z - rag.z) - 15); if (d < bd) { bd = d; best = nd; } }
          rag.x = best.x; rag.z = best.z; busted = false;
        }
        body.x = rag.x; body.z = rag.z; body.y = heightAt(body.x, body.z, bridge); rag = null; mode = 'foot';
      }
    } else if (mode === 'foot') {
      const cands = footCandidates();
      if (auto) { let bi = -1, bd = Infinity; bikes.forEach((b, i) => { const d = Math.hypot(b.x - body.x, b.z - body.z); if (d < bd) { bd = d; bi = i; } }); footTarget = bi; }
      else {
        if (footTarget < 0 || footTarget >= bikes.length) footTarget = cands.length ? cands.reduce((a, c) => (c.d < a.d ? c : a)).i : -1;
        const k = cands.findIndex((c) => c.i === footTarget);
        if (cands.length && tapL) footTarget = cands[(k - 1 + cands.length) % cands.length].i;
        if (cands.length && tapR) footTarget = cands[(k + 1) % cands.length].i;
      }
      const tb = footTarget >= 0 ? bikes[footTarget] : undefined;
      if (tb) {
        const d = Math.hypot(tb.x - body.x, tb.z - body.z);
        // auto-walk along the nav graph when the bike isn't in a straight line
        walkRepath -= dt;
        if (walkRepath <= 0) { walkPath = findPath(body.x, body.z, tb.x, tb.z); walkRepath = 1; }
        while (walkPath.length > 1 && Math.hypot(walkPath[0].x - body.x, walkPath[0].z - body.z) < 1.5) walkPath.shift();
        const wp = walkPath[0] ?? tb;
        body.heading = Math.atan2(wp.x - body.x, wp.z - body.z);
        if (d > tun.stealR() * 0.6) {
          const nx = body.x + Math.sin(body.heading) * tun.walkSpeed() * dt, nz = body.z + Math.cos(body.heading) * tun.walkSpeed() * dt;
          if (!buildingAt(nx, nz)) { body.x = nx; body.z = nz; }
          body.y = heightAt(body.x, body.z, bridge);
        }
        if (d < tun.stealR() && (press('a') || auto)) mount(tb);
      } else if (steer) body.heading = wrap(body.heading + steer * tun.turnRate() * dt);
    } else {
      // on bike
      if (press('a')) {
        bikes.push({ id: nextBikeId++, x: body.x, z: body.z, heading: body.heading, kind, flat, mine: true }); mode = 'foot';
        body.speed = 0;
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
        for (let k = 1; k <= 5 && blocked(body.x + Math.sin(want) * 6, body.z + Math.cos(want) * 6, body.y, bridge); k++) want += 0.5; // probe around walls
        const da = wrap(want - body.heading);
        const toCanal = (body.z < CANAL.z0 && Math.cos(body.heading) > 0.5 ? CANAL.z0 - body.z : body.z > CANAL.z1 && Math.cos(body.heading) < -0.5 ? body.z - CANAL.z1 : 99);
        autoBrake = (!opts.daredevil && toCanal < 50 && bridgeAt(t + (toCanal + 22) / Math.max(10, body.speed)) + bridge > 0.01 && Math.abs(body.x) < 20) || (Math.abs(da) > 0.5 && body.speed > 4);
        freeSteer = Math.abs(da) > 0.25; steer = Math.max(-1, Math.min(1, da * 2));
        const near = bikes.find((b) => b.kind !== kind && Math.hypot(b.x - body.x, b.z - body.z) < tun.stealR());
        if (near && autoCool <= 0 && !opts.daredevil) { autoCool = 30; bikes.push({ id: nextBikeId++, x: body.x, z: body.z, heading: body.heading, kind, flat }); mount(near); }
      }
      if (mode === 'bike') {
        if (tapL) { const l = switchLine(body, -1, tun.snapR()); if (l !== body.line) { body.line = l; stats.lineSwitches++; } }
        if (tapR) { const l = switchLine(body, 1, tun.snapR()); if (l !== body.line) { body.line = l; stats.lineSwitches++; } }
        if (press('y') && !body.air) { body.air = true; body.vy = tun.hopV() * BIKES[kind].air; body.line = -1; }
        const spinIn = body.air ? (auto ? 0 : airSpin) : 0;
        if (flat && !body.air) body.heading = wrap(body.heading + Math.sin(t * 9) * tun.flatWobble() * dt * 3); // wobbly flat
        if (spinOutS > 0) { spinOutS -= dt; body.heading = wrap(body.heading + 9 * dt); body.speed *= 1 - 1.5 * dt; body.line = -1; }
        const wasAir = body.air;
        const spec = BIKES[kind];
        const o = stepBody(body, P(), { brake: auto && autoBrake, effort, steer, freeSteer, spinIn, grindHeld: inp.held.has('z') || auto, bike: spec, topMul: flat ? tun.flatTopMul() : 1, boost }, dt, bridge, grind);
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
        addHeat(spec.heat * dt);
      }
    }
    boost = Math.max(0, boost - (tun.boostCap() / tun.boostS()) * dt);
    // ---- weapons: lock on (nearest person ahead, incl. cops) + fire ----
    const ppl = people();
    lock = pickLock(body.x, body.z, body.heading, ppl, tun.lockRange(), tun.lockCone(), lock);
    const ground = (x: number, z: number) => heightAt(x, z, bridge);
    const solid = (x: number, z: number, y: number) => { const b = buildingAt(x, z); return !!b && y < b.h; };
    let fire = press('b') || !!opts.fireAt?.some((ft) => t - dt < ft && t >= ft);
    if (auto && opts.autoFire) { autoFireT -= dt; if (autoFireT <= 0 && lock >= 0) { fire = true; autoFireT = 5; } if (ammo[WEAPONS[weaponI]] <= 0) weaponI = (weaponI + 1) % WEAPONS.length; }
    const wk = WEAPONS[weaponI];
    if (fire && mode !== 'ragdoll' && ammo[wk] > 0) {
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
      const hit = radialLaunch(ppl, x, z, r, v);
      let civ = 0, cop = 0;
      for (const i of hit) if (i >= npcs.length) { cop++; (ppl[i] as Cop).state = 'chase'; } else civ++;
      stats.launches += hit.length; stats.copsLaunched += cop;
      if (hit.length) { addHeat(Math.min(1.5, civ * 0.5) + cop); event('launch', { weapon: cause, n: hit.length, cops: cop }); }
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
    // ---- pedestrians: walk lines, fly when launched, slip on oil, flail when on fire ----
    for (const n of npcs) {
      if (n.airS > 0) {
        n.airS += dt; n.vy -= tun.gravity() * dt; n.y += n.vy * dt; n.x += n.vx * dt; n.z += n.vz * dt;
        if (buildingAt(n.x, n.z)) { n.vx *= -0.5; n.vz *= -0.5; n.x += n.vx * dt * 2; n.z += n.vz * dt * 2; }
        const g = heightAt(n.x, n.z, bridge);
        if (n.y <= g) { n.y = g; n.vy = n.vx = n.vz = 0; n.airS = 0; n.stunS = 1.5; if (g < -2) { n.z = bank(n.z); n.y = heightAt(n.x, n.z, bridge); } }
        continue;
      }
      if (inPatch(patches, n.x, n.z, 'fire') && n.flailS <= 0) { n.flailS = tun.flailS(); event('onFire'); }
      if (n.stunS <= 0 && inPatch(patches, n.x, n.z, 'oil')) { n.vy = 4; n.airS = 0.01; n.vx = Math.sin(n.heading) * 2; n.vz = Math.cos(n.heading) * 2; continue; } // slip!
      if (n.stunS > 0) { n.stunS -= dt; continue; }
      let sp = 1.4;
      if (n.flailS > 0) { n.flailS -= dt; n.heading += Math.sin(n.flailS * 9 + n.id) * dt * 7; sp = 5; }
      else if (n.line >= 0) {
        const l = LINES[n.line], np = nearestOnLine(l, n.x, n.z);
        const end = n.dir > 0 ? l.pts[Math.min(l.pts.length - 1, np.seg + 1)] : l.pts[np.seg];
        if (Math.hypot(end[0] - n.x, end[1] - n.z) < 1) { n.dir = n.dir > 0 ? -1 : 1; n.x += (np.px - n.x) * 0.1; }
        n.heading = Math.atan2(end[0] - n.x, end[1] - n.z);
      } else sp = 0; // scripted bystanders stand still
      const nx = n.x + Math.sin(n.heading) * sp * dt, nz = n.z + Math.cos(n.heading) * sp * dt;
      if (!buildingAt(nx, nz) && heightAt(nx, nz, bridge) > -2) { n.x = nx; n.z = nz; } else n.heading += 2;
      n.y = heightAt(n.x, n.z, bridge);
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
        for (let i = 0; i < N.length; i++) { const d = Math.hypot(N[i].x - body.x, N[i].z - body.z); const score = Math.abs(d - 55) + (visible(N[i].x, N[i].z, body.x, body.z, 3) ? 0 : -10) + ctx.rng() * 8; if (d > 35 && score < bd) { bd = score; pick = i; } }
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
      return { controls: mode === 'bike'
        ? [{ button: 'a', label: 'Dismount' }, { button: 'b', label: `Fire ${WEAPONS[weaponI]} ×${ammo[WEAPONS[weaponI]]}` }, { button: 'y', label: 'Hop' }, { button: 'z', label: 'Grind' }, { button: 'paddles', label: body.air ? 'Spin' : tun.lineLeave() === 'forks' && body.line >= 0 ? 'Tap/hold: switch line at forks' : 'Tap: switch line · Hold: steer' }, { button: 'shiftersL', label: 'Weapon' }, { button: 'shiftersR', label: 'Weapon' }]
        : [{ button: 'a', label: 'Steal bike', active: footTarget >= 0 }, { button: 'b', label: `Fire ${WEAPONS[weaponI]} ×${ammo[WEAPONS[weaponI]]}` }, { button: 'paddles', label: 'Pick target' }] };
    },
    snapshot(): Snapshot {
      return { t, mode, rider: { ...body, kind: mode === 'bike' ? kind : null, flat, boost }, ragdoll: rag ? { x: rag.x, y: rag.y, z: rag.z, spin: rag.spin } : null,
        bikes: bikes.map((b) => ({ ...b })), npcs: npcs.map((n) => ({ ...n })), bridge: bridgeAngle(t, tun.bridgePeriodS(), (tun.bridgeMaxDeg() * Math.PI) / 180),
        hooks: opts.daredevil ? { powerFtp: opts.sprintFtp ?? 1 } : undefined,
        weapon: WEAPONS[weaponI], lock, footTarget,
        lockAt: (() => { const q = people()[lock]; return lock >= 0 && q ? { x: q.x, y: q.y, z: q.z, cop: lock >= npcs.length } : null; })(),
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
      r.bike = kind; r.heat = Math.round(heat);
      return r;
    },
    dispose() { ctx.resistance.clear('terrain'); },
  };
}
