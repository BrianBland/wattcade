// Chapter 3b in the voxel world (#193), driven from the cavern set: the painted glyphs on the stones by the causeway
// and on the gate (glowing paint, brightening as you come up on them), the bars unfolding into the drill again at the
// wall, Drill II (the bit spinning with your cadence into basalt, obsidian that throws sparks, a geode's crystals),
// the cracks spidering out and the tunnel tilting in its last minute, the floor dropping away, and the fall: rubble
// alongside you, then black, and a white dot dead ahead that grows into the Earth.
import * as THREE from 'three';
import { GATE_LAYERS, layerAt } from '../sim/belly';
import type { SeasideSnapshot } from '../sim/types';
import { addGlow, addLit, glyphDecal, glyphTexture, L, Particles, rnd, wob } from '../stills/later/kit';
import { buildBit, buildDrillRig, CHUCK } from '../world/bellyProps';
import { BRIDGE_Y, cx, GATE, GATE_TUNNEL_R, GATE_U, gateAxis, glyphPanel, GLYPH_STONES } from '../world/cavernLayout';
import { buildGateCracks, buildGateFace, buildGateTunnel, FLOOR_HOLE } from '../world/gateProps';
import type { CavernShot } from './cavernShots';
import { disposeSet } from './dispose';
import type { V3 } from './morningShots';
import type { WorldView } from './worldView';

const NONE = { cast: false, receive: false };
const CHIPS = 90, SPARKS = 160, RUBBLE = 60;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
export const GATE_SCENES = new Set(['toGate', 'drill2', 'fall']);

/** A painted Earth (equirectangular canvas: oceans, land, desert, ice caps) and its clouds. */
function earthTextures(): { ground: THREE.CanvasTexture; clouds: THREE.CanvasTexture } {
  const W = 512, H = 256, mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const g0 = mk(), c0 = mk(), g = g0.getContext('2d')!, c = c0.getContext('2d')!;
  const img = g.createImageData(W, H), cl = c.createImageData(W, H);
  const n = (x: number, y: number, s: number) => { // cheap wrapped value noise, a few octaves
    let v = 0, a = 0.5, f = 1;
    for (let o = 0; o < 4; o++, a *= 0.5, f *= 2) {
      const X = x * f * 6, Y = y * f * 3, ix = Math.floor(X), iy = Math.floor(Y), fx = X - ix, fy = Y - iy, P = 6 * f;
      const h = (i: number, j: number) => rnd(((i % P) + P) % P, j, s + o);
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      v += a * ((h(ix, iy) * (1 - sx) + h(ix + 1, iy) * sx) * (1 - sy) + (h(ix, iy + 1) * (1 - sx) + h(ix + 1, iy + 1) * sx) * sy);
    }
    return v / 0.9375;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H, lat = Math.abs(v - 0.5) * 2, h = n(u, v, 300), i = (y * W + x) * 4;
    const col = lat > 0.86 ? [242, 246, 250] : h > 0.56 ? (n(u * 2, v * 2, 301) > 0.55 && lat < 0.5 ? [216, 184, 120] : h > 0.64 ? [122, 166, 74] : [79, 154, 58]) : h > 0.53 ? [63, 166, 214] : [31 + 12 * h, 95 + 20 * h, 184 + 20 * h];
    img.data.set([col[0], col[1], col[2], 255], i);
    const k = n(u * 1.7 + 0.3, v * 1.7, 302), a = Math.max(0, Math.min(1, (k - 0.55) * 5));
    cl.data.set([255, 255, 255, Math.round(a * 235)], i);
  }
  g.putImageData(img, 0, 0); c.putImageData(cl, 0, 0);
  const t = (cv: HTMLCanvasElement) => { const x = new THREE.CanvasTexture(cv); x.colorSpace = THREE.SRGBColorSpace; return x; };
  return { ground: t(g0), clouds: t(c0) };
}

