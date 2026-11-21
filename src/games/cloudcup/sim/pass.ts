// Common race stations measure progress between the valley and saddle.
// Each branch maps its own travelled distance back to those stations.
export const valley = 75,
  saddle = 450;
const climb = saddle - valley,
  straight = 395;
const wrap = (d: number) => ((d % 1080) + 1080) % 1080;
const radius = (1080 - 2 * straight) / (2 * Math.PI);
const offset = (u: number) => -(Math.sin(Math.PI * u) ** 2) * (1 + 0.75 * Math.cos(4 * Math.PI * u));
function survey(amplitude: number) {
  const arc = [0];
  for (let i = 1; i <= climb; i++)
    arc.push(arc[i - 1] + Math.hypot(1, amplitude * (offset(i / climb) - offset((i - 1) / climb))));
  return arc;
}
let lo = 0,
  hi = 110;
for (let i = 0; i < 32; i++) {
  const mid = (lo + hi) / 2;
  if (survey(mid)[climb] < 600) lo = mid;
  else hi = mid;
}
const amplitude = (lo + hi) / 2,
  road = survey(amplitude);
export const carriageLength = road[climb];
export function onClimb(at: number) {
  const d = wrap(at);
  return d >= valley && d < saddle;
}
export function passRate(at: number, cut: boolean) {
  return onClimb(at) && !cut ? climb / carriageLength : 1;
}
export function passGrade(at: number, cut: boolean) {
  const d = wrap(at);
  return onClimb(at) ? (cut ? 4 : 2.5) * Math.max(0, Math.min(1, (d - valley) / 24, (saddle - d) / 24)) : 0;
}
export function passPoint(at: number, cut: boolean) {
  const d = wrap(at - valley),
    u = Math.min(1, d / climb);
  if (d <= straight) {
    let z = d,
      x = 0;
    if (!cut && d > 0 && d < climb) {
      const metres = u * carriageLength;
      let a = 0,
        b = climb;
      while (b - a > 1) {
        const m = (a + b) >> 1;
        if (road[m] <= metres) a = m;
        else b = m;
      }
      z = a + (metres - road[a]) / (road[b] - road[a]);
      x = amplitude * offset(z / climb);
    }
    return { x, y: 15 * u, z: 190 - z };
  }
  const arc = Math.PI * radius,
    back = d - straight;
  if (back < arc) {
    const t = back / radius;
    return { x: radius * (1 - Math.cos(t)), z: 190 - straight - radius * Math.sin(t), y: 15 };
  }
  const down = back - arc;
  if (down <= straight) {
    const t = down / straight;
    return { x: 2 * radius, z: 190 - straight + down, y: 15 * (1 - t * t * (3 - 2 * t)) };
  }
  const t = (down - straight) / radius;
  return { x: radius * (1 + Math.cos(t)), z: 190 + radius * Math.sin(t), y: 0 };
}
