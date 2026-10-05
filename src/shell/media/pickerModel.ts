import type { QueueMode } from '../../media';

/** Controller focus in the media picker: a tab row, the song list, and the queue column (pure, tested). */
export type Zone = 'tabs' | 'list' | 'queue';
export interface PickerFocus { zone: Zone; tab: number; list: number; queue: number }
/** Queue rows: 0 = play-mode chooser, 1..n = songs, n + 1 = Start. */
export const queueRows = (songs: number) => songs + 2;

export function pickerNav(f: PickerFocus, key: 'up' | 'down' | 'left' | 'right', size: { tabs: number; list: number; queue: number }): PickerFocus {
  const clamp = (v: number, n: number) => Math.max(0, Math.min(n - 1, v));
  const rows = queueRows(size.queue);
  switch (f.zone) {
    case 'tabs':
      if (key === 'left') return { ...f, tab: clamp(f.tab - 1, size.tabs) };
      if (key === 'right') return f.tab >= size.tabs - 1 ? { ...f, zone: 'queue', queue: clamp(f.queue, rows) } : { ...f, tab: f.tab + 1 };
      if (key === 'down' && size.list > 0) return { ...f, zone: 'list', list: clamp(f.list, size.list) };
      return f;
    case 'list':
      if (key === 'up') return f.list <= 0 ? { ...f, zone: 'tabs' } : { ...f, list: f.list - 1 };
      if (key === 'down') return { ...f, list: clamp(f.list + 1, size.list) };
      if (key === 'right') return { ...f, zone: 'queue', queue: clamp(f.queue, rows) };
      return f;
    case 'queue':
      if (key === 'up') return { ...f, queue: clamp(f.queue - 1, rows) };
      if (key === 'down') return { ...f, queue: clamp(f.queue + 1, rows) };
      if (key === 'left') return size.list > 0 ? { ...f, zone: 'list', list: clamp(f.list, size.list) } : { ...f, zone: 'tabs' };
      return f;
  }
}

export const MODES: ReadonlyArray<{ value: QueueMode; label: string; hint: string }> = [
  { value: 'automix', label: 'Automix', hint: 'Beat-matched DJ transitions' },
  { value: 'continuous', label: 'Continuous', hint: 'Back to back, no gaps (albums)' },
  { value: 'crossfade', label: 'Crossfade', hint: 'Smooth fade between songs' },
];
export const nextMode = (m: QueueMode, dir: 1 | -1 = 1): QueueMode => {
  const i = MODES.findIndex((x) => x.value === m);
  return MODES[(i + dir + MODES.length) % MODES.length].value;
};

export function moveItem<T>(xs: readonly T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (i < 0 || j < 0 || i >= xs.length || j >= xs.length) return [...xs];
  const out = [...xs]; [out[i], out[j]] = [out[j], out[i]]; return out;
}

/** Where to start a song's audio preview: its first drop, else the loudest stretch, else a third of the way in. */
export function previewStart(sections: Array<{ t0: number; kind: string; energy: number }>, durationS: number): number {
  const drop = sections.find((s) => s.kind === 'drop');
  if (drop) return drop.t0;
  const loud = [...sections].sort((a, b) => b.energy - a.energy)[0];
  return loud ? loud.t0 : durationS / 3;
}

export const SECTION_COLORS: Record<string, string> = {
  intro: '#5b8cff', verse: '#2de2a6', build: '#ffb020', drop: '#ff2bd6', break: '#7a5cff', outro: '#3f6bd8',
};

export function fmtTime(s: number): string {
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}
