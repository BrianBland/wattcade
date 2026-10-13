// Dynamo Defense sim: pure logic, deterministic (ctx.rng + fixed dt only).
// Your pedalling is the base's dynamo: crank revs feed the Gatling, watts feed the Flame and the towers,
// sustained threshold power charges the Railgun, sprints trigger Overdrive and Power Surges fire an EMP.
import type { Button, ControlHint, GameContext, GameHud, GameSim, InputState, Seconds } from '../../../contracts';
import {
  AIM_LIMIT, BASE_R, BASE_X, BASE_Y, ELEMENTS, ELEMENT_WEAPON, KINDS, LANE_NAMES, LEVEL_DMG, LEVEL_RANGE, PADS,
  TOWERS, TOWER_KINDS, TOWER_MAX_LEVEL, WEAPON_ELEMENT, WEAPON_NAME, angleTo, distTo, laneAt, laneLength, towerBuildCost, towerUpgradeCost,
  type Element, type Kind, type TowerKind, type Weapon,
} from './defs';
import { UPGRADES, autoInvest, lvl, metaMods, partsForWave, upgradeCost, type Levels, type MetaMods } from './meta';
import { nextBrood, planWave, type Spawn, type WavePlan } from './waves';
import type { Banner, BroodInfo, BroodView, EnemyView, Fx, GarageRow, GarageView, ShellView, SpinView, SurgeView, TdSnapshot, TowerView, WorkshopRow, WorkshopView } from './types';

export * from './defs';
export type { TdSnapshot } from './types';

export interface TdOpts {
  autopilot?: boolean;
  /** Go straight into a run (tests); the garage is also skipped on a rider's first run and under autopilot. */
  skipGarage?: boolean;
  /** Override the `cores` tunable (lives). */
  cores?: number;
}
export interface TdSave {
  v: 2; bestWave: number; bank: number; upgrades: Levels; runs: number; autoInvest: boolean;
  totals: { waves: number; kills: number; bosses: number; towers: number; surges: number };
}
export function readSave(raw: unknown): TdSave {
  const s = (raw ?? {}) as Partial<TdSave>;
  return {
    v: 2, bestWave: s.bestWave ?? 0, bank: s.bank ?? 0, upgrades: { ...(s.upgrades ?? {}) }, runs: s.runs ?? 0,
    autoInvest: s.autoInvest ?? false,
    totals: { waves: 0, kills: 0, bosses: 0, towers: 0, surges: 0, ...(s.totals ?? {}) },
  };
}

interface Enemy {
  id: number; kind: Kind; lane: number; d: number; len: number; off: number; phase: number;
  x: number; y: number; angle: number; dist: number;
  hp: number; maxHp: number; speed: number; dmg: number; dead: boolean; hurt: number;
  spawnT: number; escorts: number; charging: boolean;
}
interface Tower { pad: number; kind: TowerKind; level: number; cd: number; angle: number; firedAt: number }
interface Shell { x0: number; y0: number; x1: number; y1: number; t: number; flight: number; dmg: number; r: number }

