// Keeper's Light sim. Pure logic: no DOM, no three. Deterministic (ctx.rng / ctx.clock only).
import type { GameContext, GameHud, GameSim, Seconds } from '../../../contracts';

export type BuildingType = 'cottage' | 'pier' | 'market' | 'bell' | 'lamp2';
export const BUILDING_TYPES: BuildingType[] = ['cottage', 'pier', 'market', 'bell', 'lamp2'];
export const BUILD_COST: Record<BuildingType, { coin: number; timber: number }> = {
  cottage: { coin: 25, timber: 8 },
  pier: { coin: 60, timber: 15 },
  market: { coin: 120, timber: 25 },
  bell: { coin: 80, timber: 20 },
  lamp2: { coin: 150, timber: 40 },
};
export const BUILD_MAX: Record<BuildingType, number> = { cottage: 8, pier: 2, market: 1, bell: 2, lamp2: 1 };
export const PLOT_COUNT = 14;
export const BUILD_EFFECT: Record<BuildingType, string> = {
  cottage: '+coin over time',
  pier: 'ships dock in rougher/foggier water',
  market: 'all coin x1.25',
  bell: 'fog rises slower',
  lamp2: 'stronger lamp, clears fog faster',
};

export type ShipState = 'sailing' | 'docked' | 'lost' | 'spilled';
export interface Ship { id: number; progress: number; lane: number; state: ShipState; age: number }
export type StormPhase = 'calm' | 'warning' | 'storm';

export interface SimOpts { seed?: number; autopilot?: boolean }
interface Saved { buildings: Array<BuildingType | null>; coin: number; timber: number; shipsDockedTotal: number; stormsWeatheredTotal: number }

