// Dynamo Defense sim: pure logic, deterministic (ctx.rng + fixed dt only).
// Your pedalling is the base's dynamo: crank revs feed the Gatling, watts feed the Flame and the towers,
// sustained threshold power charges the Railgun, sprints trigger Overdrive and Power Surges fire an EMP.
import type { Button, ControlHint, GameContext, GameHud, GameSim, InputState, Seconds } from '../../../contracts';
import { makeRng } from '../../../core/rng';
import { suggestBuild, type BuildSuggestion } from './construction';
import { LEVEL_0, levelGeometry, type TdLevel } from './level';
import { CAMPAIGN, INTENSITIES, LEVELS_PER_STYLE, INTENSITY_NAME, QUICK_MINUTES, bossCount, campaignOpen, estimateMinutes, levelWaves, quickRide, endlessMap, starsFor, type Intensity, type LevelSpec, type LevelWave } from './campaign';
import {
  AIM_LIMIT, ELEMENTS, ELEMENT_WEAPON, KINDS, LEVEL_DMG, LEVEL_RANGE, MATCHUP,
  TOWERS, TOWER_KINDS, TOWER_MAX_LEVEL, TOWER_WEAPON, WEAPON_ELEMENT, towerMatch, WEAPON_NAME, WEAPONS, towerBuildCost, towerUpgradeCost,
  type Element, type Matchup, type Kind, type TowerKind, type Weapon,
} from './defs';
import { BOSS_ESCALATION, BOSS_NAME, BOSS_TRICK, advanceBoss, bossHpFloor, createBossState, openBoss, shieldHit, swarmPackFor, type BossState, type BossTricks } from './boss';
import { canObserve, levelFor as gearboxLevelFor, observeK, priorK, type FireballLevelTuning } from './fireballLevel';
import { TIER_FTP_DEFAULT, beamHits, clampTier, effortFactor, fireballPeriod as fireballPeriodAt, fireballShape, gatlingShape, railShape, riderTier, roman, type Tier } from './tiers';
import { specKey } from './baked';
import { levelFor } from './levelCache';
import { UNLOCKS, VETERAN_STARS, isUnlocked, maxTowerLevel, nextUnlock, quickGrounds, starTotal } from './unlocks';
import { chooseTarget, stepTarget, type Lock, type TargetCand } from './targeting';
import { nextBrood, planWave, setOf, troughHealFor, waveRole, type Spawn, type WavePlan, type WaveRole } from './waves';
import type { Banner, BossView, FlowStage, RadarView, BroodInfo, BroodView, BurnView, EnemyView, Fx, HitClass, GarageRow, GarageView, LevelTile, ShellView, TdSnapshot, TowerView, WorkshopRow, WorkshopView } from './types';

export * from './defs';
export type { TdSnapshot } from './types';

export interface TdOpts {
  autopilot?: boolean;
  /** Headless and tests: mount the incoming brood's weapon by itself at each lull ('auto', default with autopilot). Riders switch by hand. */
  weapon?: 'auto' | 'manual';
  /** Headless and tests: a bot spends scrap on the suggested build when each lull ends (default: with autopilot). Players always build by hand. */
  botBuild?: boolean;
  /** Go straight into the first run (tests); also done for new riders and autopilot. Later runs always use the Garage. */
  skipGarage?: boolean;
  /** Override the `baseHp` tunable (the deep-wave fixture reinforces the base). */
  baseHp?: number;
  /** The Endless map (default: level 0, today's painted serpentine). */
  level?: TdLevel;
  /** Start straight into a level instead of Endless (headless and tests): a campaign index or a Quick Ride. */
  play?: { campaign: number } | { quick: { seed: number; minutes: number } };
  /** Override the saved intensity. */
  intensity?: Intensity;
  /** Headless and tests: play as if the rider had this many campaign stars (unlocks). */
  stars?: number;
  /** Tests only: start Endless at this wave (with the scrap that depth would have earned). */
  startWave?: number;
  /** Headless and tests: hold this intensity tier, or 'auto' (default with autopilot) to shift to the rider's watts. */
  tier?: number | 'auto';
}
export interface TdSave {
  /** v4: levels and star unlocks; the Garage (parts, upgrades, Forward Base) and the old best wave are gone. */
  v: 4; runs: number;
  /** Best wave reached in Endless (since v4). */
  endlessBest: number;
  /** Had Garage progress before v4: starts with the unlocks up to VETERAN_STARS. */
  veteran: boolean;
  /** Campaign stars per level id, the chosen intensity, Quick Ride length and the next Quick Ride seed. */
  campaign: Record<string, number>; intensity: Intensity; quickMinutes: number; quickSeed: number;
  /** The next Endless map's seed (each Endless run plays a new generated map). */
  endlessSeed: number;
  /** Brood colours whose Hive Tyrant this rider has destroyed, and road styles they have cleared a level on. */
  bossColors: string[]; roadsCleared: string[];
  totals: { waves: number; kills: number; bosses: number; towers: number; surges: number; runsFallen: number; runsBailed: number };
}
type LegacySave = { v?: number; bestWave?: number; bank?: number; upgrades?: Record<string, number> };
/**
 * Read legacy (best-wave-only, v2, v3) and v4 saves. Old Garage fields and the old best wave are dropped (owner OK);
 * a save that had Garage progress marks the rider a veteran. Missing totals start at zero.
 */
export function readSave(raw: unknown): TdSave {
  const s = (raw ?? {}) as Partial<TdSave> & LegacySave & { totals?: Partial<TdSave['totals']> & { coresLost?: number } };
  const { coresLost: _coresLost, ...totals } = s.totals ?? {};
  const garage = (s.v ?? 0) < 4 && ((s.bank ?? 0) > 0 || Object.values(s.upgrades ?? {}).some((l) => l > 0));
  return {
    v: 4, runs: s.runs ?? 0, endlessBest: s.v === 4 ? s.endlessBest ?? 0 : 0, veteran: s.veteran === true || garage,
    campaign: { ...(s.campaign ?? {}) }, intensity: INTENSITIES.includes(s.intensity as Intensity) ? s.intensity! : 'steady',
    quickMinutes: (QUICK_MINUTES as readonly number[]).includes(s.quickMinutes ?? 0) ? s.quickMinutes! : 20, quickSeed: s.quickSeed ?? 1, endlessSeed: s.endlessSeed ?? 1,
    bossColors: [...new Set(s.bossColors ?? [])], roadsCleared: [...new Set(s.roadsCleared ?? [])],
    totals: { waves: 0, kills: 0, bosses: 0, towers: 0, surges: 0, runsFallen: 0, runsBailed: 0, ...totals },
  };
}

interface Enemy {
  /** `route` -1 walks the road (route `lane` of the level's roads); 0..2 flies straight from that Glider spawn */
  id: number; kind: Kind; route: number; lane: number; d: number; len: number; off: number; phase: number;
  x: number; y: number; angle: number; dist: number;
  hp: number; maxHp: number; speed: number; dmg: number; dead: boolean; hurt: number;
  /** element of the last hit (for death effects: a fire kill bursts a red alien) */ lastEl: Element | null;
  /** last hit for renderer feedback: time, matchup class, damage dealt that tick */ hitT: number; hitCls: HitClass; hitDmg: number;
  spawnT: number; charging: boolean; boss: BossState | null;
  /** sim time it spawned (groups it into a radar blip) */ born: number;
  /** seconds of Mortar concussion left (slowed by mortarDazeSlow) */ dazed: number;
}
interface Tower { pad: number; kind: TowerKind; level: number; cd: number; angle: number; firedAt: number }
/**
 * A lobbed shell. The turret's fireball bursts for `dmg`, then the ground burns at `burnDps` for burnS. A Mortar
 * round (`tower` = its pad) bursts neutral and concusses: everything it hits on the road is slowed briefly.
 */
interface Shell { x0: number; y0: number; x1: number; y1: number; t: number; flight: number; dmg: number; r: number; burnS: number; burnDps: number; tower?: number; tier?: number }
interface Burn { x: number; y: number; r: number; left: number; total: number; dps: number; /** turret tier that lit it (0 = a Mortar) */ tier: number }

const WORKSHOP_IDLE_S = 10;
/** Face buttons mount the turret's weapons. */
const WEAPON_BUTTONS = [['y', 'gatling'], ['b', 'flame'], ['z', 'rail']] as const satisfies ReadonlyArray<readonly [Button, Weapon]>;
const REPAIR_HP = 25;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const angDiff = (a: number, b: number) => Math.abs(a - b);
type NewFx = Fx extends infer F ? (F extends Fx ? Omit<F, 'id' | 't0'> : never) : never;

/** The level select's fixed facts per campaign level (stars and locks are added per snapshot). */
const TILE_INFO = CAMPAIGN.map((c, index) => {
  const waves = levelWaves(c.minutes, bossCount(c.minutes, c.seed));
  return { index, id: c.id, key: specKey(c), name: c.name, ground: c.ground, roadStyle: c.roadStyle, minutes: c.minutes, pads: c.pads,
    waves: waves.length, bosses: waves.filter((w) => w.role === 'boss').length };
});

