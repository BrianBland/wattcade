// Birds that read as birds: a body (head, beak, tail) and two wings on shoulder pivots that beat and glide. The big
// white bird is an albatross-shaped glider (long, bent wings with dark tips, slow beats); gulls are small and flap fast.
// Both face +x with the wings along ±z; `flap(a)` lifts both wings by a (rad, + = up).
import * as THREE from 'three';
import { addGrid } from '../stills/stage';
import type { Stage } from '../stills/stage';
import { VoxelGrid } from '../voxel/grid';
import { definePalette } from '../voxel/palette';

export const BIRD_PAL = definePalette({ white: 0xf2f1ec, white2: 0xdcdbd4, grey: 0x8e979f, dark: 0x2c2f33, beak: 0xf0b72c, foot: 0xe08a3a });
const P = BIRD_PAL.idx;
const NONE = { cast: false, receive: false };

export interface BirdShape {
  /** grid voxel size (m) */ vox: number; body: [number, number, number]; head: number; neck: number;
  /** wing span from the shoulder (one side), inner chord, and how far the outer wing sweeps back */ span: number; chord: number; sweep: number;
  /** wingtip and back colours */ tip: number; back: number;
}
/** The big bird: ~2.4 m of span each side at scale 1 (scaled up in the sky), a long neck and a heavy beak. */
export const ALBATROSS: BirdShape = { vox: 0.12, body: [1.1, 0.32, 0.3], head: 0.3, neck: 0.55, span: 3.6, chord: 0.75, sweep: 0.8, tip: P.dark, back: P.white2 };
/** A gull: ~1.3 m wingspan, grey back, black tips. */
export const GULL: BirdShape = { vox: 0.025, body: [0.2, 0.07, 0.07], head: 0.065, neck: 0.12, span: 0.62, chord: 0.15, sweep: 0.14, tip: P.dark, back: P.grey };

function buildBody(s: BirdShape): VoxelGrid {
  const g = new VoxelGrid(s.vox), [bx, by, bz] = s.body;
  g.wellipsoid([0, 0, 0], [bx, by, bz], P.white);
  g.wellipsoid([bx * 0.1, by * 0.5, 0], [bx * 0.7, by * 0.55, bz * 0.85], s.back);
  g.wellipsoid([bx * 0.8 + s.neck * 0.5, by * 0.35, 0], [s.neck * 0.6, by * 0.5, bz * 0.55], P.white); // neck
  const hx = bx * 0.8 + s.neck + s.head * 0.4;
  g.wellipsoid([hx, by * 0.6, 0], [s.head, s.head * 0.85, s.head * 0.8], P.white);
  g.wbox([hx + s.head * 0.7, by * 0.5, -s.head * 0.18], [hx + s.head * 2.3, by * 0.5 + s.head * 0.35, s.head * 0.18], P.beak);
  g.wbox([hx + s.head * 0.2, by * 0.75, -s.head * 0.62], [hx + s.head * 0.4, by * 0.95, s.head * 0.62], P.dark); // eyes
  // tail: a short wedge
  g.wbox([-bx * 1.45, -by * 0.15, -bz * 0.9], [-bx * 0.75, by * 0.2, bz * 0.9], s.back);
  return g;
}

/** One wing (side ±1), built from the shoulder pivot outward: inner arm out and a little forward, the outer hand bent
 *  back and tapering to a dark tip. */
function buildWing(s: BirdShape, side: 1 | -1): VoxelGrid {
  const g = new VoxelGrid(s.vox), n = Math.max(12, Math.ceil(s.span / s.vox));
  for (let i = 0; i <= n; i++) {
    const k = i / n, z = side * k * s.span;
    const inner = k < 0.45, kk = inner ? k / 0.45 : (k - 0.45) / 0.55;
    const lead = inner ? s.chord * 0.25 + kk * s.chord * 0.1 : s.chord * 0.35 - kk * s.sweep; // the leading edge (x)
    const chord = inner ? s.chord * (1 - kk * 0.1) : s.chord * 0.9 * (1 - kk * 0.75);
    const y = inner ? kk * s.chord * 0.25 : s.chord * 0.25 - kk * s.chord * 0.2; // a gentle gull-wing bend
    const c = k > 0.84 ? s.tip : s.back;
    g.wbox([lead - chord, y - s.vox, Math.min(z, z + side * s.vox)], [lead, y + s.vox, Math.max(z, z + side * s.vox)], c);
  }
  return g;
}

/** A bird in the scene: a group to place, and a flap to set each frame. */
export class Flier {
  readonly group = new THREE.Group();
  private wings: THREE.Group[] = [];
  constructor(st: Stage, name: string, s: BirdShape, cache?: Map<string, VoxelGrid>) {
    const grid = (k: string, make: () => VoxelGrid) => { if (!cache) return make(); let gg = cache.get(k); if (!gg) cache.set(k, (gg = make())); return gg; };
    // unlit (but for a soft top-down shade baked in the palette): seen from below against the sky a white bird stays
    // white instead of going grey in its own shadow
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
    const body = new THREE.Group();
    addGrid(st, `${name} body`, grid(`${s.vox}:body`, () => buildBody(s)), { palette: BIRD_PAL.linear, jitter: 0.02 }, body, NONE, mat);
    this.group.add(body);
    for (const side of [1, -1] as const) {
      const pivot = new THREE.Group();
      pivot.position.set(s.body[0] * 0.15, s.body[1] * 0.45, side * s.body[2] * 0.6);
      addGrid(st, `${name} wing`, grid(`${s.vox}:wing${side}`, () => buildWing(s, side)), { palette: BIRD_PAL.linear, jitter: 0.02 }, pivot, NONE, mat);
      this.group.add(pivot); this.wings.push(pivot);
    }
  }
  /** Both wings up by `a` radians (down when negative). */
  flap(a: number): void { this.wings[0].rotation.x = -a; this.wings[1].rotation.x = a; }
}

/** The big bird's wings at t: long glides, now and then three slow deep beats. */
export const glideFlap = (t: number) => { const c = t % 9; return c < 2.4 ? Math.sin((c / 2.4) * Math.PI * 3) * 0.42 : 0.06 + Math.sin(t * 0.8) * 0.04; };
/** A gull's wings at t (seed: its own rhythm): quick beats, short glides. */
export const gullFlap = (t: number, seed: number) => { const c = (t + seed * 3.1) % 4; return c < 2.6 ? Math.sin(t * 10 + seed * 5) * 0.65 : 0.12; };
