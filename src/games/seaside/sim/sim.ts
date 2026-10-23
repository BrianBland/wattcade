import type { Button, ControlHint, GameContext, GameHud, GameSim } from '../../../contracts';
import { baseFtp, checkpointsOf, effortAt, makeGraph, planElapsed, resumePoint, routeAt } from './graph';
import { MonologueQueue } from './monologue';
import { ESCAPE_LINES, fishHeft, type FishCatch } from './catalogue';
import { FISHING_DEFAULTS, FishingStop, type FishingEvent, type FishingTuning } from './fishing';
import { effortRate, railSpeed } from './pace';
import { Pull, PULL_DEFAULTS, pullTarget, type PullResult, type PullTuning } from './pull';
import { migrateSave } from './save';
import { STORY } from './story';
import { CHAPTER_NAMES, type ChapterId, type MenuView, type PullPlan, type SeasideSave, type SeasideSnapshot } from './types';
import { cadenceBand, cadenceRate, fishRunning, sceneCommand, WORKOUT_DEFAULTS, type WorkoutTuning } from './workout';

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
  const fishDoneFloor = num('fishDoneFloor', 0.5, 0, 1, 0.05, 'Once every fish at a stop is landed or lost, the stop wraps up at least this fast (× plan)');
  const read = <T,>(o: { [K in keyof T]: () => number }) =>
    Object.fromEntries(Object.entries(o).map(([k, f]) => [k, (f as () => number)()])) as T;
  const wt = (): WorkoutTuning => read<WorkoutTuning>(wtun);
  const pt = (): PullTuning => read<PullTuning>(ptun);
  const ft = (): FishingTuning => read<FishingTuning>(ftun);
  const g = makeGraph(STORY);
  const last = g.scenes.length - 1;
  let save = migrateSave(opts.save ?? ctx.load());
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

  const persist = (patch: Partial<SeasideSave>) => { save = { ...save, ...patch }; ctx.save(save); };

  const applyTrainer = () => {
    const sc = g.scenes[index], p = Math.min(1, progress);
    const cmd = sceneCommand(sc, {
      p, planT: p * sc.planS, sceneT, crankRevs: ctx.bike().crankRevs, released,
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
    index = i; progress = p; sceneT = 0; released = false;
    nextPull = sc.pulls.findIndex((pl) => pl.atS >= p * sc.planS - 1e-6);
    if (nextPull < 0) nextPull = sc.pulls.length;
    fishing = sc.fishing ? new FishingStop(sc.fishing, sc.pulls, ctx.rng, nextPull) : null;
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
    const sc = g.scenes[index], f = fishing!;
    switch (e.type) {
      case 'cast': ctx.emit({ type: 'cast', data: { scene: sc.id, spot: e.spot, cast: e.cast } }); break;
      case 'bite': {
        const pl = sc.pulls[f.slot];
        if (pl) progress = Math.max(progress, pl.atS / sc.planS); // a slow rider's bite comes anyway
        ctx.emit({ type: 'bite', data: { scene: sc.id, early: e.early } });
        break;
      }
      case 'hook': pull = f.pull; break;
      case 'landed':
        bookPull(e.pull, 'landed', e.fish); pull = null;
        catchValue += e.fish.value;
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
        progress = Math.max(progress, (pl.atS + pl.planS) / sc.planS);
        heldS -= pl.planS; // the planned sprint was part of the plan; only the hold beyond it is never paid back
        nextPull = e.slot + 1;
        break;
      }
      case 'done': break;
    }
  };

  /** A fishing stop: the plan runs on effort (faster with a twitching lure) up to the next bite, then holds. */
  const updateFishing = (dt: number, planW: number, frac: number) => {
    const sc = g.scenes[index], f = fishing!, b = ctx.bike(), inp = ctx.input(), w = wt();
    const pd = inp.paddleR - inp.paddleL, paddle = Math.abs(pd) >= 0.5 ? Math.sign(pd) : 0;
    let step = paddle !== lastPaddle ? paddle : 0;
    lastPaddle = paddle;
    if (inp.pressed.has('left')) step = -1;
    if (inp.pressed.has('right')) step = 1;
    const pl = sc.pulls[f.slot];
    const evs = f.tick(dt, {
      a: inp.pressed.has('a'), step, tap: tapSpot, frac, rpm: b.cadence3s,
      due: !!pl && progress * sc.planS >= pl.atS - 1e-6, running: !!f.pull && fishRunning(f.pull.t, w),
    }, ft(), pt());
    tapSpot = undefined;
    for (const e of evs) onFishing(e);
    speed = 0;
    if (!f.holds()) {
      const k = f.twitching() ? 1 + ftun.twitchBonus() : 1;
      const floor = f.phase === 'done' ? Math.max(tun.effortFloor(), fishDoneFloor()) : tun.effortFloor();
      progress += (effortRate(b.power3s, planW, floor, tun.effortCap()) * k * dt) / sc.planS;
    }
    const next = sc.pulls[f.slot];
    if (next && progress >= next.atS / sc.planS) { progress = next.atS / sc.planS; heldS += dt; } // waiting on a bite / the fight

  };

  const finish = () => {
    phase = 'done'; speed = 0;
    persist({ rides: save.rides + 1, chapterSelect: true, checkpoint: null });
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
    pending = [];
    if (fishing) updateFishing(dt, planW, frac);
    else if ('m' in sc.length) {
      const target = railSpeed(b.power3s, planW, sc.length.m / sc.planS, lag, { exponent: tun.exponent(), gain: tun.gain(), max: tun.max(), maxAhead: tun.maxAhead(), cap: tun.cap() });
      speed += (target - speed) * (1 - Math.exp(-dt / tun.tau()));
      progress += (speed * dt) / sc.length.m;
    } else {
      speed = 0;
      progress += 'effortS' in sc.length
        ? (effortRate(b.power3s, planW, tun.effortFloor(), tun.effortCap()) * cadenceRate(sc, b.cadence3s, w) * dt) / sc.length.effortS
        : dt / sc.length.s;
    }
    if (pull?.setPiece) { const r = pull.tick(dt, frac, pt()); if (r !== 'pulling') endPull(r); }
    const pl = sc.pulls[nextPull];
    if (!pull && !fishing && pl && progress * sc.planS >= pl.atS) startPull(pl);
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
      return fishing ? fishingHud(fishing) : {};
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
        'Catch value': catchValue,
        'Biggest fish': biggest ? `${biggest.name}, ${biggest.kg} kg` : '-',
      };
    },
    dispose() { ctx.resistance.clear(SCENE_EFFECT); },
  };
}
