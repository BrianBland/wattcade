// Dynamo Defense sim: pure logic, deterministic (ctx.rng + fixed dt only).
import type { GameContext, GameSim, Seconds } from '../../../contracts';

export type Element = 'blue' | 'red' | 'purple';
export type Weapon = 'gatling' | 'flame' | 'rail';
export type Kind = 'mini' | 'brute' | 'armor' | 'boss';
export const WEAPON_ELEMENT: Record<Weapon, Element> = { gatling: 'blue', flame: 'red', rail: 'purple' };
export const ELEMENT_WEAPON: Record<Element, Weapon> = { blue: 'gatling', red: 'flame', purple: 'rail' };
const SHIELD_CYCLE: Element[] = ['blue', 'red', 'purple'];

export const FIELD = 100;
export const BASE_X = 50;
export const BASE_Y = 92;
export const FIELD_R = 90;
export const LANE_ANGLES = [-0.55, 0, 0.55];

interface KindDef { hp: number; speed: number; dmg: number; color: Element | 'gold' }
const KINDS: Record<Kind, KindDef> = {
  mini: { hp: 10, speed: 1 / 22, dmg: 1, color: 'blue' },
  brute: { hp: 70, speed: 1 / 28, dmg: 5, color: 'red' },
  armor: { hp: 80, speed: 1 / 42, dmg: 8, color: 'purple' },
  boss: { hp: 250, speed: 1 / 60, dmg: 20, color: 'gold' },
};

interface Enemy {
  id: number; kind: Kind; lane: number; angle: number; p: number;
  hp: number; maxHp: number; speed: number; dmg: number; shield: number; dead: boolean;
}

export interface TdOpts { autopilot?: boolean }

export interface TdSnapshot {
  t: number; wave: number; waveElapsed: number; wavesSurvived: number;
  baseHp: number; baseMaxHp: number; weapon: Weapon; swapLeft: number; swapS: number;
  aimAngle: number; autoAim: boolean; lane: number;
  railCharges: number; railMaxCharges: number; railProgress: number; zHold: number;
  flaming: boolean; flameRange: number; flameHalfAngle: number;
  enemies: Array<{ id: number; kind: Kind; color: Element | 'gold'; shield: Element | null; angle: number; r: number; x: number; y: number; hp: number; maxHp: number }>;
  tracers: Array<{ angle: number; r: number; ttl: number }>;
  beams: Array<{ angle: number; ttl: number }>;
  over: boolean; bestWave: number;
  kills: Record<string, number>;
}

export function enemyXY(angle: number, r: number) {
  return { x: BASE_X + Math.sin(angle) * r, y: BASE_Y - Math.cos(angle) * r };
}
const angDiff = (a: number, b: number) => Math.abs(a - b);

