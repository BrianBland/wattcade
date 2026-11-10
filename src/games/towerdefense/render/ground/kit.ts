// A packed ground kit (public/td/kits/<style>/kit.json, written by scripts/td-pack-kits.ts). Pure types.

/** A cut-out with alpha; w/h in world units. */
export interface KitStamp { file: string; w: number; h: number }
export interface KitManifest {
  style: string; source: string;
  /** Image pixels per world unit in every file. */
  ppu: number;
  /** The road strip's surface half-width and rim, in units; `roadBand` = half the strip's height in units. */
  roadHalf: number; roadRim: number; roadBand: number;
  files: { groundA: string; groundB: string; gravel: string; road: string; hive: string };
  apron: KitStamp; clearing?: KitStamp; decals: KitStamp[]; props: KitStamp[]; deck: KitStamp; hiveMouth?: KitStamp;
}
