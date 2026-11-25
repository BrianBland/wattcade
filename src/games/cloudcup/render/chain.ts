import * as T from 'three';
import { chainPath, linkCount } from '../sim/chain';

// The long axis is local X. Alternate the link plane a quarter turn about
// that axis so the eye of one link passes through its neighbour.
export function buildChain() {
  const shape = new T.TorusGeometry(0.113, 0.029, 7, 18);
  shape.scale(1.3, 0.8, 1);
  const steel = new T.MeshStandardMaterial({ color: 0xffffff, metalness: 0.47, roughness: 0.33 });
  const mesh = new T.InstancedMesh(shape, steel, 2 * linkCount);
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  const joint = new T.Object3D(),
    tangent = new T.Vector3(),
    up = new T.Vector3(0, 1, 0);
  const normal = new T.Vector3(),
    inPlane = new T.Vector3(),
    frame = new T.Matrix4();
  const lastGrips = [new T.Vector3(Infinity, 0, 0), new T.Vector3(Infinity, 0, 0)];
  const carried = [false, false];
  const path = new Float32Array((linkCount + 1) * 3);
  for (let i = 0; i < 2 * linkCount; i++) {
    const link = i % linkCount;
    mesh.setColorAt(i, new T.Color(link >= linkCount - 2 ? '#d39a5a' : link % 2 ? '#827b74' : '#d4cec1'));
  }
  function pose(side: number, phase: number, grips: readonly T.Vector3[]) {
    for (let slot = 0; slot < 2; slot++) {
      const sign = slot ? 1 : -1,
        hand = grips[slot];
      const active = sign === side ? phase : 0;
      if (!active && carried[slot] && lastGrips[slot].distanceToSquared(hand) < 1e-8) continue;
      carried[slot] = !active;
      lastGrips[slot].copy(hand);
      chainPath(active, sign, path);
      for (let k = 0; k < linkCount; k++) {
        const j = k * 3;
        tangent.set(path[j + 3] - path[j], path[j + 4] - path[j + 1], path[j + 5] - path[j + 2]).normalize();
        joint.position
          .set((path[j] + path[j + 3]) / 2, (path[j + 1] + path[j + 4]) / 2, (path[j + 2] + path[j + 5]) / 2)
          .add(hand);
        normal.crossVectors(tangent, up).normalize();
        inPlane.crossVectors(normal, tangent);
        joint.quaternion.setFromRotationMatrix(frame.makeBasis(tangent, inPlane, normal));
        joint.rotateX(0.31 + ((k % 2) * Math.PI) / 2);
        joint.updateMatrix();
        mesh.setMatrixAt(slot * linkCount + k, joint.matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  return { mesh, pose };
}
