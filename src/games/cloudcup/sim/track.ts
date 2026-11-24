import { climbHeight, onClimb, passPoint } from './pass';
// Closed surveying line, resampled by distance. Handling, camera, scenery and
// opponents share these frames so the visual bank agrees with cornering load.
export const LAP = 1080;
const count = 720;
function route(a: number) {
  // The third harmonic pinches the quarter-lap hairpin to a cusp. Ease it
  // out locally so even the offset bridge edges have room to round the bend.
  const fromHairpin = (a - Math.PI / 2) / 1.1;
  const blend = Math.max(0, 1 - fromHairpin * fromHairpin) ** 3;
  const hairpinOffset = 30 * blend * Math.cos(3 * a);
  return {
    x: hairpinOffset + 138 * (1 - Math.cos(a)) + 38 * (1 - Math.cos(3 * a)) + 14 * Math.sin(2 * a),
    z: -154 * Math.sin(a) + 17 * Math.sin(3 * a),
    y: 5 * Math.sin(2 * a - 0.8) + 2.6 * Math.sin(4 * a + 0.2),
  };
}
// Survey stakes around the firing sheds, the descending cooling flume and
// the two return switchbacks. Each stake includes a height above the quarry.
const stakes = [
  [2, 5, 12],
  [1, 4, -47],
  [33, 5, -99],
  [99, 8, -127],
  [179, 13, -135],
  [233, 19, -111],
  [227, 18, -71],
  [165, 13, -56],
  [131, 2, -24],
  [151, -9, 8],
  [228, -11, 12],
  [266, -4, 43],
  [251, 7, 87],
  [188, 13, 104],
  [129, 14, 83],
  [86, 10, 51],
  [64, 7, 66],
  [65, 6, 108],
  [31, 4, 128],
  [-2, 4, 98],
];
function quarry(a: number) {
  const n = stakes.length,
    u = (a * n) / (Math.PI * 2),
    i = Math.floor(u),
    t = u - i;
  const sample = (k: number) => {
    const p = stakes[(i + n - 1) % n][k],
      q = stakes[i % n][k],
      r = stakes[(i + 1) % n][k],
      s = stakes[(i + 2) % n][k];
    return q + 0.5 * t * (r - p + t * (2 * p - 5 * q + 4 * r - s + t * (3 * q - p - 3 * r + s)));
  };
  return { x: sample(0), y: sample(1), z: sample(2) };
}
export const WIDTH = 4.6;
// Additional crossfall in the flume's long left turn. Ease out before the
// return switchback so the horizon is already settled at the next decision.
export function flumeCamber(at: number) {
  const t = (at - 394) / (540 - 394);
  return t > 0 && t < 1 ? 0.25 * Math.sin(Math.PI * t) ** 2 : 0;
}
function surveyCourse(name: string, line: typeof route, camber?: (d: number) => number) {
  const survey = Array.from({ length: count + 1 }, (_, i) => line((i * 2 * Math.PI) / count));
  const arc = [0];
  for (let i = 1; i <= count; i++) {
    const p = survey[i - 1],
      q = survey[i];
    arc.push(arc[i - 1] + Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z));
  }
  const frames = survey.map((p, i) => {
    const prev = survey[(i + count - 1) % count],
      next = survey[(i + 1) % count];
    const yaw = Math.atan2(next.x - prev.x, prev.z - next.z);
    const h1 = Math.atan2(p.x - prev.x, prev.z - p.z),
      h2 = Math.atan2(next.x - p.x, p.z - next.z);
    const delta = Math.atan2(Math.sin(h2 - h1), Math.cos(h2 - h1));
    const turn = Math.max(
      -1,
      Math.min(1, (delta / Math.max(0.1, arc[1 + (i % count)] - arc[i % count])) * 21),
    );
    return { ...p, yaw, turn };
  });
  function interval(distance: number) {
    let lo = 0,
      hi = count;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (arc[mid] <= distance) lo = mid;
      else hi = mid;
    }
    return { lo, hi, t: (distance - arc[lo]) / (arc[hi] - arc[lo]) };
  }
  // Lay in the road bank over the approach and exit of a bend. Instantaneous
  // curvature still drives handling, including at a quarry survey joint.
  const length = arc[count];
  const banks = arc.map((distance) => {
    let sum = 0;
    for (let m = -8; m <= 8; m++) {
      const { lo, hi, t } = interval((distance + m + length) % length);
      sum += (9 - Math.abs(m)) * (frames[lo].turn + (frames[hi].turn - frames[lo].turn) * t);
    }
    return -Math.atan((0.18 * sum) / 81);
  });
  function track(at: number) {
    const distance = ((((at % LAP) + LAP) % LAP) / LAP) * length;
    const { lo, hi, t } = interval(distance);
    const a = frames[lo],
      b = frames[hi];
    const yaw = a.yaw + t * Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw));
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t,
      yaw,
      turn: a.turn + (b.turn - a.turn) * t,
      bank: banks[lo] + (banks[hi] - banks[lo]) * t + (camber?.((distance / length) * LAP) ?? 0),
    };
  }
  function world(at: number, side: number, lift = 0) {
    const p = track(at),
      offset = WIDTH * side;
    return {
      x: p.x + Math.cos(p.yaw) * offset,
      y: p.y + offset * Math.tan(p.bank) + lift,
      z: p.z + Math.sin(p.yaw) * offset,
      yaw: p.yaw,
      bank: p.bank,
    };
  }

  return { name, track, world };
}
// The return deck passes beneath the crown at the center of this figure eight.
function causeway(a: number) {
  return {
    x: 136 + 125 * Math.sin(a),
    z: -112 * Math.sin(2 * a) - 14 * Math.sin(a),
    y: 26 + 20 * Math.cos(a) + 5 * Math.sin(2 * a),
  };
}
function cableSurvey(cut: boolean) {
  function track(d: number) {
    const p = passPoint(d, cut),
      a = passPoint(d - 0.5, cut),
      b = passPoint(d + 0.5, cut);
    const yaw = Math.atan2(b.x - a.x, a.z - b.z);
    const change = Math.atan2(b.x - p.x, p.z - b.z) - Math.atan2(p.x - a.x, a.z - p.z);
    const turn = Math.max(-1, Math.min(1, (42 * Math.sin(change)) / Math.hypot(b.x - a.x, b.z - a.z)));
    return { ...p, yaw, turn, bank: 0 };
  }
  function world(at: number, side: number, lift = 0) {
    const p = track(at);
    const z = p.z + WIDTH * side * Math.sin(p.yaw);
    return {
      ...p,
      x: p.x + WIDTH * side * Math.cos(p.yaw),
      z,
      y: (onClimb(at) ? climbHeight(z) : p.y) + lift,
    };
  }
  return { name: 'Cablehead Pass', track, world };
}
export const winchCut = cableSurvey(true);
export const courses = [
  surveyCourse('Magnet Mile', route),
  surveyCourse('Kiln Switchbacks', quarry, flumeCamber),
  surveyCourse('Stormglass Causeway', causeway),
  surveyCourse('Cinder Bowl', (a) => ({
    x: 115 - 110 * Math.cos(a),
    z: -64 * Math.sin(a) * (1 + 0.19 * Math.cos(a)),
    y: 0,
  })),
  cableSurvey(false),
];
export type Course = (typeof courses)[number];
export const { track, world } = courses[0];
