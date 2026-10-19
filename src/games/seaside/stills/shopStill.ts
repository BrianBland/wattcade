// Still 3: Lou's Bait & Tackle — locked counter view (voxel diorama) with a paper UI overlay.
import * as THREE from 'three';
import { VoxelGrid } from '../voxel/grid';
import { definePalette } from '../voxel/palette';
import { hash2 } from '../voxel/noise';
import { makeStage, aimSun, addGrid, type Stage } from './stage';
import { buildLou, LOU } from '../world/lou';

const SHOP = definePalette({
  floor: 0xb07a4c, floor2: 0xa36f43, floor3: 0xbb8554, gap: 0x6e4a2c,
  wall: 0x3fa8a0, wall2: 0x3a9d95, wallTrim: 0xf3eee2, wains: 0xc99b66, wains2: 0xbd8f5b, beam: 0x8a5a36, ceiling: 0xe9e1cf,
  counterTop: 0x7c4b2a, counterTop2: 0x87532f, counterFront: 0xd9a46a, counterFront2: 0xcf9960,
  cork: 0xc8925a, cork2: 0xbd874f, paper: 0xf6f1e3, paperY: 0xf5dc6a, paperB: 0xa7d3ef, pin: 0xe0402f,
  earthB: 0x2f7fd8, earthG: 0x4caf50, earthW: 0xffffff, mask: 0x8a5531, mask2: 0x6b3f22, maskDark: 0x2a1a10,
  peg: 0xd8bb8a, pegHole: 0x9c8058, lureR: 0xef3b36, lureY: 0xffc928, lureG: 0x37c46a, lureP: 0xd94fd0, lureO: 0xff8a2a, lureB: 0x2c8cf2, chrome: 0xd6dbe0,
  rodR: 0xd93a2e, rodY: 0xf2c12e, rodB: 0x2a6fd6, rodG: 0x2f9e57, rodW: 0xeeeeea, rodK: 0x2a2a2e, corkH: 0xcfa36a, reel: 0x2b2d31,
  boxG: 0x3f9b55, boxO: 0xf08a2e, boxLid: 0x2f7a43,
  fridge: 0xd8423a, fridgeGlass: 0x9fd6e8, fridgeIn: 0xf4f4ec, cupW: 0xf2f2ea, cupLid: 0x3a7bd5,
  scaleW: 0xeeeeea, scaleDial: 0xd9352b, scaleFace: 0xfafaf2,
  fishR: 0xe8603c, fishR2: 0xd84f2f, fishBelly: 0xf6c29a, fishS: 0x9fb8b0, fishS2: 0x86a39a, fishEye: 0x151515, fishFin: 0xf08a5c,
  register: 0x9fd1c0, register2: 0x7fb8a6, keys: 0xf6f3ea, radio: 0xf28c38, radioGrill: 0x3a2e28, bell: 0xc9ced3, wrap: 0xf4efe0,
  skin: 0xc29473, skin2: 0xa87a5c, hair: 0xe9e6e0, hat: 0x6f7f45, hat2: 0x5f6e39, glasses: 0x1e1e22, eye: 0x1b1b1b, mouth: 0x8a4a3a,
  flannelR: 0xc9353a, flannelK: 0x2a2f45, flannelL: 0xe06a5e, apron: 0xc8b48a, apron2: 0xb9a57c,
  lamp: 0xf2b134, lampIn: 0xfff3c4, fan: 0x3b3027, frame: 0xf6f3ea, glass: 0xbfe6f0, chain: 0x8f949a,
});
const S = SHOP.idx;

