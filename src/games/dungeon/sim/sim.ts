import type { BikeState, GameContext, GameSim, InputState, Seconds } from '../../../contracts';
import { generateWorld, tileAt, TILE, type EnemyKind, type Room, type World } from './world';
import type { BulletView, DungeonSnapshot, EnemyView } from './types';

interface Enemy {
  id: number; kind: EnemyKind | 'boss'; x: number; y: number; r: number; hp: number; maxHp: number;
  speed: number; contact: number; contactCd: number; fireCd: number; fireCd2: number; room: number; alive: boolean; spin: number;
}
interface Bullet { x: number; y: number; vx: number; vy: number; r: number; dmg: number; life: number; friendly: boolean }
interface Ctl { mx: number; my: number; dash: boolean; potion: boolean; aimAuto: boolean; aimVec: { x: number; y: number } | null; fire: boolean }

const ENEMY_DEF: Record<EnemyKind, { hp: number; speed: number; r: number; contact: number }> = {
  chaser: { hp: 110, speed: 2.8, r: 0.4, contact: 8 },
  spitter: { hp: 150, speed: 1.6, r: 0.4, contact: 5 },
  brute: { hp: 500, speed: 1.5, r: 0.65, contact: 14 },
};
const PLAYER_R = 0.35;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface DungeonOpts { seed?: number; autopilot?: boolean }

