import { describe, expect, it } from 'vitest';
import { BALL_FRAMES, BALL_S, BURST_FRAMES, BURST_S, PUFF_HEATS, ballFrame, burstFrame, chunkSprite, craterSprite, dustSprite, flashFrame, puffSprite, shellSprite } from '../render/blastTex';
import { CHUNK_UNIT, puffIndex, stepChunk, type Chunk } from '../render/blastFx';

const alphas = (d: Uint8ClampedArray) => { const s = new Set<number>(); for (let i = 3; i < d.length; i += 4) s.add(d[i]); return s; };
const opaque = (d: Uint8ClampedArray) => { let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; };
const colours = (d: Uint8ClampedArray) => { const s = new Set<string>(); for (let i = 0; i < d.length; i += 4) if (d[i + 3]) s.add(`${d[i]},${d[i + 1]},${d[i + 2]}`); return s; };

describe('painted blast sprites', () => {
  it('are painted at sprite resolution: smooth shading and anti-aliased edges, not a few posterised blocks', () => {
    const all = [ballFrame(0.3), burstFrame(2), flashFrame(1), shellSprite(), dustSprite(3), chunkSprite(4, 'gravel'), chunkSprite(5, 'shrapnel'), craterSprite(2), puffSprite(0.8)];
    for (const s of all) expect(opaque(s.data)).toBeGreaterThan(0);
    expect(colours(ballFrame(0.5).data).size).toBeGreaterThan(200); // continuous heat, not a handful of steps
    expect([...alphas(ballFrame(0.5).data)].some((a) => a > 0 && a < 255)).toBe(true); // soft rim
    expect(BALL_S).toBeGreaterThanOrEqual(32); expect(BURST_S).toBeGreaterThanOrEqual(96);
  });
  it('rolls the Fireball seamlessly and grows then hollows out its burst', () => {
    expect(Array.from(ballFrame(0).data)).toEqual(Array.from(ballFrame(1).data)); // phase 1 wraps to 0
    expect(Array.from(ballFrame(0).data)).not.toEqual(Array.from(ballFrame(1 / BALL_FRAMES).data));
    const size = Array.from({ length: BURST_FRAMES }, (_, i) => opaque(burstFrame(i).data));
    expect(size[2]).toBeGreaterThan(size[0]);
    const centre = (i: number) => { const s = burstFrame(i), c = ((s.h >> 1) * s.w + (s.w >> 1)) * 4; return s.data[c + 1]; };
    expect(centre(0)).toBeGreaterThan(centre(BURST_FRAMES - 1)); // white-hot heart cools to soot
  });
  it('picks a hotter puff for a hotter flame', () => {
    expect(puffIndex(0)).toBe(0); expect(puffIndex(1)).toBe(PUFF_HEATS - 1); expect(puffIndex(0.6)).toBeGreaterThan(puffIndex(0.3));
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
  it('sizes debris in field units: a stone is about half to one unit across', () => {
    for (let i = 1; i < 30; i++) { const c = chunkSprite(i, 'gravel'); expect(c.w * CHUNK_UNIT).toBeGreaterThan(0.4); expect(c.w * CHUNK_UNIT).toBeLessThan(1.2); }
  });
});
