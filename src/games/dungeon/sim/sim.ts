import type { BikeState, GameContext, ControlHint, GameHud, GameSim, InputState, Seconds } from '../../../contracts';
import { generateWorld, tileAt, TILE, type EnemyKind, type Room, type World } from './world';
import {
  ELEMENT_COLORS, RARITY_COLORS, SLOTS, levelMult, makeGear, makeWeapon, rollRarity, sellValue, starterWeapon, weaponScore,
  type Gear, type Rarity, type Slot, type Weapon,
} from './loot';
import type { BulletView, DropView, DungeonSnapshot, EnemyView, Fx, Toast } from './types';

interface Enemy {
  id: number; kind: EnemyKind | 'boss'; x: number; y: number; r: number; hp: number; maxHp: number;
  speed: number; contact: number; contactCd: number; fireCd: number; fireCd2: number; room: number; alive: boolean; spin: number;
  hurtT: number; slowT: number; dotT: number; dotDps: number; tell: number; state: number; vx: number; vy: number; xp: number; wob: number;
  summoned: number; variant: number;
}
interface Bullet {
  x: number; y: number; vx: number; vy: number; r: number; dmg: number; life: number; age: number; friendly: boolean;
  w?: Weapon; hits?: number[]; pierce: number; bounce: number; crit?: boolean;
}
interface Drop extends DropView { item?: Weapon | Gear; value: number }
interface Ctl { mx: number; my: number; dash: boolean; potion: boolean; aimAuto: boolean; aimVec: { x: number; y: number } | null }

const ENEMY_DEF: Record<EnemyKind, { hp: number; speed: number; r: number; contact: number; xp: number }> = {
  chaser:   { hp: 40, speed: 2.8, r: 0.4, contact: 8, xp: 4 },
  bat:      { hp: 22, speed: 3.8, r: 0.32, contact: 5, xp: 3 },
  spitter:  { hp: 65, speed: 1.6, r: 0.42, contact: 5, xp: 6 },
  archer:   { hp: 50, speed: 2.0, r: 0.38, contact: 5, xp: 6 },
  brute:    { hp: 170, speed: 1.4, r: 0.62, contact: 14, xp: 12 },
  bomber:   { hp: 35, speed: 3.3, r: 0.36, contact: 0, xp: 5 },
  summoner: { hp: 90, speed: 1.4, r: 0.42, contact: 5, xp: 10 },
};
const BOSS_NAMES = ['Slime Monarch', 'Bone Lord', 'Ogre Warchief', 'The Lich'];
const PLAYER_R = 0.35, MAX_POTIONS = 3, MAX_FX = 140;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface DungeonOpts { seed?: number; autopilot?: boolean; floor?: number; fresh?: boolean }
interface Hero { floor: number; level: number; xp: number; coins: number; potions: number; weapon: Weapon; gear: Partial<Record<Slot, Gear>> }
interface Save { bestFloor?: number; wins?: number; bestTimeS?: number; hero?: Hero }

