import type { Button, ControlHint, GameContext, GameHud, GameSim } from '../../../contracts';
import { baseFtp, checkpointsOf, effortAt, makeGraph, planElapsed, resumePoint, routeAt } from './graph';
import { MonologueQueue } from './monologue';
import { ESCAPE_LINES, fishHeft, type FishCatch } from './catalogue';
import { FISHING_DEFAULTS, FishingStop, type FishingEvent, type FishingTuning } from './fishing';
import { bankCatch, buy, canHookBigOne, ensureRod, equipForScene, migrateEconomy, owns, receipt, requiredRod, saleCents, sellCreel, shortForRod, stock, type ShopId, type ShopView } from './economy';
import { effortRate, railSpeed } from './pace';
import { Pull, PULL_DEFAULTS, pullTarget, type PullResult, type PullTuning } from './pull';
import { migrateSave } from './save';
import { STORY } from './story';
import { CHAPTER_NAMES, type ChapterId, type MenuView, type PartsView, type PullPlan, type Scene, type SeasideSave, type SeasideSnapshot } from './types';
import { BELLY_DEFAULTS, drillView, partInReach, PARTS, partsPassed, wakeFloor, Z3, type PartId } from './belly';
import { cadenceBand, cadenceRate, fishRunning, sceneCommand, WORKOUT_DEFAULTS, type WorkoutTuning } from './workout';
import { coolEnd, FAN_DEFAULTS, fanView, stepHeat, type FanTuning } from './fan';

export interface SeasideOpts {
  seed?: number;
  /** Start at this chapter's first scene, skipping the menu (scenarios, dev page). */
  chapter?: ChapterId;
  /** Use this save instead of profile.gameData.seaside (scenarios). */
  save?: Partial<SeasideSave>;
  /** Skip the menu: continue from the checkpoint if there is one, else start fresh. */
  skipMenu?: boolean;
}

const SCENE_EFFECT = 'scene';
interface MenuItem { id: string; label: string; index: number; progress: number }
const CARD_S = 5;

