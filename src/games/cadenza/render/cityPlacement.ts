import { newFrame, type Path } from './path';

/** Horizontal road corridor, including banks, launches and later passes of the road. */
export class RoadClearance {
  private cells = new Map<string, Array<[number, number, number, number]>>();
  private readonly cellM = 128;
  readonly groundY: number;
  constructor(path: Path) {
    const fr = newFrame(), margin = path.halfWidth + 40;
    let ground = Infinity;
    let prev: [number, number] | undefined;
    for (let d = 0; d <= path.length + 408; d += 8) {
      path.at(d, fr); ground = Math.min(ground, fr.p.y - 40);
      const cur: [number, number] = [fr.p.x, fr.p.z];
      if (prev) {
        const segment: [number, number, number, number] = [...prev, ...cur];
        for (let x = Math.floor((Math.min(prev[0], cur[0]) - margin) / this.cellM); x <= Math.floor((Math.max(prev[0], cur[0]) + margin) / this.cellM); x++) {
          for (let z = Math.floor((Math.min(prev[1], cur[1]) - margin) / this.cellM); z <= Math.floor((Math.max(prev[1], cur[1]) + margin) / this.cellM); z++) {
            const key = `${x},${z}`, cell = this.cells.get(key) ?? [];
            cell.push(segment); this.cells.set(key, cell);
          }
        }
      }
      prev = cur;
    }
    this.groundY = ground;
  }
  allows(x: number, z: number, radius: number, roadHalfWidth: number): boolean {
    const segments = this.cells.get(`${Math.floor(x / this.cellM)},${Math.floor(z / this.cellM)}`) ?? [];
    const clearance = roadHalfWidth + radius + 12;
    return !segments.some(([ax, az, bx, bz]) => {
      const dx = bx - ax, dz = bz - az;
      const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      return (x - ax - u * dx) ** 2 + (z - az - u * dz) ** 2 < clearance ** 2;
    });
  }
}

// Rendering windows share one road index; streamed revisions use a new Path and rebuild it.
const roadIndexes = new WeakMap<Path, RoadClearance>();
export function roadClearanceFor(path: Path): RoadClearance {
  let index = roadIndexes.get(path);
  if (!index) { index = new RoadClearance(path); roadIndexes.set(path, index); }
  return index;
}
