// Shared kit for the later-story stills: one palette, a voxel-by-callback filler, lit + glowing layers, FP bars.
import * as THREE from 'three';
import { VoxelGrid } from '../../voxel/grid';
import { buildClusteredMeshes, voxelMaterial } from '../../voxel/three';
import { buildBars, KIT } from '../../world/rider';
import { LATER, L } from '../../world/laterPalette';
import { addGrid, type Stage } from '../stage';

export { LATER, L };

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

/** Instanced glowing (or lit) cubes for particles; call set(i, …) each frame, then commit(n). */
export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private v = new THREE.Vector3(); private sc = new THREE.Vector3(); private c = new THREE.Color();
  constructor(st: Stage, max: number, opts: { lit?: boolean; intensity?: number; parent?: THREE.Object3D } = {}) {
    const mat = opts.lit ? new THREE.MeshLambertMaterial({ color: 0xffffff }) : new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(opts.intensity ?? 2.2), fog: false });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, max);
    this.mesh.frustumCulled = false; this.mesh.count = 0;
    (opts.parent ?? st.scene).add(this.mesh);
  }
  /** Cube at p, size s (or [sx,sy,sz]), optional rotation (Euler y/x), palette colour index. */
  set(i: number, p: readonly number[], s: number | readonly number[], colorIdx: number, rot: readonly number[] = [0, 0, 0]) {
    this.v.set(p[0], p[1], p[2]);
    this.q.setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2]));
    if (typeof s === 'number') this.sc.setScalar(s); else this.sc.set(s[0], s[1], s[2]);
    this.m.compose(this.v, this.q, this.sc);
    this.mesh.setMatrixAt(i, this.m);
    this.c.setRGB(LATER.linear[colorIdx * 3], LATER.linear[colorIdx * 3 + 1], LATER.linear[colorIdx * 3 + 2], THREE.LinearSRGBColorSpace);
    this.mesh.setColorAt(i, this.c);
  }
  commit(n: number) { this.mesh.count = n; this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true; }
}

/** Scale the brightness of every unlit glow material under a group (for pulsing). */
export function setGlow(grp: THREE.Object3D, k: number) {
  grp.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined; if (m && (m as THREE.Material).type === 'MeshBasicMaterial') m.color.setScalar(k); });
}

/** A deterministic smooth wobble in [-1, 1] (sum of sines), for shakes and flicker. */
export const wob = (t: number, seed = 0) => (Math.sin(t * 7.1 + seed) + Math.sin(t * 13.3 + seed * 2.1) * 0.6 + Math.sin(t * 23.7 + seed * 3.7) * 0.3) / 1.9;