export function createLighthouseSim(ctx: GameContext, opts?: SimOpts): GameSim {
  const tn = ctx.tuning;
  const zoneTarget = tn.num('targetZone', 2, 1, 5, 1, 'Zone that keeps the lamp bright');
  const fogFall = tn.num('fogFallPerS', 0.04, 0, 0.2, 0.005, 'Fog clearing rate in zone');
  const fogRise = tn.num('fogRisePerS', 0.012, 0, 0.2, 0.002, 'Fog rise rate below zone');
  const chopFall = tn.num('chopFallPerS', 0.04, 0, 0.2, 0.005, 'Chop settle rate in zone');
  const chopRise = tn.num('chopRisePerS', 0.03, 0, 0.2, 0.005, 'Chop rise rate above zone (outside storms)');
  const lampUp = tn.num('lampUpPerS', 0.05, 0, 0.3, 0.005);
  const lampDown = tn.num('lampDownPerS', 0.015, 0, 0.3, 0.005);
  const spawnMin = tn.num('shipSpawnMinS', 40, 5, 300, 1);
  const spawnMax = tn.num('shipSpawnMaxS', 60, 5, 300, 1);
  const sailS = tn.num('shipSailS', 60, 10, 300, 1);
  const dockFog = tn.num('dockFogMax', 0.5, 0.1, 1, 0.01, 'Fog must be below this when a ship arrives');
  const dockChop = tn.num('dockChopMax', 0.5, 0.1, 1, 0.01, 'Chop must be below this when a ship arrives');
  const dockLamp = tn.num('dockLampMin', 0.15, 0, 1, 0.01);
  const stormMinS = tn.num('stormEveryMinS', 480, 60, 3600, 10, 'Storm interval low (s)');
  const stormMaxS = tn.num('stormEveryMaxS', 720, 60, 3600, 10, 'Storm interval high (s)');
  const warnS = tn.num('stormWarnS', 20, 5, 60, 1);
  const stormDurMin = tn.num('stormDurMinS', 60, 20, 300, 1);
  const stormDurMax = tn.num('stormDurMaxS', 90, 20, 300, 1);
  const stormGrade = tn.num('stormGradePct', 3, 0, 8, 0.5, 'Extra grade during storm');
  const stormZone = tn.num('stormZone', 3, 1, 5, 1, 'Min effortZone to keep lamp alive in storm');
  const stormSlack = tn.num('stormSlackS', 25, 5, 120, 1, 'Seconds below storm zone before lamp goes out');
  const surgeZone = tn.num('surgeZone', 5, 1, 5, 1);
  const surgeS = tn.num('surgeS', 15, 5, 60, 1);
  const swellPct = tn.num('swellGradePct', 1, 0, 3, 0.1, 'Swell effect amplitude');
  const swellPeriod = tn.num('swellPeriodS', 180, 30, 600, 5);
  const cottageCoin = tn.num('cottageCoinPerS', 0.04, 0, 1, 0.01);
  const pierTol = tn.num('pierTolerance', 0.08, 0, 0.3, 0.01);
  const marketMul = tn.num('marketMult', 1.25, 1, 3, 0.05);
  const bellMul = tn.num('bellFogMult', 0.6, 0.1, 1, 0.05);
  const lamp2Mul = tn.num('lamp2Mult', 1.5, 1, 3, 0.1);
  const graceS = tn.num('zoneGraceS', 4, 0, 15, 0.5, 'Seconds a new zone must hold before the lamp reacts');
  const dayLen = tn.num('dayLengthS', 1200, 60, 7200, 30);

  const saved = ctx.load<Saved>();
  const buildings: Array<BuildingType | null> = Array.from({ length: PLOT_COUNT }, (_, i) => saved?.buildings?.[i] ?? null);
  let coin = saved?.coin ?? 20;
  let timber = saved?.timber ?? 10;
  const totals = { shipsDockedTotal: saved?.shipsDockedTotal ?? 0, stormsWeatheredTotal: saved?.stormsWeatheredTotal ?? 0 };

  let t = 0;
  let fog = 0.4, chop = 0.3, lamp = 0.5;
  let zone = 1, rawZone = 1, zoneCand = 1, zoneCandS = 0;
  let fb = { text: '', ok: true, at: -99 };
  let satisfied = false, above = false, below = true;
  const ships: Ship[] = [];
  let nextShipId = 1;
  let spawnIn = 20 + ctx.rng() * 10; // first ship soon
  let cursorPlot = 0, cursorType = 0;
  let sinceSave = 0;

  // storm state
  let phase: StormPhase = 'calm';
  let phaseT = 0;
  let calmLeft = 0.6 * (stormMinS() + ctx.rng() * (stormMaxS() - stormMinS())); // first storm early so 30 min gives slack for 2
  let stormDur = 75;
  let integrity = 1;
  let intensity = 0;
  let surgeAt = 0, surgeHeldS = 0, surgeNow = false, surgeDone = false;
  let stormFailedThis = false;

  const stat = { minutesInZoneS: 0, shipsDocked: 0, shipsLost: 0, shipsSpilled: 0, buildingsBuilt: 0, stormsWeathered: 0, stormsFailed: 0, coinEarned: 0 };

  ctx.resistance.useVirtualGears(true);

  const count = (b: BuildingType) => buildings.filter((x) => x === b).length;
  const coinMult = () => (count('market') > 0 ? marketMul() : 1);
  const earn = (c: number) => { const v = c * coinMult(); coin += v; stat.coinEarned += v; };

  function persist() {
    ctx.save({ buildings: buildings.slice(), coin, timber, ...totals } satisfies Saved);
  }

  function whyNot(b: BuildingType, plot: number): string | null {
    const c = BUILD_COST[b];
    if (buildings[plot] !== null) return 'plot occupied';
    if (count(b) >= BUILD_MAX[b]) return `max ${BUILD_MAX[b]} built`;
    if (b === 'lamp2' && count('cottage') < 5) return `needs ${5 - count('cottage')} more cottages`;
    if (coin < c.coin) return `need ${Math.ceil(c.coin - coin)} more coin`;
    if (timber < c.timber) return `need ${Math.ceil(c.timber - timber)} more timber`;
    return null;
  }
  function canBuild(b: BuildingType): boolean {
    return buildings.includes(null) && whyNot(b, buildings.indexOf(null)) === null;
  }
  function build(b: BuildingType, plot: number): boolean {
    const why = whyNot(b, plot);
    if (why) { fb = { text: `Can't build ${b}: ${why}`, ok: false, at: t }; return false; }
    coin -= BUILD_COST[b].coin; timber -= BUILD_COST[b].timber;
    buildings[plot] = b;
    stat.buildingsBuilt++;
    fb = { text: `Built ${b} on plot ${plot + 1}`, ok: true, at: t };
    ctx.emit({ type: 'built', data: { building: b, plot } });
    persist();
    return true;
  }

  function handleInput() {
    const inp = ctx.input();
    const p = inp.pressed;
    if (p.has('right')) cursorPlot = (cursorPlot + 1) % PLOT_COUNT;
    if (p.has('left')) cursorPlot = (cursorPlot + PLOT_COUNT - 1) % PLOT_COUNT;
    if (p.has('up')) cursorType = (cursorType + 1) % BUILDING_TYPES.length;
    if (p.has('down')) cursorType = (cursorType + BUILDING_TYPES.length - 1) % BUILDING_TYPES.length;
    if (p.has('a')) build(BUILDING_TYPES[cursorType], cursorPlot);
  }
  function autopilot() {
    // cheapest-first-ish: keep a build order; place on first free plot
    const order: BuildingType[] = ['cottage', 'cottage', 'pier', 'cottage', 'cottage', 'cottage', 'bell', 'market', 'lamp2', 'pier', 'bell', 'cottage', 'cottage', 'cottage'];
    const need = new Map<BuildingType, number>();
    for (const b of order) {
      need.set(b, (need.get(b) ?? 0) + 1);
      if (count(b) < need.get(b)!) {
        const plot = buildings.indexOf(null);
        if (plot >= 0 && canBuild(b)) build(b, plot);
        return; // wait until the next item is affordable
      }
    }
  }

  function endStorm(weathered: boolean) {
    ctx.resistance.clear('storm');
    phase = 'calm'; phaseT = 0; intensity = 0; surgeNow = false;
    calmLeft = stormMinS() + ctx.rng() * Math.max(0, stormMaxS() - stormMinS());
    if (weathered) {
      stat.stormsWeathered++; totals.stormsWeatheredTotal++;
      earn(40); timber += 8;
      ctx.emit({ type: 'stormWeathered', data: { integrity } });
      const bonus = surgeDone && surgeHeldS >= surgeS() * 0.7;
      if (bonus) { earn(30); timber += 6; ctx.emit({ type: 'surgeSalvage' }); }
    }
    persist();
  }

  function updateStorm(dt: Seconds) {
    phaseT += dt;
    if (phase === 'calm') {
      calmLeft -= dt;
      if (calmLeft <= 0) { phase = 'warning'; phaseT = 0; ctx.emit({ type: 'stormWarning' }); }
    } else if (phase === 'warning') {
      intensity = Math.min(0.3, intensity + dt * 0.02);
      if (phaseT >= warnS()) {
        phase = 'storm'; phaseT = 0; integrity = 1; stormFailedThis = false;
        stormDur = stormDurMin() + ctx.rng() * Math.max(0, stormDurMax() - stormDurMin());
        surgeAt = stormDur / 2 - surgeS() / 2; surgeHeldS = 0; surgeNow = false; surgeDone = false;
        ctx.resistance.set({ id: 'storm', mode: 'sim', gradePct: stormGrade(), priority: 0 });
        ctx.emit({ type: 'stormStart', data: { durationS: stormDur } });
      }
    } else {
      intensity = Math.min(1, intensity + dt * 0.1);
      surgeNow = phaseT >= surgeAt && phaseT < surgeAt + surgeS();
      if (surgeNow) { if (zone >= surgeZone()) surgeHeldS += dt; }
      else if (phaseT >= surgeAt + surgeS()) surgeDone = true;
      if (!stormFailedThis) {
        if (zone >= stormZone()) integrity = Math.min(1, integrity + dt / stormSlack() * 0.5);
        else integrity -= dt / stormSlack();
        if (integrity <= 0) {
          integrity = 0; stormFailedThis = true; lamp = 0; stat.stormsFailed++;
          ctx.emit({ type: 'stormFailed' });
        }
      }
      if (phaseT >= stormDur) endStorm(!stormFailedThis);
    }
  }

  function spawnShip() {
    ships.push({ id: nextShipId++, progress: 0, lane: ctx.rng(), state: 'sailing', age: 0 });
    spawnIn = spawnMin() + ctx.rng() * Math.max(0, spawnMax() - spawnMin());
  }

  function arrive(s: Ship) {
    const tol = count('pier') * pierTol();
    const effChop = Math.max(chop, intensity * 0.8);
    const fogOk = fog < dockFog() + tol, chopOk = effChop < dockChop() + tol, lampOk = lamp >= dockLamp();
    s.age = 0;
    if (fogOk && chopOk && lampOk) {
      s.state = 'docked'; stat.shipsDocked++; totals.shipsDockedTotal++;
      const ct = 12 + Math.floor(ctx.rng() * 9), tb = 2 + Math.floor(ctx.rng() * 3);
      earn(ct); timber += tb;
      ctx.emit({ type: 'shipDocked', data: { coin: ct, timber: tb } });
    } else if (!chopOk) {
      s.state = 'spilled'; stat.shipsLost++; stat.shipsSpilled++;
      ctx.emit({ type: 'shipLost', data: { reason: 'chop' } });
    } else {
      s.state = 'lost'; stat.shipsLost++;
      ctx.emit({ type: 'shipLost', data: { reason: lampOk ? 'fog' : 'dark' } });
    }
  }

  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

  return {
    update(dt: Seconds) {
      t += dt;
      const bike = ctx.bike();
      rawZone = bike.effortZone;
      if (rawZone === zone) { zoneCand = zone; zoneCandS = 0; }
      else {
        if (rawZone !== zoneCand) { zoneCand = rawZone; zoneCandS = 0; }
        zoneCandS += dt;
        if (zoneCandS >= graceS()) { zone = zoneCand; zoneCandS = 0; }
      }
      if (opts?.autopilot) autopilot();
      handleInput();

      // requirement
      const need = phase === 'storm' ? stormZone() : zoneTarget();
      if (phase === 'storm') {
        satisfied = zone >= need;
        above = false; below = !satisfied;
      } else if (phase === 'warning') {
        satisfied = zone >= zoneTarget(); above = false; below = !satisfied;
      } else {
        satisfied = zone === zoneTarget();
        above = zone > zoneTarget(); below = zone < zoneTarget();
      }
      if (satisfied || zone === zoneTarget()) stat.minutesInZoneS += dt;

      const bellFactor = Math.pow(bellMul(), count('bell'));
      const lampPower = count('lamp2') > 0 ? lamp2Mul() : 1;
      if (satisfied) {
        fog = clamp01(fog - fogFall() * lampPower * dt);
        chop = clamp01(chop - chopFall() * dt);
        lamp = clamp01(lamp + lampUp() * dt);
      } else if (below) {
        fog = clamp01(fog + fogRise() * bellFactor * dt);
        chop = clamp01(chop - chopFall() * 0.25 * dt);
        if (!(phase === 'storm' && stormFailedThis)) lamp = clamp01(lamp - lampDown() * dt);
      } else if (above) {
        chop = clamp01(chop + chopRise() * dt);
        fog = clamp01(fog - fogFall() * 0.1 * dt);
        lamp = clamp01(lamp - lampDown() * 0.5 * dt);
      }
      if (phase === 'storm' && stormFailedThis) lamp = 0;

      updateStorm(dt);

      // swell resistance (sim mode) — 3 min sine
      ctx.resistance.set({ id: 'swell', mode: 'sim', gradePct: swellPct() * Math.sin((2 * Math.PI * t) / swellPeriod()) });

      // ships
      spawnIn -= dt;
      if (spawnIn <= 0) spawnShip();
      for (const s of ships) {
        if (s.state === 'sailing') {
          s.progress += dt / sailS();
          if (s.progress >= 1) { s.progress = 1; arrive(s); }
        } else s.age += dt;
      }
      for (let i = ships.length - 1; i >= 0; i--) if (ships[i].state !== 'sailing' && ships[i].age > 8) ships.splice(i, 1);

      // passive income
      const cot = count('cottage');
      if (cot) earn(cot * cottageCoin() * dt);

      sinceSave += dt;
      if (sinceSave >= 60) { sinceSave = 0; persist(); }
      ctx.debug('fog', Math.round(fog * 100) / 100);
      ctx.debug('chop', Math.round(chop * 100) / 100);
      ctx.debug('stormPhase', phase);
    },
    snapshot() {
      return {
        t, fog, chop: Math.max(chop, intensity * 0.8), baseChop: chop, lamp, zone,
        requirement: phase === 'storm' ? (surgeNow ? surgeZone() : stormZone()) : zoneTarget(),
        inZone: satisfied,
        day: ((t / dayLen()) + 0.3) % 1,
        ships: ships.map((s) => ({ ...s })),
        buildings: buildings.slice(),
        cursor: { plot: cursorPlot, building: BUILDING_TYPES[cursorType], canBuild: whyNot(BUILDING_TYPES[cursorType], cursorPlot) === null },
        options: BUILDING_TYPES.map((b, i) => ({ type: b, cost: BUILD_COST[b], effect: BUILD_EFFECT[b], owned: count(b), max: BUILD_MAX[b], selected: i === cursorType, reason: whyNot(b, cursorPlot) })),
        feedback: { ...fb, age: t - fb.at },
        costs: BUILD_COST,
        coin, timber,
        storm: { phase, timeInPhase: phaseT, warnS: warnS(), duration: stormDur, integrity, intensity, surge: surgeNow, nextInS: phase === 'calm' ? calmLeft : 0 },
        hooks: { storm: phase === 'storm' || phase === 'warning' },
        stats: { ...stat },
      };
    },
    hud(): GameHud {
      const targetZone = phase === 'storm'
        ? (surgeNow ? { min: 5 as const, max: 5 as const, label: 'Lightning surge' } : { min: 3 as const, max: 5 as const, label: 'Storm!' })
        : { min: 2 as const, max: 2 as const, label: 'Keep the lamp lit' };
      return {
        targetZone,
        controls: [
          { button: 'dpad', label: 'left/right = plot, up/down = building' },
          { button: 'a', label: 'Build' },
          { button: 'shiftersL', label: 'Gears' }, { button: 'shiftersR', label: 'Gears' },
        ],
        gears: true,
      };
    },
    isOver: () => false,
    summary() {
      return {
        minutesInZone: Math.round((stat.minutesInZoneS / 60) * 100) / 100,
        shipsDocked: stat.shipsDocked,
        shipsLost: stat.shipsLost,
        buildingsBuilt: stat.buildingsBuilt,
        stormsWeathered: stat.stormsWeathered,
        stormsFailed: stat.stormsFailed,
        coin: Math.round(coin),
      };
    },
    dispose() { persist(); },
  };
}
