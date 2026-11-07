import type { Design, P } from './lib.ts';
const FLY: P[] = [{ x: 6, y: -6 }, { x: 40, y: -6 }, { x: 74, y: -6 }];
const T: P = { x: 40, y: 101 };
const base = { hw: 4, shoulder: 1, flyers: FLY, turret: T };
/** Elliptical spiral around c, clockwise on screen from angle a0, radii easing from (rx0, ry0) to (rx1, ry1) over `turns`. */
function spiral(c: P, a0: number, turns: number, rx0: number, ry0: number, rx1: number, ry1: number, n = 28): P[] {
  return Array.from({ length: n + 1 }, (_, i) => { const k = i / n, a = a0 + k * turns * Math.PI * 2;
    return { x: c.x + Math.cos(a) * (rx0 + (rx1 - rx0) * k), y: c.y + Math.sin(a) * (ry0 + (ry1 - ry0) * k) }; });
}
export const designs: Design[] = [
  { ...base, name: 'Dive + zigzag', wp: [
    { x: 74, y: -40 }, { x: 71, y: -24 }, { x: 70, y: -8 }, { x: 70, y: 20 }, { x: 70, y: 50 }, { x: 69, y: 70 }, { x: 65, y: 80 }, { x: 58, y: 84 },
    { x: 51, y: 80 }, { x: 48, y: 70 }, { x: 48, y: 40 }, { x: 47, y: 18 }, { x: 42, y: 10 }, { x: 32, y: 8 }, { x: 16, y: 8 },
    { x: 8, y: 13 }, { x: 6, y: 21 }, { x: 9, y: 28 }, { x: 18, y: 31 }, { x: 26, y: 34 }, { x: 30, y: 42 }, { x: 26, y: 50 },
    { x: 17, y: 53 }, { x: 9, y: 57 }, { x: 6, y: 65 }, { x: 9, y: 73 }, { x: 18, y: 76 }, { x: 26, y: 80 }, { x: 31, y: 90 }, T] },
  { ...base, name: 'Spiral (turret moved to centre)', turret: { x: 40, y: 60 }, wp: [
    { x: 74, y: -40 }, { x: 72, y: -22 },
    ...spiral({ x: 40, y: 58 }, -0.9, 1.25, 34, 52, 17, 25), { x: 40, y: 60 }] },
  { ...base, name: 'Arches around the turret', wp: [
    { x: 74, y: -40 }, { x: 70, y: -22 }, { x: 60, y: 2 }, { x: 40, y: 6 }, { x: 18, y: 10 }, { x: 8, y: 26 }, { x: 6, y: 50 }, { x: 7, y: 78 },
    { x: 11, y: 93 }, { x: 19, y: 98 }, { x: 27, y: 92 }, { x: 29, y: 78 }, { x: 28, y: 52 }, { x: 33, y: 36 }, { x: 44, y: 32 }, { x: 54, y: 38 },
    { x: 58, y: 54 }, { x: 60, y: 76 }, { x: 64, y: 92 }, { x: 70, y: 97 }, { x: 74, y: 88 }, { x: 72, y: 60 }, { x: 70, y: 36 },
    // last arch: back over the top of the middle pocket? no room; come down the right into the turret
    { x: 62, y: 20 }, { x: 46, y: 18 }, { x: 40, y: 22 }, { x: 40, y: 40 }, { x: 42, y: 70 }, { x: 40, y: 88 }, T] },
  { ...base, name: 'Lasso with one bridge', bridges: [{ x: 40, y: 76 }], wp: [
    { x: 74, y: -40 }, { x: 71, y: -24 }, { x: 68, y: -8 }, { x: 68, y: 20 }, { x: 68, y: 50 }, { x: 66, y: 66 }, { x: 58, y: 74 }, { x: 40, y: 76 },
    { x: 22, y: 76 }, { x: 13, y: 70 }, { x: 10, y: 58 }, { x: 10, y: 36 }, { x: 13, y: 24 }, { x: 22, y: 18 }, { x: 32, y: 18 }, { x: 39, y: 24 },
    { x: 40, y: 36 }, { x: 40, y: 60 }, { x: 40, y: 76 }, { x: 40, y: 90 }, T] },
];
