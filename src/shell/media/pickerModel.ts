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

/** Songs with local, analyzed audio can be auditioned; online/unanalyzed songs cannot. */
export const canPreview = (m: { status: string; sourceUrl?: string } | undefined): boolean => !!m && m.status === 'ready' && !m.sourceUrl;

export type PreviewTrigger = 'hover' | 'press' | 'focus';
/** Hover/press/focus intent → debounced preview start, immediate stop on leave (pure; timers injectable). */
export function previewIntent(o: {
  start: (id: string) => void; stop: () => void;
  delays?: Partial<Record<PreviewTrigger, number>>;
  setTimer?: (fn: () => void, ms: number) => unknown; clearTimer?: (h: unknown) => void;
}) {
  const delays: Record<PreviewTrigger, number> = { hover: 350, press: 250, focus: 600, ...o.delays };
  const setT = o.setTimer ?? ((fn, ms) => setTimeout(fn, ms)), clearT = o.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  let pending: { id: string; h: unknown } | null = null, playing: string | null = null;
  const cancel = () => { if (pending) { clearT(pending.h); pending = null; } };
  return {
    enter(id: string, trigger: PreviewTrigger, allowed = true) {
      if (!allowed) { this.leave(); return; }
      if (playing === id || pending?.id === id) return;
      cancel();
      if (playing) { playing = null; o.stop(); }
      pending = { id, h: setT(() => { pending = null; playing = id; o.start(id); }, delays[trigger]) };
    },
    /** Leave/release/blur: cancels a pending start and stops audio (only for `id` when given). */
    leave(id?: string) {
      if (id !== undefined && id !== playing && id !== pending?.id) return;
      cancel();
      if (playing) { playing = null; o.stop(); }
    },
    /** Audio ended or was stopped elsewhere. */
    reset() { cancel(); playing = null; },
    get playing() { return playing; }, get pending() { return pending?.id ?? null; },
  };
}
export type PreviewIntent = ReturnType<typeof previewIntent>;

/** A queue/library removal that can still be undone. */
export interface PendingRemoval { kind: 'queue' | 'library'; id: string; title: string; queueBefore: string[] }
/** Undo window for removals (ms). */
export const UNDO_MS = 6000;
