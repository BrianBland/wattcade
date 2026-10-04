import type { GameEvent, GameModule, MediaTimeline, SessionRecord, TrainerCommand } from '../contracts';
import { synthTimeline, type SynthSpec } from '../media/synth/queue';
import { FIXED_DT } from '../contracts';
import { TimelineInput } from './inputs';
import { SCRIPTS } from './scripts';
import { createGameSession } from './session';
import { testProfile } from './testProfile';
import { TuningRegistry } from './tuning';

export interface HeadlessOpts {
  game: GameModule; script: string; minutes: number; seed: number;
  simOpts?: Record<string, unknown>;
  tuning?: Record<string, number | boolean | string>;  // full-key overrides, e.g. { 'dungeon.revsPerShot': 3 }
  media?: MediaSpec;
}
/** Music for a headless run: a ready timeline, or a synth queue (ground truth, no audio). */
export type MediaSpec = { timeline: MediaTimeline } | { synth: SynthSpec };
export function resolveMedia(m: MediaSpec | undefined, game: GameModule): { timeline: MediaTimeline } | undefined {
  if (m) return 'timeline' in m ? m : { timeline: synthTimeline(m.synth) };
  return game.requires?.media?.length ? { timeline: synthTimeline({ style: 'edm', songs: 1 }) } : undefined;
}
export interface HeadlessResult {
  game: string; script: string; seed: number; simMinutes: number; wallMs: number;
  summary: Record<string, number | string>; stats: SessionRecord['stats'];
  mixerCommands: TrainerCommand[]; events: Array<{ t: number } & GameEvent>; isOver: boolean;
}

export function runHeadless(o: HeadlessOpts): HeadlessResult {
  const script = SCRIPTS[o.script];
  if (!script) throw new Error(`unknown script "${o.script}" (have: ${Object.keys(SCRIPTS).join(', ')})`);
  const profile = testProfile();
  const tuning = new TuningRegistry({ profileId: profile.id, storage: null });
  const s = createGameSession({
    game: o.game, profile, input: new TimelineInput(script.input), seed: o.seed,
    simOpts: o.simOpts, fake: { script: o.script }, tuningRegistry: tuning, media: resolveMedia(o.media, o.game),
  });
  if (o.tuning) for (const [k, v] of Object.entries(o.tuning)) tuning.set(k, v);
  const wall0 = performance.now();
  const total = Math.round((o.minutes * 60) / FIXED_DT);
  let done = 0;
  while (done < total && !s.sim.isOver()) { s.step(1); done++; }
  const wallMs = performance.now() - wall0;
  const rec = s.finish();
  return {
    game: o.game.id, script: o.script, seed: o.seed, simMinutes: +(done * FIXED_DT / 60).toFixed(3), wallMs: Math.round(wallMs),
    summary: rec.gameSummary, stats: rec.stats, mixerCommands: s.commands, events: rec.events, isOver: s.sim.isOver(),
  };
}
