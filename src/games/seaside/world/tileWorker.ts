// Web Worker: builds terrain tiles off the main thread. Messages:
//   in  { type: 'init', params: TileParams, sun: SunShadowData | null }
//   in  { type: 'build', id, kind: 'tile' | 'road', x0, z0, S }   (road: S = segment length)      out { id, land, water, ms }  (typed arrays transferred)
import { buildRoad, buildTile, type TileParams } from './tileBuild';
import { SunShadow, type SunShadowData } from './sunShadow';
import { transferables } from '../voxel/merge';

let params: TileParams | null = null, sun: SunShadow | null = null;
const post = (msg: unknown, tr: ArrayBuffer[]) => (self as unknown as { postMessage(m: unknown, t: ArrayBuffer[]): void }).postMessage(msg, tr);

self.onmessage = (e: MessageEvent) => {
  const m = e.data as { type: 'init'; params: TileParams; sun: SunShadowData | null } | { type: 'build'; id: number; kind: 'tile' | 'road'; x0: number; z0: number; S: number; voxel?: number };
  if (m.type === 'init') { params = m.params; sun = m.sun ? SunShadow.fromData(m.sun) : null; return; }
  const t = m.kind === 'road' ? buildRoad(m.z0, m.S, params!, sun, m.voxel) : buildTile(m.x0, m.z0, m.S, params!, sun);
  post({ id: m.id, land: t.land, water: t.water, decor: t.decor, ms: t.ms }, [...transferables(t.land), ...transferables(t.water), ...transferables(t.decor)]);
};
