/**
 * Procedural 3D blooms, themed rider wheel (honoring profile.color), standing goal beacon,
 * and road ribbon mesh builder — all strictly tracked by LevelDisposer.
 */

import * as THREE from 'three';
import { clamp, lerp } from '../sim/math';
import type { SimRoad } from '../sim/road';
import type { ThemeId } from '../sim/types';
import {
  type BloomKind,
  type LevelDisposer,
  mixHex,
  mixPal,
  setTri,
  type SharedTextures,
  type ThemeDef,
  tone,
} from './themes';

const TAU = Math.PI * 2;
const easeOut3 = (t: number): number => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

/* ---------- Reusable procedural geometry helpers ---------- */

export function archGeo(w: number, h: number, seg = 10): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  const r = w / 2;
  s.moveTo(-r, 0);
  s.lineTo(r, 0);
  s.lineTo(r, h - r);
  s.absarc(0, h - r, r, 0, Math.PI, false);
  s.lineTo(-r, 0);
  return new THREE.ShapeGeometry(s, seg);
}

export function rectGeo(w: number, h: number): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  g.translate(0, h / 2, 0);
  return g;
}

export function gearGeo(r: number, teeth: number, h: number, depth = 0.2, hole = 0): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  const step = TAU / teeth;
  const rr = r * (1 - depth);
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const pts: ReadonlyArray<[number, number]> = [
      [rr, a],
      [r, a + step * 0.18],
      [r, a + step * 0.45],
      [rr, a + step * 0.63],
    ];
    pts.forEach(([R, A], k) => {
      if (i === 0 && k === 0) s.moveTo(R * Math.cos(A), R * Math.sin(A));
      else s.lineTo(R * Math.cos(A), R * Math.sin(A));
    });
  }
  s.closePath();
  if (hole > 0) {
    const p = new THREE.Path();
    p.absarc(0, 0, hole, 0, TAU, true);
    s.holes.push(p);
  }
  const geo = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 4 });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

export function petalGeo(len: number, wid: number, cup = 0.4, tipCurl = 0.15): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(len * 0.2, wid * 1.1, len * 0.8, wid * 0.95, len, 0);
  s.bezierCurveTo(len * 0.8, -wid * 0.95, len * 0.2, -wid * 1.1, 0, 0);
  const g = new THREE.ShapeGeometry(s, 12);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    p.setY(i, cup * wid * Math.pow(z / wid, 2) + tipCurl * len * Math.pow(x / len, 3));
  }
  return g;
}

/* ---------- Machine Blooms ---------- */

export interface BloomRig {
  group: THREE.Group;
  set: (e: number, spin: number, t: number) => void;
}

function bloomIris(P: ThemeDef, D: LevelDisposer): BloomRig {
  const g = new THREE.Group();
  const mBase = D.tri(P.idle, { fresh: true });
  const mArm = D.tri(P.idle, { fresh: true });
  const mKnob = D.tri(P.mech, { fresh: true });
  const mCap = D.tri(P.mech, { fresh: true });

  const plate = new THREE.Mesh(D.geo(new THREE.CylinderGeometry(0.5, 0.54, 0.07, 28)), mBase);
  plate.position.y = 0.035;
  g.add(plate);

  const gear = new THREE.Mesh(D.geo(gearGeo(0.5, 18, 0.1, 0.2, 0.3)), mArm);
  gear.position.y = 0.07;
  g.add(gear);

  const pegGeo = D.geo(new THREE.CylinderGeometry(0.06, 0.075, 1, 10));
  const knobGeo = D.geo(new THREE.CylinderGeometry(0.1, 0.085, 0.1, 12));
  const arms: Array<{ a: THREE.Group; rod: THREE.Mesh; peg: THREE.Mesh; knob: THREE.Mesh }> = [];
  for (let i = 0; i < 6; i++) {
    const a = new THREE.Group();
    a.position.y = 0.14;
    g.add(a);
    const sleeve = new THREE.Mesh(D.unitBox, mBase);
    sleeve.scale.set(0.3, 0.1, 0.16);
    sleeve.position.set(0.22, 0.01, 0);
    a.add(sleeve);
    const rod = new THREE.Mesh(D.unitBox, mArm);
    rod.scale.set(1, 0.065, 0.1);
    a.add(rod);
    const peg = new THREE.Mesh(pegGeo, mArm);
    a.add(peg);
    const knob = new THREE.Mesh(knobGeo, mKnob);
    a.add(knob);
    arms.push({ a, rod, peg, knob });
  }

  const cap = new THREE.Mesh(D.geo(new THREE.SphereGeometry(0.17, 14, 8, 0, TAU, 0, Math.PI / 2)), mCap);
  cap.position.y = 0.14;
  g.add(cap);
  const bolt = new THREE.Mesh(D.geo(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 10)), D.tri(tone(P.ink)));
  bolt.position.y = 0.3;
  g.add(bolt);

  return {
    group: g,
    set(e, spin) {
      const k = clamp(e, 0, 1.25), c = clamp(e, 0, 1);
      setTri(mArm, mixPal(P.idle, P.mech, c));
      setTri(mBase, mixPal(P.idle, P.mechDark ?? P.idle, c * 0.6));
      setTri(mKnob, mixPal(P.idle, P.mech, c));
      setTri(mCap, mixPal(P.idle, P.mech, Math.min(1, c * 1.3)));
      gear.rotation.y = -spin * 0.5;
      gear.scale.set(1, 0.3 + 0.7 * c, 1);
      arms.forEach(({ a, rod, peg, knob }, i) => {
        a.rotation.y = spin + (i * TAU) / 6 * easeOut3(c) * (1 + (k - c));
        const L = 0.18 + 0.62 * k;
        rod.scale.x = L;
        rod.position.x = 0.1 + L / 2;
        const ph = 0.04 + 0.26 * k;
        peg.scale.y = ph;
        peg.position.set(0.1 + L, ph / 2, 0);
        knob.position.set(0.1 + L, ph, 0);
        knob.scale.setScalar(0.5 + 0.6 * k);
      });
      cap.scale.set(1, 0.6 + 0.6 * c, 1);
    },
  };
}

