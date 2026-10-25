// World registry: workers rebuild a world from its id (functions can't cross postMessage), once per thread.
import type { WorldDef } from './def';
import { coastWorld } from './coast';
import { bellyWorld } from './belly';
import { islandWorld } from './island';
import { cavernWorld } from './cavern';

export const WORLDS: Record<string, () => WorldDef> = { coast: coastWorld, belly: bellyWorld, island: islandWorld, cavern: cavernWorld };

const cache = new Map<string, WorldDef>();
export function getWorld(id: string): WorldDef {
  let w = cache.get(id);
  if (!w) {
    const make = WORLDS[id];
    if (!make) throw new Error(`unknown Seaside world: ${id}`);
    w = make(); cache.set(id, w);
  }
  return w;
}
