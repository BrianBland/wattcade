import type { Insets } from '../../contracts';

/** HudLayer announces changes which do not resize the conservative CSS HUD envelope. */
export const HUD_LAYOUT_EVENT = 'wattcade:hud-layout';

/** Keep the old rectangular inset for existing games; opt-in games also get the occupied shape. */
export function readHudInsets(surface: HTMLElement | null, probe: HTMLElement | null): Insets {
  const bottom = probe?.offsetHeight ?? 0;
  const insets: Insets = { top: 0, right: 0, left: 0, bottom };
  if (!surface || !bottom) return insets;
  const hud = document.querySelector('.hud');
  if (!hud) return insets; // first HUD frame has not mounted yet
  const area = surface.getBoundingClientRect();
  if (!area.width || !area.height) return insets;
  insets.occlusions = [...hud.children].flatMap(child => {
    const r = child.getBoundingClientRect();
    const x = Math.max(0, r.left - area.left), y = Math.max(0, r.top - area.top);
    const right = Math.min(area.width, r.right - area.left), end = Math.min(area.height, r.bottom - area.top);
    return right > x && end > y ? [{ x, y, w: right - x, h: end - y }] : [];
  });
  return insets;
}