function room(g: VoxelGrid) {
  const X0 = -2.8, X1 = 2.8, Z0 = -3.4, Z1 = 1.6, Y1 = 3.0;
  // floor planks run front-to-back
  g.wbox([X0, -0.08, Z0], [X1, 0, Z1], S.floor);
  for (let x = g.vi(X0, 0); x <= g.vi(X1, 0); x++) for (let z = g.vi(Z0, 2); z <= g.vi(Z1, 2); z++) {
    const plank = Math.floor((x * g.size + 10) / 0.18), seam = Math.floor((z * g.size + plank * 0.7 + 10) / 1.6);
    const edge = (x * g.size + 10) % 0.18 < g.size;
    const r = hash2(plank, seam, 3);
    g.set(x, g.vi(-0.02, 1), z, edge ? S.gap : r < 0.33 ? S.floor : r < 0.66 ? S.floor2 : S.floor3);
  }
  // back + side walls: wainscot below 1.0 m, painted teal planks above
  const wallC = (u: number, y: number) => (y < 0.96 ? (Math.floor(u / 0.14) % 2 ? S.wains : S.wains2) : y < 1.02 ? S.wallTrim : Math.floor(u / 0.2) % 2 ? S.wall : S.wall2);
  for (let x = g.vi(X0, 0); x <= g.vi(X1, 0); x++) for (let y = 0; y <= g.vi(Y1, 1); y++) {
    const wx = x * g.size, wy = y * g.size;
    for (let t = 0; t < 2; t++) g.set(x, y, g.vi(Z0, 2) - t, wallC(wx + 10, wy));
  }
  for (let z = g.vi(Z0, 2); z <= g.vi(Z1, 2); z++) for (let y = 0; y <= g.vi(Y1, 1); y++) {
    const wz = z * g.size, wy = y * g.size;
    const win = wz > -2.7 && wz < -1.0 && wy > 1.15 && wy < 2.25;
    for (let t = 0; t < 2; t++) {
      if (!win) g.set(g.vi(X0, 0) - t, y, z, wallC(wz + 10, wy));
      g.set(g.vi(X1, 0) + t, y, z, wallC(wz + 10, wy));
    }
  }
  // window frame + cross bars
  g.wbox([X0 - 0.06, 1.1, -2.75], [X0 + 0.06, 1.16, -0.95], S.frame); g.wbox([X0 - 0.06, 2.24, -2.75], [X0 + 0.06, 2.3, -0.95], S.frame);
  g.wbox([X0 - 0.06, 1.1, -2.75], [X0 + 0.06, 2.3, -2.69], S.frame); g.wbox([X0 - 0.06, 1.1, -1.01], [X0 + 0.06, 2.3, -0.95], S.frame);
  g.wbox([X0 - 0.04, 1.1, -1.88], [X0 + 0.02, 2.3, -1.83], S.frame); g.wbox([X0 - 0.04, 1.68, -2.75], [X0 + 0.02, 1.72, -0.95], S.frame);
  g.wbox([X0 + 0.0, 1.06, -2.8], [X0 + 0.2, 1.1, -0.9], S.wallTrim); // sill
  // ceiling + beams
  g.wbox([X0, Y1, Z0], [X1, Y1 + 0.06, Z1], S.ceiling);
  for (const z of [-2.6, -1.4, -0.2, 1.0]) g.wbox([X0, Y1 - 0.16, z - 0.08], [X1, Y1, z + 0.08], S.beam);
}

function rods(g: VoxelGrid) {
  const cols = [S.rodR, S.rodY, S.rodB, S.rodG, S.rodW, S.rodK, S.rodR, S.rodB];
  g.wbox([-2.62, 0.28, -3.3], [-1.05, 0.36, -3.12], S.beam); // foot rail
  g.wbox([-2.62, 1.8, -3.3], [-1.05, 1.86, -3.18], S.beam); // upper clip rail
  cols.forEach((c, i) => {
    const x = -2.5 + i * 0.2, lean = (hash2(i, 1, 9) - 0.5) * 0.06;
    g.wsegment([x, 0.36, -3.2], [x + lean, 2.75, -3.26], 0.016 - (i === 7 ? 0.004 : 0), c);
    g.wsegment([x, 0.36, -3.2], [x, 0.78, -3.21], 0.024, S.corkH);
    g.wellipsoid([x, 0.86, -3.13], [0.035, 0.035, 0.035], S.reel);
    for (let k = 0; k < 6; k++) { const y = 1.0 + k * 0.28; g.wsegment([x + lean * (y / 2.75), y, -3.21], [x + lean * (y / 2.75), y + 0.015, -3.21], 0.019, S.rodW); }
  });
}

