// Sprocket Squadron sim: pure logic, deterministic (ctx.rng + fixed dt only).
import type { BikeState, Button, GameContext, GameHud, GameSim, InputState } from '../../../contracts';
import {
  BOSSES, ENEMIES, GUN_MAX, GUN_SPREAD, POWERS, POWER_KINDS, SECTORS, sectorTheme,
  type BossKind, type EKind, type Formation, type PowerKind,
} from './content';
import { UPGRADES, autoInvest, lvl, metaMods, upgradeCost, type Levels, type MetaMods } from './meta';
import type { Banner, ChallengeView, DropView, FxView, HangarRow, HangarView, SfSnapshot, Side, Stage, ToastView } from './types';

export type { SfSnapshot } from './types';
export const W = 100;
export const H = 100;
export const SHIP_Y = 88;

export const LEFT_BUTTONS: Button[] = ['shiftUpL', 'shiftDnL', 'up', 'down', 'left', 'right'];
export const RIGHT_BUTTONS: Button[] = ['shiftUpR', 'shiftDnR', 'a', 'b', 'y', 'z'];
/** Pedal this long in the hangar and the ship launches on its own. */
export const HANGAR_AUTOLAUNCH_S = 30;

export interface SfOpts { autopilot?: boolean; skipHangar?: boolean; sector?: number }
export interface SfSave {
  v?: number; best?: number; bank?: number; upgrades?: Levels; bestSector?: number; runs?: number; autoInvest?: boolean;
  totals?: { kills: number; bosses: number; scrap: number };
}

