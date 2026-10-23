import type { Button, GameContext, GameHud, GameSim, ResistanceEffect } from '../../../contracts';
import { baseFtp, checkpointsOf, effortAt, makeGraph, planElapsed, resumePoint, routeAt } from './graph';
import { MonologueQueue } from './monologue';
import { effortRate, railSpeed } from './pace';
import { migrateSave } from './save';
import { STORY } from './story';
import { CHAPTER_NAMES, type ChapterId, type MenuView, type Scene, type SeasideSave, type SeasideSnapshot } from './types';

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
    max: ctx.tuning.num('paceMax', 0.2, 0, 0.5, 0.01, 'Largest pace nudge either way'),
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

  const persist = (patch: Partial<SeasideSave>) => { save = { ...save, ...patch }; ctx.save(save); };

  const applyTrainer = (sc: Scene) => {
    const tr = sc.trainer;
    if (tr.mode === 'none') { ctx.resistance.clear(SCENE_EFFECT); return; }
    const e: ResistanceEffect = { id: SCENE_EFFECT, mode: tr.mode };
    if (tr.mode === 'sim') e.gradePct = tr.gradePct;
    else if (tr.mode === 'erg') e.ftpFraction = tr.ftpFraction;
    else e.levelPct = tr.levelPct;
    ctx.resistance.set(e);
  };

  const enter = (i: number, p: number) => {
    const sc = g.scenes[i], prev = g.scenes[i - 1];
    index = i; progress = p; sceneT = 0;
    visited.add(sc.id);
    applyTrainer(sc);
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
    lag = storyT - planElapsed(g, index, progress);
    const before = progress;
    if ('m' in sc.length) {
      const target = railSpeed(b.power3s, planW, sc.length.m / sc.planS, lag, { exponent: tun.exponent(), gain: tun.gain(), max: tun.max(), cap: tun.cap() });
      speed += (target - speed) * (1 - Math.exp(-dt / tun.tau()));
      progress += (speed * dt) / sc.length.m;
    } else {
      speed = 0;
      progress += 'effortS' in sc.length
        ? (effortRate(b.power3s, planW, tun.effortFloor(), tun.effortCap()) * dt) / sc.length.effortS
        : dt / sc.length.s;
    }
    effortTarget = effortAt(sc, Math.min(1, progress) * sc.planS);
    for (const line of sc.monologue) if (line.at > before && line.at <= progress) mono.push(line.text, storyT);
    for (const f of checkpointsOf(sc, tun.checkpointMinS())) if (f > before && f <= progress) checkpoint(sc.id, f);
    mono.tick(storyT, dt, b.sprinting || effortTarget >= tun.sprintFtp());
    if (progress >= 1) {
      if (index === last) { progress = 1; finish(); } else enter(index + 1, 0);
    }
    ctx.debug('scene', g.scenes[index].id);
    ctx.debug('progress', +progress.toFixed(3));
    ctx.debug('lagS', Math.round(lag));
    ctx.debug('speed', +speed.toFixed(2));
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
      return {};
    },
    snapshot(): SeasideSnapshot {
      const sc = g.scenes[index], next = g.scenes[Math.min(last, index + 1)];
      const p = Math.min(1, progress);
      return {
        chapter: sc.chapter, sceneId: sc.id, sceneT, routeS: routeAt(g, index, p), speed, effortTarget,
        monologue: mono.view(),
        look: { name: sc.look, dream: sc.dream + (next.dream - sc.dream) * p },
        scene: { index, count: g.scenes.length, kind: sc.kind, title: sc.title, progress: p },
        chapterCard: cardName !== null ? { name: cardName, age: cardAge } : null,
        menu: menuView(), over: phase === 'done',
        hooks: { powerFtp: effortTarget },
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
      };
    },
    dispose() { ctx.resistance.clear(SCENE_EFFECT); },
  };
}
