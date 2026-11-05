// Sky dome, sun/moon, stars, clouds, fog banks, rain and lightning.
import * as THREE from 'three/webgpu';
import { abs, clamp, length, mix, mod, normalize, pow, positionLocal, smoothstep, uniform, vec3, vec4 } from 'three/tsl';
import type { Node, UniformNode } from 'three/webgpu';
import { raw } from '../../../gfx/tsl';
import { PointCloud } from '../../../gfx/points';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry, softTexture } from './util';

export interface SkyState { t: number; dt: number; day: number; fog: number; storm: number; warn: number; lightningAge: number; camTarget: THREE.Vector3; rainbow?: number;
  /** Cosmetic calm-weather mood, blending from `prev` to `kind` as `k` goes 0 -> 1. */
  weather?: { kind: string; prev: string; k: number } }
export interface SkyOut { night: number; horizon: THREE.Color; sunDir: THREE.Vector3; sunColor: THREE.Color; sunI: number; flash: number }

const P = {
  dayTop: new THREE.Color(0x3d8fd6), dayHor: new THREE.Color(0xcfe9f7),
  goldTop: new THREE.Color(0x4a5d9a), goldHor: new THREE.Color(0xffa368),
  nightTop: new THREE.Color(0x03081a), nightHor: new THREE.Color(0x1b2b4d),
  stormTop: new THREE.Color(0x1d2229), stormHor: new THREE.Color(0x4a525c),
  fog: new THREE.Color(0xc9d3dc),
  flashTop: new THREE.Color(0xb8c4ff), flashHor: new THREE.Color(0xe0e6ff),
  sunNoon: new THREE.Color(0xfff1c0), sunLow: new THREE.Color(0xff8a4a), lightNoon: new THREE.Color(0xfff4e0), lightLow: new THREE.Color(0xffa060),
  snowHor: new THREE.Color(0xdfe6ec), sunnyTop: new THREE.Color(0x2f86e0),
  cloud: new THREE.Color(0xffffff), cloudGold: new THREE.Color(0xffc9a0), cloudDark: new THREE.Color(0x3a4150), white: new THREE.Color(0xffffff),
};
const tmpC = new THREE.Color();

export class Sky {
  readonly group = new THREE.Group();
  private dome: THREE.Mesh; private uni: { top: UniformNode<'color', THREE.Color>; hor: UniformNode<'color', THREE.Color> };
  private sun: THREE.Sprite; private moon: THREE.Sprite; private stars: PointCloud;
  private clouds: Array<{ g: THREE.Group; speed: number; x0: number }> = [];
  private cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  private banks: Array<{ s: THREE.Sprite; x0: number; z: number; sp: number }> = [];
  private rain: THREE.LineSegments; private rainPos: Float32Array;
  private bolt: THREE.Line; private lastLightning = 99;
  private rainbow: THREE.Mesh; private rainbowOp = uniform(0);
  private snow: PointCloud; private snowPos: Float32Array; private cloudT = 0;
  private out: SkyOut = { night: 0, horizon: new THREE.Color(), sunDir: new THREE.Vector3(), sunColor: new THREE.Color(), sunI: 1, flash: 0 };