export class GateSet {
  private root = new THREE.Group();
  private decals: Array<{ m: THREE.Mesh; u: number; base: number }> = [];
  private rig = new THREE.Group(); private bit = new THREE.Group(); private spin = new THREE.Group();
  private lamp = new THREE.SpotLight(0xfff0d8, 0, 9, 0.6, 0.6, 1.2);
  private hot = new THREE.PointLight(0xffb060, 0, 3, 1.6);
  private crackLight = new THREE.PointLight(0xff5a10, 0, 6, 1.5);
  private tunnel = new THREE.Group(); private floor = new THREE.Group();
  private faces: THREE.Group[] = []; private cracks: THREE.Group[] = [];
  private sparks: Particles; private chips: Particles; private rubble: Particles;
  private earth = new THREE.Group(); private dot: THREE.Mesh; private earthMats: THREE.MeshBasicMaterial[] = [];
  private spinA = 0;
  private cam = new THREE.PerspectiveCamera();
  private v = new THREE.Vector3(); private zAxis = new THREE.Vector3(0, 0, 1);

  constructor(private view: WorldView) {
    const st = view.stage;
    // painted glyphs: a few shared inscriptions, one material each so they can brighten on their own
    const strips = Array.from({ length: 6 }, (_, i) => glyphTexture(1, 6, 11 + i)), patches = Array.from({ length: 6 }, (_, i) => glyphTexture(2, 2, 31 + i));
    GLYPH_STONES.forEach((s, i) => {
      const p = glyphPanel(s), m = glyphDecal((s.kind === 'column' ? strips : patches)[i % 6], p.w, p.h, 1);
      m.position.set(p.x, p.y, p.z); m.rotation.y = p.facing * Math.PI / 2;
      this.decals.push({ m, u: s.u, base: s.kind === 'column' ? 1.6 : 2.2 }); this.root.add(m);
    });
    // the gate's inscription, with the bore's mouth cut out of it (the face being drilled shows through)
    const gw = GATE.half * 2 - 1.6, gh = GATE.h + GATE.arch - 1.2, gate = glyphDecal(glyphTexture(12, 10, 7), gw, gh, 1), gy = BRIDGE_Y + 0.2 + gh / 2;
    const shape = new THREE.Shape().moveTo(-gw / 2, -gh / 2).lineTo(gw / 2, -gh / 2).lineTo(gw / 2, gh / 2).lineTo(-gw / 2, gh / 2).closePath();
    shape.holes.push(new THREE.Path().absarc(0, gateAxis().y - gy, GATE_TUNNEL_R + 0.5, 0, Math.PI * 2, true));
    const geo = new THREE.ShapeGeometry(shape, 24), uv = geo.attributes.uv, pos = geo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / gw + 0.5, pos.getY(i) / gh + 0.5);
    gate.geometry.dispose(); gate.geometry = geo;
    gate.position.set(cx(GATE_U), gy, -GATE_U + 0.03);
    this.decals.push({ m: gate, u: GATE_U, base: 1.8 }); this.root.add(gate);
    // the drill: rig on the camera (in place of the bars), bit aimed at the face every frame
    addLit(st, 'gate drill', buildDrillRig(), 0.04, NONE, this.rig);
    addLit(st, 'gate bit', buildBit(), 0.03, NONE, this.spin);
    this.bit.add(this.spin); this.bit.position.set(...CHUCK); this.rig.add(this.bit);
    this.lamp.position.set(0, 0.02, -0.2); this.rig.add(this.lamp, this.lamp.target);
    this.rig.visible = false; st.camera.add(this.rig);
    // the bore through the gate
    const A = gateAxis();
    this.tunnel.position.set(A.x, A.y, A.z);
    const walls = buildGateTunnel('walls'), floor = buildGateTunnel('floor');
    addLit(st, 'gate tunnel', walls.lit, 0.06, NONE, this.tunnel); addGlow(st, 'geode crystals', walls.glow, 2.2, this.tunnel);
    addLit(st, 'gate tunnel floor', floor.lit, 0.06, NONE, this.floor); this.tunnel.add(this.floor);
    GATE_LAYERS.forEach((l, i) => {
      const g = new THREE.Group(), f = buildGateFace(i);
      addLit(st, `${l.id} face`, f.lit, 0.06, NONE, g); if (l.id === 'geode') addGlow(st, `${l.id} face crystals`, f.glow, 2.2, g);
      this.faces.push(g); this.tunnel.add(g);
    });
    for (let k = 0; k < 3; k++) { const g = new THREE.Group(); addGlow(st, `gate cracks ${k}`, buildGateCracks(k), 2.4, g); g.visible = false; this.cracks.push(g); this.tunnel.add(g); }
    this.tunnel.add(this.hot, this.crackLight);
    this.root.add(this.tunnel);
    this.sparks = new Particles(st, SPARKS, { intensity: 2.6, parent: this.root });
    this.chips = new Particles(st, CHIPS, { lit: true, parent: this.root });
    this.rubble = new Particles(st, RUBBLE, { intensity: 0.5, parent: this.root });
    // the Earth, in camera space straight ahead: a point of white light first, then the planet
    const tex = earthTextures(), mat = (o: THREE.MeshBasicMaterialParameters) => { const m = new THREE.MeshBasicMaterial({ fog: false, depthTest: false, depthWrite: false, ...o }); this.earthMats.push(m); return m; };
    const ground = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), mat({ map: tex.ground }));
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.012, 48, 32), mat({ map: tex.clouds, transparent: true }));
    const air = new THREE.Mesh(new THREE.SphereGeometry(1.06, 48, 32), mat({ color: 0x5ab8ff, transparent: true, opacity: 0.35, side: THREE.BackSide, blending: THREE.AdditiveBlending }));
    this.dot = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), mat({ color: new THREE.Color(5, 5, 5), transparent: true }));
    ground.rotation.set(0.5, 2.2, 0.2); clouds.rotation.copy(ground.rotation);
    this.earth.add(ground, clouds, air); this.earth.renderOrder = 5;
    [ground, clouds, air, this.dot].forEach((m, i) => { m.renderOrder = 5 + i; m.frustumCulled = false; });
    this.earth.visible = this.dot.visible = false;
    st.camera.add(this.earth, this.dot);
    this.root.visible = false;
    st.scene.add(this.root);
  }

  /** Pose the gate's props for this frame. Returns a camera shake offset (m) for the eye (the floor shuddering). */
  update(snap: SeasideSnapshot, shot: CavernShot, pose: { eye: V3; target: V3 }, t: number, dt: number, cadence: number): V3 {
    const fx = shot.fx.gate, eye = pose.eye, uEye = -eye.z;
    const on = GATE_SCENES.has(snap.sceneId);
    this.root.visible = on || uEye > GATE_U - 500;
    // glyphs: dim far off, bright as you come up on them, a slow fade once behind; only once the causeway starts
    for (const d of this.decals) {
      const ahead = d.u - uEye, k = ahead > 0 ? 1 - ease(clamp01((ahead - 15) / 160)) : 1 - 0.6 * ease(clamp01(-ahead / 60));
      d.m.visible = on && ahead > -80;
      (d.m.material as THREE.MeshBasicMaterial).color.setScalar(d.base * (0.35 + 0.65 * k) * (0.92 + 0.08 * Math.sin(t * 1.3 + d.u)) * (fx?.fall ? 1 - fx.fall.black : 1));
    }
    const unfold = fx?.unfold ?? 0, d = fx?.drill ?? null, crack = fx?.crack ?? 0, fall = fx?.fall ?? null;
    // the drill rig rises into the hands as the bars sink
    this.rig.visible = on && unfold > 0;
    this.rig.position.set(0, this.view.handsY * (0.66 / 0.46) + 0.05 - 0.6 * (1 - ease(unfold)), -0.66);
    this.bit.visible = unfold > 0.55;
    const depth = d?.depth ?? (fall ? GATE_LAYERS.reduce((a, l) => a + l.m, 0) : 0);
    const layer = d ? d.layer : fall ? GATE_LAYERS.length - 1 : 0, L0 = GATE_LAYERS[layerAt(GATE_LAYERS, depth)];
    const boring = !!d && d.phase === 'bore';
    const rpm = (cadence || 0) * 3 * (boring ? 1 : 0.35);
    this.spinA += (rpm / 60) * Math.PI * 2 * dt; this.spin.rotation.z = -this.spinA;
    const A = gateAxis();
    if (unfold > 0) {
      this.cam.position.set(eye.x, eye.y, eye.z); this.cam.lookAt(pose.target.x, pose.target.y, pose.target.z); this.cam.updateMatrixWorld();
      if (d) this.v.set(A.x, A.y, A.z - d.depth + 0.04 + d.back); else this.v.set(0, -0.12, -1.3).applyMatrix4(this.cam.matrixWorld);
      this.cam.worldToLocal(this.v).sub(this.rig.position).sub(this.bit.position);
      const len = this.v.length();
      this.bit.quaternion.setFromUnitVectors(this.zAxis, this.v.normalize()); this.bit.scale.set(1, 1, len);
    }
    const shake = boring ? L0.shake * (0.6 + 0.4 * Math.abs(wob(t * L0.chatter * 0.15, 3))) * clamp01(cadence / 60) : 0;
    this.rig.position.x += wob(t * L0.chatter * 0.4, 1) * shake; this.rig.position.y += wob(t * L0.chatter * 0.5, 2) * shake;
    this.lamp.intensity = on && unfold > 0 && !fall ? 1.6 : 0; this.lamp.target.position.set(0, -0.1, -3);
    // the face of the layer at the bit, the cracks in the last minute, the floor going at the very end
    this.faces.forEach((f, i) => { f.visible = i === layer; f.position.z = -depth; });
    this.cracks.forEach((c, i) => { c.visible = crack > 0.08 + i * 0.3; });
    const sag = fall ? 99 : ease(clamp01((crack - 0.94) / 0.06)) * 0.25;
    this.floor.visible = !fall; this.floor.position.y = -sag; this.floor.rotation.x = sag * 0.3;
    this.hot.position.set(0, 0, -depth + 0.25);
    this.hot.intensity = boring ? (0.4 + 0.5 * Math.abs(Math.sin(t * 37))) * clamp01(cadence / 50) * [0.6, 1.2, 0.8][layer] : 0;
    this.crackLight.position.set(0, -1, -depth + 1.2); this.crackLight.intensity = (fall ? 1 - fall.black : 1) * 3 * ease(crack) * (0.8 + 0.2 * Math.sin(t * 5));
    // chips and sparks off the face: obsidian throws sparks, the geode crystal splinters (glowing)
    const tip = [A.x, A.y, A.z - depth + 0.06] as const, rate = boring ? clamp01(cadence / 60) : d ? 0.1 : 0;
    const chipPal = layer === 0 ? [L.basalt, L.basalt2, L.basalt3] : layer === 1 ? [L.obsidian, L.obsidian2, L.obsidianEdge] : [L.geode, L.geode2, L.crystal];
    let n = 0;
    for (let i = 0; i < Math.round(CHIPS * rate); i++) {
      const life = 0.9, born = (i / CHIPS) * life, age = ((t - born) % life + life) % life, gen = Math.floor((t - born) / life);
      const a = rnd(i, gen, 234) * Math.PI * 2, sp = 0.5 + rnd(i, gen, 235) * 1.2, back = 1.5 + rnd(i, gen, 236) * 2.5;
      this.chips.set(n++, [tip[0] + Math.cos(a) * sp * age, tip[1] + Math.sin(a) * sp * age * 0.8 - 3 * age * age, tip[2] + back * age], 0.012 + rnd(i, gen, 237) * 0.03, chipPal[Math.floor(rnd(i, gen, 238) * 3)], [t * 9 + i, t * 7 + i * 2, 0]);
    }
    this.chips.commit(n);
    n = 0;
    const sparkRate = boring ? [0.2, 1, 0.45][layer] * clamp01(cadence / 55) : 0;
    for (let i = 0; i < Math.round(SPARKS * sparkRate); i++) {
      const born = (i / SPARKS) * 0.35, age = ((t - born) % 0.35 + 0.35) % 0.35, gen = Math.floor((t - born) / 0.35);
      const a = rnd(i, gen, 230) * Math.PI * 2, sp = 1.2 + rnd(i, gen, 231) * 3.2, back = 0.6 + rnd(i, gen, 232) * 2.2;
      const col = layer === 2 ? (rnd(i, gen, 233) < 0.5 ? L.crystalHot : L.crystal2) : rnd(i, gen, 233) < 0.6 ? L.spark : L.lavaHot;
      this.sparks.set(n++, [tip[0] + Math.cos(a) * sp * age, tip[1] + Math.sin(a) * sp * age * 0.8 - 2.5 * age * age, tip[2] + back * age], [0.014, 0.014, (0.03 + 0.08 * (1 - age / 0.35)) * 1.6], col, [Math.sin(a) * 0.8, Math.cos(a) * 0.8, 0]);
    }
    this.sparks.commit(n);
    // the floor's rubble, falling with you
    n = 0;
    if (fall) {
      const ft = snap.sceneT, f0y = A.y - 1.4, z0 = A.z + (FLOOR_HOLE.z0 + FLOOR_HOLE.z1) / 2;
      for (let i = 0; i < RUBBLE; i++) {
        const r = rnd(i, 1, 240), drop = fall.drop * (1 + 0.12 * (r - 0.3)) + 0.4 * ft * rnd(i, 2, 240), spread = Math.min(1, ft / 12) * (2 + 6 * rnd(i, 3, 240));
        const a = rnd(i, 4, 240) * Math.PI * 2, x = A.x + (rnd(i, 5, 240) - 0.5) * 2 + Math.cos(a) * spread, z = z0 + (rnd(i, 6, 240) - 0.5) * 2 + Math.sin(a) * spread;
        const y = f0y + (rnd(i, 7, 240) - 0.5) * 0.6 - Math.min(drop, fall.drop + 30);
        const crystal = i % 7 === 0, sz = crystal ? 0.05 : 0.05 + 0.16 * rnd(i, 8, 240);
        this.rubble.set(n++, [x, y, z], crystal ? [sz * 0.5, sz * 2, sz * 0.5] : sz, crystal ? L.crystal : rnd(i, 9, 240) < 0.5 ? L.basalt2 : L.geode, [ft * (0.5 + r) + i, ft * 0.7 * r, i]);
      }
      // the Earth: a white dot dead ahead that grows; blue, green, clouds once it's big enough to see
      const D = 100, rad = D * Math.tan(fall.earth), dotR = Math.max(rad, D * 0.01);
      this.earth.visible = fall.earth > 0 && fall.white < 0.98; this.dot.visible = fall.earth > 0 && fall.white > 0.01;
      this.earth.position.set(0, 0, -D); this.earth.scale.setScalar(Math.max(1e-3, rad)); this.earth.rotation.y = ft * 0.004;
      this.dot.position.set(0, 0, -D + 0.5); this.dot.scale.setScalar(dotR * (1 + 0.1 * fall.white));
      (this.dot.material as THREE.MeshBasicMaterial).opacity = fall.white;
      (this.rubble.mesh.material as THREE.MeshBasicMaterial).color.setScalar(0.5 + 0.6 * (1 - fall.black));
    } else this.earth.visible = this.dot.visible = false;
    this.rubble.commit(n);
    // the floor shudders in the last minute
    const q = (fall ? 0.02 * (1 - fall.tip) : 0.03 * crack * crack) * (0.5 + 0.5 * Math.abs(wob(t * 1.7, 9)));
    return { x: wob(t * 9.1, 4) * q, y: wob(t * 11.3, 5) * q, z: 0 };
  }

  dispose(): void { disposeSet(this.rig, this.earth, this.dot, this.root); }
}
