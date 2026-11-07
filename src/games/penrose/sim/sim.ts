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
  | { id: number; kind: 'restart' | 'next' | 'prev' | 'solve' | 'goto'; index?: number };

export interface PenroseSave { done: string[]; at: number }

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
  | { type: 'level'; index: number; id: string; name: string; machines: Array<{ key: string; name: string }> }
  | { type: 'won'; index: number; id: string; solved: boolean }
  | { type: 'fell'; index: number }
  | { type: 'load'; v: number }
  | { type: 'cmd'; kind: 'restart' | 'next' | 'prev' | 'solve' }
  | { type: 'goto'; index: number };

const isFace = (k: string): k is FaceKey => (FACE_KEYS as readonly string[]).includes(k);

export function createPenroseSim(ctx: GameContext): GameSim {
  const t = ctx.tuning;
  const gradeBase = t.num('gradeBase', 1, 0, 6, 0.5, 'Trainer grade % with every machine idle');
  const gradePerLoad = t.num('gradePerLoad', 5, 0, 12, 0.5, 'Extra grade % at full machine load');
  const effortAtFtp = t.num('effortAtFtp', 160, 80, 300, 5, 'Tide effort units at 100% FTP (the tide rises above 100 and peaks at 140)');
  const keepCmds = 32;

  ctx.resistance.useVirtualGears(true);
  const saved = ctx.load<PenroseSave>();
  const done = new Set<string>(Array.isArray(saved?.done) ? saved.done : []);
  const start = typeof saved?.at === 'number' && saved.at >= 0 ? Math.floor(saved.at) : 0;

  let nextId = 1, load = 0, at = start;
  const cmds: Command[] = [];
  const pending: PenroseAction[] = [];
  let level: PenroseSnapshot['level'] = null;
  const stat = { cleared: 0, firstClears: 0, falls: 0, solves: 0, levelsVisited: 0 };

  type NewCommand = Command extends infer C ? (C extends Command ? Omit<C, 'id'> : never) : never;
  const push = (c: NewCommand) => { cmds.push({ ...c, id: nextId++ } as Command); if (cmds.length > keepCmds) cmds.shift(); };
  const save = () => ctx.save({ done: [...done].sort(), at } satisfies PenroseSave);

  function apply(a: PenroseAction) {
    switch (a.type) {
      case 'level':
        level = { index: a.index, id: a.id, name: a.name, machines: a.machines.filter((m) => isFace(m.key)).map((m) => ({ key: m.key as FaceKey, name: m.name })) };
        at = a.index; stat.levelsVisited++; save(); ctx.debug('level', `${a.index + 1} ${a.name}`);
        break;
      case 'won':
        if (a.solved) { stat.solves++; break; }
        stat.cleared++;
        if (!done.has(a.id)) { done.add(a.id); stat.firstClears++; }
        ctx.emit({ type: 'level-cleared', data: { index: a.index, id: a.id } });
        save();
        break;
      case 'fell': stat.falls++; ctx.emit({ type: 'fell', data: { index: a.index } }); break;
      case 'load': load = Math.max(0, Math.min(1, Number.isFinite(a.v) ? a.v : 0)); break;
      case 'cmd': push({ kind: a.kind }); break;
      case 'goto': push({ kind: 'goto', index: a.index }); break;
    }
  }

  const hud = (): GameHud => {
    const controls: ControlHint[] = (level?.machines ?? []).map((m) => ({ button: m.key as Button, label: m.name, shortLabel: m.name }));
    return { controls, gears: true, persistentLegend: true };
  };

  return {
    update() {
      for (const a of pending.splice(0)) apply(a);
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
      return { levelsCleared: stat.cleared, firstClears: stat.firstClears, falls: stat.falls, levelsDone: done.size, at: at + 1 };
    },
  };
}