function bloomFlower(P: ThemeDef, D: LevelDisposer): BloomRig {
  const g = new THREE.Group();
  const mOut = D.tri(P.idle, { fresh: true, side: true });
  const mIn = D.tri(P.idle, { fresh: true, side: true });
  const mLeaf = D.tri(P.leaf ?? P.turf ?? P.stone, { side: true });
  const gLeaf = D.geo(petalGeo(0.62, 0.17, 0.5, 0.05));
  const gOut = D.geo(petalGeo(0.5, 0.16, 0.7, 0.25));
  const gIn = D.geo(petalGeo(0.32, 0.12, 0.8, 0.3));
  const leaves: THREE.Group[] = [];
  const outer: Array<{ r: THREE.Group; h: THREE.Group }> = [];
  const inner: Array<{ r: THREE.Group; h: THREE.Group }> = [];
  const stamens: THREE.Group[] = [];

  for (let i = 0; i < 4; i++) {
    const r = new THREE.Group();
    r.rotation.y = (i * TAU) / 4 + 0.4;
    const h = new THREE.Group();
    r.add(h);
    h.add(new THREE.Mesh(gLeaf, mLeaf));
    g.add(r);
    leaves.push(h);
  }
  for (let i = 0; i < 7; i++) {
    const r = new THREE.Group();
    r.rotation.y = (i * TAU) / 7;
    const h = new THREE.Group();
    h.position.set(0.07, 0.05, 0);
    r.add(h);
    h.add(new THREE.Mesh(gOut, mOut));
    g.add(r);
    outer.push({ r, h });
  }
  for (let i = 0; i < 5; i++) {
    const r = new THREE.Group();
    r.rotation.y = (i * TAU) / 5 + 0.3;
    const h = new THREE.Group();
    h.position.set(0.04, 0.07, 0);
    r.add(h);
    h.add(new THREE.Mesh(gIn, mIn));
    g.add(r);
    inner.push({ r, h });
  }

  const disc = new THREE.Mesh(D.geo(new THREE.SphereGeometry(0.1, 12, 8)), D.tri(tone('#FFD24A')));
  disc.position.y = 0.08;
  g.add(disc);

  const gStem = D.geo(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 5));
  const gTip = D.geo(new THREE.SphereGeometry(0.03, 6, 5));
  const mStem = D.tri(tone('#F7E7B0'));
  const mTip = D.tri(tone('#FFB321'));
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Group();
    s.rotation.y = (i * TAU) / 8;
    const st = new THREE.Mesh(gStem, mStem);
    st.position.set(0.05, 0.1, 0);
    st.rotation.z = -0.5;
    const tip = new THREE.Mesh(gTip, mTip);
    tip.position.set(0.1, 0.19, 0);
    s.add(st, tip);
    g.add(s);
    stamens.push(s);
  }

  return {
    group: g,
    set(e, spin, t) {
      const c = clamp(e, 0, 1), k = clamp(e, 0, 1.3);
      setTri(mOut, mixPal(P.idle, P.mech, c));
      setTri(mIn, mixPal(P.idle, P.mechLight ?? P.mech, c));
      leaves.forEach((h, i) => { h.rotation.z = 0.25 - 0.2 * c + Math.sin(t * 1.3 + i) * 0.03; });
      outer.forEach(({ r, h }, i) => {
        r.rotation.y = (i * TAU) / 7 + spin;
        h.rotation.z = lerp(1.38, 0.16, k) + Math.sin(t * 2 + i) * 0.02 * c;
      });
      inner.forEach(({ r, h }, i) => {
        r.rotation.y = (i * TAU) / 5 + 0.3 + spin * 1.2;
        h.rotation.z = lerp(1.45, 0.6, k);
      });
      stamens.forEach((s, i) => {
        s.scale.setScalar(0.2 + 0.8 * c);
        s.rotation.y = (i * TAU) / 8 + spin * 1.4;
      });
      disc.scale.setScalar(0.6 + 0.5 * c);
    },
  };
}

