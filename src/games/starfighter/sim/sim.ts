import type { GameContext, GameHud, GameSim, MediaTimeline } from '../../../contracts';
import { after, clamp, createDirector, sectionLabel, sectionTarget } from './director';
import { craftName, escortAvailable, migrateSave } from './save';
import { arsenalTier, craftLevel, CRAFTS, MAX_LEVEL, perks, rewardFor, WING_OFFSETS } from './progression';
import { MAX_ENEMIES, MAX_BOLTS, FIRE_EVERY, eliteEntry, groupOf, entryFor, advanceEntry, inCombat, bulletPattern, wallPattern, firesInFormation } from './encounters';
import { SECTORS } from './content';
import { newRoute, extendRoute, routeX, choreograph, ROUTE } from './flight';
import type { CraftId, EnemyView, SfSnapshot, ShotView, BoltView, FxView, LaserView } from './types';
export type { SfSnapshot } from './types';
export const H = 100, SHIP_Y = 84;
export interface SfOpts { autopilot?: boolean; skipHangar?: boolean; craft?: CraftId; endless?: boolean; /** Harness bot that targets elite wings like an attentive rider. */ smartTarget?: boolean }

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
    // Playtesting: 1 unlocks every craft at max level; pace speeds up in-ride arsenal growth.
    tester: ctx.tuning.num('testerUnlockAll', 0, 0, 1, 1), tierLock: ctx.tuning.num('tierLockScale', 0.95, 0.7, 1, 0.01), pace: ctx.tuning.num('arsenalPace', 1, 0.25, 20, 0.25),
  };
  const timeline: MediaTimeline | undefined = ctx.media?.timeline;
  const director = createDirector(timeline);
  const save = migrateSave(ctx.load<Record<string, unknown>>());
  const ergAvailable = ctx.trainerCapabilities?.()?.erg === true;
  let craft: CraftId = opts.craft ?? save.craft;
  if (craft === 'escort' && (!(tun.tester() >= 1 || escortAvailable(save)) || !ergAvailable)) craft = 'cruiser';
  let menu = !opts.autopilot && !opts.skipHangar, menuT = 0, started = false, done = false;
  let t = 0, p = 0, id = 0, score = 0, kills = 0, combo = 0, maxCombo = 0, deaths = 0, bosses = 0, escaped = 0, sector = 1;
  let hull = 100, shield = 100, quality = 1, underS = 0, charge = 0, coverLeft = 0, rejoinLeft = 0;
  let onTargetS = 0, salvage = 0, earned = 0, gunLevel = 1, banner = '', bannerUntil = 0;
  let x = 0, shipY = SHIP_Y, bank = 0, dodge = 0, absorbed = 0, selectedId: number | null = null;
  let lockIn = 0, volleyAge = 0, volleyAt = -99, volleys = 0, dodges = 0;
  const route = newRoute();
  let prevX = 0, grazed = 0;
  // Formation bookkeeping: an enemy resolves when it dies (kill) or passes the ship (escape).
  const squads = new Map<number, { total: number; killed: number; left: number; elite?: boolean }>();
  let elitePursuitUntil = -99;
  let selectedGroup: number | null = null, eliteHint: -1 | 0 | 1 = 0, eliteSeen = 0, eliteCleared = 0, airFormations = 0, eliteSide = 1;
  let clearKilled = 0, clearTotal = 0, perfects = 0, lastClear: SfSnapshot['clear']['last'] = null;
  let wall: { id: number; at: number } | null = null, lastWall = -99;
  const cruiseLine = (at: number) => Math.sin(at * 0.22) * 12 + Math.sin(at * 0.57) * 3;
  /** Next beat at or after sim time `at`, mapped through the media clock offset. */
  const phraseAfter = (at: number) => { const phrases = timeline?.phrases; if (!phrases?.length) return Infinity; const b = phrases[after(phrases, at - t + p - 1e-6)]; return b === undefined ? Infinity : b - p + t; };
  const beatAfter = (at: number) => { const beats = timeline?.beats; if (!beats?.length) return at; const b = beats[after(beats, at - t + p - 1e-6)]; return b !== undefined && b - p + t - at < 0.8 ? b - p + t : at; };
  const locks: number[] = [], lasers: LaserView[] = [];
  let groundIn = 8, formations = 0, bulletsFired = 0, groundKills = 0;
  let fireIn = 0, spawnIn = 2, lastSpawn = -99, encounter = 0, bossDue = Math.min(tun.firstBoss(), tun.bossEvery()), bossAt: number | null = null;
  let bossStart = 0, boss: EnemyView | null = null, targetFtp = 0.65, settleLeft = tun.start(), lastWanted = 0.65;
  let music = director.step(0), cadence: SfSnapshot['cadence'] = null, cadenceLast = 0, cadSuccess = 0, rapidLeft = 0;
  let effort: SfSnapshot['effort'] = { status: 'settling', targetWatts: 130, floorWatts: 112, ceilingWatts: 150, erg: false };
  const enemies: EnemyView[] = [], shots: ShotView[] = [], bolts: BoltView[] = [], fx: FxView[] = [];
  const actions: Array<{ type: string; craft?: CraftId; direction?: number }> = [];
  let savedOn = 0, savedKills = 0, savedBosses = 0, saveAt = 0;
  const emit = (type: string, data?: Record<string, number | string | boolean>) => ctx.emit({ type, data });
  const announce = (text: string) => { banner = text; bannerUntil = t + 4; };
  const effect = (kind: FxView['kind'], ex: number, ey: number, size = 1, ground = false) => fx.push({ id: ++id, kind, x: ex, y: ey, at: t, size, ground });
  const persist = () => {
    const gained = Math.max(0, onTargetS - savedOn);
    save.onTargetS += gained; save.craftS[craft] += gained; savedOn = onTargetS;
    if (!save.unlocked.includes('escort') && escortAvailable(save)) save.unlocked.push('escort');
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
  const pendingS = (c: CraftId) => save.craftS[c] + (c === craft && started ? Math.max(0, onTargetS - savedOn) : 0);
  const tester = () => tun.tester() >= 1;
  const unlockCheck = () => tester() || escortAvailable({ ...save, craftS: { ...save.craftS, cruiser: pendingS('cruiser') } });
  const levelOf = (c: CraftId) => tester() ? MAX_LEVEL : craftLevel(pendingS(c)).level;
  let rideLevel = 0, pk = perks(craft, levelOf(craft));
  let perfectStreak = 0, fullLockAt = -99, heavyIn = 3, eatIn = 0, eaten = 0, lastBeam = -99;
  const kill = (e: EnemyView) => {
    effect('boom', e.x, e.y, e.kind==='boss'?3:e.kind==='armor'||e.ground?1.5:1, e.ground); if(e.ground) groundKills++; kills++; combo++; maxCombo = Math.max(maxCombo, combo);
    score += e.kind === 'boss' ? 5000 : e.elite ? 350 : e.kind === 'armor' ? 180 : 100;
    if (e.parentId && boss?.id === e.parentId) boss.hp -= boss.maxHp * 0.15;
    if (e.kind === 'boss') {
      for (const mount of enemies) if (mount.parentId === e.id) { effect('boom',mount.x,mount.y); mount.hp=-1; mount.y=SHIP_Y; }
      bosses++; sector++; boss = null; bossDue = p + tun.bossEvery(); bossAt = null; emit('bossDefeated'); announce('Flagship destroyed'); }
    emit('enemyKilled');
  };
  const nova = () => {
    if (!started || done || charge < 100 || coverLeft > 0 || rejoinLeft > 0) return;
    charge = 0; coverLeft = tun.coverS(); settleLeft = tun.settle();
    // Escort Nova is a shield burst: it eats every bullet for score and staggers enemies; Cruiser Nova clears them.
    if (craft === 'escort') { score += bolts.length * 10; eaten += bolts.length; }
    bolts.length = 0;
    for (const e of enemies) if(inCombat(e)) e.hp -= e.kind === 'boss' ? 180 : craft === 'escort' ? e.maxHp * 0.6 : e.hp;
    effect('nova', x, SHIP_Y); emit('nova'); announce('Nova · escort cover, take a breather');
  };
  const hurt = (amount: number) => {
    if (coverLeft > 0 || rejoinLeft > 0 || t < tun.start()) return;
    combo = 0; const blocked = Math.min(shield, amount); shield -= blocked; hull -= amount - blocked;
    if (hull <= 0) {
      deaths++; rejoinLeft = tun.rejoinS(); hull = 100; shield = 100; bolts.length = 0;
      for (const e of enemies) if (e.kind !== 'boss') { e.hp = -1; e.y = SHIP_Y; }
      emit('shipLost'); announce('Regrouping · easy spin, squadron returning'); persist();
    }
  };
  const spawn = () => {
    const recovery = music.kind === 'break' || music.kind === 'outro';
    const n = Math.min(Math.max(0,Math.min(MAX_ENEMIES-enemies.length,60-enemies.filter(e=>!e.ground).length)), recovery ? 5 : 6 + Math.floor(music.intensity * 3.99));
    const kind: EnemyView['kind'] = music.kind === 'build' ? 'armor' : music.kind === 'drop' ? 'weaver' : encounter % 3 === 2 ? 'gunner' : 'drone';
    const center = (ctx.rng() - 0.5) * 20, pattern = formations++ % 3;
    // About once a minute (every eighth formation outside calm sections and flagship fights) an elite wing crosses the far field.
    const elite = !recovery && !boss && ++airFormations % 8 === 0, eliteY = -16 + ctx.rng() * 10;
    const size = elite ? Math.min(n, 5) : n;
    if (size > 0) squads.set(formations, { total: size, killed: 0, left: size, elite });
    if (elite) eliteSide = -eliteSide;
    for (let i = 0; i < size; i++) {
      const hp = elite ? 26 : kind === 'armor' ? 54 : kind === 'gunner' ? 36 : 26;
      const entry = elite ? eliteEntry(i, eliteSide, eliteY) : entryFor(i,n,pattern,center);
      enemies.push({ id: ++id, kind: elite ? 'weaver' : kind, elite, x: entry.fromX, y: entry.fromY, entry, formation: formations,
        hp, maxHp: hp, age: 0, fireAt: firesInFormation(kind, i) ? 4 + i * 0.2 : 1e9, bossStyle: 0 });
    }
  };
  const spawnGround = () => {
    const squad = ++formations, n = Math.min(3, MAX_ENEMIES - enemies.length);
    if (n > 0) squads.set(squad, { total: n, killed: 0, left: n });
    for(let i=0;i<n;i++) {
      const kind=i===1?'tank':'turret', toX=(i-1)*18+(ctx.rng()-0.5)*6;
      const hp=kind==='tank'?64:48;
      enemies.push({id:++id,kind,ground:true,formation:squad,x:toX,y:-500,entry:{fromX:toX,fromY:-500,toX,toY:-60-i*9,duration:8},
        hp,maxHp:hp,age:0,fireAt:9+i*0.3,bossStyle:0});
    }
  };
  const targetable = () => enemies.filter(inCombat).sort((a, b) => a.x - b.x || a.id - b.id);
  /** Formations in combat, keyed by group (boss batteries group with their flagship). */
  const groups = () => { const m = new Map<number, EnemyView[]>(); for (const e of targetable()) { const k = groupOf(e); const g = m.get(k); if (g) g.push(e); else m.set(k, [e]); } return m; };
  const centroid = (g: EnemyView[]) => g.reduce((a, e) => a + e.x, 0) / g.length;
  const retarget = (direction: number) => {
    const gs = [...groups()].sort((a, b) => centroid(a[1]) - centroid(b[1]) || a[0] - b[0]);
    if (!gs.length) { selectedGroup = null; selectedId = null; return; }
    const index = gs.findIndex(g => g[0] === selectedGroup);
    selectedGroup = gs[(index < 0 ? 0 : index + (direction < 0 ? -1 : 1) + gs.length) % gs.length][0];
    // Redirect the next acquisition; already painted locks remain committed.
    lockIn = Math.min(lockIn, 0.15); emit('retarget', { target: selectedGroup });
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
      // Craft level (persistent) can rise mid-ride; its perks apply at once.
      const level = levelOf(craft);
      if (level !== rideLevel) {
        if (rideLevel) { announce(`${craftName(craft)} level ${level} · ${rewardFor(craft, level)}`); effect('upgrade', x, SHIP_Y); emit('craftLevel', { level }); }
        rideLevel = level; pk = perks(craft, level);
      }
      const newLevel = arsenalTier(onTargetS, pk.arsenalCap, tun.pace());
      if (newLevel > gunLevel) { gunLevel = newLevel; announce(`Arsenal ${gunLevel} · ${['', 'Pulse', 'Twin pulse', 'Spread cannons', 'Prism array', 'Full squadron', 'Nova lattice', 'Star lance', 'Supernova'][gunLevel]}`); effect('upgrade', x, SHIP_Y); emit('gunUpgrade', { level: gunLevel }); }
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
      // Choreographed flight: follow the scheduled route; a sloppy pilot lags it and loses the authored misses.
      const alert = pedalling ? quality : 0;
      extendRoute(route, t, ctx.rng, cruiseLine, beatAfter, phraseAfter);
      const routeNow = routeX(route, t), routeV = (routeNow - routeX(route, t - dt)) / Math.max(dt, 1e-3);
      const follow = alert >= 0.8 ? 14 : 0.5 + 1.2 * alert;
      x += routeV * dt * (alert >= 0.8 ? 1 : 0) + (routeNow - x) * (1 - Math.exp(-dt * follow));
      const vx = (x - prevX) / Math.max(dt, 1e-3); prevX = x;
      dodge += (clamp(Math.abs(vx) / 30, 0, 1) - dodge) * (1 - Math.exp(-dt * 4));
      shipY = SHIP_Y - dodge * 1.5;
      bank += (clamp(vx * -0.016, -0.5, 0.5) - bank) * (1 - Math.exp(-dt * 6));
      if (music.phrase) encounter++;
      if (sector === 1 && !boss && bossAt === null) bossDue = Math.min(bossDue, tun.bossEvery());
      if (!boss && bossAt === null && p >= bossDue - 8) bossAt = director.bossAt(Math.max(bossDue, p + 8));
      if (!boss && bossAt !== null && p >= bossAt) {
        const hp = tun.bossHull() + (sector - 1) * 100;
        boss = { id: ++id, kind: 'boss', x: 0, y: -500, entry:{fromX:0,fromY:-500,toX:0,toY:14,duration:7}, hp, maxHp: hp, age: 0, fireAt: 2, bossStyle: (sector - 1) % 5 };
        enemies.push(boss);
        for (const mountX of [-15,0,15]) {
          const hp = Math.max(24, tun.bossHull()*0.1);
          enemies.push({id:++id,kind:'turret',parentId:boss.id,mountX,x:mountX,y:-496,hp,maxHp:hp,age:0,fireAt:3,bossStyle:0});
        }
        bossStart = p; announce(`${SECTORS[(sector - 1) % 5].name} · flagship inbound`); emit('bossArrived');
      }
      if (boss && p - bossStart >= tun.bossTime()) {
        const i = enemies.indexOf(boss); if (i >= 0) enemies.splice(i, 1);
        for(let i=enemies.length-1;i>=0;i--) if(enemies[i].parentId===boss.id) enemies.splice(i,1);
        escaped++; sector++; boss = null; bossAt = null; bossDue = p + tun.bossEvery(); emit('bossEscaped'); announce('Flagship escaped · back to cruise');
      }
      if (!wall && !protectedRide && (music.kind === 'build' || music.kind === 'drop') && music.downbeat && t - lastWall > 7) {
        const shooter = enemies.filter(e => inCombat(e) && !e.ground && !e.parentId && e.kind !== 'boss' && e.y > -20 && e.y < 35).sort((a, b) => Math.abs(a.x) - Math.abs(b.x))[0];
        if (shooter) { wall = { id: shooter.id, at: t + 0.6 }; lastWall = t; }
      }
      spawnIn -= dt;
      if (((music.downbeat || music.phrase || !timeline?.downbeats.length && music.beat) && p - lastSpawn > (boss ? 7 : 2.6) || spawnIn <= 0) && !protectedRide) {
        spawn(); lastSpawn = p; spawnIn = boss ? 8 : 4;
      }
      groundIn-=dt;
      if(groundIn<=0 && !protectedRide) {spawnGround();groundIn=12;}
      const candidates = targetable(), gs = groups();
      // Selection sticks to a formation until it is gone. Auto-pick: flagship, else the nearest ordinary formation;
      // elite wings are only ever chosen by the rider (or the harness bot).
      if (selectedGroup === null || !gs.has(selectedGroup)) {
        const maxY = (g: EnemyView[]) => Math.max(...g.map(e => e.y));
        const eliteGroup = opts.smartTarget ? [...gs].find(([, m]) => m[0].elite)?.[0] : undefined;
        selectedGroup = eliteGroup ?? (boss && gs.has(boss.id) ? boss.id : [...gs].filter(([, m]) => !m[0].elite).sort((a, b) => maxY(b[1]) - maxY(a[1]))[0]?.[0] ?? null);
      }
      const selected = selectedGroup !== null ? [...gs.get(selectedGroup) ?? []].sort((a, b) => Number(!!b.parentId) - Number(!!a.parentId) || b.y - a.y) : [];
      selectedId = selected[0]?.id ?? null;
      if (selected[0]?.elite) elitePursuitUntil = t + 6;
      const elites = [...gs].filter(([k, m]) => m[0].elite && k !== selectedGroup);
      eliteHint = elites.length ? (centroid(elites[0][1]) < (selected.length ? centroid(selected) : x) ? -1 : 1) : 0;
      for (let i = locks.length - 1; i >= 0; i--) if (!candidates.some(e => e.id === locks[i])) locks.splice(i, 1);
      const capacity = lockCapacity();
      volleyAge += dt; lockIn -= dt;
      // Locks paint on the sixteenth-note grid: the rising ticks play as a rhythm.
      if (pedalling && quality >= 0.8 && candidates.length && locks.length < capacity && lockIn <= 0 && (music.sixteenth || !timeline?.beats.length)) {
        // Fill the selected formation first, then spill to the nearest ordinary enemies; elites only when selected.
        const spill = candidates.filter(e => !e.elite && groupOf(e) !== selectedGroup).sort((a, b) => Number(!!b.parentId || b.kind==='boss')-Number(!!a.parentId || a.kind==='boss') || b.y-a.y);
        const ordered = [...selected, ...spill];
        const target = ordered.find(e => !locks.includes(e.id)) ?? selected[0] ?? spill[0];
        if (target) { locks.push(target.id); lockIn = lockInterval(); emit('lockAcquired', { target: target.id, count: locks.length }); }
      }
      // Volleys release on a downbeat (a beat if it is late) and their lasers land together on the next beat.
      const barLine = music.downbeat || music.phrase || !timeline?.downbeats.length && music.beat;
      if (locks.length && pedalling && quality >= 0.8 && (volleyAge >= 2.4 && barLine || volleyAge >= 3.2 && music.beat || volleyAge >= 4.2)) {
        const hitAt = impactAt();
        // Cruiser signature: a full lock-on volley hits harder and scores a bonus.
        const full = craft === 'cruiser' && locks.length >= capacity;
        if (full) { fullLockAt = t; score += 25 * locks.length; emit('fullLock', { locks: locks.length }); }
        locks.forEach((targetId, i) => {
          const e = candidates.find(e => e.id === targetId)!;
          lasers.push({ id: ++id, targetId, sx: x, sy: shipY - 3, x: e.x, y: e.y, at: t + i * 0.045, hitAt,
            height:e.ground?-3.5:e.kind==='boss'?13:12, side: (i % 2 ? 1 : -1) * (12 + i * 2), damage: (20 + gunLevel * 4) * (full ? 1.5 : 1), hit: false });
        });
        emit('lockVolley', { locks: locks.length }); volleys++; locks.length = 0; volleyAge = 0; volleyAt = t;
      }
      if (!pedalling || quality < 0.3) locks.length = 0;
      fireIn -= dt;
      if ((fireIn <= 0 || (music.beat || music.hit) && fireIn < 0.15) && quality > 0.05 && pedalling) {
        const targets = enemies.filter(inCombat).sort((a, b) => b.y - a.y);
        const n = Math.min(3, gunLevel) + (craft === 'escort' ? 0 : 1);
        for (let i = 0; i < n; i++) shot(x + (i - (n - 1) / 2) * 2.3, 'pulse', boss && inCombat(boss) && i >= 2 ? boss : targets[i % Math.max(1, targets.length)], 2 + gunLevel * 0.5);

        for (let i = 0; i < pk.wingmen; i++) shot(x + WING_OFFSETS[i], 'wing', targets[i % Math.max(1, targets.length)], 2.5);
        fireIn = (rapidLeft > 0 ? 0.2 : 0.45) / Math.max(0.1, quality);
      }
      const steady = pedalling && quality >= 0.8;
      // Heavy escort (craft level 7): a homing missile from behind the ship at the toughest target, on the beat.
      heavyIn -= dt;
      if (pk.heavy && steady && heavyIn <= 0 && (music.beat || heavyIn < -0.6) && candidates.length) {
        const target = [...candidates].sort((a, b) => Number(!!b.parentId) - Number(!!a.parentId) || b.hp - a.hp)[0];
        lasers.push({ id: ++id, targetId: target.id, sx: x, sy: shipY + 6, x: target.x, y: target.y, at: t, hitAt: impactAt(), height: target.ground ? -3.5 : 12, side: 22, damage: 40, hit: false });
        heavyIn = 3.2;
      }
      if (craft === 'escort' && steady) {
        // Escort signature 1: wingmen shoot down nearby bullets for score.
        eatIn -= dt;
        if (eatIn <= 0) {
          eatIn = 0.5;
          for (let i = 0; i < pk.wingmen; i++) {
            const wx = x + WING_OFFSETS[i];
            let best = -1, bestD = pk.interceptRange;
            bolts.forEach((b, j) => { const d = Math.hypot(b.x - wx, b.y - SHIP_Y); if (b.vy > 0 && b.y < SHIP_Y - 2 && d < bestD) { bestD = d; best = j; } });
            if (best >= 0) { const b = bolts[best]; effect('intercept', b.x, b.y); b.y = 200; score += 10; eaten++; }
          }
        }
        // Escort signature 2: a wide beam sweeps up the ship's lane on each phrase.
        if ((music.phrase || !timeline?.phrases.length && t - lastBeam >= 16) && t - lastBeam > 4) {
          lastBeam = t; effect('beam', x, SHIP_Y, pk.beamWidth); emit('beam');
          for (const e of enemies) if (inCombat(e) && Math.abs(e.x - x) < pk.beamWidth) {
            e.hp -= (45 + gunLevel * 6) * (e.kind === 'boss' ? (enemies.some(m => m.parentId === e.id && m.hp > 0) ? 0.2 : 0.65) : 1);
            effect('intercept', e.x, e.y);
          }
        }
      }
      for (const e of enemies) {
        if (e.hp <= 0) continue;
        e.age += dt;
        const oldX=e.x, oldY=e.y;
        if (e.parentId) { if (!boss || boss.id !== e.parentId) { e.hp=-1;e.y=SHIP_Y;continue; } e.x=boss.x+(e.mountX??0);e.y=boss.y+4; }
        else if(!advanceEntry(e)) {
          if (e.elite) { e.hp = -1; e.fled = true; continue; }
          if(e.kind==='boss') {e.x=Math.sin((e.age-7)*(0.3+e.bossStyle*0.08))*24;e.y=16+Math.sin((e.age-7)*0.4)*3;}
          else {e.y+=dt*(e.ground?9:e.kind==='armor'?7:10);if(e.kind==='weaver')e.x+=Math.cos(e.age*1.4+e.id)*dt*9;else if(e.kind==='tank')e.x+=Math.sin(e.age*0.6)*dt*2;}
        }
        e.heading=Math.atan2(e.x-oldX,e.y-oldY);
        if (wall?.id === e.id) {
          e.warn = 1;
          if (!inCombat(e)) wall = null;
          else if (t >= wall.at && (music.beat || t >= wall.at + 0.5)) {
            const raw = wallPattern(e, x, shipY);
            for (const shot of alert >= 0.8 ? choreograph(route, t, e.x, e.y, raw, SHIP_Y, true) : raw) {
              if (bolts.length >= MAX_BOLTS) break;
              bolts.push({ id: ++id, x: e.x, y: e.y, height: 12, wall: true, ...shot }); bulletsFired++;
            }
            wall = null; e.fireAt = Math.max(e.fireAt, e.age + 1.5); emit('wall');
          }
        } else e.warn = e.fireAt < 1e8 && inCombat(e) ? clamp(1 - (e.fireAt - e.age) / 0.6, 0, 1) : 0;
        // Volleys land on the beat (bounded wait), and calm sections fire less.
        if (wall?.id !== e.id && inCombat(e) && e.age >= e.fireAt && (music.beat || e.age >= e.fireAt + 0.7)) {
          e.fireAt=e.age+FIRE_EVERY[e.kind]*(music.kind==='break'||music.kind==='outro'?1.6:1); e.warn=0;
          const raw=bulletPattern(e,x,shipY);
          // On target, fire is authored around the route: shots graze past, or leave a gate the ship flies through.
          const pattern=alert>=0.8?choreograph(route,t,e.x,e.y,raw,SHIP_Y):raw;
          for(const shot of pattern) {
            if(bolts.length>=MAX_BOLTS) break;
            bolts.push({id:++id,x:e.x,y:e.y,height:e.ground?-2.5:12,...shot});bulletsFired++;
          }
        }
        if (e.y >= SHIP_Y) {
          if(e.ground) {e.hp=-1;e.y=SHIP_Y;continue;}
          if (quality >= 0.8 && pedalling) effect('intercept', e.x, SHIP_Y - 4);
          else hurt(e.kind === 'armor' ? 20 : 12);
          e.hp = -1;
        }
      }
      for (const s of shots) {
        s.x += s.vx * dt; s.y += s.vy * dt;
        const hit = enemies.find(e => inCombat(e) && Math.hypot(e.x - s.x, e.y - s.y) < (e.kind === 'boss' ? 10 : 4));
        if (hit) { hit.hp -= s.damage * (hit.kind === 'boss' ? 0.1 : 1); s.y = -200; }
      }
      for (const laser of lasers) {
        const e = enemies.find(e => e.id === laser.targetId && e.hp > 0);
        if (e && !laser.hit) { laser.x = e.x; laser.y = e.y; }
        if (!laser.hit && t >= laser.hitAt) {
          laser.hit = true;
          if (e) { e.hp -= laser.damage * (e.kind === 'boss' ? (enemies.some(m=>m.parentId===e.id && m.hp>0) ? 0.2 : 0.65) : 1); effect('intercept', e.x, e.y); }
        }
      }
      for (let i = lasers.length - 1; i >= 0; i--) if (t - lasers[i].hitAt > 0.8) lasers.splice(i, 1);
      for (const b of bolts) {
        b.x += b.vx * dt; b.y += b.vy * dt; b.height+=(10-b.height)*(1-Math.exp(-dt*5));
        if (!b.grazed && Math.abs(b.y - shipY) < 3 && Math.abs(b.x - x) < ROUTE.graze && Math.abs(b.x - x) >= 3.5) {
          b.grazed = true; if (alert >= 0.8) { grazed++; dodges++; score += 5; effect('graze', b.x, b.y); emit('autoDodge'); }
        }
        if (Math.hypot(b.x - x, b.y - shipY) < 3.5) {
          if (quality >= (craft === 'escort' ? 0.65 : 0.8) && pedalling) { effect('intercept', b.x, b.y); absorbed++; }
          else hurt(8);
          b.y = 200;
        }
      }
      for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i].hp <= 0) {
        const e = enemies[i], killedIt = e.y < SHIP_Y && !e.fled;
        if (killedIt) kill(e); else if (!e.fled) combo = 0;
        const squad = e.formation !== undefined ? squads.get(e.formation) : undefined;
        if (squad) {
          if (killedIt) squad.killed++;
          if (--squad.left <= 0 && squad.elite) {
            // Elites are a bonus for attentive riders: letting them go never lowers the clear rate.
            squads.delete(e.formation!); eliteSeen++;
            if (squad.killed === squad.total) {
              eliteCleared++; score += 500 * squad.total; if (coverLeft <= 0) charge = Math.min(100, charge + 25);
              effect('perfect', e.x, e.y, 2.5); emit('eliteCleared'); announce('Elite wing down · Nova charged');
            }
          } else if (squad.left <= 0) {
            squads.delete(e.formation!); clearKilled += squad.killed; clearTotal += squad.total;
            const perfect = squad.killed === squad.total && squad.total >= 5 && !e.ground;
            lastClear = { pct: Math.round(squad.killed / squad.total * 100), perfect, at: t };
            if (perfect) {
              perfectStreak++; perfects++; score += Math.round(60 * squad.total * (1 + 0.5 * Math.min(4, perfectStreak - 1)));
              effect('perfect', e.x, e.y, 2, e.ground); emit('formationPerfect', { size: squad.total, streak: perfectStreak });
            } else if (!e.ground && squad.total >= 5 && t > elitePursuitUntil) perfectStreak = 0;
          }
        }
        enemies.splice(i, 1);
      }
      for (let i = shots.length - 1; i >= 0; i--) if (shots[i].y < -30 || Math.abs(shots[i].x) > 70) shots.splice(i, 1);
      for (let i = bolts.length - 1; i >= 0; i--) if (bolts[i].y > 120 || bolts[i].y < -100 || Math.abs(bolts[i].x) > 100) bolts.splice(i, 1);
      for (let i = fx.length - 1; i >= 0; i--) if (t - fx[i].at > 1.6) fx.splice(i, 1);
      if (quality > 0.8 && pedalling) shield = Math.min(100, shield + dt * 3);
      if (t - saveAt > 30) persist();
      if (!opts.endless && timeline && p >= timeline.durationS) { done = true; emit('setDone'); persist(); ctx.resistance.clear('squadron'); }
      ctx.debug('quality', quality); ctx.debug('craft', craft);
    },
    snapshot(): SfSnapshot {
      const theme = (sector - 1) % 5;
      return { t, bar: music.barPulse, selectedGroup, eliteHint, elites: { cleared: eliteCleared, seen: eliteSeen }, phase: menu ? 'hangar' : 'run', done, craft, escortUnlocked: unlockCheck(), ergAvailable, tester: tester(),
        crafts: Object.fromEntries(CRAFTS.map(c => { const info = craftLevel(pendingS(c)), level = levelOf(c);
          return [c, { level, progress: tester() ? 1 : info.progress, next: level < MAX_LEVEL ? rewardFor(c, level + 1) : null, unlocked: c === 'cruiser' || unlockCheck() }]; })) as SfSnapshot['crafts'],
        heavy: pk.heavy, ace: pk.ace, fullLock: Math.max(0, 1 - (t - fullLockAt) / 1.2), eaten,
        menuLeft: Math.max(0, 20 - menuT), sector, sectorName: SECTORS[theme].name, section: music.kind, intensity: music.intensity, beat: music.beatPulse,
        song: music.song, shipX: x, shipY, bank, dodge, hull, shield, quality, effort,
        upcoming: music.upcoming && craft === 'escort' ? { label: sectionLabel(music.upcoming.kind), left: Math.max(0, music.upcoming.at - p), watts: Math.round(sectionTarget(music.upcoming.kind) * ctx.profile.ftp * ctx.profile.settings.difficulty) } : null,
        cadence, charge, coverLeft, rejoinLeft, gunLevel, wingmen: pk.wingmen, missiles: pk.heavy,
        score: Math.round(score), kills, salvage, combo, deaths, selectedId, locks: [...locks], lockCapacity: lockCapacity(), lockProgress: clamp(1 - lockIn / lockInterval(), 0, 1), volleyFlash: Math.max(0, 1 - (t - volleyAt) / 0.8), lasers, enemies, shots, bolts, fx,
        boss: boss ? { stage: enemies.some(e=>e.parentId===boss!.id && e.hp>0) ? 'Destroy the batteries' : 'Reactor exposed', name: ['Iron Dreadnought', 'Hive Carrier', 'Twin Lancer', 'Spiral Core', 'The Maw'][boss.bossStyle], hp: boss.hp, maxHp: boss.maxHp, left: Math.max(0, tun.bossTime() - (p - bossStart)) } : null,
        bossIn: !boss && bossAt !== null ? Math.max(0, bossAt - p) : null,
        clear: { rate: clearTotal ? clearKilled / clearTotal : 0, perfects, streak: perfectStreak, last: lastClear },
        banner: t < bannerUntil ? banner : '', hooks: { powerFtp: craft === 'escort' ? targetFtp : protectedTarget(), cadence: cadence ? (cadence.min + cadence.max) / 2 : 90, boss: !!boss } };
    },
    hud(): GameHud {
      return { gears: craft === 'cruiser', targetZone: { min: coverLeft > 0 || rejoinLeft > 0 ? 1 : 2, max: 2, source: 'power', label: menu ? 'Choose your craft' : effort.status === 'recover' ? 'Easy spin' : 'Hold Zone 2' },
        ...(cadence ? { targetCadence: { min: cadence.min, max: cadence.max, label: 'Optional rapid fire' } } : {}),
        controls: menu ? [{ button: 'dpad', label: 'Craft' }, { button: 'a', label: 'Launch' }] : [
          ...(craft === 'cruiser' ? [{ button: 'shiftersL' as const, label: 'Gears' }, { button: 'shiftersR' as const, label: 'Target ◀ ▶' }] : [{ button: 'shiftersR' as const, label: 'Target ◀ ▶' }]), { button: 'a', label: 'Nova', active: charge >= 100 }] };
    },
    summary: () => ({ score: Math.round(score), kills, bossesDefeated: bosses, bossesEscaped: escaped, sector, sectorsCleared: bosses, deaths, maxCombo, scrap: salvage, powerUps: gunLevel - 1, gunLevel, onTargetS: Math.round(onTargetS), craft, volleys, dodges, grazes: grazed, absorbed, perfects, clearPct: clearTotal ? Math.round(clearKilled / clearTotal * 100) : 0, clearKilled, clearTotal, formations, bulletsFired, groundKills, goldens: gunLevel - 1, craftLevel: levelOf(craft), eaten, elitesCleared: eliteCleared, elitesSeen: eliteSeen }),
    dispose() { persist(); ctx.resistance.clear('squadron'); ctx.resistance.useVirtualGears(true); },
  };
  /** Each arsenal tier paints locks faster: in-ride growth is what lets a rider clear whole formations. */
  /** Impact time for a volley fired now: the next beat when it is a natural flight time away. */
  function impactAt() { const nb = timeline?.beats.length ? beatAfter(t + 0.35) : t + 0.52; return nb - t <= 0.95 && nb > t + 0.3 ? nb : t + 0.52; }
  function lockInterval() { return pk.lockS * Math.pow(tun.tierLock(), gunLevel - 1); }
  function lockCapacity() { return Math.max(2, 3 + gunLevel - (craft === 'escort' ? 2 : 0)); }
  function protectedTarget() { return coverLeft > 0 || rejoinLeft > 0 ? tun.recovery() : 0.65; }
}
