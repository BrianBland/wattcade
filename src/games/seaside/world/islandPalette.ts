// The island's palette (#191): sea and neon reef, sand, jungle, the boardwalk, cut stone, the monkey head and temple.
import { definePalette } from '../voxel/palette';

export const ISLE = definePalette({
  deep: 0x1f6fa8, sea: 0x2f93c4, sea2: 0x3aa6d2, shallow: 0x5fd3d8, foam: 0xf2fbfb, foam2: 0xd4f2f2,
  reef: 0xf0709f, reef2: 0xa77be8, reef3: 0x7fe0a0, reef4: 0xf2c95a, reefSand: 0x8fdcd2,
  sand: 0xf3e6c4, sand2: 0xe8d7ae, wetSand: 0xcdb98e,
  soil: 0x5a4028, litter: 0x7a5a32, moss: 0x6f8f3a, moss2: 0x5a7a2e, rock: 0x8a8577, rock2: 0x75705f, rockDark: 0x4f4b40,
  leafDark: 0x1f5a2a, leafMid: 0x34803a, leafLime: 0x8ccf4a, jungle2: 0x2f7a33, jungle3: 0x5aa548, fern: 0x6cbf4a, fern2: 0x4f9f3e,
  bark: 0x5a4a3a, bark2: 0x6e5c48, barkMoss: 0x5a7a3a, vine: 0x3f6a2a, palm: 0x58a83a, palm2: 0x46902f, trunk: 0x8a6a48, trunk2: 0x6e5236,
  flower: 0xf05a7a, flower2: 0xffd23a,
  plank: 0x9a8f80, plank2: 0x857a6c, plankGap: 0x3a342e, post: 0x6a6052, drift: 0xb8ad98, drift2: 0x9c917c, ash: 0x3a3632, emberRock: 0x5c5650,
  stone: 0xb8b09c, stone2: 0xa59d89, stone3: 0xc8c0aa, stoneDark: 0x5e584c, mortar: 0x6a6450, basalt: 0x4a4440, basalt2: 0x3b3438,
  teeth: 0xe8dcc0, teeth2: 0xd6c8a8, shadowVoid: 0x0d0b09, glyph: 0xffd27a, glyph2: 0x7affea, pool: 0x1d5f6a, pool2: 0x2a7a84,
});
export const I = ISLE.idx;
