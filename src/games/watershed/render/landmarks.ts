// Landmarks the camera can fly to (pure, unit-tested): the spring, the two mills, Millbrook and the beaver dam.
import type { WatershedSnapshot } from '../sim/sim';

export type LandmarkId = 'spring' | 'grist' | 'saw' | 'village' | 'dam';
export interface Landmark { id: LandmarkId; label: string; icon: string; /** grid coords: x across, y downstream */ x: number; y: number }

/** The landmarks that exist right now, in a fixed order (the beaver dam only while it stands). */
export function landmarks(s: Pick<WatershedSnapshot, 'sourceX' | 'jobs'>): Landmark[] {
  const out: Landmark[] = [{ id: 'spring', label: 'Spring', icon: '💧', x: s.sourceX, y: 3 }];
  for (const m of s.jobs.mills) {
    // between the mill house (3 cells across from the mill's x) and its wheel (back on the mill's x, by the river)
    out.push(m.kind === 'grist' ? { id: 'grist', label: 'Grist mill', icon: '🌾', x: m.x + 1.5, y: m.y } : { id: 'saw', label: 'Sawmill', icon: '🪵', x: m.x + 1.5, y: m.y });
  }
  const v = s.jobs.village;
  out.push({ id: 'village', label: 'Millbrook', icon: '🏘️', x: v.x, y: v.y });
  const d = s.jobs.dam;
  if (d && !d.broken) out.push({ id: 'dam', label: 'Beaver dam', icon: '🦫', x: d.x, y: d.y });
  return out;
}

/** The landmark after `cur` (wrapping; the first one when `cur` is gone or null). */
export function nextLandmark(list: Landmark[], cur: LandmarkId | null): Landmark | null {
  if (!list.length) return null;
  const k = cur ? list.findIndex((l) => l.id === cur) : -1;
  return list[(k + 1) % list.length];
}
