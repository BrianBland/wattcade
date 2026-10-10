import type { MediaSection, MediaTimeline } from '../../../contracts';
import { synthTimeline } from '../../../media/synth/queue';

export function rideTimeline(sections: Array<[number, number, MediaSection['kind']]>, songStarts = [0]): MediaTimeline {
  const base = synthTimeline({ style: 'edm', songs: 1, seed: 1 });
  const durationS = sections.at(-1)![1];
  return { ...base, durationS,
    sections: sections.map(([t0, t1, kind]) => ({ t0, t1, kind, energy: kind === 'drop' ? 1 : 0.5 })),
    songs: songStarts.map((t0, i) => ({ ...base.songs[0], id: `song:${i}`, t0, t1: songStarts[i + 1] ?? durationS })),
  };
}
