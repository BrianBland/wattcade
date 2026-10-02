// Keeper's Light sim. Pure logic: no DOM, no three. Deterministic (ctx.rng / ctx.clock only).
import type { GameContext, GameHud, GameSim, Seconds } from '../../../contracts';
import { HARBOUR, PLOTS, PLOT_COUNT } from './layout';

export type BuildingType = 'cottage' | 'garden' | 'pier' | 'market' | 'bell' | 'lamp2';
export const BUILDING_TYPES: BuildingType[] = ['cottage', 'garden', 'pier', 'market', 'bell', 'lamp2'];
export const BUILD_COST: Record<BuildingType, { coin: number; timber: number }> = {
  cottage: { coin: 25, timber: 8 },
  garden: { coin: 15, timber: 3 },
  pier: { coin: 60, timber: 15 },
  market: { coin: 120, timber: 25 },
  bell: { coin: 80, timber: 20 },
  lamp2: { coin: 150, timber: 40 },
};
export const BUILD_MAX: Record<BuildingType, number> = { cottage: 8, garden: 4, pier: 2, market: 1, bell: 2, lamp2: 1 };
export const BUILD_LABEL: Record<BuildingType, string> = { cottage: 'Cottage', garden: 'Garden', pier: 'Pier', market: 'Market', bell: 'Fog Bell', lamp2: 'Beacon' };
export const BUILD_EFFECT: Record<BuildingType, string> = {
  cottage: 'Villagers move in; +coin over time',
  garden: 'Flowers spread; island blooms faster; cottages +10%',
  pier: 'Ships dock in rougher, foggier water; fishers',
  market: 'All coin x1.25; stalls and crowds',
  bell: 'Fog rises slower',
  lamp2: 'Stronger lamp, clears fog faster',
};
export { PLOT_COUNT };

export type ShipKind = 'smack' | 'schooner' | 'steamer';
export type ShipState = 'sailing' | 'docked' | 'lost' | 'spilled';
export type ShipCheck = 'ok' | 'fog' | 'chop' | 'dark';
export interface Ship { id: number; kind: ShipKind; name: string; progress: number; lane: number; state: ShipState; age: number; dock: number }
export type StormPhase = 'calm' | 'warning' | 'storm';
export type Mode = 'watch' | 'build';
export type LighthouseAction =
  | { type: 'mode'; mode: Mode } | { type: 'plot'; plot: number } | { type: 'select'; building: BuildingType }
  | { type: 'build' } | { type: 'view' };

const SHIP_KINDS: Array<{ kind: ShipKind; value: number; w: number }> = [
  { kind: 'smack', value: 0.8, w: 0.45 }, { kind: 'schooner', value: 1, w: 0.4 }, { kind: 'steamer', value: 1.4, w: 0.15 },
];
const SHIP_NAMES = ['Marigold', 'Kittiwake', 'Sea Wren', 'Good Hope', 'Bramble', 'Puffin', 'Lantern', 'Saltmarsh', 'Morwenna',
  'Selkie', 'Halcyon', 'Driftwood', 'Tern', 'Bluebell', 'Cormorant', 'Gannet', 'Wayfarer', 'Periwinkle', 'Thistle', 'Osprey'];
const LINGER: Record<Exclude<ShipState, 'sailing'>, number> = { docked: 25, lost: 14, spilled: 12 };
/** Relative grow speed of the greenery around each building. */
const GROW_RATE: Record<BuildingType, number> = { garden: 2, cottage: 1, market: 0.8, pier: 0.8, bell: 0.6, lamp2: 0.6 };
export const VIEW_COUNT = 3;