function corkboard(g: VoxelGrid) {
  const z = -3.36;
  g.wbox([-0.95, 1.4, z], [0.15, 2.2, z + 0.04], S.beam);
  for (let x = g.vi(-0.9, 0); x <= g.vi(0.1, 0); x++) for (let y = g.vi(1.45, 1); y <= g.vi(2.15, 1); y++) g.set(x, y, g.vi(z + 0.06, 2), hash2(x, y, 4) < 0.5 ? S.cork : S.cork2);
  const note = (x0: number, y0: number, w: number, h: number, c: number) => { g.wbox([x0, y0, z + 0.08], [x0 + w, y0 + h, z + 0.1], c); g.wellipsoid([x0 + w / 2, y0 + h - 0.02, z + 0.12], [0.015, 0.015, 0.015], S.pin); };
  note(-0.85, 1.85, 0.22, 0.24, S.paper); note(-0.58, 1.55, 0.2, 0.16, S.paperY); note(-0.3, 1.9, 0.18, 0.2, S.paperB); note(-0.08, 1.5, 0.16, 0.26, S.paper);
  // tide chart lines
  for (let i = 0; i < 6; i++) g.wbox([-0.82, 1.9 + i * 0.03, z + 0.11], [-0.66 + (i % 3) * 0.03, 1.91 + i * 0.03, z + 0.12], S.mask2);
  // the postcard: Earth from orbit
  g.wbox([-0.62, 1.78, z + 0.08], [-0.36, 1.96, z + 0.1], S.maskDark);
  g.wellipsoid([-0.49, 1.87, z + 0.11], [0.07, 0.07, 0.01], (x, y) => { const r = hash2(x, y, 7); return r < 0.25 ? S.earthG : r < 0.32 ? S.earthW : S.earthB; });
  g.wellipsoid([-0.49, 1.87, z + 0.12], [0.012, 0.012, 0.012], S.pin);
}

function mask(g: VoxelGrid) {
  // carved wooden monkey face (unremarked)
  const c = [0.62, 2.35, -3.3];
  g.wellipsoid(c, [0.17, 0.2, 0.06], (x, y) => (hash2(x, y, 11) < 0.5 ? S.mask : S.mask2));
  g.wellipsoid([c[0] - 0.22, c[1] + 0.04, c[2]], [0.06, 0.08, 0.04], S.mask2); g.wellipsoid([c[0] + 0.22, c[1] + 0.04, c[2]], [0.06, 0.08, 0.04], S.mask2);
  g.wellipsoid([c[0], c[1] - 0.06, c[2] + 0.05], [0.11, 0.1, 0.03], S.mask);
  g.wellipsoid([c[0] - 0.065, c[1] + 0.06, c[2] + 0.06], [0.03, 0.03, 0.02], S.maskDark); g.wellipsoid([c[0] + 0.065, c[1] + 0.06, c[2] + 0.06], [0.03, 0.03, 0.02], S.maskDark);
  g.wellipsoid([c[0], c[1] - 0.1, c[2] + 0.075], [0.06, 0.035, 0.02], S.maskDark);
}

function pegboard(g: VoxelGrid) {
  const z = -3.36;
  for (let x = g.vi(1.05, 0); x <= g.vi(2.6, 0); x++) for (let y = g.vi(1.15, 1); y <= g.vi(2.45, 1); y++)
    g.set(x, y, g.vi(z + 0.06, 2), x % 3 === 0 && y % 3 === 0 ? S.pegHole : S.peg);
  const lures = [S.lureR, S.lureY, S.lureG, S.lureP, S.lureO, S.lureB];
  for (let row = 0; row < 3; row++) for (let i = 0; i < 6; i++) {
    const x = 1.18 + i * 0.25 + (row % 2) * 0.1, y = 2.3 - row * 0.38;
    g.wsegment([x, y, z + 0.1], [x, y - 0.06, z + 0.1], 0.006, S.chrome);
    g.wellipsoid([x, y - 0.13, z + 0.11], [0.025, 0.07, 0.025], lures[(i + row * 2) % 6]);
    g.wsegment([x, y - 0.2, z + 0.11], [x, y - 0.24, z + 0.11], 0.008, S.chrome);
  }
  // shelf of tackle boxes below
  g.wbox([1.0, 0.96, -3.36], [2.65, 1.02, -3.0], S.beam);
  g.wbox([1.1, 1.02, -3.3], [1.55, 1.18, -3.05], S.boxG); g.wbox([1.1, 1.18, -3.3], [1.55, 1.21, -3.05], S.boxLid);
  g.wbox([1.65, 1.02, -3.3], [2.1, 1.2, -3.05], S.boxO); g.wbox([2.2, 1.02, -3.3], [2.55, 1.14, -3.05], S.boxG);
}

