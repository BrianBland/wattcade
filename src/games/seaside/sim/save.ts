import type { SeasideSave } from './types';

/** Read profile.gameData.seaside, keeping fields other issues add. */
export function migrateSave(raw: unknown): SeasideSave & Record<string, unknown> {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const cp = o.checkpoint as SeasideSave['checkpoint'] | undefined;
  return {
    ...o, v: 1,
    rides: typeof o.rides === 'number' ? o.rides : 0,
    chapterSelect: o.chapterSelect === true,
    checkpoint: cp && typeof cp.sceneId === 'string' ? { sceneId: cp.sceneId, progress: Number(cp.progress) || 0 } : null,
  };
}
