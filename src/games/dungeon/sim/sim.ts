import type { BikeState, Button, ControlHint, GameContext, GameHud, GameSim, InputState, Seconds } from '../../../contracts';
import { generateWorld, tileAt, TILE, type EnemyKind, type Room, type ShrineKind, type World } from './world';
import {
  ELEMENT_COLORS, RARITY_COLORS, SLOTS, UNIQUES, makeGear, makeUnique, makeWeapon, rollRarity, sellValue, starterWeapon, weaponScore,
  type Gear, type Rarity, type Slot, type Weapon,
} from './loot';
import { DEFAULT_ZONE_REFILL, completeCooldown, startCooldown, effortFlourish, effortTint, refillRate, tickCooldown } from '../../../core/cooldown';
import { DEFAULT_CFG, DEFAULT_TARGETS, newFloor, spinupCalled, stepDirector, type DirectorCfg, type DirectorState, type Seg } from './director';
import { sprintBreak, DEFAULT_BOSS, bossDamageMult, bossStunned, newBoss, strikeBoss, stepBoss, tideBonus, type BossCfg, type BossState } from './boss';
import { STANCES, stanceOfStyle, stancesFor, styleActive, stylesFor, suggestStance, type StanceId } from './stances';
import { clearLine, cadenceSpeed, findPath, readyFrac, shouldAutoPotion, standoff, type ActionId, type Cooldown } from './ai';
import { RETIRED, UPGRADES, spentOn, autoInvest, lvl, metaMods, upgradeCost, type Levels, type MetaMods } from './meta';
import type { BulletView, CampView, CurseKind, CurseView, DropView, DungeonSnapshot, EliteMod, EnemyView, Fx, Hazard, ShrineView, Toast } from './types';

interface Enemy {
  id: number; kind: EnemyKind | 'boss'; x: number; y: number; r: number; hp: number; maxHp: number;
  speed: number; contact: number; contactCd: number; fireCd: number; fireCd2: number; room: number; alive: boolean; spin: number;
  hurtT: number; slowT: number; dotT: number; dotDps: number; tell: number; state: number; vx: number; vy: number; xp: number; wob: number;
  summoned: number; variant: number; elite: EliteMod | null; shield: number; shieldMax: number; orbitCd: number;
}
interface Bullet {
  x: number; y: number; vx: number; vy: number; r: number; dmg: number; life: number; age: number; friendly: boolean;
  w?: Weapon; hits?: number[]; pierce: number; bounce: number; crit?: boolean; child?: boolean; ric?: number;
}
interface Drop extends DropView { item?: Weapon | Gear; value: number }
interface Ctl { mx: number; my: number; roll: boolean }
interface Shrine { room: number; kind: ShrineKind; x: number; y: number; state: ShrineView['state']; progress: number; left: number; s0: number }

const ENEMY_DEF: Record<EnemyKind, { hp: number; speed: number; r: number; contact: number; xp: number }> = {
  chaser:   { hp: 40, speed: 2.8, r: 0.4, contact: 8, xp: 4 },
  bat:      { hp: 22, speed: 3.8, r: 0.32, contact: 5, xp: 3 },
  spitter:  { hp: 65, speed: 1.6, r: 0.42, contact: 5, xp: 6 },
  archer:   { hp: 50, speed: 2.0, r: 0.38, contact: 5, xp: 6 },
  brute:    { hp: 170, speed: 1.4, r: 0.62, contact: 14, xp: 12 },
  bomber:   { hp: 35, speed: 3.3, r: 0.36, contact: 0, xp: 5 },
  summoner: { hp: 90, speed: 1.4, r: 0.42, contact: 5, xp: 10 },
};
const ELITES: EliteMod[] = ['undying', 'splitting', 'shielded', 'swift', 'volatile'];
const SEG_BANNER: Partial<Record<string, string>> = { warmup: 'WARM UP', explore: 'EXPLORE · ZONE 2', recover: 'RECOVER', cooldown: 'COOL DOWN' };
const BOSS_NAMES = ['Slime Monarch', 'Bone Lord', 'Ogre Warchief', 'The Lich', 'Bone King', 'Frost Wyrm'];
export const BOSS_COUNT = BOSS_NAMES.length;
const SHRINES: Record<ShrineKind, { label: string; window: number; color: string }> = {
  fury: { label: 'Shrine of Fury: ride power Z3+ for 20s', window: 50, color: '#ff8c2a' },
  endurance: { label: 'Shrine of Patience: hold Z2, treasure grows', window: 90, color: '#5aa9ff' },
  sprint: { label: 'Shrine of Gold: sprint twice', window: 60, color: '#ffd84a' },
  whirl: { label: 'Shrine of the Whirlwind: spin fast (easy gear) for 15s', window: 45, color: '#8fd8ff' },
};
// Curses: temporary difficulty spikes. While cursed you earn +50% coins/XP; surviving (or breaking it with a sprint) pays a bounty.
const CURSES: Record<CurseKind, { name: string; desc: string; color: string; dur: number }> = {
  frenzy:   { name: 'Curse of Frenzy',   desc: 'enemies move 40% faster',        color: '#ff5a5a', dur: 60 },
  hexed:    { name: 'Hex of Frailty',    desc: 'you take 40% more damage',       color: '#c77dff', dur: 60 },
  swarm:    { name: 'Curse of the Swarm', desc: 'rooms spawn extra foes',        color: '#ffb02a', dur: 75 },
  darkness: { name: 'Curse of Darkness', desc: 'the torchlight shrinks',         color: '#6a6aff', dur: 60 },
  mire:     { name: 'Curse of the Mire', desc: '+2% grade, slower feet',         color: '#7a9a3a', dur: 45 },
  fragile:  { name: 'Curse of Thirst',   desc: 'no zone-2 healing',              color: '#ff6b8a', dur: 60 },
  bulwark:  { name: 'Curse of Iron',     desc: 'enemies take 35% less damage',   color: '#9aa3b5', dur: 60 },
};
const CURSE_KINDS = Object.keys(CURSES) as CurseKind[];
const PLAYER_R = 0.35, MAX_FX = 140;
/** The hero's body against walls (slightly slimmer than its hit radius, so it fits 1-tile corridors with slack). */
const HERO_WALL_R = 0.3;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** Distance from point p to segment a-b (swept projectile hits). */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
  const k = l2 > 0 ? clamp(((px - ax) * vx + (py - ay) * vy) / l2, 0, 1) : 0;
  return Math.hypot(px - ax - vx * k, py - ay - vy * k);
}

/** Longest hit-stop (s). Longer stops (the old 0.5 s boss intro, 0.8 s boss death) read to riders as the game freezing. */
const HIT_STOP_MAX = 0.1;
const DX4 = [1, -1, 0, 0], DY4 = [0, 0, 1, -1];

export interface DungeonOpts { seed?: number; autopilot?: boolean; floor?: number; skipCamp?: boolean; stance?: StanceId; erg?: boolean; actionBot?: boolean; invulnerable?: boolean }
export interface DungeonTotals { runs: number; deaths: number; floors: number; bosses: number; coins: number }
export interface DungeonSave {
  ver?: number; bank?: number; upgrades?: Levels; bestFloor?: number; runs?: number; autoInvest?: boolean;
  stance?: StanceId; stancesUnlocked?: StanceId[]; totals?: DungeonTotals; erg?: boolean;
}
export const SAVE_VER = 2;
/** Upgrade an old save in place: v1 -> v2 refunds retired upgrades (Swiftness) as coins and adds totals. Pure. */
export function migrateSave(s: DungeonSave | null | undefined): DungeonSave {
  const out: DungeonSave = { ...(s ?? {}) };
  out.upgrades = { ...(out.upgrades ?? {}) };
  if ((out.ver ?? 1) < 2) {
    const ups = out.upgrades as Record<string, number>;
    for (const [id, def] of Object.entries(RETIRED)) if (ups[id]) { out.bank = (out.bank ?? 0) + spentOn(def, ups[id]); delete ups[id]; }
    out.totals = out.totals ?? { runs: out.runs ?? 0, deaths: 0, floors: 0, bosses: 0, coins: 0 };
  }
  out.ver = SAVE_VER;
  return out;
}

const ACTION_BUTTON: Record<ActionId, 'a' | 'b' | 'y' | 'z'> = { strike: 'a', ward: 'b', rally: 'y', potion: 'z' };
const ACTION_LABEL: Record<ActionId, string> = { strike: 'Strike', ward: 'Ward', rally: 'Rally', potion: 'Potion' };

