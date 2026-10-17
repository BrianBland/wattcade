// World ↔ screen for the single-road field. One uniform scale; landscape turns the field 90° so the turret sits on
// the left and the hive runs off to the right. Every renderer path, tap and dev tool converts through here.
import { FIELD_H, FIELD_W } from '../sim/road';

export interface Pt { x: number; y: number }
/** `x, y`: the field rectangle's top-left on screen; `k`: CSS px per world unit; `turned`: landscape rotation. */
export interface FieldView { x: number; y: number; k: number; turned: boolean }

export function toScreen(v: FieldView, p: Pt): Pt {
  return v.turned ? { x: v.x + (FIELD_H - p.y) * v.k, y: v.y + p.x * v.k } : { x: v.x + p.x * v.k, y: v.y + p.y * v.k };
}
export function toWorld(v: FieldView, s: Pt): Pt {
  return v.turned ? { x: (s.y - v.y) / v.k, y: FIELD_H - (s.x - v.x) / v.k } : { x: (s.x - v.x) / v.k, y: (s.y - v.y) / v.k };
}
/** A world angle (0 = toward the spawn edge, clockwise) as a screen angle (0 = screen up, clockwise). */
export const face = (v: FieldView, a: number): number => (v.turned ? a + Math.PI / 2 : a);
/** The field rectangle on screen. */
export function fieldRect(v: FieldView): { x: number; y: number; w: number; h: number } {
  return v.turned ? { x: v.x, y: v.y, w: FIELD_H * v.k, h: FIELD_W * v.k } : { x: v.x, y: v.y, w: FIELD_W * v.k, h: FIELD_H * v.k };
}