function fridge(g: VoxelGrid) {
  // bait fridge against the right wall
  g.wbox([2.15, 0, -2.5], [2.78, 1.85, -1.4], S.fridge);
  g.wbox([2.12, 0.25, -2.4], [2.16, 1.75, -1.5], S.fridgeIn);
  for (let s = 0; s < 4; s++) for (let i = 0; i < 4; i++) {
    const y = 0.32 + s * 0.38, z = -2.32 + i * 0.22;
    g.wbox([2.1, y, z], [2.13, y + 0.12, z + 0.14], S.cupW); g.wbox([2.08, y + 0.12, z], [2.13, y + 0.15, z + 0.14], S.cupLid);
  }
}

function counter(g: VoxelGrid) {
  const Z0 = -1.05, Z1 = -0.45, X0 = -1.9, X1 = 1.7;
  for (let x = g.vi(X0, 0); x <= g.vi(X1, 0); x++) for (let y = 0; y <= g.vi(0.96, 1); y++) {
    const c = Math.floor((x * g.size + 10) / 0.12) % 2 ? S.counterFront : S.counterFront2;
    g.set(x, y, g.vi(Z1, 2), c); g.set(x, y, g.vi(Z1, 2) - 1, c);
  }
  for (let x = g.vi(X0 - 0.04, 0); x <= g.vi(X1 + 0.04, 0); x++) for (let z = g.vi(Z0, 2); z <= g.vi(Z1 + 0.05, 2); z++)
    for (let y = g.vi(0.96, 1); y <= g.vi(1.0, 1); y++) g.set(x, y, z, hash2(x >> 2, z, 5) < 0.5 ? S.counterTop : S.counterTop2);
}

function fish(g: VoxelGrid, c: readonly number[], len: number, red: boolean, dirX = 1) {
  const [cx, cy, cz] = c;
  const body = red ? [S.fishR, S.fishR2] : [S.fishS, S.fishS2];
  g.wellipsoid([cx, cy, cz], [len * 0.5, len * 0.16, len * 0.07], (x, y) => (y * g.size < cy - len * 0.06 ? S.fishBelly : hash2(x, y, 2) < 0.5 ? body[0] : body[1]));
  // tail
  for (let i = 0; i < 6; i++) { const t = i / 5; g.wsegment([cx - dirX * len * 0.48, cy, cz], [cx - dirX * len * (0.62 + 0.04 * t), cy + (t - 0.5) * len * 0.36, cz], 0.012, red ? S.fishFin : body[1]); }
  // dorsal fin spines (rockfish)
  if (red) for (let i = 0; i < 6; i++) g.wsegment([cx - len * 0.25 + i * len * 0.08, cy + len * 0.13, cz], [cx - len * 0.25 + i * len * 0.08 + 0.01, cy + len * 0.24, cz], 0.008, S.fishFin);
  g.wellipsoid([cx + dirX * len * 0.36, cy + len * 0.04, cz + len * 0.06], [0.018, 0.018, 0.012], S.fishEye);
}

