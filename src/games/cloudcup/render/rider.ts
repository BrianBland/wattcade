import * as T from 'three';

// Rigid weights preserve the painted armor. Two-link arms can lift a glove
// for a sweep while the other hand stays planted on its own grip.
export function riderRig() {
  const v = (x: number, y: number, z: number) => new T.Vector3(x, y, z);
  const rest = [v(0, 0, 0), v(0, 1.03, 0.22), v(0, 1.82, -0.16)];
  for (const side of [-1, 1])
    rest.push(v(0.3 * side, 1.66, -0.04), v(0.52 * side, 1.38, 0.13), v(0.54 * side, 1.21, -0.48));
  const bones = rest.map((p) => {
    const b = new T.Bone();
    b.position.copy(p);
    return b;
  });
  const skeleton = new T.Skeleton(bones);
  const delta = v(0, 0, 0),
    pole = v(0, 0, 0),
    upper = v(0, 0, 0),
    lower = v(0, 0, 0),
    axis = v(0, 0, 0);
  const armLengths = [3, 6].map((i) => ({
    upper: rest[i + 1].distanceTo(rest[i]),
    lower: rest[i + 2].distanceTo(rest[i + 1]),
    upperAxis: rest[i + 1].clone().sub(rest[i]).normalize(),
    lowerAxis: rest[i + 2]
      .clone()
      .sub(rest[i + 1])
      .normalize(),
  }));
  function pose(lean: number, side: number, wind: number, phase: number, settle: number) {
    const draw = wind ? 1 - wind / 1.15 : 0;
    const sweep = phase ? Math.sin(Math.PI * phase) : 0;
    const twist = side * (draw * 0.62 + sweep * (0.64 - 1.28 * phase));
    const torso = bones[1];
    torso.rotation.set(-0.11 * Math.abs(lean) - settle * 0.18, twist, lean * 0.36, 'YXZ');
    const head = bones[2];
    head.position.copy(rest[2]).sub(rest[1]).applyQuaternion(torso.quaternion).add(rest[1]);
    head.rotation.set(-settle * 0.1, -side * (draw * 0.47 + sweep * 0.3), -lean * 0.18, 'YXZ');
    for (let k = 0; k < 2; k++) {
      const i = 3 + k * 3,
        sign = k ? 1 : -1,
        shoulder = bones[i],
        elbow = bones[i + 1],
        hand = bones[i + 2];
      shoulder.position.copy(rest[i]).sub(rest[1]).applyQuaternion(torso.quaternion).add(rest[1]);
      hand.position.copy(rest[i + 2]);
      if (sign === side) {
        hand.position.x += sign * (0.29 * draw + 0.56 * sweep);
        hand.position.y += 0.57 * draw + 0.37 * sweep;
        hand.position.z += 0.53 * draw + sweep * (0.93 * phase + 0.12);
      }
      const length = armLengths[k];
      delta.copy(hand.position).sub(shoulder.position);
      const reach = T.MathUtils.clamp(
        delta.length(),
        Math.abs(length.upper - length.lower) + 0.001,
        length.upper + length.lower - 0.001,
      );
      axis.copy(delta).normalize();
      hand.position.copy(shoulder.position).addScaledVector(axis, reach);
      const along = (length.upper ** 2 - length.lower ** 2 + reach ** 2) / (2 * reach);
      pole.set(sign * 0.36, 0.12, 0.8);
      pole.addScaledVector(axis, -pole.dot(axis)).normalize();
      elbow.position
        .copy(shoulder.position)
        .addScaledVector(axis, along)
        .addScaledVector(pole, Math.sqrt(Math.max(0, length.upper ** 2 - along ** 2)));
      shoulder.quaternion.setFromUnitVectors(
        length.upperAxis,
        upper.copy(elbow.position).sub(shoulder.position).normalize(),
      );
      elbow.quaternion.setFromUnitVectors(
        length.lowerAxis,
        lower.copy(hand.position).sub(elbow.position).normalize(),
      );
      hand.quaternion.copy(elbow.quaternion);
    }
    return bones[side < 0 ? 5 : 8].position;
  }
  return { bones, skeleton, pose };
}
