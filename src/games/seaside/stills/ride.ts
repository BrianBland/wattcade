// Motion test: 10 s riding Highway 1, cut to the turnout for a cast, bite and pull (~12 s).
// Everything is a pure function of t (setTime), so the capture script can step it frame by frame.
import * as THREE from 'three';
import { buildCoast, roadX, roadY, edgeD, sample, SEA_LEVEL, T, COAST, COAST_FOLD } from '../world/coast';
import { buildBars, buildRod, buildRodPiece, buildBobber, KIT } from '../world/rider';
import { buildFish, FISH } from '../world/fish';
import { VoxelGrid } from '../voxel/grid';
import { makeStage, aimSun, addGrid, type Stage } from './stage';
import { voxelMaterial } from '../voxel/three';
import { TerrainLOD } from '../world/terrainLOD';
import { SunShadow } from '../world/sunShadow';

export interface Knobs { decor?: number; routeLod?: number; hyst?: number; fade?: number; road?: boolean; cluster?: number; workers?: number; bake?: boolean; lodK?: number; lodRes?: number; lodMin?: number; skirt?: number; aoFrom?: number; lod?: boolean; farAO?: boolean; mid: boolean; far: boolean; shadows: boolean; close: boolean; greedy?: 0 | 1 | 2; midVoxel?: number; farVoxel?: number; shadowMap?: number }
export interface Overlay { bubble?: string; prompt?: string; meter?: number; fade?: number; bang?: boolean }
export interface Ride { stage: Stage; duration: number; setTime(t: number): void; overlay(t: number): Overlay; terrain: TerrainLOD | null }

const SKY = {
  zenith: 0x5aa9e0, horizon: 0xe9e4d6, fog: 0xdfe6e4, fogDensity: 0.0008,
  sunDir: new THREE.Vector3(0.55, 0.42, 0.6), sunColor: 0xfff0d2, sunI: 2.6, hemiSky: 0xc4e2f5, hemiGround: 0xb8975e, hemiI: 1.05,
};
const RIDE_S = 10, FISH_S = 13.5, SPEED = 8.5, CADENCE = 86;
const W = COAST.idx;
const WATER = new Set([W.sea, W.sea2, W.deep, W.shallow, W.foam, W.foam2, W.kelp, W.kelp2]);
const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const seg01 = (u: number, a: number, b: number) => Math.max(0, Math.min(1, (u - a) / (b - a)));
const groundY = (x: number, z: number) => sample(x, z, { h: 0, t: T.ROAD, d: 0 }).h;

