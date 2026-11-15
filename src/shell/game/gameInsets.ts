// The HUD insets a game last had on this screen size, so a game loaded ahead of time (prewarm.ts) can be laid out for
// its own HUD rather than the overworld's: a game's HUD can be taller (a row of touch controls, say), and a game that
// caches art per layout scale (Dynamo Defense) would otherwise redo it after the portal.
import type { Insets } from '../../contracts';

const KEY = 'wattcade.gameInsets';
const keyFor = (gameId: string, w: number, h: number, controller: boolean) => `${gameId}|${Math.round(w)}x${Math.round(h)}|${controller ? 'pad' : 'touch'}`;

function read(): Record<string, Insets> {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}

/** The insets `gameId` had last time at this size and input, if it has been played so. */
export function rememberedInsets(gameId: string, w: number, h: number, controller: boolean): Insets | null {
  const v = read()[keyFor(gameId, w, h, controller)];
  return v && typeof v.bottom === 'number' ? v : null;
}

export function rememberInsets(gameId: string, w: number, h: number, controller: boolean, insets: Insets) {
  if (!w || !h || !insets.bottom) return; // the HUD hasn't laid out yet
  const all = read(), k = keyFor(gameId, w, h, controller);
  if (JSON.stringify(all[k]) === JSON.stringify(insets)) return;
  all[k] = insets;
  const keys = Object.keys(all); if (keys.length > 60) delete all[keys[0]]; // keep it small
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* private mode: lobby insets are the guess */ }
}
