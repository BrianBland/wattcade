// Trams: shuttle along their route, ease into stops, dwell, reverse at the ends. Pure.
import { heightAt, TRAM_ROUTES } from './world';

export const TRAM = { len: 14, w: 2.8, roof: 3.5, top: 9, accel: 1.8, decel: 2.6, dwell: 4, endDwell: 6 };
export interface Tram { id: number; route: number; x: number; z: number; dir: 1 | -1; speed: number; dwell: number }

export const newTrams = (): Tram[] => TRAM_ROUTES.map((r, i) => ({ id: i, route: r.id, x: i % 2 ? r.x1 : r.x0, z: r.z, dir: i % 2 ? -1 : 1, speed: 0, dwell: 1 + i }));

/** Next stop (or route end) ahead of the tram, in its direction of travel. */
export function nextStop(t: Tram): { x: number; end: boolean } {
  const r = TRAM_ROUTES[t.route];
  const ahead = r.stops.filter((s) => (s - t.x) * t.dir > 0.01).sort((a, b) => (a - b) * t.dir);
  return ahead.length ? { x: ahead[0], end: false } : { x: t.dir > 0 ? r.x1 : r.x0, end: true };
}

export function stepTram(t: Tram, dt: number): void {
  if (t.dwell > 0) {
    t.dwell -= dt; t.speed = 0;
    const r = TRAM_ROUTES[t.route];
    if (t.dwell <= 0 && (t.dir > 0 ? r.x1 - t.x : t.x - r.x0) < 0.5) t.dir = t.dir > 0 ? -1 : 1; // turn back at the terminus
    return;
  }
  const s = nextStop(t), d = Math.abs(s.x - t.x);
  const want = Math.min(TRAM.top, Math.sqrt(2 * TRAM.decel * Math.max(0, d - 0.2)));
  t.speed += Math.max(-TRAM.decel * 2 * dt, Math.min(TRAM.accel * dt, want - t.speed));
  t.x += t.dir * Math.min(t.speed * dt, d);
  if (Math.abs(s.x - t.x) < 0.3 && t.speed < 1.5) { t.x = s.x; t.speed = 0; t.dwell = s.end ? TRAM.endDwell : TRAM.dwell; }
}

/** Is (x,z) inside a tram's footprint (+pad)? */
export const tramAt = (trams: ReadonlyArray<Tram>, x: number, z: number, pad = 0): Tram | null =>
  trams.find((t) => Math.abs(x - t.x) < TRAM.len / 2 + pad && Math.abs(z - t.z) < TRAM.w / 2 + pad) ?? null;
export const tramRoofY = (t: Tram) => heightAt(t.x, t.z) + TRAM.roof;
/** Hitch zone: just behind the rear bumper. */
export const behindTram = (t: Tram, x: number, z: number) => {
  const rear = t.x - (t.dir * TRAM.len) / 2, back = (rear - x) * t.dir;
  return Math.abs(z - t.z) < 2.2 && back > -0.5 && back < 4;
};