const GARAGE_AUTOSTART_S = 30;
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
  const gatlingDmg = T.num('gatlingDamage', 6, 0.5, 20, 0.5);
  const gatlingGrade = T.num('gatlingGradePct', 1, 0, 6, 0.5, 'sim-mode grade while Gatling selected');
  const flameLevel = T.num('flameLevelPct', 35, 0, 100, 1, 'resistance level while Flame selected');
  const flameDpw = T.num('flameDpsPerWatt', 0.3, 0.02, 1, 0.01, 'flame dps per watt (power3s)');
  const flameRange = T.num('flameRange', 45, 10, 90, 1);
  const flameHalf = T.num('flameHalfAngle', 0.3, 0.1, 1, 0.05);
  const railFtp = T.num('railFtpFraction', 0.95, 0.5, 1.3, 0.01, 'ERG target while Rail selected');
  const railMinFtp = T.num('railMinFtp', 0.75, 0.3, 1.2, 0.01, 'ftpFraction needed to charge rail');
  const railPeriod = T.num('railChargeS', 20, 3, 120, 1, 'seconds per rail charge at 0.95 FTP');
  const railMax = T.num('railMaxCharges', 3, 1, 8, 1);
  const railDmg = T.num('railDamage', 110, 10, 1000, 5);
  const railWidth = T.num('railBeamWidth', 0.1, 0.02, 0.5, 0.01);
  const railDumpHold = T.num('railDumpHoldS', 0.5, 0.1, 2, 0.1);
  const railLaserDps = T.num('railLaserDps', 12, 0, 100, 1, 'targeting laser dps while Rail is selected (x ftpFraction / 0.95, max x1.5)');
  const swapS = T.num('swapS', 1.5, 0.1, 5, 0.1, 'seconds to mount the next brood\'s weapon');
  const aimRate = T.num('aimTurnRate', 1.2, 0.3, 6, 0.1, 'rad/s at full paddle');
  const autoAimDelay = T.num('autoAimIdleS', 1.5, 0.2, 5, 0.1);
  const goodMult = T.num('goodMult', 1.5, 1, 3, 0.1);
  const badMult = T.num('badMult', 0.25, 0, 1, 0.05);
  // base, waves
  const baseHpMax = T.num('baseHp', 100, 10, 1000, 5);
  const coresT = T.num('cores', 3, 0, 9, 1, 'reactor cores (lives): 0 = unlimited, 1 = one base');
  const coreGrace = T.num('coreGraceS', 6, 0, 30, 1, 'seconds without spawns after a core is lost');
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
  const broodCover = T.num('broodCoverWaves', 4, 0, 8, 1, 'all three brood colours in every N waves (< 3 = off)');
  const bossShieldS = T.num('bossShieldCycleS', 7, 2, 30, 1);
  const clearHeal = T.num('earlyClearHeal', 14, 0, 100, 1, 'base HP restored when a wave is cleared before its timeout');
  // dynamo: towers, overdrive, surges, economy
  const towerNominal = T.num('towerNominalFtp', 0.65, 0.2, 1.5, 0.05, 'ftpFraction at which towers fire at their rated speed');
  const towerMaxBoost = T.num('towerMaxBoost', 1.6, 1, 3, 0.1, 'cap on tower speed from extra watts');
  const overdriveMult = T.num('overdriveMult', 1.5, 1, 3, 0.1, 'damage / tower speed while sprinting');
  const surgeEvery = T.num('surgeEveryWaves', 3, 1, 20, 1, 'a Power Surge challenge every N waves');
  const surgeNeed = T.num('surgeNeedS', 15, 3, 120, 1, 'seconds at the surge zone needed');
  const surgeWindow = T.num('surgeWindowS', 45, 10, 180, 5);
  const surgeZone = T.num('surgeZone', 4, 2, 5, 1, 'power zone a surge asks for (short effort: judged on power)');
  const spinEvery = T.num('spinEveryWaves', 3, 1, 20, 1, 'a Spin-up cadence drill every N waves (from wave 4)');
  const spinRpm = T.num('spinRpm', 95, 60, 140, 1, 'Spin-up cadence floor (rpm)');
  const spinNeed = T.num('spinNeedS', 15, 3, 120, 1, 'seconds at the spin-up cadence needed');
  const spinWindow = T.num('spinWindowS', 40, 10, 180, 5);
  const overclockS = T.num('overclockS', 30, 5, 120, 5, 'Gatling Overclock (double fire rate) after a Spin-up');
  const empDmg = T.num('empDamage', 90, 0, 1000, 5, 'EMP damage to every enemy when a surge is won');
  const startScrapT = T.num('startScrap', 60, 0, 1000, 10);
  const scrapScale = T.num('scrapMult', 1, 0.2, 5, 0.1);
  const partsScale = T.num('partsMult', 1, 0.2, 5, 0.1, 'garage parts earned multiplier');

  const save = readSave(ctx.load<unknown>());
  const autopilot = !!opts?.autopilot;
  const levels = save.upgrades;
  let bank = save.bank;
  let mods: MetaMods = metaMods(levels, save.bestWave);
  let autoInvestOn = save.autoInvest;
  let fromWave = mods.maxStartWave;

  let phase: 'garage' | 'run' = 'garage';
  let started = false;
  let garageSel = 0, garageT = 0;
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
  let aim = 0, autoAim = true, lane = 1, targetId = 0;
  let baseMaxHp = baseHpMax(), baseHp = baseMaxHp, baseHurt = 99;
  const coresMax = Math.round(opts?.cores ?? coresT());
  let cores = coresMax;
  let wave = 1, waveElapsed = 0, wavesSurvived = 0, lull = 0, grace = 0;
  let plan: WavePlan, nextPlan: WavePlan;
  let schedule: Spawn[] = [];
  let miniTimer = 2;
  let revAcc = 0, lastRevs = 0;
  let railCharges = 0, railProgress = 0, railFired = 0, railCharging = false;
  let zHold = 0, zDown = false, zDumped = false;
  let flaming = false, flamePower = 0, grid = 0, overdrive = false, laserId = 0;
  let surge: SurgeView | null = null, surgeAcc = 0;
  let spin: SpinView | null = null, overclock = 0;
  let scrap = 0, partsRun = 0;
  let workshop: { pad: number; row: number; idle: number } | null = null;
  let over = false, autoBuildT = 0;
  const broods: Element[] = [];
  const pending: Array<{ type: string; [k: string]: unknown }> = [];
  const kills: Record<string, number> = { blue: 0, red: 0, purple: 0, gold: 0 };
  const weaponSeconds: Record<Weapon, number> = { gatling: 0, flame: 0, rail: 0 };
  const stats = { towersBuilt: 0, towerUpgrades: 0, scrapEarned: 0, surgesWon: 0, surgesFailed: 0, spinsWon: 0, spinsFailed: 0, overclockS: 0, coresLost: 0, bosses: 0, overdriveS: 0, empKills: 0, heavyKills: 0, towerKills: 0 };

  // ---------- helpers ----------
  function cue(name: string) { cues.push({ name, id: ++cueId }); if (cues.length > 40) cues.shift(); }
  function addFx(f: NewFx) {
    fx.push({ ...f, id: ++fxId, t0: t } as Fx);
    if (fx.length > 160) fx.splice(0, fx.length - 160);
  }
  function say(text: string, sub = '', color = '#ffffff', big = false) { banner = { text, sub, color, t0: t, big }; }
  /** The weapon's trainer setting, eased from the lull's recovery value early in the lull to full over the last `rampS`. */
  function trainerSync() {
    const ramp = rampS();
    const k = phase !== 'run' ? 0 : lull <= 0 ? 1 : ramp <= 0 || lull >= ramp ? 0 : 1 - lull / ramp;
    const mix = (a: number, b: number) => a + (b - a) * k;
    if (phase !== 'run' || weapon === 'gatling') ctx.resistance.set({ id: 'weapon', mode: 'sim', gradePct: mix(lullGrade(), gatlingGrade()) });
    else if (weapon === 'flame') ctx.resistance.set({ id: 'weapon', mode: 'resistance', levelPct: mix(lullLevel(), flameLevel()) });
    else ctx.resistance.set({ id: 'weapon', mode: 'erg', ftpFraction: mix(lullFtp(), railFtp()) });
  }
  trainerSync();
  const railCap = () => railMax() + mods.railExtra;
  const towerCostMult = () => mods.towerCostMult;
  const repairCost = () => 30 + wave * 3;
  const gainScrap = (n: number) => { const v = Math.max(0, Math.round(n * mods.scrapMult * scrapScale())); scrap += v; stats.scrapEarned += v; return v; };

  const elementOf = (e: Enemy): Element => {
    if (e.kind === 'boss') return ELEMENTS[Math.floor((t + e.phase) / bossShieldS()) % 3];
    if (e.kind === 'prism') return ELEMENTS[Math.floor((t + e.phase) / 4) % 3];
    return KINDS[e.kind].color as Element;
  };
  const shiftIn = (e: Enemy): number => {
    const p = e.kind === 'boss' ? bossShieldS() : e.kind === 'prism' ? 4 : 0;
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
      hp, maxHp: hp, speed: k.speed * Math.min(1.5, 1 + 0.012 * w1), dmg: k.dmg, dead: false, hurt: 0,
      spawnT: 5, escorts: 0, charging: false,
    };
    place(e);
    spawned.push(e);
    if (kind === 'boss') { say(`${k.name} incoming`, `Wave ${wave} boss · ${LANE_NAMES[laneIdx]} lane · shield shifts color`, '#ffd24a', true); cue('bossStart'); }
  }

  function hit(e: Enemy, base: number, el: Element | null, src: 'player' | 'tower' | 'emp' = 'player') {
    if (e.dead) return;
    const mult = el == null ? 1 : elementOf(e) === el ? goodMult() : badMult();
    e.hp -= base * mult;
    e.hurt = 0.12;
    if (e.hp <= 0) kill(e, src);
  }

  function kill(e: Enemy, src: 'player' | 'tower' | 'emp' | 'core') {
    e.dead = true;
    const def = KINDS[e.kind];
    const key = e.kind === 'boss' ? 'gold' : elementOf(e);
    addFx({ kind: 'death', life: def.heavy ? 0.7 : 0.4, x: e.x, y: e.y, color: e.kind === 'boss' ? 'gold' : key as Element, big: def.heavy });
    if (src === 'core') return; // swept away by a core blast: no credit
    kills[key]++;
    if (src === 'tower') stats.towerKills++;
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
      const p = Math.round((30 + wave * 2) * partsScale()); partsRun += p; bank += p;
      say(`${def.name} destroyed!`, `+${got} scrap · +${p} parts`, '#ffd24a', true);
      ctx.emit({ type: 'bossKilled', data: { wave } });
    } else if (def.heavy) ctx.emit({ type: 'enemyKilled', data: { element: key, wave } });
  }
  function spawnAt(kind: Kind, from: Enemy, dOff: number) {
    spawn(kind, from.lane, Math.max(0, from.d + dOff));
  }

  // ---------- waves ----------
  function planFor(w: number): WavePlan {
    const brood = nextBrood(broods, ctx.rng, { maxRun: broodMaxRun(), coverWaves: broodCover() });
    broods.push(brood);
    return planWave(w, ctx.rng, { spawnWindowS: spawnWindow(), countScale: countScale(), brood, broodShare: broodShare() });
  }
  /** Plans wave `wave` and opens its lull: the brood card counts down while the next weapon mounts and its trainer setting ramps in. */
  function startWave(fresh: boolean) {
    plan = fresh ? planFor(wave) : nextPlan;
    nextPlan = planFor(wave + 1);
    waveElapsed = 0;
    schedule = plan.spawns.map((s) => ({ ...s }));
    lull = lullS();
    const b = broodInfo(plan);
    selectWeapon(b.weapon);
    ctx.emit({ type: 'broodAnnounced', data: { wave, color: b.color, weapon: b.weapon, mode: b.mode } });
    if (lull <= 0) beginWave();
  }
  /** The lull is over: spawns start. */
  function beginWave() {
    ctx.emit({ type: 'waveStart', data: { wave } });
    if (!plan.boss) say(`Wave ${wave}`, `Heaviest push: ${LANE_NAMES[plan.mainLane]} lane`, '#cfe3ff');
    cue('waveStart');
    if (wave >= 3 && (wave - 3) % Math.round(surgeEvery()) === 0) {
      surge = { state: 'active', progress: 0, needS: surgeNeed(), leftS: surgeWindow(), zone: Math.round(surgeZone()), t0: t };
      surgeAcc = 0;
      cue('surge');
      ctx.emit({ type: 'surgeStart', data: { wave } });
    } else if (wave >= 4 && (wave - 4) % Math.round(spinEvery()) === 0) {
      // a cadence drill: leg speed, not watts (the Gatling fires per crank rev)
      spin = { state: 'active', held: 0, needS: spinNeed(), leftS: spinWindow(), rpm: Math.round(spinRpm()), t0: t };
      cue('spin');
      ctx.emit({ type: 'spinStart', data: { wave } });
    }
  }

  function clearWave(early: boolean) {
    wavesSurvived++;
    save.totals.waves++;
    const p = Math.round(partsForWave(wave) * partsScale()); partsRun += p; bank += p;
    const bonus = gainScrap(10 + wave * 2 + (early ? 10 : 0));
    if (early) baseHp = Math.min(baseMaxHp, baseHp + clearHeal());
    ctx.emit({ type: 'waveCleared', data: { wave } });
    say(`Wave ${wave} cleared`, `+${bonus} scrap · +${p} parts${early ? ` · base +${clearHeal()} HP` : ''}`, '#7dffb0');
    cue('waveClear');
    wave++;
    persist();
    startWave(false);
  }

  function loseCore() {
    for (const e of enemies) if (!e.dead) kill(e, 'core');
    for (const e of spawned) if (!e.dead) kill(e, 'core');
    shells = [];
    addFx({ kind: 'emp', life: 1.2 });
    cores--; stats.coresLost++;
    baseHp = baseMaxHp; grace = coreGrace();
    ctx.emit({ type: 'coreLost', data: { wave, coresLeft: cores } });
    say('Reactor core lost!', coresMax > 0 ? `${cores} core${cores === 1 ? '' : 's'} left · base rebuilt` : 'Base rebuilt', '#ff6a5a', true);
    cue('coreLost');
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
    if (w === weapon || over) return;
    weapon = w; swapTotal = swapLeft = swapS() * mods.swapMult; revAcc = 0;
    cue('swap');
    ctx.emit({ type: 'weaponSwitched', data: { weapon: w } });
  }
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

  function pickAutoTarget(w: Weapon, laneSel: number): Enemy | null {
    const el = WEAPON_ELEMENT[w];
    const reach = w === 'flame' ? flameRange() * 1.4 : 999;
    const pick = (f: (e: Enemy) => boolean) => {
      let best: Enemy | null = null;
      for (const e of enemies) if (!e.dead && e.dist < 96 && Math.abs(e.angle) <= AIM_LIMIT && f(e) && (!best || e.dist < best.dist)) best = e;
      return best;
    };
    const inLane = (e: Enemy) => laneSel < 0 || e.lane === laneSel;
    return pick((e) => inLane(e) && elementOf(e) === el && e.dist <= reach)
      ?? pick((e) => elementOf(e) === el && e.dist <= reach)
      ?? pick(inLane) ?? pick(() => true);
  }

  // ---------- towers ----------
  function inRange(tw: Tower, e: Enemy) {
    const p = PADS[tw.pad], r = TOWERS[tw.kind].range * LEVEL_RANGE[tw.level - 1];
    return Math.hypot(e.x - p.x, e.y - p.y) <= r + radiusOf(e);
  }
  function updateTowers(dt: number) {
    const rate = grid * odMult();
    for (const tw of towers) {
      if (!tw) continue;
      const def = TOWERS[tw.kind], p = PADS[tw.pad], dmg = def.dmg * LEVEL_DMG[tw.level - 1];
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
        for (let i = 0; i < 3 + (tw.level - 1) && cur; i++) {
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
        const ahead = laneAt(target.lane, target.d + target.speed * flight * (target.charging ? 2.6 : 1));
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
    if (pad === 6) return [{ kind: 'repair', label: 'Repair base', desc: `+${REPAIR_HP} HP`, cost: repairCost(), affordable: scrap >= repairCost() && baseHp < baseMaxHp }];
    const tw = towers[pad];
    if (!tw) return TOWER_KINDS.map((k) => {
      const c = towerBuildCost(k, towerCostMult());
      return { kind: 'build', tower: k, label: TOWERS[k].name, desc: TOWERS[k].desc, cost: c, affordable: scrap >= c };
    });
    const rows: WorkshopRow[] = [];
    if (tw.level < TOWER_MAX_LEVEL) {
      const c = towerUpgradeCost(tw.kind, tw.level, towerCostMult());
      rows.push({ kind: 'upgrade', tower: tw.kind, label: `Upgrade to Lv ${tw.level + 1}`, desc: `x${(LEVEL_DMG[tw.level] / LEVEL_DMG[tw.level - 1]).toFixed(1)} damage, more range`, cost: c, affordable: scrap >= c });
    }
    rows.push({ kind: 'sell', tower: tw.kind, label: 'Scrap it', desc: 'Refund half', cost: 0, affordable: true });
    return rows;
  }
  /** Lane whose next push is heaviest for this colour → best tower for an empty pad. */
  function suggestTower(pad: number): number {
    const lanes = [plan.lanes[PADS[pad].lane], nextPlan.lanes[PADS[pad].lane]];
    const want = (el: Element) => lanes.reduce((s, l) => s + l[el] + l.prism * 0.3 + l.gold, 0) - towers.filter((x) => x && TOWERS[x.kind].element === el).length * 1.5;
    let best = 0;
    TOWER_KINDS.forEach((k, i) => { if (want(TOWERS[k].element) > want(TOWERS[TOWER_KINDS[best]].element)) best = i; });
    return best;
  }
  function openWorkshop(pad?: number) {
    let p = pad ?? -1;
    if (p < 0) p = PAD_ORDER.find((i) => i < 6 && !towers[i] && (lane < 0 || PADS[i].lane === lane)) ?? PAD_ORDER.find((i) => i < 6 && !towers[i]) ?? PAD_ORDER[0];
    workshop = { pad: p, row: p < 6 && !towers[p] ? suggestTower(p) : 0, idle: 0 };
    cue('uiOpen');
  }
  function workshopAct(row?: number) {
    if (!workshop) return;
    const rows = workshopRows(workshop.pad);
    if (row != null) workshop.row = clamp(row, 0, rows.length - 1);
    const r = rows[workshop.row]; if (!r) return;
    if (r.kind === 'build') build(workshop.pad, r.tower!);
    else if (r.kind === 'upgrade') upgrade(workshop.pad);
    else if (r.kind === 'sell') sell(workshop.pad);
    else repair();
    workshop.row = clamp(workshop.row, 0, workshopRows(workshop.pad).length - 1);
  }

  function autoBuild() {
    if (baseHp < baseMaxHp * 0.4 && scrap >= repairCost()) { repair(); return; }
    const empty = PAD_ORDER.filter((i) => i < 6 && !towers[i]);
    if (empty.length) {
      // nearest-to-base pads in the heaviest lanes first
      empty.sort((a, b) => (PADS[b].near ? 1 : 0) - (PADS[a].near ? 1 : 0) || (PADS[b].lane === nextPlan.mainLane ? 1 : 0) - (PADS[a].lane === nextPlan.mainLane ? 1 : 0));
      const pad = empty[0], kind = TOWER_KINDS[suggestTower(pad)];
      if (scrap >= towerBuildCost(kind, towerCostMult())) build(pad, kind);
      return;
    }
    let best = -1, bestCost = Infinity;
    towers.forEach((tw, i) => {
      if (!tw || tw.level >= TOWER_MAX_LEVEL) return;
      const c = towerUpgradeCost(tw.kind, tw.level, towerCostMult());
      if (c < bestCost) { best = i; bestCost = c; }
    });
    if (best >= 0 && scrap >= bestCost) upgrade(best);
    else if (best < 0 && baseHp < baseMaxHp * 0.8 && scrap >= repairCost()) repair();
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
    if (ctx.bike().cadence3s > 30) garageT += dt;
    if (garageT >= GARAGE_AUTOSTART_S) startRun();
  }
  function startRun() {
    if (autoInvestOn || autopilot) { const r = autoInvest(bank, levels); bank = r.bank; mods = metaMods(levels, save.bestWave); }
    if (autopilot) fromWave = mods.maxStartWave;
    phase = 'run';
    save.runs++;
    baseMaxHp = baseHpMax() * mods.hpMult; baseHp = baseMaxHp;
    wave = clamp(fromWave, 1, mods.maxStartWave);
    scrap = Math.round(startScrapT() + mods.startScrap + (wave - 1) * 35);
    lastRevs = ctx.bike().crankRevs;
    persist();
    cue('go');
    startWave(true);
  }

  // ---------- run ----------
  function runUpdate(dt: number, inp: Readonly<InputState>) {
    const bike = ctx.bike();
    const p = (b: Button) => inp.pressed.has(b);

    // UI actions from the renderer (taps)
    for (const a of pending.splice(0)) {
      if (a.type === 'pad' && typeof a.pad === 'number' && a.pad >= -1 && a.pad <= 6) {
        if (workshop && (workshop.pad === a.pad || a.pad === -1)) workshop = null; else openWorkshop(a.pad < 0 ? undefined : a.pad);
      }
      else if (a.type === 'row' && workshop && typeof a.row === 'number') { workshop.idle = 0; workshopAct(a.row); }
      else if (a.type === 'close') workshop = null;
      else if (a.type === 'rail') fireRail(1);
    }

    // --- buttons
    if (autopilot) {
      if (railCharges >= railCap() && enemies.some((e) => !e.dead && e.dist < 75)) fireRail(railCharges);
      else if (weapon === 'rail' && swapLeft <= 0 && railCharges > 0) {
        const tg = nearestInCone(aim, 0.05);
        if (tg && tg.dist < 70 && elementOf(tg) === 'purple' && KINDS[tg.kind].heavy) fireRail(1);
      }
      autoBuildT += dt;
      if (autoBuildT >= 1.5) { autoBuildT = 0; autoBuild(); }
    } else if (workshop) {
      const rows = workshopRows(workshop.pad);
      workshop.idle += dt;
      if (inp.pressed.size) workshop.idle = 0;
      if (p('left') || p('right')) {
        const i = PAD_ORDER.indexOf(workshop.pad), n = PAD_ORDER.length;
        workshop.pad = PAD_ORDER[(i + (p('left') ? n - 1 : 1)) % n];
        workshop.row = workshop.pad < 6 && !towers[workshop.pad] ? suggestTower(workshop.pad) : 0;
        cue('select');
      }
      if (p('up')) { workshop.row = (workshop.row + rows.length - 1) % rows.length; cue('select'); }
      if (p('down')) { workshop.row = (workshop.row + 1) % rows.length; cue('select'); }
      if (p('a')) workshopAct();
      if (p('b') || workshop.idle >= WORKSHOP_IDLE_S) { workshop = null; cue('uiClose'); }
    } else {
      if (p('left')) { lane = lane < 0 ? 0 : Math.max(0, lane - 1); cue('select'); }
      if (p('right')) { lane = lane < 0 ? 2 : Math.min(2, lane + 1); cue('select'); }
      if (p('up')) { lane = lane < 0 ? 1 : -1; cue('select'); }
      if (p('down')) openWorkshop();
    }
    if (!autopilot) { // Z fires the rail from any weapon, even with the workshop open
      if (p('z')) { zDown = true; zHold = 0; zDumped = false; }
      if (zDown && inp.held.has('z')) {
        zHold += dt;
        if (!zDumped && zHold >= railDumpHold()) { zDumped = true; fireRail(railCharges); }
      }
      if (zDown && (inp.released.has('z') || !inp.held.has('z'))) {
        if (!zDumped) fireRail(1);
        zDown = false; zHold = 0;
      }
    }
    if (swapLeft > 0) swapLeft = Math.max(0, swapLeft - dt);
    weaponSeconds[weapon] += dt;

    // --- dynamo: grid power, overdrive, rail charge
    grid = clamp(bike.ftpFraction / towerNominal(), 0, towerMaxBoost());
    if (bike.cadence3s < 15) grid = 0;
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

    // --- surge challenge
    if (surge && surge.state === 'active') {
      surge.leftS -= dt;
      // power zone, not effortZone: HR lags far too much for a short surge window
      if (Math.min(5, bike.powerZone) >= surge.zone) surgeAcc += dt;
      surge.progress = Math.min(1, surgeAcc / surge.needS);
      if (surgeAcc >= surge.needS) {
        surge.state = 'won'; surge.t0 = t; stats.surgesWon++; save.totals.surges++;
        addFx({ kind: 'emp', life: 1.2 });
        for (const e of enemies) if (!e.dead) hit(e, KINDS[e.kind].heavy ? empDmg() : 9999, null, 'emp');
        const b = gainScrap(20 + wave * 2);
        if (railCharges < railCap()) railCharges++;
        say('Power surge!', `EMP blast · +${b} scrap · +1 rail charge`, '#7df9ff', true);
        cue('emp');
        ctx.emit({ type: 'surgeWon', data: { wave } });
      } else if (surge.leftS <= 0) {
        surge.state = 'failed'; surge.t0 = t; stats.surgesFailed++;
        ctx.emit({ type: 'surgeFailed', data: { wave } });
      }
    } else if (surge && t - surge.t0 > 4) surge = null;

    // --- spin-up drill -> Gatling Overclock
    if (spin && spin.state === 'active') {
      spin.leftS -= dt;
      if (bike.cadence3s >= spin.rpm) spin.held += dt;
      if (spin.held >= spin.needS) {
        spin.state = 'won'; spin.t0 = t; stats.spinsWon++;
        overclock = overclockS();
        const b = gainScrap(10 + wave);
        say('Overclocked!', `Gatling fires twice as fast for ${Math.round(overclockS())} s · +${b} scrap`, '#8fd8ff', true);
        cue('overclock');
        ctx.emit({ type: 'spinWon', data: { wave } });
      } else if (spin.leftS <= 0) {
        spin.state = 'failed'; spin.t0 = t; stats.spinsFailed++;
        ctx.emit({ type: 'spinFailed', data: { wave } });
      }
    } else if (spin && t - spin.t0 > 4) spin = null;
    if (overclock > 0) { overclock = Math.max(0, overclock - dt); stats.overclockS += dt; }

    // --- aim
    const mode = ctx.profile.settings?.aimMode;
    const pad = Math.max(-1, Math.min(1, inp.paddleR - inp.paddleL));
    const paddlesActive = !autopilot && mode !== 'buttons' && inp.paddleIdleS <= autoAimDelay();
    autoAim = !paddlesActive;
    if (paddlesActive && mode === 'axes') aim = clamp(Math.atan2(inp.paddleL, Math.max(inp.paddleR, 0.2)), -AIM_LIMIT, AIM_LIMIT);
    else if (paddlesActive) aim = clamp(aim + pad * aimRate() * dt, -AIM_LIMIT, AIM_LIMIT);
    else {
      const tgt = pickAutoTarget(weapon, autopilot ? -1 : lane);
      targetId = tgt?.id ?? 0;
      if (tgt) {
        const d = tgt.angle - aim, step = 6 * dt;
        aim = Math.abs(d) <= step ? tgt.angle : aim + Math.sign(d) * step;
      }
    }
    if (paddlesActive) targetId = 0;

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
      e.d += e.speed * (e.charging ? 2.6 : 1) * dt;
      place(e);
      if (e.kind === 'carrier') { e.spawnT -= dt; if (e.spawnT <= 0) { e.spawnT = 6; spawnAt('mini', e, 1.5); spawnAt('mini', e, -1.5); } }
      if (e.kind === 'boss') {
        const f = e.hp / e.maxHp, want = f < 0.33 ? 2 : f < 0.66 ? 1 : 0;
        while (e.escorts < want) { e.escorts++; for (let i = 0; i < 4; i++) spawnAt('mini', e, -2 - i * 2); cue('alarm'); }
      }
      if (e.d >= e.len - BASE_R) {
        e.dead = true;
        baseHp -= e.dmg; baseHurt = 0;
        addFx({ kind: 'baseHit', life: 0.5, dmg: e.dmg });
        cue(e.dmg >= 5 ? 'baseHitHeavy' : 'baseHit');
        ctx.emit({ type: 'baseHit', data: { dmg: e.dmg, kind: e.kind } });
      }
    }
    baseHurt += dt;
    if (spawned.length) { enemies.push(...spawned.filter((e) => !e.dead)); spawned.length = 0; }
    enemies = enemies.filter((e) => !e.dead);

    // --- spawning
    if (grace > 0) grace = Math.max(0, grace - dt);
    else if (lull > 0) { lull = Math.max(0, lull - dt); if (lull === 0) beginWave(); }
    else {
      waveElapsed += dt;
      miniTimer -= dt;
      if (miniTimer <= 0) {
        spawn('mini', Math.floor(ctx.rng() * 3) % 3);
        miniTimer = (miniInterval() / (1 + 0.04 * (wave - 1))) * (0.7 + ctx.rng() * 0.6);
      }
      while (schedule.length && schedule[0].at <= waveElapsed) { const s = schedule.shift()!; spawn(s.kind, s.lane); }
    }
    if (spawned.length) { enemies.push(...spawned); spawned.length = 0; }
    trainerSync();

    // --- waves
    const heavyAlive = enemies.some((e) => KINDS[e.kind].heavy);
    if (baseHp > 0 && lull <= 0 && ((waveElapsed >= waveMin() && !heavyAlive && schedule.length === 0) || waveElapsed >= waveMax())) clearWave(waveElapsed < waveMax());

    if (baseHp <= 0) {
      if (coresMax === 0 || cores > 1) loseCore();
      else {
        baseHp = 0; over = true; cores = 0;
        say('Base destroyed', `${wavesSurvived} waves survived`, '#ff6a5a', true);
        cue('gameOver');
        ctx.emit({ type: 'gameOver', data: { wavesSurvived } });
        persist();
      }
    }
  }

  function update(dt: Seconds) {
    if (over) return;
    if (!started) {
      started = true; lastRevs = ctx.bike().crankRevs;
      if (opts?.skipGarage || autopilot || save.runs === 0) startRun();
    }
    t += dt;
    const inp = ctx.input();
    if (phase === 'garage') garageUpdate(dt, inp);
    else runUpdate(dt, inp);
    fx = fx.filter((f) => t - f.t0 < f.life);
    if (banner && t - banner.t0 > 4) banner = null;

    ctx.debug('phase', phase);
    ctx.debug('wave', wave);
    ctx.debug('baseHp', Math.round(baseHp));
    ctx.debug('cores', cores);
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
    ctx.save({ ...save, totals: { ...save.totals }, upgrades: { ...levels } });
  }
  const bestWave = () => Math.max(save.bestWave, phase === 'run' ? wave - 1 : 0);
  let killsBanked = 0;
  function bankKills() { const k = kills.blue + kills.red + kills.purple + kills.gold; save.totals.kills += k - killsBanked; killsBanked = k; }

  // ---------- views ----------
  const playControls = (): ControlHint[] => [
    { button: 'z', label: 'Fire rail (hold = all)' },
    { button: 'dpad', label: '◀▶ lane · ▲ all · ▼ workshop' },
    { button: 'paddles', label: 'Aim' },
  ];
  function enemyView(e: Enemy): EnemyView {
    const el = elementOf(e), si = shiftIn(e);
    const shifting = e.kind === 'boss' || e.kind === 'prism';
    return {
      id: e.id, kind: e.kind, lane: e.lane, x: e.x, y: e.y, angle: e.angle, dist: e.dist, radius: radiusOf(e),
      element: el, gold: e.kind === 'boss', hp: e.hp, maxHp: e.maxHp, hurt: e.hurt, charging: e.charging,
      shiftIn: si, next: shifting ? ELEMENTS[(ELEMENTS.indexOf(el) + 1) % 3] : null, progress: e.d / e.len,
    };
  }
  function broodView(): BroodView {
    const b = plan ? broodInfo(plan) : { wave, color: WEAPON_ELEMENT[weapon], weapon, mode: 'sim' as const, setting: '', cue: '' };
    return { ...b, countdownS: phase === 'run' ? lull : 0, lullS: lullS(), rampS: rampS() };
  }
  function garageView(): GarageView {
    return { bank: Math.round(bank), sel: garageSel, rows: garageRows(), startWave: fromWave, maxStartWave: mods.maxStartWave, autoLeft: GARAGE_AUTOSTART_S - garageT, autoS: GARAGE_AUTOSTART_S, autoInvest: autoInvestOn, bestWave: save.bestWave, runs: save.runs };
  }
  function workshopView(): WorkshopView | null {
    if (!workshop) return null;
    return { pad: workshop.pad, row: workshop.row, rows: workshopRows(workshop.pad), idleLeft: WORKSHOP_IDLE_S - workshop.idle };
  }

  return {
    update,
    isOver: () => over,
    receive(action: unknown) {
      const a = action as { type?: unknown } | null;
      if (a && typeof a.type === 'string' && pending.length < 8) pending.push(a as { type: string });
    },
    hud(): GameHud {
      if (started && phase === 'garage') return {
        gears: false, targetZone: { min: 2, max: 2, label: 'Warm up' },
        controls: [{ button: 'dpad', label: 'Choose' }, { button: 'a', label: 'Buy / start' }, { button: 'b', label: 'Start run' }],
      };
      const tz: GameHud['targetZone'] = surge?.state === 'active'
        ? { min: clamp(surge.zone, 1, 5) as 1 | 2 | 3 | 4 | 5, max: 5, label: 'Power surge!', source: 'power' }
        : lull > rampS() ? { min: 1, max: 2, label: `Recover · ${WEAPON_NAME[weapon]} next` }
        : weapon === 'rail' ? { min: 3, max: 4, label: 'Charge rail', source: 'power' } : { min: 2, max: 3, label: 'Power the towers' };
      const targetCadence: GameHud['targetCadence'] = spin?.state === 'active' ? { min: spin.rpm, label: 'Spin up the Gatling' } : undefined;
      if (workshop) return {
        gears: false, targetZone: tz, targetCadence,
        controls: [{ button: 'dpad', label: '◀▶ pad · ▲▼ option' }, { button: 'a', label: 'Build / upgrade' }, { button: 'b', label: 'Close' }, { button: 'z', label: 'Fire rail' }, { button: 'paddles', label: 'Aim' }],
      };
      return { gears: false, targetZone: tz, targetCadence, controls: playControls() };
    },
    snapshot(): TdSnapshot {
      return {
        t, phase, garage: phase === 'garage' ? garageView() : null,
        wave, waveElapsed, waveMaxS: waveMax(), wavesSurvived, lull, grace,
        forecast: nextPlan ? { wave: nextPlan.wave, boss: nextPlan.boss, mainLane: nextPlan.mainLane, lanes: nextPlan.lanes } : { wave: 1, boss: false, mainLane: 1, lanes: [] },
        brood: broodView(), nextBrood: nextPlan ? broodInfo(nextPlan) : null,
        baseHp, baseMaxHp, cores, coresMax, baseHurt,
        weapon, swapLeft, swapS: swapTotal,
        aimAngle: aim, autoAim, lane, targetId,
        railCharges, railMaxCharges: railCap(), railProgress: Math.min(1, railProgress), railCharging, zHold, railDumpHoldS: railDumpHold(),
        flaming, flameRange: flameRange(), flameHalfAngle: flameHalf(), flamePower, laserId,
        grid, overdrive, surge: surge ? { ...surge } : null, spin: spin ? { ...spin } : null, overclock,
        scrap, partsRun, bank: Math.round(bank),
        towers: towers.filter((x): x is Tower => !!x).map((x): TowerView => ({ pad: x.pad, kind: x.kind, level: x.level, angle: x.angle, charge: clamp(1 - x.cd / TOWERS[x.kind].period, 0, 1), firedAt: x.firedAt })),
        shells: shells.map((s): ShellView => ({ x0: s.x0, y0: s.y0, x1: s.x1, y1: s.y1, k: s.t / s.flight })),
        workshop: workshopView(),
        enemies: enemies.map(enemyView), fx: fx.slice(), banner,
        cues: cues.slice(),
        over, bestWave: bestWave(), kills: { ...kills },
        hooks: { storm: surge?.state === 'active', surge: surge?.state === 'active' },
      };
    },
    summary() {
      return {
        wavesSurvived,
        kills_blue: kills.blue, kills_red: kills.red, kills_purple: kills.purple, kills_gold: kills.gold,
        weaponSeconds_gatling: Math.round(weaponSeconds.gatling),
        weaponSeconds_flame: Math.round(weaponSeconds.flame),
        weaponSeconds_rail: Math.round(weaponSeconds.rail),
        railChargesFired: railFired,
        baseHpLeft: Math.round(baseHp),
        towersBuilt: stats.towersBuilt, towerUpgrades: stats.towerUpgrades, towerKills: stats.towerKills,
        scrapEarned: stats.scrapEarned, partsEarned: partsRun,
        surgesWon: stats.surgesWon, surgesFailed: stats.surgesFailed,
        spinsWon: stats.spinsWon, spinsFailed: stats.spinsFailed, overclockSeconds: Math.round(stats.overclockS),
        bossesKilled: stats.bosses, coresLost: stats.coresLost,
        overdriveSeconds: Math.round(stats.overdriveS),
      };
    },
    dispose() { if (phase === 'run') persist(); },
  };
}
