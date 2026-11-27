import type { BikeState, Button, ControlHint, GameContext, GameHud, GameMenuAction, GameSim, InputState, Seconds } from '../../../contracts';
import { generateWorld, tileAt, TILE, type EnemyKind, type Room, type ShrineKind, type World } from './world';
import {
  ELEMENT_COLORS, RARITY_COLORS, SLOTS, UNIQUES, makeGear, makeUnique, makeWeapon, pickWeaponStyle, rollRarity, sellValue, starterWeapon, weaponScore,
  type Gear, type Rarity, type Slot, type Weapon,
} from './loot';
import { DEFAULT_ZONE_REFILL, completeCooldown, startCooldown, effortFlourish, effortTint, refillRate, tickCooldown } from '../../../core/cooldown';
import { DEFAULT_CFG, DEFAULT_TARGETS, newFloor, spinupCalled, stepDirector, type DirectorCfg, type DirectorState, type Seg } from './director';
import { sprintBreak, DEFAULT_BOSS, bossDamageMult, bossStunned, newBoss, strikeBoss, stepBoss, tideBonus, type BossCfg, type BossState } from './boss';
import {
  ARCHETYPES, ARCHETYPE_ORDER, PACE_MODES, archetypeDirectorCfg, grimpeurProgress, isArchetypeUnlocked, unlockedArchetypes,
  type ArchetypeId, type PaceBias,
} from './archetypes';
import {
  SKILL_TREES, branchPoints, canInvestNode, chosenForksAndCapstones, computeTreeMods, deriveBuildTitle, getNodeById, getNodeRank,
  investSkillNode, nodeState, quickPickCards, suggestQuickPick, totalSpentPoints,
  type SkillRanks, type TreeMods,
} from './skillTree';
import { clearLine, cadenceSpeed, findPath, readyFrac, shouldAutoPotion, standoff, type ActionId, type Cooldown } from './ai';
import { DELVE_MAX, RETIRED, UPGRADES, spentOn, autoInvest, lvl, metaMods, upgradeCost, type Levels, type MetaMods } from './meta';
import { BOSS_NAMES, FLOORS, SWEEPER, TIERS, floorRoomCount, planFor, tierOf, unlockAfterWin, type RunResult } from './descent';
import { ARCHETYPE_STRIKE, arcanePulseProc, onKillElementProc, stormChainTargets } from './elementProcs';
import { evaluateLootOffer } from './lootOffer';
import { dmgPower, sprintDamageScale } from './personal';
import type {
  BulletView, CampArchetypeCard, CampView, CurseKind, CurseView, DropView, DungeonSnapshot, EliteMod, EnemyView, FinishSeqView, Fx, Hazard,
  LootOfferView, ShrineView, SkillTreeView, Toast,
} from './types';

interface Enemy {
  id: number; kind: EnemyKind | 'boss'; x: number; y: number; r: number; hp: number; maxHp: number;
  speed: number; contact: number; contactCd: number; fireCd: number; fireCd2: number; room: number; alive: boolean; spin: number;
  hurtT: number; slowT: number; dotT: number; dotDps: number; burnStacks: number; condT: number; tell: number; state: number;
  vx: number; vy: number; xp: number; wob: number; summoned: number; variant: number; elite: EliteMod | null;
  shield: number; shieldMax: number; orbitCd: number;
}
interface Bullet {
  x: number; y: number; vx: number; vy: number; r: number; dmg: number; life: number; age: number; friendly: boolean;
  w?: Weapon; hits?: number[]; pierce: number; bounce: number; crit?: boolean; child?: boolean; ric?: number;
  orb?: boolean; crush?: boolean; bleed?: boolean;
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
const SHRINES: Record<ShrineKind, { label: string; window: number; color: string }> = {
  fury: { label: 'Shrine of Fury: ride power Z3+ for 20s', window: 50, color: '#ff8c2a' },
  endurance: { label: 'Shrine of Patience: hold Z2, treasure grows', window: 90, color: '#5aa9ff' },
  sprint: { label: 'Shrine of Gold: sprint twice', window: 60, color: '#ffd84a' },
  whirl: { label: 'Shrine of the Whirlwind: spin fast (easy gear) for 15s', window: 45, color: '#8fd8ff' },
};
const CURSES: Record<CurseKind, { name: string; desc: string; color: string; dur: number }> = {
  frenzy:   { name: 'Attack!',          desc: 'enemies move 40% faster',        color: '#ff5a5a', dur: 60 },
  hexed:    { name: 'Road Rash',        desc: 'you take 40% more damage',       color: '#c77dff', dur: 60 },
  swarm:    { name: 'The Peloton',      desc: 'rooms spawn extra foes',        color: '#ffb02a', dur: 75 },
  darkness: { name: 'Tunnel Vision',    desc: 'the torchlight shrinks',         color: '#6a6aff', dur: 60 },
  mire:     { name: 'Headwind',         desc: '+2% grade, slower feet',         color: '#7a9a3a', dur: 45 },
  fragile:  { name: 'The Bonk',         desc: 'no zone-2 healing',              color: '#ff6b8a', dur: 60 },
  bulwark:  { name: 'Carbon Plating',   desc: 'enemies take 35% less damage',   color: '#9aa3b5', dur: 60 },
};
const CURSE_KINDS = Object.keys(CURSES) as CurseKind[];
const PLAYER_R = 0.35, MAX_FX = 140;
const HERO_WALL_R = 0.3;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
  const k = l2 > 0 ? clamp(((px - ax) * vx + (py - ay) * vy) / l2, 0, 1) : 0;
  return Math.hypot(px - ax - vx * k, py - ay - vy * k);
}

const HIT_STOP_MAX = 0.1;
const DX4 = [1, -1, 0, 0], DY4 = [0, 0, 1, -1];

export interface DungeonOpts {
  seed?: number; autopilot?: boolean; floor?: number; skipCamp?: boolean;
  archetype?: ArchetypeId; erg?: boolean; actionBot?: boolean; invulnerable?: boolean;
  /** headless skill-tree policy: 'suggest' (default), 'first', 'none' (bank without auto-popup) */
  skills?: 'suggest' | 'first' | 'none';
}
export interface DungeonTotals { runs: number; deaths: number; floors: number; bosses: number; coins: number; climbs?: number }
export interface DungeonSave {
  ver?: number; bank?: number; upgrades?: Levels; bestFloor?: number; runs?: number; autoInvest?: boolean;
  archetype?: ArchetypeId; climbs?: number; totals?: DungeonTotals; erg?: boolean;
  tier?: number; tierUnlocked?: number; wins?: number[]; bestWinS?: number;
}
export const SAVE_VER = 4;

