// Evening, 1:31 — the obsidian bridge: a bike-width ribbon of black glass arching over a crusted lava river in a vast
// cavern; magma fish leaping; glyph columns glowing at the far end.
import * as THREE from 'three';
import { VoxelGrid } from '../../voxel/grid';
import { noise2, fbm } from '../../voxel/noise';
import { makeStage, type Stage } from '../stage';
import { L, fillBox, addLit, addGlow, fpBars, rnd } from './kit';

const LAVA_Y = -28;
const bridgeY = (z: number) => 2.6 * Math.sin((Math.PI * (4 - z)) / 170);
const bankY = (x: number, z: number) => { const out = Math.max(0, Math.abs(x) - 78 - 12 * fbm(z / 30, x / 30, 2, 70)); return LAVA_Y - 1.5 + out * 0.9 + (out > 0 ? 3 * fbm(x / 12, z / 12, 3, 71) : 0); };

export function stillLava(canvas: HTMLCanvasElement, w: number, h: number): Stage {
  const st = makeStage(canvas, w, h, {
    zenith: 0x0a0406, horizon: 0x2a0d08, fog: 0x4a1a0a, fogDensity: 0.0075, sunDir: new THREE.Vector3(0.25, -1, 0.35), sunColor: 0xff8a3a, sunI: 1.6,
    hemiSky: 0x40203a, hemiGround: 0xff7a2a, hemiI: 1.5,
  });
  st.sun.castShadow = false;

  // cavern walls, banks, stalactites (coarse) + the lava river (crust lit, molten parts glowing)
  const s = 0.6, rock = new VoxelGrid(s), lava = new VoxelGrid(s);
  const C = [0, 10, -80], RX = 115, RY = 52, RZ = 150;
  fillBox(rock, [-120, LAVA_Y - 2, -235], [120, 64, 30], (x, y, z) => {
    const e = ((x - C[0]) / RX) ** 2 + ((y - C[1]) / RY) ** 2 + ((z - C[2]) / RZ) ** 2;
    if (e > 1.35 || (e < 0.7 && y > LAVA_Y + 16 && y < 18)) return 0; // far outside, or open air: skip the noise
    const n = fbm(x / 14 + 3, y / 14 + z / 20, 3, 72);
    const q = Math.sqrt(e) * (1 + (n - 0.5) * 0.25);
    const by = bankY(x, z);
    if (y < by) return y > by - 2.5 ? (n < 0.4 ? L.basalt3 : n < 0.7 ? L.basalt : L.basalt2) : 0;
    if (q > 1 && q < 1.06) return n < 0.35 ? L.basalt3 : n < 0.7 ? L.basalt : L.basalt2;
    // stalactites
    const cx = Math.round(x / 9) * 9, cz = Math.round(z / 9) * 9, r0 = rnd(cx, cz, 73);
    if (r0 < 0.35 && y > 18) {
      const ceil = C[1] + RY * Math.sqrt(Math.max(0, 1 - ((cx - C[0]) / RX) ** 2 - ((cz - C[2]) / RZ) ** 2)), len = 6 + r0 * 30;
      const t = (ceil - y) / len, rad = 2.6 * (1 - t);
      if (t > 0 && t < 1 && Math.hypot(x - cx, z - cz) < rad) return n < 0.5 ? L.basalt2 : L.basalt;
    }
    return 0;
  });
  fillBox(lava, [-100, LAVA_Y - 1.2, -230], [100, LAVA_Y + 0.6, 25], (x, y, z) => {
    if (bankY(x, z) > LAVA_Y) return 0;
    const top = LAVA_Y + s * 0.5; // one flat layer: crust and molten share the same height, so crust never hides lava
    if (y > top || y < top - s) return 0;
    const cell = noise2(x / 5.5, z / 7, 74), crack = Math.abs(cell - 0.5) < 0.07;
    if (!crack && cell > 0.6 && y > top - s) { rock.set(rock.vi(x, 0), rock.vi(y, 1), rock.vi(z, 2), cell > 0.68 ? L.crust : L.crust2); return 0; }
    return crack ? L.lavaHot : cell < 0.32 ? L.lava : L.lava2;
  });
  addLit(st, 'cavern + crust', rock, 0.1, { cast: false, receive: false });
  addGlow(st, 'lava', lava, 1.7);

  // the bridge: black glass, a violet sheen on its edges, thin piers into the lava with glowing cracks
  const b = new VoxelGrid(0.12), bglow = new VoxelGrid(0.12);
  fillBox(b, [-1.1, -2.5, -170], [1.1, 3.5, 6], (x, y, z) => {
    const top = bridgeY(z), hw = 0.85 + 0.08 * Math.sin(z * 0.6);
    if (Math.abs(x) > hw || y > top || y < top - 0.55 - 0.35 * (1 - (x / hw) ** 2)) return 0;
    if (y > top - 0.13 && Math.abs(x) > hw - 0.14) return L.obsidianEdge;
    return rnd(Math.round(x * 8), Math.round(y * 8), Math.round(z * 8)) < 0.6 ? L.obsidian : L.obsidian2;
  });
  for (let z = -22; z > -170; z -= 31) {
    const top = bridgeY(z) - 0.6;
    for (let y = top; y > LAVA_Y - 1; y -= 0.12) {
      const r = 0.55 + (top - y) * 0.03;
      for (let a = 0; a < Math.PI * 2; a += 0.12) {
        const x = Math.cos(a) * r, zz = z + Math.sin(a) * r;
        const crackA = Math.abs(Math.sin(a * 3 + y * 0.7)) < 0.06;
        (crackA ? bglow : b).set(b.vi(x, 0), b.vi(y, 1), b.vi(zz, 2), crackA ? L.ember : L.basalt);
      }
    }
  }
  // glyph columns lining the last stretch, and the gate wall beyond
  const gz = -150;
  for (let z = -112; z > gz; z -= 9) for (const sx of [-1, 1]) {
    const x = sx * 2.4, base = bridgeY(z) - 3;
    b.wbox([x - 0.45, base, z - 0.45], [x + 0.45, base + 9, z + 0.45], L.basalt2);
    for (let k = 0; k < 6; k++) if (rnd(Math.round(z), k, sx + 80) < 0.7) bglow.wbox([x - 0.18 - sx * 0.3, base + 2 + k * 1.1, z - 0.18], [x + 0.18 - sx * 0.3, base + 2.5 + k * 1.1, z + 0.18], k % 2 ? L.glyph : L.glyph2);
  }
  b.wbox([-14, bridgeY(gz) - 6, gz - 1.5], [14, bridgeY(gz) + 22, gz], L.basalt3);
  for (let i = 0; i < 70; i++) { const x = -12 + rnd(i, 1, 81) * 24, y = bridgeY(gz) - 2 + rnd(i, 2, 81) * 20; if (Math.abs(x) < 2.5 && y < bridgeY(gz) + 5) continue; bglow.wbox([x - 0.3, y - 0.3, gz + 0.05], [x + 0.3, y + 0.3, gz + 0.2], rnd(i, 3, 81) < 0.7 ? L.glyph : L.glyph2); }
  addLit(st, 'bridge + piers + columns', b, 0.06, { cast: false, receive: false });
  addGlow(st, 'glyphs + pier cracks', bglow, 1.8);

  // magma fish mid-leap with dripping trails, and embers drifting up
  const fish = new VoxelGrid(0.1);
  const leap = (x0: number, z0: number, x1: number, z1: number, hgt: number, k: number, len: number, seed: number) => {
    const p = (t: number) => [x0 + (x1 - x0) * t, LAVA_Y + 4 * hgt * t * (1 - t), z0 + (z1 - z0) * t];
    const at = p(k), ahead = p(Math.min(1, k + 0.02)), dir = new THREE.Vector3(ahead[0] - at[0], ahead[1] - at[1], ahead[2] - at[2]).normalize();
    for (let i = 0; i < 14; i++) { const t = i / 13 - 0.5, r = len * 0.17 * Math.cos(t * Math.PI * 0.95) + 0.05; fish.wellipsoid([at[0] + dir.x * t * len, at[1] + dir.y * t * len, at[2] + dir.z * t * len], [r, r, r], i > 10 ? L.lavaHot : i % 3 ? L.magma : L.magma2); }
    for (let j = 1; j < 30; j++) { const tt = Math.max(0, k - j * 0.012); const q = p(tt); fish.wellipsoid([q[0] + (rnd(j, seed, 82) - 0.5), q[1] - j * 0.05, q[2] + (rnd(j, seed, 83) - 0.5)], [0.08 + 0.12 * (1 - j / 30), 0.08, 0.08], j % 2 ? L.lava2 : L.ember); }
  };
  leap(-16, -26, -6, -40, 14, 0.42, 2.4, 1); leap(18, -48, 10, -34, 18, 0.55, 3.0, 2); leap(-24, -70, -14, -80, 20, 0.5, 2.8, 3); leap(9, -95, 20, -105, 16, 0.3, 2.6, 4);
  for (let i = 0; i < 160; i++) { const e = [(rnd(i, 1, 84) - 0.5) * 60, LAVA_Y + 2 + rnd(i, 2, 84) * 30, -rnd(i, 3, 84) * 140]; fish.wbox(e, e.map((v) => v + 0.12), L.ember); }
  addGlow(st, 'magma fish + embers', fish, 2.2);

  for (const [x, z] of [[-10, -30], [12, -45], [0, -80], [-15, -110]]) { const pl = new THREE.PointLight(0xff7a2a, 40, 60, 1.4); pl.position.set(x, LAVA_Y + 6, z); st.scene.add(pl); }
  st.camera.fov = 72; st.camera.updateProjectionMatrix();
  st.camera.position.set(0.15, bridgeY(4) + 1.55, 4);
  st.camera.lookAt(-0.6, -11, -70);
  fpBars(st);
  return st;
}
