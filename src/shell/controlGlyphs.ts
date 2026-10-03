import type { ControlHint, ControlTarget } from '../contracts';
import { FACE_COLOR } from './hud/padModel';

const DPAD = '#8a84b8', SHIFT = '#b07cff', PADDLE = '#00f0ff', POWER = '#ffb020';
const G: Partial<Record<ControlTarget, { glyph: string; color: string }>> = {
  a: { glyph: 'A', color: FACE_COLOR.a! }, b: { glyph: 'B', color: FACE_COLOR.b! }, y: { glyph: 'Y', color: FACE_COLOR.y! }, z: { glyph: 'Z', color: FACE_COLOR.z! },
  up: { glyph: '▲', color: DPAD }, down: { glyph: '▼', color: DPAD }, left: { glyph: '◀', color: DPAD }, right: { glyph: '▶', color: DPAD }, dpad: { glyph: '✥', color: DPAD },
  paddles: { glyph: '⇕', color: PADDLE },
  shiftersL: { glyph: 'L±', color: SHIFT }, shiftersR: { glyph: 'R±', color: SHIFT },
  shiftUpL: { glyph: 'L+', color: SHIFT }, shiftDnL: { glyph: 'L−', color: SHIFT }, shiftUpR: { glyph: 'R+', color: SHIFT }, shiftDnR: { glyph: 'R−', color: SHIFT },
  powerUpL: { glyph: 'L⏻', color: POWER }, powerUpR: { glyph: 'R⏻', color: POWER }, onOffL: { glyph: 'L●', color: POWER }, onOffR: { glyph: 'R●', color: POWER },
};

/** Ride-style glyph + colour for a control target. */
export function controlGlyph(t: ControlTarget): { glyph: string; color: string } {
  return G[t] ?? { glyph: String(t).slice(0, 2).toUpperCase(), color: DPAD };
}

/** Intro-card rows: identical labels merged ("▲▼ Move"), the game's `active` hints first, at most `max` rows. */
export function controlRows(hints: readonly ControlHint[], max = 8): Array<{ glyphs: Array<{ glyph: string; color: string }>; label: string; active: boolean }> {
  const rows: Array<{ glyphs: Array<{ glyph: string; color: string }>; label: string; active: boolean }> = [];
  for (const h of hints) {
    const r = rows.find((x) => x.label === h.label);
    if (r) { r.glyphs.push(controlGlyph(h.button)); r.active ||= !!h.active; }
    else rows.push({ glyphs: [controlGlyph(h.button)], label: h.label, active: !!h.active });
  }
  return rows.sort((a, b) => Number(b.active) - Number(a.active)).slice(0, max);
}