export interface SimOpts { seed?: number; autopilot?: boolean }
interface Saved {
  v: 2; buildings: Array<BuildingType | null>; grow: number[]; coin: number; timber: number; meadow: number;
  shipsDockedTotal: number; stormsWeatheredTotal: number;
}

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
  const gardenBoost = tn.num('gardenCottageBoost', 0.1, 0, 1, 0.01, 'Cottage income bonus per garden');
  const pierTol = tn.num('pierTolerance', 0.08, 0, 0.3, 0.01);
  const marketMul = tn.num('marketMult', 1.25, 1, 3, 0.05);
  const bellMul = tn.num('bellFogMult', 0.6, 0.1, 1, 0.05);
  const lamp2Mul = tn.num('lamp2Mult', 1.5, 1, 3, 0.1);
  const graceS = tn.num('zoneGraceS', 4, 0, 15, 0.5, 'Seconds a new zone must hold before the lamp reacts');
  const dayLen = tn.num('dayLengthS', 1800, 60, 7200, 30, 'Length of a full day/night cycle');
  const growPerMin = tn.num('growPerMin', 0.1, 0, 1, 0.01, 'Greenery growth around a building per in-zone minute');
  const meadowPerMin = tn.num('meadowPerMin', 1 / 60, 0, 0.2, 0.001, 'Island-wide bloom per in-zone minute (gardens add 50% each)');
  const buildIdleS = tn.num('buildIdleS', 30, 5, 120, 1, 'Build menu closes after this long without input');

  const raw = ctx.load<Saved>();
  const saved = raw && raw.v === 2 ? raw : undefined; // older saves are discarded
  const buildings: Array<BuildingType | null> = Array.from({ length: PLOT_COUNT }, (_, i) => saved?.buildings?.[i] ?? null);
  const grow: number[] = Array.from({ length: PLOT_COUNT }, (_, i) => saved?.grow?.[i] ?? 0);
  let coin = saved?.coin ?? 20;
  let timber = saved?.timber ?? 10;
  let meadow = saved?.meadow ?? 0;
  const totals = { shipsDockedTotal: saved?.shipsDockedTotal ?? 0, stormsWeatheredTotal: saved?.stormsWeatheredTotal ?? 0 };

  let t = 0;
  let fog = 0.4, chop = 0.3, lamp = 0.5;
  let zone = 1, rawZone = 1, zoneCand = 1, zoneCandS = 0;
  let fb = { text: '', ok: true, at: -99 };
  let satisfied = false, above = false, below = true;
  const ships: Ship[] = [];
  let nextShipId = 1;
  let spawnIn = 20 + ctx.rng() * 10; // first ship soon
  let sinceSave = 0;

  // build UI
  let mode: Mode = 'watch';
  let sel = 0, cursorPlot = 0, idleS = 0, view = 0;
  const pending: LighthouseAction[] = [];
  let nudgeAt = -999;
  const nudged = new Set<BuildingType>();

  // cues / toasts for the renderer
  const cues: Array<{ name: string; id: number }> = [];
  let cueId = 0;
  const cue = (name: string) => { cues.push({ name, id: ++cueId }); if (cues.length > 30) cues.shift(); };
  const toasts: Array<{ id: number; text: string; color: string; t: number }> = [];
  let toastId = 0;
  const toast = (text: string, color = '#fff') => { toasts.push({ id: ++toastId, text, color, t }); if (toasts.length > 6) toasts.shift(); };

  // storm state
  let phase: StormPhase = 'calm';
  let phaseT = 0;
  let calmLeft = 0.6 * (stormMinS() + ctx.rng() * (stormMaxS() - stormMinS())); // first storm early so 30 min gives slack for 2
  let stormDur = 75;
  let integrity = 1;
  let intensity = 0;
  let surgeAt = 0, surgeHeldS = 0, surgeNow = false, surgeDone = false;
  let stormFailedThis = false;
  let lightningAt = -99, nextLightning = 0, bellAt = -99, nextBell = 0;

  const stat = { minutesInZoneS: 0, shipsDocked: 0, shipsLost: 0, shipsSpilled: 0, buildingsBuilt: 0, stormsWeathered: 0, stormsFailed: 0, coinEarned: 0 };

  ctx.resistance.useVirtualGears(true);

  const count = (b: BuildingType) => buildings.filter((x) => x === b).length;
  const coinMult = () => (count('market') > 0 ? marketMul() : 1);
  const earn = (c: number) => { const v = c * coinMult(); coin += v; stat.coinEarned += v; return v; };

  function persist() {
    ctx.save({ v: 2, buildings: buildings.slice(), grow: grow.map((g) => Math.round(g * 1000) / 1000), coin, timber, meadow, ...totals } satisfies Saved);
  }

  const plotOk = (b: BuildingType, plot: number) => buildings[plot] === null && (b !== 'pier' || PLOTS[plot].shore);
  function whyNot(b: BuildingType, plot: number): string | null {
    const c = BUILD_COST[b];
    if (count(b) >= BUILD_MAX[b]) return `all ${BUILD_MAX[b]} built`;
    if (b === 'lamp2' && count('cottage') < 5) return `needs ${5 - count('cottage')} more cottages`;
    if (b === 'pier' && !PLOTS.some((p, i) => p.shore && buildings[i] === null)) return 'no free beach plot';
    if (buildings[plot] !== null) return 'plot taken';
    if (b === 'pier' && !PLOTS[plot].shore) return 'piers go on the beach';
    if (coin < c.coin) return `need ${Math.ceil(c.coin - coin)} more coin`;
    if (timber < c.timber) return `need ${Math.ceil(c.timber - timber)} more timber`;
    return null;
  }
  /** Best empty plot for a building: beach for piers, otherwise inland near the existing town. */
  function suggestPlot(b: BuildingType): number {
    const free = PLOTS.map((_, i) => i).filter((i) => plotOk(b, i));
    if (!free.length) return cursorPlot;
    if (b === 'pier') return free.sort((i, j) => Math.hypot(PLOTS[i].x - HARBOUR.x, PLOTS[i].z - HARBOUR.z) - Math.hypot(PLOTS[j].x - HARBOUR.x, PLOTS[j].z - HARBOUR.z))[0];
    const built = buildings.map((k, i) => (k ? i : -1)).filter((i) => i >= 0);
    const cx = built.length ? built.reduce((s, i) => s + PLOTS[i].x, 0) / built.length : 2;
    const cz = built.length ? built.reduce((s, i) => s + PLOTS[i].z, 0) / built.length : 7;
    const inland = free.filter((i) => !PLOTS[i].shore);
    const pool = inland.length ? inland : free;
    return pool.sort((i, j) => Math.hypot(PLOTS[i].x - cx, PLOTS[i].z - cz) - Math.hypot(PLOTS[j].x - cx, PLOTS[j].z - cz))[0];
  }
  function build(b: BuildingType, plot: number): boolean {
    const why = whyNot(b, plot);
    if (why) { fb = { text: `Can't build ${BUILD_LABEL[b]}: ${why}`, ok: false, at: t }; cue('deny'); return false; }
    coin -= BUILD_COST[b].coin; timber -= BUILD_COST[b].timber;
    buildings[plot] = b; grow[plot] = 0;
    stat.buildingsBuilt++;
    fb = { text: `Built a ${BUILD_LABEL[b]}`, ok: true, at: t };
    toast(`${BUILD_LABEL[b]} built!`, '#9cf59c');
    cue('build');
    nudged.clear();
    ctx.emit({ type: 'built', data: { building: b, plot } });
    persist();
    return true;
  }

  const affordable = () => BUILDING_TYPES.filter((b) => whyNot(b, suggestPlot(b)) === null);
  function openBuild() {
    mode = 'build'; idleS = 0;
    const can = affordable();
    if (can.length && !can.includes(BUILDING_TYPES[sel])) sel = BUILDING_TYPES.indexOf(can[0]);
    cursorPlot = suggestPlot(BUILDING_TYPES[sel]);
    cue('select');
  }
  function stepPlot(dir: 1 | -1) {
    const b = BUILDING_TYPES[sel];
    const order = PLOTS.map((_, i) => i).filter((i) => plotOk(b, i) || i === cursorPlot)
      .sort((i, j) => PLOTS[i].x - PLOTS[j].x || PLOTS[i].z - PLOTS[j].z);
    if (order.length <= 1) return;
    const k = order.indexOf(cursorPlot);
    cursorPlot = order[(k + dir + order.length) % order.length];
    if (!plotOk(b, cursorPlot) && order.length > 2) stepPlot(dir); // skip the taken plot we started on
    cue('select');
  }
  function stepType(dir: 1 | -1) {
    sel = (sel + dir + BUILDING_TYPES.length) % BUILDING_TYPES.length;
    if (!plotOk(BUILDING_TYPES[sel], cursorPlot)) cursorPlot = suggestPlot(BUILDING_TYPES[sel]);
    cue('select');
  }
  function apply(a: LighthouseAction) {
    idleS = 0;
    if (a.type === 'view') { view = (view + 1) % VIEW_COUNT; cue('select'); }
    else if (a.type === 'mode') { if (a.mode === 'build') openBuild(); else mode = 'watch'; }
    else if (a.type === 'plot') {
      if (a.plot < 0 || a.plot >= PLOT_COUNT) return;
      if (mode !== 'build') openBuild();
      cursorPlot = a.plot;
      if (!plotOk(BUILDING_TYPES[sel], a.plot) && buildings[a.plot] === null) sel = BUILDING_TYPES.indexOf('cottage');
      cue('select');
    } else if (a.type === 'select') {
      const i = BUILDING_TYPES.indexOf(a.building); if (i < 0) return;
      if (mode !== 'build') openBuild();
      sel = i;
      if (!plotOk(a.building, cursorPlot)) cursorPlot = suggestPlot(a.building);
      cue('select');
    } else if (a.type === 'build') {
      if (mode !== 'build') { openBuild(); return; }
      if (build(BUILDING_TYPES[sel], cursorPlot)) mode = 'watch';
    }
  }

  function handleInput(dt: Seconds) {
    for (const a of pending.splice(0)) apply(a);
    const p = ctx.input().pressed;
    if (mode === 'watch') {
      if (p.has('a')) apply({ type: 'mode', mode: 'build' });
      if (p.has('y')) apply({ type: 'view' });
      return;
    }
    idleS += dt;
    if (p.size) idleS = 0;
    if (p.has('right')) stepPlot(1);
    if (p.has('left')) stepPlot(-1);
    if (p.has('up')) stepType(-1);
    if (p.has('down')) stepType(1);
    if (p.has('a')) apply({ type: 'build' });
    if (p.has('b') || idleS >= buildIdleS()) mode = 'watch';
  }
  function nudge() {
    if (mode !== 'watch' || t - nudgeAt < 45) return;
    const b = affordable().find((x) => !nudged.has(x));
    if (!b) return;
    nudged.add(b); nudgeAt = t;
    toast(`You can build a ${BUILD_LABEL[b]} - press A`, '#ffd84a');
    cue('chime');
  }
  function autopilot() {
    const order: BuildingType[] = ['garden', 'cottage', 'cottage', 'pier', 'cottage', 'garden', 'cottage', 'cottage', 'bell', 'market', 'lamp2', 'pier', 'bell', 'cottage', 'garden', 'cottage', 'cottage', 'garden'];
    const need = new Map<BuildingType, number>();
    for (const b of order) {
      need.set(b, (need.get(b) ?? 0) + 1);
      if (count(b) < need.get(b)!) {
        const plot = suggestPlot(b);
        if (whyNot(b, plot) === null) build(b, plot);
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
      toast('Storm weathered! +40 coin +8 timber', '#9cf59c');
      cue('reward');
      const bonus = surgeDone && surgeHeldS >= surgeS() * 0.7;
      if (bonus) { earn(30); timber += 6; ctx.emit({ type: 'surgeSalvage' }); toast('Surge salvage! +30 coin +6 timber', '#ffd84a'); }
    } else toast('The storm has passed', '#bcd');
    persist();
  }

  function updateStorm(dt: Seconds) {
    phaseT += dt;
    if (phase === 'calm') {
      calmLeft -= dt;
      if (calmLeft <= 0) { phase = 'warning'; phaseT = 0; ctx.emit({ type: 'stormWarning' }); cue('foghorn'); toast('Storm clouds gathering - get ready to push!', '#ffb347'); }
    } else if (phase === 'warning') {
      intensity = Math.min(0.3, intensity + dt * 0.02);
      if (phaseT >= warnS()) {
        phase = 'storm'; phaseT = 0; integrity = 1; stormFailedThis = false;
        stormDur = stormDurMin() + ctx.rng() * Math.max(0, stormDurMax() - stormDurMin());
        surgeAt = stormDur / 2 - surgeS() / 2; surgeHeldS = 0; surgeNow = false; surgeDone = false;
        nextLightning = 2;
        ctx.resistance.set({ id: 'storm', mode: 'sim', gradePct: stormGrade(), priority: 0 });
        ctx.emit({ type: 'stormStart', data: { durationS: stormDur } });
        cue('thunder');
      }
    } else {
      intensity = Math.min(1, intensity + dt * 0.1);
      const wasSurge = surgeNow;
      surgeNow = phaseT >= surgeAt && phaseT < surgeAt + surgeS();
      if (surgeNow && !wasSurge) cue('surge');
      if (surgeNow) { if (zone >= surgeZone()) surgeHeldS += dt; }
      else if (phaseT >= surgeAt + surgeS()) surgeDone = true;
      nextLightning -= dt;
      if (nextLightning <= 0) { lightningAt = t; cue('thunder'); nextLightning = (surgeNow ? 1.5 : 4) + ctx.rng() * (surgeNow ? 2 : 6); }
      if (!stormFailedThis) {
        if (zone >= stormZone()) integrity = Math.min(1, integrity + dt / stormSlack() * 0.5);
        else integrity -= dt / stormSlack();
        if (integrity <= 0) {
          integrity = 0; stormFailedThis = true; lamp = 0; stat.stormsFailed++;
          ctx.emit({ type: 'stormFailed' });
          cue('lampOut'); toast('The lamp has gone out!', '#ff7b7b');
        }
      }
      if (phaseT >= stormDur) endStorm(!stormFailedThis);
    }
  }

  function spawnShip() {
    let r = ctx.rng(), kind: ShipKind = 'smack';
    for (const k of SHIP_KINDS) { if (r < k.w) { kind = k.kind; break; } r -= k.w; }
    const id = nextShipId++;
    ships.push({ id, kind, name: SHIP_NAMES[(id * 7) % SHIP_NAMES.length], progress: 0, lane: ctx.rng(), state: 'sailing', age: 0, dock: -1 });
    spawnIn = spawnMin() + ctx.rng() * Math.max(0, spawnMax() - spawnMin());
  }

  const effChop = () => Math.max(chop, intensity * 0.8);
  function check(): ShipCheck {
    const tol = count('pier') * pierTol();
    if (!(effChop() < dockChop() + tol)) return 'chop';
    if (!(lamp >= dockLamp())) return 'dark';
    if (!(fog < dockFog() + tol)) return 'fog';
    return 'ok';
  }
  function arrive(s: Ship) {
    const c = check();
    s.age = 0;
    if (c === 'ok') {
      s.state = 'docked'; stat.shipsDocked++; totals.shipsDockedTotal++;
      const piers = buildings.map((b, i) => (b === 'pier' ? i : -1)).filter((i) => i >= 0);
      const busy = new Set(ships.filter((o) => o !== s && o.state === 'docked').map((o) => o.dock));
      s.dock = piers.find((i) => !busy.has(i)) ?? -1;
      const value = SHIP_KINDS.find((k) => k.kind === s.kind)!.value;
      const ct = Math.round((12 + Math.floor(ctx.rng() * 9)) * value), tb = Math.round((2 + Math.floor(ctx.rng() * 3)) * value);
      const got = earn(ct); timber += tb;
      ctx.emit({ type: 'shipDocked', data: { coin: ct, timber: tb } });
      toast(`${s.name} docked  +${Math.round(got)} coin  +${tb} timber`, '#ffd84a');
      cue('horn');
    } else if (c === 'chop') {
      s.state = 'spilled'; stat.shipsLost++; stat.shipsSpilled++;
      ctx.emit({ type: 'shipLost', data: { reason: 'chop' } });
      toast(`${s.name} spilled her cargo in rough seas`, '#ff9b7b');
      cue('splash');
    } else {
      s.state = 'lost'; stat.shipsLost++;
      ctx.emit({ type: 'shipLost', data: { reason: c } });
      toast(`${s.name} ran aground ${c === 'dark' ? 'in the dark' : 'in the fog'}`, '#ff7b7b');
      cue('wreck');
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
      handleInput(dt);

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

      // greenery grows while you hold the zone
      if (satisfied) {
        const g = growPerMin() / 60 * dt;
        for (let i = 0; i < PLOT_COUNT; i++) { const b = buildings[i]; if (b) grow[i] = Math.min(1, grow[i] + g * GROW_RATE[b]); }
        const before = meadow;
        meadow = Math.min(1, meadow + meadowPerMin() / 60 * dt * (1 + 0.5 * count('garden')));
        if (Math.floor(before * 10) !== Math.floor(meadow * 10)) { toast(`The island is blooming (${Math.floor(meadow * 10) * 10}%)`, '#ffb3e6'); cue('chime'); }
      }

      updateStorm(dt);

      // fog bells ring while fog thickens
      if (count('bell') && fog > 0.35 && !satisfied) {
        nextBell -= dt;
        if (nextBell <= 0) { bellAt = t; cue('bell'); nextBell = 9; }
      } else nextBell = Math.min(nextBell, 1);

      // swell resistance (sim mode) - 3 min sine
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
      for (let i = ships.length - 1; i >= 0; i--) { const s = ships[i]; if (s.state !== 'sailing' && s.age > LINGER[s.state]) ships.splice(i, 1); }

      // passive income
      const cot = count('cottage');
      if (cot) earn(cot * cottageCoin() * (1 + gardenBoost() * count('garden')) * dt);
      nudge();

      sinceSave += dt;
      if (sinceSave >= 60) { sinceSave = 0; persist(); }
      ctx.debug('fog', Math.round(fog * 100) / 100);
      ctx.debug('chop', Math.round(chop * 100) / 100);
      ctx.debug('stormPhase', phase);
      ctx.debug('meadow', Math.round(meadow * 100) / 100);
    },
    receive(action: unknown) {
      if (action && typeof action === 'object' && 'type' in action) pending.push(action as LighthouseAction);
    },
    snapshot() {
      const c = check();
      const tol = count('pier') * pierTol();
      const b = BUILDING_TYPES[sel];
      return {
        t, fog, chop: effChop(), baseChop: chop, lamp, zone, rawZone,
        requirement: phase === 'storm' ? (surgeNow ? surgeZone() : stormZone()) : zoneTarget(),
        inZone: satisfied, above, below,
        limits: { fog: dockFog() + tol, chop: dockChop() + tol, lamp: dockLamp() },
        day: ((t / dayLen()) + 0.82) % 1, // 0 = noon, 0.5 = midnight; sessions start mid-morning
        ships: ships.map((s) => ({ ...s, etaS: (1 - s.progress) * sailS(), check: s.state === 'sailing' ? c : 'ok' as ShipCheck })),
        nextShipS: spawnIn,
        buildings: buildings.slice(), grow: grow.slice(), meadow,
        mode, view,
        cursor: { plot: cursorPlot, building: b, canBuild: whyNot(b, cursorPlot) === null },
        canBuildAny: affordable().length > 0,
        options: BUILDING_TYPES.map((x, i) => ({ type: x, label: BUILD_LABEL[x], cost: BUILD_COST[x], effect: BUILD_EFFECT[x], owned: count(x), max: BUILD_MAX[x], selected: i === sel, reason: whyNot(x, cursorPlot) })),
        feedback: { ...fb, age: t - fb.at },
        toasts: toasts.map((x) => ({ ...x, age: t - x.t })),
        cues: cues.slice(),
        costs: BUILD_COST,
        coin, timber,
        storm: { phase, timeInPhase: phaseT, warnS: warnS(), duration: stormDur, integrity, intensity, surge: surgeNow, nextInS: phase === 'calm' ? calmLeft : 0, lightningAge: t - lightningAt, failed: stormFailedThis },
        bellAge: t - bellAt,
        hooks: { storm: phase === 'storm' || phase === 'warning' },
        totals: { ...totals },
        stats: { ...stat },
      };
    },
    hud(): GameHud {
      const targetZone = phase === 'storm'
        ? (surgeNow ? { min: 5 as const, max: 5 as const, label: 'Lightning surge' } : { min: 3 as const, max: 5 as const, label: 'Storm!' })
        : phase === 'warning' ? { min: 2 as const, max: 5 as const, label: 'Storm coming' }
          : { min: 2 as const, max: 2 as const, label: 'Keep the lamp lit' };
      const controls = mode === 'build'
        ? [{ button: 'dpad' as const, label: '◀▶ plot  ▲▼ building' }, { button: 'a' as const, label: 'Build', active: true }, { button: 'b' as const, label: 'Close' }]
        : [{ button: 'a' as const, label: 'Build menu' }, { button: 'y' as const, label: 'Camera' }];
      return { targetZone, controls: [...controls, { button: 'shiftersL', label: 'Gears' }, { button: 'shiftersR', label: 'Gears' }], gears: true };
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
        bloomPct: Math.round(meadow * 100),
      };
    },
    dispose() { persist(); },
  };
}
