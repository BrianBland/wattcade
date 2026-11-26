import type { Button, ControlHint, GameContext, GameHud, GameMenuAction, GameSim } from '../../../contracts';

/**
 * Penrose Pedals sim. For now the level logic (roads, wheel, machines) runs in the renderer's engine, so this sim is the
 * bridge between the bike and the engine: it turns face-button presses and pause-menu picks into numbered commands the
 * renderer applies once each, reads cadence, gear and effort for the engine, sets trainer resistance from the machine
 * load the renderer reports, and keeps the save (cleared levels and where to resume). See ../NOTES.md.
 */
export type FaceKey = 'a' | 'b' | 'y' | 'z';
export const FACE_KEYS: readonly FaceKey[] = ['y', 'a', 'b', 'z'];

export type Command =
  | { id: number; kind: 'toggle'; key: FaceKey }
  | { id: number; kind: 'restart' | 'next' | 'prev' | 'solve' | 'hint' | 'goto'; index?: number };

/**
 * `clean`: levels cleared with no fall and no hint or solve on that visit, from chapter 3 on (Sure Wheel).
 * Older saves have no `clean`.
 */
export interface PenroseSave { done: string[]; at: number; clean?: string[] }

export interface PenroseSnapshot {
  /** rpm and gear for the engine's rider. */
  cad: number; gear: number;
  /** Rider effort on the prototype's watt scale (FTP-relative), read by the tide. */
  effort: number;
  /** Level to open on the first frame. */
  start: number;
  /** Recent commands, oldest first; apply those with an id above the last one applied. */
  cmds: Command[];
  done: string[];
  level: { index: number; id: string; name: string; machines: Array<{ key: FaceKey; name: string }> } | null;
}

/** What the renderer reports back through `send`. */
export type PenroseAction =
  | { type: 'level'; index: number; id: string; name: string; machines: Array<{ key: string; name: string }>; chapter?: number }
  /** Once the level list is built: level ids per campaign chapter (index = CAMPAIGN position). */
  | { type: 'catalog'; chapters: string[][] }
  /** How far in the tide is, 0..1, on a level with a tide (sent on change). */
  | { type: 'tide'; v: number }
  | { type: 'won'; index: number; id: string; solved: boolean }
  | { type: 'fell'; index: number }
  | { type: 'load'; v: number }
  | { type: 'cmd'; kind: 'restart' | 'next' | 'prev' | 'solve' | 'hint' }
  | { type: 'goto'; index: number };

const isFace = (k: string): k is FaceKey => (FACE_KEYS as readonly string[]).includes(k);

/** Achievement thresholds (chapter indexes count from 0: chapter 3 is index 2). See ../achievements.ts. */
export const MASTERY = {
  /** Sure Wheel counts clean clears from this chapter on. */
  cleanFrom: 2,
  /** Unbroken: a run of clean clears counts from this chapter on. */
  streakFrom: 3,
  /** Own Eyes: whole chapters cleared unaided, from this chapter up to (not including) `unaidedTo`. */
  unaidedFrom: 4, unaidedTo: 8,
  /** The tide counts as fully in at this fraction. */
  tideFull: 0.99,
} as const;

/** Bitmask of chapters whose every level is in `done` (bit i = CAMPAIGN chapter i). */
export function chaptersMask(chapters: readonly (readonly string[])[], done: ReadonlySet<string>): number {
  let m = 0;
  chapters.forEach((ids, i) => { if (ids.length && ids.every((id) => done.has(id))) m |= 1 << i; });
  return m;
}