export function createSeasideSim(ctx: GameContext, opts: SeasideOpts = {}): GameSim {
  const tun = {
    exponent: ctx.tuning.num('paceExponent', 1 / 3, 0.1, 1, 0.01, 'Rail speed ∝ (power / planned power)^this'),
    gain: ctx.tuning.num('paceGain', 0.002, 0, 0.02, 0.0005, 'Speed nudge per second behind (+) or ahead (−) of the 2 h plan'),
    max: ctx.tuning.num('paceMax', 0.2, 0, 0.5, 0.01, 'Largest catch-up nudge when behind the plan'),
    maxAhead: ctx.tuning.num('paceMaxAhead', 0.02, 0, 0.5, 0.01, 'Largest brake when ahead of the plan (harder work finishes sooner)'),
    cap: ctx.tuning.num('paceCap', 1.8, 1, 3, 0.05, 'Rail speed cap as a multiple of the planned speed'),
    tau: ctx.tuning.num('speedTauS', 1.5, 0.2, 6, 0.1, 'Virtual speed smoothing (s)'),
    effortFloor: ctx.tuning.num('effortFloor', 0.1, 0, 1, 0.05, 'Effort-gated scenes still creep at this rate with no power'),
    effortCap: ctx.tuning.num('effortCap', 2, 1, 4, 0.1, 'Fastest effort-gated progress (× plan)'),
    planScale: ctx.tuning.num('planScale', 1, 0.25, 2, 0.05, 'Planned power scale for pace (lower = faster story)'),
    sprintFtp: ctx.tuning.num('monologueSprintFtp', 1.05, 0.9, 1.5, 0.05, 'No monologue while the plan is at or above this %FTP'),
    lifeS: ctx.tuning.num('monologueS', 4, 2, 8, 0.5, 'Seconds each monologue line shows'),
    gapS: ctx.tuning.num('monologueGapS', 1, 0, 5, 0.5),
    staleS: ctx.tuning.num('monologueStaleS', 30, 5, 120, 5, 'Drop queued lines older than this'),
    checkpointMinS: ctx.tuning.num('checkpointMinS', 300, 60, 900, 30, 'Scenes at least this long get a mid-scene save'),
    menuAutoS: ctx.tuning.num('menuAutoS', 20, 0, 120, 5, 'Menu picks the first item after this long (0 = never)'),
  };
  const W = WORKOUT_DEFAULTS, P = PULL_DEFAULTS, num = ctx.tuning.num;
  const wtun = {
    gradeScale: num('gradeScale', W.gradeScale, 0, 2, 0.05, 'Scales every route grade (riding, the cavern descent)'),
    levelScale: num('levelScale', W.levelScale, 0, 2, 0.05, 'Scales base resistance (fishing, fan, flight)'),
    drillScale: num('drillScale', W.drillScale, 0.5, 1.3, 0.01, 'Scales the drill ERG plan (Z3, fraction of FTP)'),
    paddlePct: num('paddlePulsePct', W.paddlePct, 0, 5, 0.25, 'Grade % added on each paddle stroke'),
    paddlePeriodS: num('paddlePeriodS', W.paddlePeriodS, 1, 8, 0.25, 'Paddle stroke period (s)'),
    flapPct: num('flapPulsePct', W.flapPct, 0, 40, 1, 'Resistance % added on each wing downstroke'),
    flapRevs: num('flapRevs', W.flapRevs, 1, 6, 0.5, 'Crank revolutions per wing flap'),
    pulseOn: num('pulseOn', W.pulseOn, 0.1, 0.9, 0.05, 'Fraction of each stroke / flap the pulse is on'),
    pullLevelMin: num('pullLevelMin', W.pullLevelMin, 0, 100, 1, 'Resistance % while the lightest fish runs'),
    pullLevelMax: num('pullLevelMax', W.pullLevelMax, 0, 100, 1, 'Resistance % while the heaviest fish runs'),
    setPieceMax: num('setPieceMax', W.setPieceMax, 0, 100, 1, 'Resistance % the Big One / re-entry ramp up to'),
    refFtp: num('levelRefFtp', W.refFtp, 100, 400, 5, 'Resistance levels are tuned for this FTP (W) and scale by FTP / this'),
    ftpMinK: num('levelFtpMinK', W.ftpMinK, 0.2, 1, 0.05, 'Smallest FTP scaling of resistance levels'),
    ftpMaxK: num('levelFtpMaxK', W.ftpMaxK, 1, 2, 0.05, 'Largest FTP scaling of resistance levels'),
    biteTug: num('biteTug', W.biteTug, 0, 1, 0.05, 'On a bite the trainer tugs this far from the base level toward the surge'),
    runPeriodS: num('fishRunPeriodS', W.runPeriodS, 1, 12, 0.5, 'A fish runs, then rests: period (s)'),
    runOn: num('fishRunOn', W.runOn, 0.1, 1, 0.05, 'Fraction of each period the fish runs'),
    runDip: num('fishRunDip', W.runDip, 0, 0.5, 0.05, 'Resistance dip while the fish rests (fraction)'),
    releasePct: num('releasePct', W.releasePct, 0, 50, 1, 'Resistance % after a set-piece sprint lets go'),
    drillRpmLo: num('drillRpmLo', W.drillRpmLo, 40, 90, 1, 'Drill cadence band, low (rpm)'),
    drillRpmHi: num('drillRpmHi', W.drillRpmHi, 50, 110, 1, 'Drill cadence band, high (rpm)'),
    drillBandBonus: num('drillBandBonus', W.drillBandBonus, 0, 1, 0.05, 'Bore-rate bonus inside the drill cadence band'),
    fanRpmLo: num('fanRpmLo', W.fanRpmLo, 40, 110, 1, 'Fan cadence band, low (rpm)'),
    fanRpmHi: num('fanRpmHi', W.fanRpmHi, 50, 130, 1, 'Fan cadence band, high (rpm)'),
    fanOffBand: num('fanOffBand', W.fanOffBand, 0, 1, 0.05, 'Fan progress rate outside its cadence band'),
  };
  const ptun = {
    minFtp: num('sprintMinFtp', P.minFtp, 0.9, 1.5, 0.05, 'Sprint target for the smallest fish (fraction of FTP)'),
    maxFtp: num('sprintMaxFtp', P.maxFtp, 1, 2, 0.05, 'Sprint target for the largest fish / set pieces'),
    minS: num('sprintMinS', P.minS, 3, 20, 1, 'Sprint length for the smallest fish (s)'),
    maxS: num('sprintMaxS', P.maxS, 6, 40, 1, 'Sprint length for the largest fish / set pieces (s)'),
    tireMinS: num('fishTireMinS', P.tireMinS, 10, 300, 5, 'Without a sprint, the smallest fish tires on its own in this long (s)'),
    tireMaxS: num('fishTireMaxS', P.tireMaxS, 10, 400, 5, 'Without a sprint, the largest fish tires on its own in this long (s)'),
    pedalFtp: num('fishPedalFtp', P.pedalFtp, 0, 1, 0.05, 'A fish only tires on its own while power is at least this (fraction of FTP)'),
    giveUpS: num('pullGiveUpS', P.giveUpS, 30, 600, 10, 'A fish still fighting after this long slips the hook'),
  };
  const F = FISHING_DEFAULTS;
  const ftun = {
    autoCastS: num('fishAutoCastS', F.autoCastS, 2, 60, 1, 'The rod casts itself after this long at the spot picker'),
    castS: num('fishCastS', F.castS, 1, 6, 0.1, 'Cast wind-up + flight (s)'),
    castRpmLo: num('fishCastRpmLo', F.castRpmLo, 0, 100, 1, 'Cadence at release for the shortest cast (rpm)'),
    castRpmHi: num('fishCastRpmHi', F.castRpmHi, 40, 140, 1, 'Cadence at release for the longest cast (rpm)'),
    biteMinS: num('fishBiteMinS', F.biteMinS, 0, 30, 0.5, 'Once a bite is due, it comes after at least this long (s)'),
    biteMaxS: num('fishBiteMaxS', F.biteMaxS, 0, 60, 0.5, '… and at most this long (s)'),
    retryMinS: num('fishRetryMinS', F.retryMinS, 0, 60, 1, 'After an escape, the next bite comes after at least this long (s)'),
    retryMaxS: num('fishRetryMaxS', F.retryMaxS, 0, 90, 1, '… and at most this long (s)'),
    maxWaitS: num('fishMaxWaitS', F.maxWaitS, 20, 600, 10, 'A bite comes anyway after this long in the water (s)'),
    biteWindowS: num('fishBiteWindowS', F.biteWindowS, 0.5, 6, 0.25, 'Strike within this long of the bite for full credit (s)'),
    autoSetS: num('fishAutoSetS', F.autoSetS, 1, 10, 0.25, 'The hook sets itself after this long (s)'),
    lateCredit: num('fishLateCredit', F.lateCredit, 0, 1, 0.05, 'Value of a fish hooked late (fraction)'),
    slackS: num('fishSlackS', F.slackS, 5, 240, 5, 'A fish gets away after this long without pedalling (s)'),
    triesPerFish: num('fishTries', F.triesPerFish, 1, 5, 1, 'Bites per planned fish before the stop moves on'),
    twitchRpm: num('fishTwitchRpm', F.twitchRpm, 60, 130, 1, 'Spinning at or above this twitches the lure (rpm)'),
    twitchBonus: num('fishTwitchBonus', F.twitchBonus, 0, 2, 0.05, 'A twitching lure brings the next bite this much sooner'),
    haulS: num('fishHaulS', F.haulS, 0.5, 6, 0.1, 'Haul-up (s)'),
    escapeS: num('fishEscapeS', F.escapeS, 0.5, 6, 0.1, 'Line goes slack after an escape (s)'),
    cardS: num('fishCardS', F.cardS, 1, 10, 0.5, 'Catch card (s; A skips)'),
  };
  const B = BELLY_DEFAULTS;
  const btun = {
    wakeRpm: num('wakeRpm', B.wakeRpm, 0, 90, 5, 'Eyes open: pedalling at or above this cadence wakes you (rpm)'),
    wakeS: num('wakeS', B.wakeS, 5, 120, 5, 'Eyes open: seconds of pedalling to open the eyes'),
    partReach: num('partReach', B.partReach, 0.02, 0.2, 0.01, 'Spare parts: a part is in reach this far either side (scene progress)'),
  };
  const FD = FAN_DEFAULTS;
  const fantun = {
    creepPerS: num('fanCreepPerS', FD.creepPerS, 0, 0.1, 0.002, 'Cooling fan: glow regained per second out of the cadence band'),
    creepMax: num('fanCreepMax', FD.creepMax, 0, 0.6, 0.05, 'Cooling fan: the most glow that can creep back'),
    recoverK: num('fanRecoverK', FD.recoverK, 1, 10, 0.5, 'Cooling fan: back in the band, regained glow blows off this many times faster'),
  };
  // the magma eel surges hard and fast, like it's angry (storyboard): a shorter run / rest cycle than the sea fish
  const magmaRunPeriodS = num('magmaRunPeriodS', 2, 0.5, 8, 0.25, 'Magma eel: run / rest period (s)');
  const magmaRunOn = num('magmaRunOn', 0.5, 0.1, 1, 0.05, 'Magma eel: fraction of each period it runs');
  const fishDoneFloor = num('fishDoneFloor', 0.5, 0, 1, 0.05, 'Once every fish at a stop is landed or lost, the stop wraps up at least this fast (× plan)');
  const read = <T,>(o: { [K in keyof T]: () => number }) =>
    Object.fromEntries(Object.entries(o).map(([k, f]) => [k, (f as () => number)()])) as T;
  const wt = (): WorkoutTuning => {
    const w = read<WorkoutTuning>(wtun);
    if (fishingScene().fishing === 'lava') { w.runPeriodS = magmaRunPeriodS(); w.runOn = magmaRunOn(); }
    return w;
  };
  const pt = (): PullTuning => read<PullTuning>(ptun);
  const ft = (): FishingTuning => read<FishingTuning>(ftun);
  const bonusS = num('shopBonusS', 180, 60, 180, 10, 'Maximum extra fishing time offered for short money (s)');
  const g = makeGraph(STORY);
  const last = g.scenes.length - 1;
  let save = migrateSave(opts.save ?? ctx.load());
  const economy = migrateEconomy(save.economy);
  const shopIndex = STORY.findIndex((s) => s.id === 'shop1'), standIndex = STORY.findIndex((s) => s.id === 'pierStand');
  const mono = new MonologueQueue(() => ({ lifeS: tun.lifeS(), gapS: tun.gapS(), staleS: tun.staleS() }));

  // ---- state ----
  let phase: 'menu' | 'story' | 'done' = 'story';
  let index = 0, progress = 0, sceneT = 0, storyT = 0, speed = 0, effortTarget = 0;
  let cardAge = 0, cardName: string | null = null, startedAt = '', lag = 0, rideT = 0;
  const visited = new Set<string>();
  let menu: { items: MenuItem[]; index: number; t: number } | null = null;
  let pending: unknown[] = [];
  // workout (#186)
  let pull: Pull | null = null, nextPull = 0, released = false, trainerMode = '';
  let heldS = 0; // fish-fight time beyond the planned sprint: the pace nudge never pays it back
  let fish = 0, landed = 0, sprints = 0, hits = 0, bestFtp = 0, drillS = 0;
  // fishing (#187)
  let fishing: FishingStop | null = null, lastPaddle = 0, tapSpot: number | undefined;
  let catchValue = 0, biggest: FishCatch | null = null;
  let shop: { id: ShopId; index: number; message: string } | null = null;
  let bonus: { scene: Scene; t: number; duration: number } | null = null;
  let bigOneRod = '-';
  // the belly (#190)
  let wake = 0, z3S = 0, allAt: number | null = null;
  // the cooling fan (#192): glow regained out of the band
  let fanHeat = 0, fanIn = false;
  /** The fan has done its job: the cadence band no longer applies while you eat. */
  const eating = (sc: Scene) => sc.kind === 'fan' && progress >= coolEnd(sc);
  const got = new Map<PartId, { auto: boolean }>();

  const persist = (patch: Partial<SeasideSave>) => { save = { ...save, ...patch }; ctx.save(save); };

  const persistEconomy = (cp = { sceneId: g.scenes[index].id, progress }) => persist({ economy: structuredClone(economy), checkpoint: cp });
  const fishingScene = () => bonus?.scene ?? g.scenes[index];

  const applyTrainer = () => {
    const sc = fishingScene(), p = Math.min(1, progress);
    const cmd = sceneCommand(sc, {
      p, planT: p * sc.planS, sceneT, crankRevs: ctx.bike().crankRevs, released, ftp: ctx.profile.ftp,
      pull: pull && { size: pull.size, t: pull.t, durS: pull.durS, setPiece: pull.setPiece, ...(fishing?.fish && !pull.setPiece && { heft: fishHeft(fishing.fish) }) },
      bite: fishing?.phase === 'bite' ? sc.pulls[fishing.slot]?.size ?? null : null,
    }, wt());
    if (cmd) ctx.resistance.set({ id: SCENE_EFFECT, ...cmd }); else ctx.resistance.clear(SCENE_EFFECT);
    const mode = cmd?.mode ?? 'none';
    if (mode !== trainerMode) { trainerMode = mode; ctx.emit({ type: 'trainer', data: { scene: sc.id, mode } }); }
  };

  /** Set-piece sprints (fish fights live in `FishingStop`). */
  const startPull = (pl: PullPlan) => {
    const t = pullTarget(pl.size, pt());
    pull = new Pull(pl.size, t.ftp, t.s, true);
  };

  /** Book a finished sprint (stats + `pull` event). */
  const bookPull = (p: Pull, r: PullResult, f?: FishCatch) => {
    sprints++;
    if (p.hit()) hits++;
    if (!p.setPiece) { fish++; if (r === 'landed') landed++; }
    else released = true;
    ctx.emit({ type: 'pull', data: {
      scene: g.scenes[index].id, size: p.size, ftp: +p.ftp.toFixed(2), s: +p.t.toFixed(1), landed: r === 'landed',
      setPiece: p.setPiece, hit: p.hit(), spectacle: +p.spectacle().toFixed(2),
      ...(f && { fish: f.id, kg: f.kg, value: f.value }),
    } });
  };

  const endPull = (r: PullResult) => { bookPull(pull!, r); pull = null; nextPull++; };

  const enter = (i: number, p: number) => {
    if (pull) endPull(pull.setPiece ? 'landed' : 'escaped');
    const sc = g.scenes[i], prev = g.scenes[i - 1];
    bonus = null; shop = null;
    index = i; progress = p; sceneT = 0; released = false;
    nextPull = sc.pulls.findIndex((pl) => pl.atS >= p * sc.planS - 1e-6);
    if (nextPull < 0) nextPull = sc.pulls.length;
    fishing = sc.fishing ? new FishingStop(sc.fishing, sc.pulls, ctx.rng, nextPull) : null;
    if (equipForScene(economy, i, shopIndex, standIndex)) persistEconomy({ sceneId: sc.id, progress: p });
    if (sc.kind === 'shop') {
      speed = 0;
      const id = sc.id as ShopId;
      const sold = sellCreel(economy, id);
      shop = { id, index: 0, message: sold ? 'Fresh catch. Fair weight.' : 'Have a look around.' };
      persistEconomy({ sceneId: sc.id, progress: p });
    }
    if (sc.id === 'eyesOpen') wake = 0;
    if (sc.kind === 'fan') { fanHeat = 0; fanIn = false; }
    if (sc.id === 'spareParts') { // resuming mid-scene: the parts behind you are already in hand
      got.clear(); allAt = null;
      for (const x of PARTS) if (x.at < p) got.set(x.id, { auto: false });
      if (got.size === PARTS.length) allAt = p;
    }
    if (sc.id === 'bigOne') {
      bigOneRod = economy.rod;
      ctx.emit({ type: 'bigOneReady', data: { rod: economy.rod, ready: canHookBigOne(economy) } });
    }
    visited.add(sc.id);
    applyTrainer();
    ctx.emit({ type: 'scene', data: { id: sc.id, index: i, chapter: sc.chapter } });
    if (p === 0 && (i === 0 || prev.chapter !== sc.chapter)) {
      cardName = CHAPTER_NAMES[sc.chapter]; cardAge = 0;
      ctx.emit({ type: 'chapter', data: { chapter: sc.chapter, name: cardName } });
      if (i > 0) checkpoint(sc.id, 0);
    }
  };

  const checkpoint = (sceneId: string, p: number) => {
    persist({ checkpoint: { sceneId, progress: p } });
    ctx.emit({ type: 'save', data: { sceneId, progress: p } });
  };

  const start = (i: number, p: number) => {
    phase = 'story'; menu = null;
    storyT = planElapsed(g, i, p);
    startedAt = g.scenes[i].id;
    enter(i, p);
    // Morning has no chapter-boundary save in enter(); a restart must replace the old Continue point.
    if (i === 0 && save.checkpoint) checkpoint(g.scenes[i].id, p);
  };

  // ---- opening: chapter select / continue menu, or straight in ----
  {
    const resume = resumePoint(g, save);
    const items: MenuItem[] = [];
    if (save.checkpoint) {
      const sc = g.scenes[resume.index];
      items.push({ id: 'continue', label: `Continue: ${CHAPTER_NAMES[sc.chapter]}, ${sc.title}`, ...resume });
    }
    items.push({ id: 'new', label: save.chapterSelect ? 'Morning' : 'Start over', index: 0, progress: 0 });
    if (save.chapterSelect) for (const ch of [1, 2] as const) items.push({ id: `ch${ch}`, label: CHAPTER_NAMES[ch], index: g.chapterStart[ch], progress: 0 });
    if (opts.chapter !== undefined) start(g.chapterStart[opts.chapter], 0);
    else if (items.length === 1) start(0, 0);
    else if (opts.skipMenu) start(items[0].index, items[0].progress);
    else { phase = 'menu'; menu = { items, index: 0, t: 0 }; }
  }

  const pick = (k: number) => { const it = menu?.items[k]; if (it) start(it.index, it.progress); };

  const updateMenu = (dt: number) => {
    const m = menu!;
    m.t += dt;
    for (const a of pending) {
      const o = a as { type?: string; index?: number };
      if (o.type === 'menu' && typeof o.index === 'number') { pick(o.index); pending = []; return; }
    }
    pending = [];
    const pr: ReadonlySet<Button> = ctx.input().pressed;
    if (pr.has('up') || pr.has('left') || pr.has('shiftUpL')) { m.index = (m.index + m.items.length - 1) % m.items.length; m.t = 0; }
    if (pr.has('down') || pr.has('right') || pr.has('shiftDnL')) { m.index = (m.index + 1) % m.items.length; m.t = 0; }
    if (pr.has('a')) { pick(m.index); return; }
    const auto = tun.menuAutoS();
    if (auto > 0 && m.t >= auto) pick(m.index);
  };

  const onFishing = (e: FishingEvent) => {
    const sc = fishingScene(), f = fishing!;
    switch (e.type) {
      case 'cast': ctx.emit({ type: 'cast', data: { scene: sc.id, spot: e.spot, cast: e.cast } }); break;
      case 'bite': {
        const pl = sc.pulls[f.slot];
        if (pl && !bonus) progress = Math.max(progress, pl.atS / sc.planS); // a slow rider's bite comes anyway
        ctx.emit({ type: 'bite', data: { scene: sc.id, early: e.early } });
        break;
      }
      case 'hook': pull = f.pull; break;
      case 'landed':
        bookPull(e.pull, 'landed', e.fish); pull = null;
        catchValue += saleCents(e.fish) / 100;
        bankCatch(economy, e.fish);
        // Resume after this bite's slot, never with both a banked catch and its hook still available.
        const slot = sc.pulls[f.slot - 1];
        persistEconomy({ sceneId: g.scenes[index].id, progress: bonus ? progress : Math.max(progress, (slot.atS + slot.planS) / sc.planS) });
        if (!biggest || e.fish.kg > biggest.kg) biggest = e.fish;
        ctx.emit({ type: 'catch', data: { scene: sc.id, ...e.fish } });
        break;
      case 'escaped': {
        bookPull(e.pull, 'escaped', e.fish); pull = null;
        const lines = ESCAPE_LINES[sc.fishing!];
        mono.push(lines[Math.floor(ctx.rng() * lines.length) % lines.length], storyT);
        ctx.emit({ type: 'escape', data: { scene: sc.id, fish: e.fish.id, retry: e.retry } });
        break;
      }
      case 'slot': {
        const pl = sc.pulls[e.slot];
        if (!bonus) {
          progress = Math.max(progress, (pl.atS + pl.planS) / sc.planS);
          heldS -= pl.planS; // only overtime is excluded from the pace lag
          nextPull = e.slot + 1;
        }
        break;
      }
      case 'done': break;
    }
  };

  /** A fishing stop: the plan runs on effort (faster with a twitching lure) up to the next bite, then holds. */
  const updateFishing = (dt: number, planW: number, frac: number) => {
    const sc = fishingScene(), f = fishing!, b = ctx.bike(), inp = ctx.input(), w = wt();
    const pd = inp.paddleR - inp.paddleL, paddle = Math.abs(pd) >= 0.5 ? Math.sign(pd) : 0;
    let step = paddle !== lastPaddle ? paddle : 0;
    lastPaddle = paddle;
    if (inp.pressed.has('left')) step = -1;
    if (inp.pressed.has('right')) step = 1;
    const pl = sc.pulls[f.slot];
    const evs = f.tick(dt, {
      a: inp.pressed.has('a'), step, tap: tapSpot, frac, rpm: b.cadence3s,
      due: !!pl && (bonus ? bonus.t : progress * sc.planS) >= pl.atS - 1e-6, running: !!f.pull && fishRunning(f.pull.t, w),
    }, ft(), pt());
    tapSpot = undefined;
    for (const e of evs) onFishing(e);
    speed = 0;
    if (!bonus && !f.holds()) {
      const k = f.twitching() ? 1 + ftun.twitchBonus() : 1;
      const floor = f.phase === 'done' ? Math.max(tun.effortFloor(), fishDoneFloor()) : tun.effortFloor();
      progress += (effortRate(b.power3s, planW, floor, tun.effortCap()) * k * dt) / sc.planS;
    }
    const next = sc.pulls[f.slot];
    if (next && !bonus && progress >= next.atS / sc.planS) { progress = next.atS / sc.planS; heldS += dt; }
  };

  /** Spare parts: A grabs the part in reach; one ridden past comes along anyway (generous). */
  const updateParts = () => {
    const reach = btun.partReach(), set = new Set(got.keys());
    const grab = (id: PartId, auto: boolean) => {
      got.set(id, { auto }); set.add(id);
      ctx.emit({ type: 'part', data: { id, auto, n: got.size } });
    };
    const near = partInReach(progress, set, reach);
    if (near && ctx.input().pressed.has('a')) grab(near.id, false);
    for (const x of partsPassed(progress, set, reach)) grab(x.id, true);
    if (allAt === null && got.size === PARTS.length) { allAt = Math.min(1, progress); ctx.emit({ type: 'drillReady', data: { auto: [...got.values()].filter((g) => g.auto).length } }); }
  };

  const partsView = (): PartsView => {
    const set = new Set(got.keys());
    return {
      items: PARTS.map((x) => ({ ...x, got: got.has(x.id), auto: !!got.get(x.id)?.auto })),
      reach: partInReach(Math.min(1, progress), set, btun.partReach())?.id ?? null, allAt,
    };
  };

  const leaveShop = () => {
    if (!shop) return;
    const result = ensureRod(economy, shop.id);
    ctx.emit({ type: 'purchase', data: { shop: shop.id, item: requiredRod(shop.id), result, automatic: true } });
    persistEconomy({ sceneId: g.scenes[index + 1].id, progress: 0 });
    progress = 1;
  };

  const startBonus = () => {
    if (!shop || bonus || !shortForRod(economy, shop.id) || economy.bonusUsed.includes(shop.id)) return;
    const duration = bonusS(), sc = g.scenes[index];
    const location = shop.id === 'shop1' ? 'turnout' : 'pier';
    const pulls = [0.2, 0.6].map((p) => ({ atS: duration * p, planS: 8, size: 0.2 }));
    bonus = { t: 0, duration, scene: { ...sc, id: `${shop.id}Bonus`, kind: 'fish', planS: duration, pulls, fishing: location, trainer: { mode: 'resistance', levelPct: 20 }, effort: [[duration, 0.55]], monologue: [] } };
    fishing = new FishingStop(location, pulls, ctx.rng);
    economy.bonusUsed.push(shop.id); persistEconomy();
    ctx.emit({ type: 'bonusTurnout', data: { shop: shop.id, seconds: duration } });
    shop.message = 'One more turnout. Take your time.';
  };

  const updateShop = (dt: number) => {
    if (!shop) return;
    const inp = ctx.input(), pr = inp.pressed;
    const pd = inp.paddleR - inp.paddleL, paddle = Math.abs(pd) >= 0.5 ? Math.sign(pd) : 0;
    let step = paddle !== lastPaddle ? paddle : 0; lastPaddle = paddle;
    if (pr.has('left') || pr.has('shiftUpL')) step = -1;
    if (pr.has('right') || pr.has('shiftDnL')) step = 1;
    const offers = stock(shop.id), n = offers.length + (shortForRod(economy, shop.id) && !economy.bonusUsed.includes(shop.id) ? 1 : 0);
    let action = pr.has('b') ? 'leave' : pr.has('a') ? 'buy' : '';
    for (const a of pending) {
      const o = a as { type?: string; action?: string; index?: number };
      if (o.type !== 'shop') continue;
      if (Number.isInteger(o.index) && o.index! >= 0 && o.index! < n) shop.index = o.index!;
      if (o.action === 'next') step = 1;
      else if (o.action === 'prev') step = -1;
      else if (o.action) action = o.action;
    }
    pending = [];
    shop.index = (shop.index + step + n) % n;
    if (action === 'leave') { leaveShop(); return; }
    if (action === 'bonus' || (action === 'buy' && shop.index === offers.length)) { startBonus(); return; }
    if (action === 'buy') {
      const id = offers[shop.index].id, result = buy(economy, shop.id, id, id === requiredRod(shop.id));
      shop.message = result === 'short' ? 'A little short for that.' : result === 'owned' ? 'Already in your bag.' : result === 'credit' ? 'Pay me later. Leave the extras here.' : 'Good choice. Keep the receipt.';
      ctx.emit({ type: 'purchase', data: { shop: shop.id, item: id, result } });
      if (result === 'bought' || result === 'credit') persistEconomy();
    }
    progress += dt / g.scenes[index].planS;
    if (progress >= 1) leaveShop();
  };

  const shopView = (): ShopView | null => shop && {
    id: shop.id, index: shop.index, items: stock(shop.id).map((i) => ({ ...i, owned: owns(economy, i.id) })),
    cash: economy.cash, debt: economy.debt, receipt: structuredClone(receipt(economy, shop.id)), message: shop.message,
    short: shortForRod(economy, shop.id), bonusAvailable: shortForRod(economy, shop.id) && !economy.bonusUsed.includes(shop.id),
    bonusRemaining: bonus ? Math.max(0, bonus.duration - bonus.t) : null,
    autoIn: Math.max(0, (1 - progress) * g.scenes[index].planS),
  };

  const finish = () => {
    phase = 'done'; speed = 0;
    persist({ rides: save.rides + 1, chapterSelect: true, checkpoint: null, economy: structuredClone(economy) });
    ctx.emit({ type: 'storyEnd', data: { minutes: +(rideT / 60).toFixed(1) } });
  };

  const updateStory = (dt: number) => {
    const sc = g.scenes[index], b = ctx.bike(), ftp = ctx.profile.ftp;
    storyT += dt; sceneT += dt; rideT += dt;
    if (cardName !== null && (cardAge += dt) > CARD_S) cardName = null;
    const planW = baseFtp(sc) * ftp * tun.planScale();
    lag = storyT - heldS - planElapsed(g, index, progress);
    const before = progress, frac = b.power3s / ftp, w = wt();
    if (pull) bestFtp = Math.max(bestFtp, frac);
    if (sc.kind === 'drill') drillS += dt;
    for (const a of pending) {
      const o = a as { type?: string; index?: number };
      if (o.type === 'spot' && typeof o.index === 'number') tapSpot = o.index;
    }
    if (shop && !bonus) updateShop(dt);
    else if (bonus) {
      pending = [];
      bonus.t += dt; storyT -= dt; // optional fishing adds time without a catch-up pace debt
      updateFishing(dt, baseFtp(bonus.scene) * ftp * tun.planScale(), frac);
      if (bonus.t + 1e-6 >= bonus.duration) {
        if (pull) { bookPull(pull, 'escaped'); pull = null; }
        bonus = null; fishing = null;
        sellCreel(economy, shop!.id);
        shop!.message = shortForRod(economy, shop!.id) ? 'Pay me later. Leave the extras here.' : 'That ought to cover it.';
        shop!.index = 0; persistEconomy();
      }
    }
    else if (fishing) { pending = []; updateFishing(dt, planW, frac); }
    else if ('m' in sc.length) {
      const target = railSpeed(b.power3s, planW, sc.length.m / sc.planS, lag, { exponent: tun.exponent(), gain: tun.gain(), max: tun.max(), maxAhead: tun.maxAhead(), cap: tun.cap() });
      speed += (target - speed) * (1 - Math.exp(-dt / tun.tau()));
      progress += (speed * dt) / sc.length.m;
    } else {
      speed = 0;
      // a drill holds its ERG target: working at it bores on plan (rests and blocks alike), never fails, only slows
      const gateW = sc.kind === 'drill' ? effortAt(sc, Math.min(1, progress) * sc.planS) * w.drillScale * ftp * tun.planScale() : planW;
      progress += 'effortS' in sc.length
        // (the fan's crawl outside its band never drops below the floor every effort-gated scene keeps)
        ? (Math.max(tun.effortFloor(), effortRate(b.power3s, gateW, tun.effortFloor(), tun.effortCap()) * (eating(sc) ? 1 : cadenceRate(sc, b.cadence3s, w))) * dt) / sc.length.effortS
        : dt / sc.length.s;
    }
    if (frac >= Z3[0] && frac <= Z3[1]) z3S += dt;
    if (sc.id === 'eyesOpen' && b.cadence3s >= btun.wakeRpm()) wake = Math.min(1, wake + dt / btun.wakeS());
    if (sc.id === 'spareParts') updateParts();
    if (sc.kind === 'fan') {
      const band = cadenceBand(sc, w)!;
      fanIn = b.cadence3s >= band[0] && b.cadence3s <= band[1];
      fanHeat = stepHeat(fanHeat, fanIn, !eating(sc), dt, read<FanTuning>(fantun));
    }
    pending = [];
    if (pull?.setPiece) { const r = pull.tick(dt, frac, pt()); if (r !== 'pulling') endPull(r); }
    const pl = sc.pulls[nextPull];
    if (!pull && !fishing && !shop && pl && (sc.id !== 'bigOne' || canHookBigOne(economy)) && progress * sc.planS >= pl.atS) startPull(pl);
    const e = effortAt(sc, Math.min(1, progress) * sc.planS);
    effortTarget = pull ? pull.ftp : e >= 1 ? baseFtp(sc) : e;
    for (const line of sc.monologue) if (line.at > before && line.at <= progress) mono.push(line.text, storyT);
    for (const f of checkpointsOf(sc, tun.checkpointMinS())) if (f > before && f <= progress) checkpoint(sc.id, f);
    mono.tick(storyT, dt, b.sprinting || effortTarget >= tun.sprintFtp());
    if (progress >= 1) {
      if (index === last) { progress = 1; finish(); } else enter(index + 1, 0);
    } else applyTrainer();
    ctx.debug('scene', g.scenes[index].id);
    ctx.debug('progress', +progress.toFixed(3));
    ctx.debug('lagS', Math.round(lag));
    ctx.debug('speed', +speed.toFixed(2));
    if (fishing) ctx.debug('fishing', `${fishing.phase} · slot ${fishing.slot}/${fishing.slots.length} · try ${fishing.tries}`);
    ctx.debug('pull', pull ? `${pull.setPiece ? 'set piece' : 'fish'} ${Math.round(pull.t)} s, ${Math.round(pull.stamina * 100)} %` : '-');
  };

  const fishingHud = (f: FishingStop): GameHud => {
    const c = (button: ControlHint['button'], label: string, shortLabel?: string): ControlHint => ({ button, label, ...(shortLabel && { shortLabel }) });
    switch (f.phase) {
      case 'spot': return { controls: [c('paddles', 'Pick a fishing spot', 'Spot'), c('a', 'Cast (spin faster to cast farther)', 'Cast')], touchControls: ['left', 'right', 'a'] };
      case 'bite': return { controls: [c('a', 'Strike!')], touchControls: ['a'] };
      case 'pull': return { targetZone: { min: 5, max: 5, label: 'Pull!', source: 'power' } };
      case 'card': return { controls: [c('a', 'Next')], touchControls: ['a'] };
      default: return {};
    }
  };

  const menuView = (): MenuView | null => menu && {
    items: menu.items.map(({ id, label }) => ({ id, label })), index: menu.index,
    autoIn: tun.menuAutoS() > 0 ? Math.max(0, tun.menuAutoS() - menu.t) : -1,
  };

  return {
    update(dt) {
      if (phase === 'menu') updateMenu(dt);
      else if (phase === 'story') updateStory(dt);
    },
    inMenu: () => phase === 'menu',
    receive(a) { pending.push(a); },
    hud(): GameHud {
      if (phase === 'menu') return { controls: [{ button: 'dpad', label: 'Choose' }, { button: 'a', label: 'Ride' }], touchControls: ['a'] };
      if (shop && !bonus) return { controls: [{ button: 'dpad', label: 'Browse' }, { button: 'a', label: 'Buy / choose' }, { button: 'b', label: 'Back on the road' }], touchControls: ['left', 'right', 'a', 'b'] };
      if (fishing) return fishingHud(fishing);
      const sc = g.scenes[index];
      if (sc.id === 'spareParts') {
        const near = partInReach(Math.min(1, progress), new Set(got.keys()), btun.partReach());
        return near ? { controls: [{ button: 'a', label: `Grab ${near.name}`, shortLabel: 'Grab' }], touchControls: ['a'] } : {};
      }
      const band = cadenceBand(sc, wt());
      if (sc.kind === 'drill' && band) return { targetCadence: { min: band[0], max: band[1], label: 'Keep it turning' } };
      if (sc.kind === 'fan' && band && !eating(sc)) return { targetCadence: { min: band[0], max: band[1], label: 'Steady on the fan' } };
      return {};
    },
    snapshot(): SeasideSnapshot {
      const sc = g.scenes[index], next = g.scenes[Math.min(last, index + 1)];
      const p = Math.min(1, progress), band = cadenceBand(sc, wt());
      return {
        chapter: sc.chapter, sceneId: sc.id, sceneT, routeS: routeAt(g, index, p), speed, effortTarget,
        monologue: mono.view(),
        look: { name: sc.look, dream: sc.dream + (next.dream - sc.dream) * p },
        scene: { index, count: g.scenes.length, kind: sc.kind, title: sc.title, progress: p },
        chapterCard: cardName !== null ? { name: cardName, age: cardAge } : null,
        menu: menuView(), over: phase === 'done',
        hooks: { powerFtp: effortTarget, cadence: band ? (band[0] + band[1]) / 2 : 90 },
        pull: pull && { size: pull.size, ftp: pull.ftp, durS: pull.durS, t: pull.t, stamina: pull.stamina, setPiece: pull.setPiece },
        cadenceBand: band,
        fishing: fishing && fishing.view(ft()),
        economy: structuredClone(economy), shop: shopView(),
        wake: sc.id === 'eyesOpen' ? Math.max(wake, wakeFloor(p)) : null,
        parts: sc.id === 'spareParts' ? partsView() : null,
        drill: sc.kind === 'drill' ? drillView(sc, p * sc.planS) : null,
        fan: sc.kind === 'fan' ? fanView(sc, p, fanHeat, fanIn) : null,
      };
    },
    isOver: () => phase === 'done',
    summary() {
      return {
        Chapter: CHAPTER_NAMES[g.scenes[index].chapter],
        'Scenes visited': visited.size,
        'Ride minutes': +(rideT / 60).toFixed(1),
        'Started at': startedAt,
        Finished: phase === 'done' ? 'Yes' : 'No',
        Lines: mono.shown,
        'Fish landed': `${landed}/${fish}`,
        'Sprints on target': `${hits}/${sprints}`,
        'Best sprint': `${Math.round(bestFtp * 100)}% FTP`,
        'Drill minutes': +(drillS / 60).toFixed(1),
        'Z3 minutes': +(z3S / 60).toFixed(1),
        'Parts grabbed': `${[...got.values()].filter((x) => !x.auto).length}/${PARTS.length}`,
        'Catch value': +catchValue.toFixed(2),
        Rod: economy.rod, 'Big One rod': bigOneRod, Cash: economy.cash / 100, 'Lou account': economy.debt / 100,
        'Biggest fish': biggest ? `${biggest.name}, ${biggest.kg} kg` : '-',
      };
    },
    dispose() { ctx.resistance.clear(SCENE_EFFECT); },
  };
}
