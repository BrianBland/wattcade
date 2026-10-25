// Chapter 3a's palette (#192): the temple's back passage, cave rock warming grey → brown → red-brown on the way down,
// basalt banks, black obsidian glass, the lava (crust lit, molten unlit and bloom-bright), iron torch cages.
import { definePalette } from '../voxel/palette';

export const CAVE = definePalette({
  stone: 0xb8b09c, stone2: 0xa59d89, stoneDark: 0x5e584c, mortar: 0x6a6450,
  grey: 0x6e6a66, grey2: 0x5c5955, grey3: 0x7c7772, brown: 0x6e5644, brown2: 0x5a4636, brown3: 0x7c624c,
  red: 0x6e3a2a, red2: 0x582c20, red3: 0x7c4430, dark: 0x2e2622, pathG: 0x4e4a46, pathB: 0x4c3c30, pathR: 0x4a2a20,
  basalt: 0x2f2a2e, basalt2: 0x3b3438, basalt3: 0x242024, obsidian: 0x1e1428, obsidian2: 0x33204a, obsidianEdge: 0x8a6ab8, glint: 0xb89ae0,
  crust: 0x2a1410, crust2: 0x40201a, lava: 0xff7a1a, lava2: 0xffb02a, lavaHot: 0xffe08a, ember: 0xff4a10,
  iron: 0x2a2a2e, iron2: 0x4a4a50, soot: 0x1a1614,
});
export const C = CAVE.idx;
/** Unlit, bloom-bright voxels. */
export const CAVE_GLOW = new Set([C.lava, C.lava2, C.lavaHot, C.ember]);
