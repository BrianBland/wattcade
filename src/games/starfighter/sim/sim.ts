import type { GameContext, GameHud, GameSim, MediaTimeline } from '../../../contracts';
import { clamp, createDirector, sectionLabel, sectionTarget } from './director';
import { craftName, escortAvailable, migrateSave } from './save';
import { SECTORS } from './content';
import type { CraftId, EnemyView, SfSnapshot, ShotView, BoltView, FxView, LaserView } from './types';
export type { SfSnapshot } from './types';
export const H = 100, SHIP_Y = 84;
export interface SfOpts { autopilot?: boolean; skipHangar?: boolean; craft?: CraftId; endless?: boolean }

export function createSfSim(ctx: GameContext, opts: SfOpts = {}): GameSim {
  const tun = {
    floor: ctx.tuning.num('cruiseFloor', 0.56, 0.4, 0.7, 0.01), ceiling: ctx.tuning.num('cruiseCeiling', 0.75, 0.7, 0.9, 0.01),
    cadence: ctx.tuning.num('minCadence', 55, 35, 75, 1), grace: ctx.tuning.num('underGraceS', 3, 1, 10, 0.5),
    start: ctx.tuning.num('startGraceS', 10, 3, 20, 1), bossEvery: ctx.tuning.num('bossEveryS', 360, 40, 600, 10),
    firstBoss: ctx.tuning.num('firstBossS', 150, 40, 360, 10),
    bossHull: ctx.tuning.num('bossHull', 850, 50, 4000, 50),
    bossTime: ctx.tuning.num('bossTimeoutS', 75, 30, 120, 5), chargeS: ctx.tuning.num('novaChargeS', 90, 10, 180, 5),
    coverS: ctx.tuning.num('novaCoverS', 20, 5, 40, 1), rejoinS: ctx.tuning.num('rejoinS', 8, 3, 20, 1),
    recovery: ctx.tuning.num('recoveryFtp', 0.5, 0.3, 0.56, 0.01), settle: ctx.tuning.num('ergSettleS', 6, 2, 12, 1),
    earnS: ctx.tuning.num('salvageEveryS', 12, 3, 30, 1), cadenceGap: ctx.tuning.num('cadenceGapS', 150, 60, 300, 10),
  };
  const timeline: MediaTimeline | undefined = ctx.media?.timeline;
  const director = createDirector(timeline);
  const save = migrateSave(ctx.load<Record<string, unknown>>());
  const ergAvailable = ctx.trainerCapabilities?.()?.erg === true;
  let craft: CraftId = opts.craft ?? save.craft;
  if (craft === 'escort' && (!escortAvailable(save) || !ergAvailable)) craft = 'cruiser';
  let menu = !opts.autopilot && !opts.skipHangar, menuT = 0, started = false, done = false;
  let t = 0, p = 0, id = 0, score = 0, kills = 0, combo = 0, maxCombo = 0, deaths = 0, bosses = 0, escaped = 0, sector = 1;
  let hull = 100, shield = 100, quality = 1, underS = 0, charge = 0, coverLeft = 0, rejoinLeft = 0;
  let onTargetS = 0, salvage = 0, earned = 0, gunLevel = 1, banner = '', bannerUntil = 0;
  let x = 0, shipY = SHIP_Y, bank = 0, dodge = 0, dodgeX = 0, selectedId: number | null = null;
  let lockIn = 0, volleyAge = 0, volleyAt = -99, volleys = 0, dodges = 0;
  const locks: number[] = [], lasers: LaserView[] = [];
  let fireIn = 0, spawnIn = 2, lastSpawn = -99, encounter = 0, bossDue = Math.min(tun.firstBoss(), tun.bossEvery()), bossAt: number | null = null;
  let bossStart = 0, boss: EnemyView | null = null, targetFtp = 0.65, settleLeft = tun.start(), lastWanted = 0.65;
  let music = director.step(0), cadence: SfSnapshot['cadence'] = null, cadenceLast = 0, cadSuccess = 0, rapidLeft = 0;
  let effort: SfSnapshot['effort'] = { status: 'settling', targetWatts: 130, floorWatts: 112, ceilingWatts: 150, erg: false };
  const enemies: EnemyView[] = [], shots: ShotView[] = [], bolts: BoltView[] = [], fx: FxView[] = [];
  const actions: Array<{ type: string; craft?: CraftId; direction?: number }> = [];
  let savedOn = 0, savedKills = 0, savedBosses = 0, saveAt = 0;
  const emit = (type: string, data?: Record<string, number | string | boolean>) => ctx.emit({ type, data });
  const announce = (text: string) => { banner = text; bannerUntil = t + 4; };
  const effect = (kind: FxView['kind'], ex: number, ey: number) => fx.push({ id: ++id, kind, x: ex, y: ey, at: t });
  const persist = () => {
    save.onTargetS += Math.max(0, onTargetS - savedOn); savedOn = onTargetS;
    save.totals.kills += kills - savedKills; savedKills = kills;
    save.totals.bosses += bosses - savedBosses; savedBosses = bosses;
    save.best = Math.max(save.best, Math.round(score)); save.craft = craft;
    ctx.save(structuredClone(save)); saveAt = t;
  };
  const launch = () => {
    if (started) return; menu = false; started = true; save.runs++;
    ctx.resistance.useVirtualGears(craft === 'cruiser', 'L'); persist();
    announce(`${craftName(craft)} · hold the groove`);
  };
  const unlockCheck = () => escortAvailable({ ...save, onTargetS: save.onTargetS + onTargetS - savedOn });
  const kill = (e: EnemyView) => {
    effect('boom', e.x, e.y); kills++; combo++; maxCombo = Math.max(maxCombo, combo);
    score += e.kind === 'boss' ? 5000 : e.kind === 'armor' ? 180 : 100;
    if (e.parentId && boss?.id === e.parentId) boss.hp -= boss.maxHp * 0.15;
    if (e.kind === 'boss') {
      for (const mount of enemies) if (mount.parentId === e.id) { effect('boom',mount.x,mount.y); mount.hp=-1; mount.y=SHIP_Y; }
      bosses++; sector++; boss = null; bossDue = p + tun.bossEvery(); bossAt = null; emit('bossDefeated'); announce('Flagship destroyed'); }
    emit('enemyKilled');
  };
  const nova = () => {
    if (!started || done || charge < 100 || coverLeft > 0 || rejoinLeft > 0) return;
    charge = 0; coverLeft = tun.coverS(); settleLeft = tun.settle(); bolts.length = 0;
    for (const e of enemies) e.hp -= e.kind === 'boss' ? 180 : e.hp;
    effect('nova', x, SHIP_Y); emit('nova'); announce('Nova · escort cover, take a breather');
  };
  const hurt = (amount: number) => {
    if (coverLeft > 0 || rejoinLeft > 0 || t < tun.start()) return;
    combo = 0; const absorbed = Math.min(shield, amount); shield -= absorbed; hull -= amount - absorbed;
    if (hull <= 0) {
      deaths++; rejoinLeft = tun.rejoinS(); hull = 100; shield = 100; bolts.length = 0;
      for (const e of enemies) if (e.kind !== 'boss') { e.hp = -1; e.y = SHIP_Y; }
      emit('shipLost'); announce('Regrouping · easy spin, squadron returning'); persist();
    }
  };
  const spawn = () => {
    if (enemies.length > 40) return;
    const recovery = music.kind === 'break' || music.kind === 'outro';
    const n = recovery ? 3 : 5 + Math.floor(music.intensity * 3);
    const kind: EnemyView['kind'] = music.kind === 'build' ? 'armor' : music.kind === 'drop' ? 'weaver' : encounter % 3 === 2 ? 'gunner' : 'drone';
    const center = (ctx.rng() - 0.5) * 32;
    for (let i = 0; i < n; i++) {
      const hp = kind === 'armor' ? 54 : kind === 'gunner' ? 36 : 26;
      enemies.push({ id: ++id, kind, x: clamp(center + (i - (n - 1) / 2) * 10, -42, 42), y: -4 - (encounter % 3 === 0 ? Math.abs(i - (n - 1) / 2) * 5 : encounter % 3 === 1 ? i * 3 : 0),
        hp, maxHp: hp, age: 0, fireAt: 4 + i * 0.6, bossStyle: 0 });
    }
  };
  const targetable = () => enemies.filter(e => e.hp > 0 && e.y < SHIP_Y - 12).sort((a, b) => a.x - b.x || a.id - b.id);
  const retarget = (direction: number) => {
    const candidates = targetable();
    if (!candidates.length) { selectedId = null; return; }
    const index = candidates.findIndex(e => e.id === selectedId);
    selectedId = candidates[(index < 0 ? 0 : index + (direction < 0 ? -1 : 1) + candidates.length) % candidates.length].id;
    // Redirect the next acquisition; already painted locks remain committed.
    lockIn = Math.min(lockIn, 0.15); emit('retarget', { target: selectedId });
  };
  const shot = (sx: number, kind: ShotView['kind'], target: EnemyView | undefined, damage: number) => {
    const ey = shipY - 5, dy = (target?.y ?? -20) - ey, dx = (target?.x ?? sx) - sx, d = Math.hypot(dx, dy) || 1;
    shots.push({ id: ++id, x: sx, y: ey, vx: dx / d * 105, vy: dy / d * 105, damage, kind });
  };
  if (!menu) launch();
  return {
    inMenu: () => menu, isOver: () => done,
    receive(a: unknown) {
      if (a && typeof a === 'object' && 'type' in a) actions.push(a as { type: string; craft?: CraftId; direction?: number });
    },
    update(dt) {
      if (done) return;
      const bike = ctx.bike(), pressed = ctx.input().pressed;
      if (menu) {
        if (pressed.has('left') || pressed.has('right') || pressed.has('up') || pressed.has('down')) if (unlockCheck() && ergAvailable) craft = craft === 'cruiser' ? 'escort' : 'cruiser';
        if (pressed.has('a') || pressed.has('b')) actions.push({ type: 'launch' });
        for (const a of actions.splice(0)) {
          if (a.type === 'craft' && (a.craft === 'cruiser' || a.craft === 'escort' && unlockCheck() && ergAvailable)) craft = a.craft;
          if (a.type === 'launch') launch();
        }
        if (bike.cadence3s > 30) menuT += dt;
        if (menuT >= 20) launch();
        return;
      }
      t += dt; p = ctx.media ? ctx.media.positionS() : t;
      music = director.step(p);
      coverLeft = Math.max(0, coverLeft - dt); rejoinLeft = Math.max(0, rejoinLeft - dt); rapidLeft = Math.max(0, rapidLeft - dt);
      if (pressed.has('a') || pressed.has('y') || pressed.has('powerUpR')) nova();
      if (pressed.has('shiftDnR') || pressed.has('left')) retarget(-1);
      if (pressed.has('shiftUpR') || pressed.has('right')) retarget(1);
      for (const a of actions.splice(0)) {
        if (a.type === 'nova') nova();
        if (a.type === 'target') retarget(a.direction ?? 1);
      }
      const protectedRide = coverLeft > 0 || rejoinLeft > 0;
      const erg = craft === 'escort';
      const wanted = protectedRide ? tun.recovery() : erg ? sectionTarget(music.kind) : 0.65;
      if (Math.abs(wanted - lastWanted) > 0.005) { settleLeft = tun.settle(); lastWanted = wanted; }
      targetFtp += (wanted - targetFtp) * (1 - Math.exp(-dt / 2.5));
      const scaled = erg ? Math.min(ctx.profile.settings.ergCapFtpFraction, Math.max(60 / ctx.profile.ftp, targetFtp * ctx.profile.settings.difficulty)) : 0.65;
      const floor = protectedRide ? 0 : erg ? scaled * 0.85 : tun.floor();
      const ceiling = protectedRide ? 0 : erg ? scaled * 1.15 : tun.ceiling();
      const pedalling = bike.cadence3s >= tun.cadence();
      const under = !pedalling || bike.ftpFraction < floor;
      const over = ceiling > 0 && bike.ftpFraction > ceiling;
      settleLeft = Math.max(0, settleLeft - dt);
      const settling = t < tun.start() || erg && settleLeft > 0 && pedalling;
      const ok = !under && !over && !protectedRide && !settling;
      underS = under && !protectedRide && !settling ? underS + dt : 0;
      const desiredQuality = protectedRide ? (pedalling ? 1 : 0.3) : underS > tun.grace() ? clamp(1 - (underS - tun.grace()) / 8, 0, 1) : 1;
      quality += (desiredQuality - quality) * (1 - Math.exp(-dt / 1.5));
      effort = { status: protectedRide ? 'recover' : settling ? 'settling' : under ? 'under' : over ? 'over' : 'on',
        targetWatts: Math.round(scaled * ctx.profile.ftp), floorWatts: Math.round(floor * ctx.profile.ftp), ceilingWatts: Math.round(ceiling * ctx.profile.ftp), erg };
      if (erg) ctx.resistance.set({ id: 'squadron', mode: 'erg', ftpFraction: targetFtp });
      else ctx.resistance.set({ id: 'squadron', mode: 'sim', gradePct: 0 });
      if (ok) {
        onTargetS += dt; charge = Math.min(100, charge + dt * 100 / tun.chargeS());
        earned += dt; while (earned >= tun.earnS()) { earned -= tun.earnS(); salvage += 10; score += 25; }
      }
      const newLevel = Math.min(5, 1 + Math.floor(salvage / 50));
      if (newLevel > gunLevel) { gunLevel = newLevel; announce(`Arsenal ${gunLevel} · ${['', 'Pulse', 'Twin pulse', 'Spread cannons', 'Prism array', 'Full squadron'][gunLevel]}`); effect('upgrade', x, SHIP_Y); emit('gunUpgrade', { level: gunLevel }); }
      if (!cadence && p >= cadenceLast + tun.cadenceGap() && music.phrase && music.rpm && !protectedRide && !settling) {
        cadence = { min: music.rpm - 7, max: music.rpm + 7, left: 16, progress: 0 }; cadSuccess = 0;
        cadenceLast = p; announce(`Optional spin · ${music.rpm} RPM earns rapid fire`);
      }
      if (cadence) {
        cadence.left -= dt;
        if (ok && bike.cadence3s >= cadence.min && bike.cadence3s <= cadence.max) cadSuccess += dt;
        cadence.progress = clamp(cadSuccess / 10, 0, 1);
        if (cadence.progress >= 1 || cadence.left <= 0 || protectedRide) {
          if (cadence.progress >= 1) { rapidLeft = 20; emit('spinUpDone', { completed: true }); announce('Rapid fire online'); }
          cadence = null;
        }
      }
      // Predict nearby bullets and bank into a safe lane while protection is active.
      const cruiseX = Math.sin(t * 0.22) * 12 + Math.sin(t * 0.57) * 3;
      const threat = bolts.filter(b => b.vy > 0 && b.y > SHIP_Y - 32 && b.y < SHIP_Y + 3)
        .sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0];
      const evading = !!threat && quality >= 0.8 && pedalling && Math.abs(threat.x + threat.vx * Math.max(0, (shipY - threat.y) / threat.vy) - x) < 10;
      if (evading && dodge < 0.1) { dodges++; emit('autoDodge'); }
      dodge += ((evading ? 1 : 0) - dodge) * (1 - Math.exp(-dt * (evading ? 10 : 2)));
      if (evading) dodgeX = threat!.x >= x ? -12 : 12;
      const oldX = x;
      x += (clamp(cruiseX + dodgeX * dodge, -38, 38) - x) * (1 - Math.exp(-dt * (evading ? 9 : 2.5)));
      shipY = SHIP_Y - dodge * 3;
      bank += (clamp((x - oldX) / Math.max(dt, 0.001) * -0.018, -0.5, 0.5) - bank) * (1 - Math.exp(-dt * 8));
      if (music.phrase) encounter++;
      if (sector === 1 && !boss && bossAt === null) bossDue = Math.min(bossDue, tun.bossEvery());
      if (!boss && bossAt === null && p >= bossDue - 8) bossAt = director.bossAt(Math.max(bossDue, p + 8));
      if (!boss && bossAt !== null && p >= bossAt) {
        const hp = tun.bossHull() + (sector - 1) * 100;
        boss = { id: ++id, kind: 'boss', x: 0, y: 14, hp, maxHp: hp, age: 0, fireAt: 2, bossStyle: (sector - 1) % 5 };
        enemies.push(boss);
        for (const mountX of [-15,0,15]) {
          const hp = Math.max(24, tun.bossHull()*0.1);
          enemies.push({id:++id,kind:'turret',parentId:boss.id,mountX,x:mountX,y:20,hp,maxHp:hp,age:0,fireAt:3,bossStyle:0});
        }
        bossStart = p; announce(`${SECTORS[(sector - 1) % 5].name} · flagship inbound`); emit('bossArrived');
      }
      if (boss && p - bossStart >= tun.bossTime()) {
        const i = enemies.indexOf(boss); if (i >= 0) enemies.splice(i, 1);
        for(let i=enemies.length-1;i>=0;i--) if(enemies[i].parentId===boss.id) enemies.splice(i,1);
        escaped++; sector++; boss = null; bossAt = null; bossDue = p + tun.bossEvery(); emit('bossEscaped'); announce('Flagship escaped · back to cruise');
      }
      spawnIn -= dt;
      if (((music.downbeat || music.phrase || !timeline?.downbeats.length && music.beat) && p - lastSpawn > (boss ? 7 : 2.6) || spawnIn <= 0) && !protectedRide) {
        spawn(); lastSpawn = p; spawnIn = boss ? 8 : 4;
      }
      const candidates = targetable();
      if (!candidates.some(e => e.id === selectedId)) selectedId = [...candidates].sort((a, b) => b.y - a.y)[0]?.id ?? null;
      for (let i = locks.length - 1; i >= 0; i--) if (!candidates.some(e => e.id === locks[i])) locks.splice(i, 1);
      const capacity = 4 + gunLevel - 1;
      volleyAge += dt; lockIn -= dt;
      if (pedalling && quality >= 0.8 && candidates.length && locks.length < capacity && lockIn <= 0) {
        const priority = candidates.find(e => e.id === selectedId)!;
        const ordered = [priority, ...candidates.filter(e => e.id !== selectedId).sort((a, b) => b.y - a.y)];
        const target = ordered.find(e => !locks.includes(e.id)) ?? priority;
        locks.push(target.id); lockIn = 0.38; emit('lockAcquired', { target: target.id, count: locks.length });
      }
      if (locks.length && pedalling && quality >= 0.8 && (volleyAge >= 2.4 && (music.downbeat || music.phrase || music.beat) || volleyAge >= 3.4)) {
        locks.forEach((targetId, i) => {
          const e = candidates.find(e => e.id === targetId)!;
          lasers.push({ id: ++id, targetId, sx: x, sy: shipY - 3, x: e.x, y: e.y, at: t + i * 0.045,
            side: (i % 2 ? 1 : -1) * (12 + i * 2), damage: 24 + gunLevel * 3, hit: false });
        });
        emit('lockVolley', { locks: locks.length }); volleys++; locks.length = 0; volleyAge = 0; volleyAt = t;
      }
      if (!pedalling || quality < 0.3) locks.length = 0;
      fireIn -= dt;
      if ((fireIn <= 0 || (music.beat || music.hit) && fireIn < 0.15) && quality > 0.05 && pedalling) {
        const targets = enemies.filter(e => e.hp > 0 && e.y < SHIP_Y).sort((a, b) => b.y - a.y);
        const n = Math.min(3, gunLevel) + (craft === 'escort' ? 0 : 1);
        for (let i = 0; i < n; i++) shot(x + (i - (n - 1) / 2) * 2.3, 'pulse', boss && i >= 2 ? boss : targets[i % Math.max(1, targets.length)], 2 + gunLevel * 0.35);

        const wingmen = craft === 'escort' ? 2 : gunLevel >= 5 ? 2 : 0;
        for (let i = 0; i < wingmen; i++) shot(x + (i ? 10 : -10), 'wing', targets[i % Math.max(1, targets.length)], 5);
        fireIn = (rapidLeft > 0 ? 0.2 : 0.45) / Math.max(0.1, quality);
      }
      for (const e of enemies) {
        if (e.hp <= 0) continue;
        e.age += dt;
        if (e.parentId) { if (!boss || boss.id !== e.parentId) { e.hp=-1;e.y=SHIP_Y;continue; } e.x=boss.x+(e.mountX??0);e.y=boss.y+4; }
        else if (e.kind === 'boss') { e.x = Math.sin(e.age * (0.3 + e.bossStyle * 0.08)) * 24; e.y = 16 + Math.sin(e.age * 0.4) * 3; }
        else { e.y += dt * (e.kind === 'armor' ? 7 : 10); if (e.kind === 'weaver') e.x += Math.cos(e.age * 1.4 + e.id) * dt * 9; else if (e.kind === 'drone') e.x += Math.sin(e.age * 0.8 + encounter) * dt * 3; }
        if ((e.kind === 'boss' || e.kind === 'gunner' || e.kind === 'weaver' || e.kind === 'turret') && e.age >= e.fireAt) {
          e.fireAt += e.kind === 'boss' ? (e.hp < e.maxHp*0.4 ? 1.1 : 1.8) : 3;
          const n = e.kind === 'boss' ? 3 + e.bossStyle : 1;
          for (let i = 0; i < n; i++) {
            const a = Math.atan2(shipY - e.y, x - e.x) + (i - (n - 1) / 2) * 0.13;
            bolts.push({ id: ++id, x: e.x, y: e.y, vx: Math.cos(a) * 24, vy: Math.sin(a) * 24 });
          }
        }
        if (e.y >= SHIP_Y) {
          if (quality >= 0.8 && pedalling) effect('intercept', e.x, SHIP_Y - 4);
          else hurt(e.kind === 'armor' ? 20 : 12);
          e.hp = -1;
        }
      }
      for (const s of shots) {
        s.x += s.vx * dt; s.y += s.vy * dt;
        const hit = enemies.find(e => e.hp > 0 && Math.hypot(e.x - s.x, e.y - s.y) < (e.kind === 'boss' ? 10 : 4));
        if (hit) { hit.hp -= s.damage * (hit.kind === 'boss' ? 0.1 : 1); s.y = -200; }
      }
      for (const laser of lasers) {
        const e = enemies.find(e => e.id === laser.targetId && e.hp > 0);
        if (e && !laser.hit) { laser.x = e.x; laser.y = e.y; }
        if (!laser.hit && t - laser.at >= 0.52) {
          laser.hit = true;
          if (e) { e.hp -= laser.damage * (e.kind === 'boss' ? (enemies.some(m=>m.parentId===e.id && m.hp>0) ? 0.2 : 0.65) : 1); effect('intercept', e.x, e.y); }
        }
      }
      for (let i = lasers.length - 1; i >= 0; i--) if (t - lasers[i].at > 1.3) lasers.splice(i, 1);
      for (const b of bolts) {
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (Math.hypot(b.x - x, b.y - shipY) < 3.5) {
          if (quality >= (craft === 'escort' ? 0.65 : 0.8) && pedalling) effect('intercept', b.x, b.y);
          else hurt(8);
          b.y = 200;
        }
      }
      for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i].hp <= 0) {
        if (enemies[i].y < SHIP_Y) kill(enemies[i]); else combo = 0;
        enemies.splice(i, 1);
      }
      for (let i = shots.length - 1; i >= 0; i--) if (shots[i].y < -30 || Math.abs(shots[i].x) > 70) shots.splice(i, 1);
      for (let i = bolts.length - 1; i >= 0; i--) if (bolts[i].y > 110 || Math.abs(bolts[i].x) > 80) bolts.splice(i, 1);
      for (let i = fx.length - 1; i >= 0; i--) if (t - fx[i].at > 1.6) fx.splice(i, 1);
      if (quality > 0.8 && pedalling) shield = Math.min(100, shield + dt * 3);
      if (t - saveAt > 30) persist();
      if (!opts.endless && timeline && p >= timeline.durationS) { done = true; emit('setDone'); persist(); ctx.resistance.clear('squadron'); }
      ctx.debug('quality', quality); ctx.debug('craft', craft);
    },
    snapshot(): SfSnapshot {
      const theme = (sector - 1) % 5;
      return { t, phase: menu ? 'hangar' : 'run', done, craft, escortUnlocked: unlockCheck(), ergAvailable, unlockMinutes: Math.max(0, (600 - (save.onTargetS + onTargetS - savedOn)) / 60),
        menuLeft: Math.max(0, 20 - menuT), sector, sectorName: SECTORS[theme].name, section: music.kind, intensity: music.intensity, beat: music.beatPulse,
        song: music.song, shipX: x, shipY, bank, dodge, hull, shield, quality, effort,
        upcoming: music.upcoming && craft === 'escort' ? { label: sectionLabel(music.upcoming.kind), left: Math.max(0, music.upcoming.at - p), watts: Math.round(sectionTarget(music.upcoming.kind) * ctx.profile.ftp * ctx.profile.settings.difficulty) } : null,
        cadence, charge, coverLeft, rejoinLeft, gunLevel, wingmen: craft === 'escort' || gunLevel >= 5 ? 2 : 0, missiles: gunLevel >= 4,
        score: Math.round(score), kills, salvage, combo, deaths, selectedId, locks: [...locks], lockCapacity: 4 + gunLevel - 1, lockProgress: clamp(1 - lockIn / 0.38, 0, 1), volleyFlash: Math.max(0, 1 - (t - volleyAt) / 0.8), lasers, enemies, shots, bolts, fx,
        boss: boss ? { stage: enemies.some(e=>e.parentId===boss!.id && e.hp>0) ? 'Destroy the batteries' : 'Reactor exposed', name: ['Iron Dreadnought', 'Hive Carrier', 'Twin Lancer', 'Spiral Core', 'The Maw'][boss.bossStyle], hp: boss.hp, maxHp: boss.maxHp, left: Math.max(0, tun.bossTime() - (p - bossStart)) } : null,
        bossIn: !boss && bossAt !== null ? Math.max(0, bossAt - p) : null,
        banner: t < bannerUntil ? banner : '', hooks: { powerFtp: craft === 'escort' ? targetFtp : protectedTarget(), cadence: cadence ? (cadence.min + cadence.max) / 2 : 90, boss: !!boss } };
    },
    hud(): GameHud {
      return { gears: craft === 'cruiser', targetZone: { min: coverLeft > 0 || rejoinLeft > 0 ? 1 : 2, max: 2, source: 'power', label: menu ? 'Choose your craft' : effort.status === 'recover' ? 'Easy spin' : 'Hold Zone 2' },
        ...(cadence ? { targetCadence: { min: cadence.min, max: cadence.max, label: 'Optional rapid fire' } } : {}),
        controls: menu ? [{ button: 'dpad', label: 'Craft' }, { button: 'a', label: 'Launch' }] : [
          ...(craft === 'cruiser' ? [{ button: 'shiftersL' as const, label: 'Gears' }, { button: 'shiftersR' as const, label: 'Target ◀ ▶' }] : [{ button: 'shiftersR' as const, label: 'Target ◀ ▶' }]), { button: 'a', label: 'Nova', active: charge >= 100 }] };
    },
    summary: () => ({ score: Math.round(score), kills, bossesDefeated: bosses, bossesEscaped: escaped, sector, sectorsCleared: bosses, deaths, maxCombo, scrap: salvage, powerUps: gunLevel - 1, gunLevel, onTargetS: Math.round(onTargetS), craft, volleys, dodges, goldens: gunLevel - 1 }),
    dispose() { persist(); ctx.resistance.clear('squadron'); ctx.resistance.useVirtualGears(true); },
  };
  function protectedTarget() { return coverLeft > 0 || rejoinLeft > 0 ? tun.recovery() : 0.65; }
}
