import type { GameEvent, SessionRecord, TrainerCommand } from '../../contracts';
import { STORY } from './sim/story';

type Run = { mixerCommands: TrainerCommand[]; isOver: boolean; events: Array<{ t: number } & GameEvent> };
interface Scenario {
  name: string; script: string; minutes: number; seed: number; simOpts?: Record<string, unknown>;
  assert(summary: Record<string, number | string>, stats: SessionRecord['stats'], run: Run): string[];
}

const TARGET_MIN = 120;
const ofType = (run: Run, type: string) => run.events.filter((e) => e.type === type);
const near = (got: number, want: number, tol: number, what: string) =>
  Math.abs(got - want) <= want * tol ? [] : [`${what} ${got} min, want ${want} ± ${Math.round(tol * 100)}%`];

export const scenarios: Scenario[] = [
  {
    name: 'z2 rides the whole story in about 2 h', script: 'z2', minutes: 150, seed: 1,
    assert(s, _st, run) {
      const f: string[] = [];
      if (!run.isOver || s.Finished !== 'Yes') f.push('story did not finish');
      const entered = ofType(run, 'scene').map((e) => e.data?.id);
      if (entered.join() !== STORY.map((x) => x.id).join()) f.push(`scenes out of order or missing: ${entered.join()}`);
      if (ofType(run, 'chapter').length !== 3) f.push('want 3 chapter cards');
      const chapterSaves = ofType(run, 'save').filter((e) => e.data?.progress === 0).map((e) => e.data?.sceneId);
      if (chapterSaves.join() !== 'eyesOpen,cavern') f.push(`chapter saves ${chapterSaves.join()}`);
      if (!ofType(run, 'save').some((e) => e.data?.sceneId === 'drill1' && e.data?.progress === 0.5)) f.push('no checkpoint inside the drill');
      f.push(...near(Number(s['Ride minutes']), TARGET_MIN, 0.1, 'ride'));
      if (Number(s.Lines) < 30) f.push(`only ${s.Lines} monologue lines shown`);
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
];
