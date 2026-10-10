// Grand Theft Pedal sim: pure + deterministic (ctx.rng, fixed dt). Playground v1.
import type { GameContext, GameHud, GameSim } from '../../../contracts';
import { BIKES, isBikeKind, type BikeKind } from './bikes';
import { newBody, stepBody, switchLine, type Body, type Params } from './physics';
import { pickLock, WEAPONS, IMPLEMENTED, type WeaponKind } from './weapons';
import { bridgeAngle, buildingAt, CANAL, heightAt, LINES, nearestOnLine, PARKED_BIKES, SPAWN } from './world';

export interface SimOpts { seed?: number; autopilot?: boolean; /** autopilot sends it at the drawbridge instead of waiting */ daredevil?: boolean }
export type Mode = 'bike' | 'foot' | 'ragdoll';
export interface ParkedBike { id: number; x: number; z: number; heading: number; kind: BikeKind; flat: boolean; mine?: boolean }
export interface Npc { id: number; x: number; z: number; y: number; vy: number; heading: number; line: number; dir: 1 | -1; airS: number; alive: boolean; cop: boolean }
export interface Snapshot {
  t: number; mode: Mode; rider: Body & { kind: BikeKind | null; flat: boolean; boost: number };
  ragdoll: { x: number; y: number; z: number; spin: number } | null;
  bikes: ParkedBike[]; npcs: Npc[]; bridge: number; weapon: WeaponKind; lock: number;
  footTarget: number; heat: number; slope: number; gradePct: number; lastTrick: string; lastTrickAt: number;
  stats: Record<string, number>;
}

const blocked = (x: number, z: number, y: number, br: number) => !!buildingAt(x, z) || heightAt(x, z, br) - y > 0.8;
const bank = (z: number) => (z < (CANAL.z0 + CANAL.z1) / 2 ? CANAL.z0 - 2 : CANAL.z1 + 2);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const AUTO_ROUTE: Array<[number, number]> = [[0, 86], [85, 86], [85, 8], [0, 8], [0, -100]];