  constructor() {
    this.uni = { top: uniform(new THREE.Color()), hor: uniform(new THREE.Color()) };
    const domeMat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false });
    domeMat.colorNode = raw(mix(this.uni.hor, this.uni.top, pow(clamp(normalize(positionLocal).y, 0, 1), 0.55)));
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(600, 24, 12), domeMat);
    this.dome.renderOrder = -10; this.group.add(this.dome);
    const tex = softTexture(128, 0.35);
    this.sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xfff1c0, fog: false, depthWrite: false, transparent: true }));
    this.sun.scale.setScalar(70); this.group.add(this.sun);
    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTexture(64, 0.75), color: 0xdfe8ff, fog: false, depthWrite: false, transparent: true }));
    this.moon.scale.setScalar(26); this.group.add(this.moon);
    const r = mulberry(99);
    const sp = new Float32Array(900 * 3);
    for (let i = 0; i < 900; i++) {
      const a = r() * Math.PI * 2, e = 0.08 + Math.pow(r(), 0.7) * 1.4;
      sp.set([Math.cos(a) * Math.cos(e) * 560, Math.sin(e) * 560, Math.sin(a) * Math.cos(e) * 560], i * 3);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new PointCloud(sg, { color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false });
    this.group.add(this.stars);
    // clouds: clusters of flattened icospheres drifting overhead
    const puff = new THREE.IcosahedronGeometry(1, 0);
    for (let i = 0; i < 16; i++) {
      // one merged mesh per cluster: a cloud is one draw call, not 4-7
      const g = new THREE.Group(), parts: THREE.BufferGeometry[] = [], m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
      const n = 4 + Math.floor(r() * 4);
      for (let k = 0; k < n; k++) {
        const s = 4 + r() * 5;
        m4.compose(new THREE.Vector3((k - n / 2) * 5 + r() * 3, r() * 2, r() * 6 - 3), q, new THREE.Vector3(s * 1.4, s * 0.6, s));
        parts.push(puff.clone().applyMatrix4(m4));
      }
      g.add(new THREE.Mesh(mergeGeometries(parts), this.cloudMat));
      for (const p of parts) p.dispose();
      g.position.set(0, 55 + r() * 30, -160 + r() * 220);
      this.group.add(g);
      this.clouds.push({ g, speed: 1.2 + r() * 1.5, x0: -300 + r() * 600 });
    }
    // fog banks low over the water
    const ftex = softTexture(128, 0.05);
    for (let i = 0; i < 26; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ftex, color: 0xdde4ea, transparent: true, depthWrite: false, opacity: 0 }));
      const w = 30 + r() * 40; s.scale.set(w, w * 0.32, 1);
      this.group.add(s);
      this.banks.push({ s, x0: -120 + r() * 240, z: -30 + r() * 95, sp: 0.6 + r() * 1.2 });
    }
    // rain
    const N = 1600; this.rainPos = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) { const x = r() * 160 - 80, y = r() * 60, z = r() * 120 - 40; this.rainPos.set([x, y, z, x - 0.3, y - 1.6, z], i * 6); }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xaab8c8, transparent: true, opacity: 0, depthWrite: false }));
    this.rain.frustumCulled = false; this.group.add(this.rain);
    this.bolt = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xf2f5ff, fog: false, transparent: true }));
    this.bolt.visible = false; this.group.add(this.bolt);
    // snowfall (winter weather)
    const SN = 900; this.snowPos = new Float32Array(SN * 3);
    for (let i = 0; i < SN; i++) this.snowPos.set([r() * 160 - 80, r() * 50, r() * 120 - 40], i * 3);
    const sng = new THREE.BufferGeometry(); sng.setAttribute('position', new THREE.BufferAttribute(this.snowPos, 3));
    this.snow = new PointCloud(sng, { color: 0xffffff, size: 0.35, map: softTexture(32, 0.4), transparent: true, opacity: 0, depthWrite: false });
    this.snow.frustumCulled = false; this.snow.visible = false; this.group.add(this.snow);
    // rainbow after a weathered storm: a half ring far beyond the island, bands from violet (inside) to red (outside)
    const rbMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const vP = positionLocal.xy, k = length(vP).sub(110).div(14);
    const hue = (h: Node<'float'>) => clamp(abs(mod(vec3(h.mul(6)).add(vec3(0, 4, 2)), 6).sub(3)).sub(1), 0, 1);
    const a = this.rainbowOp.mul(smoothstep(0, 0.18, k)).mul(smoothstep(0.82, 1, k).oneMinus()).mul(smoothstep(92, 112, vP.y));
    rbMat.colorNode = vec4(raw(hue(mix(0.78, 0, k)).mul(a).mul(0.36)), 1);
    this.rainbow = new THREE.Mesh(new THREE.RingGeometry(110, 124, 96, 1, 0, Math.PI), rbMat);
    this.rainbow.position.set(10, -92, -230); // low over the far sea; the feet meet the water
    this.rainbow.renderOrder = -9; this.rainbow.visible = false; this.group.add(this.rainbow);
  }

  update(s: SkyState): SkyOut {
    const o = this.out;
    // day: 0 = noon, 0.25 dusk, 0.5 midnight, 0.75 dawn
    const ang = s.day * Math.PI * 2;
    const elev = Math.cos(ang);
    o.night = Math.max(0, Math.min(1, (0.1 - elev) / 0.35));
    const gold = Math.max(0, 1 - Math.abs(elev - 0.05) / 0.3);
    const top = this.uni.top.value, hor = this.uni.hor.value;
    top.copy(P.dayTop).lerp(P.goldTop, gold * 0.7).lerp(P.nightTop, o.night);
    hor.copy(P.dayHor).lerp(P.goldHor, gold * 0.8).lerp(P.nightHor, o.night);
    const st = Math.max(s.storm, s.warn * 0.5);
    const w = s.weather, wt = (name: string) => (w?.kind === name ? w.k : 0) + (w?.prev === name ? 1 - (w?.k ?? 1) : 0);
    const sunny = wt('sunny'), shower = wt('shower'), windy = wt('windy'), snowy = wt('snow');
    const overcast = Math.max(shower * 0.35, snowy * 0.3) * (1 - st);
    top.lerp(P.stormTop, st * 0.85); hor.lerp(P.stormHor, st * 0.8);
    top.lerp(P.stormTop, overcast * 0.6); hor.lerp(snowy > shower ? P.snowHor : P.stormHor, overcast * 0.7);
    if (sunny > 0) top.lerp(P.sunnyTop, sunny * 0.35 * (1 - o.night));
    hor.lerp(tmpC.copy(P.fog).multiplyScalar(1 - o.night * 0.75), s.fog * 0.6);
    // lightning flash
    if (s.lightningAge < this.lastLightning) this.strike(s);
    this.lastLightning = s.lightningAge;
    o.flash = s.lightningAge < 0.35 ? (1 - s.lightningAge / 0.35) * (s.lightningAge < 0.08 || (s.lightningAge > 0.14 && s.lightningAge < 0.2) ? 1 : 0.4) : 0;
    if (o.flash > 0) { top.lerp(P.flashTop, o.flash * 0.6); hor.lerp(P.flashHor, o.flash * 0.6); }
    this.bolt.visible = s.lightningAge < 0.22;
    o.horizon.copy(hor);
    this.rainbowOp.value = (s.rainbow ?? 0) * (1 - o.night) * (1 - s.fog * 0.7);
    this.rainbow.visible = this.rainbowOp.value > 0.01;
    // sun / moon: rise in the east (right), set in the west (left)
    o.sunDir.set(-Math.sin(ang), elev, -0.55).normalize();
    this.sun.position.copy(o.sunDir).multiplyScalar(520);
    (this.sun.material as THREE.SpriteMaterial).opacity = Math.max(0, Math.min(1, (elev + 0.08) * 5)) * (1 - st * 0.9) * (1 - s.fog * 0.6);
    (this.sun.material as THREE.SpriteMaterial).color.copy(P.sunNoon).lerp(P.sunLow, gold);
    this.moon.position.set(Math.sin(ang), -elev, -0.6).normalize().multiplyScalar(520);
    (this.moon.material as THREE.SpriteMaterial).opacity = o.night * (1 - st * 0.9) * (1 - s.fog * 0.5);
    this.stars.material.opacity = o.night * (1 - st) * (1 - s.fog * 0.8);
    o.sunColor.copy(P.lightNoon).lerp(P.lightLow, gold);
    o.sunI = Math.max(0, Math.min(1, (elev + 0.05) * 4)) * (1 - st * 0.75) * (1 - overcast * 0.6) * (1 + sunny * 0.1);
    // clouds (integrate the speed so a change of wind doesn't jump them)
    this.cloudT += s.dt * (1 + st * 4 + windy * 2.5);
    this.cloudMat.color.copy(P.cloud).lerp(P.cloudGold, gold * 0.5).lerp(P.cloudDark, Math.max(st, o.night * 0.85));
    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.clouds[i];
      const x = ((c.x0 + this.cloudT * c.speed + 300) % 600 + 600) % 600 - 300;
      c.g.position.x = x;
      c.g.visible = sunny > 0.5 && st < 0.2 ? i < 4 : i < 7 || st > 0.2 || i % 2 === 0 || overcast + windy > 0.3;
      c.g.scale.setScalar(1 + st * 0.6);
    }
    // fog banks
    for (const b of this.banks) {
      const x = ((b.x0 + s.t * b.sp + 150) % 300 + 300) % 300 - 150;
      b.s.position.set(x, 2 + s.fog * 4, b.z);
      const m = b.s.material as THREE.SpriteMaterial;
      m.opacity = Math.max(0, s.fog - 0.25) * 0.9; m.color.copy(hor).lerp(P.white, 0.25 * (1 - o.night));
      b.s.visible = m.opacity > 0.003; // fully transparent sprites still cost a draw
    }
    // rain
    const rainOn = Math.max(0, s.storm - 0.15, shower * 0.3);
    // snow
    const snowOn = snowy * (1 - st);
    this.snow.material.opacity = snowOn * 0.9;
    this.snow.visible = snowOn > 0.02;
    if (this.snow.visible) {
      const p = this.snowPos, fall = 2.4 * s.dt;
      for (let i = 0; i < p.length; i += 3) {
        p[i + 1] -= fall * (0.7 + (i % 7) * 0.08); p[i] += Math.sin(s.t * 0.8 + i) * 0.02 + windy * 0.05;
        if (p[i + 1] < 0) { p[i + 1] += 50; p[i] = ((p[i] + 80) % 160 + 160) % 160 - 80; }
      }
      this.snow.position.set(s.camTarget.x, 0, s.camTarget.z - 20);
      this.snow.cloud.attributes.position.needsUpdate = true;
    }
    (this.rain.material as THREE.LineBasicMaterial).opacity = Math.min(0.55, rainOn);
    this.rain.visible = rainOn > 0;
    if (this.rain.visible) {
      const p = this.rainPos, fall = 45 * s.dt;
      for (let i = 0; i < p.length; i += 6) {
        p[i + 1] -= fall; p[i + 4] -= fall; p[i] -= fall * 0.2; p[i + 3] -= fall * 0.2;
        if (p[i + 4] < 0) { p[i + 1] += 60; p[i + 4] += 60; p[i] += 12; p[i + 3] += 12; }
      }
      this.rain.position.set(s.camTarget.x, 0, s.camTarget.z - 20);
      (this.rain.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
    return o;
  }

  private strike(s: SkyState) {
    const r = mulberry(Math.floor(s.t * 1000));
    let x = s.camTarget.x - 60 + r() * 120, z = -40 + r() * 60, y = 70;
    const pts: number[] = [x, y, z];
    while (y > 0) { y -= 4 + r() * 6; x += (r() - 0.5) * 8; z += (r() - 0.5) * 4; pts.push(x, Math.max(0, y), z); }
    this.bolt.geometry.dispose();
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.bolt.geometry = g;
  }
}

