// Pure concatenation of mesher output (no three.js), so workers can merge before transferring.
import type { MeshData } from './mesh';

export function mergeMeshData(parts: MeshData[]): MeshData | null {
  parts = parts.filter((m) => m.faces);
  if (!parts.length) return null;
  const nV = parts.reduce((n, m) => n + m.positions.length, 0), nI = parts.reduce((n, m) => n + m.indices.length, 0);
  const sun = parts.every((m) => m.sunVis) ? new Float32Array(nV / 3) : undefined;
  const positions = new Float32Array(nV), normals = new Float32Array(nV), colors = new Float32Array(nV), indices = new Uint32Array(nI);
  let v = 0, i = 0, faces = 0;
  for (const m of parts) {
    positions.set(m.positions, v); normals.set(m.normals, v); colors.set(m.colors, v);
    if (sun && m.sunVis) sun.set(m.sunVis, v / 3);
    const base = v / 3;
    for (let k = 0; k < m.indices.length; k++) indices[i + k] = m.indices[k] + base;
    v += m.positions.length; i += m.indices.length; faces += m.faces;
  }
  return { positions, normals, colors, indices, faces, ...(sun ? { sunVis: sun } : {}) };
}

/** The typed arrays of a MeshData, for postMessage transfer lists. */
export const transferables = (m: MeshData | null): ArrayBuffer[] =>
  m ? [m.positions.buffer, m.normals.buffer, m.colors.buffer, m.indices.buffer, ...(m.sunVis ? [m.sunVis.buffer] : [])] as ArrayBuffer[] : [];