export function createTdSim(ctx: GameContext, opts?: TdOpts): GameSim & { snapshot(): TdSnapshot } {
  const T = ctx.tuning;
  // The map: every road, pad, flight and turret position comes from the level's geometry.
  // Levels swap the map between runs (useLevel). Endless plays `opts.level` when given (tests, dev pages), else a
  // new generated map per run (`endlessMap(save.endlessSeed)`). The painted level 0 sits behind the first menu.
  let level = opts?.level ?? LEVEL_0, geo = levelGeometry(level);
  let { pads: PADS, basePad: BASE_PAD, roadLength: ROAD_LENGTH, flightAt, flightLength, angleTo, distTo } = geo;
  let BASE_X = geo.base.x, BASE_Y = geo.base.y, BASE_R = geo.baseR;
  /** ◀▶ workshop order: pads and the base (BASE_PAD = repair) as the screen shows them, per orientation. */
  let PAD_ORDERS = { portrait: geo.padOrder(false), landscape: geo.padOrder(true) };
  /** Switches the map (between runs only: towers are cleared). */
  function useLevel(l: TdLevel) {
    if (l === level) return;
    level = l; geo = levelGeometry(l);
    ({ pads: PADS, basePad: BASE_PAD, roadLength: ROAD_LENGTH, flightAt, flightLength, angleTo, distTo } = geo);
    BASE_X = geo.base.x; BASE_Y = geo.base.y; BASE_R = geo.baseR;
    PAD_ORDERS = { portrait: geo.padOrder(false), landscape: geo.padOrder(true) };
    towers = PADS.map(() => null);
  }
  // Combat (especially ignition chains) consumes a variable number of random draws.
  // Keep future broods, packs and swarm intervals stable when damage or rider actions change.
  const waveRng = makeRng(Math.floor(ctx.rng() * 0x1_0000_0000));
  const swarmRng = makeRng(Math.floor(ctx.rng() * 0x1_0000_0000));
  // weapons (spec)
  const gatlingRevs = T.num('gatlingRevsPerShot', 0.25, 0.05, 2, 0.05, 'crank revs per Gatling bullet');
  const gatlingDmg = T.num('gatlingDamage', 30, 0.5, 60, 0.5);
  // intensity tiers (shifters) and the game-owned resistance gearbox
  const tierFtpT = TIER_FTP_DEFAULT.map((v, i) => T.num(`tier${i + 1}Ftp`, v, 0.2, 1.6, 0.01, `tier ${roman(i + 1)}: rated power (ftpFraction) at the gearbox reference cadence, Steady intensity`));
  const startTier = T.num('startTier', 1, 1, 5, 1, 'intensity tier a run starts in');
  const gearRefRpm = T.num('gearboxRefRpm', 85, 50, 110, 1, 'cadence at which a tier makes its rated power');
  const gearPriorLevel = T.num('gearboxPriorLevelPct', 17, 1, 100, 1, 'starting guess: the resistance level that gives 1.0 FTP at the reference cadence (then learned from the rider\'s watts)');
  const gearAlpha = T.num('gearboxRpmExponent', 1.5, 1, 2.5, 0.1, 'resistance-mode power ~ rpm^this (how steeply the brake climbs with cadence)');
  const gearMaxLevel = T.num('gearboxMaxLevelPct', 60, 5, 100, 1, 'highest resistance level the gearbox will ask for');
  const gearCalTau = T.num('gearboxCalTauS', 20, 2, 120, 1, 'seconds to learn the trainer\'s resistance response');
  const gearShiftTau = T.num('gearboxShiftS', 0.7, 0, 5, 0.1, 'time constant of the resistance change after a shift (so a two-click jump is not a wall)');
  const gearReliefRpm = T.num('gearboxReliefRpm', 55, 0, 90, 1, 'below this cadence the gearbox eases the brake so a bogged-down rider can spin back up (0 = off)');
  const gearReliefFloor = T.num('gearboxReliefFloor', 0.6, 0.2, 1, 0.05, 'lowest share of the tier\'s resistance while relief is on');
  const effortCap = T.num('tierEffortCap', 1.2, 1, 2, 0.05, 'most of a tier\'s rated output a rider can get by spinning over its rated watts');
  const flameDpw = T.num('flameDpsPerWatt', 1.5, 0.02, 3, 0.01, 'Fireball damage per second per watt (power3s), split between fireball impact and burning ground');
  const flameRange = T.num('flameRange', 70, 10, 120, 1, 'how far the Fireball turret lobs fireballs');
  const fireballPeriod = T.num('fireballPeriodS', 0.7, 0.2, 3, 0.05, 'seconds between Fireball shots at the gearbox reference cadence (quicker when spinning faster)');
  const fireballFlight = T.num('fireballFlightS', 0.8, 0.2, 3, 0.05);
  const railPulseS = T.num('railPulseS', 4, 1, 20, 0.5, 'a full Railgun pulse banks this many seconds of the tier\'s rated watts');
  const railDmgMult = T.num('railDamageMult', 1, 0, 3, 0.05, 'Railgun pulse damage x (tests and balance)');
  const railSnapMin = T.num('railSnapMinShare', 0.05, 0.02, 1, 0.01, 'least share of a full pulse a quick snap at a light alien spends');
  const railSnapS = T.num('railSnapS', 0.2, 0.1, 3, 0.05, 'shortest gap between Railgun shots');
  const swapS = T.num('swapS', 3, 0.1, 8, 0.1, 'seconds to mount a weapon (Y / B / Z): the turret holds fire meanwhile');
  const turnRate = T.num('turretTurnRate', 6, 1, 20, 0.5, 'rad/s the turret slews toward its target');
  const turretRange = T.num('turretRange', 75, 20, 200, 1, 'Gatling and Railgun reach from the turret: the upper road is the towers\' job');
  const lockS = T.num('lockS', 6, 1, 30, 0.5, 'seconds a target lock (the paddles step it closer or further) lasts');
  const targetStick = T.num('targetStickS', 3, 0, 20, 0.5, 'keep the current target while it arrives within this many seconds of the best one');
  const match = Object.fromEntries(WEAPONS.map((w) => [w, Object.fromEntries(ELEMENTS.map((e) =>
    [e, T.num(`match_${w}_${e}`, MATCHUP[w][e], 0, 3, 0.05)]))])) as Record<Weapon, Record<Element, () => number>>;
  const matchup = (): Matchup => Object.fromEntries(WEAPONS.map((w) => [w,
    Object.fromEntries(ELEMENTS.map((e) => [e, match[w][e]()])),
  ])) as Matchup;
  const ignitionChance = T.num('ignitionChance', 0.6, 0, 1, 0.05);
  const ignitionRadius = T.num('ignitionRadius', 10, 1, 25, 1);
  const ignitionDamage = T.num('ignitionDamage', 20, 0, 100, 1);
  const ignitionCap = T.num('ignitionChainCap', 6, 0, 8, 1, 'maximum bursts in one ignition chain, including its first kill');
  // base, waves
  const baseHpMax = () => opts?.baseHp ?? T.num('baseHp', 100, 10, 1000, 5)();
  const garageAutostart = T.num('garageAutostartS', 30, 5, 120, 1, 'pedalling seconds before a run auto-starts');
  const garageCadence = T.num('garageCadenceRpm', 30, 15, 90, 1, 'cadence needed for Garage auto-start');
  const garageBreatherS = T.num('garageBreatherS', 6, 0, 30, 1, 'breather before the next auto-start countdown');
  const levelLoadMaxS = T.num('levelLoadMaxS', 12, 0, 60, 1, 'longest a level start waits for the renderer to ready its art (trainer neutral)');
  const hpScale = T.num('hpScalePerWave', 0.2, 0, 2, 0.01);
  const hpScale2 = T.num('hpScaleQuad', 0.02, 0, 0.2, 0.001, 'extra HP per wave^2');
  const countScale = T.num('waveCountScale', 1, 0.3, 3, 0.1, 'heavy enemies per wave multiplier');
  const miniInterval = T.num('miniIntervalS', 1.6, 0.3, 6, 0.1);
  // The flow: a level is one continuous stream in segments (build, peak, boss peak, trough); nothing waits for the field to clear.
  const segmentS = T.num('segmentS', 120, 10, 400, 5, 'a build or peak segment of the flow lasts this long, then the next one rolls straight in');
  const troughS = T.num('troughS', 100, 10, 400, 5, 'a trough (easy recovery segment, and the warm-up) lasts this long');
  const bossPeakMaxS = T.num('bossPeakMaxS', 300, 30, 600, 10, 'a boss peak ends when the boss dies, or by this time (the boss escapes)');
  const spawnTail = T.num('spawnTailS', 10, 0, 60, 1, 'the last seconds of a segment send no new heavies (its spawns spread over the rest)');
  const buildLow = T.num('buildPressure', 0.75, 0.3, 1.5, 0.05, 'the first build segment of a set sends this share of a peak; the set ramps up to the peak');
  // levels (docs/towerdefense/LEVELS-DESIGN.md §1–2)
  const intensityEasy = T.num('intensityEasy', 0.8, 0.4, 1, 0.05, 'Easy intensity: work-wave trainer targets (grade, level, ERG) x this');
  const intensityHard = T.num('intensityHard', 1.15, 1, 1.6, 0.05, 'Hard intensity: work-wave trainer targets x this');
  const intensityEasyHp = T.num('intensityEasyHp', 0.8, 0.3, 1, 0.05, 'Easy intensity: enemy HP x this');
  const intensityHardHp = T.num('intensityHardHp', 1.25, 1, 2.5, 0.05, 'Hard intensity: enemy HP x this');
  const splitRoadHp = T.num('splitRoadHp', 0.8, 0.5, 1, 0.05, 'forks and merges: road walkers\' HP x this (a tower sees only one of the routes)');
  // Stars count every hit the base took over the level: clear heals keep the base standing, but don't erase leaks.
  const starTwo = T.num('starTwoHp', 0.5, 0, 1, 0.05, 'two stars: at most this share of base HP lost over the whole level (heals not counted)');
  const starThree = T.num('starThreeHp', 1, 0, 1, 0.05, 'three stars: at most 1 - this share of base HP lost over the whole level (1 = flawless, no base damage)');
  const endlessRamp = T.num('endlessRamp', 0.7, 0.2, 2, 0.05, 'Endless: difficulty waves per segment (segments are shorter than the old waves, so the ramp per minute stays put)');
  const levelPeak = T.num('levelPeakWave', 7, 2, 30, 1, 'a level\'s last wave fights like this endless wave (+ the level\'s depth)');
  const firstLullS = T.num('firstLullS', 15, 0, 120, 1, 'quiet start of a level or run: time to pick a first tower, then the flow starts and never stops');
  const radarS = T.num('radarS', 90, 20, 240, 5, 'how far ahead the enemy radar looks');
  const radarGroupS = T.num('radarGroupS', 12, 1, 30, 1, 'aliens spawning on one road in one colour within this many seconds share a radar blip');
  const broodShare = T.num('broodShare', 0.8, 0.34, 1, 0.05, 'share of a wave\'s heavies in its brood colour (the rest are for the towers)');
  const broodMaxRun = T.num('broodMaxRun', 2, 1, 5, 1, 'no brood colour more than N waves in a row');
  const swarmPack = T.num('swarmPackSize', 5, 1, 12, 1, 'blue slots are swarm packs of N darts or drones');
  const broodCover = T.num('broodCoverWaves', 4, 0, 8, 1, 'all three brood colours in every N waves (< 3 = off)');
  const bossPhases = T.num('bossPhases', 3, 2, 3, 1);
  // Boss peaks (continuous-combat phase 4): a bigger boss with a thin escort, so the boss is the peak
  const bossHpMult = T.num('bossHpMult', 80, 1, 200, 0.1, 'boss HP multiplier: the right weapon at tier IV–V plus towers should take ~2.5 min');
  const bossSize = T.num('bossSize', 1.5, 1, 2.5, 0.05, 'boss body size multiplier');
  const bossEscort = T.num('bossEscort', 0.5, 0, 1.5, 0.05, 'heavies in a boss peak, as a share of a work segment\'s (all from the other two colours)');
  const bossStreamGap = T.num('bossStreamGap', 1.6, 1, 4, 0.1, 'drone stream gap multiplier during a boss peak');
  const bossClearD = T.num('bossClearD', 25, 0, 60, 1, 'nothing spawns on the road while the boss is within this many units of the entrance');
  const bossScrap = T.num('bossScrap', 500, 0, 2000, 10, 'scrap for killing a boss');
  const bossCrawl = T.num('bossCrawl', 0.35, 0.1, 1, 0.05, 'boss speed multiplier once inside the turret\'s reach (the fight takes ~2.5 min)');
  const bossFireSlow = T.num('bossFireSlow', 0.45, 0.1, 1, 0.05, 'Ram Tyrant: charge speed multiplier while in tier IV+ Fireball ground fire');
  const bossPlateTierLow = T.num('bossPlateTierLow', 0.4, 0, 1, 0.05, 'Bulwark Tyrant: share of the rail plate bonus a pulse below tier IV gets');
  const bossCountdown = T.num('bossPhaseCountdownS', 3, 1, 8, 0.5);
  const exposedEvery = T.num('bossExposedEveryS', 20, 8, 60, 1);
  const exposedTelegraph = T.num('bossTelegraphS', 3, 1, 6, 0.5);
  const exposedS = T.num('bossExposedS', 5, 1, 10, 0.5);
  const exposedMult = T.num('bossExposedMult', 2, 1, 4, 0.1);
  const exposedSprintMult = T.num('bossExposedSprintMult', 1.5, 1, 3, 0.1);
  const bossSwarmEvery = T.num('bossSwarmEveryS', 12, 3, 60, 1, 'Swarm Tyrant (blue): seconds between swarm packs in phase 1 (x0.75 each later phase)');
  const bossSwarmPack = T.num('bossSwarmPack', 4, 1, 12, 1, 'Swarm Tyrant: minis per pack in phase 1 (+2 each later phase)');
  const bossChargeEvery = T.num('bossChargeEveryS', 14, 4, 60, 1, 'Ram Tyrant (red): seconds between charges in phase 1 (x0.8 each later phase)');
  const bossChargeWarn = T.num('bossChargeWarnS', 2, 0.5, 6, 0.5, 'Ram Tyrant: warning before each charge');
  const bossChargeS = T.num('bossChargeS', 2.5, 0.5, 8, 0.5, 'Ram Tyrant: charge length in phase 1 (+0.5 s each later phase)');
  const bossChargeMult = T.num('bossChargeMult', 2.2, 1, 4, 0.1, 'Ram Tyrant: speed while charging');
  const bossShieldShare = T.num('bossShieldShare', 0.1, 0, 0.5, 0.01, 'Bulwark Tyrant (purple): shield plates as a share of max HP (+25 % each later phase)');
  const bossShieldRail = T.num('bossShieldRailMult', 2.5, 0.5, 6, 0.1, 'Bulwark Tyrant: rail shots break plates this much faster');
  const bossShieldOther = T.num('bossShieldOtherMult', 0.5, 0.1, 2, 0.05, 'Bulwark Tyrant: laser and tower damage to plates');
  const bossTricks = (): BossTricks => ({ swarmEveryS: bossSwarmEvery(), swarmPack: bossSwarmPack(), chargeEveryS: bossChargeEvery(),
    chargeWarnS: bossChargeWarn(), chargeS: bossChargeS(), shieldShare: bossShieldShare() });
  const troughHeal = T.num('troughHeal', 30, 0, 100, 1, 'base HP restored at the end of a clean trough (leaks during the trough scale it down)');
  const stallMult = T.num('stallDamageMult', 2.2, 1, 5, 0.1, 'leaks hit this much harder while the dynamo is stalled (shields down)');
  const stallGrace = T.num('stallGraceS', 3, 0, 15, 0.5, 'seconds under 15 rpm before the dynamo stalls (brief coasting is free)');
  const leakHealZero = T.num('leakHealZero', 15, 0, 200, 1, 'base damage taken in a trough that cancels its heal (scaled down linearly; 0 = any leak cancels it)');
  // dynamo: towers, overdrive, surges, economy
  const towerNominal = T.num('towerNominalFtp', 0.65, 0.2, 1.5, 0.05, 'ftpFraction at which towers fire at their rated speed');
  const towerMaxBoost = T.num('towerMaxBoost', 1.6, 1, 3, 0.1, 'cap on tower speed from extra watts');
  const towerDmgT = T.num('towerDamageMult', 0.85, 0.1, 5, 0.05, 'all tower damage x (turret vs tower damage share)');
  const mortarFlight = T.num('mortarFlightS', 1.1, 0.2, 3, 0.05, 'seconds a Mortar shell is in the air (it leads its target by this much)');
  const mortarSplashT = T.num('mortarSplashMult', 1, 0.2, 3, 0.05, 'Mortar blast radius x');
  const mortarDazeS = T.num('mortarDazeS', 1, 0, 5, 0.1, 'seconds a Mortar blast concusses the ground aliens it hits (not the boss)');
  const mortarDazeSlow = T.num('mortarDazeSlow', 0.3, 0, 0.9, 0.05, 'speed fraction a concussed alien loses');
  const teslaChain = T.num('teslaChain', 3, 1, 10, 1, 'Tesla chain targets at Lv 1');
  const teslaChainPerLv = T.num('teslaChainPerLevel', 0.5, 0, 2, 0.25, 'extra Tesla chain targets per level (floored)');
  const towerCostT = T.num('towerCostMult', 1, 0.2, 5, 0.05, 'all tower build/upgrade costs x');
  const overdriveMult = T.num('overdriveMult', 1.5, 1, 3, 0.1, 'damage / tower speed while sprinting');
  const startScrapT = T.num('startScrap', 60, 0, 1000, 10);
  const scrapScale = T.num('scrapMult', 1, 0.2, 5, 0.1);
  // A level's waves climb faster than Endless (its last wave fights like Endless wave levelPeakWave + depth), so
  // each wave also pays the scrap the Endless waves it skipped would have: base + perWave x that Endless wave.
  const catchUpBase = T.num('levelCatchUpScrap', 60, 0, 500, 5, 'scrap per Endless wave a level skips');
  const catchUpPer = T.num('levelCatchUpPerWave', 35, 0, 200, 5, 'extra catch-up scrap per Endless wave number');

  const save = readSave(ctx.load<unknown>());
  const autopilot = !!opts?.autopilot;
  const botBuild = opts?.botBuild ?? !!opts?.autopilot;
  /** Campaign stars (or the veteran floor, or a test override): they open the unlocks. */
  const stars = () => opts?.stars ?? Math.max(starTotal(save.campaign), save.veteran ? VETERAN_STARS : 0);
  const towerCap = () => maxTowerLevel(stars());

  let phase: 'garage' | 'run' = 'garage';
  /** The level being played (null = Endless), the last level's result for the clear screen, and launch choices. */
  let play: { spec: LevelSpec; waves: LevelWave[] } | null = null;
  let result: { spec: LevelSpec; stars: number; failed: boolean } | null = null;
  let intensity: Intensity = opts?.intensity ?? (save.intensity === 'hard' && !isUnlocked('hard', stars()) ? 'steady' : save.intensity);
  let campaignSel = campaignOpen(save.campaign), chain = 0;
  /** After an Endless run, B and the pedalling auto-start go back into Endless. */
  let lastEndless = false;
  const levelWave = (w: number): LevelWave | undefined => play?.waves[w - 1];
  const roleOf = (w: number): WaveRole => play ? levelWave(w)?.role ?? 'easy' : waveRole(w);
  const depth = () => play?.spec.depth ?? 0;
  /**
   * The difficulty wave (enemy mix and HP) of a level's wave `w`: the level ramps from wave 1 to its peak
   * (levelPeakWave + depth) over its length, so a long level is longer, not deeper. Endless: the wave itself.
   */
  const dw = (w: number) => !play ? 1 + (w - 1) * endlessRamp() : Math.round(1 + (Math.min(w, play.waves.length) - 1) * (levelPeak() + depth() - 1) / Math.max(1, play.waves.length - 1));
  const targetK = () => intensity === 'easy' ? intensityEasy() : intensity === 'hard' ? intensityHard() : 1;
  const hpK = () => intensity === 'easy' ? intensityEasyHp() : intensity === 'hard' ? intensityHardHp() : 1;
  let started = false;
  // Load gate: a renderer that sends `loadGate` holds each new level/run (time, trainer, input) until it sends
  // `levelReady`, so the level appears fully drawn; capped at levelLoadMaxS. Headless runs never gate.
  let loadGate = false, loading = false, loadingS = 0;
  let garageSel = 0, garageT = 0, garageBreather = 0;
  let menuPage: 'modes' | 'campaign' = 'modes', levelSel = 0;
  let t = 0, nextId = 1, fxId = 0, cueId = 0;
  let enemies: Enemy[] = [];
  const spawned: Enemy[] = [];
  let towers: Array<Tower | null> = PADS.map(() => null);
  let shells: Shell[] = [];
  let burns: Burn[] = [];
  let fireballT = 0;
  let fx: Fx[] = [];
  const cues: Array<{ name: string; id: number }> = [];
  let banner: Banner | null = null;
  let weapon: Weapon = 'gatling';
  let swapLeft = 0, swapTotal = 1;
  let aim = 0, targetId = 0, lockId = 0, lockLeft = 0, lastPaddle = 0;
  let baseMaxHp = baseHpMax(), baseHp = baseMaxHp, baseHurt = 99;
  /** Base HP lost over the current run, heals not counted (level stars). */
  let levelDmg = 0;
  let wave = 1, waveElapsed = 0, wavesSurvived = 0, lull = 0, lullLen = 0;
  /** The last segment's time is up and the level waits for its field to clear (waveElapsed when that began; -1 = not yet). */
  let segOverAt = -1;
  let plan: WavePlan, nextPlan: WavePlan;
  let schedule: Spawn[] = [];
  let miniTimer = 2;
  const escorts: Array<{ at: number; from: Enemy; offset: number; kind: Kind }> = [];
  let railVolley = false;
  let ignitionChainId = 0;
  let revAcc = 0, lastRevs = 0;
  let railBank = 0, railFired = 0, railCooldown = 0;
  let tier: Tier = clampTier(startTier());
  let gearLevel = 0, gearRelief = 1;
  let inputEpoch = 0, workshopRevision = 0, discardEdges = false;
  /** The pad the D-pad has selected outside the build menu (A opens it there); BASE_PAD = the base. */
  let padCursor = -1;
  let flaming = false, flamePower = 0, grid = 0, overdrive = false;
  /** Seconds at tier IV+ (Redline), weapon mounts (Quick Change), and whether the live boss has seen anything under tier V. */
  let highTierS = 0, weaponSwitches = 0, bossBelowV = false;
  let scrap = 0;
  let bestRunWaves = 0, wavesCleared = 0;
  let runSpotless = 0, bestRunSpotless = 0, spotlessWaves = 0;
  let bestChain = 0, strongKills = 0, exposedSprinted = false, bestMaxedTowers = 0;
  const exposedBossIds = new Set<number>();
  let workshop: { pad: number; row: number; idle: number } | null = null;
  /** The renderer reports its orientation (`padOrder` action) so ◀▶ follow the screen; headless stays portrait. */
  let padsTurned = false;
  const PAD_ORDER = () => PAD_ORDERS[padsTurned ? 'landscape' : 'portrait'];
  let leakDmg = 0, stallT = 0;
  const broods: Element[] = [];
  let lastBoss: Element | null = null;
  const pending: Array<{ type: string; [k: string]: unknown }> = [];
  const kills: Record<string, number> = { blue: 0, red: 0, purple: 0, gold: 0 };
  const dealt = { player: 0, tower: 0 };
  const weaponSeconds: Record<Weapon, number> = { gatling: 0, flame: 0, rail: 0 };
  const dealtW: Record<Weapon, number> = { gatling: 0, flame: 0, rail: 0 };
  const stats = { towersBuilt: 0, towerUpgrades: 0, scrapEarned: 0, runs: 0, runsFallen: 0, runsBailed: 0, bosses: 0, overdriveS: 0, heavyKills: 0, towerKills: 0, turretKills: 0, ignitionBursts: 0, levelsCleared: 0 };

  // ---------- helpers ----------
  function cue(name: string) { cues.push({ name, id: ++cueId }); if (cues.length > 40) cues.shift(); }
  function addFx(f: NewFx) {
    fx.push({ ...f, id: ++fxId, t0: t } as Fx);
    if (fx.length > 160) fx.splice(0, fx.length - 160);
  }
  function say(text: string, sub = '', color = '#ffffff', big = false) { banner = { text, sub, color, t0: t, big }; }
  /** A tier's rated power for this ride (Easy/Hard scale it like every trainer target). */
  const ratedFtp = (t: number) => tierFtpT[clampTier(t) - 1]() * targetK();
  const gearTuning = (): FireballLevelTuning => ({ cueRpm: gearRefRpm(), alpha: gearAlpha(), minPct: 1, maxPct: gearMaxLevel(), tauS: gearCalTau() });
  /** Learned trainer response: ftpFraction per resistance level % at the reference cadence. */
  const gearK0 = () => priorK(gearPriorLevel(), 1);
  let gearK = gearK0(), gearLevelPrev = -1, gearSteadyS = 0;
  /** The level the gearbox asks for at the current tier (before easing and relief). */
  const gearTarget = () => gearboxLevelFor(ratedFtp(tier), gearK, gearTuning());
  /**
   * The trainer stays in resistance mode for the whole run: the game is the gearbox. Each tier asks for the level
   * that makes its rated watts at the reference cadence for this rider and trainer; cadence moves watts from there.
   */
  function trainerSync(dt = 0) {
    if (phase !== 'run') { ctx.resistance.useVirtualGears(true); ctx.resistance.set({ id: 'weapon', mode: 'sim', gradePct: 0 }); return; }
    ctx.resistance.useVirtualGears(false);
    const want = gearTarget(), tau = gearShiftTau();
    gearLevel = gearLevel <= 0 || tau <= 0 || dt <= 0 ? want : gearLevel + (want - gearLevel) * (1 - Math.exp(-dt / tau));
    ctx.resistance.set({ id: 'weapon', mode: 'resistance', levelPct: +(gearLevel * gearRelief).toFixed(1) });
  }
  trainerSync();
  const towerCostMult = () => towerCostT();
  const repairCost = () => 30 + wave * 3;
  const gainScrap = (n: number) => { const v = Math.max(0, Math.round(n * scrapScale())); scrap += v; stats.scrapEarned += v; return v; };

  const elementOf = (e: Enemy): Element => {
    if (e.boss) return e.boss.color;
    if (e.kind === 'prism') return ELEMENTS[Math.floor((t + e.phase) / 4) % 3];
    return KINDS[e.kind].color as Element;
  };
  const shiftIn = (e: Enemy): number => {
    if (e.boss) return e.boss.pending ? e.boss.countdownS : 0;
    const p = e.kind === 'prism' ? 4 : 0;
    return p ? p - ((t + e.phase) % p) : 0;
  };
  const radiusOf = (e: Enemy) => e.kind === 'boss' ? geo.bossRadius * bossSize() : KINDS[e.kind].radius;

  function place(e: Enemy) {
    const p = e.route < 0 ? geo.lanes[e.lane].at(e.d) : flightAt(e.route, e.d);
    const wob = e.route >= 0 ? Math.sin(t * 5 + e.phase) * 2.5 : 0;
    const fade = Math.min(1, (e.len - e.d) / 12); // converge onto the base at the end
    e.x = p.x + p.nx * (e.off + wob) * fade; e.y = p.y + p.ny * (e.off + wob) * fade;
    e.angle = angleTo(e.x, e.y); e.dist = distTo(e.x, e.y);
  }

  /** An alien's HP when it spawns in segment `w` (walkers on split roads are weaker: a tower sees only one route). */
  function hpFor(kind: Kind, w: number, route: number): number {
    const w1 = dw(w) - 1;
    const hs = (1 + hpScale() * w1 + hpScale2() * w1 * w1) * (kind === 'boss' ? 1 + Math.floor(dw(w) / 5) * 0.35 : 1);
    return KINDS[kind].hp * hs * hpK() * (kind === 'boss' ? bossHpMult() : 1) * (route < 0 && geo.lanes.length > 1 ? splitRoadHp() : 1);
  }
  /** Walkers take the level's roads in turn (one road: always lane 0). */
  let laneTurn = 0;
  function spawn(kind: Kind, route: number, d = 0, lane = route < 0 ? laneTurn++ % geo.lanes.length : 0) {
    const k = KINDS[kind];
    const w1 = dw(wave) - 1;
    const hp = hpFor(kind, wave, route);
    const e: Enemy = {
      id: nextId++, kind, route, lane, d, len: route < 0 ? geo.lanes[lane].length : flightLength(route), off: route >= 0 ? (ctx.rng() - 0.5) * 3 : (ctx.rng() - 0.5) * (kind === 'boss' ? 1 : geo.laneSpread * 2),
      phase: ctx.rng() * 12, x: 0, y: 0, angle: 0, dist: 99,
      hp, maxHp: hp, speed: k.speed * Math.min(1.5, 1 + 0.012 * w1), dmg: k.dmg, dead: false, hurt: 0, lastEl: null, hitT: -1, hitCls: 'neutral', hitDmg: 0,
      spawnT: 5, born: t, charging: false, boss: kind === 'boss' ? createBossState(plan.brood, bossPhases()) : null, dazed: 0,
    };
    if (e.boss) e.boss.age = exposedEvery() / 2; // first opening is half a cycle in, then every full cycle
    place(e);
    spawned.push(e);
    if (e.boss) {
      const b = e.boss;
      ctx.emit({ type: 'bossSpawned', data: { wave, id: e.id, color: b.color } });
      addFx({ kind: 'bossIntro', life: 3, wave, color: b.color });
      say(`${BOSS_NAME[b.color]} incoming`, `${BOSS_TRICK[b.color]} · shift to V when Exposed`, '#ffd24a', true);
      cue('bossStart');
      bossEvents(e, openBoss(b, e.maxHp, bossTricks()));
    }
  }

  interface IgnitionChain { id: number; bursts: number }
  function hit(e: Enemy, base: number, el: Element | null, src: 'player' | 'tower' = 'player', chain?: IgnitionChain) {
    if (e.dead) return;
    const element = elementOf(e);
    const mult = el == null ? 1 : match[ELEMENT_WEAPON[el]][element]();
    const exposure = e.boss?.exposed ? exposedMult() * (ctx.bike().sprinting || tier >= 5 ? exposedSprintMult() : 1) : 1;
    const floor = e.boss ? bossHpFloor(e.boss, e.maxHp) : 0;
    const raw = e.boss ? shieldHit(e.boss, base * mult * exposure, railVolley, tier >= 4 ? bossShieldRail() : 1 + (bossShieldRail() - 1) * bossPlateTierLow(), bossShieldOther()) : base * mult * exposure;
    if (e.boss && e.boss.shieldMax > 0 && e.boss.shield <= 0) { e.boss.shieldMax = 0; bossEvents(e, ['shieldBroken']); }
    const damage = Math.min(Math.max(0, e.hp - floor), raw);
    if (src === 'player') dealtW[weapon] += damage;
    dealt[src] += damage; // effective damage, including ignition; no overkill or damage through phase gates
    e.hp -= damage;
    e.hurt = 0.12; e.lastEl = el;
    const cls: HitClass = mult > 1.001 ? 'strong' : mult < 0.999 ? 'resisted' : 'neutral';
    if (e.hitT === t) { e.hitDmg += damage; if (cls !== 'neutral') e.hitCls = cls; } else { e.hitT = t; e.hitDmg = damage; e.hitCls = cls; }
    if (e.hp <= 0) {
      kill(e, src, cls);
      if (el === 'red' && element === 'red') ignite(e, src, chain ?? { id: ++ignitionChainId, bursts: 0 });
    }
  }
  function ignite(e: Enemy, src: 'player' | 'tower', chain: IgnitionChain) {
    if (chain.bursts >= Math.floor(ignitionCap()) || ctx.rng() >= ignitionChance()) return;
    chain.bursts++;
    bestChain = Math.max(bestChain, chain.bursts);
    stats.ignitionBursts++;
    const r = ignitionRadius();
    addFx({ kind: 'burst', life: 0.5, x: e.x, y: e.y, r, chain: chain.id, ordinal: chain.bursts });
    ctx.emit({ type: 'burst', data: { wave, x: e.x, y: e.y, radius: r, chain: chain.id, ordinal: chain.bursts, source: src } });
    for (const other of enemies) if (!other.dead && elementOf(other) === 'red' && Math.hypot(other.x - e.x, other.y - e.y) <= r) {
      hit(other, ignitionDamage(), 'red', src, chain);
    }
  }

  function kill(e: Enemy, src: 'player' | 'tower', cls: HitClass = 'neutral') {
    e.dead = true;
    const def = KINDS[e.kind];
    const key = e.kind === 'boss' ? 'gold' : elementOf(e);
    if (cls === 'strong') strongKills++;
    addFx({ kind: 'death', life: def.heavy ? 0.7 : 0.4, x: e.x, y: e.y, color: e.kind === 'boss' ? 'gold' : key as Element, big: def.heavy, eid: e.id, ekind: e.kind, fire: e.lastEl === 'red', r: radiusOf(e) });
    kills[key]++;
    if (src === 'tower') stats.towerKills++;
    if (src === 'player') stats.turretKills++;
    const got = gainScrap(e.kind === 'boss' ? bossScrap() : def.scrap); // a boss peak's thin escort pays little, so the boss pays for the peak
    if (def.heavy) {
      stats.heavyKills++;
      addFx({ kind: 'text', life: 1, x: e.x, y: e.y - 3, text: `+${got}`, color: '#ffd24a' });
      cue(e.kind === 'boss' ? 'bossDie' : 'kill');
    }
    if (e.kind === 'carrier') for (let i = 0; i < 3; i++) spawnAt('mini', e, (i - 1) * 2.5);
    if (e.kind === 'boss') {
      stats.bosses++; save.totals.bosses++;
      if (e.boss && !save.bossColors.includes(e.boss.color)) save.bossColors.push(e.boss.color);
      say(`${def.name} destroyed!`, `+${got} scrap`, '#ffd24a', true);
      ctx.emit({ type: 'bossKilled', data: { wave, phases: e.boss?.phases ?? 0, color: e.boss?.color ?? 'gold', exposedSprinted: exposedBossIds.delete(e.id), topGear: !bossBelowV } });
      addFx({ kind: 'hitStop', life: 0.1, seconds: 0.08 });
      persist();
    } else if (def.heavy) ctx.emit({ type: 'enemyKilled', data: { element: key, wave, matchup: cls } });
  }
  /** Spawns near another alien: on the road at its distance, or (for a flyer's brood) on the road below it. */
  function spawnAt(kind: Kind, from: Enemy, dOff: number) {
    spawn(kind, from.route, Math.max(0, from.d + dOff), from.lane);
  }

  // ---------- the flow ----------
  // A level is one continuous stream cut into segments ("waves" internally): a set builds to a peak (or a boss
  // peak), then a trough. Segments roll straight into each other: the field never has to clear, there are no lulls
  // after the first, and the weapon is the rider's choice.
  const segLen = (role: WaveRole) => role === 'easy' ? troughS() : role === 'boss' ? bossPeakMaxS() : segmentS();
  /** Where segment `w` sits in its set's curve. */
  function stageOf(w: number): FlowStage {
    const v = setView(w);
    if (v.warmup) return 'warm-up';
    if (v.role === 'easy') return 'trough';
    if (v.role === 'boss') return 'boss';
    return v.pos >= v.of && roleOf(w + 1) !== 'boss' ? 'peak' : 'build';
  }
  /** A set's build segments ramp from buildPressure up to the peak's full flow. */
  function pressureOf(w: number): number {
    const v = setView(w);
    if (v.role !== 'work' || v.of <= 1) return 1;
    return buildLow() + (1 - buildLow()) * (v.pos - 1) / (v.of - 1);
  }
  function planFor(w: number): WavePlan {
    const role = roleOf(w), boss = role === 'boss';
    // Bosses take turns: a boss segment avoids the last boss's colour when the colour order allows it.
    const brood = nextBrood(broods, waveRng, { maxRun: boss ? 1 : broodMaxRun(), coverWaves: broodCover(), avoid: boss ? lastBoss ?? undefined : undefined });
    if (boss) lastBoss = brood;
    broods.push(brood);
    const window = Math.max(3, (boss ? segmentS() : segLen(role)) - spawnTail() - 1);
    const p = planWave(dw(w), waveRng, { spawnWindowS: window, countScale: countScale() * pressureOf(w) * (boss ? bossEscort() / 0.6 : 1), brood, broodShare: boss ? 0 : broodShare(), swarmPack: swarmPack(), routes: geo.routes, role });
    return { ...p, wave: w };
  }
  /** Plans segment `wave` and starts it: straight away, or after the short quiet start of a fresh level or run. */
  function startWave(fresh: boolean) {
    plan = fresh ? planFor(wave) : nextPlan;
    nextPlan = planFor(wave + 1);
    if (play && !fresh) for (let fw = dw(wave - 1) + 1; fw < dw(wave); fw++) gainScrap(catchUpBase() + catchUpPer() * fw);
    waveElapsed = 0; segOverAt = -1;
    if (fresh) escorts.length = 0;
    schedule = plan.spawns.map((s, i) => ({ ...s, lane: s.route < 0 ? spawnLane(i, plan.wave) : 0 }));
    lull = lullLen = fresh ? firstLullS() : 0;
    const b = broodInfo(plan);
    ctx.emit({ type: 'broodAnnounced', data: { wave, color: b.color, weapon: b.weapon, mode: b.mode } });
    if (plan.boss) ctx.emit({ type: 'bossPhaseAnnounced', data: { wave, phase: 1, color: b.color, weapon: b.weapon, mode: b.mode, countdownS: lull } });
    if (autoWeapon && fresh) selectWeapon(b.weapon);
    if (lull <= 0) beginWave();
  }
  /** The segment's spawns start. */
  function beginWave() {
    if (botBuild && !workshop) for (let i = 0; i < 12 && botBuildOnce(); i++); // bots spend their scrap as each segment starts
    ctx.emit({ type: 'waveStart', data: { wave } });
    if (plan.boss) { ctx.emit({ type: 'bossPhaseStarted', data: { wave, phase: 1, color: plan.brood, weapon } }); bossBelowV = false; }
    const { set } = setView(wave), stage = stageOf(wave), lead = `${plan.brood.toUpperCase()} leads`;
    const sets = play ? play.waves.reduce((n, w) => Math.max(n, w.set), 0) : 0;
    const of = sets ? ` of ${sets}` : '';
    const want = roman(suggestedTier());
    if (stage === 'warm-up') say('Warm-up', `${play!.spec.name} · tier ${want} · build your first towers`, '#7dffb0');
    else if (stage === 'trough') say(`Set ${set}${of} · trough`, `Ride easy · build · a clean trough heals the base`, '#7dffb0');
    else if (stage === 'build') say(`Set ${set}${of} · build`, `Tier ${want} · ${lead}`, '#cfe3ff');
    else if (stage === 'peak') say(`Set ${set}${of} · peak`, `Tier ${want} · ${lead}`, '#ffd24a');
    cue('waveStart');
  }
  /** The current segment is over: the next rolls straight in (a boss still alive escapes; a trough heals). */
  function clearWave() {
    for (const e of enemies) if (!e.dead && e.boss) {
      e.dead = true; ctx.emit({ type: 'bossEscaped', data: { wave } });
    }
    enemies = enemies.filter((e) => !e.dead);
    wavesSurvived++; wavesCleared++; bestRunWaves = Math.max(bestRunWaves, wavesSurvived);
    save.totals.waves++;
    const trough = plan.role === 'easy';
    const bonus = gainScrap(10 + wave * 2);
    const heal = trough ? troughHealFor(leakDmg, troughHeal(), leakHealZero()) : 0;
    baseHp = Math.min(baseMaxHp, baseHp + heal);
    const spotless = leakDmg === 0;
    if (spotless) { runSpotless++; spotlessWaves++; bestRunSpotless = Math.max(bestRunSpotless, runSpotless); }
    else runSpotless = 0;
    ctx.emit({ type: 'waveCleared', data: { wave, heal, leakDmg, spotless, runSpotless } });
    if (trough && !setView(wave).warmup) {
      say(heal ? `Base +${heal} HP` : 'Trough over', `${leakDmg === 0 ? 'Clean trough' : 'Leaks cost the heal'} · +${bonus} scrap`, '#7dffb0');
      cue('waveClear');
    }
    leakDmg = 0;
    wave++;
    persist();
    if (play && wave > play.waves.length) { levelDone(); return; }
    startWave(false);
  }
  /** The live segment is done: its time is up, or (a boss peak) its boss is dead. */
  function segmentDone(): boolean {
    if (!plan.boss) return waveElapsed >= segLen(plan.role);
    const bossLeft = enemies.some((e) => !e.dead && e.boss) || schedule.some((s) => s.kind === 'boss');
    return (!bossLeft && waveElapsed >= 5) || waveElapsed >= bossPeakMaxS();
  }
  /** Seconds between stream drones (they thicken as the level goes on; half rate in troughs). */
  const miniGap = () => (miniInterval() / (1 + 0.1 * (wave - 1))) * (plan?.role === 'easy' ? 2 : plan?.role === 'boss' ? bossStreamGap() : 1);
  let reachCache: { geo: typeof geo | null; range: number; d: Map<number, number> } = { geo: null, range: 0, d: new Map() };
  /** How far along a road (lane >= 0) or a Glider flight (-1 - route) an alien is when the turret can first reach it. */
  function reach(path: number): number {
    const range = turretRange();
    if (reachCache.geo !== geo || reachCache.range !== range) reachCache = { geo, range, d: new Map() };
    let d = reachCache.d.get(path);
    if (d === undefined) {
      const len = path >= 0 ? geo.lanes[path].length : flightLength(-1 - path), at = (x: number) => path >= 0 ? geo.lanes[path].at(x) : flightAt(-1 - path, x);
      d = len;
      for (let x = 0; x <= len; x += 1) { const q = at(x); if (distTo(q.x, q.y) <= range) { d = x; break; } }
      reachCache.d.set(path, d);
    }
    return d;
  }
  /**
   * The enemy radar: one blip per spawn group over the next radarS seconds, placed by when it comes into the
   * turret's reach (most aliens die around there, so "reaches the base" would leave the near end of the scope empty).
   * A group is what spawns on one road (or in the air) in one colour within radarGroupS of each other, so a pack is
   * one blip and a lone Brute is one blip; its HP is the group's total. Built from the aliens on the field, the live
   * segment's remaining spawns, the next segment's plan and the drone stream, which is rolled ahead in the same
   * windows, so every blip enters at the far edge and slides in. `scale` is a slowly decaying high-water mark of
   * a blip's HP, so blips size against what the rider has seen lately.
   */
  function radarView(dt: number): RadarView {
    const horizon = radarS(), G = radarGroupS(), L = geo.lanes.length;
    const groups = new Map<string, { eta: number; hp: number; color: Element | 'prism'; lane: number; n: number; key: number; boss?: boolean }>();
    let boss: RadarView['boss'] = null;
    const put = (eta: number, hp: number, color: Element | 'prism', lane: number, born: number, bossBlip = false) => {
      if (eta > horizon || hp <= 0) return;
      const key = Math.floor(born / G), id = bossBlip ? `boss:${born}` : `${lane}:${color}:${key}`;
      const g = groups.get(id);
      if (!g) { groups.set(id, { eta: Math.max(0, eta), hp, color, lane, n: 1, key, boss: bossBlip || undefined }); return; }
      g.eta = (g.eta * g.hp + Math.max(0, eta) * hp) / (g.hp + hp); g.hp += hp; g.n++;
    };
    // `lead` weighs what is on the field and what spawns within 60 s (slow heavies arrive late, but they are what the
    // turret should be ready for); the blips place everything by when it reaches the base
    const soon = { blue: 0, red: 0, purple: 0 };
    const weigh = (hp: number, color: Element | 'gold' | 'prism') => {
      if (color === 'prism') { soon.blue += hp / 3; soon.red += hp / 3; soon.purple += hp / 3; } else if (color !== 'gold') soon[color] += hp;
    };
    for (const e of enemies) {
      if (e.dead) continue;
      const eta = Math.max(0, reach(e.route >= 0 ? -1 - e.route : e.lane) - e.d) / Math.max(0.5, travelSpeed(e));
      // a boss on the field always shows (pinned to the far edge while it is further out)
      if (e.boss) { boss = { inS: 0, color: e.boss.color }; put(Math.min(eta, horizon), e.hp, e.boss.color, e.lane, e.born, true); continue; }
      weigh(e.hp, elementOf(e));
      put(eta, e.hp, e.kind === 'prism' ? 'prism' : elementOf(e), e.route >= 0 ? -1 : e.lane, e.born);
    }
    const ahead = (sp: readonly Spawn[], offset: number, w: number, color: Element) => {
      sp.forEach((s, i) => {
        const inS = offset + s.at;
        if (inS < 0 || inS >= horizon) return;
        if (s.kind !== 'boss' && inS < 60) weigh(hpFor(s.kind, w, s.route), KINDS[s.kind].color);
        if (s.kind === 'boss' && (!boss || inS < boss.inS)) boss = { inS, color };
        const lane = s.route >= 0 ? -1 : s.lane ?? spawnLane(i, w);
        const len = reach(s.route < 0 ? lane : -1 - s.route);
        const kc = KINDS[s.kind].color;
        put(inS + len / (KINDS[s.kind].speed * Math.min(1.5, 1 + 0.012 * (dw(w) - 1))), hpFor(s.kind, w, s.route),
          s.kind === 'boss' ? color : kc === 'gold' ? color : kc, lane, t + inS, s.kind === 'boss');
      });
    };
    if (plan) ahead(schedule, lull > 0 ? lull : -waveElapsed, plan.wave, plan.brood);
    if (nextPlan && (!play || nextPlan.wave <= play.waves.length)) ahead(nextPlan.spawns, segRemaining(), nextPlan.wave, nextPlan.brood);
    // the drone stream, rolled ahead in the same windows (it alternates roads, so each road takes an even share)
    if (segOverAt < 0) {
      const from = t + (lull > 0 ? lull : 0), gap = Math.max(0.2, miniGap()), miniHp = hpFor('mini', wave, -1);
      for (let k = Math.floor(from / G); k * G < t + horizon; k++) {
        const a = Math.max(from, k * G), b = (k + 1) * G;
        if (b <= a) continue;
        for (let lane = 0; lane < L; lane++) put((a + b) / 2 - t + reach(lane) / KINDS.mini.speed, miniHp * (b - a) / gap / L, 'blue', lane, k * G);
      }
    }
    const blips = [...groups.values()].filter((g) => g.hp >= 1).sort((a, b) => b.eta - a.eta)
      .map((g) => ({ etaS: Math.round(g.eta * 10) / 10, hp: Math.round(g.hp), color: g.color, lane: g.lane, n: g.n, key: g.key, ...(g.boss ? { boss: true } : {}) }));
    const top = blips.reduce((m, b) => b.boss ? m : Math.max(m, b.hp), 0);
    radarPeak = Math.max(top, radarPeak * Math.exp(-dt / 180), 1);
    leadHp = soon;
    const lead = ELEMENTS.reduce<Element | null>((m, c) => soon[c] > 0 && (!m || soon[c] > soon[m]) ? c : m, null);
    return { horizonS: horizon, roads: L, air: geo.routes > 0, blips, scale: Math.round(radarPeak), lead, boss };
  }
  /** The road the `i`th walker of segment `w`'s plan takes (fixed when planned, so the radar can show it). */
  const spawnLane = (i: number, w: number) => (i + w) % geo.lanes.length;
  let radar: RadarView | null = null, radarPeak = 1, radarAge = 0, botWeaponT = 0, leadHp = { blue: 0, red: 0, purple: 0 };
  /** Bots read the radar like a rider: switch to the colour leading it when that clearly outweighs the mounted one. */
  function botWeapon(dt: number) {
    botWeaponT -= dt;
    if (botWeaponT > 0 || !radar || swapLeft > 0) return;
    botWeaponT = 12;
    const soon = leadHp;
    const boss = enemies.find((e) => !e.dead && e.boss);
    if (boss) { selectWeapon(ELEMENT_WEAPON[elementOf(boss)]); return; }
    // the weapon whose matchups pay most against what's coming (Fireball can't reach Gliders, so blue counts less for it)
    const score = (w: Weapon) => ELEMENTS.reduce((sum, c) => sum + soon[c] * match[w][c]() * (w === 'flame' && c === 'blue' ? 0.5 : 1), 0);
    const best = WEAPONS.reduce((a, b) => score(b) > score(a) ? b : a);
    if (best !== weapon && score(best) > 1.15 * score(weapon)) selectWeapon(best);
  }
  /** Seconds until the live segment ends (a boss peak: the boss's likely remaining fight, at most its cap). */
  function segRemaining(): number {
    if (lull > 0) return lull + (plan.boss ? segmentS() : segLen(plan.role));
    if (!plan.boss) return Math.max(0, segLen(plan.role) - waveElapsed);
    const b = enemies.find((e) => !e.dead && e.boss);
    const guess = b ? segmentS() * (b.hp / b.maxHp) : segmentS() - waveElapsed;
    return clamp(guess, 5, Math.max(5, bossPeakMaxS() - waveElapsed));
  }
  /** Where a wave sits: its set, place and the set's work-wave count (a level's list, or endless sets of five). */
  function setView(w: number): { set: number; pos: number; of: number; role: WaveRole; warmup: boolean } {
    const lw = levelWave(w);
    return lw ? { set: lw.set, pos: lw.pos, of: lw.of, role: lw.role, warmup: !!lw.warmup } : { ...setOf(w), of: 3, role: roleOf(w), warmup: false };
  }
  /** The last wave of a level is cleared: stars from the base HP lost over the level, then the clear screen (Next level / Finish). */
  function levelDone() {
    const spec = play!.spec, stars = starsFor(1 - levelDmg / baseMaxHp, starTwo(), starThree());
    if (spec.kind === 'campaign') save.campaign[spec.id] = Math.max(save.campaign[spec.id] ?? 0, stars);
    chain++; stats.levelsCleared++;
    if (!save.roadsCleared.includes(spec.roadStyle)) save.roadsCleared.push(spec.roadStyle);
    ctx.emit({ type: 'levelCleared', data: { id: spec.id, kind: spec.kind, name: spec.name, stars, minutes: spec.minutes, waves: play!.waves.length, intensity, ground: spec.ground, chain } });
    result = { spec, stars, failed: false };
    campaignSel = campaignOpen(save.campaign);
    endRun('done');
  }

  function endRun(reason: 'bail' | 'fell' | 'done') {
    if (phase !== 'run') return;
    if (reason === 'fell') { stats.runsFallen++; save.totals.runsFallen++; }
    else if (reason === 'bail') { stats.runsBailed++; save.totals.runsBailed++; }
    if (play && reason !== 'done') {
      ctx.emit({ type: 'levelFailed', data: { id: play.spec.id, kind: play.spec.kind, reason, wave } });
      result = reason === 'fell' ? { spec: play.spec, stars: 0, failed: true } : null;
      chain = 0;
    }
    persist();
    runSpotless = 0;
    ctx.emit({ type: 'runEnded', data: { reason, wave, wavesSurvived, endless: !play } });
    lull = 0; swapLeft = 0; plan = undefined!;
    phase = 'garage'; garageSel = 0; garageT = 0; garageBreather = garageBreatherS();
    enemies = []; spawned.length = 0; shells = []; burns = []; schedule = []; fx = [];
    towers.fill(null); workshop = null; pending.length = 0;
    escorts.length = 0;
    exposedBossIds.clear(); grid = 0; overdrive = false; flaming = false; flamePower = 0; targetId = 0;
    railBank = 0;
    resetCombat();
    trainerSync();
    if (reason === 'done') say(`${result!.spec.name} cleared`, `${'★'.repeat(result!.stars)}${'☆'.repeat(3 - result!.stars)}`, '#ffd24a', true);
    else say(reason === 'fell' ? 'Base fell' : 'Back to the ride select', 'take a breather', '#ffd24a', true);
    cue(reason === 'fell' ? 'baseFell' : reason === 'done' ? 'waveClear' : 'uiClose');
    play = null;
  }

  // ---------- weapons ----------
  /** The tier the flow calls for: warm-up I, trough II, build III, peak and boss IV, a boss opening V. */
  function suggestedTier(p: WavePlan | undefined = plan, now = true): Tier {
    if (now && phase === 'run') {
      const b = enemies.find((e) => !e.dead && e.boss && !e.boss.pending)?.boss;
      if (b && (b.telegraph || b.exposed)) return 5;
      if (lull > 0) return 2;
    }
    if (!p) return 2;
    const stage = stageOf(p.wave);
    return stage === 'warm-up' ? 1 : stage === 'trough' ? 2 : stage === 'build' ? 3 : 4;
  }
  function broodInfo(p: WavePlan): BroodInfo {
    const weapon = ELEMENT_WEAPON[p.brood];
    const want = suggestedTier(p, false);
    const cue = p.role === 'easy' ? `ride easy · tier ${roman(want)}`
      : weapon === 'gatling' ? `spin fast · tier ${roman(want)}` : weapon === 'flame' ? `tier ${roman(want)} · 85+ rpm` : `tier ${roman(want)}+ · steady`;
    return { wave: p.wave, color: p.brood, weapon, mode: 'resistance', setting: `tier ${roman(want)} · ${Math.round(ratedFtp(want) * 100)}% FTP`, cue };
  }
  /** Bots mount the incoming brood's weapon at its lull; riders pick with Y / B / Z. */
  const autoWeapon = opts?.weapon === 'auto' || (opts?.weapon == null && autopilot);
  /** Mounts a weapon: the turret is silent for `swapS` while it changes (asking for the one being mounted does nothing). */
  function selectWeapon(w: Weapon) {
    if (w === weapon || phase !== 'run') return;
    weaponSwitches++;
    weapon = w; swapTotal = swapLeft = swapS(); revAcc = 0;
    cue('swap');
    ctx.emit({ type: 'weaponSwitched', data: { weapon: w, wave } });
  }
  const stalled = () => phase === 'run' && stallT >= stallGrace();
  const odMult = () => (overdrive ? overdriveMult() : 1);
  /** Share of the current tier's rated output the rider is delivering (mostly cadence on a real trainer). */
  const effortK = () => ctx.bike().cadence3s < 15 ? 0 : effortFactor(ctx.bike().ftpFraction, ratedFtp(tier), effortCap());
  /** FTP-seconds one Railgun pulse banks at the current tier. */
  const railCost = () => ratedFtp(tier) * railPulseS();

  /**
   * One Railgun pulse along the aim: the tier sets damage, width and how many it passes through. A pulse spends
   * only what it needs: a full pulse for anything tough, a quick snap (a share of the bank) for light aliens.
   * Returns false (nothing spent) when the bank cannot pay for the shot yet.
   */
  function fireRail(): boolean {
    const shape = railShape(tier), live = enemies.filter((e) => !e.dead);
    const hits = beamHits(live.map((e) => ({ x: e.x, y: e.y, r: radiusOf(e) })), BASE_X, BASE_Y, aim, shape.width, turretRange(), shape.pierce);
    if (!hits.length) return false;
    const full = shape.dmg * railDmgMult() * Math.min(1, effortK()) * odMult();
    const toughest = Math.max(...hits.map((i) => live[i].hp / Math.max(1e-6, full * match.rail[elementOf(live[i])]())));
    const share = live.some((e, i) => hits.includes(i) && (e.boss || KINDS[e.kind].heavy)) ? 1 : clamp(toughest * 1.1, railSnapMin(), 1);
    if (railBank < railCost() * share - 1e-9) return false;
    railBank -= railCost() * share; railFired++; railCooldown = railSnapS();
    addFx({ kind: 'beam', life: 0.45, angle: aim, spread: false, width: shape.width * (share < 1 ? 0.5 : 1) });
    railVolley = share >= 1;
    for (const i of hits) hit(live[i], full * share, 'purple');
    railVolley = false;
    cue('rail');
    ctx.emit({ type: 'railFired', data: { charges: 1, hits: hits.length, tier, full: share >= 1 } });
    return true;
  }

  /** Closest live enemy (to the base) inside an angular cone around `a`. */
  function nearestInCone(a: number, tol: number, maxDist = 999): Enemy | null {
    let best: Enemy | null = null;
    for (const e of enemies) {
      if (e.dead || e.dist > maxDist) continue;
      if (angDiff(e.angle, a) <= tol + radiusOf(e) / Math.max(4, e.dist) && (!best || e.dist < best.dist)) best = e;
    }
    return best;
  }

  const lock = (): Lock | null => (lockLeft > 0 && lockId > 0 ? { id: lockId, k: lockLeft / lockS() } : null);
  const reachOpts = () => ({ reach: weapon === 'flame' ? flameRange() : turretRange(), groundOnly: weapon === 'flame' });
  const candidates = (): TargetCand[] => enemies.filter((e) => !e.dead).map((e) => ({
    id: e.id, element: elementOf(e), eta: (e.len - e.d) / Math.max(0.1, travelSpeed(e)), dist: e.dist, angle: e.angle, dmg: e.dmg, flying: e.route >= 0,
  }));
  /** Paddles / D-pad ◀▶ step a lock one alien closer (-1) or further (+1) from the current target. */
  function stepLock(dir: -1 | 1) {
    const id = stepTarget(candidates(), reachOpts(), lockLeft > 0 && lockId ? lockId : targetId, dir);
    if (!id) return;
    if (id !== lockId) cue('select');
    lockId = id; lockLeft = lockS();
  }
  /** The turret always aims itself (#120): the soonest-arriving brood-colour alien, unless the rider holds a lock. */
  function autoTarget(): Enemy | null {
    // An opening is a concrete sprint opportunity: aim at the boss while its armour is open.
    const exposedBoss = enemies.find((e) => !e.dead && e.boss?.exposed && e.dist < 130 &&
      Math.abs(e.angle) <= AIM_LIMIT && (weapon !== 'flame' || e.dist <= flameRange() + radiusOf(e)));
    if (exposedBoss) return exposedBoss;
    const id = chooseTarget(candidates(), {
      element: WEAPON_ELEMENT[weapon], ...reachOpts(), lock: lock(), current: targetId, stickS: targetStick(),
    });
    return id ? enemies.find((e) => e.id === id) ?? null : null;
  }

  // ---------- towers ----------
  function inRange(tw: Tower, e: Enemy) {
    if (e.route >= 0 && !TOWERS[tw.kind].air) return false;
    const p = PADS[tw.pad], r = TOWERS[tw.kind].range * LEVEL_RANGE[tw.level - 1];
    return Math.hypot(e.x - p.x, e.y - p.y) <= r + radiusOf(e);
  }
  function updateTowers(dt: number) {
    const boost = grid * odMult();
    // A watt weapon's brood is that weapon's job. Any tower the brood does not resist answers to the same
    // watts, or the others cover the wave and the push never matters. A resisted tower, and every tower
    // during a Gatling wave (the turret spends revs there), keeps its cadence-powered rate.
    // A watt weapon's brood is that weapon's job: a tower the brood does not resist answers to how close the rider
    // is to the tier the flow calls for, or the towers cover the wave and the push never matters. Resisted towers,
    // and every tower during a Gatling wave, keep their cadence-powered rate.
    const fed = weapon === 'gatling' ? 1 : Math.min(1, effortFactor(ctx.bike().ftpFraction, ratedFtp(suggestedTier())));
    const brood = plan?.brood;
    for (const tw of towers) {
      if (!tw) continue;
      const w = TOWER_WEAPON[tw.kind], covers = brood != null && (w ? match[w][brood]() : 1) >= 1;
      const rate = (covers ? fed : 1) * boost;
      const def = TOWERS[tw.kind], p = PADS[tw.pad], dmg = def.dmg * LEVEL_DMG[tw.level - 1] * towerDmgT();
      tw.cd = Math.max(-0.01, tw.cd - dt * rate);
      if (tw.cd > 0 || rate <= 0) continue;
      let target: Enemy | null = null;
      for (const e of enemies) {
        if (e.dead || !inRange(tw, e)) continue;
        if (tw.kind === 'lens' ? !target || e.hp > target.hp : !target || e.dist < target.dist) target = e;
      }
      if (!target) continue;
      tw.cd += def.period;
      tw.firedAt = t;
      tw.angle = Math.atan2(target.x - p.x, p.y - target.y);
      if (tw.kind === 'tesla') {
        const pts = [{ x: p.x, y: p.y - 3 }];
        const hitSet = new Set<number>();
        let cur: Enemy | null = target, k = 1;
        for (let i = 0, n = Math.round(teslaChain()) + Math.floor(teslaChainPerLv() * (tw.level - 1)); i < n && cur; i++) {
          pts.push({ x: cur.x, y: cur.y }); hitSet.add(cur.id);
          hit(cur, dmg * k, 'blue', 'tower'); k *= 0.8;
          let nxt: Enemy | null = null, nd = 14;
          for (const e of enemies) {
            if (e.dead || hitSet.has(e.id)) continue;
            const d = Math.hypot(e.x - pts[pts.length - 1].x, e.y - pts[pts.length - 1].y);
            if (d < nd) { nd = d; nxt = e; }
          }
          cur = nxt;
        }
        addFx({ kind: 'zap', life: 0.22, pts, pad: tw.pad });
        cue('zap');
      } else if (tw.kind === 'flamer') {
        // A continuous cone: every pulse burns every ground alien inside it.
        const half = def.cone ?? 0.5;
        for (const e of enemies) {
          if (e.dead || !inRange(tw, e)) continue;
          let da = Math.atan2(e.x - p.x, p.y - e.y) - tw.angle;
          while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
          if (Math.abs(da) <= half + radiusOf(e) / Math.max(3, Math.hypot(e.x - p.x, e.y - p.y))) hit(e, dmg, 'red', 'tower');
        }
        cue('flameTower');
      } else if (tw.kind === 'mortar') {
        // Lead the target along its road; the shell bursts where it lands and spares fliers.
        const flight = mortarFlight(), ahead = geo.lanes[target.lane].at(target.d + travelSpeed(target) * flight);
        shells.push({ x0: p.x, y0: p.y, x1: ahead.x, y1: ahead.y, t: 0, flight, dmg, r: (def.splash ?? 6) * mortarSplashT(), burnS: 0, burnDps: 0, tower: tw.pad });
        cue('mortar');
      } else {
        addFx({ kind: 'lens', life: 0.35, x0: p.x, y0: p.y - 3, x1: target.x, y1: target.y, pad: tw.pad });
        hit(target, dmg, 'purple', 'tower');
        cue('lens');
      }
    }
  }
  /** Turret fireballs land on the road, burst, and leave it burning. Gliders fly over both. */
  function updateFireballs(dt: number) {
    for (const s of shells) {
      s.t += dt;
      if (s.t < s.flight) continue;
      addFx({ kind: 'boom', life: 0.5, x: s.x1, y: s.y1, r: s.r });
      const mortar = s.tower != null, el = mortar ? null : 'red', src = mortar ? 'tower' : 'player';
      for (const e of enemies) if (!e.dead && e.route < 0 && Math.hypot(e.x - s.x1, e.y - s.y1) <= s.r + radiusOf(e)) {
        hit(e, s.dmg, el, src);
        if (mortar && !e.boss) e.dazed = Math.max(e.dazed, mortarDazeS()); // the Tyrant shrugs it off
      }
      if (s.burnDps > 0) burns.push({ x: s.x1, y: s.y1, r: s.r, left: s.burnS, total: s.burnS, dps: s.burnDps, tier: s.tier ?? 0 });
      cue('explode');
    }
    shells = shells.filter((s) => s.t < s.flight);
    for (const b of burns) {
      b.left -= dt;
      for (const e of enemies) if (!e.dead && e.route < 0 && Math.hypot(e.x - b.x, e.y - b.y) <= b.r + radiusOf(e)) hit(e, b.dps * dt, 'red');
    }
    burns = burns.filter((b) => b.left > 0);
    if (burns.length > 24) burns.splice(0, burns.length - 24);
  }
  function lobFireball(target: Enemy, damage: number) {
    const flight = fireballFlight(), ahead = target.route < 0 ? geo.lanes[target.lane].at(target.d + travelSpeed(target) * flight) : target;
    const shape = fireballShape(tier), share = clamp(shape.burnShare, 0, 1);
    shells.push({ x0: BASE_X, y0: BASE_Y, x1: ahead.x, y1: ahead.y, t: 0, flight, dmg: damage * (1 - share), r: shape.radius, burnS: shape.burnS, burnDps: damage * share / Math.max(0.1, shape.burnS), tier });
    cue('fireball');
  }
  /** Where the slow field starts on lane 0 (each road is covered from the same share of its length). */
  function travelSpeed(e: Enemy) {
    // a Ram Tyrant charging through tier IV+ ground fire bogs down
    const bogged = e.charging && e.boss && burns.some((b) => b.tier >= 4 && Math.hypot(e.x - b.x, e.y - b.y) <= b.r + radiusOf(e));
    // a boss strides in, then crawls once the turret can reach it: the fight happens in range, not on the march
    const crawl = e.boss && e.route < 0 && e.d >= reach(e.lane) ? bossCrawl() : 1;
    return e.speed * crawl * (e.charging ? e.boss ? bossChargeMult() * (bogged ? bossFireSlow() : 1) : 2.6 : 1)
      * (e.boss?.pending || (e.boss?.staggerS ?? 0) > 0 ? 0.2 : 1) * (e.dazed > 0 ? 1 - mortarDazeSlow() : 1);
  }

  function build(pad: number, kind: TowerKind): boolean {
    const c = towerBuildCost(kind, towerCostMult());
    if (towers[pad] || scrap < c || !kindOpen(kind)) { cue('deny'); return false; }
    scrap -= c;
    towers[pad] = { pad, kind, level: 1, cd: 0.5, angle: 0, firedAt: -9 };
    stats.towersBuilt++; save.totals.towers++;
    cue('build');
    ctx.emit({ type: 'towerBuilt', data: { tower: kind, pad } });
    return true;
  }
  function upgrade(pad: number): boolean {
    const tw = towers[pad];
    if (!tw || tw.level >= towerCap()) { cue('deny'); return false; }
    const c = towerUpgradeCost(tw.kind, tw.level, towerCostMult());
    if (scrap < c) { cue('deny'); return false; }
    scrap -= c; tw.level++; stats.towerUpgrades++;
    cue('upgrade');
    ctx.emit({ type: 'towerUpgraded', data: { tower: tw.kind, pad, level: tw.level } });
    bestMaxedTowers = Math.max(bestMaxedTowers, towers.filter((x) => x && x.level >= TOWER_MAX_LEVEL).length);
    return true;
  }
  function sell(pad: number) {
    const tw = towers[pad]; if (!tw) return;
    let spent = towerBuildCost(tw.kind, towerCostMult());
    for (let l = 1; l < tw.level; l++) spent += towerUpgradeCost(tw.kind, l, towerCostMult());
    scrap += Math.round(spent * 0.5); towers[pad] = null; cue('coin');
    ctx.emit({ type: 'towerSold', data: { tower: tw.kind, pad, level: tw.level } });
  }
  function repair(): boolean {
    if (baseHp >= baseMaxHp || scrap < repairCost()) { cue('deny'); return false; }
    scrap -= repairCost(); baseHp = Math.min(baseMaxHp, baseHp + REPAIR_HP); cue('repair');
    return true;
  }

  /** The Mortar is earned with campaign stars; the colour towers are always open. */
  const kindOpen = (k: TowerKind) => k !== 'mortar' || isUnlocked('mortar', stars());
  function workshopRows(pad: number): WorkshopRow[] {
    if (pad === BASE_PAD) return [{ kind: 'repair', label: 'Repair base', desc: `+${REPAIR_HP} HP`, cost: repairCost(), affordable: scrap >= repairCost() && baseHp < baseMaxHp }];
    const tw = towers[pad];
    if (!tw) return [...TOWER_KINDS.map((k): WorkshopRow => {
      const c = towerBuildCost(k, towerCostMult()), open = kindOpen(k);
      return { kind: 'build', tower: k, label: TOWERS[k].name, desc: open ? TOWERS[k].desc : `Unlocks at ${UNLOCKS.find((u) => u.id === k)!.stars}★`, cost: c, affordable: open && scrap >= c,
        ...(open ? {} : { locked: true }) };
    })];
    const rows: WorkshopRow[] = [];
    if (tw.level < towerCap()) {
      const c = towerUpgradeCost(tw.kind, tw.level, towerCostMult());
      rows.push({ kind: 'upgrade', tower: tw.kind, label: `Upgrade to Lv ${tw.level + 1}`, desc: `x${(LEVEL_DMG[tw.level] / LEVEL_DMG[tw.level - 1]).toFixed(1)} damage, more range`, cost: c, affordable: scrap >= c });
    }
    rows.push({ kind: 'sell', tower: tw.kind, label: 'Scrap it', desc: 'Refund half', cost: 0, affordable: true });
    return rows;
  }
  /** Next-wave off-colour aliens are the towers' job. Suggestions follow the live matchup tunables. */
  function suggestTower(pad: number): number {
    const suggestion = recommendation(pad);
    return suggestion?.tower ? TOWER_KINDS.indexOf(suggestion.tower)
      : Math.max(0, TOWER_KINDS.findIndex(k => kindOpen(k) && towerBuildCost(k, towerCostMult()) <= scrap));
  }
  /** Where the pad cursor rests until the rider moves it: the suggested build, else the first empty pad. */
  function cursorPad(): number {
    if (padCursor < 0 || padCursor > BASE_PAD) padCursor = recommendation()?.pad ?? PAD_ORDER().find((i) => i < BASE_PAD && !towers[i]) ?? PAD_ORDER()[0];
    return padCursor;
  }
  /**
   * The pad (or the base) the D-pad reaches from `from`: the nearest one within 60° of the pressed direction on screen
   * (landscape turns the field a quarter turn), favouring the straight-ahead one. `from` when nothing lies that way.
   */
  function padStep(from: number, dir: 'left' | 'right' | 'up' | 'down'): number {
    const at = (i: number) => (i === BASE_PAD ? { x: BASE_X, y: BASE_Y } : PADS[i]);
    const sx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0, sy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
    const [dx, dy] = padsTurned ? [sy, -sx] : [sx, sy]; // screen direction in field coordinates
    const o = at(from);
    let best = from, bestScore = Infinity;
    for (let i = 0; i <= BASE_PAD; i++) {
      if (i === from) continue;
      const q = at(i), vx = q.x - o.x, vy = q.y - o.y, d = Math.hypot(vx, vy);
      const cos = d > 0 ? (vx * dx + vy * dy) / d : -1;
      if (cos < 0.5) continue;
      const score = d * (1 + 2 * (1 - cos));
      if (score < bestScore) { bestScore = score; best = i; }
    }
    return best;
  }
  /**
   * The build menu is a two-column grid of options with Exit across the bottom (row index `count`). The D-pad moves
   * through it; up from the top row and down from Exit wrap around.
   */
  function menuStep(row: number, count: number, dir: 'left' | 'right' | 'up' | 'down'): number {
    const exit = count;
    if (row >= exit) return dir === 'up' ? Math.max(0, count - 1 - ((count - 1) % 2)) : dir === 'down' ? 0 : row;
    if (dir === 'left' || dir === 'right') { const n = row ^ 1; return n < count ? n : row; }
    if (dir === 'up') return row >= 2 ? row - 2 : exit;
    return row + 2 < count ? row + 2 : exit;
  }
  function openWorkshop(pad?: number) {
    const p = pad ?? cursorPad();
    padCursor = p;
    workshop = { pad: p, row: p < BASE_PAD && !towers[p] ? suggestTower(p) : 0, idle: 0 };
    workshopRevision++; inputEpoch++; 
    cue('uiOpen');
  }
  function closeWorkshop() {
    if (!workshop) return;
    workshop = null; workshopRevision++; inputEpoch++;  cue('uiClose');
  }
  function workshopAct(row?: number) {
    if (!workshop) return;
    const rows = workshopRows(workshop.pad);
    if (row != null) workshop.row = clamp(row, 0, rows.length);
    if (workshop.row >= rows.length) { closeWorkshop(); return; } // Exit
    const r = rows[workshop.row]; if (!r) return;
    if (r.kind === 'build') build(workshop.pad, r.tower!);
    else if (r.kind === 'upgrade') upgrade(workshop.pad);
    else if (r.kind === 'sell') sell(workshop.pad);
    else repair();
    workshopRevision++;
    workshop.row = clamp(workshop.row, 0, workshopRows(workshop.pad).length - 1);
  }

  function recommendation(pad?: number): BuildSuggestion | null {
    if (!plan) return null;
    // The live segment while it is young (or still in its quiet start), then the next one.
    const coming = lull > 0 || waveElapsed < segmentS() / 2 ? plan : nextPlan;
    return suggestBuild({ wave: coming.wave, brood: coming.brood, counts: coming.counts,
      towers: towers.filter((tw): tw is Tower => !!tw), scrap, costMult: towerCostMult(), maxLevel: towerCap(),
      baseHp, baseMaxHp, repairCost: repairCost(), matchup: matchup(), pad, geo, kinds: TOWER_KINDS.filter(kindOpen) });
  }
  /** The headless build bot (never a player feature): carries out the current suggestion. */
  function botBuildOnce(): boolean {
    const s = recommendation();
    if (!s) return false;
    let ok = false;
    if (s.kind === 'repair') ok = repair();
    else if (s.kind === 'build') {
      ok = build(s.pad, s.tower!);
      if (ok) while (towers[s.pad]!.level < s.targetLevel) { if (!upgrade(s.pad)) break; }
    }
    else if (scrap >= s.cost) {
      while (towers[s.pad]!.level < s.targetLevel) { if (!upgrade(s.pad)) break; ok = true; }
    }
    return ok;
  }


  // ---------- garage ----------
  /** The level after `spec` on the clear screen: the next campaign level, or a fresh Quick Ride at the same length. */
  function nextSpec(spec: LevelSpec): LevelSpec | null {
    if (spec.kind === 'quick') return quickRide(save.quickSeed, spec.minutes, quickGrounds(campaignOpen(save.campaign)));
    return CAMPAIGN[(spec.index ?? 0) + 1] ?? null;
  }
  const starText = (n: number) => `${'★'.repeat(n)}${'☆'.repeat(3 - n)}`;
  const levelDesc = (spec: LevelSpec) => {
    const waves = levelWaves(spec.minutes, bossCount(spec.minutes, spec.seed)), bosses = waves.filter(w => w.role === 'boss').length;
    return `${spec.minutes} min · ${waves.length} waves · ${bosses} boss${bosses === 1 ? '' : 'es'}`;
  };
  function garageRows(): GarageRow[] {
    if (result) {
      const next = result.failed ? result.spec : nextSpec(result.spec);
      const rows: GarageRow[] = [];
      if (next) rows.push({ kind: 'next', name: result.failed ? `Retry · ${next.name}` : `Next level · ${next.name}`, desc: `${levelDesc(next)} · starts straight away` });
      rows.push({ kind: 'finish', name: 'Finish', desc: 'Back to the level select' });
      return rows;
    }
    const c = CAMPAIGN[campaignSel], got = save.campaign[c.id] ?? 0;
    const rows: GarageRow[] = [
      { kind: 'campaign', name: `Campaign · ${c.name}`, desc: `${levelDesc(c)}${got ? ` · ${starText(got)}` : ''} · A: all levels` },
      { kind: 'quick', name: `Quick Ride · ${save.quickMinutes} min`, desc: 'A new seeded map · ◀ ▶ length · Y new map' },
      { kind: 'start', name: 'Endless', desc: `Sets forever on a new map · best wave ${save.endlessBest}` },
      { kind: 'intensity', name: `Intensity · ${INTENSITY_NAME[intensity]}`, desc: `◀ ▶ · scales work-wave trainer targets and alien HP${isUnlocked('hard', stars()) ? '' : ' · Hard unlocks at 20★'}` },
    ];
    const n = stars(), next = nextUnlock(n);
    rows.push({ kind: 'unlocks', name: `Stars · ${n}★`, desc: next ? `Next: ${next.name} at ${next.stars}★ · ${next.desc}` : 'Everything is unlocked' });
    return rows;
  }
  const nextEndlessMap = () => endlessMap(save.endlessSeed, quickGrounds(campaignOpen(save.campaign)));
  /** The generated maps the next Quick Ride and Endless run would play (minutes only change a name), memoised. */
  let nextMapsMemo: { k: string; v: TdSnapshot['nextMaps'] } | null = null;
  function nextMaps(): TdSnapshot['nextMaps'] {
    const open = campaignOpen(save.campaign), k = `${save.quickSeed}|${save.endlessSeed}|${open}|${!!opts?.level}`;
    if (nextMapsMemo?.k !== k) {
      const q = quickRide(save.quickSeed, save.quickMinutes, quickGrounds(open)), e = nextEndlessMap();
      const map = (m: typeof e) => ({ seed: m.seed, roadStyle: m.roadStyle, ground: m.ground, pads: m.pads });
      nextMapsMemo = { k, v: opts?.level ? [map(q)] : [map(q), map(e)] };
    }
    return nextMapsMemo.v;
  }
  function startLevel(spec: LevelSpec) {
    if (spec.kind === 'quick' && spec.seed === save.quickSeed) save.quickSeed++;
    play = { spec, waves: levelWaves(spec.minutes, bossCount(spec.minutes, spec.seed)) };
    useLevel(levelFor(spec));
    startRun();
  }
  /** A (or the auto-start, or B) on a row. */
  function garageAct(row: GarageRow, primary: boolean) {
    if (row.kind === 'next') { const next = result!.failed ? result!.spec : nextSpec(result!.spec); result = null; if (next) startLevel(next); return true; }
    if (row.kind === 'finish') {
      // back to where the level came from: the level grid (on the next open level) or the ride select
      if (result?.spec.kind === 'campaign') { menuPage = 'campaign'; levelSel = campaignSel; } else menuPage = 'modes';
      result = null; chain = 0; garageSel = 0; cue('uiClose'); return false;
    }
    if (row.kind === 'campaign') {
      if (!primary) { if (lastEndless) startRun(); else startLevel(CAMPAIGN[campaignSel]); return true; }
      menuPage = 'campaign'; levelSel = campaignSel; cue('uiOpen'); return false;
    }
    if (row.kind === 'quick') { startLevel(quickRide(save.quickSeed, save.quickMinutes, quickGrounds(campaignOpen(save.campaign)))); return true; }
    if (row.kind === 'start') { startRun(); return true; }
    if (!primary) { if (lastEndless) startRun(); else startLevel(CAMPAIGN[campaignSel]); return true; }
    if (row.kind === 'intensity') { intensity = offered()[(offered().indexOf(intensity) + 1) % offered().length]; cue('select'); persist(); }
    return false;
  }
  /** The intensities on offer: Hard once it is unlocked. */
  function offered(): readonly Intensity[] { return isUnlocked('hard', stars()) ? INTENSITIES : INTENSITIES.filter((i) => i !== 'hard'); }
  /** Quick Ride: skip to the next seed's map (the card previews it; the background builds it). */
  function rerollQuick() { save.quickSeed++; garageT = 0; cue('select'); persist(); }
  /** The level grid: ◀ ▶ step a level, ▲ ▼ a ground (row of five); A rides an open level, B goes back. */
  function levelSelectUpdate(dt: number, inp: Readonly<InputState>) {
    const p = (b: Button) => inp.pressed.has(b), open = campaignOpen(save.campaign);
    const select = (i: number) => {
      const next = clamp(i, 0, CAMPAIGN.length - 1);
      if (next !== levelSel) { levelSel = next; cue('select'); }
      if (levelSel <= open) campaignSel = levelSel;
      garageT = 0;
    };
    const ride = () => {
      if (levelSel > open) { cue('deny'); return false; }
      campaignSel = levelSel; menuPage = 'modes'; startLevel(CAMPAIGN[levelSel]); return true;
    };
    for (const a of pending.splice(0)) {
      if (a.type === 'levelTile' && Number.isInteger(a.index)) { if (a.index === levelSel) { if (ride()) return; } else select(a.index as number); }
      else if (a.type === 'levelStart') { if (ride()) return; }
      else if (a.type === 'levelBack') { menuPage = 'modes'; garageSel = 0; cue('uiClose'); return; }
    }
    if (p('left')) select(levelSel - 1);
    if (p('right')) select(levelSel + 1);
    if (p('up')) select(levelSel - LEVELS_PER_STYLE);
    if (p('down')) select(levelSel + LEVELS_PER_STYLE);
    if (p('b')) { menuPage = 'modes'; garageSel = 0; garageT = 0; cue('uiClose'); return; }
    if (p('a') && ride()) return;
    if (garageBreather > 0) garageBreather = Math.max(0, garageBreather - dt);
    else if (ctx.bike().cadence3s > garageCadence()) garageT += dt;
    if (garageT >= garageAutostart()) { menuPage = 'modes'; startLevel(CAMPAIGN[campaignSel]); }
  }
  function garageUpdate(dt: number, inp: Readonly<InputState>) {
    if (menuPage === 'campaign' && !result) { levelSelectUpdate(dt, inp); return; }
    const p = (b: Button) => inp.pressed.has(b);
    let rows = garageRows();
    let act = false, touchStep = 0;
    for (const a of pending.splice(0)) if (a.type === 'garageRow' && typeof a.row === 'number' && a.row >= 0 && a.row < rows.length) { garageSel = a.row; act = true; }
      // a card's own ◀ ▶ (or a swipe on it): select that row and step it, without starting anything
      else if (a.type === 'garageStep' && Number.isInteger(a.row) && (a.row as number) >= 0 && (a.row as number) < rows.length && (a.step === 1 || a.step === -1)) {
        garageSel = a.row as number; touchStep = a.step as number;
      } else if (a.type === 'quickReroll') { rerollQuick(); garageSel = rows.findIndex((r) => r.kind === 'quick'); }
      else if (a.type === 'levelTile' && !result && Number.isInteger(a.index) && (a.index as number) >= 0 && (a.index as number) < CAMPAIGN.length) {
        menuPage = 'campaign'; levelSel = a.index as number; garageT = 0; cue('uiOpen'); return;
      }
    garageSel = Math.min(garageSel, rows.length - 1);
    if (p('up')) { garageSel = (garageSel + rows.length - 1) % rows.length; garageT = 0; cue('select'); }
    if (p('down')) { garageSel = (garageSel + 1) % rows.length; garageT = 0; cue('select'); }
    const row = rows[garageSel], step = touchStep || (p('left') ? -1 : p('right') ? 1 : 0);
    if (step) {
      garageT = 0;
      if (row.kind === 'campaign') { campaignSel = clamp(campaignSel + step, 0, campaignOpen(save.campaign)); cue('select'); }
      if (row.kind === 'quick') { const i = QUICK_MINUTES.indexOf(save.quickMinutes as typeof QUICK_MINUTES[number]); save.quickMinutes = QUICK_MINUTES[clamp(i + step, 0, QUICK_MINUTES.length - 1)]; cue('select'); persist(); }
      if (row.kind === 'intensity') { const o = offered(); intensity = o[clamp(o.indexOf(intensity) + step, 0, o.length - 1)]; cue('select'); persist(); }
    }
    if (p('y') && row.kind === 'quick') rerollQuick();
    // B starts the first row (the campaign level, or the next level on the clear screen; Endless again after Endless)
    rows = garageRows();
    if (p('b')) { if (garageAct(rows[0], false)) return; }
    if (p('a') || act) { garageT = 0; if (garageAct(rows[garageSel], true)) return; }
    if (garageBreather > 0) garageBreather = Math.max(0, garageBreather - dt);
    else if (ctx.bike().cadence3s > garageCadence()) garageT += dt;
    if (garageT >= garageAutostart()) garageAct(garageRows()[0], false);
  }
  function resetCombat() {
     inputEpoch++; workshopRevision++; discardEdges = true;
    lockId = 0; lockLeft = 0; lastPaddle = 0; padCursor = -1;
    leakDmg = 0; stallT = 0; escorts.length = 0;
  }
  function startRun() {
    if (!play) {
      if (opts?.level) useLevel(opts.level);
      else { useLevel(levelFor(nextEndlessMap())); save.endlessSeed++; }
    }
    lastEndless = !play; result = null;
    phase = 'run';
    save.runs++; stats.runs++;
    garageT = 0; garageBreather = 0;
    enemies = []; spawned.length = 0; shells = []; burns = []; fireballT = 0; schedule = []; fx = []; towers.fill(null);
    workshop = null; banner = null;
    weapon = 'gatling'; swapLeft = 0; swapTotal = 1; aim = 0; targetId = 0;
    revAcc = 0; railBank = 0; gearLevel = 0; gearRelief = 1;
    tier = clampTier(typeof opts?.tier === 'number' ? opts.tier : startTier());
    highTierS = 0; bossBelowV = false; radar = null; radarPeak = 1; botWeaponT = 0;
    flaming = false; flamePower = 0; grid = 0; overdrive = false;
    wavesSurvived = 0; runSpotless = 0; waveElapsed = 0; lull = 0; segOverAt = -1; miniTimer = 2;
    baseHurt = 99;
    resetCombat();
    trainerSync();
    baseMaxHp = baseHpMax(); baseHp = baseMaxHp; levelDmg = 0;
    wave = play ? 1 : Math.max(1, Math.round(opts?.startWave ?? 1));
    scrap = Math.round(startScrapT() + (wave - 1) * 35 + depth() * 20);
    lastRevs = ctx.bike().crankRevs;
    persist();
    cue('go');
    startWave(true);
    loading = loadGate && levelLoadMaxS() > 0; loadingS = 0;
  }

  /** Announces a boss's events and carries out its tricks. */
  function bossEvents(e: Enemy, events: ReadonlyArray<string>) {
    const b = e.boss!, name = BOSS_NAME[b.color];
    for (const event of events) {
      if (event === 'phaseAnnounced') {
        ctx.emit({ type: 'bossPhaseAnnounced', data: { wave, phase: b.phase + 2, color: b.color, weapon, countdownS: b.countdownS } });
        say(`Phase ${b.phase + 2} incoming`, `${BOSS_ESCALATION[b.color]} in ${Math.ceil(b.countdownS)}s`, '#ffd24a', true);
        cue('alarm');
      } else if (event === 'phaseStarted') {
        ctx.emit({ type: 'bossPhaseStarted', data: { wave, phase: b.phase + 1, color: b.color, weapon } });
        say(`Phase ${b.phase + 1} · ${name}`, BOSS_ESCALATION[b.color], '#ffd24a', true);
        addFx({ kind: 'hitStop', life: 0.1, seconds: 0.06 });
        cue('alarm');
      } else if (event === 'swarm') {
        const n = swarmPackFor(b, bossTricks());
        for (let i = 0; i < n; i++) escorts.push({ at: t + i * 0.25, from: e, offset: -1.5 - (i % 4) * 1.5, kind: 'mini' });
        ctx.emit({ type: 'bossSwarm', data: { wave, count: n } });
        cue('alarm');
      } else if (event === 'chargeWarn') {
        say(`${name} charging!`, `Charge in ${Math.ceil(b.warnS)}s · tier IV+ fire bogs it down`, '#ff6a5a', true);
        ctx.emit({ type: 'bossChargeWarn', data: { wave, seconds: b.warnS } });
        cue('alarm');
      } else if (event === 'charge') {
        ctx.emit({ type: 'bossCharge', data: { wave, seconds: b.chargeS } });
      } else if (event === 'shield') {
        say('Shield plates up', 'Tier IV+ Railgun pulses crack them', '#c694ff', true);
        ctx.emit({ type: 'bossShield', data: { wave, hp: Math.round(b.shieldMax) } });
        cue('alarm');
      } else if (event === 'shieldBroken') {
        say('Plates broken!', `${name} is open`, '#7dffb0');
        ctx.emit({ type: 'bossShieldBroken', data: { wave } });
        addFx({ kind: 'hitStop', life: 0.1, seconds: 0.05 });
      } else if (event === 'telegraph') {
        say('Boss opening soon', `Sprint in ${Math.ceil(b.windowLeftS)}s`, '#ffd24a', true);
        cue('alarm');
        ctx.emit({ type: 'bossTelegraph', data: { wave, seconds: b.windowLeftS } });
      } else if (event === 'exposed') {
        say('Exposed!', 'Double damage · sprint for another ×1.5', '#7dffb0', true);
        ctx.emit({ type: 'bossExposed', data: { wave, seconds: b.windowLeftS } });
      }
    }
  }
  function updateBosses(dt: number) {
    const timing = { phaseCountdownS: bossCountdown(), exposedEveryS: exposedEvery(), telegraphS: exposedTelegraph(), exposedS: exposedS() };
    for (const e of enemies) {
      if (e.dead || !e.boss) continue;
      bossEvents(e, advanceBoss(e.boss, dt, e.hp / e.maxHp, timing, bossTricks(), e.maxHp));
    }
    while (escorts.length && escorts[0].at <= t) {
      const escort = escorts.shift()!;
      // A dying boss still sent these escorts; changing waves or ending a run cancels them.
      spawnAt(escort.kind, escort.from, escort.offset);
    }
  }

  // ---------- run ----------
  function runUpdate(dt: number, inp: Readonly<InputState>) {
    const bike = ctx.bike();
    const p = (b: Button) => inp.pressed.has(b);

    const epoch = inputEpoch, hadWorkshop = !!workshop;
    const commands = pending.splice(0);
    // Both adapters enter this queue. One command owns a purchase per tick. Y / B / Z mount a weapon in or out of
    // the build menu (the turret keeps fighting while you build); A opens the menu at the pad cursor, or confirms in it.
    if (p('a')) commands.push({ type: hadWorkshop ? 'confirm' : 'construct', epoch });
    for (const [b, w] of WEAPON_BUTTONS) if (p(b)) commands.push({ type: 'weapon', weapon: w, epoch });
    // Shifters (either hood) and the touch stepper pick the intensity tier; the gearbox follows.
    let shift = (['shiftUpL', 'shiftUpR'] as const).filter(p).length - (['shiftDnL', 'shiftDnR'] as const).filter(p).length;
    let menuHandled = hadWorkshop, purchased = false, mounted = false;
    for (const a of commands) {
      if (a.type === 'tierUp' || a.type === 'tierDown') { if (a.epoch == null || a.epoch === inputEpoch) shift += a.type === 'tierUp' ? 1 : -1; continue; }
      if (a.type === 'bail') { endRun('bail'); return; }
      if (a.epoch != null && a.epoch !== inputEpoch) continue;
      if (a.type === 'weapon') {
        if (!mounted && WEAPONS.includes(a.weapon as Weapon)) { mounted = true; selectWeapon(a.weapon as Weapon); }
      } else if (a.type === 'pad' && Number.isInteger(a.pad) && (a.pad as number) >= -1 && (a.pad as number) <= BASE_PAD) {
        menuHandled = true;
        if (workshop && workshop.pad === a.pad) closeWorkshop();
        else openWorkshop((a.pad as number) < 0 ? undefined : a.pad as number);
      } else if (a.type === 'close') { menuHandled = true; closeWorkshop(); }
      else if ((a.type === 'row' || a.type === 'confirm') && workshop && !purchased) {
        if (a.revision != null && a.revision !== workshopRevision) continue;
        if (a.pad != null && a.pad !== workshop.pad) continue;
        if (a.type === 'row' && (!Number.isInteger(a.row) || (a.row as number) < 0 || (a.row as number) > workshopRows(workshop.pad).length)) continue;
        workshop.idle = 0; workshopAct(a.type === 'row' ? a.row as number : undefined);
        menuHandled = true; purchased = true;
      } else if (a.type === 'construct' && !workshop && !purchased) {
        purchased = true; openWorkshop(cursorPad()); menuHandled = true;
      } else if (a.type === 'inputCancel') menuHandled = true;
    }
    if (opts?.tier === 'auto' || (opts?.tier == null && autopilot)) shift = riderTier(bike.ftpFraction, ratedFtp) - tier;
    if (shift) {
      const next = clampTier(tier + shift);
      if (next !== tier) { tier = next; cue('select'); ctx.emit({ type: 'tierChanged', data: { tier } }); }
    }
    // The D-pad walks the build menu while it is open, and the pad cursor over the field otherwise.
    const dir = p('left') ? 'left' : p('right') ? 'right' : p('up') ? 'up' : p('down') ? 'down' : null;
    if (hadWorkshop && workshop) {
      workshop.idle += dt;
      if (inp.pressed.size) workshop.idle = 0;
      if (dir) {
        const next = menuStep(workshop.row, workshopRows(workshop.pad).length, dir);
        if (next !== workshop.row) { workshop.row = next; workshopRevision++; cue('select'); }
      }
      if (workshop.idle >= WORKSHOP_IDLE_S) closeWorkshop();
    } else if (!menuHandled && dir) {
      const next = padStep(cursorPad(), dir);
      if (next !== padCursor) { padCursor = next; cue('select'); } else cue('deny');
    }
    // paddles step a target lock (left = closer, right = further), once per press; holding one keeps the lock alive
    const pd = inp.paddleR - inp.paddleL, paddle = !autopilot && Math.abs(pd) >= 0.5 ? Math.sign(pd) : 0;
    if (paddle && paddle !== lastPaddle && !workshop) stepLock(paddle < 0 ? -1 : 1);
    else if (paddle && lockId) lockLeft = lockS();
    lastPaddle = paddle;
    lockLeft = Math.max(0, lockLeft - dt);
    if (lockId && !enemies.some(e => e.id === lockId && !e.dead)) { lockId = 0; lockLeft = 0; }
    grid = bike.cadence3s < 15 ? 0 : clamp(bike.ftpFraction / towerNominal(), 0, towerMaxBoost());
    if (swapLeft > 0) swapLeft = Math.max(0, swapLeft - dt);
    weaponSeconds[weapon] += dt;
    // learn how hard this trainer's brake is from the watts the rider makes at the level we set
    if (bike.trainerMode === 'resistance') {
      gearSteadyS = Math.abs(gearLevel - gearLevelPrev) < 1.5 ? gearSteadyS + dt : 0;
      if (gearSteadyS === 0) gearLevelPrev = gearLevel;
      if (gearRelief >= 0.999 && canObserve(gearLevel, bike.cadence3s, bike.ftpFraction, gearSteadyS)) gearK = observeK(gearK, gearK0(), gearLevel, bike.cadence3s, bike.ftpFraction, dt, gearTuning());
    } else gearSteadyS = 0;
    // spiral guard: a bogged-down rider gets the brake eased until they spin back up
    const relief = gearReliefRpm(), floor = gearReliefFloor();
    if (relief <= 0) gearRelief = 1;
    else if (bike.cadence3s >= 15 && bike.cadence3s < relief) gearRelief = Math.max(floor, gearRelief - dt * 0.5);
    else if (bike.cadence3s >= relief + 10) gearRelief = Math.min(1, gearRelief + dt * (1 - floor) / 8);

    // --- dynamo: grid power, overdrive, rail charge
    grid = clamp(bike.ftpFraction / towerNominal(), 0, towerMaxBoost());
    if (bike.cadence3s < 15) grid = 0;
    // a stalled dynamo drops the base's shields: leaks hit harder until the rider pedals again
    const wasStalled = stalled();
    stallT = bike.cadence3s < 15 ? stallT + dt : 0;
    if (stalled() && !wasStalled) { say('Dynamo stalled!', `Shields down: leaks hit x${+stallMult().toFixed(1)} · pedal!`, '#ff6a5a', true); cue('alarm'); }
    const wasOd = overdrive;
    overdrive = bike.sprinting;
    if (overdrive) stats.overdriveS += dt;
    if (overdrive && !wasOd) { cue('overdrive'); ctx.emit({ type: 'overdrive' }); }
    // The opening lasts a few seconds and the boss often dies before it; a sprint that lands inside it is the answer.
    if (overdrive) for (const e of enemies) if (!e.dead && e.boss?.exposed) { exposedSprinted = true; exposedBossIds.add(e.id); }
    // the Railgun banks watts while mounted; a pulse costs the tier's rated watts for railPulseS
    if (weapon === 'rail' && bike.cadence3s >= 15) {
      const was = railBank < railCost();
      railBank = Math.min(railCost(), railBank + bike.ftpFraction * dt);
      if (was && railBank >= railCost()) cue('railReady');
    }

    if (tier >= 4 && bike.cadence3s >= 15) highTierS += dt;
    if (tier < 5 && enemies.some((e) => !e.dead && e.boss)) bossBelowV = true;
    if (autoWeapon) botWeapon(dt);

    // --- aim: always automatic
    const tgt = autoTarget();
    targetId = tgt?.id ?? 0;
    if (tgt) {
      const d = tgt.angle - aim, step = turnRate() * dt;
      aim = Math.abs(d) <= step ? tgt.angle : aim + Math.sign(d) * step;
    }

    updateBosses(dt);

    // --- firing
    flaming = false; flamePower = 0;
    const ready = swapLeft <= 0;
    const revs = bike.crankRevs - lastRevs; lastRevs = bike.crankRevs;
    if (weapon === 'gatling' && ready) {
      // cadence sets the rate (crank revs per pellet); the tier sets pellet size: damage, pierce and splash
      revAcc += Math.max(0, revs);
      let shots = 0;
      const perShot = gatlingRevs(), shape = gatlingShape(tier);
      const dmg = gatlingDmg() * shape.dmg * effortK() * odMult();
      while (revAcc >= perShot && shots < 12) {
        revAcc -= perShot; shots++;
        const e = nearestInCone(aim, 0.1, turretRange());
        const end = e ? { x: e.x, y: e.y } : { x: BASE_X + Math.sin(aim) * 110, y: BASE_Y - Math.cos(aim) * 110 };
        if (e) {
          hit(e, dmg, 'blue');
          // a big pellet carries on through small aliens behind the first, and bursts on impact
          if (shape.pierce > 1) {
            const live = enemies.filter((o) => !o.dead && o !== e && !KINDS[o.kind].heavy && o.dist > e.dist);
            for (const i of beamHits(live.map((o) => ({ x: o.x, y: o.y, r: radiusOf(o) })), BASE_X, BASE_Y, aim, 1.2, turretRange(), shape.pierce - 1)) hit(live[i], dmg * 0.7, 'blue');
          }
          if (shape.splash > 0) for (const o of enemies) if (!o.dead && o !== e && Math.hypot(o.x - e.x, o.y - e.y) <= shape.splash + radiusOf(o)) hit(o, dmg * 0.5, 'blue');
        }
        addFx({ kind: 'tracer', life: 0.1, x0: BASE_X + Math.sin(aim) * 7 * geo.deckScale, y0: BASE_Y - Math.cos(aim) * 7 * geo.deckScale, x1: end.x, y1: end.y, hit: !!e });
      }
      if (shots) cue('shoot');
    } else if (weapon === 'flame' && ready && bike.power3s > 5) {
      // Watts set each fireball's damage, cadence its beat, the tier its size and how long the ground burns.
      flaming = true;
      flamePower = clamp(bike.power3s / (ctx.profile.ftp || 200), 0, 1.5);
      fireballT -= dt;
      if (fireballT <= 0 && tgt && tgt.route < 0 && angDiff(tgt.angle, aim) < 0.25) {
        const period = fireballPeriodAt(fireballPeriod(), bike.cadence3s, gearRefRpm());
        fireballT = period;
        lobFireball(tgt, bike.power3s * flameDpw() * odMult() * Math.min(1, effortK()) * period);
      }
    }
    updateFireballs(dt);

    // the Railgun fires a slow pulse once it has banked enough, along the aim at whatever is lined up
    railCooldown = Math.max(0, railCooldown - dt);
    if (weapon === 'rail' && ready && railCooldown <= 0 && tgt && angDiff(tgt.angle, aim) < 0.08 && tgt.dist <= turretRange() + radiusOf(tgt)) fireRail();

    updateTowers(dt);

    // --- enemies move / hit the base
    for (const e of enemies) {
      if (e.dead) continue;
      e.hurt = Math.max(0, e.hurt - dt); e.dazed = Math.max(0, e.dazed - dt);
      e.charging = e.boss ? e.boss.chargeS > 0 : e.kind === 'charger' && e.d / e.len > 0.5;
      e.d += travelSpeed(e) * dt;
      place(e);
      if (e.kind === 'carrier') { e.spawnT -= dt; if (e.spawnT <= 0) { e.spawnT = 6; spawnAt('mini', e, 1.5); spawnAt('mini', e, -1.5); } }
      if (e.d >= e.len - BASE_R) {
        e.dead = true;
        const dmg = e.dmg * (stalled() ? stallMult() : 1);
        baseHp -= dmg; baseHurt = 0; leakDmg += dmg; levelDmg += dmg;
        addFx({ kind: 'baseHit', life: 0.5, dmg });
        cue(dmg >= 5 ? 'baseHitHeavy' : 'baseHit');
        ctx.emit({ type: 'baseHit', data: { dmg, kind: e.kind } });
      }
    }
    baseHurt += dt;
    if (spawned.length) { enemies.push(...spawned.filter((e) => !e.dead)); spawned.length = 0; }
    enemies = enemies.filter((e) => !e.dead);

    // --- spawning: the drone stream never stops once the flow starts (half rate in troughs)
    if (lull > 0) {
      lull = Math.max(0, lull - dt); if (lull === 0) beginWave();
    }
    else {
      waveElapsed += dt;
      if (segOverAt < 0) miniTimer -= dt;
      // the road entrance stays clear while the boss walks out of it
      const bossNear = (lane: number | undefined) => enemies.some((e) => !e.dead && e.boss && e.d < bossClearD() && (lane === undefined || e.lane === lane));
      if (miniTimer <= 0 && bossNear(undefined)) miniTimer = 0.5;
      if (miniTimer <= 0) {
        spawn('mini', -1);
        miniTimer = miniGap() * (0.7 + swarmRng() * 0.6);
      }
      while (schedule.length && schedule[0].at <= waveElapsed && !(schedule[0].route < 0 && schedule[0].kind !== 'boss' && bossNear(schedule[0].lane))) { const s = schedule.shift()!; spawn(s.kind, s.route, 0, s.route < 0 ? s.lane : undefined); }
    }
    if (spawned.length) { enemies.push(...spawned); spawned.length = 0; }
    trainerSync(dt);

    // --- the flow: a segment ends on time (a boss peak: when its boss dies) and the next rolls in; the level's
    // last segment then waits for its field to clear (or segmentTail more seconds) before the level is done
    // a boss still alive when its peak runs out breaks through: it hits the base and leaves
    if (baseHp > 0 && lull <= 0 && plan?.boss && waveElapsed >= bossPeakMaxS()) for (const e of enemies) if (!e.dead && e.boss) {
      e.dead = true;
      const dmg = e.dmg;
      baseHp -= dmg; baseHurt = 0; leakDmg += dmg; levelDmg += dmg;
      addFx({ kind: 'baseHit', life: 0.5, dmg });
      say(`${BOSS_NAME[e.boss.color]} broke through!`, `−${dmg} base · ride harder next peak`, '#ff6a5a', true);
      cue('baseHitHeavy');
      ctx.emit({ type: 'baseHit', data: { dmg, kind: 'boss' } });
      ctx.emit({ type: 'bossEscaped', data: { wave, color: e.boss.color, hpLeft: Math.round(e.hp / e.maxHp * 100) / 100 } });
    }
    if (baseHp > 0 && lull <= 0 && segmentDone()) {
      if (!play || wave < play.waves.length) clearWave();
      else {
        if (segOverAt < 0) { segOverAt = waveElapsed; schedule = []; }
        const fieldClear = enemies.length === 0 && escorts.length === 0;
        if (fieldClear || waveElapsed - segOverAt >= 45) clearWave();
      }
    }
    // the radar is a 10 s-bucket picture: four refreshes a second are plenty
    radarAge += dt;
    if (phase !== 'run' || !plan) radar = null;
    else if (!radar || radarAge >= 0.25) { radar = radarView(radarAge); radarAge = 0; }

    if (baseHp <= 0) { baseHp = 0; endRun('fell'); }
  }

  /** effortK as of the last update, for the snapshot (which must not read the bike). */
  let tierOutput = 1;
  function update(dt: Seconds) {
    tierOutput = effortK();
    if (!started) {
      started = true; lastRevs = ctx.bike().crankRevs;
      const pl = opts?.play;
      if (pl) startLevel('campaign' in pl ? CAMPAIGN[clamp(pl.campaign, 0, CAMPAIGN.length - 1)] : quickRide(pl.quick.seed, pl.quick.minutes));
      else if (opts?.skipGarage || autopilot) startRun();
    }
    if (phase === 'run' && loading) { // waiting for the renderer: the level holds still, the trainer stays neutral
      loadingS += dt; pending.length = 0; discardEdges = true; lastRevs = ctx.bike().crankRevs;
      ctx.resistance.set({ id: 'weapon', mode: 'sim', gradePct: 0 });
      if (loadingS >= levelLoadMaxS()) { loading = false; trainerSync(); }
      ctx.debug('phase', 'loading');
      return;
    }
    t += dt;
    const rawInput = ctx.input();
    const inp = discardEdges ? { ...rawInput, pressed: new Set<Button>(), released: new Set<Button>() } : rawInput;
    discardEdges = false;
    if (phase === 'garage') garageUpdate(dt, inp);
    else runUpdate(dt, inp);
    fx = fx.filter((f) => t - f.t0 < f.life);
    if (banner && t - banner.t0 > 4) banner = null;

    ctx.debug('phase', phase);
    ctx.debug('wave', wave);
    ctx.debug('baseHp', Math.round(baseHp));
    ctx.debug('scrap', scrap);
    ctx.debug('grid', +grid.toFixed(2));
    for (const w of WEAPONS) ctx.debug(`dealt_${w}`, Math.round(dealtW[w]));
    ctx.debug('tier', tier); ctx.debug('gearLevel', +gearLevel.toFixed(1)); ctx.debug('gearK', +gearK.toFixed(4)); ctx.debug('railBank', +(railBank / Math.max(1e-6, railCost())).toFixed(2));
    ctx.debug('enemies', enemies.length);
  }

  function persist() {
    bankKills();
    if (phase === 'run' && !play) save.endlessBest = Math.max(save.endlessBest, wave - 1);
    save.intensity = intensity;
    ctx.save({ ...save, totals: { ...save.totals }, campaign: { ...save.campaign } });
  }
  /** Endless best so far, counting the run in progress. */
  const bestWave = () => Math.max(save.endlessBest, phase === 'run' && !play ? wave - 1 : 0);
  let killsBanked = 0;
  function bankKills() { const k = kills.blue + kills.red + kills.purple + kills.gold; save.totals.kills += k - killsBanked; killsBanked = k; }

  // ---------- views ----------
  /** In a run the shifters pick the intensity tier (the game is the gearbox); in the menus they are plain gears. */
  const gearHints = (run = phase === 'run'): ControlHint[] => run
    ? [{ button: 'shiftersL', label: `Tier ${roman(tier)}`, shortLabel: 'Tier' }, { button: 'shiftersR', label: `Tier ${roman(tier)}`, shortLabel: 'Tier' }]
    : [{ button: 'shiftersL', label: 'Gear', active: true }, { button: 'shiftersR', label: 'Gear', active: true }];
  /** Y / B / Z chips: which weapon is mounted, and the mount in progress (the turret is silent until it lands). */
  const weaponHints = (): ControlHint[] => WEAPON_BUTTONS.map(([button, w], i): ControlHint => {
    const on = weapon === w, mounting = on && swapLeft > 0;
    return { button, label: `Mount the ${WEAPON_NAME[w]}`, shortLabel: WEAPON_NAME[w], displayOrder: i, active: !on || mounting,
      touch: { down: { type: 'weapon', weapon: w, epoch: inputEpoch } },
      indicator: { label: WEAPON_NAME[w], status: mounting ? 'Mounting' : on ? 'Mounted' : '', ready: on && !mounting, ...(mounting ? { fill: 1 - swapLeft / swapTotal } : {}) } };
  });
  const playControls = (): ControlHint[] => [
    ...weaponHints(),
    { button: 'a', label: 'Build menu at the selected pad', shortLabel: 'Build', touch: { down: { type: 'construct', epoch: inputEpoch } } },
    { button: 'dpad', label: 'Select a pad', shortLabel: 'Pad' },
    { button: 'paddles', label: 'Step target', shortLabel: 'Target' }, ...gearHints(true),
  ];
  function enemyView(e: Enemy): EnemyView {
    const el = elementOf(e), si = shiftIn(e);
    const shifting = e.kind === 'prism';
    return {
      id: e.id, kind: e.kind, route: e.route, lane: e.lane, flying: e.route >= 0, x: e.x, y: e.y, angle: e.angle, dist: e.dist, radius: radiusOf(e),
      element: el, gold: e.kind === 'boss', hp: e.hp, maxHp: e.maxHp, hurt: e.hurt, charging: e.charging,
      shiftIn: si, next: shifting ? ELEMENTS[(ELEMENTS.indexOf(el) + 1) % 3] : null, progress: e.d / e.len,
      shield: e.boss && e.boss.shieldMax > 0 ? e.boss.shield / e.boss.shieldMax : 0,
      bossPhase: e.boss ? e.boss.phase + 1 : 0, telegraph: !!e.boss?.telegraph && !e.boss?.pending, exposed: !!e.boss?.exposed && !e.boss?.pending, staggerS: e.boss?.staggerS ?? 0,
      hitT: e.hitT, hitCls: e.hitCls, hitDmg: e.hitDmg, ...(e.dazed > 0 ? { dazed: e.dazed } : {}),
    };
  }
  function bossView(): BossView | null {
    if (phase !== 'run') return null;
    const e = enemies.find((e) => !e.dead && e.boss);
    if (e?.boss) {
      const b = e.boss, color = b.color;
      return { id: e.id, name: BOSS_NAME[color], phase: b.phase + 1, phaseCount: b.phases, color, weapon: ELEMENT_WEAPON[color],
        pending: b.pending, countdownS: b.countdownS, charge: b.chargeS > 0 ? 'on' : b.warnS > 0 ? 'warn' : null,
        shield: b.shieldMax > 0 ? b.shield / b.shieldMax : 0, hp: Math.max(0, e.hp / e.maxHp), escapeS: plan?.boss ? Math.max(0, bossPeakMaxS() - waveElapsed) : 0,
        telegraph: b.telegraph && !b.pending, exposed: b.exposed && !b.pending, windowLeftS: b.windowLeftS, sprintBoost: false };
    }
    if (plan?.boss && (lull > 0 || schedule.some((s) => s.kind === 'boss'))) {
      return { id: 0, name: BOSS_NAME[plan.brood], phase: 1, phaseCount: Math.max(2, Math.min(3, Math.round(bossPhases()))), color: plan.brood,
        weapon: ELEMENT_WEAPON[plan.brood], pending: false, charge: null, shield: 0, hp: 1, escapeS: bossPeakMaxS() - waveElapsed + lull, countdownS: lull, telegraph: false, exposed: false, windowLeftS: 0, sprintBoost: false };
    }
    return null;
  }
  function broodView(): BroodView {
    const b = plan ? broodInfo({ ...plan, brood: WEAPON_ELEMENT[weapon] }) : { wave, color: WEAPON_ELEMENT[weapon], weapon, mode: 'sim' as const, setting: '', cue: '' };
    return { ...b, countdownS: phase === 'run' ? lull : 0, lullS: lullLen, rampS: 0 };
  }
  function garageView(): GarageView {
    const title = result ? (result.failed ? `${result.spec.name} · base fell` : `${result.spec.name} cleared · ${starText(result.stars)}`) : 'Choose a ride';
    const subtitle = result ? (result.failed ? 'No stars this time' : chain > 1 ? `${chain} levels in a row` : 'Next level or finish') : `Campaign ${Object.keys(save.campaign).length}/${CAMPAIGN.length} cleared · ${stars()}★ · Endless best wave ${save.endlessBest}`;
    const open = campaignOpen(save.campaign);
    const levels = CAMPAIGN.map((c, i): LevelTile => ({ ...TILE_INFO[i], stars: save.campaign[c.id] ?? 0, locked: i > open }));
    const page = result ? 'modes' : menuPage;
    const nextUp = result ? (result.failed ? result.spec : nextSpec(result.spec)) : null;
    return { title: page === 'campaign' ? 'Campaign' : title, subtitle: page === 'campaign' ? `${Object.values(save.campaign).filter((v) => v > 0).length}/${CAMPAIGN.length} cleared · ${stars()}★` : subtitle,
      breatherLeft: garageBreather, sel: garageSel, rows: garageRows(), autoLeft: garageAutostart() - garageT, autoS: garageAutostart(), stars: stars(), endlessBest: save.endlessBest, runs: save.runs,
      page, levels, levelSel, open, campaignSel, ...(nextUp ? { nextMap: { seed: nextUp.seed, roadStyle: nextUp.roadStyle, ground: nextUp.ground, pads: nextUp.pads } } : {}) };
  }
  function workshopView(): WorkshopView | null {
    if (!workshop) return null;
    return { pad: workshop.pad, row: workshop.row, rows: workshopRows(workshop.pad), idleLeft: WORKSHOP_IDLE_S - workshop.idle, revision: workshopRevision };
  }

  return {
    update,
    isOver: () => false,
    menuActions: () => phase === 'run' ? [{ id: 'garage', label: play ? 'Quit level · back to the level select' : 'End the run · back to the ride select', action: { type: 'bail' } }] : [],
    inMenu: () => phase === 'garage' && (started || !(opts?.skipGarage || autopilot)),
    receive(action: unknown) {
      const a = action as { type?: unknown } | null;
      if (a?.type === 'padOrder') { padsTurned = (a as { turned?: unknown }).turned === true; return; }
      if (a?.type === 'loadGate') { loadGate = true; return; }
      if (a?.type === 'levelReady') { loading = false; return; }
      if (a?.type === 'inputCancel') { pending.length = 0; inputEpoch++; discardEdges = true; return; }
      if (a && typeof a.type === 'string' && pending.length < 32) pending.push({ ...a } as { type: string });
    },
    hud(): GameHud {
      if (phase === 'garage' && (started || !(opts?.skipGarage || autopilot))) return {
        gears: true, targetZone: { min: 2, max: 2, label: 'Warm up' },
        controls: [{ button: 'dpad', label: 'Choose' }, { button: 'a', label: 'Buy / start', shortLabel: 'Buy' }, { button: 'b', label: 'Start run', shortLabel: 'Start' }, ...gearHints()],
        playControls: playControls(),
      };
      if (phase === 'run' && loading) return { gears: true, targetZone: { min: 1, max: 2, label: 'Preparing the level' }, controls: [] };
      const boss = bossView();
      const powerZone = (ftp: number): 1 | 2 | 3 | 4 | 5 => ftp < 0.56 ? 1 : ftp < 0.76 ? 2 : ftp < 0.91 ? 3 : ftp < 1.06 ? 4 : 5;
      const want = suggestedTier();
      const tz: GameHud['targetZone'] = boss?.exposed || boss?.telegraph
        ? { min: 5, max: 5, label: boss.exposed ? 'Exposed · sprint!' : `Sprint in ${Math.ceil(boss.windowLeftS)}s`, source: 'power' }
        : lull > 0 ? { min: 1, max: 2, label: `Get ready · tier ${roman(want)}` }
        : plan?.role === 'easy' ? { min: 1, max: 2, label: `${setView(wave).warmup ? 'Warm-up' : 'Trough'} · tier ${roman(want)}` }
        : { min: powerZone(ratedFtp(want)), max: powerZone(ratedFtp(want)), label: `Tier ${roman(want)} · you're on ${roman(tier)}`, source: 'power' };
      if (workshop) return {
        gears: false, targetZone: tz, touchControls: [],
        controls: [{ button: 'dpad', label: 'Choose an option or Exit', shortLabel: 'Choose' }, { button: 'a', label: 'Build / upgrade / Exit', shortLabel: 'OK' }, ...weaponHints().map((h) => ({ ...h, indicator: false as const })), ...gearHints()],
      };
      return { gears: false, targetZone: tz, touchControls: ['y', 'b', 'z'], controls: playControls() };
    },
    snapshot(): TdSnapshot {
      return {
        t, level, phase, garage: phase === 'garage' ? garageView() : null, nextMaps: nextMaps(), loading: phase === 'run' && loading,
        wave, waveElapsed, waveMaxS: plan ? plan.boss ? bossPeakMaxS() : segLen(plan.role) : segmentS(), wavesSurvived, lull,
        flow: phase === 'run' && plan ? { stage: stageOf(wave), set: setView(wave).set, sets: play ? play.waves.reduce((n, w) => Math.max(n, w.set), 0) : 0, leftS: segRemaining() } : null,
        radar: phase === 'run' ? radar : null,
        forecast: nextPlan ? { wave: nextPlan.wave, boss: nextPlan.boss, role: nextPlan.role, counts: { ...nextPlan.counts } }
          : { wave: 1, boss: false, role: 'work', counts: { blue: 0, red: 0, purple: 0, gold: 0, prism: 0, air: 0 } },
        set: setView(wave),
        run: play ? { id: play.spec.id, name: play.spec.name, kind: play.spec.kind, minutes: play.spec.minutes, waves: play.waves.length, estMinutes: estimateMinutes(play.waves) } : null,
        intensity,
        boss: bossView(), matchup: matchup(),
        brood: broodView(),
        baseHp, baseMaxHp, baseHurt,
        weapon, swapLeft, swapS: swapTotal,
        aimAngle: aim, targetId, lock: lock(),
        tier, tierCount: 5, suggestedTier: suggestedTier(), tierFtp: ratedFtp(tier), tierOutput,
        railCharges: railBank >= railCost() ? 1 : 0, railMaxCharges: 1, railProgress: Math.min(1, railBank / Math.max(1e-6, railCost())), railCharging: weapon === 'rail' && railBank < railCost(), zHold: 0, railDumpHoldS: 0.5,
        flaming, flameRange: flameRange(), flamePower, laserId: 0,
        grid, overdrive, stalled: stalled(),
        scrap,
        padCursor: phase === 'run' && !workshop ? cursorPad() : -1, inputEpoch,
        towers: towers.filter((x): x is Tower => !!x).map((x): TowerView => ({ pad: x.pad, kind: x.kind, level: x.level, angle: x.angle, charge: clamp(1 - x.cd / TOWERS[x.kind].period, 0, 1), firedAt: x.firedAt })),
        shells: shells.map((s): ShellView => ({ x0: s.x0, y0: s.y0, x1: s.x1, y1: s.y1, k: s.t / s.flight, r: s.r, ...(s.tower != null ? { tower: true } : {}) })),
        burns: burns.map((b): BurnView => ({ x: b.x, y: b.y, r: b.r, k: b.left / b.total })),
        workshop: workshopView(),
        enemies: enemies.map(enemyView), fx: fx.slice(), banner,
        cues: cues.slice(),
        over: false, bestWave: bestWave(), kills: { ...kills },
        hooks: { storm: false, surge: false, powerFtp: ratedFtp(suggestedTier()), shielded: bossView()?.exposed ?? false },
      };
    },
    summary() {
      return {
        wavesSurvived: bestRunWaves, wavesCleared, runs: stats.runs, runsFallen: stats.runsFallen, runsBailed: stats.runsBailed,
        kills_blue: kills.blue, kills_red: kills.red, kills_purple: kills.purple, kills_gold: kills.gold,
        weaponSeconds_gatling: Math.round(weaponSeconds.gatling),
        weaponSeconds_flame: Math.round(weaponSeconds.flame),
        weaponSeconds_rail: Math.round(weaponSeconds.rail),
        railChargesFired: railFired,
        baseHpLeft: Math.round(baseHp),
        towersBuilt: stats.towersBuilt, towerUpgrades: stats.towerUpgrades, towerKills: stats.towerKills, turretKills: stats.turretKills,
        turretDamage: Math.round(dealt.player), towerDamage: Math.round(dealt.tower),
        scrapEarned: stats.scrapEarned,
        weaponSwitches, highTierSeconds: Math.round(highTierS),
        ignitionBursts: stats.ignitionBursts, bestChain, bestMaxedTowers,
        strongKills, exposedSprinted: exposedSprinted ? 1 : 0,
        spotlessWaves, bestRunSpotless,
        bossesKilled: stats.bosses,
        overdriveSeconds: Math.round(stats.overdriveS),
        // the save's campaign as the ride ends (achievements take the max, so each level counts once)
        campaignCleared: Object.values(save.campaign).filter((v) => v > 0).length,
        campaignThreeStars: Object.values(save.campaign).filter((v) => v >= 3).length,
        campaignStars: starTotal(save.campaign), endlessBest: save.endlessBest,
        bossColors: save.bossColors.length, roadStyles: save.roadsCleared.length, levelsCleared: stats.levelsCleared,
      };
    },
    dispose() { persist(); },
  };
}