function bloomHelm(P: ThemeDef, D: LevelDisposer): BloomRig {
  const g = new THREE.Group();
  const mWood = D.tri(P.idle, { fresh: true });
  const mTile = D.tri(P.idle, { fresh: true });
  const hub = new THREE.Mesh(D.geo(new THREE.CylinderGeometry(0.16, 0.18, 0.12, 18)), mTile);
  hub.position.y = 0.06;
  g.add(hub);
  const cap = new THREE.Mesh(D.geo(new THREE.CylinderGeometry(0.09, 0.11, 0.06, 14)), D.tri(tone('#F6F1E6')));
  cap.position.y = 0.15;
  g.add(cap);
  const rim = new THREE.Mesh(D.geo(new THREE.TorusGeometry(0.4, 0.045, 8, 32)), mWood);
  rim.rotation.x = Math.PI / 2;
  g.add(rim);

  const gSpoke = D.geo(new THREE.CylinderGeometry(0.025, 0.03, 1, 8));
  const gH1 = D.geo(new THREE.CylinderGeometry(0.04, 0.03, 0.14, 8));
  const gH2 = D.geo(new THREE.SphereGeometry(0.05, 8, 6));
  const spokes: Array<{ s: THREE.Mesh; h1: THREE.Mesh; h2: THREE.Mesh }> = [];
  for (let i = 0; i < 8; i++) {
    const a = new THREE.Group();
    a.rotation.y = (i * TAU) / 8;
    g.add(a);
    const s = new THREE.Mesh(gSpoke, mWood);
    s.rotation.z = Math.PI / 2;
    a.add(s);
    const h1 = new THREE.Mesh(gH1, mWood);
    h1.rotation.z = Math.PI / 2;
    a.add(h1);
    const h2 = new THREE.Mesh(gH2, mTile);
    a.add(h2);
    spokes.push({ s, h1, h2 });
  }

  return {
    group: g,
    set(e, spin) {
      const c = clamp(e, 0, 1), k = clamp(e, 0, 1.25);
      setTri(mWood, mixPal(P.idle, P.mech, c));
      setTri(mTile, mixPal(P.idle, P.accent ?? P.mechDark ?? P.mech, c));
      g.rotation.y = spin;
      rim.position.y = 0.05 + 0.1 * c;
      rim.scale.setScalar(0.55 + 0.45 * k);
      spokes.forEach(({ s, h1, h2 }) => {
        const L = 0.2 + 0.5 * k;
        s.scale.y = L;
        s.position.set(L / 2, 0.08 + 0.06 * c, 0);
        h1.position.set(L + 0.06, 0.08 + 0.06 * c, 0);
        h2.position.set(L + 0.15, 0.08 + 0.06 * c, 0);
        h1.scale.setScalar(0.4 + 0.6 * c);
        h2.scale.setScalar(0.3 + 0.7 * c);
      });
    },
  };
}

