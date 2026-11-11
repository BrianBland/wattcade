// Voxel cars for Highway 1 traffic: a hatchback, a pickup, a camper van and a wagon with a board on the roof, each in
// one of a few beach-town colours. Built facing +z, wheels on y = 0, ~0.1 m voxels (they're seen at 20+ m, moving).
import { VoxelGrid } from '../voxel/grid';
import { definePalette } from '../voxel/palette';
import { CAR_COLOURS } from './traffic';

export const CARS_PAL = definePalette({
  b0: 0xd9483b, b1: 0xf2e6c9, b2: 0x3f86b8, b3: 0x5f8f5a, b4: 0xe8b33a, b5: 0x8a8f96,
  roof: 0xf4f1ea, glass: 0x2d4a63, glass2: 0x5d7f99, tyre: 0x1d1e20, hub: 0xb8bec4, chrome: 0xd9dde2, dark: 0x2a2c30,
  lamp: 0xfff4c8, tail: 0xc8231b, board: 0xf3efe2, boardStripe: 0xe06a2c, wood: 0x8a6440,
});
const P = CARS_PAL.idx;
const BODY = [P.b0, P.b1, P.b2, P.b3, P.b4, P.b5];

/** Car `model` (0 hatch, 1 pickup, 2 van, 3 wagon + board) in colour `colour`. */
export function buildCar(model: number, colour: number): VoxelGrid {
  const g = new VoxelGrid(0.1), body = BODY[colour % CAR_COLOURS];
  const wheels = (z0: number, z1: number, x = 0.86) => {
    for (const sx of [-1, 1]) for (const z of [z0, z1]) {
      g.wellipsoid([sx * x, 0.33, z], [0.14, 0.33, 0.33], P.tyre);
      g.wbox([sx * (x + 0.06), 0.24, z - 0.1], [sx * (x + 0.12), 0.42, z + 0.1], P.hub);
    }
  };
  const lamps = (zf: number, zb: number, y: number) => {
    for (const sx of [-1, 1]) {
      g.wbox([sx * 0.55 - 0.15, y, zf - 0.05], [sx * 0.55 + 0.15, y + 0.15, zf + 0.05], P.lamp);
      g.wbox([sx * 0.62 - 0.12, y, zb - 0.05], [sx * 0.62 + 0.12, y + 0.18, zb + 0.05], P.tail);
    }
  };
  switch (model % 4) {
    case 0: { // hatchback
      g.wbox([-0.85, 0.3, -1.9], [0.85, 0.9, 1.9], body);
      g.wbox([-0.78, 0.9, -1.6], [0.78, 1.45, 0.75], P.glass);
      g.wbox([-0.8, 1.4, -1.55], [0.8, 1.5, 0.7], body);
      g.wbox([-0.79, 0.95, -1.2], [0.79, 1.4, -1.1], body); g.wbox([-0.79, 0.95, -0.1], [0.79, 1.4, 0], body); // pillars
      g.wbox([-0.9, 0.3, 1.85], [0.9, 0.42, 1.98], P.dark); g.wbox([-0.9, 0.3, -1.98], [0.9, 0.42, -1.85], P.dark);
      wheels(-1.25, 1.25); lamps(1.92, -1.92, 0.65);
      break;
    }
    case 1: { // pickup: cab forward, an open bed with a toolbox
      g.wbox([-0.9, 0.35, -2.5], [0.9, 0.95, 2.4], body);
      g.wbox([-0.85, 0.95, 0.2], [0.85, 1.65, 1.3], body);
      g.wbox([-0.82, 1.05, 1.25], [0.82, 1.55, 1.35], P.glass); g.wbox([-0.88, 1.05, 0.35], [0.88, 1.5, 1.2], P.glass2);
      g.wbox([-0.8, 0.6, -2.4], [0.8, 0.95, 0.1], 0); g.wbox([-0.8, 0.5, -2.4], [0.8, 0.6, 0.1], P.dark); // the bed
      g.wbox([-0.8, 0.6, -0.1], [0.8, 0.9, 0.1], P.chrome);
      g.wbox([-0.95, 0.35, 2.35], [0.95, 0.5, 2.5], P.chrome); g.wbox([-0.95, 0.35, -2.6], [0.95, 0.5, -2.45], P.chrome);
      wheels(-1.6, 1.55, 0.9); lamps(2.42, -2.52, 0.7);
      break;
    }
    case 2: { // camper van: two-tone, pop-top
      g.wbox([-0.92, 0.32, -2.3], [0.92, 1.25, 2.3], body);
      g.wbox([-0.92, 1.25, -2.3], [0.92, 2.0, 2.3], P.roof);
      g.wbox([-0.8, 2.0, -1.6], [0.8, 2.12, 1.4], P.roof);
      g.wbox([-0.95, 1.3, -1.9], [0.95, 1.75, 1.5], P.glass); g.wbox([-0.82, 1.3, 2.28], [0.82, 1.85, 2.34], P.glass);
      g.wbox([-0.3, 0.7, 2.3], [0.3, 0.95, 2.36], P.roof); // the badge
      wheels(-1.5, 1.5); lamps(2.33, -2.33, 0.6);
      break;
    }
    default: { // wagon with a surfboard on the rack
      g.wbox([-0.88, 0.3, -2.3], [0.88, 0.95, 2.3], body);
      g.wbox([-0.82, 0.95, -2.2], [0.82, 1.45, 1.0], P.glass);
      g.wbox([-0.84, 1.42, -2.2], [0.84, 1.52, 0.95], body);
      for (const z of [-1.5, -0.4, 0.5]) g.wbox([-0.83, 0.96, z], [0.83, 1.42, z + 0.1], body);
      g.wbox([-0.85, 1.52, -1.4], [0.85, 1.58, -1.3], P.dark); g.wbox([-0.85, 1.52, 0.4], [0.85, 1.58, 0.5], P.dark);
      g.wellipsoid([0.15, 1.66, -0.5], [0.28, 0.06, 1.35], P.board);
      g.wbox([0.13, 1.7, -1.6], [0.18, 1.73, 0.6], P.boardStripe);
      g.wbox([-0.92, 0.3, 2.25], [0.92, 0.42, 2.38], P.chrome); g.wbox([-0.92, 0.3, -2.38], [0.92, 0.42, -2.25], P.chrome);
      wheels(-1.55, 1.5); lamps(2.32, -2.32, 0.62);
    }
  }
  return g;
}
