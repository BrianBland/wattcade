import type { GameEvent, SessionRecord, TrainerCommand } from '../../contracts';
import { STORY } from './sim/story';

type Run = { mixerCommands: TrainerCommand[]; isOver: boolean; events: Array<{ t: number } & GameEvent> };
interface Scenario {
  name: string; script: string; minutes: number; seed: number; simOpts?: Record<string, unknown>;
  assert(summary: Record<string, number | string>, stats: SessionRecord['stats'], run: Run): string[];
}

const TARGET_MIN = 120;
const ofType = (run: Run, type: string) => run.events.filter((e) => e.type === type);
const PLAN_MIN = STORY.reduce((a, x) => a + x.planS, 0) / 60;
/** A sprint on the trainer: a run of resistance commands at or above this level (fish runs dip to ≥ 54 %). */
const SPRINT_LEVEL = 50;

/** Maximal runs of consecutive mixer commands matching `f`. */
const runs = (cmds: TrainerCommand[], f: (c: TrainerCommand) => boolean) =>
  cmds.reduce((n, c, i) => n + (f(c) && !(i > 0 && f(cmds[i - 1])) ? 1 : 0), 0);

/** The workout plan as the trainer saw it: one mode change per scene at most, 2 ERG blocks, 9 sprints. */
function workoutPlan(run: Run): string[] {
  const f: string[] = [];
  const perScene = new Map<string, number>();
  for (const e of ofType(run, 'trainer')) perScene.set(String(e.data?.scene), (perScene.get(String(e.data?.scene)) ?? 0) + 1);
  for (const [id, n] of perScene) if (n > 1) f.push(`${id}: ${n} trainer-mode changes`);
  const modeChanges = run.mixerCommands.filter((c, i) => i > 0 && c.mode !== run.mixerCommands[i - 1].mode).length;
  if (modeChanges > STORY.length) f.push(`${modeChanges} mode changes on the trainer for ${STORY.length} scenes`);
  const erg = runs(run.mixerCommands, (c) => c.mode === 'erg');
  if (erg !== 2) f.push(`${erg} ERG blocks, want 2 (the drills)`);
  // headless profile: FTP 200
  const ergW = run.mixerCommands.filter((c) => c.mode === 'erg').map((c) => (c as { watts: number }).watts);
  if (Math.max(...ergW) < 0.84 * 200 || Math.max(...ergW) > 0.9 * 200) f.push(`drill ERG peaks at ${Math.max(...ergW)} W, want Z3`);
  const sprints = runs(run.mixerCommands, (c) => c.mode === 'resistance' && c.levelPct >= SPRINT_LEVEL);
  if (sprints !== 9) f.push(`${sprints} sprints on the trainer, want 9`);
  if (ofType(run, 'pull').length !== 9) f.push(`${ofType(run, 'pull').length} pull events, want 9`);
  return f;
}

const near = (got: number, want: number, tol: number, what: string) =>
  Math.abs(got - want) <= want * tol ? [] : [`${what} ${got} min, want ${want} ± ${Math.round(tol * 100)}%`];

