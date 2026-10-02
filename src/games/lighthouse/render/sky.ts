// Sky dome, sun/moon, stars, clouds, fog banks, rain and lightning.
import * as THREE from 'three';
import { mulberry, softTexture } from './util';

export interface SkyState { t: number; dt: number; day: number; fog: number; storm: number; warn: number; lightningAge: number; camTarget: THREE.Vector3 }
export interface SkyOut { night: number; horizon: THREE.Color; sunDir: THREE.Vector3; sunColor: THREE.Color; sunI: number; flash: number }

const P = {
  dayTop: new THREE.Color(0x3d8fd6), dayHor: new THREE.Color(0xcfe9f7),
  goldTop: new THREE.Color(0x4a5d9a), goldHor: new THREE.Color(0xffa368),
  nightTop: new THREE.Color(0x03081a), nightHor: new THREE.Color(0x1b2b4d),
  stormTop: new THREE.Color(0x1d2229), stormHor: new THREE.Color(0x4a525c),
  fog: new THREE.Color(0xc9d3dc),
  flashTop: new THREE.Color(0xb8c4ff), flashHor: new THREE.Color(0xe0e6ff),
  sunNoon: new THREE.Color(0xfff1c0), sunLow: new THREE.Color(0xff8a4a), lightNoon: new THREE.Color(0xfff4e0), lightLow: new THREE.Color(0xffa060),
  cloud: new THREE.Color(0xffffff), cloudGold: new THREE.Color(0xffc9a0), cloudDark: new THREE.Color(0x3a4150), white: new THREE.Color(0xffffff),
};
const tmpC = new THREE.Color();

export class Sky {
  readonly group = new THREE.Group();
  private dome: THREE.Mesh; private uni: { top: { value: THREE.Color }; hor: { value: THREE.Color } };
  private sun: THREE.Sprite; private moon: THREE.Sprite; private stars: THREE.Points;
  private clouds: Array<{ g: THREE.Group; speed: number; x0: number }> = [];
  private cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  private banks: Array<{ s: THREE.Sprite; x0: number; z: number; sp: number }> = [];
  private rain: THREE.LineSegments; private rainPos: Float32Array;
  private bolt: THREE.Line; private lastLightning = 99;
  private out: SkyOut = { night: 0, horizon: new THREE.Color(), sunDir: new THREE.Vector3(), sunColor: new THREE.Color(), sunI: 1, flash: 0 };

  constructor() {
    this.uni = { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() } };
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(600, 24, 12), new THREE.ShaderMaterial({
      uniforms: this.uni, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 hor; varying vec3 vP; void main(){ float h = clamp(vP.y, 0.0, 1.0); gl_FragColor = vec4(mix(hor, top, pow(h, 0.55)), 1.0); }',
    }));
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
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false }));
    this.group.add(this.stars);
    // clouds: clusters of flattened icospheres drifting overhead
    const puff = new THREE.IcosahedronGeometry(1, 0);
    for (let i = 0; i < 16; i++) {
      const g = new THREE.Group();
      const n = 4 + Math.floor(r() * 4);
      for (let k = 0; k < n; k++) {
        const m = new THREE.Mesh(puff, this.cloudMat);
        const s = 4 + r() * 5;
        m.scale.set(s * 1.4, s * 0.6, s);
        m.position.set((k - n / 2) * 5 + r() * 3, r() * 2, r() * 6 - 3);
        g.add(m);
      }
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
    top.lerp(P.stormTop, st * 0.85); hor.lerp(P.stormHor, st * 0.8);
    hor.lerp(tmpC.copy(P.fog).multiplyScalar(1 - o.night * 0.75), s.fog * 0.6);
    // lightning flash
    if (s.lightningAge < this.lastLightning) this.strike(s);
    this.lastLightning = s.lightningAge;
    o.flash = s.lightningAge < 0.35 ? (1 - s.lightningAge / 0.35) * (s.lightningAge < 0.08 || (s.lightningAge > 0.14 && s.lightningAge < 0.2) ? 1 : 0.4) : 0;
    if (o.flash > 0) { top.lerp(P.flashTop, o.flash * 0.6); hor.lerp(P.flashHor, o.flash * 0.6); }
    this.bolt.visible = s.lightningAge < 0.22;
    o.horizon.copy(hor);
    // sun / moon: rise in the east (right), set in the west (left)
    o.sunDir.set(-Math.sin(ang), elev, -0.55).normalize();
    this.sun.position.copy(o.sunDir).multiplyScalar(520);
    (this.sun.material as THREE.SpriteMaterial).opacity = Math.max(0, Math.min(1, (elev + 0.08) * 5)) * (1 - st * 0.9) * (1 - s.fog * 0.6);
    (this.sun.material as THREE.SpriteMaterial).color.copy(P.sunNoon).lerp(P.sunLow, gold);
    this.moon.position.set(Math.sin(ang), -elev, -0.6).normalize().multiplyScalar(520);
    (this.moon.material as THREE.SpriteMaterial).opacity = o.night * (1 - st * 0.9) * (1 - s.fog * 0.5);
    (this.stars.material as THREE.PointsMaterial).opacity = o.night * (1 - st) * (1 - s.fog * 0.8);
    o.sunColor.copy(P.lightNoon).lerp(P.lightLow, gold);
    o.sunI = Math.max(0, Math.min(1, (elev + 0.05) * 4)) * (1 - st * 0.75);
    // clouds
    this.cloudMat.color.copy(P.cloud).lerp(P.cloudGold, gold * 0.5).lerp(P.cloudDark, Math.max(st, o.night * 0.85));
    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.clouds[i];
      const x = ((c.x0 + s.t * c.speed * (1 + st * 4) + 300) % 600 + 600) % 600 - 300;
      c.g.position.x = x;
      c.g.visible = i < 7 || st > 0.2 || i % 2 === 0;
      c.g.scale.setScalar(1 + st * 0.6);
    }
    // fog banks
    for (const b of this.banks) {
      const x = ((b.x0 + s.t * b.sp + 150) % 300 + 300) % 300 - 150;
      b.s.position.set(x, 2 + s.fog * 4, b.z);
      const m = b.s.material as THREE.SpriteMaterial;
      m.opacity = Math.max(0, s.fog - 0.25) * 0.9; m.color.copy(hor).lerp(P.white, 0.25 * (1 - o.night));
    }
    // rain
    const rainOn = Math.max(0, s.storm - 0.15);
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