interface Enemy {
  id: number; kind: EKind; x: number; y: number; x0: number; vx: number; vy: number; ph: number;
  hp: number; maxHp: number; r: number; dead: boolean; golden: boolean; hurt: number;
  st: number; tmr: number; ty: number; shots: number; // per-kind state machine
  boss?: BossKind; part?: 'core' | 'L' | 'R';
}
interface Shot { x: number; y: number; vx: number; vy: number; side: Side; dmg: number; target: number; kind: 'shot' | 'missile' | 'wing'; dead: boolean; life: number }
interface Hazard { kind: 'rock' | 'bolt' | 'orb'; x: number; y: number; vx: number; vy: number; r: number; dmg: number; dead: boolean; spin: number }
interface Lance { x: number; w: number; tell: number; tellMax: number; active: number; y0: number; dmg: number; hit: boolean }
interface Drop { id: number; kind: 'scrap' | 'power'; power?: PowerKind; x: number; y: number; vx: number; vy: number; value: number; pulled: boolean; dead: boolean }

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function createSfSim(ctx: GameContext, opts?: SfOpts): GameSim & { snapshot(): SfSnapshot; receive(a: unknown): void } {
  const T = ctx.tuning;
  const revsPerShot = T.num('revsPerShot', 0.4, 0.1, 3, 0.05, 'crank revs per trigger pull (cadence = fire rate)');
  const maxCredits = T.num('maxCredits', 3, 1, 10, 1, 'banked trigger pulls (lets taps fire)');
  const shotDmg = T.num('shotDamage', 4, 0.5, 30, 0.5);
  const bulletSpeed = T.num('bulletSpeed', 95, 30, 300, 5);
  const thrustBase = T.num('thrustBase', 0.5, 0.1, 1.5, 0.05, 'scroll/thrust multiplier at 0 W');
  const thrustPerFtp = T.num('thrustPerFtp', 0.6, 0, 2, 0.05, 'extra thrust per FTP fraction');
  const thrustMax = T.num('thrustMax', 1.3, 0.5, 3, 0.05);
  const regenPerFtp = T.num('shieldRegenPerFtp', 5, 0, 30, 0.5, 'shield/s per FTP fraction');
  const regenDelay = T.num('shieldRegenDelayS', 2, 0, 10, 0.5);
  const shieldMaxT = T.num('shieldMax', 50, 10, 200, 5);
  const hpMaxT = T.num('hullHp', 100, 10, 500, 5);
  const odDps = T.num('overdriveDps', 70, 5, 500, 5, 'sprint twin-beam damage/s');
  const odWidthT = T.num('overdriveHalfWidth', 9, 2, 30, 1);
  const baseGrade = T.num('baseGradePct', 0.5, 0, 3, 0.1, 'gentle base grade (sim mode)');
  const attackGrade = T.num('attackGradePct', 3.5, 0, 8, 0.5, 'extra grade during attack run + boss (climb)');
  const cruiseS = T.num('cruiseS', 150, 20, 900, 5, 'zone-2 cruise length');
  const attackS = T.num('attackS', 70, 20, 300, 5, 'dense-wave time before the boss arrives');
  const bossTimeoutS = T.num('bossTimeoutS', 150, 30, 600, 10, 'boss retreats after this long (no clear bonus)');
  const warpS = T.num('warpS', 6, 2, 30, 1);
  const timeLimit = T.num('timeLimitS', 0, 0, 7200, 30, '0 = endless (quit from pause)');
  const livesT = T.num('lives', 3, 0, 9, 1, 'ships per run (0 = unlimited); Escape Pods add more');
  const cruiseSpawn = T.num('cruiseSpawnS', 2.4, 0.3, 10, 0.1, 'seconds between cruise waves');
  const attackSpawn = T.num('attackSpawnS', 1.6, 0.2, 5, 0.05, 'seconds between attack-run waves');
  const rockCruise = T.num('rockCruiseS', 5, 1, 20, 0.5);
  const rockAttack = T.num('rockAttackS', 3.2, 1, 20, 0.5);
  const goldenChance = T.num('goldenChance', 0.015, 0, 0.5, 0.01, 'golden enemy (always drops a power-up)');
  const powerChance = T.num('powerDropChance', 0.012, 0, 0.5, 0.01);
  const powerPityS = T.num('powerPityS', 35, 5, 300, 5, 'guaranteed power-up after this long without one');
  const bossHp = T.num('bossHpMult', 1, 0.2, 5, 0.05);
  const sectorHp = T.num('sectorHpScale', 0.18, 0, 1, 0.01, 'enemy/boss HP +x per sector');
  const sectorDmg = T.num('sectorDmgScale', 0.06, 0, 0.5, 0.01, 'enemy damage +x per sector');
  const steerSpeed = T.num('steerSpeed', 45, 10, 120, 5);
  const paddleNudge = T.num('paddleNudge', 1, 0, 3, 0.1, 'paddle steering strength');
  const comboWindow = T.num('comboWindowS', 4, 1, 15, 0.5);
  const scrapPerSector = T.num('sectorClearScrap', 60, 0, 1000, 10, 'bonus scrap per sector cleared (x sector)');
  const magnetR = T.num('magnetRange', 12, 2, 60, 1);
  const missileS = T.num('missileS', 20, 5, 120, 5, 'missile power-up duration');
  const wingS = T.num('wingmanS', 30, 5, 120, 5, 'temporary wingman duration');
  const slipNeedS = T.num('slipstreamNeedS', 20, 5, 120, 5, 'seconds at power zone 3+ to ride a slipstream (odd sectors)');
  const slipWindowS = T.num('slipstreamWindowS', 40, 10, 180, 5, 'cruise challenge window (Slipstream and Spin-Up)');
  const slipZone = T.num('slipstreamZone', 3, 2, 5, 1);
  const spinRpm = T.num('spinUpRpm', 95, 60, 140, 1, 'Spin-Up cadence floor (rpm, even sectors)');
  const spinNeedS = T.num('spinUpNeedS', 15, 5, 120, 1, 'seconds at Spin-Up cadence to earn Rapid Fire');
  const rapidS = T.num('rapidFireS', 30, 5, 120, 5, 'Rapid Fire duration');
  const rapidMult = T.num('rapidFireMult', 2, 1, 5, 0.25, 'shot credits per rev while Rapid Fire is on');

  ctx.resistance.useVirtualGears(false);
  ctx.resistance.set({ id: 'base', mode: 'sim', gradePct: baseGrade() });

  // ---------- save / meta ----------
  const saved: SfSave = ctx.load<SfSave>() ?? {};
  const levels: Levels = { ...(saved.upgrades ?? {}) };
  let bankStart = saved.bank ?? 0, bestSector = saved.bestSector ?? 1, runs = saved.runs ?? 0, best = saved.best ?? 0;
  let autoInvestOn = saved.autoInvest ?? true;
  const totals = { kills: 0, bosses: 0, scrap: 0, ...(saved.totals ?? {}) };
  let mods: MetaMods = metaMods(levels, bestSector);
  let startSector = clamp(opts?.sector ?? mods.maxStartSector, 1, Math.max(mods.maxStartSector, opts?.sector ?? 1));

  let phase: 'hangar' | 'run' = 'hangar', hangarSel = 0, hangarT = 0;
  const pending: Array<{ type: 'hangarRow'; row: number }> = [];

  // ---------- run state ----------
  let nid = 1, t = 0, runT = 0, freezeT = 0, scroll = 0;
  let stage: Stage = 'cruise', stageT = 0, sector = 1;
  let shipX = 50, hp = 0, shield = 0, invuln = 0;
  let lives = 0, livesMax = 0, deaths = 0;
  let sinceHit = 99, hitFlash = 0, shake = 0;
  let score = 0, combo = 0, maxCombo = 0, comboT = 0, kills = 0, leaks = 0, bosses = 0, sectorsCleared = 0, rocksHit = 0, bossesEscaped = 0;
  let scrap = 0, powersTaken = 0, goldens = 0, slipsRidden = 0, spinUps = 0, novas = 0, rapidT = 0, rapidSeconds = 0;
  let credits = 0, lastRevs = ctx.bike().crankRevs, nextSide: Side = 'L';
  let tapL = false, tapR = false, gunL = false, gunR = false;
  let gunLevel = 1, missilesT = 0, missileCd = 0, tempWingT = 0, wingCd = 0;
  let spawnAcc = 0, rockAcc = 0, distance = 0, odSeconds = 0, sincePower = 0;
  let over = false, overdrive = false, thrust = 1, sinceSave = 0;
  let bossT = 0, bossFireT = 0, bossAltT = 0, bossPattern = 0, lanceN = 0, spiralA = 0;
  let slip: (ChallengeView & { startAt: number; have: number }) | null = null;
  const enemies: Enemy[] = [], shots: Shot[] = [], hazards: Hazard[] = [], lances: Lance[] = [], drops: Drop[] = [];
  const fx: FxView[] = [], banners: Banner[] = [], toasts: ToastView[] = [], cues: Array<{ name: string; id: number }> = [];
  let cueId = 0, fxId = 0;
  const kindsKilled: Record<string, number> = {};
  const rng = () => ctx.rng();
  const pick = <T,>(a: readonly T[]) => a[Math.floor(rng() * a.length)];

  const cue = (name: string) => { cues.push({ name, id: ++cueId }); if (cues.length > 40) cues.shift(); };
  const addFx = (f: Omit<FxView, 'id' | 't0'>) => { fx.push({ ...f, id: ++fxId, t0: t }); if (fx.length > 80) fx.shift(); };
  const banner = (text: string, color: string, sub?: string, life = 2.6) => { banners.push({ text, sub, color, t0: t, life }); if (banners.length > 4) banners.shift(); };
  const toast = (text: string, color: string) => { toasts.push({ text, color, t0: t }); if (toasts.length > 5) toasts.shift(); };
  const freeze = (s: number) => { freezeT = Math.max(freezeT, s); };

  const hpMax = () => hpMaxT() * mods.hullMult;
  const shieldMax = () => shieldMaxT() * mods.shieldMult;
  const odWidth = () => odWidthT() * mods.odWidthMult;
  const hpScale = () => 1 + sectorHp() * (sector - 1);
  const dmgScale = () => 1 + sectorDmg() * (sector - 1);
  const mult = () => Math.min(5, 1 + combo * 0.1);
  const wingCount = () => Math.min(3, mods.wingmen + (tempWingT > 0 ? 1 : 0));
  const wingPos = (i: number) => (i === 0 ? { x: shipX - 10, y: SHIP_Y + 3 } : i === 1 ? { x: shipX + 10, y: SHIP_Y + 3 } : { x: shipX, y: SHIP_Y + 7 });

  function persist() {
    const bank = Math.round(bankStart + scrap);
    try {
      ctx.save({
        v: 2, best: Math.round(Math.max(best, score)), bank, upgrades: { ...levels }, bestSector, runs, autoInvest: autoInvestOn,
        totals: { kills: totals.kills + kills, bosses: totals.bosses + bosses, scrap: Math.round(totals.scrap + scrap) },
      } satisfies SfSave);
    } catch { /* ignore */ }
  }

  // ---------- hangar ----------
  function hangarRows(): HangarRow[] {
    const rows: HangarRow[] = [{ kind: 'launch', name: 'Launch', desc: `Sector ${startSector} · ${sectorTheme(startSector).name}` }];
    for (const d of UPGRADES) {
      const l = lvl(levels, d.id), maxed = l >= d.max, cost = maxed ? undefined : upgradeCost(d, l);
      rows.push({ kind: 'upgrade', id: d.id, name: d.name, desc: d.desc, level: l, max: d.max, cost, affordable: cost !== undefined && cost <= bankStart });
    }
    rows.push({ kind: 'auto', name: 'Auto-upgrade at launch', desc: autoInvestOn ? 'ON' : 'OFF' });
    return rows;
  }
  function hangarUpdate(dt: number, input: Readonly<InputState>, bike: Readonly<BikeState>) {
    const rows = hangarRows();
    const p = (b: Button) => input.pressed.has(b);
    let act = p('a');
    for (const a of pending.splice(0)) if (a.row >= 0 && a.row < rows.length) { hangarSel = a.row; act = true; }
    if (p('up') || p('shiftUpL')) { hangarSel = (hangarSel + rows.length - 1) % rows.length; cue('select'); hangarT = 0; }
    if (p('down') || p('shiftDnL')) { hangarSel = (hangarSel + 1) % rows.length; cue('select'); hangarT = 0; }
    hangarSel = Math.min(hangarSel, rows.length - 1);
    const row = rows[hangarSel];
    if (row.kind === 'launch' && (p('left') || p('right'))) {
      startSector = clamp(startSector + (p('left') ? -1 : 1), 1, mods.maxStartSector); cue('select'); hangarT = 0;
    }
    if (act) {
      hangarT = 0;
      if (row.kind === 'launch') { startRun(); return; }
      if (row.kind === 'auto') { autoInvestOn = !autoInvestOn; cue('select'); persist(); }
      if (row.kind === 'upgrade') {
        if (row.affordable) {
          bankStart -= row.cost!; levels[row.id!] = (row.level ?? 0) + 1; cue('upgrade');
          mods = metaMods(levels, bestSector); startSector = Math.min(startSector, mods.maxStartSector);
          if (row.id === 'warp') startSector = mods.maxStartSector;
          persist();
        } else cue('deny');
      }
    }
    if (p('b')) { startRun(); return; }
    if (bike.cadence3s > 30) hangarT += dt;
    if (hangarT >= HANGAR_AUTOLAUNCH_S) startRun();
  }

  function startRun() {
    if (autoInvestOn) {
      const r = autoInvest(bankStart, levels);
      bankStart = r.bank;
      if (r.bought.length) {
        mods = metaMods(levels, bestSector);
        const names = [...new Set(r.bought)].map(id => UPGRADES.find(u => u.id === id)!.name);
        toast(`Hangar: ${names.join(', ')}`, '#ffd84a');
      }
    }
    mods = metaMods(levels, bestSector);
    if (!opts?.sector) startSector = clamp(startSector, 1, mods.maxStartSector);
    phase = 'run'; runs++; sector = startSector; runT = 0;
    hp = hpMax(); shield = shieldMax(); gunLevel = Math.min(GUN_MAX, mods.startGun);
    livesMax = livesT() === 0 ? 0 : livesT() + mods.pods; lives = livesMax;
    setStage('cruise');
    banner(`Sector ${sector}`, sectorTheme(sector).accent, sectorTheme(sector).name, 3.2);
    cue('go'); persist();
  }

  // ---------- combat helpers ----------
  const half = (side: Side, x: number) => (side === 'L' ? x < W / 2 : x >= W / 2);

  const fire = (side: Side) => {
    const pend = new Map<number, number>();
    for (const b of shots) if (!b.dead) pend.set(b.target, (pend.get(b.target) ?? 0) + b.dmg);
    let bestE: Enemy | null = null;
    for (const e of enemies) {
      if (e.dead || e.y < 0 || e.y > SHIP_Y - 4 || !half(side, e.x)) continue;
      if ((pend.get(e.id) ?? 0) >= e.hp && e.kind !== 'boss') continue;
      if (!bestE || e.y > bestE.y) bestE = e;
    }
    const sx = shipX + (side === 'L' ? -3 : 3);
    let dx = side === 'L' ? -0.25 : 0.25, dy = -1, target = -1;
    if (bestE) { dx = bestE.x - sx; dy = bestE.y - SHIP_Y; target = bestE.id; }
    const base = Math.atan2(dx, -dy), sp = bulletSpeed(), dmg = shotDmg() * mods.dmgMult;
    for (const a of GUN_SPREAD[gunLevel - 1]) {
      const ang = base + a;
      shots.push({ x: sx, y: SHIP_Y - 2, vx: Math.sin(ang) * sp, vy: -Math.cos(ang) * sp, side, dmg, target: a === 0 || GUN_SPREAD[gunLevel - 1].length === 2 ? target : -1, kind: 'shot', dead: false, life: 2 });
    }
    addFx({ kind: 'muzzle', x: sx, y: SHIP_Y - 3, color: '#fff', size: 1 });
    cue('shoot');
  };

  const nearestEnemy = (x: number, y: number, maxY = SHIP_Y - 2) => {
    let bestE: Enemy | null = null, bd = Infinity;
    for (const e of enemies) {
      if (e.dead || e.y < 0 || e.y > maxY) continue;
      const d = Math.hypot(e.x - x, e.y - y) - (e.kind === 'boss' ? 6 : 0);
      if (d < bd) { bd = d; bestE = e; }
    }
    return bestE;
  };

  function hullHit(amt: number) {
    hp -= amt; hitFlash = 0.35; shake = Math.max(shake, 0.5);
    cue('hurt'); addFx({ kind: 'hurt', x: shipX, y: SHIP_Y, color: '#ff4a4a', size: 3 });
    if (hp <= 0) loseShip();
  }

  const damage = (amt: number) => {
    if (invuln > 0 || over) return;
    amt *= dmgScale();
    sinceHit = 0; combo = 0;
    const s = Math.min(shield, amt); shield -= s;
    if (s > 0) { cue('hit'); addFx({ kind: 'spark', x: shipX, y: SHIP_Y - 2, color: '#4aa3ff', size: 2 }); hitFlash = Math.max(hitFlash, 0.12); }
    if (amt - s > 0) hullHit(amt - s);
  };

  function loseShip() {
    deaths++;
    addFx({ kind: 'boom', x: shipX, y: SHIP_Y, color: '#ffb020', size: 8 }); cue('explode'); shake = 1;
    const last = livesMax !== 0 && lives <= 1;
    if (last) {
      hp = 0; lives = 0; over = true; hitFlash = 0; shake = 0; tempWingT = 0; missilesT = 0; persist();
      ctx.emit({ type: 'gameOver', data: { score: Math.round(score), bosses, sector } });
      banner('GAME OVER', '#ff4a4a', `Sector ${sector} · ${Math.round(scrap)} scrap banked`, 99);
      return;
    }
    if (livesMax !== 0) lives--;
    hp = hpMax(); shield = shieldMax(); invuln = 3; gunLevel = Math.max(Math.min(GUN_MAX, mods.startGun), gunLevel - 1);
    for (const h of hazards) h.dead = true;
    lances.length = 0;
    for (const e of enemies) if (e.kind !== 'boss' && e.y > 40) { e.dead = true; addFx({ kind: 'boom', x: e.x, y: e.y, color: '#ffb020', size: 3 }); }
    freeze(0.3); cue('potion');
    banner(livesMax === 0 ? 'SHIP LOST' : `SHIP LOST · ${lives} left`, '#ff8a6b', 'Spare hull launched', 2.4);
    ctx.emit({ type: 'shipLost', data: { lives } });
    persist();
  }

  // ---------- spawning ----------
  function newEnemy(kind: Exclude<EKind, 'boss'>, x: number, y: number, extra: Partial<Enemy> = {}): Enemy {
    const d = ENEMIES[kind];
    const golden = kind !== 'mini' && rng() < goldenChance();
    const hpv = d.hp * hpScale() * (golden ? 2 : 1);
    const e: Enemy = { id: nid++, kind, x, y, x0: x, vx: 0, vy: d.speed, ph: rng() * 6.28, hp: hpv, maxHp: hpv, r: d.r, dead: false, golden, hurt: 0, st: 0, tmr: 0, ty: 16 + rng() * 16, shots: 0, ...extra };
    enemies.push(e);
    return e;
  }
  function spawnWave() {
    const th = sectorTheme(sector), attacking = stage === 'attack';
    const mix: Array<[Exclude<EKind, 'boss' | 'mini'>, number]> = Object.entries(th.mix) as any;
    const total = mix.reduce((a, [, w]) => a + w, 0);
    const rollKind = () => { let r = rng() * total; for (const [k, w] of mix) { r -= w; if (r <= 0) return k; } return mix[0][0]; };
    const form: Formation = attacking ? pick<Formation>(['single', 'line', 'vee', 'column', 'pincer', 'vee', 'line'])
      : rng() < 0.75 ? 'single' : pick<Formation>(['line', 'column']);
    const kind = rollKind();
    const big = Math.min(5, 2 + sector); // formations grow over the first sectors
    const n = form === 'single' ? 1 : form === 'pincer' ? 4 : kind === 'armor' || kind === 'gunner' ? Math.min(3, big) : big;
    const cx = 15 + rng() * 70;
    for (let i = 0; i < n; i++) {
      let x = cx, y = -4;
      if (form === 'line') { x = 14 + (i * 72) / Math.max(1, n - 1); y = -4; }
      else if (form === 'vee') { const k = i - (n - 1) / 2; x = clamp(cx + k * 9, 6, 94); y = -4 - Math.abs(k) * 6; }
      else if (form === 'column') { x = cx; y = -4 - i * 8; }
      else if (form === 'pincer') { x = i % 2 ? 90 : 10; y = -4 - Math.floor(i / 2) * 9; }
      const k = form === 'single' ? kind : (form === 'pincer' ? 'weaver' : kind);
      newEnemy(k, x, y, form === 'pincer' ? { x0: i % 2 ? 80 : 20, ph: i % 2 ? Math.PI : 0 } : {});
    }
  }
  const spawnRock = () => {
    const x = 6 + rng() * 88;
    hazards.push({ kind: 'rock', x, y: -5, vx: (rng() - 0.5) * 6, vy: 18 + rng() * 10, r: 3 + rng() * 2.5, dmg: 12, dead: false, spin: rng() * 6 });
  };
  function spawnBoss() {
    const kind = sectorTheme(sector).boss, def = BOSSES[kind];
    const hpv = def.hp * bossHp() * hpScale();
    const mk = (x: number, part: Enemy['part']) => enemies.push({
      id: nid++, kind: 'boss', boss: kind, part, x, y: -12, x0: x, vx: 0, vy: 0, ph: 0, hp: hpv, maxHp: hpv, r: def.r, dead: false, golden: false, hurt: 0, st: 0, tmr: 0, ty: 20, shots: 0,
    });
    if (kind === 'lancer') { mk(28, 'L'); mk(72, 'R'); } else mk(50, 'core');
    stage = 'boss'; stageT = 0; bossT = 0; bossFireT = 2; bossAltT = 3; bossPattern = 0; spiralA = 0;
    banner('WARNING', '#ff4a4a', def.title, 3); cue('bossStart'); shake = Math.max(shake, 0.4);
    ctx.emit({ type: 'bossStart', data: { sector, boss: kind } });
  }
  const bossParts = () => enemies.filter(e => e.kind === 'boss' && !e.dead);

  function dropScrap(x: number, y: number, value: number) {
    const n = Math.min(6, Math.max(1, Math.round(value / 3)));
    const per = value / n;
    for (let i = 0; i < n; i++) drops.push({ id: nid++, kind: 'scrap', x: x + (rng() - 0.5) * 4, y: y + (rng() - 0.5) * 4, vx: (rng() - 0.5) * 14, vy: 6 + rng() * 8, value: per, pulled: false, dead: false });
  }
  function dropPower(x: number, y: number, kind?: PowerKind) {
    if (!kind) {
      const pool = POWER_KINDS.filter(k => !(k === 'gun' && gunLevel >= GUN_MAX));
      let r = rng() * pool.reduce((a, k) => a + POWERS[k].weight, 0);
      kind = pool[0];
      for (const k of pool) { r -= POWERS[k].weight; if (r <= 0) { kind = k; break; } }
    }
    drops.push({ id: nid++, kind: 'power', power: kind, x: clamp(x, 6, 94), y, vx: 0, vy: 9, value: 0, pulled: false, dead: false });
    sincePower = 0;
  }

  function killEnemy(e: Enemy) {
    if (e.dead) return;
    e.dead = true; kills++; kindsKilled[e.kind] = (kindsKilled[e.kind] ?? 0) + 1;
    combo++; comboT = 0; maxCombo = Math.max(maxCombo, combo);
    const def = e.kind === 'boss' ? null : ENEMIES[e.kind];
    const pts = (def?.pts ?? 0) * (e.golden ? 3 : 1);
    score += pts * mult() * (0.7 + 0.3 * thrust) * (1 + 0.1 * (sector - 1));
    if (def) {
      dropScrap(e.x, e.y, def.scrap * (e.golden ? 4 : 1) * (1 + 0.15 * (sector - 1)));
      if (e.golden) { goldens++; dropPower(e.x, e.y); }
      else if (rng() < powerChance() * (e.kind === 'armor' || e.kind === 'gunner' ? 2.5 : 1)) dropPower(e.x, e.y);
      if (e.kind === 'splitter') for (const s of [-1, 1]) newEnemy('mini', e.x + s * 2, e.y, { vx: s * 16, x0: e.x, golden: false });
      addFx({ kind: 'boom', x: e.x, y: e.y, color: e.golden ? '#ffd84a' : sectorTheme(sector).accent, size: e.r });
      cue('kill');
    } else {
      // a boss part
      addFx({ kind: 'boom', x: e.x, y: e.y, color: BOSSES[e.boss!].color, size: 10 }); cue('explode'); shake = Math.max(shake, 0.6);
      if (bossParts().length === 0) bossDefeated(e);
      else { toast('Half down! The other half rages', '#5cf2e0'); bossFireT = Math.min(bossFireT, 0.8); }
    }
    if (e.golden) addFx({ kind: 'text', x: e.x, y: e.y - 4, color: '#ffd84a', size: 1, text: 'GOLD!' });
  }

  function bossDefeated(e: Enemy) {
    bosses++; freeze(0.35); cue('bossDie'); shake = 1;
    score += 3000 * (1 + 0.25 * (sector - 1)) * mult();
    for (const o of enemies) if (!o.dead) { o.dead = true; addFx({ kind: 'boom', x: o.x, y: o.y, color: '#ffb020', size: o.r }); }
    for (const h of hazards) if (h.kind !== 'rock') h.dead = true;
    lances.length = 0;
    dropScrap(e.x, e.y, 30 * (1 + 0.3 * (sector - 1)));
    for (let i = 0; i < 3; i++) dropPower(e.x - 12 + i * 12, e.y + 4, i === 1 && gunLevel < GUN_MAX ? 'gun' : undefined);
    shield = shieldMax(); hp = Math.min(hpMax(), hp + 0.15 * hpMax());
    ctx.emit({ type: 'bossDefeated', data: { sector, n: bosses, boss: e.boss! } });
    toBeWarp(true);
  }
  function toBeWarp(cleared: boolean) {
    const bonus = cleared ? Math.round(scrapPerSector() * sector * mods.scrapMult) : 0;
    if (cleared) {
      sectorsCleared++; scrap += bonus;
      banner('SECTOR CLEAR', '#7dff5a', `+${bonus} scrap`, 3);
    } else {
      bossesEscaped++; banner('BOSS ESCAPED', '#ff8a6b', 'It warps away. Onward!', 3);
    }
    bestSector = Math.max(bestSector, sector + 1);
    setStage('warp'); persist();
  }

  function setStage(s: Stage) {
    stage = s; stageT = 0; slip = null;
    if (s === 'attack') {
      ctx.resistance.set({ id: 'attack', mode: 'sim', gradePct: attackGrade() });
      ctx.emit({ type: 'attackRun', data: { sector } });
      banner('ATTACK RUN', '#ff8a3c', 'Climb! Zone 4 until the boss falls', 2.8); cue('surge');
    } else if (s === 'cruise' || s === 'warp') ctx.resistance.clear('attack');
    if (s === 'warp') cue('unlock');
  }

  function applyPower(k: PowerKind) {
    powersTaken++;
    const name = POWERS[k].name, color = POWERS[k].color;
    if (k === 'gun') gunLevel = Math.min(GUN_MAX, gunLevel + 1);
    if (k === 'missiles') missilesT = missileS();
    if (k === 'shield') shield = shieldMax();
    if (k === 'repair') hp = Math.min(hpMax(), hp + 0.35 * hpMax());
    if (k === 'wingman') tempWingT = wingS();
    if (k === 'nova') {
      novas++;
      for (const e of enemies) {
        if (e.dead || e.y < -2) continue;
        e.hp -= e.kind === 'boss' ? 30 * mods.dmgMult : 60; e.hurt = 0.2;
        if (e.hp <= 0) killEnemy(e);
      }
      for (const h of hazards) if (h.kind !== 'rock') h.dead = true;
      addFx({ kind: 'nova', x: shipX, y: SHIP_Y, color: '#fff', size: 80 }); shake = Math.max(shake, 0.5); cue('explode');
    }
    addFx({ kind: 'pickup', x: shipX, y: SHIP_Y - 6, color, size: 1, text: k === 'gun' ? `GUN ${gunLevel}` : name.toUpperCase() });
    cue(k === 'gun' ? 'levelup' : k === 'nova' ? 'surge' : 'pickup');
    ctx.emit({ type: 'powerUp', data: { kind: k } });
  }

  // ---------- autopilot steering (also used whenever the paddles are idle) ----------
  function autoSteer(dt: number) {
    let bestX = shipX, bestC = Infinity;
    const mag = magnetR() * mods.magnetMult;
    for (let cx = 6; cx <= 94; cx += 2) {
      let c = 0.015 * Math.abs(cx - 50) + 0.02 * Math.abs(cx - shipX);
      for (const h of hazards) {
        if (h.dead) continue;
        const dy = SHIP_Y - h.y;
        if (dy < -6 || dy > 55) continue;
        const vy = Math.max(5, h.vy);
        const px = h.x + h.vx * Math.max(0, dy) / vy;
        const gap = h.r + 5 - Math.abs(px - cx);
        if (gap > 0) c += gap * h.dmg * 0.3 * (3 + 40 / (4 + Math.max(0, dy)));
      }
      for (const e of enemies) {
        if (e.dead || e.kind === 'boss') continue;
        const dy = SHIP_Y - e.y;
        if (dy < -6 || dy > 40) continue;
        const px = e.st === 2 && e.kind === 'diver' ? e.x + e.vx * Math.max(0, dy) / Math.max(5, e.vy) : e.x;
        const gap = e.r + 5 - Math.abs(px - cx);
        if (gap > 0) c += gap * (2 + 30 / (4 + Math.max(0, dy)));
      }
      for (const l of lances) if (Math.abs(cx - l.x) < l.w + 4) c += l.active > 0 ? 400 : 120 * (1 - l.tell / l.tellMax) + 40;
      for (const d of drops) {
        if (d.y > SHIP_Y + 2 || d.y < 25) continue;
        const want = d.kind === 'power' ? 30 : 1.5;
        const reach = d.kind === 'power' ? 8 : mag;
        c -= want / (1 + Math.max(0, Math.abs(d.x - cx) - reach * 0.5) / 4);
      }
      if (c < bestC) { bestC = c; bestX = cx; }
    }
    const step = steerSpeed() * Math.max(0.7, thrust) * dt;
    shipX += clamp(bestX - shipX, -step, step);
  }

  // ---------- boss behaviour ----------
  function bossUpdate(dt: number) {
    bossT += dt;
    const parts = bossParts();
    if (!parts.length) return;
    const kind = parts[0].boss!;
    const enraged = parts.some(p => p.hp < p.maxHp * 0.5) || (kind === 'lancer' && parts.length === 1);
    for (const e of parts) {
      e.y = Math.min(e.ty, e.y + 12 * dt);
      if (kind === 'dreadnought' || kind === 'maw') e.x = 50 + Math.sin(bossT * (kind === 'maw' ? 0.4 : 0.6)) * (kind === 'maw' ? 22 : 30);
      else if (kind === 'hive') e.x = 50 + Math.sin(bossT * 0.35) * 20;
      else if (kind === 'spiral') e.x = 50 + Math.sin(bossT * 0.5) * 14;
      else if (kind === 'lancer') e.x = e.x0 + Math.sin(bossT * 0.8 + (e.part === 'R' ? Math.PI : 0)) * 12;
    }
    if (parts[0].y < parts[0].ty - 1) return;
    const bolt = (x: number, y: number, vx: number, vy: number, r = 1.6, dmg = 8, kind2: 'bolt' | 'orb' = 'bolt') =>
      hazards.push({ kind: kind2, x, y, vx, vy, r, dmg, dead: false, spin: 0 });
    const aimed = (x: number, y: number, sp: number, spread: number[], r = 1.6, dmg = 8, k: 'bolt' | 'orb' = 'bolt') => {
      const base = Math.atan2(shipX - x, SHIP_Y - y);
      for (const a of spread) bolt(x, y, Math.sin(base + a) * sp, Math.cos(base + a) * sp, r, dmg, k);
    };
    const lance = (x: number, y0: number) => { lances.push({ x: clamp(x, 6, 94), w: 5, tell: 1.3, tellMax: 1.3, active: 0, y0, dmg: 14, hit: false }); cue('zap'); };
    bossFireT -= dt; bossAltT -= dt;
    const core = parts[0];
    for (const e of parts) e.st = Math.max(0, 1 - bossFireT / 0.6); // tell for the renderer
    const pattern = kind === 'maw' ? (['dreadnought', 'hive', 'lancer', 'spiral'] as const)[bossPattern % 4] : kind;
    if (bossFireT <= 0) {
      if (pattern === 'dreadnought') {
        aimed(core.x, core.y + 6, 40, enraged ? [-0.4, -0.2, 0, 0.2, 0.4] : [-0.25, 0, 0.25]);
        bossFireT = enraged ? 1.25 : 1.6; cue('shootHeavy');
      } else if (pattern === 'hive') {
        aimed(core.x, core.y + 6, 22, enraged ? [-0.15, 0.15] : [0], 2.4, 9, 'orb');
        bossFireT = enraged ? 1.6 : 2.2; cue('shootHeavy');
      } else if (pattern === 'lancer') {
        const shooter = kind === 'lancer' ? parts[lanceN++ % parts.length] : core;
        lance(shipX + (rng() - 0.5) * 6, shooter.y + 6);
        if (enraged && kind === 'lancer') aimed(shooter.x, shooter.y + 4, 36, [0]);
        bossFireT = enraged ? 2.4 : 3.4;
      } else if (pattern === 'spiral') {
        const arms = enraged ? 3 : 2;
        for (let a = 0; a < arms; a++) {
          const ang = spiralA + (a * Math.PI * 2) / arms;
          if (Math.cos(ang) > -0.2) bolt(core.x, core.y, Math.sin(ang) * 24, Math.cos(ang) * 24, 1.5, 5);
        }
        spiralA += 0.42; bossFireT = 0.2;
      }
    }
    if ((kind === 'hive' || (kind === 'maw' && pattern === 'hive')) && bossAltT <= 0) {
      for (const s of [-1, 1]) newEnemy('drone', clamp(core.x + s * 12, 6, 94), core.y + 4, { golden: false });
      bossAltT = enraged ? 3 : 4.2; cue('door');
    }
    if (kind === 'maw' && bossT > 0 && Math.floor(bossT / 12) !== Math.floor((bossT - dt) / 12)) { bossPattern++; bossFireT = 1; }
    if (kind === 'spiral' && bossAltT <= 0) { aimed(core.x, core.y + 4, 34, [0], 2, 8); bossAltT = enraged ? 2 : 3.5; }
    if (bossT >= bossTimeoutS()) {
      for (const e of parts) { e.dead = true; addFx({ kind: 'spark', x: e.x, y: e.y, color: '#fff', size: 8 }); }
      for (const h of hazards) if (h.kind !== 'rock') h.dead = true;
      lances.length = 0;
      ctx.emit({ type: 'bossEscaped', data: { sector } });
      toBeWarp(false);
    }
  }

  // ---------- cruise challenge (optional): Slipstream = power, Spin-Up = cadence ----------
  // Both are short efforts: Slipstream is judged on power zone (HR lags too much for 20 s), Spin-Up on cadence3s.
  function slipUpdate(dt: number, bike: Readonly<BikeState>) {
    if (stage !== 'cruise') return;
    if (!slip) {
      const kind = sector % 2 === 1 ? 'slipstream' : 'spinup';
      slip = {
        kind, state: 'idle', progress: 0, need: kind === 'slipstream' ? slipNeedS() : spinNeedS(), left: slipWindowS(), rpm: Math.round(spinRpm()),
        x: 20 + rng() * 60, startAt: cruiseS() * (0.25 + rng() * 0.3), have: 0,
      };
      return;
    }
    const spin = slip.kind === 'spinup';
    if (slip.state === 'idle' && stageT >= slip.startAt && cruiseS() - stageT > slipWindowS() + 5) {
      slip.state = 'active'; slip.left = slipWindowS();
      if (spin) banner('SPIN-UP', '#ffd84a', `Easy gear, ${slip.rpm}+ rpm for ${slip.need}s: Rapid Fire`, 3);
      else banner('SLIPSTREAM', '#5cf2e0', `Power zone ${slipZone()}+ for ${slip.need}s: power-up shower`, 3);
      cue('shrine');
      ctx.emit({ type: spin ? 'spinUp' : 'slipstream', data: { sector } });
    }
    if (slip.state !== 'active') return;
    slip.left -= dt;
    if (spin ? bike.cadence3s >= spinRpm() : Math.min(5, bike.powerZone) >= slipZone()) slip.have += dt;
    slip.progress = Math.min(1, slip.have / slip.need);
    if (slip.progress >= 1) {
      slip.state = 'done';
      if (spin) {
        spinUps++; rapidT = rapidS();
        dropScrap(50, 0, 10 * sector * mods.scrapMult);
        banner('RAPID FIRE', '#ffd84a', `Every rev fires x${rapidMult()} for ${Math.round(rapidS())}s`, 2.4); cue('levelup');
      } else {
        slipsRidden++;
        for (let i = 0; i < 3; i++) dropPower(20 + i * 30, -2 - i * 6);
        dropScrap(50, 0, 20 * sector * mods.scrapMult);
        banner('SLIPSTREAM RIDDEN', '#5cf2e0', 'Power-ups incoming!', 2.4); cue('reward');
      }
      ctx.emit({ type: spin ? 'spinUpDone' : 'slipstreamDone', data: { completed: true } });
    } else if (slip.left <= 0) {
      slip.state = 'failed'; toast(spin ? 'Spin-Up missed: the guns spin down' : 'Slipstream faded', '#8899aa');
      ctx.emit({ type: spin ? 'spinUpDone' : 'slipstreamDone', data: { completed: false } });
    }
  }

  // ---------- main update ----------
  const update = (dt: number) => {
    const bike = ctx.bike(), inp = ctx.input();
    t += dt;
    if (phase === 'hangar') {
      if (opts?.autopilot || opts?.skipHangar) startRun();
      else { hangarUpdate(dt, inp, bike); return; }
    }
    if (over) return;
    // shot credits keep accruing through hit-stop so no revs are lost
    const dRevs = bike.crankRevs - lastRevs; lastRevs = bike.crankRevs;
    credits = Math.min(maxCredits() * (rapidT > 0 ? 2 : 1), credits + (Math.max(0, dRevs) / revsPerShot()) * mods.fireMult * (rapidT > 0 ? rapidMult() : 1));
    if (!opts?.autopilot) {
      if (LEFT_BUTTONS.some(b => inp.pressed.has(b))) tapL = true;
      if (RIGHT_BUTTONS.some(b => inp.pressed.has(b))) tapR = true;
    }
    if (freezeT > 0) { freezeT -= dt; return; }
    runT += dt;
    thrust = Math.min(thrustMax(), thrustBase() + thrustPerFtp() * bike.ftpFraction);
    overdrive = bike.sprinting;
    if (overdrive) odSeconds += dt;
    distance += thrust * dt; scroll += thrust * dt * 14;
    if (rapidT > 0) { rapidT = Math.max(0, rapidT - dt); rapidSeconds += dt; }
    sincePower += dt; invuln = Math.max(0, invuln - dt); shake = Math.max(0, shake - dt * 2);

    // triggers
    if (opts?.autopilot) {
      gunL = enemies.some(e => !e.dead && e.y > 0 && e.x < W / 2);
      gunR = enemies.some(e => !e.dead && e.y > 0 && e.x >= W / 2);
    } else {
      gunL = LEFT_BUTTONS.some(b => inp.held.has(b)); gunR = RIGHT_BUTTONS.some(b => inp.held.has(b));
    }
    let guard = 8;
    while (credits >= 1 && guard-- > 0) {
      const wantL = gunL || tapL, wantR = gunR || tapR;
      if (!wantL && !wantR) break;
      let side: Side = nextSide;
      if (side === 'L' && !wantL) side = 'R'; else if (side === 'R' && !wantR) side = 'L';
      fire(side); credits -= 1; nextSide = side === 'L' ? 'R' : 'L';
      if (side === 'L') tapL = false; else tapR = false;
    }
    if (!gunL && !gunR) { tapL = tapL && credits < 1; tapR = tapR && credits < 1; }

    // missiles + wingmen spin with the cranks
    const spin = bike.cadence3s > 30 ? bike.cadence3s / 90 : 0;
    if (missilesT > 0) {
      missilesT -= dt; missileCd -= dt * spin;
      if (missileCd <= 0 && spin > 0) {
        missileCd = 0.7;
        for (const s of [-1, 1] as const) {
          const tgt = nearestEnemy(shipX + s * 10, SHIP_Y - 30);
          shots.push({ x: shipX + s * 4, y: SHIP_Y, vx: s * 20, vy: -30, side: s < 0 ? 'L' : 'R', dmg: 7 * mods.dmgMult, target: tgt?.id ?? -1, kind: 'missile', dead: false, life: 3 });
        }
        cue('zap');
      }
    }
    tempWingT = Math.max(0, tempWingT - dt);
    const nw = wingCount();
    if (nw > 0 && spin > 0) {
      wingCd -= dt * spin;
      if (wingCd <= 0) {
        wingCd = 0.45;
        for (let i = 0; i < nw; i++) {
          const p = wingPos(i), tgt = nearestEnemy(p.x, p.y);
          let dx = 0, dy = -1;
          if (tgt) { dx = tgt.x - p.x; dy = tgt.y - p.y; }
          const n = Math.hypot(dx, dy) || 1;
          shots.push({ x: p.x, y: p.y - 2, vx: (dx / n) * bulletSpeed(), vy: (dy / n) * bulletSpeed(), side: p.x < shipX ? 'L' : 'R', dmg: 3 * mods.dmgMult, target: tgt?.id ?? -1, kind: 'wing', dead: false, life: 2 });
        }
      }
    }

    // steering
    const manual = !opts?.autopilot && inp.paddleIdleS < 0.6;
    if (manual) shipX += (inp.paddleR - inp.paddleL) * paddleNudge() * steerSpeed() * Math.max(0.7, thrust) * dt;
    else autoSteer(dt);
    shipX = clamp(shipX, 5, 95);

    // stages
    stageT += dt;
    if (stage === 'cruise' && stageT >= cruiseS()) setStage('attack');
    else if (stage === 'attack' && stageT >= attackS()) spawnBoss();
    else if (stage === 'boss') bossUpdate(dt);
    else if (stage === 'warp' && stageT >= warpS()) {
      sector++;
      setStage('cruise');
      banner(`Sector ${sector}`, sectorTheme(sector).accent, sectorTheme(sector).name, 3.2);
      ctx.emit({ type: 'sector', data: { sector } });
    }
    slipUpdate(dt, bike);

    // spawning
    if (stage !== 'warp') {
      const ramp = Math.max(0.55, Math.pow(0.95, sector - 1));
      spawnAcc += dt;
      const iv = (stage === 'cruise' ? cruiseSpawn() : attackSpawn()) * ramp * (stage === 'boss' ? 3 : 1);
      if (spawnAcc >= iv) { spawnAcc -= iv; spawnWave(); }
      rockAcc += dt;
      const rv = stage === 'cruise' ? rockCruise() : rockAttack() * (stage === 'boss' ? 2 : 1);
      if (rockAcc >= rv) { rockAcc -= rv; spawnRock(); }
      if (sincePower > powerPityS() * (stage === 'cruise' ? 1.5 : 1)) dropPower(15 + rng() * 70, -3);
    }

    // enemies
    const speedK = 0.75 + 0.25 * thrust;
    for (const e of enemies) {
      if (e.dead || e.kind === 'boss') { e.hurt = Math.max(0, e.hurt - dt); continue; }
      e.hurt = Math.max(0, e.hurt - dt);
      const d = ENEMIES[e.kind];
      if (e.kind === 'diver') {
        if (e.st === 0) { e.y += d.speed * speedK * dt; if (e.y >= e.ty) { e.st = 1; e.tmr = 0.9; } }
        else if (e.st === 1) { e.tmr -= dt; if (e.tmr <= 0) { e.st = 2; const dx = shipX - e.x, dy = SHIP_Y - e.y, n = Math.hypot(dx, dy) || 1; e.vx = (dx / n) * 48; e.vy = (dy / n) * 48; cue('zap'); } }
        else { e.x += e.vx * dt; e.y += e.vy * dt; }
      } else if (e.kind === 'gunner') {
        if (e.st === 0) { e.y += d.speed * speedK * dt; if (e.y >= e.ty) { e.st = 1; e.tmr = 1.2; } }
        else if (e.st === 1) {
          e.x = e.x0 + Math.sin(t * 0.8 + e.ph) * 6; e.tmr -= dt;
          if (e.tmr <= 0) {
            const dx = shipX - e.x, dy = SHIP_Y - e.y, n = Math.hypot(dx, dy) || 1;
            hazards.push({ kind: 'bolt', x: e.x, y: e.y + 3, vx: (dx / n) * 34, vy: (dy / n) * 34, r: 1.4, dmg: 7, dead: false, spin: 0 });
            e.shots++; e.tmr = 2; cue('shoot');
            if (e.shots >= 3) e.st = 2;
          }
        } else e.y += d.speed * 1.6 * dt;
      } else if (e.kind === 'mini') {
        e.x += e.vx * dt; e.vx *= Math.pow(0.3, dt); e.y += d.speed * speedK * dt;
      } else {
        e.y += d.speed * speedK * dt;
        if (e.kind === 'weaver') e.x = clamp(e.x0 + Math.sin(e.ph + e.y * 0.06) * 30 * (1 - Math.max(0, e.y) / 160), 4, 96);
      }
      if (e.y > H + 3 || e.x < -8 || e.x > W + 8) {
        e.dead = true;
        if (d.leak > 0) { leaks++; damage(d.leak); }
      } else if (Math.abs(e.x - shipX) < e.r + 3 && Math.abs(e.y - SHIP_Y) < e.r + 3) {
        e.dead = true; addFx({ kind: 'boom', x: e.x, y: e.y, color: '#ffb020', size: e.r }); damage(d.contact);
      }
    }

    // friendly shots
    for (const b of shots) {
      if (b.dead) continue;
      b.life -= dt;
      if (b.kind === 'missile') {
        let tgt = enemies.find(e => e.id === b.target && !e.dead);
        if (!tgt) { tgt = nearestEnemy(b.x, b.y, SHIP_Y) ?? undefined; b.target = tgt?.id ?? -1; }
        const sp = 70;
        if (tgt) {
          const dx = tgt.x - b.x, dy = tgt.y - b.y, n = Math.hypot(dx, dy) || 1;
          const k = Math.min(1, dt * 5);
          b.vx += ((dx / n) * sp - b.vx) * k; b.vy += ((dy / n) * sp - b.vy) * k;
        } else b.vy -= 60 * dt;
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.life <= 0 || b.y < -6 || b.x < -6 || b.x > W + 6 || b.y > H + 4) { b.dead = true; continue; }
      for (const e of enemies) {
        if (e.dead || e.y < -2) continue;
        if (Math.abs(b.x - e.x) < e.r + 1.5 && Math.abs(b.y - e.y) < e.r + 1.5) {
          b.dead = true; e.hp -= b.dmg; e.hurt = 0.1; score += 2;
          if (e.kind === 'boss') cue('hit');
          if (e.hp <= 0) killEnemy(e);
          break;
        }
      }
    }
    // overdrive beam (also burns enemy bolts in its path)
    if (overdrive) {
      const ow = odWidth();
      for (const e of enemies) {
        if (e.dead || e.y < 0 || e.y > SHIP_Y) continue;
        if (Math.abs(e.x - shipX) < ow + e.r) { e.hp -= odDps() * mods.odMult * dt; e.hurt = 0.1; if (e.hp <= 0) killEnemy(e); }
      }
      for (const h of hazards) if (h.kind !== 'rock' && !h.dead && Math.abs(h.x - shipX) < ow && h.y < SHIP_Y - 3) { h.dead = true; addFx({ kind: 'spark', x: h.x, y: h.y, color: '#fff', size: 1 }); }
    }

    // hazards
    for (const h of hazards) {
      if (h.dead) continue;
      h.x += h.vx * dt; h.y += h.vy * (h.kind === 'rock' ? speedK : 1) * dt; h.spin += dt;
      if (h.kind === 'orb') { const dx = shipX - h.x; h.vx += clamp(dx, -1, 1) * 10 * dt; }
      if (Math.abs(h.x - shipX) < h.r + 2.5 && Math.abs(h.y - SHIP_Y) < h.r + 2.5) {
        h.dead = true; if (h.kind === 'rock') rocksHit++; damage(h.dmg);
      }
      if (h.y > H + 6 || h.y < -20 || h.x < -10 || h.x > W + 10) h.dead = true;
    }
    for (const l of lances) {
      if (l.tell > 0) { l.tell -= dt; if (l.tell <= 0) { l.active = 0.6; cue('zap'); shake = Math.max(shake, 0.2); } }
      else if (l.active > 0) {
        l.active -= dt;
        if (!l.hit && Math.abs(shipX - l.x) < l.w + 2) { l.hit = true; damage(l.dmg); }
      }
    }

    // drops
    const mag = magnetR() * mods.magnetMult;
    for (const d of drops) {
      if (d.dead) continue;
      const dx = shipX - d.x, dy = SHIP_Y - d.y, dist = Math.hypot(dx, dy);
      if (d.kind === 'scrap' && (dist < mag || d.pulled)) {
        d.pulled = true; const sp = 70; d.x += (dx / (dist || 1)) * sp * dt; d.y += (dy / (dist || 1)) * sp * dt;
      } else {
        d.x += d.vx * dt; d.vx *= Math.pow(0.2, dt); d.y += d.vy * dt;
        if (d.kind === 'scrap') d.vy = Math.min(16, d.vy + 10 * dt);
      }
      if (dist < (d.kind === 'power' ? 6 : 3.5)) {
        d.dead = true;
        if (d.kind === 'scrap') { const v = d.value * mods.scrapMult; scrap += v; cue('coin'); }
        else applyPower(d.power!);
      } else if (d.y > H + 4) d.dead = true;
    }

    compact(enemies, e => e.dead); compact(shots, b => b.dead); compact(hazards, h => h.dead); compact(drops, d => d.dead);
    compact(lances, l => l.tell <= 0 && l.active <= 0);

    // shield / combo / timers
    sinceHit += dt; hitFlash = Math.max(0, hitFlash - dt);
    if (sinceHit >= regenDelay()) shield = Math.min(shieldMax(), shield + regenPerFtp() * mods.regenMult * bike.ftpFraction * dt);
    comboT += dt; if (comboT > comboWindow()) combo = 0;
    score += dt * 5 * thrust;
    sinceSave += dt; if (sinceSave > 30) { sinceSave = 0; persist(); }
    if (timeLimit() > 0 && runT >= timeLimit() && !over) {
      over = true; persist(); ctx.emit({ type: 'timeUp', data: { score: Math.round(score) } });
      banner('TIME', '#ffd84a', `Sector ${sector} · ${Math.round(score).toLocaleString()} pts`, 99);
    }
    if (score > best) best = score;
    ctx.debug('stage', stage); ctx.debug('sector', sector); ctx.debug('thrust', Math.round(thrust * 100) / 100);
    ctx.debug('credits', Math.round(credits * 10) / 10); ctx.debug('gun', gunLevel); ctx.debug('scrap', Math.round(scrap));
  };

  const hud = (): GameHud => {
    if (phase === 'hangar') return {
      targetZone: { min: 1, max: 2, label: 'Hangar' },
      controls: [
        { button: 'dpad', label: 'Choose' }, { button: 'a', label: 'Buy / launch' }, { button: 'b', label: 'Launch now' },
        { button: 'shiftersL', label: 'Choose' },
      ],
      gears: false,
    };
    // attack runs, bosses and the slipstream are judged on power (HR can't follow them); cruise keeps the profile source
    const active = slip?.state === 'active' ? slip : null;
    const zone: GameHud['targetZone'] = stage === 'attack' || stage === 'boss' ? { min: 4, max: 4, label: stage === 'boss' ? 'Boss!' : 'Attack run', source: 'power' }
      : active?.kind === 'slipstream' ? { min: slipZone() as 1 | 2 | 3 | 4 | 5, max: 5, label: 'Slipstream', source: 'power' }
      : { min: 2, max: 2, label: stage === 'warp' ? 'Warp' : active ? 'Spin-Up: easy gear' : 'Cruise' };
    return {
      targetZone: zone,
      targetCadence: active?.kind === 'spinup' ? { min: active.rpm, label: 'Spin-Up!' } : undefined,
      controls: [
        { button: 'shiftersL', label: 'Left gun', active: gunL }, { button: 'dpad', label: 'Left gun', active: gunL },
        { button: 'shiftersR', label: 'Right gun', active: gunR },
        { button: 'a', label: 'Right gun', active: gunR }, { button: 'b', label: 'Right gun', active: gunR },
        { button: 'y', label: 'Right gun', active: gunR }, { button: 'z', label: 'Right gun', active: gunR },
        { button: 'paddles', label: 'Steer (optional)' },
      ],
      gears: false,
    };
  };

  const stageLeft = () => stage === 'cruise' ? cruiseS() - stageT : stage === 'attack' ? attackS() - stageT : stage === 'boss' ? bossTimeoutS() - bossT : warpS() - stageT;

  function hangarView(): HangarView {
    return {
      bank: Math.round(bankStart), sel: hangarSel, rows: hangarRows(), startSector, maxStartSector: mods.maxStartSector, autoInvest: autoInvestOn,
      autoLaunchS: HANGAR_AUTOLAUNCH_S, autoLaunchLeft: HANGAR_AUTOLAUNCH_S - hangarT, bestSector, best: Math.round(best), runs,
    };
  }

  return {
    update, hud,
    isOver: () => over,
    receive(a: unknown) {
      const act = a as { type?: string; row?: number };
      if (act?.type === 'hangarRow' && typeof act.row === 'number' && pending.length < 8) pending.push({ type: 'hangarRow', row: act.row });
    },
    dispose() { if (phase === 'run') persist(); },
    snapshot: (): SfSnapshot => {
      const bp = bossParts();
      return {
        t, phase, hangar: phase === 'hangar' ? hangarView() : null,
        stage, stageLeft: Math.max(0, stageLeft()), sector, sectorName: sectorTheme(sector).name, theme: (sector - 1) % SECTORS.length, scroll,
        shipX, hp, hpMax: hpMax(), shield, shieldMax: shieldMax(), invuln, lives, livesMax,
        score, combo, mult: mult(), thrust, overdrive, odWidth: odWidth(),
        gunL, gunR, credits, gunLevel, missilesLeft: missilesT,
        wingmen: Array.from({ length: wingCount() }, (_, i) => ({ ...wingPos(i), temp: i >= mods.wingmen })),
        scrap, bank: Math.round(bankStart + scrap),
        enemies: enemies.map(e => ({
          id: e.id, kind: e.kind, x: e.x, y: e.y, r: e.r, hp: e.hp, maxHp: e.maxHp, golden: e.golden, hurt: e.hurt,
          tell: e.kind === 'boss' ? e.st : (e.kind === 'diver' || e.kind === 'gunner') && e.st === 1 ? 1 - e.tmr / (e.kind === 'diver' ? 0.9 : 2) : 0,
          boss: e.boss, part: e.part, diving: e.kind === 'diver' && e.st === 2,
        })),
        shots: shots.map(b => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, kind: b.kind, side: b.side })),
        hazards: hazards.map(h => ({ kind: h.kind, x: h.x, y: h.y, r: h.r, spin: h.spin })),
        lances: lances.map(l => ({ x: l.x, w: l.w, tell: l.tell > 0 ? 1 - l.tell / l.tellMax : 1, active: l.active > 0, y0: l.y0 })),
        drops: drops.map((d): DropView => ({ id: d.id, kind: d.kind, power: d.power, x: d.x, y: d.y, value: d.value })),
        fx: fx.filter(f => t - f.t0 < 2), banners: banners.filter(b => t - b.t0 < b.life), toasts: toasts.filter(x => t - x.t0 < 5), cues: cues.slice(),
        boss: bp.length ? { name: BOSSES[bp[0].boss!].title, hp: bp.reduce((a, e) => a + Math.max(0, e.hp), 0), maxHp: bp[0].maxHp * (bp[0].boss === 'lancer' ? 2 : 1), leftS: Math.max(0, bossTimeoutS() - bossT) } : null,
        challenge: slip && slip.state !== 'idle' ? { kind: slip.kind, state: slip.state, progress: slip.progress, need: slip.need, left: Math.max(0, slip.left), x: slip.x, rpm: slip.rpm } : null,
        rapidLeft: rapidT,
        bossesDefeated: bosses, kills, over, hitFlash, shake, frozen: freezeT > 0,
        hooks: { boss: stage === 'boss', challenge: slip?.state === 'active' },
      };
    },
    summary: () => ({
      score: Math.round(score), sector, sectorsCleared, bossesDefeated: bosses, bossesEscaped, attackRuns: sectorsCleared + bossesEscaped + (stage === 'attack' || stage === 'boss' ? 1 : 0),
      kills, leaks, rocksHit, maxCombo, survivedS: Math.round(runT), overdriveS: Math.round(odSeconds), hp: Math.round(hp), distance: Math.round(distance),
      scrap: Math.round(scrap), bank: Math.round(bankStart + scrap), powerUps: powersTaken, goldens, slipstreams: slipsRidden, spinUps, rapidFireS: Math.round(rapidSeconds), novas, gunLevel, deaths,
      alive: over && lives === 0 ? 0 : 1, bestSector,
    }),
  };
}

function compact<T>(a: T[], dead: (x: T) => boolean) {
  let j = 0;
  for (let i = 0; i < a.length; i++) if (!dead(a[i])) a[j++] = a[i];
  a.length = j;
}
