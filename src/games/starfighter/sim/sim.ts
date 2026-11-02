import type { GameContext, GameHud, GameSim, MediaTimeline } from '../../../contracts';
import { after, clamp, createDirector } from './director';
import { createDrive, rank, DRIVES, spanDistance, timeAtDistance, type Drive, type DriveSpan } from './drive';
import { craftName, escortAvailable, migrateSave } from './save';
import { arsenalTier, craftLevel, CRAFTS, MAX_LEVEL, perks, rewardFor, TIER_NAMES, WING_OFFSETS } from './progression';
import { MAX_ENEMIES, MAX_BOLTS, FIRE_EVERY, eliteEntry, groupOf, entryFor, advanceEntry, inCombat, bulletPattern, wallPattern, firesInFormation } from './encounters';
import { SECTORS } from './content';
import { newRoute, extendRoute, routeX, laneX, choreograph, moveActivity, ROUTE } from './flight';
import { createWeave } from './weave';
import { createSegmenter, gradeSegment, type Segment } from './segments';
import { WorldRoute, planTurns, toLocal, toWorld } from './route';
import { mulberry } from './rng';
import type { BeamView, CraftId, EnemyView, SfSnapshot, ShotView, BoltView, FxView, LaserView } from './types';
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
    earnS: ctx.tuning.num('salvageEveryS', 12, 3, 30, 1),
    // Drive: the ride swells with the music (cruise / push / burn). Speeds in ground units/s; the Cruiser's push and
    // burn add a little resistance and ask for a faster spin than the rider's own cruise cadence; the Escort's ERG steps.
    drive: ctx.tuning.num('drive', 1, 0, 1, 1, 'Music drive: 0 = always cruise'),
    speedCruise: ctx.tuning.num('speedCruise', 22, 12, 40, 1), speedPush: ctx.tuning.num('speedPush', 31, 15, 60, 1), speedBurn: ctx.tuning.num('speedBurn', 42, 15, 80, 1),
    // A gentle headwind, as a small extra grade (the rider shifts down to keep the spin).
    windPush: ctx.tuning.num('headwindPushPct', 0.3, 0, 2, 0.1), windBurn: ctx.tuning.num('headwindBurnPct', 0.6, 0, 3, 0.1),
    passScale: ctx.tuning.num('drivePassScale', 0.6, 0, 1, 0.05, 'How much of the extra drive speed air enemies pass with (1 = all)'),
    lockScale: ctx.tuning.num('driveLockScale', 1, 0, 1.5, 0.05, 'Locks paint faster with speed (exponent of relative pass speed)'),
    rpmPush: ctx.tuning.num('rpmPush', 4, 0, 15, 1), rpmBurn: ctx.tuning.num('rpmBurn', 8, 0, 20, 1),
    ergPush: ctx.tuning.num('ergPushFtp', 0.66, 0.56, 0.75, 0.01), ergBurn: ctx.tuning.num('ergBurnFtp', 0.7, 0.56, 0.8, 0.01), ergCruise: ctx.tuning.num('ergCruiseFtp', 0.62, 0.5, 0.7, 0.01),
    // Playtesting: 1 unlocks every craft at max level; pace speeds up in-ride arsenal growth.
    tester: ctx.tuning.num('testerUnlockAll', 0, 0, 1, 1), tierLock: ctx.tuning.num('tierLockScale', 0.95, 0.7, 1, 0.01), weave: ctx.tuning.num('weave', 1, 0, 1.5, 0.05, 'Music-locked sway of the ship around its lane (0 = lane changes only)'), pace: ctx.tuning.num('arsenalPace', 1, 0.25, 20, 0.25),
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
  const segmenter = createSegmenter(timeline, tun.bossEvery, tun.firstBoss);
  let seg: Segment | null = null, segBase = { t: 0, onTargetS: 0, clearKilled: 0, clearTotal: 0, perfects: 0, airResolved: 0, eliteCleared: 0, eliteSeen: 0 };
  let segBoss: 'defeated' | 'escaped' | null = null, bossDone = false, airResolved = 0, scorecard: SfSnapshot['scorecard'] = null; const grades: string[] = [];
  // World route: s = route distance at the ship's route point. Straight in carrier/canyon; gentle arcs in city/ocean.
  const world = new WorldRoute(), routeS = () => 126 + dist;
  /** Ground speed and route distance flown; `switchS` = smoothed forecast route distance of the next biome switch. */
  let speed = 22, dist = 0, switchS = -1;
  /** Drive pace (speed without the breather's catch-up): how fast air enemies close and pass. */
  let pace = 22;
  let curFrame: SfSnapshot['frames']['cur'] = { x: 0, z: 0, h: 0, s: 126, biome: 0, seed: 1 };
  const route = newRoute(), weaveAt = createWeave(timeline); let pOff = 0, shipV = 0, lift = 0, lastRoll = -99;
  let roll: SfSnapshot['roll'] = null;
  // The sway is part of the route (a pure function of time), so choreographed fire is authored around it too.
  route.weave = tt => tun.weave() ? weaveAt.at(tt + pOff, moveActivity(route, tt)) * tun.weave() : 0;
  /** Lane changes start and end on swing peaks when weaving (else on beats). */
  const peakAfterSim = (at: number) => { if (!tun.weave()) return beatAfter(at); const q = weaveAt.peakAfter(at + pOff) - pOff; return q >= at && q - at < 2.5 ? q : beatAfter(at); };
  const beams: BeamView[] = [];
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
  /** Next bar line at or after sim time `at` (beat fallback without downbeats). */
  const barAfter = (at: number) => { const d = timeline?.downbeats; if (!d?.length) return beatAfter(at); const b = d[after(d, at - t + p - 1e-6)]; return b !== undefined && b - p + t - at < 3 ? b - p + t : at; };
  const beatAfter = (at: number) => { const beats = timeline?.beats; if (!beats?.length) return at; const b = beats[after(beats, at - t + p - 1e-6)]; return b !== undefined && b - p + t - at < 0.8 ? b - p + t : at; };
  const locks: number[] = [], lasers: LaserView[] = [];
  let groundIn = 8, formations = 0, bulletsFired = 0, groundKills = 0;
  let fireIn = 0, spawnIn = 2, lastSpawn = -99, encounter = 0, bossAt: number | null = null;
  let bossStart = 0, boss: EnemyView | null = null, targetFtp = 0.65, settleLeft = tun.start(), lastWanted = 0.65;
  let music = director.step(0), rapid = false;
  // Drive commits phrase by phrase; the segment's breather always cruises.
  const calmFrom = (q: number) => seg && q < seg.t1 && seg.t1 - seg.t0 > 60 ? seg.t1 - 14 : Infinity;
  const drive = createDrive(timeline, calmFrom);
  let driveNow: ReturnType<typeof drive.step> = { level: 'cruise', next: null, changed: false, span: { t0: 0, t1: 0, level: 'cruise' } };
  /** Effective level (protection and the breather cruise), whether its demand is met, and the Cruiser's spin ask. */
  let level: Drive = 'cruise', driveMet = true, rpmAsk: number | null = null, cadBase = 88;
  let burn: { t: number; kills: number; elites: number; held: number; total: number } | null = null, burnS = 0, burnHeldS = 0, burns = 0;
  const levelSpeed = (d: Drive) => d === 'burn' ? tun.speedBurn() : d === 'push' ? tun.speedPush() : tun.speedCruise();
  /** How often this rider has held each drive lately (forecasts expect what they actually do). */
  const held = { push: 1, burn: 1 };
  const expectSpeed = (d: Drive) => d === 'cruise' ? levelSpeed(d) : levelSpeed(DRIVES[rank(d) - 1]) + held[d] * (levelSpeed(d) - levelSpeed(DRIVES[rank(d) - 1]));
  const ergFor = (d: Drive) => d === 'burn' ? tun.ergBurn() : d === 'push' ? tun.ergPush() : tun.ergCruise();
  /** Expected distance from now to program time `until`, if the rider meets every announced drive. */
  const aheadSpans = (until: number): DriveSpan[] => until > p ? drive.forecast(p, until) : [];
  let effort: SfSnapshot['effort'] = { status: 'settling', targetWatts: 130, floorWatts: 112, ceilingWatts: 150, erg: false };
  const enemies: EnemyView[] = [], shots: ShotView[] = [], bolts: BoltView[] = [], fx: FxView[] = [];
  const actions: Array<{ type: string; craft?: CraftId; direction?: number }> = [];
  let savedOn = 0, savedKills = 0, savedBosses = 0, saveAt = 0;
  const emit = (type: string, data?: Record<string, number | string | boolean>) => ctx.emit({ type, data });
  const announce = (text: string) => { banner = text; bannerUntil = t + 4; };
  const effect = (kind: FxView['kind'], ex: number, ey: number, size = 1, ground = false) => fx.push({ id: ++id, kind, x: ex, y: ey, at: t, size, ground, ...(ground ? { s: routeS() } : {}) });
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
    ctx.resistance.useVirtualGears(craft === 'cruiser'); persist(); // both hoods' shifters change gear
    announce(`${craftName(craft)} · hold the groove`);
  };
  const pendingS = (c: CraftId) => save.craftS[c] + (c === craft && started ? Math.max(0, onTargetS - savedOn) : 0);
  const tester = () => tun.tester() >= 1;
  const unlockCheck = () => tester() || escortAvailable({ ...save, craftS: { ...save.craftS, cruiser: pendingS('cruiser') } });
  const levelOf = (c: CraftId) => tester() ? MAX_LEVEL : craftLevel(pendingS(c)).level;
  let rideLevel = 0, pk = perks(craft, levelOf(craft));
  let tierWaitFrom = -1, amp = 0.5, ampMean = 0.5;
  let perfectStreak = 0, fullLockAt = -99, heavyIn = 3, eatIn = 0, eaten = 0, lastBeam = -99;
  const kill = (e: EnemyView) => {
    effect('boom', e.x, e.y, e.kind==='boss'?3:e.kind==='armor'||e.ground?1.5:1, e.ground); if(e.ground) groundKills++; kills++; combo++; maxCombo = Math.max(maxCombo, combo);
    score += e.kind === 'boss' ? 5000 : e.elite ? 500 : e.kind === 'armor' ? 180 : 100;
    if (e.parentId && boss?.id === e.parentId) boss.hp -= boss.maxHp * 0.15;
    if (e.kind === 'boss') {
      for (const mount of enemies) if (mount.parentId === e.id) { effect('boom',mount.x,mount.y); mount.hp=-1; mount.y=SHIP_Y; }
      bosses++; emit('bossDefeated', { sector }); sector++; boss = null; bossAt = null; segBoss = 'defeated'; announce('Flagship destroyed'); }
    emit('enemyKilled');
  };
  const nova = () => {
    if (!started || done || charge < 100 || coverLeft > 0 || rejoinLeft > 0) return;
    charge = 0; coverLeft = tun.coverS(); settleLeft = tun.settle();
    // Escort Nova is a shield burst: it eats every bullet for score and staggers enemies; Cruiser Nova clears them.
    if (craft === 'escort') { score += bolts.length * 10; eaten += bolts.length; }
    bolts.length = 0; beams.length = 0;
    for (const e of enemies) if(inCombat(e)) e.hp -= e.kind === 'boss' ? 180 : craft === 'escort' ? e.maxHp * 0.6 : e.hp;
    effect('nova', x, SHIP_Y); emit('nova'); announce('Nova · escort cover, take a breather');
  };
  const hurt = (amount: number) => {
    if (coverLeft > 0 || rejoinLeft > 0 || t < tun.start()) return;
    combo = 0; const blocked = Math.min(shield, amount); shield -= blocked; hull -= amount - blocked;
    if (hull <= 0) {
      deaths++; rejoinLeft = tun.rejoinS(); hull = 100; shield = 100; bolts.length = 0; beams.length = 0;
      for (const e of enemies) if (e.kind !== 'boss') { e.hp = -1; e.y = SHIP_Y; }
      emit('shipLost'); announce('Regrouping · easy spin, squadron returning'); persist();
    }
  };
  const spawn = () => {
    const recovery = music.kind === 'break' || music.kind === 'outro';
    // Swarms grow with the drive: 6–8 cruising, 7–9 pushing, 9–12 burning.
    const want = recovery ? 5 : level === 'burn' ? 9 + Math.floor(music.intensity * 3.99) : level === 'push' ? 7 + Math.floor(music.intensity * 2.99) : 6 + Math.floor(music.intensity * 2.99);
    const n = Math.min(Math.max(0,Math.min(MAX_ENEMIES-enemies.length,60-enemies.filter(e=>!e.ground&&!e.passing).length)), want);
    const kind: EnemyView['kind'] = music.kind === 'build' ? 'armor' : music.kind === 'drop' ? 'weaver' : encounter % 3 === 2 ? 'gunner' : 'drone';
    const center = (ctx.rng() - 0.5) * 20, pattern = formations++ % 3;
    // About once a minute (every eighth formation outside calm sections and flagship fights) an elite wing crosses the far field.
    const elite = !recovery && !boss && ++airFormations % 8 === 0, eliteY = -16 + ctx.rng() * 10;
    const size = elite ? Math.min(n, 5) : n;
    if (size > 0) squads.set(formations, { total: size, killed: 0, left: size, elite });
    if (elite) eliteSide = -eliteSide;
    // Gunner and armour formations put lancers on their flanks: they fire telegraphed beams on a bar line.
    const lancerAt = (i: number) => !elite && (kind === 'gunner' || kind === 'armor') && size >= 4 && (i === 0 || i === size - 1);
    for (let i = 0; i < size; i++) {
      const hp = elite ? 26 : kind === 'armor' ? 54 : kind === 'gunner' ? 36 : 26;
      const entry = elite ? eliteEntry(i, eliteSide, eliteY) : entryFor(i,n,pattern,center);
      if (!elite) entry.duration /= 0.6 + 0.4 * rel();
      enemies.push({ id: ++id, kind: elite ? 'weaver' : kind, elite, x: entry.fromX, y: entry.fromY, entry, formation: formations,
        hp, maxHp: hp, age: 0, fireAt: firesInFormation(kind, i) && !lancerAt(i) ? 4 + i * 0.2 : 1e9, bossStyle: 0,
        ...(lancerAt(i) ? { lancer: true, beamReadyAt: 0 } : {}) });
    }
  };
  const spawnGround = () => {
    const squad = ++formations, n = Math.min(3, MAX_ENEMIES - enemies.length);
    if (n > 0) squads.set(squad, { total: n, killed: 0, left: n });
    for(let i=0;i<n;i++) {
      const kind=i===1?'tank':'turret', toX=(i-1)*18+(ctx.rng()-0.5)*6;
      const hp=kind==='tank'?64:48;
      // No entry glide: ground units ride the terrain from the horizon at exactly the scroll speed.
      const w=toWorld(world.pose(routeS()),toX,SHIP_Y-(-300-i*9));
      enemies.push({id:++id,kind,ground:true,formation:squad,x:toX,y:-300-i*9,wx:w.x,wz:w.z,
        hp,maxHp:hp,age:0,fireAt:(240+i*9)/Math.max(12,speed)+0.8+i*0.3,bossStyle:0});
    }
  };
  const targetable = () => enemies.filter(inCombat).sort((a, b) => a.x - b.x || a.id - b.id);
  /** Formations in combat, keyed by group (boss batteries group with their flagship). */
  const groups = () => { const m = new Map<number, EnemyView[]>(); for (const e of targetable()) { const k = groupOf(e); const g = m.get(k); if (g) g.push(e); else m.set(k, [e]); } return m; };
  const centroid = (g: EnemyView[]) => g.reduce((a, e) => a + e.x, 0) / g.length;
  const paddleArmed = { L: true, R: true }; let releaseAsked = false;
  /** Jump selection to an elite wing if one is in range, else the flagship. */
  const snapTarget = () => {
    const gs = [...groups()], pick = gs.find(([, m]) => m[0].elite) ?? gs.find(([k]) => k === boss?.id);
    if (pick) { selectedGroup = pick[0]; lockIn = Math.min(lockIn, 0.15); emit('retarget', { target: pick[0], snap: true }); }
  };
  const retarget = (direction: number) => {
    const gs = [...groups()].sort((a, b) => centroid(a[1]) - centroid(b[1]) || a[0] - b[0]);
    if (!gs.length) { selectedGroup = null; selectedId = null; return; }
    const index = gs.findIndex(g => g[0] === selectedGroup);
    selectedGroup = gs[(index < 0 ? 0 : index + (direction < 0 ? -1 : 1) + gs.length) % gs.length][0];
    // Redirect the next acquisition; already painted locks remain committed.
    lockIn = Math.min(lockIn, 0.15); emit('retarget', { target: selectedGroup });
  };
  /** Count an enemy toward its formation once: when it dies, or when it gets past the ship. */
  const resolve = (e: EnemyView, killedIt: boolean) => {
    e.resolved = true;
    const squad = e.formation !== undefined ? squads.get(e.formation) : undefined;
    if (squad) {
      if (killedIt) squad.killed++;
      if (--squad.left <= 0 && squad.elite) {
        // Elites are a bonus for attentive riders: letting them go never lowers the clear rate.
        squads.delete(e.formation!); eliteSeen++;
        if (squad.killed === squad.total) {
          eliteCleared++; score += 700 * squad.total; if (coverLeft <= 0) charge = Math.min(100, charge + 25);
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
        if (!e.ground && squad.total >= 5) airResolved++;
      }
    }
  };
  const shot = (sx: number, kind: ShotView['kind'], target: EnemyView | undefined, damage: number) => {
    const ey = shipY - 5, dy = (target?.y ?? -20) - ey, dx = (target?.x ?? sx) - sx, d = Math.hypot(dx, dy) || 1;
    shots.push({ id: ++id, x: sx, y: ey, vx: dx / d * 105, vy: dy / d * 105, damage, kind, tier: gunLevel });
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
      amp += (music.intensity - amp) * (1 - Math.exp(-dt / 1.5)); ampMean += (music.intensity - ampMean) * (1 - Math.exp(-dt / 60));
      // Relative to the track's recent level: quiet passages hit softer, loud ones harder, with the same power on average.
      const ampMul = clamp(1 + 0.9 * (amp - ampMean), 0.7, 1.35);
      coverLeft = Math.max(0, coverLeft - dt); rejoinLeft = Math.max(0, rejoinLeft - dt);
      if (pressed.has('a') || pressed.has('y') || pressed.has('powerUpR')) nova();
      // Retarget: arrow keys / d-pad, or a firm squeeze of an analog paddle (re-arms when it relaxes).
      const input = ctx.input();
      if (pressed.has('left') || paddleArmed.L && input.paddleL > 0.6) retarget(-1);
      if (pressed.has('right') || paddleArmed.R && input.paddleR > 0.6) retarget(1);
      paddleArmed.L = input.paddleL > 0.6 ? false : input.paddleL < 0.3 ? true : paddleArmed.L;
      paddleArmed.R = input.paddleR > 0.6 ? false : input.paddleR < 0.3 ? true : paddleArmed.R;
      // B: release painted locks now (the volley still lands on the next beat). Z / left power: snap to an elite or the flagship.
      if (pressed.has('b')) actions.push({ type: 'release' });
      if (pressed.has('z') || pressed.has('powerUpL')) actions.push({ type: 'snap' });
      for (const a of actions.splice(0)) {
        if (a.type === 'nova') nova();
        if (a.type === 'target') retarget(a.direction ?? 1);
        if (a.type === 'release' && locks.length) releaseAsked = true;
        if (a.type === 'snap') snapTarget();
      }
      const protectedRide = coverLeft > 0 || rejoinLeft > 0;
      const erg = craft === 'escort';
      // Drive level for this moment: protection and the breather always cruise.
      driveNow = drive.step(p);
      const breatherNow = !!seg && seg.t1 - seg.t0 > 60 && p >= seg.t1 - 14;
      level = protectedRide || breatherNow || !started || !tun.drive() ? 'cruise' : driveNow.level;
      const calmSection = music.kind === 'break' || music.kind === 'outro';
      const wanted = protectedRide ? tun.recovery() : erg ? (level === 'cruise' && calmSection ? 0.56 : ergFor(level)) : 0.65;
      if (Math.abs(wanted - lastWanted) > 0.005) { settleLeft = tun.settle(); lastWanted = wanted; }
      targetFtp += (wanted - targetFtp) * (1 - Math.exp(-dt / 2.5));
      const scaled = erg ? Math.min(ctx.profile.settings.ergCapFtpFraction, Math.max(60 / ctx.profile.ftp, targetFtp * ctx.profile.settings.difficulty)) : 0.65;
      // The Cruiser's band lifts a little with the drive; it stays conversational.
      const lift0 = erg ? 0 : rank(level);
      const floor = protectedRide ? 0 : erg ? scaled * 0.85 : tun.floor() + lift0 * 0.02;
      const ceiling = protectedRide ? 0 : erg ? scaled * 1.15 : tun.ceiling() + lift0 * 0.015;
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
      else ctx.resistance.set({ id: 'squadron', mode: 'sim', gradePct: level === 'burn' ? tun.windBurn() : level === 'push' ? tun.windPush() : 0 });
      // The Cruiser's spin ask is relative to the rider's own cruising cadence (learned slowly while cruising).
      if (!erg && level === 'cruise' && pedalling && !protectedRide && t > tun.start()) cadBase = clamp(cadBase + (bike.cadence3s - cadBase) * (1 - Math.exp(-dt / 90)), 75, 98);
      rpmAsk = !erg && level !== 'cruise' ? Math.min(110, Math.round(cadBase) + (level === 'burn' ? tun.rpmBurn() : tun.rpmPush())) : null;
      driveMet = level === 'cruise' || pedalling && !under && (rpmAsk === null || bike.cadence3s >= rpmAsk - 2);
      if (level !== 'cruise') held[level] += (Number(driveMet) - held[level]) * (1 - Math.exp(-dt / 20));
      // Ground speed: earned. Missing a push or burn falls back one level; cruising speed never depends on effort.
      const want = levelSpeed(driveMet ? level : DRIVES[Math.max(0, rank(level) - 1)]);
      let targetSpeed = want;
      // In the breather, ease the speed so the ship reaches the next place exactly as the song changes.
      if (breatherNow && switchS > 0 && seg) targetSpeed = clamp((switchS - routeS()) / Math.max(0.5, seg.t1 - p), tun.speedCruise() * 0.7, tun.speedCruise() * 1.8);
      speed += (targetSpeed - speed) * (1 - Math.exp(-dt / (targetSpeed > speed ? 1.2 : 2)));
      pace += (want - pace) * (1 - Math.exp(-dt / (want > pace ? 1.2 : 2)));
      dist += speed * dt;
      if (driveNow.changed && level === driveNow.level) {
        const wTxt = erg ? `${Math.round(ergFor(driveNow.level) * ctx.profile.ftp * ctx.profile.settings.difficulty)} W` : rpmAsk ? `spin up · ${rpmAsk} RPM` : '';
        if (driveNow.level !== 'cruise') { announce(`${driveNow.level === 'burn' ? 'Burn' : 'Push'}${wTxt ? ` · ${wTxt}` : ''}`); emit('drive', { level: driveNow.level }); }
      }
      // Burn tally: a short shout as it ends (not a scorecard).
      if (level === 'burn') {
        if (!burn) { burn = { t, kills, elites: eliteCleared, held: 0, total: 0 }; burns++; }
        burn.total += dt; burnS += dt; if (driveMet) { burn.held += dt; burnHeldS += dt; }
      } else if (burn) {
        const down = kills - burn.kills, el = eliteCleared - burn.elites, held = Math.round(burn.held / Math.max(1e-6, burn.total) * 100);
        if (burn.total > 6) { announce(`Burn · ${down} down${el ? ` · ${el} elite wing${el > 1 ? 's' : ''}` : ''} · ${held}% speed`); emit('burnDone', { kills: down, elites: el, held }); }
        burn = null;
      }
      if (ok) {
        onTargetS += dt; charge = Math.min(100, charge + dt * 100 / tun.chargeS());
        earned += dt; while (earned >= tun.earnS()) { earned -= tun.earnS(); salvage += 10; score += 25; }
      }
      // Craft level (persistent) can rise mid-ride; its perks apply at once.
      const craftLvl = levelOf(craft);
      if (craftLvl !== rideLevel) {
        if (rideLevel) { announce(`${craftName(craft)} level ${craftLvl} · ${rewardFor(craft, craftLvl)}`); effect('upgrade', x, SHIP_Y); emit('craftLevel', { level: craftLvl }); }
        rideLevel = craftLvl; pk = perks(craft, craftLvl);
      }
      // A new tier unfolds on the next bar line (bounded wait), so the upgrade lands with the music.
      const newLevel = arsenalTier(onTargetS, pk.arsenalCap, tun.pace());
      if (newLevel > gunLevel && tierWaitFrom < 0) tierWaitFrom = t;
      if (newLevel > gunLevel && (music.downbeat || music.phrase || !timeline?.downbeats.length || t - tierWaitFrom > 2.5)) { tierWaitFrom = -1; gunLevel = newLevel; announce(`Arsenal ${gunLevel} · ${TIER_NAMES[gunLevel]}`); effect('upgrade', x, SHIP_Y); emit('gunUpgrade', { level: gunLevel }); }
      // Burning at full speed: rapid fire.
      rapid = level === 'burn' && driveMet;
      // Choreographed flight: follow the scheduled route; a sloppy pilot lags it and loses the authored misses.
      const alert = pedalling ? quality : 0;
      pOff = p - t; extendRoute(route, t, ctx.rng, cruiseLine, peakAfterSim, phraseAfter);
      const routeNow = routeX(route, t), routeV = (routeNow - routeX(route, t - dt)) / Math.max(dt, 1e-3);
      // On target the ship tracks the choreographed route exactly. Below target it gets sloppy: the weave runs late and
      // smaller, a lazy wobble creeps in, and a loose spring overshoots — and fire is no longer authored to miss it.
      const slop = clamp(1 - alert / 0.8, 0, 1), moving = moveActivity(route, t);
      if (slop <= 0) { x += routeV * dt + (routeNow - x) * (1 - Math.exp(-dt * 14)); shipV = routeV; }
      else {
        const late = t - 0.22 * slop, wob = (Math.sin(t * 2.3) * 0.6 + Math.sin(t * 0.9 + 1) * 0.4) * 5 * slop;
        const target = laneX(route, t) + (route.weave ? route.weave(late) : 0) * (1 - 0.35 * slop) + wob, k = 60, c = 2 * Math.sqrt(k) * (1 - 0.6 * slop);
        shipV += (k * (target - x) - c * shipV) * dt; x += shipV * dt;
      }
      const liftOn = tun.weave() ? weaveAt.lift(p, moving) * tun.weave() : 0;
      lift += ((liftOn * (1 - slop) + Math.sin(t * 1.3) * 0.8 * slop) - lift) * (1 - Math.exp(-dt * 12));
      // Now and then, a barrel roll on a drop's phrase start (two beats, landing on the beat; on target only).
      if (music.phrase && music.kind === 'drop' && slop <= 0 && t - lastRoll > 35 && tun.weave() && ((Math.sin(Math.round(p) * 12.9898) * 43758.5453) % 1 + 1) % 1 < 0.6) {
        lastRoll = t; roll = { at: t, dur: 2 * weaveAt.beatLen(p), dir: shipV >= 0 ? -1 : 1 }; emit('barrelRoll');
      }
      const vx = (x - prevX) / Math.max(dt, 1e-3); prevX = x;
      dodge += (clamp(Math.abs(vx) / 30, 0, 1) - dodge) * (1 - Math.exp(-dt * 4));
      shipY = SHIP_Y - dodge * 1.5;
      bank += (clamp(vx * -0.016, -0.5, 0.5) - bank) * (1 - Math.exp(-dt * 6));
      if (music.phrase) encounter++;
      // Segments: one place per song (mixes split at seams). One flagship each; a breather and scorecard at the end.
      const at = segmenter.at(p); seg = at.segment;
      if (at.changed) {
        segBase = { t, onTargetS, clearKilled, clearTotal, perfects, airResolved, eliteCleared, eliteSeen };
        segBoss = null; bossDone = false; bossAt = null; scorecard = null;
        if (seg.index > 0) announce(seg.title ? `Now entering · ${seg.title}` : 'New airspace');
        // Plan this segment's path: turns only over open city/ocean, starting on phrases.
        // Distances ahead come from the drive forecast (turns are scenery: a rider below the drive just meets them late).
        const spans = aheadSpans(seg.t1), sNow = routeS(), sEnd = sNow + spanDistance(spans, expectSpeed), phrases = timeline?.phrases ?? [];
        const distTo = (q: number) => spanDistance(spans.filter(x => x.t0 < q).map(x => ({ ...x, t1: Math.min(x.t1, q) })), expectSpeed);
        const snap = (s: number) => { if (!phrases.length || !spans.length) return s; const pp = timeAtDistance(spans, expectSpeed, s - sNow), ph = phrases[after(phrases, pp - 1e-6)]; return ph === undefined ? s : sNow + distTo(ph); };
        planTurns(world, sNow, sEnd, seg.biome === 1 || seg.biome === 3, mulberry(seg.seed ^ 0x7e11), snap);
        const o = world.pose(sNow); curFrame = { ...o, s: sNow, biome: seg.biome, seed: seg.seed }; switchS = -1;
      }
      // Where the next place starts: forecast from the drive, gliding (never jumping) as the rider's speed differs.
      { const target = routeS() + spanDistance(aheadSpans(seg.t1), expectSpeed);
        switchS = switchS < 0 ? target : switchS + clamp(target - switchS, -6 * dt, 6 * dt); }
      // No new enemies for the last 14 s, so the sky has emptied by the time the scorecard shows (last 6 s).
      const breather = seg.t1 - seg.t0 > 60 && p >= seg.t1 - 14;
      if (breather && !scorecard && p >= seg.t1 - 6 && t - segBase.t > 30) {
        const elapsed = Math.max(1, t - segBase.t - (segBase.t < tun.start() ? tun.start() : 0)), total = clearTotal - segBase.clearTotal, airs = airResolved - segBase.airResolved, es = eliteSeen - segBase.eliteSeen;
        const stats = { onTargetFrac: (onTargetS - segBase.onTargetS) / elapsed, clearRate: total ? (clearKilled - segBase.clearKilled) / total : 0,
          perfectFrac: airs ? (perfects - segBase.perfects) / airs : 0, eliteFrac: es ? (eliteCleared - segBase.eliteCleared) / es : null, boss: segBoss };
        const g = gradeSegment(stats); grades.push(g.grade);
        scorecard = { title: seg.title || 'Airspace cleared', grade: g.grade, score: g.score, clearPct: Math.round(stats.clearRate * 100), onTargetPct: Math.round(Math.min(1, stats.onTargetFrac) * 100),
          perfects: perfects - segBase.perfects, elites: es ? `${eliteCleared - segBase.eliteCleared}/${es}` : '–', boss: segBoss === 'defeated' ? 'Destroyed' : segBoss === 'escaped' ? 'Escaped' : '–', at: t };
        emit('segmentGrade', { grade: g.grade, score: g.score });
      }
      if (!boss && !bossDone && bossAt === null && seg.bossAt !== null && p >= seg.bossAt - 8 && p < seg.t1 - Math.min(60, (seg.t1 - seg.t0) * 0.3)) bossAt = Math.max(seg.bossAt, p + 1);
      if (!boss && bossAt !== null && p >= bossAt) {
        bossDone = true;
        const hp = tun.bossHull() + (sector - 1) * 100;
        boss = { id: ++id, kind: 'boss', x: 0, y: -500, entry:{fromX:0,fromY:-500,toX:0,toY:14,duration:7}, hp, maxHp: hp, age: 0, fireAt: 2, bossStyle: (sector - 1) % 5 };
        enemies.push(boss);
        for (const mountX of [-15,0,15]) {
          const hp = Math.max(24, tun.bossHull()*0.1);
          enemies.push({id:++id,kind:'turret',parentId:boss.id,mountX,x:mountX,y:-496,hp,maxHp:hp,age:0,fireAt:3,bossStyle:0});
        }
        bossStart = p; announce(`${SECTORS[(sector - 1) % 5].name} · flagship inbound`); emit('bossArrived');
      }
      // The flagship leaves in time for the breather if it outlasts its fight window.
      if (boss && (p - bossStart >= tun.bossTime() || seg.t1 - seg.t0 > 60 && p >= seg.t1 - 14)) {
        const i = enemies.indexOf(boss); if (i >= 0) enemies.splice(i, 1);
        for(let i=enemies.length-1;i>=0;i--) if(enemies[i].parentId===boss.id) enemies.splice(i,1);
        escaped++; sector++; boss = null; bossAt = null; segBoss = 'escaped'; emit('bossEscaped'); announce('Flagship escaped · back to cruise');
      }
      if (!wall && !protectedRide && !breather && (music.kind === 'build' || music.kind === 'drop') && music.downbeat && t - lastWall > 7) {
        const shooter = enemies.filter(e => inCombat(e) && !e.ground && !e.parentId && e.kind !== 'boss' && e.y > -20 && e.y < 35).sort((a, b) => Math.abs(a.x) - Math.abs(b.x))[0];
        if (shooter) { wall = { id: shooter.id, at: t + 0.6 }; lastWall = t; }
      }
      spawnIn -= dt;
      // Faster drive, faster arrivals: formations come more often and pass sooner.
      const gap = boss ? 7 : [2.6, 2.2, 1.8][rank(level)];
      if (((music.downbeat || music.phrase || !timeline?.downbeats.length && music.beat) && p - lastSpawn > gap || spawnIn <= 0) && !protectedRide && !breather) {
        spawn(); lastSpawn = p; spawnIn = boss ? 8 : [4, 3.4, 2.8][rank(level)];
      }
      groundIn-=dt;
      if(groundIn<=0 && !protectedRide && !breather) {spawnGround();groundIn=12;}
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
      if (locks.length && pedalling && quality >= 0.8 && (volleyAge >= 2.4 && barLine || volleyAge >= 3.2 && music.beat || volleyAge >= 4.2 || releaseAsked && (music.beat || !timeline?.beats.length))) {
        releaseAsked = false;
        const hitAt = impactAt();
        // Cruiser signature: a full lock-on volley hits harder and scores a bonus.
        const full = craft === 'cruiser' && locks.length >= capacity;
        if (full) { fullLockAt = t; score += 25 * locks.length; effect('volley', x, shipY); emit('fullLock', { locks: locks.length }); }
        locks.forEach((targetId, i) => {
          const e = candidates.find(e => e.id === targetId)!;
          lasers.push({ id: ++id, targetId, sx: x, sy: shipY - 3, x: e.x, y: e.y, at: t + i * 0.045, hitAt,
            height:e.ground?-3.5:e.kind==='boss'?13:12, side: (i % 2 ? 1 : -1) * (12 + i * 2), damage: (20 + gunLevel * 4) * (full ? 1.5 : 1) * ampMul, hit: false, tier: gunLevel, full, amp });
        });
        emit('lockVolley', { locks: locks.length }); volleys++; locks.length = 0; volleyAge = 0; volleyAt = t;
      }
      if (!pedalling || quality < 0.3) locks.length = 0;
      fireIn -= dt;
      if ((fireIn <= 0 || (music.beat || music.hit) && fireIn < 0.15) && quality > 0.05 && pedalling) {
        const targets = enemies.filter(inCombat).sort((a, b) => b.y - a.y);
        const n = Math.min(3, gunLevel) + (craft === 'escort' ? 0 : 1);
        for (let i = 0; i < n; i++) shot(x + (i - (n - 1) / 2) * 2.3, 'pulse', boss && inCombat(boss) && i >= 2 ? boss : targets[i % Math.max(1, targets.length)], (2 + gunLevel * 0.5) * ampMul);

        for (let i = 0; i < pk.wingmen; i++) shot(x + WING_OFFSETS[i], 'wing', targets[i % Math.max(1, targets.length)], 2.5);
        fireIn = (rapid ? 0.2 : 0.45) / Math.max(0.1, quality) / clamp(1 + 0.5 * (amp - ampMean), 0.8, 1.2);
      }
      const steady = pedalling && quality >= 0.8;
      // Heavy escort (craft level 7): a homing missile from behind the ship at the toughest target, on the beat.
      heavyIn -= dt;
      if (pk.heavy && steady && heavyIn <= 0 && (music.beat || heavyIn < -0.6) && candidates.length) {
        const target = [...candidates].sort((a, b) => Number(!!b.parentId) - Number(!!a.parentId) || b.hp - a.hp)[0];
        lasers.push({ id: ++id, targetId: target.id, sx: x, sy: shipY + 6, x: target.x, y: target.y, at: t, hitAt: impactAt(), height: target.ground ? -3.5 : 12, side: 22, damage: 40, hit: false, tier: gunLevel, heavy: true });
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
        if (e.ground && e.wx !== undefined) {
          // World-anchored: follow the ground as it scrolls and swings beneath the ship.
          const l = toLocal(world.pose(routeS()), e.wx, e.wz!); e.x = l.lx; e.y = SHIP_Y - l.ahead;
          if (e.passing) { if (e.y > 140 || Math.abs(e.x) > 110) { e.hp = -1; e.fled = true; } continue; }
        }
        if (e.passing) {
          // Escaped enemies peel away around the ship and leave the screen instead of vanishing beside it.
          e.y += dt * (e.ground ? speed : (24 + Math.min(20, (e.y - SHIP_Y) * 0.8)) * rel());
          if (!e.ground) e.x += (e.x >= x ? 1 : -1) * dt * 16;
          e.heading = Math.atan2(e.x - oldX, e.y - oldY);
          if (e.y > 140 || Math.abs(e.x) > 110) { e.hp = -1; e.fled = true; }
          continue;
        }
        if (e.parentId) { if (!boss || boss.id !== e.parentId) { e.hp=-1;e.y=SHIP_Y;continue; } e.x=boss.x+(e.mountX??0);e.y=boss.y+4; }
        else if(!advanceEntry(e)) {
          if (e.elite) { e.hp = -1; e.fled = true; continue; }
          if(e.kind==='boss') {e.x=Math.sin((e.age-7)*(0.3+e.bossStyle*0.08))*24;e.y=16+Math.sin((e.age-7)*0.4)*3;}
          else if(!e.ground){e.y+=dt*(e.kind==='armor'?7:10)*rel();if(e.kind==='weaver')e.x+=Math.cos(e.age*1.4+e.id)*dt*9;else if(e.kind==='tank')e.x+=Math.sin(e.age*0.6)*dt*2;}
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
        } else if (e.lancer) {
          // Lancer: warn about a bar ahead, fire on the bar line. On target, a beam that would cross the route is held back.
          const owned = beams.find(b => b.ownerId === e.id && t < b.until);
          e.warn = owned ? clamp((t - owned.warnAt) / Math.max(0.1, owned.fireAt - owned.warnAt), 0, 1) : 0;
          if (!owned && inCombat(e) && (!e.entry || e.age >= e.entry.duration) && e.age >= (e.beamReadyAt ?? 0) && e.y > -15 && e.y < 40) {
            let fireAt = barAfter(t + 1);
            if (beams.some(b => Math.abs(b.fireAt - fireAt) < 0.05)) fireAt = beatAfter(fireAt + 0.05); // a second lancer takes the next beat
            const safe = alert < 0.8 || [0, 0.08, 0.16, 0.24].every(d => Math.abs(routeX(route, fireAt + d) - e.x) >= ROUTE.clearance);
            if (safe) { beams.push({ id: ++id, ownerId: e.id, x: e.x, y: e.y, warnAt: t, fireAt, until: fireAt + 0.25 }); e.beamReadyAt = e.age + (fireAt - t) + 3.5; emit('beamWarn'); }
            else e.beamReadyAt = e.age + 0.5;
          }
        } else e.warn = e.fireAt < 1e8 && inCombat(e) ? clamp(1 - (e.fireAt - e.age) / 0.6, 0, 1) : 0;
        // Volleys land on the beat (bounded wait), and calm sections fire less.
        if (wall?.id !== e.id && inCombat(e) && e.age >= e.fireAt && (music.beat || e.age >= e.fireAt + 0.7)) {
          // Calm sections fire less; faster drives bring more enemies, each firing a little less.
          e.fireAt=e.age+FIRE_EVERY[e.kind]*(music.kind==='break'||music.kind==='outro'?1.6:1)*[1,1.15,1.35][rank(level)]; e.warn=0;
          const raw=bulletPattern(e,x,shipY);
          // On target, fire is authored around the route: shots graze past, or leave a gate the ship flies through.
          const pattern=alert>=0.8?choreograph(route,t,e.x,e.y,raw,SHIP_Y):raw;
          for(const shot of pattern) {
            if(bolts.length>=MAX_BOLTS) break;
            bolts.push({id:++id,x:e.x,y:e.y,height:e.ground?-2.5:12,...shot});bulletsFired++;
          }
        }
        if (e.y >= SHIP_Y) {
          // Under target, living fighters ram the ship (and burst). Otherwise they get past and fly on.
          if (!e.ground && !(quality >= 0.8 && pedalling)) { hurt(e.kind === 'armor' ? 20 : 12); effect('boom', e.x, e.y); e.hp = -1; }
          else { e.passing = true; if (!e.ground) combo = 0; resolve(e, false); }
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
          if (e) { e.hp -= laser.damage * (e.kind === 'boss' ? (enemies.some(m=>m.parentId===e.id && m.hp>0) ? 0.2 : 0.65) : 1); effect('intercept', e.x, e.y, laser.heavy ? 2 : 1 + laser.tier * 0.15 + (laser.full ? 0.4 : 0)); }
        }
      }
      for (let i = lasers.length - 1; i >= 0; i--) if (t - lasers[i].hitAt > 0.8) lasers.splice(i, 1);
      for (let i = beams.length - 1; i >= 0; i--) {
        const b = beams[i], owner = enemies.find(e => e.id === b.ownerId && e.hp > 0 && !e.passing);
        // Killing a lancer during its warning cancels the beam.
        if (!b.fired && !owner) { beams.splice(i, 1); continue; }
        if (owner) b.y = owner.y;
        if (!b.fired && t >= b.fireAt) {
          b.fired = true; emit('beam');
          const gap = Math.abs(x - b.x);
          if (gap < 4.7) { if (alert >= 0.8) { absorbed++; effect('intercept', x, shipY); } else hurt(14); }
          else if (gap < ROUTE.graze + 3 && alert >= 0.8) { grazed++; dodges++; score += 15; effect('graze', b.x + Math.sign(x - b.x) * 1.5, shipY); }
        }
        if (t > b.until + 0.3) beams.splice(i, 1);
      }
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
        const e = enemies[i], killedIt = e.y < SHIP_Y && !e.fled && !e.passing;
        if (killedIt) kill(e); else if (!e.fled && !e.passing) combo = 0;
        if (!e.resolved) resolve(e, killedIt);
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
      const bi = timeline?.beats.length ? after(timeline.beats, p) - 1 : Math.floor(p / 0.6), bk = Math.round(p * (timeline?.hz ?? 10));
      // Meter level per band: a quarter from the band envelope, the rest from decaying onset hits (headroom for peaks).
      const ons = timeline?.onsets ?? [];
      const hits = [0, 0, 0]; for (let i = Math.max(0, onsetIndex(p) - 40); i < ons.length && ons[i].t <= p; i++) { const o = ons[i], age = p - o.t; if (age <= 0.45) hits[o.band] = Math.max(hits[o.band], o.s * Math.exp(-age * 7)); }
      const band = (j: 0 | 1 | 2) => clamp((timeline?.bands[j]?.[bk] ?? music.intensity) * 0.25 + hits[j] * 0.62, 0, 1);
      return { t, bar: music.barPulse, beatIndex: bi, bands: [band(0), band(1), band(2)], selectedGroup, eliteHint, elites: { cleared: eliteCleared, seen: eliteSeen }, phase: menu ? 'hangar' : 'run', done, craft, escortUnlocked: unlockCheck(), ergAvailable, tester: tester(),
        crafts: Object.fromEntries(CRAFTS.map(c => { const info = craftLevel(pendingS(c)), level = levelOf(c);
          return [c, { level, progress: tester() ? 1 : info.progress, next: level < MAX_LEVEL ? rewardFor(c, level + 1) : null,
            minutesToNext: tester() || info.nextAtS === null ? null : Math.max(1, Math.ceil((info.nextAtS - pendingS(c)) / 60)),
            unlocked: c === 'cruiser' || unlockCheck(), arsenalCap: perks(c, level).arsenalCap }]; })) as SfSnapshot['crafts'],
        heavy: pk.heavy, ace: pk.ace, amp, lift, pattern: weaveAt.pattern(p), roll, fullLock: Math.max(0, 1 - (t - fullLockAt) / 1.2), eaten,
        menuLeft: Math.max(0, 20 - menuT), sector, sectorName: SECTORS[theme].name, section: music.kind, intensity: music.intensity, beat: music.beatPulse,
        song: music.song, shipX: x, shipY, bank, dodge, hull, shield, quality, effort,
        upcoming: driveNow.next && started && !(coverLeft > 0 || rejoinLeft > 0) ? { label: driveNow.next.level === 'burn' ? 'Burn' : driveNow.next.level === 'push' ? 'Push' : 'Cruise', level: driveNow.next.level, left: Math.max(0, driveNow.next.at - p),
          watts: craft === 'escort' ? Math.round(ergFor(driveNow.next.level) * ctx.profile.ftp * ctx.profile.settings.difficulty) : null,
          rpm: craft === 'cruiser' && driveNow.next.level !== 'cruise' ? Math.min(110, Math.round(cadBase) + (driveNow.next.level === 'burn' ? tun.rpmBurn() : tun.rpmPush())) : null } : null,
        drive: { level, speed, met: driveMet, rpm: rpmAsk, rel: rel() }, charge, coverLeft, rejoinLeft, gunLevel, wingmen: pk.wingmen, missiles: pk.heavy,
        score: Math.round(score), kills, salvage, combo, deaths, selectedId, locks: [...locks], lockCapacity: lockCapacity(), lockProgress: clamp(1 - lockIn / lockInterval(), 0, 1), volleyFlash: Math.max(0, 1 - (t - volleyAt) / 0.8), lasers, enemies, shots, bolts, fx, beams,
        boss: boss ? { stage: enemies.some(e=>e.parentId===boss!.id && e.hp>0) ? 'Destroy the batteries' : 'Reactor exposed', name: ['Iron Dreadnought', 'Hive Carrier', 'Twin Lancer', 'Spiral Core', 'The Maw'][boss.bossStyle], hp: boss.hp, maxHp: boss.maxHp, left: Math.max(0, tun.bossTime() - (p - bossStart)) } : null,
        bossIn: !boss && bossAt !== null ? Math.max(0, bossAt - p) : null,
        clear: { rate: clearTotal ? clearKilled / clearTotal : 0, perfects, streak: perfectStreak, last: lastClear },
        ...(() => { const s = routeS(), pose = world.pose(s), cur = seg ?? segmenter.at(p).segment, next = segmenter.peek(), sw = switchS > 0 ? switchS : s + Math.max(0, cur.t1 - p) * speed, np = world.pose(sw);
          // Samples at fixed route distances (multiples of 30) from behind the camera to past the haze, so the city's
          // "near the route" test never flickers as the ship moves.
          const ahead: number[] = []; for (let q = Math.floor((s - 300) / 30) * 30; q <= s + 1350; q += 30) { const w = world.pose(q); ahead.push(w.x, w.z); }
          return { world: { ...pose, turn: world.curvature(s) * speed, s }, routeAhead: ahead,
            frames: { cur: curFrame, next: { ...np, s: sw, biome: next?.biome ?? cur.biome, seed: next?.seed ?? cur.seed } } }; })(),
        segment: (() => { const cur = seg ?? segmenter.at(p).segment, next = segmenter.peek();
          return { index: cur.index, title: cur.title, biome: cur.biome, seed: cur.seed, nextBiome: next?.biome ?? cur.biome, nextSeed: next?.seed ?? cur.seed, switchIn: Math.max(0, cur.t1 - p), breather: cur.t1 - cur.t0 > 60 && p >= cur.t1 - 14 }; })(),
        scorecard,
        banner: t < bannerUntil ? banner : '', hooks: { powerFtp: craft === 'escort' ? targetFtp : protectedTarget(), cadence: rpmAsk !== null ? rpmAsk + 3 : Math.round(cadBase), boss: !!boss, drive: level } };
    },
    hud(): GameHud {
      return { gears: craft === 'cruiser', targetZone: { min: coverLeft > 0 || rejoinLeft > 0 ? 1 : 2, max: 2, source: 'power', label: menu ? 'Choose your craft' : effort.status === 'recover' ? 'Easy spin' : level === 'burn' ? 'Burn' : level === 'push' ? 'Push' : 'Hold Zone 2' },
        ...(rpmAsk !== null ? { targetCadence: { min: rpmAsk, max: rpmAsk + 15, label: level === 'burn' ? 'Burn · spin up' : 'Push · spin up' } } : {}),
        controls: menu ? [{ button: 'dpad', label: 'Craft' }, { button: 'a', label: 'Launch' }] : [
          ...(craft === 'cruiser' ? [{ button: 'shiftersL' as const, label: 'Gears' }, { button: 'shiftersR' as const, label: 'Gears' }] : []),
          { button: 'left', label: 'Previous target' }, { button: 'right', label: 'Next target' },
          { button: 'paddles', label: 'Target ◀ ▶' }, { button: 'b', label: 'Release', active: locks.length > 0 }, { button: 'z', label: 'Elite' },
          { button: 'a', label: 'Nova', active: charge >= 100 && coverLeft <= 0 && rejoinLeft <= 0,
            cooldown: { fill: Math.min(1, charge / 100), ready: charge >= 100 },
            ...(coverLeft > 0 ? { indicator: { status: `Cover ${Math.ceil(coverLeft)}s` } } : rejoinLeft > 0 ? { indicator: { status: `Rejoin ${Math.ceil(rejoinLeft)}s` } } : {}) }] };
    },
    summary: () => ({ score: Math.round(score), kills, bossesDefeated: bosses, bossesEscaped: escaped, sector, sectorsCleared: bosses, deaths, maxCombo, scrap: salvage, powerUps: gunLevel - 1, gunLevel, onTargetS: Math.round(onTargetS), craft, volleys, dodges, grazes: grazed, absorbed, perfects, clearPct: clearTotal ? Math.round(clearKilled / clearTotal * 100) : 0, clearKilled, clearTotal, formations, bulletsFired, groundKills, goldens: gunLevel - 1, craftLevel: levelOf(craft), eaten, elitesCleared: eliteCleared, elitesSeen: eliteSeen, grades: grades.join(''), burns, burnS: Math.round(burnS), burnHeldPct: burnS ? Math.round(burnHeldS / burnS * 100) : 0, distance: Math.round(dist), bestGrade: ['S', 'A', 'B', 'C', 'D'].find(g => grades.includes(g)) ?? '' }),
    dispose() { persist(); ctx.resistance.clear('squadron'); ctx.resistance.useVirtualGears(true); },
  };
  /** Each arsenal tier paints locks faster: in-ride growth is what lets a rider clear whole formations. */
  /** Impact time for a volley fired now: the next beat when it is a natural flight time away. */
  function impactAt() { const nb = timeline?.beats.length ? beatAfter(t + 0.35) : t + 0.52; return nb - t <= 0.95 && nb > t + 0.3 ? nb : t + 0.52; }
  function lockInterval() { return pk.lockS * Math.pow(tun.tierLock(), gunLevel - 1) / Math.pow(rel(), tun.lockScale()); }
  /** Index of the first onset after program time q (binary search). */
  function onsetIndex(q: number) { const o = timeline?.onsets ?? []; let lo = 0, hi = o.length; while (lo < hi) { const m = (lo + hi) >>> 1; if (o[m].t <= q) lo = m + 1; else hi = m; } return lo; }
  function lockCapacity() { return Math.max(2, 3 + gunLevel - (craft === 'escort' ? 2 : 0)); }
  /** Speed relative to cruising: air enemies close and pass faster as the ship speeds up. */
  function rel() { return 1 + (clamp(pace / tun.speedCruise(), 0.5, 3) - 1) * tun.passScale(); }
  function protectedTarget() { return coverLeft > 0 || rejoinLeft > 0 ? tun.recovery() : 0.65; }
}
