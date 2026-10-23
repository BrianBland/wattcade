// Pure queries over the ordered scene list: plan time, route distance, effort plan, chapters, checkpoints, resume.
import type { ChapterId, Scene, SeasideSave } from './types';

export interface Graph {
  scenes: readonly Scene[];
  /** Plan seconds from story start to each scene's start (plus the total at index n). */
  planT0: number[];
  /** Route metres at each scene's start (plus the total at index n). Only `m` scenes add distance. */
  routeS0: number[];
  /** Index of each chapter's first scene. */
  chapterStart: number[];
}

export function makeGraph(scenes: readonly Scene[]): Graph {
  const planT0 = [0], routeS0 = [0], chapterStart: number[] = [];
  scenes.forEach((sc, i) => {
    planT0.push(planT0[i] + sc.planS);
    routeS0.push(routeS0[i] + ('m' in sc.length ? sc.length.m : 0));
    if (i === 0 || scenes[i - 1].chapter !== sc.chapter) chapterStart[sc.chapter] = i;
  });
  return { scenes, planT0, routeS0, chapterStart };
}

export const totalPlanS = (g: Graph) => g.planT0[g.scenes.length];
export const chapterPlanS = (g: Graph, ch: ChapterId) => {
  const a = g.chapterStart[ch], b = g.chapterStart[ch + 1] ?? g.scenes.length;
  return g.planT0[b] - g.planT0[a];
};

/** Plan seconds from story start at `progress` (0..1) through scene `index`. */
export const planElapsed = (g: Graph, index: number, progress: number) => g.planT0[index] + progress * g.scenes[index].planS;

/** Route metres at `progress` through scene `index` (non-rail scenes hold their start). */
export function routeAt(g: Graph, index: number, progress: number): number {
  const sc = g.scenes[index];
  return g.routeS0[index] + ('m' in sc.length ? progress * sc.length.m : 0);
}

/** Planned effort (fraction of FTP) at plan position `t` seconds into the scene. */
export function effortAt(sc: Scene, t: number): number {
  let acc = 0;
  for (const [d, v] of sc.effort) { acc += d; if (t < acc) return v; }
  return sc.effort[sc.effort.length - 1][1];
}

/** The scene's steady effort: time-weighted mean of its sub-threshold segments (sprint spikes excluded). */
export function baseFtp(sc: Scene): number {
  let w = 0, sum = 0;
  for (const [d, v] of sc.effort) if (v < 1) { w += d; sum += d * v; }
  return w > 0 ? sum / w : sc.effort[0][1];
}

/** Save points inside long scenes (fractions of progress). */
export function checkpointsOf(sc: Scene, minS = 300): number[] {
  return sc.planS >= minS ? [0.5] : [];
}

/** Where a save resumes; falls back to the story start for missing or unknown checkpoints. */
export function resumePoint(g: Graph, save: Pick<SeasideSave, 'checkpoint'> | undefined): { index: number; progress: number } {
  const cp = save?.checkpoint;
  const index = cp ? g.scenes.findIndex((s) => s.id === cp.sceneId) : -1;
  if (index < 0 || !cp) return { index: 0, progress: 0 };
  return { index, progress: Math.min(0.999, Math.max(0, cp.progress || 0)) };
}
