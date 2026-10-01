import type { ControlHint, ControlTarget } from '../../contracts';

export interface LegendLine { label: string; keys: ControlTarget[]; active: boolean }

/** Merge hints with identical labels onto one line; active lines first, otherwise original order. */
export function legendLines(controls: ControlHint[]): LegendLine[] {
  const by = new Map<string, LegendLine>();
  for (const c of controls) {
    const l = by.get(c.label);
    if (l) { if (!l.keys.includes(c.button)) l.keys.push(c.button); l.active ||= !!c.active; }
    else by.set(c.label, { label: c.label, keys: [c.button], active: !!c.active });
  }
  const all = [...by.values()];
  return [...all.filter((l) => l.active), ...all.filter((l) => !l.active)];
}

export const GLYPH: Record<ControlTarget, string> = {
  up: '▲', down: '▼', left: '◀', right: '▶', a: 'A', b: 'B', y: 'Y', z: 'Z',
  shiftUpL: 'L+', shiftDnL: 'L-', shiftUpR: 'R+', shiftDnR: 'R-', powerUpL: 'PwrL', powerUpR: 'PwrR', onOffL: 'OnL', onOffR: 'OnR',
  dpad: 'D-pad', paddles: 'Paddles', shiftersL: 'L-shift', shiftersR: 'R-shift',
};
export const GLYPH_COLOR: Partial<Record<ControlTarget, string>> = { y: '#3b82ff', b: '#ff4d4d', z: '#ff9a2b', a: '#3b82ff' };
