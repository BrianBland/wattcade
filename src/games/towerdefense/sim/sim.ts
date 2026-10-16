// Dynamo Defense sim: pure logic, deterministic (ctx.rng + fixed dt only).
// Your pedalling is the base's dynamo: crank revs feed the Gatling, watts feed the Flame and the towers,
// sustained threshold power charges the Railgun, sprints trigger Overdrive and Power Surges fire an EMP.
import type { Button, ControlHint, GameContext, GameHud, GameSim, InputState, Seconds } from '../../../contracts';
import { completeCooldown, effortFlourish, effortTint, isReady, readyFrac, refillRate, startCooldown, tickCooldown } from '../../../core/cooldown';
import { suggestBuild, type BuildSuggestion } from './construction';
import {
  AIM_LIMIT, BASE_R, BASE_X, BASE_Y, ELEMENTS, ELEMENT_WEAPON, KINDS, LANE_NAMES, LEVEL_DMG, LEVEL_RANGE, MATCHUP, PADS,
  TOWERS, TOWER_KINDS, TOWER_MAX_LEVEL, WEAPON_ELEMENT, WEAPON_NAME, WEAPONS, angleTo, distTo, laneAt, laneLength, towerBuildCost, towerUpgradeCost,
  type Element, type Matchup, type Kind, type TowerKind, type Weapon,
} from './defs';
import { advanceBoss, bossColors, bossHpFloor, createBossState, type BossState } from './boss';
import { effortMet, scheduleCall, type EffortView } from './efforts';
import { UPGRADES, autoInvest, lvl, metaMods, partsForWave, upgradeCost, type Levels, type MetaMods } from './meta';
import { chooseTarget, type Nudge, type TargetCand } from './targeting';
import { clearHealFor, nextBrood, planWave, type Spawn, type WavePlan } from './waves';
import type { ActionId, ActionView, Banner, BossView, BroodInfo, BroodView, EnemyView, Fx, GarageRow, GarageView, ShellView, SpinView, SurgeView, TdSnapshot, TowerView, WorkshopRow, WorkshopView } from './types';

export * from './defs';
export type { TdSnapshot } from './types';

export interface TdOpts {
  autopilot?: boolean;
  /** Headless actions are separate from Auto-crew; default off. */
  actionBot?: boolean;
  autoCrew?: boolean;
  /** Go straight into the first run (tests); also done for new riders and autopilot. Later runs always use the Garage. */
  skipGarage?: boolean;
  /** Override the `baseHp` tunable (the deep-wave fixture reinforces the base). */
  baseHp?: number;
}
export interface TdSave {
  v: 3; bestWave: number; bank: number; upgrades: Levels; runs: number; autoInvest: boolean; autoCrew: boolean;
  totals: { waves: number; kills: number; bosses: number; towers: number; surges: number; runsFallen: number; runsBailed: number };
}
/** Read legacy best-wave-only, v2 and v3 saves. Retired core fields are dropped; missing totals start at zero. */
export function readSave(raw: unknown): TdSave {
  const s = (raw ?? {}) as Partial<TdSave> & { totals?: Partial<TdSave['totals']> & { coresLost?: number } };
  const { coresLost: _coresLost, ...totals } = s.totals ?? {};
  return {
    v: 3, bestWave: s.bestWave ?? 0, bank: s.bank ?? 0, upgrades: { ...(s.upgrades ?? {}) }, runs: s.runs ?? 0,
    autoInvest: s.autoInvest ?? false,
    autoCrew: typeof s.autoCrew === 'boolean' ? s.autoCrew : true,
    totals: { waves: 0, kills: 0, bosses: 0, towers: 0, surges: 0, runsFallen: 0, runsBailed: 0, ...totals },
  };
}

interface Enemy {
  id: number; kind: Kind; lane: number; d: number; len: number; off: number; phase: number;
  x: number; y: number; angle: number; dist: number;
  hp: number; maxHp: number; speed: number; dmg: number; dead: boolean; hurt: number;
  /** element of the last hit (for death effects: a fire kill bursts a red alien) */ lastEl: Element | null;
  spawnT: number; charging: boolean; boss: BossState | null;
}
interface Tower { pad: number; kind: TowerKind; level: number; cd: number; angle: number; firedAt: number }
interface Shell { x0: number; y0: number; x1: number; y1: number; t: number; flight: number; dmg: number; r: number }

const WORKSHOP_IDLE_S = 10;
const REPAIR_HP = 25;
/** Pads in screen order (left to right), then the base (index 6 = repair). */
const PAD_ORDER = [...PADS].sort((a, b) => a.x - b.x).map((p) => p.id).concat(6);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const angDiff = (a: number, b: number) => Math.abs(a - b);
type NewFx = Fx extends infer F ? (F extends Fx ? Omit<F, 'id' | 't0'> : never) : never;

