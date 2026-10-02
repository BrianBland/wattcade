import type { BikeState, Button, ControlHint, GameContext, GameHud, GameSim, InputState, Seconds } from '../../../contracts';
import { generateWorld, tileAt, TILE, type EnemyKind, type Room, type ShrineKind, type World } from './world';
import {
  ELEMENT_COLORS, RARITY_COLORS, SLOTS, UNIQUES, makeGear, makeUnique, makeWeapon, rollRarity, sellValue, starterWeapon, weaponScore,
  type Gear, type Rarity, type Slot, type Weapon,
} from './loot';
import { UPGRADES, autoInvest, lvl, metaMods, upgradeCost, type Levels, type MetaMods } from './meta';
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
interface Ctl { mx: number; my: number; dash: boolean; potion: boolean; aimAuto: boolean; aimVec: { x: number; y: number } | null }
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
const BOSS_NAMES = ['Slime Monarch', 'Bone Lord', 'Ogre Warchief', 'The Lich'];
const SHRINES: Record<ShrineKind, { label: string; window: number; color: string }> = {
  fury: { label: 'Shrine of Fury: ride Z3+ for 20s', window: 50, color: '#ff8c2a' },
  endurance: { label: 'Shrine of Patience: hold Z2, treasure grows', window: 90, color: '#5aa9ff' },
  sprint: { label: 'Shrine of Gold: sprint twice', window: 60, color: '#ffd84a' },
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
const PLAYER_R = 0.35, MAX_FX = 140, CAMP_AUTOSTART_S = 45;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** Distance from point p to segment a-b (swept projectile hits). */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
  const k = l2 > 0 ? clamp(((px - ax) * vx + (py - ay) * vy) / l2, 0, 1) : 0;
  return Math.hypot(px - ax - vx * k, py - ay - vy * k);
}