function bloomCrystal(P: ThemeDef, D: LevelDisposer): BloomRig {
  const g = new THREE.Group();
  const mCore = D.tri(P.idle, { fresh: true });
  const core = new THREE.Mesh(D.geo(new THREE.CylinderGeometry(0.13, 0.15, 1, 6)), mCore);
  g.add(core);
  const top = new THREE.Mesh(D.geo(new THREE.ConeGeometry(0.13, 0.16, 6)), mCore);
  g.add(top);

  const shardGeo = D.geo(new THREE.OctahedronGeometry(1, 0));
  shardGeo.scale(0.3, 0.07, 0.09);
  shardGeo.translate(0.3, 0, 0);

  const ramp = P.ramp ?? [P.mech];
  const shards: Array<{ r: THREE.Group; h: THREE.Group; m: THREE.ShaderMaterial; pal: (typeof ramp)[number] }> = [];
  for (let i = 0; i < 6; i++) {
    const r = new THREE.Group();
    r.rotation.y = (i * TAU) / 6;
    const h = new THREE.Group();
    h.position.set(0.12, 0.02, 0);
    r.add(h);
    const m = D.tri(P.idle, { fresh: true });
    h.add(new THREE.Mesh(shardGeo, m));
    g.add(r);
    shards.push({ r, h, m, pal: ramp[i % ramp.length] });
  }

  const orbit = new THREE.Group();
  g.add(orbit);
  const gOrb = D.geo(new THREE.TetrahedronGeometry(0.05, 0));
  const mOrb = D.tri(tone('#FFF6C8'));
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(gOrb, mOrb);
    m.position.set(Math.cos((i * TAU) / 5) * 0.72, 0.25, Math.sin((i * TAU) / 5) * 0.72);
    orbit.add(m);
  }

  return {
    group: g,
    set(e, spin, t) {
      const c = clamp(e, 0, 1), k = clamp(e, 0, 1.3);
      setTri(mCore, mixPal(P.idle, P.mech, c));
      const ch = 0.14 + 0.26 * c;
      core.scale.set(1, ch, 1);
      core.position.y = ch / 2;
      top.position.y = ch + 0.08;
      shards.forEach(({ r, h, m, pal }, i) => {
        r.rotation.y = (i * TAU) / 6 + spin;
        h.rotation.z = lerp(1.25, 0.12, k) + Math.sin(t * 2.4 + i) * 0.04 * c;
        h.position.y = 0.02 + 0.05 * c * Math.sin(t * 2 + i);
        setTri(m, mixPal(P.idle, mixPal(pal, P.mech, 0.25), c));
      });
      orbit.rotation.y = -spin * 1.6 + t * 0.3 * c;
      orbit.scale.setScalar(Math.max(0.001, c));
      orbit.position.y = 0.05 * Math.sin(t * 3);
    },
  };
}

function bloomLantern(P: ThemeDef, D: LevelDisposer, tex: SharedTextures): BloomRig {
  const g = new THREE.Group();
  const mRib = D.tri(P.idle, { fresh: true });
  const pole = new THREE.Mesh(D.geo(new THREE.CylinderGeometry(0.04, 0.06, 0.3, 10)), mRib);
  pole.position.y = 0.15;
  g.add(pole);
  const crown = new THREE.Mesh(D.geo(new THREE.SphereGeometry(0.09, 10, 8)), mRib);
  crown.position.y = 0.3;
  g.add(crown);

  const gLamp = D.geo(new THREE.CylinderGeometry(0.065, 0.065, 0.13, 8));
  const glowColor = P.glow ?? P.mech.t;
  const ribs: Array<{ r: THREE.Group; h: THREE.Group; lamp: THREE.Group; body: THREE.Mesh; halo: THREE.Sprite }> = [];
  for (let i = 0; i < 8; i++) {
    const r = new THREE.Group();
    r.rotation.y = (i * TAU) / 8;
    r.position.y = 0.28;
    const h = new THREE.Group();
    r.add(h);
    const rib = new THREE.Mesh(D.unitBox, mRib);
    rib.scale.set(0.56, 0.025, 0.035);
    rib.position.x = 0.28;
    h.add(rib);
    const lamp = new THREE.Group();
    lamp.position.x = 0.56;
    h.add(lamp);
    const body = new THREE.Mesh(gLamp, D.basic(P.idle.t));
    body.position.y = -0.1;
    lamp.add(body);
    const halo = D.sprite(tex.glow, 0.5, 0.5, glowColor, { add: true, opacity: 0 });
    halo.position.y = -0.1;
    lamp.add(halo);
    g.add(r);
    ribs.push({ r, h, lamp, body, halo });
  }

  return {
    group: g,
    set(e, spin, t) {
      const c = clamp(e, 0, 1), k = clamp(e, 0, 1.25);
      setTri(mRib, mixPal(P.idle, P.mech, c));
      ribs.forEach(({ r, h, lamp, body, halo }, i) => {
        r.rotation.y = (i * TAU) / 8 + spin * 0.6;
        h.rotation.z = lerp(1.35, -0.18, k);
        lamp.rotation.z = -h.rotation.z + Math.sin(t * 2.2 + i * 1.7) * 0.12 * c;
        const fl = 0.85 + 0.15 * Math.sin(t * 9 + i * 3.1) * Math.sin(t * 5.3 + i);
        (body.material as THREE.MeshBasicMaterial).color.set(mixHex(P.idle.t, glowColor, c * fl));
        (halo.material as THREE.SpriteMaterial).opacity = c * 0.9 * fl;
        halo.scale.setScalar(0.25 + 0.35 * c);
      });
    },
  };
}

