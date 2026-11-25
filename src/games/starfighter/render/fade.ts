/**
 * Visibility fades for scenery that comes and goes in view (ships, boats). Pure and continuous in position, so a
 * moving ship dissolves in or out over distance instead of popping when it crosses a cut-off.
 */
const smooth = (t: number) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };
/** View cut-offs in the ship's frame (lateral, ahead): matches `inView` in space.ts. */
export const VIEW = { back: -180, far: 1000, side: 210, spread: 0.62 };
export const inView = (lx: number, ahead: number) =>
  ahead > VIEW.back && ahead < VIEW.far && Math.abs(lx) < VIEW.side + Math.max(0, ahead) * VIEW.spread;
/** 1 well inside the view, easing to 0 at every cut-off (far edge over `far` units, sides and back over `edge`). */
export function viewFade(lx: number, ahead: number, far = 160, edge = 50): number {
  const lim = VIEW.side + Math.max(0, ahead) * VIEW.spread;
  return smooth((VIEW.far - ahead) / far) * smooth((ahead - VIEW.back) / edge) * smooth((lim - Math.abs(lx)) / edge);
}
/** 0 inside `clear`, easing to 1 over `band` beyond it (e.g. a hull's distance from the route or an island). */
export const clearFade = (dist: number, clear: number, band = 45) => smooth((dist - clear) / band);
