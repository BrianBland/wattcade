// Keeper's Light sim. Pure logic: no DOM, no three. Deterministic (ctx.rng / ctx.clock only).
import type { GameContext, GameHud, GameSim, Seconds } from '../../../contracts';
import { HARBOUR, PLOTS, PLOT_COUNT, type DistrictId } from './layout';
import {
  BUILDINGS, BUILDING_TYPES, DISTRICTS, LENS, LENS_EFFECT, districtOpen, homeBonus, maxLevel, millBonus, orchardBonus, pierBonus, preview,
  upgradeCost, upgradeGrow, type BuildingType,
} from './town';
import {
  DECOR, DECOR_IDS, DECOR_MIN_BUILDINGS, FESTIVALS, SEASON_NAME, VISITOR_KINDS, VISITORS, decorMax, pickWeather, seasonFor,
  type DecorId, type GiftId, type Season, type VisitorKind, type Weather,
} from './extras';

export { BUILDING_TYPES, PLOT_COUNT, type BuildingType };
export type ShipKind = 'smack' | 'schooner' | 'steamer' | VisitorKind;
export { DECOR_IDS, type DecorId, type GiftId, type Season, type Weather };
export type ShipState = 'sailing' | 'docked' | 'lost' | 'spilled';
export type ShipCheck = 'ok' | 'fog' | 'chop' | 'dark';
export interface Ship { id: number; kind: ShipKind; name: string; progress: number; lane: number; state: ShipState; age: number; dock: number; rescued: boolean }
export type StormPhase = 'calm' | 'warning' | 'storm';
export type Mode = 'watch' | 'build';
export type Tab = 'build' | 'decor';
/** A build-menu row: a building type, "upgrade the building under the cursor", or "upgrade the lighthouse lens". */
export type RowKey = BuildingType | 'upgrade' | 'lens';
export const ROWS: RowKey[] = ['upgrade', ...BUILDING_TYPES, 'lens'];
export type LighthouseAction =
  | { type: 'mode'; mode: Mode } | { type: 'plot'; plot: number } | { type: 'select'; building: RowKey }
  | { type: 'build' } | { type: 'view' } | { type: 'log' } | { type: 'tab'; tab: Tab } | { type: 'decor'; decor: DecorId };

const SHIP_KINDS: Array<{ kind: ShipKind; value: number; w: number }> = [
  { kind: 'smack', value: 0.8, w: 0.45 }, { kind: 'schooner', value: 1, w: 0.4 }, { kind: 'steamer', value: 1.4, w: 0.15 },
];
const SHIP_NAMES = ['Marigold', 'Kittiwake', 'Sea Wren', 'Good Hope', 'Bramble', 'Puffin', 'Lantern', 'Saltmarsh', 'Morwenna',
  'Selkie', 'Halcyon', 'Driftwood', 'Tern', 'Bluebell', 'Cormorant', 'Gannet', 'Wayfarer', 'Periwinkle', 'Thistle', 'Osprey'];
const LINGER: Record<Exclude<ShipState, 'sailing'>, number> = { docked: 25, lost: 14, spilled: 12 };
/** Relative grow speed of the greenery around each building. */
const GROW_RATE: Record<BuildingType, number> = { garden: 2, orchard: 1.5, cottage: 1, market: 0.8, pier: 0.8, mill: 0.7, shipyard: 0.6, lifeboat: 0.6, bell: 0.6, lamp2: 0.6 };
const HOME_MULT = [1, 2.2, 3.6], MARKET_MULT = [1.25, 1.4, 1.6], PIER_TOL = [1, 1.5, 2], BELL_W = [1, 1.6], YARD_MULT = [1.3, 1.6];
export const VIEW_COUNT = 3;
export const LIGHTHOUSE_PLOT = -1;

export interface SimOpts { seed?: number; autopilot?: boolean }
interface Saved {
  v: 2; buildings: Array<BuildingType | null>; levels?: number[]; grow: number[]; coin: number; timber: number; meadow: number; lens?: number;
  shipsDockedTotal: number; stormsWeatheredTotal: number;
  rides?: number; decor?: Partial<Record<DecorId, number>>; gifts?: GiftId[]; festivals?: number;
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
  const windEveryMin = tn.num('windEveryMinS', 240, 60, 3600, 10, 'Clockwork wind-up interval low (s)');
  const windEveryMax = tn.num('windEveryMaxS', 420, 60, 3600, 10, 'Clockwork wind-up interval high (s)');
  const windS = tn.num('windS', 40, 10, 180, 5, 'Clockwork wind-up window (s)');
  const windNeedS = tn.num('windNeedS', 20, 5, 120, 1, 'Seconds at wind-up cadence to wind the clockwork');
  const windRpm = tn.num('windRpm', 90, 60, 140, 1, 'Wind-up cadence floor (rpm)');
  const windCoin = tn.num('windCoin', 15, 0, 200, 1, 'Coin for a wound clockwork');
  const swellPct = tn.num('swellGradePct', 1, 0, 3, 0.1, 'Swell effect amplitude');
  const swellPeriod = tn.num('swellPeriodS', 180, 30, 600, 5);
  const cottageCoin = tn.num('cottageCoinPerS', 0.04, 0, 1, 0.01);
  const orchardCoin = tn.num('orchardCoinPerS', 0.03, 0, 1, 0.005);
  const orchardTimber = tn.num('orchardTimberPerS', 0.008, 0, 1, 0.001);
  const millTimber = tn.num('millTimberPerS', 0.03, 0, 1, 0.005);
  const fisheryCoin = tn.num('fisheryCoinPerS', 0.05, 0, 1, 0.005);
  const pierTol = tn.num('pierTolerance', 0.08, 0, 0.3, 0.01);
  const marketMul = tn.num('marketMult', 1.25, 1, 3, 0.05, 'Market level-1 coin multiplier (higher levels scale from it)');
  const bellMul = tn.num('bellFogMult', 0.6, 0.1, 1, 0.05);
  const lamp2Mul = tn.num('lamp2Mult', 1.5, 1, 3, 0.1);
  const graceS = tn.num('zoneGraceS', 4, 0, 15, 0.5, 'Seconds a new zone must hold before the lamp reacts');
  const stormGraceS = tn.num('stormZoneGraceS', 1.5, 0, 15, 0.5, 'Zone debounce during storms (power-judged, so shorter)');
  const dayLen = tn.num('dayLengthS', 1800, 60, 7200, 30, 'Length of a full day/night cycle');
  const growPerMin = tn.num('growPerMin', 0.03, 0, 1, 0.005, 'Greenery growth around a building per in-zone minute');
  const meadowPerMin = tn.num('meadowPerMin', 1 / 400, 0, 0.2, 0.0005, 'Island-wide bloom per in-zone minute (gardens add 15% per level)');
  const buildIdleS = tn.num('buildIdleS', 30, 5, 120, 1, 'Build menu closes after this long without input');
  const streakStepS = tn.num('streakStepS', 300, 30, 1800, 10, 'Seconds of steady riding per +10% Steady Light bonus');
  const streakMax = tn.num('streakMaxMult', 1.5, 1, 3, 0.05, 'Cap on the Steady Light multiplier');
  const streakGrace = tn.num('streakGraceS', 12, 0, 60, 1, 'Seconds out of zone before the streak breaks');
  const rescueEvery = tn.num('lifeboatCooldownS', 240, 30, 1800, 10, 'Lifeboat cooldown between rescues');
  const calmAfterS = tn.num('stormCalmAfterS', 90, 0, 300, 5, 'After a storm: seconds when riding above zone neither churns the sea nor breaks the streak (HR is still high)');
  const ridesPerSeason = tn.num('ridesPerSeason', 2, 1, 20, 1, 'Rides per season (spring, summer, autumn, winter)');
  const festivalS = tn.num('festivalS', 300, 30, 1800, 10, 'How long a bloom festival lasts (s)');
  const visitorChance = tn.num('visitorChance', 0.12, 0, 1, 0.01, 'Chance a new ship is a special visitor (once eligible)');
  const weatherMinS = tn.num('weatherEveryMinS', 240, 30, 3600, 10, 'Cosmetic weather change interval low (s)');
  const weatherMaxS = tn.num('weatherEveryMaxS', 420, 30, 3600, 10, 'Cosmetic weather change interval high (s)');
  const whaleEvery = tn.num('whaleEveryS', 600, 60, 3600, 10, 'Min seconds between whale visits (only during a Steady Light streak)');

