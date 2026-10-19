// Stills 1–2: riding Highway 1, and fishing from the turnout.
import * as THREE from 'three';
import { buildCoast, roadX, roadY, edgeD, sample, SEA_LEVEL, T, COAST, type CoastWorld } from '../world/coast';
import { buildBars, buildRod, buildBike, buildBobber, KIT } from '../world/rider';
import { VoxelGrid } from '../voxel/grid';
import { makeStage, aimSun, addGrid, type Stage } from './stage';

const SKY = {
  zenith: 0x5aa9e0, horizon: 0xe9e4d6, fog: 0xdfe6e4, fogDensity: 0.0008,
  sunDir: new THREE.Vector3(0.55, 0.42, 0.6), sunColor: 0xfff0d2, sunI: 2.6, hemiSky: 0xc4e2f5, hemiGround: 0xb8975e, hemiI: 1.05,
};


function coastStage(canvas: HTMLCanvasElement, w: number, h: number, focus?: { x: number; z: number; r: number }): Stage {
  const st = makeStage(canvas, w, h, SKY);
  const world: CoastWorld = buildCoast(focus);
  const water = new Set([COAST.idx.sea, COAST.idx.sea2, COAST.idx.deep, COAST.idx.shallow]);
  const opts = { palette: COAST.linear, jitter: 0.06, jitterFor: (v: number) => (water.has(v) ? 0.025 : undefined) };
  if (world.close) addGrid(st, 'close 0.125 m', world.close, opts);
  addGrid(st, 'near 0.25 m', world.near, opts);
  addGrid(st, 'mid 1 m', world.mid, opts, st.scene, { cast: false, receive: true });
  addGrid(st, 'far 6 m', world.far, { ...opts, jitter: 0.04 }, st.scene, { cast: false, receive: false });
  addGrid(st, 'detail 1/16 m', world.detail, opts);
  world.props.forEach((g, i) => addGrid(st, `prop ${i}`, g, opts));
  // open sea beyond the voxel LODs
  const seaCol = new THREE.Color(COAST.hex.deep);
  const seaPlane = new THREE.Mesh(new THREE.PlaneGeometry(30000, 30000), new THREE.MeshLambertMaterial({ color: seaCol }));
  seaPlane.rotation.x = -Math.PI / 2; seaPlane.position.y = SEA_LEVEL + 0.2;
  st.scene.add(seaPlane);
  // a few gulls
  const birds = new VoxelGrid(0.1);
  const gull = (x: number, y: number, z: number, s: number) => {
    birds.wsegment([x - 0.5 * s, y + 0.12 * s, z], [x, y, z], 0.06 * s, COAST.idx.white);
    birds.wsegment([x + 0.5 * s, y + 0.12 * s, z], [x, y, z], 0.06 * s, COAST.idx.white);
    birds.wellipsoid([x, y - 0.02, z], [0.12 * s, 0.08 * s, 0.25 * s], COAST.idx.white);
  };
  gull(-38, 14, -80, 1.6); gull(-30, 17, -95, 1.5); gull(-55, 11, -60, 1.4);
  addGrid(st, 'gulls', birds, opts, st.scene, { cast: false, receive: false });
  return st;
}

function groundY(x: number, z: number) { return sample(x, z, { h: 0, t: T.ROAD, d: 0 }).h; }

export function stillHighway(canvas: HTMLCanvasElement, w: number, h: number): Stage {
  const z = 4, x = roadX(z) + 4.2;
  const st = coastStage(canvas, w, h, { x: x - 2, z: z - 14, r: 18 });
  st.camera.position.set(x, roadY(z) + 1.5, z);
  const tz = -70;
  st.camera.lookAt(roadX(tz) - 16, roadY(tz) - 5.5, tz);
  st.camera.updateMatrixWorld();
  aimSun(st, new THREE.Vector3(x, 0, z - 55), SKY.sunDir, 75);
  const bars = new THREE.Group();
  addGrid(st, 'bars+gloves', buildBars(), { palette: KIT.linear, jitter: 0.04 }, bars, { cast: false, receive: false });
  const pitch = st.camera.rotation.x;
  bars.position.set(0.0, -0.31, -0.46);
  bars.rotation.x = -pitch + 0.12;
  st.camera.add(bars);
  return st;
}

export function stillTurnout(canvas: HTMLCanvasElement, w: number, h: number): Stage {
  const z = -71, edgeX = roadX(z) + edgeD(z);
  const x = edgeX + 1.5, gy = groundY(x, z);
  const st = coastStage(canvas, w, h, { x: x - 8, z, r: 20 });
  st.camera.position.set(x, gy + 1.62, z);
  st.camera.lookAt(x - 30, SEA_LEVEL + 6, z - 4);
  st.camera.updateMatrixWorld();
  aimSun(st, new THREE.Vector3(x - 20, SEA_LEVEL, z - 10), SKY.sunDir, 70);
  // the bike leaned on the fence, at the left of frame
  const bikeG = new VoxelGrid(0.02);
  const bz = z - 4.6, bxF = roadX(bz) + edgeD(bz) + 0.9;
  buildBike(bikeG, [bxF + 0.32, groundY(bxF + 0.32, bz), bz], -0.16);
  addGrid(st, 'bike', bikeG, { palette: KIT.linear, jitter: 0.03 });
  // bobber + ripple rings out on the water
  const bob = new THREE.Vector3(x - 30, SEA_LEVEL + 0.06, z + 2.5);
  const fx = new VoxelGrid(1 / 16);
  for (const [r, c] of [[0.6, COAST.idx.foam], [1.1, COAST.idx.foam2], [1.7, COAST.idx.foam2]] as const) {
    for (let a = 0; a < Math.PI * 2; a += 0.05) fx.wbox([bob.x + Math.cos(a) * r - 0.07, SEA_LEVEL + 0.0, bob.z + Math.sin(a) * r - 0.07], [bob.x + Math.cos(a) * r + 0.07, SEA_LEVEL + 0.07, bob.z + Math.sin(a) * r + 0.07], c);
  }
  addGrid(st, 'bobber', fx, { palette: COAST.linear, jitter: 0 }, st.scene, { cast: false, receive: false });
  const bobK = new VoxelGrid(1 / 16); buildBobber(bobK, [bob.x, bob.y + 0.12, bob.z], 0.3);
  addGrid(st, 'bobber-paint', bobK, { palette: KIT.linear, jitter: 0 }, st.scene, { cast: false, receive: false });
  // rod in hand
  const rodG = new THREE.Group();
  const rod = buildRod([-0.3, 0.8, -1], 2.15);
  addGrid(st, 'rod+gloves', rod.grid, { palette: KIT.linear, jitter: 0.04 }, rodG, { cast: false, receive: false });
  rodG.position.set(0.15, -0.23, -0.42);
  st.camera.add(rodG);
  st.camera.updateMatrixWorld(true);
  const tip = rodG.localToWorld(new THREE.Vector3(...rod.tip));
  // monofilament: a sagging curve from the tip to the bobber
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40, p = tip.clone().lerp(bob, t);
    p.y -= Math.sin(Math.PI * t) * 0.5;
    pts.push(p);
  }
  st.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xf6f6f6, transparent: true, opacity: 0.85, fog: false })));
  return st;
}
