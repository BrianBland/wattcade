// Palette shared by the later-story scenes (belly, jungle, lava, space): pure, so worlds and workers can use it.
import { definePalette } from '../voxel/palette';

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
  geode: 0x8a8090, geode2: 0xb8aec4, crystal: 0xb48cff, crystal2: 0x7ad8ff, crystalHot: 0xf4e8ff,
  // space / earth
  ocean: 0x1f5fb8, ocean2: 0x2a76cf, shelf: 0x3fa6d6, land: 0x4f9a3a, land2: 0x7aa64a, desert: 0xd8b878, ice: 0xf2f6fa, cloud: 0xffffff, cloud2: 0xdfe8f0,
  fire: 0xff7a1a, fire2: 0xffc23a, fire3: 0xfff0b0, feather: 0xf8f6f0, feather2: 0xe4e0d8, feather3: 0xcfcac0, star: 0xffffff,
});
export const L = LATER.idx;