  const raw = ctx.load<Saved>();
  const saved = raw && raw.v === 2 ? raw : undefined; // older saves are discarded
  const buildings: Array<BuildingType | null> = Array.from({ length: PLOT_COUNT }, (_, i) => saved?.buildings?.[i] ?? null);
  const levels: number[] = buildings.map((b, i) => (b ? Math.min(maxLevel(b), Math.max(1, saved?.levels?.[i] ?? 1)) : 0));
  const grow: number[] = Array.from({ length: PLOT_COUNT }, (_, i) => saved?.grow?.[i] ?? 0);
  let coin = saved?.coin ?? 20;
  let timber = saved?.timber ?? 10;
  let meadow = saved?.meadow ?? 0;
  let lens = Math.max(1, Math.min(LENS.length, saved?.lens ?? 1));
  const totals = { shipsDockedTotal: saved?.shipsDockedTotal ?? 0, stormsWeatheredTotal: saved?.stormsWeatheredTotal ?? 0 };
  const meadowStart = meadow;
  const rides = saved?.rides ?? 0;
  const season: Season = seasonFor(rides, ridesPerSeason());
  const decor = Object.fromEntries(DECOR_IDS.map((d) => [d, Math.min(decorMax(d), Math.max(0, saved?.decor?.[d] ?? 0))])) as Record<DecorId, number>;
  const gifts: GiftId[] = (saved?.gifts ?? []).filter((g) => VISITOR_KINDS.some((k) => VISITORS[k].gift === g));
  // older saves: count the milestones already passed as held, so they don't all fire at once
  let festivalsHeld = saved?.festivals ?? FESTIVALS.filter((f) => meadow >= f.at).length;
  let festival: { n: number; name: string; at: number; until: number } | null = null;
  // cosmetic weather has its own seeded stream so it never shifts gameplay randomness (storms, ships)
  let wseed = (rides * 2654435761 + 12345) >>> 0;
  const wrng = () => { wseed = (wseed + 0x6d2b79f5) >>> 0; let z = wseed; z = Math.imul(z ^ (z >>> 15), z | 1); z ^= z + Math.imul(z ^ (z >>> 7), z | 61); return ((z ^ (z >>> 14)) >>> 0) / 4294967296; };
  let weather: Weather = pickWeather(season, wrng()), prevWeather: Weather = weather, weatherAt = -999;
  let weatherIn = weatherMinS() + wrng() * Math.max(0, weatherMaxS() - weatherMinS());
  let shipsSinceVisitor = 0;

  let t = 0;
  let fog = 0.4, chop = 0.3, lamp = 0.5;
  let zone = 1, rawZone = 1, zoneCand = 1, zoneCandS = 0;
  let fb = { text: '', ok: true, at: -99 };
  let satisfied = false, above = false, below = true;
  const ships: Ship[] = [];
  let nextShipId = 1;
  let spawnIn = 20 + ctx.rng() * 10; // first ship soon
  let sinceSave = 0;
  let streakS = 0, streakOffS = 0, stormEndedAt = -999;
  let rescueReady = 0, rescue = { ship: -1, at: -99, plot: -1 };
  let lastStorm = false, whale = { at: -999, x: 0, z: 0 }, whaleIn = whaleEvery() * 0.5;

  // build UI
  let mode: Mode = 'watch';
  let sel = 1, cursorPlot = 0, idleS = 0, view = 0, logOpen = false, tab: Tab = 'build', decorSel = 0;
  const pending: LighthouseAction[] = [];
  let nudgeAt = -999, scanIn = 0, canAny = false;
  const nudged = new Set<RowKey>();
  let nudgedDecor = false;

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
  // clockwork wind-up: a calm-weather cadence drill (spin fast in an easy gear; watts stay in Z2)
  let wind: { until: number; held: number } | null = null, windIn = 150;

  const stat = {
    minutesInZoneS: 0, shipsDocked: 0, shipsLost: 0, shipsSpilled: 0, shipsRescued: 0, buildingsBuilt: 0, upgrades: 0,
    stormsWeathered: 0, stormsFailed: 0, coinEarned: 0, bestStreakS: 0, districtsOpened: 0, whales: 0,
    festivals: 0, visitors: 0, decorBought: 0,
  };

  ctx.resistance.useVirtualGears(true);

  // ---------- town state helpers ----------
  const count = (b: BuildingType) => buildings.filter((x) => x === b).length;
  const plotsOf = (b: BuildingType) => buildings.map((x, i) => (x === b ? i : -1)).filter((i) => i >= 0);
  const levelSum = (b: BuildingType, w: number[]) => plotsOf(b).reduce((s, i) => s + (w[levels[i] - 1] ?? w[w.length - 1]), 0);
  const built = () => buildings.filter((b) => b).length;
  const progress = () => ({ buildings: built(), ships: totals.shipsDockedTotal, storms: totals.stormsWeatheredTotal });
  const openSet = () => new Set(DISTRICTS.filter((d) => districtOpen(d, progress())).map((d) => d.id));
  let open = openSet();
  const unlocked = (plot: number) => open.has(PLOTS[plot].district);
  const districtName = (id: DistrictId) => DISTRICTS.find((d) => d.id === id)!.name;
  const streakMult = () => Math.min(streakMax(), 1 + 0.1 * Math.floor(streakS / streakStepS()));
  const coinMult = () => { const m = plotsOf('market')[0]; return m === undefined ? 1 : marketMul() * MARKET_MULT[levels[m] - 1] / MARKET_MULT[0]; };
  const yard = () => { const y = plotsOf('shipyard')[0]; return y === undefined ? 0 : levels[y]; };
  const earn = (c: number) => { const v = c * coinMult(); coin += v; stat.coinEarned += v; return v; };
  const rowName = (k: RowKey) => (k === 'upgrade' ? 'Upgrade' : k === 'lens' ? 'Lighthouse lens' : BUILDINGS[k].names[0]);

