// Crank Fighter sim: pure logic, deterministic (ctx.rng + fixed dt only).
import type { Button, GameContext, GameHud, GameSim } from '../../../contracts';

export const W = 100;
export const H = 100;
export const SHIP_Y = 90;
export type Side = 'L' | 'R';
export type EKind = 'grunt' | 'tough' | 'crosser' | 'boss';
export type Phase = 'cruise' | 'attack';

export const LEFT_BUTTONS: Button[] = ['shiftUpL', 'shiftDnL', 'up', 'down', 'left', 'right'];
export const RIGHT_BUTTONS: Button[] = ['shiftUpR', 'shiftDnR', 'a', 'b', 'y', 'z'];

interface Enemy { id: number; kind: EKind; x: number; y: number; x0: number; ph: number; hp: number; maxHp: number; r: number; dead: boolean }
interface Bullet { x: number; y: number; vx: number; vy: number; side: Side; dmg: number; target: number; dead: boolean }
interface Hazard { id: number; kind: 'rock' | 'bolt'; x: number; y: number; vx: number; vy: number; r: number }

export interface SfOpts { autopilot?: boolean }

export interface SfSnapshot {
  t: number; phase: Phase; phaseLeft: number; run: number;
  shipX: number; hp: number; hpMax: number; shield: number; shieldMax: number;
  score: number; combo: number; mult: number; thrust: number; overdrive: boolean;
  gunL: boolean; gunR: boolean; credits: number;
  enemies: Array<{ id: number; kind: EKind; x: number; y: number; r: number; hp: number; maxHp: number }>;
  bullets: Array<{ x: number; y: number; side: Side }>;
  hazards: Array<{ kind: 'rock' | 'bolt'; x: number; y: number; r: number }>;
  bossesDefeated: number; kills: number; over: boolean; hitFlash: number;
}