function bloomClock(P: ThemeDef, D: LevelDisposer): BloomRig {
  const g = new THREE.Group();
  const mSun = D.tri(P.idle, { fresh: true });
  const mPl = D.tri(P.idle, { fresh: true });
  const mArm = D.tri(P.idle, { fresh: true });

  const plate = new THREE.Mesh(D.geo(new THREE.CylinderGeometry(0.24, 0.26, 0.06, 20)), mArm);
  plate.position.y = 0.03;
  g.add(plate);
  const sun = new THREE.Mesh(D.geo(gearGeo(0.3, 16, 0.09, 0.18, 0.08)), mSun);
  sun.position.y = 0.1;
  g.add(sun);

  const gPlanet = D.geo(gearGeo(0.15, 10, 0.07, 0.25, 0.04));
  const gPin = D.geo(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8));
  const mPin = D.tri(tone(P.ink));
  const planets: Array<{ a: THREE.Group; arm: THREE.Mesh; pg: THREE.Mesh; pin: THREE.Mesh }> = [];
  for (let i = 0; i < 4; i++) {
    const a = new THREE.Group();
    a.rotation.y = (i * TAU) / 4;
    a.position.y = 0.06;
    g.add(a);
    const arm = new THREE.Mesh(D.unitBox, mArm);
    arm.scale.set(1, 0.03, 0.06);
    a.add(arm);
    const pg = new THREE.Mesh(gPlanet, mPl);
    a.add(pg);
    const pin = new THREE.Mesh(gPin, mPin);
    a.add(pin);
    planets.push({ a, arm, pg, pin });
  }

  const face = new THREE.Mesh(D.geo(new THREE.CylinderGeometry(0.14, 0.14, 0.03, 20)), D.tri(tone('#F7EEDC')));
  face.position.y = 0.205;
  g.add(face);
  const hand = new THREE.Mesh(D.unitBox, D.tri(tone('#B1332A')));
  hand.scale.set(0.13, 0.012, 0.018);
  hand.position.set(0.05, 0.23, 0);
  const handG = new THREE.Group();
  handG.add(hand);
  g.add(handG);

  return {
    group: g,
    set(e, spin, t) {
      const c = clamp(e, 0, 1), k = clamp(e, 0, 1.2);
      setTri(mSun, mixPal(P.idle, P.mech, c));
      setTri(mPl, mixPal(P.idle, P.mechLight ?? P.mech, c));
      setTri(mArm, mixPal(P.idle, P.mechDark ?? P.mech, c));
      sun.rotation.y = spin;
      const d = lerp(0.1, 0.43, k);
      planets.forEach(({ a, arm, pg, pin }, i) => {
        a.rotation.y = (i * TAU) / 4 + spin * 0.25;
        arm.scale.x = d;
        arm.position.x = d / 2;
        pg.position.x = d;
        pin.position.set(d, 0.08, 0);
        pg.rotation.y = -spin * (0.3 / 0.15) * 1.05 - a.rotation.y;
      });
      const tick = Math.floor(t * 2) + easeOut3(((t * 2) % 1) * 6);
      handG.rotation.y = -((tick * TAU) / 60) * (c > 0.2 ? 1 : 0);
      face.scale.setScalar(0.4 + 0.6 * c);
    },
  };
}

function bloomGyro(P: ThemeDef, D: LevelDisposer, tex: SharedTextures): BloomRig {
  const g = new THREE.Group();
  const mR = D.tri(P.idle, { fresh: true });
  const mO = D.tri(P.idle, { fresh: true });
  const base = new THREE.Mesh(D.geo(new THREE.CylinderGeometry(0.44, 0.52, 0.08, 28)), D.tri(P.idle));
  base.position.y = 0.04;
  g.add(base);
  const gKnob = D.geo(new THREE.SphereGeometry(0.055, 8, 6));
  const rings = [0.46, 0.36, 0.26].map((r) => {
    const o = new THREE.Group();
    g.add(o);
    const m = new THREE.Mesh(D.geo(new THREE.TorusGeometry(r, 0.04, 8, 36)), mR);
    m.rotation.x = Math.PI / 2;
    o.add(m);
    for (const s of [1, -1]) {
      const k = new THREE.Mesh(gKnob, mO);
      k.position.set(s * r, 0, 0);
      o.add(k);
    }
    return o;
  });
  const orb = new THREE.Mesh(D.geo(new THREE.SphereGeometry(0.12, 14, 10)), mO);
  g.add(orb);
  const halo = D.sprite(tex.glow, 0.9, 0.9, P.mech.t, { opacity: 0, add: true });
  g.add(halo);

  return {
    group: g,
    set(e, spin) {
      const c = clamp(e, 0, 1.25), k = clamp(e, 0, 1);
      setTri(mR, mixPal(P.idle, P.mech, k));
      setTri(mO, mixPal(P.idle, P.mechLight ?? P.mech, k));
      rings.forEach((o, i) => {
        o.position.y = 0.12 + i * 0.02 + 0.34 * c;
        o.rotation.set(0, 0, 0);
        o.rotateY(spin * (1 + i * 0.7) * (i % 2 ? -1 : 1) + i);
        o.rotateX(c * [0.35, 1.05, 1.5][i]);
      });
      orb.position.y = 0.12 + 0.34 * c;
      orb.scale.setScalar(0.7 + 0.5 * k);
      halo.position.y = orb.position.y;
      (halo.material as THREE.SpriteMaterial).opacity = 0.7 * k;
    },
  };
}