function counterProps(g: VoxelGrid) {
  // scale with the rockfish on it
  g.wbox([-0.85, 1.0, -0.95], [-0.35, 1.06, -0.6], S.scaleW);
  g.wbox([-0.55, 1.06, -1.0], [-0.35, 1.32, -0.92], S.scaleW);
  g.wellipsoid([-0.45, 1.22, -0.9], [0.075, 0.075, 0.02], S.scaleFace);
  g.wsegment([-0.45, 1.22, -0.88], [-0.41, 1.27, -0.88], 0.006, S.scaleDial);
  fish(g, [-0.62, 1.1, -0.77], 0.42, true);
  // perch on butcher paper
  g.wbox([-1.65, 1.0, -0.95], [-1.05, 1.01, -0.55], S.wrap);
  fish(g, [-1.35, 1.05, -0.72], 0.3, false, -1);
  fish(g, [-1.32, 1.1, -0.79], 0.26, false, 1);
  // cash register
  g.wbox([0.6, 1.0, -1.0], [1.05, 1.22, -0.62], S.register);
  g.wbox([0.6, 1.22, -1.0], [1.05, 1.4, -0.85], S.register2);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) g.wbox([0.65 + i * 0.1, 1.22, -0.8 + j * 0.05], [0.71 + i * 0.1, 1.25, -0.77 + j * 0.05], S.keys);
  // AM radio
  g.wbox([1.2, 1.0, -1.0], [1.52, 1.18, -0.85], S.radio);
  for (let i = 0; i < 5; i++) g.wbox([1.24 + i * 0.05, 1.04, -0.84], [1.26 + i * 0.05, 1.14, -0.83], S.radioGrill);
  g.wsegment([1.48, 1.18, -0.93], [1.62, 1.55, -0.95], 0.004, S.chrome);
  // service bell
  g.wellipsoid([0.3, 1.02, -0.6], [0.05, 0.04, 0.05], S.bell); g.wbox([0.24, 1.0, -0.66], [0.36, 1.01, -0.54], S.radioGrill);
}

function ceilingStuff(g: VoxelGrid) {
  // pendant lamp over the counter
  g.wsegment([0.15, 3.0, -0.75], [0.15, 2.35, -0.75], 0.006, S.chain);
  g.wellipsoid([0.15, 2.28, -0.75], [0.17, 0.09, 0.17], S.lamp);
  g.wellipsoid([0.15, 2.22, -0.75], [0.08, 0.04, 0.08], S.lampIn);
  // ceiling fan
  g.wsegment([-1.3, 3.0, -2.0], [-1.3, 2.7, -2.0], 0.02, S.fan);
  for (let a = 0; a < 4; a++) { const t = a * Math.PI / 2 + 0.3; g.wsegment([-1.3, 2.68, -2.0], [-1.3 + Math.cos(t) * 0.55, 2.66, -2.0 + Math.sin(t) * 0.55], 0.05, S.fan); }
}

export function stillShop(canvas: HTMLCanvasElement, w: number, h: number): Stage {
  const sunDir = new THREE.Vector3(-1, 0.55, 0.25);
  const st = makeStage(canvas, w, h, {
    zenith: 0x6fb6e6, horizon: 0xf1e7d2, fog: 0xffffff, fogDensity: 0, sunDir, sunColor: 0xffe2b0, sunI: 3.2,
    hemiSky: 0xf4dcb8, hemiGround: 0x7a5a3a, hemiI: 0.95,
  });
  st.scene.fog = null;
  const g = new VoxelGrid(0.02);
  room(g); rods(g); corkboard(g); mask(g); pegboard(g); fridge(g); counter(g); counterProps(g); ceilingStuff(g);
  addGrid(st, 'shop 2 cm', g, { palette: SHOP.linear, jitter: 0.035 });
  const louG = new THREE.Group(); louG.position.set(0.12, 0, -1.55); st.scene.add(louG);
  addGrid(st, 'lou', buildLou(), { palette: LOU.linear, jitter: 0.03 }, louG);
  // the ocean outside the window
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), new THREE.MeshBasicMaterial({ color: 0x2a9cc0 }));
  sea.rotation.x = -Math.PI / 2; sea.position.y = -12; st.scene.add(sea);
  aimSun(st, new THREE.Vector3(0, 1, -1.2), sunDir, 4.5);
  const lamp = new THREE.PointLight(0xffc979, 3.0, 7, 1.4);
  lamp.position.set(0.15, 2.15, -0.75); st.scene.add(lamp);
  const fill = new THREE.PointLight(0xfff0dd, 1.4, 6, 1.2);
  fill.position.set(0.3, 1.8, 0.9); st.scene.add(fill);
  st.camera.fov = 58; st.camera.updateProjectionMatrix();
  st.camera.position.set(0.05, 1.62, 1.15);
  st.camera.lookAt(-0.05, 1.42, -2.6);
  return st;
}

