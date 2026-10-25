// The story graph, transcribed from the storyboard (docs/seaside/storyboard.html on `seaside-storyboard`).
// Durations and effort segments are the storyboard's minutes / %FTP; ride lengths are duration × a scene speed.
import { PULL_DEFAULTS, pullTarget } from './pull';
import type { FishingLocation } from './catalogue';
import type { ChapterId, LookName, MonologueLine, PullPlan, Scene, SceneKind, SceneLength, TrainerPlan } from './types';

type Len = { m: number /* m/s */ } | { effortS: true } | { s: true };
interface Raw {
  id: string; ch: ChapterId; kind: SceneKind; title: string; min: number;
  /** [minutes, %FTP] */
  e: Array<[number, number]>;
  len: Len; tr: TrainerPlan; say?: string[]; look: LookName; dream: number;
  /** Size (0..1) of each ≥ 100 % FTP segment in `e`, in order: re-timed to 110–150 % × 6–25 s by size. */
  sizes?: number[];
  /** Fishing stop (#187): its spots and fish. */
  fish?: FishingLocation;
}

const sim = (gradePct: number, extra: Omit<Extract<TrainerPlan, { mode: 'sim' }>, 'mode' | 'gradePct'> = {}): TrainerPlan =>
  ({ mode: 'sim', gradePct, ...extra });
const route = (profile: Array<[number, number]>, swell?: { pct: number; cycles: number }) => sim(profile[0][1], { profile, ...(swell && { swell }) });
const swell = (gradePct: number, pct: number, cycles: number) => sim(gradePct, { swell: { pct, cycles } });
const res = (levelPct: number): TrainerPlan => ({ mode: 'resistance', levelPct });
const erg = (ftpFraction: number): TrainerPlan => ({ mode: 'erg', ftpFraction });
const NONE: TrainerPlan = { mode: 'none' };
const at = (v: number) => ({ m: v }), effort = { effortS: true as const }, timed = { s: true as const };