export function createDungeonSim(ctx: GameContext, opts?: DungeonOpts): GameSim {
  const autopilot = !!opts?.autopilot;
  const tn = ctx.tuning;
  const baseSpeed = tn.num('baseSpeed', 4.2, 1, 10, 0.1, 'tiles/s at 90 rpm');
  const spd0 = tn.num('speedAt0rpm', 0.35, 0, 2, 0.05);
  const spd60 = tn.num('speedAt60rpm', 0.8, 0, 2, 0.05);
  const spd90 = tn.num('speedAt90rpm', 1.0, 0, 2, 0.05);
  const spd110 = tn.num('speedAt110rpm', 1.15, 0, 2, 0.05);
  const revsPerShot = tn.num('revsPerShot', 0.5, 0.1, 4, 0.05, 'crank revs per shot at weapon rate 1');
  const baseDamage = tn.num('baseDamage', 10, 1, 100, 1, 'x weapon dmg x clamp(ftpFraction,0.3,2.5)');
  const regenPerS = tn.num('regenPerS', 2, 0, 20, 0.5, 'HP/s per 100 max HP in zone 2 (x2 out of combat)');
  const dashCooldown = tn.num('dashCooldown', 2, 0.5, 10, 0.5);
  const maxHpT = tn.num('playerHp', 100, 20, 500, 10);
  const enemyDmgScale = tn.num('enemyDamageScale', 0.8, 0.1, 3, 0.1);
  const enemyHpMult = tn.num('enemyHpMult', 1.5, 0.2, 5, 0.1, 'base enemy HP multiplier');
  const enemyHpGrowth = tn.num('enemyHpGrowth', 1.26, 1, 2, 0.01, 'enemy HP multiplier per floor');
  const bossHpT = tn.num('bossHp', 1800, 100, 20000, 50, 'floor-1 boss HP (scales with enemyHpGrowth)');
  const shieldPeriod = tn.num('bossShieldPeriodS', 45, 10, 120, 5);
  const shieldDur = tn.num('bossShieldDurS', 15, 1, 60, 1);
  const shieldLeak = tn.num('bossShieldLeak', 0.2, 0, 1, 0.05, 'damage fraction through shield when not sprinting');
  const sprintMult = tn.num('bossSprintDamageMult', 3, 1, 10, 0.5);
  const itemDropPct = tn.num('itemDropPct', 10, 0, 100, 1, '% chance an enemy drops a weapon/gear');
  const terrainGrade = tn.num('gradeTerrain', 1, 0, 10, 0.5);
  const swampGrade = tn.num('gradeSwamp', 4, 0, 12, 0.5);
  const woundedGrade = tn.num('gradeWounded', 2, 0, 10, 0.5);
  const woundedFrac = tn.num('woundedHpFrac', 0.4, 0.1, 0.9, 0.05);
  const surgeGrade = tn.num('gradeBossSurge', 5, 0, 12, 0.5);
  const aimTurn = tn.num('aimTurnRate', 2.0, 0.5, 10, 0.1, 'rad/s at full paddle');
  const autoMove = tn.bool('autoMove', true, 'bot steers (explore, kite, dodge, stairs); D-pad overrides');
  const autoAimIdle = tn.num('autoAimIdleS', 1.5, 0.2, 10, 0.1);
  const resumeRun = tn.bool('resumeRun', true, 'continue the saved hero/floor');

  const rng = () => ctx.rng();
  const saved = ctx.load<Save>() ?? {};
  const resume = !opts?.fresh && !autopilot && resumeRun() && saved.hero ? saved.hero : null;

  // ---------- hero ----------
  const P = {
    x: 0, y: 0, hp: 0, maxHp: 0, potions: resume?.potions ?? MAX_POTIONS, dashCd: 0, dashT: 0, dashDx: 0, dashDy: 0,
    invuln: 0, hurtT: -99, aim: 0, aimAuto: true, lastShotRevs: ctx.bike().crankRevs, onSwamp: false, speedMult: 1, moveAng: 0, moving: false,
    level: resume?.level ?? 1, xp: resume?.xp ?? 0, coins: resume?.coins ?? 0,
  };
  let weapon: Weapon = resume?.weapon ?? starterWeapon();
  const gear: Partial<Record<Slot, Gear>> = { ...(resume?.gear ?? {}) };
  const xpNext = (L: number) => Math.round(30 * Math.pow(1.32, L - 1));
  const gearSum = (k: keyof Gear['stats']) => SLOTS.reduce((a, s) => a + (gear[s]?.stats[k] ?? 0), 0);
  function recomputeHp(heal: boolean) {
    const frac = P.maxHp > 0 ? P.hp / P.maxHp : 1;
    P.maxHp = maxHpT() + 10 * (P.level - 1) + gearSum('maxHp');
    P.hp = heal ? P.maxHp : clamp(frac * P.maxHp, 1, P.maxHp);
  }
  recomputeHp(true);

  // ---------- floor state ----------
  let floor = opts?.floor ?? resume?.floor ?? 1;
  let world!: World;
  let enemies: Enemy[] = [];
  let boss!: Enemy;
  let current = 0, safeRoom = 0, bossStarted = false, bossT = 0;
  const bullets: Bullet[] = [];
  const drops: Drop[] = [];
  const fx: Fx[] = [];
  const toasts: Toast[] = [];
  let nextId = 1;
  let t = 0, kills = 0, deaths = 0, damageDealt = 0, roomsCleared = 0, bossDefeated = 0, floorsCleared = 0;
  let navPath: Array<{ x: number; y: number }> = [], navKey = '', navAge = 99;

  const hpMul = () => enemyHpMult() * Math.pow(enemyHpGrowth(), floor - 1);
  const dmgMul = () => Math.pow(1.12, floor - 1);
  function spawnEnemy(kind: EnemyKind, x: number, y: number, room: number): Enemy {
    const d = ENEMY_DEF[kind], hp = d.hp * hpMul();
    const e: Enemy = {
      id: nextId++, kind, x, y, r: d.r, hp, maxHp: hp, speed: d.speed, contact: d.contact * dmgMul(), contactCd: 0,
      fireCd: 0.8 + rng() * 1.5, fireCd2: 2 + rng() * 2, room, alive: true, spin: 0, hurtT: -99, slowT: 0, dotT: 0, dotDps: 0,
      tell: 0, state: 0, vx: 0, vy: 0, xp: d.xp * (1 + 0.3 * (floor - 1)), wob: rng() * 6, summoned: 0, variant: 0,
    };
    enemies.push(e);
    return e;
  }
  function buildFloor() {
    world = generateWorld(rng, floor);
    enemies = []; bullets.length = 0; drops.length = 0;
    for (const room of world.rooms) for (const s of room.spawns) spawnEnemy(s.kind, s.x, s.y, room.id);
    const br = world.rooms.find((r) => r.boss)!;
    const hp = bossHpT() * hpMul();
    boss = {
      id: nextId++, kind: 'boss', x: br.x0 + br.w / 2, y: br.y0 + br.h / 2 + 1, r: 1.1, hp, maxHp: hp, speed: 1.1, contact: 18 * dmgMul(),
      contactCd: 0, fireCd: 2, fireCd2: 1.2, room: br.id, alive: true, spin: 0, hurtT: -99, slowT: 0, dotT: 0, dotDps: 0, tell: 0, state: 0,
      vx: 0, vy: 0, xp: 120 * (1 + 0.3 * (floor - 1)), wob: 0, summoned: 0, variant: (floor - 1) % 4,
    };
    enemies.push(boss);
    current = 0; safeRoom = 0; bossStarted = false; bossT = 0; navPath = []; navKey = '';
    P.x = world.spawn.x; P.y = world.spawn.y;
    markSeen(world.rooms[0]);
  }
  function markSeen(r: Room) { r.seen = true; for (const n of world.adj[r.id]) world.rooms[n].seen = true; }
  buildFloor();
  ctx.resistance.useVirtualGears(true, 'L'); // right shifters are dash/potion

  // ---------- fx ----------
  function addFx(f: Omit<Fx, 't0'>) { fx.push({ ...f, t0: t }); if (fx.length > MAX_FX) fx.splice(0, fx.length - MAX_FX); }
  function toast(text: string, color = '#fff') { toasts.push({ text, color, t0: t }); if (toasts.length > 5) toasts.shift(); }

  // ---------- resistance (only sets on change) ----------
  const resState = new Map<string, number | null>();
  function resSync(id: string, grade: number | null) {
    if (resState.get(id) === grade) return;
    resState.set(id, grade);
    if (grade === null) ctx.resistance.clear(id); else ctx.resistance.set({ id, mode: 'sim', gradePct: grade });
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
  const blocked = (x: number, y: number, r: number) =>
    solid(Math.floor(x - r), Math.floor(y - r)) || solid(Math.floor(x + r), Math.floor(y - r)) ||
    solid(Math.floor(x - r), Math.floor(y + r)) || solid(Math.floor(x + r), Math.floor(y + r));
  function move(e: { x: number; y: number }, dx: number, dy: number, r: number) {
    if (!blocked(e.x + dx, e.y, r)) e.x += dx;
    if (!blocked(e.x, e.y + dy, r)) e.y += dy;
  }
  const inRoom = (room: Room, x: number, y: number, inset: number) =>
    x >= room.x0 + inset && x <= room.x0 + room.w - inset && y >= room.y0 + inset && y <= room.y0 + room.h - inset;
  const activeRoom = () => world.rooms[current];
  const liveInRoom = (rid: number) => enemies.filter((e) => e.alive && e.room === rid && (e.kind !== 'boss' || bossStarted));

  function speedCurve(c: number): number {
    const pts: Array<[number, number]> = [[0, spd0()], [60, spd60()], [90, spd90()], [110, spd110()]];
    if (c <= 0) return pts[0][1];
    for (let i = 1; i < pts.length; i++) if (c <= pts[i][0]) {
      const [c0, v0] = pts[i - 1], [c1, v1] = pts[i];
      return v0 + ((c - c0) / (c1 - c0)) * (v1 - v0);
    }
    return pts[3][1];
  }

  function bossShield(): { shielded: boolean; leftS: number; nextS: number } {
    if (!bossStarted || !boss.alive) return { shielded: false, leftS: 0, nextS: 0 };
    const per = shieldPeriod(), dur = Math.min(shieldDur(), per - 1);
    if (bossT < per) return { shielded: false, leftS: 0, nextS: per - bossT };
    const ph = bossT % per;
    return ph < dur ? { shielded: true, leftS: dur - ph, nextS: 0 } : { shielded: false, leftS: 0, nextS: per - ph };
  }

  // ---------- loot ----------
  function dropAt(x: number, y: number, kind: Drop['kind'], value: number, item?: Weapon | Gear) {
    const a = rng() * Math.PI * 2, d = 0.3 + rng() * 0.8;
    drops.push({
      id: nextId++, kind, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, value, item,
      rarity: (item?.rarity ?? 0) as Rarity, style: item && 'base' in item ? item.base : undefined, slot: item && 'slot' in item ? item.slot : undefined,
    });
  }
  function dropItem(x: number, y: number, bump: number) {
    const lvl = floor + (rng() < 0.3 ? 1 : 0), rar = rollRarity(rng, bump);
    if (rng() < 0.45) dropAt(x, y, 'weapon', 0, makeWeapon(rng, lvl, rar));
    else dropAt(x, y, 'gear', 0, makeGear(rng, lvl, rar));
  }
  function coinValue() { return Math.round((1 + rng() * 2) * (1 + 0.3 * (floor - 1))); }
  function collect(d: Drop) {
    if (d.kind === 'coin') { P.coins += d.value; addFx({ kind: 'text', x: P.x, y: P.y - 0.6, life: 0.8, color: '#ffd84a', text: `+${d.value}` }); return; }
    if (d.kind === 'potion') {
      if (P.potions < MAX_POTIONS) { P.potions++; toast('+1 Potion', '#ff6b8a'); }
      else { const v = 10 * floor; P.coins += v; toast(`Potion sold +${v}c`, '#ffd84a'); }
      return;
    }
    const it = d.item!;
    const col = RARITY_COLORS[it.rarity];
    if ('base' in it) {
      if (it.score > weaponScore(weapon)) {
        weapon = it; toast(`Equipped ${it.name}`, col);
        addFx({ kind: 'levelup', x: P.x, y: P.y, life: 0.8, color: col, r: 1.4 });
      } else { const v = sellValue(it.level, it.rarity); P.coins += v; toast(`Sold ${it.name} +${v}c`, '#bbb'); }
    } else {
      const cur = gear[it.slot];
      if (!cur || it.score > cur.score) {
        gear[it.slot] = it; recomputeHp(false); toast(`Equipped ${it.name}`, col);
        addFx({ kind: 'levelup', x: P.x, y: P.y, life: 0.8, color: col, r: 1.2 });
      } else { const v = sellValue(it.level, it.rarity); P.coins += v; toast(`Sold ${it.name} +${v}c`, '#bbb'); }
    }
  }

  // ---------- combat ----------
  function hurtPlayer(dmg: number) {
    if (P.invuln > 0) return;
    const armor = clamp(gearSum('armor'), 0, 0.75);
    P.hp -= dmg * enemyDmgScale() * (1 - armor);
    P.hurtT = t;
  }
  function damageEnemy(e: Enemy, raw: number, bike: Readonly<BikeState>, crit = false, color = '#fff') {
    if (!e.alive) return;
    let dmg = raw;
    if (e.kind === 'boss') {
      const sh = bossShield();
      if (sh.shielded) dmg *= bike.sprinting ? sprintMult() : shieldLeak();
    }
    const applied = Math.min(dmg, e.hp);
    e.hp -= dmg; damageDealt += applied; e.hurtT = t;
    if (crit || dmg >= e.maxHp * 0.08 || e.kind === 'boss') {
      addFx({ kind: 'text', x: e.x + (rng() - 0.5) * 0.4, y: e.y - e.r - 0.2, life: 0.7, color: crit ? '#ffd84a' : color, text: String(Math.round(dmg)), big: crit });
    }
    if (e.hp <= 0) killEnemy(e);
  }
  function killEnemy(e: Enemy) {
    e.alive = false; kills++;
    addFx({ kind: 'death', x: e.x, y: e.y, life: 0.5, color: e.kind === 'boss' ? '#c0a' : '#ddd', r: e.r * 2 });
    ctx.emit({ type: 'kill', data: { kind: e.kind, room: e.room } });
    gainXp(e.xp);
    const n = e.kind === 'boss' ? 12 : 1 + (rng() < 0.4 ? 1 : 0);
    for (let i = 0; i < n; i++) dropAt(e.x, e.y, 'coin', coinValue());
    if (e.kind === 'boss') {
      dropItem(e.x, e.y, 2); dropItem(e.x, e.y, 1); dropAt(e.x, e.y, 'potion', 0);
      bossDefeated++;
      toast(`${BOSS_NAMES[e.variant]} defeated! Stairs open.`, '#ff8c2a');
      ctx.emit({ type: 'bossDefeated', data: { timeS: Math.round(t), floor } });
    } else if (e.summoned === 0) {
      if (rng() * 100 < itemDropPct()) dropItem(e.x, e.y, 0);
      if (rng() < 0.03) dropAt(e.x, e.y, 'potion', 0);
    }
  }
  function gainXp(v: number) {
    P.xp += v;
    while (P.xp >= xpNext(P.level)) {
      P.xp -= xpNext(P.level); P.level++;
      recomputeHp(true);
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
    for (const e of liveInRoom(current)) {
      if (exclude?.includes(e.id)) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  function fire(bike: Readonly<BikeState>) {
    const w = weapon;
    const n = w.count;
    for (let i = 0; i < n; i++) {
      const off = n > 1 ? (i / (n - 1) - 0.5) * w.spread : 0;
      const jitter = w.base === 'flame' ? (rng() - 0.5) * 0.25 : 0;
      const a = P.aim + off + jitter;
      const critCh = gearSum('crit') + (w.element === 'arcane' ? 0.08 : 0) + 0.04;
      const crit = rng() < critCh;
      const dmg = baseDamage() * w.dmg * clamp(bike.ftpFraction, 0.3, 2.5) * (1 + 0.06 * w.plus) * (1 + 0.04 * (P.level - 1) + gearSum('dmgPct')) * (crit ? 2 : 1);
      const sp = w.speed * (w.base === 'flame' ? 0.85 + rng() * 0.3 : 1);
      bullets.push({
        x: P.x + Math.cos(a) * 0.3, y: P.y + Math.sin(a) * 0.3, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        r: w.base === 'orb' ? 0.3 : w.base === 'flame' ? 0.22 : w.base === 'pellet' ? 0.14 : 0.2,
        dmg, life: w.range / w.speed, age: 0, friendly: true, w, hits: [], pierce: w.pierce, bounce: w.bounce, crit,
      });
    }
    if (w.base !== 'flame') addFx({ kind: 'muzzle', x: P.x + Math.cos(P.aim) * 0.45, y: P.y + Math.sin(P.aim) * 0.45, life: 0.08, color: ELEMENT_COLORS[w.element] });
  }

  function onHit(b: Bullet, e: Enemy, bike: Readonly<BikeState>) {
    const w = b.w!, col = ELEMENT_COLORS[w.element];
    damageEnemy(e, b.dmg, bike, b.crit, col);
    addFx({ kind: 'hit', x: b.x, y: b.y, life: 0.2, color: col, r: 0.4 });
    if (w.element === 'frost') e.slowT = 1.5;
    if (w.element === 'fire' || w.element === 'venom') { e.dotT = w.element === 'venom' ? 3 : 1.5; e.dotDps = Math.max(e.dotDps * 0.5, b.dmg * 0.25); }
    if (w.blast > 0) {
      addFx({ kind: 'boom', x: b.x, y: b.y, life: 0.35, color: col, r: w.blast });
      for (const o of liveInRoom(current)) if (o !== e && Math.hypot(o.x - b.x, o.y - b.y) < w.blast + o.r) damageEnemy(o, b.dmg * 0.6, bike, false, col);
    }
    const chains = w.chain + (w.element === 'storm' && rng() < 0.25 ? 1 : 0);
    if (chains > 0) {
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
  }

  // ---------- input ----------
  function readCtl(input: Readonly<InputState>): Ctl {
    if (autopilot) return autopilotCtl();
    const h = input.held, mode = ctx.profile.settings.aimMode;
    let mx = (h.has('right') ? 1 : 0) - (h.has('left') ? 1 : 0), my = (h.has('down') ? 1 : 0) - (h.has('up') ? 1 : 0);
    const inv = mx && my ? Math.SQRT1_2 : 1; mx *= inv; my *= inv;
    const buttons = mode === 'buttons';
    let aimVec: Ctl['aimVec'] = null;
    if (buttons) {
      // Right-hood diamond: Y up, Z left, A right, B down.
      const ax = (h.has('a') ? 1 : 0) - (h.has('z') ? 1 : 0), ay = (h.has('b') ? 1 : 0) - (h.has('y') ? 1 : 0);
      if (ax || ay) aimVec = { x: ax, y: ay };
    } else if (mode === 'axes') {
      if (Math.hypot(input.paddleL, input.paddleR) > 0.25) aimVec = { x: input.paddleL, y: input.paddleR };
    }
    let ap: Ctl | null = null;
    if (autoMove() && !mx && !my) { ap = autopilotCtl(); mx = ap.mx; my = ap.my; }
    const aimAuto = mode === 'auto' || (mode !== 'buttons' && input.paddleIdleS > autoAimIdle() && !aimVec);
    return {
      mx, my, aimAuto, aimVec,
      dash: input.pressed.has('shiftUpR'),
      potion: input.pressed.has('shiftDnR') || (!!ap && P.hp < P.maxHp * 0.25 && P.potions > 0),
    };
  }

  /** Tile BFS from the player to (tx,ty); returns waypoints (tile centres). */
  function findPath(tx: number, ty: number): Array<{ x: number; y: number }> {
    const W = world.w, sx = Math.floor(P.x), sy = Math.floor(P.y);
    const prev = new Int32Array(W * world.h).fill(-1);
    const start = sy * W + sx, goal = ty * W + tx;
    prev[start] = start;
    const q = [start];
    for (let qi = 0; qi < q.length; qi++) {
      const c = q[qi];
      if (c === goal) break;
      const cx = c % W, cy = (c - cx) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy, ni = ny * W + nx;
        if (nx < 0 || ny < 0 || nx >= W || ny >= world.h || prev[ni] >= 0 || solid(nx, ny)) continue;
        prev[ni] = c; q.push(ni);
      }
    }
    if (prev[goal] < 0) return [];
    const out: Array<{ x: number; y: number }> = [];
    for (let c = goal; c !== start; c = prev[c]) out.push({ x: (c % W) + 0.5, y: Math.floor(c / W) + 0.5 });
    return out.reverse();
  }
  function navTarget(): { key: string; x: number; y: number } | null {
    if (!boss.alive) return { key: 'stairs', x: Math.floor(world.stairs.x), y: Math.floor(world.stairs.y) };
    // nearest uncleared, non-boss room by room-graph distance; boss room last
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

  function autopilotCtl(): Ctl {
    let mx = 0, my = 0, dash = false;
    const near = nearestEnemy();
    const room = activeRoom();
    if (near && room.locked) {
      const dx = near.x - P.x, dy = near.y - P.y, d = Math.hypot(dx, dy) || 1;
      // stand off at a comfortable fraction of weapon range (flamers fight up close)
      const reach = clamp(weapon.range * 0.6, 1.8, 5);
      const want = near.kind === 'bomber' ? Math.max(reach, 3) : near.kind === 'chaser' || near.kind === 'brute' ? Math.min(reach, 3.5) : reach;
      const s = d > want + 1 ? 1 : d < want - 1 ? -1 : 0;
      mx = (dx / d) * s; my = (dy / d) * s;
      if (s === 0) { mx = -dy / d * 0.6; my = dx / d * 0.6; } // circle-strafe
      for (const b of bullets) {
        if (b.friendly) continue;
        const bx = b.x - P.x, by = b.y - P.y, bd = Math.hypot(bx, by);
        if (bd < 2.2 && bd > 0.01) { mx -= (bx / bd) * 1.2; my -= (by / bd) * 1.2; }
      }
      const cx = room.x0 + room.w / 2 - P.x, cy = room.y0 + room.h / 2 - P.y;
      if (!inRoom(room, P.x, P.y, 1.6)) { mx += cx * 0.2; my += cy * 0.2; }
      if (d < 1.4 && P.hp < P.maxHp * 0.6 && P.dashCd <= 0) { dash = true; mx = -dx / d; my = -dy / d; }
    } else if (!drops.some((d) => Math.hypot(d.x - P.x, d.y - P.y) < 6)) {
      const tgt = navTarget();
      if (tgt) {
        if (tgt.key !== navKey || navAge > 1.5 || !navPath.length) { navPath = findPath(tgt.x, tgt.y); navKey = tgt.key; navAge = 0; }
        while (navPath.length > 1 && Math.hypot(navPath[0].x - P.x, navPath[0].y - P.y) < 0.45) navPath.shift();
        const wp = navPath[0];
        if (wp) { mx = wp.x - P.x; my = wp.y - P.y; }
      }
    }
    const n = Math.hypot(mx, my);
    if (n > 1) { mx /= n; my /= n; }
    return { mx, my, dash, potion: P.hp < P.maxHp * 0.35 && P.potions > 0, aimAuto: true, aimVec: null };
  }

  // ---------- update ----------
  function update(dt: Seconds) {
    t += dt; navAge += dt;
    const bike = ctx.bike(), input = ctx.input();
    const ctl = readCtl(input);

    // --- player movement
    P.dashCd = Math.max(0, P.dashCd - dt);
    P.invuln = Math.max(0, P.invuln - dt);
    const tile = tileAt(world, Math.floor(P.x), Math.floor(P.y));
    P.onSwamp = tile === TILE.SWAMP;
    P.speedMult = speedCurve(bike.cadence3s) * (1 + gearSum('speed')) * (P.onSwamp ? 0.75 : 1);
    if (ctl.dash && P.dashCd <= 0 && P.dashT <= 0) {
      let dx = ctl.mx, dy = ctl.my;
      if (!dx && !dy) { dx = Math.cos(P.aim); dy = Math.sin(P.aim); }
      const n = Math.hypot(dx, dy) || 1;
      P.dashDx = dx / n; P.dashDy = dy / n; P.dashT = 0.15; P.dashCd = dashCooldown(); P.invuln = Math.max(P.invuln, 0.3);
    }
    if (ctl.potion && P.potions > 0 && P.hp < P.maxHp) {
      P.potions--; P.hp = Math.min(P.maxHp, P.hp + P.maxHp * 0.45);
      addFx({ kind: 'levelup', x: P.x, y: P.y, life: 0.6, color: '#ff6b8a', r: 1 });
    }
    P.moving = false;
    if (P.dashT > 0) {
      P.dashT -= dt; P.moving = true;
      move(P, P.dashDx * 14 * dt, P.dashDy * 14 * dt, PLAYER_R);
    } else {
      const sp = baseSpeed() * P.speedMult * dt;
      if (ctl.mx || ctl.my) { move(P, ctl.mx * sp, ctl.my * sp, PLAYER_R); P.moveAng = Math.atan2(ctl.my, ctl.mx); P.moving = sp > 0; }
    }

    // --- room entry
    const room = activeRoom();
    if (!inRoom(room, P.x, P.y, 0)) {
      for (const r of world.rooms) if (r.id !== current && inRoom(r, P.x, P.y, 0.75)) {
        room.locked = false; current = r.id; markSeen(r);
        if (!r.cleared) {
          r.locked = true;
          if (r.boss && !bossStarted) {
            bossStarted = true; bossT = 0;
            toast(`${BOSS_NAMES[boss.variant]} awakens!`, '#ff5a5a');
            ctx.emit({ type: 'bossStart', data: { room: r.id, floor } });
          }
        } else safeRoom = r.id;
        break;
      }
    }

    // --- stairs
    if (!boss.alive && tileAt(world, Math.floor(P.x), Math.floor(P.y)) === TILE.STAIRS) descend();

    // --- aim
    const target = nearestEnemy();
    const mode = ctx.profile.settings.aimMode;
    if (ctl.aimVec) P.aim = Math.atan2(ctl.aimVec.y, ctl.aimVec.x);
    else if (ctl.aimAuto) {
      if (target) {
        // lead the target a little for slow projectiles
        const d = Math.hypot(target.x - P.x, target.y - P.y), lead = d / weapon.speed;
        P.aim = Math.atan2(target.y + target.vy * lead - P.y, target.x + target.vx * lead - P.x);
      } else if (ctl.mx || ctl.my) P.aim = P.moveAng;
    } else if (mode === 'rotate' || mode === 'auto') P.aim += (input.paddleR - input.paddleL) * aimTurn() * dt;
    P.aimAuto = ctl.aimAuto;

    // --- firing (only with something to shoot at, so coins/corridors stay calm)
    const revs = bike.crankRevs, per = revsPerShot() / weapon.rate;
    if (revs < P.lastShotRevs) P.lastShotRevs = revs;
    let shots = 0;
    while (revs - P.lastShotRevs >= per && shots < 6) {
      P.lastShotRevs += per; shots++;
      if (target || !ctl.aimAuto) fire(bike);
    }
    if (revs - P.lastShotRevs >= per) P.lastShotRevs = revs;

    // --- bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
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
        if (dead && b.w?.blast) onHitGround(b, bike);
      }
      if (!dead && b.friendly) {
        for (const e of liveInRoom(current)) {
          if (b.hits!.includes(e.id)) continue;
          if (Math.hypot(e.x - b.x, e.y - b.y) < e.r + b.r) {
            b.hits!.push(e.id); onHit(b, e, bike);
            if (b.pierce-- <= 0) { dead = true; break; }
          }
        }
      } else if (!dead && !b.friendly && Math.hypot(P.x - b.x, P.y - b.y) < PLAYER_R + b.r) { hurtPlayer(b.dmg); dead = true; }
      if (dead) bullets.splice(i, 1);
    }

    // --- enemies
    if (bossStarted && boss.alive) bossT += dt;
    const live = liveInRoom(current);
    for (const e of live) updateEnemy(e, dt, bike);
    // separation so packs don't stack
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
    if (cur.locked && liveInRoom(cur.id).length === 0 && (!cur.boss || !boss.alive)) {
      cur.locked = false; cur.cleared = true; safeRoom = cur.id;
      roomsCleared++;
      ctx.emit({ type: 'roomCleared', data: { room: cur.id, floor } });
      if (cur.chest && !cur.chest.opened) {
        cur.chest.opened = true;
        toast('Treasure chest!', '#ffd84a');
        dropItem(cur.chest.x, cur.chest.y, 1);
        for (let i = 0; i < 6; i++) dropAt(cur.chest.x, cur.chest.y, 'coin', coinValue());
        if (rng() < 0.5) dropAt(cur.chest.x, cur.chest.y, 'potion', 0);
      }
    }

    // --- survival
    const inCombat = cur.locked && liveInRoom(cur.id).length > 0;
    const regen = gearSum('regen') + (bike.effortZone === 2 ? regenPerS() * (P.maxHp / 100) * (inCombat ? 1 : 2) : 0);
    if (P.hp < P.maxHp) P.hp = Math.min(P.maxHp, P.hp + regen * dt);
    if (P.hp <= 0) die();

    // --- resistance
    const sh = bossShield();
    resSync('terrain', terrainGrade());
    resSync('swamp', P.onSwamp ? swampGrade() : null);
    resSync('wounded', P.hp < P.maxHp * woundedFrac() ? woundedGrade() : null);
    resSync('boss-surge', sh.shielded ? surgeGrade() : null);

    if (enemies.length > 300) enemies = enemies.filter((e) => e.alive || e === boss);
    // expire fx
    while (fx.length && t - fx[0].t0 > 1.5) fx.shift();
    ctx.debug('floor', floor); ctx.debug('room', current); ctx.debug('hp', Math.round(P.hp)); ctx.debug('weapon', weapon.name);
  }

  function onHitGround(b: Bullet, bike: Readonly<BikeState>) {
    const col = ELEMENT_COLORS[b.w!.element];
    addFx({ kind: 'boom', x: b.x, y: b.y, life: 0.35, color: col, r: b.w!.blast });
    for (const o of liveInRoom(current)) if (Math.hypot(o.x - b.x, o.y - b.y) < b.w!.blast + o.r) damageEnemy(o, b.dmg * 0.6, bike, false, col);
  }

  function updateEnemy(e: Enemy, dt: number, bike: Readonly<BikeState>) {
    const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    e.contactCd = Math.max(0, e.contactCd - dt);
    e.slowT = Math.max(0, e.slowT - dt);
    if (e.dotT > 0) { e.dotT -= dt; damageEnemy(e, e.dotDps * dt, bike); if (!e.alive) return; }
    const sp = e.speed * (e.slowT > 0 ? 0.55 : 1) * dt;
    const x0 = e.x, y0 = e.y;
    const step = (mx: number, my: number) => move(e, mx * sp, my * sp, e.r);
    const keepAt = (lo: number, hi: number) => { const s = d < lo ? -1 : d > hi ? 1 : 0; step(ux * s, uy * s); };
    switch (e.kind) {
      case 'chaser': step(ux, uy); break;
      case 'bat': { e.wob += dt * 7; const w = Math.sin(e.wob) * 0.9; step(ux - uy * w, uy + ux * w); break; }
      case 'spitter':
        keepAt(4.5, 7); e.fireCd -= dt;
        if (e.fireCd <= 0) { e.fireCd = 2.6; ring(e.x, e.y, 8, 3.2, 6, rng() * Math.PI * 2); }
        break;
      case 'archer':
        if (e.tell <= 0) keepAt(5, 8);
        e.fireCd -= dt;
        if (e.fireCd <= 0.6 && e.fireCd > 0) e.tell = 1 - e.fireCd / 0.6;
        if (e.fireCd <= 0) { e.fireCd = 2.2; e.tell = 0; enemyShot(e.x, e.y, Math.atan2(dy, dx), 7, 8, 0.16); }
        break;
      case 'brute':
        e.fireCd -= dt;
        if (e.state === 1) { // charging
          e.tell -= dt; move(e, e.vx * dt, e.vy * dt, e.r);
          if (e.tell <= 0) { e.state = 0; e.fireCd = 3.5 + rng(); }
        } else if (e.fireCd <= 0 && d < 6) { e.state = 1; e.tell = 0.7; e.vx = ux * 6.5; e.vy = uy * 6.5; }
        else step(ux, uy);
        break;
      case 'bomber':
        if (e.state === 0) { step(ux, uy); if (d < 1.3) { e.state = 1; e.tell = 0; } }
        else {
          e.tell += dt / 0.7;
          if (e.tell >= 1) {
            addFx({ kind: 'boom', x: e.x, y: e.y, life: 0.45, color: '#ff7a2a', r: 2 });
            if (d < 2 + PLAYER_R) hurtPlayer(24 * dmgMul());
            e.hp = 0; killEnemy(e); return;
          }
        }
        break;
      case 'summoner':
        keepAt(5, 8); e.fireCd -= dt;
        if (e.fireCd < 0.8) e.tell = 1 - Math.max(0, e.fireCd) / 0.8;
        if (e.fireCd <= 0 && e.summoned < 4) {
          e.fireCd = 6; e.tell = 0;
          for (let k = 0; k < 2; k++) { const b = spawnEnemy('bat', e.x + (rng() - 0.5), e.y + (rng() - 0.5), e.room); b.summoned = 1; b.xp *= 0.3; e.summoned++; }
          addFx({ kind: 'levelup', x: e.x, y: e.y, life: 0.5, color: '#b06cff', r: 1 });
        } else if (e.fireCd <= 0) e.fireCd = 3;
        break;
      case 'boss': bossAct(e, dt, d, ux, uy); break;
    }
    // enemies never leave (or get wedged outside) their room
    const rm = world.rooms[e.room];
    e.x = clamp(e.x, rm.x0 + e.r + 0.02, rm.x0 + rm.w - e.r - 0.02); e.y = clamp(e.y, rm.y0 + e.r + 0.02, rm.y0 + rm.h - e.r - 0.02);
    if (e.state !== 1 || e.kind === 'bomber') { e.vx = (e.x - x0) / dt; e.vy = (e.y - y0) / dt; }
    if (e.contact > 0 && d < e.r + PLAYER_R + 0.1 && e.contactCd <= 0) { hurtPlayer(e.contact); e.contactCd = e.kind === 'brute' ? 1 : 0.8; }
  }

  function bossAct(e: Enemy, dt: number, d: number, ux: number, uy: number) {
    if (e.state === 1) { // charge (warchief)
      e.tell -= dt; move(e, e.vx * dt, e.vy * dt, e.r);
      if (e.tell <= 0) e.state = 0;
      return;
    }
    if (d > 5) move(e, ux * e.speed * dt, uy * e.speed * dt, e.r);
    e.fireCd -= dt; e.fireCd2 -= dt;
    const enraged = e.hp < e.maxHp * 0.5;
    if (e.fireCd <= 0) {
      e.fireCd = enraged ? 1.7 : 2.3; e.spin += 0.3;
      ring(e.x, e.y, e.variant === 0 ? 16 : 12, 3.6, 6, e.spin);
    }
    if (e.fireCd2 <= 0) {
      e.fireCd2 = 1.5;
      const a = Math.atan2(uy, ux);
      switch (e.variant) {
        case 1: e.spin += 0.5; for (let k = 0; k < 4; k++) enemyShot(e.x, e.y, e.spin + k * Math.PI / 2, 4.5, 6); break; // bone spiral
        case 2: if (d < 9) { e.state = 1; e.tell = 0.8; e.vx = ux * 7; e.vy = uy * 7; } break;                              // charge
        case 3: if (liveInRoom(e.room).length < 5) { const s = spawnEnemy(rng() < 0.5 ? 'bat' : 'bomber', e.x, e.y + 1.5, e.room); s.summoned = 1; } break; // raise minions
        default: for (const o of [-0.3, 0, 0.3]) enemyShot(e.x, e.y, a + o, 5, 7, 0.22);
      }
    }
  }

  function descend() {
    floorsCleared++;
    ctx.emit({ type: 'floorCleared', data: { floor, timeS: Math.round(t) } });
    // forge: refill potions, then sink the rest into weapon upgrades
    const potionCost = 12 * floor;
    while (P.potions < MAX_POTIONS && P.coins >= potionCost) { P.potions++; P.coins -= potionCost; }
    let ups = 0;
    for (;;) {
      const cost = Math.round(60 * Math.pow(1.5, weapon.plus) * Math.sqrt(levelMult(weapon.level)));
      if (P.coins < cost) break;
      P.coins -= cost; weapon = { ...weapon, plus: weapon.plus + 1 }; weapon.score = weaponScore(weapon); ups++;
    }
    floor++;
    buildFloor();
    recomputeHp(true);
    toast(`Floor ${floor}${ups ? ` — forge: ${weapon.name} +${weapon.plus}` : ''}`, '#ffd84a');
    const prev = ctx.load<Save>() ?? {};
    ctx.save({
      ...prev, bestFloor: Math.max(prev.bestFloor ?? 1, floor), wins: (prev.wins ?? 0) + 1,
      hero: { floor, level: P.level, xp: P.xp, coins: P.coins, potions: P.potions, weapon, gear: { ...gear } },
    } satisfies Save);
  }

  function die() {
    deaths++;
    ctx.emit({ type: 'death', data: { room: current, floor } });
    activeRoom().locked = false;
    const safe = world.rooms[safeRoom];
    current = safe.id;
    P.x = safe.x0 + safe.w / 2; P.y = safe.y0 + safe.h / 2;
    recomputeHp(true); P.invuln = 2; P.dashT = 0; P.hurtT = -99;
    bullets.length = 0; navPath = [];
    toast('You fell... back to safety', '#ff5a5a');
  }

  function snapshot(): DungeonSnapshot {
    const sh = bossShield();
    const ev: EnemyView[] = [];
    for (const e of enemies) if (e.alive && (e.kind !== 'boss' || bossStarted)) ev.push({
      id: e.id, kind: e.kind, x: e.x, y: e.y, r: e.r, hp: e.hp, maxHp: e.maxHp, shielded: e.kind === 'boss' && sh.shielded,
      hurt: t - e.hurtT, face: P.x >= e.x ? 1 : -1, slowed: e.slowT > 0, dot: e.dotT > 0, tell: clamp(e.kind === 'brute' || e.kind === 'boss' ? e.state : e.tell, 0, 1), variant: e.variant,
    });
    const bv: BulletView[] = bullets.map((b) => ({
      x: b.x, y: b.y, r: b.r, friendly: b.friendly, style: b.w ? b.w.base : 'enemy', color: b.w ? ELEMENT_COLORS[b.w.element] : '#ff5a5a',
      angle: Math.atan2(b.vy, b.vx), age: b.age,
    }));
    return {
      t, world, floor,
      player: {
        x: P.x, y: P.y, r: PLAYER_R, hp: P.hp, maxHp: P.maxHp, potions: P.potions, dashCd: P.dashCd, dashCdMax: dashCooldown(),
        invuln: P.invuln > 0, onSwamp: P.onSwamp, speedMult: P.speedMult, moving: P.moving, dashing: P.dashT > 0, hurt: t - P.hurtT,
        level: P.level, xp: P.xp, xpNext: xpNext(P.level), coins: P.coins,
      },
      weapon, gear: { ...gear },
      aim: { angle: P.aim, auto: P.aimAuto },
      enemies: ev, bullets: bv, drops: drops.map(({ item: _i, value: _v, ...d }) => d), fx: fx.slice(), toasts: toasts.filter((x) => t - x.t0 < 6),
      room: current, stairsOpen: !boss.alive,
      boss: bossStarted ? { active: boss.alive, name: BOSS_NAMES[boss.variant], hp: Math.max(0, boss.hp), maxHp: boss.maxHp, shielded: sh.shielded, shieldLeftS: sh.leftS, nextShieldS: sh.nextS } : null,
      stats: { roomsCleared, kills, deaths, damageDealt, bossDefeated, floorsCleared },
      hooks: { boss: bossStarted && boss.alive, shielded: sh.shielded, swamp: P.onSwamp },
    };
  }

  function hud(): GameHud {
    const sh = bossShield();
    const buttons = ctx.profile.settings.aimMode === 'buttons';
    const aim: ControlHint[] = buttons
      ? [{ button: 'y', label: 'Aim up' }, { button: 'z', label: 'Aim left' }, { button: 'a', label: 'Aim right' }, { button: 'b', label: 'Aim down' }]
      : [{ button: 'paddles', label: 'Aim' }];
    return {
      controls: [
        ...aim,
        { button: 'shiftUpR', label: 'Dash', active: P.dashCd <= 0 },
        { button: 'shiftDnR', label: 'Potion', active: P.potions > 0 && P.hp < P.maxHp },
        { button: 'dpad', label: 'Move (optional)' },
        { button: 'shiftersL', label: 'Gear' },
      ],
      gears: true,
      targetZone: sh.shielded ? { min: 4, max: 5, label: 'Sprint! Shield up' } : { min: 2, max: 2, label: 'Heal' },
    };
  }

  return {
    update, hud, snapshot, isOver: () => false,
    summary: () => ({
      floor, level: P.level, roomsCleared, kills, deaths, damageDealt: Math.round(damageDealt), bossDefeated, floorsCleared,
      coins: P.coins, weapon: weapon.name, weaponScore: Math.round(weaponScore(weapon)), timeS: Math.round(t),
    }),
    dispose() { ctx.resistance.clearAll(); ctx.resistance.useVirtualGears(false); },
  };
}
