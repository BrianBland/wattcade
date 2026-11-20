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
// A terraced quarry loop. The long climb on the eastern rim crests
// into a descending pair of esses on the far side.
function quarry(a: number) {
  return {
    x: 150 - 135 * Math.cos(a) + 22 * Math.sin(2 * a) + 9 * Math.cos(3 * a),
    z: -134 * Math.sin(a) - 22 * Math.sin(2 * a) + 15 * Math.sin(3 * a),
    y: 10 * Math.sin(a - 0.8) + 4.5 * Math.sin(3 * a - 0.35),
  };
}
export const WIDTH = 4.6;
function surveyCourse(name: string, line: typeof route) {
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
  function track(at: number) {
    const distance = ((((at % LAP) + LAP) % LAP) / LAP) * arc[count];
    let lo = 0,
      hi = count;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (arc[mid] <= distance) lo = mid;
      else hi = mid;
    }
    const a = frames[lo],
      b = frames[hi],
      t = (distance - arc[lo]) / (arc[hi] - arc[lo]);
    const yaw = a.yaw + t * Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw));
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t,
      yaw,
      turn: a.turn + (b.turn - a.turn) * t,
    };
  }
  function world(at: number, side: number, lift = 0) {
    const p = track(at),
      offset = WIDTH * side;
    return {
      x: p.x + Math.cos(p.yaw) * offset,
      y: p.y - offset * p.turn * 0.18 + lift,
      z: p.z + Math.sin(p.yaw) * offset,
      yaw: p.yaw,
      bank: -Math.atan(p.turn * 0.18),
    };
  }

  return { name, track, world };
}
export const courses = [surveyCourse('Magnet Mile', route), surveyCourse('Kiln Switchbacks', quarry)];
export type Course = (typeof courses)[number];
export const { track, world } = courses[0];
