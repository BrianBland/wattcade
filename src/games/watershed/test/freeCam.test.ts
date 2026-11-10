import { describe, expect, it } from 'vitest';
import { project, type V3 } from '../render/camFit';
import { applyFreeCam, easeHome, FreeCamGestures, freeCamActive, freeCamHome, ZOOM_MAX, ZOOM_MIN } from '../render/freeCam';

const FOV = (40 * Math.PI) / 180, W = 1180, H = 820, ASPECT = W / H;
// the two overview cameras: upright (looking up the valley, −X) and sideways (looking across, −Z)
const CAMS: Array<[string, V3, V3]> = [
  ['upright', { x: 120, y: 230, z: 0 }, { x: 8, y: 0, z: 0 }],
  ['sideways', { x: 2, y: 198, z: 112 }, { x: 2, y: 0, z: -12 }],
];

function rig(pos0: V3, tgt0: V3) {
  const f = freeCamHome();
  const cam = () => { const pos = { ...pos0 }, tgt = { ...tgt0 }; applyFreeCam(f, pos, tgt); return { pos, tgt }; };
  let resets = 0;
  const g = new FreeCamGestures(f, () => ({ ...cam(), fovY: FOV, H }), () => { resets++; });
  const px = (p: V3) => { const c = cam(), q = project(p, c.pos, c.tgt, FOV, ASPECT)!; return { x: (q.x + 1) * W / 2, y: (1 - q.y) * H / 2 }; };
  return { f, g, cam, px, resets: () => resets };
}

describe('watershed free camera gestures', () => {
  for (const [name, pos, tgt] of CAMS) {
    it(`${name}: the ground follows a one-finger drag`, () => {
      const r = rig(pos, tgt), p = { x: tgt.x + 6, y: 0, z: tgt.z + 4 };
      const a = r.px(p);
      r.g.down(1, 600, 400, 0); r.g.move(1, 680, 400); r.g.move(1, 680, 460); r.g.up(1, 200);
      const b = r.px(p);
      expect(b.x - a.x).toBeGreaterThan(50); expect(b.x - a.x).toBeLessThan(110);
      expect(b.y - a.y).toBeGreaterThan(35); expect(b.y - a.y).toBeLessThan(90);
      expect(freeCamActive(r.f)).toBe(true);
    });

    it(`${name}: spreading two fingers zooms in, pinching zooms out, within limits`, () => {
      const r = rig(pos, tgt);
      r.g.down(1, 500, 400, 0); r.g.down(2, 600, 400, 0); r.g.move(2, 700, 400);
      expect(r.f.zoom).toBeCloseTo(0.5, 5);
      r.g.move(2, 504, 400);
      expect(r.f.zoom).toBe(ZOOM_MAX);
      for (let k = 0; k < 20; k++) { r.g.move(2, 900, 400); r.g.move(2, 600, 400); r.g.move(2, 1100, 400); }
      expect(r.f.zoom).toBeGreaterThanOrEqual(ZOOM_MIN);
    });

    it(`${name}: the map turns with a two-finger twist`, () => {
      const r = rig(pos, tgt), p = { x: tgt.x + 15, y: 0, z: tgt.z + 15 };
      const ang = (q: { x: number; y: number }, c: { x: number; y: number }) => Math.atan2(q.y - c.y, q.x - c.x);
      const c0 = r.px(tgt), a0 = ang(r.px(p), c0);
      // twist clockwise on screen (y down) by 0.3 rad around (600, 400)
      r.g.down(1, 500, 400, 0); r.g.down(2, 700, 400, 0);
      r.g.move(1, 600 - 100 * Math.cos(0.3), 400 - 100 * Math.sin(0.3));
      r.g.move(2, 600 + 100 * Math.cos(0.3), 400 + 100 * Math.sin(0.3));
      const c1 = r.px(tgt), a1 = ang(r.px(p), c1);
      let d = a1 - a0; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI;
      expect(d).toBeGreaterThan(0.05);   // clockwise on screen too
    });
  }

  it('double-tap resets; a drag or a slow tap does not', () => {
    const r = rig(CAMS[0][1], CAMS[0][2]);
    r.g.down(1, 300, 300, 0); r.g.up(1, 80);
    r.g.down(1, 305, 302, 200); r.g.up(1, 260);
    expect(r.resets()).toBe(1);
    r.g.down(1, 300, 300, 1000); r.g.move(1, 360, 300); r.g.up(1, 1080);
    r.g.down(1, 300, 300, 1200); r.g.up(1, 1260);
    expect(r.resets()).toBe(1);
    r.g.down(1, 300, 300, 2000); r.g.up(1, 2500);
    r.g.down(1, 300, 300, 2600); r.g.up(1, 2650);
    expect(r.resets()).toBe(1);
  });

  it('wheel zooms; easing home returns to the auto camera exactly', () => {
    const r = rig(CAMS[0][1], CAMS[0][2]);
    r.g.wheel(-120); expect(r.f.zoom).toBeLessThan(1);
    r.g.wheel(240); r.g.wheel(240); expect(r.f.zoom).toBeGreaterThan(1);
    r.f.panX = 30; r.f.yaw = 1;
    let home = false;
    for (let i = 0; i < 200 && !home; i++) home = easeHome(r.f, 1 / 60);
    expect(home).toBe(true);
    expect(r.f).toEqual(freeCamHome());
  });

  it('panning stops at the edge of the map but never drags an outside auto target in', () => {
    const f = freeCamHome(); f.panX = 500;
    const pos = { x: 100, y: 100, z: 0 }, tgt = { x: 0, y: 0, z: 0 };
    applyFreeCam(f, pos, tgt, { x0: -80, x1: 90, z0: -55, z1: 55 });
    expect(tgt.x).toBe(90); expect(f.panX).toBe(90);
    const f2 = freeCamHome(), t2 = { x: 160, y: 0, z: 0 };
    applyFreeCam(f2, { x: 200, y: 50, z: 0 }, t2, { x0: -80, x1: 90, z0: -55, z1: 55 });
    expect(t2.x).toBe(160);
  });
});
