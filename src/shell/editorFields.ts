import { LB_PER_KG, unitsFor } from '../units';
import type { AimMode, Profile, ProfileSettings, ZoneSource } from '../contracts';

export const COLORS = ['#00f0ff', '#ff2bd6', '#b6ff3b', '#ffb020', '#7a5cff', '#ff4d6d', '#2de2a6', '#ffffff'];

type Opt<T extends string> = ReadonlyArray<{ value: T; label: string }>;
export type FieldDef =
  | { id: 'name'; label: string; kind: 'text' }
  | { id: 'color'; label: string; kind: 'color' }
  | { id: string; label: string; kind: 'num'; step: number; min: number; max: number; unit?: string; digits?: number; hint?: string; get(p: Profile): number; set(p: Profile, v: number): Profile }
  | { id: string; label: string; kind: 'choice'; options: Opt<string>; hint?: string; get(p: Profile): string; set(p: Profile, v: string): Profile }
  | { id: string; label: string; kind: 'bool'; get(p: Profile): boolean; set(p: Profile, v: boolean): Profile };

const S = <K extends keyof ProfileSettings>(k: K) => ({
  get: (p: Profile) => p.settings[k], set: (p: Profile, v: ProfileSettings[K]) => ({ ...p, settings: { ...p.settings, [k]: v } }),
});
const ZONE_OPTS: Opt<ZoneSource> = [{ value: 'auto', label: 'Auto (HR if on)' }, { value: 'power', label: 'Power' }, { value: 'hr', label: 'Heart rate' }];
const AIM_OPTS: Opt<AimMode> = [{ value: 'rotate', label: 'Rotate (paddles)' }, { value: 'auto', label: 'Auto' }, { value: 'axes', label: 'Axes' }, { value: 'buttons', label: 'Buttons' }];

/** Profile editor rows, in D-pad order. */
export const EDITOR_FIELDS: FieldDef[] = [
  { id: 'name', label: 'Name', kind: 'text' },
  { id: 'color', label: 'Color', kind: 'color' },
  { id: 'units', label: 'Units', kind: 'choice', options: [{ value: 'imperial', label: 'Imperial (lb, mi)' }, { value: 'metric', label: 'Metric (kg, km)' }], get: unitsFor, set: (p, v) => ({ ...p, settings: { ...p.settings, units: v === 'metric' ? 'metric' : 'imperial' } }) },
  { id: 'ftp', label: 'FTP', kind: 'num', step: 5, min: 50, max: 600, unit: 'W', get: (p) => p.ftp, set: (p, v) => ({ ...p, ftp: v }) },
  { id: 'maxHr', label: 'Max HR', kind: 'num', step: 1, min: 100, max: 230, unit: 'bpm', get: (p) => p.maxHr, set: (p, v) => ({ ...p, maxHr: v }) },
  { id: 'weightKg', label: 'Weight', kind: 'num', step: 0.5, min: 30, max: 200, unit: 'kg', digits: 1, get: (p) => p.weightKg, set: (p, v) => ({ ...p, weightKg: v }) },
  { id: 'zoneSource', label: 'Zones from', kind: 'choice', options: ZONE_OPTS, hint: 'For long holds; short sprints always use power (HR lags 30–60 s)', ...(S('zoneSource') as { get(p: Profile): string; set(p: Profile, v: string): Profile }) },
  { id: 'aimMode', label: 'Aim', kind: 'choice', options: AIM_OPTS, ...(S('aimMode') as { get(p: Profile): string; set(p: Profile, v: string): Profile }) },
  { id: 'paddleDeadzone', label: 'Paddle deadzone', kind: 'num', step: 1, min: 0, max: 60, ...S('paddleDeadzone') },
  { id: 'maxGradePct', label: 'Max grade', kind: 'num', step: 0.5, min: 0, max: 20, unit: '%', digits: 1, hint: 'Safety cap on any grade sent to the trainer', ...S('maxGradePct') },
];

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Left/right on a field. Returns the changed profile, or null if the field doesn't adjust that way (e.g. text). */
export function adjustField(f: FieldDef, p: Profile, dir: -1 | 1): Profile | null {
  switch (f.kind) {
    case 'text': return null;
    case 'color': { const i = COLORS.indexOf(p.color); return { ...p, color: COLORS[(Math.max(0, i) + dir + COLORS.length) % COLORS.length] }; }
    case 'num': { const d = 10 ** (f.digits ?? 0); return f.set(p, clamp(Math.round((f.get(p) + dir * f.step) * d) / d, f.min, f.max)); }
    case 'choice': { const i = Math.max(0, f.options.findIndex((o) => o.value === f.get(p))); return f.set(p, f.options[(i + dir + f.options.length) % f.options.length].value); }
    case 'bool': return f.set(p, !f.get(p));
  }
}
/** A on a field: toggles and cycles; null for text (the screen focuses the input instead). */
export function activateField(f: FieldDef, p: Profile): Profile | null {
  return f.kind === 'bool' || f.kind === 'choice' || f.kind === 'color' ? adjustField(f, p, 1) : null;
}

/** Resolve measurement controls in the rider's selected units; storage stays metric. */
export function editorFields(p: Profile): FieldDef[] {
  return EDITOR_FIELDS.map((f) => f.id === 'weightKg' && unitsFor(p) === 'imperial' ? {
    ...f, kind: 'num', step: 1, min: 30 * LB_PER_KG, max: 200 * LB_PER_KG, unit: 'lb', digits: 1,
    get: (p: Profile) => p.weightKg * LB_PER_KG,
    set: (p: Profile, v: number) => ({ ...p, weightKg: Math.min(200, Math.max(30, v / LB_PER_KG)) }),
  } as FieldDef : f);
}
