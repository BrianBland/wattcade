// The first grounding fork closes outside the deck. Riders see a complete
// working machine before the next two put its collector shoe in their line.
import { easeBetween, lapAt } from './deck';
import { LAP } from './track';

export const stations = [
  { at: 82, side: -1, offset: 1.4, exhibit: true },
  { at: 278, side: 1, offset: 0.3, exhibit: false },
  { at: 781, side: -1, offset: 2.9, exhibit: false },
] as const;
export type Station = (typeof stations)[number];
export const liveEdge = 0.56;
export const stripCentre = 0.98;
export const stripHalfWidth = 0.34;
const contactHalfLength = 2;
const period = 6.4;

export function stormWidth(at: number) {
  const d = lapAt(at);
  return 1.49 - 0.36 * easeBetween(d, 466, 506) * (1 - easeBetween(d, 570, 622));
}

export function forkCycle(station: Station, time: number) {
  const phase = (time + station.offset) % period;
  const warning = easeBetween(phase, 1.85, 3.5);
  const down = easeBetween(phase, 3.5, 4.15) * (1 - easeBetween(phase, 5.22, 6.13));
  return { warning: warning * (1 - easeBetween(phase, 5.22, 6.13)), down, live: down >= 0.68 };
}

// Predict the whole contact interval. Both endpoints can be clear on a
// slow approach even when the fork closes in between them.
export function canCollectOnArrival(station: Station, gap: number, speed: number, time: number) {
  if (speed < 1) return false;
  const entry = time + Math.max(0, gap - contactHalfLength) / speed;
  const exit = time + Math.max(0, gap + contactHalfLength) / speed;
  const nextLowPoint = (4.15 - ((entry + station.offset) % period) + period) % period;
  return !forkCycle(station, entry).live && !forkCycle(station, exit).live && nextLowPoint > exit - entry;
}

export function collectorGear() {
  return { lastPass: -1, clears: 0, hits: 0, drag: 0 };
}
export function crossCollector(
  gear: ReturnType<typeof collectorGear>,
  from: number,
  to: number,
  x: number,
  time: number,
  dt: number,
): 'hit' | 'clear' | undefined {
  gear.drag = Math.max(0, gear.drag - dt);
  const lap = Math.floor(from / LAP);
  for (const [i, station] of stations.entries()) {
    if (station.exhibit) continue;
    const key = lap * stations.length + i;
    const gate = lap * LAP + station.at;
    if (gear.lastPass === key || to < gate - contactHalfLength || from >= gate + contactHalfLength) continue;
    const side = x * station.side;
    if (side >= liveEdge && forkCycle(station, time).live) {
      gear.lastPass = key;
      gear.hits++;
      gear.drag = 1.15;
      return 'hit';
    }
    if (to >= gate + contactHalfLength) {
      gear.lastPass = key;
      if (Math.abs(side - stripCentre) <= stripHalfWidth) {
        gear.clears++;
        return 'clear';
      }
    }
  }
}
