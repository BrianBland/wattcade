import * as THREE from 'three';
import type { SfSnapshot } from '../sim/types';
import { geometries } from './models';

/** Fixed-size pools: no geometry or material allocation in the frame loop. */
export function createCombat(scene: THREE.Scene) {
  const pool = (geometry: THREE.BufferGeometry, color: string, count: number, glow = false) => {
    const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true,
      opacity: glow ? 0.28 : 0.95, depthWrite: false, blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending }), count);
    mesh.count = 0; mesh.frustumCulled = false; scene.add(mesh); return mesh;
  };
  const trails = pool(geometries.box, '#33eaff', 512, true), cores = pool(geometries.box, '#ddffff', 512);
  const rings = pool(geometries.ring, '#ffe84c', 48), brackets = pool(geometries.box, '#fff76b', 8);
  const debris = pool(geometries.box, '#ffb339', 512), flashes = pool(geometries.sphere, '#fff4c9', 160, true);
  const mat = new THREE.Object3D(), a = new THREE.Vector3(), b = new THREE.Vector3(), direction = new THREE.Vector3(), axis = new THREE.Vector3(0,0,1);
  const bezier = (u: number, sx: number, sy: number, ex: number, ey: number, side: number, out: THREE.Vector3) => {
    const v = 1 - u;
    out.set(v*v*v*sx + 3*v*v*u*(sx+side) + 3*v*u*u*(ex+side*0.6) + u*u*u*ex,
      1.3 + Math.sin(u * Math.PI) * 5, v*v*v*(sy-50) + 3*v*v*u*(sy-66) + 3*v*u*u*(ey-32) + u*u*u*(ey-50));
  };
  return {
    update(s: SfSnapshot) {
      let n = 0;
      for (const laser of s.lasers) {
        const age = s.t - laser.at; if (age < 0) continue;
        const head = Math.min(1, age / 0.52), tail = Math.max(0, (age - 0.68) / 0.52);
        for (let j = 0; j < 24 && n < 512; j++) {
          const u = tail + (head-tail)*j/24, v = tail + (head-tail)*(j+1)/24;
          bezier(u, laser.sx, laser.sy, laser.x, laser.y, laser.side, a);
          bezier(v, laser.sx, laser.sy, laser.x, laser.y, laser.side, b);
          mat.position.copy(a).add(b).multiplyScalar(0.5); mat.quaternion.setFromUnitVectors(axis,direction.copy(b).sub(a).normalize());
          mat.scale.set(2.5, 0.8, Math.max(0.01, a.distanceTo(b))); mat.updateMatrix(); trails.setMatrixAt(n, mat.matrix);
          mat.scale.x = 0.42; mat.scale.y = 0.24; mat.updateMatrix(); cores.setMatrixAt(n++, mat.matrix);
        }
      }
      trails.count = cores.count = n; trails.instanceMatrix.needsUpdate = cores.instanceMatrix.needsUpdate = true;
      n = 0;
      for (const e of s.enemies) {
        const count = s.locks.filter(id => id === e.id).length;
        if (!count && e.id !== s.selectedId) continue;
        const size = e.kind === 'boss' ? 12 : 4.5;
        mat.position.set(e.x, 2.2, e.y-50); mat.rotation.set(0, s.t * 0.7, 0); mat.scale.setScalar(size); mat.updateMatrix(); rings.setMatrixAt(n++, mat.matrix);
        if (count > 1 && n < 48) { mat.scale.setScalar(size+1); mat.updateMatrix(); rings.setMatrixAt(n++, mat.matrix); }
        if (n >= 46) break;
      }
      rings.count = n; rings.instanceMatrix.needsUpdate = true;
      const selected = s.enemies.find(e => e.id === s.selectedId); n = 0;
      if (selected) for (const dx of [-1, 1]) for (const dz of [-1, 1]) {
        const size = selected.kind === 'boss' ? 14 : 6;
        mat.position.set(selected.x+dx*size, 2, selected.y-50+dz*size); mat.rotation.set(0, 0, 0); mat.scale.set(2.5, 0.22, 0.28); mat.updateMatrix(); brackets.setMatrixAt(n++, mat.matrix);
        mat.position.x += dx * 1.1; mat.position.z -= dz * 1.1; mat.scale.set(0.28, 0.22, 2.5); mat.updateMatrix(); brackets.setMatrixAt(n++, mat.matrix);
      }
      brackets.count = n; brackets.instanceMatrix.needsUpdate = true;
      let d = 0, f = 0;
      for (const fx of s.fx) {
        const age = s.t-fx.at;
        if (fx.kind !== 'boom' && fx.kind !== 'intercept') continue;
        if (age < 0.45 && f < 160) {
          mat.position.set(fx.x, 1, fx.y-50); mat.rotation.set(0, 0, 0); mat.scale.setScalar((fx.kind === 'boom' ? 5 : 2) * Math.max(0.01, 1-age/0.45)); mat.updateMatrix(); flashes.setMatrixAt(f++, mat.matrix);
        }
        if (fx.kind === 'boom') for (let j=0; j<8 && d<512; j++) {
          const angle = j*Math.PI/4 + fx.id, speed = 4+j%3*3;
          mat.position.set(fx.x+Math.cos(angle)*age*speed, 1+Math.sin(age*Math.PI/1.6)*3, fx.y-50+Math.sin(angle)*age*speed);
          mat.rotation.set(age*3, angle+age*4, age*2); const size=Math.max(0.03, (1-age/1.6)*0.65); mat.scale.set(size, size, size*2); mat.updateMatrix(); debris.setMatrixAt(d++, mat.matrix);
        }
      }
      debris.count=d; flashes.count=f; debris.instanceMatrix.needsUpdate=flashes.instanceMatrix.needsUpdate=true;
    },
    dispose() { for (const mesh of [trails, cores, rings, brackets, debris, flashes]) { mesh.dispose(); } },
  };
}
