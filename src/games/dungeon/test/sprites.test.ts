import { describe, expect, it } from 'vitest';
import { ART } from '../render/art';
import { BOSS_ART, WEAPON_ART, anim, artChars, frameRows } from '../render/sprites';
import { STANCES } from '../sim/stances';

describe('sprites v2', () => {
  it('every art is square (16 px actors, 32 px own-art bosses) and every frame row matches its width', () => {
    for (const [name, a] of Object.entries(ART)) {
      const w = a.rows[0].length;
      expect([16, 32], name).toContain(w);
      expect(a.rows.length, name).toBe(w);
      for (const st of ['idle', 'walk', 'attack', 'hurt'] as const) for (let i = 0; i < 2; i++) for (const r of frameRows(name, st, i)) expect(r.length, `${name} ${st}`).toBe(w);
    }
  });
  it('uses only palette characters', () => {
    for (const [name, a] of Object.entries(ART)) for (const ch of artChars(name)) expect(Object.keys(a.pal), `${name} '${ch}'`).toContain(ch);
    for (const [name, w] of Object.entries(WEAPON_ART)) for (const r of w.rows) for (const ch of r) if (ch !== '.') expect(Object.keys(w.pal), `${name} '${ch}'`).toContain(ch);
  });
  it('actors have walk and attack frames; bosses map to 32 px art (Bone King and Frost Wyrm have their own)', () => {
    for (const n of ['hero', 'chaser', 'bat', 'spitter', 'archer', 'brute', 'bomber', 'summoner']) {
      expect(ART[n].frames.walk?.length, n).toBeGreaterThanOrEqual(2);
      expect(ART[n].frames.attack?.length, n).toBeGreaterThanOrEqual(1);
    }
    for (const b of BOSS_ART) expect(ART[b.art].rows.length * b.scale).toBe(32);
    expect(BOSS_ART[4].art).toBe('bone_king'); expect(BOSS_ART[5].art).toBe('frost_wyrm');
  });
  it('anim() cycles walk frames over time and falls back to idle when a state has no frames', () => {
    const seen = new Set([0, 0.13, 0.26, 0.39].map((t) => anim('hero', 'walk', t, 8).idx));
    expect(seen.size).toBe(2);
    expect(anim('archer', 'hurt', 0).state).toBe('idle');
  });
  it('every stance weapon style has held-weapon art', () => {
    for (const s of Object.values(STANCES)) for (const st of s.styles) expect(WEAPON_ART[st], st).toBeTruthy();
  });
});
