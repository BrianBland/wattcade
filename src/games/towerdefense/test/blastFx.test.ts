import { describe, expect, it } from 'vitest';
import { BALL_FRAMES, BURST_FRAMES, ballFrame, burstFrame, chunkSprite, craterSprite, dither, dustSprite, flashFrame, shellSprite, steps } from '../render/blastTex';
import { fitTexel, snap, stepChunk, texelPx, type Chunk } from '../render/blastFx';

const alphas = (d: Uint8ClampedArray) => { const s = new Set<number>(); for (let i = 3; i < d.length; i += 4) s.add(d[i]); return s; };
const opaque = (d: Uint8ClampedArray) => { let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; };
const colours = (d: Uint8ClampedArray) => { const s = new Set<string>(); for (let i = 0; i < d.length; i += 4) if (d[i + 3]) s.add(`${d[i]},${d[i + 1]},${d[i + 2]}`); return s; };

describe('pixel blast sprites', () => {
  it('are hard-edged pixel art: every pixel fully on or off, from a small posterised palette', () => {
    const all = [ballFrame(0.3), burstFrame(2), flashFrame(1), shellSprite(), dustSprite(3), chunkSprite(4, 'gravel'), chunkSprite(5, 'shrapnel'), craterSprite(2)];
    for (const s of all) {
      expect([...alphas(s.data)].every((a) => a === 0 || a === 255)).toBe(true);
      expect(opaque(s.data)).toBeGreaterThan(0);
    }
    expect(colours(ballFrame(0.5).data).size).toBeLessThanOrEqual(8); // the fire ramp in seven hard steps
    expect(steps(0.49, 4)).toBe(0.5);
    expect(dither(0, 0)).toBeGreaterThan(0); expect(dither(3, 3)).toBeLessThan(1);
  });
  it('rolls the Fireball seamlessly and grows then hollows out its burst', () => {
    expect(Array.from(ballFrame(0).data)).toEqual(Array.from(ballFrame(1).data)); // phase 1 wraps to 0
    expect(Array.from(ballFrame(0).data)).not.toEqual(Array.from(ballFrame(1 / BALL_FRAMES).data));
    const size = Array.from({ length: BURST_FRAMES }, (_, i) => opaque(burstFrame(i).data));
    expect(size[2]).toBeGreaterThan(size[0]);
    const centre = (i: number) => { const s = burstFrame(i), c = (15 * s.w + 15) * 4; return [s.data[c], s.data[c + 1], s.data[c + 3]]; };
    expect(centre(0)[1]).toBeGreaterThan(centre(BURST_FRAMES - 1)[1]); // white-hot heart cools to soot
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
  it('sits every blast on one device-aligned texel grid', () => {
    expect(texelPx(5, 2)).toBe(1.5); expect(texelPx(1, 1)).toBe(1);
    expect(fitTexel(10, 22, 1.5)).toBe(1.5); // never below one texel
    expect(fitTexel(70, 22, 1.5) / 1.5).toBe(2); // whole multiples only
    expect(snap(4.4, 1.5)).toBe(4.5);
  });
});