export function createBloom(kind: BloomKind, P: ThemeDef, D: LevelDisposer, tex: SharedTextures): BloomRig {
  switch (kind) {
    case 'flower': return bloomFlower(P, D);
    case 'helm': return bloomHelm(P, D);
    case 'crystal': return bloomCrystal(P, D);
    case 'lantern': return bloomLantern(P, D, tex);
    case 'clock': return bloomClock(P, D);
    case 'gyro': return bloomGyro(P, D, tex);
    case 'iris':
    default: return bloomIris(P, D);
  }
}

/* ---------- Themed Wheel (with Profile Color Accent) ---------- */

interface WheelStyle {
  tire: string;
  rim: string;
  spoke: string;
  hub: string;
  line: string;
  style: 'spokes' | 'petals' | 'tiles' | 'star' | 'lantern' | 'gear';
  glow?: string;
}

const WHEEL_STYLES: Record<ThemeId, WheelStyle> = {
  dusk: { tire: '#2A2640', rim: '#FF8E6E', spoke: '#FFF4EC', hub: '#FFD15C', line: '#FFFFFF', style: 'spokes' },
  garden: { tire: '#5A2C4A', rim: '#FF6FA5', spoke: '#FFE3EE', hub: '#FFD84D', line: '#FFFFFF', style: 'petals' },
  town: { tire: '#1F3A6B', rim: '#F2F6FF', spoke: '#E9864F', hub: '#E9864F', line: '#FFFFFF', style: 'tiles' },
  prism: { tire: '#FFF6D6', rim: '#FFD43B', spoke: '#FFFFFF', hub: '#FF5FB0', line: '#2A0F45', style: 'star', glow: '#FFE25A' },
  night: { tire: '#FFE6A8', rim: '#FFC861', spoke: '#FFF7E0', hub: '#FF8A3D', line: '#0B0D24', style: 'lantern', glow: '#FFC861' },
  brass: { tire: '#F6EBD2', rim: '#F7BE3E', spoke: '#2A1A08', hub: '#B1332A', line: '#1E140B', style: 'gear' },
  cube: { tire: '#24314F', rim: '#45C7B2', spoke: '#FFFFFF', hub: '#FFC94D', line: '#FFFFFF', style: 'spokes' },
};

export interface WheelRig {
  root: THREE.Group;
  spin: THREE.Group;
  shadow: THREE.Mesh;
}