export function createDungeonSim(ctx: GameContext, opts?: DungeonOpts): GameSim {
  const autopilot = !!opts?.autopilot;
  const tn = ctx.tuning;
  const baseSpeed = tn.num('baseSpeed', 4.2, 1, 10, 0.1, 'tiles/s at 90 rpm');
  const spd0 = tn.num('speedAt0rpm', 0.35, 0, 2, 0.05);
  const spd60 = tn.num('speedAt60rpm', 1.0, 0, 2, 0.05);
  const spd90 = tn.num('speedAt90rpm', 1.0, 0, 2, 0.05);
  const spd110 = tn.num('speedAt110rpm', 1.15, 0, 2, 0.05);
  const revsPerShot = tn.num('revsPerShot', 0.5, 0.1, 4, 0.05, 'crank revs per shot at weapon rate 1');
  const baseDamage = tn.num('baseDamage', 10, 1, 100, 1, 'x weapon dmg x clamp(ftpFraction,0.3,2.5)');
  const regenPerS = tn.num('regenPerS', 2, 0, 20, 0.5, 'HP/s per 100 max HP in zone 2 out of combat');
  const regenCombat = tn.num('regenInCombatFrac', 0, 0, 1, 0.05, 'zone-2 regen multiplier while enemies are awake (floor 1 always 0.5)');
  const enemyDmgGrowth = tn.num('enemyDamageGrowth', 1.45, 1, 2, 0.01, 'enemy damage multiplier per floor');
  const furyAfter = tn.num('bossFuryAfterS', 60, 20, 600, 10, 'boss damage starts climbing after this long in the fight (not on floor 1)');
  const furyRate = tn.num('bossFuryRate', 0.03, 0, 0.05, 0.001, 'extra boss-fight damage per second past bossFuryAfterS (max +150%)');
  const bossHpGrowth = tn.num('bossHpGrowth', 1.5, 1, 2, 0.01, 'boss HP multiplier per floor (floor 1 boss is x0.55)');
  const floor1Ease = tn.num('floor1Ease', 0.35, 0.3, 1, 0.05, 'enemy damage multiplier on floor 1 (keeps the warm-up floor gentle)');
  const strikeCd = tn.num('strikeCdS', 30, 2, 120, 1, 'Strike (A) cooldown');
  const strikeMult = tn.num('strikeDamageMult', 4, 1, 30, 0.5, 'Strike damage as a multiple of one shot');
  const strikeRadius = tn.num('strikeRadius', 3.5, 1, 8, 0.25, 'tiles');
  const wardCd = tn.num('wardCdS', 45, 2, 120, 1, 'Ward (B) cooldown');
  const wardDur = tn.num('wardDurS', 2, 0.5, 10, 0.5, 'Ward blocks all damage for this long');
  const rallyCd = tn.num('rallyCdS', 35, 2, 120, 1, 'Rally (Y) cooldown; only usable when a spin-up is called');
  const rallyDur = tn.num('rallyDurS', 10, 1, 30, 1);
  const rallyMult = tn.num('rallyFireMult', 1.5, 1, 3, 0.05, 'fire-rate multiplier while Rally is up');
  const rollCd = tn.num('aiRollCdS', 2, 0.5, 10, 0.5, 'the AI rolls out of a crowd when hurt (0.3 s invulnerable); this is its cooldown');
  const potionCd = tn.num('potionCdS', 6, 0, 30, 0.5, 'Potion (Z) cooldown');
  const zoneRates = [1, 0, 0, 0, 0, 0];
  const zoneRefill = [1, 2, 3, 4, 5].map((z) => tn.num(`cdRefillZ${z}`, DEFAULT_ZONE_REFILL[z], 0.1, 10, 0.1, `cooldown refill speed at power zone ${z} (x base)`));
  const sprintCompletes = tn.bool('cdSprintCompletes', true, 'a detected sprint finishes every refilling action');
  const stanceCommitT = tn.num('stanceCommitS', 0.4, 0.1, 2, 0.05, 'D-pad cycling is free; the stance commits this long after the last press');
  const stanceSwapT = tn.num('stanceSwapS', 0.5, 0, 5, 0.1, 'no attacks while the committed stance swaps in');
  const styleSettleT = tn.num('styleSettleS', 3, 0, 20, 0.5, 'a stance style bonus starts this long after the stance swaps in (no bonus from rapid swapping)');
  const styleAmt = tn.num('styleBonus', 0.03, 0, 0.5, 0.01, 'stance style bonus in its cadence band (power must be zone 2+)');
  const stanceDropBias = tn.num('stanceDropBias', 0.6, 0, 1, 0.05, 'share of weapon drops rolled for the current stance');
  const cadRef = tn.num('dmgCadenceRef', 90, 0, 140, 1, 'shots come per crank rev; per-shot damage x ref/cadence (clamped 0.8-1.5) so damage per second follows power, not cadence (0 = off)');
  const potionHeal = tn.num('potionHeal', 0.38, 0.1, 1, 0.05, 'fraction of max HP');
  const autoPotionFrac = tn.num('autoPotionHpFrac', 0.35, 0, 0.9, 0.05, 'AI drinks below this HP fraction if the rider has not drunk in the last 10 s');
  const maxHpT = tn.num('playerHp', 100, 20, 500, 10);
  const enemyDmgScale = tn.num('enemyDamageScale', 1.9, 0.1, 3, 0.1);
  const enemyHpMult = tn.num('enemyHpMult', 1.5, 0.2, 5, 0.1, 'base enemy HP multiplier');
  const enemyHpGrowth = tn.num('enemyHpGrowth', 1.32, 1, 2, 0.01, 'enemy HP multiplier per floor');
  const bossHpT = tn.num('bossHp', 4500, 100, 20000, 50, 'base boss HP (x enemyHpMult, x bossHpGrowth per floor)');
  const sprintMult = tn.num('bossSprintDamageMult', 2, 1, 5, 0.1, 'extra damage for sprinting (or the ERG surge) while the boss is exposed');
  const bossTn = {
    p2: tn.num('bossPhase2Hp', DEFAULT_BOSS.phaseSplits[0], 0.1, 0.95, 0.01), p3: tn.num('bossPhase3Hp', DEFAULT_BOSS.phaseSplits[1], 0.05, 0.9, 0.01),
    bigEveryS: tn.num('bossBigEveryS', DEFAULT_BOSS.bigEveryS, 6, 60, 1, 'idle seconds before the telegraphed big attack (phase 1; -3 s per phase)'),
    windupS: tn.num('bossWindupS', DEFAULT_BOSS.windupS, 0.5, 5, 0.1),
    exposedS: tn.num('bossExposedS', DEFAULT_BOSS.exposedS, 1, 15, 0.5, 'stun window after the big attack'),
    exposedMult: tn.num('bossExposedMult', DEFAULT_BOSS.exposedMult, 1, 5, 0.1),
    strikeBonusS: tn.num('bossStrikeBonusS', DEFAULT_BOSS.strikeBonusS, 0, 5, 0.5), parryBonusS: tn.num('bossParryBonusS', DEFAULT_BOSS.parryBonusS, 0, 5, 0.5),
    tideAfterS: tn.num('bossTideAfterS', DEFAULT_BOSS.tideAfterS, 30, 600, 10, 'Turning Tide starts after this long on the boss'),
    tideRate: tn.num('bossTideRate', DEFAULT_BOSS.tideRate, 0, 0.05, 0.001, 'extra boss damage taken per second of tide'),
  };
  const bossCfg = (): BossCfg => ({ ...DEFAULT_BOSS, phaseSplits: [bossTn.p2(), Math.min(bossTn.p3(), bossTn.p2() - 0.05)], bigEveryS: bossTn.bigEveryS(), windupS: bossTn.windupS(),
    exposedS: bossTn.exposedS(), exposedMult: bossTn.exposedMult(), strikeBonusS: bossTn.strikeBonusS(), parryBonusS: bossTn.parryBonusS(), tideAfterS: bossTn.tideAfterS(), tideRate: bossTn.tideRate() });
  const itemDropPct = tn.num('itemDropPct', 10, 0, 100, 1, '% chance an enemy drops a weapon/gear');
  const uniquePct = tn.num('uniqueDropPct', 0.6, 0, 100, 0.1, '% of item drops that are uniques (elites x1.5, bosses x10)');
  const eliteBase = tn.num('eliteChance', 0.05, 0, 1, 0.01, 'elite chance on floor 1 (+1.5%/floor, max 25%)');
  const curseChance = tn.num('curseChance', 0.08, 0, 1, 0.01, 'chance per uncleared room entered (+1%/floor, max 20%)');
  const curseGrade = tn.num('gradeCurseMire', 2, 0, 8, 0.5, 'extra grade during Curse of the Mire');
  const sprintHeal = tn.num('sprintHealFrac', 0.45, 0, 1, 0.05, 'a sprint heals this fraction of max HP (Second breath)');
  const sprintGuard = tn.num('sprintGuard', 0.6, 0, 1, 0.05, 'damage taken is cut by this fraction while sprinting');
  const sprintBreakS = tn.num('bossSprintBreakS', 4, 0, 10, 0.5, 'a sprint started while the boss is idle exposes it for this long');
  const fireS = tn.num('sprintFiredUpS', 90, 0, 120, 5, 'after a sprint the hero is Fired Up for this long');
  const fireMult = tn.num('sprintFiredUpDmg', 2, 1, 3, 0.05, 'damage multiplier while sprinting or Fired Up');
  const sprintSw = tn.num('sprintSecondWindS', 120, 0, 600, 10, 'a sprint takes this many seconds off the Second Wind recharge');
  const swCdT = tn.num('secondWindCdS', 540, 30, 1800, 10, 'Second Wind recharge at base rate (zone 1); 540 = about 6 min of zone 2 at the 1.5x refill');
  const swHeal = tn.num('secondWindHeal', 0.5, 0.1, 1, 0.05, 'Second Wind heals this fraction of max HP');
  const swInvuln = tn.num('secondWindInvulnS', 1, 0, 3, 0.1);
  const campAutoS = tn.num('campAutoStartS', 45, 5, 300, 5, 'camp starts the next descent after this long');
  const dirTn = {
    warmupS: tn.num('paceWarmupS', DEFAULT_CFG.warmupS, 0, 600, 10, 'warm-up on the first floor of a run'),
    ambushS: tn.num('paceAmbushS', DEFAULT_CFG.ambushS, 10, 120, 5, 'ambush effort length (Z3-4)'),
    recoverS: tn.num('paceRecoverS', DEFAULT_CFG.recoverS, 0, 300, 5),
    spinupS: tn.num('paceSpinupS', DEFAULT_CFG.spinupS, 5, 60, 1, 'called spin-up length (>100 rpm)'),
    firstAmbushAtS: tn.num('paceFirstAmbushS', DEFAULT_CFG.firstAmbushAtS, 0, 600, 5),
    spinupAfterS: tn.num('paceSpinupAfterS', DEFAULT_CFG.spinupAfterS, 0, 300, 5),
    secondEffortMin: tn.num('paceSecondEffortMin', DEFAULT_CFG.secondEffortMin, 0, 180, 5, 'ride minutes after which floors get a 2nd ambush'),
    spinRpm: tn.num('paceSpinRpm', DEFAULT_CFG.spinRpm, 80, 140, 1),
  };
  const segTn = Object.fromEntries((Object.keys(DEFAULT_TARGETS) as Seg[]).map((k) => [k, {
    erg: tn.num(`erg_${k}`, DEFAULT_TARGETS[k].erg, 0.3, 1.5, 0.01, `ERG target (FTP fraction) during ${k}`),
    grade: tn.num(`grade_${k}`, DEFAULT_TARGETS[k].grade, -5, 10, 0.5, `grade offset during ${k}`) }])) as Record<Seg, { erg: () => number; grade: () => number }>;
  // built at most once per tick (update() clears it): it was rebuilt several times a tick, the largest per-tick allocation
  // and is now reused across ticks unless a tuning value actually changed (it was ~8% of all allocation)
  let cfgMemo: DirectorCfg | null = null, cfgFresh = false;
  const dirFns = Object.values(dirTn) as Array<() => number>, segKeys = Object.keys(DEFAULT_TARGETS) as Seg[];
  const cfgSig = new Float64Array(dirFns.length + 2 * segKeys.length);
  const cfgChanged = (): boolean => {
    let ch = false, i = 0;
    for (const f of dirFns) { const v = f(); if (v !== cfgSig[i]) { cfgSig[i] = v; ch = true; } i++; }
    for (const k of segKeys) for (const v of [segTn[k].erg(), segTn[k].grade()]) { if (v !== cfgSig[i]) { cfgSig[i] = v; ch = true; } i++; }
    return ch;
  };
  const dirCfg = (): DirectorCfg => { if (!cfgFresh) { cfgFresh = true; if (cfgChanged()) cfgMemo = null; } return cfgMemo ??= buildCfg(); };
  const buildCfg = (): DirectorCfg => ({
    ...(Object.fromEntries(Object.entries(dirTn).map(([k, f]) => [k, f()])) as Omit<DirectorCfg, 'targets'>),
    targets: Object.fromEntries((Object.keys(DEFAULT_TARGETS) as Seg[]).map((k) => [k, { ...DEFAULT_TARGETS[k], erg: segTn[k].erg(), grade: segTn[k].grade() }])) as DirectorCfg['targets'],
  });
  const ambushN = tn.num('ambushEnemies', 4, 1, 12, 1, 'extra enemies in an ambush (+1 per 3 floors)');
  const ergSurge = tn.num('ergBossSurge', 1.15, 0.8, 2, 0.05, 'ERG target (FTP fraction) while the boss shield is up: the called surge');
  const spinGoodFrac = tn.num('spinupGoodFrac', 0.5, 0, 1, 0.05, 'share of a called spin-up above the rpm that counts as answered');
  const campGrade = tn.num('gradeCamp', 0, -5, 10, 0.5, 'camp is cool-down: flat road');
  const terrainGrade = tn.num('gradeTerrain', 1, 0, 10, 0.5);
  const swampGrade = tn.num('gradeSwamp', 4, 0, 12, 0.5);
  const woundedGrade = tn.num('gradeWounded', 2, 0, 10, 0.5);
  const woundedFrac = tn.num('woundedHpFrac', 0.4, 0.1, 0.9, 0.05);
  const surgeGrade = tn.num('gradeBossSurge', 5, 0, 12, 0.5);
  const whirlRpm = tn.num('whirlRpm', 95, 60, 140, 1, 'Whirlwind shrine cadence floor (rpm)');

  const rng = () => ctx.rng();

  // ---------- meta (persisted across runs) ----------
  const saved = migrateSave(ctx.load<DungeonSave>());
  const totals: DungeonTotals = { runs: 0, deaths: 0, floors: 0, bosses: 0, coins: 0, ...(saved.totals ?? {}) };
  const levels: Levels = { ...(saved.upgrades ?? {}) };
  let bankStart = saved.bank ?? 0, bestFloor = saved.bestFloor ?? 1, runs = saved.runs ?? 0, autoInvestOn = saved.autoInvest ?? true;
  let mods: MetaMods = metaMods(levels, bestFloor);
  let startFloor = opts?.floor ?? mods.maxStartFloor; // defaults to the deepest unlocked start; lower it at camp
  let sprintingNow = false, firedUpUntil = -1;
  let phase: 'camp' | 'run' = 'camp', campSel = 0, campT = 0;
  let erg = opts?.erg ?? !!saved.erg, dir: DirectorState = newFloor(true), firstFloorOfRun = true, spinGood = 0;
  let swCd: Cooldown = { left: 0, total: 0 }; let swUsedT = -99, secondWinds = 0, deepest = 1, topLevel = 1, earnedPrev = 0, lastDeath: CampView['lastDeath'];
  const pending: Array<{ type: 'campRow'; row: number }> = []; // taps from the renderer

  // ---------- hero ----------
  const P = {
    x: 0, y: 0, hp: 0, maxHp: 0, potions: 3, ward: 0, rally: 0, lastPotionT: -99, rollCd: 0, rollT: 0, rollDx: 0, rollDy: 0,
    invuln: 0, hurtT: -99, aim: 0, lastShotRevs: ctx.bike().crankRevs, onSwamp: false, speedMult: 1, moveAng: 0, moving: false, targetId: 0,
    level: 1, xp: 0, coins: 0, coinsEarned: 0, shots: 0,
  };
  let weapon: Weapon = starterWeapon();
  let stance: StanceId = opts?.stance ?? saved.stance ?? 'ranger';
  const slots = {} as Record<StanceId, Weapon>;
  function fillSlots(level: number) {
    slots.ranger = weapon;
    for (const id of ['vanguard', 'skirmisher', 'arcanist'] as StanceId[]) slots[id] = level > 1 ? makeWeapon(rng, level, 1, STANCES[id].starter) : makeWeapon(rng, 1, 0, STANCES[id].starter);
    if (!stancesFor(mods.arcanist).includes(stance)) stance = 'ranger';
    weapon = slots[stance];
  }
  let swapT = 0, swapTo: StanceId | null = null, pick: StanceId | null = null, pickT = 0, stanceSince = -99, styleOn = false, suggestion: StanceId | null = null;
  const sb = (k: string) => (styleOn && STANCES[stance].bonus === k ? 1 + styleAmt() : 1);
  const gear: Partial<Record<Slot, Gear>> = {};
  let bestFind: Weapon | Gear = weapon;
  const tapped: ActionId[] = [];
  let lastRate = 1, lastSprints = ctx.bike().sprintCount;
  const cds: Record<ActionId, Cooldown> = { strike: { left: 0, total: 1 }, ward: { left: 0, total: 1 }, rally: { left: 0, total: 1 }, potion: { left: 0, total: 1 } };
  const CD_KEYS = Object.keys(cds) as ActionId[];
  const xpNext = (L: number) => Math.round(30 * Math.pow(1.32, L - 1));
  const gearSum = (k: keyof Gear['stats']) => SLOTS.reduce((a, s) => a + (gear[s]?.stats[k] ?? 0), 0);
  function recomputeHp(heal: boolean) {
    const frac = P.maxHp > 0 ? P.hp / P.maxHp : 1;
    P.maxHp = (maxHpT() + 10 * (P.level - 1) + gearSum('maxHp')) * mods.hpMult;
    P.hp = heal ? P.maxHp : clamp(frac * P.maxHp, 1, P.maxHp);
  }

  // ---------- floor state ----------
  let floor = startFloor;
  let world!: World;
  let enemies: Enemy[] = [];
  let boss!: Enemy;
  let shrines: Shrine[] = [];
  let current = 0, safeRoom = 0, bossStarted = false, bossT = 0, hitT = 0;
  let bs: BossState = newBoss();
  let curse: { kind: CurseKind; left: number; total: number; s0: number } | null = null, cursesSurvived = 0;
  const cursed = (k: CurseKind) => curse?.kind === k;
  const bounty = () => (curse ? 1.5 : 1);
  const bullets: Bullet[] = [];
  const drops: Drop[] = [];
  const hazards: Array<Hazard & { dmg: number }> = [];
  const fx: Fx[] = [];
  const toasts: Toast[] = [];
  const cues: Array<{ name: string; id: number }> = [];
  let nextId = 1, cueId = 0;
  let t = 0, kills = 0, deaths = 0, damageDealt = 0, output = 0, fightT = 0, roomsCleared = 0, bossDefeated = 0, floorsCleared = 0, elitesSlain = 0, uniquesFound = 0;
  let navPath: Array<{ x: number; y: number }> = [], navKey = '', navAge = 99, navChk = 0, stuckStats = 0, exploring = false;
  /** Movement-flow instrumentation (headless metrics/tests; cheap counters only). */
  const fstat = { exploreT: 0, speedSum: 0, slowT: 0, wallT: 0, corridorT: 0, corridorSpeedSum: 0, offCenterT: 0, overshootT: 0 };
  let navPrev: { x: number; y: number } | null = null;
  let flow: Int16Array = new Int16Array(0), flowQ = new Int32Array(0), flowKey = -1;

  const hpMul = () => enemyHpMult() * Math.pow(enemyHpGrowth(), floor - 1);
  const dmgMul = () => (floor === 1 ? floor1Ease() : Math.pow(enemyDmgGrowth(), floor - 1));
  function spawnEnemy(kind: EnemyKind, x: number, y: number, room: number): Enemy {
    const d = ENEMY_DEF[kind], hp = d.hp * hpMul();
    const e: Enemy = {
      id: nextId++, kind, x, y, r: d.r, hp, maxHp: hp, speed: d.speed, contact: d.contact * dmgMul(), contactCd: 0,
      fireCd: 0.8 + rng() * 1.5, fireCd2: 2 + rng() * 2, room, alive: true, spin: 0, hurtT: -99, slowT: 0, dotT: 0, dotDps: 0,
      tell: 0, state: 0, vx: 0, vy: 0, xp: d.xp * (1 + 0.3 * (floor - 1)), wob: rng() * 6, summoned: 0, variant: 0,
      elite: null, shield: 0, shieldMax: 0, orbitCd: 0,
    };
    enemies.push(e);
    return e;
  }
  function makeElite(e: Enemy, mod: EliteMod) {
    e.elite = mod; e.maxHp *= 2.6; e.hp = e.maxHp; e.r *= 1.25; e.xp *= 3; e.contact *= 1.3;
    if (mod === 'swift') e.speed *= 1.7;
    if (mod === 'shielded') { e.shieldMax = e.maxHp * 0.4; e.shield = e.shieldMax; }
  }
  function buildFloor() {
    world = generateWorld(rng, floor);
    enemies = []; bullets.length = 0; drops.length = 0; hazards.length = 0;
    const eliteChance = Math.min(0.25, eliteBase() + 0.015 * (floor - 1));
    for (const room of world.rooms) for (const s of room.spawns) {
      const e = spawnEnemy(s.kind, s.x, s.y, room.id);
      if (rng() < eliteChance) makeElite(e, ELITES[Math.floor(rng() * ELITES.length)]);
    }
    const br = world.rooms.find((r) => r.boss)!;
    const hp = bossHpT() * enemyHpMult() * Math.pow(bossHpGrowth(), floor - 1) * (floor === 1 ? 0.55 : 1);
    boss = spawnEnemy('chaser', br.x0 + br.w / 2, br.y0 + br.h / 2 + 1, br.id);
    Object.assign(boss, { kind: 'boss', r: 1.1, hp, maxHp: hp, speed: 1.1, contact: 18 * dmgMul(), fireCd: 2, fireCd2: 1.2, xp: 120 * (1 + 0.3 * (floor - 1)), variant: (floor - 1) % BOSS_NAMES.length });
    shrines = world.rooms.filter((r) => r.shrine).map((r) => ({ room: r.id, kind: r.shrine!.kind, x: r.shrine!.x, y: r.shrine!.y, state: 'idle' as const, progress: 0, left: 0, s0: 0 }));
    current = 0; safeRoom = 0; bossStarted = false; bossT = 0; bs = newBoss(); navPath = []; navKey = ''; flowKey = -1;
    P.x = world.spawn.x; P.y = world.spawn.y;
    markSeen(world.rooms[0]);
  }
  function markSeen(r: Room) { r.seen = true; for (const n of world.adj[r.id]) world.rooms[n].seen = true; }
  buildFloor();

  function persist() {
    ctx.save({ ver: SAVE_VER, bank: Math.round(bankStart + P.coinsEarned), upgrades: { ...levels }, bestFloor, runs, autoInvest: autoInvestOn,
      stance, stancesUnlocked: stancesFor(mods.arcanist), erg, totals: { ...totals, coins: totals.coins + P.coinsEarned } } satisfies DungeonSave);
  }

  // ---------- fx / sound ----------
  function addFx(f: Omit<Fx, 't0'>): Fx { const o = { ...f, t0: t }; fx.push(o); if (fx.length > MAX_FX) fx.splice(0, fx.length - MAX_FX); return o; }
  function toast(text: string, color = '#fff') { toasts.push({ text, color, t0: t }); if (toasts.length > 5) toasts.shift(); }
  function cue(name: string) { cues.push({ name, id: ++cueId }); if (cues.length > 40) cues.shift(); }
  /** Hit-stop, capped at HIT_STOP_MAX: the sim (and so every animation) stops, so anything longer looks like a hang. */
  function freeze(s: number) { hitT = Math.max(hitT, Math.min(s, HIT_STOP_MAX)); }

  // ---------- resistance (only sets on change) ----------
  const resState = new Map<string, number | null>();
  function resSync(id: string, grade: number | null) {
    if (resState.get(id) === grade) return;
    resState.set(id, grade);
    if (grade === null) ctx.resistance.clear(id); else ctx.resistance.set({ id, mode: 'sim', gradePct: grade });
  }

  /** Grade mode: shifters drive virtual gears and the game adds grade. ERG: the trainer holds the segment's power; no gears. */
  function applyMode() {
    resState.clear(); ctx.resistance.clearAll();
    ctx.resistance.useVirtualGears(!erg); // shifters are gears only (and unused in ERG); actions live on A/B/Y/Z
  }
  applyMode();
  function ergSync(f: number) {
    if (resState.get('pace') === f) return;
    resState.set('pace', f); ctx.resistance.set({ id: 'pace', mode: 'erg', ftpFraction: f });
  }

  // ---------- geometry ----------
  const doorLocked = (tx: number, ty: number) => {
    const rid = world.doorRoom[ty * world.w + tx];
    return rid !== undefined && world.rooms[rid].locked;
  };
  /** Blocks projectiles. */
  const solid = (tx: number, ty: number) => {
    const k = tileAt(world, tx, ty);
    return k === TILE.WALL || (k === TILE.DOOR && doorLocked(tx, ty));
  };
  /** Blocks walking (adds pits and braziers). */
  const walkSolid = (tx: number, ty: number) => {
    const k = tileAt(world, tx, ty);
    return k === TILE.PIT || k === TILE.PILLAR || solid(tx, ty);
  };
  const blocked = (x: number, y: number, r: number) =>
    walkSolid(Math.floor(x - r), Math.floor(y - r)) || walkSolid(Math.floor(x + r), Math.floor(y - r)) ||
    walkSolid(Math.floor(x - r), Math.floor(y + r)) || walkSolid(Math.floor(x + r), Math.floor(y + r));
  /** Axis-separated move; when one axis is blocked, nudge toward the tile centre on the other axis so corners don't snag.
   *  A body already overlapping a wall (knockback, rolls, spawn) is eased back toward its tile centre first, so it can't wedge. */
  function move(e: { x: number; y: number }, dx: number, dy: number, r: number) {
    if (blocked(e.x, e.y, r)) {
      const step = Math.max(Math.abs(dx), Math.abs(dy), 0.02);
      const cx = Math.floor(e.x) + 0.5, cy = Math.floor(e.y) + 0.5;
      if (!walkSolid(Math.floor(e.x), Math.floor(e.y))) { e.x += clamp(cx - e.x, -step, step); e.y += clamp(cy - e.y, -step, step); }
      if (blocked(e.x, e.y, r)) return;
    }
    if (dx && blocked(e.x + dx, e.y, r)) {
      const cy = Math.floor(e.y) + 0.5, n = clamp(cy - e.y, -Math.abs(dx), Math.abs(dx));
      if (Math.abs(dy) <= Math.abs(dx) && n && !blocked(e.x, e.y + n, r)) { e.y += n; dy = 0; }
    } else e.x += dx;
    if (dy && blocked(e.x, e.y + dy, r)) {
      const cx = Math.floor(e.x) + 0.5, n = clamp(cx - e.x, -Math.abs(dy), Math.abs(dy));
      if (Math.abs(dx) <= Math.abs(dy) && n && !blocked(e.x + n, e.y, r)) e.x += n;
    } else e.y += dy;
  }
  const inRoom = (room: Room, x: number, y: number, inset: number) =>
    x >= room.x0 + inset && x <= room.x0 + room.w - inset && y >= room.y0 + inset && y <= room.y0 + room.h - inset;
  const activeRoom = () => world.rooms[current];
  const isLive = (e: Enemy, rid: number) => e.alive && e.room === rid && (e.kind !== 'boss' || bossStarted);
  const liveInRoom = (rid: number) => enemies.filter((e) => isLive(e, rid));
  const liveCount = (rid: number) => { let n = 0; for (const e of enemies) if (isLive(e, rid)) n++; return n; };

  /** Room-local BFS distance field from the player, so melee enemies walk around pits and braziers. */
  function updateFlow() {
    const r = activeRoom();
    const px = clamp(Math.floor(P.x), r.x0, r.x0 + r.w - 1), py = clamp(Math.floor(P.y), r.y0, r.y0 + r.h - 1);
    const key = current * 1e6 + py * world.w + px;
    if (key === flowKey) return;
    flowKey = key;
    if (flow.length !== r.w * r.h) flow = new Int16Array(r.w * r.h);
    flow.fill(-1);
    if (flowQ.length < r.w * r.h) flowQ = new Int32Array(r.w * r.h); // BFS queue, reused (was a fresh array plus 4 pairs per cell)
    const q = flowQ; let qn = 0;
    q[qn++] = (py - r.y0) * r.w + (px - r.x0);
    flow[q[0]] = 0;
    for (let i = 0; i < qn; i++) {
      const c = q[i], cx = c % r.w, cy = (c - cx) / r.w;
      for (let d = 0; d < 4; d++) {
        const nx = cx + DX4[d], ny = cy + DY4[d];
        if (nx < 0 || ny < 0 || nx >= r.w || ny >= r.h) continue;
        const ni = ny * r.w + nx;
        if (flow[ni] >= 0 || walkSolid(r.x0 + nx, r.y0 + ny)) continue;
        flow[ni] = flow[c] + 1; q[qn++] = ni;
      }
    }
  }
  const NEIGH8: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  function chaseDir(e: Enemy): { x: number; y: number } {
    const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy) || 1;
    const r = world.rooms[e.room];
    if (e.room !== current || d < 1.5) return { x: dx / d, y: dy / d };
    const ex = Math.floor(e.x) - r.x0, ey = Math.floor(e.y) - r.y0;
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= r.w || y >= r.h ? -1 : flow[y * r.w + x]);
    const here = at(ex, ey);
    if (here <= 1) return { x: dx / d, y: dy / d };
    let best = here, bx = 0, by = 0;
    for (const [ox, oy] of NEIGH8) {
      const v = at(ex + ox, ey + oy);
      if (v < 0 || v >= best) continue;
      if (ox && oy && (at(ex + ox, ey) < 0 || at(ex, ey + oy) < 0)) continue; // no corner cutting
      best = v; bx = ox; by = oy;
    }
    if (!bx && !by) return { x: dx / d, y: dy / d };
    const tx = r.x0 + ex + bx + 0.5 - e.x, ty = r.y0 + ey + by + 0.5 - e.y, n = Math.hypot(tx, ty) || 1;
    return { x: tx / n, y: ty / n };
  }

  const curve: Array<[number, number]> = [[0, 0], [60, 0], [90, 0], [110, 0]];
  function speedCurve(c: number): number {
    curve[0][1] = spd0(); curve[1][1] = spd60(); curve[2][1] = spd90(); curve[3][1] = spd110();
    return cadenceSpeed(c, spinCalled(), curve);
  }


  /** The boss's push window (telegraph + exposed): boss-surge grade in grade mode, the called surge in ERG. */
  function bossShield(): { shielded: boolean; leftS: number; nextS: number } {
    if (!bossStarted || !boss.alive) return { shielded: false, leftS: 0, nextS: 0 };
    const push = bs.cycle === 'windup' || bs.cycle === 'exposed';
    return { shielded: push, leftS: push ? bs.left : 0, nextS: bs.cycle === 'idle' ? bs.left : 0 };
  }


  // ---------- loot ----------
  function dropAt(x: number, y: number, kind: Drop['kind'], value: number, item?: Weapon | Gear) {
    const a = rng() * Math.PI * 2, d = 0.3 + rng() * 0.8;
    drops.push({
      id: nextId++, kind, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, value, item,
      rarity: (item?.rarity ?? 0) as Rarity, style: item && 'base' in item ? item.base : undefined, slot: item && 'slot' in item ? item.slot : undefined,
    });
  }
  function dropItem(x: number, y: number, bump: number, uniqueMult = 1) {
    const lvl = floor + (rng() < 0.3 ? 1 : 0), rar = rollRarity(rng, bump + (rng() < mods.rarityBumpChance ? 1 : 0));
    if (rng() * 100 < uniquePct() * uniqueMult * mods.dropMult) dropAt(x, y, 'weapon', 0, makeUnique(rng, lvl + 1));
    else if (rng() < 0.45) { const st = stylesFor(stance, mods.arcanist); dropAt(x, y, 'weapon', 0, makeWeapon(rng, lvl, rar, rng() < stanceDropBias() ? st[Math.floor(rng() * st.length)] : undefined)); }
    else dropAt(x, y, 'gear', 0, makeGear(rng, lvl, rar));
  }
  function coinValue() { return Math.max(1, Math.round((1 + rng() * 2) * (1 + 0.3 * (floor - 1)) * mods.coinMult)); }
  function addCoins(v: number) { v = Math.round(v * bounty()); P.coins += v; P.coinsEarned += v; }
  function collect(d: Drop) {
    if (d.kind === 'coin') { addCoins(d.value); cue('coin'); addFx({ kind: 'text', x: P.x, y: P.y - 0.6, life: 0.8, color: '#ffd84a', text: `+${d.value}` }); return; }
    if (d.kind === 'potion') {
      if (P.potions < mods.potionCap) { P.potions++; toast('+1 Potion', '#ff6b8a'); cue('pickup'); }
      else { const v = Math.round(10 * floor * mods.coinMult); addCoins(v); toast(`Potion sold +${v}c`, '#ffd84a'); cue('coin'); }
      return;
    }
    const it = d.item!;
    const col = RARITY_COLORS[it.rarity];
    const sid = 'base' in it ? stanceOfStyle(it.base, mods.arcanist) : stance;
    const better = 'base' in it ? it.score > weaponScore(slots[sid]) : !gear[it.slot] || it.score > gear[it.slot]!.score;
    if (!better) { const v = Math.round(sellValue(it.level, Math.min(4, it.rarity) as Rarity) * mods.coinMult); addCoins(v); toast(`Sold ${it.name} +${v}c`, '#bbb'); cue('coin'); return; }
    if ('base' in it) { slots[sid] = it; if (sid === stance && !swapTo) weapon = it; } else { gear[it.slot] = it; recomputeHp(false); }
    if (it.rarity > bestFind.rarity || (it.rarity === bestFind.rarity && it.level > bestFind.level)) bestFind = it;
    toast('base' in it ? `Equipped ${it.name} (${STANCES[sid].name})` : `Equipped ${it.name}`, col);
    addFx({ kind: 'levelup', x: P.x, y: P.y, life: 0.8, color: col, r: 1.4 });
    if (it.rarity === 5) {
      uniquesFound++; freeze(0.3); cue('unique');
      const u = UNIQUES.find((x) => x.name === it.name);
      addFx({ kind: 'banner', x: P.x, y: P.y, life: 3.5, color: col, text: `UNIQUE — ${it.name}${u ? ': ' + u.blurb : ''}` });
      ctx.emit({ type: 'uniqueFound', data: { name: it.name, floor } });
    } else cue('equip');
  }

  // ---------- combat ----------
  /** Fury: a long boss fight gets dangerous for the hero too, racing Turning Tide. */
  function bossFury() { return bossStarted && boss.alive && floor > 1 ? clamp((bs.fightT - furyAfter()) * furyRate(), 0, 1.5) : 0; }
  /** Damage numbers: every hit shows; rapid hits on one enemy merge into one rising number (keeps the fx budget). */
  let expWindows = 0, expStruck = 0, expHit = false, arsenalDone = false;
  const dmgFx = new Map<number, { fx: Fx; v: number; t: number }>();
  function dmgNumber(e: Enemy, dmg: number, crit: boolean, color: string) {
    // keep the RNG stream identical to the old (big hits only) numbers: draw only where they drew
    const jit = crit || dmg >= e.maxHp * 0.08 || e.kind === 'boss' ? rng() : ((e.id * 37 + Math.round(t * 30)) % 9) / 9;
    if (dmg < 0.5) return;
    const m = dmgFx.get(e.id);
    if (m && !crit && t - m.t < 0.25 && fx.includes(m.fx)) { m.v += dmg; m.fx.text = String(Math.round(m.v)); m.fx.t0 = t; m.t = t; return; }
    const f = addFx({ kind: 'text', x: e.x + (jit - 0.5) * 0.4, y: e.y - e.r - 0.2, life: crit ? 0.9 : 0.7, color: crit ? '#ffd84a' : color, text: String(Math.round(dmg)), big: crit || e.kind === 'boss' && dmg >= e.maxHp * 0.01 });
    if (f && !crit) dmgFx.set(e.id, { fx: f, v: dmg, t }); else dmgFx.delete(e.id);
    if (dmgFx.size > 64) dmgFx.clear();
  }
  function hurtPlayer(dmg: number) {
    if (P.invuln > 0 || opts?.invulnerable) return; // invulnerable: test-only, for deterministic output checks
    if (P.ward > 0) { if (t - P.hurtT > 0.25) cue('hit'); P.hurtT = t - 1; return; }
    const armor = clamp(gearSum('armor'), 0, 0.75);
    const taken = dmg * enemyDmgScale() * STANCES[stance].dmgTaken / sb('armor') * (1 - armor) * (cursed('hexed') ? 1.4 : 1) * (1 + bossFury()) * (sprintingNow ? 1 - sprintGuard() : 1);
    P.hp -= taken;
    if (taken >= 1 && t - P.hurtT > 0.2) addFx({ kind: 'text', x: P.x + 0.3, y: P.y - 0.7, life: 0.7, color: '#ff5a6e', text: `-${Math.round(taken)}` });
    if (t - P.hurtT > 0.25) cue('hurt');
    P.hurtT = t;
    if (P.hp <= 0 && swCd.left <= 0) secondWind();
  }
  /** Automatic last-ditch save: on a hit that would kill, heal, a moment of invulnerability, and a knockback. */
  function secondWind() {
    P.hp = Math.max(1, P.maxHp * swHeal()); P.invuln = swInvuln(); swUsedT = t; secondWinds++;
    ctx.emit({ type: 'secondWind', data: { floor, boss: bossStarted && boss.alive && current === boss.room } });
    addFx({ kind: 'banner', x: P.x, y: P.y, life: 2, color: '#7dff9a', text: 'SECOND WIND' });
    swCd = startCooldown(swCdT());
    for (const e of liveInRoom(current)) {
      const dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy) || 1;
      if (d < 3.5 && e.kind !== 'boss') { e.x += (dx / d) * 1.5; e.y += (dy / d) * 1.5; if (solid(Math.floor(e.x), Math.floor(e.y))) { e.x -= (dx / d) * 1.5; e.y -= (dy / d) * 1.5; } }
    }
    for (const b of bullets) if (!b.friendly && Math.hypot(b.x - P.x, b.y - P.y) < 4) b.life = 0;
    freeze(0.25); cue('levelup');
    addFx({ kind: 'banner', x: P.x, y: P.y, life: 2.5, color: '#ffe08a', text: 'SECOND WIND' });
    addFx({ kind: 'levelup', x: P.x, y: P.y, life: 1, color: '#ffe08a', r: 3.5 });
    ctx.emit({ type: 'secondWind', data: { floor } });
  }
  function damageEnemy(e: Enemy, raw: number, bike: Readonly<BikeState>, crit = false, color = '#fff') {
    if (!e.alive) return;
    let dmg = raw;
    if (e.kind === 'boss') {
      dmg *= bossDamageMult(bs, bossCfg());
      if (bs.cycle === 'exposed' && (bike.sprinting || erg)) dmg *= sprintMult(); // in ERG the trainer holds the called surge
    }
    if (cursed('bulwark')) dmg *= 0.65;
    if (e.shield > 0) { const ab = Math.min(e.shield, dmg * 0.8); e.shield -= ab; dmg -= ab; }
    const applied = Math.min(dmg, e.hp);
    e.hp -= dmg; damageDealt += applied; e.hurtT = t;
    dmgNumber(e, dmg, crit, color);
    if (e.hp <= 0) killEnemy(e);
  }
  function killEnemy(e: Enemy) {
    e.alive = false; kills++;
    addFx({ kind: 'death', x: e.x, y: e.y, life: 0.5, color: e.kind === 'boss' ? '#cc00aa' : e.elite ? '#ff8c2a' : '#dddddd', r: e.r * 2 });
    ctx.emit({ type: 'kill', data: { kind: e.kind, room: e.room, elite: !!e.elite, stance } });
    gainXp(e.xp);
    const coins = e.kind === 'boss' ? 14 : e.elite ? 4 : 1 + (rng() < 0.4 ? 1 : 0);
    for (let i = 0; i < coins; i++) dropAt(e.x, e.y, 'coin', coinValue());
    if (e.kind === 'boss') {
      dropItem(e.x, e.y, 2, 10); dropItem(e.x, e.y, 1, 10); dropAt(e.x, e.y, 'potion', 0);
      bossDefeated++; totals.bosses++; freeze(0.8); cue('bossDie');
      for (let k = 0; k < 5; k++) addFx({ kind: 'boom', x: e.x + Math.cos(k * 1.3) * k * 0.5, y: e.y + Math.sin(k * 1.3) * k * 0.5, life: 0.6 + k * 0.2, color: k % 2 ? '#ffe08a' : '#c77dff', r: 2 + k });
      for (const b of bullets) if (!b.friendly) b.life = 0;
      addFx({ kind: 'boom', x: e.x, y: e.y, life: 0.8, color: '#c77dff', r: 4 });
      toast(`${BOSS_NAMES[e.variant]} defeated! Stairs open.`, '#ff8c2a');
      ctx.emit({ type: 'bossDefeated', data: { timeS: Math.round(t), floor, stance, windows: expWindows, struck: expStruck } });
      return;
    }
    cue('kill');
    if (e.elite) {
      elitesSlain++; freeze(0.08);
      dropItem(e.x, e.y, 1, 1.5);
      if (e.elite === 'splitting') for (let k = 0; k < 2; k++) {
        const c = spawnEnemy(e.kind as EnemyKind, e.x + (k ? 0.4 : -0.4), e.y, e.room);
        c.maxHp = c.hp = (e.maxHp / 2.6) * 0.6; c.r = ENEMY_DEF[e.kind as EnemyKind].r * 0.8; c.summoned = 1;
      }
      if (e.elite === 'volatile') hazards.push({ x: e.x, y: e.y, r: 2.2, left: 0.9, total: 0.9, dmg: 22 * dmgMul() });
    } else if (e.summoned === 0) {
      if (rng() * 100 < itemDropPct() * mods.dropMult) dropItem(e.x, e.y, 0);
      if (rng() < 0.03) dropAt(e.x, e.y, 'potion', 0);
    }
  }
  function gainXp(v: number) {
    P.xp += v * mods.xpMult * bounty();
    while (P.xp >= xpNext(P.level)) {
      P.xp -= xpNext(P.level); P.level++;
      recomputeHp(true); freeze(0.15); cue('levelup');
      toast(`Level ${P.level}! +10 HP, +4% dmg, healed`, '#7dff5a');
      addFx({ kind: 'levelup', x: P.x, y: P.y, life: 1.4, color: '#7dff5a', r: 2.5 });
      ctx.emit({ type: 'levelUp', data: { level: P.level } });
    }
  }
  function enemyShot(x: number, y: number, a: number, speed: number, dmg: number, r = 0.2, life = 5) {
    bullets.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r, dmg: dmg * dmgMul(), life, age: 0, friendly: false, pierce: 0, bounce: 0 });
  }
  function ring(x: number, y: number, n: number, speed: number, dmg: number, off: number) {
    for (let i = 0; i < n; i++) enemyShot(x, y, off + (i / n) * Math.PI * 2, speed, dmg);
  }
  function nearestEnemy(x = P.x, y = P.y, exclude?: number[], maxD = Infinity): Enemy | null {
    let best: Enemy | null = null, bd = maxD;
    for (const e of enemies) {
      if (!isLive(e, current) || exclude?.includes(e.id)) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  const cadNorm = (bike: Readonly<BikeState>) => (cadRef() > 0 ? clamp(cadRef() / Math.max(30, bike.cadence3s), 0.8, 1.5) : 1);
  const playerDmg = (bike: Readonly<BikeState>) =>
    cadNorm(bike) * sb('dmg') * baseDamage() * clamp(bike.ftpFraction, 0.3, 2.5) * (1 + 0.06 * weapon.plus) * (1 + 0.04 * (P.level - 1) + gearSum('dmgPct')) * mods.dmgMult * (bike.sprinting || t < firedUpUntil ? fireMult() : 1);
  function shoot(a: number, dmg: number, sp: number, child: boolean, crit = false) {
    const w = weapon;
    bullets.push({
      x: P.x, y: P.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      r: w.base === 'orb' ? (child ? 0.18 : 0.3) : w.base === 'flame' ? 0.22 : w.base === 'pellet' ? 0.14 : 0.2,
      dmg, life: w.range / w.speed, age: 0, friendly: true, w, hits: [], pierce: w.pierce, bounce: w.bounce, crit, child, ric: 0,
    });
  }
  function fire(bike: Readonly<BikeState>) {
    const w = weapon, n = w.count;
    const critCh = gearSum('crit') + (w.element === 'arcane' ? 0.08 : 0) + 0.04;
    for (let i = 0; i < n; i++) {
      const off = n > 1 ? (i / (n - 1) - 0.5) * w.spread : 0;
      const a = P.aim + off + (w.base === 'flame' ? (rng() - 0.5) * 0.25 : 0);
      const crit = rng() < critCh;
      shoot(a, w.dmg * playerDmg(bike) * (crit ? 2 : 1), w.speed * (w.base === 'flame' ? 0.85 + rng() * 0.3 : 1), false, crit);
    }
    P.shots++;
    if (w.unique === 'nova' && P.shots % 5 === 0) {
      for (let i = 0; i < 12; i++) shoot(P.aim + (i / 12) * Math.PI * 2, w.dmg * playerDmg(bike) * 0.6, w.speed * 0.8, true);
      addFx({ kind: 'boom', x: P.x, y: P.y, life: 0.3, color: ELEMENT_COLORS[w.element], r: 1.5 });
    }
    cue(w.base === 'flame' ? 'flame' : w.base === 'spark' ? 'zap' : w.base === 'arrow' || w.base === 'orb' || w.base === 'pellet' ? 'shootHeavy' : 'shoot');
    if (w.base !== 'flame') addFx({ kind: 'muzzle', x: P.x + Math.cos(P.aim) * 0.45, y: P.y + Math.sin(P.aim) * 0.45, life: 0.08, color: ELEMENT_COLORS[w.element] });
  }

  /** Returns true if the bullet should keep flying (ricochet). */
  function onHit(b: Bullet, e: Enemy, bike: Readonly<BikeState>): boolean {
    const w = b.w!, col = ELEMENT_COLORS[w.element];
    damageEnemy(e, b.dmg, bike, b.crit, col);
    addFx({ kind: 'hit', x: b.x, y: b.y, life: 0.2, color: col, r: 0.4 });
    cue(b.crit ? 'crit' : 'hit');
    if (w.element === 'frost') e.slowT = 1.5;
    if (w.element === 'fire' || w.element === 'venom') { e.dotT = w.element === 'venom' ? 3 : 1.5; e.dotDps = Math.max(e.dotDps * 0.5, b.dmg * 0.25); }
    if (w.blast > 0 && !b.child) blast(b, bike, col);
    const chains = w.chain + (w.element === 'storm' && rng() < 0.25 ? 1 : 0);
    if (chains > 0 && !b.child) {
      const pts = [{ x: e.x, y: e.y }], hit = [e.id];
      let from = e;
      for (let c = 0; c < chains; c++) {
        const nx = nearestEnemy(from.x, from.y, hit, 4.5);
        if (!nx) break;
        hit.push(nx.id); pts.push({ x: nx.x, y: nx.y });
        damageEnemy(nx, b.dmg * 0.7, bike, false, col);
        from = nx;
      }
      if (pts.length > 1) addFx({ kind: 'chain', x: e.x, y: e.y, life: 0.25, color: col, pts: [{ x: b.x - b.vx * 0.03, y: b.y - b.vy * 0.03 }, ...pts] });
    }
    if (w.unique === 'split' && !b.child) {
      const a0 = Math.atan2(b.vy, b.vx);
      for (let k = 0; k < 4; k++) {
        const a = a0 + (k - 1.5) * 0.5;
        bullets.push({ ...b, vx: Math.cos(a) * w.speed, vy: Math.sin(a) * w.speed, dmg: b.dmg * 0.4, life: 0.6, age: 0, hits: [e.id], child: true, r: 0.16, pierce: 0, bounce: 0 });
      }
    }
    if (w.unique === 'ricochet' && (b.ric ?? 0) < 3) {
      const nx = nearestEnemy(b.x, b.y, b.hits, 7);
      if (nx) {
        const a = Math.atan2(nx.y - b.y, nx.x - b.x), sp = Math.hypot(b.vx, b.vy);
        b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp; b.ric = (b.ric ?? 0) + 1; b.life = Math.max(b.life, 0.5);
        return true;
      }
    }
    return false;
  }
  function blast(b: Bullet, bike: Readonly<BikeState>, col: string) {
    addFx({ kind: 'boom', x: b.x, y: b.y, life: 0.35, color: col, r: b.w!.blast });
    cue('explode');
    for (const o of liveInRoom(current)) if (!b.hits!.includes(o.id) && Math.hypot(o.x - b.x, o.y - b.y) < b.w!.blast + o.r) damageEnemy(o, b.dmg * 0.6, bike, false, col);
  }

  // ---------- rider actions (A Strike, B Ward, Y Rally, Z Potion; shifters stay gears) ----------
  const spinCalled = () => spinupCalled(dir) || shrines.some((x) => x.state === 'active' && x.kind === 'whirl');
  function startCd(id: ActionId, s0: number) { cds[id] = { left: s0, total: s0 }; }
  function doStrike(bike: Readonly<BikeState>) {
    const hit = liveInRoom(current).filter((e) => Math.hypot(e.x - P.x, e.y - P.y) < strikeRadius() + e.r);
    if (!hit.length) { cue('deny'); return false; }
    const dmg = weapon.dmg * playerDmg(bike) * strikeMult();
    for (const e of hit) { damageEnemy(e, dmg, bike, true, '#ffd84a'); e.slowT = Math.max(e.slowT, 2); }
    if (hit.some((e) => e.kind === 'boss') && bs.cycle === 'exposed' && !expHit) { expHit = true; expStruck++; }
    if (hit.some((e) => e.kind === 'boss') && strikeBoss(bs, bossCfg())) toast(`Timed Strike: exposed +${bossCfg().strikeBonusS}s`, '#ffd84a');
    addFx({ kind: 'boom', x: P.x, y: P.y, life: 0.4, color: '#ffd84a', r: strikeRadius() });
    freeze(0.08); cue('explode');
    return true;
  }
  function act(id: ActionId, bike: Readonly<BikeState>): boolean {
    if (cds[id].left > 0) { cue('deny'); return false; }
    if (id === 'strike') { if (!doStrike(bike)) return false; startCd('strike', strikeCd()); }
    else if (id === 'ward') {
      P.ward = wardDur(); startCd('ward', wardCd()); cue('pickup');
      addFx({ kind: 'levelup', x: P.x, y: P.y, life: 0.6, color: '#7fe7ff', r: 1.4 });
    } else if (id === 'rally') {
      if (!spinCalled()) { cue('deny'); toast('Rally answers a called spin-up', '#8fd8ff'); return false; }
      P.rally = rallyDur(); startCd('rally', rallyCd()); cue('reward');
      toast('Rally! Faster attacks', '#8fd8ff');
    } else {
      if (P.potions <= 0 || P.hp >= P.maxHp) { cue('deny'); return false; }
      P.potions--; P.hp = Math.min(P.maxHp, P.hp + P.maxHp * potionHeal()); P.lastPotionT = t; startCd('potion', potionCd()); cue('potion');
      addFx({ kind: 'levelup', x: P.x, y: P.y, life: 0.6, color: '#ff6b8a', r: 1 });
    }
    ctx.emit({ type: 'action', data: { id, floor } });
    return true;
  }
  function riderActions(input: Readonly<InputState>, bike: Readonly<BikeState>) {
    const p = (b: Button) => input.pressed.has(b);
    for (const id of tapped.splice(0)) act(id, bike); // on-screen button taps
    if (p('left') || p('right')) changeStance(p('right') ? 1 : -1);
    if (p('a')) act('strike', bike);
    if (p('b')) act('ward', bike);
    if (p('y')) act('rally', bike);
    if (p('z')) act('potion', bike);
    if (shouldAutoPotion(P.hp / P.maxHp, P.potions, t - P.lastPotionT, autoPotionFrac()) && cds.potion.left <= 0) act('potion', bike);
    if (opts?.actionBot) botActions(bike);
  }
  /** Test bot that uses actions the way a rider should (headless balance only). */
  function botActions(bike: Readonly<BikeState>) {
    const live = liveInRoom(current), near = live.filter((e) => Math.hypot(e.x - P.x, e.y - P.y) < strikeRadius() + e.r);
    const fighting = bossStarted && boss.alive && current === boss.room;
    if (cds.strike.left <= 0 && near.length && ((fighting && bs.cycle === 'exposed' && near.includes(boss)) || (!fighting && near.length >= 3))) act('strike', bike);
    if (cds.ward.left <= 0 && ((fighting && bs.cycle === 'windup' && bs.left < 0.8) || (!fighting && P.hp < P.maxHp * 0.4 && near.length >= 2))) act('ward', bike);
    if (cds.rally.left <= 0 && spinCalled() && live.length) act('rally', bike);
    if (cds.potion.left <= 0 && P.potions > 0 && P.hp < P.maxHp * 0.5) act('potion', bike);
  }

  function changeStance(dir: number) {
    const list = stancesFor(mods.arcanist);
    if (list.length < 2) { cue('deny'); return; }
    // free cycling: each press moves the pick; nothing changes until the presses stop (a press mid-swap cancels it)
    const from = pick ?? swapTo ?? stance, i = list.indexOf(from), next = list[(i + dir + list.length) % list.length];
    if (swapTo) { swapTo = null; swapT = 0; }
    pick = next; pickT = stanceCommitT(); cue('select');
    toast(`${STANCES[next].name}: ${STANCES[next].role}`, STANCES[next].color);
  }
  function paceTick(dt: number, bike: Readonly<BikeState>) {
    const r = activeRoom(), cfg = dirCfg(), seg0 = dir.seg;
    const evs = stepDirector(dir, { dt, rideMin: t / 60, inFight: r.locked && !r.cleared && !r.boss,
      bossActive: bossStarted && boss.alive && current === boss.room, bossDone: bossStarted && !boss.alive }, cfg);
    if (dir.seg === 'spinup' && bike.cadence3s >= cfg.spinRpm) spinGood += dt;
    // segment banners for the calm segments (ambush, spin-up and boss announce themselves)
    if (dir.seg !== seg0 && SEG_BANNER[dir.seg]) addFx({ kind: 'banner', x: P.x, y: P.y, life: 2, color: '#8fd8ff', text: SEG_BANNER[dir.seg]! });
    if (!arsenalDone && phase === 'run') {
      const ids = stancesFor(mods.arcanist);
      if (ids.every((id) => (slots[id]?.rarity ?? 0) >= 2)) { arsenalDone = true; toast('Full Arsenal: a rare+ weapon in every stance', '#ffd84a'); ctx.emit({ type: 'fullArsenal', data: { floor, stances: ids.length } }); }
    }
    for (const ev of evs) {
      if (ev === 'ambush') {
        const n = Math.round(ambushN()) + Math.floor(floor / 3);
        for (let k = 0; k < n; k++) {
          const side = k % 4, f = (k + 0.5) / n;
          const x = side < 2 ? r.x0 + 1 + f * (r.w - 2) : side === 2 ? r.x0 + 1.5 : r.x0 + r.w - 1.5;
          const y = side === 0 ? r.y0 + 1.5 : side === 1 ? r.y0 + r.h - 1.5 : r.y0 + 1 + f * (r.h - 2);
          if (!solid(Math.floor(x), Math.floor(y))) spawnEnemy((['chaser', 'bat', 'archer', 'brute'] as EnemyKind[])[k % (floor > 2 ? 4 : 2)], x, y, r.id);
        }
        toast('AMBUSH! Push Z3-4', '#ff7a2a'); cue('bossStart'); freeze(0.15);
        addFx({ kind: 'banner', x: P.x, y: P.y, life: 2.5, color: '#ff7a2a', text: 'AMBUSH' });
        ctx.emit({ type: 'ambush', data: { floor } });
      } else if (ev === 'ambushEnd') toast('Ambush over: recover', '#8fd8ff');
      else if (ev === 'spinup') { spinGood = 0; toast(`Spin up! Over ${cfg.spinRpm} rpm. Rally is live`, '#8fd8ff'); cue('select'); addFx({ kind: 'banner', x: P.x, y: P.y, life: 2, color: '#8fd8ff', text: 'SPIN UP' }); }
      else if (ev === 'spinupEnd') {
        if (spinGood >= spinGoodFrac() * cfg.spinupS) {
          for (const k of Object.keys(cds) as ActionId[]) completeCooldown(cds[k]);
          const v = Math.round(15 * floor * mods.coinMult); addCoins(v);
          toast(`Spin-up answered: actions recharged, +${v}c`, '#8fd8ff'); cue('coin');
          ctx.emit({ type: 'spinup', data: { floor, ok: true } });
        } else ctx.emit({ type: 'spinup', data: { floor, ok: false } });
      }
    }
  }
  function stanceTick(dt: number, bike: Readonly<BikeState>) {
    if (pick) {
      pickT -= dt;
      if (pickT <= 0) {
        if (pick !== stance) { swapTo = pick; swapT = stanceSwapT(); cue('equip'); ctx.emit({ type: 'stance', data: { stance: pick, floor } }); }
        pick = null;
      }
    }
    // the swap resets the shot timer (no free shot) and restarts the style-bonus settle time
    if (swapTo) { swapT -= dt; if (swapT <= 0) { swapT = 0; stance = swapTo; swapTo = null; weapon = slots[stance]; P.lastShotRevs = bike.crankRevs; stanceSince = t; } }
    styleOn = t - stanceSince >= styleSettleT() && styleActive(stance, bike.cadence3s, bike.powerZone, spinCalled());
    const live = liveInRoom(current);
    suggestion = suggestStance({ boss: bossStarted && boss.alive && current === boss.room, shielded: bossShield().shielded, crowd: live.length, elite: live.some((e) => !!e.elite), arcanist: mods.arcanist });
    if (suggestion === stance || swapTo || pick) suggestion = null;
  }

  // stuck detector: with a path but < 0.25 tiles of progress in 0.75s, follow raw tile centres (no smoothing) for a while
  let stuckX = 0, stuckY = 0, stuckT = 0, rawUntil = -1;
  const pathTo = (tx: number, ty: number) => (navPrev = { x: P.x, y: P.y }, findPath(world.w, world.h, walkSolid, Math.floor(P.x), Math.floor(P.y), tx, ty, { smooth: false, wallCost: 0.35 }));
  /**
   * Pure pursuit along the tile-centre path: steer at the farthest point up to LOOK tiles ahead that the hero's body can
   * reach in a straight, clear line (corridor centre lines stay the target; open rooms get smooth diagonals). Eases to
   * ~80% speed into a sharp bend so it turns cleanly instead of grinding the corner.
   */
  const LOOK = 1.3;
  function pursue(): { x: number; y: number } | null {
    if (!navPath.length) return null;
    const r = HERO_WALL_R + 0.1;
    let best = navPath[0], ax = P.x, ay = P.y, left = LOOK;
    outer: for (let i = 0; i < navPath.length && left > 0; i++) {
      const q = navPath[i], d = Math.hypot(q.x - ax, q.y - ay), steps = Math.max(1, Math.ceil(d / 0.25));
      for (let k = 1; k <= steps; k++) {
        const u = Math.min(1, k / steps, left / (d || 1)), px = ax + (q.x - ax) * u, py = ay + (q.y - ay) * u;
        if (!clearLine(walkSolid, P.x, P.y, px, py, r)) break outer;
        best = { x: px, y: py };
        if (u * d >= left) break outer;
      }
      left -= d; ax = q.x; ay = q.y;
    }
    let vx = best.x - P.x, vy = best.y - P.y; const n = Math.hypot(vx, vy);
    if (n < 1e-3) { vx = navPath[0].x - P.x; vy = navPath[0].y - P.y; }
    const m = Math.hypot(vx, vy) || 1;
    let speed = 1;
    const a = navPath[0], b = navPath[1];
    if (b && Math.hypot(a.x - P.x, a.y - P.y) < 0.9) { // bend coming up: slow a touch
      const t1x = a.x - P.x, t1y = a.y - P.y, t2x = b.x - a.x, t2y = b.y - a.y;
      const c = (t1x * t2x + t1y * t2y) / ((Math.hypot(t1x, t1y) || 1) * (Math.hypot(t2x, t2y) || 1));
      if (c < 0.5) speed = 0.82;
    }
    return { x: (vx / m) * speed, y: (vy / m) * speed };
  }
  function flowSample(ratio: number, dt: number) {
    fstat.exploreT += dt; fstat.speedSum += ratio * dt; if (ratio < 0.5) fstat.slowT += dt;
    if (blocked(P.x, P.y, HERO_WALL_R + 0.03)) fstat.wallT += dt;
    const a = navPrev, b = navPath[0];
    if (a && b) { // overshoot: distance from the planned leg (prev waypoint -> next waypoint)
      const vx = b.x - a.x, vy = b.y - a.y, L2 = vx * vx + vy * vy || 1, u = Math.max(0, Math.min(1, ((P.x - a.x) * vx + (P.y - a.y) * vy) / L2));
      if (Math.hypot(P.x - a.x - u * vx, P.y - a.y - u * vy) > 0.4) fstat.overshootT += dt;
    }
    const tx = Math.floor(P.x), ty = Math.floor(P.y);
    if (!world.rooms.some((r) => inRoom(r, P.x, P.y, 0))) {
      fstat.corridorT += dt; fstat.corridorSpeedSum += ratio * dt;
      const wallsX = walkSolid(tx - 1, ty) && walkSolid(tx + 1, ty), wallsY = walkSolid(tx, ty - 1) && walkSolid(tx, ty + 1);
      const off = Math.max(wallsX ? Math.abs(P.x - tx - 0.5) : 0, wallsY ? Math.abs(P.y - ty - 0.5) : 0);
      if (off > 0.2) fstat.offCenterT += dt;
    }
  }
  function stuckCheck() {
    if (!navPath.length || P.rollT > 0 || !exploring) { stuckT = t; stuckX = P.x; stuckY = P.y; return; }
    if (Math.hypot(P.x - stuckX, P.y - stuckY) > 0.25) { stuckT = t; stuckX = P.x; stuckY = P.y; return; }
    if (t - stuckT > 0.75) { navAge = 99; stuckT = t; stuckStats++; } // re-plan from where we are
  }
  function navTarget(): { key: string; x: number; y: number } | null {
    if (!boss.alive) return { key: 'stairs', x: Math.floor(world.stairs.x), y: Math.floor(world.stairs.y) };
    const dist = world.rooms.map(() => -1); dist[current] = 0;
    const q = [current];
    let best: Room | null = null;
    for (let qi = 0; qi < q.length; qi++) {
      const r = world.rooms[q[qi]];
      if (!r.cleared && !r.boss) { best = r; break; }
      for (const n of world.adj[r.id]) if (dist[n] < 0) { dist[n] = dist[r.id] + 1; q.push(n); }
    }
    const r = best ?? world.rooms.find((x) => x.boss)!;
    return { key: `room${r.id}`, x: r.x0 + (r.w >> 1), y: r.y0 + (r.h >> 1) };
  }

  let dbgTick = 0; // the debug overlay string is rebuilt every 15 ticks (0.5 s), not every tick: it was the top per-tick allocation
  function autopilotCtl(): Ctl {
    exploring = false;
    let mx = 0, my = 0, roll = false;
    const near = nearestEnemy();
    P.targetId = near?.id ?? 0;
    const room = activeRoom();
    if (near && room.locked) {
      const dx = near.x - P.x, dy = near.y - P.y, d = Math.hypot(dx, dy) || 1;
      // stand off at a comfortable fraction of weapon range (flamers fight up close)
      // the boss is helpless while exposed: step in so the rider's Strike can land
      const want = near === boss && bs.cycle === 'exposed' && cds.strike.left <= 0 ? Math.max(1, strikeRadius() * 0.6) : STANCES[stance].standoff(standoff(weapon.range, near));
      const s = d > want + 1 ? 1 : d < want - 1 ? -1 : 0;
      mx = (dx / d) * s; my = (dy / d) * s;
      if (s === 1) { // close in along a real path (pits/braziers may be in the way)
        const key = `fight${near.id}`;
        if (navKey !== key || navAge > 0.75 || !navPath.length) { navPath = pathTo(Math.floor(near.x), Math.floor(near.y)); navKey = key; navAge = 0; }
        while (navPath.length > 1 && Math.hypot(navPath[0].x - P.x, navPath[0].y - P.y) < 0.45) navPrev = navPath.shift()!;
        const v = pursue(); if (v) { mx = v.x; my = v.y; }
      }
      const pathing = s === 1 && navPath.length > 0;
      if (s === 0) { const k = 0.25 + 0.6 * STANCES[stance].strafe; mx = -dy / d * k; my = dx / d * k; } // circle-strafe (by stance)
      for (const b of bullets) { // sidestep incoming shots (perpendicular to their path) so we can still advance
        if (b.friendly) continue;
        const bx = P.x - b.x, by = P.y - b.y, bd = Math.hypot(bx, by), bv = Math.hypot(b.vx, b.vy) || 1;
        if (bd > 2.2 || bd < 0.01 || bx * b.vx + by * b.vy <= 0) continue;
        const px = -b.vy / bv, py = b.vx / bv, side = px * bx + py * by >= 0 ? 1 : -1, w = 1.4 * (1 - bd / 2.2);
        mx += px * side * w; my += py * side * w;
      }
      for (const h of hazards) { const hx = h.x - P.x, hy = h.y - P.y, hd = Math.hypot(hx, hy) || 1; if (hd < h.r + 1) { mx -= hx / hd * 2; my -= hy / hd * 2; } }
      const cx = room.x0 + room.w / 2 - P.x, cy = room.y0 + room.h / 2 - P.y;
      if (!pathing && !inRoom(room, P.x, P.y, 1.6)) { mx += cx * 0.2; my += cy * 0.2; }
      if (d < 1.4 && P.hp < P.maxHp * 0.6) { mx = -dx / d; my = -dy / d; roll = P.rollCd <= 0; } // roll out when hurt and crowded
    } else if (!drops.some((d) => Math.hypot(d.x - P.x, d.y - P.y) < 6)) {
      const tgt = navTarget();
      exploring = !!tgt;
      if (tgt) {
        if (tgt.key !== navKey || navAge > 1.5 || !navPath.length) { navPath = pathTo(tgt.x, tgt.y); navKey = tgt.key; navAge = 0; }
        while (navPath.length > 1 && Math.hypot(navPath[0].x - P.x, navPath[0].y - P.y) < 0.45) navPrev = navPath.shift()!;
        const v = pursue(); if (v) { mx = v.x; my = v.y; }
      }
    }
    const n = Math.hypot(mx, my);
    if (n > 1) { mx /= n; my /= n; }
    if ((dbgTick = (dbgTick + 1) % 15) === 0) ctx.debug('autopilot', `${mx.toFixed(2)},${my.toFixed(2)} path${navPath.length} ${navKey} near${near ? near.id + '@' + near.x.toFixed(1) + ',' + near.y.toFixed(1) : '-'}`);
    return { mx, my, roll };
  }

  // ---------- camp (between runs) ----------
  function campRows(): CampView['rows'] {
    const rows: CampView['rows'] = [{ kind: 'start', name: 'Begin descent', desc: `Floor ${startFloor}` }];
    if (mods.maxStartFloor > 1) rows.push({ kind: 'floor', name: 'Starting floor', desc: `◀ ${startFloor} ▶  (max ${mods.maxStartFloor})` });
    for (const d of UPGRADES) {
      const L = lvl(levels, d.id), cost = L >= d.max ? undefined : upgradeCost(d, L);
      rows.push({ kind: 'upgrade', id: d.id, name: d.name, desc: d.desc, level: L, max: d.max, cost, affordable: cost !== undefined && cost <= bankStart });
    }
    rows.push({ kind: 'auto', name: 'Auto-invest at start', desc: autoInvestOn ? 'ON' : 'OFF' });
    rows.push({ kind: 'erg', name: 'Trainer mode', desc: erg ? 'ERG: the game sets your power' : 'Grade: you shift gears' });
    return rows;
  }
  function campUpdate(dt: number, input: Readonly<InputState>, bike: Readonly<BikeState>) {
    const rows = campRows();
    const p = (b: Button) => input.pressed.has(b);
    let tapped = false;
    for (const a of pending.splice(0)) if (a.type === 'campRow' && a.row >= 0 && a.row < rows.length) { campSel = a.row; tapped = true; }
    if (p('up')) { campSel = (campSel + rows.length - 1) % rows.length; cue('select'); campT = 0; }
    if (p('down')) { campSel = (campSel + 1) % rows.length; cue('select'); campT = 0; }
    campSel = Math.min(campSel, rows.length - 1);
    const row = rows[campSel];
    if (row.kind === 'floor' && (p('left') || p('right'))) {
      startFloor = clamp(startFloor + (p('left') ? -1 : 1), 1, mods.maxStartFloor); cue('select'); campT = 0;
    }
    if (p('a') || p('z') || tapped) { // A or Z on the Ride diamond; taps select + activate
      campT = 0;
      if (row.kind === 'start') { startRun(); return; }
      if (row.kind === 'floor') { startFloor = startFloor >= mods.maxStartFloor ? 1 : startFloor + 1; cue('select'); }
      if (row.kind === 'auto') { autoInvestOn = !autoInvestOn; cue('select'); persist(); }
      if (row.kind === 'erg') { erg = !erg; cue('select'); applyMode(); persist(); }
      if (row.kind === 'upgrade') {
        if (row.affordable) {
          bankStart -= row.cost!; levels[row.id!] = (row.level ?? 0) + 1; cue('buy');
          const wasMax = startFloor === mods.maxStartFloor;
          mods = metaMods(levels, bestFloor); if (wasMax) startFloor = mods.maxStartFloor; persist();
        } else cue('deny');
      }
    }
    if (p('b')) { startRun(); return; }
    if (bike.cadence3s > 30) campT += dt;
    if (campT >= campAutoS() || (autopilot && campT >= Math.min(campAutoS(), 10))) startRun();
  }
  function startRun() {
    if (autoInvestOn) {
      const r = autoInvest(bankStart, levels);
      bankStart = r.bank;
      if (r.bought.length) toast(`Auto-invested: ${r.bought.length} upgrade${r.bought.length > 1 ? 's' : ''}`, '#ffd84a');
    }
    const wasMax = startFloor === mods.maxStartFloor;
    mods = metaMods(levels, bestFloor);
    if (!opts?.floor) startFloor = wasMax ? mods.maxStartFloor : clamp(startFloor, 1, mods.maxStartFloor);
    floor = startFloor;
    runs++;
    totals.runs++; P.coins = 0; P.coinsEarned = 0; lastDeath = undefined;
    P.level = 1 + 2 * (floor - 1); P.xp = 0;
    weapon = starterWeapon(floor, rng); fillSlots(P.level); arsenalDone = false; bestFind = weapon; swapT = 0; swapTo = null; pick = null; stanceSince = -99;
    P.potions = mods.potionCap;
    buildFloor(); dir = newFloor(true);
    recomputeHp(true);
    P.lastShotRevs = ctx.bike().crankRevs;
    phase = 'run';
    cue('stairs');
    toast(`Run ${runs} — Floor ${floor}`, '#ffd84a');
    persist();
  }
  if (autopilot || opts?.skipCamp) startRun();

  // ---------- shrines ----------
  function shrineUpdate(dt: number, bike: Readonly<BikeState>) {
    for (const s of shrines) {
      if (s.state !== 'active') continue;
      s.left -= dt;
      // fury is a 20 s effort: judge it on power, HR can't climb in time
      if (s.kind === 'fury' && Math.min(5, bike.powerZone) >= 3) s.progress += dt / 20;
      if (s.kind === 'whirl' && bike.cadence3s >= whirlRpm()) s.progress += dt / 15;
      if (s.kind === 'endurance' && bike.effortZone === 2) s.progress += dt / (SHRINES.endurance.window * 0.85);
      if (s.kind === 'sprint') s.progress = (bike.sprintCount - s.s0) / 2;
      s.progress = Math.min(1, s.progress);
      const done = s.kind === 'endurance' ? s.left <= 0 || s.progress >= 1 : s.progress >= 1;
      if (done && (s.kind !== 'endurance' || s.progress > 0.15)) { s.state = 'done'; shrineReward(s); }
      else if (s.left <= 0) { s.state = 'failed'; toast('The shrine falls silent…', '#888888'); }
    }
  }
  function shrineReward(s: Shrine) {
    freeze(0.2); cue('reward');
    addFx({ kind: 'levelup', x: s.x, y: s.y, life: 1.5, color: SHRINES[s.kind].color, r: 3 });
    if (s.kind === 'fury') {
      weapon = { ...weapon, plus: weapon.plus + 2 }; weapon.score = weaponScore(weapon); slots[stance] = weapon;
      toast(`Fury! ${weapon.name} is now +${weapon.plus}`, '#ff8c2a');
    } else if (s.kind === 'whirl') {
      for (let i = 0; i < 8; i++) dropAt(s.x, s.y, 'coin', coinValue());
      if (P.potions < mods.potionCap) P.potions++;
      toast('Whirlwind! +1 potion and a gust of coins', '#8fd8ff');
    } else if (s.kind === 'sprint') {
      for (let i = 0; i < 20; i++) dropAt(s.x, s.y, 'coin', coinValue() * 2);
      P.hp = P.maxHp; toast('Gold rain! Fully healed', '#ffd84a');
    } else {
      const n = 1 + Math.floor(s.progress * 3);
      for (let i = 0; i < n; i++) dropItem(s.x, s.y, 1, 2);
      toast(`Patience rewarded: ${n} treasure${n > 1 ? 's' : ''}`, '#5aa9ff');
    }
    ctx.emit({ type: 'shrine', data: { kind: s.kind, floor } });
  }

  // ---------- curses ----------
  function startCurse(bike: Readonly<BikeState>) {
    const kind = CURSE_KINDS[Math.floor(rng() * CURSE_KINDS.length)], d = CURSES[kind];
    curse = { kind, left: d.dur, total: d.dur, s0: bike.sprintCount };
    cue('curse');
    addFx({ kind: 'banner', x: P.x, y: P.y, life: 3, color: d.color, text: `${d.name}: ${d.desc}` });
    toast(`${d.name}! +50% coins & XP while it lasts. Sprint to break it.`, d.color);
    ctx.emit({ type: 'curse', data: { kind, floor } });
  }
  function curseUpdate(dt: number, bike: Readonly<BikeState>) {
    if (!curse) return;
    curse.left -= dt;
    const broken = bike.sprintCount > curse.s0;
    if (curse.left > 0 && !broken) return;
    const d = CURSES[curse.kind];
    curse = null; cursesSurvived++;
    freeze(0.15); cue('reward');
    addFx({ kind: 'levelup', x: P.x, y: P.y, life: 1.2, color: d.color, r: 2.2 });
    toast(broken ? `You shattered the ${d.name}! Bounty dropped.` : `${d.name} lifted. Bounty dropped.`, '#ffd84a');
    dropItem(P.x, P.y, 1, 1.5);
    for (let i = 0; i < 6; i++) dropAt(P.x, P.y, 'coin', coinValue() * 2);
  }

  // ---------- update ----------
  function update(dt: Seconds) {
    const bike = ctx.bike(), input = ctx.input();
    cfgFresh = false; // tuning may change between ticks: re-check (cheaply) once per tick
    if (phase === 'camp') { t += dt; campUpdate(dt, input, bike); if (erg) ergSync(dirCfg().targets.cooldown.erg); else resSync('terrain', campGrade()); return; }
    if (hitT > 0) { hitT -= dt; return; } // hit-stop
    t += dt; navAge += dt; stuckCheck();
    const ctl = autopilotCtl();
    for (let z = 0; z < 5; z++) zoneRates[z + 1] = zoneRefill[z]();
    const rate = refillRate(bike.powerZone, zoneRates);
    lastRate = rate;
    for (const k of CD_KEYS) tickCooldown(cds[k], dt, rate);
    sprintingNow = bike.sprinting;
    tickCooldown(swCd, dt, rate); // Second Wind refills with effort too, but a sprint does not finish it
    if (bike.sprintCount > lastSprints) {
      lastSprints = bike.sprintCount;
      firedUpUntil = t + fireS();
      // Second breath: a sprint pays on its own, even if no action buttons are pressed
      if (phase === 'run' && sprintHeal() > 0 && P.hp < P.maxHp) { P.hp = Math.min(P.maxHp, P.hp + P.maxHp * sprintHeal()); toast('Second breath', '#7dff9a'); }
      if (swCd.left > 0) swCd.left = Math.max(0, swCd.left - sprintSw());
      if (phase === 'run' && bossStarted && boss.alive && current === boss.room && sprintBreak(bs, sprintBreakS())) {
        toast('Sprint broke its guard! Exposed', '#ffd84a'); cue('crit'); expWindows++; expHit = false; ctx.emit({ type: 'bossExposed', data: { floor, parried: false, sprint: true } });
      }
      if (sprintCompletes() && (Object.keys(cds) as ActionId[]).map((k) => completeCooldown(cds[k])).some(Boolean)) {
        toast('Sprint! Actions recharged', '#ffd84a'); cue('reward');
        ctx.emit({ type: 'actionsRecharged', data: { floor } });
      }
    }
    P.ward = Math.max(0, P.ward - dt); P.rally = Math.max(0, P.rally - dt);
    riderActions(input, bike);
    stanceTick(dt, bike);
    paceTick(dt, bike);

    // --- player movement
    P.invuln = Math.max(0, P.invuln - dt);
    const tile = tileAt(world, Math.floor(P.x), Math.floor(P.y));
    P.onSwamp = tile === TILE.SWAMP;
    P.speedMult = STANCES[stance].moveMult * sb('move') * speedCurve(bike.cadence3s) * (1 + gearSum('speed')) * mods.speedMult * (P.onSwamp ? 0.75 : 1) * (cursed('mire') ? 0.85 : 1);
    P.moving = false;
    P.rollCd = Math.max(0, P.rollCd - dt);
    if (ctl.roll && P.rollT <= 0) {
      const n = Math.hypot(ctl.mx, ctl.my) || 1;
      P.rollDx = ctl.mx / n; P.rollDy = ctl.my / n; P.rollT = 0.15; P.rollCd = rollCd(); P.invuln = Math.max(P.invuln, 0.3);
    }
    if (P.rollT > 0) { P.rollT -= dt; P.moving = true; move(P, P.rollDx * 14 * dt, P.rollDy * 14 * dt, HERO_WALL_R); }
    else {
      const sp = baseSpeed() * P.speedMult * dt, ox = P.x, oy = P.y;
      if (ctl.mx || ctl.my) { move(P, ctl.mx * sp, ctl.my * sp, HERO_WALL_R); P.moveAng = Math.atan2(ctl.my, ctl.mx); P.moving = sp > 0; }
      if (exploring && sp > 0 && phase === 'run') flowSample(Math.hypot(P.x - ox, P.y - oy) / sp, dt);
    }

    // --- room entry
    const room = activeRoom();
    if (!inRoom(room, P.x, P.y, 0)) {
      for (const r of world.rooms) if (r.id !== current && inRoom(r, P.x, P.y, 0.75)) {
        room.locked = false; current = r.id; markSeen(r);
        if (!r.cleared) {
          r.locked = true; cue('door');
          if (!r.boss && cursed('swarm')) for (let k = 0; k < 3; k++) {
            const sx = r.x0 + (r.w >> 1) + 0.5 + (k - 1) * 1.5, sy = r.y0 + 1.5;
            spawnEnemy(k === 1 ? 'chaser' : 'bat', sx, sy, r.id);
          }
          if (!r.boss && !curse && (floor > 1 || roomsCleared >= 2) && rng() < Math.min(0.2, curseChance() + 0.01 * (floor - 1))) startCurse(bike);
          if (r.boss && !bossStarted) {
            bossStarted = true; bossT = 0; bs = newBoss(bossCfg()); expWindows = 0; expStruck = 0; expHit = false; cue('bossStart'); freeze(0.5);
            addFx({ kind: 'banner', x: boss.x, y: boss.y, life: 3, color: '#ff5a5a', text: BOSS_NAMES[boss.variant].toUpperCase() });
            addFx({ kind: 'boom', x: boss.x, y: boss.y, life: 1, color: '#c77dff', r: 5 });
            toast(`${BOSS_NAMES[boss.variant]} awakens!`, '#ff5a5a');
            ctx.emit({ type: 'bossStart', data: { room: r.id, floor } });
          }
        } else safeRoom = r.id;
        break;
      }
    }

    // --- stairs
    if (!boss.alive && tileAt(world, Math.floor(P.x), Math.floor(P.y)) === TILE.STAIRS) { descend(); return; }

    // --- aim
    const target = nearestEnemy();
    if (target) {
      const d = Math.hypot(target.x - P.x, target.y - P.y), lead = d / weapon.speed;
      P.aim = Math.atan2(target.y + target.vy * lead - P.y, target.x + target.vx * lead - P.x);
    } else if (ctl.mx || ctl.my) P.aim = P.moveAng;

    // --- firing (only with something to shoot at, so coins/corridors stay calm)
    const revs = bike.crankRevs, per = revsPerShot() / weapon.rate / (P.rally > 0 ? rallyMult() : 1) / sb('fire');
    if (revs < P.lastShotRevs) P.lastShotRevs = revs;
    let shots = 0;
    while (revs - P.lastShotRevs >= per && shots < 6) {
      P.lastShotRevs += per; shots++;
      if (target && swapT <= 0) { fire(bike); output += playerDmg(bike) / weapon.rate; } // weapon-independent: shots scale with rate
    }
    if (target && swapT <= 0) fightT += dt;
    if (revs - P.lastShotRevs >= per) P.lastShotRevs = revs;

    // --- orbiting blades (unique)
    if (weapon.unique === 'orbit') {
      const blades = orbitBlades();
      for (const e of liveInRoom(current)) {
        e.orbitCd -= dt;
        if (e.orbitCd > 0) continue;
        if (blades.some((o) => Math.hypot(e.x - o.x, e.y - o.y) < e.r + 0.35)) { e.orbitCd = 0.3; damageEnemy(e, weapon.dmg * playerDmg(bike) * 0.8, bike, false, ELEMENT_COLORS[weapon.element]); }
      }
    }

    // --- bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      if (b.friendly && b.w?.unique === 'homing' && !b.child) {
        const e = nearestEnemy(b.x, b.y, undefined, 6);
        if (e) {
          const want = Math.atan2(e.y - b.y, e.x - b.x), cur = Math.atan2(b.vy, b.vx), sp = Math.hypot(b.vx, b.vy);
          let da = want - cur; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
          const na = cur + clamp(da, -7 * dt, 7 * dt);
          b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
        }
      }
      const ox = b.x, oy = b.y;
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; b.age += dt;
      let dead = b.life <= 0;
      if (!dead && solid(Math.floor(b.x), Math.floor(b.y))) {
        if (b.bounce > 0) {
          b.bounce--;
          if (solid(Math.floor(b.x), Math.floor(oy))) b.vx = -b.vx;
          if (solid(Math.floor(ox), Math.floor(b.y))) b.vy = -b.vy;
          b.x = ox; b.y = oy;
        } else dead = true;
        if (dead && b.w?.blast && !b.child) blast(b, bike, ELEMENT_COLORS[b.w.element]);
      }
      if (!dead && b.friendly) {
        for (const e of liveInRoom(current)) {
          if (b.hits!.includes(e.id)) continue;
          if (segDist(e.x, e.y, ox, oy, b.x, b.y) < e.r + b.r) {
            b.hits!.push(e.id);
            if (onHit(b, e, bike)) break;
            if (b.pierce-- <= 0) { dead = true; break; }
          }
        }
      } else if (!dead && !b.friendly && Math.hypot(P.x - b.x, P.y - b.y) < PLAYER_R + b.r) { hurtPlayer(b.dmg); dead = true; }
      if (dead) bullets.splice(i, 1);
    }

    // --- hazards (volatile elites)
    for (let i = hazards.length - 1; i >= 0; i--) {
      const h = hazards[i];
      h.left -= dt;
      if (h.left <= 0) {
        addFx({ kind: 'boom', x: h.x, y: h.y, life: 0.45, color: '#ff7a2a', r: h.r }); cue('explode');
        if (Math.hypot(P.x - h.x, P.y - h.y) < h.r + PLAYER_R) hurtPlayer(h.dmg);
        hazards.splice(i, 1);
      }
    }

    // --- enemies
    if (bossStarted && boss.alive) { bossT += dt; bossTick(dt); }
    updateFlow();
    const live = liveInRoom(current);
    for (const e of live) updateEnemy(e, dt, bike);
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
      const a = live[i], c = live[j], dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy), m = a.r + c.r;
      if (d > 0.001 && d < m) {
        const push = (m - d) * 0.5;
        if (a.kind !== 'boss') move(a, -dx / d * push, -dy / d * push, a.r);
        if (c.kind !== 'boss') move(c, dx / d * push, dy / d * push, c.r);
      }
    }

    // --- drops: magnet once the room is calm
    const cur = activeRoom();
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i], dx = P.x - d.x, dy = P.y - d.y, dist = Math.hypot(dx, dy);
      if (!cur.locked || dist < 1.5) {
        if (dist < 0.5) { collect(d); drops.splice(i, 1); continue; }
        const sp = Math.min(dist, (6 + 10 / (dist + 0.5)) * dt);
        d.x += dx / dist * sp; d.y += dy / dist * sp;
      }
    }

    // --- room clear
    if (cur.locked && liveCount(cur.id) === 0 && (!cur.boss || !boss.alive)) {
      cur.locked = false; cur.cleared = true; safeRoom = cur.id;
      roomsCleared++; cue('door');
      ctx.emit({ type: 'roomCleared', data: { room: cur.id, floor } });
      if (cur.chest && !cur.chest.opened) {
        cur.chest.opened = true; cue('reward');
        toast('Treasure chest!', '#ffd84a');
        dropItem(cur.chest.x, cur.chest.y, 1);
        for (let i = 0; i < 6; i++) dropAt(cur.chest.x, cur.chest.y, 'coin', coinValue());
        if (rng() < 0.5) dropAt(cur.chest.x, cur.chest.y, 'potion', 0);
      }
      const sh = shrines.find((s) => s.room === cur.id && s.state === 'idle');
      if (sh) {
        sh.state = 'active'; sh.left = SHRINES[sh.kind].window; sh.s0 = bike.sprintCount; cue('shrine');
        toast(`${SHRINES[sh.kind].label} (optional)`, SHRINES[sh.kind].color);
      }
      persist();
    }
    shrineUpdate(dt, bike);
    curseUpdate(dt, bike);

    // --- survival
    const inCombat = cur.locked && liveCount(cur.id) > 0;
    const regen = gearSum('regen') + mods.regen * P.maxHp / 100 + (bike.effortZone === 2 && !cursed('fragile') ? regenPerS() * (P.maxHp / 100) * (inCombat ? (floor === 1 ? 0.5 : regenCombat()) : 1) : 0);
    if (P.hp < P.maxHp) P.hp = Math.min(P.maxHp, P.hp + regen * dt);
    if (P.hp <= 0) die();

    // --- resistance
    const bsh = bossShield();
    const segT = dirCfg().targets[dir.seg];
    if (erg) ergSync(bsh.shielded ? ergSurge() : segT.erg);
    else resSync('terrain', terrainGrade() + segT.grade);
    if (!erg) resSync('swamp', P.onSwamp ? swampGrade() : null);
    if (!erg) resSync('wounded', P.hp < P.maxHp * woundedFrac() ? woundedGrade() : null);
    if (!erg) resSync('boss-surge', bsh.shielded ? surgeGrade() : null);
    if (!erg) resSync('curse-mire', cursed('mire') ? curseGrade() : null);

    if (enemies.length > 300) enemies = enemies.filter((e) => e.alive || e === boss);
    while (fx.length && t - fx[0].t0 > 4) fx.shift();
    ctx.debug('floor', floor); ctx.debug('room', current); ctx.debug('hp', Math.round(P.hp)); ctx.debug('weapon', weapon.name);
  }

  function orbitBlades() {
    return [0, 1, 2].map((i) => { const a = t * 3 + (i * Math.PI * 2) / 3; return { x: P.x + Math.cos(a) * 1.6, y: P.y + Math.sin(a) * 1.6 }; });
  }

  function updateEnemy(e: Enemy, dt: number, bike: Readonly<BikeState>) {
    const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    e.contactCd = Math.max(0, e.contactCd - dt);
    e.slowT = Math.max(0, e.slowT - dt);
    if (e.dotT > 0) { e.dotT -= dt; damageEnemy(e, e.dotDps * dt, bike); if (!e.alive) return; }
    if (e.elite === 'undying' && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.025 * dt);
    if (e.elite === 'shielded' && t - e.hurtT > 4) e.shield = Math.min(e.shieldMax, e.shield + e.shieldMax * 0.25 * dt);
    const haste = e.elite === 'swift' ? 0.6 : 1;
    const sp = e.speed * (e.slowT > 0 ? 0.55 : 1) * (cursed('frenzy') ? 1.4 : 1) * dt;
    const x0 = e.x, y0 = e.y;
    const step = (mx: number, my: number) => move(e, mx * sp, my * sp, e.r);
    const keepAt = (lo: number, hi: number) => { const s = d < lo ? -1 : d > hi ? 1 : 0; step(ux * s, uy * s); };
    const chase = () => { const c = chaseDir(e); step(c.x, c.y); };
    switch (e.kind) {
      case 'chaser': chase(); break;
      case 'bat': { e.wob += dt * 7; const w = Math.sin(e.wob) * 0.9, c = chaseDir(e); step(c.x - c.y * w, c.y + c.x * w); break; }
      case 'spitter':
        keepAt(4.5, 7); e.fireCd -= dt;
        if (e.fireCd <= 0) { e.fireCd = 2.6 * haste; ring(e.x, e.y, 8, 3.2, 6, rng() * Math.PI * 2); }
        break;
      case 'archer':
        if (e.tell <= 0) keepAt(5, 8);
        e.fireCd -= dt;
        if (e.fireCd <= 0.6 && e.fireCd > 0) e.tell = 1 - e.fireCd / 0.6;
        if (e.fireCd <= 0) { e.fireCd = 2.2 * haste; e.tell = 0; enemyShot(e.x, e.y, Math.atan2(dy, dx), 7, 8, 0.16); }
        break;
      case 'brute':
        e.fireCd -= dt;
        if (e.state === 1) {
          e.tell -= dt; move(e, e.vx * dt, e.vy * dt, e.r);
          if (e.tell <= 0) { e.state = 0; e.fireCd = (3.5 + rng()) * haste; }
        } else if (e.fireCd <= 0 && d < 6) { e.state = 1; e.tell = 0.7; e.vx = ux * 6.5; e.vy = uy * 6.5; }
        else chase();
        break;
      case 'bomber':
        if (e.state === 0) { chase(); if (d < 1.3) { e.state = 1; e.tell = 0; } }
        else {
          e.tell += dt / 0.7;
          if (e.tell >= 1) {
            addFx({ kind: 'boom', x: e.x, y: e.y, life: 0.45, color: '#ff7a2a', r: 2 }); cue('explode');
            if (d < 2 + PLAYER_R) hurtPlayer(24 * dmgMul());
            e.hp = 0; killEnemy(e); return;
          }
        }
        break;
      case 'summoner':
        keepAt(5, 8); e.fireCd -= dt;
        if (e.fireCd < 0.8) e.tell = 1 - Math.max(0, e.fireCd) / 0.8;
        if (e.fireCd <= 0 && e.summoned < 4) {
          e.fireCd = 6 * haste; e.tell = 0;
          for (let k = 0; k < 2; k++) { const b = spawnEnemy('bat', e.x + (rng() - 0.5) * 0.5, e.y + (rng() - 0.5) * 0.5, e.room); b.summoned = 1; b.xp *= 0.3; e.summoned++; }
          addFx({ kind: 'levelup', x: e.x, y: e.y, life: 0.5, color: '#b06cff', r: 1 });
        } else if (e.fireCd <= 0) e.fireCd = 3;
        break;
      case 'boss': bossAct(e, dt, d, ux, uy); break;
    }
    const rm = world.rooms[e.room];
    e.x = clamp(e.x, rm.x0 + e.r + 0.02, rm.x0 + rm.w - e.r - 0.02); e.y = clamp(e.y, rm.y0 + e.r + 0.02, rm.y0 + rm.h - e.r - 0.02);
    if (e.state !== 1 || e.kind === 'bomber') { e.vx = (e.x - x0) / dt; e.vy = (e.y - y0) / dt; }
    if (e.contact > 0 && d < e.r + PLAYER_R + 0.1 && e.contactCd <= 0) { hurtPlayer(e.contact); e.contactCd = e.kind === 'brute' ? 1 : 0.8; }
  }

  function bossTick(dt: number) {
    const cfg = bossCfg();
    for (const ev of stepBoss(bs, { dt, hpFrac: boss.hp / boss.maxHp, wardUp: P.ward > 0 }, cfg)) {
      if (ev === 'windup') { boss.tell = cfg.windupS; toast('Big attack coming! Ward it, then punish', '#ff7a2a'); cue('bossStart'); }
      else if (ev === 'bigAttack') bigAttack(boss);
      else if (ev === 'exposed') {
        if (stance === 'arcanist') bs.left += 1; // the shield-breaker keeps it open longer
        addFx({ kind: 'banner', x: boss.x, y: boss.y, life: 1.8, color: '#ffe08a', text: bs.parried ? 'PARRIED! EXPOSED' : 'EXPOSED ×2' });
        if (bs.parried) toast(`Parried with Ward: exposed +${cfg.parryBonusS}s`, '#8fd8ff');
        cue('crit'); expWindows++; expHit = false; ctx.emit({ type: 'bossExposed', data: { floor, parried: bs.parried } });
      } else if (ev === 'phase') {
        freeze(0.3); cue('bossStart');
        for (const b of bullets) if (!b.friendly) b.life = 0;
        addFx({ kind: 'banner', x: boss.x, y: boss.y, life: 2.2, color: '#ff5a5a', text: `${BOSS_NAMES[boss.variant]}: PHASE ${bs.phase}` });
        addFx({ kind: 'boom', x: boss.x, y: boss.y, life: 0.6, color: '#ff5a5a', r: 2.5 });
        ctx.emit({ type: 'bossPhase', data: { floor, phase: bs.phase } });
      } else if (ev === 'tide') { toast('The tide turns: the boss is tiring', '#7dff5a'); addFx({ kind: 'banner', x: P.x, y: P.y, life: 2.5, color: '#7dff5a', text: 'TURNING TIDE' }); }
    }
  }
  /** The telegraphed big attack: one per boss, a bit meaner each phase. */
  function bigAttack(e: Enemy) {
    const ph = bs.phase, spd = 4 + 0.5 * ph;
    e.spin += 0.4;
    switch (e.variant) {
      case 0: ring(e.x, e.y, 20 + 4 * ph, spd, 7, e.spin); for (let k = 0; k < ph; k++) spawnEnemy('chaser', e.x + (k - 1) * 1.2, e.y + 1.4, e.room).summoned = 1; break;
      case 1: for (let w = 0; w < 2; w++) ring(e.x, e.y, 14 + 2 * ph, spd - w, 7, e.spin + w * 0.2); break;
      case 2: ring(e.x, e.y, 18 + 4 * ph, spd + 1, 9, e.spin); e.state = 1; e.tell = 0.6; { const a = Math.atan2(P.y - e.y, P.x - e.x); e.vx = Math.cos(a) * 8; e.vy = Math.sin(a) * 8; } break;
      case 3: ring(e.x, e.y, 24 + 4 * ph, spd, 7, e.spin); break;
      case 4: for (let k = 0; k < 4; k++) for (let j = 0; j < 4 + ph; j++) enemyShot(e.x, e.y, e.spin + k * Math.PI / 2, 3 + j * 0.8, 7); break; // bone cross
      default: for (let w = 0; w < 3; w++) ring(e.x, e.y, 10 + 2 * ph, 2.5 + w * 1.3, 7, e.spin + w * 0.3); // frost bloom
    }
    addFx({ kind: 'boom', x: e.x, y: e.y, life: 0.5, color: e.variant === 5 ? '#9fe8ff' : '#ff7a2a', r: 3 });
    cue('explode'); freeze(0.1);
  }
  function bossAct(e: Enemy, dt: number, d: number, ux: number, uy: number) {
    if (bossStunned(bs) && e.state !== 1) return; // exposed or staggered: helpless
    if (bs.cycle === 'windup') { if (d > 3) { const c = chaseDir(e); move(e, c.x * e.speed * 0.4 * dt, c.y * e.speed * 0.4 * dt, e.r); } return; }
    if (e.state === 1) {
      e.tell -= dt; move(e, e.vx * dt, e.vy * dt, e.r);
      if (e.tell <= 0) e.state = 0;
      return;
    }
    if (d > 5) { const c = chaseDir(e); move(e, c.x * e.speed * dt, c.y * e.speed * dt, e.r); }
    e.fireCd -= dt; e.fireCd2 -= dt;
    const pace = 1 - 0.12 * (bs.phase - 1);
    if (e.fireCd <= 0) {
      e.fireCd = 2.3 * pace; e.spin += 0.3;
      ring(e.x, e.y, e.variant === 0 ? 16 : 12, 3.6, 6, e.spin);
    }
    if (e.fireCd2 <= 0) {
      e.fireCd2 = 1.5 * pace;
      const a = Math.atan2(uy, ux);
      switch (e.variant) {
        case 1: e.spin += 0.5; for (let k = 0; k < 4; k++) enemyShot(e.x, e.y, e.spin + k * Math.PI / 2, 4.5, 6); break;
        case 2: if (d < 9) { e.state = 1; e.tell = 0.8; e.vx = ux * 7; e.vy = uy * 7; } break;
        case 3: if (liveCount(e.room) < 5) { const s = spawnEnemy(rng() < 0.5 ? 'bat' : 'bomber', e.x, e.y + 1.5, e.room); s.summoned = 1; } break;
        case 4: if (liveCount(e.room) < 3 + bs.phase) { const s = spawnEnemy('archer', e.x + (rng() - 0.5) * 3, e.y + 1.5, e.room); s.summoned = 1; } else for (const o of [-0.2, 0.2]) enemyShot(e.x, e.y, a + o, 6, 7); break;
        case 5: for (let k = -3; k <= 3; k++) enemyShot(e.x, e.y, a + k * 0.12, 3.6, 6, 0.2); break; // frost breath
        default: for (const o of [-0.3, 0, 0.3]) enemyShot(e.x, e.y, a + o, 5, 7, 0.22);
      }
    }
  }

  function descend() {
    floorsCleared++; totals.floors++; cue('stairs');
    ctx.emit({ type: 'floorCleared', data: { floor, timeS: Math.round(t) } });
    floor++;
    bestFloor = Math.max(bestFloor, floor);
    P.potions = mods.potionCap;
    buildFloor(); dir = newFloor(false);
    recomputeHp(true);
    toast(`Floor ${floor} — potions refilled`, '#ffd84a');
    persist();
  }

  /** Death ends the descent: back to camp with every coin banked; hero level and loot reset at the next start. */
  function die() {
    deaths++; totals.deaths++; deepest = Math.max(deepest, floor); topLevel = Math.max(topLevel, P.level); // summary is per session, across runs
    ctx.emit({ type: 'death', data: { room: current, floor } });
    const banked = P.coinsEarned; earnedPrev += banked; lastDeath = { floor, banked };
    // no death spiral: dying on the floor you started on suggests a start 2 floors shallower next time (still adjustable at camp)
    if (!opts?.floor && floor === startFloor && startFloor > 1) startFloor = Math.max(1, startFloor - 2);
    bankStart += P.coinsEarned; totals.coins += P.coinsEarned; P.coinsEarned = 0; P.coins = 0;
    P.hp = 0; bullets.length = 0; hazards.length = 0; navPath = []; curse = null;
    toast(`You fell on floor ${floor}. ${banked} coins banked. Back to camp.`, '#ff5a5a');
    cue('hurt');
    enterCamp();
    persist();
  }
  function enterCamp() {
    phase = 'camp'; campT = 0; campSel = 0;
    for (const id of ['swamp', 'wounded', 'boss-surge', 'curse-mire']) resSync(id, null);
  }

  function campView(): CampView {
    return { bank: Math.round(bankStart), sel: campSel, autoStartS: campAutoS(), autoStartLeft: campAutoS() - campT, startFloor, maxStartFloor: mods.maxStartFloor, autoInvest: autoInvestOn, rows: campRows(), bestFloor, runs, lastDeath };
  }

  function snapshot(): DungeonSnapshot {
    const sh = bossShield();
    const ev: EnemyView[] = [];
    for (const e of enemies) if (e.alive && (e.kind !== 'boss' || bossStarted)) ev.push({
      id: e.id, kind: e.kind, x: e.x, y: e.y, r: e.r, hp: e.hp, maxHp: e.maxHp, exposed: e.kind === 'boss' && bs.cycle === 'exposed',
      hurt: t - e.hurtT, face: P.x >= e.x ? 1 : -1, slowed: e.slowT > 0, dot: e.dotT > 0, tell: clamp(e.kind === 'brute' || e.kind === 'boss' ? e.state : e.tell, 0, 1),
      variant: e.variant, elite: e.elite, shieldFrac: e.shieldMax > 0 ? e.shield / e.shieldMax : 0,
    });
    const bv: BulletView[] = bullets.map((b) => ({
      x: b.x, y: b.y, r: b.r, friendly: b.friendly, style: b.w ? b.w.base : 'enemy', color: b.w ? ELEMENT_COLORS[b.w.element] : '#ff5a5a',
      angle: Math.atan2(b.vy, b.vx), age: b.age,
    }));
    return {
      t, phase, camp: phase === 'camp' ? campView() : null, world, floor,
      player: {
        x: P.x, y: P.y, r: PLAYER_R, hp: P.hp, maxHp: P.maxHp, potions: P.potions, potionCap: mods.potionCap,
        invuln: P.invuln > 0, onSwamp: P.onSwamp, speedMult: P.speedMult, moving: P.moving, rolling: P.rollT > 0, warded: P.ward > 0, rallied: P.rally > 0, hurt: t - P.hurtT,
        secondWind: swCd.left <= 0 ? 1 : 1 - swCd.left / swCd.total, secondWindFlash: Math.max(0, 1 - (t - swUsedT) / 2.5), level: P.level, xp: P.xp, xpNext: xpNext(P.level), coins: P.coins, bank: Math.round(bankStart + P.coinsEarned),
      },
      weapon, gear: { ...gear },
      aim: { angle: P.aim },
      stance: {
        id: stance, name: STANCES[stance].name, role: STANCES[stance].role, color: STANCES[stance].color, band: STANCES[stance].band,
        styleOn, styleHidden: spinCalled(), swapping: pick ?? swapTo, ready: 1, suggest: suggestion,
        list: stancesFor(mods.arcanist).map((id) => ({ id, name: STANCES[id].name, color: STANCES[id].color, weapon: slots[id]?.name ?? '', base: slots[id]?.base ?? '', level: slots[id]?.level ?? 0, rarity: slots[id]?.rarity ?? 0 })),
      },
      pace: { seg: dir.seg, label: DEFAULT_TARGETS[dir.seg].label, erg, segT: dir.segT },
      refill: { rate: lastRate, zone: Math.max(1, Math.min(5, ctx.bike().powerZone)) },
      ai: { path: phase === 'run' ? navPath.slice(0, 40) : [], targetId: P.targetId },
      actions: (['strike', 'ward', 'rally', 'potion'] as ActionId[]).map((id) => ({
        id, button: ACTION_BUTTON[id], label: ACTION_LABEL[id], ready: readyFrac(cds[id]),
        usable: cds[id].left <= 0 && (id === 'rally' ? spinCalled() : id === 'potion' ? P.potions > 0 && P.hp < P.maxHp : true),
      })),
      enemies: ev, bullets: bv, drops: drops.map(({ item: _i, value: _v, ...d }) => d),
      hazards: hazards.map(({ dmg: _d, ...h }) => h),
      orbit: weapon.unique === 'orbit' && phase === 'run' ? orbitBlades() : [],
      shrines: shrines.map((s) => ({ kind: s.kind, label: SHRINES[s.kind].label, progress: s.progress, leftS: Math.max(0, s.left), state: s.state, x: s.x, y: s.y, room: s.room })),
      curse: curse ? { kind: curse.kind, ...CURSES[curse.kind], left: Math.max(0, curse.left), total: curse.total } satisfies CurseView : null,
      fx: fx.slice(), toasts: toasts.filter((x) => t - x.t0 < 6), cues: cues.slice(),
      room: current, stairsOpen: !boss.alive, frozen: hitT > 0,
      boss: bossStarted ? { active: boss.alive, name: BOSS_NAMES[boss.variant], hp: Math.max(0, boss.hp), maxHp: boss.maxHp, phase: bs.phase, cycle: bs.cycle, left: bs.left, fightT: bs.fightT, tide: tideBonus(bs.fightT, bossCfg()), splits: bossCfg().phaseSplits } : null,
      stats: { roomsCleared, kills, deaths, damageDealt, output, fireT: fightT, bossDefeated, floorsCleared, elites: elitesSlain, uniques: uniquesFound, curses: cursesSurvived },
      hooks: { boss: bossStarted && boss.alive, shielded: sh.shielded, swamp: P.onSwamp, seg: dir.seg, cadence: dir.seg === 'spinup' ? dirCfg().spinRpm + 6 : 90,
        powerFtp: phase === 'camp' ? DEFAULT_TARGETS.cooldown.erg : sh.shielded && erg ? ergSurge() : dirCfg().targets[dir.seg].erg },
    };
  }

  const inMenu = () => phase === 'camp';

  function paceZone(): NonNullable<GameHud['targetZone']> {
    const T = DEFAULT_TARGETS[dir.seg];
    return { min: T.zone[0], max: T.zone[1], label: `${curse && dir.seg === 'explore' ? 'Cursed: ride it out' : T.label}${erg ? ` · ERG ${Math.round(dirCfg().targets[dir.seg].erg * 100)}%` : ''}`, ...(T.source ? { source: T.source } : {}) };
  }
  function hud(): GameHud {
    if (phase === 'camp') return {
      controls: [{ button: 'dpad', label: 'Choose' }, { button: 'a', label: 'Buy / select', shortLabel: 'Select' }, { button: 'b', label: 'Begin descent', shortLabel: 'Start' }],
      gears: !erg, targetZone: { min: 1, max: 2, label: deaths ? 'Cool down' : 'Warm up' },
    };
    const sh = bossShield();
    const act = shrines.find((s) => s.state === 'active');
    // shields and shrines are short efforts, judged on power (sprint detection is power-based too)
    const target: GameHud['targetZone'] = sh.shielded ? { min: 4, max: 5, label: bs.cycle === 'exposed' ? 'Exposed! Sprint now' : 'Big attack: get ready', source: 'power' }
      : act?.kind === 'fury' ? { min: 3, max: 5, label: 'Shrine: Z3+', source: 'power' }
      : act?.kind === 'sprint' ? { min: 5, max: 5, label: 'Shrine: sprint!', source: 'power' }
      : act ? { min: 2, max: 2, label: 'Shrine: hold Z2' }
      : paceZone();
    return {
      controls: [
        ...(['strike', 'ward', 'rally', 'potion'] as ActionId[]).map((id): ControlHint => {
          const usable = id === 'rally' ? spinCalled() : id === 'potion' ? P.potions > 0 && P.hp < P.maxHp : true, ready = cds[id].left <= 0;
          return { button: ACTION_BUTTON[id], label: ACTION_LABEL[id], active: ready && usable,
            cooldown: { fill: readyFrac(cds[id]), ready, tint: effortTint(ctx.bike().powerZone), flourish: effortFlourish(ctx.bike().powerZone) } };
        }),
        { button: 'dpad', label: 'Stance', active: true },
        { button: 'shiftersL', label: 'Gear' },
        { button: 'shiftersR', label: 'Gear' },
      ],
      gears: !erg, targetZone: target,
      targetCadence: dir.seg === 'spinup' ? { min: dirCfg().spinRpm, label: 'Spin up!' } : act?.kind === 'whirl' ? { min: Math.round(whirlRpm()), label: 'Shrine: spin!' }
        : phase === 'run' ? { min: STANCES[stance].band[0], max: STANCES[stance].band[1], label: `${STANCES[stance].name} style` } : undefined, // called targets win
    };
  }

  const api: GameSim & { navStats?: () => Record<string, number> } = {
    update, hud, inMenu, snapshot, isOver: () => false,
    receive(a: unknown) {
      const act = a as { type?: string; row?: number; id?: string };
      if (act?.type === 'action' && phase === 'run' && typeof act.id === 'string' && act.id in ACTION_BUTTON && tapped.length < 4) tapped.push(act.id as ActionId);
      if (act?.type === 'campRow' && typeof act.row === 'number' && pending.length < 8) pending.push({ type: 'campRow', row: act.row });
    },
    summary: () => ({
      'Deepest floor': Math.max(deepest, floor), 'Hero level': Math.max(topLevel, P.level), 'Rooms cleared': roomsCleared, Kills: kills, 'Elites slain': elitesSlain,
      'Bosses slain': bossDefeated, Deaths: deaths, 'Coins earned': Math.round(earnedPrev + P.coinsEarned), 'Coins banked': Math.round(bankStart + P.coinsEarned),
      'Best find': phase === 'run' ? bestFind.name : '-', 'Uniques found': uniquesFound, 'Curses survived': cursesSurvived, 'Final weapon': weapon.name, 'Second Winds': secondWinds, Stance: STANCES[stance].name,
    }),
    dispose() { if (phase === 'run') persist(); ctx.resistance.clearAll(); ctx.resistance.useVirtualGears(false); },
  };
  api.navStats = () => ({ ...fstat, fallbacks: stuckStats }); // headless-only movement metrics
  return api;
}