export function createTdSim(ctx: GameContext, opts?: TdOpts): GameSim & { snapshot(): TdSnapshot } {
  const T = ctx.tuning;
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
  const swapS = T.num('swapS', 1.5, 0.1, 5, 0.1);
  const aimRate = T.num('aimTurnRate', 2.0, 0.5, 6, 0.1, 'rad/s at full paddle');
  const autoAimDelay = T.num('autoAimIdleS', 1.5, 0.2, 5, 0.1);
  const baseHpMax = T.num('baseHp', 100, 10, 1000, 5);
  const hpScale = T.num('hpScalePerWave', 0.05, 0, 1, 0.01);
  const miniInterval = T.num('miniIntervalS', 1.6, 0.3, 6, 0.1);
  const waveMin = T.num('waveMinS', 25, 5, 120, 1);
  const waveMax = T.num('waveMaxS', 60, 15, 240, 1);
  const spawnWindow = T.num('heavySpawnWindowS', 20, 3, 60, 1);
  const bossShieldS = T.num('bossShieldCycleS', 7, 2, 30, 1);
  const clearHeal = T.num('earlyClearHeal', 14, 0, 100, 1, 'base HP restored when a wave is cleared before its timeout');
  const goodMult = T.num('goodMult', 1.5, 1, 3, 0.1);
  const badMult = T.num('badMult', 0.25, 0, 1, 0.05);

  const prevBest = ctx.load<{ bestWave?: number }>()?.bestWave ?? 0;
  const autopilot = !!opts?.autopilot;

  let t = 0;
  let nextId = 1;
  let enemies: Enemy[] = [];
  let weapon: Weapon = 'gatling';
  let swapLeft = 0;
  let aim = 0;
  let autoAim = true;
  let lane = 1;
  let baseHp = baseHpMax();
  const baseMaxHp = baseHp;
  let wave = 1;
  let waveElapsed = 0;
  let wavesSurvived = 0;
  let schedule: Array<{ at: number; kind: Kind }> = [];
  let miniTimer = 1;
  let revAcc = 0;
  let lastRevs = ctx.bike().crankRevs;
  let railCharges = 0;
  let railProgress = 0;
  let railFired = 0;
  let zHold = 0, zDown = false, zDumped = false;
  let over = false;
  let lastAutoSwitch = -99;
  let tracers: Array<{ angle: number; r: number; ttl: number }> = [];
  let beams: Array<{ angle: number; ttl: number }> = [];
  let flaming = false;
  let saved = false;
  const kills: Record<string, number> = { blue: 0, red: 0, purple: 0, gold: 0 };
  const weaponSeconds: Record<Weapon, number> = { gatling: 0, flame: 0, rail: 0 };

  function applyEffect() {
    if (weapon === 'gatling') ctx.resistance.set({ id: 'weapon', mode: 'sim', gradePct: gatlingGrade() });
    else if (weapon === 'flame') ctx.resistance.set({ id: 'weapon', mode: 'resistance', levelPct: flameLevel() });
    else ctx.resistance.set({ id: 'weapon', mode: 'erg', ftpFraction: railFtp() });
  }
  applyEffect();

  function startWave() {
    waveElapsed = 0;
    schedule = [];
    const brutes = 2 + Math.floor(wave * 0.8);
    const armors = wave >= 2 ? 1 + Math.floor(wave / 4) : 0;
    for (let i = 0; i < brutes; i++) schedule.push({ at: ctx.rng() * spawnWindow(), kind: 'brute' });
    for (let i = 0; i < armors; i++) schedule.push({ at: ctx.rng() * spawnWindow(), kind: 'armor' });
    if (wave % 5 === 0) schedule.push({ at: 2, kind: 'boss' });
    schedule.sort((a, b) => a.at - b.at);
    ctx.emit({ type: 'waveStart', data: { wave } });
  }
  startWave();

  function spawn(kind: Kind) {
    const d = KINDS[kind];
    const l = Math.floor(ctx.rng() * 3) % 3;
    const hs = 1 + hpScale() * (wave - 1);
    const hp = d.hp * hs;
    enemies.push({
      id: nextId++, kind, lane: l, angle: LANE_ANGLES[l] + (ctx.rng() - 0.5) * 0.14, p: 0,
      hp, maxHp: hp, speed: d.speed * (1 + 0.01 * (wave - 1)), dmg: d.dmg, shield: 0, dead: false,
    });
  }

  const elementOf = (e: Enemy): Element => (e.kind === 'boss' ? SHIELD_CYCLE[e.shield % 3] : (KINDS[e.kind].color as Element));
  const rOf = (e: Enemy) => (1 - e.p) * FIELD_R;

  function damage(e: Enemy, base: number, el: Element) {
    if (e.dead) return;
    e.hp -= base * (elementOf(e) === el ? goodMult() : badMult());
    if (e.hp <= 0) {
      e.dead = true;
      const key = e.kind === 'boss' ? 'gold' : elementOf(e);
      kills[key]++;
      if (e.kind !== 'mini') ctx.emit({ type: e.kind === 'boss' ? 'bossKilled' : 'enemyKilled', data: { element: key, wave } });
    }
  }

  function nearestInCone(angle: number, tol: number): Enemy | null {
    let best: Enemy | null = null;
    for (const e of enemies) if (!e.dead && angDiff(e.angle, angle) <= tol && (!best || e.p > best.p)) best = e;
    return best;
  }

  function pickAutoTarget(w: Weapon, laneSel: number): Enemy | null {
    const el = WEAPON_ELEMENT[w];
    const pick = (f: (e: Enemy) => boolean) => {
      let best: Enemy | null = null;
      for (const e of enemies) if (!e.dead && f(e) && (!best || e.p > best.p)) best = e;
      return best;
    };
    const inLane = (e: Enemy) => laneSel < 0 || e.lane === laneSel;
    return pick(e => inLane(e) && elementOf(e) === el) ?? pick(inLane) ?? pick(e => elementOf(e) === el) ?? pick(() => true);
  }

  function selectWeapon(w: Weapon) {
    if (w === weapon || over) return;
    weapon = w; swapLeft = swapS(); revAcc = 0;
    applyEffect();
    ctx.emit({ type: 'weaponSwitched', data: { weapon: w } });
  }

  function fireRail(n: number) {
    n = Math.min(n, railCharges);
    if (n <= 0) return;
    railCharges -= n; railFired += n;
    const spread = 0.5;
    for (let i = 0; i < n; i++) {
      const a = aim + (n === 1 ? 0 : (i - (n - 1) / 2) * spread);
      beams.push({ angle: a, ttl: 0.4 });
      for (const e of enemies) if (angDiff(e.angle, a) <= railWidth()) damage(e, railDmg(), 'purple');
    }
    ctx.emit({ type: 'railFired', data: { charges: n } });
  }

  function chooseAutopilotWeapon(): Weapon | null {
    const threat: Record<Element, number> = { blue: 0, red: 0, purple: 0 };
    let any = false;
    for (const e of enemies) {
      if (e.dead) continue;
      any = true;
      threat[elementOf(e)] += e.dmg * e.p * e.p * (e.kind === 'mini' ? 1 : 1.5);
    }
    if (!any) return null;
    let best: Element = 'blue';
    for (const el of SHIELD_CYCLE) if (threat[el] > threat[best]) best = el;
    return ELEMENT_WEAPON[best];
  }

  function update(dt: Seconds) {
    if (over) return;
    t += dt;
    const inp = ctx.input();
    const bike = ctx.bike();

    // --- input: weapons, lane, rail
    if (autopilot) {
      const w = chooseAutopilotWeapon();
      if (w && w !== weapon && swapLeft <= 0 && t - lastAutoSwitch >= 2.5) { selectWeapon(w); lastAutoSwitch = t; }
      if (railCharges >= railMax() && enemies.some(e => !e.dead && e.p > 0.2)) fireRail(railCharges);
      else if (weapon === 'rail' && swapLeft <= 0 && railCharges > 0) {
        const tg = nearestInCone(aim, 0.05);
        if (tg && tg.p > 0.25 && elementOf(tg) === 'purple' && tg.kind !== 'mini') fireRail(1);
      }
    } else {
      if (inp.pressed.has('a')) selectWeapon('gatling');
      if (inp.pressed.has('b')) selectWeapon('flame');
      if (inp.pressed.has('y')) selectWeapon('rail');
      if (inp.pressed.has('left')) lane = Math.max(0, lane - 1);
      if (inp.pressed.has('right')) lane = Math.min(2, lane + 1);
      if (inp.pressed.has('z')) { zDown = true; zHold = 0; zDumped = false; }
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

    // --- rail charge
    if (bike.ftpFraction >= railMinFtp()) {
      railProgress += (dt / railPeriod()) * Math.min(1.5, bike.ftpFraction / 0.95);
      if (railProgress >= 1) {
        if (railCharges < railMax()) { railCharges++; railProgress -= 1; } else railProgress = 0;
      }
    }

    // --- aim
    const pad = ctx.profile.settings?.aimMode === 'buttons' ? 0 : Math.max(-1, Math.min(1, inp.paddleR - inp.paddleL));
    const paddlesActive = !autopilot && inp.paddleIdleS <= autoAimDelay() && ctx.profile.settings?.aimMode !== 'buttons';
    autoAim = !paddlesActive;
    if (paddlesActive && ctx.profile.settings?.aimMode === 'axes') {
      // axes: L = x, R = y (stick); aim toward atan2(x, y)
      aim = Math.max(-0.9, Math.min(0.9, Math.atan2(inp.paddleL, Math.max(inp.paddleR, 0.2))));
    } else if (paddlesActive) {
      aim = Math.max(-0.9, Math.min(0.9, aim + pad * aimRate() * dt));
    } else {
      const tgt = pickAutoTarget(weapon, autopilot ? -1 : lane);
      if (tgt) {
        const d = tgt.angle - aim, step = 8 * dt;
        aim = Math.abs(d) <= step ? tgt.angle : aim + Math.sign(d) * step;
      }
    }

    // --- firing
    flaming = false;
    const ready = swapLeft <= 0;
    const revs = bike.crankRevs - lastRevs; lastRevs = bike.crankRevs;
    if (weapon === 'gatling' && ready) {
      revAcc += Math.max(0, revs);
      let shots = 0;
      while (revAcc >= gatlingRevs() && shots < 10) {
        revAcc -= gatlingRevs(); shots++;
        const e = nearestInCone(aim, 0.12);
        if (e) damage(e, gatlingDmg(), 'blue');
        tracers.push({ angle: aim, r: e ? rOf(e) : FIELD_R, ttl: 0.12 });
      }
    } else if (weapon === 'flame' && ready && bike.power3s > 5) {
      flaming = true;
      const d = bike.power3s * flameDpw() * dt;
      for (const e of enemies) if (!e.dead && rOf(e) <= flameRange() && angDiff(e.angle, aim) <= flameHalf()) damage(e, d, 'red');
    }
    if (tracers.length > 14) tracers = tracers.slice(-14);
    for (const x of tracers) x.ttl -= dt;
    tracers = tracers.filter(x => x.ttl > 0);
    for (const b of beams) b.ttl -= dt;
    beams = beams.filter(b => b.ttl > 0);

    // --- enemies move / hit base
    for (const e of enemies) {
      if (e.dead) continue;
      if (e.kind === 'boss') e.shield = Math.floor(t / bossShieldS());
      e.p += e.speed * dt;
      if (e.p >= 1) {
        e.dead = true;
        baseHp -= e.dmg;
        ctx.emit({ type: 'baseHit', data: { dmg: e.dmg, kind: e.kind } });
      }
    }
    enemies = enemies.filter(e => !e.dead);

    // --- spawning
    waveElapsed += dt;
    miniTimer -= dt;
    if (miniTimer <= 0) {
      spawn('mini');
      miniTimer = (miniInterval() / (1 + 0.04 * (wave - 1))) * (0.7 + ctx.rng() * 0.6);
    }
    while (schedule.length && schedule[0].at <= waveElapsed) spawn(schedule.shift()!.kind);

    // --- waves
    const heavyAlive = enemies.some(e => e.kind !== 'mini');
    if (baseHp > 0 && ((waveElapsed >= waveMin() && !heavyAlive && schedule.length === 0) || waveElapsed >= waveMax())) {
      wavesSurvived++;
      if (waveElapsed < waveMax()) baseHp = Math.min(baseMaxHp, baseHp + clearHeal());
      ctx.emit({ type: 'waveCleared', data: { wave } });
      wave++;
      startWave();
    }

    ctx.debug('wave', wave);
    ctx.debug('baseHp', Math.round(baseHp));
    ctx.debug('railCharges', railCharges);
    ctx.debug('enemies', enemies.length);

    if (baseHp <= 0) {
      baseHp = 0; over = true;
      ctx.emit({ type: 'gameOver', data: { wavesSurvived } });
      persist();
    }
  }

  function persist() {
    if (saved) return;
    saved = true;
    if (wavesSurvived > prevBest) ctx.save({ bestWave: wavesSurvived });
  }

  return {
    update,
    isOver: () => over,
    snapshot(): TdSnapshot {
      return {
        t, wave, waveElapsed, wavesSurvived, baseHp, baseMaxHp, weapon, swapLeft, swapS: swapS(),
        aimAngle: aim, autoAim, lane, railCharges, railMaxCharges: railMax(), railProgress: Math.min(1, railProgress), zHold,
        flaming, flameRange: flameRange(), flameHalfAngle: flameHalf(),
        enemies: enemies.map(e => ({
          id: e.id, kind: e.kind, color: KINDS[e.kind].color, shield: e.kind === 'boss' ? elementOf(e) : null,
          angle: e.angle, r: rOf(e), ...enemyXY(e.angle, rOf(e)), hp: e.hp, maxHp: e.maxHp,
        })),
        tracers: tracers.map(x => ({ ...x })), beams: beams.map(b => ({ ...b })),
        over, bestWave: Math.max(prevBest, wavesSurvived), kills: { ...kills },
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
      };
    },
    dispose() { persist(); },
  };
}
