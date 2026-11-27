/**
 * Penrose Pedals deterministic pure-TS simulation (`GameSim`).
 * Runs identically in browser and Node headless scenarios (zero Three.js or DOM imports).
 * Owns roads, wheel physics, machines, auto-latching, FTP/ERG effort coupling,
 * signed trainer resistance, HUD targets/indicators, checkpoints, and achievements.
 */

import type {
  Button, ControlHint, GameContext, GameHud, GameMenuAction, GameSim,
} from '../../../contracts';
import { CHAPTER_LEVEL_IDS, getLevelDef, LEVEL_COUNT, wrapLevelIndex } from './catalog';
import { clamp } from './math';
import {
  FACE_KEYS,
  type BikeInput, type FaceKey, type PenroseAction, type PenroseSave, type PenroseSnapshot,
  type SimTunables,
} from './types';
import { SimWorld } from './world';

export { FACE_KEYS };
export type { FaceKey, PenroseAction, PenroseSave, PenroseSnapshot };

const isFace = (k: string): k is FaceKey => (FACE_KEYS as readonly string[]).includes(k);

/** Achievement thresholds (chapter indexes count from 0: chapter 3 is index 2). See ../achievements.ts. */
export const MASTERY = {
  /** Sure Wheel counts clean clears from this chapter on. */
  cleanFrom: 2,
  /** Unbroken: a run of clean clears counts from this chapter on. */
  streakFrom: 3,
  /** Own Eyes: whole chapters cleared unaided, from this chapter up to (not including) `unaidedTo`. */
  unaidedFrom: 4,
  unaidedTo: 8,
  /** The tide counts as fully in at this fraction. */
  tideFull: 0.99,
} as const;

/** Bitmask of chapters whose every level is in `done` (bit i = CAMPAIGN chapter i). */
export function chaptersMask(chapters: readonly (readonly string[])[], done: ReadonlySet<string>): number {
  let m = 0;
  chapters.forEach((ids, i) => {
    if (ids.length && ids.every((id) => done.has(id))) m |= 1 << i;
  });
  return m;
}

export interface PenroseSimOpts {
  autopilot?: boolean;
  level?: number;
  resume?: { at?: number };
}