export function makeWheel(th: ThemeDef, riderColor: string | undefined, D: LevelDisposer, tex: SharedTextures): WheelRig {
  const w = WHEEL_STYLES[th.id] ?? WHEEL_STYLES.dusk;
  // Blend rider's profile.color softly into the rim & hub so the rider sees their personal accent while preserving contrast
  const rimCol = riderColor && /^#[0-9a-fA-F]{6}$/.test(riderColor) ? mixHex(w.rim, riderColor, 0.55) : w.rim;
  const hubCol = riderColor && /^#[0-9a-fA-F]{6}$/.test(riderColor) ? mixHex(w.hub, riderColor, 0.45) : w.hub;

  const root = new THREE.Group();
  const spin = new THREE.Group();
  root.add(spin);
  spin.position.y = 0.37;

  const outline = new THREE.Mesh(
    D.geo(new THREE.TorusGeometry(0.29, 0.11, 10, 28)),
    D.mat(new THREE.MeshBasicMaterial({ color: w.line, side: THREE.BackSide })),
  );
  spin.add(outline);

  spin.add(new THREE.Mesh(D.geo(new THREE.TorusGeometry(0.29, 0.075, 10, 28)), D.tri(tone(w.tire, 0.9, 0.78))));
  spin.add(new THREE.Mesh(D.geo(new THREE.TorusGeometry(0.215, 0.03, 6, 28)), D.tri(tone(rimCol, 0.86, 0.72))));

  const spMat = D.tri(tone(w.spoke, 0.9, 0.8));
  if (w.style === 'petals') {
    const pGeo = D.geo(new THREE.CircleGeometry(0.075, 10));
    const pMat = D.basic(w.spoke, { side: true });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      const m = new THREE.Mesh(pGeo, pMat);
      m.scale.set(1.5, 0.8, 1);
      m.position.set(Math.cos(a) * 0.11, Math.sin(a) * 0.11, 0);
      m.rotation.z = a;
      spin.add(m);
    }
  } else if (w.style === 'star') {
    const sGeo = D.geo(new THREE.OctahedronGeometry(0.1, 0));
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(sGeo, spMat);
      m.scale.set(2, 0.35, 0.3);
      m.rotation.z = (i * Math.PI) / 4;
      spin.add(m);
    }
  } else if (w.style === 'gear') {
    const gm = new THREE.Mesh(D.geo(gearGeo(0.19, 10, 0.05, 0.22, 0.07)), D.tri(tone(rimCol)));
    gm.rotation.x = Math.PI / 2;
    gm.position.z = 0.025;
    spin.add(gm);
  } else {
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(D.unitBox, spMat);
      s.scale.set(0.44, 0.03, 0.03);
      s.rotation.z = (i * Math.PI) / 3;
      spin.add(s);
    }
  }

  if (w.style === 'tiles') {
    const tGeo = D.geo(new THREE.BoxGeometry(0.05, 0.05, 0.16));
    const tMat = D.tri(tone(rimCol));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const m = new THREE.Mesh(tGeo, tMat);
      m.position.set(Math.cos(a) * 0.29, Math.sin(a) * 0.29, 0);
      spin.add(m);
    }
  }
  if (w.style === 'gear') {
    const gGeo = D.geo(new THREE.BoxGeometry(0.07, 0.07, 0.13));
    const gMat = D.tri(tone(rimCol));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const m = new THREE.Mesh(gGeo, gMat);
      m.position.set(Math.cos(a) * 0.37, Math.sin(a) * 0.37, 0);
      m.rotation.z = a;
      spin.add(m);
    }
  }

  const hub = new THREE.Mesh(D.geo(new THREE.CylinderGeometry(0.055, 0.055, 0.16, 12)), D.tri(tone(hubCol)));
  hub.rotation.x = Math.PI / 2;
  spin.add(hub);

  if (w.glow) {
    const gl = D.sprite(tex.glow, 1.3, 1.3, w.glow, { opacity: 0.55, add: true });
    gl.position.y = 0.37;
    root.add(gl);
  }

  const shadow = new THREE.Mesh(
    D.geo(new THREE.CircleGeometry(0.3, 20)),
    D.basic(th.ink || '#000000', { opacity: 0.2 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(1, 0.55, 1);
  shadow.position.y = 0.015;
  root.add(shadow);

  return { root, spin, shadow };
}

/* ---------- Goal Beacon ---------- */

export interface GoalRig {
  group: THREE.Group;
  place: (p: THREE.Vector3, n: THREE.Vector3, d: THREE.Vector3, camDir: THREE.Vector3, t: number) => void;
}

export function makeGoal(th: ThemeDef, D: LevelDisposer, tex: SharedTextures): GoalRig {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const goalP = tone(th.goal);
  const ink = th.ink || '#2A2640';

  const rim = new THREE.Mesh(
    D.geo(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 32)),
    D.tri(tone(mixHex(th.goal, '#FFFFFF', 0.78))),
  );
  rim.position.y = 0.03;
  body.add(rim);

  const pad = new THREE.Mesh(D.geo(new THREE.CylinderGeometry(0.38, 0.38, 0.07, 32)), D.tri(goalP));
  pad.position.y = 0.05;
  body.add(pad);

  const dot = new THREE.Mesh(
    D.geo(new THREE.CylinderGeometry(0.14, 0.14, 0.08, 20)),
    D.tri(tone(mixHex(th.goal, '#FFFFFF', 0.78))),
  );
  dot.position.y = 0.06;
  body.add(dot);

  const pole = new THREE.Mesh(D.geo(new THREE.CylinderGeometry(0.035, 0.035, 1.7, 8)), D.tri(tone(ink)));
  pole.position.set(0.55, 0.85, 0);
  body.add(pole);

  const knob = new THREE.Mesh(D.geo(new THREE.SphereGeometry(0.08, 10, 8)), D.tri(tone('#FFD15C')));
  knob.position.set(0.55, 1.74, 0);
  body.add(knob);

  const fgeo = D.geo(new THREE.PlaneGeometry(0.72, 0.42, 10, 1));
  fgeo.translate(0.36, 0, 0);
  const base = Float32Array.from(fgeo.attributes.position.array as Float32Array);
  const flag = new THREE.Mesh(fgeo, D.basic(th.goal, { side: true }));
  flag.position.set(0.55, 1.45, 0);
  body.add(flag);

  const edge = new THREE.Mesh(fgeo, D.basic(ink, { side: true }));
  edge.scale.set(1.06, 1.16, 1);
  edge.position.set(-0.02, 0, -0.006);
  flag.add(edge);

  const shaftMat = D.mat(
    new THREE.MeshBasicMaterial({
      color: th.goal,
      map: tex.shaft,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  const shaft = new THREE.Mesh(D.geo(new THREE.CylinderGeometry(0.34, 0.34, 5, 20, 1, true)), shaftMat);
  shaft.position.y = 2.5;
  body.add(shaft);

  const glow = D.sprite(tex.glow, 1.6, 1.6, th.goal, { opacity: 0.45, add: true });
  glow.position.y = 0.3;
  body.add(glow);

  const X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3(), Mx = new THREE.Matrix4();

  return {
    group,
    place(p, n, d, camDir, t) {
      Y.copy(n).normalize();
      X.copy(d).addScaledVector(Y, -d.dot(Y));
      if (X.lengthSq() < 1e-6) X.set(1, 0, 0);
      else X.normalize();
      Z.crossVectors(X, Y);
      group.position.copy(p);
      group.quaternion.setFromRotationMatrix(Mx.makeBasis(X, Y, Z));

      flag.rotation.y = Math.atan2(camDir.dot(X), camDir.dot(Z));
      const q = fgeo.attributes.position;
      for (let i = 0; i < q.count; i++) {
        const x0 = base[i * 3];
        q.setZ(i, Math.sin(x0 * 7 - t * 6) * 0.06 * (x0 / 0.72));
        q.setY(i, base[i * 3 + 1] - 0.05 * x0 * x0);
      }
      q.needsUpdate = true;
      const k = 1 + 0.06 * Math.sin(t * 3);
      pad.scale.set(k, 1, k);
      (glow.material as THREE.SpriteMaterial).opacity = 0.35 + 0.15 * Math.sin(t * 3);
      shaftMat.opacity = 0.26 + 0.08 * Math.sin(t * 2);
    },
  };
}

/* ---------- Road Ribbon Mesh Builder ---------- */

export interface RibbonOpts {
  lift?: number;
  x0?: number;
  dash?: [number, number];
  cull?: boolean;
  open?: [boolean, boolean];
}

export function makeRibbon(
  road: SimRoad,
  w: number,
  th: number,
  mat: THREE.Material,
  D: LevelDisposer,
  o: RibbonOpts = {},
): THREE.Mesh {
  const pos: number[] = [];
  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => {
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
  };
  const lift = o.lift ?? 0;
  const x0 = o.x0 ?? 0;

  const mid = (qs: THREE.Vector3[]): THREE.Vector3 => {
    const m = new THREE.Vector3();
    for (const v of qs) m.add(v);
    return m.multiplyScalar(1 / qs.length);
  };
  const oquad = (
    a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3,
    r1: THREE.Vector3[], r2: THREE.Vector3[],
  ) => {
    const ctr = mid([...r1, ...r2]);
    const nrm = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (nrm.dot(mid([a, b, c, d]).sub(ctr)) < 0) quad(a, d, c, b);
    else quad(a, b, c, d);
  };

  const cross = (i: number): [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3] => {
    const s = road.localS[i];
    const p = new THREE.Vector3(s.p[0], s.p[1], s.p[2]);
    const n = new THREE.Vector3(s.n[0], s.n[1], s.n[2]);
    const d = new THREE.Vector3(s.d[0], s.d[1], s.d[2]);
    const side = new THREE.Vector3().crossVectors(d, n);
    if (side.lengthSq() < 1e-8) side.set(1, 0, 0);
    else side.normalize();
    const top = p.clone().addScaledVector(n, lift).addScaledVector(side, x0);
    const bot = top.clone().addScaledVector(n, -th);
    return [
      top.clone().addScaledVector(side, w / 2),
      top.clone().addScaledVector(side, -w / 2),
      bot.clone().addScaledVector(side, -w / 2),
      bot.clone().addScaledVector(side, w / 2),
    ];
  };

  const count = road.localS.length;
  let flip = false;
  if (o.cull && count > 1) {
    const a = cross(0), b = cross(1);
    const nrm = new THREE.Vector3().subVectors(a[1], a[0]).cross(new THREE.Vector3().subVectors(b[1], a[0]));
    const n0 = road.localS[0].n;
    flip = nrm.x * n0[0] + nrm.y * n0[1] + nrm.z * n0[2] < 0;
  }

  for (let i = 0; i < count - 1; i++) {
    if (o.dash && (road.cum[i] % o.dash[0]) > o.dash[1]) continue;
    const a = cross(i), b = cross(i + 1);
    const faces = th > 0 ? 4 : 1;
    for (let k = 0; k < faces; k++) {
      if (flip) quad(a[k], b[k], b[(k + 1) % 4], a[(k + 1) % 4]);
      else quad(a[k], a[(k + 1) % 4], b[(k + 1) % 4], b[k]);
    }
  }

  if (th > 0 && !road.closed && count > 1) {
    const ends: ReadonlyArray<[number, number]> = [[0, 0], [count - 1, 1]];
    for (const [i, e] of ends) {
      if (o.open && o.open[e]) continue;
      const c = cross(i);
      if (o.cull) oquad(c[0], c[1], c[2], c[3], c, cross(e ? i - 1 : i + 1));
      else quad(c[0], c[1], c[2], c[3]);
    }
  }

  const geo = D.geo(new THREE.BufferGeometry());
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return new THREE.Mesh(geo, mat);
}
