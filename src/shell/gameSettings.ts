// Per-game pause-menu settings, read structurally from the sim (no contracts.ts change; see gtpedal NOTES CONTRACT-REQUEST).
// A sim may expose `settings(): GameSetting[]`; the pause menu shows one stepper per entry and applies changes via
// `sim.receive({ type: 'setting', key, value })`. Sims should apply settings inside receive() immediately (the sim
// isn't stepping while paused) and persist them with ctx.save.
export interface GameSetting { key: string; label: string; value: number; min: number; max: number; step: number; digits?: number; unit?: string; hint?: string }
export interface SettingAction { type: 'setting'; key: string; value: number }

export function readGameSettings(sim: unknown): GameSetting[] {
  const f = (sim as { settings?: () => unknown } | null)?.settings;
  if (typeof f !== 'function') return [];
  const out = f.call(sim);
  return Array.isArray(out) ? out.filter((s): s is GameSetting => !!s && typeof s.key === 'string' && Number.isFinite(s.value)) : [];
}

/** Clamp + snap a stepped value, then send it to the sim. Returns the value applied. */
export function applyGameSetting(sim: { receive?(a: unknown): void } | null | undefined, s: GameSetting, value: number): number {
  const v = Math.min(s.max, Math.max(s.min, Math.round(value / s.step) * s.step));
  const r = +v.toFixed(6);
  sim?.receive?.({ type: 'setting', key: s.key, value: r } satisfies SettingAction);
  return r;
}