export function createTdSim(ctx: GameContext, opts?: TdOpts): GameSim & { snapshot(): TdSnapshot } {
  const T = ctx.tuning;
  // weapons (spec)
  const gatlingRevs = T.num('gatlingRevsPerShot', 0.25, 0.05, 2, 0.05, 'crank revs per Gatling bullet');
  const gatlingDmg = T.num('gatlingDamage', 30, 0.5, 60, 0.5);
  const gatlingGrade = T.num('gatlingGradePct', 1, 0, 6, 0.5, 'sim-mode grade while Gatling selected');
  const flameLevel = T.num('flameLevelPct', 35, 0, 100, 1, 'resistance level while Flame selected');
  const flameDpw = T.num('flameDpsPerWatt', 1.5, 0.02, 3, 0.01, 'flame dps per watt (power3s)');
  const flameRange = T.num('flameRange', 45, 10, 90, 1);
  const flameHalf = T.num('flameHalfAngle', 0.3, 0.1, 1, 0.05);
  const railFtp = T.num('railFtpFraction', 0.95, 0.5, 1.3, 0.01, 'ERG target while Rail selected');
  const railMinFtp = T.num('railMinFtp', 0.75, 0.3, 1.2, 0.01, 'ftpFraction needed to charge rail');
  const railPeriod = T.num('railChargeS', 20, 3, 120, 1, 'seconds per rail charge at 0.95 FTP');
  const railMax = T.num('railMaxCharges', 3, 1, 8, 1);
  const railDmg = T.num('railDamage', 110, 10, 1000, 5);
  const railWidth = T.num('railBeamWidth', 0.1, 0.02, 0.5, 0.01);
  const railDumpHold = T.num('railDumpHoldS', 0.5, 0.1, 2, 0.1);
  const railLaserDps = T.num('railLaserDps', 140, 0, 300, 1, 'targeting laser dps while Rail is selected (x ftpFraction / 0.95, max x1.5)');
  const swapS = T.num('swapS', 1.5, 0.1, 5, 0.1, 'seconds to mount the next brood\'s weapon');
  const turnRate = T.num('turretTurnRate', 6, 1, 20, 0.5, 'rad/s the turret slews toward its target');
  const nudgeS = T.num('nudgeS', 6, 1, 30, 0.5, 'seconds a lane nudge (paddles / D-pad left-right) lasts, decaying');
  const nudgeBias = T.num('nudgeBias', 4, 0, 20, 0.5, 'nudged lane threat x (1 + bias x remaining nudge)');
  const targetStick = T.num('targetStick', 0.6, 0, 1, 0.05, 'keep the current target while its lane threat >= this x the top lane');
  const match = Object.fromEntries(WEAPONS.map((w) => [w, Object.fromEntries(ELEMENTS.map((e) =>
    [e, T.num(`match_${w}_${e}`, MATCHUP[w][e], 0, 3, 0.05)]))])) as Record<Weapon, Record<Element, () => number>>;
  const matchup = (): Matchup => Object.fromEntries(WEAPONS.map((w) => [w,
    Object.fromEntries(ELEMENTS.map((e) => [e, match[w][e]()])),
  ])) as Matchup;
  const ignitionChance = T.num('ignitionChance', 0.6, 0, 1, 0.05);
  const ignitionRadius = T.num('ignitionRadius', 10, 1, 25, 1);
  const ignitionDamage = T.num('ignitionDamage', 20, 0, 100, 1);
  const ignitionCap = T.num('ignitionChainCap', 3, 0, 8, 1, 'maximum bursts in one ignition chain, including its first kill');
  // base, waves
  const baseHpMax = () => opts?.baseHp ?? T.num('baseHp', 100, 10, 1000, 5)();
  const garageAutostart = T.num('garageAutostartS', 30, 5, 120, 1, 'pedalling seconds before a run auto-starts');
  const garageCadence = T.num('garageCadenceRpm', 30, 15, 90, 1, 'cadence needed for Garage auto-start');
  const garageBreatherS = T.num('garageBreatherS', 6, 0, 30, 1, 'breather before the next auto-start countdown');
  const hpScale = T.num('hpScalePerWave', 0.06, 0, 1, 0.01);
  const hpScale2 = T.num('hpScaleQuad', 0.002, 0, 0.05, 0.001, 'extra HP per wave^2');
  const countScale = T.num('waveCountScale', 1, 0.3, 3, 0.1, 'heavy enemies per wave multiplier');
  const miniInterval = T.num('miniIntervalS', 1.6, 0.3, 6, 0.1);
  const waveMin = T.num('waveMinS', 25, 5, 120, 1);
  const waveMax = T.num('waveMaxS', 60, 15, 240, 1);
  const spawnWindow = T.num('heavySpawnWindowS', 20, 3, 60, 1);
  const lullS = T.num('lullS', 15, 0, 60, 1, 'recovery lull before each wave: brood card, countdown, no new spawns');
  const rampS = T.num('rampS', 6, 0, 30, 1, 'last seconds of the lull in which the next weapon\'s trainer setting ramps in');
  const lullGrade = T.num('lullGradePct', 0, -2, 4, 0.5, 'sim grade early in the lull (Gatling brood next)');
  const lullLevel = T.num('lullLevelPct', 10, 0, 100, 1, 'resistance level early in the lull (Flamer brood next)');
  const lullFtp = T.num('lullFtpFraction', 0.5, 0.3, 1, 0.05, 'ERG target early in the lull (Railgun brood next)');
  const broodShare = T.num('broodShare', 0.8, 0.34, 1, 0.05, 'share of a wave\'s heavies in its brood colour (the rest are for the towers)');
  const broodMaxRun = T.num('broodMaxRun', 2, 1, 5, 1, 'no brood colour more than N waves in a row');
  const swarmPack = T.num('swarmPackSize', 5, 1, 12, 1, 'blue slots are swarm packs of N darts or drones');
  const broodCover = T.num('broodCoverWaves', 4, 0, 8, 1, 'all three brood colours in every N waves (< 3 = off)');
  const bossPhases = T.num('bossPhases', 3, 2, 3, 1);
  const bossCountdown = T.num('bossPhaseCountdownS', 3, 1, 8, 0.5);
  const exposedEvery = T.num('bossExposedEveryS', 20, 8, 60, 1);
  const exposedTelegraph = T.num('bossTelegraphS', 3, 1, 6, 0.5);
  const exposedS = T.num('bossExposedS', 5, 1, 10, 0.5);
  const exposedMult = T.num('bossExposedMult', 2, 1, 4, 0.1);
  const exposedSprintMult = T.num('bossExposedSprintMult', 1.5, 1, 3, 0.1);
  const bossSprintFtp = T.num('bossSprintFtp', 1.35, 1.2, 1.6, 0.05, 'optional hold-Up ERG push during a Rail boss opening');
  const clearHeal = T.num('earlyClearHeal', 14, 0, 100, 1, 'base HP restored when a wave is cleared before its timeout');
  const speedHeal = T.num('speedClearHeal', 12, 0, 100, 1, 'extra heal for a fast clear: all of it at waveMinS, none at waveMaxS');
  const stallMult = T.num('stallDamageMult', 2.2, 1, 5, 0.1, 'leaks hit this much harder while the dynamo is stalled (shields down)');
  const stallGrace = T.num('stallGraceS', 3, 0, 15, 0.5, 'seconds under 15 rpm before the dynamo stalls (brief coasting is free)');
  const leakHealZero = T.num('leakHealZero', 15, 0, 200, 1, 'base damage taken in a wave that cancels its clear heal (scaled down linearly; 0 = any leak cancels it)');
  // dynamo: towers, overdrive, surges, economy
  const towerNominal = T.num('towerNominalFtp', 0.65, 0.2, 1.5, 0.05, 'ftpFraction at which towers fire at their rated speed');
  const towerMaxBoost = T.num('towerMaxBoost', 1.6, 1, 3, 0.1, 'cap on tower speed from extra watts');
  const towerDmgT = T.num('towerDamageMult', 0.9, 0.1, 5, 0.05, 'all tower damage x (turret vs tower damage share)');
  const teslaChain = T.num('teslaChain', 3, 1, 10, 1, 'Tesla chain targets at Lv 1');
  const teslaChainPerLv = T.num('teslaChainPerLevel', 0.5, 0, 2, 0.25, 'extra Tesla chain targets per level (floored)');
  const towerCostT = T.num('towerCostMult', 1, 0.2, 5, 0.05, 'all tower build/upgrade costs x');
  const overdriveMult = T.num('overdriveMult', 1.5, 1, 3, 0.1, 'damage / tower speed while sprinting');
  const callGapMin = T.num('callGapMinWaves', 2, 2, 8, 1);
  const callGapMax = T.num('callGapMaxWaves', 3, 2, 10, 1);
  const callCountdown = T.num('callCountdownS', 5, 1, 10, 0.5);
  const callNeed = T.num('callNeedS', 8, 3, 30, 1);
  const callWindow = T.num('callWindowS', 18, 8, 60, 1);
  const callSpinRatio = T.num('callSpinCadenceRatio', 0.97, 0.85, 1.2, 0.01, 'spin floor relative to recent cadence');
  const callGrindRatio = T.num('callGrindCadenceRatio', 0.9, 0.6, 1, 0.01, 'grind ceiling relative to recent cadence');
  const callPowerRatio = T.num('callPowerRatio', 0.95, 0.8, 1.2, 0.01);
  const callHoldBand = T.num('callHoldBand', 0.08, 0.03, 0.2, 0.01);
  const overclockS = T.num('overclockS', 30, 5, 120, 5, 'Gatling Overclock (double fire rate) after a Spin-up');
  const empDmg = T.num('empDamage', 90, 0, 1000, 5, 'EMP damage to every enemy when a surge is won');
  const startScrapT = T.num('startScrap', 60, 0, 1000, 10);
  const scrapScale = T.num('scrapMult', 1, 0.2, 5, 0.1);
  const partsScale = T.num('partsMult', 1, 0.2, 5, 0.1, 'garage parts earned multiplier');
  const overchargeS = T.num('overchargeS', 10, 1, 30, 1);
  const overchargeMult = T.num('overchargeMult', 1.5, 1, 3, 0.1, 'tower fire-rate multiplier; stacks with sprint Overdrive');
  const overchargeCd = T.num('overchargeCooldownS', 60, 5, 180, 5);
  const slowS = T.num('slowS', 8, 1, 30, 1);
  const slowFraction = T.num('slowFraction', 0.4, 0, 0.9, 0.05, 'fraction of movement speed removed on the most threatened lane');
  const slowCd = T.num('slowCooldownS', 50, 5, 180, 5);
  const sprintCompletes = T.bool('cdSprintCompletes', true, 'a sprint edge completes Overcharge and Slow cooldowns (not rail stock)');

  const save = readSave(ctx.load<unknown>());
  const autopilot = !!opts?.autopilot;
  const levels = save.upgrades;
  let bank = save.bank;
  let mods: MetaMods = metaMods(levels, save.bestWave);
  let autoInvestOn = save.autoInvest;
  let autoCrewOn = opts?.autoCrew ?? save.autoCrew;
  let fromWave = mods.maxStartWave;

  let phase: 'garage' | 'run' = 'garage';
  let started = false;
  let garageSel = 0, garageT = 0, garageBreather = 0;
  let t = 0, nextId = 1, fxId = 0, cueId = 0;
  let enemies: Enemy[] = [];
  const spawned: Enemy[] = [];
  const towers: Array<Tower | null> = PADS.map(() => null);
  let shells: Shell[] = [];
  let fx: Fx[] = [];
  const cues: Array<{ name: string; id: number }> = [];
  let banner: Banner | null = null;
  let weapon: Weapon = 'gatling';
  let swapLeft = 0, swapTotal = 1;
  let aim = 0, targetId = 0, nudgeLane = -1, nudgeLeft = 0;
  let baseMaxHp = baseHpMax(), baseHp = baseMaxHp, baseHurt = 99;
  let wave = 1, waveElapsed = 0, wavesSurvived = 0, lull = 0;
  let plan: WavePlan, nextPlan: WavePlan;
  let schedule: Spawn[] = [];
  let miniTimer = 2;
  let phaseColors: Element[] = [];
  const escorts: Array<{ at: number; from: Enemy; offset: number }> = [];
  let ignitionChainId = 0;
  let revAcc = 0, lastRevs = 0;
  let railCharges = 0, railProgress = 0, railFired = 0, railCharging = false;
  let zHold = 0, zDown = false, zDumped = false;
  const railPointers = new Set<number>();
  const boostPointers = new Set<number>();
  let boostBlocked = false;
  let inputEpoch = 0, workshopRevision = 0, railBlocked = false, discardEdges = false;
  let overchargeLeft = 0, slowLeft = 0, slowLane = -1, lastSprint = false;
  let currentRefill = 1;
  const cooldowns = { overcharge: startCooldown(0), slow: startCooldown(0) };
  let constructionDone = false;
  let flaming = false, flamePower = 0, grid = 0, overdrive = false, laserId = 0;
  let surge: SurgeView | null = null;
  let spin: SpinView | null = null, overclock = 0;
  let effort: EffortView | null = null;
  let effortEndedAt = 0, recentCadence = 90, recentFtp = 0.65;
  const callSchedule = { nextWave: 2, lastWave: 0 };
  const calls = { started: 0, won: 0, failed: 0 };
  let scrap = 0, partsRun = 0, partsEarned = 0;
  let bestRunWaves = 0, wavesCleared = 0, runSurges = 0, bestRunSurges = 0;
  let workshop: { pad: number; row: number; idle: number } | null = null;
  let leakDmg = 0, stallT = 0;
  const broods: Element[] = [];
  const pending: Array<{ type: string; [k: string]: unknown }> = [];
  const kills: Record<string, number> = { blue: 0, red: 0, purple: 0, gold: 0 };
  const dealt = { player: 0, tower: 0, emp: 0 };
  const weaponSeconds: Record<Weapon, number> = { gatling: 0, flame: 0, rail: 0 };
  const stats = { towersBuilt: 0, towerUpgrades: 0, scrapEarned: 0, surgesWon: 0, surgesFailed: 0, spinsWon: 0, spinsFailed: 0, overclockS: 0, runs: 0, runsFallen: 0, runsBailed: 0, bosses: 0, overdriveS: 0, empKills: 0, heavyKills: 0, towerKills: 0, turretKills: 0, ignitionBursts: 0 };

  // ---------- helpers ----------
  function cue(name: string) { cues.push({ name, id: ++cueId }); if (cues.length > 40) cues.shift(); }
  function addFx(f: NewFx) {
    fx.push({ ...f, id: ++fxId, t0: t } as Fx);
    if (fx.length > 160) fx.splice(0, fx.length - 160);
  }
  function say(text: string, sub = '', color = '#ffffff', big = false) { banner = { text, sub, color, t0: t, big }; }
  /** The weapon's trainer setting, eased from the lull's recovery value early in the lull to full over the last `rampS`. */
  function trainerSync() {
    if (phase === 'garage') { ctx.resistance.set({ id: 'weapon', mode: 'sim', gradePct: 0 }); return; }
    const ramp = rampS();
    const k = phase !== 'run' ? 0 : lull <= 0 ? 1 : ramp <= 0 || lull >= ramp ? 0 : 1 - lull / ramp;
    const mix = (a: number, b: number) => a + (b - a) * k;
    if (phase !== 'run' || weapon === 'gatling') ctx.resistance.set({ id: 'weapon', mode: 'sim', gradePct: mix(lullGrade(), gatlingGrade()) });
    else if (weapon === 'flame') ctx.resistance.set({ id: 'weapon', mode: 'resistance', levelPct: mix(lullLevel(), flameLevel()) });
    else {
      const target = bossView()?.sprintBoost ? bossSprintFtp()
        : effort?.kind === 'hold' && (effort.state === 'announced' || effort.state === 'active') ? effort.targetFtp : railFtp();
      ctx.resistance.set({ id: 'weapon', mode: 'erg', ftpFraction: mix(lullFtp(), target) });
    }
  }
  trainerSync();
  ctx.resistance.useVirtualGears(true); // all four shifters are gears (sim mode only); no game action reads a shifter
  const railCap = () => railMax() + mods.railExtra;
  const towerCostMult = () => mods.towerCostMult * towerCostT();
  const repairCost = () => 30 + wave * 3;
  const gainScrap = (n: number) => { const v = Math.max(0, Math.round(n * mods.scrapMult * scrapScale())); scrap += v; stats.scrapEarned += v; return v; };

  const elementOf = (e: Enemy): Element => {
    if (e.boss) return e.boss.colors[e.boss.phase];
    if (e.kind === 'prism') return ELEMENTS[Math.floor((t + e.phase) / 4) % 3];
    return KINDS[e.kind].color as Element;
  };
  const shiftIn = (e: Enemy): number => {
    if (e.boss) return e.boss.pending ? e.boss.countdownS : 0;
    const p = e.kind === 'prism' ? 4 : 0;
    return p ? p - ((t + e.phase) % p) : 0;
  };
  const radiusOf = (e: Enemy) => KINDS[e.kind].radius;

  function place(e: Enemy) {
    const p = laneAt(e.lane, e.d);
    const wob = e.kind === 'dart' ? Math.sin(t * 5 + e.phase) * 2.5 : 0;
    const fade = Math.min(1, (e.len - e.d) / 12); // converge onto the base at the end
    e.x = p.x + p.nx * (e.off + wob) * fade; e.y = p.y + p.ny * (e.off + wob) * fade;
    e.angle = angleTo(e.x, e.y); e.dist = distTo(e.x, e.y);
  }

  function spawn(kind: Kind, laneIdx: number, d = 0) {
    const k = KINDS[kind];
    const w1 = wave - 1;
    const hs = (1 + hpScale() * w1 + hpScale2() * w1 * w1) * (kind === 'boss' ? 1 + Math.floor(wave / 5) * 0.35 : 1);
    const hp = k.hp * hs;
    const e: Enemy = {
      id: nextId++, kind, lane: laneIdx, d, len: laneLength(laneIdx), off: (ctx.rng() - 0.5) * (kind === 'boss' ? 1 : 4.5),
      phase: ctx.rng() * 12, x: 0, y: 0, angle: 0, dist: 99,
      hp, maxHp: hp, speed: k.speed * Math.min(1.5, 1 + 0.012 * w1), dmg: k.dmg, dead: false, hurt: 0, lastEl: null,
      spawnT: 5, charging: false, boss: kind === 'boss' ? createBossState(phaseColors.slice()) : null,
    };
    if (e.boss) e.boss.age = exposedEvery() / 2; // first opening is half a cycle in, then every full cycle
    place(e);
    spawned.push(e);
    if (kind === 'boss') { ctx.emit({ type: 'bossSpawned', data: { wave, id: e.id } }); say(`${k.name} incoming`, `Wave ${wave} boss · ${LANE_NAMES[laneIdx]} lane · announced phases · sprint when Exposed`, '#ffd24a', true); cue('bossStart'); }
  }

  interface IgnitionChain { id: number; bursts: number }
  function hit(e: Enemy, base: number, el: Element | null, src: 'player' | 'tower' | 'emp' = 'player', chain?: IgnitionChain) {
    if (e.dead) return;
    const element = elementOf(e);
    const mult = el == null ? 1 : match[ELEMENT_WEAPON[el]][element]();
    const exposure = e.boss?.exposed ? exposedMult() * (ctx.bike().sprinting ? exposedSprintMult() : 1) : 1;
    const floor = e.boss ? bossHpFloor(e.boss, e.maxHp) : 0;
    const damage = Math.min(Math.max(0, e.hp - floor), base * mult * exposure);
    dealt[src] += damage; // effective damage, including ignition; no overkill or damage through phase gates
    e.hp -= damage;
    e.hurt = 0.12; e.lastEl = el;
    if (e.hp <= 0) {
      kill(e, src);
      if (el === 'red' && element === 'red') ignite(e, src, chain ?? { id: ++ignitionChainId, bursts: 0 });
    }
  }
  function ignite(e: Enemy, src: 'player' | 'tower' | 'emp', chain: IgnitionChain) {
    if (chain.bursts >= Math.floor(ignitionCap()) || ctx.rng() >= ignitionChance()) return;
    chain.bursts++;
    stats.ignitionBursts++;
    const r = ignitionRadius();
    addFx({ kind: 'burst', life: 0.5, x: e.x, y: e.y, r });
    ctx.emit({ type: 'burst', data: { wave, x: e.x, y: e.y, radius: r, chain: chain.id, ordinal: chain.bursts, source: src } });
    for (const other of enemies) if (!other.dead && elementOf(other) === 'red' && Math.hypot(other.x - e.x, other.y - e.y) <= r) {
      hit(other, ignitionDamage(), 'red', src, chain);
    }
  }

  function kill(e: Enemy, src: 'player' | 'tower' | 'emp') {
    e.dead = true;
    const def = KINDS[e.kind];
    const key = e.kind === 'boss' ? 'gold' : elementOf(e);
    addFx({ kind: 'death', life: def.heavy ? 0.7 : 0.4, x: e.x, y: e.y, color: e.kind === 'boss' ? 'gold' : key as Element, big: def.heavy, eid: e.id, ekind: e.kind, fire: e.lastEl === 'red' });
    kills[key]++;
    if (src === 'tower') stats.towerKills++;
    if (src === 'player') stats.turretKills++;
    if (src === 'emp') stats.empKills++;
    const got = gainScrap(def.scrap);
    if (def.heavy) {
      stats.heavyKills++;
      addFx({ kind: 'text', life: 1, x: e.x, y: e.y - 3, text: `+${got}`, color: '#ffd24a' });
      cue(e.kind === 'boss' ? 'bossDie' : 'kill');
    }
    if (e.kind === 'carrier') for (let i = 0; i < 3; i++) spawnAt('mini', e, (i - 1) * 2.5);
    if (e.kind === 'boss') {
      stats.bosses++; save.totals.bosses++;
      const p = Math.round((30 + wave * 2) * partsScale()); partsRun += p; partsEarned += p; bank += p;
      say(`${def.name} destroyed!`, `+${got} scrap · +${p} parts`, '#ffd24a', true);
      ctx.emit({ type: 'bossKilled', data: { wave, phases: e.boss?.colors.length ?? 0 } });
      addFx({ kind: 'hitStop', life: 0.1, seconds: 0.08 });
      persist();
    } else if (def.heavy) ctx.emit({ type: 'enemyKilled', data: { element: key, wave } });
  }
  function spawnAt(kind: Kind, from: Enemy, dOff: number) {
    spawn(kind, from.lane, Math.max(0, from.d + dOff));
  }

  // ---------- waves ----------
  function planFor(w: number): WavePlan {
    const brood = nextBrood(broods, ctx.rng, { maxRun: w % 5 === 0 ? 1 : broodMaxRun(), coverWaves: broodCover() });
    broods.push(brood);
    return planWave(w, ctx.rng, { spawnWindowS: spawnWindow(), countScale: countScale(), brood, broodShare: broodShare(), swarmPack: swarmPack() });
  }
  /** Plans wave `wave` and opens its lull: the brood card counts down while the next weapon mounts and its trainer setting ramps in. */
  function startWave(fresh: boolean) {
    constructionDone = false;
    plan = fresh ? planFor(wave) : nextPlan;
    nextPlan = planFor(wave + 1);
    waveElapsed = 0;
    escorts.length = 0;
    schedule = plan.spawns.map((s) => ({ ...s }));
    lull = lullS();
    phaseColors = plan.boss ? bossColors(plan.brood, bossPhases()) : [];
    const b = broodInfo(plan);
    ctx.emit({ type: 'broodAnnounced', data: { wave, color: b.color, weapon: b.weapon, mode: b.mode } });
    if (plan.boss) ctx.emit({ type: 'bossPhaseAnnounced', data: { wave, phase: 1, color: b.color, weapon: b.weapon, mode: b.mode, countdownS: lull } });
    selectWeapon(b.weapon);
    if (lull <= 0) beginWave();
  }
  /** The lull is over: spawns start. */
  function beginWave() {
    ctx.emit({ type: 'waveStart', data: { wave } });
    if (plan.boss) ctx.emit({ type: 'bossPhaseStarted', data: { wave, phase: 1, color: plan.brood, weapon } });
    if (!plan.boss) say(`Wave ${wave}`, `Heaviest push: ${LANE_NAMES[plan.mainLane]} lane`, '#cfe3ff');
    cue('waveStart');
    const kind = scheduleCall(callSchedule, wave, plan.boss, weapon, () => (plan.mainLane + ELEMENTS.indexOf(plan.brood)) / 5, callGapMin(), callGapMax());
    if (kind) {
      const targetFtp = clamp(recentFtp, 0.56, 0.75);
      const minRpm = kind === 'spin' ? Math.round(clamp(recentCadence * callSpinRatio(), 60, 110)) : kind === 'grind' ? 45 : 60;
      const maxRpm = kind === 'grind' ? Math.round(clamp(recentCadence * callGrindRatio(), 55, 85)) : 140;
      effort = { kind, wave, state: 'announced', countdownS: callCountdown(), heldS: 0, needS: callNeed(), leftS: Math.max(callNeed(), callWindow()),
        minRpm, maxRpm, targetFtp, minFtp: kind === 'hold' ? Math.max(0.5, targetFtp - callHoldBand()) : Math.max(0.5, Math.min(0.65, targetFtp) * callPowerRatio()),
        maxFtp: kind === 'hold' ? targetFtp + callHoldBand() : 3 };
      calls.started++;
      say(`${kind === 'spin' ? 'Spin-up' : kind === 'grind' ? 'Grind' : 'Hold'} in ${Math.ceil(effort.countdownS)}s`, effortCue(effort), '#7df9ff');
      ctx.emit({ type: 'effortAnnounced', data: { wave, kind, weapon, countdownS: effort.countdownS, minRpm, maxRpm, minFtp: effort.minFtp, maxFtp: effort.maxFtp } });
      cue('alarm');
    }
  }
  function effortCue(e: EffortView): string {
    return e.kind === 'spin' ? `${e.minRpm}+ rpm · keep the dynamo powered` : e.kind === 'grind' ? `${e.minRpm}–${e.maxRpm} rpm · ≥${Math.round(e.minFtp * 100)}% FTP` : `Hold ${Math.round(e.minFtp * 100)}–${Math.round(e.maxFtp * 100)}% FTP`;
  }
  function finishEffort(won: boolean) {
    if (!effort || effort.state === 'won' || effort.state === 'failed') return;
    const e = effort;
    e.state = won ? 'won' : 'failed'; effortEndedAt = t;
    if (won) calls.won++; else calls.failed++;
    ctx.emit({ type: won ? 'effortWon' : 'effortFailed', data: { wave: e.wave, kind: e.kind } });
    if (e.kind === 'spin') {
      if (won) {
        stats.spinsWon++; overclock = overclockS();
        const b = gainScrap(10 + wave);
        say('Overclocked!', `Gatling ×2 · +${b} scrap`, '#8fd8ff', true); cue('overclock');
      } else stats.spinsFailed++;
      ctx.emit({ type: won ? 'spinWon' : 'spinFailed', data: { wave: e.wave } });
    } else {
      if (won) {
        stats.surgesWon++; runSurges++; bestRunSurges = Math.max(bestRunSurges, runSurges); save.totals.surges++;
        addFx({ kind: 'emp', life: 1.2 });
        for (const alien of enemies) if (!alien.dead) hit(alien, KINDS[alien.kind].heavy ? empDmg() : 9999, null, 'emp');
        const b = gainScrap(20 + wave * 2);
        if (railCharges < railCap()) railCharges++;
        say('Dynamo charged!', `EMP · +${b} scrap · +1 rail charge`, '#7df9ff', true); cue('emp');
      } else stats.surgesFailed++;
      ctx.emit({ type: won ? 'surgeWon' : 'surgeFailed', data: { wave: e.wave, kind: e.kind } });
    }
  }
  function updateEffort(dt: number) {
    const bike = ctx.bike();
    if (lull <= 0 && !plan.boss && bike.cadence3s >= 30 && !effort) {
      const k = 1 - Math.exp(-dt / 30);
      recentCadence += (bike.cadence3s - recentCadence) * k;
      recentFtp += (bike.ftpFraction - recentFtp) * k;
    }
    if (effort && lull <= 0) {
      const e = effort;
      if (e.state === 'announced') {
        e.countdownS = Math.max(0, e.countdownS - dt);
        if (e.countdownS <= 1e-8) {
          e.countdownS = 0; e.state = 'active';
          ctx.emit({ type: 'effortStart', data: { wave, kind: e.kind, weapon } });
          ctx.emit({ type: e.kind === 'spin' ? 'spinStart' : 'surgeStart', data: { wave } });
          say(e.kind.toUpperCase(), effortCue(e), '#7df9ff');
        }
      } else if (e.state === 'active') {
        e.leftS = Math.max(0, e.leftS - dt);
        if (effortMet(e, bike.cadence3s, bike.ftpFraction)) e.heldS += dt;
        if (e.heldS >= e.needS) finishEffort(true);
        else if (e.leftS <= 0) finishEffort(false);
      } else if (t - effortEndedAt > 4) effort = null;
    }
    // Compatibility views keep the existing drill panels, summaries and achievements.
    spin = effort?.kind === 'spin' && effort.state !== 'announced' ? {
      state: effort.state, held: effort.heldS, needS: effort.needS, leftS: effort.leftS, rpm: effort.minRpm, t0: effortEndedAt,
    } : null;
    surge = effort && effort.kind !== 'spin' && effort.state !== 'announced' ? {
      state: effort.state, progress: Math.min(1, effort.heldS / effort.needS), needS: effort.needS, leftS: effort.leftS, zone: 2, t0: effortEndedAt,
    } : null;
  }

  function clearWave(early: boolean) {
    if (effort && (effort.state === 'active' || effort.state === 'announced')) finishEffort(false);
    effort = null; spin = null; surge = null;
    for (const e of enemies) if (!e.dead && e.boss) {
      e.dead = true; ctx.emit({ type: 'bossEscaped', data: { wave } });
    }
    enemies = enemies.filter((e) => !e.dead);
    wavesSurvived++; wavesCleared++; bestRunWaves = Math.max(bestRunWaves, wavesSurvived);
    save.totals.waves++;
    const p = Math.round(partsForWave(wave) * partsScale()); partsRun += p; partsEarned += p; bank += p;
    const bonus = gainScrap(10 + wave * 2 + (early ? 10 : 0));
    const heal = early ? clearHealFor(waveElapsed, leakDmg, { heal: clearHeal(), speedBonus: speedHeal(), waveMinS: waveMin(), waveMaxS: waveMax(), leakZero: leakHealZero() }) : 0;
    baseHp = Math.min(baseMaxHp, baseHp + heal);
    ctx.emit({ type: 'waveCleared', data: { wave, heal, leakDmg } });
    say(`Wave ${wave} cleared`, `+${bonus} scrap · +${p} parts${heal ? ` · base +${heal} HP${leakDmg === 0 ? ' (clean)' : ''}` : ''}`, '#7dffb0');
    leakDmg = 0;
    cue('waveClear');
    wave++;
    persist();
    startWave(false);
  }

  function endRun(reason: 'bail' | 'fell') {
    if (phase !== 'run') return;
    if (reason === 'fell') { stats.runsFallen++; save.totals.runsFallen++; }
    else { stats.runsBailed++; save.totals.runsBailed++; }
    // Parts already enter the bank as earned; ending a run never adds them a second time.
    persist();
    ctx.emit({ type: 'runEnded', data: { reason, wave, wavesSurvived, parts: partsRun } });
    lull = 0; swapLeft = 0; plan = undefined!;
    phase = 'garage'; garageSel = 0; garageT = 0; garageBreather = garageBreatherS();
    enemies = []; spawned.length = 0; shells = []; schedule = []; fx = [];
    towers.fill(null); workshop = null; pending.length = 0;
    surge = null; spin = null; overclock = 0; effort = null; escorts.length = 0;
    grid = 0; overdrive = false; flaming = false; flamePower = 0; laserId = 0; targetId = 0;
    railCharges = 0; railProgress = 0; railCharging = false; zDown = false; zHold = 0; zDumped = false;
    mods = metaMods(levels, save.bestWave); fromWave = Math.min(fromWave, mods.maxStartWave);
    resetCombat();
    trainerSync();
    say(reason === 'fell' ? 'Base fell · back to the Garage' : 'Back to the Garage', `${partsRun} parts banked · take a breather`, '#ffd24a', true);
    cue(reason === 'fell' ? 'baseFell' : 'uiClose');
  }

  // ---------- weapons ----------
  function broodInfo(p: WavePlan): BroodInfo {
    const weapon = ELEMENT_WEAPON[p.brood];
    if (weapon === 'gatling') return { wave: p.wave, color: p.brood, weapon, mode: 'sim', setting: `sim ${+gatlingGrade().toFixed(1)}% grade`, cue: 'spin fast · 90+ rpm' };
    if (weapon === 'flame') return { wave: p.wave, color: p.brood, weapon, mode: 'resistance', setting: `resistance ${Math.round(flameLevel())}%`, cue: 'grind 70–80 rpm' };
    return { wave: p.wave, color: p.brood, weapon, mode: 'erg', setting: `ERG ${Math.round(railFtp() * 100)}% FTP`, cue: 'hold steady · 85–95 rpm' };
  }
  /** Mounts the brood's weapon (once per wave, at the start of its lull). */
  function selectWeapon(w: Weapon) {
    if (w === weapon || phase !== 'run') return;
    weapon = w; swapTotal = swapLeft = swapS() * mods.swapMult; revAcc = 0;
    cue('swap');
    ctx.emit({ type: 'weaponSwitched', data: { weapon: w, wave } });
  }
  const stalled = () => phase === 'run' && stallT >= stallGrace();
  const odMult = () => (overdrive ? overdriveMult() : 1);

  function fireRail(n: number) {
    n = Math.min(n, railCharges);
    if (n <= 0) return;
    railCharges -= n; railFired += n;
    const spread = 0.42;
    for (let i = 0; i < n; i++) {
      const a = aim + (n === 1 ? 0 : (i - (n - 1) / 2) * spread);
      addFx({ kind: 'beam', life: 0.45, angle: a, spread: n > 1 });
      for (const e of enemies) {
        if (e.dead) continue;
        if (angDiff(e.angle, a) <= railWidth() + radiusOf(e) / Math.max(4, e.dist)) hit(e, railDmg() * odMult(), 'purple');
      }
    }
    cue('rail');
    ctx.emit({ type: 'railFired', data: { charges: n } });
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

  const nudge = (): Nudge | null => (nudgeLeft > 0 && nudgeLane >= 0 ? { lane: nudgeLane, k: nudgeLeft / nudgeS() } : null);
  function setNudge(l: number) { if (l !== nudgeLane || nudgeLeft < nudgeS() - 0.5) cue('select'); nudgeLane = l; nudgeLeft = nudgeS(); }
  /** The turret always aims itself (#120): brood-colour lead alien on the most threatened lane, biased by a nudge. */
  function autoTarget(): Enemy | null {
    // An opening is a concrete sprint opportunity: aim at the boss while its armour is open.
    const exposedBoss = enemies.find((e) => !e.dead && e.boss?.exposed && e.dist < 96 &&
      Math.abs(e.angle) <= AIM_LIMIT && (weapon !== 'flame' || e.dist <= flameRange() + radiusOf(e)));
    if (exposedBoss) return exposedBoss;
    const cands: TargetCand[] = enemies.filter((e) => !e.dead).map((e) => ({
      id: e.id, lane: e.lane, element: elementOf(e), progress: e.d / e.len, dist: e.dist, angle: e.angle, dmg: e.dmg,
    }));
    const id = chooseTarget(cands, {
      element: WEAPON_ELEMENT[weapon], reach: weapon === 'flame' ? flameRange() * 1.4 : 999,
      nudge: nudge(), nudgeBias: nudgeBias(), current: targetId, stick: targetStick(),
    });
    return id ? enemies.find((e) => e.id === id) ?? null : null;
  }

  // ---------- towers ----------
  function inRange(tw: Tower, e: Enemy) {
    const p = PADS[tw.pad], r = TOWERS[tw.kind].range * LEVEL_RANGE[tw.level - 1];
    return Math.hypot(e.x - p.x, e.y - p.y) <= r + radiusOf(e);
  }
  function updateTowers(dt: number) {
    const rate = grid * odMult() * (overchargeLeft > 0 ? overchargeMult() : 1);
    for (const tw of towers) {
      if (!tw) continue;
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
        addFx({ kind: 'zap', life: 0.22, pts });
        cue('zap');
      } else if (tw.kind === 'mortar') {
        const flight = 0.9;
        const ahead = laneAt(target.lane, target.d + travelSpeed(target) * flight);
        shells.push({ x0: p.x, y0: p.y, x1: ahead.x, y1: ahead.y, t: 0, flight, dmg, r: 7 + tw.level });
        cue('mortar');
      } else {
        addFx({ kind: 'lens', life: 0.35, x0: p.x, y0: p.y - 3, x1: target.x, y1: target.y });
        hit(target, dmg, 'purple', 'tower');
        cue('lens');
      }
    }
    for (const s of shells) {
      s.t += dt;
      if (s.t >= s.flight) {
        addFx({ kind: 'boom', life: 0.5, x: s.x1, y: s.y1, r: s.r });
        for (const e of enemies) if (!e.dead && Math.hypot(e.x - s.x1, e.y - s.y1) <= s.r + radiusOf(e)) hit(e, s.dmg, 'red', 'tower');
        cue('explode');
      }
    }
    shells = shells.filter((s) => s.t < s.flight);
  }
  function travelSpeed(e: Enemy) {
    return e.speed * (e.charging ? 2.6 : 1) * (slowLeft > 0 && e.lane === slowLane ? 1 - slowFraction() : 1)
      * (e.boss?.pending || (e.boss?.staggerS ?? 0) > 0 ? 0.2 : 1);
  }

  function build(pad: number, kind: TowerKind): boolean {
    const c = towerBuildCost(kind, towerCostMult());
    if (towers[pad] || scrap < c) { cue('deny'); return false; }
    scrap -= c;
    towers[pad] = { pad, kind, level: 1, cd: 0.5, angle: 0, firedAt: -9 };
    stats.towersBuilt++; save.totals.towers++;
    cue('build');
    ctx.emit({ type: 'towerBuilt', data: { tower: kind, pad } });
    return true;
  }
  function upgrade(pad: number): boolean {
    const tw = towers[pad];
    if (!tw || tw.level >= TOWER_MAX_LEVEL) { cue('deny'); return false; }
    const c = towerUpgradeCost(tw.kind, tw.level, towerCostMult());
    if (scrap < c) { cue('deny'); return false; }
    scrap -= c; tw.level++; stats.towerUpgrades++;
    cue('upgrade');
    ctx.emit({ type: 'towerUpgraded', data: { tower: tw.kind, level: tw.level } });
    return true;
  }
  function sell(pad: number) {
    const tw = towers[pad]; if (!tw) return;
    let spent = towerBuildCost(tw.kind, towerCostMult());
    for (let l = 1; l < tw.level; l++) spent += towerUpgradeCost(tw.kind, l, towerCostMult());
    scrap += Math.round(spent * 0.5); towers[pad] = null; cue('coin');
  }
  function repair(): boolean {
    if (baseHp >= baseMaxHp || scrap < repairCost()) { cue('deny'); return false; }
    scrap -= repairCost(); baseHp = Math.min(baseMaxHp, baseHp + REPAIR_HP); cue('repair');
    return true;
  }

  function workshopRows(pad: number): WorkshopRow[] {
    const crew: WorkshopRow = { kind: 'crew', label: `Auto-crew: ${autoCrewOn ? 'ON' : 'OFF'}`, desc: 'Build the suggestion at the end of each lull', cost: 0, affordable: true };
    if (pad === 6) return [{ kind: 'repair', label: 'Repair base', desc: `+${REPAIR_HP} HP`, cost: repairCost(), affordable: scrap >= repairCost() && baseHp < baseMaxHp }, crew];
    const tw = towers[pad];
    if (!tw) return [...TOWER_KINDS.map((k): WorkshopRow => {
      const c = towerBuildCost(k, towerCostMult());
      return { kind: 'build', tower: k, label: TOWERS[k].name, desc: TOWERS[k].desc, cost: c, affordable: scrap >= c };
    }), crew];
    const rows: WorkshopRow[] = [];
    if (tw.level < TOWER_MAX_LEVEL) {
      const c = towerUpgradeCost(tw.kind, tw.level, towerCostMult());
      rows.push({ kind: 'upgrade', tower: tw.kind, label: `Upgrade to Lv ${tw.level + 1}`, desc: `x${(LEVEL_DMG[tw.level] / LEVEL_DMG[tw.level - 1]).toFixed(1)} damage, more range`, cost: c, affordable: scrap >= c });
    }
    rows.push({ kind: 'sell', tower: tw.kind, label: 'Scrap it', desc: 'Refund half', cost: 0, affordable: true });
    rows.push(crew);
    return rows;
  }
  /** Next-wave off-colour aliens are the towers' job. Suggestions follow the live matchup tunables. */
  function suggestTower(pad: number): number {
    const suggestion = recommendation(pad);
    return suggestion?.tower ? TOWER_KINDS.indexOf(suggestion.tower)
      : Math.max(0, TOWER_KINDS.findIndex(k => towerBuildCost(k, towerCostMult()) <= scrap));
  }
  function openWorkshop(pad?: number) {
    let p = pad ?? -1;
    if (p < 0) p = recommendation()?.pad ?? PAD_ORDER.find((i) => i < 6 && !towers[i]) ?? PAD_ORDER[0];
    workshop = { pad: p, row: p < 6 && !towers[p] ? suggestTower(p) : 0, idle: 0 };
    workshopRevision++; inputEpoch++; cancelHolds();
    cue('uiOpen');
  }
  function closeWorkshop() {
    if (!workshop) return;
    workshop = null; workshopRevision++; inputEpoch++; cancelHolds(); cue('uiClose');
  }
  function workshopAct(row?: number) {
    if (!workshop) return;
    const rows = workshopRows(workshop.pad);
    if (row != null) workshop.row = clamp(row, 0, rows.length - 1);
    const r = rows[workshop.row]; if (!r) return;
    let purchased = false;
    if (r.kind === 'build') purchased = build(workshop.pad, r.tower!);
    else if (r.kind === 'upgrade') purchased = upgrade(workshop.pad);
    else if (r.kind === 'sell') sell(workshop.pad);
    else if (r.kind === 'crew') { autoCrewOn = !autoCrewOn; persist(); cue('select'); }
    else purchased = repair();
    if (purchased && lull > 0) constructionDone = true;
    workshopRevision++;
    workshop.row = clamp(workshop.row, 0, workshopRows(workshop.pad).length - 1);
  }

  function recommendation(pad?: number): BuildSuggestion | null {
    if (!plan) return null;
    // `plan` is the announced incoming wave during the lull. `nextPlan` is one wave later.
    const coming = lull > 0 ? plan : nextPlan;
    return suggestBuild({ wave: coming.wave, brood: coming.brood, lanes: coming.lanes,
      towers: towers.filter((tw): tw is Tower => !!tw), scrap, costMult: towerCostMult(),
      baseHp, baseMaxHp, repairCost: repairCost(), matchup: matchup(), pad });
  }
  function acceptSuggestion(claim?: unknown) {
    if (lull <= 0 || constructionDone) return;
    const s = recommendation();
    if (!s) return;
    // Match the exact operation displayed by the renderer; never replace a stale claim with a different purchase.
    if (claim != null) {
      const c = claim as Partial<BuildSuggestion>;
      if (c.wave !== s.wave || c.kind !== s.kind || c.pad !== s.pad || c.tower !== s.tower || c.level !== s.level || c.targetLevel !== s.targetLevel || c.cost !== s.cost) { cue('deny'); return; }
    }
    let ok = false;
    if (s.kind === 'repair') ok = repair();
    else if (s.kind === 'build') ok = build(s.pad, s.tower!);
    else if (scrap >= s.cost) {
      while (towers[s.pad]!.level < s.targetLevel) { if (!upgrade(s.pad)) break; ok = true; }
    }
    if (ok) constructionDone = true;
  }
  function cancelRail() {
    railPointers.clear(); zDown = false; zHold = 0; zDumped = false;
    railBlocked = true;
  }
  function cancelBoost() { boostPointers.clear(); boostBlocked = true; }
  function cancelHolds() { cancelRail(); cancelBoost(); }
  function boostAvailable() {
    return phase === 'run' && !workshop && weapon === 'rail' &&
      enemies.some(e => !e.dead && e.boss && !e.boss.pending && (e.boss.telegraph || e.boss.exposed));
  }
  function useAction(id: ActionId) {
    if (phase !== 'run' || workshop) return;
    if (id === 'rail') { fireRail(1); return; }
    if (!isReady(cooldowns[id])) return;
    if (id === 'overcharge') {
      if (!towers.some(Boolean) || grid <= 0 || !enemies.some(e => !e.dead)) return;
      overchargeLeft = overchargeS(); Object.assign(cooldowns.overcharge, startCooldown(overchargeCd())); cue('overdrive');
    } else {
      const threats = [0, 0, 0];
      for (const e of enemies) if (!e.dead) threats[e.lane] += e.dmg * (0.3 + e.d / e.len) ** 2;
      if (!threats.some(v => v > 0)) return;
      slowLane = threats.indexOf(Math.max(...threats)); slowLeft = slowS();
      Object.assign(cooldowns.slow, startCooldown(slowCd())); cue('surge');
    }
    ctx.emit({ type: 'action', data: { id, wave, ...(id === 'slow' ? { lane: slowLane } : {}) } });
  }

  // ---------- garage ----------
  function garageRows(): GarageRow[] {
    const rows: GarageRow[] = [{ kind: 'start', name: 'Start run', desc: mods.maxStartWave > 1 ? `From wave ${fromWave} (◀ ▶ to change)` : 'From wave 1' }];
    for (const d of UPGRADES) {
      const l = lvl(levels, d.id), maxed = l >= d.max, c = maxed ? 0 : upgradeCost(d, l);
      rows.push({ kind: 'upgrade', id: d.id, name: d.name, desc: d.desc, level: l, max: d.max, cost: maxed ? undefined : c, affordable: !maxed && bank >= c });
    }
    rows.push({ kind: 'auto', name: `Auto-invest: ${autoInvestOn ? 'ON' : 'OFF'}`, desc: 'Spend parts on the cheapest upgrades before each run' });
    return rows;
  }
  function garageUpdate(dt: number, inp: Readonly<InputState>) {
    const p = (b: Button) => inp.pressed.has(b);
    const rows = garageRows();
    let act = false;
    for (const a of pending.splice(0)) if (a.type === 'garageRow' && typeof a.row === 'number' && a.row >= 0 && a.row < rows.length) { garageSel = a.row; act = true; }
    if (p('up')) { garageSel = (garageSel + rows.length - 1) % rows.length; garageT = 0; cue('select'); }
    if (p('down')) { garageSel = (garageSel + 1) % rows.length; garageT = 0; cue('select'); }
    const row = rows[garageSel];
    if ((p('left') || p('right')) && row.kind === 'start' && mods.maxStartWave > 1) {
      fromWave = clamp(fromWave + (p('left') ? -1 : 1), 1, mods.maxStartWave); garageT = 0; cue('select');
    }
    if (p('b')) { startRun(); return; }
    if (p('a') || act) {
      garageT = 0;
      if (row.kind === 'start') { startRun(); return; }
      if (row.kind === 'auto') { autoInvestOn = !autoInvestOn; cue('select'); persist(); }
      if (row.kind === 'upgrade') {
        if (row.affordable) {
          bank -= row.cost!; levels[row.id!] = (row.level ?? 0) + 1; cue('buy');
          mods = metaMods(levels, save.bestWave); fromWave = Math.min(fromWave, mods.maxStartWave);
          if (row.id === 'headstart') fromWave = mods.maxStartWave;
          persist();
        } else cue('deny');
      }
    }
    if (garageBreather > 0) garageBreather = Math.max(0, garageBreather - dt);
    else if (ctx.bike().cadence3s > garageCadence()) garageT += dt;
    if (garageT >= garageAutostart()) startRun();
  }
  function resetCombat() {
    cancelHolds(); inputEpoch++; workshopRevision++; discardEdges = true;
    overchargeLeft = 0; slowLeft = 0; slowLane = -1; lastSprint = false; currentRefill = 1;
    Object.assign(cooldowns.overcharge, startCooldown(0));
    Object.assign(cooldowns.slow, startCooldown(0));
    constructionDone = false; nudgeLane = -1; nudgeLeft = 0;
    leakDmg = 0; stallT = 0; escorts.length = 0;
  }
  function startRun() {
    if (autoInvestOn || autopilot) { const r = autoInvest(bank, levels); bank = r.bank; mods = metaMods(levels, save.bestWave); }
    if (autopilot) fromWave = mods.maxStartWave;
    phase = 'run';
    save.runs++; stats.runs++;
    garageT = 0; garageBreather = 0;
    enemies = []; spawned.length = 0; shells = []; schedule = []; fx = []; towers.fill(null);
    workshop = null; banner = null;
    weapon = 'gatling'; swapLeft = 0; swapTotal = 1; aim = 0; targetId = 0;
    revAcc = 0; railCharges = 0; railProgress = 0; railCharging = false;
    zDown = false; zHold = 0; zDumped = false;
    surge = null; effort = null; spin = null; overclock = 0;
    flaming = false; flamePower = 0; grid = 0; overdrive = false; laserId = 0;
    wavesSurvived = 0; runSurges = 0; partsRun = 0; waveElapsed = 0; lull = 0; miniTimer = 2;
    baseHurt = 99;
    resetCombat();
    callSchedule.nextWave = 2; callSchedule.lastWave = 0;
    trainerSync();
    baseMaxHp = baseHpMax() * mods.hpMult; baseHp = baseMaxHp;
    wave = clamp(fromWave, 1, mods.maxStartWave);
    scrap = Math.round(startScrapT() + mods.startScrap + (wave - 1) * 35);
    lastRevs = ctx.bike().crankRevs;
    persist();
    cue('go');
    startWave(true);
  }

  function updateBosses(dt: number) {
    for (const e of enemies) {
      if (e.dead || !e.boss) continue;
      const b = e.boss;
      for (const event of advanceBoss(b, dt, e.hp / e.maxHp, {
        phaseCountdownS: bossCountdown(), exposedEveryS: exposedEvery(), telegraphS: exposedTelegraph(), exposedS: exposedS(),
      })) {
        if (event === 'phaseAnnounced') {
          const color = b.colors[b.phase + 1], info = broodInfo({ ...plan, brood: color });
          ctx.emit({ type: 'bossPhaseAnnounced', data: { wave, phase: b.phase + 2, color, weapon: info.weapon, mode: info.mode, countdownS: b.countdownS } });
          say(`Phase ${b.phase + 2} incoming`, `${color.toUpperCase()} · ${WEAPON_NAME[info.weapon]} in ${Math.ceil(b.countdownS)}s`, '#ffd24a', true);
          cue('alarm');
        } else if (event === 'phaseStarted') {
          const color = b.colors[b.phase];
          selectWeapon(ELEMENT_WEAPON[color]);
          ctx.emit({ type: 'bossPhaseStarted', data: { wave, phase: b.phase + 1, color, weapon, mode: broodInfo({ ...plan, brood: color }).mode } });
          say(`Phase ${b.phase + 1} · ${WEAPON_NAME[weapon]}`, 'Escorts incoming', '#ffd24a', true);
          for (let i = 0; i < 4; i++) escorts.push({ at: t + i * 0.3, from: e, offset: -2 - i * 2 });
          addFx({ kind: 'hitStop', life: 0.1, seconds: 0.06 });
          cue('alarm');
        } else if (event === 'telegraph') {
          say('Boss opening soon', `Sprint in ${Math.ceil(b.windowLeftS)}s`, '#ffd24a', true);
          cue('alarm');
          ctx.emit({ type: 'bossTelegraph', data: { wave, seconds: b.windowLeftS } });
        } else {
          say('Exposed!', 'Double damage · sprint for another ×1.5', '#7dffb0', true);
          ctx.emit({ type: 'bossExposed', data: { wave, seconds: b.windowLeftS } });
        }
      }
    }
    while (escorts.length && escorts[0].at <= t) {
      const escort = escorts.shift()!;
      // A dying boss still sent these escorts; changing waves or ending a run cancels them.
      spawnAt('mini', escort.from, escort.offset);
    }
  }

  // ---------- run ----------
  function runUpdate(dt: number, inp: Readonly<InputState>) {
    const bike = ctx.bike();
    const p = (b: Button) => inp.pressed.has(b);

    const epoch = inputEpoch, hadWorkshop = !!workshop;
    const commands = pending.splice(0);
    // Both adapters enter this queue. One command owns a purchase per tick.
    if (p('a')) commands.push({ type: hadWorkshop ? 'confirm' : 'construct', epoch });
    if (p('b')) commands.push(hadWorkshop ? { type: 'close', epoch } : { type: 'action', id: 'overcharge', epoch });
    if (p('y')) commands.push({ type: 'action', id: 'slow', epoch });
    if (p('down') && !hadWorkshop) commands.push({ type: 'pad', pad: -1, epoch });
    let menuHandled = hadWorkshop, purchased = false;
    for (const a of commands) {
      if (a.type === 'bail') { endRun('bail'); return; }
      if (a.epoch != null && a.epoch !== inputEpoch) continue;
      if (a.type === 'pad' && Number.isInteger(a.pad) && (a.pad as number) >= -1 && (a.pad as number) <= 6) {
        menuHandled = true;
        if (workshop && workshop.pad === a.pad) closeWorkshop();
        else openWorkshop((a.pad as number) < 0 ? undefined : a.pad as number);
      } else if (a.type === 'close') { menuHandled = true; closeWorkshop(); }
      else if ((a.type === 'row' || a.type === 'confirm') && workshop && !purchased) {
        if (a.revision != null && a.revision !== workshopRevision) continue;
        if (a.pad != null && a.pad !== workshop.pad) continue;
        if (a.type === 'row' && (!Number.isInteger(a.row) || (a.row as number) < 0 || (a.row as number) >= workshopRows(workshop.pad).length)) continue;
        workshop.idle = 0; workshopAct(a.type === 'row' ? a.row as number : undefined);
        menuHandled = true; purchased = true;
      } else if (a.type === 'construct' && !workshop && !purchased) {
        purchased = true;
        if (lull > 0 && !constructionDone && recommendation()) acceptSuggestion(a.suggestion);
        else if (a.suggestion == null) { openWorkshop(); menuHandled = true; }
      } else if (a.type === 'railCancel' || a.type === 'inputCancel') { cancelRail(); menuHandled = true; }
    }
    // Navigation consumes the D-pad while the shared construction menu is open.
    if (hadWorkshop && workshop) {
      workshop.idle += dt;
      if (inp.pressed.size) workshop.idle = 0;
      if (p('left') || p('right')) {
        const i = PAD_ORDER.indexOf(workshop.pad), n = PAD_ORDER.length;
        workshop.pad = PAD_ORDER[(i + (p('left') ? n - 1 : 1)) % n];
        workshop.row = workshop.pad < 6 && !towers[workshop.pad] ? suggestTower(workshop.pad) : 0;
        workshopRevision++;
        cue('select');
      }
      const count = workshopRows(workshop.pad).length;
      if (p('up')) { workshop.row = (workshop.row + count - 1) % count; workshopRevision++; cue('select'); }
      if (p('down')) { workshop.row = (workshop.row + 1) % count; workshopRevision++; cue('select'); }
      if (workshop.idle >= WORKSHOP_IDLE_S) closeWorkshop();
    } else if (!menuHandled) {
      // D-pad left/right nudges targeting toward a lane (steps from the nudged lane while one is active); up cancels
      const cur = nudgeLeft > 0 ? nudgeLane : -1;
      if (p('left')) setNudge(cur < 0 ? 0 : Math.max(0, cur - 1));
      if (p('right')) setNudge(cur < 0 ? 2 : Math.min(2, cur + 1));
      if (p('up') && cur >= 0) { nudgeLeft = 0; cue('select'); }
    }
    // paddles nudge too (left paddle = left lane, right paddle = right lane); held = refreshed
    const pd = inp.paddleR - inp.paddleL;
    if (!autopilot && Math.abs(pd) >= 0.5) setNudge(pd < 0 ? 0 : 2);
    else nudgeLeft = Math.max(0, nudgeLeft - dt);
    grid = bike.cadence3s < 15 ? 0 : clamp(bike.ftpFraction / towerNominal(), 0, towerMaxBoost());
    overchargeLeft = Math.max(0, overchargeLeft - dt); slowLeft = Math.max(0, slowLeft - dt);
    const refill = refillRate(Math.min(5, bike.powerZone));
    currentRefill = refill;
    tickCooldown(cooldowns.overcharge, dt, refill); tickCooldown(cooldowns.slow, dt, refill);
    if (bike.sprinting && !lastSprint && sprintCompletes()) { completeCooldown(cooldowns.overcharge); completeCooldown(cooldowns.slow); }
    lastSprint = bike.sprinting;

    if (!inp.held.has('z') && !p('z')) railBlocked = false;
    if (!inp.held.has('up')) boostBlocked = false;
    if (!menuHandled && !workshop) {
      const used = new Set<ActionId>();
      for (const a of commands) {
        if (a.epoch != null && a.epoch !== inputEpoch) continue;
        const id = a.type === 'rail' ? 'rail' : a.id;
        if ((a.type === 'action' || a.type === 'rail') && (id === 'rail' || id === 'overcharge' || id === 'slow') && !used.has(id)) {
          useAction(id); used.add(id);
        } else if (a.type === 'railDown' && Number.isInteger(a.pointer) && !railBlocked) {
          railPointers.add(a.pointer as number);
          if (!zDown) { zDown = true; zHold = 0; zDumped = false; }
        } else if (a.type === 'railUp' && Number.isInteger(a.pointer)) railPointers.delete(a.pointer as number);
        else if (a.type === 'boostDown' && Number.isInteger(a.pointer) && boostAvailable()) boostPointers.add(a.pointer as number);
        else if (a.type === 'boostUp' && Number.isInteger(a.pointer)) boostPointers.delete(a.pointer as number);
      }
      if (p('z') && !railBlocked && !zDown) { zDown = true; zHold = 0; zDumped = false; }
      if (zDown && (railPointers.size > 0 || inp.held.has('z'))) {
        zHold += dt;
        if (!zDumped && zHold >= railDumpHold()) { zDumped = true; fireRail(railCharges); }
      }
      if (zDown && railPointers.size === 0 && !inp.held.has('z')) {
        if (!zDumped) fireRail(1);
        zDown = false; zHold = 0;
      }
      if (opts?.actionBot && lull <= 0) {
        if (railCharges >= railCap() && enemies.some(e => !e.dead && e.dist < 75)) fireRail(railCharges);
        if (overchargeLeft <= 0 && enemies.filter(e => !e.dead).length >= 6) useAction('overcharge');
        if (slowLeft <= 0 && enemies.some(e => !e.dead && e.d / e.len > 0.65)) useAction('slow');
      }
    }
    if (swapLeft > 0) swapLeft = Math.max(0, swapLeft - dt);
    weaponSeconds[weapon] += dt;

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
    railCharging = bike.ftpFraction >= railMinFtp() && railCharges < railCap();
    if (bike.ftpFraction >= railMinFtp()) {
      railProgress += (dt / railPeriod()) * Math.min(1.5, bike.ftpFraction / 0.95) * mods.railRate;
      if (railProgress >= 1) {
        if (railCharges < railCap()) { railCharges++; railProgress -= 1; cue('railReady'); } else railProgress = 0;
      }
    }

    updateEffort(dt);
    if (overclock > 0) { overclock = Math.max(0, overclock - dt); stats.overclockS += dt; }

    // --- aim: always automatic
    const tgt = autoTarget();
    targetId = tgt?.id ?? 0;
    if (tgt) {
      const d = tgt.angle - aim, step = turnRate() * dt;
      aim = Math.abs(d) <= step ? tgt.angle : aim + Math.sign(d) * step;
    }

    updateBosses(dt);
    if (!boostAvailable()) { boostPointers.clear(); boostBlocked = inp.held.has('up'); }

    // --- firing
    flaming = false; flamePower = 0;
    const ready = swapLeft <= 0;
    const revs = bike.crankRevs - lastRevs; lastRevs = bike.crankRevs;
    if (weapon === 'gatling' && ready) {
      revAcc += Math.max(0, revs);
      let shots = 0;
      const perShot = gatlingRevs() / (overclock > 0 ? 2 : 1);
      while (revAcc >= perShot && shots < 12) {
        revAcc -= perShot; shots++;
        const e = nearestInCone(aim, 0.1);
        const end = e ? { x: e.x, y: e.y } : { x: BASE_X + Math.sin(aim) * 110, y: BASE_Y - Math.cos(aim) * 110 };
        if (e) hit(e, gatlingDmg() * mods.gatlingMult * odMult(), 'blue');
        addFx({ kind: 'tracer', life: 0.1, x0: BASE_X + Math.sin(aim) * 7, y0: BASE_Y - Math.cos(aim) * 7, x1: end.x, y1: end.y, hit: !!e });
      }
      if (shots) cue('shoot');
    } else if (weapon === 'flame' && ready && bike.power3s > 5) {
      flaming = true;
      flamePower = clamp(bike.power3s / (ctx.profile.ftp || 200), 0, 1.5);
      const d = bike.power3s * flameDpw() * mods.flameMult * odMult() * dt;
      for (const e of enemies) if (!e.dead && e.dist <= flameRange() + radiusOf(e) && angDiff(e.angle, aim) <= flameHalf() + radiusOf(e) / Math.max(4, e.dist)) hit(e, d, 'red');
    }

    laserId = 0;
    if (weapon === 'rail' && ready && bike.cadence3s > 15) {
      const e = nearestInCone(aim, 0.06);
      if (e) { laserId = e.id; hit(e, railLaserDps() * Math.min(1.5, bike.ftpFraction / 0.95) * odMult() * dt, 'purple'); }
    }

    updateTowers(dt);

    // --- enemies move / hit the base
    for (const e of enemies) {
      if (e.dead) continue;
      e.hurt = Math.max(0, e.hurt - dt);
      e.charging = e.kind === 'charger' && e.d / e.len > 0.5;
      e.d += travelSpeed(e) * dt;
      place(e);
      if (e.kind === 'carrier') { e.spawnT -= dt; if (e.spawnT <= 0) { e.spawnT = 6; spawnAt('mini', e, 1.5); spawnAt('mini', e, -1.5); } }
      if (e.d >= e.len - BASE_R) {
        e.dead = true;
        const dmg = e.dmg * (stalled() ? stallMult() : 1);
        baseHp -= dmg; baseHurt = 0; leakDmg += dmg;
        addFx({ kind: 'baseHit', life: 0.5, dmg });
        cue(dmg >= 5 ? 'baseHitHeavy' : 'baseHit');
        ctx.emit({ type: 'baseHit', data: { dmg, kind: e.kind } });
      }
    }
    baseHurt += dt;
    if (spawned.length) { enemies.push(...spawned.filter((e) => !e.dead)); spawned.length = 0; }
    enemies = enemies.filter((e) => !e.dead);

    // --- spawning
    if (lull > 0) {
      if (lull <= dt && autoCrewOn && !workshop) acceptSuggestion();
      lull = Math.max(0, lull - dt); if (lull === 0) beginWave();
    }
    else {
      waveElapsed += dt;
      // the drone stream runs until the wave has sent everything and waveMinS has passed, so the field can clear
      if (schedule.length || waveElapsed < waveMin()) miniTimer -= dt;
      if (miniTimer <= 0) {
        spawn('mini', Math.floor(ctx.rng() * 3) % 3);
        miniTimer = (miniInterval() / (1 + 0.04 * (wave - 1))) * (0.7 + ctx.rng() * 0.6);
      }
      while (schedule.length && schedule[0].at <= waveElapsed) { const s = schedule.shift()!; spawn(s.kind, s.lane); }
    }
    if (spawned.length) { enemies.push(...spawned); spawned.length = 0; }
    trainerSync();

    // --- waves
    // a wave ends when the field is clear (after waveMinS), or at waveMaxS
    if (baseHp > 0 && lull <= 0 && ((waveElapsed >= waveMin() && enemies.length === 0 && schedule.length === 0 && escorts.length === 0) || waveElapsed >= waveMax())) clearWave(waveElapsed < waveMax());

    if (baseHp <= 0) { baseHp = 0; endRun('fell'); }
  }

  function update(dt: Seconds) {
    if (!started) {
      started = true; lastRevs = ctx.bike().crankRevs;
      if (opts?.skipGarage || autopilot || save.runs === 0) startRun();
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
    ctx.debug('railCharges', railCharges);
    ctx.debug('enemies', enemies.length);
  }

  function persist() {
    bankKills();
    save.bestWave = bestWave(); // highest wave cleared (a Forward Base start counts from its start wave)
    save.bank = Math.round(bank);
    save.upgrades = levels;
    save.autoInvest = autoInvestOn;
    save.autoCrew = autoCrewOn;
    ctx.save({ ...save, totals: { ...save.totals }, upgrades: { ...levels } });
  }
  const bestWave = () => Math.max(save.bestWave, phase === 'run' ? wave - 1 : 0);
  let killsBanked = 0;
  function bankKills() { const k = kills.blue + kills.red + kills.purple + kills.gold; save.totals.kills += k - killsBanked; killsBanked = k; }

  // ---------- views ----------
  /** Shifters are always gears (they only change the trainer in the Gatling's sim mode). */
  const gearHints = (): ControlHint[] => [{ button: 'shiftersL', label: 'Gear', active: gearsLive() }, { button: 'shiftersR', label: 'Gear', active: gearsLive() }];
  const gearsLive = () => phase !== 'run' || weapon === 'gatling';
  const heldTouch = (kind: 'rail' | 'boost'): ControlHint['touch'] => ({
    down: { type: `${kind}Down`, epoch: inputEpoch }, up: { type: `${kind}Up`, epoch: inputEpoch }, cancel: { type: `${kind}Cancel`, epoch: inputEpoch },
  });
  const playControls = (): ControlHint[] => {
    const suggestion = lull > 0 && !constructionDone ? recommendation() : null;
    const order = suggestion?.tower ? `${({ tesla: 'Tesla', mortar: 'Mortar', lens: 'Lens' })[suggestion.tower]} Lv${suggestion.targetLevel}` : 'Repair';
    return [
      { button: 'a', label: suggestion ? `${order} · ${suggestion.cost} scrap` : 'Construction',
        touch: { down: { type: 'construct', epoch: inputEpoch, ...(suggestion ? { suggestion } : {}) } } },
      ...actionViews().map((a): ControlHint => ({ button: a.id === 'rail' ? 'z' : a.id === 'overcharge' ? 'b' : 'y',
        label: a.id === 'rail' ? `Rail ${railCharges}/${railCap()} (hold = all)` : `${a.id === 'overcharge' ? 'Overcharge' : 'Slow field'}${a.activeS > 0 ? ` · ${Math.ceil(a.activeS)}s` : ''}`, active: a.usable,
        ...(a.id === 'rail' ? { touch: heldTouch('rail') } : {}),
        cooldown: { fill: a.fill, ready: a.ready, tint: effortTint(ctx.bike().powerZone), flourish: effortFlourish(ctx.bike().powerZone) } })),
      { button: 'left', label: 'Nudge lane' }, { button: 'right', label: 'Nudge lane' },
      { button: 'up', label: boostAvailable() ? 'Sprint boost (hold)' : 'Clear lane nudge',
        ...(boostAvailable() ? { active: bossView()?.sprintBoost, touch: heldTouch('boost') } : {}) },
      { button: 'down', label: 'Workshop' },
      { button: 'paddles', label: 'Nudge lane' }, ...gearHints(),
    ];
  };
  function enemyView(e: Enemy): EnemyView {
    const el = elementOf(e), si = shiftIn(e);
    const shifting = e.kind === 'boss' || e.kind === 'prism';
    return {
      id: e.id, kind: e.kind, lane: e.lane, x: e.x, y: e.y, angle: e.angle, dist: e.dist, radius: radiusOf(e),
      element: el, gold: e.kind === 'boss', hp: e.hp, maxHp: e.maxHp, hurt: e.hurt, charging: e.charging,
      shiftIn: si, next: e.boss ? (e.boss.pending ? e.boss.colors[e.boss.phase + 1] : null) : shifting ? ELEMENTS[(ELEMENTS.indexOf(el) + 1) % 3] : null, progress: e.d / e.len,
      bossPhase: e.boss ? e.boss.phase + 1 : 0, telegraph: !!e.boss?.telegraph && !e.boss?.pending, exposed: !!e.boss?.exposed && !e.boss?.pending, staggerS: e.boss?.staggerS ?? 0,
    };
  }
  function bossView(): BossView | null {
    if (phase !== 'run') return null;
    const e = enemies.find((e) => !e.dead && e.boss);
    if (e?.boss) {
      const b = e.boss, color = elementOf(e);
      return { id: e.id, phase: b.phase + 1, phaseCount: b.colors.length, color, weapon: ELEMENT_WEAPON[color],
        next: b.pending ? b.colors[b.phase + 1] : null, countdownS: b.countdownS,
        telegraph: b.telegraph && !b.pending, exposed: b.exposed && !b.pending, windowLeftS: b.windowLeftS,
        sprintBoost: weapon === 'rail' && !b.pending && (b.telegraph || b.exposed) && !workshop &&
          ((!boostBlocked && ctx.input().held.has('up')) || boostPointers.size > 0) };
    }
    if (plan?.boss && (lull > 0 || schedule.some((s) => s.kind === 'boss'))) {
      return { id: 0, phase: 1, phaseCount: phaseColors.length, color: plan.brood, weapon: ELEMENT_WEAPON[plan.brood],
        next: null, countdownS: lull, telegraph: false, exposed: false, windowLeftS: 0, sprintBoost: false };
    }
    return null;
  }
  function broodView(): BroodView {
    const b = plan ? broodInfo({ ...plan, brood: WEAPON_ELEMENT[weapon] }) : { wave, color: WEAPON_ELEMENT[weapon], weapon, mode: 'sim' as const, setting: '', cue: '' };
    return { ...b, countdownS: phase === 'run' ? lull : 0, lullS: lullS(), rampS: rampS() };
  }
  function garageView(): GarageView {
    return { breatherLeft: garageBreather, bank: Math.round(bank), sel: garageSel, rows: garageRows(), startWave: fromWave, maxStartWave: mods.maxStartWave, autoLeft: garageAutostart() - garageT, autoS: garageAutostart(), autoInvest: autoInvestOn, bestWave: save.bestWave, runs: save.runs };
  }
  function workshopView(): WorkshopView | null {
    if (!workshop) return null;
    return { pad: workshop.pad, row: workshop.row, rows: workshopRows(workshop.pad), idleLeft: WORKSHOP_IDLE_S - workshop.idle, revision: workshopRevision };
  }
  function actionViews(): ActionView[] {
    const live = phase === 'run' && !workshop;
    return [
      { id: 'overcharge', fill: readyFrac(cooldowns.overcharge), ready: isReady(cooldowns.overcharge), usable: live && grid > 0 && towers.some(Boolean) && enemies.some(e => !e.dead), activeS: overchargeLeft },
      { id: 'slow', fill: readyFrac(cooldowns.slow), ready: isReady(cooldowns.slow), usable: live && enemies.some(e => !e.dead), activeS: slowLeft },
      { id: 'rail', fill: railCharges >= railCap() ? 1 : Math.min(1, railProgress), ready: railCharges > 0, usable: live && railCharges > 0, activeS: 0 },
    ];
  }

  return {
    update,
    isOver: () => false,
    inMenu: () => phase === 'garage' && (started || !(opts?.skipGarage || autopilot || save.runs === 0)),
    receive(action: unknown) {
      const a = action as { type?: unknown } | null;
      if (a?.type === 'inputCancel') { pending.length = 0; inputEpoch++; discardEdges = true; cancelHolds(); return; }
      if (a?.type === 'boostCancel') {
        cancelBoost();
        for (let i = pending.length - 1; i >= 0; i--) if (pending[i].type === 'boostDown' || pending[i].type === 'boostUp') pending.splice(i, 1);
        return;
      }
      if (a?.type === 'railCancel') {
        cancelRail();
        for (let i = pending.length - 1; i >= 0; i--) if (pending[i].type === 'railDown' || pending[i].type === 'railUp') pending.splice(i, 1);
        return;
      }
      if (a && typeof a.type === 'string' && pending.length < 32) pending.push({ ...a } as { type: string });
    },
    hud(): GameHud {
      if (phase === 'garage' && (started || !(opts?.skipGarage || autopilot || save.runs === 0))) return {
        gears: true, targetZone: { min: 2, max: 2, label: 'Warm up' },
        controls: [{ button: 'dpad', label: 'Choose' }, { button: 'a', label: 'Buy / start' }, { button: 'b', label: 'Start run' }, ...gearHints()],
      };
      const boss = bossView();
      const call = effort && (effort.state === 'active' || effort.state === 'announced') ? effort : null;
      const powerZone = (ftp: number): 1 | 2 | 3 | 4 | 5 => ftp < 0.56 ? 1 : ftp < 0.76 ? 2 : ftp < 0.91 ? 3 : ftp < 1.06 ? 4 : 5;
      const tz: GameHud['targetZone'] = boss?.exposed || boss?.telegraph
        ? { min: 5, max: 5, label: boss.exposed ? 'Exposed · sprint!' : `Sprint in ${Math.ceil(boss.windowLeftS)}s`, source: 'power' }
        : call ? { min: powerZone(call.minFtp), max: powerZone(call.maxFtp), label: call.state === 'announced' ? `${call.kind} in ${Math.ceil(call.countdownS)}s` : effortCue(call), source: 'power' }
        : lull > rampS() ? { min: 1, max: 2, label: `Recover · ${WEAPON_NAME[weapon]} next` }
        : weapon === 'rail' ? { min: 3, max: 4, label: 'Charge rail', source: 'power' } : { min: 2, max: 3, label: 'Power the towers' };
      const targetCadence: GameHud['targetCadence'] = call?.kind === 'spin' ? { min: call.minRpm, label: 'Spin up the Gatling' } : call?.kind === 'grind' ? { min: call.minRpm, max: call.maxRpm, label: 'Grind at power' } : undefined;
      if (workshop) return {
        gears: gearsLive(), targetZone: tz, targetCadence, touchControls: ['a', 'b'],
        controls: [{ button: 'dpad', label: '◀▶ pad · ▲▼ option' }, { button: 'a', label: 'Build / upgrade' }, { button: 'b', label: 'Close' }, { button: 'paddles', label: 'Nudge lane' }, ...gearHints()],
      };
      return { gears: gearsLive(), targetZone: tz, targetCadence, touchControls: ['a', 'down', ...(boostAvailable() ? ['up' as const] : []), 'b', 'y', 'z'], controls: playControls() };
    },
    snapshot(): TdSnapshot {
      return {
        t, phase, garage: phase === 'garage' ? garageView() : null,
        wave, waveElapsed, waveMaxS: waveMax(), wavesSurvived, lull,
        forecast: nextPlan ? { wave: nextPlan.wave, boss: nextPlan.boss, mainLane: nextPlan.mainLane, lanes: nextPlan.lanes } : { wave: 1, boss: false, mainLane: 1, lanes: [] },
        boss: bossView(), matchup: matchup(), effort: effort ? { ...effort } : null,
        brood: broodView(), nextBrood: nextPlan ? broodInfo(nextPlan) : null,
        baseHp, baseMaxHp, baseHurt,
        weapon, swapLeft, swapS: swapTotal,
        aimAngle: aim, targetId, nudge: nudge(),
        railCharges, railMaxCharges: railCap(), railProgress: Math.min(1, railProgress), railCharging, zHold, railDumpHoldS: railDumpHold(),
        flaming, flameRange: flameRange(), flameHalfAngle: flameHalf(), flamePower, laserId,
        grid, overdrive, stalled: stalled(), surge: surge ? { ...surge } : null, spin: spin ? { ...spin } : null, overclock,
        scrap, partsRun, bank: Math.round(bank),
        autoCrew: autoCrewOn, suggestion: phase === 'run' && lull > 0 && !constructionDone ? recommendation() : null, constructionDone,
        actions: actionViews(), refill: currentRefill, slowLane: slowLeft > 0 ? slowLane : -1, inputEpoch,
        towers: towers.filter((x): x is Tower => !!x).map((x): TowerView => ({ pad: x.pad, kind: x.kind, level: x.level, angle: x.angle, charge: clamp(1 - x.cd / TOWERS[x.kind].period, 0, 1), firedAt: x.firedAt })),
        shells: shells.map((s): ShellView => ({ x0: s.x0, y0: s.y0, x1: s.x1, y1: s.y1, k: s.t / s.flight })),
        workshop: workshopView(),
        enemies: enemies.map(enemyView), fx: fx.slice(), banner,
        cues: cues.slice(),
        over: false, bestWave: bestWave(), kills: { ...kills },
        hooks: { storm: false, surge: effort?.state === 'active',
          cadence: effort && (effort.state === 'active' || effort.state === 'announced') ? effort.kind === 'grind' ? (effort.minRpm + effort.maxRpm) / 2 : effort.kind === 'spin' ? effort.minRpm + 3 : undefined : undefined,
          powerFtp: effort?.targetFtp, shielded: bossView()?.exposed ?? false },
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
        towersBuilt: stats.towersBuilt, towerUpgrades: stats.towerUpgrades, towerKills: stats.towerKills, turretKills: stats.turretKills, empKills: stats.empKills,
        turretDamage: Math.round(dealt.player), towerDamage: Math.round(dealt.tower), empDamage: Math.round(dealt.emp),
        scrapEarned: stats.scrapEarned, partsEarned,
        surgesWon: stats.surgesWon, surgesFailed: stats.surgesFailed,
        spinsWon: stats.spinsWon, spinsFailed: stats.spinsFailed, overclockSeconds: Math.round(stats.overclockS),
        callsStarted: calls.started, callsWon: calls.won, callsFailed: calls.failed,
        ignitionBursts: stats.ignitionBursts,
        bossesKilled: stats.bosses, bestRunSurges,
        overdriveSeconds: Math.round(stats.overdriveS),
      };
    },
    dispose() { persist(); },
  };
}