  function persist() {
    ctx.save({
      v: 2, buildings: buildings.slice(), levels: levels.slice(), grow: grow.map((g) => Math.round(g * 1000) / 1000), coin, timber, meadow, lens, ...totals,
      rides: rides + 1, decor: { ...decor }, gifts: gifts.slice(), festivals: festivalsHeld,
    } satisfies Saved);
  }

  function plotOk(k: RowKey, plot: number): boolean {
    if (k === 'lens') return plot === LIGHTHOUSE_PLOT;
    if (plot < 0) return false;
    if (k === 'upgrade') return buildings[plot] !== null;
    return buildings[plot] === null && unlocked(plot) && (!BUILDINGS[k].shore || PLOTS[plot].shore);
  }
  function costOf(k: RowKey, plot: number): { coin: number; timber: number } | null {
    if (k === 'lens') return lens < LENS.length ? LENS[lens].cost : null;
    if (k === 'upgrade') { const b = plot >= 0 ? buildings[plot] : null; return b && levels[plot] < maxLevel(b) ? upgradeCost(b, levels[plot]) : null; }
    return BUILDINGS[k].cost;
  }
  function whyNot(k: RowKey, plot: number): string | null {
    if (k === 'lens') {
      if (lens >= LENS.length) return 'fully upgraded';
      if (!open.has(LENS[lens].needs)) return `opens with ${districtName(LENS[lens].needs)}`;
    } else if (k === 'upgrade') {
      const b = plot >= 0 ? buildings[plot] : null;
      if (!b) return 'pick a building to upgrade';
      if (levels[plot] >= maxLevel(b)) return 'fully upgraded';
      const need = upgradeGrow(levels[plot]);
      if (grow[plot] < need) return `area ${Math.floor(grow[plot] * 100)}% grown, needs ${need * 100}% (ride in zone)`;
    } else {
      const d = BUILDINGS[k];
      if (count(k) >= d.max) return `all ${d.max} built`;
      if (k === 'lamp2' && count('cottage') < 5) return `needs ${5 - count('cottage')} more homes`;
      if (d.shore && !PLOTS.some((p, i) => p.shore && buildings[i] === null && unlocked(i))) return 'no free beach plot';
      if (!PLOTS.some((_, i) => buildings[i] === null && unlocked(i))) return 'no free plot - wait for new land';
      if (plot < 0) return 'pick a plot';
      if (!unlocked(plot)) return `opens with ${districtName(PLOTS[plot].district)}`;
      if (buildings[plot] !== null) return 'plot taken';
      if (d.shore && !PLOTS[plot].shore) return 'goes on a beach';
    }
    const c = costOf(k, plot)!;
    if (coin < c.coin) return `need ${Math.ceil(c.coin - coin)} more coin`;
    if (timber < c.timber) return `need ${Math.ceil(c.timber - timber)} more timber`;
    return null;
  }
  /** Best plot for a row: beach for shore buildings, otherwise the free plot with the most neighbour bonuses near the town. */
  function suggestPlot(k: RowKey): number {
    if (k === 'lens') return LIGHTHOUSE_PLOT;
    if (k === 'upgrade') {
      const own = buildings.map((b, i) => (b ? i : -1)).filter((i) => i >= 0);
      const ready = own.filter((i) => whyNot('upgrade', i) === null);
      const pool = ready.length ? ready : own.filter((i) => levels[i] < maxLevel(buildings[i]!));
      if (!pool.length) return cursorPlot >= 0 ? cursorPlot : (own[0] ?? 0);
      return pool.sort((i, j) => costOf('upgrade', i)!.coin - costOf('upgrade', j)!.coin || grow[j] - grow[i])[0];
    }
    const free = PLOTS.map((_, i) => i).filter((i) => plotOk(k, i));
    if (!free.length) return Math.max(0, cursorPlot);
    const dist = (i: number, x: number, z: number) => Math.hypot(PLOTS[i].x - x, PLOTS[i].z - z);
    if (BUILDINGS[k].shore) return free.sort((i, j) => dist(i, HARBOUR.x, HARBOUR.z) - dist(j, HARBOUR.x, HARBOUR.z))[0];
    const own = buildings.map((b, i) => (b ? i : -1)).filter((i) => i >= 0);
    const cx = own.length ? own.reduce((s, i) => s + PLOTS[i].x, 0) / own.length : 2;
    const cz = own.length ? own.reduce((s, i) => s + PLOTS[i].z, 0) / own.length : 7;
    const inland = free.filter((i) => !PLOTS[i].shore);
    const pool = inland.length ? inland : free;
    const score = (i: number) => preview(buildings, k, i).links.length * 6 - dist(i, cx, cz);
    return pool.sort((i, j) => score(j) - score(i))[0];
  }