export function createRide(canvas: HTMLCanvasElement, w: number, h: number, knobs: Knobs): Ride {
  const st = makeStage(canvas, w, h, SKY);
  st.renderer.shadowMap.enabled = knobs.shadows;
  const world = buildCoast(knobs.close && !knobs.lod ? { x: -12, z: -36, r: 46 } : undefined, { mid: knobs.midVoxel, far: knobs.farVoxel, terrain: !knobs.lod });
  if (knobs.shadowMap) st.sun.shadow.mapSize.set(knobs.shadowMap, knobs.shadowMap);
  const jit = { palette: COAST.linear, jitter: 0.06, jitterFor: (v: number) => (WATER.has(v) ? 0.025 : undefined) };
  const land = { ...jit, include: (v: number) => !WATER.has(v) }, water = { ...jit, include: (v: number) => WATER.has(v) };
  // water gets its own material: a travelling swell displaces the voxel tops and brightens the crests
  const uTime = { value: 0 };
  const waterMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  waterMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = 'uniform float uTime;\nvarying float vWave;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float wv = sin(dot(position.xz, vec2(0.23, 0.11)) - uTime * 1.4) * 0.6 + sin(dot(position.xz, vec2(-0.07, 0.29)) - uTime * 2.0) * 0.4;
      transformed.y += wv * 0.09;
      vWave = wv;`);
    sh.fragmentShader = 'varying float vWave;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= 1.0 + 0.09 * vWave;');
  };
  let terrain: TerrainLOD | null = null;
  if (knobs.lod) {
    const tb = performance.now();
    const sun = knobs.bake ? new SunShadow(SKY.sunDir, (x, z) => Math.max(sample(x, z, { h: 0, t: T.ROAD, d: 0 }).h, SEA_LEVEL), [
      { cell: 8, x0: -2400, x1: 1800, z0: -3600, z1: 160 }, { cell: 2, x0: -420, x1: 420, z0: -820, z1: 140 }, { cell: 0.25, x0: -70, x1: 50, z0: -110, z1: 20 },
    ]) : undefined;
    if (sun) st.stats.push(`sun shadow field: ${Math.round(performance.now() - tb)} ms`);
    // route = the road centre line (and the turnout spot): tiles beside it keep their detail as the rider passes
    const routeDist = (x0: number, z0: number, S: number) => {
      let best = Infinity;
      for (let i = 0; i <= 4; i++) { const z = Math.min(120, Math.max(-3600, z0 + (S * i) / 4)), rx = roadX(z); best = Math.min(best, Math.max(0, x0 - rx, rx - (x0 + S)) + Math.max(0, z0 - 120, -3600 - (z0 + S))); }
      return best;
    };
    terrain = new TerrainLOD({ decor: knobs.decor, route: knobs.routeLod ? routeDist : undefined, routeAlpha: knobs.routeLod || 3, hysteresis: knobs.hyst, fade: knobs.fade, road: knobs.road ? {} : undefined, cluster: knobs.cluster, workers: knobs.workers, sun, water: { time: uTime, amp: 0.09 }, splitK: knobs.lodK, res: knobs.lodRes, minTile: knobs.lodMin, skirt: knobs.skirt, flatAOFrom: knobs.aoFrom });
    st.scene.add(terrain.root);
    // props only (trees, scrub clumps, rails, signs): greedy, folded colours, shader noise
    for (const [name, g] of [['props 0.25', world.near], ['props 1', world.mid]] as const)
      addGrid(st, name, g, { ...jit, greedy: true, remap: COAST_FOLD }, st.scene, { cast: g.size < 1, receive: true }, voxelMaterial({ size: g.size, jitter: 0.1 }));
  }
  const layers: Array<[string, VoxelGrid | null, boolean]> = knobs.lod ? [] : [['close', world.close, true], ['near', world.near, true], ['mid', knobs.mid ? world.mid : null, false], ['far', knobs.far ? world.far : null, false]];
  for (const [name, g, cast] of layers) {
    if (!g) continue;
    if (knobs.greedy) {
      const fold = knobs.greedy === 2 ? COAST_FOLD : undefined;
      const flatAO = knobs.farAO === false && (name === 'mid' || name === 'far');
      addGrid(st, `${name} land`, g, { ...land, greedy: true, remap: fold, flatAO }, st.scene, { cast, receive: name !== 'far' }, voxelMaterial({ size: g.size, jitter: fold ? 0.1 : 0.06 }));
      addGrid(st, `${name} water`, g, { ...water, greedy: true }, st.scene, { cast: false, receive: name !== 'far' }, voxelMaterial({ size: g.size, jitter: 0.025, wave: { time: uTime, amp: 0.09 } }));
    } else {
      addGrid(st, `${name} land`, g, land, st.scene, { cast, receive: name !== 'far' });
      addGrid(st, `${name} water`, g, water, st.scene, { cast: false, receive: name !== 'far' }, waterMat);
    }
  }
  if (knobs.greedy) addGrid(st, 'detail', world.detail, { ...jit, greedy: true, remap: knobs.greedy === 2 ? COAST_FOLD : undefined }, st.scene, undefined, voxelMaterial({ size: world.detail.size, jitter: 0.06 }));
  else addGrid(st, 'detail', world.detail, jit);
  world.props.forEach((g, i) => addGrid(st, `prop ${i}`, g, jit));
  const seaPlane = new THREE.Mesh(new THREE.PlaneGeometry(30000, 30000), new THREE.MeshLambertMaterial({ color: new THREE.Color(COAST.hex.deep) }));
  seaPlane.rotation.x = -Math.PI / 2; seaPlane.position.y = SEA_LEVEL - 0.5; st.scene.add(seaPlane);
  // open sea is a backdrop: drawn first, never occludes the voxel water (a 30 km quad z-fights badly otherwise)
  (seaPlane.material as THREE.Material).depthWrite = false; seaPlane.renderOrder = -0.5;

  // gulls wheeling over the water
  const gullG = new VoxelGrid(0.06);
  gullG.wsegment([-0.5, 0.12, 0], [0, 0, 0], 0.05, W.white); gullG.wsegment([0.5, 0.12, 0], [0, 0, 0], 0.05, W.white); gullG.wellipsoid([0, -0.02, 0], [0.1, 0.07, 0.22], W.white);
  const gulls = [0, 1, 2].map((i) => { const grp = new THREE.Group(); grp.scale.setScalar(1.5); addGrid(st, `gull ${i}`, gullG, jit, grp, { cast: false, receive: false }); st.scene.add(grp); return grp; });

  // first-person bars
  const bars = new THREE.Group();
  addGrid(st, 'bars', buildBars(), { palette: KIT.linear, jitter: 0.04 }, bars, { cast: false, receive: false });
  // articulated rod: handle + gloves, then a chain of blank pieces that can bend
  const rodG = new THREE.Group();
  const dir = new THREE.Vector3(-0.3, 0.8, -1).normalize();
  addGrid(st, 'rod handle', buildRod([dir.x, dir.y, dir.z], 2.15, false).grid, { palette: KIT.linear, jitter: 0.04 }, rodG, { cast: false, receive: false });
  const blankRoot = new THREE.Group();
  blankRoot.position.copy(dir).multiplyScalar(0.07);
  blankRoot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  rodG.add(blankRoot);
  const N = 7, PL = (2.15 - 0.07) / N, joints: THREE.Group[] = [];
  let parent: THREE.Object3D = blankRoot;
  for (let i = 0; i < N; i++) {
    const j = new THREE.Group(); if (i) j.position.y = PL; parent.add(j); joints.push(j);
    const r0 = 0.011 - 0.0075 * (i / N), r1 = 0.011 - 0.0075 * ((i + 1) / N);
    addGrid(st, `rod ${i}`, buildRodPiece(PL, r0, r1, i % 2 ? PL * 0.5 : null), { palette: KIT.linear, jitter: 0.03 }, j, { cast: false, receive: false });
    parent = j;
  }
  const tipObj = new THREE.Object3D(); tipObj.position.y = PL; parent.add(tipObj);
  const bendAxisCam = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, -1, -0.6).normalize()).normalize();
  const bendAxisLocal = bendAxisCam.clone().applyQuaternion(blankRoot.quaternion.clone().invert());

  // bobber, fish, line, rings, splash
  const bobber = new THREE.Group();
  const bobK = new VoxelGrid(1 / 32); buildBobber(bobK, [0, 0.1, 0], 0.22);
  addGrid(st, 'bobber', bobK, { palette: KIT.linear, jitter: 0 }, bobber, { cast: false, receive: false });
  st.scene.add(bobber);
  const fish = new THREE.Group();
  addGrid(st, 'fish', buildFish('perch', 0.34), { palette: FISH.linear, jitter: 0.03 }, fish, { cast: false, receive: false });
  fish.scale.setScalar(1.5); st.scene.add(fish);
  const linePts = Array.from({ length: 41 }, () => new THREE.Vector3());
  const lineGeo = new THREE.BufferGeometry().setFromPoints(linePts);
  st.scene.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xf6f6f6, transparent: true, opacity: 0.9, fog: false })));
  const ringG = new VoxelGrid(1 / 16);
  for (let a = 0; a < Math.PI * 2; a += 0.04) ringG.wbox([Math.cos(a) - 0.05, 0, Math.sin(a) - 0.05], [Math.cos(a) + 0.05, 0.05, Math.sin(a) + 0.05], W.foam);
  const rings = Array.from({ length: 6 }, (_, i) => {
    const grp = new THREE.Group(); const mat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true });
    addGrid(st, `ring ${i}`, ringG, { palette: COAST.linear, jitter: 0 }, grp, { cast: false, receive: false }, mat);
    st.scene.add(grp); return { grp, mat };
  });
  const splash = new THREE.InstancedMesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), new THREE.MeshLambertMaterial({ color: 0xf4fbff }), 64);
  splash.frustumCulled = false; st.scene.add(splash);

  // turnout camera + where things land
  const tz = -71, tx = roadX(tz) + edgeD(tz) + 1.5, tgy = groundY(tx, tz);
  const target = new THREE.Vector3(tx - 30, SEA_LEVEL, tz + 2.5), shore = new THREE.Vector3(tx - 19, SEA_LEVEL, tz + 0.5);
  aimSun(st, new THREE.Vector3(-10, 0, -40), SKY.sunDir, 70);
  const splashEvents = (u: number) => [3.3, 7.4, 10.25, 10.8].map((t0, i) => ({ t0, age: u - t0, at: i === 0 ? target : i === 1 ? target : shore, big: i >= 2 }));
  const tmp = new THREE.Vector3(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion();

  function setTime(t: number) {
    uTime.value = t;
    const cam = st.camera, ph = (t * CADENCE) / 60 * Math.PI * 2;
    gulls.forEach((g, i) => { const a = t * 0.25 + i * 2.1; g.position.set(-40 + Math.cos(a) * (14 + i * 4), 12 + i * 2.5 + Math.sin(a * 2) * 0.6, -70 + Math.sin(a) * (16 + i * 3)); g.rotation.y = -a; g.scale.y = 1.5 * (0.8 + 0.2 * Math.sin(t * 7 + i)); });
    const riding = t < RIDE_S;
    bars.visible = riding; rodG.visible = bobber.visible = !riding; lineGeo.setDrawRange(0, riding ? 0 : 41);
    fish.visible = false; rings.forEach((r) => (r.grp.visible = false)); splash.count = 0;
    if (riding) {
      if (bars.parent !== cam) cam.add(bars);
      const z = 6 - SPEED * t, x = roadX(z) + 4.2;
      cam.position.set(x, roadY(z) + 1.5 + Math.sin(ph * 2) * 0.008, z);
      const lz = z - 74; cam.lookAt(roadX(lz) - 16, roadY(lz) - 5.5, lz);
      cam.rotateZ(Math.sin(ph) * 0.006);
      cam.updateMatrixWorld();
      bars.position.set(0, -0.31 + Math.sin(ph * 2) * 0.003, -0.46);
      bars.rotation.set(-cam.rotation.x + 0.12, 0, Math.sin(ph) * 0.02);
      aimSun(st, new THREE.Vector3(x, 0, z - 55), SKY.sunDir, 75);
      // prefetch where the rider will be in ~1.5 s and 3 s (and the turnout shot as the cut approaches)
      const ahead = [1.5, 3].map((dt) => { const zz = 6 - SPEED * (t + dt); return new THREE.Vector3(roadX(zz) + 4.2, roadY(zz) + 1.5, zz); });
      if (t > RIDE_S - 3) ahead.push(new THREE.Vector3(tx, tgy + 1.62, tz));
      terrain?.update(cam.position, ahead, t);
      return;
    }
    const u = t - RIDE_S;
    if (rodG.parent !== cam) cam.add(rodG);
    rodG.visible = true;
    cam.position.set(tx, tgy + 1.62 + Math.sin(u * 1.3) * 0.006, tz);
    const follow = ease(seg01(u, 7.6, 9.4)) * (1 - ease(seg01(u, 11.3, 12)));
    cam.lookAt(tx - 30 + 9 * follow, SEA_LEVEL + 6 - 6.5 * follow, tz - 4 + 4 * follow); // tilt down to follow the line

    cam.rotateY(Math.sin(u * 0.6) * 0.006);
    aimSun(st, new THREE.Vector3(tx - 20, SEA_LEVEL, tz - 10), SKY.sunDir, 70);
    // rod swing: wind up, cast, settle; pull = rod raised and bucking
    const windup = ease(seg01(u, 0.2, 0.9)), cast = ease(seg01(u, 0.95, 1.35));
    const pulling = seg01(u, 7.5, 7.8);
    const haul = ease(seg01(u, 10.7, 11.9));
    let swing = -0.95 * windup * (1 - cast) + 0.18 * cast - 0.35 * pulling - 0.25 * haul + Math.sin(u * 9) * 0.03 * pulling * (1 - haul);
    swing -= 0.06 * Math.exp(-((u - 7.35) ** 2) * 60); // flinch on the strike
    rodG.position.set(0.15, -0.23 + 0.05 * pulling, -0.42);
    rodG.quaternion.setFromAxisAngle(bendAxisCam, swing);
    // blank bend per joint: sag at rest, whip on the cast, nibbles, then a heavy load
    const whip = Math.sin(seg01(u, 0.95, 1.6) * Math.PI) * -0.07;
    const nib = (Math.exp(-((u - 6.65) ** 2) * 400) + Math.exp(-((u - 7.0) ** 2) * 400)) * 0.05;
    const load = pulling * (1 - 0.6 * haul) * (0.11 + 0.03 * Math.sin(u * 11) + 0.03 * Math.sin(u * 4.3));
    const bendPer = 0.012 + whip + nib + load;
    joints.forEach((j, i) => j.quaternion.setFromAxisAngle(bendAxisLocal, bendPer * (0.4 + (i / N) * 1.2)));
    cam.updateMatrixWorld(true);
    const tip = tipObj.getWorldPosition(new THREE.Vector3());
    // bobber / hook position by phase
    let end = new THREE.Vector3(), sag = 0.5, bobVisible = true;
    if (u < 1.35) end.copy(tip).add(new THREE.Vector3(0, -0.35, 0));
    else if (u < 3.3) {
      const s = ease(seg01(u, 1.35, 3.3) ** 0.85), start = tip.clone().add(new THREE.Vector3(0, -0.2, 0));
      end.lerpVectors(start, target, s); end.y += Math.sin(s * Math.PI) * 6; sag = 0.05;
    } else if (u < 7.4) {
      end.copy(target); end.y += 0.02 * Math.sin(u * 2.2) - nib * 3; sag = 0.6 - 0.4 * seg01(u, 6.5, 7.3);
    } else {
      const s = ease(seg01(u, 7.6, 10.6));
      end.lerpVectors(target, shore, s); end.z += Math.sin(u * 2.6) * 2.2 * (1 - s); end.y = SEA_LEVEL - 0.35 - 0.25 * Math.sin(u * 3);
      sag = 0; bobVisible = u < 7.55;
      if (u >= 10.25) { // the fish breaks the surface, then gets hauled up the cliff to dangle in front of you
        fish.visible = true;
        const k = seg01(u, 10.25, 10.75);
        const leap = new THREE.Vector3(shore.x + 1.2 * k, SEA_LEVEL + Math.sin(k * Math.PI) * 1.6, shore.z - 0.4 * k);
        const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
        const hang = cam.position.clone().addScaledVector(fwd, 1.9).add(new THREE.Vector3(0, -0.15, 0)).addScaledVector(new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize(), -0.25);
        fish.position.lerpVectors(leap, hang, haul);
        fish.position.y += Math.sin(haul * Math.PI) * 2.5;
        const sway = Math.sin(u * 5.5) * (0.25 + 0.4 * haul);
        fish.rotation.set(0, Math.PI * 0.5 + sway * 0.6, (haul > 0.5 ? Math.PI * 0.5 : 0.9 - 1.8 * k) + Math.sin(u * 23) * 0.35 * (1 - 0.6 * haul));
        end.copy(fish.position).add(new THREE.Vector3(0, haul > 0.5 ? 0.25 : 0, 0));
        sag = 0;
      }
    }
    bobber.visible = bobVisible;
    bobber.position.copy(end);
    if (u >= 7.4 && u < 7.55) bobber.position.y -= (u - 7.4) * 6;
    for (let i = 0; i <= 40; i++) { const k = i / 40; linePts[i].lerpVectors(tip, end, k); linePts[i].y -= Math.sin(Math.PI * k) * sag; }
    lineGeo.setFromPoints(linePts);
    // rings + splash particles
    let ri = 0, si = 0;
    for (const ev of splashEvents(u)) {
      if (ev.age < 0 || ev.age > 1.6) continue;
      const r = rings[ri++ % rings.length];
      r.grp.visible = true; r.grp.position.set(ev.at.x, SEA_LEVEL + 0.02, ev.at.z); r.grp.scale.setScalar(0.3 + ev.age * (ev.big ? 2.2 : 1.6)); r.mat.opacity = 1 - ev.age / 1.6;
      if (ev.age < 0.9) for (let p = 0; p < (ev.big ? 22 : 12) && si < 64; p++) {
        const a = p * 2.39, sp = (ev.big ? 2.4 : 1.4) * (0.6 + ((p * 37) % 10) / 20), up = (ev.big ? 4.2 : 2.6) * (0.6 + ((p * 53) % 10) / 25);
        tmp.set(ev.at.x + Math.cos(a) * sp * ev.age, SEA_LEVEL + up * ev.age - 4.9 * ev.age * ev.age, ev.at.z + Math.sin(a) * sp * ev.age);
        if (tmp.y < SEA_LEVEL - 0.05) continue;
        m4.compose(tmp, q, new THREE.Vector3(1, 1, 1).multiplyScalar(1 - ev.age)); splash.setMatrixAt(si++, m4);
      }
    }
    splash.count = si; splash.instanceMatrix.needsUpdate = true;
    terrain?.update(cam.position, [], t);
  }

  function overlay(t: number): Overlay {
    const o: Overlay = {};
    const f = Math.abs(t - RIDE_S); if (f < 0.35) o.fade = 1 - f / 0.35;
    if (t < RIDE_S) { if (t > 1.2 && t < 5) o.bubble = 'Good day for it.'; if (t > 6.5 && t < 9.4) o.bubble = 'Turnout coming up.'; return o; }
    const u = t - RIDE_S;
    if (u < 0.95) o.prompt = 'Ⓐ cast';
    if (u > 3.8 && u < 6.3) o.bubble = 'Lunch, maybe.';
    if (u > 7.35 && u < 7.9) o.bang = true;
    if (u > 7.6 && u < 11.2) { o.prompt = 'PULL!'; o.meter = ease(seg01(u, 7.6, 10.9)); }
    if (u > 12) o.bubble = 'That counts.';
    return o;
  }
  setTime(0);
  return { stage: st, duration: RIDE_S + FISH_S, setTime, overlay, terrain };
}