/** Upgrade an old save in place: refunds retired upgrades (Swiftness, Arcanist stance) as coins and initializes archetype/climbs. Pure. */
export function migrateSave(s: DungeonSave | null | undefined): DungeonSave {
  const out: DungeonSave = { ...(s ?? {}) };
  out.upgrades = { ...(out.upgrades ?? {}) };
  const ups = out.upgrades as Record<string, number>;
  if ((out.ver ?? 1) < 2) {
    if (ups.swift) { out.bank = (out.bank ?? 0) + spentOn(RETIRED.swift, ups.swift); delete ups.swift; }
    out.totals = out.totals ?? { runs: out.runs ?? 0, deaths: 0, floors: 0, bosses: 0, coins: 0, climbs: 0 };
  }
  if ((out.ver ?? 1) < 3) {
    const d = UPGRADES.find((u) => u.id === 'delve')!;
    if ((ups.delve ?? 0) > DELVE_MAX) { out.bank = (out.bank ?? 0) + spentOn(d, ups.delve) - spentOn(d, DELVE_MAX); ups.delve = DELVE_MAX; }
    out.bestFloor = Math.min(FLOORS, out.bestFloor ?? 1);
  }
  if ((out.ver ?? 1) < 4) {
    if (ups.arcanist) { out.bank = (out.bank ?? 0) + spentOn(RETIRED.arcanist, ups.arcanist); delete ups.arcanist; }
    out.archetype = out.archetype && out.archetype in ARCHETYPES ? out.archetype : 'rouleur';
    out.climbs = out.climbs ?? out.totals?.climbs ?? 0;
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
  const baseDamage = tn.num('baseDamage', 10, 1, 100, 1, 'x weapon dmg x clamp(power,0.3,2.5) (power = ftpFraction, the part above FTP evened out by the power profile)');
  const profileDmg = tn.bool('profileSprintDamage', true, 'Even out sprint damage: your own best 10 s hits as hard as a typical rider\'s (shared power profile; riding at or under FTP is unchanged)');
  const profileDmgMinK = tn.num('profileSprintDmgMinK', 0.5, 0.2, 1, 0.05, 'Power profile: big sprinters keep at least this share of the damage above FTP');
  const profileDmgMaxK = tn.num('profileSprintDmgMaxK', 1.8, 1, 3, 0.05, 'Power profile: modest sprinters get at most this many times the damage above FTP');
  let dmgK: { key: string; k: number } | null = null;
  /** Scale for damage from power above FTP (only changes between rides, or when its tunables move). */
  const sprintDmgK = () => {
    if (!profileDmg()) return 1;
    const lo = profileDmgMinK(), hi = profileDmgMaxK(), key = `${lo}|${hi}`;
    if (dmgK?.key !== key) dmgK = { key, k: sprintDamageScale(ctx.profile, 10, lo, Math.max(lo, hi)) };
    return dmgK.k;
  };
  const regenPerS = tn.num('regenPerS', 2, 0, 20, 0.5, 'HP/s per 100 max HP in zone 2 out of combat');
  const regenCombat = tn.num('regenInCombatFrac', 0, 0, 1, 0.05, 'zone-2 regen multiplier while enemies are awake (floor 1 always 0.5)');
  const enemyDmgGrowth = tn.num('enemyDamageGrowth', 1.52, 1, 2, 0.01, 'enemy damage multiplier per floor');
  const furyAfter = tn.num('bossFuryAfterS', 60, 20, 600, 10, 'boss damage starts climbing after this long in the fight (not on floor 1)');
  const furyRate = tn.num('bossFuryRate', 0.03, 0, 0.05, 0.001, 'extra boss-fight damage per second past bossFuryAfterS (max +150%)');
  const bossHpGrowth = tn.num('bossHpGrowth', 1.56, 1, 2, 0.01, 'boss HP multiplier per floor (floor 1 boss is x0.55)');
  const floor1Ease = tn.num('floor1Ease', 0.35, 0.3, 1, 0.05, 'enemy damage multiplier on floor 1 (keeps the warm-up floor gentle)');
  const strikeCd = tn.num('strikeCdS', 30, 2, 120, 1, 'Strike (A) cooldown');
  const strikeMult = tn.num('strikeDamageMult', 4, 1, 30, 0.5, 'Strike damage as a multiple of one shot');
  const strikeRadius = tn.num('strikeRadius', 3.5, 1, 8, 0.25, 'tiles');
  const wardCd = tn.num('wardCdS', 45, 2, 120, 1, 'Ward (B) cooldown');
  const wardDur = tn.num('wardDurS', 2, 0.5, 10, 0.5, 'Ward blocks all damage for this long');
  const rallyCd = tn.num('rallyCdS', 35, 2, 120, 1, 'Rally (Y) cooldown; usable anytime, bonus duration during called spin-ups');
  const rallyDur = tn.num('rallyDurS', 10, 1, 30, 1);
  const rallyMult = tn.num('rallyFireMult', 1.5, 1, 3, 0.05, 'fire-rate multiplier while Rally is up');
  const lootPromptS = tn.num('lootPromptS', 8, 2, 20, 0.5, 'seconds a Loot Choice prompt waits before taking its default choice');
  const rollCd = tn.num('aiRollCdS', 2, 0.5, 10, 0.5, 'AI dodge-roll cooldown');
  const potionCd = tn.num('potionCdS', 6, 0, 30, 0.5, 'Potion (Z) cooldown');
  const zoneRates = [1, 0, 0, 0, 0, 0];
  const zoneRefill = [1, 2, 3, 4, 5].map((z) => tn.num(`cdRefillZ${z}`, DEFAULT_ZONE_REFILL[z], 0.1, 10, 0.1, `cooldown refill speed at power zone ${z} (x base)`));
  const sprintCompletes = tn.bool('cdSprintCompletes', true, 'a detected sprint finishes every refilling action');
  const archDropBias = tn.num('archetypeDropBias', 0.72, 0, 1, 0.05, 'share of weapon drops rolled for the active hero archetype');
  const cadRef = tn.num('dmgCadenceRef', 90, 0, 140, 1, 'per-shot cadence normalization (0 = off)');
  const potionHeal = tn.num('potionHeal', 0.38, 0.1, 1, 0.05, 'fraction of max HP');
  const autoPotionFrac = tn.num('autoPotionHpFrac', 0.35, 0, 0.9, 0.05, 'AI drinks below this HP fraction if rider has not drunk in 10 s');
  const maxHpT = tn.num('playerHp', 100, 20, 500, 10);
  const enemyDmgScale = tn.num('enemyDamageScale', 1.9, 0.1, 3, 0.1);
  const enemyHpMult = tn.num('enemyHpMult', 1.5, 0.2, 5, 0.1, 'base enemy HP multiplier');
  const enemyHpGrowth = tn.num('enemyHpGrowth', 1.36, 1, 2, 0.01, 'enemy HP multiplier per floor');
  const bossHpT = tn.num('bossHp', 4500, 100, 20000, 50, 'base boss HP (x enemyHpMult, x bossHpGrowth per floor)');
  const sprintMult = tn.num('bossSprintDamageMult', 2, 1, 5, 0.1, 'extra damage for sprinting (or ERG surge) while boss is exposed');
  const bossTn = {
    p2: tn.num('bossPhase2Hp', DEFAULT_BOSS.phaseSplits[0], 0.1, 0.95, 0.01), p3: tn.num('bossPhase3Hp', DEFAULT_BOSS.phaseSplits[1], 0.05, 0.9, 0.01),
    bigEveryS: tn.num('bossBigEveryS', DEFAULT_BOSS.bigEveryS, 6, 60, 1),
    windupS: tn.num('bossWindupS', DEFAULT_BOSS.windupS, 0.5, 5, 0.1),
    exposedS: tn.num('bossExposedS', DEFAULT_BOSS.exposedS, 1, 15, 0.5),
    exposedMult: tn.num('bossExposedMult', DEFAULT_BOSS.exposedMult, 1, 5, 0.1),
    strikeBonusS: tn.num('bossStrikeBonusS', DEFAULT_BOSS.strikeBonusS, 0, 5, 0.5), parryBonusS: tn.num('bossParryBonusS', DEFAULT_BOSS.parryBonusS, 0, 5, 0.5),
    tideAfterS: tn.num('bossTideAfterS', DEFAULT_BOSS.tideAfterS, 30, 600, 10),
    tideRate: tn.num('bossTideRate', DEFAULT_BOSS.tideRate, 0, 0.05, 0.001),
  };
  const bossCfg = (): BossCfg => ({
    ...DEFAULT_BOSS, phaseSplits: [bossTn.p2(), Math.min(bossTn.p3(), bossTn.p2() - 0.05)], bigEveryS: bossTn.bigEveryS(), windupS: bossTn.windupS(),
    exposedS: bossTn.exposedS(), exposedMult: bossTn.exposedMult(), strikeBonusS: bossTn.strikeBonusS(), parryBonusS: bossTn.parryBonusS(),
    tideAfterS: bossTn.tideAfterS(), tideRate: bossTn.tideRate(),
  });
  const itemDropPct = tn.num('itemDropPct', 10, 0, 100, 1, '% chance an enemy drops a weapon/gear');
  const uniquePct = tn.num('uniqueDropPct', 0.6, 0, 100, 0.1, '% of item drops that are uniques');
  const eliteBase = tn.num('eliteChance', 0.05, 0, 1, 0.01, 'elite chance on floor 1 (+1.5%/floor, max 25%)');
  const curseChance = tn.num('curseChance', 0.08, 0, 1, 0.01, 'chance per uncleared room entered');
  const curseGrade = tn.num('gradeCurseMire', 2, 0, 8, 0.5, 'extra grade during Headwind curse');
  const sprintHeal = tn.num('sprintHealFrac', 0.45, 0, 1, 0.05, 'a sprint heals this fraction of max HP');
  const sprintGuard = tn.num('sprintGuard', 0.6, 0, 1, 0.05, 'damage taken cut while sprinting');
  const sprintBreakS = tn.num('bossSprintBreakS', 4, 0, 10, 0.5, 'sprint while boss idle exposes it');
  const fireS = tn.num('sprintFiredUpS', 90, 0, 120, 5, 'Fired Up duration after sprint');
  const fireMult = tn.num('sprintFiredUpDmg', 2, 1, 3, 0.05, 'damage multiplier while sprinting or Fired Up');
  const sprintSw = tn.num('sprintSecondWindS', 120, 0, 600, 10, 'sprint seconds off Second Wind CD');
  const swCdT = tn.num('secondWindCdS', 540, 30, 1800, 10, 'Second Wind recharge');
  const swHeal = tn.num('secondWindHeal', 0.5, 0.1, 1, 0.05, 'Second Wind heal fraction');
  const swInvuln = tn.num('secondWindInvulnS', 1, 0, 3, 0.1);
  const campAutoS = tn.num('campAutoStartS', 45, 5, 300, 5, 'camp auto-starts after this long');
  const dirTn = {
    warmupS: tn.num('paceWarmupS', DEFAULT_CFG.warmupS, 0, 600, 10),
    ambushS: tn.num('paceAmbushS', DEFAULT_CFG.ambushS, 10, 120, 5),
    recoverS: tn.num('paceRecoverS', DEFAULT_CFG.recoverS, 0, 300, 5),
    spinupS: tn.num('paceSpinupS', DEFAULT_CFG.spinupS, 5, 60, 1),
    firstAmbushAtS: tn.num('paceFirstAmbushS', DEFAULT_CFG.firstAmbushAtS, 0, 600, 5),
    spinupAfterS: tn.num('paceSpinupAfterS', DEFAULT_CFG.spinupAfterS, 0, 300, 5),
    secondEffortMin: tn.num('paceSecondEffortMin', DEFAULT_CFG.secondEffortMin, 0, 180, 5),
    spinRpm: tn.num('paceSpinRpm', DEFAULT_CFG.spinRpm, 80, 140, 1),
  };
  const segTn = Object.fromEntries((Object.keys(DEFAULT_TARGETS) as Seg[]).map((k) => [k, {
    erg: tn.num(`erg_${k}`, DEFAULT_TARGETS[k].erg, 0.3, 1.5, 0.01),
    grade: tn.num(`grade_${k}`, DEFAULT_TARGETS[k].grade, -5, 10, 0.5),
  }])) as Record<Seg, { erg: () => number; grade: () => number }>;
  const ambushN = tn.num('ambushEnemies', 4, 1, 12, 1);
  const ergSurge = tn.num('ergBossSurge', 1.15, 0.8, 2, 0.05);
  const spinGoodFrac = tn.num('spinupGoodFrac', 0.5, 0, 1, 0.05);
  const campGrade = tn.num('gradeCamp', 0, -5, 10, 0.5);
  const terrainGrade = tn.num('gradeTerrain', 1, 0, 10, 0.5);
  const swampGrade = tn.num('gradeSwamp', 4, 0, 12, 0.5);
  const woundedGrade = tn.num('gradeWounded', 2, 0, 10, 0.5);
  const woundedFrac = tn.num('woundedHpFrac', 0.4, 0.1, 0.9, 0.05);
  const surgeGrade = tn.num('gradeBossSurge', 5, 0, 12, 0.5);
  const whirlRpm = tn.num('whirlRpm', 95, 60, 140, 1);
  const sweeperHp = tn.num('sweeperHpMult', 1.25, 0.3, 4, 0.05);
  const finalRooms = tn.num('finalFloorRooms', 4, 2, 12, 1);
  const winBonus = tn.num('winBonusCoins', 1500, 0, 20000, 50);
  const skillAutoS = tn.num('skillAutoPickS', 18, 3, 120, 1, 'highlighted Quick-Pick skill card auto-invests after this long');
  const skillDelayS = tn.num('skillOfferDelayS', 0.55, 0, 5, 0.1, 'level-up auto-popup delay after room clear');

  const rng = () => ctx.rng();

  // ---------- meta (persisted across runs) ----------
  const saved = migrateSave(ctx.load<DungeonSave>());
  const totals: DungeonTotals = { runs: 0, deaths: 0, floors: 0, bosses: 0, coins: 0, climbs: 0, ...(saved.totals ?? {}) };
  const levels: Levels = { ...(saved.upgrades ?? {}) };
  let bankStart = saved.bank ?? 0, bestFloor = Math.min(FLOORS, saved.bestFloor ?? 1), runs = saved.runs ?? 0, sessionRuns = 0, autoInvestOn = saved.autoInvest ?? true;
  let climbsTotal = saved.climbs ?? totals.climbs ?? 0;
  let tierUnlocked = clamp(saved.tierUnlocked ?? 0, 0, TIERS.length - 1), tier = clamp(saved.tier ?? tierUnlocked, 0, tierUnlocked), runTier = tier;
  const wins: number[] = TIERS.map((_, i) => saved.wins?.[i] ?? 0);
  let bestWinS = saved.bestWinS ?? 0, runT0 = 0, runKills0 = 0, runBosses0 = 0, runClimbs0 = 0, descentsWon = 0, lastRun: RunResult | undefined;
  const T = () => tierOf(runTier);
  let mods: MetaMods = metaMods(levels, bestFloor);
  let startFloor = clamp(opts?.floor ?? 1, 1, FLOORS);
  let sprintingNow = false, firedUpUntil = -1;
  let phase: 'camp' | 'run' = 'camp', campSel = 0, campT = 0, campLockT = 0;
  let erg = opts?.erg ?? !!saved.erg, dir: DirectorState = newFloor(true), spinGood = 0, ergCurseSpinT = 0;
  let swCd: Cooldown = { left: 0, total: 0 }, swUsedT = -99, secondWinds = 0, deepest = 1, topLevel = 1, earnedPrev = 0, lastDeath: CampView['lastDeath'];

  // ---------- archetype, mid-ride pace bias & skill tree ----------
  const unlockProgress = () => ({ bestFloor, climbs: climbsTotal });
  let archetype: ArchetypeId = opts?.archetype ?? saved.archetype ?? 'rouleur';
  if (!opts?.archetype && !isArchetypeUnlocked(archetype, unlockProgress())) archetype = 'rouleur';
  let paceBias: PaceBias = 0;
  let skillRanks: SkillRanks = {};
  let unspentSP = 0;
  let relicBonusBranches: number[] = [];
  let skillOfferDueT = -1;
  let skillOffer: {
    mode: 'quick' | 'full';
    sel: number;
    focusNodeId: string;
    age: number;
    manual: boolean;
    reason: string;
  } | null = null;
  let tm: TreeMods = computeTreeMods(archetype, skillRanks, { cadence: 0, powerZone: 1, effortZone: 1, sprinting: false, firedUp: false, climbing: false });

  // Dynamic skill-tree runtime state (per run)
  let wardBlocks = 0;
  let pelotonThornsUntil = -1;
  let potionArmorUntil = -1;
  let floorSecondWindUsed = false;
  let musetteRooms = 0;
  let z4CritCharges = 0;
  let prevPowerZone = 1;
  let bulletTimeUntil = -1;
  let momentumStacks = 0;
  let lastVampHealT = -99;
  let mountainKingUntil = -1;
  let pullTimer = 0;
  let calderaTimer = 0;
  let haloTimer = 0;
  let wardWasUp = false;

  const pendingActions: Array<
    | { type: 'campRow'; row: number }
    | { type: 'selectArchetype'; id: ArchetypeId }
    | { type: 'paceBias'; bias: PaceBias }
    | { type: 'openSkillTree' }
    | { type: 'skillPick'; nodeId: string; confirm?: boolean }
    | { type: 'skillCard'; i: number }
    | { type: 'skillMode'; mode: 'quick' | 'full' }
    | { type: 'skillClose' }
  > = [];

  // Director config memoization incorporating active Archetype & Pace Bias
  let cfgMemo: DirectorCfg | null = null, cfgFresh = false;
  let cfgArch: ArchetypeId = archetype, cfgBias: PaceBias = paceBias;
  const dirFns = Object.values(dirTn) as Array<() => number>, segKeys = Object.keys(DEFAULT_TARGETS) as Seg[];
  const cfgSig = new Float64Array(dirFns.length + 2 * segKeys.length);
  const cfgChanged = (): boolean => {
    let ch = cfgArch !== archetype || cfgBias !== paceBias;
    cfgArch = archetype; cfgBias = paceBias;
    let i = 0;
    for (const f of dirFns) { const v = f(); if (v !== cfgSig[i]) { cfgSig[i] = v; ch = true; } i++; }
    for (const k of segKeys) for (const v of [segTn[k].erg(), segTn[k].grade()]) { if (v !== cfgSig[i]) { cfgSig[i] = v; ch = true; } i++; }
    return ch;
  };
  const buildBaseCfg = (): DirectorCfg => ({
    ...(Object.fromEntries(Object.entries(dirTn).map(([k, f]) => [k, f()])) as Omit<DirectorCfg, 'targets'>),
    targets: Object.fromEntries((Object.keys(DEFAULT_TARGETS) as Seg[]).map((k) => [k, { ...DEFAULT_TARGETS[k], erg: segTn[k].erg(), grade: segTn[k].grade() }])) as DirectorCfg['targets'],
  });
  const dirCfg = (): DirectorCfg => {
    if (!cfgFresh) { cfgFresh = true; if (cfgChanged()) cfgMemo = null; }
    return cfgMemo ??= archetypeDirectorCfg(buildBaseCfg(), archetype, paceBias);
  };

  const potionCap = () => mods.potionCap + tm.potionCapAdd;

  // ---------- hero ----------
  const P = {
    x: 0, y: 0, hp: 0, maxHp: 0, shield: 0, potions: 3, ward: 0, rally: 0, lastPotionT: -99, rollCd: 0, rollT: 0, rollDx: 0, rollDy: 0,
    invuln: 0, hurtT: -99, aim: 0, lastShotRevs: ctx.bike().crankRevs, onSwamp: false, speedMult: 1, moveAng: 0, moving: false, targetId: 0,
    level: 1, xp: 0, coins: 0, coinsEarned: 0, shots: 0,
  };
  let weapon: Weapon = starterWeapon();
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
    P.maxHp = (maxHpT() + 10 * (P.level - 1) + gearSum('maxHp')) * mods.hpMult * ARCHETYPES[archetype].hpMult;
    P.hp = heal ? P.maxHp : clamp(frac * P.maxHp, 1, P.maxHp);
    P.shield = Math.min(P.shield, P.maxHp * 0.35);
  }

  // ---------- floor state ----------
  let floor = startFloor;
  let world!: World;
  let enemies: Enemy[] = [];
  let boss!: Enemy;
  let shrines: Shrine[] = [];
  let current = 0, safeRoom = 0, bossStarted = false, bossT = 0, hitT = 0;
  let bs: BossState = newBoss();
  type FlailMode = 'hand' | 'out' | 'back' | 'whirl' | 'slam' | 'rest';
  const fl = { mode: 'hand' as FlailMode, t: 0, x: 0, y: 0, x0: 0, y0: 0, tx: 0, ty: 0, ang: 0, hitCd: 0, second: false, px: 0, py: 0, pvx: 0, pvy: 0 };
  const FLAIL_OUT = 0.55, FLAIL_HOLD = 0.15, FLAIL_BACK = 0.6, FLAIL_REACH = 7, FLAIL_HIT_R = 0.5;
  let curse: { kind: CurseKind; left: number; total: number; s0: number } | null = null, cursesSurvived = 0;
  const cursed = (k: CurseKind) => curse?.kind === k;
  const bounty = () => (curse ? 1.5 : 1) * PACE_MODES[paceBias].bountyMult;
  const bullets: Bullet[] = [];
  const drops: Drop[] = [];
  const hazards: Array<Hazard & { dmg: number }> = [];
  const fx: Fx[] = [];
  const toasts: Toast[] = [];
  const cues: Array<{ name: string; id: number }> = [];
  let nextId = 1, cueId = 0;
  let t = 0, kills = 0, deaths = 0, damageDealt = 0, output = 0, fightT = 0, roomsCleared = 0, bossDefeated = 0, floorsCleared = 0, elitesSlain = 0, uniquesFound = 0;
  let navPath: Array<{ x: number; y: number }> = [], navKey = '', navAge = 99, stuckStats = 0, exploring = false;
  const fstat = { exploreT: 0, speedSum: 0, slowT: 0, wallT: 0, corridorT: 0, corridorSpeedSum: 0, offCenterT: 0, overshootT: 0 };
  let navPrev: { x: number; y: number } | null = null;
  let flow: Int16Array = new Int16Array(0), flowQ = new Int32Array(0), flowKey = -1;

  const hpMul = () => enemyHpMult() * Math.pow(enemyHpGrowth(), floor - 1) * T().hp;
  const dmgMul = () => (floor === 1 ? floor1Ease() : Math.pow(enemyDmgGrowth(), floor - 1)) * T().dmg;
  function spawnEnemy(kind: EnemyKind, x: number, y: number, room: number): Enemy {
    const d = ENEMY_DEF[kind], hp = d.hp * hpMul();
    const e: Enemy = {
      id: nextId++, kind, x, y, r: d.r, hp, maxHp: hp, speed: d.speed, contact: d.contact * dmgMul(), contactCd: 0,
      fireCd: 0.8 + rng() * 1.5, fireCd2: 2 + rng() * 2, room, alive: true, spin: 0, hurtT: -99, slowT: 0, dotT: 0, dotDps: 0, burnStacks: 0, condT: 0,
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
  let finishSeq: FinishSeqView | null = null;
  function buildFloor() {
    const fp = planFor(floor);
    world = generateWorld(rng, floor, { theme: fp.zone, rooms: floorRoomCount(floor, runTier, finalRooms()) });
    enemies = []; bullets.length = 0; drops.length = 0; hazards.length = 0; finishSeq = null;
    const eliteChance = Math.min(0.25 + T().elite, eliteBase() + 0.015 * (floor - 1) + T().elite);
    for (const room of world.rooms) for (const s of room.spawns) {
      const e = spawnEnemy(s.kind, s.x, s.y, room.id);
      if (rng() < eliteChance) makeElite(e, ELITES[Math.floor(rng() * ELITES.length)]);
    }
    const br = world.rooms.find((r) => r.boss)!;
    const hp = bossHpT() * enemyHpMult() * Math.pow(bossHpGrowth(), floor - 1) * (floor === 1 ? 0.55 : 1) * T().hp * (fp.boss === SWEEPER ? sweeperHp() : 1);
    boss = spawnEnemy('chaser', br.x0 + br.w / 2, br.y0 + br.h / 2 + 1, br.id);
    Object.assign(boss, { kind: 'boss', r: 1.1, hp, maxHp: hp, speed: 1.1, contact: 18 * dmgMul(), fireCd: 2, fireCd2: 1.2, xp: 120 * (1 + 0.3 * (floor - 1)), variant: fp.boss });
    if (fp.boss === SWEEPER) boss.r = 1.35;
    shrines = world.rooms.filter((r) => r.shrine).map((r) => ({ room: r.id, kind: r.shrine!.kind, x: r.shrine!.x, y: r.shrine!.y, state: 'idle' as const, progress: 0, left: 0, s0: 0 }));
    current = 0; safeRoom = 0; bossStarted = false; bossT = 0; bs = newBoss(); fl.mode = 'hand'; fl.px = P.x; fl.py = P.y; fl.pvx = fl.pvy = 0; navPath = []; navKey = ''; flowKey = -1;
    floorSecondWindUsed = false;
    P.x = world.spawn.x; P.y = world.spawn.y;
    markSeen(world.rooms[0]);
  }
  function markSeen(r: Room) { r.seen = true; for (const n of world.adj[r.id]) world.rooms[n].seen = true; }
  buildFloor();

  function persist() {
    ctx.save({
      ver: SAVE_VER, bank: Math.round(bankStart + P.coinsEarned), upgrades: { ...levels }, bestFloor, runs, autoInvest: autoInvestOn,
      tier, tierUnlocked, wins: [...wins], bestWinS, archetype, climbs: climbsTotal, erg,
      totals: { ...totals, climbs: climbsTotal, coins: totals.coins + P.coinsEarned },
    } satisfies DungeonSave);
  }

  // ---------- fx / sound ----------
  function addFx(f: Omit<Fx, 't0'>): Fx { const o = { ...f, t0: t }; fx.push(o); if (fx.length > MAX_FX) fx.splice(0, fx.length - MAX_FX); return o; }
  function toast(text: string, color = '#fff') { toasts.push({ text, color, t0: t }); if (toasts.length > 5) toasts.shift(); }
  function cue(name: string) { cues.push({ name, id: ++cueId }); if (cues.length > 40) cues.shift(); }
  function freeze(s: number) { hitT = Math.max(hitT, Math.min(s, HIT_STOP_MAX)); }

  // ---------- resistance ----------
  const resState = new Map<string, number | null>();
  function resSync(id: string, grade: number | null) {
    if (resState.get(id) === grade) return;
    resState.set(id, grade);
    if (grade === null) ctx.resistance.clear(id); else ctx.resistance.set({ id, mode: 'sim', gradePct: grade });
  }
  function applyMode() {
    resState.clear(); ctx.resistance.clearAll();
    ctx.resistance.useVirtualGears(!erg);
  }
  applyMode();
  function ergSync(f: number) {
    if (resState.get('pace') === f) return;
    resState.set('pace', f); ctx.resistance.set({ id: 'pace', mode: 'erg', ftpFraction: f });
  }
  function clearCombatGrades() {
    for (const id of ['swamp', 'wounded', 'boss-surge', 'curse-mire']) resSync(id, null);
  }
  function holdRecoveryRoad() {
    if (erg) ergSync(dirCfg().targets.cooldown.erg);
    else { clearCombatGrades(); resSync('terrain', campGrade()); }
  }

  // ---------- geometry ----------
  const doorLocked = (tx: number, ty: number) => {
    const rid = world.doorRoom[ty * world.w + tx];
    return rid !== undefined && world.rooms[rid].locked;
  };
  const solid = (tx: number, ty: number) => {
    const k = tileAt(world, tx, ty);
    return k === TILE.WALL || (k === TILE.DOOR && doorLocked(tx, ty));
  };
  const walkSolid = (tx: number, ty: number) => {
    const k = tileAt(world, tx, ty);
    return k === TILE.PIT || k === TILE.PILLAR || solid(tx, ty);
  };
  const blocked = (x: number, y: number, r: number) =>
    walkSolid(Math.floor(x - r), Math.floor(y - r)) || walkSolid(Math.floor(x + r), Math.floor(y - r)) ||
    walkSolid(Math.floor(x - r), Math.floor(y + r)) || walkSolid(Math.floor(x + r), Math.floor(y + r));
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

  function updateFlow() {
    const r = activeRoom();
    const px = clamp(Math.floor(P.x), r.x0, r.x0 + r.w - 1), py = clamp(Math.floor(P.y), r.y0, r.y0 + r.h - 1);
    const key = current * 1e6 + py * world.w + px;
    if (key === flowKey) return;
    flowKey = key;
    if (flow.length !== r.w * r.h) flow = new Int16Array(r.w * r.h);
    flow.fill(-1);
    if (flowQ.length < r.w * r.h) flowQ = new Int32Array(r.w * r.h);
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
      if (ox && oy && (at(ex + ox, ey) < 0 || at(ex, ey + oy) < 0)) continue;
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
      ...(item && 'base' in item ? { element: item.element, variant: item.variant, unique: item.unique, plus: item.plus } : {}),
    });
  }
  function dropItem(x: number, y: number, bump: number, uniqueMult = 1) {
    const lvl = floor + (rng() < 0.3 ? 1 : 0), rar = rollRarity(rng, bump + (rng() < mods.rarityBumpChance ? 1 : 0));
    if (rng() * 100 < uniquePct() * uniqueMult * mods.dropMult) dropAt(x, y, 'weapon', 0, makeUnique(rng, lvl + 1));
    else if (rng() < 0.45) {
      const styles = ARCHETYPES[archetype].weaponStyles;
      dropAt(x, y, 'weapon', 0, makeWeapon(rng, lvl, rar, rng() < archDropBias() ? pickWeaponStyle(styles, rng()) : undefined));
    } else dropAt(x, y, 'gear', 0, makeGear(rng, lvl, rar));
  }
  function coinValue() { return Math.max(1, Math.round((1 + rng() * 2) * (1 + 0.3 * (floor - 1)) * mods.coinMult * T().coins)); }
  function addCoins(v: number) { v = Math.round(v * bounty()); P.coins += v; P.coinsEarned += v; }
  interface PendingLoot { item: Weapon | Gear; view: LootOfferView; leftS: number }
  let lootOffer: PendingLoot | null = null;
  let lootOfferId = 0;
  let lootTap: 'equip' | 'drop' | null = null;

  function applyLootSell(it: Weapon | Gear, v: number) {
    addCoins(v); toast(`Sold ${it.name} +${v}c`, '#bbb'); cue('coin');
  }
  function applyLootEquip(it: Weapon | Gear) {
    const col = RARITY_COLORS[it.rarity];
    if ('base' in it) weapon = it; else { gear[it.slot] = it; recomputeHp(false); }
    if (it.rarity > bestFind.rarity || (it.rarity === bestFind.rarity && it.level > bestFind.level)) bestFind = it;
    toast(`Equipped ${it.name}`, col);
    addFx({ kind: 'levelup', x: P.x, y: P.y, life: 0.8, color: col, r: 1.4 });
    if (it.rarity === 5) {
      uniquesFound++; freeze(0.3); cue('unique');
      const u = UNIQUES.find((x) => x.name === it.name);
      addFx({ kind: 'banner', x: P.x, y: P.y, life: 3.5, color: col, text: `UNIQUE - ${it.name}${u ? ': ' + u.blurb : ''}` });
      ctx.emit({ type: 'uniqueFound', data: { name: it.name, floor } });
    } else cue('equip');
  }
  function resolveLootOffer(choice: 'equip' | 'drop') {
    if (!lootOffer) return;
    const o = lootOffer;
    lootOffer = null; lootTap = null;
    if (choice === 'equip') applyLootEquip(o.item);
    else applyLootSell(o.item, o.view.sellCoins);
  }
  function flushLootOffer() { if (lootOffer) resolveLootOffer(lootOffer.view.defaultChoice); }

  function collect(d: Drop) {
    if (d.kind === 'coin') { addCoins(d.value); cue('coin'); addFx({ kind: 'text', x: P.x, y: P.y - 0.6, life: 0.8, color: '#ffd84a', text: `+${d.value}` }); return; }
    if (d.kind === 'potion') {
      if (P.potions < potionCap()) { P.potions++; toast('+1 Potion', '#ff6b8a'); cue('pickup'); }
      else { const v = Math.round(10 * floor * mods.coinMult); addCoins(v); toast(`Potion sold +${v}c`, '#ffd84a'); cue('coin'); }
      return;
    }
    const it = d.item!;
    const v = Math.round(sellValue(it.level, Math.min(4, it.rarity) as Rarity) * mods.coinMult);
    const cur = 'base' in it ? weapon : gear[it.slot];
    const evalOffer = evaluateLootOffer(it, cur, v, archetype);
    if (!evalOffer) { applyLootSell(it, v); return; }
    if (autopilot) {
      if (evalOffer.defaultChoice === 'equip') applyLootEquip(it); else applyLootSell(it, v);
      return;
    }
    // Commit any earlier pending offer to its default before presenting the new drop
    flushLootOffer();
    const totalS = lootPromptS();
    lootOffer = { item: it, leftS: totalS, view: { ...evalOffer, id: ++lootOfferId, leftS: totalS, totalS } };
    cue(it.rarity === 5 ? 'unique' : 'pickup');
  }

  // ---------- combat ----------
  function bossFury() { return bossStarted && boss.alive && floor > 1 ? clamp((bs.fightT - furyAfter()) * furyRate(), 0, 1.5) : 0; }
  let expWindows = 0, expStruck = 0, expHit = false;
  const dmgFx = new Map<number, { fx: Fx; v: number; t: number }>();
  function dmgNumber(e: Enemy, dmg: number, crit: boolean, color: string) {
    const jit = crit || dmg >= e.maxHp * 0.08 || e.kind === 'boss' ? rng() : ((e.id * 37 + Math.round(t * 30)) % 9) / 9;
    if (dmg < 0.5) return;
    const m = dmgFx.get(e.id);
    if (m && !crit && t - m.t < 0.25 && fx.includes(m.fx)) { m.v += dmg; m.fx.text = String(Math.round(m.v)); m.fx.t0 = t; m.t = t; return; }
    const f = addFx({ kind: 'text', x: e.x + (jit - 0.5) * 0.4, y: e.y - e.r - 0.2, life: crit ? 0.9 : 0.7, color: crit ? '#ffd84a' : color, text: String(Math.round(dmg)), big: crit || (e.kind === 'boss' && dmg >= e.maxHp * 0.01) });
    if (f && !crit) dmgFx.set(e.id, { fx: f, v: dmg, t }); else dmgFx.delete(e.id);
    if (dmgFx.size > 64) dmgFx.clear();
  }

  function healPlayer(amount: number) {
    if (amount <= 0) return;
    const before = P.hp;
    P.hp = Math.min(P.maxHp, P.hp + amount);
    const overflow = Math.max(0, amount - (P.hp - before));
    if (tm.bottomlessMusette && overflow > 0) {
      P.shield = Math.min(P.maxHp * 0.35, P.shield + overflow * 0.6);
    }
  }

  function triggerThorns(bike: Readonly<BikeState>, mult = 1) {
    if (tm.thornsPct <= 0) return;
    const r = 2.6 * tm.thornsRadiusMult;
    const dmg = weapon.dmg * playerDmg(bike) * tm.thornsPct * mult * (t < pelotonThornsUntil ? 2.5 : 1);
    for (const e of liveInRoom(current)) {
      if (Math.hypot(e.x - P.x, e.y - P.y) < r + e.r) damageEnemy(e, dmg, bike, false, '#ffd84a');
    }
  }

  function hurtPlayer(dmg: number, bike?: Readonly<BikeState>) {
    if (P.invuln > 0 || opts?.invulnerable) return;
    const b = bike ?? ctx.bike();
    // Dodge (Slipstream)
    if (tm.dodgeAdd > 0 && rng() < tm.dodgeAdd) {
      addFx({ kind: 'text', x: P.x, y: P.y - 0.7, life: 0.65, color: '#84ff9a', text: 'DODGE' });
      if (tm.leadOutCd > 0) { cds.strike.left = Math.max(0, cds.strike.left - tm.leadOutCd); cds.rally.left = Math.max(0, cds.rally.left - tm.leadOutCd); }
      if (tm.untouchableCrit) {
        momentumStacks = Math.min(10, momentumStacks + 1);
        const near = nearestEnemy();
        if (near) {
          const ang = Math.atan2(near.y - P.y, near.x - P.x);
          shoot(ang, weapon.dmg * playerDmg(b) * 1.6, weapon.speed * 1.2, true, true);
        }
      }
      return;
    }
    // Ward block
    if (P.ward > 0) {
      if (t - P.hurtT > 0.25) cue('hit');
      P.hurtT = t - 1;
      wardBlocks++;
      triggerThorns(b, 1.15);
      if (tm.aegisRiposte) {
        const ripDmg = weapon.dmg * playerDmg(b) * 2.2;
        addFx({ kind: 'boom', x: P.x, y: P.y, life: 0.4, color: '#ffd84a', r: 3.2 });
        for (const e of liveInRoom(current)) if (Math.hypot(e.x - P.x, e.y - P.y) < 3.2 + e.r) damageEnemy(e, ripDmg, b, true, '#ffd84a');
        if (bossStarted && boss.alive && bs.cycle === 'exposed') bs.left += 2;
      }
      if (tm.unbreakablePeloton && wardBlocks % 3 === 0) {
        P.rally = Math.max(P.rally, rallyDur() * 0.65);
        pelotonThornsUntil = t + 3;
        toast('Unbreakable Peloton! Free Rally + 2.5× Thorns', '#ffd84a');
        addFx({ kind: 'levelup', x: P.x, y: P.y, life: 0.9, color: '#ffd84a', r: 2.2 });
      }
      return;
    }
    const armor = clamp(gearSum('armor') + tm.armorAdd + (t < potionArmorUntil ? tm.potionArmorBonus : 0), 0, 0.78);
    let taken = dmg * enemyDmgScale() * ARCHETYPES[archetype].dmgTaken * PACE_MODES[paceBias].dmgTakenMult * (1 - armor)
      * (cursed('hexed') ? 1.4 : 1) * (1 + bossFury()) * (sprintingNow ? 1 - sprintGuard() : 1);
    if (P.shield > 0) {
      const ab = Math.min(P.shield, taken);
      P.shield -= ab;
      taken -= ab;
    }
    P.hp -= taken;
    triggerThorns(b, 1);
    if (taken >= 1 && t - P.hurtT > 0.2) addFx({ kind: 'text', x: P.x + 0.3, y: P.y - 0.7, life: 0.7, color: '#ff5a6e', text: `-${Math.round(taken)}` });
    if (t - P.hurtT > 0.25) cue('hurt');
    P.hurtT = t;
    if (P.hp <= 0) {
      if (tm.secondWindTree && !floorSecondWindUsed) {
        floorSecondWindUsed = true;
        P.hp = Math.max(1, P.maxHp * 0.35);
        P.invuln = 1.4;
        for (const e of liveInRoom(current)) {
          const dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy) || 1;
          if (d < 3.5 && e.kind !== 'boss') move(e, (dx / d) * 1.5, (dy / d) * 1.5, e.r);
        }
        addFx({ kind: 'banner', x: P.x, y: P.y, life: 2, color: '#7dff8a', text: 'FEED ZONE SECOND WIND' });
        cue('levelup');
      } else if (swCd.left <= 0) secondWind();
    }
  }

  function secondWind() {
    P.hp = Math.max(1, P.maxHp * swHeal()); P.invuln = swInvuln(); swUsedT = t; secondWinds++;
    ctx.emit({ type: 'secondWind', data: { floor, boss: bossStarted && boss.alive && current === boss.room } });
    swCd = startCooldown(swCdT());
    for (const e of liveInRoom(current)) {
      const dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy) || 1;
      if (d < 3.5 && e.kind !== 'boss') { e.x += (dx / d) * 1.5; e.y += (dy / d) * 1.5; if (solid(Math.floor(e.x), Math.floor(e.y))) { e.x -= (dx / d) * 1.5; e.y -= (dy / d) * 1.5; } }
    }
    for (const b of bullets) if (!b.friendly && Math.hypot(b.x - P.x, b.y - P.y) < 4) b.life = 0;
    freeze(0.25); cue('levelup');
    addFx({ kind: 'banner', x: P.x, y: P.y, life: 2.5, color: '#ffe08a', text: 'SECOND WIND' });
    addFx({ kind: 'levelup', x: P.x, y: P.y, life: 1, color: '#ffe08a', r: 3.5 });
  }

  function damageEnemy(e: Enemy, raw: number, bike: Readonly<BikeState>, crit = false, color = '#fff', crush = false, fromProc = false) {
    if (!e.alive) return;
    let dmg = raw;
    if (e.condT > 0) dmg *= 1.2;
    if (e.kind === 'boss' || e.elite) dmg *= 1 + tm.bossEliteDmg;
    if (e.kind === 'boss') {
      dmg *= bossDamageMult(bs, bossCfg());
      if (bs.cycle === 'exposed') {
        if (bike.sprinting || (erg && bike.ftpFraction >= ergSurge() * 0.85)) dmg *= sprintMult();
        dmg *= 1 + tm.horsExposedDmgAdd;
      }
      if (tm.soloBossDmg > 0) dmg *= 1 + tm.soloBossDmg;
    } else if (tm.soloBossDmg > 0 && liveCount(e.room) <= 1) {
      dmg *= 1 + tm.soloBossDmg;
    }
    if (tm.polkaExecute && e.hp / e.maxHp < (e.kind === 'boss' ? 0.22 : 0.3)) dmg *= 1.6;
    if (cursed('bulwark')) dmg *= 0.65;
    if (e.shield > 0) {
      const shMult = crush ? tm.guardBreakerMult : crit && tm.soloBossDmg > 0 ? 1.35 : 1;
      const ab = Math.min(e.shield, dmg * 0.8);
      e.shield = Math.max(0, e.shield - ab * shMult);
      dmg -= ab * 0.7;
    }
    const applied = Math.min(dmg, e.hp);
    e.hp -= dmg; damageDealt += applied; e.hurtT = t;
    if (tm.highAltitudeLoh > 0) healPlayer(P.maxHp * tm.highAltitudeLoh * 0.2);
    if (crit && tm.vampiricSprint && (bike.powerZone >= 4 || bike.sprinting || t < firedUpUntil) && t - lastVampHealT > 0.8) {
      lastVampHealT = t;
      healPlayer(P.maxHp * 0.04);
    }
    dmgNumber(e, dmg, crit, color);
    if (e.hp <= 0) {
      const proc = !fromProc && e.kind !== 'boss' ? onKillElementProc(e, weapon.element, liveInRoom(current)) : null;
      killEnemy(e, bike);
      if (proc) {
        addFx({ kind: 'boom', x: e.x, y: e.y, life: 0.35, color: proc.color, r: proc.radius });
        const procDmg = weapon.dmg * playerDmg(bike) * proc.dmgMult;
        for (const o of proc.targets as Enemy[]) {
          if (proc.applySlowS > 0) o.slowT = Math.max(o.slowT, proc.applySlowS);
          if (proc.applyDotS > 0) { o.dotT = Math.max(o.dotT, proc.applyDotS); o.dotDps = Math.max(o.dotDps, procDmg * 0.3); }
          damageEnemy(o, procDmg, bike, false, proc.color, false, true);
        }
      }
    }
  }

  function grantMountainKing() {
    if (!tm.crownOfCol) return;
    mountainKingUntil = t + 12;
    healPlayer(P.maxHp * 0.2);
    toast('Crown of the Col! Mountain King active', '#ff66a8');
  }

  function checkGrimpeurUnlock(): boolean {
    const before = isArchetypeUnlocked('grimpeur', { bestFloor: bestFloor, climbs: Math.max(0, climbsTotal - 1) });
    const now = isArchetypeUnlocked('grimpeur', unlockProgress());
    if (!before && now) {
      toast('NEW HERO UNLOCKED: The Grimpeur (Climber)!', '#ff6e5a');
      addFx({ kind: 'banner', x: P.x, y: P.y, life: 3.5, color: '#ff6e5a', text: 'THE GRIMPEUR UNLOCKED!' });
      cue('unlock');
      return true;
    }
    return false;
  }

  function killEnemy(e: Enemy, bike?: Readonly<BikeState>) {
    const b = bike ?? ctx.bike();
    e.alive = false; kills++;
    addFx({ kind: 'death', x: e.x, y: e.y, life: 0.5, color: e.kind === 'boss' ? '#cc00aa' : e.elite ? '#ff8c2a' : '#dddddd', r: e.r * 2 });
    ctx.emit({ type: 'kill', data: { kind: e.kind, room: e.room, elite: !!e.elite, archetype } });
    gainXp(e.xp);

    // Skill-tree on-kill triggers
    if (tm.leadOutCd > 0) {
      cds.strike.left = Math.max(0, cds.strike.left - tm.leadOutCd);
      cds.rally.left = Math.max(0, cds.rally.left - tm.leadOutCd);
    }
    if (tm.polkaExecute) healPlayer(P.maxHp * 0.03);
    if (tm.packFinisher && (b.sprinting || t < firedUpUntil)) {
      firedUpUntil = Math.max(firedUpUntil, t + 2);
      const expDmg = weapon.dmg * playerDmg(b) * 1.4;
      addFx({ kind: 'boom', x: e.x, y: e.y, life: 0.4, color: '#ff9a3c', r: 2.6 });
      for (const o of liveInRoom(current)) if (o.id !== e.id && Math.hypot(o.x - e.x, o.y - e.y) < 2.6 + o.r) damageEnemy(o, expDmg, b, true, '#ff9a3c');
    }
    if (tm.pyreDetonation && e.dotT > 0) {
      const pyreDmg = weapon.dmg * playerDmg(b) * 1.8;
      addFx({ kind: 'boom', x: e.x, y: e.y, life: 0.45, color: '#ff6b4a', r: 2.8 });
      for (const o of liveInRoom(current)) if (o.id !== e.id && Math.hypot(o.x - e.x, o.y - e.y) < 2.8 + o.r) {
        o.dotT = Math.max(o.dotT, 3); o.dotDps = Math.max(o.dotDps, pyreDmg * 0.22);
        damageEnemy(o, pyreDmg, b, false, '#ff6b4a');
      }
    }

    const coins = e.kind === 'boss' ? 14 : e.elite ? 4 : 1 + (rng() < 0.4 ? 1 : 0);
    for (let i = 0; i < coins; i++) dropAt(e.x, e.y, 'coin', coinValue());
    if (e.kind === 'boss') {
      dropItem(e.x, e.y, 2, 10); dropItem(e.x, e.y, 1, 10); dropAt(e.x, e.y, 'potion', 0);
      bossDefeated++; totals.bosses++; climbsTotal++; freeze(0.8); cue('bossDie');
      checkGrimpeurUnlock();
      const last = e.variant === SWEEPER;
      if (!last) {
        // Boss kill replaces old generic perk picker: grants +1 Bonus Skill Point + Boss Trophy Relic!
        unspentSP++;
        const rb = ARCHETYPES[archetype].relicBranchIndex;
        if (!relicBonusBranches.includes(rb)) {
          relicBonusBranches.push(rb);
          const bName = SKILL_TREES[archetype][rb].name;
          toast(`Boss Trophy: ${ARCHETYPES[archetype].relicName} (+1 ${bName} skills) + 1 SP!`, '#ffd84a');
        } else {
          toast(`${BOSS_NAMES[e.variant]} defeated! +1 Bonus Skill Point`, '#ffd84a');
        }
        if (opts?.skills !== 'none') skillOfferDueT = t + skillDelayS();
      }
      for (let k = 0; k < 5; k++) addFx({ kind: 'boom', x: e.x + Math.cos(k * 1.3) * k * 0.5, y: e.y + Math.sin(k * 1.3) * k * 0.5, life: 0.6 + k * 0.2, color: k % 2 ? '#ffe08a' : '#c77dff', r: 2 + k });
      for (const bl of bullets) if (!bl.friendly) bl.life = 0;
      addFx({ kind: 'boom', x: e.x, y: e.y, life: 0.8, color: '#c77dff', r: 4 });
      if (last) {
        toast('The Grim Sweeper fell! Find your bike and cross the finish line.', '#ff8c2a');
        const br = world.rooms[e.room] ?? world.rooms.find((r) => r.boss)!;
        const lineX = world.stairs.x, lineY = world.stairs.y;
        let bikeY = lineY;
        for (const dy of [2.5, 2.0, 1.5, 1.0, -1.5]) {
          const cy = clamp(lineY + dy, br.y0 + 1.5, br.y0 + br.h - 1.5);
          if (!walkSolid(Math.floor(lineX), Math.floor(cy))) { bikeY = cy; break; }
        }
        finishSeq = { stage: 'findBike', bikeX: lineX, bikeY, lineX, lineY, progress: 0, celebrateT: 0 };
        addFx({ kind: 'banner', x: lineX, y: bikeY, life: 4, color: '#ffd84a', text: 'YOUR BIKE! RIDE TO THE FINISH' });
      }
      ctx.emit({ type: 'bossDefeated', data: { timeS: Math.round(t), floor, archetype, windows: expWindows, struck: expStruck } });
      return;
    }
    cue('kill');
    if (e.elite) {
      elitesSlain++; freeze(0.08);
      grantMountainKing();
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
      unspentSP++;
      recomputeHp(true); freeze(0.15); cue('levelup');
      toast(`Level ${P.level}! +1 Skill Point banked (${unspentSP} SP)`, '#ffd84a');
      addFx({ kind: 'levelup', x: P.x, y: P.y, life: 1.4, color: '#ffd84a', r: 2.5 });
      ctx.emit({ type: 'levelUp', data: { level: P.level, unspentSP } });
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
    cadNorm(bike) * PACE_MODES[paceBias].dmgMult * baseDamage() * clamp(dmgPower(bike.ftpFraction, sprintDmgK()), 0.3, 2.5)
    * (1 + 0.06 * weapon.plus) * (1 + 0.04 * (P.level - 1) + gearSum('dmgPct')) * mods.dmgMult
    * (1 + momentumStacks * 0.05) * (t < mountainKingUntil ? 1.35 : 1)
    * (bike.sprinting || t < firedUpUntil ? fireMult() : 1);

  function shoot(a: number, dmg: number, sp: number, child: boolean, crit = false, extra?: { orb?: boolean; crush?: boolean; bleed?: boolean; pierce?: number }) {
    const w = weapon;
    bullets.push({
      x: P.x, y: P.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      r: extra?.orb ? 0.36 : w.base === 'orb' ? (child ? 0.18 : 0.3) : w.base === 'flame' ? 0.22 : w.base === 'pellet' ? 0.14 : 0.2,
      dmg, life: extra?.orb ? 3.2 : w.range / w.speed, age: 0, friendly: true, w, hits: [],
      pierce: (extra?.pierce ?? w.pierce) + (extra?.orb ? 8 : 0), bounce: w.bounce, crit, child, ric: 0,
      orb: extra?.orb, crush: extra?.crush, bleed: extra?.bleed,
    });
  }

  function chainLightningFrom(e: Enemy, dmg: number, bike: Readonly<BikeState>, bounces: number) {
    const pts = [{ x: e.x, y: e.y }], hit = [e.id];
    let from = e;
    for (let c = 0; c < bounces; c++) {
      let nx = nearestEnemy(from.x, from.y, hit, 5.2);
      // Forked Arc can bounce back to the Boss!
      if (!nx && tm.forkedArc && bossStarted && boss.alive && boss.id !== from.id) nx = boss;
      if (!nx) break;
      hit.push(nx.id); pts.push({ x: nx.x, y: nx.y });
      if (tm.forkedArc) nx.condT = Math.max(nx.condT, 4);
      damageEnemy(nx, dmg * 0.72, bike, false, '#64d8ff');
      from = nx;
    }
    if (pts.length > 1) addFx({ kind: 'chain', x: e.x, y: e.y, life: 0.28, color: '#64d8ff', pts });
    if (tm.ballLightning) {
      const ang = Math.atan2(e.y - P.y, e.x - P.x);
      shoot(ang, dmg * 0.65, 3.8, true, false, { orb: true });
    }
  }

  function fire(bike: Readonly<BikeState>) {
    const w = weapon, n = w.count;
    const critCh = gearSum('crit') + (w.element === 'arcane' ? 0.08 : 0) + 0.04 + tm.critAdd;
    const isCrush = tm.crushingDmgAdd > 0;
    const crushMult = 1 + tm.crushingDmgAdd;
    P.shots++;
    const anvilNow = tm.anvilDrop && P.shots % 3 === 0;

    for (let i = 0; i < n; i++) {
      const off = n > 1 ? (i / (n - 1) - 0.5) * w.spread : 0;
      const a = P.aim + off + (w.base === 'flame' ? (rng() - 0.5) * 0.25 : 0);
      const forcedCrit = z4CritCharges > 0 || t < bulletTimeUntil || tm.titanTorque;
      const crit = forcedCrit || rng() < critCh;
      if (z4CritCharges > 0 && i === 0) z4CritCharges--;
      const shotDmg = w.dmg * playerDmg(bike) * crushMult * (anvilNow ? 2.2 : 1) * (crit ? tm.critDmgMult : 1);
      shoot(a, shotDmg, w.speed * (w.base === 'flame' ? 0.85 + rng() * 0.3 : 1), false, crit, { crush: isCrush, bleed: tm.sunderCleave });
    }
    if (anvilNow) {
      const tgt = nearestEnemy();
      if (tgt) addFx({ kind: 'boom', x: tgt.x, y: tgt.y, life: 0.3, color: '#ffaa3c', r: 1.5 });
    }
    if (isCrush && tm.titanTorque) {
      cds.rally.left = Math.max(0, cds.rally.left - 0.6);
      cds.strike.left = Math.max(0, cds.strike.left - 0.6);
    }
    // Shatter Volley storm shards
    if (tm.shatterShards > 0) {
      for (let s = 0; s < tm.shatterShards; s++) {
        const off = (s - (tm.shatterShards - 1) / 2) * 0.26;
        shoot(P.aim + off, w.dmg * playerDmg(bike) * 0.55, w.speed * 1.15, true, false, { pierce: 1 });
      }
    }
    // Sunder Cleave extra sweeping bolts
    if (tm.sunderCleave) {
      for (const off of [-0.45, 0.45]) shoot(P.aim + off, w.dmg * playerDmg(bike) * 0.7, w.speed * 0.9, true, false, { pierce: 2, bleed: true, crush: isCrush });
    }
    // Phantom Cadence echo shot at 95+ rpm
    if (tm.phantomCadence && P.shots % 2 === 0) {
      shoot(P.aim + (rng() - 0.5) * 0.14, w.dmg * playerDmg(bike) * 0.75, w.speed * 1.1, true, false);
    }
    // Static Charge chain lightning trigger
    if (tm.staticEvery > 0 && P.shots % tm.staticEvery === 0) {
      const tgt = nearestEnemy();
      if (tgt) chainLightningFrom(tgt, w.dmg * playerDmg(bike) * 0.65, bike, tm.forkedArc ? 6 : 3);
    }
    if (w.unique === 'nova' && P.shots % 5 === 0) {
      for (let i = 0; i < 12; i++) shoot(P.aim + (i / 12) * Math.PI * 2, w.dmg * playerDmg(bike) * 0.6, w.speed * 0.8, true);
      addFx({ kind: 'boom', x: P.x, y: P.y, life: 0.3, color: ELEMENT_COLORS[w.element], r: 1.5 });
    }
    cue(w.base === 'flame' ? 'flame' : w.base === 'spark' ? 'zap' : w.base === 'arrow' || w.base === 'orb' || w.base === 'pellet' ? 'shootHeavy' : 'shoot');
    if (w.base !== 'flame') addFx({ kind: 'muzzle', x: P.x + Math.cos(P.aim) * 0.45, y: P.y + Math.sin(P.aim) * 0.45, life: 0.08, color: ELEMENT_COLORS[w.element] });
  }

  function onHit(b: Bullet, e: Enemy, bike: Readonly<BikeState>): boolean {
    const w = b.w!, col = b.orb ? '#64d8ff' : ELEMENT_COLORS[w.element];
    damageEnemy(e, b.dmg, bike, b.crit, col, b.crush);
    addFx({ kind: 'hit', x: b.x, y: b.y, life: 0.2, color: col, r: 0.4 });
    cue(b.crit ? 'crit' : 'hit');
    if (w.element === 'frost') e.slowT = 1.5;
    if (w.element === 'fire' || w.element === 'venom' || tm.emberBurnPct > 0 || b.bleed) {
      e.dotT = Math.max(e.dotT, 3);
      const burnAdd = tm.emberBurnPct > 0 ? b.dmg * tm.emberBurnPct / 3 : b.dmg * 0.25;
      e.dotDps = Math.max(e.dotDps * 0.6, burnAdd);
      e.burnStacks = Math.min(5, e.burnStacks + 1);
    }
    // Thunderhead Capstone: Crits call down a Skybolt!
    if (b.crit && tm.thunderhead && !b.child) {
      addFx({ kind: 'boom', x: e.x, y: e.y, life: 0.35, color: '#64d8ff', r: 1.8 });
      e.slowT = Math.max(e.slowT, 1.2);
      damageEnemy(e, b.dmg * 1.1, bike, false, '#64d8ff');
    }
    if (w.blast > 0 && !b.child) blast(b, bike, col);
    const chains = w.chain + (w.element === 'storm' && rng() < 0.25 ? 1 : 0);
    if (chains > 0 && !b.child) chainLightningFrom(e, b.dmg, bike, chains + (tm.forkedArc ? 3 : 0));
    if (b.crit && !b.child) {
      if (w.element === 'storm' && chains === 0) {
        const ch = stormChainTargets(e, liveInRoom(current), 2, 4.2);
        if (ch.targets.length) {
          addFx({ kind: 'chain', x: e.x, y: e.y, life: 0.28, color: '#ffe45e', pts: ch.pts });
          for (const nx of ch.targets as Enemy[]) damageEnemy(nx, b.dmg * ch.dmgMult, bike, false, '#ffe45e', false, true);
        }
      } else if (w.element === 'arcane') {
        const ap = arcanePulseProc(e.x, e.y, e.id, liveInRoom(current), 2.8);
        if (ap.targets.length) {
          addFx({ kind: 'levelup', x: e.x, y: e.y, life: 0.32, color: ap.color, r: ap.radius });
          for (const nx of ap.targets as Enemy[]) {
            if (nx.kind !== 'boss') {
              const d = Math.hypot(e.x - nx.x, e.y - nx.y) || 1;
              nx.x += ((e.x - nx.x) / d) * Math.min(ap.pullTiles, d * 0.4);
              nx.y += ((e.y - nx.y) / d) * Math.min(ap.pullTiles, d * 0.4);
            }
            damageEnemy(nx, b.dmg * ap.dmgMult, bike, false, ap.color, false, true);
          }
        }
      }
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

  // ---------- rider actions (A Strike, B Ward, Y Rally, Z Potion; D-pad L/R Pace Bias, D-pad Up Skill Tree) ----------
  const spinCalled = () => spinupCalled(dir) || shrines.some((x) => x.state === 'active' && x.kind === 'whirl');
  function startCd(id: ActionId, s0: number) { cds[id] = { left: s0, total: s0 }; }
  function effectiveStrikeRadius() { return strikeRadius() * (tm.magmaSlam ? 1.6 : 1); }

  function doStrike(bike: Readonly<BikeState>) {
    const rad = effectiveStrikeRadius();
    const hit = liveInRoom(current).filter((e) => Math.hypot(e.x - P.x, e.y - P.y) < rad + e.r);
    if (!hit.length) { cue('deny'); return false; }
    const stFx = ARCHETYPE_STRIKE[archetype];
    const strikeCol = tm.magmaSlam ? '#ff6b4a' : stFx.color;
    const dmg = weapon.dmg * playerDmg(bike) * strikeMult() * (tm.magmaSlam ? 1.25 : 1);
    if (hit.some((e) => e.kind === 'boss') && bs.cycle === 'exposed') {
      if (!expHit) { expHit = true; expStruck++; }
      if (tm.photoFinish) { bulletTimeUntil = t + 4; toast('PHOTO FINISH! Bullet Time (4s)', '#ff9a3c'); }
    }
    for (const e of hit) {
      damageEnemy(e, dmg, bike, true, strikeCol, tm.crushingDmgAdd > 0);
      e.slowT = Math.max(e.slowT, 2);
      if (tm.cinderWake || tm.magmaSlam) { e.dotT = Math.max(e.dotT, 4); e.dotDps = Math.max(e.dotDps, dmg * 0.25); }
      if (e.alive && e.kind !== 'boss' && stFx.knockbackMult > 1) {
        const d = Math.hypot(e.x - P.x, e.y - P.y) || 1;
        const rm = world.rooms[e.room];
        e.x = clamp(e.x + ((e.x - P.x) / d) * 0.7 * stFx.knockbackMult, rm.x0 + e.r + 0.05, rm.x0 + rm.w - e.r - 0.05);
        e.y = clamp(e.y + ((e.y - P.y) / d) * 0.7 * stFx.knockbackMult, rm.y0 + e.r + 0.05, rm.y0 + rm.h - e.r - 0.05);
      }
    }
    // Archetype-flavored Strike signature payoffs
    if (stFx.shardCount > 0) {
      const a0 = P.aim;
      for (let k = 0; k < stFx.shardCount; k++) {
        const a = a0 + (k - (stFx.shardCount - 1) / 2) * 0.24;
        bullets.push({
          x: P.x, y: P.y, vx: Math.cos(a) * 14, vy: Math.sin(a) * 14, r: 0.2,
          dmg: dmg * 0.35, life: 0.55, age: 0, friendly: true, w: weapon,
          pierce: 2, bounce: 0, hits: [], crit: true, child: true,
        });
      }
    }
    if (weapon.element === 'storm' && hit[0]) {
      const ch = stormChainTargets(hit[0], liveInRoom(current), 3, 4.8);
      if (ch.targets.length) {
        addFx({ kind: 'chain', x: hit[0].x, y: hit[0].y, life: 0.32, color: '#ffe45e', pts: ch.pts });
        for (const nx of ch.targets as Enemy[]) damageEnemy(nx, dmg * 0.35, bike, false, '#ffe45e', false, true);
      }
    }
    if (hit.some((e) => e.kind === 'boss') && strikeBoss(bs, bossCfg())) toast(`Timed Strike: exposed +${bossCfg().strikeBonusS}s`, '#ffd84a');
    addFx({ kind: 'boom', x: P.x, y: P.y, life: 0.42, color: strikeCol, r: rad });
    addFx({ kind: 'levelup', x: P.x, y: P.y, life: 0.36, color: stFx.accent, r: rad * 0.8 });
    freeze(0.08); cue('explode');
    return true;
  }

  function act(id: ActionId, bike: Readonly<BikeState>): boolean {
    if (cds[id].left > 0 && !(id === 'strike' && t < bulletTimeUntil)) { cue('deny'); return false; }
    if (id === 'strike') {
      if (!doStrike(bike)) return false;
      if (t >= bulletTimeUntil) startCd('strike', strikeCd());
    } else if (id === 'ward') {
      P.ward = wardDur() * tm.wardDurMult;
      startCd('ward', wardCd()); cue('pickup');
      addFx({ kind: 'levelup', x: P.x, y: P.y, life: 0.6, color: '#7fe7ff', r: 1.4 });
    } else if (id === 'rally') {
      const spin = spinCalled();
      P.rally = rallyDur() * (spin ? 1.35 : 1); startCd('rally', rallyCd() * tm.rallyCdMult); cue('reward');
      if (tm.cinderWake) {
        const dmg = weapon.dmg * playerDmg(bike) * 1.4;
        addFx({ kind: 'boom', x: P.x, y: P.y, life: 0.5, color: '#ff6b4a', r: 3.4 });
        for (const e of liveInRoom(current)) if (Math.hypot(e.x - P.x, e.y - P.y) < 3.4 + e.r) {
          e.slowT = Math.max(e.slowT, 3); e.dotT = Math.max(e.dotT, 4); e.dotDps = Math.max(e.dotDps, dmg * 0.25);
          damageEnemy(e, dmg, bike, false, '#ff6b4a');
        }
      }
      toast(spin ? 'Rally! Spin-up surge' : 'Rally! Faster attacks', '#8fd8ff');
    } else {
      if (P.potions <= 0 || P.hp >= P.maxHp) { cue('deny'); return false; }
      P.potions--; healPlayer(P.maxHp * potionHeal()); P.lastPotionT = t;
      if (tm.potionArmorBonus > 0) potionArmorUntil = t + 4;
      if (tm.sugarRush) { firedUpUntil = Math.max(firedUpUntil, t + 8); toast('Sugar Rush! Fired Up (8s)', '#7dff8a'); }
      startCd('potion', potionCd()); cue('potion');
      addFx({ kind: 'levelup', x: P.x, y: P.y, life: 0.6, color: '#ff6b8a', r: 1 });
    }
    ctx.emit({ type: 'action', data: { id, floor } });
    return true;
  }

  function setPaceBias(next: PaceBias) {
    const clamped = clamp(next, -1, 1) as PaceBias;
    if (clamped === paceBias) { cue('deny'); return; }
    paceBias = clamped;
    cfgMemo = null;
    const pm = PACE_MODES[paceBias];
    cue(paceBias > 0 ? 'surge' : paceBias < 0 ? 'chime' : 'swap');
    toast(`Pace: ${pm.label} - ${pm.desc}`, pm.color);
    ctx.emit({ type: 'paceBias', data: { bias: paceBias, id: pm.id, floor } });
  }

  function riderActions(input: Readonly<InputState>, bike: Readonly<BikeState>) {
    const p = (b: Button) => input.pressed.has(b);
    if (lootOffer && lootTap) resolveLootOffer(lootTap);
    for (const id of tapped.splice(0)) {
      if (id === 'rally' && lootOffer) resolveLootOffer(lootOffer.view.defaultChoice === 'equip' ? 'drop' : 'equip');
      else act(id, bike);
    }
    if (p('left')) setPaceBias((paceBias - 1) as PaceBias);
    if (p('right')) setPaceBias((paceBias + 1) as PaceBias);
    if (p('up')) { openSkillOffer(true, unspentSP > 0 ? 'full' : 'full', 'Build & Skill Tree'); return; }
    if (p('a')) act('strike', bike);
    if (p('b')) act('ward', bike);
    if (p('y')) {
      if (lootOffer) resolveLootOffer(lootOffer.view.defaultChoice === 'equip' ? 'drop' : 'equip');
      else act('rally', bike);
    }
    if (p('z')) act('potion', bike);
    if (shouldAutoPotion(P.hp / P.maxHp, P.potions, t - P.lastPotionT, autoPotionFrac()) && cds.potion.left <= 0) act('potion', bike);
    if (opts?.actionBot) botActions(bike);
  }

  function botActions(bike: Readonly<BikeState>) {
    const live = liveInRoom(current), near = live.filter((e) => Math.hypot(e.x - P.x, e.y - P.y) < effectiveStrikeRadius() + e.r);
    const fighting = bossStarted && boss.alive && current === boss.room;
    if (cds.strike.left <= 0 && near.length && ((fighting && bs.cycle === 'exposed' && near.includes(boss)) || (!fighting && near.length >= 3))) act('strike', bike);
    if (cds.ward.left <= 0 && ((fighting && bs.cycle === 'windup' && bs.left < 0.8) || (!fighting && P.hp < P.maxHp * 0.4 && near.length >= 2))) act('ward', bike);
    if (cds.rally.left <= 0 && spinCalled() && live.length) act('rally', bike);
    if (cds.potion.left <= 0 && P.potions > 0 && P.hp < P.maxHp * 0.5) act('potion', bike);
  }

  function paceTick(dt: number, bike: Readonly<BikeState>) {
    const r = activeRoom(), cfg = dirCfg(), seg0 = dir.seg;
    const evs = stepDirector(dir, {
      dt, rideMin: t / 60, inFight: r.locked && !r.cleared && !r.boss,
      bossActive: bossStarted && boss.alive && current === boss.room, bossDone: bossStarted && !boss.alive,
    }, cfg);
    if (dir.seg === 'spinup' && bike.cadence3s >= cfg.spinRpm) spinGood += dt;
    if (dir.seg !== seg0 && SEG_BANNER[dir.seg]) addFx({ kind: 'banner', x: P.x, y: P.y, life: 2, color: '#8fd8ff', text: SEG_BANNER[dir.seg]! });
    for (const ev of evs) {
      if (ev === 'ambush') {
        const n = Math.round(ambushN()) + Math.floor(floor / 3);
        for (let k = 0; k < n; k++) {
          const side = k % 4, f = (k + 0.5) / n;
          const x = side < 2 ? r.x0 + 1 + f * (r.w - 2) : side === 2 ? r.x0 + 1.5 : r.x0 + r.w - 1.5;
          const y = side === 0 ? r.y0 + 1.5 : side === 1 ? r.y0 + r.h - 1.5 : r.y0 + 1 + f * (r.h - 2);
          if (!solid(Math.floor(x), Math.floor(y))) spawnEnemy((['chaser', 'bat', 'archer', 'brute'] as EnemyKind[])[k % (floor > 2 ? 4 : 2)], x, y, r.id);
        }
        toast(cfg.targets.ambush.label, '#ff7a2a'); cue('bossStart'); freeze(0.15);
        addFx({ kind: 'banner', x: P.x, y: P.y, life: 2.5, color: '#ff7a2a', text: 'AMBUSH' });
        ctx.emit({ type: 'ambush', data: { floor } });
      } else if (ev === 'ambushEnd') {
        climbsTotal++;
        checkGrimpeurUnlock();
        toast('Ambush over: recover', '#8fd8ff');
      } else if (ev === 'spinup') {
        spinGood = 0; toast(`Spin up! Over ${cfg.spinRpm} rpm. Rally is live`, '#8fd8ff'); cue('select');
        addFx({ kind: 'banner', x: P.x, y: P.y, life: 2, color: '#8fd8ff', text: 'SPIN UP' });
      } else if (ev === 'spinupEnd') {
        if (spinGood >= spinGoodFrac() * cfg.spinupS) {
          for (const k of Object.keys(cds) as ActionId[]) completeCooldown(cds[k]);
          const v = Math.round(15 * floor * mods.coinMult); addCoins(v);
          toast(`Spin-up answered: actions recharged, +${v}c`, '#8fd8ff'); cue('coin');
          ctx.emit({ type: 'spinup', data: { floor, ok: true } });
        } else ctx.emit({ type: 'spinup', data: { floor, ok: false } });
      }
    }
  }

  // ---------- skill tree modal (auto-popup on room clear, manual D-pad Up / Pause Build Inspector) ----------
  function refreshTreeMods(bike: Readonly<BikeState>) {
    const climbing = dir.seg === 'ambush' || dir.seg === 'boss';
    tm = computeTreeMods(archetype, skillRanks, {
      cadence: bike.cadence3s,
      powerZone: bike.powerZone,
      effortZone: bike.effortZone,
      sprinting: bike.sprinting,
      firedUp: t < firedUpUntil,
      climbing,
      relicBonusBranches,
    });
  }

  function firstAvailableNodeId(): string {
    const cards = quickPickCards(archetype, skillRanks);
    if (cards.length) return cards[suggestQuickPick(archetype, skillRanks, cards)].node.id;
    return SKILL_TREES[archetype][0].nodes[0].id;
  }

  function openSkillOffer(manual: boolean, mode: 'quick' | 'full', reason: string) {
    const cards = quickPickCards(archetype, skillRanks);
    if (!manual && (!cards.length || unspentSP <= 0)) return;
    const sug = opts?.skills === 'first' ? 0 : suggestQuickPick(archetype, skillRanks, cards);
    skillOffer = {
      mode: cards.length === 0 ? 'full' : mode,
      sel: sug,
      focusNodeId: cards[sug]?.node.id ?? firstAvailableNodeId(),
      age: 0,
      manual,
      reason,
    };
    cue('shrine');
    holdRecoveryRoad();
    ctx.emit({ type: 'skillOffer', data: { floor, mode: skillOffer.mode, unspentSP, manual } });
  }

  function applySkillInvest(nodeId: string, bike: Readonly<BikeState>): boolean {
    if (!canInvestNode(archetype, skillRanks, nodeId, unspentSP)) { cue('deny'); return false; }
    if (!investSkillNode(archetype, skillRanks, nodeId)) { cue('deny'); return false; }
    unspentSP--;
    const found = getNodeById(archetype, nodeId)!;
    refreshTreeMods(bike);
    if (nodeId === 'r_f_t1') P.potions = Math.min(potionCap(), P.potions + 1);
    P.lastShotRevs = bike.crankRevs;
    const investCue = found.node.tier === 4 ? 'payoffSting' : found.node.tier === 3 ? 'boltOn' : 'upgrade';
    cue(investCue);
    addFx({ kind: 'levelup', x: P.x, y: P.y, life: 1.2, color: found.branch.color, r: 2.5 });
    const rank = getNodeRank(skillRanks, nodeId);
    const label = found.node.tier === 4 ? `KEYSTONE: ${found.node.name}` : found.node.tier === 3 ? `FORK LOCKED: ${found.node.name}` : `${found.node.name} (${rank}/${found.node.maxRank})`;
    toast(label, found.branch.color);
    ctx.emit({ type: 'skillInvest', data: { archetype, nodeId, branch: found.branch.id, tier: found.node.tier, rank, floor } });

    // Close automatically in quick mode once all banked SP are spent (or if nothing left to upgrade)
    const nextCards = quickPickCards(archetype, skillRanks);
    if (skillOffer) {
      if (unspentSP <= 0 && !skillOffer.manual) {
        skillOffer = null;
      } else if (skillOffer.mode === 'quick' && nextCards.length === 0) {
        skillOffer = null;
      } else {
        const sug = opts?.skills === 'first' ? 0 : suggestQuickPick(archetype, skillRanks, nextCards);
        skillOffer.sel = sug;
        skillOffer.age = 0;
        if (skillOffer.mode === 'quick' && nextCards[sug]) skillOffer.focusNodeId = nextCards[sug].node.id;
      }
    }
    return true;
  }

  function moveTreeFocus(dx: number, dy: number) {
    if (!skillOffer) return;
    const branches = SKILL_TREES[archetype];
    let bIdx = 0, nIdx = 0;
    for (let bi = 0; bi < branches.length; bi++) {
      const idx = branches[bi].nodes.findIndex((n) => n.id === skillOffer!.focusNodeId);
      if (idx >= 0) { bIdx = bi; nIdx = idx; break; }
    }
    if (dx !== 0) {
      bIdx = (bIdx + dx + branches.length) % branches.length;
      nIdx = Math.min(nIdx, branches[bIdx].nodes.length - 1);
    }
    if (dy !== 0) {
      nIdx = (nIdx + dy + branches[bIdx].nodes.length) % branches[bIdx].nodes.length;
    }
    skillOffer.focusNodeId = branches[bIdx].nodes[nIdx].id;
    cue('uiMove');
  }

  function skillOfferUpdate(dt: number, input: Readonly<InputState>, bike: Readonly<BikeState>) {
    const o = skillOffer!;
    const cards = quickPickCards(archetype, skillRanks);
    const p = (b: Button) => input.pressed.has(b);

    // Handle pointer taps sent from renderer
    for (const a of pendingActions.splice(0)) {
      if (a.type === 'skillClose') { skillOffer = null; P.lastShotRevs = bike.crankRevs; cue('uiBack'); return; }
      if (a.type === 'skillMode') { o.mode = a.mode; o.age = 0; cue('select'); continue; }
      if (a.type === 'skillCard' && a.i >= 0 && a.i < cards.length) {
        o.sel = a.i;
        applySkillInvest(cards[a.i].node.id, bike);
        if (!skillOffer) return;
      }
      if (a.type === 'skillPick') {
        const wasFocused = o.focusNodeId === a.nodeId;
        o.focusNodeId = a.nodeId;
        const found = getNodeById(archetype, a.nodeId);
        // Two-step protection on irreversible Tier 3 Forks: first tap focuses to inspect, second tap or Confirm button locks in
        if (found?.node.fork && !wasFocused && !a.confirm) {
          cue('uiMove');
          continue;
        }
        if (canInvestNode(archetype, skillRanks, a.nodeId, unspentSP)) applySkillInvest(a.nodeId, bike);
        else cue('uiMove');
        if (!skillOffer) return;
      }
    }

    if (p('b')) { skillOffer = null; P.lastShotRevs = bike.crankRevs; cue('uiBack'); return; }
    if (p('y')) { o.mode = o.mode === 'quick' ? 'full' : 'quick'; o.age = 0; cue('select'); return; }

    if (o.mode === 'quick') {
      o.age += dt;
      if (cards.length > 0) {
        if (p('left') || p('up')) { o.sel = (o.sel + cards.length - 1) % cards.length; o.focusNodeId = cards[o.sel].node.id; cue('select'); }
        if (p('right') || p('down')) { o.sel = (o.sel + 1) % cards.length; o.focusNodeId = cards[o.sel].node.id; cue('select'); }
        if (o.age >= 0.4 && (p('a') || p('z'))) { applySkillInvest(cards[o.sel].node.id, bike); return; }
        const limit = autopilot ? Math.min(1.5, skillAutoS()) : skillAutoS();
        if (!o.manual && o.age >= limit) { applySkillInvest(cards[o.sel].node.id, bike); return; }
      }
    } else {
      // Full 3-branch tree navigation (timer paused so rider can plan calmly)
      if (p('left')) moveTreeFocus(-1, 0);
      if (p('right')) moveTreeFocus(1, 0);
      if (p('up')) moveTreeFocus(0, -1);
      if (p('down')) moveTreeFocus(0, 1);
      if (p('a') || p('z')) applySkillInvest(o.focusNodeId, bike);
    }
    holdRecoveryRoad();
  }

  // ---------- navigation & AI ----------
  let stuckX = 0, stuckY = 0, stuckT = 0;
  const pathTo = (tx: number, ty: number) => (navPrev = { x: P.x, y: P.y }, findPath(world.w, world.h, walkSolid, Math.floor(P.x), Math.floor(P.y), tx, ty, { smooth: false, wallCost: 0.35 }));
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
    if (b && Math.hypot(a.x - P.x, a.y - P.y) < 0.9) {
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
    if (a && b) {
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
    if (t - stuckT > 0.75) { navAge = 99; stuckT = t; stuckStats++; }
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

  let dbgTick = 0;
  function autopilotCtl(): Ctl {
    exploring = false;
    let mx = 0, my = 0, roll = false;
    const near = nearestEnemy();
    P.targetId = near?.id ?? 0;
    const room = activeRoom();
    const arch = ARCHETYPES[archetype];
    if (near && room.locked) {
      const dx = near.x - P.x, dy = near.y - P.y, d = Math.hypot(dx, dy) || 1;
      const baseWant = arch.standoff(standoff(weapon.range, near)) + (paceBias === -1 ? 0.9 : paceBias === 1 ? -0.4 : 0);
      const want = near === boss && bs.cycle === 'exposed' && cds.strike.left <= 0 ? Math.max(1, effectiveStrikeRadius() * 0.6) : Math.max(1.2, baseWant);
      const s = d > want + 1 ? 1 : d < want - 1 ? -1 : 0;
      mx = (dx / d) * s; my = (dy / d) * s;
      if (s === 1) {
        const key = `fight${near.id}`;
        if (navKey !== key || navAge > 0.75 || !navPath.length) { navPath = pathTo(Math.floor(near.x), Math.floor(near.y)); navKey = key; navAge = 0; }
        while (navPath.length > 1 && Math.hypot(navPath[0].x - P.x, navPath[0].y - P.y) < 0.45) navPrev = navPath.shift()!;
        const v = pursue(); if (v) { mx = v.x; my = v.y; }
      }
      const pathing = s === 1 && navPath.length > 0;
      if (s === 0) { const k = 0.25 + 0.6 * arch.strafe; mx = -dy / d * k; my = dx / d * k; }
      for (const b of bullets) {
        if (b.friendly) continue;
        const bx = P.x - b.x, by = P.y - b.y, bd = Math.hypot(bx, by), bv = Math.hypot(b.vx, b.vy) || 1;
        if (bd > 2.2 || bd < 0.01 || bx * b.vx + by * b.vy <= 0) continue;
        const px = -b.vy / bv, py = b.vx / bv, side = px * bx + py * by >= 0 ? 1 : -1, w = 1.4 * (1 - bd / 2.2);
        mx += px * side * w; my += py * side * w;
      }
      for (const h of hazards) { const hx = h.x - P.x, hy = h.y - P.y, hd = Math.hypot(hx, hy) || 1; if (hd < h.r + 1) { mx -= hx / hd * 2; my -= hy / hd * 2; } }
      const cx = room.x0 + room.w / 2 - P.x, cy = room.y0 + room.h / 2 - P.y;
      if (!pathing && !inRoom(room, P.x, P.y, 1.6)) { mx += cx * 0.2; my += cy * 0.2; }
      if (d < 1.4 && P.hp < P.maxHp * 0.6) { mx = -dx / d; my = -dy / d; roll = P.rollCd <= 0; }
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
    if ((dbgTick = (dbgTick + 1) % 15) === 0) ctx.debug('autopilot', `${mx.toFixed(2)},${my.toFixed(2)} path${navPath.length} ${navKey}`);
    return { mx, my, roll };
  }

  // ---------- camp (between runs: Hero Archetype Select + Camp Upgrades + Build Summary) ----------
  function cycleArchetype(dirStep: number) {
    const unlocked = unlockedArchetypes(unlockProgress());
    if (unlocked.length < 2) { cue('deny'); return; }
    const i = Math.max(0, unlocked.indexOf(archetype));
    archetype = unlocked[(i + dirStep + unlocked.length) % unlocked.length];
    cfgMemo = null;
    cue('select');
    persist();
  }

  function campRows(): CampView['rows'] {
    const a = ARCHETYPES[archetype];
    const rows: CampView['rows'] = [
      { kind: 'start', name: `Ride as ${a.shortName}`, desc: `Floor ${startFloor} of ${FLOORS} · ${tierOf(tier).name} · ${a.workoutTag}` },
      { kind: 'archetype', name: 'Hero Archetype', desc: `◀ ${a.name} ▶  ${erg ? a.ergLabel : a.gradeLabel}` },
    ];
    if (mods.startFloors.length > 1) rows.push({ kind: 'floor', name: 'Start at', desc: `◀ ${planFor(startFloor).name} (floor ${startFloor}) ▶` });
    if (tierUnlocked > 0) rows.push({ kind: 'tier', name: 'Category', desc: `◀ ${tierOf(tier).name} ▶  ${tierOf(tier).blurb}` });
    for (const d of UPGRADES) {
      const L = lvl(levels, d.id), cost = L >= d.max ? undefined : upgradeCost(d, L);
      rows.push({ kind: 'upgrade', id: d.id, name: d.name, desc: d.desc, level: L, max: d.max, cost, affordable: cost !== undefined && cost <= bankStart });
    }
    rows.push({ kind: 'auto', name: 'Auto-invest at start', desc: autoInvestOn ? 'ON' : 'OFF' });
    rows.push({ kind: 'erg', name: 'Trainer mode', desc: erg ? 'ERG: game holds archetype power' : 'Grade: you shift gears' });
    return rows;
  }

  function campUpdate(dt: number, input: Readonly<InputState>, bike: Readonly<BikeState>) {
    if (campLockT > 0) { campLockT = Math.max(0, campLockT - dt); pendingActions.length = 0; return; }
    const rows = campRows();
    const p = (b: Button) => input.pressed.has(b);
    let tapped = false;
    for (const a of pendingActions.splice(0)) {
      if (a.type === 'selectArchetype') {
        if (isArchetypeUnlocked(a.id, unlockProgress())) { archetype = a.id; cfgMemo = null; campT = 0; cue('select'); persist(); }
        else { cue('deny'); toast(`Unlock The Grimpeur: ${ARCHETYPES.grimpeur.unlockReq}`, '#ff6e5a'); }
      } else if (a.type === 'campRow' && a.row >= 0 && a.row < rows.length) {
        campSel = a.row; tapped = true;
      }
    }
    if (p('up')) { campSel = (campSel + rows.length - 1) % rows.length; cue('select'); campT = 0; }
    if (p('down')) { campSel = (campSel + 1) % rows.length; cue('select'); campT = 0; }
    campSel = Math.min(campSel, rows.length - 1);
    const row = rows[campSel];
    if (row.kind === 'archetype' && (p('left') || p('right'))) { cycleArchetype(p('left') ? -1 : 1); campT = 0; }
    else if (row.kind === 'floor' && (p('left') || p('right'))) { startFloor = stepStart(p('left') ? -1 : 1); cue('select'); campT = 0; }
    else if (row.kind === 'tier' && (p('left') || p('right'))) { tier = clamp(tier + (p('left') ? -1 : 1), 0, tierUnlocked); cue('select'); campT = 0; persist(); }
    else if ((row.kind === 'start') && (p('left') || p('right'))) { cycleArchetype(p('left') ? -1 : 1); campT = 0; }

    if (p('a') || p('z') || tapped) {
      campT = 0;
      if (row.kind === 'start') { startRun(); return; }
      if (row.kind === 'archetype') { cycleArchetype(1); }
      if (row.kind === 'floor') { startFloor = startFloor >= mods.maxStartFloor ? 1 : stepStart(1); cue('select'); }
      if (row.kind === 'tier') { tier = tier >= tierUnlocked ? 0 : tier + 1; cue('select'); persist(); }
      if (row.kind === 'auto') { autoInvestOn = !autoInvestOn; cue('select'); persist(); }
      if (row.kind === 'erg') { erg = !erg; cue('select'); applyMode(); persist(); }
      if (row.kind === 'upgrade') {
        if (row.affordable) {
          bankStart -= row.cost!; levels[row.id!] = (row.level ?? 0) + 1; cue('buy');
          mods = metaMods(levels, bestFloor); persist();
        } else cue('deny');
      }
    }
    if (p('b')) { startRun(); return; }
    if (bike.cadence3s > 30) campT += dt;
    if (campT >= campAutoS() || (autopilot && campT >= Math.min(campAutoS(), 10))) startRun();
  }

  function stepStart(d: number): number {
    const f = mods.startFloors, i = Math.max(0, f.indexOf(startFloor));
    return f[clamp(i + d, 0, f.length - 1)];
  }
  const snapStart = (f: number) => mods.startFloors.filter((s) => s <= f).pop() ?? 1;

  function startRun() {
    if (autoInvestOn) {
      const r = autoInvest(bankStart, levels);
      bankStart = r.bank;
      if (r.bought.length) toast(`Auto-invested: ${r.bought.length} upgrade${r.bought.length > 1 ? 's' : ''}`, '#ffd84a');
    }
    mods = metaMods(levels, bestFloor);
    if (!opts?.floor) startFloor = snapStart(startFloor);
    floor = startFloor; runTier = tier; runT0 = t; runKills0 = kills; runBosses0 = bossDefeated; runClimbs0 = climbsTotal;
    bestFloor = Math.max(bestFloor, floor);
    runs++; sessionRuns++;
    totals.runs++; P.coins = 0; P.coinsEarned = 0; P.shield = 0; lastDeath = undefined;
    P.level = 1 + 2 * (floor - 1); P.xp = 0;
    paceBias = 0; cfgMemo = null;
    const arch = ARCHETYPES[archetype];
    for (const sl of SLOTS) delete gear[sl];
    weapon = floor > 1 ? makeWeapon(rng, P.level, 1, arch.starterStyle) : makeWeapon(rng, 1, 0, arch.starterStyle);
    bestFind = weapon;
    skillRanks = {}; unspentSP = 0; relicBonusBranches = []; skillOffer = null; skillOfferDueT = -1; lootOffer = null; lootTap = null;
    wardBlocks = 0; pelotonThornsUntil = -1; potionArmorUntil = -1; floorSecondWindUsed = false; musetteRooms = 0;
    z4CritCharges = 0; bulletTimeUntil = -1; momentumStacks = 0; mountainKingUntil = -1; pullTimer = 0; calderaTimer = 0; haloTimer = 0;

    // Shortcut start grants starting skill points for skipped floors
    if (floor > 1) {
      const bonus = floor - 1;
      if (autopilot && opts?.skills !== 'none') {
        for (let k = 0; k < bonus; k++) {
          const cards = quickPickCards(archetype, skillRanks);
          if (!cards.length) break;
          const sug = suggestQuickPick(archetype, skillRanks, cards);
          investSkillNode(archetype, skillRanks, cards[sug].node.id);
        }
      } else {
        unspentSP += bonus;
      }
      toast(`Shortcut: +${bonus} Skill Point${bonus > 1 ? 's' : ''} for the road`, '#8fd8ff');
    }

    refreshTreeMods(ctx.bike());
    P.potions = potionCap();
    buildFloor(); dir = newFloor(true);
    recomputeHp(true);
    P.lastShotRevs = ctx.bike().crankRevs;
    phase = 'run';
    cue('stairs');
    toast(`${arch.name} · ${planFor(floor).name}, floor ${floor}/${FLOORS}`, arch.color);
    persist();
  }
  if (autopilot || opts?.skipCamp) startRun();

  // ---------- shrines ----------
  function shrineUpdate(dt: number, bike: Readonly<BikeState>) {
    for (const s of shrines) {
      if (s.state !== 'active') continue;
      s.left -= dt;
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
      weapon = { ...weapon, plus: weapon.plus + 2 }; weapon.score = weaponScore(weapon);
      toast(`Fury! ${weapon.name} is now +${weapon.plus}`, '#ff8c2a');
    } else if (s.kind === 'whirl') {
      for (let i = 0; i < 8; i++) dropAt(s.x, s.y, 'coin', coinValue());
      if (P.potions < potionCap()) P.potions++;
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
    ergCurseSpinT = 0;
    cue('curse');
    addFx({ kind: 'banner', x: P.x, y: P.y, life: 3, color: d.color, text: `${d.name}: ${d.desc}` });
    toast(`${d.name}! +50% coins & XP while it lasts. ${erg ? 'Spin 100+ rpm for 5s' : 'Sprint'} to break it.`, d.color);
    ctx.emit({ type: 'curse', data: { kind, floor } });
  }
  function curseUpdate(dt: number, bike: Readonly<BikeState>) {
    if (!curse) return;
    curse.left -= dt;
    if (erg && bike.cadence3s >= dirCfg().spinRpm) ergCurseSpinT += dt; else ergCurseSpinT = Math.max(0, ergCurseSpinT - dt);
    const broken = bike.sprintCount > curse.s0 || (erg && ergCurseSpinT >= 5);
    if (curse.left > 0 && !broken) return;
    const d = CURSES[curse.kind];
    curse = null; ergCurseSpinT = 0; cursesSurvived++;
    freeze(0.15); cue('reward');
    addFx({ kind: 'levelup', x: P.x, y: P.y, life: 1.2, color: d.color, r: 2.2 });
    toast(broken ? `You shattered the ${d.name}! Bounty dropped.` : `${d.name} lifted. Bounty dropped.`, '#ffd84a');
    dropItem(P.x, P.y, 1, 1.5);
    for (let i = 0; i < 6; i++) dropAt(P.x, P.y, 'coin', coinValue() * 2);
  }

  // ---------- update ----------
  function update(dt: Seconds) {
    const bike = ctx.bike(), input = ctx.input();
    cfgFresh = false;
    if (phase === 'camp') { t += dt; campUpdate(dt, input, bike); holdRecoveryRoad(); return; }
    if (skillOffer) { skillOfferUpdate(dt, input, bike); return; }

    // Drain any UI-triggered actions while running
    for (const a of pendingActions.splice(0)) {
      if (a.type === 'openSkillTree') { openSkillOffer(true, 'full', 'Build & Skill Tree'); return; }
      if (a.type === 'paceBias') setPaceBias(a.bias);
    }

    if (hitT > 0) { hitT -= dt; return; }
    if (skillOfferDueT >= 0 && t >= skillOfferDueT) {
      skillOfferDueT = -1;
      if (unspentSP > 0 && opts?.skills !== 'none') {
        openSkillOffer(false, 'quick', `Level ${P.level} · Room Cleared`);
        if (skillOffer) return;
      }
    }

    t += dt; navAge += dt; stuckCheck();
    if (finishSeq && finishSeq.stage !== 'findBike') {
      if (erg) ergSync(dirCfg().targets.cooldown.erg); else resSync('terrain', campGrade());
      if (finishSeq.stage === 'rideToLine') {
        const rate = autopilot ? 2.5 : 0.25 + 0.25 * clamp(bike.cadence3s / 90, 0.3, 1.8) + (bike.sprinting ? 0.35 : 0);
        finishSeq.progress = Math.min(1, finishSeq.progress + rate * dt);
        P.x = finishSeq.bikeX + (finishSeq.lineX - finishSeq.bikeX) * finishSeq.progress;
        P.y = finishSeq.bikeY + (finishSeq.lineY - finishSeq.bikeY) * finishSeq.progress;
        P.aim = Math.atan2(finishSeq.lineY - finishSeq.bikeY, finishSeq.lineX - finishSeq.bikeX);
        P.moving = true;
        if (finishSeq.progress >= 1) {
          finishSeq.stage = 'celebrate'; finishSeq.celebrateT = 0; P.moving = false;
          cue('unique');
          addFx({ kind: 'banner', x: P.x, y: P.y, life: 3, color: '#ffd84a', text: 'STAGE COMPLETE!' });
          for (let k = 0; k < 4; k++) addFx({ kind: 'boom', x: P.x + (k - 1.5) * 1.4, y: P.y - 0.6, life: 0.7 + k * 0.15, color: k % 2 ? '#ffd84a' : '#7fe7ff', r: 1.8 });
        }
      } else {
        finishSeq.celebrateT += dt;
        if (finishSeq.celebrateT >= (autopilot ? 0.15 : 2.6)) { descend(); }
      }
      return;
    }
    refreshTreeMods(bike);

    // Power-zone edge triggers (Snap Attack Z4+ crits, Photo Finish Z5 Bullet Time)
    const pz = Math.min(5, bike.powerZone);
    if (pz >= 4 && prevPowerZone < 4 && tm.z4CritCharges > 0) z4CritCharges = tm.z4CritCharges;
    if (pz >= 5 && prevPowerZone < 5 && tm.photoFinish && t >= bulletTimeUntil) {
      bulletTimeUntil = t + 4;
      toast('PHOTO FINISH! Z5 Bullet Time', '#ff9a3c');
    }
    prevPowerZone = pz;

    const ctl = autopilotCtl();
    for (let z = 0; z < 5; z++) zoneRates[z + 1] = zoneRefill[z]();
    const rate = refillRate(bike.powerZone, zoneRates) * PACE_MODES[paceBias].cdRefillMult;
    lastRate = rate;
    for (const k of CD_KEYS) tickCooldown(cds[k], dt, rate);
    sprintingNow = bike.sprinting;
    tickCooldown(swCd, dt, rate);

    if (bike.sprintCount > lastSprints) {
      lastSprints = bike.sprintCount;
      firedUpUntil = t + fireS() + tm.firedUpAddS;
      if (tm.z4CritCharges > 0) z4CritCharges = tm.z4CritCharges;
      if (phase === 'run' && sprintHeal() > 0 && P.hp < P.maxHp) { healPlayer(P.maxHp * sprintHeal()); toast('Second breath', '#7dff9a'); }
      if (swCd.left > 0) swCd.left = Math.max(0, swCd.left - sprintSw());
      if (phase === 'run' && bossStarted && boss.alive && current === boss.room && sprintBreak(bs, sprintBreakS() * tm.horsExposedDurMult)) {
        grantMountainKing();
        toast('Sprint broke its guard! Exposed', '#ffd84a'); cue('crit'); expWindows++; expHit = false; ctx.emit({ type: 'bossExposed', data: { floor, parried: false, sprint: true } });
      }
      if (sprintCompletes() && (Object.keys(cds) as ActionId[]).map((k) => completeCooldown(cds[k])).some(Boolean)) {
        toast('Sprint! Actions recharged', '#ffd84a'); cue('reward');
        ctx.emit({ type: 'actionsRecharged', data: { floor } });
      }
    }

    // Iron Curtain end-of-Ward heal
    P.ward = Math.max(0, P.ward - dt);
    if (wardWasUp && P.ward <= 0 && tm.wardEndHeal > 0) healPlayer(P.maxHp * tm.wardEndHeal);
    wardWasUp = P.ward > 0;

    P.rally = Math.max(0, P.rally - dt);
    riderActions(input, bike);
    if (skillOffer) return; // opened via D-pad Up
    if (lootOffer) {
      lootOffer.leftS -= dt;
      if (lootOffer.leftS <= 0) resolveLootOffer(lootOffer.view.defaultChoice);
    }
    paceTick(dt, bike);

    // Periodic skill-tree auras (Slipstream Pull, Perpetual Flywheel Blazing Halo, Volcanic Ascent Caldera)
    if (tm.slipstreamPull) {
      pullTimer += dt;
      if (pullTimer >= 3) {
        pullTimer = 0;
        for (const e of liveInRoom(current)) {
          if (e.kind === 'boss') continue;
          const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy);
          if (d > 1.8 && d < 6.5) { move(e, (dx / d) * 1.4, (dy / d) * 1.4, e.r); e.slowT = Math.max(e.slowT, 2); }
        }
      }
    }
    if (tm.blazingHalo) {
      haloTimer += dt;
      if (haloTimer >= 0.6) {
        haloTimer = 0;
        for (const e of liveInRoom(current)) if (Math.hypot(e.x - P.x, e.y - P.y) < 2.6 + e.r) damageEnemy(e, e.maxHp * 0.035 + weapon.dmg * playerDmg(bike) * 0.25, bike, false, '#ff9a3c');
      }
    }
    if (tm.volcanicAscent) {
      calderaTimer += dt;
      if (calderaTimer >= 2.5) {
        calderaTimer = 0;
        const live = liveInRoom(current);
        if (live.length) {
          addFx({ kind: 'boom', x: P.x, y: P.y, life: 0.45, color: '#ff6b4a', r: 3.4 });
          const dmg = weapon.dmg * playerDmg(bike) * 1.1;
          for (const e of live) if (Math.hypot(e.x - P.x, e.y - P.y) < 3.4 + e.r) {
            e.dotT = Math.max(e.dotT, 3); e.dotDps = Math.max(e.dotDps, dmg * 0.25);
            damageEnemy(e, dmg, bike, false, '#ff6b4a');
          }
        }
      }
    }

    // --- player movement
    P.invuln = Math.max(0, P.invuln - dt);
    const tile = tileAt(world, Math.floor(P.x), Math.floor(P.y));
    P.onSwamp = tile === TILE.SWAMP;
    P.speedMult = ARCHETYPES[archetype].moveMult * speedCurve(bike.cadence3s) * (1 + gearSum('speed')) * mods.speedMult * (t < mountainKingUntil ? 1.2 : 1) * (P.onSwamp ? 0.75 : 1) * (cursed('mire') ? 0.85 : 1);
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
          if (!r.boss && !curse && (floor > 1 || roomsCleared >= 2) && rng() < Math.min(0.2 + T().curse, curseChance() + 0.01 * (floor - 1) + T().curse)) startCurse(bike);
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

    // --- bike mount (Floor 7 finish) or stairs (floors 1..6)
    if (!boss.alive && finishSeq?.stage === 'findBike') {
      if (Math.hypot(P.x - finishSeq.bikeX, P.y - finishSeq.bikeY) < 0.9 || tileAt(world, Math.floor(P.x), Math.floor(P.y)) === TILE.STAIRS) {
        finishSeq.stage = 'rideToLine'; finishSeq.progress = 0;
        P.x = finishSeq.bikeX; P.y = finishSeq.bikeY;
        cue('reward');
        toast('Mounted up! Pedal across the finish line!', '#ffd84a');
        addFx({ kind: 'banner', x: P.x, y: P.y, life: 2.5, color: '#ffd84a', text: 'SPRINT FOR THE LINE!' });
        return;
      }
    } else if (!boss.alive && tileAt(world, Math.floor(P.x), Math.floor(P.y)) === TILE.STAIRS) { descend(); return; }

    // --- aim
    const target = nearestEnemy();
    if (target) {
      const d = Math.hypot(target.x - P.x, target.y - P.y), lead = d / weapon.speed;
      P.aim = Math.atan2(target.y + target.vy * lead - P.y, target.x + target.vx * lead - P.x);
    } else if (ctl.mx || ctl.my) P.aim = P.moveAng;

    // --- firing
    const btMult = t < bulletTimeUntil ? 1.8 : 1;
    const revs = bike.crankRevs, per = revsPerShot() / weapon.rate / (P.rally > 0 ? rallyMult() : 1) / (1 + tm.fireRateAdd) / btMult;
    if (revs < P.lastShotRevs) P.lastShotRevs = revs;
    let shots = 0;
    while (revs - P.lastShotRevs >= per && shots < 6) {
      P.lastShotRevs += per; shots++;
      if (target) { fire(bike); output += playerDmg(bike) / weapon.rate; }
    }
    if (target) fightT += dt;
    if (revs - P.lastShotRevs >= per) P.lastShotRevs = revs;

    // --- orbiting blades (Unique weapon OR Rouleur Drafting Blades skill)
    const bladeCount = (weapon.unique === 'orbit' ? 3 : 0) + tm.orbitBlades;
    if (bladeCount > 0) {
      const blades = orbitBlades(bladeCount, bike.cadence3s);
      for (const e of liveInRoom(current)) {
        e.orbitCd -= dt;
        if (e.orbitCd > 0) continue;
        if (blades.some((o) => Math.hypot(e.x - o.x, e.y - o.y) < e.r + 0.38)) {
          e.orbitCd = tm.turbineShock ? 0.16 : 0.3;
          damageEnemy(e, weapon.dmg * playerDmg(bike) * 0.75, bike, false, tm.blazingHalo ? '#ff9a3c' : '#5ad8ff');
          if (tm.turbineShock) chainLightningFrom(e, weapon.dmg * playerDmg(bike) * 0.4, bike, 2);
        }
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
      } else if (!dead && !b.friendly && Math.hypot(P.x - b.x, P.y - b.y) < PLAYER_R + b.r) { hurtPlayer(b.dmg, bike); dead = true; }
      if (dead) bullets.splice(i, 1);
    }

    // --- hazards
    for (let i = hazards.length - 1; i >= 0; i--) {
      const h = hazards[i];
      h.left -= dt;
      if (h.left <= 0) {
        addFx({ kind: 'boom', x: h.x, y: h.y, life: 0.45, color: '#ff7a2a', r: h.r }); cue('explode');
        if (Math.hypot(P.x - h.x, P.y - h.y) < h.r + PLAYER_R) hurtPlayer(h.dmg, bike);
        hazards.splice(i, 1);
      }
    }

    // --- enemies
    if (bossStarted && boss.alive) { bossT += dt; bossTick(dt); if (boss.variant === 2) flailTick(dt, bike); }
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

    // --- drops
    const cur = activeRoom();
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i], dx = P.x - d.x, dy = P.y - d.y, dist = Math.hypot(dx, dy);
      if (!cur.locked || dist < 1.5) {
        if (dist < 0.5) { collect(d); drops.splice(i, 1); continue; }
        const sp = Math.min(dist, (6 + 10 / (dist + 0.5)) * dt);
        d.x += dx / dist * sp; d.y += dy / dist * sp;
      }
    }

    // --- room clear (triggers Level-Up Auto-Popup cleanly if SP are banked!)
    if (cur.locked && liveCount(cur.id) === 0 && (!cur.boss || !boss.alive)) {
      cur.locked = false; cur.cleared = true; safeRoom = cur.id;
      roomsCleared++; cue('door');
      ctx.emit({ type: 'roomCleared', data: { room: cur.id, floor } });
      if (tm.bottomlessMusette) {
        musetteRooms++;
        if (musetteRooms % 2 === 0 && P.potions < potionCap()) { P.potions++; toast('Bottomless Musette: +1 Potion', '#7dff8a'); }
      }
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
      // Schedule non-disruptive room-clear Level-Up popup if skill points are banked
      const isFinalCleared = cur.boss && planFor(floor).final && !boss.alive;
      if (unspentSP > 0 && !isFinalCleared && opts?.skills !== 'none' && skillOfferDueT < 0) {
        skillOfferDueT = t + skillDelayS();
      }
      persist();
    }
    shrineUpdate(dt, bike);
    curseUpdate(dt, bike);

    // --- survival
    const inCombat = cur.locked && liveCount(cur.id) > 0;
    const z2Regen = bike.effortZone === 2 && !cursed('fragile') ? regenPerS() * (P.maxHp / 100) * tm.z2RegenMult * (inCombat ? (floor === 1 ? 0.5 : regenCombat()) : 1) : 0;
    const regen = (gearSum('regen') + mods.regen * P.maxHp / 100 + z2Regen) * PACE_MODES[paceBias].regenMult;
    if (regen > 0) healPlayer(regen * dt);
    if (P.hp <= 0) die();

    // --- resistance (strict ERG + Grade parity, shaped by Archetype + Pace Bias)
    const bsh = bossShield();
    const segT = dirCfg().targets[dir.seg];
    const actShrine = shrines.find((s) => s.state === 'active');
    const shrineErg = actShrine ? ({ fury: 0.85, sprint: 1.22, whirl: 0.6, endurance: 0.65 } as const)[actShrine.kind] : null;
    if (erg) ergSync(bsh.shielded ? clamp(ergSurge() + PACE_MODES[paceBias].ergDelta, 0.7, 1.45) : shrineErg ?? segT.erg);
    else resSync('terrain', terrainGrade() + segT.grade);
    if (!erg) resSync('swamp', P.onSwamp ? swampGrade() : null);
    if (!erg) resSync('wounded', P.hp < P.maxHp * woundedFrac() ? woundedGrade() : null);
    if (!erg) resSync('boss-surge', bsh.shielded ? surgeGrade() : null);
    if (!erg) resSync('curse-mire', cursed('mire') ? curseGrade() : null);

    if (enemies.length > 300) enemies = enemies.filter((e) => e.alive || e === boss);
    while (fx.length && t - fx[0].t0 > 4) fx.shift();
    ctx.debug('floor', floor); ctx.debug('room', current); ctx.debug('hp', Math.round(P.hp)); ctx.debug('weapon', weapon.name);
  }

  function orbitBlades(count: number, cadence = 80) {
    const spd = 3 * (tm.turbineShock ? 1.7 : clamp(cadence / 80, 0.8, 1.5));
    return Array.from({ length: count }, (_, i) => {
      const a = t * spd + (i * Math.PI * 2) / count;
      return { x: P.x + Math.cos(a) * 1.65, y: P.y + Math.sin(a) * 1.65 };
    });
  }

  function updateEnemy(e: Enemy, dt: number, bike: Readonly<BikeState>) {
    const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    e.contactCd = Math.max(0, e.contactCd - dt);
    e.slowT = Math.max(0, e.slowT - dt);
    e.condT = Math.max(0, e.condT - dt);
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
            if (d < 2 + PLAYER_R) hurtPlayer(24 * dmgMul(), bike);
            e.hp = 0; killEnemy(e, bike); return;
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
    if (e.contact > 0 && d < e.r + PLAYER_R + 0.1 && e.contactCd <= 0) { hurtPlayer(e.contact, bike); e.contactCd = e.kind === 'brute' ? 1 : 0.8; }
  }

  function bossTick(dt: number) {
    const cfg = bossCfg();
    for (const ev of stepBoss(bs, { dt, hpFrac: boss.hp / boss.maxHp, wardUp: P.ward > 0 }, cfg)) {
      if (ev === 'windup') { boss.tell = cfg.windupS; toast('Big attack coming! Ward it, then punish', '#ff7a2a'); cue('bossStart'); if (boss.variant === 2) flailWhirl(); }
      else if (ev === 'bigAttack') bigAttack(boss);
      else if (ev === 'exposed') {
        bs.left *= tm.horsExposedDurMult;
        grantMountainKing();
        addFx({ kind: 'banner', x: boss.x, y: boss.y, life: 1.8, color: '#ffe08a', text: bs.parried ? 'PARRIED! EXPOSED' : 'EXPOSED ×2' });
        if (bs.parried) {
          freeze(0.1);
          addFx({ kind: 'boom', x: P.x, y: P.y, life: 0.45, color: '#ffe08a', r: 3.4 });
          addFx({ kind: 'levelup', x: P.x, y: P.y, life: 0.5, color: '#8fd8ff', r: 2.2 });
          const ang = Math.atan2(boss.y - P.y, boss.x - P.x);
          const parryDmg = weapon.dmg * playerDmg(ctx.bike()) * 0.9;
          for (const da of [-0.16, 0, 0.16]) {
            bullets.push({
              x: P.x, y: P.y, vx: Math.cos(ang + da) * 15, vy: Math.sin(ang + da) * 15, r: 0.22,
              dmg: parryDmg, life: 1.1, age: 0, friendly: true, w: weapon, pierce: 1, bounce: 0, hits: [], crit: true, child: true,
            });
          }
          toast(`Parried with Ward: exposed +${cfg.parryBonusS}s`, '#8fd8ff');
        }
        cue('crit'); expWindows++; expHit = false; ctx.emit({ type: 'bossExposed', data: { floor, parried: bs.parried } });
      } else if (ev === 'phase') {
        freeze(0.3); cue('bossStart'); if (boss.variant === 2 && fl.mode !== 'hand') flailReel();
        for (const b of bullets) if (!b.friendly) b.life = 0;
        addFx({ kind: 'banner', x: boss.x, y: boss.y, life: 2.2, color: '#ff5a5a', text: `${BOSS_NAMES[boss.variant]}: PHASE ${bs.phase}` });
        addFx({ kind: 'boom', x: boss.x, y: boss.y, life: 0.6, color: '#ff5a5a', r: 2.5 });
        ctx.emit({ type: 'bossPhase', data: { floor, phase: bs.phase } });
      } else if (ev === 'exposedEnd' && boss.variant === 2 && fl.mode === 'rest') flailReel();
      else if (ev === 'tide') { toast('The tide turns: the boss is tiring', '#7dff5a'); addFx({ kind: 'banner', x: P.x, y: P.y, life: 2.5, color: '#7dff5a', text: 'TURNING TIDE' }); }
    }
  }

  function bigAttack(e: Enemy) {
    const ph = bs.phase, spd = 4 + 0.5 * ph;
    e.spin += 0.4;
    switch (e.variant) {
      case 0: ring(e.x, e.y, 20 + 4 * ph, spd, 7, e.spin); for (let k = 0; k < ph; k++) spawnEnemy('chaser', e.x + (k - 1) * 1.2, e.y + 1.4, e.room).summoned = 1; break;
      case 1: for (let w = 0; w < 2; w++) ring(e.x, e.y, 14 + 2 * ph, spd - w, 7, e.spin + w * 0.2); break;
      case 2: flailSlam(); return;
      case 3: ring(e.x, e.y, 24 + 4 * ph, spd, 7, e.spin); break;
      case 4: for (let k = 0; k < 4; k++) for (let j = 0; j < 4 + ph; j++) enemyShot(e.x, e.y, e.spin + k * Math.PI / 2, 3 + j * 0.8, 7); break;
      case SWEEPER: {
        ring(e.x, e.y, 18 + 4 * ph, spd - 0.5, 7, e.spin); ring(e.x, e.y, 18 + 4 * ph, spd - 1.8, 7, -e.spin + 0.13);
        const rm = world.rooms[e.room];
        for (let k = 0; k < ph; k++) {
          const a = rng() * Math.PI * 2, rr = k ? 2.2 + rng() * 2 : 0;
          hazards.push({ x: clamp(P.x + Math.cos(a) * rr, rm.x0 + 1, rm.x0 + rm.w - 1), y: clamp(P.y + Math.sin(a) * rr, rm.y0 + 1, rm.y0 + rm.h - 1),
            r: 1.8, left: 1.1 + 0.25 * k, total: 1.1 + 0.25 * k, dmg: 20 * dmgMul() });
        }
        break;
      }
      default: for (let w = 0; w < 3; w++) ring(e.x, e.y, 10 + 2 * ph, 2.5 + w * 1.3, 7, e.spin + w * 0.3);
    }
    addFx({ kind: 'boom', x: e.x, y: e.y, life: 0.5, color: e.variant === 5 ? '#9fe8ff' : e.variant === SWEEPER ? '#9affd6' : '#ff7a2a', r: 3 });
    cue('explode'); freeze(0.1);
  }
  const flailHand = () => ({ x: boss.x + (P.x >= boss.x ? 0.7 : -0.7), y: boss.y - 0.4 });
  function flailAim(lead: number) {
    const h = flailHand(), rm = world.rooms[boss.room];
    let ax = P.x + fl.pvx * lead, ay = P.y + fl.pvy * lead;
    const dx = ax - h.x, dy = ay - h.y, dd = Math.hypot(dx, dy);
    if (dd > FLAIL_REACH) { ax = h.x + dx / dd * FLAIL_REACH; ay = h.y + dy / dd * FLAIL_REACH; }
    return { x: clamp(ax, rm.x0 + 0.5, rm.x0 + rm.w - 0.5), y: clamp(ay, rm.y0 + 0.5, rm.y0 + rm.h - 0.5) };
  }
  function flailThrow(second: boolean) {
    const h = flailHand(), a = flailAim(0.35);
    Object.assign(fl, { mode: 'out', t: 0, x0: h.x, y0: h.y, x: h.x, y: h.y, tx: a.x, ty: a.y, second });
    cue('shoot');
  }
  function flailWhirl() { Object.assign(fl, { mode: 'whirl', t: 0, x0: fl.x, y0: fl.y, ang: 0 }); }
  function flailSlam() { const a = flailAim(0); Object.assign(fl, { mode: 'slam', t: 0, x0: fl.x, y0: fl.y, tx: a.x, ty: a.y }); }
  function flailReel() { Object.assign(fl, { mode: 'back', t: 0, x0: fl.x, y0: fl.y }); }
  function flailTick(dt: number, bike: Readonly<BikeState>) {
    fl.hitCd -= dt; fl.t += dt;
    if (dt > 0) { fl.pvx = clamp(fl.pvx * 0.8 + 0.2 * (P.x - fl.px) / dt, -8, 8); fl.pvy = clamp(fl.pvy * 0.8 + 0.2 * (P.y - fl.py) / dt, -8, 8); }
    fl.px = P.x; fl.py = P.y;
    const h = flailHand(), ease = (k: number) => 1 - (1 - k) * (1 - k);
    let lethal = true;
    switch (fl.mode) {
      case 'hand': fl.x = h.x; fl.y = h.y; lethal = false; break;
      case 'out': {
        const k = Math.min(1, fl.t / FLAIL_OUT);
        fl.x = fl.x0 + (fl.tx - fl.x0) * ease(k); fl.y = fl.y0 + (fl.ty - fl.y0) * ease(k);
        if (fl.t >= FLAIL_OUT + FLAIL_HOLD) flailReel();
        break;
      }
      case 'back': {
        const k = Math.min(1, fl.t / FLAIL_BACK), q = k * k;
        fl.x = fl.x0 + (h.x - fl.x0) * q; fl.y = fl.y0 + (h.y - fl.y0) * q;
        if (k >= 1) { fl.mode = 'hand'; if (bs.phase === 3 && !fl.second && bs.cycle === 'idle') flailThrow(true); }
        break;
      }
      case 'whirl': {
        const r = 1.2 + Math.min(1, fl.t / 1.5) * 1.4;
        fl.ang += dt * (7 + fl.t * 3);
        fl.x = h.x + Math.cos(fl.ang) * r; fl.y = h.y + Math.sin(fl.ang) * r * 0.8;
        if (fl.t < 0.25) { const k = fl.t / 0.25; fl.x = fl.x0 + (fl.x - fl.x0) * k; fl.y = fl.y0 + (fl.y - fl.y0) * k; }
        { const a = flailAim(0); fl.tx = a.x; fl.ty = a.y; }
        break;
      }
      case 'slam': {
        const k = Math.min(1, fl.t / 0.3);
        fl.x = fl.x0 + (fl.tx - fl.x0) * k * k; fl.y = fl.y0 + (fl.ty - fl.y0) * k * k;
        if (k >= 1) {
          const ph = bs.phase;
          fl.mode = 'rest'; fl.t = 0; boss.spin += 0.4;
          ring(fl.x, fl.y, 14 + 4 * ph, 4 + 0.5 * ph, 9, boss.spin);
          addFx({ kind: 'boom', x: fl.x, y: fl.y, life: 0.5, color: '#ff7a2a', r: 2.6 });
          cue('explode'); freeze(0.12);
          if (Math.hypot(P.x - fl.x, P.y - fl.y) < 1.4 + PLAYER_R) hurtPlayer(18 * dmgMul(), bike);
        }
        break;
      }
      case 'rest': lethal = false; break;
    }
    if (lethal && fl.hitCd <= 0 && Math.hypot(P.x - fl.x, P.y - fl.y) < FLAIL_HIT_R + PLAYER_R) { hurtPlayer(12 * dmgMul(), bike); fl.hitCd = 0.7; }
  }

  function bossAct(e: Enemy, dt: number, d: number, ux: number, uy: number) {
    if (bossStunned(bs) && e.state !== 1) return;
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
        case 2: if (d < FLAIL_REACH + 2 && fl.mode === 'hand') { flailThrow(false); e.fireCd2 = 2.4 * pace; } else e.fireCd2 = 0.3; break;
        case 3: if (liveCount(e.room) < 5) { const s = spawnEnemy(rng() < 0.5 ? 'bat' : 'bomber', e.x, e.y + 1.5, e.room); s.summoned = 1; } break;
        case 4: if (liveCount(e.room) < 3 + bs.phase) { const s = spawnEnemy('archer', e.x + (rng() - 0.5) * 3, e.y + 1.5, e.room); s.summoned = 1; } else for (const o of [-0.2, 0.2]) enemyShot(e.x, e.y, a + o, 6, 7); break;
        case 5: for (let k = -3; k <= 3; k++) enemyShot(e.x, e.y, a + k * 0.12, 3.6, 6, 0.2); break;
        case SWEEPER:
          for (let k = -4; k <= 4; k++) enemyShot(e.x, e.y, a + k * 0.2, 3.2, 6, 0.22);
          if (bs.phase >= 2 && liveCount(e.room) < 2 + bs.phase) { const s = spawnEnemy(rng() < 0.5 ? 'chaser' : 'archer', e.x + (rng() - 0.5) * 3, e.y + 1.5, e.room); s.summoned = 1; }
          e.fireCd2 = 2.2 * pace; break;
        default: for (const o of [-0.3, 0, 0.3]) enemyShot(e.x, e.y, a + o, 5, 7, 0.22);
      }
    }
  }

  function descend() {
    flushLootOffer();
    floorsCleared++; totals.floors++; cue('stairs');
    ctx.emit({ type: 'floorCleared', data: { floor, timeS: Math.round(t) } });
    if (planFor(floor).final) { winRun(); return; }
    const hadGrimpeur = isArchetypeUnlocked('grimpeur', unlockProgress());
    floor++;
    bestFloor = Math.max(bestFloor, floor);
    if (!hadGrimpeur && isArchetypeUnlocked('grimpeur', unlockProgress())) {
      toast('NEW HERO UNLOCKED: The Grimpeur (Climber)!', '#ff6e5a');
      addFx({ kind: 'banner', x: P.x, y: P.y, life: 3.5, color: '#ff6e5a', text: 'THE GRIMPEUR UNLOCKED!' });
    }
    P.potions = potionCap();
    buildFloor(); dir = newFloor(false);
    recomputeHp(true);
    const fp = planFor(floor);
    toast(fp.final ? `Floor ${floor} of ${FLOORS}: the Broom Wagon. The Grim Sweeper waits.` : `Floor ${floor} of ${FLOORS}: ${fp.name}. Potions refilled`, fp.final ? '#c77dff' : '#ffd84a');
    persist();
  }

  function buildRunResult(won: boolean, banked: number): RunResult {
    const fc = chosenForksAndCapstones(archetype, skillRanks);
    return {
      won, floor, startFloor, tier: runTier, timeS: Math.round(t - runT0), kills: kills - runKills0, bosses: bossDefeated - runBosses0,
      perks: totalSpentPoints(archetype, skillRanks), banked, level: P.level, weapon: weapon.name,
      archetype: ARCHETYPES[archetype].name, buildTitle: deriveBuildTitle(archetype, skillRanks),
      forks: fc.forks, capstones: fc.capstones, climbs: climbsTotal - runClimbs0,
    };
  }

  function winRun() {
    flushLootOffer();
    const bonus = Math.round(winBonus() * T().coins);
    P.coinsEarned += bonus;
    const banked = P.coinsEarned, timeS = Math.round(t - runT0), before = tierUnlocked;
    wins[runTier]++; descentsWon++;
    tierUnlocked = unlockAfterWin(runTier, tierUnlocked);
    if (startFloor === 1) bestWinS = bestWinS ? Math.min(bestWinS, timeS) : timeS;
    lastRun = buildRunResult(true, banked);
    if (tierUnlocked > before) { lastRun.unlocked = tierOf(tierUnlocked).name; tier = tierUnlocked; }
    deepest = Math.max(deepest, floor); topLevel = Math.max(topLevel, P.level); earnedPrev += banked; lastDeath = undefined;
    ctx.emit({ type: 'descentWon', data: { tier: runTier, startFloor, timeS, archetype, perks: lastRun.perks } });
    bankStart += banked; totals.coins += banked; P.coinsEarned = 0; P.coins = 0;
    bullets.length = 0; hazards.length = 0; navPath = []; curse = null; skillOffer = null; skillOfferDueT = -1; finishSeq = null;
    toast(`Descent complete in ${Math.floor(timeS / 60)}:${String(timeS % 60).padStart(2, '0')}! +${bonus} finish bonus.${lastRun.unlocked ? ` ${lastRun.unlocked} unlocked.` : ''}`, '#ffd84a');
    cue('unique');
    enterCamp();
    persist();
  }

  function die() {
    flushLootOffer();
    deaths++; totals.deaths++; deepest = Math.max(deepest, floor); topLevel = Math.max(topLevel, P.level);
    ctx.emit({ type: 'death', data: { room: current, floor, archetype } });
    const banked = P.coinsEarned; earnedPrev += banked; lastDeath = { floor, banked }; lastRun = buildRunResult(false, banked);
    if (!opts?.floor && floor === startFloor && startFloor > 1) startFloor = stepStart(-1);
    bankStart += P.coinsEarned; totals.coins += P.coinsEarned; P.coinsEarned = 0; P.coins = 0;
    P.hp = 0; P.shield = 0; bullets.length = 0; hazards.length = 0; navPath = []; curse = null; skillOffer = null; skillOfferDueT = -1; finishSeq = null;
    toast(`You fell on floor ${floor}. ${banked} coins banked. Back to camp.`, '#ff5a5a');
    cue('hurt');
    enterCamp(true);
    persist();
  }
  function enterCamp(fromDeath = false) {
    phase = 'camp'; campT = 0; campSel = 0; campLockT = fromDeath && !autopilot ? 2.1 : 0;
    clearCombatGrades();
  }
  const strikeInReach = () => liveInRoom(current).some((e) => Math.hypot(e.x - P.x, e.y - P.y) < effectiveStrikeRadius() + e.r);

  function skillTreeView(): SkillTreeView {
    const branches = SKILL_TREES[archetype];
    const fc = chosenForksAndCapstones(archetype, skillRanks);
    const rb = relicBonusBranches[0];
    const cards = quickPickCards(archetype, skillRanks);
    return {
      unspentSP,
      spentSP: totalSpentPoints(archetype, skillRanks),
      buildTitle: deriveBuildTitle(archetype, skillRanks),
      forks: fc.forks,
      capstones: fc.capstones,
      relicName: rb !== undefined ? ARCHETYPES[archetype].relicName : null,
      relicBranchName: rb !== undefined ? branches[rb].name : null,
      branches: branches.map((b, bi) => ({
        id: b.id, name: b.name, theme: b.theme, color: b.color, points: branchPoints(b, skillRanks),
        nodes: b.nodes.map((n) => ({
          id: n.id, tier: n.tier, fork: n.fork, pair: n.pair, name: n.name, short: n.short, detail: n.detail, cycling: n.cycling,
          rank: getNodeRank(skillRanks, n.id), maxRank: n.maxRank, state: nodeState(archetype, skillRanks, n.id),
          relicBonus: relicBonusBranches.includes(bi) && n.tier <= 2 && getNodeRank(skillRanks, n.id) > 0,
        })),
      })),
      offer: skillOffer ? {
        mode: skillOffer.mode,
        sel: Math.min(skillOffer.sel, Math.max(0, cards.length - 1)),
        focusNodeId: skillOffer.focusNodeId,
        age: skillOffer.age,
        autoS: autopilot ? Math.min(1.5, skillAutoS()) : skillAutoS(),
        manual: skillOffer.manual,
        reason: skillOffer.reason,
        cards: cards.map((c) => ({
          nodeId: c.node.id, branchId: c.branch.id, branchName: c.branch.name, branchColor: c.branch.color,
          tier: c.node.tier, fork: c.node.fork, name: c.node.name, short: c.node.short, detail: c.node.detail, cycling: c.node.cycling,
          rank: c.rank, maxRank: c.node.maxRank, siblingForkName: c.siblingForkName,
        })),
      } : null,
    };
  }

  function campView(): CampView {
    const up = unlockProgress();
    const gp = grimpeurProgress(up);
    const archetypes: CampArchetypeCard[] = ARCHETYPE_ORDER.map((id) => {
      const a = ARCHETYPES[id];
      const unlocked = isArchetypeUnlocked(id, up);
      return {
        id, name: a.name, shortName: a.shortName, subtitle: a.subtitle, jersey: a.jersey, chassis: a.chassis, kit: a.kit,
        color: a.color, workoutTag: a.workoutTag, ergLabel: a.ergLabel, gradeLabel: a.gradeLabel, cadenceSweet: a.cadenceSweet,
        pitch: a.pitch, unlocked, unlockReq: a.unlockReq, unlockPct: unlocked ? 1 : gp.pct,
        branches: SKILL_TREES[id].map((b) => ({ name: b.name, color: b.color })),
        profileErg: a.profileErg, profileGrade: a.profileGrade,
      };
    });
    return {
      bank: Math.round(bankStart), sel: campSel, autoStartS: campAutoS(), autoStartLeft: campAutoS() - campT,
      startFloor, maxStartFloor: mods.maxStartFloor, autoInvest: autoInvestOn, erg,
      selectedArchetype: archetype, archetypes, grimpeur: gp,
      rows: campRows(), bestFloor, runs, lastDeath,
      ...(lastRun ? { lastRun } : {}), floors: FLOORS, tier: tierOf(tier).name, wins: wins.reduce((a, n) => a + n, 0),
    };
  }

  function snapshot(): DungeonSnapshot {
    const sh = bossShield();
    const ev: EnemyView[] = [];
    for (const e of enemies) if (e.alive && (e.kind !== 'boss' || bossStarted)) ev.push({
      id: e.id, kind: e.kind, x: e.x, y: e.y, r: e.r, hp: e.hp, maxHp: e.maxHp, exposed: e.kind === 'boss' && bs.cycle === 'exposed',
      hurt: t - e.hurtT, face: P.x >= e.x ? 1 : -1, slowed: e.slowT > 0, dot: e.dotT > 0,
      tell: clamp(e.kind === 'boss' ? (bs.cycle === 'windup' ? 1 : e.state) : e.kind === 'brute' ? e.state : e.tell, 0, 1),
      variant: e.variant, elite: e.elite, shieldFrac: e.shieldMax > 0 ? e.shield / e.shieldMax : 0,
    });
    const bv: BulletView[] = bullets.map((b) => ({
      x: b.x, y: b.y, r: b.r, friendly: b.friendly, style: b.orb ? 'orb' : b.w ? b.w.base : 'enemy',
      color: b.orb ? '#64d8ff' : b.w ? ELEMENT_COLORS[b.w.element] : '#ff5a5a',
      angle: Math.atan2(b.vy, b.vx), age: b.age, variant: b.w?.variant,
    }));
    const inReach = strikeInReach();
    const arch = ARCHETYPES[archetype];
    const pm = PACE_MODES[paceBias];
    const bladeCount = (weapon.unique === 'orbit' ? 3 : 0) + tm.orbitBlades;
    return {
      t, phase, camp: phase === 'camp' ? campView() : null, world, floor,
      run: { floors: FLOORS, zone: planFor(floor).name, final: planFor(floor).final, tier: T().name, tierIndex: runTier },
      player: {
        x: P.x, y: P.y, r: PLAYER_R, hp: P.hp, maxHp: P.maxHp, shield: P.shield, potions: P.potions, potionCap: potionCap(),
        invuln: P.invuln > 0, onSwamp: P.onSwamp, speedMult: P.speedMult, moving: P.moving, rolling: P.rollT > 0, warded: P.ward > 0, rallied: P.rally > 0, hurt: t - P.hurtT,
        secondWind: swCd.left <= 0 ? 1 : 1 - swCd.left / swCd.total, secondWindFlash: Math.max(0, 1 - (t - swUsedT) / 2.5),
        firedUpLeft: Math.max(0, firedUpUntil - t),
        level: P.level, xp: P.xp, xpNext: xpNext(P.level), coins: P.coins, bank: Math.round(bankStart + P.coinsEarned),
        unspentSP,
        blazingHalo: tm.blazingHalo, turbineShock: tm.turbineShock,
        bulletTime: t < bulletTimeUntil, mountainKing: t < mountainKingUntil,
        caldera: tm.volcanicAscent, phantom: tm.phantomCadence,
      },
      weapon, gear: { ...gear },
      aim: { angle: P.aim },
      archetype: {
        id: arch.id, name: arch.name, shortName: arch.shortName, subtitle: arch.subtitle, color: arch.color,
        chassis: arch.chassis, kit: arch.kit, overlays: tm.overlays, workoutTag: arch.workoutTag, cadenceSweet: arch.cadenceSweet,
      },
      paceBias: { bias: pm.bias, id: pm.id, label: pm.label, shortLabel: pm.shortLabel, color: pm.color, desc: pm.desc },
      skillTree: skillTreeView(),
      pace: { seg: dir.seg, label: dirCfg().targets[dir.seg].label, erg, segT: dir.segT },
      refill: { rate: lastRate, zone: Math.max(1, Math.min(5, ctx.bike().powerZone)) },
      ai: { path: phase === 'run' ? navPath.slice(0, 40) : [], targetId: P.targetId },
      actions: (['strike', 'ward', 'rally', 'potion'] as ActionId[]).map((id) => ({
        id, button: ACTION_BUTTON[id],
        label: id === 'rally' && lootOffer ? (lootOffer.view.defaultChoice === 'equip' ? 'Drop' : 'Equip') : ACTION_LABEL[id],
        ready: id === 'rally' && lootOffer ? 1 : readyFrac(cds[id]),
        usable: (id === 'rally' && !!lootOffer) || ((cds[id].left <= 0 || (id === 'strike' && t < bulletTimeUntil)) && (id === 'strike' ? inReach : id === 'potion' ? P.potions > 0 && P.hp < P.maxHp : true)),
      })),
      enemies: ev, bullets: bv, drops: drops.map(({ item: _i, value: _v, ...d }) => d),
      hazards: hazards.map(({ dmg: _d, ...h }) => h),
      orbit: bladeCount > 0 && phase === 'run' ? orbitBlades(bladeCount, ctx.bike().cadence3s) : [],
      shrines: shrines.map((s) => ({ kind: s.kind, label: SHRINES[s.kind].label, progress: s.progress, leftS: Math.max(0, s.left), state: s.state, x: s.x, y: s.y, room: s.room })),
      curse: curse ? { kind: curse.kind, ...CURSES[curse.kind], left: Math.max(0, curse.left), total: curse.total } satisfies CurseView : null,
      fx: fx.slice(), toasts: toasts.filter((x) => t - x.t0 < 6), cues: cues.slice(),
      room: current, stairsOpen: !boss.alive, frozen: hitT > 0,
      flail: bossStarted && boss.alive && boss.variant === 2 ? { x: fl.x, y: fl.y, mode: fl.mode, t: fl.t, ang: fl.ang, tx: fl.tx, ty: fl.ty } : null,
      boss: bossStarted ? { active: boss.alive, name: BOSS_NAMES[boss.variant], hp: Math.max(0, boss.hp), maxHp: boss.maxHp, phase: bs.phase, cycle: bs.cycle, left: bs.left, fightT: bs.fightT, tide: tideBonus(bs.fightT, bossCfg()), splits: bossCfg().phaseSplits } : null,
      lootOffer: lootOffer ? { ...lootOffer.view, leftS: Math.max(0, lootOffer.leftS) } : null,
      finishSeq: finishSeq ? { ...finishSeq } : null,
      stats: { roomsCleared, kills, deaths, damageDealt, output, fireT: fightT, bossDefeated, floorsCleared, elites: elitesSlain, uniques: uniquesFound, curses: cursesSurvived, climbs: climbsTotal, skillPoints: totalSpentPoints(archetype, skillRanks) },
      hooks: {
        boss: bossStarted && boss.alive, shielded: sh.shielded, swamp: P.onSwamp, seg: dir.seg,
        cadence: dir.seg === 'spinup' ? dirCfg().spinRpm + 6 : Math.round((arch.cadenceSweet[0] + arch.cadenceSweet[1]) / 2),
        powerFtp: phase === 'camp' ? dirCfg().targets.cooldown.erg : sh.shielded && erg ? ergSurge() : dirCfg().targets[dir.seg].erg,
      },
    };
  }

  // Only pre-descent Camp (before any run starts) is a pre-game menu.
  const inMenu = () => phase === 'camp' && sessionRuns === 0;

  function paceZone(): NonNullable<GameHud['targetZone']> {
    const Tseg = dirCfg().targets[dir.seg];
    const pm = PACE_MODES[paceBias];
    const biasTag = paceBias !== 0 ? ` [${pm.shortLabel}]` : '';
    return {
      min: Tseg.zone[0], max: Tseg.zone[1],
      label: `${curse && dir.seg === 'explore' ? 'Cursed: ride it out' : Tseg.label}${biasTag}${erg ? ` · ERG ${Math.round(Tseg.erg * 100)}%` : ''}`,
      ...(Tseg.source ? { source: Tseg.source } : {}),
    };
  }

  function runControls(): ControlHint[] {
    const inReach = strikeInReach();
    return [
      ...(['strike', 'ward', 'rally', 'potion'] as ActionId[]).map((id): ControlHint => {
        if (id === 'rally' && lootOffer) {
          const dropAlt = lootOffer.view.defaultChoice === 'equip';
          return { button: 'y', label: dropAlt ? `Drop +${lootOffer.view.sellCoins}c` : 'Equip loot', shortLabel: dropAlt ? 'Drop' : 'Equip', active: true };
        }
        const usable = id === 'strike' ? inReach : id === 'potion' ? P.potions > 0 && P.hp < P.maxHp : true;
        const ready = cds[id].left <= 0 || (id === 'strike' && t < bulletTimeUntil);
        return {
          button: ACTION_BUTTON[id], label: ACTION_LABEL[id], active: ready && usable,
          cooldown: { fill: readyFrac(cds[id]), ready, tint: effortTint(ctx.bike().powerZone), flourish: effortFlourish(ctx.bike().powerZone) },
        };
      }),
      { button: 'left', label: 'Cool off', active: paceBias > -1 },
      { button: 'right', label: 'Push hard', active: paceBias < 1 },
      { button: 'up', label: unspentSP > 0 ? `Skills (+${unspentSP})` : 'Skill Tree', active: unspentSP > 0 },
      { button: 'paddles', label: 'Zoom in/out: paddles or pinch', shortLabel: 'Zoom ±' },
      { button: 'shiftersL', label: 'Gear' },
      { button: 'shiftersR', label: 'Gear' },
    ];
  }

  function hud(): GameHud {
    if (phase === 'camp') return {
      controls: [{ button: 'dpad', label: 'Choose Hero / Upgrades' }, { button: 'a', label: 'Buy / select', shortLabel: 'Select' }, { button: 'b', label: 'Begin descent', shortLabel: 'Start' }],
      playControls: runControls(),
      touchControls: [],
      gears: !erg, targetZone: { min: 1, max: 2, label: deaths ? 'Cool down' : 'Warm up' },
    };
    if (skillOffer) return {
      controls: skillOffer.mode === 'quick'
        ? [{ button: 'dpad', label: 'Choose upgrade', shortLabel: 'Choose' }, { button: 'a', label: 'Invest SP', shortLabel: 'Invest' }, { button: 'y', label: 'Full Tree' }, { button: 'b', label: 'Bank SP' }]
        : [{ button: 'dpad', label: 'Navigate tree', shortLabel: 'Move' }, { button: 'a', label: 'Invest SP', shortLabel: 'Invest' }, { button: 'y', label: 'Quick-Pick' }, { button: 'b', label: 'Resume' }],
      touchControls: [],
      gears: !erg, targetZone: { min: 1, max: 2, label: 'Level Up · Flat recovery' },
    };
    const sh = bossShield();
    const act = shrines.find((s) => s.state === 'active');
    const sprintW = `${Math.max(5, Math.round(((ctx.bike().sprintFtp ?? 1.2) * (ctx.profile.ftp || 200)) / 5) * 5)} W+`;
    const target: GameHud['targetZone'] = sh.shielded ? { min: 4, max: 5, label: bs.cycle === 'exposed' ? (erg ? 'Exposed! Sprint now' : `Exposed! Sprint ${sprintW}`) : 'Big attack: get ready', source: 'power' }
      : act?.kind === 'fury' ? { min: 3, max: 5, label: 'Shrine: Z3+', source: 'power' }
      : act?.kind === 'sprint' ? { min: 5, max: 5, label: erg ? 'Shrine: sprint!' : `Shrine: sprint ${sprintW}`, source: 'power' }
      : act ? { min: 2, max: 2, label: 'Shrine: hold Z2' }
      : paceZone();
    const arch = ARCHETYPES[archetype];
    return {
      controls: runControls(),
      touchControls: ['left', 'right', 'a', 'b', 'y', 'z'],
      gears: !erg, targetZone: target,
      targetCadence: dir.seg === 'spinup' ? { min: dirCfg().spinRpm, label: 'Spin up!' }
        : act?.kind === 'whirl' ? { min: Math.round(whirlRpm()), label: 'Shrine: spin!' }
        : { min: arch.cadenceSweet[0], max: arch.cadenceSweet[1], label: `${arch.shortName} cadence` },
    };
  }

  function menuActions(): GameMenuAction[] {
    if (phase !== 'run') return [];
    return [{
      id: 'build-tree',
      label: unspentSP > 0 ? `Build & Skill Tree (${unspentSP} SP ready)` : `Inspect Build (${deriveBuildTitle(archetype, skillRanks)})`,
      action: { type: 'openSkillTree' },
    }];
  }

  const api: GameSim & { navStats?: () => Record<string, number> } = {
    update, hud, inMenu, menuActions, snapshot, isOver: () => false,
    receive(a: unknown) {
      const act = a as { type?: string; row?: number; id?: string; i?: number; mode?: 'quick' | 'full'; nodeId?: string; confirm?: boolean; bias?: number; choice?: string };
      if (act?.type === 'lootChoice' && lootOffer && (act.choice === 'equip' || act.choice === 'drop')) { lootTap = act.choice; return; }
      if (act?.type === 'action' && phase === 'run' && typeof act.id === 'string' && act.id in ACTION_BUTTON && tapped.length < 4) tapped.push(act.id as ActionId);
      if (act?.type === 'openSkillTree' && phase === 'run') pendingActions.push({ type: 'openSkillTree' });
      if (act?.type === 'paceBias' && phase === 'run' && (act.bias === -1 || act.bias === 0 || act.bias === 1)) pendingActions.push({ type: 'paceBias', bias: act.bias });
      if (act?.type === 'skillCard' && skillOffer && typeof act.i === 'number') pendingActions.push({ type: 'skillCard', i: act.i });
      if (act?.type === 'skillPick' && skillOffer && typeof act.nodeId === 'string') pendingActions.push({ type: 'skillPick', nodeId: act.nodeId, confirm: !!act.confirm });
      if (act?.type === 'skillMode' && skillOffer && (act.mode === 'quick' || act.mode === 'full')) pendingActions.push({ type: 'skillMode', mode: act.mode });
      if (act?.type === 'skillClose' && skillOffer) pendingActions.push({ type: 'skillClose' });
      if (act?.type === 'selectArchetype' && phase === 'camp' && typeof act.id === 'string' && act.id in ARCHETYPES) pendingActions.push({ type: 'selectArchetype', id: act.id as ArchetypeId });
      if (act?.type === 'campRow' && typeof act.row === 'number' && pendingActions.length < 8) pendingActions.push({ type: 'campRow', row: act.row });
    },
    summary: () => ({
      'Deepest floor': Math.max(deepest, floor), 'Hero level': Math.max(topLevel, P.level), 'Rooms cleared': roomsCleared, Kills: kills, 'Elites slain': elitesSlain,
      'Bosses slain': bossDefeated, Deaths: deaths, 'Coins earned': Math.round(earnedPrev + P.coinsEarned), 'Coins banked': Math.round(bankStart + P.coinsEarned),
      'Descents won': descentsWon, Category: tierOf(phase === 'run' ? runTier : tier).name,
      'Best find': phase === 'run' ? bestFind.name : '-', 'Uniques found': uniquesFound, 'Curses survived': cursesSurvived, 'Final weapon': weapon.name,
      'Second Winds': secondWinds, Archetype: ARCHETYPES[archetype].name, Build: deriveBuildTitle(archetype, skillRanks), 'Skill Points': totalSpentPoints(archetype, skillRanks),
    }),
    dispose() { if (phase === 'run') persist(); ctx.resistance.clearAll(); ctx.resistance.useVirtualGears(false); },
  };
  api.navStats = () => ({ ...fstat, fallbacks: stuckStats });
  return api;
}