  function build(b: BuildingType, plot: number): boolean {
    const why = whyNot(b, plot);
    if (why) { fb = { text: `Can't build ${BUILDINGS[b].names[0]}: ${why}`, ok: false, at: t }; cue('deny'); return false; }
    coin -= BUILDINGS[b].cost.coin; timber -= BUILDINGS[b].cost.timber;
    buildings[plot] = b; levels[plot] = 1; grow[plot] = 0;
    stat.buildingsBuilt++;
    fb = { text: `Built a ${BUILDINGS[b].names[0]}`, ok: true, at: t };
    toast(`${BUILDINGS[b].names[0]} built!`, '#9cf59c');
    cue('build');
    nudged.clear();
    ctx.emit({ type: 'built', data: { building: b, plot } });
    checkDistricts();
    persist();
    return true;
  }
  function upgrade(plot: number): boolean {
    const why = whyNot('upgrade', plot);
    if (why) { fb = { text: `Can't upgrade: ${why}`, ok: false, at: t }; cue('deny'); return false; }
    const b = buildings[plot]!, c = upgradeCost(b, levels[plot]);
    coin -= c.coin; timber -= c.timber; levels[plot]++;
    stat.upgrades++;
    toast(`${BUILDINGS[b].names[levels[plot] - 2]} is now a ${BUILDINGS[b].names[levels[plot] - 1]}!`, '#9cf59c');
    cue('upgrade'); nudged.clear();
    ctx.emit({ type: 'upgraded', data: { building: b, plot, level: levels[plot] } });
    persist();
    return true;
  }
  function upgradeLens(): boolean {
    const why = whyNot('lens', LIGHTHOUSE_PLOT);
    if (why) { fb = { text: `Can't upgrade the lens: ${why}`, ok: false, at: t }; cue('deny'); return false; }
    coin -= LENS[lens].cost.coin; timber -= LENS[lens].cost.timber; lens++;
    stat.upgrades++;
    toast(`The lighthouse now has a ${LENS[lens - 1].name}!`, '#ffe9a0');
    cue('upgrade'); nudged.clear();
    ctx.emit({ type: 'lensUpgraded', data: { tier: lens } });
    persist();
    return true;
  }
  function whyNotDecor(d: DecorId): string | null {
    if (decor[d] >= decorMax(d)) return 'all done';
    if (built() < DECOR_MIN_BUILDINGS) return 'build a few homes first';
    const c = DECOR[d].costs[decor[d]];
    return coin < c ? `need ${Math.ceil(c - coin)} more coin` : null;
  }
  function buyDecor(d: DecorId): boolean {
    const why = whyNotDecor(d);
    if (why) { fb = { text: `Can't add ${DECOR[d].names[Math.min(decor[d], decorMax(d) - 1)]}: ${why}`, ok: false, at: t }; cue('deny'); return false; }
    coin -= DECOR[d].costs[decor[d]]; decor[d]++;
    stat.decorBought++;
    toast(`${DECOR[d].icon} ${DECOR[d].names[decor[d] - 1]} added!`, '#ffb3e6');
    cue('build');
    ctx.emit({ type: 'decorated', data: { decor: d, level: decor[d] } });
    persist();
    return true;
  }
  const decorAffordable = () => DECOR_IDS.filter((d) => whyNotDecor(d) === null);

  function act(k: RowKey, plot: number): boolean {
    return k === 'lens' ? upgradeLens() : k === 'upgrade' ? upgrade(plot) : build(k, plot);
  }
  function checkDistricts() {
    const now = openSet();
    for (const d of DISTRICTS) if (now.has(d.id) && !open.has(d.id)) {
      stat.districtsOpened++;
      toast(`New land: ${d.name} is open for building!`, '#8fd3ff');
      cue('unlock');
      ctx.emit({ type: 'districtUnlocked', data: { district: d.id } });
    }
    open = now;
  }
  function nextDistrict() {
    const d = DISTRICTS.find((x) => !open.has(x.id));
    if (!d) return null;
    const p = progress();
    return {
      name: d.name,
      goals: [
        d.need.buildings ? { label: 'buildings', have: p.buildings, need: d.need.buildings } : null,
        d.need.ships ? { label: 'ships docked', have: p.ships, need: d.need.ships } : null,
        d.need.storms ? { label: 'storms weathered', have: p.storms, need: d.need.storms } : null,
      ].filter((g): g is { label: string; have: number; need: number } => g !== null),
    };
  }

  const affordable = () => ROWS.filter((k) => whyNot(k, suggestPlot(k)) === null);
  function openBuild() {
    mode = 'build'; idleS = 0; logOpen = false; tab = 'build';
    const can = affordable();
    if (can.length && !can.includes(ROWS[sel])) sel = ROWS.indexOf(can.find((k) => k !== 'upgrade' && k !== 'lens') ?? can[0]);
    cursorPlot = suggestPlot(ROWS[sel]);
    cue('select');
  }
  function stepPlot(dir: 1 | -1) {
    const k = ROWS[sel];
    if (k === 'lens') return;
    const order = PLOTS.map((_, i) => i).filter((i) => plotOk(k, i) || i === cursorPlot)
      .sort((i, j) => PLOTS[i].x - PLOTS[j].x || PLOTS[i].z - PLOTS[j].z);
    if (order.length <= 1) return;
    const idx = order.indexOf(cursorPlot);
    cursorPlot = order[(idx + dir + order.length) % order.length];
    if (!plotOk(k, cursorPlot) && order.length > 2) stepPlot(dir); // skip the invalid plot we started on
    cue('select');
  }
  function stepType(dir: 1 | -1) {
    sel = (sel + dir + ROWS.length) % ROWS.length;
    if (!plotOk(ROWS[sel], cursorPlot)) cursorPlot = suggestPlot(ROWS[sel]);
    cue('select');
  }
  function apply(a: LighthouseAction) {
    idleS = 0;
    if (a.type === 'view') { view = (view + 1) % VIEW_COUNT; cue('select'); }
    else if (a.type === 'log') { logOpen = !logOpen; if (logOpen) mode = 'watch'; cue('select'); }
    else if (a.type === 'mode') { if (a.mode === 'build') openBuild(); else mode = 'watch'; }
    else if (a.type === 'tab') { if (mode !== 'build') openBuild(); tab = a.tab; cue('select'); }
    else if (a.type === 'decor') {
      const i = DECOR_IDS.indexOf(a.decor); if (i < 0) return;
      if (mode !== 'build') openBuild();
      tab = 'decor'; decorSel = i; cue('select');
    }
    else if (a.type === 'plot') {
      if (a.plot < LIGHTHOUSE_PLOT || a.plot >= PLOT_COUNT) return;
      if (mode !== 'build') openBuild();
      cursorPlot = a.plot;
      if (a.plot === LIGHTHOUSE_PLOT) sel = ROWS.indexOf('lens');
      else if (buildings[a.plot] !== null) sel = ROWS.indexOf('upgrade');
      else if (!plotOk(ROWS[sel], a.plot)) sel = ROWS.indexOf(PLOTS[a.plot].shore && whyNot('pier', a.plot) === null ? 'pier' : 'cottage');
      cue('select');
    } else if (a.type === 'select') {
      const i = ROWS.indexOf(a.building); if (i < 0) return;
      if (mode !== 'build') openBuild();
      sel = i;
      if (!plotOk(a.building, cursorPlot)) cursorPlot = suggestPlot(a.building);
      cue('select');
    } else if (a.type === 'build') {
      if (mode !== 'build') { openBuild(); return; }
      if (tab === 'decor') buyDecor(DECOR_IDS[decorSel]); // stay open: decorating is often several buys in a row
      else if (act(ROWS[sel], cursorPlot)) mode = 'watch';
    }
  }

