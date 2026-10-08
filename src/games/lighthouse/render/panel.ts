/** How many build-menu rows fit in `availH` px (the HUD height above the inset), centred on the selection. Pure. */
export const ROW_PX = 58;      // two-line .lh-opt incl. padding/border
export const CHROME_PX = 150;  // tabs, title, hints, bonus line, panel padding, margins

export function rowWindow(total: number, sel: number, availH: number): { start: number; count: number } {
  const fit = availH > 0 ? Math.floor((availH - CHROME_PX) / ROW_PX) : 7;
  const count = Math.max(3, Math.min(total, fit));
  const start = Math.max(0, Math.min(total - count, sel - Math.floor(count / 2)));
  return { start, count };
}
