import { describe, expect, it } from 'vitest';
import { linePixels, pixelViewport, paddleZoom, pinchZoom, rotateRows, squareRows, type ZoomState } from '../render/pixel';
import { ELEMENTS, WEAPON_STYLES, weaponArt, weaponPalette } from '../render/weapons';
import { projectileArt } from '../render/effects';
import { BOSS_ART, frameRows } from '../render/sprites';
import { ART } from '../render/art';
import { makeWeapon, pickWeaponStyle, weaponElement, weaponScore, type Rarity } from '../sim/loot';
import { stanceOfStyle, stylesFor } from '../sim/stances';
import { makeRng } from '../../../core';
describe('shared native pixel grid', () => {
  it('centers long projectile masks before rotation to keep their pivot at the hit position', () => {
    const square = squareRows(['hhhhhhhhhh']);
    expect(square).toHaveLength(10);
    expect(square[4]).toBe('hhhhhhhhhh');
    expect(square.slice(0, 4).every(r => r === '..........')).toBe(true);
    expect(square.slice(5).every(r => r === '..........')).toBe(true);
    expect(rotateRows(square, Math.PI).join('')).toContain('hhhhhhhhhh');
  });
  it('covers portrait, landscape, phones and DPR 2 without fractional display pixels', () => {
    for (const [w, h] of [[1280, 800], [1024, 768], [820, 1180], [390, 844], [844, 390], [2732, 2048]]) {
      const v = pixelViewport(w, h);
      expect(Number.isInteger(v.scale)).toBe(true);
      expect(v.width * v.scale).toBeGreaterThanOrEqual(w);
      expect(v.height * v.scale).toBeGreaterThanOrEqual(h);
      expect(v.width * v.scale - w).toBeLessThan(v.scale);
      expect(v.height * v.scale - h).toBeLessThan(v.scale);
    }
  });
  it('rasterizes arbitrary aim angles into continuous integer pixels', () => {
    for (const [x, y] of [[18, 3], [-4, 17], [1, -18], [-13, -7], [0, 0]]) {
      const pts = linePixels(0, 0, x, y);
      expect(pts[0]).toEqual([0, 0]);
      expect(pts.at(-1)).toEqual([x, y]);
      for (let i = 1; i < pts.length; i++) {
        expect(pts[i].every(Number.isInteger)).toBe(true);
        expect(Math.max(Math.abs(pts[i][0] - pts[i - 1][0]), Math.abs(pts[i][1] - pts[i - 1][1]))).toBe(1);
      }
    }
    const rows = rotateRows(['...h', '..he', '.he.', 'he..'], Math.PI / 4);
    expect(rows.every(r => /^[.he]+$/.test(r))).toBe(true);
    expect(rows.every(r => r.length === rows.length)).toBe(true);
  });
  it('keeps the same actor size and view area when a phone or tablet rotates', () => {
    for (const [w, h] of [[390, 844], [390, 636], [844, 326], [768, 1024], [820, 1180], [1280, 800]]) {
      for (const dpr of [1, 2]) for (const steps of [-1, 0, 1]) {
        const portrait = pixelViewport(w * dpr, h * dpr, steps), landscape = pixelViewport(h * dpr, w * dpr, steps);
        expect(portrait.scale).toBe(landscape.scale);
        expect(portrait.width * portrait.height).toBe(landscape.width * landscape.height);
      }
    }
    expect(pixelViewport(390, 844).scale).toBe(2);
    expect(pixelViewport(844, 326).scale).toBe(2); // landscape with the preview toolbar taking vertical space
  });
  it('either paddle zooms both ways, latches through jitter and stops at the limits', () => {
    for (const side of [0, 1]) {
      let zoom: ZoomState = { steps: 0, held: 0 };
      const input = (value: number) => { zoom = paddleZoom(zoom, 390, 844, side === 0 ? value : 0, side === 1 ? value : 0); };
      input(1); expect(zoom.steps).toBe(1);
      for (const value of [1, .61, .4, .59, .9]) input(value);
      expect(zoom.steps).toBe(1);
      input(0); input(1); expect(zoom.steps).toBe(1); // max, with no hidden accumulated steps
      input(-1); expect(zoom.steps).toBe(0); // reversing direction works without releasing first
      input(-1); expect(zoom.steps).toBe(0);
      input(0); input(-1); expect(zoom.steps).toBe(-1);
      input(0); input(-1); expect(zoom.steps).toBe(-1); // min
      input(1); expect(zoom.steps).toBe(0);
    }
    const together = paddleZoom({ steps: 0, held: 0 }, 390, 844, 1, 1);
    expect(together.steps).toBe(1); // same direction is one step, not two
    expect(paddleZoom(together, 390, 844, 1, -1).steps).toBe(1); // opposing inputs cancel, never reset
    expect(paddleZoom({ steps: 1, held: 0 }, 844, 326, 0, 0).steps).toBe(1); // retain resize preference
  });
  it('pinch spread and contraction change zoom relative to the gesture start without exceeding limits', () => {
    expect(pinchZoom(390, 844, 2, 1.5)).toBe(1);
    expect(pinchZoom(390, 844, 2, .5)).toBe(-1);
    expect(pinchZoom(390, 844, 2, 1)).toBe(0);
    expect(pinchZoom(390, 844, 2, 100)).toBe(1);
    expect(pinchZoom(390, 844, 2, 0)).toBe(-1);
    expect(pinchZoom(390, 844, 2, NaN)).toBe(0);
  });
});
describe('weapon art and modifier identity', () => {
  it('all ten families have three distinct silhouettes and complete palettes in all six modifiers', () => {
    expect(WEAPON_STYLES).toHaveLength(10);
    for (const base of WEAPON_STYLES) {
      const tiers = new Set<string>();
      for (let variant = 0; variant < 3; variant++) for (const element of ELEMENTS) {
        const art = weaponArt({
          base,
          element,
          variant,
          rarity: variant * 2 as Rarity
        });
        expect(art.rows.every(r => r.length === 12), base).toBe(true);
        for (const row of art.rows) for (const ch of row) if (ch !== '.') expect(art.pal[ch], `${base}: ${ch}`).toBeTruthy();
        tiers.add(art.rows.join('\n'));
        for (let frame = 0; frame < 3; frame++) {
          const shot = projectileArt(base, art.pal.e, frame, variant);
          for (const row of shot.rows) for (const ch of row) if (ch !== '.') expect(shot.pal[ch], `${base} projectile: ${ch}`).toBeTruthy();
        }
      }
      expect(tiers.size, base).toBe(3);
    }
  });
  it('offers normal steel loot alongside every element, with neutral family names', () => {
    expect(ELEMENTS).toContain('normal');
    expect(ELEMENTS).toHaveLength(6);
    const rolls = Array.from({
      length: 1000
    }, (_, i) => weaponElement(i / 1000));
    expect(new Set(rolls).size).toBe(6);
    expect(rolls.filter(x => x === 'normal')).toHaveLength(200);
    for (const base of ['flame', 'spark'] as const) for (const rarity of [0, 2, 4] as const) {
      const w = makeWeapon(() => .19, 3, rarity, base);
      expect(w.element).toBe('normal');
      expect(w.name).not.toMatch(/flame|pyre|storm|thunder|tesla/i);
      expect(weaponPalette(w).e).toBe('#b9c5d2');
    }
  });
  it('animates hostile glints, metal and energy without changing the hostile shot footprint', () => {
    for (const style of ['enemy', 'pellet', 'orb', 'flame', 'spark'] as const) {
      const frames = Array.from({
        length: 4
      }, (_, i) => projectileArt(style, style === 'enemy' ? '#ff5a5a' : '#b9c5d2', i));
      expect(new Set(frames.map(f => JSON.stringify(f))).size, style).toBeGreaterThan(1);
      if (style === 'enemy') for (const f of frames) {
        expect(f.rows).toHaveLength(7);
        expect(f.rows.every(r => r.length === 7)).toBe(true);
        expect(f.rows[3][3]).not.toBe('.');
      }
    }
    for (let tier = 0; tier < 3; tier++) {
      const rows = projectileArt('star', '#b9c5d2', 0, tier).rows;
      expect(rows[5][5]).not.toBe('.'); // solid hub, rather than a donut
      expect(rows[0].replaceAll('.', '')).toHaveLength(1); // a sharp north tip
      expect(rows[5].replaceAll('.', '')).toHaveLength(11); // long east/west blades
    }
  });
  it('element, rarity, shrine upgrades and uniques have independent visual meanings', () => {
    const frost = weaponPalette({
        base: 'knife',
        element: 'frost',
        rarity: 2
      }),
      fire = weaponPalette({
        base: 'knife',
        element: 'fire',
        rarity: 2
      }),
      epic = weaponPalette({
        base: 'knife',
        element: 'fire',
        rarity: 3
      });
    expect(frost.e).not.toBe(fire.e);
    expect(frost.t).toBe(fire.t);
    expect(fire.t).not.toBe(epic.t);
    expect(fire.e).toBe(epic.e);
    const plain = weaponArt({
      base: 'knife'
    }).rows;
    expect(weaponArt({
      base: 'knife',
      plus: 2
    }).rows).not.toEqual(plain);
    expect(weaponArt({
      base: 'knife',
      unique: 'homing'
    }).rows).not.toEqual(plain);
  });
  it('all six bosses have native 32px art and authored attack silhouettes', () => {
    expect(new Set(BOSS_ART.map(b => b.art)).size).toBe(6);
    for (const b of BOSS_ART) {
      expect(b.scale).toBe(1);
      expect(ART[b.art].rows).toHaveLength(32);
      expect(frameRows(b.art, 'attack')).not.toEqual(frameRows(b.art));
    }
  });
});
describe('thrown weapon loot', () => {
  it('knives, axes and spears belong to their intended stances and produce usable, deterministic loot', () => {
    for (const [base, stance] of [['knife', 'skirmisher'], ['axe', 'vanguard'], ['spear', 'ranger']] as const) {
      expect(stanceOfStyle(base, false)).toBe(stance);
      expect(stylesFor(stance, false)).toContain(base);
      for (const rarity of [0, 2, 4] as const) {
        const w = makeWeapon(makeRng(19), 3, rarity, base);
        expect(w).toEqual(makeWeapon(makeRng(19), 3, rarity, base));
        expect(w.variant).toBeGreaterThanOrEqual(0);
        expect(w.variant).toBeLessThanOrEqual(2);
        expect(Number.isFinite(weaponScore(w))).toBe(true);
        expect(w.dmg * w.rate * w.count).toBeGreaterThan(0);
        expect(w.speed).toBeGreaterThan(0);
        expect(w.range).toBeGreaterThan(3);
      }
    }
  });
  it('new alternatives share existing family drop weights and every stance style is reachable', () => {
    for (const stance of ['vanguard', 'ranger', 'skirmisher', 'arcanist'] as const) {
      const pool = stylesFor(stance, true),
        seen = new Set(Array.from({
          length: 1000
        }, (_, i) => pickWeaponStyle(pool, i / 1000)));
      expect([...seen].sort()).toEqual([...pool].sort());
    }
    expect(pickWeaponStyle(['pellet', 'flame', 'axe'], .1)).toBe('pellet');
    expect(pickWeaponStyle(['pellet', 'flame', 'axe'], .45)).toBe('axe');
  });
});