  function handleInput(dt: Seconds) {
    for (const a of pending.splice(0)) apply(a);
    const p = ctx.input().pressed;
    if (mode === 'watch') {
      if (p.has('a')) apply({ type: 'mode', mode: 'build' });
      if (p.has('y')) apply({ type: 'view' });
      if (p.has('z')) apply({ type: 'log' });
      if (p.has('b') && logOpen) logOpen = false;
      return;
    }
    idleS += dt;
    if (p.size) idleS = 0;
    if (p.has('y')) { tab = tab === 'build' ? 'decor' : 'build'; cue('select'); }
    else if (tab === 'decor') {
      const n = DECOR_IDS.length;
      if (p.has('up') || p.has('left')) { decorSel = (decorSel + n - 1) % n; cue('select'); }
      if (p.has('down') || p.has('right')) { decorSel = (decorSel + 1) % n; cue('select'); }
    } else {
      if (p.has('right')) stepPlot(1);
      if (p.has('left')) stepPlot(-1);
      if (p.has('up')) stepType(-1);
      if (p.has('down')) stepType(1);
    }
    if (p.has('a')) apply({ type: 'build' });
    if (p.has('b') || idleS >= buildIdleS()) mode = 'watch';
  }
  function nudge(dt: Seconds) {
    scanIn -= dt;
    if (scanIn > 0) return;
    scanIn = 1; // the affordability scan is the expensive part; once a second is plenty
    const can = affordable();
    canAny = can.length > 0;
    if (mode !== 'watch' || t - nudgeAt < 45) return;
    const k = can.find((x) => !nudged.has(x));
    if (!k) {
      if (!nudgedDecor && decorAffordable().length && coin > 120) { nudgedDecor = true; nudgeAt = t; toast('Coin to spare? Open the build menu and press Y to decorate the town', '#ffb3e6'); cue('chime'); }
      return;
    }
    nudged.add(k); nudgeAt = t;
    const plot = suggestPlot(k);
    const what = k === 'upgrade' ? `upgrade your ${BUILDINGS[buildings[plot]!].names[levels[plot] - 1]}` : k === 'lens' ? 'upgrade the lighthouse lens' : `build a ${BUILDINGS[k].names[0]}`;
    toast(`You can ${what} - press A`, '#ffd84a');
    cue('chime');
  }
  function autopilot() {
    const order: BuildingType[] = ['garden', 'cottage', 'cottage', 'pier', 'cottage', 'garden', 'cottage', 'cottage', 'bell', 'market', 'lamp2', 'pier',
      'orchard', 'mill', 'bell', 'cottage', 'garden', 'shipyard', 'lifeboat', 'cottage', 'cottage', 'orchard', 'garden', 'mill', 'orchard'];
    const need = new Map<BuildingType, number>();
    for (const b of order) {
      need.set(b, (need.get(b) ?? 0) + 1);
      if (count(b) < need.get(b)!) {
        const plot = suggestPlot(b);
        const why = whyNot(b, plot);
        if (why === null) build(b, plot);
        else if (why.startsWith('opens with') || why.startsWith('no free') || why.startsWith('all ')) continue; // waiting on land: try the next item
        return; // wait until the next item is affordable
      }
    }
    if (whyNot('lens', LIGHTHOUSE_PLOT) === null) { upgradeLens(); return; }
    const up = suggestPlot('upgrade');
    if (whyNot('upgrade', up) === null) { upgrade(up); return; }
    const d = decorAffordable().sort((a, b) => DECOR[a].costs[decor[a]] - DECOR[b].costs[decor[b]])[0];
    if (d && coin > DECOR[d].costs[decor[d]] + 150) buyDecor(d);
  }

  function updateWind(dt: Seconds, cadence: number) {
    if (!wind) {
      windIn -= dt;
      // only in calm weather with room to finish before the next storm
      if (windIn <= 0 && phase === 'calm' && calmLeft > windS() + 20) {
        wind = { until: t + windS(), held: 0 };
        cue('chime'); toast(`The lamp clockwork is winding down - spin ${Math.round(windRpm())}+ rpm to wind it!`, '#8fd8ff');
      }
      return;
    }
    if (phase !== 'calm') { wind = null; windIn = 60; return; }
    if (cadence >= windRpm()) wind.held += dt;
    const next = () => windEveryMin() + ctx.rng() * Math.max(0, windEveryMax() - windEveryMin());
    if (wind.held >= windNeedS()) {
      const c = earn(windCoin()); timber += 2; lamp = 1;
      ctx.emit({ type: 'clockworkWound', data: { completed: true } });
      toast(`Clockwork wound! Lamp at full, +${Math.round(c)} coin +2 timber`, '#ffd84a'); cue('chime');
      wind = null; windIn = next();
    } else if (t >= wind.until) {
      ctx.emit({ type: 'clockworkWound', data: { completed: false } });
      toast('The clockwork ran down. Maybe next time.', '#c9d3dc');
      wind = null; windIn = next();
    }
  }

  /** A whale passes the island now and then while you hold a Steady Light streak in calm weather. Pure delight, plus a little bloom. */
  function updateWhale(dt: Seconds) {
    whaleIn -= dt;
    if (whaleIn > 0 || phase !== 'calm' || streakS < streakStepS() || chop > 0.4) return;
    // cosmetic stream, like weather: whales must not shift storm or ship timing
    whaleIn = whaleEvery() * (1 + wrng() * 0.5);
    whale = { at: t, x: 30 + wrng() * 16, z: -48 + wrng() * 12 }; // open sea beyond the island, in view of the default camera
    stat.whales++;
    meadow = Math.min(1, meadow + 0.005);
    ctx.emit({ type: 'whaleSighted' });
    toast('A whale is passing the island! The steady light brings visitors', '#bfe8ff');
    cue('whale');
  }

  function updateFestival() {
    if (festival && t >= festival.until) { festival = null; toast('What a festival! The island hums happily', '#ffb3e6'); }
    if (festival || phase !== 'calm' || festivalsHeld >= FESTIVALS.length || meadow < FESTIVALS[festivalsHeld].at) return;
    const f = FESTIVALS[festivalsHeld];
    festival = { n: festivalsHeld, name: f.name, at: t, until: t + festivalS() };
    festivalsHeld++; stat.festivals++;
    const c = earn(25 * festivalsHeld);
    toast(`🎉 The ${f.name}! The island celebrates ${Math.round(f.at * 100)}% bloom  +${Math.round(c)} coin`, '#ffb3e6');
    cue('festival');
    ctx.emit({ type: 'festival', data: { n: festival.n, name: f.name } });
    persist();
  }
  function updateWeather(dt: Seconds) {
    weatherIn -= dt;
    if (weatherIn > 0) return;
    weatherIn = weatherMinS() + wrng() * Math.max(0, weatherMaxS() - weatherMinS());
    prevWeather = weather; weather = pickWeather(season, wrng(), weather); weatherAt = t;
  }

