import * as T from 'three';

// Two ion traces follow the actual exhaust ports through steering and jumps.
// Sample by simulation time so their length doesn't depend on frame rate.
export function buildWake(scene: T.Scene, color: T.ColorRepresentation) {
  const count = 12,
    step = 1 / 40;
  const positions = new T.Float32BufferAttribute(new Float32Array(count * 4 * 3), 3);
  positions.setUsage(T.DynamicDrawUsage);
  const colors: number[] = [],
    triangles: number[] = [],
    rgb = new T.Color(color);
  for (let i = 0; i < count; i++) {
    const alpha = (1 - i / (count - 1)) ** 1.7;
    for (let k = 0; k < 4; k++) colors.push(rgb.r, rgb.g, rgb.b, alpha);
    if (i < count - 1)
      for (const base of [i * 4, i * 4 + 2])
        triangles.push(base, base + 1, base + 4, base + 1, base + 5, base + 4);
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', positions);
  geo.setAttribute('color', new T.Float32BufferAttribute(colors, 4));
  geo.setIndex(triangles);
  const material = new T.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    side: T.DoubleSide,
    depthWrite: false,
    blending: T.AdditiveBlending,
  });
  const mesh = new T.Mesh(geo, material);
  mesh.frustumCulled = false;
  scene.add(mesh);
  const history = Array.from({ length: count }, () => new T.Vector3());
  const lateral = history.map(() => new T.Vector3());
  const centre = new T.Vector3(),
    axis = new T.Vector3(),
    previous = new T.Vector3(),
    previousAxis = new T.Vector3();
  let previousTime = -1,
    lastSample = 0,
    head = 0;
  return (bike: T.Group, time: number, thrust: number, visible: boolean) => {
    mesh.visible = visible;
    if (!visible) {
      previousTime = -1;
      return;
    }
    centre.set(0, 0.55, 1.25).applyQuaternion(bike.quaternion).add(bike.position);
    axis.set(1, 0, 0).applyQuaternion(bike.quaternion);
    if (previousTime < 0 || time - previousTime > 0.25 || previous.distanceToSquared(centre) > 36) {
      for (let i = 0; i < count; i++) {
        history[i].copy(centre);
        lateral[i].copy(axis);
      }
      lastSample = time;
    } else {
      while (lastSample + step <= time) {
        lastSample += step;
        const k = (lastSample - previousTime) / (time - previousTime);
        head = (head + 1) % count;
        history[head].lerpVectors(previous, centre, k);
        lateral[head].lerpVectors(previousAxis, axis, k);
      }
    }
    const fraction = (time - lastSample) / step;
    for (let i = 0; i < count; i++) {
      const j = (head - i + count + 1) % count,
        j0 = (j + count - 1) % count;
      for (let k = 0; k < 4; k++) {
        const side = (k < 2 ? -1 : 1) * 0.51 + (k % 2 ? 1 : -1) * (0.016 + 0.017 * thrust) * (1 - i / count);
        const a = i === 0 ? centre : history[j],
          b = i === 0 ? axis : lateral[j];
        const f = i === 0 ? 1 : fraction;
        positions.setXYZ(
          i * 4 + k,
          (history[j0].x + lateral[j0].x * side) * (1 - f) + (a.x + b.x * side) * f,
          (history[j0].y + lateral[j0].y * side) * (1 - f) + (a.y + b.y * side) * f,
          (history[j0].z + lateral[j0].z * side) * (1 - f) + (a.z + b.z * side) * f,
        );
      }
    }
    material.opacity = Math.min(0.52, 0.12 + 0.16 * thrust);
    previous.copy(centre);
    previousAxis.copy(axis);
    previousTime = time;
    positions.needsUpdate = true;
  };
}