export function createPenroseSim(ctx: GameContext): GameSim {
  const t = ctx.tuning;
  const gradeBase = t.num('gradeBase', 1, 0, 6, 0.5, 'Trainer grade % with every machine idle');
  const gradePerLoad = t.num('gradePerLoad', 5, 0, 12, 0.5, 'Extra grade % at full machine load');
  const effortAtFtp = t.num('effortAtFtp', 160, 80, 300, 5, 'Tide effort units at 100% FTP (the tide rises above 100 and peaks at 140)');
  const keepCmds = 32;

  ctx.resistance.useVirtualGears(true);
  const saved = ctx.load<PenroseSave>();
  const done = new Set<string>(Array.isArray(saved?.done) ? saved.done : []);
  const clean = new Set<string>(Array.isArray(saved?.clean) ? saved.clean : []);
  const start = typeof saved?.at === 'number' && saved.at >= 0 ? Math.floor(saved.at) : 0;

  let nextId = 1, load = 0, at = start;
  const cmds: Command[] = [];
  const pending: PenroseAction[] = [];
  let level: PenroseSnapshot['level'] = null;
  const stat = { cleared: 0, firstClears: 0, falls: 0, solves: 0, levelsVisited: 0, streak: 0, bestStreak: 0, tideFullS: 0, unaidedChapters: 0 };
  let chapters: string[][] = [];
  /** This visit to the current level: a fall or a restart keeps it going; it ends on a clear or on leaving the level. */
  let visit = { index: -1, chapter: -1, falls: 0, aided: false, done: false };
  let tide = 0;
  const ridden = new Set<string>();                 // levels cleared this ride (not by a solve)
  const unaided = new Map<number, Set<string>>();   // chapter → levels cleared this ride with no hint or solve
  const unaidedDone = new Set<number>();

  type NewCommand = Command extends infer C ? (C extends Command ? Omit<C, 'id'> : never) : never;
  const push = (c: NewCommand) => { cmds.push({ ...c, id: nextId++ } as Command); if (cmds.length > keepCmds) cmds.shift(); };
  const save = () => ctx.save({ done: [...done].sort(), at, clean: [...clean].sort() } satisfies PenroseSave);

  function apply(a: PenroseAction) {
    switch (a.type) {
      case 'level': {
        level = { index: a.index, id: a.id, name: a.name, machines: a.machines.filter((m) => isFace(m.key)).map((m) => ({ key: m.key as FaceKey, name: m.name })) };
        if (a.index !== visit.index) {
          // leaving a level without clearing it (a skip, a jump) breaks the run; the first level of a ride does not
          if (visit.index >= 0 && !visit.done) stat.streak = 0;
          visit = { index: a.index, chapter: typeof a.chapter === 'number' ? a.chapter : -1, falls: 0, aided: false, done: false };
          tide = 0;
        }
        at = a.index; stat.levelsVisited++; save(); ctx.debug('level', `${a.index + 1} ${a.name}`);
        break;
      }
      case 'catalog': chapters = Array.isArray(a.chapters) ? a.chapters.map((c) => (Array.isArray(c) ? c.map(String) : [])) : []; break;
      case 'won': {
        if (a.solved) { stat.solves++; visit.aided = true; stat.streak = 0; break; }
        if (visit.index !== a.index) visit = { index: a.index, chapter: -1, falls: 0, aided: false, done: false };
        visit.done = true;
        const ch = visit.chapter, first = !done.has(a.id), spotless = visit.falls === 0 && !visit.aided;
        stat.cleared++; ridden.add(a.id);
        if (first) { done.add(a.id); stat.firstClears++; }
        if (spotless && ch >= MASTERY.cleanFrom) clean.add(a.id);
        if (spotless && ch >= MASTERY.streakFrom) stat.bestStreak = Math.max(stat.bestStreak, ++stat.streak); else stat.streak = 0;
        if (!visit.aided && ch >= 0) {
          const set = unaided.get(ch) ?? new Set<string>(); set.add(a.id); unaided.set(ch, set);
          const ids = chapters[ch] ?? [];
          if (ch >= MASTERY.unaidedFrom && ch < MASTERY.unaidedTo && ids.length && !unaidedDone.has(ch) && ids.every((id) => set.has(id))) {
            unaidedDone.add(ch); stat.unaidedChapters++; ctx.emit({ type: 'chapter-unaided', data: { chapter: ch } });
          }
        }
        ctx.emit({ type: 'level-cleared', data: { index: a.index, id: a.id, chapter: ch, falls: visit.falls, aided: visit.aided, first } });
        save();
        break;
      }
      case 'fell': stat.falls++; visit.falls++; ctx.emit({ type: 'fell', data: { index: a.index } }); break;
      case 'load': load = Math.max(0, Math.min(1, Number.isFinite(a.v) ? a.v : 0)); break;
      case 'tide': tide = Math.max(0, Math.min(1, Number.isFinite(a.v) ? a.v : 0)); break;
      case 'cmd':
        if (a.kind === 'hint' || a.kind === 'solve') visit.aided = true;
        push({ kind: a.kind });
        break;
      case 'goto': push({ kind: 'goto', index: a.index }); break;
    }
  }

  const hud = (): GameHud => {
    const controls: ControlHint[] = (level?.machines ?? []).map((m) => ({ button: m.key as Button, label: m.name, shortLabel: m.name }));
    return { controls, gears: true, persistentLegend: true };
  };

  return {
    update(dt) {
      for (const a of pending.splice(0)) apply(a);
      if (tide >= MASTERY.tideFull && ctx.bike().cadence3s > 20) stat.tideFullS += dt;
      const inp = ctx.input();
      for (const k of FACE_KEYS) if (inp.pressed.has(k) && level?.machines.some((m) => m.key === k)) push({ kind: 'toggle', key: k });
      const grade = gradeBase() + gradePerLoad() * load;
      ctx.resistance.set({ id: 'penrose', mode: 'sim', gradePct: Math.round(grade * 10) / 10 });
    },
    hud,
    snapshot(): PenroseSnapshot {
      const b = ctx.bike();
      return { cad: b.cadence3s, gear: b.gear, effort: b.ftpFraction * effortAtFtp(), start, cmds: cmds.slice(), done: [...done], level };
    },
    isOver: () => false,
    menuActions(): readonly GameMenuAction[] {
      return [
        { id: 'hint', label: 'Show or hide the hint', action: { type: 'cmd', kind: 'hint' } },
        { id: 'restart', label: 'Restart level', action: { type: 'cmd', kind: 'restart' } },
        { id: 'solve', label: 'Watch a solve', action: { type: 'cmd', kind: 'solve' } },
        { id: 'next', label: 'Skip to next level', action: { type: 'cmd', kind: 'next' } },
        { id: 'prev', label: 'Back one level', action: { type: 'cmd', kind: 'prev' } },
      ];
    },
    receive(action: unknown) {
      if (action && typeof action === 'object' && typeof (action as { type?: unknown }).type === 'string') pending.push(action as PenroseAction);
    },
    summary() {
      return {
        levelsCleared: stat.cleared, firstClears: stat.firstClears, falls: stat.falls, levelsDone: done.size, at: at + 1,
        levelsRidden: ridden.size, cleanLevels: clean.size, bestStreak: stat.bestStreak, unaidedChapters: stat.unaidedChapters,
        chaptersDone: chaptersMask(chapters, done), tideFullS: Math.round(stat.tideFullS),
      };
    },
  };
}
