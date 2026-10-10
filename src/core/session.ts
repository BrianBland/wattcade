import type { Button, GameContext, GameEvent, GameModule, GameSim, MediaTimeline, Profile, SessionRecord, TrainerCommand } from '../contracts';
import { FIXED_DT } from '../contracts';
import { BikeStateStore } from './bikeState';
import { SimClock } from './clock';
import { DataHub } from './dataHub';
import { FakeBike } from './fake';
import type { InputSource } from './inputs';
import { GameLoop } from './loop';
import { ResistanceMixer } from './mixer';
import { SessionRecorder } from './recorder';
import { makeRng } from './rng';
import { TuningRegistry } from './tuning';

export interface SessionOpts {
  game: GameModule; profile: Profile; input: InputSource; dataHub?: DataHub;
  fake?: { script?: string } | false; seed?: number; simOpts?: Record<string, unknown>;
  onEmit?: (e: { t: number } & GameEvent) => void; onSave?: (data: unknown) => void;
  tuningRegistry?: TuningRegistry;   // optional: share/inspect the registry (e.g. headless overrides)
  /** Music for games with requires.media: the program timeline (ctx.media). */
  media?: { timeline: MediaTimeline; announce?(id: string, t: number): void };
}

/** Program clock for media sessions. It runs with the sim once the game is past any pre-game menu. */
export interface SessionMedia {
  timeline: MediaTimeline;
  positionS(): number;
  started(): boolean;
  /** Lock the loop to the music: the effective time scale becomes `trim` (from media/clock ProgramSync); null releases it. */
  setTrim(trim: number | null): void;
}

export interface GameSession {
  ctx: GameContext; sim: GameSim; mixer: ResistanceMixer; bikeStore: BikeStateStore;
  tuning: TuningRegistry; recorder: SessionRecorder; fakeBike?: FakeBike; dataHub: DataHub; clock: SimClock;
  loop: GameLoop; commands: TrainerCommand[];
  frame(realDtS: number): void; step(n: number): void; pause(): void; resume(): void;
  /** Advance input, devices, bike state and the mixer but not the sim, clock or recording (game intros / countdowns).
   *  Returns every button pressed during the steps taken. */
  idle(realDtS: number): ReadonlySet<Button>;
  finish(): SessionRecord; debugValues(): Record<string, number | string | boolean>;
  media?: SessionMedia;
}

export function createGameSession(o: SessionOpts): GameSession {
  const seed = o.seed ?? 1;
  const profile = o.profile;
  const tuning = o.tuningRegistry ?? new TuningRegistry({ profileId: profile.id });
  const clock = new SimClock();
  const dataHub = o.dataHub ?? new DataHub();
  const bikeStore = dataHub.store;
  bikeStore.bindTuning(tuning.scoped('core'));
  const commands: TrainerCommand[] = [];
  const mixer = new ResistanceMixer({
    profile: () => profile, tuning: tuning.scoped('core'), cadence: () => bikeStore.get().cadence3s,
    send: (cmd) => { commands.push(cmd); if (commands.length > 5000) commands.shift(); return dataHub.sendCommand(cmd); },
  });
  const recorder = new SessionRecorder();
  const dbg: Record<string, number | string | boolean> = {};
  const startedAt = Date.now();

  let fakeBike: FakeBike | undefined;
  const wantFake = o.fake ? true : o.fake === false ? false : !o.dataHub;
  if (wantFake) {
    fakeBike = new FakeBike({ rng: makeRng(seed + 7919), seed, script: (o.fake && o.fake.script) || null });
    dataHub.attachTrainer(fakeBike.trainer);
    dataHub.attachHr(fakeBike.hr, { fake: true });
  }

  let saved: unknown = profile.gameData[o.game.id];
  let mediaPos = 0, mediaStarted = false, mediaTrim: number | null = null;
  const ctx: GameContext = {
    clock, profile,
    bike: () => bikeStore.get(),
    input: () => o.input.state(),
    resistance: mixer,
    tuning: tuning.scoped(o.game.id),
    rng: makeRng(seed),
    emit: (e) => { const t = clock.now(); recorder.event(t, e); o.onEmit?.({ t, ...e }); },
    debug: (k, v) => { dbg[k] = v; },
    save: (d) => { saved = d; o.onSave?.(d); },
    load: <T,>() => saved as T | undefined,
    ...(o.media ? { media: { timeline: o.media.timeline, positionS: () => mediaPos, started: () => mediaStarted, ...(o.media.announce ? { announce: o.media.announce } : {}) } } : {}),
  };
  const sim = o.game.createSim(ctx, { seed, ...(o.simOpts ?? {}) } as { seed?: number });

  const hooksOf = () => (sim.snapshot() as { hooks?: Record<string, unknown> } | undefined)?.hooks;

  const stepOnce = (dt: number) => {
    clock.advance(dt);
    o.input.beginTick(dt);
    fakeBike?.tick(dt, { profile, gear: mixer.gear, hooks: fakeBike.usesHooks ? hooksOf() : undefined });
    bikeStore.setGear(mixer.gear);
    bikeStore.tick(dt, profile);
    mixer.tick(dt, o.input.state());
    bikeStore.setTrainerMode(mixer.command?.mode ?? 'none');
    if (o.media) {
      if (!mediaStarted && !sim.inMenu?.()) mediaStarted = true;
      if (mediaStarted) mediaPos += dt;
    }
    sim.update(dt);
    recorder.tick(dt, bikeStore.get(), mixer.command);
  };

  let idleAcc = 0;
  const idle = (realDt: number): ReadonlySet<Button> => {
    const pressed = new Set<Button>();
    idleAcc = Math.min(idleAcc + realDt, 0.25);
    while (idleAcc >= FIXED_DT) {
      idleAcc -= FIXED_DT;
      o.input.beginTick(FIXED_DT);
      for (const b of o.input.state().pressed) pressed.add(b);
      fakeBike?.tick(FIXED_DT, { profile, gear: mixer.gear, hooks: undefined });
      bikeStore.setGear(mixer.gear);
      bikeStore.tick(FIXED_DT, profile);
      mixer.tick(FIXED_DT, o.input.state());
    }
    return pressed;
  };

  const loop = new GameLoop(clock, stepOnce, () => (mediaTrim !== null ? mediaTrim : dataHub.hasRealDevices() ? 1 : clock.timeScale));

  return {
    ctx, sim, mixer, bikeStore, tuning, recorder, fakeBike, dataHub, clock, loop, commands,
    frame: (dt) => { loop.frame(dt); },
    step: (n) => loop.step(n),
    idle,
    pause: () => { loop.pause(); mixer.panic(true); },
    resume: () => { mixer.panic(false); loop.resume(); },
    finish: () => {
      const summary = sim.summary();
      sim.dispose?.();
      return recorder.finish({ profileId: profile.id, gameId: o.game.id, startedAt, gameSummary: summary });
    },
    ...(o.media ? { media: { timeline: o.media.timeline, positionS: () => mediaPos, started: () => mediaStarted, setTrim: (k: number | null) => { mediaTrim = k; } } } : {}),
    debugValues: () => ({
      ...dbg, ...(o.media ? { 'media.pos': +mediaPos.toFixed(2), 'media.trim': mediaTrim ?? 'free' } : {}), 'core.t': +clock.now().toFixed(2), 'core.mode': bikeStore.get().trainerMode,
      'core.gear': mixer.gear, 'core.difficulty': mixer.getDifficulty(), 'core.over': sim.isOver(),
    }),
  };
}

export { FIXED_DT };
