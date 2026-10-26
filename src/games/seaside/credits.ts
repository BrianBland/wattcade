// The credits that roll over the cool-down at the end of the ride (#195). Music: the stock CC tracks the story cues
// (#197 picks them; each key is a SAMPLE_TRACKS entry, whose licence and attribution come from the media library).
import { SAMPLE_TRACKS, sampleCredit } from '../../media/library/samples';

/** The SAMPLE_TRACKS keys Seaside plays (title, the Big One, the island reveal, the Earth, the lift-off, the credits). */
export const SEASIDE_MUSIC: readonly string[] = [];

export interface CreditLine { text: string; kind: 'title' | 'head' | 'body' | 'gap' }

/** The credits, top to bottom. Every music track is listed with its title, artist and licence. */
export function creditLines(music: readonly string[] = SEASIDE_MUSIC): CreditLine[] {
  const L: CreditLine[] = [
    { text: 'Seaside', kind: 'title' }, { text: 'a story ride', kind: 'body' }, { text: '', kind: 'gap' },
    { text: 'Made by', kind: 'head' }, { text: 'Brian Bland', kind: 'body' }, { text: 'with Claude and Codex', kind: 'body' }, { text: '', kind: 'gap' },
    { text: 'Lou', kind: 'head' }, { text: 'as himself', kind: 'body' }, { text: '', kind: 'gap' },
  ];
  const tracks = music.map((k) => SAMPLE_TRACKS.find((s) => s.key === k)).filter((s) => !!s);
  if (tracks.length) {
    L.push({ text: 'Music', kind: 'head' });
    for (const s of tracks) L.push({ text: sampleCredit(s).text, kind: 'body' });
    L.push({ text: '', kind: 'gap' });
  }
  L.push({ text: 'Built with', kind: 'head' }, { text: 'Three.js · Preact · Vite · Web Bluetooth', kind: 'body' }, { text: '', kind: 'gap' },
    { text: 'Thanks for riding.', kind: 'title' });
  return L;
}
