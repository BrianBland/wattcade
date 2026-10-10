import type { Button, ControlCooldown, ControlHint } from '../../contracts';

export interface PadButton { id: Button; glyph: string; label?: string; mapped: boolean; active?: boolean; color: string; cooldown?: ControlCooldown }
/** One group of physical buttons. `label` is set when every mapped member does the same thing (drawn once, centered). */
export interface Cluster { kind: 'dpad' | 'face' | 'shift'; buttons: PadButton[]; label?: string; mapped: boolean; gears?: boolean }
export interface HoodModel { paddle: { label?: string; mapped: boolean }; shift: Cluster | null; stick: Cluster }
export interface PadModel { left: HoodModel; right: HoodModel }

export const FACE_COLOR: Partial<Record<Button, string>> = { y: '#3b82ff', b: '#ff4d4d', z: '#ff9a2b', a: '#2bd96b' };
const DPAD_COLOR = '#8a84b8', SHIFT_COLOR = '#b07cff';

type Def = Array<[Button, string]>;
const DPAD: Def = [['up', '▲'], ['left', '◀'], ['right', '▶'], ['down', '▼']]; // top, left, right, bottom
const FACE: Def = [['y', 'Y'], ['z', 'Z'], ['a', 'A'], ['b', 'B']];

function cluster(kind: Cluster['kind'], defs: Def, hints: Map<string, ControlHint>, group?: string): Cluster {
  const color = (id: Button) => FACE_COLOR[id] ?? (kind === 'shift' ? SHIFT_COLOR : DPAD_COLOR);
  const g = group ? hints.get(group) : undefined;
  const member = defs.map(([id]) => hints.get(id));
  const same = member.every((h) => h) && new Set(member.map((h) => h!.label)).size === 1;
  const merged = (g && !member.some(Boolean)) ? g : same ? member[0] : undefined;
  const buttons = defs.map(([id, glyph], i): PadButton => {
    const h = merged ?? member[i] ?? (g && !member.some(Boolean) ? g : undefined);
    return { id, glyph, label: merged ? undefined : h?.label, mapped: !!h, active: h?.active, color: color(id), cooldown: h?.cooldown };
  });
  return { kind, buttons, label: merged?.label, mapped: buttons.some((b) => b.mapped) };
}

/** Map game controls onto the hoods, including virtual gears on their assigned shifters. */
export function buildPad(controls: ControlHint[], gears: boolean): PadModel {
  const hints = new Map<string, ControlHint>(controls.map((c) => [c.button as string, c]));
  const paddle = { label: hints.get('paddles')?.label, mapped: hints.has('paddles') };
  const shift = (side: 'L' | 'R'): Cluster | null => {
    const c = cluster('shift', [[`shiftUp${side}`, '+'], [`shiftDn${side}`, '−']] as Def, hints, `shifters${side}`);
    if (gears && (side === 'L' || !c.mapped || /gear/i.test(c.label ?? '') || c.buttons.filter((b) => b.mapped).every((b) => /gear/i.test(b.label ?? '')))) {
      return { ...c, gears: true, label: 'Gear', mapped: true, buttons: c.buttons.map((b) => ({ ...b, mapped: true, label: undefined, active: undefined })) };
    }
    return c;
  };
  return {
    left: { paddle, shift: shift('L'), stick: cluster('dpad', DPAD, hints, 'dpad') },
    right: { paddle, shift: shift('R'), stick: cluster('face', FACE, hints) },
  };
}