const RAW: Raw[] = [
  // ---------- Morning ----------
  { id: 'title', ch: 0, kind: 'cutscene', title: 'Title', min: 1, e: [[1, 45]], len: timed, tr: sim(0), look: 'morning', dream: 0.1 },
  { id: 'highway', ch: 0, kind: 'ride', title: 'Highway 1', min: 7, e: [[3, 50], [4, 63]], len: at(8), tr: swell(0.5, 1.5, 3),
    say: ['Good day for it.', "Wind's out of the north. Figures.", 'Big bird.'], look: 'morning', dream: 0.12 },
  { id: 'turnout1', fish: 'turnout', ch: 0, kind: 'fish', title: 'Turnout 1', min: 6, e: [[2, 55], [0.13, 135], [1.87, 58], [0.13, 135], [1.87, 58]], len: effort, tr: res(20), sizes: [0.1, 0.15],
    say: ['Lunch, maybe.', 'That counts. That definitely counts.'], look: 'morning', dream: 0.15 },
  { id: 'rollers', ch: 0, kind: 'ride', title: 'Rollers', min: 6, e: [[2, 62], [2, 75], [2, 60]], len: at(7.5), tr: route([[0, 0.5], [0.3, 4], [0.55, 4], [0.65, 0], [0.8, -3], [1, -1]]),
    say: ['Every hill out here has a better view.'], look: 'morning', dream: 0.15 },
  { id: 'shop1', ch: 0, kind: 'shop', title: "Lou's Bait & Tackle", min: 2, e: [[2, 45]], len: timed, tr: sim(0),
    say: ['Smells like salt and old wood.'], look: 'morning', dream: 0.18 },
  { id: 'toPier', ch: 0, kind: 'ride', title: 'To the pier', min: 5, e: [[5, 65]], len: at(7.5), tr: swell(0, 1, 2), say: ['New rod. Big plans.'], look: 'morning', dream: 0.2 },
  { id: 'pier', fish: 'pier', ch: 0, kind: 'fish', title: 'The pier', min: 6, e: [[2, 55], [0.2, 140], [1.8, 58], [0.2, 140], [1.8, 58]], len: effort, tr: res(30), sizes: [0.3, 0.35],
    say: ['That one pulled back.', 'Lingcod. Ugly. Valuable.'], look: 'morning', dream: 0.22 },
  { id: 'pierStand', ch: 0, kind: 'shop', title: 'Pier stand', min: 1.5, e: [[1.5, 45]], len: timed, tr: sim(0), say: ['Last one on the rack.'], look: 'morning', dream: 0.25 },
  { id: 'bigOne', ch: 0, kind: 'fish', title: 'The Big One', min: 3, e: [[1.5, 55], [0.42, 150], [1.08, 50]], len: timed, tr: res(30), sizes: [1],
    say: ['Huh. Quiet.'], look: 'morning', dream: 0.3 },
  { id: 'under', ch: 0, kind: 'cutscene', title: 'Under', min: 1.5, e: [[1.5, 40]], len: timed, tr: NONE, look: 'belly', dream: 0.35 },
  // ---------- Midday ----------
  { id: 'eyesOpen', ch: 1, kind: 'cutscene', title: 'Eyes open', min: 2, e: [[2, 50]], len: timed, tr: sim(0),
    say: ['...', 'Okay.', 'Inside a fish. Sure.'], look: 'belly', dream: 0.4 },
  { id: 'belly', ch: 1, kind: 'ride', title: 'The belly', min: 4, e: [[4, 58]], len: at(2.5), tr: swell(0, 3, 3),
    say: ["That's my old rod.", 'How long has this been in here?'], look: 'belly', dream: 0.4 },
  { id: 'spareParts', ch: 1, kind: 'ride', title: 'Spare parts', min: 3, e: [[3, 60]], len: at(1.5), tr: sim(0),
    say: ['Somebody had a worse day than me.', "That'll do."], look: 'belly', dream: 0.42 },
  { id: 'drill1', ch: 1, kind: 'drill', title: 'The drill', min: 10, e: [[1, 65], [2.5, 80], [0.5, 60], [2.5, 84], [0.5, 60], [2.5, 86], [0.5, 65]], len: effort, tr: erg(0.82),
    say: ['If I stop, I think it digests me.', 'Bone. Good. Bone is close to out.'], look: 'belly', dream: 0.45 },
  { id: 'breakthrough', ch: 1, kind: 'cutscene', title: 'Breakthrough', min: 1, e: [[0.25, 140], [0.75, 55]], len: timed, tr: res(40), sizes: [0.47], look: 'midday', dream: 0.5 },
  { id: 'paddle', ch: 1, kind: 'ride', title: 'Paddle', min: 5, e: [[5, 63]], len: at(2.5), tr: sim(0, { pulse: 'paddle' }),
    say: ["There wasn't an island here.", "I'd have seen it."], look: 'midday', dream: 0.5 },
  { id: 'beach', fish: 'beach', ch: 1, kind: 'fish', title: 'Beach', min: 5, e: [[2, 55], [0.17, 135], [2.83, 50]], len: effort, tr: res(25), sizes: [0.2],
    say: ['Tired. Hungry. In that order.', 'Who lit this fire?'], look: 'midday', dream: 0.52 },
  { id: 'boardwalk', ch: 1, kind: 'ride', title: 'Boardwalk', min: 5, e: [[5, 64]], len: at(6.5), tr: swell(0.5, 0.5, 3), say: ['It keeps turning left.'], look: 'jungle', dream: 0.55 },
  { id: 'cutStones', ch: 1, kind: 'ride', title: 'Cut stones', min: 6, e: [[2, 65], [2, 70], [2, 72]], len: at(4.5), tr: route([[0, 1.5], [0.25, 2.5], [1, 3]], { pct: 0.5, cycles: 4 }),
    say: ['Somebody cut these.', 'Somebody a long time ago.'], look: 'jungle', dream: 0.58 },
  { id: 'monkeyMouth', ch: 1, kind: 'ride', title: 'The monkey mouth', min: 1, e: [[1, 60]], len: at(4), tr: sim(0), say: ['Well.', 'In we go.'], look: 'jungle', dream: 0.6 },
  { id: 'temple', ch: 1, kind: 'ride', title: 'The temple', min: 3, e: [[3, 52]], len: at(0.8), tr: sim(0), say: ['Hello?', '...nice echo.'], look: 'jungle', dream: 0.62 },
  // ---------- Evening ----------
  { id: 'cavern', ch: 2, kind: 'ride', title: 'Torchlit cavern', min: 5, e: [[2, 58], [3, 48]], len: at(7), tr: route([[0, 0], [0.38, 0], [0.48, -3], [0.75, -5], [1, -3]]), say: ['Down it is.'], look: 'lava', dream: 0.65 },
  { id: 'bridge', ch: 2, kind: 'ride', title: 'The obsidian bridge', min: 3, e: [[3, 62]], len: at(5), tr: sim(0),
    say: ['Those are fish.', 'In the lava.', "I'm hungry enough not to care."], look: 'lava', dream: 0.72 },
  { id: 'magma', fish: 'lava', ch: 2, kind: 'fish', title: 'Magma fishing', min: 4, e: [[1.5, 55], [0.2, 140], [2.3, 52]], len: effort, tr: res(40), sizes: [0.35], say: ['Hot. Very hot.'], look: 'lava', dream: 0.75 },
  { id: 'fan', ch: 2, kind: 'fan', title: 'Cooling fan', min: 2, e: [[1.5, 78], [0.5, 45]], len: effort, tr: res(35),
    say: ['Blow on it. Big blow.', 'Tastes like... trout?'], look: 'lava', dream: 0.75 },
  { id: 'toGate', ch: 2, kind: 'ride', title: 'Toward the gate', min: 4, e: [[3, 62], [1, 50]], len: at(5.5), tr: sim(0), say: ['Dead end.', 'Of course it is.'], look: 'lava', dream: 0.8 },
  { id: 'drill2', ch: 2, kind: 'drill', title: 'Drill II', min: 6, e: [[1, 65], [2.5, 82], [2.5, 86]], len: effort, tr: erg(0.84), say: ['That sounds structural.'], look: 'lava', dream: 0.85 },
  { id: 'fall', ch: 2, kind: 'cutscene', title: 'The fall', min: 3, e: [[3, 40]], len: timed, tr: NONE, look: 'fever', dream: 0.9 },
  { id: 'reentry', ch: 2, kind: 'flight', title: 'Re-entry', min: 1, e: [[0.1, 70], [0.42, 150], [0.48, 55]], len: timed, tr: res(50), sizes: [1], look: 'reentry', dream: 1 },
  { id: 'wings', ch: 2, kind: 'flight', title: 'Wings', min: 2, e: [[2, 65]], len: at(14), tr: { mode: 'resistance', levelPct: 30, pulse: 'flap' }, say: ['Okay.', 'Wings.'], look: 'fever', dream: 0.85 },
  { id: 'sunset', ch: 2, kind: 'ride', title: 'Sunset highway', min: 3, e: [[3, 55]], len: at(7.5), tr: swell(0, 1, 2), say: ['Gone fishing.'], look: 'morning', dream: 0.5 },
  { id: 'cliff', ch: 2, kind: 'ride', title: 'The cliff', min: 1.5, e: [[1.5, 50]], len: at(6), tr: sim(0), look: 'morning', dream: 0.4 },
  { id: 'angel', ch: 2, kind: 'cutscene', title: 'Angel', min: 3, e: [[3, 40]], len: timed, tr: sim(0), look: 'morning', dream: 0.3 },
];