export const scenarios: Scenario[] = [
  {
    name: 'sprinting on cue rides the story in about 2 h and hits every sprint', script: 'target-follow', minutes: 150, seed: 9,
    assert(s, _st, run) {
      const f: string[] = [];
      if (!run.isOver) f.push('story did not finish');
      f.push(...near(Number(s['Ride minutes']), PLAN_MIN, 0.03, 'ride'));
      if (s['Fish landed'] !== '6/6' || s['Sprints on target'] !== '9/9') f.push(`fish ${s['Fish landed']}, sprints ${s['Sprints on target']}`);
      f.push(...workoutPlan(run));
      return f;
    },
  },
  {
    name: 'z2 rides the whole story without sprinting, slower', script: 'z2', minutes: 160, seed: 1,
    assert(s, _st, run) {
      const f: string[] = [];
      if (!run.isOver || s.Finished !== 'Yes') f.push('story did not finish');
      const entered = ofType(run, 'scene').map((e) => e.data?.id);
      if (entered.join() !== STORY.map((x) => x.id).join()) f.push(`scenes out of order or missing: ${entered.join()}`);
      if (ofType(run, 'chapter').length !== 3) f.push('want 3 chapter cards');
      const chapterSaves = ofType(run, 'save').filter((e) => e.data?.progress === 0).map((e) => e.data?.sceneId);
      if (chapterSaves.join() !== 'eyesOpen,cavern') f.push(`chapter saves ${chapterSaves.join()}`);
      if (!ofType(run, 'save').some((e) => e.data?.sceneId === 'drill1' && e.data?.progress === 0.5)) f.push('no checkpoint inside the drill');
      // not sprinting holds every fish fight for ~2 min: 10–15 min over a rider who sprints on cue, still ~2 h
      f.push(...near(Number(s['Ride minutes']), TARGET_MIN, 0.1, 'ride'));
      if (Number(s['Ride minutes']) < PLAN_MIN + 7) f.push(`ride ${s['Ride minutes']} min: not sprinting should cost more`);
      if (Number(s.Lines) < 30) f.push(`only ${s.Lines} monologue lines shown`);
      if (s['Fish landed'] !== '6/6') f.push(`fish landed ${s['Fish landed']}`);
      f.push(...workoutPlan(run));
      return f;
    },
  },
  {
    name: 'sprints (blind, every 2 min) beats z2 and lands every fish', script: 'sprints', minutes: 150, seed: 6,
    assert(s, st, run) {
      const f: string[] = [];
      if (!run.isOver) f.push('story did not finish');
      // sprints blind (every 2 min), so it waits on most fish, but still well ahead of z2
      if (Number(s['Ride minutes']) > PLAN_MIN + 4) f.push(`ride ${s['Ride minutes']} min, want ≤ ${(PLAN_MIN + 4).toFixed(1)}`);
      f.push(...near(Number(s['Ride minutes']), TARGET_MIN, 0.1, 'ride'));
      if (s['Fish landed'] !== '6/6') f.push(`fish landed ${s['Fish landed']}`);
      if (ofType(run, 'pull').some((e) => !e.data?.landed)) f.push('a pull did not land');
      if (!ofType(run, 'pull').some((e) => e.data?.hit)) f.push('no sprint on target');
      if (st.sprints < 9) f.push(`only ${st.sprints} sprints in the session record`);
      f.push(...workoutPlan(run));
      return f;
    },
  },
  {
    name: 'resumes at Midday from a chapter save', script: 'z2', minutes: 110, seed: 2,
    simOpts: { skipMenu: true, save: { rides: 0, chapterSelect: false, checkpoint: { sceneId: 'eyesOpen', progress: 0 } } },
    assert(s, _st, run) {
      const f: string[] = [];
      if (s['Started at'] !== 'eyesOpen') f.push(`started at ${s['Started at']}`);
      if (ofType(run, 'scene')[0]?.data?.id !== 'eyesOpen') f.push('first scene is not eyesOpen');
      if (!run.isOver) f.push('did not finish');
      const planMin = STORY.filter((x) => x.chapter > 0).reduce((a, x) => a + x.planS, 0) / 60;
      f.push(...near(Number(s['Ride minutes']), planMin, 0.1, 'Midday + Evening'));
      return f;
    },
  },
  {
    name: 'resumes mid-drill from a checkpoint', script: 'z2', minutes: 6, seed: 3,
    simOpts: { skipMenu: true, save: { checkpoint: { sceneId: 'drill1', progress: 0.5 } } },
    assert(s, _st, run) {
      const f: string[] = [];
      if (s['Started at'] !== 'drill1') f.push(`started at ${s['Started at']}`);
      // half of a 10 min drill at plan effort: done in ~5 min
      if (!ofType(run, 'scene').some((e) => e.data?.id === 'breakthrough')) f.push('drill did not finish from halfway');
      if (!run.mixerCommands.some((c) => c.mode === 'erg')) f.push('no ERG in the drill');
      return f;
    },
  },
  {
    name: 'menu auto-continues', script: 'z2', minutes: 1, seed: 4,
    simOpts: { save: { rides: 1, chapterSelect: true, checkpoint: { sceneId: 'cavern', progress: 0 } } },
    assert(s) { return s['Started at'] === 'cavern' ? [] : [`started at ${s['Started at']}`]; },
  },
  {
    name: 'idle passes the title and waits on the road', script: 'idle', minutes: 4, seed: 5,
    assert(s, _st, run) {
      const f: string[] = [];
      if (run.isOver) f.push('idle finished the story');
      if (!ofType(run, 'scene').some((e) => e.data?.id === 'highway')) f.push('title cutscene did not end');
      return f;
    },
  },
  {
    name: 'idle: the Big One and the cutscenes still resolve, then the belly waits', script: 'idle', minutes: 15, seed: 7,
    simOpts: { skipMenu: true, save: { checkpoint: { sceneId: 'bigOne', progress: 0 } } },
    assert(s, _st, run) {
      const f: string[] = [];
      const ids = ofType(run, 'scene').map((e) => e.data?.id).join();
      if (ids !== 'bigOne,under,eyesOpen,belly') f.push(`scenes ${ids}`);
      const big = ofType(run, 'pull')[0]?.data;
      if (!big?.landed || !big.setPiece || big.spectacle !== 0) f.push(`Big One ${JSON.stringify(big)}`);
      if (run.isOver || s.Chapter !== 'Midday') f.push(`ended in ${s.Chapter}`);
      return f;
    },
  },
  {
    name: 'idle: a fish fight lets go instead of soft-locking', script: 'idle', minutes: 60, seed: 8,
    simOpts: { skipMenu: true, save: { checkpoint: { sceneId: 'pier', progress: 0.3 } } },
    assert(s, _st, run) {
      const f: string[] = [];
      const pulls = ofType(run, 'pull');
      if (pulls.length < 3 || pulls.slice(0, 2).some((e) => e.data?.landed)) f.push(`pulls ${JSON.stringify(pulls.map((e) => e.data))}`);
      if (!ofType(run, 'scene').some((e) => e.data?.id === 'belly')) f.push('did not get through the pier and the Big One');
      if (s['Fish landed'] !== '0/2') f.push(`fish landed ${s['Fish landed']}`);
      return f;
    },
  },
];
