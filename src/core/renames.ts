import type { Profile, SessionRecord } from '../contracts';

/**
 * Games that changed id: old id → new id. Saves, last-played, ride history and tuning overrides stored under the
 * old id are moved to the new one when read, so a rename never loses a rider's progress. Never remove an entry.
 */
export const RENAMED_GAMES: Readonly<Record<string, string>> = { wattsurf: 'cadenza' };

/**
 * Achievements that changed id: old id → new id, rewritten in `profile.achievements` when read.
 * Temporary: drop an entry once every saved profile has been read since the rename.
 */
export const RENAMED_ACHIEVEMENTS: Readonly<Record<string, string>> = {
  wsurf_first: 'cz_first', wsurf_clean: 'cz_clean', wsurf_overdrive: 'cz_overdrive', wsurf_full_set: 'cz_full_set',
};

export const currentGameId = (id: string): string => RENAMED_GAMES[id] ?? id;

/** Move per-game keys (gameData, lastPlayed) and renamed achievement ids to their new ids. Returns the same object if nothing changed. */
export function migrateProfile(p: Profile): Profile {
  let out = p;
  if ((out.achievements ?? []).some((a) => a in RENAMED_ACHIEVEMENTS)) {
    out = { ...out, achievements: [...new Set(out.achievements.map((a) => RENAMED_ACHIEVEMENTS[a] ?? a))] };
  }
  for (const [from, to] of Object.entries(RENAMED_GAMES)) {
    const data = from in (out.gameData ?? {}), played = from in (out.lastPlayed ?? {});
    if (!data && !played) continue;
    const gameData = { ...out.gameData }, lastPlayed = { ...out.lastPlayed };
    if (data) { if (!(to in gameData)) gameData[to] = gameData[from]; delete gameData[from]; }
    if (played) { lastPlayed[to] = Math.max(lastPlayed[to] ?? 0, lastPlayed[from]); delete lastPlayed[from]; }
    out = { ...out, gameData, lastPlayed };
  }
  return out;
}

export function migrateSessionRecord(r: SessionRecord): SessionRecord {
  const id = currentGameId(r.gameId);
  return id === r.gameId ? r : { ...r, gameId: id };
}

type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
/**
 * Tuning overrides live at `<prefix><ns>` as `{ "<ns>.<key>": value }`. If `ns` has none but an old id does,
 * move them over (re-keyed) and drop the old entry.
 */
export function migrateTuning(storage: KV, prefix: string, ns: string): void {
  for (const [from, to] of Object.entries(RENAMED_GAMES)) {
    if (to !== ns) continue;
    const old = storage.getItem(prefix + from);
    if (old === null) continue;
    if (storage.getItem(prefix + to) === null) {
      try {
        const m = JSON.parse(old) as Record<string, unknown>, next: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(m)) next[k.startsWith(`${from}.`) ? `${to}.${k.slice(from.length + 1)}` : k] = v;
        storage.setItem(prefix + to, JSON.stringify(next));
      } catch { /* unreadable: drop it */ }
    }
    storage.removeItem(prefix + from);
  }
}