/** Lines spread over the scene: the first early, the last before the end. */
function spread(say: string[]): MonologueLine[] {
  const n = say.length;
  return say.map((text, i) => ({ text, at: n === 1 ? 0.25 : 0.12 + (0.7 * i) / (n - 1) }));
}

/** Effort segments in seconds, with each sprint re-timed by its size; the next segment absorbs the difference. */
function effortPlan(r: Raw, planS: number): { effort: Array<[number, number]>; pulls: PullPlan[] } {
  const effort: Array<[number, number]> = r.e.map(([min, pct]) => [min * 60, pct / 100]);
  const pulls: PullPlan[] = [];
  let k = 0, t = 0;
  for (let i = 0; i < effort.length; i++) {
    if (effort[i][1] >= 1) {
      const size = r.sizes?.[k++];
      if (size === undefined) throw new Error(`${r.id}: sprint ${k} has no size`);
      const p = pullTarget(size, PULL_DEFAULTS), d = Math.round(p.s);
      if (i + 1 >= effort.length) throw new Error(`${r.id}: a sprint needs a recovery segment after it`);
      effort[i + 1][0] += effort[i][0] - d;
      effort[i] = [d, +p.ftp.toFixed(3)];
      pulls.push({ atS: t, planS: d, size });
    }
    t += effort[i][0];
  }
  if (r.sizes && k !== r.sizes.length) throw new Error(`${r.id}: ${r.sizes.length} sizes for ${k} sprints`);
  const sum = effort.reduce((a, [d]) => a + d, 0);
  effort[effort.length - 1][0] += planS - sum;
  return { effort, pulls };
}

function build(r: Raw): Scene {
  const planS = Math.round(r.min * 60);
  const { effort, pulls } = effortPlan(r, planS);
  const length: SceneLength = 'm' in r.len ? { m: Math.round(planS * r.len.m) } : 'effortS' in r.len ? { effortS: planS } : { s: planS };
  return {
    id: r.id, chapter: r.ch, kind: r.kind, title: r.title, length, planS,
    effort, trainer: r.tr, monologue: spread(r.say ?? []), look: r.look, dream: r.dream, pulls,
    ...(r.fish && { fishing: r.fish }),
  };
}

export const STORY: readonly Scene[] = RAW.map(build);