export function createDungeonSim(ctx: GameContext, opts?: DungeonOpts): GameSim {
  const autopilot = !!opts?.autopilot;
  const tn = ctx.tuning;
  const baseSpeed = tn.num('baseSpeed', 4.2, 1, 10, 0.1, 'tiles/s at 90 rpm');
  const spd0 = tn.num('speedAt0rpm', 0.35, 0, 2, 0.05);
  const spd60 = tn.num('speedAt60rpm', 0.8, 0, 2, 0.05);
  const spd90 = tn.num('speedAt90rpm', 1.0, 0, 2, 0.05);
  const spd110 = tn.num('speedAt110rpm', 1.15, 0, 2, 0.05);
  const revsPerShot = tn.num('revsPerShot', 0.5, 0.1, 4, 0.05, 'crank revs per auto-shot');
  const baseDamage = tn.num('baseDamage', 10, 1, 100, 1, 'x clamp(ftpFraction,0.3,2.5)');
  const regenPerS = tn.num('regenPerS', 2, 0, 20, 0.5, 'HP/s in zone 2 (x2 out of combat)');
  const dashCooldown = tn.num('dashCooldown', 2, 0.5, 10, 0.5);
  const maxHpT = tn.num('playerHp', 100, 20, 500, 10);
  const enemyDmgScale = tn.num('enemyDamageScale', 0.5, 0.1, 3, 0.1);
  const bossHpT = tn.num('bossHp', 3500, 100, 20000, 50);
  const shieldPeriod = tn.num('bossShieldPeriodS', 45, 10, 120, 5);
  const shieldDur = tn.num('bossShieldDurS', 20, 1, 60, 1);
  const sprintMult = tn.num('bossSprintDamageMult', 3, 1, 10, 0.5);
  const terrainGrade = tn.num('gradeTerrain', 1, 0, 10, 0.5);
  const swampGrade = tn.num('gradeSwamp', 4, 0, 12, 0.5);
  const woundedGrade = tn.num('gradeWounded', 2, 0, 10, 0.5);
  const woundedFrac = tn.num('woundedHpFrac', 0.4, 0.1, 0.9, 0.05);
  const surgeGrade = tn.num('gradeBossSurge', 5, 0, 12, 0.5);
  const aimTurn = tn.num('aimTurnRate', 2.0, 0.5, 10, 0.1, 'rad/s at full paddle');
  const autoAimIdle = tn.num('autoAimIdleS', 1.5, 0.2, 10, 0.1);

  const world: World = generateWorld(() => ctx.rng());
  const enemies: Enemy[] = [];
  let nextId = 1;
  for (const room of world.rooms) for (const s of room.spawns) {
    const d = ENEMY_DEF[s.kind];
    enemies.push({ id: nextId++, kind: s.kind, x: s.x, y: s.y, r: d.r, hp: d.hp, maxHp: d.hp, speed: d.speed, contact: d.contact, contactCd: 0, fireCd: 0.5 + ctx.rng(), fireCd2: 0, room: room.id, alive: true, spin: 0 });
  }
  const bossRoom = world.rooms[world.rooms.length - 1];
  const bossMax = bossHpT();
  const boss: Enemy = { id: nextId++, kind: 'boss', x: bossRoom.x0 + bossRoom.w / 2, y: bossRoom.y0 + bossRoom.h / 2, r: 1.2, hp: bossMax, maxHp: bossMax, speed: 1.1, contact: 20, contactCd: 0, fireCd: 2, fireCd2: 1.2, room: bossRoom.id, alive: true, spin: 0 };
  enemies.push(boss);

  const P = {
    x: world.spawn.x, y: world.spawn.y, hp: maxHpT(), maxHp: maxHpT(), potions: 3, dashCd: 0, dashT: 0, dashDx: 0, dashDy: 0,
    invuln: 0, lastHurtT: -99, aim: 0, aimAuto: true, lastShotRevs: ctx.bike().crankRevs, onSwamp: false, speedMult: 1, moveAng: 0,
  };
  const bullets: Bullet[] = [];
  let t = 0, current = 0, kills = 0, deaths = 0, damageDealt = 0, roomsCleared = 0, bossDefeated = 0, bossStarted = false, bossT = 0, over = false;
  let apLink = 0, apWp = 0;

  // ---------- resistance (only sets on change) ----------
  const resState = new Map<string, number | null>();
  function resSync(id: string, grade: number | null) {
    if (resState.get(id) === grade) return;
    resState.set(id, grade);
    if (grade === null) ctx.resistance.clear(id); else ctx.resistance.set({ id, mode: 'sim', gradePct: grade });
  }
  ctx.resistance.useVirtualGears(true);

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

  // ---------- combat ----------
  function hurtPlayer(dmg: number) {
    if (P.invuln > 0) return;
    P.hp -= dmg * enemyDmgScale();
    P.lastHurtT = t;
  }
  function damageEnemy(e: Enemy, raw: number, bike: Readonly<BikeState>) {
    let dmg = raw;
    if (e.kind === 'boss') {
      const sh = bossShield();
      if (sh.shielded) { if (!bike.sprinting) return; dmg *= sprintMult(); }
    }
    const applied = Math.min(dmg, e.hp);
    e.hp -= dmg; damageDealt += applied;
    if (e.hp <= 0 && e.alive) {
      e.alive = false; kills++;
      ctx.emit({ type: 'kill', data: { kind: e.kind, room: e.room } });
      if (e.kind === 'boss') {
        bossDefeated = 1; over = true;
        ctx.emit({ type: 'bossDefeated', data: { timeS: Math.round(t) } });
        const prev = ctx.load<{ bestTimeS?: number; wins?: number }>() ?? {};
        ctx.save({ bestTimeS: Math.min(prev.bestTimeS ?? Infinity, t), wins: (prev.wins ?? 0) + 1 });
      }
    }
  }
  function ring(x: number, y: number, n: number, speed: number, dmg: number, off: number, r = 0.22) {
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * Math.PI * 2;
      bullets.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r, dmg, life: 6, friendly: false });
    }
  }

  // ---------- input ----------
  function readCtl(input: Readonly<InputState>, bike: Readonly<BikeState>): Ctl {
    if (autopilot) return autopilotCtl(bike);
    const h = input.held, mode = ctx.profile.settings.aimMode;
    let mx = (h.has('right') ? 1 : 0) - (h.has('left') ? 1 : 0), my = (h.has('down') ? 1 : 0) - (h.has('up') ? 1 : 0);
    const inv = mx && my ? Math.SQRT1_2 : 1; mx *= inv; my *= inv;
    const buttons = mode === 'buttons';
    let aimVec: Ctl['aimVec'] = null, fire = true;
    if (buttons) {
      const ax = (h.has('b') ? 1 : 0) - (h.has('z') ? 1 : 0), ay = (h.has('a') ? 1 : 0) - (h.has('y') ? 1 : 0);
      if (ax || ay) aimVec = { x: ax, y: ay }; else fire = true;
    } else if (mode === 'axes') {
      if (Math.hypot(input.paddleL, input.paddleR) > 0.25) aimVec = { x: input.paddleL, y: input.paddleR };
    }
    const aimAuto = mode === 'auto' || (mode !== 'buttons' && input.paddleIdleS > autoAimIdle() && !aimVec);
    return {
      mx, my, aimAuto, aimVec, fire,
      dash: buttons ? input.pressed.has('shiftUpR') : input.pressed.has('a'),
      potion: buttons ? input.pressed.has('shiftDnR') : input.pressed.has('b'),
    };
  }

  function nearestEnemy(): Enemy | null {
    let best: Enemy | null = null, bd = Infinity;
    for (const e of liveInRoom(current)) {
      const d = Math.hypot(e.x - P.x, e.y - P.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  function autopilotCtl(bike: Readonly<BikeState>): Ctl {
    let mx = 0, my = 0, dash = false;
    const near = nearestEnemy();
    const room = activeRoom();
    if (near && (room.locked || near.kind === 'boss')) {
      const dx = near.x - P.x, dy = near.y - P.y, d = Math.hypot(dx, dy) || 1;
      const want = near.kind === 'spitter' || near.kind === 'boss' ? 5.5 : 3.2;
      let s = d > want + 1 ? 1 : d < want - 1 ? -1 : 0;
      mx = (dx / d) * s; my = (dy / d) * s;
      if (s === 0) { mx = -dy / d * 0.6; my = dx / d * 0.6; } // circle-strafe
      // dodge nearby hostile bullets
      for (const b of bullets) {
        if (b.friendly) continue;
        const bx = b.x - P.x, by = b.y - P.y, bd = Math.hypot(bx, by);
        if (bd < 2.2 && bd > 0.01) { mx -= (bx / bd) * 1.2; my -= (by / bd) * 1.2; }
      }
      // keep inside the room (steer to centre if near walls)
      const cx = room.x0 + room.w / 2 - P.x, cy = room.y0 + room.h / 2 - P.y;
      if (!inRoom(room, P.x, P.y, 1.6)) { mx += cx * 0.2; my += cy * 0.2; }
      if (d < 1.4 && P.hp < P.maxHp * 0.6 && P.dashCd <= 0) { dash = true; mx = -dx / d; my = -dy / d; }
    } else {
      // walk the chain of rooms
      const link = world.links[Math.min(current, world.links.length - 1)];
      if (current >= world.rooms.length - 1 && !boss.alive) { /* done */ }
      else if (link) {
        if (apLink !== link.from) { apLink = link.from; apWp = 0; }
        let wp = link.points[Math.min(apWp, link.points.length - 1)];
        if (Math.hypot(wp.x - P.x, wp.y - P.y) < 0.5 && apWp < link.points.length - 1) { apWp++; wp = link.points[apWp]; }
        mx = wp.x - P.x; my = wp.y - P.y;
        if (apWp >= link.points.length - 1 && Math.hypot(mx, my) < 0.6) { const nr = world.rooms[link.to]; mx = nr.x0 + nr.w / 2 - P.x; my = nr.y0 + nr.h / 2 - P.y; }
      }
    }
    const n = Math.hypot(mx, my);
    if (n > 1) { mx /= n; my /= n; }
    return { mx, my, dash, potion: P.hp < P.maxHp * 0.35 && P.potions > 0, aimAuto: true, aimVec: null, fire: true };
  }

  // ---------- update ----------
  function update(dt: Seconds) {
    if (over) return;
    t += dt;
    const bike = ctx.bike(), input = ctx.input();
    const ctl = readCtl(input, bike);

    // --- player movement
    P.dashCd = Math.max(0, P.dashCd - dt);
    P.invuln = Math.max(0, P.invuln - dt);
    const tile = tileAt(world, Math.floor(P.x), Math.floor(P.y));
    P.onSwamp = tile === TILE.SWAMP;
    P.speedMult = speedCurve(bike.cadence3s);
    if (ctl.dash && P.dashCd <= 0 && P.dashT <= 0) {
      let dx = ctl.mx, dy = ctl.my;
      if (!dx && !dy) { dx = Math.cos(P.aim); dy = Math.sin(P.aim); }
      const n = Math.hypot(dx, dy) || 1;
      P.dashDx = dx / n; P.dashDy = dy / n; P.dashT = 0.15; P.dashCd = dashCooldown(); P.invuln = Math.max(P.invuln, 0.3);
    }
    if (ctl.potion && P.potions > 0 && P.hp < P.maxHp) { P.potions--; P.hp = Math.min(P.maxHp, P.hp + 40); }
    if (P.dashT > 0) {
      P.dashT -= dt;
      const step = (14) * dt;
      move(P, P.dashDx * step, P.dashDy * step, PLAYER_R);
    } else {
      const sp = baseSpeed() * P.speedMult * dt;
      if (ctl.mx || ctl.my) { move(P, ctl.mx * sp, ctl.my * sp, PLAYER_R); P.moveAng = Math.atan2(ctl.my, ctl.mx); }
    }

    // --- room entry
    const room = activeRoom();
    if (!inRoom(room, P.x, P.y, 0)) {
      for (const r of world.rooms) if (r.id !== current && inRoom(r, P.x, P.y, 0.75)) {
        room.locked = false; current = r.id;
        if (!r.cleared) {
          r.locked = true;
          if (r.boss && !bossStarted) { bossStarted = true; bossT = 0; ctx.emit({ type: 'bossStart', data: { room: r.id } }); }
        }
        break;
      }
    }

    // --- aim
    const target = nearestEnemy();
    const mode = ctx.profile.settings.aimMode;
    if (ctl.aimVec) P.aim = Math.atan2(ctl.aimVec.y, ctl.aimVec.x);
    else if (ctl.aimAuto) { if (target) P.aim = Math.atan2(target.y - P.y, target.x - P.x); else if (ctl.mx || ctl.my) P.aim = P.moveAng; }
    else if (mode === 'rotate' || mode === 'auto') P.aim += (input.paddleR - input.paddleL) * aimTurn() * dt;
    P.aimAuto = ctl.aimAuto;

    // --- firing
    const revs = bike.crankRevs, per = revsPerShot();
    if (revs < P.lastShotRevs) P.lastShotRevs = revs;
    let shots = 0;
    while (revs - P.lastShotRevs >= per && shots < 6) {
      P.lastShotRevs += per; shots++;
      const dmg = baseDamage() * clamp(bike.ftpFraction, 0.3, 2.5);
      bullets.push({ x: P.x, y: P.y, vx: Math.cos(P.aim) * 12, vy: Math.sin(P.aim) * 12, r: 0.25, dmg, life: 0.9, friendly: true });
    }
    if (revs - P.lastShotRevs >= per) P.lastShotRevs = revs;

    // --- bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      let dead = b.life <= 0 || solid(Math.floor(b.x), Math.floor(b.y));
      if (!dead && b.friendly) {
        for (const e of enemies) {
          if (!e.alive || e.room !== current || (e.kind === 'boss' && !bossStarted)) continue;
          if (Math.hypot(e.x - b.x, e.y - b.y) < e.r + b.r) { damageEnemy(e, b.dmg, bike); dead = true; break; }
        }
      } else if (!dead && Math.hypot(P.x - b.x, P.y - b.y) < PLAYER_R + b.r) { hurtPlayer(b.dmg); dead = true; }
      if (dead) bullets.splice(i, 1);
    }

    // --- enemies
    if (bossStarted && boss.alive) bossT += dt;
    for (const e of liveInRoom(current)) {
      const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy) || 1;
      e.contactCd = Math.max(0, e.contactCd - dt);
      if (e.kind === 'chaser' || e.kind === 'brute') {
        move(e, (dx / d) * e.speed * dt, (dy / d) * e.speed * dt, e.r);
      } else if (e.kind === 'spitter') {
        const s = d < 4.5 ? -1 : d > 7 ? 1 : 0;
        move(e, (dx / d) * s * e.speed * dt, (dy / d) * s * e.speed * dt, e.r);
        e.fireCd -= dt;
        if (e.fireCd <= 0) { e.fireCd = 2.4; ring(e.x, e.y, 8, 3.2, 6, ctx.rng() * Math.PI * 2); }
      } else { // boss
        if (d > 5) move(e, (dx / d) * e.speed * dt, (dy / d) * e.speed * dt, e.r);
        e.fireCd -= dt; e.fireCd2 -= dt;
        if (e.fireCd <= 0) { e.fireCd = 2.2; e.spin += 0.3; ring(e.x, e.y, 14, 3.8, 6, e.spin); }
        if (e.fireCd2 <= 0) {
          e.fireCd2 = 1.4;
          const a = Math.atan2(dy, dx);
          for (const o of [-0.25, 0, 0.25]) bullets.push({ x: e.x, y: e.y, vx: Math.cos(a + o) * 5, vy: Math.sin(a + o) * 5, r: 0.22, dmg: 7, life: 4, friendly: false });
        }
      }
      if (d < e.r + PLAYER_R + 0.1 && e.contactCd <= 0) { hurtPlayer(e.contact); e.contactCd = e.kind === 'brute' ? 1 : 0.8; }
    }

    // --- room clear
    const cur = activeRoom();
    if (cur.locked && liveInRoom(cur.id).length === 0 && (!cur.boss || !boss.alive)) {
      cur.locked = false; cur.cleared = true;
      if (!cur.boss) { roomsCleared++; ctx.emit({ type: 'roomCleared', data: { room: cur.id } }); }
    }

    // --- survival
    const inCombat = cur.locked && liveInRoom(cur.id).length > 0;
    if (bike.effortZone === 2 && P.hp < P.maxHp) P.hp = Math.min(P.maxHp, P.hp + regenPerS() * (inCombat ? 1 : 2) * dt);
    if (P.hp <= 0) die();

    // --- resistance
    const sh = bossShield();
    resSync('terrain', terrainGrade());
    resSync('swamp', P.onSwamp ? swampGrade() : null);
    resSync('wounded', P.hp < P.maxHp * woundedFrac() ? woundedGrade() : null);
    resSync('boss-surge', sh.shielded ? surgeGrade() : null);

    ctx.debug('room', current); ctx.debug('hp', Math.round(P.hp)); ctx.debug('onSwamp', P.onSwamp);
  }

  function die() {
    deaths++;
    ctx.emit({ type: 'death', data: { room: current } });
    const here = activeRoom();
    here.locked = false;
    const safe = world.rooms[Math.max(0, current - 1)];
    current = safe.id;
    P.x = safe.x0 + safe.w / 2; P.y = safe.y0 + safe.h / 2;
    P.hp = P.maxHp; P.invuln = 2; P.dashT = 0; P.lastHurtT = -99;
    bullets.length = 0;
  }

  function snapshot(): DungeonSnapshot {
    const sh = bossShield();
    const ev: EnemyView[] = [];
    for (const e of enemies) if (e.alive && (e.kind !== 'boss' || bossStarted)) ev.push({ id: e.id, kind: e.kind, x: e.x, y: e.y, r: e.r, hp: e.hp, maxHp: e.maxHp, shielded: e.kind === 'boss' && sh.shielded });
    const bv: BulletView[] = bullets.map((b) => ({ x: b.x, y: b.y, r: b.r, friendly: b.friendly }));
    return {
      t, world,
      player: { x: P.x, y: P.y, r: PLAYER_R, hp: P.hp, maxHp: P.maxHp, potions: P.potions, dashCd: P.dashCd, dashCdMax: dashCooldown(), invuln: P.invuln > 0, onSwamp: P.onSwamp, speedMult: P.speedMult },
      aim: { angle: P.aim, auto: P.aimAuto },
      enemies: ev, bullets: bv, room: current,
      boss: bossStarted ? { active: boss.alive, hp: boss.hp, maxHp: boss.maxHp, shielded: sh.shielded, shieldLeftS: sh.leftS, nextShieldS: sh.nextS } : null,
      stats: { roomsCleared, kills, deaths, damageDealt, bossDefeated },
      hooks: { boss: bossStarted && boss.alive, shielded: sh.shielded, swamp: P.onSwamp },
    };
  }

  return {
    update, snapshot, isOver: () => over,
    summary: () => ({ roomsCleared, kills, deaths, damageDealt: Math.round(damageDealt), bossDefeated, timeS: Math.round(t) }),
    dispose() { ctx.resistance.clearAll(); ctx.resistance.useVirtualGears(false); },
  };
}