export function createGtpSim(ctx: GameContext, opts: SimOpts = {}): GameSim {
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
    bridgeMaxDeg: T.num('bridgeMaxDeg', 22, 0, 60, 1, 'drawbridge max leaf angle'),
  };
  const P = (): Params => ({ drive: tun.drive(), drag: tun.drag(), rollDecay: tun.rollDecay(), topSpeed: tun.topSpeed(), gravity: tun.gravity(),
    launchMul: tun.launchMul(), climbMul: tun.climbMul(), turnRate: tun.turnRate(), snapR: tun.snapR(), snapPull: tun.snapPull(),
    crashSpeed: tun.crashSpeed(), grindR: tun.grindR() });

  let t = 0, mode: Mode = 'bike', kind: BikeKind = 'city', flat = false, boost = 0, heat = 0, heatCool = 0;
  let rag: { x: number; y: number; z: number; vx: number; vy: number; vz: number; spin: number; s: number } | null = null;
  let weaponI = 0, lock = -1, footTarget = -1, slope = 0, gradePct = 0, lastGrade = -99, lastTrick = '', lastTrickAt = -99;
  let routeI = 0, autoCool = 0, autoBrake = false;
  const body = newBody(SPAWN.x, SPAWN.z, SPAWN.heading);
  const grind = { s: 0 };
  const held = { L: 0, R: 0 };
  const stats = { distanceM: 0, airS: 0, maxAirS: 0, jumps: 0, crashes: 0, steals: 0, tricks: 0, grinds: 0, launches: 0, bridgeJumps: 0, splashes: 0, lineSwitches: 0 };
  let nextBikeId = 0;
  const bikes: ParkedBike[] = PARKED_BIKES.map((b) => ({ id: nextBikeId++, x: b.x, z: b.z, heading: 0, kind: isBikeKind(b.kind) ? b.kind : 'city', flat: false }));
  const npcs: Npc[] = [];
  for (let i = 0; i < 14; i++) {
    const l = LINES[Math.floor(ctx.rng() * LINES.length)], p = l.pts[Math.floor(ctx.rng() * l.pts.length)];
    npcs.push({ id: i, x: p[0], z: p[1], y: 0, vy: 0, heading: 0, line: l.id, dir: ctx.rng() < 0.5 ? 1 : -1, airS: 0, alive: true, cop: i === 0 });
  }
  let airStartZ = 0;
  const prev = ctx.load<{ rides?: number; stealsTotal?: number; bestAirS?: number }>() ?? {};
  let saveAt = 30, saved = false;
  const persist = () => ctx.save({ rides: (prev.rides ?? 0) + 1, stealsTotal: (prev.stealsTotal ?? 0) + stats.steals, bestAirS: Math.max(prev.bestAirS ?? 0, Math.round(stats.maxAirS * 10) / 10) });

  const trick = (name: string, mag: number) => {
    boost = Math.min(tun.boostCap(), boost + tun.trickBoost() * mag);
    lastTrick = name; lastTrickAt = t; stats.tricks++;
    ctx.emit({ type: 'trick', data: { name } });
  };
  const crash = (vx: number, vz: number, up: number) => {
    stats.crashes++;
    const bz = heightAt(body.x, body.z) < -2 ? bank(body.z) : body.z;
    bikes.push({ id: nextBikeId++, x: body.x, z: bz, heading: body.heading, kind, flat, mine: true });
    rag = { x: body.x, y: body.y + 1, z: body.z, vx, vy: up, vz, spin: 0, s: 0 };
    mode = 'ragdoll'; body.speed = 0; body.air = false; body.line = -1; boost = 0;
    ctx.emit({ type: 'crash', data: { x: Math.round(body.x), z: Math.round(body.z), y: Math.round(body.y * 10) / 10 } });
  };
  const mount = (b: ParkedBike) => {
    bikes.splice(bikes.indexOf(b), 1);
    kind = b.kind; flat = b.flat; mode = 'bike'; body.line = -1; footTarget = -1;
    if (!b.mine) { stats.steals++; heat = Math.min(5, heat + 0.5); }
    heatCool = 0;
    if (!b.mine) ctx.emit({ type: 'steal', data: { kind } });
  };
  const footCandidates = () => bikes.map((b, i) => ({ i, d: Math.hypot(b.x - body.x, b.z - body.z), a: Math.atan2(b.x - body.x, b.z - body.z) }))
    .filter((c) => c.d < 60).sort((a, b) => wrap(a.a - body.heading) - wrap(b.a - body.heading));

  function update(dt: number) {
    t += dt;
    const inp = ctx.input(), bk = ctx.bike();
    const ftp = Math.max(50, ctx.profile.ftp || 200);
    const effort = Math.max(0, Math.min(2, bk.power3s / ftp));
    const bridge = bridgeAngle(t, tun.bridgePeriodS(), (tun.bridgeMaxDeg() * Math.PI) / 180);
    const auto = !!opts.autopilot;
    // paddles: tap vs hold
    const L = Math.abs(inp.paddleL) > 0.5, R = Math.abs(inp.paddleR) > 0.5;
    let tapL = false, tapR = false;
    if (L) held.L += dt; else { if (held.L > 0 && held.L < tun.tapS()) tapL = true; held.L = 0; }
    if (R) held.R += dt; else { if (held.R > 0 && held.R < tun.tapS()) tapR = true; held.R = 0; }
    let steer = (held.L >= tun.tapS() ? 1 : 0) - (held.R >= tun.tapS() ? 1 : 0);
    let freeSteer = steer !== 0;
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
        body.x = rag.x; body.z = rag.z; body.y = heightAt(body.x, body.z, bridge); rag = null; mode = 'foot';
      }
    } else if (mode === 'foot') {
      const cands = footCandidates();
      if (auto) footTarget = cands.length ? cands.reduce((a, c) => (c.d < a.d ? c : a)).i : -1;
      else {
        if (footTarget < 0 || footTarget >= bikes.length) footTarget = cands.length ? cands.reduce((a, c) => (c.d < a.d ? c : a)).i : -1;
        const k = cands.findIndex((c) => c.i === footTarget);
        if (cands.length && tapL) footTarget = cands[(k - 1 + cands.length) % cands.length].i;
        if (cands.length && tapR) footTarget = cands[(k + 1) % cands.length].i;
      }
      const tb = footTarget >= 0 ? bikes[footTarget] : undefined;
      if (tb) {
        const d = Math.hypot(tb.x - body.x, tb.z - body.z);
        body.heading = Math.atan2(tb.x - body.x, tb.z - body.z);
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
        const [wx, wz] = AUTO_ROUTE[routeI];
        if (Math.hypot(wx - body.x, wz - body.z) < 8) routeI = (routeI + 1) % AUTO_ROUTE.length;
        let want = Math.atan2(wx - body.x, wz - body.z);
        for (let k = 1; k <= 5 && blocked(body.x + Math.sin(want) * 6, body.z + Math.cos(want) * 6, body.y, bridge); k++) want += 0.5; // probe around walls
        const da = wrap(want - body.heading);
        const toCanal = (body.z < CANAL.z0 && Math.cos(body.heading) > 0.5 ? CANAL.z0 - body.z : body.z > CANAL.z1 && Math.cos(body.heading) < -0.5 ? body.z - CANAL.z1 : 99);
        autoBrake = (!opts.daredevil && bridge > 0.01 && toCanal < 25 && Math.abs(body.x) < 12) || (Math.abs(da) > 0.5 && body.speed > 4);
        freeSteer = Math.abs(da) > 0.25; steer = Math.max(-1, Math.min(1, da * 2));
        const near = bikes.find((b) => b.kind !== kind && Math.hypot(b.x - body.x, b.z - body.z) < tun.stealR());
        if (near && autoCool <= 0) { autoCool = 30; bikes.push({ id: nextBikeId++, x: body.x, z: body.z, heading: body.heading, kind, flat }); mount(near); }
      }
      if (mode === 'bike') {
        if (tapL) { const l = switchLine(body, -1, tun.snapR()); if (l !== body.line) { body.line = l; stats.lineSwitches++; } }
        if (tapR) { const l = switchLine(body, 1, tun.snapR()); if (l !== body.line) { body.line = l; stats.lineSwitches++; } }
        if (press('y') && !body.air) { body.air = true; body.vy = tun.hopV() * BIKES[kind].air; body.line = -1; }
        const spinIn = body.air && inp.held.has('y') ? (steer || 1) : 0;
        const wasAir = body.air;
        const spec = BIKES[kind];
        const o = stepBody(body, P(), { brake: auto && autoBrake, effort, steer, freeSteer, spinIn, grindHeld: inp.held.has('z') || auto, bike: spec, topMul: flat ? tun.flatTopMul() : 1, boost }, dt, bridge, grind);
        slope = o.slope;
        stats.distanceM += body.speed * dt;
        if (!wasAir && body.air) { airStartZ = body.z; }
        if (body.air) { stats.airS += dt; stats.maxAirS = Math.max(stats.maxAirS, body.airS); }
        if (o.landed) {
          stats.jumps++;
          if ((airStartZ < CANAL.z0 && body.z > CANAL.z1) || (airStartZ > CANAL.z1 && body.z < CANAL.z0)) { stats.bridgeJumps++; ctx.emit({ type: 'bridgeJump' }); }
          const turns = Math.abs(o.spinLanded) / Math.PI;
          const off = Math.abs(wrap(o.spinLanded));
          if (turns >= 0.9 && off > 1.0 && off < 2.2) crash(Math.sin(body.heading) * body.speed, Math.cos(body.heading) * body.speed, 4); // landed sideways
          else if (turns >= 0.9) trick(`${Math.round(turns) * 180}`, Math.round(turns));
          else if (body.airS === 0 && o.impact > 4) trick('air', 0.5);
        }
        if (o.grindEnded > 0.6) { stats.grinds++; trick('grind', Math.min(3, o.grindEnded)); }
        if (o.crashed) crash(-Math.sin(body.heading) * body.speed * 0.4, -Math.cos(body.heading) * body.speed * 0.4, 6 + body.speed * 0.4);
        else if (o.splash) { stats.splashes++; crash(0, 0, 3); }
        heat = Math.min(5, heat + spec.heat * dt);
      }
    }
    boost = Math.max(0, boost - (tun.boostCap() / tun.boostS()) * dt);
    // weapons: lock on + fire (bazooka only in v1)
    lock = pickLock(body.x, body.z, body.heading, npcs, tun.lockRange(), tun.lockCone(), lock);
    if (press('b') && lock >= 0 && IMPLEMENTED.has(WEAPONS[weaponI]) && mode !== 'ragdoll') {
      const n = npcs[lock]; n.vy = tun.bazookaV(); n.airS = 0.01; stats.launches++; heat = Math.min(5, heat + 1); heatCool = 0;
      ctx.emit({ type: 'launch', data: { weapon: WEAPONS[weaponI] } });
      if (n.cop) heat = Math.min(5, heat + 1);
    }
    // npcs: walk lines, fly when launched
    for (const n of npcs) {
      if (n.airS > 0) {
        n.airS += dt; n.vy -= tun.gravity() * dt; n.y += n.vy * dt;
        const g = heightAt(n.x, n.z, bridge);
        if (n.y <= g) { n.y = g; n.vy = 0; n.airS = 0; }
        continue;
      }
      if (n.cop && heat >= 1 && mode !== 'ragdoll') {
        const d = Math.hypot(body.x - n.x, body.z - n.z);
        n.heading = Math.atan2(body.x - n.x, body.z - n.z);
        const v = 6 + heat; const nx = n.x + Math.sin(n.heading) * v * dt, nz = n.z + Math.cos(n.heading) * v * dt;
        if (!buildingAt(nx, nz)) { n.x = nx; n.z = nz; }
        if (d < 1.5 && body.speed < 5) { // busted (stub): flung, heat reset
          if (mode === 'bike') crash(0, 0, 8); heat = 0; ctx.emit({ type: 'busted' });
        }
      } else {
        const l = LINES[n.line], np = nearestOnLine(l, n.x, n.z);
        const end = n.dir > 0 ? l.pts[Math.min(l.pts.length - 1, np.seg + 1)] : l.pts[np.seg];
        if (Math.hypot(end[0] - n.x, end[1] - n.z) < 1) { n.dir = n.dir > 0 ? -1 : 1; n.x += (np.px - n.x) * 0.1; }
        n.heading = Math.atan2(end[0] - n.x, end[1] - n.z);
        n.x += Math.sin(n.heading) * 1.4 * dt; n.z += Math.cos(n.heading) * 1.4 * dt;
      }
      n.y = heightAt(n.x, n.z, bridge);
    }
    // heat cooldown
    heatCool += dt; if (heatCool > tun.heatCoolS() && heat > 0) { heat = Math.max(0, heat - 1); heatCool = 0; }
    // trainer grade on climbs (bike, grounded)
    gradePct = mode === 'bike' && !body.air ? Math.max(0, Math.min(tun.gradeMax(), slope * 100 * tun.gradeScale())) : 0;
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
        ? [{ button: 'a', label: 'Dismount' }, { button: 'b', label: `Fire ${WEAPONS[weaponI]}` }, { button: 'y', label: 'Hop / spin' }, { button: 'z', label: 'Grind' }, { button: 'paddles', label: 'Tap: switch line · Hold: steer' }, { button: 'shiftersL', label: 'Weapon' }]
        : [{ button: 'a', label: 'Steal bike', active: footTarget >= 0 }, { button: 'b', label: `Fire ${WEAPONS[weaponI]}` }, { button: 'paddles', label: 'Pick target' }] };
    },
    snapshot(): Snapshot {
      return { t, mode, rider: { ...body, kind: mode === 'bike' ? kind : null, flat, boost }, ragdoll: rag ? { x: rag.x, y: rag.y, z: rag.z, spin: rag.spin } : null,
        bikes: bikes.map((b) => ({ ...b })), npcs: npcs.map((n) => ({ ...n })), bridge: bridgeAngle(t, tun.bridgePeriodS(), (tun.bridgeMaxDeg() * Math.PI) / 180),
        weapon: WEAPONS[weaponI], lock, footTarget, heat, slope, gradePct, lastTrick, lastTrickAt, stats: { ...stats } };
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
