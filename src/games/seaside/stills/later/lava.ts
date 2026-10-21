// Evening, 1:31 — the obsidian bridge: a bike-width ribbon of black glass arching over a crusted lava river in a vast
// cavern; magma fish leaping; glyph columns glowing at the far end.
import * as THREE from 'three';
import { VoxelGrid } from '../../voxel/grid';
import { noise2, fbm } from '../../voxel/noise';
import { makeStage, type Stage } from '../stage';
import { L, fillBox, addLit, addGlow, fpBars, rnd, glyphTexture, glyphDecal, Particles, setGlow, wob } from './kit';

const LAVA_Y = -28;
const bridgeY = (z: number) => 2.6 * Math.sin((Math.PI * (4 - z)) / 170);
const bankY = (x: number, z: number) => { const out = Math.max(0, Math.abs(x) - 78 - 12 * fbm(z / 30, x / 30, 2, 70)); return LAVA_Y - 1.5 + out * 0.9 + (out > 0 ? 3 * fbm(x / 12, z / 12, 3, 71) : 0); };

export function stillLava(canvas: HTMLCanvasElement, w: number, h: number): Stage {
  const st = makeStage(canvas, w, h, {
    zenith: 0x0a0406, horizon: 0x2a0d08, fog: 0x4a1a0a, fogDensity: 0.0075, sunDir: new THREE.Vector3(0.25, -1, 0.35), sunColor: 0xff8a3a, sunI: 1.6,
    hemiSky: 0x40203a, hemiGround: 0xff6a1a, hemiI: 2.0,
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
  const lavaGrp = addGlow(st, 'lava', lava, 2.4);

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
    // a strip of painted glyphs down the face of the column that looks at the path
    const d = glyphDecal(glyphTexture(1, 6, Math.round(z) * 3 + sx), 0.8, 4.8, 2.4);
    d.position.set(x - sx * 0.46, base + 5, z); d.rotation.y = -sx * Math.PI / 2; st.scene.add(d);
  }
  b.wbox([-14, bridgeY(gz) - 6, gz - 1.5], [14, bridgeY(gz) + 22, gz], L.basalt3);
  // the gate: one great painted inscription, a ring of symbols around a doorway-shaped panel
  const gate = glyphDecal(glyphTexture(12, 10, 7), 24, 20, 2.0);
  gate.position.set(0, bridgeY(gz) + 9, gz + 0.02); st.scene.add(gate);
  addLit(st, 'bridge + piers + columns', b, 0.06, { cast: false, receive: false });
  addGlow(st, 'glyphs + pier cracks', bglow, 1.8);

  // magma fish: one voxel model, several instances that leap on looping arcs (see tick); embers + drips are particles
  const fishG = new VoxelGrid(0.1);
  // a long magma eel (head at +x): dark cooled-crust bands over white-hot seams so its silhouette reads against the lava
  for (let i = 0; i <= 70; i++) {
    const u = i / 70, x = (u - 0.6) * 4.6, r = 0.4 * Math.sin(Math.PI * Math.min(1, 0.15 + u * 0.95)) + 0.07;
    const band = Math.floor(u * 9) % 3 === 0; // narrow cooled bands over a bright molten body
    fishG.wellipsoid([x, Math.sin(u * 7) * 0.12, 0], [0.14, r, r * 0.9], u > 0.9 ? L.lavaHot : band ? L.ember : u % 0.22 < 0.11 ? L.magma : L.lava2);
    fishG.wellipsoid([x, Math.sin(u * 7) * 0.12 - r * 0.45, 0], [0.09, r * 0.45, r * 0.6], L.lavaHot); // glowing belly seam
    if (i % 6 === 0) fishG.wellipsoid([x, Math.sin(u * 7) * 0.12 + r * 0.85, 0], [0.06, 0.1, 0.05], L.magma2); // dorsal sparks
  }
  for (const sz of [-1, 1]) fishG.wellipsoid([1.95, 0.08, sz * 0.18], [0.07, 0.07, 0.04], L.lavaHot); // eyes
  for (let k = 0; k <= 5; k++) fishG.wellipsoid([-2.75 - k * 0.06, (k - 2.5) * 0.14, 0], [0.08, 0.08, 0.06], L.lava2); // tail fin
  // [x0, z0, x1, z1, height, period, phase, airborne fraction] — high leaps; two of them vault the bridge side to side
  const LEAPS = [
    [-14, -22, -4, -34, 22, 3.6, 0.0, 0.6], [16, -46, 6, -32, 26, 4.2, 1.6, 0.6], [-22, -60, -10, -70, 28, 4.0, 2.8, 0.6], [10, -78, 20, -90, 24, 3.4, 0.7, 0.6],
    [-30, -18, 30, -27, 40, 6.0, 0.3, 0.55], // over the bridge, left → right
    [32, -34, -32, -40, 44, 7.0, 3.4, 0.55], // and back, right → left
  ];
  const fishes = LEAPS.map(() => { const grp = new THREE.Group(); const inner = new THREE.Group(); inner.scale.setScalar(2.6); grp.add(inner); addGlow(st, 'magma fish', fishG, 2.2, inner); st.scene.add(grp); return grp; });
  const drips = new Particles(st, 400, { intensity: 2.4 }), embers = new Particles(st, 220, { intensity: 2.2 });

  // the lava lights the cavern: a grid of warm lights just above the surface, plus a glow under the bridge
  for (let x = -60; x <= 60; x += 30) for (let z = 10; z >= -200; z -= 35) { const pl = new THREE.PointLight(0xff6a1a, 260, 95, 1.3); pl.position.set(x, LAVA_Y + 4, z); st.scene.add(pl); }
  const under = new THREE.PointLight(0xff8a3a, 60, 25, 1.2); under.position.set(0, LAVA_Y + 10, -20); st.scene.add(under);
  st.camera.fov = 72; st.camera.updateProjectionMatrix();
  st.camera.position.set(0.15, bridgeY(4) + 1.55, 4);
  st.camera.lookAt(-0.6, -11, -70);
  fpBars(st);

  st.duration = 8;
  const arc = (L: number[], u: number) => [L[0] + (L[2] - L[0]) * u, LAVA_Y + 4 * L[4] * u * (1 - u) - 0.5, L[1] + (L[3] - L[1]) * u];
  st.tick = (t) => {
    const z = 4 - 1.1 * t;
    st.camera.position.set(0.15, bridgeY(z) + 1.55 + 0.01 * Math.sin(t * 9), z);
    setGlow(lavaGrp, 1 + 0.12 * wob(t * 0.6, 1)); // the whole lake breathes
    let nd = 0;
    LEAPS.forEach((Lp, i) => { // each fish: leap (period × 0.55), then hidden under the crust
      const per = Lp[5], ph = ((t + Lp[6]) % per) / per, u = ph / Lp[7], g = fishes[i];
      g.visible = u <= 1;
      if (!g.visible) return;
      const p = arc(Lp, u), q = arc(Lp, Math.min(1, u + 0.02));
      g.position.set(p[0], p[1], p[2]); g.lookAt(q[0], q[1], q[2]); g.rotateY(-Math.PI / 2); g.rotateX(Math.sin(t * 6 + i) * 0.35); g.rotateY(Math.sin(t * 9 + i) * 0.18); // writhing
      for (let k = 1; k < 26 && nd < 400; k++) { const uu = u - k * 0.012; if (uu < 0) break; const d = arc(Lp, uu); drips.set(nd++, [d[0] + (rnd(k, i, 150) - 0.5) * 0.8, d[1] - k * 0.07 - (t * 3 % 1) * 0.1, d[2] + (rnd(k, i, 151) - 0.5) * 0.8], 0.22 * (1 - k / 26) + 0.06, k % 2 ? L.lava2 : L.ember); }
      if (u > 0.92 || u < 0.06) for (let k = 0; k < 18 && nd < 400; k++) { const a = rnd(k, i, 152) * Math.PI * 2, rr = 0.4 + rnd(k, i, 153) * 1.6; drips.set(nd++, [p[0] + Math.cos(a) * rr, LAVA_Y + 0.3 + rnd(k, i, 154) * 2.5, p[2] + Math.sin(a) * rr * 2], 0.28, L.lavaHot); } // splash
    });
    drips.commit(nd);
    for (let i = 0; i < 220; i++) { const x = (rnd(i, 1, 155) < 0.5 ? -1 : 1) * (7 + rnd(i, 6, 155) * 30), /* never over the bridge */ zz = 6 - rnd(i, 2, 155) * 150, rise = 1.5 + rnd(i, 3, 155) * 2, h = 34; embers.set(i, [x + Math.sin(t + i) * 0.8, LAVA_Y + 1 + ((t * rise + rnd(i, 4, 155) * h) % h), zz], 0.22 + 0.1 * Math.sin(t * 6 + i), i % 4 ? L.ember : L.lava2); }
    embers.commit(220);
  };
  return st;
}