export function createSfSim(ctx: GameContext, opts?: SfOpts): GameSim & { snapshot(): SfSnapshot } {
  const T = ctx.tuning;
  const revsPerShot = T.num('revsPerShot', 0.4, 0.1, 3, 0.05, 'crank revs per shot (cadence = fire rate)');
  const maxCredits = T.num('maxCredits', 3, 1, 10, 1, 'banked shots (lets taps fire)');
  const shotDmg = T.num('shotDamage', 4, 0.5, 30, 0.5);
  const bulletSpeed = T.num('bulletSpeed', 95, 30, 300, 5);
  const thrustBase = T.num('thrustBase', 0.5, 0.1, 1.5, 0.05, 'scroll/thrust multiplier at 0 W');
  const thrustPerFtp = T.num('thrustPerFtp', 0.6, 0, 2, 0.05, 'extra thrust per FTP fraction');
  const thrustMax = T.num('thrustMax', 1.3, 0.5, 3, 0.05);
  const regenPerFtp = T.num('shieldRegenPerFtp', 5, 0, 30, 0.5, 'shield/s per FTP fraction');
  const regenDelay = T.num('shieldRegenDelayS', 2, 0, 10, 0.5);
  const shieldMaxT = T.num('shieldMax', 50, 10, 200, 5);
  const hpMaxT = T.num('hullHp', 100, 10, 500, 5);
  const odDps = T.num('overdriveDps', 70, 5, 500, 5, 'twin-beam damage/s during sprint');
  const odWidth = T.num('overdriveHalfWidth', 9, 2, 30, 1);
  const baseGrade = T.num('baseGradePct', 0.5, 0, 3, 0.1, 'gentle base grade (sim mode)');
  const attackGrade = T.num('attackGradePct', 3.5, 0, 8, 0.5, 'extra grade during attack run (climb)');
  const cruiseS = T.num('cruiseS', 150, 20, 900, 5, 'zone-2 cruise length');
  const attackS = T.num('attackS', 70, 20, 300, 5, 'dense-wave time before the boss arrives');
  const timeLimit = T.num('timeLimitS', 1200, 60, 7200, 30);
  const cruiseSpawn = T.num('cruiseSpawnS', 2.2, 0.3, 10, 0.1);
  const attackSpawn = T.num('attackSpawnS', 0.75, 0.2, 5, 0.05);
  const rockCruise = T.num('rockCruiseS', 5, 1, 20, 0.5);
  const rockAttack = T.num('rockAttackS', 2.8, 1, 20, 0.5);
  const crossChance = T.num('crosserChance', 0.25, 0, 1, 0.05);
  const toughChance = T.num('toughChance', 0.2, 0, 1, 0.05);
  const bossHp = T.num('bossHp', 260, 50, 3000, 10);
  const bossScale = T.num('bossHpScalePerRun', 0.35, 0, 2, 0.05);
  const steerSpeed = T.num('steerSpeed', 45, 10, 120, 5);
  const paddleNudge = T.num('paddleNudge', 1, 0, 3, 0.1, 'paddle steering strength');
  const comboWindow = T.num('comboWindowS', 4, 1, 15, 0.5);

  ctx.resistance.useVirtualGears(false);
  ctx.resistance.set({ id: 'base', mode: 'sim', gradePct: baseGrade() });

  let nid = 1, t = 0;
  let phase: Phase = 'cruise', phaseT = 0, run = 1, bossOn = false;
  let shipX = 50, hp = hpMaxT(), shield = shieldMaxT();
  let sinceHit = 99, hitFlash = 0;
  let score = 0, combo = 0, maxCombo = 0, comboT = 0, kills = 0, leaks = 0, bosses = 0, rocksHit = 0;
  let credits = 0, lastRevs = ctx.bike().crankRevs, nextSide: Side = 'L';
  let tapL = false, tapR = false, gunL = false, gunR = false;
  let spawnAcc = 0, rockAcc = 0, bossShotT = 1.5, distance = 0, odSeconds = 0;
  let over = false, overdrive = false, thrust = 1;
  const enemies: Enemy[] = [], bullets: Bullet[] = [], hazards: Hazard[] = [];
  const kindsKilled: Record<string, number> = { grunt: 0, tough: 0, crosser: 0, boss: 0 };
  const rng = () => ctx.rng();

  const fire = (side: Side) => {
    const half = (e: Enemy) => (side === 'L' ? e.x < W / 2 : e.x >= W / 2);
    const pend = new Map<number, number>();
    for (const b of bullets) if (!b.dead) pend.set(b.target, (pend.get(b.target) ?? 0) + b.dmg);
    let best: Enemy | null = null;
    for (const e of enemies) {
      if (e.dead || e.y < 0 || e.y > SHIP_Y - 4 || !half(e)) continue;
      if ((pend.get(e.id) ?? 0) >= e.hp && e.kind !== 'boss') continue;
      if (!best || e.y > best.y) best = e;
    }
    const sx = shipX + (side === 'L' ? -3 : 3);
    let dx = side === 'L' ? -0.25 : 0.25, dy = -1, target = -1;
    if (best) { dx = best.x - sx; dy = best.y - SHIP_Y; target = best.id; }
    const n = Math.hypot(dx, dy) || 1;
    bullets.push({ x: sx, y: SHIP_Y - 2, vx: (dx / n) * bulletSpeed(), vy: (dy / n) * bulletSpeed(), side, dmg: shotDmg(), target, dead: false });
  };

  const damage = (amt: number) => {
    sinceHit = 0; hitFlash = 0.3; combo = 0;
    const s = Math.min(shield, amt); shield -= s; hp -= amt - s;
    if (hp <= 0) { hp = 0; over = true; ctx.emit({ type: 'gameOver', data: { score: Math.round(score), bosses } }); }
  };

  const spawnEnemy = () => {
    const r = rng();
    const kind: EKind = rng() < crossChance() ? 'crosser' : rng() < toughChance() ? 'tough' : 'grunt';
    const x0 = 8 + rng() * 84;
    const hpv = kind === 'tough' ? 24 : kind === 'crosser' ? 10 : 8;
    enemies.push({ id: nid++, kind, x: x0, y: -4, x0, ph: r * 6.28, hp: hpv, maxHp: hpv, r: kind === 'tough' ? 4 : 3, dead: false });
  };
  const spawnRock = () => {
    const x = 6 + rng() * 88;
    hazards.push({ id: nid++, kind: 'rock', x, y: -5, vx: (rng() - 0.5) * 6, vy: 18 + rng() * 10, r: 3 + rng() * 2.5 });
  };
  const spawnBoss = () => {
    const h = bossHp() * (1 + bossScale() * (run - 1));
    enemies.push({ id: nid++, kind: 'boss', x: 50, y: -8, x0: 50, ph: 0, hp: h, maxHp: h, r: 9, dead: false });
    bossOn = true;
  };

  const killEnemy = (e: Enemy) => {
    e.dead = true; kills++; kindsKilled[e.kind]++;
    combo++; comboT = 0; maxCombo = Math.max(maxCombo, combo);
    const pts = e.kind === 'boss' ? 3000 : e.kind === 'tough' ? 300 : e.kind === 'crosser' ? 200 : 100;
    score += pts * Math.min(5, 1 + combo * 0.1) * (0.7 + 0.3 * thrust);
    if (e.kind === 'boss') {
      bosses++; bossOn = false; shield = shieldMaxT(); hp = Math.min(hpMaxT(), hp + 15);
      for (const o of enemies) if (o !== e) o.dead = true;
      ctx.emit({ type: 'bossDefeated', data: { run, n: bosses } });
      run++; setPhase('cruise');
    }
  };

  const setPhase = (p: Phase) => {
    phase = p; phaseT = 0;
    if (p === 'attack') { ctx.resistance.set({ id: 'attack', mode: 'sim', gradePct: attackGrade() }); ctx.emit({ type: 'attackRun', data: { run } }); }
    else ctx.resistance.clear('attack');
  };

  const autoSteer = (dt: number) => {
    let bestX = shipX, bestC = Infinity;
    for (let cx = 6; cx <= 94; cx += 2) {
      let c = 0.015 * Math.abs(cx - 50) + 0.02 * Math.abs(cx - shipX);
      for (const h of hazards) {
        const dy = SHIP_Y - h.y;
        if (dy < -6 || dy > 55) continue;
        const px = h.x + h.vx * Math.max(0, dy) / Math.max(5, h.vy);
        const gap = h.r + 5 - Math.abs(px - cx);
        if (gap > 0) c += gap * (3 + 40 / (4 + Math.max(0, dy)));
      }
      if (c < bestC) { bestC = c; bestX = cx; }
    }
    const step = steerSpeed() * thrust * dt;
    shipX += Math.max(-step, Math.min(step, bestX - shipX));
  };

  let lastT = 0;
  const update = (dt: number) => {
    if (over) return;
    t += dt;
    const bike = ctx.bike(), inp = ctx.input();
    thrust = Math.min(thrustMax(), thrustBase() + thrustPerFtp() * bike.ftpFraction);
    overdrive = bike.sprinting;
    if (overdrive) odSeconds += dt;
    distance += thrust * dt;

    // triggers
    const dRevs = bike.crankRevs - lastRevs; lastRevs = bike.crankRevs;
    credits = Math.min(maxCredits(), credits + Math.max(0, dRevs) / revsPerShot());
    if (opts?.autopilot) {
      gunL = enemies.some(e => !e.dead && e.y > 0 && e.x < W / 2);
      gunR = enemies.some(e => !e.dead && e.y > 0 && e.x >= W / 2);
    } else {
      gunL = LEFT_BUTTONS.some(b => inp.held.has(b)); gunR = RIGHT_BUTTONS.some(b => inp.held.has(b));
      if (LEFT_BUTTONS.some(b => inp.pressed.has(b))) tapL = true;
      if (RIGHT_BUTTONS.some(b => inp.pressed.has(b))) tapR = true;
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
    if (credits < 1) { /* taps stay pending until a credit arrives */ }
    if (!gunL && !gunR) { tapL = tapL && credits < 1; tapR = tapR && credits < 1; }

    // steering
    const manual = !opts?.autopilot && inp.paddleIdleS < 0.6;
    if (manual) shipX += (inp.paddleR - inp.paddleL) * paddleNudge() * steerSpeed() * thrust * dt;
    else autoSteer(dt);
    shipX = Math.max(5, Math.min(95, shipX));

    // phases
    phaseT += dt;
    if (phase === 'cruise' && phaseT >= cruiseS()) setPhase('attack');
    else if (phase === 'attack' && !bossOn && phaseT >= attackS()) spawnBoss();
    const attacking = phase === 'attack';
    // spawning (paused from regular waves while boss is out? no: lighter)
    spawnAcc += dt;
    const iv = (attacking ? attackSpawn() : cruiseSpawn()) * (bossOn ? 2.5 : 1);
    if (spawnAcc >= iv) { spawnAcc -= iv; spawnEnemy(); }
    rockAcc += dt;
    const rv = attacking ? rockAttack() : rockCruise();
    if (rockAcc >= rv) { rockAcc -= rv; spawnRock(); }

    // enemies
    for (const e of enemies) {
      if (e.dead) continue;
      if (e.kind === 'boss') {
        e.y = Math.min(22, e.y + 12 * dt);
        e.x = 50 + Math.sin(t * 0.6) * 30;
        bossShotT -= dt;
        if (bossShotT <= 0 && e.y >= 20) {
          bossShotT = 1.6;
          for (const a of [-0.25, 0, 0.25]) hazards.push({ id: nid++, kind: 'bolt', x: e.x, y: e.y + 6, vx: Math.sin(a) * 40 + (shipX - e.x) * 0.15, vy: 40, r: 1.6 });
        }
        continue;
      }
      e.y += (e.kind === 'tough' ? 9 : e.kind === 'crosser' ? 14 : 12) * (0.75 + 0.25 * thrust) * dt;
      if (e.kind === 'crosser') e.x = Math.max(4, Math.min(96, e.x0 + Math.sin(e.ph + e.y * 0.06) * 30 * (1 - Math.max(0, e.y) / 160)));
      if (e.y > H + 2) {
        e.dead = true; leaks++; damage(e.kind === 'tough' ? 10 : 6);
      } else if (Math.abs(e.x - shipX) < e.r + 3 && Math.abs(e.y - SHIP_Y) < e.r + 3) {
        e.dead = true; damage(8);
      }
    }

    // bullets
    for (const b of bullets) {
      if (b.dead) continue;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.y < -5 || b.x < -5 || b.x > W + 5) { b.dead = true; continue; }
      for (const e of enemies) {
        if (e.dead || e.y < -2) continue;
        if (Math.abs(b.x - e.x) < e.r + 1.5 && Math.abs(b.y - e.y) < e.r + 1.5) {
          b.dead = true; e.hp -= b.dmg; if (e.hp <= 0) killEnemy(e);
          break;
        }
      }
    }
    // overdrive beam
    if (overdrive) {
      for (const e of enemies) {
        if (e.dead || e.y < 0 || e.y > SHIP_Y) continue;
        if (Math.abs(e.x - shipX) < odWidth() + e.r) { e.hp -= odDps() * dt; if (e.hp <= 0) killEnemy(e); }
      }
    }

    // hazards
    for (const h of hazards) {
      h.x += h.vx * dt; h.y += h.vy * (0.75 + 0.25 * thrust) * dt;
      if (Math.abs(h.x - shipX) < h.r + 3 && Math.abs(h.y - SHIP_Y) < h.r + 3 && h.y < 1000) {
        h.y = 9999; if (h.kind === 'rock') rocksHit++; damage(h.kind === 'rock' ? 12 : 8);
      }
    }
    compact(enemies, e => e.dead); compact(bullets, b => b.dead); compact(hazards, h => h.y > H + 6);

    // shield / combo / timers
    sinceHit += dt; hitFlash = Math.max(0, hitFlash - dt);
    if (sinceHit >= regenDelay()) shield = Math.min(shieldMaxT(), shield + regenPerFtp() * bike.ftpFraction * dt);
    comboT += dt; if (comboT > comboWindow()) combo = 0;
    score += dt * 5 * thrust;
    if (t >= timeLimit() && !over) { over = true; ctx.emit({ type: 'timeUp', data: { score: Math.round(score) } }); }
    if (over && t - lastT >= 0) { try { const prev = ctx.load<{ best?: number }>()?.best ?? 0; if (score > prev) ctx.save({ best: Math.round(score) }); } catch { /* ignore */ } }
    ctx.debug('phase', phase); ctx.debug('thrust', Math.round(thrust * 100) / 100); ctx.debug('credits', Math.round(credits * 10) / 10);
  };

  const hud = (): GameHud => ({
    targetZone: phase === 'attack' ? { min: 4, max: 4, label: bossOn ? 'Boss!' : 'Attack run' } : { min: 2, max: 2, label: 'Cruise' },
    controls: [
      { button: 'shiftersL', label: 'Left gun', active: gunL }, { button: 'dpad', label: 'Left gun', active: gunL },
      { button: 'shiftersR', label: 'Right gun', active: gunR },
      { button: 'a', label: 'Right gun', active: gunR }, { button: 'b', label: 'Right gun', active: gunR },
      { button: 'y', label: 'Right gun', active: gunR }, { button: 'z', label: 'Right gun', active: gunR },
      { button: 'paddles', label: 'Steer (optional)' },
    ],
    gears: false,
  });

  return {
    update, hud,
    isOver: () => over,
    snapshot: () => ({
      t, phase, phaseLeft: phase === 'cruise' ? Math.max(0, cruiseS() - phaseT) : bossOn ? 0 : Math.max(0, attackS() - phaseT), run,
      shipX, hp, hpMax: hpMaxT(), shield, shieldMax: shieldMaxT(), score, combo, mult: Math.min(5, 1 + combo * 0.1), thrust, overdrive,
      gunL, gunR, credits,
      enemies: enemies.map(e => ({ id: e.id, kind: e.kind, x: e.x, y: e.y, r: e.r, hp: e.hp, maxHp: e.maxHp })),
      bullets: bullets.map(b => ({ x: b.x, y: b.y, side: b.side })),
      hazards: hazards.map(h => ({ kind: h.kind, x: h.x, y: h.y, r: h.r })),
      bossesDefeated: bosses, kills, over, hitFlash,
    }),
    summary: () => ({
      score: Math.round(score), bossesDefeated: bosses, attackRuns: run - 1 + (phase === 'attack' ? 1 : 0), kills, leaks, rocksHit,
      maxCombo, survivedS: Math.round(t), overdriveS: Math.round(odSeconds), hp: Math.round(hp), distance: Math.round(distance),
      alive: hp > 0 ? 1 : 0,
    }),
  };
}

function compact<T>(a: T[], dead: (x: T) => boolean) {
  let j = 0;
  for (let i = 0; i < a.length; i++) if (!dead(a[i])) a[j++] = a[i];
  a.length = j;
}
