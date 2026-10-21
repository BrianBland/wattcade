// Shared kit for the later-story stills: one palette, a voxel-by-callback filler, lit + glowing layers, FP bars.
import * as THREE from 'three';
import { VoxelGrid } from '../../voxel/grid';
import { definePalette } from '../../voxel/palette';
import { buildClusteredMeshes, voxelMaterial } from '../../voxel/three';
import { buildBars, KIT } from '../../world/rider';
import { addGrid, type Stage } from '../stage';

export const LATER = definePalette({
  // belly
  flesh: 0xd2487e, flesh2: 0xbf3a70, flesh3: 0xe0649a, fleshDark: 0x6a1f4e, fold: 0xe98ab4, bone: 0xf0e4c8, bone2: 0xdccfaf,
  bile: 0x3ef0d8, bile2: 0x7affea, spot: 0x5ff6ff, spot2: 0xb8fff4, hubcap: 0xc9d1d8, hubcap2: 0x8e979f,
  signGreen: 0x1f7a4a, signWhite: 0xf6f6f2, post: 0x8a9096, rodBlue: 0x2a6fd6, cork: 0xc9a06a,
  boatWhite: 0xeeeae0, boatOrange: 0xef6a2a, boatStripe: 0x2f4f6f, steel: 0x8f969c, steel2: 0x6c7379, chain: 0x5a5f64, partGlow: 0x9ff8ff,
  // jungle / temple
  jungle: 0x3f8f3a, jungle2: 0x2f7a33, jungle3: 0x5aa548, fern: 0x6cbf4a, fern2: 0x4f9f3e, trunk: 0x6e4f34, palm: 0x58a83a, palm2: 0x46902f,
  soil: 0x7a5a3a, moss: 0x6f8f3a, stone: 0xb8b09c, stone2: 0xa59d89, stone3: 0xc8c0aa, stoneDark: 0x5e584c, shadowVoid: 0x0d0b09, flower: 0xf05a7a, flower2: 0xffd23a,
  // lava
  basalt: 0x2f2a2e, basalt2: 0x3b3438, basalt3: 0x242024, obsidian: 0x1a1022, obsidian2: 0x2c1a3a, obsidianEdge: 0x7a5aa0,
  lava: 0xff7a1a, lava2: 0xffb02a, lavaHot: 0xffe08a, crust: 0x2a1410, crust2: 0x40201a, ember: 0xff4a10,
  glyph: 0xffd27a, glyph2: 0x7affea, magma: 0xff9a30, magma2: 0xffe070,
  // space / earth
  ocean: 0x1f5fb8, ocean2: 0x2a76cf, shelf: 0x3fa6d6, land: 0x4f9a3a, land2: 0x7aa64a, desert: 0xd8b878, ice: 0xf2f6fa, cloud: 0xffffff, cloud2: 0xdfe8f0,
  fire: 0xff7a1a, fire2: 0xffc23a, fire3: 0xfff0b0, feather: 0xf8f6f0, feather2: 0xe4e0d8, feather3: 0xcfcac0, star: 0xffffff,
});
export const L = LATER.idx;

/** Fill voxels whose centre passes `fn` (returns a palette index or 0) over a world-space box. */
export function fillBox(g: VoxelGrid, min: readonly number[], max: readonly number[], fn: (x: number, y: number, z: number) => number) {
  const s = g.size, o = g.origin;
  const lo = [0, 1, 2].map((a) => Math.floor((min[a] - o[a]) / s)), hi = [0, 1, 2].map((a) => Math.ceil((max[a] - o[a]) / s));
  for (let x = lo[0]; x <= hi[0]; x++) for (let z = lo[2]; z <= hi[2]; z++) for (let y = lo[1]; y <= hi[1]; y++) {
    const v = fn(o[0] + (x + 0.5) * s, o[1] + (y + 0.5) * s, o[2] + (z + 0.5) * s);
    if (v) g.set(x, y, z, v);
  }
}

/** Lit voxels: greedy-merged, per-cube noise in the shader. */
export function addLit(st: Stage, name: string, g: VoxelGrid, jitter = 0.08, shadows = { cast: true, receive: true }, parent: THREE.Object3D = st.scene) {
  return addGrid(st, name, g, { palette: LATER.linear, greedy: true }, parent, shadows, voxelMaterial({ size: g.size, jitter, origin: g.origin }));
}

/** Glowing voxels: unlit and brighter than white (the post bloom turns them into light). */
export function addGlow(st: Stage, name: string, g: VoxelGrid, intensity = 2.2, parent: THREE.Object3D = st.scene) {
  const pal = LATER.linear.map((v) => v * intensity);
  const built = buildClusteredMeshes(g, { palette: pal, greedy: true }, new THREE.MeshBasicMaterial({ vertexColors: true }));
  const grp = new THREE.Group(); built.meshes.forEach((m) => grp.add(m)); parent.add(grp);
  st.stats.push(`${name}: ${built.faces.toLocaleString()} glow faces`);
  return grp;
}

/** First-person drop bars + gloves, counter-pitched so they sit level. */
export function fpBars(st: Stage, y = -0.31, z = -0.46) {
  const bars = new THREE.Group();
  addGrid(st, 'bars', buildBars(), { palette: KIT.linear, jitter: 0.04 }, bars, { cast: false, receive: false });
  st.camera.updateMatrixWorld();
  bars.position.set(0, y, z); bars.rotation.x = -st.camera.rotation.x + 0.12;
  st.camera.add(bars);
  return bars;
}

export const rnd = (a: number, b: number, c = 0) => { let h = (a * 374761393 + b * 668265263 + c * 982451653) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
