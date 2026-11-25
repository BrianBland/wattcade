import * as T from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CATCH, DROP, RESCUE, easeBetween } from '../sim/deck';

const iron = '#383940',
  paint = '#d79338',
  stripe = '#f4d799',
  coil = '#487e78';
function body(parts: T.BufferGeometry[]) {
  const geo = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  return geo;
}
function casting(
  parts: T.BufferGeometry[],
  geo: T.BufferGeometry,
  color: string,
  x: number,
  y: number,
  z: number,
) {
  const flat = geo.index ? geo.toNonIndexed() : geo;
  if (flat !== geo) geo.dispose();
  flat.translate(x, y, z);
  const rgb = new T.Color(color),
    colors = new Float32Array(flat.getAttribute('position').count * 3);
  for (let i = 0; i < colors.length; i += 3) rgb.toArray(colors, i);
  flat.setAttribute('color', new T.BufferAttribute(colors, 3));
  parts.push(flat);
}

// One set of castings shared by the four rescue rigs. A flying yard crane
// can reach the rider on either branch without planting a tower in the road.
export function buildCranes(scene: T.Scene) {
  const gantry: T.BufferGeometry[] = [],
    shoe: T.BufferGeometry[] = [];
  const box = (w: number, h: number, d: number) => new T.BoxGeometry(w, h, d);
  casting(gantry, box(2.82, 0.21, 0.43), paint, 0, 0.12, 0);
  casting(gantry, box(0.9, 0.52, 0.77), iron, 0, 0.38, 0);
  casting(gantry, box(0.99, 0.11, 0.84), stripe, 0, 0.64, 0);
  for (const x of [-1.16, 1.16]) {
    casting(gantry, new T.CylinderGeometry(0.61, 0.48, 0.32, 18), iron, x, 0.11, 0);
    const rim = new T.TorusGeometry(0.51, 0.1, 6, 20);
    rim.rotateX(Math.PI / 2);
    casting(gantry, rim, paint, x, 0.27, 0);
    for (let j = 0; j < 3; j++) {
      const blade = box(0.83, 0.05, 0.12);
      blade.rotateY((j * Math.PI) / 3);
      casting(gantry, blade, coil, x, 0.26, 0);
    }
    casting(gantry, new T.CylinderGeometry(0.15, 0.2, 0.15, 10), stripe, x, 0.31, 0);
    casting(gantry, new T.CylinderGeometry(0.3, 0.2, 0.1, 14), '#87d9c5', x, -0.1, 0);
  }
  casting(shoe, new T.CylinderGeometry(0.2, 0.47, 0.23, 18), paint, 0, 0.21, 0);
  casting(shoe, new T.CylinderGeometry(0.49, 0.49, 0.16, 20), iron, 0, 0.08, 0);
  casting(shoe, new T.CylinderGeometry(0.44, 0.41, 0.055, 20), coil, 0, 0.015, 0);
  for (let j = 0; j < 8; j++) {
    const a = (j * Math.PI) / 4;
    casting(shoe, box(0.08, 0.13, 0.08), stripe, Math.cos(a) * 0.4, 0.15, Math.sin(a) * 0.4);
  }
  const bridge = body(gantry),
    magnet = body(shoe),
    cable = new T.CylinderGeometry(0.034, 0.034, 1, 6);
  const enamel = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.22 });
  const braid = new T.MeshStandardMaterial({ color: '#423c3a', roughness: 0.8 });
  const lug = new T.Vector3();
  return Array.from({ length: 4 }, () => {
    const group = new T.Group(),
      frame = new T.Mesh(bridge, enamel),
      hook = new T.Mesh(magnet, enamel),
      wire = new T.Mesh(cable, braid);
    group.visible = false;
    group.add(frame, wire, hook);
    scene.add(group);
    frame.castShadow = hook.castShadow = true;
    return (bike: T.Group, yaw: number, fall: number, away: number) => {
      group.visible = fall > 0 || away > 0;
      if (!group.visible) return;
      const age = RESCUE - fall + (fall ? 0 : 0.4 - away);
      const enter = 1 - easeBetween(age, 0, CATCH),
        leave = easeBetween(age, DROP, RESCUE + 0.4);
      // Locate the magnet at the rear tow lug in the bike's banked frame.
      lug.set(0, 1.0, 0.88).applyQuaternion(bike.quaternion).add(bike.position);
      group.position.copy(lug);
      group.rotation.y = -yaw;
      const travel = enter + leave;
      const offset = 2.4 * travel,
        pickHeight = travel * (2.2 + travel * 3.5);
      hook.position.set(offset, pickHeight, 0);
      const hoist = pickHeight + 1.25 + 0.95 * enter + 0.55 * (1 - easeBetween(age, CATCH, 1.16));
      frame.position.set(offset, hoist, 0);
      const bottom = pickHeight + 0.3;
      wire.position.set(offset, (hoist + bottom) * 0.5, 0);
      wire.scale.y = hoist - bottom;
    };
  });
}
