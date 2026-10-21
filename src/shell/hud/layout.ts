export type HudLayout = 'auto' | 'touch' | 'controller';
const KEY = 'wattcade.hudLayout';
export function loadHudLayout(): HudLayout {
  try { const value = localStorage.getItem(KEY); return value === 'touch' || value === 'controller' ? value : 'auto'; } catch { return 'auto'; }
}
export function saveHudLayout(value: HudLayout) { try { localStorage.setItem(KEY, value); } catch { /* private storage */ } }
/** Presence, not recent input: idle controllers must keep their compact layout. */
export function controllerPresent(ride: boolean, pads: ArrayLike<{ connected?: boolean } | null> = []): boolean {
  return ride || Array.from(pads).some(pad => pad != null && pad.connected !== false);
}
export function resolveHudLayout(preference: HudLayout, connected: boolean): 'controller' | 'touch' {
  return preference === 'auto' ? connected ? 'controller' : 'touch' : preference;
}