  function endStorm(weathered: boolean) {
    ctx.resistance.clear('storm');
    phase = 'calm'; phaseT = 0; intensity = 0; surgeNow = false; stormEndedAt = t; lastStorm = weathered;
    calmLeft = stormMinS() + ctx.rng() * Math.max(0, stormMaxS() - stormMinS());
    if (weathered) {
      stat.stormsWeathered++; totals.stormsWeatheredTotal++;
      earn(40); timber += 8;
      chop = Math.min(chop, 0.1); fog = Math.min(fog, 0.2); // the storm blows the sky clear
      ctx.emit({ type: 'stormWeathered', data: { integrity } });
      toast('Storm weathered! +40 coin +8 timber', '#9cf59c');
      if (ships.some((x) => x.state === 'sailing')) toast('The seas are calm - ships are making for harbour', '#8fd3ff');
      cue('reward');
      const bonus = surgeDone && surgeHeldS >= surgeS() * 0.7;
      if (bonus) { earn(30); timber += 6; ctx.emit({ type: 'surgeSalvage' }); toast('Surge salvage! +30 coin +6 timber', '#ffd84a'); }
      checkDistricts();
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

  /** A special visitor, sometimes: each brings a one-off gift for the town; once all gifts are in, they still drop by now and then. */
  function pickVisitor(): VisitorKind | null {
    if (shipsSinceVisitor < 3 || ships.some((x) => x.state === 'sailing' && x.kind in VISITORS)) return null;
    const fresh = VISITOR_KINDS.filter((k) => !gifts.includes(VISITORS[k].gift) && built() >= VISITORS[k].needBuildings && totals.shipsDockedTotal >= VISITORS[k].needShips);
    const pool = fresh.length ? fresh : gifts.length === VISITOR_KINDS.length ? VISITOR_KINDS : [];
    if (!pool.length || wrng() >= (fresh.length ? visitorChance() : visitorChance() * 0.25)) return null;
    return pool[Math.floor(wrng() * pool.length) % pool.length];
  }
  function spawnShip() {
    const y = yard();
    const kinds = SHIP_KINDS.map((k) => ({ ...k, w: k.kind === 'steamer' ? k.w + 0.15 * y : k.w }));
    const tot = kinds.reduce((s, k) => s + k.w, 0);
    let r = ctx.rng() * tot, kind: ShipKind = 'smack';
    for (const k of kinds) { if (r < k.w) { kind = k.kind; break; } r -= k.w; }
    const visitor = pickVisitor();
    if (visitor) { kind = visitor; shipsSinceVisitor = 0; toast(`${VISITORS[visitor].icon} A special visitor: ${VISITORS[visitor].title} is on the horizon!`, '#ffe9a0'); cue('chime'); }
    else shipsSinceVisitor++;
    const id = nextShipId++;
    ships.push({ id, kind, name: visitor ? VISITORS[visitor].ship : SHIP_NAMES[(id * 7) % SHIP_NAMES.length], progress: 0, lane: ctx.rng(), state: 'sailing', age: 0, dock: -1, rescued: false });
    spawnIn = (spawnMin() + ctx.rng() * Math.max(0, spawnMax() - spawnMin())) * (y >= 2 ? 0.85 : 1);
  }

  const tolerance = () => pierTol() * levelSum('pier', PIER_TOL);
  const lensFog = () => 0.03 * (lens - 1);
  const effChop = () => Math.max(chop, intensity * 0.8);
  function check(): ShipCheck {
    const tol = tolerance();
    if (!(effChop() < dockChop() + tol)) return 'chop';
    if (!(lamp >= dockLamp())) return 'dark';
    if (!(fog < dockFog() + tol + lensFog())) return 'fog';
    return 'ok';
  }
  function dock(s: Ship, share: number) {
    s.state = 'docked';
    const piers = plotsOf('pier');
    const busy = new Set(ships.filter((o) => o !== s && o.state === 'docked').map((o) => o.dock));
    s.dock = piers.find((i) => !busy.has(i)) ?? -1;
    const y = yard();
    const value = (s.kind in VISITORS ? VISITORS[s.kind as VisitorKind].value : SHIP_KINDS.find((k) => k.kind === s.kind)!.value) * (y ? YARD_MULT[y - 1] : 1) * (s.dock >= 0 ? pierBonus(buildings, s.dock) : 1) * streakMult() * share;
    const ct = Math.round((12 + Math.floor(ctx.rng() * 9)) * value), tb = Math.round((2 + Math.floor(ctx.rng() * 3)) * value);
    const got = earn(ct); timber += tb;
    return { got, ct, tb };
  }
  function visitorHome(s: Ship) {
    if (!(s.kind in VISITORS)) return;
    const v = VISITORS[s.kind as VisitorKind];
    stat.visitors++;
    if (gifts.includes(v.gift)) return;
    gifts.push(v.gift);
    toast(`${v.icon} ${v.title[0].toUpperCase()}${v.title.slice(1)} leaves ${v.giftName} for the town!`, '#ffe9a0');
    cue('unlock');
    ctx.emit({ type: 'visitorGift', data: { visitor: s.kind, gift: v.gift } });
    persist();
  }
  function arrive(s: Ship) {
    const c = check();
    s.age = 0;
    if (c === 'ok') {
      const { got, ct, tb } = dock(s, 1);
      stat.shipsDocked++; totals.shipsDockedTotal++;
      ctx.emit({ type: 'shipDocked', data: { coin: ct, timber: tb } });
      toast(`${s.name} docked  +${Math.round(got)} coin  +${tb} timber`, '#ffd84a');
      cue('horn');
      checkDistricts();
      visitorHome(s);
      return;
    }
    const boat = plotsOf('lifeboat')[0];
    if (boat !== undefined && t >= rescueReady) {
      s.rescued = true;
      const { got, tb } = dock(s, 0.5);
      stat.shipsRescued++;
      rescueReady = t + rescueEvery();
      rescue = { ship: s.id, at: t, plot: boat };
      ctx.emit({ type: 'shipRescued', data: { reason: c } });
      toast(`Lifeboat to the rescue! ${s.name} saved  +${Math.round(got)} coin  +${tb} timber`, '#8fd3ff');
      cue('rescue');
      visitorHome(s);
      return;
    }
    if (s.kind in VISITORS) toast(`${VISITORS[s.kind as VisitorKind].title[0].toUpperCase()}${VISITORS[s.kind as VisitorKind].title.slice(1)} turned back - they'll try again another day`, '#c9d3dc');
    if (c === 'chop') {
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
  if (saved) {
    const nd = nextDistrict();
    toast(`Welcome back, keeper! It's ${SEASON_NAME[season].toLowerCase()} on the island.${nd ? ` Next land: ${nd.name}` : ''}`, '#ffe9a0');
  }

  return {
    update(dt: Seconds) {
      t += dt;
      const bike = ctx.bike();
      // storms are 60-90 s pushes with a 15 s surge: judge them on power, since HR takes 30-60 s to climb.
      // The calm Z2 hold uses the profile's zone source (HR-aware).
      const stormy = phase !== 'calm';
      rawZone = stormy ? Math.min(5, bike.powerZone) : bike.effortZone;
      if (rawZone === zone) { zoneCand = zone; zoneCandS = 0; }
      else {
        if (rawZone !== zoneCand) { zoneCand = rawZone; zoneCandS = 0; }
        zoneCandS += dt;
        if (zoneCandS >= (stormy ? stormGraceS() : graceS())) { zone = zoneCand; zoneCandS = 0; }
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

      // Steady Light streak
      const before = streakMult();
      const easing = above && (t - stormEndedAt < calmAfterS() || wind !== null); // cooling down after a storm, or spinning up the clockwork
      if (satisfied) { streakS += dt; streakOffS = 0; }
      else if (easing) { /* pause, don't break */ }
      else {
        streakOffS += dt;
        if (streakOffS > streakGrace() && streakS > 0) { if (streakS >= streakStepS()) toast('Steady Light streak broken', '#c9d3dc'); streakS = 0; }
      }
      stat.bestStreakS = Math.max(stat.bestStreakS, streakS);
      if (streakMult() > before) { toast(`Steady Light x${streakMult().toFixed(1)}! Cargo and growth boosted`, '#ffe9a0'); cue('chime'); }

      const bellFactor = Math.pow(bellMul(), levelSum('bell', BELL_W));
      const beacon = plotsOf('lamp2')[0];
      const lampPower = (beacon === undefined ? 1 : lamp2Mul() * (levels[beacon] >= 2 ? 1.27 : 1)) * (1 + 0.15 * (lens - 1));
      if (satisfied) {
        fog = clamp01(fog - fogFall() * lampPower * dt);
        chop = clamp01(chop - chopFall() * dt);
        lamp = clamp01(lamp + lampUp() * (1 + 0.2 * (lens - 1)) * dt);
      } else if (below) {
        fog = clamp01(fog + fogRise() * bellFactor * dt);
        chop = clamp01(chop - chopFall() * 0.25 * dt);
        if (!(phase === 'storm' && stormFailedThis)) lamp = clamp01(lamp - lampDown() * dt);
      } else if (easing) {
        chop = clamp01(chop - chopFall() * 0.25 * dt);
      } else if (above) {
        chop = clamp01(chop + chopRise() * dt);
        fog = clamp01(fog - fogFall() * 0.1 * dt);
        lamp = clamp01(lamp - lampDown() * 0.5 * dt);
      }
      if (phase === 'storm' && stormFailedThis) lamp = 0;

      // greenery grows while you hold the zone
      if (satisfied) {
        const g = growPerMin() / 60 * dt * streakMult();
        for (let i = 0; i < PLOT_COUNT; i++) { const b = buildings[i]; if (b) grow[i] = Math.min(1, grow[i] + g * GROW_RATE[b]); }
        const m0 = meadow;
        meadow = Math.min(1, meadow + meadowPerMin() / 60 * dt * streakMult() * (1 + 0.15 * levelSum('garden', [1, 2, 3])));
        if (Math.floor(m0 * 10) !== Math.floor(meadow * 10)) { toast(`The island is blooming (${Math.floor(meadow * 10) * 10}%)`, '#ffb3e6'); cue('chime'); }
      }

      updateStorm(dt);
      updateWind(dt, bike.cadence3s);
      updateWhale(dt);
      updateFestival();
      updateWeather(dt);

      // fog bells ring while fog thickens
      if (count('bell') && fog > 0.35 && !satisfied) {
        nextBell -= dt;
        if (nextBell <= 0) { bellAt = t; cue('bell'); nextBell = 9; }
      } else nextBell = Math.min(nextBell, 1);

      // swell resistance (sim mode) - 3 min sine
      ctx.resistance.set({ id: 'swell', mode: 'sim', gradePct: swellPct() * Math.sin((2 * Math.PI * t) / swellPeriod()) });

      // ships: during a storm they heave to offshore and wait it out, so pushing hard never costs a ship
      const shelter = phase === 'storm';
      if (!shelter) spawnIn -= dt;
      if (spawnIn <= 0) spawnShip();
      for (const s of ships) {
        if (s.state === 'sailing') {
          if (shelter) continue;
          s.progress += dt / sailS();
          if (s.progress >= 1) { s.progress = 1; arrive(s); }
        } else s.age += dt;
      }
      for (let i = ships.length - 1; i >= 0; i--) { const s = ships[i]; if (s.state !== 'sailing' && s.age > LINGER[s.state]) ships.splice(i, 1); }

      // passive income
      let c = 0, tb = 0;
      for (let i = 0; i < PLOT_COUNT; i++) {
        const b = buildings[i], lv = levels[i];
        if (b === 'cottage') c += cottageCoin() * HOME_MULT[lv - 1] * homeBonus(buildings, i);
        else if (b === 'orchard') { const m = lv * orchardBonus(buildings, i); c += orchardCoin() * m; tb += orchardTimber() * m; }
        else if (b === 'mill') tb += millTimber() * (lv >= 2 ? 1.8 : 1) * millBonus(buildings, i);
        else if (b === 'pier' && lv >= 3) c += fisheryCoin();
      }
      if (c) earn(c * dt);
      timber += tb * dt;
      nudge(dt);

      sinceSave += dt;
      if (sinceSave >= 60) { sinceSave = 0; persist(); }
      ctx.debug('fog', Math.round(fog * 100) / 100);
      ctx.debug('chop', Math.round(chop * 100) / 100);
      ctx.debug('stormPhase', phase);
      ctx.debug('meadow', Math.round(meadow * 100) / 100);
      ctx.debug('streakS', Math.round(streakS));
    },
    receive(action: unknown) {
      if (action && typeof action === 'object' && 'type' in action) pending.push(action as LighthouseAction);
    },
    snapshot() {
      const c = check();
      const tol = tolerance();
      const k = ROWS[sel];
      const cb = cursorPlot >= 0 ? buildings[cursorPlot] : null;
      const pv = k !== 'upgrade' && k !== 'lens' && cursorPlot >= 0 && buildings[cursorPlot] === null ? preview(buildings, k, cursorPlot) : { links: [] as number[], text: '' };
      return {
        t, fog, chop: effChop(), baseChop: chop, lamp, zone, rawZone,
        requirement: phase === 'storm' ? (surgeNow ? surgeZone() : stormZone()) : zoneTarget(),
        inZone: satisfied, above, below,
        limits: { fog: dockFog() + tol + lensFog(), chop: dockChop() + tol, lamp: dockLamp() },
        day: ((t / dayLen()) + 0.82) % 1, // 0 = noon, 0.5 = midnight; sessions start mid-morning
        ships: ships.map((s) => ({ ...s, etaS: (1 - s.progress) * sailS(), check: s.state === 'sailing' ? c : 'ok' as ShipCheck })),
        sheltering: phase === 'storm',
        calmAfterS: Math.max(0, calmAfterS() - (t - stormEndedAt)),
        whale: { ...whale, age: t - whale.at },
        nextShipS: spawnIn,
        buildings: buildings.slice(), levels: levels.slice(), grow: grow.slice(), meadow, lens,
        districts: DISTRICTS.map((d) => ({ id: d.id, name: d.name, open: open.has(d.id) })),
        nextDistrict: nextDistrict(),
        streak: { s: streakS, mult: streakMult(), nextS: streakMult() >= streakMax() ? 0 : streakStepS() - (streakS % streakStepS()), off: streakOffS },
        rescue: { ...rescue, age: t - rescue.at, readyInS: plotsOf('lifeboat').length ? Math.max(0, rescueReady - t) : -1 },
        mode, view, logOpen, tab,
        season, ride: rides + 1,
        weather: { kind: weather, prev: prevWeather, age: t - weatherAt },
        festival: festival ? { n: festival.n, name: festival.name, age: t - festival.at, left: festival.until - t } : null,
        festivalsHeld, nextFestival: festivalsHeld < FESTIVALS.length ? { name: FESTIVALS[festivalsHeld].name, at: FESTIVALS[festivalsHeld].at } : null,
        decor: { ...decor }, gifts: gifts.slice(),
        decorOptions: DECOR_IDS.map((d, i) => {
          const lv = decor[d], max = decorMax(d);
          return { type: d, icon: DECOR[d].icon, label: DECOR[d].names[Math.min(lv, max - 1)] + (lv >= max ? ' ✓' : ''), cost: lv < max ? DECOR[d].costs[lv] : null,
            effect: DECOR[d].effects[Math.min(lv, max - 1)], owned: lv, max, selected: i === decorSel, reason: whyNotDecor(d) };
        }),
        cursor: { plot: cursorPlot, row: k, building: k === 'upgrade' ? cb : k === 'lens' ? null : k, level: cursorPlot >= 0 ? levels[cursorPlot] : lens, canBuild: whyNot(k, cursorPlot) === null, links: pv.links, bonus: pv.text },
        canBuildAny: canAny,
        options: ROWS.map((r, i) => {
          const plot = r === 'lens' ? LIGHTHOUSE_PLOT : cursorPlot;
          let label = rowName(r), effect: string, owned = 0, max = 0;
          if (r === 'upgrade') {
            const lv = cb ? levels[cursorPlot] : 0;
            label = cb ? (lv < maxLevel(cb) ? `${BUILDINGS[cb].names[lv - 1]} → ${BUILDINGS[cb].names[lv]}` : `${BUILDINGS[cb].names[lv - 1]} (max)`) : 'Upgrade a building';
            effect = cb && lv < maxLevel(cb) ? BUILDINGS[cb].effects[lv] : 'Pick one of your buildings';
            owned = lv; max = cb ? maxLevel(cb) : 0;
          } else if (r === 'lens') {
            label = lens < LENS.length ? `Lens: ${LENS[lens].name}` : `Lens: ${LENS[lens - 1].name} (max)`;
            effect = LENS_EFFECT; owned = lens; max = LENS.length;
          } else { effect = BUILDINGS[r].effects[0]; owned = count(r); max = BUILDINGS[r].max; }
          return { type: r, icon: r === 'upgrade' ? '⬆️' : r === 'lens' ? '💡' : BUILDINGS[r].icon, label, cost: costOf(r, plot), effect, owned, max, selected: i === sel, reason: whyNot(r, plot) };
        }),
        feedback: { ...fb, age: t - fb.at },
        toasts: toasts.map((x) => ({ ...x, age: t - x.t })),
        cues: cues.slice(),
        coin, timber,
        storm: { phase, timeInPhase: phaseT, warnS: warnS(), duration: stormDur, integrity, intensity, surge: surgeNow, nextInS: phase === 'calm' ? calmLeft : 0, lightningAge: t - lightningAt, failed: stormFailedThis, sinceEnd: t - stormEndedAt, lastWeathered: lastStorm },
        bellAge: t - bellAt,
        wind: wind ? { left: wind.until - t, held: wind.held, need: windNeedS(), rpm: Math.round(windRpm()) } : null,
        hooks: { storm: phase === 'storm' || phase === 'warning' },
        totals: { ...totals },
        stats: { ...stat, bloomGained: meadow - meadowStart },
      };
    },
    hud(): GameHud {
      const targetZone = phase === 'storm'
        ? (surgeNow ? { min: 5 as const, max: 5 as const, label: 'Lightning surge', source: 'power' as const } : { min: 3 as const, max: 5 as const, label: 'Storm!', source: 'power' as const })
        : phase === 'warning' ? { min: 2 as const, max: 5 as const, label: 'Storm coming', source: 'power' as const }
          : { min: 2 as const, max: 2 as const, label: 'Keep the lamp lit' };
      const controls = mode === 'build'
        ? tab === 'decor'
          ? [{ button: 'dpad' as const, label: '▲▼ choose' }, { button: 'a' as const, label: 'Buy', active: true }, { button: 'y' as const, label: 'Build tab' }, { button: 'b' as const, label: 'Close' }]
          : [{ button: 'dpad' as const, label: '◀▶ plot  ▲▼ choose' }, { button: 'a' as const, label: 'Build', active: true }, { button: 'y' as const, label: 'Decorate' }, { button: 'b' as const, label: 'Close' }]
        : [{ button: 'a' as const, label: 'Build menu' }, { button: 'y' as const, label: 'Camera' }, { button: 'z' as const, label: "Keeper's Log", active: logOpen },
          ...(logOpen ? [{ button: 'b' as const, label: 'Close log' }] : [])];
      const targetCadence = wind ? { min: Math.round(windRpm()), label: 'Wind the clockwork' } : undefined;
      return { targetZone, targetCadence, controls: [...controls, { button: 'shiftersL', label: 'Gears' }, { button: 'shiftersR', label: 'Gears' }], gears: true };
    },
    isOver: () => false,
    summary() {
      return {
        minutesInZone: Math.round((stat.minutesInZoneS / 60) * 100) / 100,
        shipsDocked: stat.shipsDocked,
        shipsLost: stat.shipsLost,
        shipsRescued: stat.shipsRescued,
        buildingsBuilt: stat.buildingsBuilt,
        upgrades: stat.upgrades,
        stormsWeathered: stat.stormsWeathered,
        stormsFailed: stat.stormsFailed,
        coin: Math.round(coin),
        bloomPct: Math.round(meadow * 100),
        bestStreakMin: Math.round(stat.bestStreakS / 6) / 10,
        districtsOpen: open.size,
        lensTier: lens,
        whales: stat.whales,
        festivals: stat.festivals,
        visitors: stat.visitors,
      };
    },
    dispose() { persist(); },
  };
}
