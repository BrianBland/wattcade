import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PUFF_HEATS, puffSprite } from '../render/blastTex';
import { CHUNK_UNIT, FLAME_REACH_S, FLAME_RECEDE_S, flameFrame, puffIndex, stepChunk, type Chunk } from '../render/blastFx';
import { oneShot, type FxName } from '../render/fxArt';

const alphas = (d: Uint8ClampedArray) => { const s = new Set<number>(); for (let i = 3; i < d.length; i += 4) s.add(d[i]); return s; };
const colours = (d: Uint8ClampedArray) => { const s = new Set<string>(); for (let i = 0; i < d.length; i += 4) if (d[i + 3]) s.add(`${d[i]},${d[i + 1]},${d[i + 2]}`); return s; };

describe('painted flame puffs', () => {
  it('are painted at sprite resolution: smooth shading and anti-aliased edges', () => {
    const p = puffSprite(0.8);
    expect(colours(p.data).size).toBeGreaterThan(40);
    expect([...alphas(p.data)].some((a) => a > 0 && a < 255)).toBe(true);
  });
  it('picks a hotter puff for a hotter flame', () => {
    expect(puffIndex(0)).toBe(0); expect(puffIndex(1)).toBe(PUFF_HEATS - 1); expect(puffIndex(0.6)).toBeGreaterThan(puffIndex(0.3));
  });
});

describe('painted fx strips', () => {
  const root = new URL('../../../../public/td/fx/', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8')) as Record<string, { w: number; h: number; n: number }>;
  it('ships every strip the renderer draws, with its frames', () => {
    const used: FxName[] = ['flame-start', 'flame-sustain', 'flame-out', 'fireball-ball', 'fireball-trail', 'fireball-impact', 'mortar-shell',
      'mortar-impact', 'mortar-crater', 'mortar-gravel', 'mortar-shrapnel', 'ignite-burst', 'ember', 'ground-flare',
      'ground-tuft-0', 'ground-tuft-1', 'ground-tuft-2', 'ground-tuft-3', 'ground-dying-0', 'ground-dying-1', 'ground-dying-2', 'ground-dying-3'];
    for (const n of used) {
      expect(manifest[n], n).toBeDefined();
      expect(manifest[n].n).toBeGreaterThan(0);
      expect(existsSync(new URL(`${n}.webp`, root)), n).toBe(true);
    }
    expect(manifest['flame-start'].n).toBe(6); expect(manifest['flame-out'].n).toBe(6);
    expect(manifest['flame-sustain']).toMatchObject({ w: 224, h: 300 }); // mouth at the left edge's middle
  });
  it('plays a one-shot through once at its frame rate', () => {
    expect(oneShot(0, 20, 10)).toBe(0); expect(oneShot(0.26, 20, 10)).toBe(5);
    expect(oneShot(0.5, 20, 10)).toBeNull(); expect(oneShot(-0.1, 20, 10)).toBeNull();
  });
});

describe('Flamethrower bursts', () => {
  it('race out from the mouth, hold on the sustain loop while firing, then recede back into the mouth', () => {
    expect(flameFrame(0, 1.4)).toEqual({ name: 'flame-start', i: 0 });
    expect(flameFrame(FLAME_REACH_S * 0.6, 1.4)!.name).toBe('flame-start');
    const hold = [0.5, 0.8, 1.1].map((t) => flameFrame(t, 1.4)!);
    for (const h of hold) expect(h.name).toBe('flame-sustain');
    expect(new Set(hold.map((h) => h.i)).size).toBeGreaterThan(1); // the loop animates
    expect(flameFrame(1.4 + FLAME_RECEDE_S * 0.25, 1.4)).toEqual({ name: 'flame-out', i: 1 });
    expect(flameFrame(1.4 + FLAME_RECEDE_S + 0.01, 1.4)).toBeNull();
    expect(flameFrame(-0.1, 1.4)).toBeNull();
    for (let t = 0; t < 1.4; t += 0.013) expect(flameFrame(t, 1.4)!.i).toBeLessThan(12);
  });
});

describe('thrown debris', () => {
  const chunk = (): Chunk => ({ x: 0, y: 0, z: 0.1, vx: 10, vy: 0, vz: 30, age: 0, life: 3, spr: 0, metal: true, hot: 1, bounces: 0, px: 0, py: 0 });
  it('arcs up, lands, bounces lower and comes to rest on the ground', () => {
    const c = chunk(); let peak = 0, firstLand = -1;
    for (let i = 0; i < 300; i++) { stepChunk(c, 1 / 60, 90); peak = Math.max(peak, c.z); if (firstLand < 0 && c.bounces) firstLand = i; }
    expect(peak).toBeGreaterThan(4);
    expect(firstLand).toBeGreaterThan(10);
    expect(c.bounces).toBe(3); expect(c.z).toBe(0); expect(c.vx).toBe(0);
    expect(c.hot).toBe(0); // shrapnel cools from hot orange
    const x = c.x; stepChunk(c, 1 / 60, 90); expect(c.x).toBe(x);
  });
  it('sizes debris in field units: a painted stone (about 24 px of its 40 px frame) is about one unit across', () => {
    expect(24 * CHUNK_UNIT).toBeGreaterThan(0.5); expect(32 * CHUNK_UNIT).toBeLessThan(1.3);
  });
});
