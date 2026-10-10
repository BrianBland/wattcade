import * as THREE from 'three';
import type { SfSnapshot } from '../sim/types';
import { geometries } from './models';
import { groupOf, GROUND_SPEED } from '../sim/encounters';

/** Fixed-size pools: no geometry or material allocation in the frame loop. */
export function createCombat(scene: THREE.Scene) {
  const pool = (geometry: THREE.BufferGeometry, color: string, count: number, glow = false) => {
    const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true,
      opacity: glow ? 0.28 : 0.95, depthWrite: false, blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending }), count);
    mesh.count = 0; mesh.frustumCulled = false; scene.add(mesh); return mesh;
  };
  const trails = pool(geometries.box, '#33eaff', 512, true), cores = pool(geometries.box, '#ddffff', 512);
  const rings = pool(geometries.ring, '#ffe84c', 48), brackets = pool(geometries.box, '#fff76b', 8);
  const shadows=pool(geometries.sphere,'#071b34',96),smoke=pool(geometries.sphere,'#343052',128);
  (shadows.material as THREE.MeshBasicMaterial).opacity=0.3;(smoke.material as THREE.MeshBasicMaterial).opacity=0.28;
  const debris = pool(geometries.box, '#ffb339', 512), flashes = pool(geometries.sphere, '#fff4c9', 160, true);
  // Muzzle charge before an enemy fires, and cyan streak sparks where a bullet grazes the ship.
  const warns = pool(geometries.sphere, '#ffffff', 96, true), warnRings = pool(geometries.ring, '#ffffff', 96, true), sparks = pool(geometries.box, '#9ffbff', 192, true);
  (warns.material as THREE.MeshBasicMaterial).opacity = 0.75; (warnRings.material as THREE.MeshBasicMaterial).opacity = 0.9; (sparks.material as THREE.MeshBasicMaterial).opacity = 0.8;
  const warnColor = new THREE.Color(), gold = new THREE.Color('#ffd34d'), pink = new THREE.Color('#ff45c9'), amber = new THREE.Color('#ffd24f');
  const mat = new THREE.Object3D(), a = new THREE.Vector3(), b = new THREE.Vector3(), direction = new THREE.Vector3(), axis = new THREE.Vector3(0,0,1);
  const bezier = (u: number, sx: number, sy: number, ex: number, ey: number, side: number, height: number, out: THREE.Vector3) => {
    const v = 1 - u;
    out.set(v*v*v*sx + 3*v*v*u*(sx+side) + 3*v*u*u*(ex+side*0.6) + u*u*u*ex,
      (1-u)*10.3+u*height + Math.sin(u * Math.PI) * 5, v*v*v*(sy-50) + 3*v*v*u*(sy-66) + 3*v*u*u*(ey-32) + u*u*u*(ey-50));
  };
  return {
    update(s: SfSnapshot) {
      let n = 0;
      for (const laser of s.lasers) {
        const age = s.t - laser.at; if (age < 0) continue;
        const flight = Math.max(0.05, laser.hitAt - laser.at), head = Math.min(1, age / flight), tail = Math.max(0, (age - flight - 0.16) / 0.52);
        for (let j = 0; j < 24 && n < 512; j++) {
          const u = tail + (head-tail)*j/24, v = tail + (head-tail)*(j+1)/24;
          bezier(u, laser.sx, laser.sy, laser.x, laser.y, laser.side, laser.height, a);
          bezier(v, laser.sx, laser.sy, laser.x, laser.y, laser.side, laser.height, b);
          mat.position.copy(a).add(b).multiplyScalar(0.5); mat.quaternion.setFromUnitVectors(axis,direction.copy(b).sub(a).normalize());
          mat.scale.set(2.5, 0.8, Math.max(0.01, a.distanceTo(b))); mat.updateMatrix(); trails.setMatrixAt(n, mat.matrix);
          mat.scale.x = 0.42; mat.scale.y = 0.24; mat.updateMatrix(); cores.setMatrixAt(n++, mat.matrix);
        }
      }
      trails.count = cores.count = n; trails.instanceMatrix.needsUpdate = cores.instanceMatrix.needsUpdate = true;
      n = 0;
      for (const e of s.enemies) {
        const count = s.locks.filter(id => id === e.id).length, inGroup = s.selectedGroup !== null && groupOf(e) === s.selectedGroup;
        if (!count && e.id !== s.selectedId && !inGroup) continue;
        const size = (e.kind === 'boss' ? 12 : 4.5) * (count || e.id === s.selectedId ? 1 : 0.6);
        mat.position.set(e.x, e.ground?-2.2:12.2, e.y-50); mat.rotation.set(0, s.t * 0.7, 0); mat.scale.setScalar(size); mat.updateMatrix(); rings.setMatrixAt(n++, mat.matrix);
        if (count > 1 && n < 48) { mat.scale.setScalar(size+1); mat.updateMatrix(); rings.setMatrixAt(n++, mat.matrix); }
        if (n >= 46) break;
      }
      rings.count = n; rings.instanceMatrix.needsUpdate = true;
      const selected = s.enemies.find(e => e.id === s.selectedId); n = 0;
      if (selected) for (const dx of [-1, 1]) for (const dz of [-1, 1]) {
        const size = selected.kind === 'boss' ? 14 : 6;
        mat.position.set(selected.x+dx*size, selected.ground?-2:12, selected.y-50+dz*size); mat.rotation.set(0, 0, 0); mat.scale.set(2.5, 0.22, 0.28); mat.updateMatrix(); brackets.setMatrixAt(n++, mat.matrix);
        mat.position.x += dx * 1.1; mat.position.z -= dz * 1.1; mat.scale.set(0.28, 0.22, 2.5); mat.updateMatrix(); brackets.setMatrixAt(n++, mat.matrix);
      }
      brackets.count = n; brackets.instanceMatrix.needsUpdate = true;
      let sh=0;
      for(const e of s.enemies){if(sh>=95)break;mat.position.set(e.x,-5.8,e.y-50+2);mat.rotation.set(0,0,0);mat.scale.set(e.kind==='boss'?23:4,0.03,e.kind==='boss'?13:3);mat.updateMatrix();shadows.setMatrixAt(sh++,mat.matrix);}
      mat.position.set(s.shipX,-5.8,s.shipY-47);mat.scale.set(6,0.03,4);mat.updateMatrix();shadows.setMatrixAt(sh++,mat.matrix);shadows.count=sh;shadows.instanceMatrix.needsUpdate=true;
      let d = 0, f = 0, sm = 0;
      for (const fx of s.fx) {
        const age = s.t-fx.at;
        if (fx.kind !== 'boom' && fx.kind !== 'intercept') continue;
        // Ground explosions and smoke stay put on the terrain as it scrolls.
        const fy = fx.y + (fx.ground ? age * GROUND_SPEED : 0);
        if (age < 0.45 && f < 160) {
          mat.position.set(fx.x,fx.ground?-2:12,fy-50); mat.rotation.set(0, 0, 0); mat.scale.setScalar((fx.kind === 'boom' ? 7*(fx.size??1) : 2) * Math.max(0.01, 1-age/0.45)); mat.updateMatrix(); flashes.setMatrixAt(f++, mat.matrix);
        }
        if(fx.kind==='boom' && sm<128) {mat.position.set(fx.x,(fx.ground?-2:12)+age*5,fy-50);mat.scale.setScalar((2+age*3)*(fx.size??1));mat.updateMatrix();smoke.setMatrixAt(sm++,mat.matrix);}
        if (fx.kind === 'boom') for (let j=0; j<12*(fx.size??1) && d<512; j++) {
          const angle = j*Math.PI/4 + fx.id, speed = (5+j%3*4)*(fx.size??1);
          mat.position.set(fx.x+Math.cos(angle)*age*speed, (fx.ground?-2:12)+Math.sin(age*Math.PI/1.6)*5, fy-50+Math.sin(angle)*age*speed);
          mat.rotation.set(age*3, angle+age*4, age*2); const size=Math.max(0.03, (1-age/1.6)*0.65); mat.scale.set(size, size, size*2); mat.updateMatrix(); debris.setMatrixAt(d++, mat.matrix);
        }
      }
      let w = 0;
      // Elite wings wear a gold ring that breathes with the beat, so they read apart from amber armour.
      for (const e of s.enemies) {
        if (!e.elite || w >= 96) continue;
        mat.position.set(e.x, 10, e.y - 50); mat.rotation.set(0, 0, 0); mat.scale.setScalar(3.2 + s.beat * 0.5); mat.updateMatrix();
        warnRings.setMatrixAt(w, mat.matrix); warns.setMatrixAt(w, mat.matrix); warnColor.copy(gold).multiplyScalar(0.75 + s.beat * 0.25);
        warnRings.setColorAt(w, warnColor); warns.setColorAt(w++, warnColor.multiplyScalar(0.25));
      }
      for (const e of s.enemies) {
        if (!e.warn || e.warn < 0.05 || w >= 96) continue;
        const pulse = 1 + Math.sin(s.t * 26) * 0.12 * e.warn;
        mat.position.set(e.x, e.ground ? -1.5 : e.kind === 'boss' ? 13 : 10, e.y - 50 + 2.5); mat.rotation.set(0, 0, 0);
        const big = e.kind === 'boss' ? 2.2 : 1;
        mat.scale.setScalar((1 + e.warn * 2.8) * pulse * big); mat.updateMatrix(); warns.setMatrixAt(w, mat.matrix);
        // A ring closing in on the muzzle reads as "about to fire".
        mat.scale.setScalar((9 - e.warn * 6) * big); mat.updateMatrix(); warnRings.setMatrixAt(w, mat.matrix);
        warnColor.copy(e.ground || e.kind === 'turret' || e.kind === 'tank' ? amber : pink).multiplyScalar(0.3 + 0.7 * e.warn);
        warns.setColorAt(w, warnColor); warnRings.setColorAt(w++, warnColor);
      }
      for (const p of [warns, warnRings]) { p.count = w; p.instanceMatrix.needsUpdate = true; if (p.instanceColor) p.instanceColor.needsUpdate = true; }
      let k = 0;
      for (const fx of s.fx) {
        const age = s.t - fx.at;
        if (fx.kind !== 'graze' || age > 0.35 || age < 0) continue;
        for (let j = 0; j < 4 && k < 192; j++) {
          const angle = fx.id * 1.7 + j * Math.PI / 2, r = age * 26, life = 1 - age / 0.35;
          mat.position.set(fx.x + Math.cos(angle) * r, 10.6, fx.y - 50 + Math.sin(angle) * r); mat.rotation.set(0, -angle + Math.PI / 2, 0);
          mat.scale.set(0.18 * life, 0.18 * life, 2.4 * life); mat.updateMatrix(); sparks.setMatrixAt(k++, mat.matrix);
        }
      }
      sparks.count = k; sparks.instanceMatrix.needsUpdate = true;
      smoke.count=sm;smoke.instanceMatrix.needsUpdate=true;debris.count=d; flashes.count=f; debris.instanceMatrix.needsUpdate=flashes.instanceMatrix.needsUpdate=true;
    },
    dispose() { for (const mesh of [trails, cores, rings, brackets, debris, flashes, shadows, smoke, warns, warnRings, sparks]) { mesh.dispose(); } },
  };
}
