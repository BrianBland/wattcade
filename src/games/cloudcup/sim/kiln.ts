// Distances are measured along the surveyed lap. The kiln bed is solid across
// its width. Its cooling flume pinches after the first drum opens onto the rim.
import { lapAt, easeBetween } from './deck';

export const firingRuns = [
  { entry: 88, exit: 332, from: -0.74, to: 0.68 },
  { entry: 704, exit: 908, from: 0.82, to: -0.8 },
];
export const pressureCells = [
  { at: 434, x: -0.46 },
  { at: 638, x: 0.56 },
  { at: 971, x: -0.32 },
];
export function kilnWidth(at: number) {
  const d = lapAt(at);
  const flume = easeBetween(d, 374, 445) * (1 - easeBetween(d, 568, 650));
  return 1.58 - 0.78 * flume;
}
export function firingLine(run: (typeof firingRuns)[number], at: number) {
  const t = (at - run.entry) / (run.exit - run.entry);
  return run.from + (run.to - run.from) * easeBetween(t, 0.26, 0.72);
}
export function firebox(at: number) {
  const d = lapAt(at);
  return firingRuns.find((run) => d >= run.entry && d < run.exit);
}
export function fireboxLight(at: number) {
  const d = lapAt(at);
  return firingRuns.reduce(
    (heat, r) =>
      Math.max(
        heat,
        easeBetween(d, r.entry - 30, r.entry + 20) * (1 - easeBetween(d, r.exit - 18, r.exit + 32)),
      ),
    0,
  );
}
export const seamHalfWidth = 0.42;
export const requiredCoverage = 0.64;
export function firingGear() {
  return { coverage: 0, releases: 0, onSeam: false };
}
// Integrate distance rather than time. Parking or inching along a few hot
// bricks cannot charge a full firing run. Missing the ribbon allows a pass.
export function rideSeam(
  gear: ReturnType<typeof firingGear>,
  from: number,
  to: number,
  x: number,
  powered: boolean,
) {
  const d = lapAt(from);
  const next = d + (to - from);
  gear.onSeam = false;
  for (const run of firingRuns) {
    const start = Math.max(d, run.entry),
      end = Math.min(next, run.exit);
    if (end <= start) continue;
    if (d <= run.entry) gear.coverage = 0;
    gear.onSeam = powered && Math.abs(x - firingLine(run, (start + end) / 2)) <= seamHalfWidth;
    if (gear.onSeam) gear.coverage += (end - start) / (run.exit - run.entry);
    if (next >= run.exit) {
      const charged = gear.coverage >= requiredCoverage;
      gear.coverage = 0;
      gear.onSeam = false;
      if (charged) gear.releases++;
      return charged;
    }
  }
  return false;
}
