// Shared kit for the later-story stills: one palette, a voxel-by-callback filler, lit + glowing layers, FP bars.
import * as THREE from 'three';
import { VoxelGrid } from '../../voxel/grid';
import { definePalette } from '../../voxel/palette';
import { buildClusteredMeshes, voxelMaterial } from '../../voxel/three';
import { buildBars, KIT } from '../../world/rider';
import { addGrid, type Stage } from '../stage';

export const LATER = definePalette({
  // belly
  flesh: 0xd2487e, flesh2: 0xbf3a70, flesh3: 0xe0649a, fleshDark: 0x6a1f4e, fold: 0xe98ab4, cart: 0xd4e6f0, cart2: 0xbcd4e4, cartDark: 0x8fb0c8, drillBody: 0xe8553a, drillBody2: 0xc9452e, drillSteel: 0xc8cdd2, drillSteel2: 0x8e959c, drillDark: 0x2a2d32, gloveG: 0x6a707a, gloveG2: 0x5f6570, gloveTop: 0xa9b0b9, spark: 0xfff0b0, lamp: 0xfff6d8,
  bone: 0xfff3da, bone2: 0xf0e2c2, ribEdge: 0xfffbf0,
  bile: 0x3ef0d8, bile2: 0x7affea, spot: 0x5ff6ff, spot2: 0xb8fff4, hubcap: 0xc9d1d8, hubcap2: 0x8e979f,
  signGreen: 0x1f7a4a, signWhite: 0xf6f6f2, post: 0x8a9096, rodBlue: 0x2a6fd6, cork: 0xc9a06a,
  boatWhite: 0xeeeae0, boatOrange: 0xef6a2a, boatStripe: 0x2f4f6f, steel: 0x8f969c, steel2: 0x6c7379, chain: 0x5a5f64, partGlow: 0x9ff8ff,
  // jungle / temple
  jungle: 0x3f8f3a, jungle2: 0x2f7a33, jungle3: 0x5aa548, fern: 0x6cbf4a, fern2: 0x4f9f3e, trunk: 0x6e4f34, palm: 0x58a83a, palm2: 0x46902f,
  soil: 0x5a4028, litter: 0x7a5a32, leafDark: 0x1f5a2a, leafLime: 0x8ccf4a, leafMid: 0x34803a, vine: 0x3f6a2a, bark: 0x5a4a3a, bark2: 0x6e5c48, barkMoss: 0x5a7a3a, teeth: 0xe8dcc0, teeth2: 0xd6c8a8, moss: 0x6f8f3a, stone: 0xb8b09c, stone2: 0xa59d89, stone3: 0xc8c0aa, stoneDark: 0x5e584c, shadowVoid: 0x0d0b09, flower: 0xf05a7a, flower2: 0xffd23a,
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

/**
 * Painted glyphs: a canvas texture of hand-drawn-looking symbols (rings, eyes, spirals, fish, ladders, suns) in rows,
 * for decals on walls and columns. Glowing paint: use with an unlit additive material whose colour is > 1 for bloom.
 */
export function glyphTexture(cols: number, rows: number, seed: number, palette = ['#ffd27a', '#ffb347', '#7affea']): THREE.CanvasTexture {
  const cell = 96, cv = document.createElement('canvas');
  cv.width = cols * cell; cv.height = rows * cell;
  const g = cv.getContext('2d')!;
  g.lineCap = 'round'; g.lineJoin = 'round';
  const R = (i: number, k: number) => rnd(i, k, seed);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c, cx = c * cell + cell / 2 + (R(i, 1) - 0.5) * 8, cy = r * cell + cell / 2 + (R(i, 2) - 0.5) * 8, s = cell * 0.36;
    if (R(i, 3) < 0.12) continue; // gaps, like a worn inscription
    g.strokeStyle = g.fillStyle = palette[Math.floor(R(i, 4) * palette.length)];
    g.lineWidth = 5 + R(i, 5) * 3;
    g.shadowColor = g.strokeStyle; g.shadowBlur = 10;
    g.beginPath();
    switch (Math.floor(R(i, 6) * 8)) {
      case 0: g.arc(cx, cy, s, 0, Math.PI * 2); g.moveTo(cx + s * 0.35, cy); g.arc(cx, cy, s * 0.35, 0, Math.PI * 2); break; // ringed eye
      case 1: g.moveTo(cx - s, cy); g.quadraticCurveTo(cx, cy - s * 1.2, cx + s, cy); g.quadraticCurveTo(cx, cy + s * 1.2, cx - s, cy); g.moveTo(cx + s * 0.18, cy); g.arc(cx, cy, s * 0.18, 0, Math.PI * 2); break; // eye
      case 2: for (let a = 0; a < 12; a += 0.25) { const rr = (a / 12) * s; const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; if (a === 0) g.moveTo(x, y); else g.lineTo(x, y); } break; // spiral
      case 3: g.moveTo(cx - s, cy); g.quadraticCurveTo(cx, cy - s * 0.8, cx + s * 0.5, cy); g.quadraticCurveTo(cx, cy + s * 0.8, cx - s, cy); g.moveTo(cx + s * 0.5, cy); g.lineTo(cx + s, cy - s * 0.5); g.lineTo(cx + s, cy + s * 0.5); g.closePath(); break; // fish
      case 4: g.moveTo(cx - s * 0.5, cy - s); g.lineTo(cx - s * 0.5, cy + s); g.moveTo(cx + s * 0.5, cy - s); g.lineTo(cx + s * 0.5, cy + s); for (let k = -2; k <= 2; k++) { g.moveTo(cx - s * 0.5, cy + k * s * 0.4); g.lineTo(cx + s * 0.5, cy + k * s * 0.4); } break; // ladder
      case 5: g.arc(cx, cy, s * 0.4, 0, Math.PI * 2); for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; g.moveTo(cx + Math.cos(a) * s * 0.6, cy + Math.sin(a) * s * 0.6); g.lineTo(cx + Math.cos(a) * s, cy + Math.sin(a) * s); } break; // sun
      case 6: g.moveTo(cx - s, cy + s); g.lineTo(cx, cy - s); g.lineTo(cx + s, cy + s); g.moveTo(cx - s * 0.5, cy + s * 0.2); g.lineTo(cx + s * 0.5, cy + s * 0.2); break; // mountain / gate
      default: g.moveTo(cx - s, cy - s * 0.3); g.bezierCurveTo(cx - s * 0.3, cy - s * 1.2, cx + s * 0.3, cy + s * 0.6, cx + s, cy - s * 0.3); g.moveTo(cx, cy + s * 0.2); g.lineTo(cx, cy + s); g.moveTo(cx - s * 0.6, cy + s); g.lineTo(cx + s * 0.6, cy + s); break; // wave over a stand
    }
    g.stroke();
    if (R(i, 7) < 0.4) { g.beginPath(); g.arc(cx + s * 0.9, cy - s * 0.9, 4, 0, Math.PI * 2); g.fill(); } // dot accents
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}

/** A glowing painted-glyph decal plane (w × h metres), facing +z by default. */
export function glyphDecal(tex: THREE.Texture, w: number, h: number, intensity = 2.2): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, color: new THREE.Color(intensity, intensity, intensity), depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  m.renderOrder = 2;
  return m;
}