export function shopOverlay(): string {
  const hand = "font-family:'Marker Felt','Bradley Hand','Segoe Print','Comic Sans MS',cursive";
  const tag = (x: number, y: number, rot: number, title: string, price: string, sub = '') => `
    <div style="position:absolute;left:${x}px;top:${y}px;transform:rotate(${rot}deg);background:#fbf6e8;border-radius:6px 22px 22px 6px;padding:10px 26px 10px 18px;box-shadow:0 3px 0 rgba(0,0,0,.2);${hand};color:#2b2b2b">
      <div style="position:absolute;right:9px;top:50%;width:10px;height:10px;margin-top:-5px;border-radius:50%;background:#d9cdb0"></div>
      <div style="font-size:26px;line-height:1">${title}</div><div style="font-size:34px;line-height:1.1;color:#c2362b">${price}</div>${sub ? `<div style="font-size:16px;color:#6b665c">${sub}</div>` : ''}</div>`;
  return `
    ${tag(176, 300, -6, 'Surf Rod', '$40', 'casts farther')}
    ${tag(1180, 236, 4, 'Bucket hat', '$8')}
    <div style="position:absolute;right:46px;bottom:34px;width:300px;background:#fffdf6;padding:18px 22px 26px;box-shadow:0 4px 0 rgba(0,0,0,.18);transform:rotate(1.5deg);font:15px/1.5 ui-monospace,Menlo,monospace;color:#2b2b2b;
      clip-path:polygon(0 0,100% 0,100% 94%,94% 100%,88% 94%,82% 100%,76% 94%,70% 100%,64% 94%,58% 100%,52% 94%,46% 100%,40% 94%,34% 100%,28% 94%,22% 100%,16% 94%,10% 100%,4% 94%,0 100%)">
      <div style="text-align:center;font-weight:700;letter-spacing:.08em">LOU'S BAIT &amp; TACKLE</div>
      <div style="text-align:center;color:#8b867c;font-size:12px">HWY 1 · OPEN MOST DAYS</div>
      <div style="border-top:1px dashed #b8b2a4;margin:8px 0"></div>
      <div style="display:flex;justify-content:space-between"><span>perch ×2</span><span>$14</span></div>
      <div style="display:flex;justify-content:space-between"><span>greenling</span><span>$11</span></div>
      <div style="display:flex;justify-content:space-between"><span>rockfish 2.1 lb</span><span>$19</span></div>
      <div style="border-top:1px dashed #b8b2a4;margin:8px 0"></div>
      <div style="display:flex;justify-content:space-between;font-weight:700"><span>YOU GET</span><span>$44</span></div>
    </div>
    <div style="position:absolute;left:50%;bottom:26px;transform:translateX(-50%);display:flex;gap:26px;font:600 18px ui-sans-serif,system-ui;color:#fffdf6;text-shadow:0 2px 0 rgba(0,0,0,.35)">
      <span>◀ ▶ browse</span><span>Ⓐ buy</span><span>Ⓑ back on the road</span></div>`;
}

/** Character sheet: Lou live (front, three-quarter) and as the temple statue, to check he reads the same. */
export function stillLouSheet(canvas: HTMLCanvasElement, w: number, h: number): Stage {
  const sunDir = new THREE.Vector3(0.5, 0.7, 0.8);
  const st = makeStage(canvas, w, h, { zenith: 0xbfd8e6, horizon: 0xf3ead8, fog: 0xffffff, fogDensity: 0, sunDir, sunColor: 0xfff1da, sunI: 2.6, hemiSky: 0xf0e6d6, hemiGround: 0x8a7a66, hemiI: 1.1 });
  st.scene.fog = null;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshLambertMaterial({ color: 0xe9e0cc }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.9; floor.receiveShadow = true; st.scene.add(floor);
  const place = (x: number, rotY: number, finish: 'live' | 'stone', label: string) => {
    const grp = new THREE.Group(); grp.position.set(x, 0, 0); grp.rotation.y = rotY; st.scene.add(grp);
    addGrid(st, label, buildLou({ finish }), { palette: LOU.linear, jitter: 0.03 }, grp);
  };
  place(-0.95, 0, 'live', 'lou front'); place(0, 0.65, 'live', 'lou 3/4'); place(0.95, -0.3, 'stone', 'lou statue');
  aimSun(st, new THREE.Vector3(0, 1.4, 0), sunDir, 2.5);
  st.camera.fov = 30; st.camera.updateProjectionMatrix();
  st.camera.position.set(0, 1.6, 4.2); st.camera.lookAt(0, 1.45, 0);
  return st;
}
