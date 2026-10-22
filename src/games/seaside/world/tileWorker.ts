// Web Worker: builds tiles off the main thread. Messages:
//   in  { type: 'init', worldId }                  — rebuilds the world (and its baked sun) from the registry
//   in  { type: 'build', id, job: TileJob }        out { id, data: TileData }  (typed arrays transferred)
import { TileBuilder, type TileJob } from './tileBuild';
import { getWorld } from './worlds';
import { transferables } from '../voxel/merge';

let builder: TileBuilder | null = null;
const post = (msg: unknown, tr: ArrayBuffer[]) => (self as unknown as { postMessage(m: unknown, t: ArrayBuffer[]): void }).postMessage(msg, tr);

self.onmessage = (e: MessageEvent) => {
  const m = e.data as { type: 'init'; worldId: string } | { type: 'build'; id: number; job: TileJob };
  if (m.type === 'init') { builder = new TileBuilder(getWorld(m.worldId)); return; }
  const data = builder!.build(m.job);
  post({ id: m.id, data }, data.parts.flatMap((p) => transferables(p.mesh)));
};