export interface DungeonOpts { seed?: number; autopilot?: boolean; floor?: number; skipCamp?: boolean }
export interface DungeonSave { bank?: number; upgrades?: Levels; bestFloor?: number; runs?: number; autoInvest?: boolean }

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
  const enemyDmgScale = tn.num('enemyDamageScale', 1.3, 0.1, 3, 0.1);
  const enemyHpMult = tn.num('enemyHpMult', 1.5, 0.2, 5, 0.1, 'base enemy HP multiplier');
  const enemyHpGrowth = tn.num('enemyHpGrowth', 1.26, 1, 2, 0.01, 'enemy HP multiplier per floor');
  const bossHpT = tn.num('bossHp', 1800, 100, 20000, 50, 'floor-1 boss HP (scales with enemyHpGrowth)');
  const shieldPeriod = tn.num('bossShieldPeriodS', 45, 10, 120, 5);
  const shieldDur = tn.num('bossShieldDurS', 15, 1, 60, 1);
  const shieldLeak = tn.num('bossShieldLeak', 0.2, 0, 1, 0.05, 'damage fraction through shield when not sprinting');
  const sprintMult = tn.num('bossSprintDamageMult', 3, 1, 10, 0.5);
  const itemDropPct = tn.num('itemDropPct', 10, 0, 100, 1, '% chance an enemy drops a weapon/gear');
  const uniquePct = tn.num('uniqueDropPct', 0.6, 0, 100, 0.1, '% of item drops that are uniques (elites x1.5, bosses x10)');
  const eliteBase = tn.num('eliteChance', 0.05, 0, 1, 0.01, 'elite chance on floor 1 (+1.5%/floor, max 25%)');
  const curseChance = tn.num('curseChance', 0.08, 0, 1, 0.01, 'chance per uncleared room entered (+1%/floor, max 20%)');
  const curseGrade = tn.num('gradeCurseMire', 2, 0, 8, 0.5, 'extra grade during Curse of the Mire');
  const deathCoinLoss = tn.num('deathCoinLoss', 0.2, 0, 1, 0.05, 'fraction of run coins lost on death');
  const terrainGrade = tn.num('gradeTerrain', 1, 0, 10, 0.5);
  const swampGrade = tn.num('gradeSwamp', 4, 0, 12, 0.5);
  const woundedGrade = tn.num('gradeWounded', 2, 0, 10, 0.5);
  const woundedFrac = tn.num('woundedHpFrac', 0.4, 0.1, 0.9, 0.05);
  const surgeGrade = tn.num('gradeBossSurge', 5, 0, 12, 0.5);
  const aimTurn = tn.num('aimTurnRate', 2.0, 0.5, 10, 0.1, 'rad/s at full paddle');
  const autoMove = tn.bool('autoMove', true, 'bot steers (explore, kite, dodge, stairs); D-pad overrides');
  const autoAimIdle = tn.num('autoAimIdleS', 1.5, 0.2, 10, 0.1);

  const rng = () => ctx.rng();

  // ---------- meta (persisted across runs) ----------
  const saved = ctx.load<DungeonSave>() ?? {};
  const levels: Levels = { ...(saved.upgrades ?? {}) };
  let bankStart = saved.bank ?? 0, bestFloor = saved.bestFloor ?? 1, runs = saved.runs ?? 0, autoInvestOn = saved.autoInvest ?? true;
  let mods: MetaMods = metaMods(levels, bestFloor);
  let startFloor = opts?.floor ?? mods.maxStartFloor; // defaults to the deepest unlocked start; lower it at camp
  let phase: 'camp' | 'run' = 'camp', campSel = 0, campT = 0;
  const pending: Array<{ type: 'campRow'; row: number }> = []; // taps from the renderer

  // ---------- hero ----------
  const P = {
    x: 0, y: 0, hp: 0, maxHp: 0, potions: 3, dashCd: 0, dashT: 0, dashDx: 0, dashDy: 0,
    invuln: 0, hurtT: -99, aim: 0, aimAuto: true, lastShotRevs: ctx.bike().crankRevs, onSwamp: false, speedMult: 1, moveAng: 0, moving: false,
    level: 1, xp: 0, coins: 0, coinsEarned: 0, shots: 0,
  };
  let weapon: Weapon = starterWeapon();
  const gear: Partial<Record<Slot, Gear>> = {};
  let bestFind: Weapon | Gear = weapon;
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
  let current = 0, safeRoom = 0, bossStarted = false, bossT = 0, freezeT = 0;
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
  let t = 0, kills = 0, deaths = 0, damageDealt = 0, roomsCleared = 0, bossDefeated = 0, floorsCleared = 0, elitesSlain = 0, uniquesFound = 0;
  let navPath: Array<{ x: number; y: number }> = [], navKey = '', navAge = 99;
  let flow: Int16Array = new Int16Array(0), flowKey = -1;

  const hpMul = () => enemyHpMult() * Math.pow(enemyHpGrowth(), floor - 1);
  const dmgMul = () => Math.pow(1.12, floor - 1);
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
    const hp = bossHpT() * hpMul();
    boss = spawnEnemy('chaser', br.x0 + br.w / 2, br.y0 + br.h / 2 + 1, br.id);
    Object.assign(boss, { kind: 'boss', r: 1.1, hp, maxHp: hp, speed: 1.1, contact: 18 * dmgMul(), fireCd: 2, fireCd2: 1.2, xp: 120 * (1 + 0.3 * (floor - 1)), variant: (floor - 1) % 4 });
    shrines = world.rooms.filter((r) => r.shrine).map((r) => ({ room: r.id, kind: r.shrine!.kind, x: r.shrine!.x, y: r.shrine!.y, state: 'idle' as const, progress: 0, left: 0, s0: 0 }));
    current = 0; safeRoom = 0; bossStarted = false; bossT = 0; navPath = []; navKey = ''; flowKey = -1;
    P.x = world.spawn.x; P.y = world.spawn.y;
    markSeen(world.rooms[0]);
  }
  function markSeen(r: Room) { r.seen = true; for (const n of world.adj[r.id]) world.rooms[n].seen = true; }
  buildFloor();
  ctx.resistance.useVirtualGears(true, 'L'); // right shifters are dash/potion

  function persist() {
    ctx.save({ bank: Math.round(bankStart + P.coinsEarned), upgrades: { ...levels }, bestFloor, runs, autoInvest: autoInvestOn } satisfies DungeonSave);
  }

  // ---------- fx / sound ----------
  function addFx(f: Omit<Fx, 't0'>) { fx.push({ ...f, t0: t }); if (fx.length > MAX_FX) fx.splice(0, fx.length - MAX_FX); }
  function toast(text: string, color = '#fff') { toasts.push({ text, color, t0: t }); if (toasts.length > 5) toasts.shift(); }
  function cue(name: string) { cues.push({ name, id: ++cueId }); if (cues.length > 40) cues.shift(); }
  function freeze(s: number) { freezeT = Math.max(freezeT, s); }

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
  /** Axis-separated move; when one axis is blocked, nudge toward the tile centre on the other axis so corners don't snag. */
  function move(e: { x: number; y: number }, dx: number, dy: number, r: number) {
    if (dx && blocked(e.x + dx, e.y, r)) {
      const cy = Math.floor(e.y) + 0.5, n = clamp(cy - e.y, -Math.abs(dx), Math.abs(dx));
      if (!dy && n && !blocked(e.x, e.y + n, r)) e.y += n;
    } else e.x += dx;
    if (dy && blocked(e.x, e.y + dy, r)) {
      const cx = Math.floor(e.x) + 0.5, n = clamp(cx - e.x, -Math.abs(dy), Math.abs(dy));
      if (!dx && n && !blocked(e.x + n, e.y, r)) e.x += n;
    } else e.y += dy;
  }
  const inRoom = (room: Room, x: number, y: number, inset: number) =>
    x >= room.x0 + inset && x <= room.x0 + room.w - inset && y >= room.y0 + inset && y <= room.y0 + room.h - inset;
  const activeRoom = () => world.rooms[current];
  const liveInRoom = (rid: number) => enemies.filter((e) => e.alive && e.room === rid && (e.kind !== 'boss' || bossStarted));

  /** Room-local BFS distance field from the player, so melee enemies walk around pits and braziers. */
  function updateFlow() {
    const r = activeRoom();
    const px = clamp(Math.floor(P.x), r.x0, r.x0 + r.w - 1), py = clamp(Math.floor(P.y), r.y0, r.y0 + r.h - 1);
    const key = current * 1e6 + py * world.w + px;
    if (key === flowKey) return;
    flowKey = key;
    if (flow.length !== r.w * r.h) flow = new Int16Array(r.w * r.h);
    flow.fill(-1);
    const q = [(py - r.y0) * r.w + (px - r.x0)];
    flow[q[0]] = 0;
    for (let i = 0; i < q.length; i++) {
      const c = q[i], cx = c % r.w, cy = (c - cx) / r.w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= r.w || ny >= r.h) continue;
        const ni = ny * r.w + nx;
        if (flow[ni] >= 0 || walkSolid(r.x0 + nx, r.y0 + ny)) continue;
        flow[ni] = flow[c] + 1; q.push(ni);
      }
    }
  }
  function chaseDir(e: Enemy): { x: number; y: number } {
    const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy) || 1;
    const r = world.rooms[e.room];
    if (e.room !== current || d < 1.5) return { x: dx / d, y: dy / d };
    const ex = Math.floor(e.x) - r.x0, ey = Math.floor(e.y) - r.y0;
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= r.w || y >= r.h ? -1 : flow[y * r.w + x]);
    const here = at(ex, ey);
    if (here <= 1) return { x: dx / d, y: dy / d };
    let best = here, bx = 0, by = 0;
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const v = at(ex + ox, ey + oy);
      if (v < 0 || v >= best) continue;
      if (ox && oy && (at(ex + ox, ey) < 0 || at(ex, ey + oy) < 0)) continue; // no corner cutting
      best = v; bx = ox; by = oy;
    }
    if (!bx && !by) return { x: dx / d, y: dy / d };
    const tx = r.x0 + ex + bx + 0.5 - e.x, ty = r.y0 + ey + by + 0.5 - e.y, n = Math.hypot(tx, ty) || 1;
    return { x: tx / n, y: ty / n };
  }

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
  function dropItem(x: number, y: number, bump: number, uniqueMult = 1) {
    const lvl = floor + (rng() < 0.3 ? 1 : 0), rar = rollRarity(rng, bump + (rng() < mods.rarityBumpChance ? 1 : 0));
    if (rng() * 100 < uniquePct() * uniqueMult * mods.dropMult) dropAt(x, y, 'weapon', 0, makeUnique(rng, lvl + 1));
    else if (rng() < 0.45) dropAt(x, y, 'weapon', 0, makeWeapon(rng, lvl, rar));
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
    const better = 'base' in it ? it.score > weaponScore(weapon) : !gear[it.slot] || it.score > gear[it.slot]!.score;
    if (!better) { const v = Math.round(sellValue(it.level, Math.min(4, it.rarity) as Rarity) * mods.coinMult); addCoins(v); toast(`Sold ${it.name} +${v}c`, '#bbb'); cue('coin'); return; }
    if ('base' in it) weapon = it; else { gear[it.slot] = it; recomputeHp(false); }
    if (it.rarity > bestFind.rarity || (it.rarity === bestFind.rarity && it.level > bestFind.level)) bestFind = it;
    toast(`Equipped ${it.name}`, col);
    addFx({ kind: 'levelup', x: P.x, y: P.y, life: 0.8, color: col, r: 1.4 });
    if (it.rarity === 5) {
      uniquesFound++; freeze(0.3); cue('unique');
      const u = UNIQUES.find((x) => x.name === it.name);
      addFx({ kind: 'banner', x: P.x, y: P.y, life: 3.5, color: col, text: `UNIQUE — ${it.name}${u ? ': ' + u.blurb : ''}` });
      ctx.emit({ type: 'uniqueFound', data: { name: it.name, floor } });
    } else cue('equip');
  }

  // ---------- combat ----------
  function hurtPlayer(dmg: number) {
    if (P.invuln > 0) return;
    const armor = clamp(gearSum('armor'), 0, 0.75);
    P.hp -= dmg * enemyDmgScale() * (1 - armor) * (cursed('hexed') ? 1.4 : 1);
    if (t - P.hurtT > 0.25) cue('hurt');
    P.hurtT = t;
  }
  function damageEnemy(e: Enemy, raw: number, bike: Readonly<BikeState>, crit = false, color = '#fff') {
    if (!e.alive) return;
    let dmg = raw;
    if (e.kind === 'boss') {
      const sh = bossShield();
      if (sh.shielded) dmg *= bike.sprinting ? sprintMult() : shieldLeak();
    }
    if (cursed('bulwark')) dmg *= 0.65;
    if (e.shield > 0) { const ab = Math.min(e.shield, dmg * 0.8); e.shield -= ab; dmg -= ab; }
    const applied = Math.min(dmg, e.hp);
    e.hp -= dmg; damageDealt += applied; e.hurtT = t;
    if (crit || dmg >= e.maxHp * 0.08 || e.kind === 'boss') {
      addFx({ kind: 'text', x: e.x + (rng() - 0.5) * 0.4, y: e.y - e.r - 0.2, life: 0.7, color: crit ? '#ffd84a' : color, text: String(Math.round(dmg)), big: crit });
    }
    if (e.hp <= 0) killEnemy(e);
  }
  function killEnemy(e: Enemy) {
    e.alive = false; kills++;
    addFx({ kind: 'death', x: e.x, y: e.y, life: 0.5, color: e.kind === 'boss' ? '#cc00aa' : e.elite ? '#ff8c2a' : '#dddddd', r: e.r * 2 });
    ctx.emit({ type: 'kill', data: { kind: e.kind, room: e.room, elite: !!e.elite } });
    gainXp(e.xp);
    const coins = e.kind === 'boss' ? 14 : e.elite ? 4 : 1 + (rng() < 0.4 ? 1 : 0);
    for (let i = 0; i < coins; i++) dropAt(e.x, e.y, 'coin', coinValue());
    if (e.kind === 'boss') {
      dropItem(e.x, e.y, 2, 10); dropItem(e.x, e.y, 1, 10); dropAt(e.x, e.y, 'potion', 0);
      bossDefeated++; freeze(0.35); cue('bossDie');
      addFx({ kind: 'boom', x: e.x, y: e.y, life: 0.8, color: '#c77dff', r: 4 });
      toast(`${BOSS_NAMES[e.variant]} defeated! Stairs open.`, '#ff8c2a');
      ctx.emit({ type: 'bossDefeated', data: { timeS: Math.round(t), floor } });
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
    for (const e of liveInRoom(current)) {
      if (exclude?.includes(e.id)) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  const playerDmg = (bike: Readonly<BikeState>) =>
    baseDamage() * clamp(bike.ftpFraction, 0.3, 2.5) * (1 + 0.06 * weapon.plus) * (1 + 0.04 * (P.level - 1) + gearSum('dmgPct')) * mods.dmgMult;
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
        if (nx < 0 || ny < 0 || nx >= W || ny >= world.h || prev[ni] >= 0 || walkSolid(nx, ny)) continue;
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
      const want = near.kind === 'bomber' || near.elite === 'volatile' ? Math.max(reach, 3) : near.kind === 'chaser' || near.kind === 'brute' ? Math.min(reach, 3.5) : reach;
      const s = d > want + 1 ? 1 : d < want - 1 ? -1 : 0;
      mx = (dx / d) * s; my = (dy / d) * s;
      if (s === 1) { // close in along a real path (pits/braziers may be in the way)
        const key = `fight${near.id}`;
        if (navKey !== key || navAge > 0.75 || !navPath.length) { navPath = findPath(Math.floor(near.x), Math.floor(near.y)); navKey = key; navAge = 0; }
        while (navPath.length > 1 && Math.hypot(navPath[0].x - P.x, navPath[0].y - P.y) < 0.45) navPath.shift();
        if (navPath[0]) { const wx = navPath[0].x - P.x, wy = navPath[0].y - P.y, wn = Math.hypot(wx, wy) || 1; mx = wx / wn; my = wy / wn; }
      }
      const pathing = s === 1 && navPath.length > 0;
      if (s === 0) { mx = -dy / d * 0.6; my = dx / d * 0.6; } // circle-strafe
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
    ctx.debug('autopilot', `${mx.toFixed(2)},${my.toFixed(2)} path${navPath.length} ${navKey} near${near ? near.id + '@' + near.x.toFixed(1) + ',' + near.y.toFixed(1) : '-'}`);
    return { mx, my, dash, potion: P.hp < P.maxHp * 0.35 && P.potions > 0, aimAuto: true, aimVec: null };
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
    if (p('z') || tapped) { // Z = left face button on the Ride diamond; taps select + activate
      campT = 0;
      if (row.kind === 'start') { startRun(); return; }
      if (row.kind === 'floor') { startFloor = startFloor >= mods.maxStartFloor ? 1 : startFloor + 1; cue('select'); }
      if (row.kind === 'auto') { autoInvestOn = !autoInvestOn; cue('select'); persist(); }
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
    if (campT >= CAMP_AUTOSTART_S) startRun();
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
    P.level = 1 + 2 * (floor - 1); P.xp = 0;
    weapon = starterWeapon(floor, rng); bestFind = weapon;
    P.potions = mods.potionCap;
    buildFloor();
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
      if (s.kind === 'fury' && bike.effortZone >= 3) s.progress += dt / 20;
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
    if (phase === 'camp') { t += dt; campUpdate(dt, input, bike); resSync('terrain', terrainGrade()); return; }
    if (freezeT > 0) { freezeT -= dt; return; } // hit-stop
    t += dt; navAge += dt;
    const ctl = readCtl(input);

    // --- player movement
    P.dashCd = Math.max(0, P.dashCd - dt);
    P.invuln = Math.max(0, P.invuln - dt);
    const tile = tileAt(world, Math.floor(P.x), Math.floor(P.y));
    P.onSwamp = tile === TILE.SWAMP;
    P.speedMult = speedCurve(bike.cadence3s) * (1 + gearSum('speed')) * mods.speedMult * (P.onSwamp ? 0.75 : 1) * (cursed('mire') ? 0.85 : 1);
    if (ctl.dash && P.dashCd <= 0 && P.dashT <= 0) {
      let dx = ctl.mx, dy = ctl.my;
      if (!dx && !dy) { dx = Math.cos(P.aim); dy = Math.sin(P.aim); }
      const n = Math.hypot(dx, dy) || 1;
      P.dashDx = dx / n; P.dashDy = dy / n; P.dashT = 0.15; P.dashCd = dashCooldown(); P.invuln = Math.max(P.invuln, 0.3);
    }
    if (ctl.potion && P.potions > 0 && P.hp < P.maxHp) {
      P.potions--; P.hp = Math.min(P.maxHp, P.hp + P.maxHp * 0.45); cue('potion');
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
          r.locked = true; cue('door');
          if (!r.boss && cursed('swarm')) for (let k = 0; k < 3; k++) {
            const sx = r.x0 + (r.w >> 1) + 0.5 + (k - 1) * 1.5, sy = r.y0 + 1.5;
            spawnEnemy(k === 1 ? 'chaser' : 'bat', sx, sy, r.id);
          }
          if (!r.boss && !curse && (floor > 1 || roomsCleared >= 2) && rng() < Math.min(0.2, curseChance() + 0.01 * (floor - 1))) startCurse(bike);
          if (r.boss && !bossStarted) {
            bossStarted = true; bossT = 0; cue('bossStart');
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
    const mode = ctx.profile.settings.aimMode;
    if (ctl.aimVec) P.aim = Math.atan2(ctl.aimVec.y, ctl.aimVec.x);
    else if (ctl.aimAuto) {
      if (target) {
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
    if (bossStarted && boss.alive) bossT += dt;
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
    if (cur.locked && liveInRoom(cur.id).length === 0 && (!cur.boss || !boss.alive)) {
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
    const inCombat = cur.locked && liveInRoom(cur.id).length > 0;
    const regen = gearSum('regen') + mods.regen * P.maxHp / 100 + (bike.effortZone === 2 && !cursed('fragile') ? regenPerS() * (P.maxHp / 100) * (inCombat ? 1 : 2) : 0);
    if (P.hp < P.maxHp) P.hp = Math.min(P.maxHp, P.hp + regen * dt);
    if (P.hp <= 0) die();

    // --- resistance
    const bsh = bossShield();
    resSync('terrain', terrainGrade());
    resSync('swamp', P.onSwamp ? swampGrade() : null);
    resSync('wounded', P.hp < P.maxHp * woundedFrac() ? woundedGrade() : null);
    resSync('boss-surge', bsh.shielded ? surgeGrade() : null);
    resSync('curse-mire', cursed('mire') ? curseGrade() : null);

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

  function bossAct(e: Enemy, dt: number, d: number, ux: number, uy: number) {
    if (e.state === 1) {
      e.tell -= dt; move(e, e.vx * dt, e.vy * dt, e.r);
      if (e.tell <= 0) e.state = 0;
      return;
    }
    if (d > 5) { const c = chaseDir(e); move(e, c.x * e.speed * dt, c.y * e.speed * dt, e.r); }
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
        case 1: e.spin += 0.5; for (let k = 0; k < 4; k++) enemyShot(e.x, e.y, e.spin + k * Math.PI / 2, 4.5, 6); break;
        case 2: if (d < 9) { e.state = 1; e.tell = 0.8; e.vx = ux * 7; e.vy = uy * 7; } break;
        case 3: if (liveInRoom(e.room).length < 5) { const s = spawnEnemy(rng() < 0.5 ? 'bat' : 'bomber', e.x, e.y + 1.5, e.room); s.summoned = 1; } break;
        default: for (const o of [-0.3, 0, 0.3]) enemyShot(e.x, e.y, a + o, 5, 7, 0.22);
      }
    }
  }

  function descend() {
    floorsCleared++; cue('stairs');
    ctx.emit({ type: 'floorCleared', data: { floor, timeS: Math.round(t) } });
    floor++;
    bestFloor = Math.max(bestFloor, floor);
    P.potions = mods.potionCap;
    buildFloor();
    recomputeHp(true);
    toast(`Floor ${floor} — potions refilled`, '#ffd84a');
    persist();
  }

  function die() {
    deaths++;
    ctx.emit({ type: 'death', data: { room: current, floor } });
    activeRoom().locked = false;
    const safe = world.rooms[safeRoom];
    current = safe.id;
    P.x = safe.x0 + safe.w / 2; P.y = safe.y0 + safe.h / 2;
    recomputeHp(true); P.invuln = 2; P.dashT = 0; P.hurtT = -99;
    bullets.length = 0; hazards.length = 0; navPath = [];
    curse = null; // death lifts the curse (no bounty)
    const lost = Math.floor(P.coins * deathCoinLoss());
    P.coins -= lost; P.coinsEarned -= lost;
    toast(`You fell… dropped ${lost} coins`, '#ff5a5a');
    persist();
  }

  function campView(): CampView {
    return { bank: Math.round(bankStart), sel: campSel, autoStartS: CAMP_AUTOSTART_S, autoStartLeft: CAMP_AUTOSTART_S - campT, startFloor, maxStartFloor: mods.maxStartFloor, autoInvest: autoInvestOn, rows: campRows(), bestFloor, runs };
  }

  function snapshot(): DungeonSnapshot {
    const sh = bossShield();
    const ev: EnemyView[] = [];
    for (const e of enemies) if (e.alive && (e.kind !== 'boss' || bossStarted)) ev.push({
      id: e.id, kind: e.kind, x: e.x, y: e.y, r: e.r, hp: e.hp, maxHp: e.maxHp, shielded: e.kind === 'boss' && sh.shielded,
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
        x: P.x, y: P.y, r: PLAYER_R, hp: P.hp, maxHp: P.maxHp, potions: P.potions, potionCap: mods.potionCap, dashCd: P.dashCd, dashCdMax: dashCooldown(),
        invuln: P.invuln > 0, onSwamp: P.onSwamp, speedMult: P.speedMult, moving: P.moving, dashing: P.dashT > 0, hurt: t - P.hurtT,
        level: P.level, xp: P.xp, xpNext: xpNext(P.level), coins: P.coins, bank: Math.round(bankStart + P.coinsEarned),
      },
      weapon, gear: { ...gear },
      aim: { angle: P.aim, auto: P.aimAuto },
      enemies: ev, bullets: bv, drops: drops.map(({ item: _i, value: _v, ...d }) => d),
      hazards: hazards.map(({ dmg: _d, ...h }) => h),
      orbit: weapon.unique === 'orbit' && phase === 'run' ? orbitBlades() : [],
      shrines: shrines.map((s) => ({ kind: s.kind, label: SHRINES[s.kind].label, progress: s.progress, leftS: Math.max(0, s.left), state: s.state, x: s.x, y: s.y, room: s.room })),
      curse: curse ? { kind: curse.kind, ...CURSES[curse.kind], left: Math.max(0, curse.left), total: curse.total } satisfies CurseView : null,
      fx: fx.slice(), toasts: toasts.filter((x) => t - x.t0 < 6), cues: cues.slice(),
      room: current, stairsOpen: !boss.alive, frozen: freezeT > 0,
      boss: bossStarted ? { active: boss.alive, name: BOSS_NAMES[boss.variant], hp: Math.max(0, boss.hp), maxHp: boss.maxHp, shielded: sh.shielded, shieldLeftS: sh.leftS, nextShieldS: sh.nextS } : null,
      stats: { roomsCleared, kills, deaths, damageDealt, bossDefeated, floorsCleared, elites: elitesSlain, uniques: uniquesFound, curses: cursesSurvived },
      hooks: { boss: bossStarted && boss.alive, shielded: sh.shielded, swamp: P.onSwamp },
    };
  }

  function hud(): GameHud {
    if (phase === 'camp') return {
      controls: [{ button: 'dpad', label: 'Choose' }, { button: 'z', label: 'Buy / select' }, { button: 'b', label: 'Begin descent' }],
      gears: true, targetZone: { min: 1, max: 2, label: 'Warm up' },
    };
    const sh = bossShield();
    const buttons = ctx.profile.settings.aimMode === 'buttons';
    const aim: ControlHint[] = buttons
      ? [{ button: 'y', label: 'Aim up' }, { button: 'z', label: 'Aim left' }, { button: 'a', label: 'Aim right' }, { button: 'b', label: 'Aim down' }]
      : [{ button: 'paddles', label: 'Aim' }];
    const act = shrines.find((s) => s.state === 'active');
    const target: GameHud['targetZone'] = sh.shielded ? { min: 4, max: 5, label: 'Sprint! Shield up' }
      : act?.kind === 'fury' ? { min: 3, max: 5, label: 'Shrine: Z3+' }
      : act?.kind === 'sprint' ? { min: 5, max: 5, label: 'Shrine: sprint!' }
      : { min: 2, max: 2, label: act ? 'Shrine: hold Z2' : curse ? 'Cursed: ride it out' : 'Heal' };
    return {
      controls: [
        ...aim,
        { button: 'shiftUpR', label: 'Dash', active: P.dashCd <= 0 },
        { button: 'shiftDnR', label: 'Potion', active: P.potions > 0 && P.hp < P.maxHp },
        { button: 'dpad', label: 'Move (optional)' },
        { button: 'shiftersL', label: 'Gear' },
      ],
      gears: true, targetZone: target,
    };
  }

  return {
    update, hud, snapshot, isOver: () => false,
    receive(a: unknown) {
      const act = a as { type?: string; row?: number };
      if (act?.type === 'campRow' && typeof act.row === 'number' && pending.length < 8) pending.push({ type: 'campRow', row: act.row });
    },
    summary: () => ({
      'Deepest floor': floor, 'Hero level': P.level, 'Rooms cleared': roomsCleared, Kills: kills, 'Elites slain': elitesSlain,
      'Bosses slain': bossDefeated, Deaths: deaths, 'Coins earned': Math.round(P.coinsEarned), 'Coins banked': Math.round(bankStart + P.coinsEarned),
      'Best find': phase === 'run' ? bestFind.name : '-', 'Uniques found': uniquesFound, 'Curses survived': cursesSurvived, 'Final weapon': weapon.name,
    }),
    dispose() { if (phase === 'run') persist(); ctx.resistance.clearAll(); ctx.resistance.useVirtualGears(false); },
  };
}
