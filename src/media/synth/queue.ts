import type { MediaTimeline } from '../../contracts';
import type { QueueMode } from '../types';
import { planMix, type MixItem, type MixPlan } from '../mix/plan';
import { buildTimeline } from '../mix/timeline';
import { makeScore, SYNTH_STYLES, type SynthScore, type SynthStyle } from './score';
import { scoreAnalysis } from './truth';

/** A headless/fake-mode queue of synth songs. `style: 'mixed'` cycles edm → rock → ambient. */
export interface SynthSpec { style?: SynthStyle | 'mixed'; songs?: number; seed?: number; mix?: QueueMode; short?: boolean }

const PALETTES = [
  ['#ff3d7f', '#ffd23d', '#3dffd2', '#3d7fff', '#1a1033'],
  ['#ff8a3d', '#ffe9a8', '#7a3dff', '#3dd2ff', '#14212b'],
  ['#3dff8a', '#d2ff3d', '#ff3dd2', '#3d8aff', '#101d16'],
];

export function synthScores(spec: SynthSpec = {}): SynthScore[] {
  const n = Math.max(1, spec.songs ?? 1), seed = spec.seed ?? 1;
  return Array.from({ length: n }, (_, i) => {
    const style = !spec.style || spec.style === 'mixed' ? SYNTH_STYLES[i % SYNTH_STYLES.length] : spec.style;
    return makeScore(style, seed + i, { short: spec.short });
  });
}

export function synthItem(s: SynthScore): MixItem {
  return { id: s.id, analysis: scoreAnalysis(s), title: s.title, artist: s.artist, palette: PALETTES[s.seed % PALETTES.length] };
}

/** Plan and timeline for a synth queue, from ground truth (no audio needed). */
export function synthQueue(spec: SynthSpec = {}): { items: MixItem[]; plan: MixPlan; timeline: MediaTimeline } {
  const items = synthScores(spec).map(synthItem);
  const plan = planMix(items, spec.mix ?? 'automix');
  return { items, plan, timeline: buildTimeline(plan, items) };
}

export const synthTimeline = (spec: SynthSpec = {}) => synthQueue(spec).timeline;