export function createPenroseSim(ctx: GameContext, rawOpts?: Record<string, unknown>): GameSim {
  const opts = (rawOpts ?? {}) as PenroseSimOpts;
  const t = ctx.tuning;

  // Bike <-> Game tunables (every balance constant lives in ctx.tuning)
  const gradeBase = t.num('gradeBase', 1.0, 0, 5, 0.5, 'Base trainer grade % on flat ground');
  const gradePerLoad = t.num('gradePerLoad', 4.5, 0, 10, 0.5, 'Extra grade % at full machine/spring load');
  const gradeSlopeMax = t.num('gradeSlopeMax', 3.0, 0, 6, 0.5, 'Max extra grade % climbing walls/ramps');
  const gradeWindHead = t.num('gradeWindHead', 2.5, 0, 5, 0.5, 'Extra grade % riding directly into headwind');
  const gradeWindTail = t.num('gradeWindTail', 1.5, 0, 4, 0.5, 'Grade % relief riding with tailwind');
  const effortAtFtp = t.num('effortAtFtp', 160, 80, 300, 5, 'Tide effort units at 100% FTP (rises >100, full at 140)');
  const seesawHoldFtp = t.num('seesawHoldFtp', 0.68, 0.4, 1.0, 0.02, 'FTP fraction where see-saw starts winding');
  const seesawPeakFtp = t.num('seesawPeakFtp', 1.02, 0.7, 1.4, 0.02, 'FTP fraction needed to hold see-saw fully tipped');
  const beamPushFtp = t.num('beamPushFtp', 0.96, 0.65, 1.35, 0.02, 'FTP fraction needed to raise hard-push wall beams');
  const surgeRpm = t.num('surgeRpm', 86, 72, 105, 1, 'Cadence surge rpm alternative for effort mechanics in ERG mode');
  const wheelSpeedBase = t.num('wheelSpeedBase', 1.85, 1.1, 2.8, 0.05, 'Base wheel rolling speed (m/s) at 80 rpm');
  const wheelSpeedMin = t.num('wheelSpeedMin', 0.78, 0.4, 1.0, 0.02, 'Wheel speed multiplier at soft cadence');
  const wheelSpeedMax = t.num('wheelSpeedMax', 1.30, 1.0, 1.8, 0.05, 'Wheel speed multiplier at brisk cadence');
  const autoLatch = t.bool('autoLatch', true, 'Auto-disengage 2-position/detent machines on arrival');

  const readTunables = (): SimTunables => ({
    gradeBase: gradeBase(),
    gradePerLoad: gradePerLoad(),
    gradeSlopeMax: gradeSlopeMax(),
    gradeWindHead: gradeWindHead(),
    gradeWindTail: gradeWindTail(),
    effortAtFtp: effortAtFtp(),
    seesawHoldFtp: seesawHoldFtp(),
    seesawPeakFtp: seesawPeakFtp(),
    beamPushFtp: beamPushFtp(),
    surgeRpm: surgeRpm(),
    wheelSpeedBase: wheelSpeedBase(),
    wheelSpeedMin: wheelSpeedMin(),
    wheelSpeedMax: wheelSpeedMax(),
    autoLatch: autoLatch(),
  });

  ctx.resistance.useVirtualGears(true);

  const saved = ctx.load<PenroseSave>();
  const done = new Set<string>(Array.isArray(saved?.done) ? saved.done : []);
  const clean = new Set<string>(Array.isArray(saved?.clean) ? saved.clean : []);
  const initialAt = typeof opts.resume?.at === 'number'
    ? opts.resume.at
    : typeof opts.level === 'number'
      ? opts.level
      : typeof saved?.at === 'number' && saved.at >= 0
        ? Math.floor(saved.at)
        : 0;

  let at = wrapLevelIndex(initialAt);
  let loadSeq = 0;
  let hintTier: 0 | 1 | 2 = 0;
  let pickerOpen = false;
  const pending: PenroseAction[] = [];

  const stat = {
    cleared: 0, firstClears: 0, falls: 0, solves: 0, levelsVisited: 0,
    streak: 0, bestStreak: 0, tideFullS: 0, unaidedChapters: 0,
  };
  let visit = { index: -1, chapter: -1, falls: 0, aided: false, done: false };
  const ridden = new Set<string>();
  const unaided = new Map<number, Set<string>>();
  const unaidedDone = new Set<number>();

  const save = () => ctx.save({ done: [...done].sort(), at, clean: [...clean].sort() } satisfies PenroseSave);

  let world!: SimWorld;

  function loadLevel(index: number, isRestart = false): void {
    const nextIdx = wrapLevelIndex(index);
    const def = getLevelDef(nextIdx);
    const built = def.build();
    const keepAuto = !!opts.autopilot;

    if (!isRestart && nextIdx !== visit.index) {
      if (visit.index >= 0 && !visit.done) stat.streak = 0;
      visit = { index: nextIdx, chapter: def.chapterIndex, falls: 0, aided: false, done: false };
    }
    at = nextIdx;
    loadSeq++;
    hintTier = 0;
    pickerOpen = false;
    stat.levelsVisited++;

    world = new SimWorld(def, built, {
      onWon(solvedByAutopilot) {
        if (solvedByAutopilot) {
          stat.solves++;
          visit.aided = true;
          stat.streak = 0;
          return;
        }
        visit.done = true;
        const ch = def.chapterIndex;
        const first = !done.has(def.id);
        const spotless = visit.falls === 0 && !visit.aided;
        stat.cleared++;
        ridden.add(def.id);
        if (first) { done.add(def.id); stat.firstClears++; }
        if (spotless && ch >= MASTERY.cleanFrom) clean.add(def.id);
        if (spotless && ch >= MASTERY.streakFrom) stat.bestStreak = Math.max(stat.bestStreak, ++stat.streak);
        else stat.streak = 0;

        if (!visit.aided && ch >= 0) {
          const set = unaided.get(ch) ?? new Set<string>();
          set.add(def.id);
          unaided.set(ch, set);
          const ids = CHAPTER_LEVEL_IDS[ch] ?? [];
          if (ch >= MASTERY.unaidedFrom && ch < MASTERY.unaidedTo && ids.length && !unaidedDone.has(ch) && ids.every((id) => set.has(id))) {
            unaidedDone.add(ch);
            stat.unaidedChapters++;
            ctx.emit({ type: 'chapter-unaided', data: { chapter: ch } });
          }
        }
        // Check if this win finished a chapter!
        const chIds = CHAPTER_LEVEL_IDS[ch] ?? [];
        if (first && chIds.length && chIds.every((id) => done.has(id))) {
          world.emit({ kind: 'chapterWin', text: `${def.chapter} complete!` });
        }
        ctx.emit({ type: 'level-cleared', data: { index: at, id: def.id, chapter: ch, falls: visit.falls, aided: visit.aided, first } });
        save();
      },
      onFell() {
        stat.falls++;
        visit.falls++;
        ctx.emit({ type: 'fell', data: { index: at } });
      },
    });
    if (keepAuto) world.autopilot = true;
    save();
    ctx.debug('level', `${at + 1}/${LEVEL_COUNT} ${def.name}`);
  }

  // Build the starting level synchronously so frame-0 hud() has real controls for GameIntro!
  loadLevel(at, false);

  function cycleHint(): void {
    hintTier = ((hintTier + 1) % 3) as 0 | 1 | 2;
    if (hintTier > 0) visit.aided = true;
  }

  function applyAction(a: PenroseAction, tun: SimTunables, nudge: -1 | 0 | 1): void {
    switch (a.type) {
      case 'toggle':
        if (isFace(a.key)) world.toggleMachine(a.key, nudge, tun);
        break;
      case 'goto':
        loadLevel(a.index, false);
        break;
      case 'closePicker':
        pickerOpen = false;
        break;
      case 'cmd':
        if (a.kind === 'restart') loadLevel(at, true);
        else if (a.kind === 'next') loadLevel(at + 1, false);
        else if (a.kind === 'prev') loadLevel(at - 1, false);
        else if (a.kind === 'solve') {
          world.autopilot = !world.autopilot;
          if (world.autopilot) visit.aided = true;
        } else if (a.kind === 'hint') {
          cycleHint();
        } else if (a.kind === 'picker') {
          pickerOpen = !pickerOpen;
        }
        break;
    }
  }

  function buildBikeInput(): { bike: BikeInput; nudge: -1 | 0 | 1; peekRad: number } {
    const b = ctx.bike();
    const inp = ctx.input();
    const native = ctx.trainerCapabilities?.()?.nativeShifting === true;
    const neutral = native ? 12 : 6;
    const gearScale = clamp(1 + (b.gear - neutral) * (native ? 0.04 : 0.07), 0.72, 1.38);

    // Paddle / D-pad directional nudge & gentle ±10° visual peek
    const padSum = clamp((inp.paddleR - inp.paddleL) * 0.5, -1, 1);
    const dpadNudge = inp.held.has('right') ? 1 : inp.held.has('left') ? -1 : 0;
    const combined = Math.abs(padSum) > 0.15 ? padSum : dpadNudge;
    const nudge: -1 | 0 | 1 = combined > 0.25 ? 1 : combined < -0.25 ? -1 : 0;
    const peekRad = combined * 0.175; // ±10 degrees visual-only peek

    return {
      bike: {
        cadence: b.cadence3s,
        ftpFraction: b.ftpFraction,
        sprinting: b.sprinting,
        gearScale,
        ergMode: b.trainerMode === 'erg',
        nudge,
      },
      nudge,
      peekRad,
    };
  }

  function hud(): GameHud {
    const target = world.built.hudTarget?.(world.wheel) ?? {};
    const liveMachines = world.built.machines.filter((m) => m.key && (!m.live || m.live()));

    // Deduplicate by key (for multi-storey levels like The Cube)
    const byKey = new Map<FaceKey, typeof liveMachines[number]>();
    for (const m of liveMachines) {
      if (m.key && !byKey.has(m.key)) byKey.set(m.key, m);
    }

    const controls: ControlHint[] = [...byKey.entries()].map(([key, m]) => ({
      button: key as Button,
      label: m.name,
      shortLabel: m.name,
      active: m.on,
      indicator: {
        label: m.name,
        status: m.status,
        fill: m.progress,
        ready: m.ready,
      },
    }));

    controls.push({
      button: 'up',
      label: hintTier === 0 ? 'Hint' : hintTier === 1 ? 'More hint' : 'Hide hint',
      shortLabel: 'Hint',
      active: hintTier > 0,
      indicator: false,
    });

    return {
      controls,
      // Hide standard Wattcade touch buttons — 3D machine caps on canvas are directly tappable!
      touchControls: [],
      gears: true,
      targetCadence: target.cadence,
      targetZone: target.zone,
    };
  }

  return {
    update(dt) {
      const tun = readTunables();
      const { bike, nudge, peekRad } = buildBikeInput();
      const inp = ctx.input();

      // Drain renderer actions (3D cap taps, pause menu actions, chapter picker)
      for (const a of pending.splice(0)) applyAction(a, tun, nudge);

      // Controller inputs
      if (pickerOpen) {
        if (inp.pressed.has('b')) pickerOpen = false;
        ctx.resistance.set({ id: 'penrose', mode: 'sim', gradePct: tun.gradeBase });
        return;
      }

      if (inp.pressed.has('up')) cycleHint();
      for (const k of FACE_KEYS) {
        if (inp.pressed.has(k)) world.toggleMachine(k, nudge, tun);
      }

      // Advance deterministic world
      world.step(dt, bike, peekRad, tun);

      // Spring Tide achievement timer
      const tideFrac = world.autopilot ? null : (world.built.tideLevel?.() ?? null);
      if (tideFrac !== null && tideFrac >= MASTERY.tideFull && ctx.bike().cadence3s > 20) {
        stat.tideFullS += dt;
      }

      // Level transitions (deterministic in both browser and headless Node!)
      if (world.state === 'won' && world.wonT >= 2.2) {
        loadLevel(at + 1, false);
      } else if (world.state === 'restart' && world.restartT >= 0.75) {
        loadLevel(at, true);
      }

      // Trainer resistance (base + signed machine/wind load + road slope!)
      const gradePct = world.computeGradePct(tun);
      ctx.resistance.set({ id: 'penrose', mode: 'sim', gradePct });
      ctx.debug('grade', gradePct);
      ctx.debug('wheel', world.wheel.mode);
    },

    hud,

    snapshot(): PenroseSnapshot {
      const target = world.built.hudTarget?.(world.wheel) ?? {};
      const hintText = hintTier === 0
        ? ''
        : hintTier === 1
          ? (target.hintNudge ?? world.def.hints.nudge)
          : world.def.hints.explain;
      const focusMachine = hintTier > 0 ? (target.focusMachine ?? world.def.hints.focusMachine ?? null) : null;

      return {
        loadSeq,
        levelIndex: at,
        levelCount: LEVEL_COUNT,
        chapterIndex: world.def.chapterIndex,
        chapterName: world.def.chapter,
        levelId: world.def.id,
        levelName: world.def.name,
        theme: world.def.theme,
        state: world.state,
        wonT: world.wonT,
        restartT: world.restartT,
        autopilot: world.autopilot,
        hintTier,
        hintText,
        focusMachine,
        pickerOpen,
        yawRad: (world.yawDeg * Math.PI) / 180,
        rollRad: (world.rollDeg * Math.PI) / 180,
        peekYawRad: world.peekYawRad,
        cubeRotY: world.cubeRotY,
        cubeSink: world.cubeSink,
        wallIndex: world.wallIndex,
        wheel: {
          mode: world.wheel.mode,
          t: world.wheel.t,
          pos: world.wheel.pos,
          normal: world.wheel.normal,
          heading: world.wheel.heading,
          spin: world.wheel.spin,
          spawnPos: world.spawnPos,
          spawnNormal: world.spawnNormal,
          speedRatio: world.speedRatio,
          onWater: world.wheel.road.isReflection,
        },
        goal: world.goalPose(),
        machines: world.machineSnapshots(),
        keys: world.built.keys.map((k) => ({ id: k.id, pos: k.pos, got: k.got, anim: k.anim })),
        gates: world.built.gates.map((g) => ({ id: g.id, angle: g.angle, open: g.open })),
        hiddenGaps: world.built.hiddenGaps?.() ?? [],
        roadTransforms: world.roadTransforms(),
        inCruiseBand: world.inCruiseBand,
        cadence: world.lastCadence,
        load: world.lastLoad,
        events: world.recentEvents(),
        done: [...done],
        clean: [...clean],
        levelDef: world.def,
        builtLevel: world.built,
      };
    },

    isOver: () => false,

    checkpoint() {
      // Safe live-update boundary when on a starting/holding loop in normal play
      if (world.state === 'play' && (world.wheel.mode === 'spawn' || world.wheel.road.closed)) {
        return { at };
      }
      return null;
    },

    menuActions(): readonly GameMenuAction[] {
      return [
        { id: 'picker', label: 'Chapters & levels', action: { type: 'cmd', kind: 'picker' } },
        { id: 'hint', label: hintTier === 0 ? 'Show hint' : hintTier === 1 ? 'Full explanation' : 'Hide hint', action: { type: 'cmd', kind: 'hint' } },
        { id: 'restart', label: 'Restart level', action: { type: 'cmd', kind: 'restart' } },
        { id: 'solve', label: world.autopilot ? 'Stop autopilot' : 'Watch a solve', action: { type: 'cmd', kind: 'solve' } },
        { id: 'next', label: 'Skip to next level', action: { type: 'cmd', kind: 'next' } },
        { id: 'prev', label: 'Back one level', action: { type: 'cmd', kind: 'prev' } },
      ];
    },

    receive(action: unknown) {
      if (action && typeof action === 'object' && typeof (action as { type?: unknown }).type === 'string') {
        pending.push(action as PenroseAction);
      }
    },

    summary() {
      return {
        levelsCleared: stat.cleared,
        firstClears: stat.firstClears,
        falls: stat.falls,
        levelsDone: done.size,
        at: at + 1,
        levelsRidden: ridden.size,
        cleanLevels: clean.size,
        bestStreak: stat.bestStreak,
        unaidedChapters: stat.unaidedChapters,
        chaptersDone: chaptersMask(CHAPTER_LEVEL_IDS, done),
        tideFullS: Math.round(stat.tideFullS),
      };
    },
  };
}
