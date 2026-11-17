// How long each game takes to load in the background on this device, so its entrance can be on the road early and the
// rider reaches it just after the game is ready. Kept per browser (it is a property of the device).
const KEY = 'wattcade.gameLoadS';

function read(): Record<string, number> {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}

/** Expected background load time for `gameId` (seconds), or null when it has never loaded on this device. */
export function loadEstimateS(gameId: string): number | null {
  const v = read()[gameId];
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

/** Fold a new measurement in, leaning slow: a slower load counts in full, a faster one only moves the estimate a little. */
export function nextEstimateS(prev: number | null, measuredS: number): number {
  return prev == null ? measuredS : Math.max(measuredS, prev * 0.7 + measuredS * 0.3);
}

export function recordLoadS(gameId: string, measuredS: number) {
  if (!(measuredS > 0) || !Number.isFinite(measuredS)) return;
  const all = read(), prev = typeof all[gameId] === 'number' ? all[gameId] : null;
  all[gameId] = Math.round(nextEstimateS(prev, measuredS) * 100) / 100;
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* private mode: estimates stay default */ }
}
