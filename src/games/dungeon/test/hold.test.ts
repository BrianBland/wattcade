import { describe, expect, it } from 'vitest';
import { holdPose } from '../render/hold';
import { heldRows, weaponGrip, WEAPON_STYLES, type WeaponLook } from '../render/weapons';
import { frameRows } from '../render/sprites';

// Mirrors the renderer: hero drawn with feet at y + r·TS·1.1, flipped when aiming left; weapon centered on the pose.
const HX = 100, HY = 100, FEET = Math.round(HY + 0.35 * 16 * 1.1);
function heroPixels(face: number) {
  const out = new Map<string, number>();
  frameRows('hero').forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch !== '.') out.set(`${HX + (face > 0 ? c - 8 : 7 - c)},${FEET - 17 + r}`, r);
  }));
  return out;
}
function weaponPixels(look: WeaponLook, angle: number) {
  const rows = heldRows(look, angle), w = rows[0].length + 2, h = rows.length + 2;
  const p = holdPose(HX, HY, angle, weaponGrip(look));
  const x0 = Math.round(p.x) - Math.floor(w / 2) + 1, y0 = Math.round(p.y) - Math.floor(h / 2) + 1, out: string[] = [];
  rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') out.push(`${x0 + i},${y0 + j}`); }));
  return { pose: p, px: out };
}

describe('held weapon placement', () => {
  const angles = Array.from({ length: 16 }, (_, i) => -Math.PI + i * Math.PI / 8 + 0.01);
  it('keeps every weapon clear of the face and nearly all of the body', () => {
    for (const base of WEAPON_STYLES) for (const variant of [0, 1, 2]) for (const a of angles) {
      const look: WeaponLook = { base, variant, element: 'storm', rarity: 4 };
      const hero = heroPixels(Math.cos(a) >= 0 ? 1 : -1), { pose, px } = weaponPixels(look, a);
      const over = px.filter(k => hero.has(k)), head = over.filter(k => hero.get(k)! <= 7);
      if (pose.behind) continue; // the hero is drawn over it
      expect(head, `${base}/${variant} at ${a.toFixed(2)} covers the face`).toEqual([]);
      // The hand grips the handle at the body's edge; the weapon itself stays outside.
      expect(over.length, `${base}/${variant} at ${a.toFixed(2)} overlaps the body`).toBeLessThanOrEqual(8);
    }
  });
  it('tucks the weapon behind the hero only when aiming away from the camera', () => {
    expect(holdPose(0, 0, -Math.PI / 2, 4).behind).toBe(true);
    expect(holdPose(0, 0, -Math.PI / 4, 4).behind).toBe(true);
    expect(holdPose(0, 0, 0, 4).behind).toBe(false);
    expect(holdPose(0, 0, Math.PI / 2, 4).behind).toBe(false);
  });
  it('holds handled weapons by the handle, out from the facing hand', () => {
    for (const base of WEAPON_STYLES) expect(weaponGrip({ base })).toBe(5);
    const right = holdPose(0, 0, 0, 5), left = holdPose(0, 0, Math.PI, 5);
    expect(right.x).toBeGreaterThan(8);
    expect(left.x).toBeLessThan(-8);
  });
});
