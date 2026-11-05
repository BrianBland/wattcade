import * as THREE from 'three';
import type { SfSnapshot } from '../sim/types';
import { geometries } from './models';
import { groupOf, GROUND_SPEED } from '../sim/encounters';
import { createVfx, h01, VFX } from './vfx';

/** Fixed-size pools: no geometry or material allocation in the frame loop. */
export function createCombat(scene: THREE.Scene) {
  const pool = (geometry: THREE.BufferGeometry, color: string, count: number, glow = false) => {
    const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true,
      opacity: glow ? 0.28 : 0.95, depthWrite: false, blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending }), count);
    mesh.count = 0; mesh.frustumCulled = false; scene.add(mesh); return mesh;
  };
  // Glowing particles and smoke (render/vfx.ts): lasers, player bolts, fireballs, sparks, flashes, shock rings, smoke.
  const vfx = createVfx(scene), trailColor = new THREE.Color(), C = (hex: string) => new THREE.Color(hex);
  const FLASH = C('#ffd9a0'), SPARK = C('#ff8a2a'), RING = C('#ffb46a'), SMOKE_AIR = C('#4a4448'), SMOKE_GROUND = C('#5a5048'), HIT = C('#bff6ff');
  const BOLT = { cyan: C('#5fe6ff'), white: C('#b9f4ff'), gold: C('#ffcf4a') };
  // Lancer beams: a dashed warning line, then a brief bright beam with a white core.
  const dashes = pool(geometries.box, '#ffffff', 384), beamGlow = pool(geometries.box, '#ff3fd0', 24, true), beamCore = pool(geometries.box, '#ffffff', 24);
  (beamGlow.material as THREE.MeshBasicMaterial).opacity = 0.6; const dashColor = new THREE.Color(), beamPink = new THREE.Color('#ff3fd0'), white = new THREE.Color('#ffffff');
  // Tempo Striker: an amber blade along the swept span, and a thin slash up to each enemy it hits (at most 8 at
  // once, a quarter second each, so a column of hits never flares).
  const blade = pool(geometries.box, '#ffcf3a', 2, true), slashes = pool(geometries.box, '#ffcf3a', 8, true), slashCores = pool(geometries.box, '#fff6d8', 8);
  const rings = pool(geometries.ring, '#ffe84c', 48), brackets = pool(geometries.box, '#fff76b', 8);
  const shadows=pool(geometries.sphere,'#071b34',96);
  (shadows.material as THREE.MeshBasicMaterial).opacity=0.3;
  // Tumbling hull fragments (a few per blast; the fire, sparks and smoke are particles).
  const debris = pool(geometries.box, '#8a5a3a', 256);
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
    /** `lift`: how far the terrain has risen toward the ship (ground shadows and blasts follow it). */
    update(s: SfSnapshot, lift = 0) {
      vfx.begin();
      let n = 0;
      for (const laser of s.lasers) {
        const age = s.t - laser.at; if (age < 0) continue;
        const flight = Math.max(0.05, laser.hitAt - laser.at), head = Math.min(1, age / flight), tail = Math.max(0, (age - flight - 0.16) / 0.52);
        // Lasers grow with the arsenal: thin cyan, then wider white-cyan, then a gold core. Full-lock volleys burn gold.
        const tier = laser.tier ?? 1, swell = 0.8 + (laser.amp ?? 0.5) * 0.45, wide = (0.8 + tier * 0.08) * swell;
        trailColor.set(laser.heavy ? '#ff9d4d' : laser.full ? '#ffe066' : tier >= 7 ? '#5fd0ff' : tier >= 4 ? '#8fe9ff' : '#33eaff');
        const fade = Math.max(0, (age - flight) / 0.68);
        for (let j = 0; j < 16; j++) {
          const u = tail + (head-tail)*j/16, v = tail + (head-tail)*(j+1)/16;
          bezier(u, laser.sx, laser.sy, laser.x, laser.y, laser.side, laser.height, a);
          bezier(v, laser.sx, laser.sy, laser.x, laser.y, laser.side, laser.height, b);
          const len = a.distanceTo(b); if (len < 0.01) continue;
          vfx.add(VFX.beam, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, len * 1.08, 1.4 * wide, trailColor, fade, 0, b.x - a.x, b.y - a.y, b.z - a.z);
        }
        // A bright head while the laser is still travelling.
        if (head < 1) { bezier(head, laser.sx, laser.sy, laser.x, laser.y, laser.side, laser.height, a); vfx.add(VFX.flash, a.x, a.y, a.z, 2.4 * wide, 2.4 * wide, trailColor, 0.45); }
        n++;
      }
      // Player pulse shots: capsule bolts that grow with the arsenal (dots, bolts, spears; gold at the top tiers).
      for (const sh of s.shots.slice(0, 400)) {
        const len = sh.kind === 'wing' ? 3 : sh.tier >= 4 ? 6.4 : sh.tier >= 2 ? 4.4 : 2.6, wid = sh.kind === 'wing' ? 1 : sh.tier >= 4 ? 1.5 : 1.3;
        vfx.add(VFX.bolt, sh.x, 10.7, sh.y - 50, len, wid, sh.kind === 'wing' ? BOLT.cyan : sh.tier >= 7 ? BOLT.gold : sh.tier >= 4 ? BOLT.white : BOLT.cyan, 0, 0, sh.vx, 0, sh.vy);
      }
      let dn = 0, bn = 0;
      for (const beam of s.beams) {
        const end = 125, length = Math.max(1, end - beam.y);
        if (s.t < beam.fireAt) {
          // Warning: dashes firm up through the bar and scroll toward the ship.
          const u = Math.min(1, Math.max(0, (s.t - beam.warnAt) / Math.max(0.1, beam.fireAt - beam.warnAt))), scroll = (s.t * 30) % 6;
          dashColor.copy(beamPink).lerp(white, 0.15 * u);
          for (let y = beam.y + 4 + scroll; y < end && dn < 384; y += 6) {
            mat.position.set(beam.x, 11, y - 50); mat.rotation.set(0, 0, 0); mat.scale.set(0.45 + u * 0.5, 0.12, 2.8); mat.updateMatrix();
            dashes.setMatrixAt(dn, mat.matrix); dashes.setColorAt(dn++, dashColor);
          }
        } else if (bn < 24) {
          const life = Math.max(0, 1 - (s.t - beam.fireAt) / 0.45);
          mat.position.set(beam.x, 11, (beam.y + end) / 2 - 50); mat.rotation.set(0, 0, 0);
          mat.scale.set(0.6 + 3.4 * life, 0.6, length); mat.updateMatrix(); beamGlow.setMatrixAt(bn, mat.matrix);
          mat.scale.set(0.1 + 0.7 * life, 0.4, length); mat.updateMatrix(); beamCore.setMatrixAt(bn++, mat.matrix);
        }
      }
      dashes.count = dn; beamGlow.count = beamCore.count = bn;
      for (const p of [dashes, beamGlow, beamCore]) { p.instanceMatrix.needsUpdate = true; if (p.instanceColor) p.instanceColor.needsUpdate = true; }
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
      for(const e of s.enemies){if(sh>=95)break;mat.position.set(e.x,-5.8+lift,e.y-50+2);mat.rotation.set(0,0,0);mat.scale.set(e.kind==='boss'?23:4,0.03,e.kind==='boss'?13:3);mat.updateMatrix();shadows.setMatrixAt(sh++,mat.matrix);}
      mat.position.set(s.shipX,-5.8+lift,s.shipY-47);mat.scale.set(6,0.03,4);mat.updateMatrix();shadows.setMatrixAt(sh++,mat.matrix);shadows.count=sh;shadows.instanceMatrix.needsUpdate=true;
      let d = 0;
      for (const fx of s.fx) {
        const age = s.t - fx.at;
        if ((fx.kind !== 'boom' && fx.kind !== 'intercept') || age < 0) continue;
        // Ground explosions and smoke stay put on the terrain as it scrolls.
        const fy = fx.y + (fx.ground ? (fx.s !== undefined ? s.world.s - fx.s : age * GROUND_SPEED) : 0), x = fx.x, y = fx.ground ? -2 + lift : 12, z = fy - 50, S = fx.size ?? 1, id = fx.id;
        if (fx.kind === 'intercept') { // a hit: a small flash and a few sparks
          if (age < 0.15) vfx.add(VFX.flash, x, y, z, 3.2 * S, 3.2 * S, HIT, age / 0.15);
          if (age < 0.3) for (let j = 0; j < 3; j++) { const an = h01(id * 3 + j) * 6.283, sp = 18 + 14 * h01(id * 5 + j), vx = Math.cos(an) * sp, vz = Math.sin(an) * sp, l = age / 0.3;
            vfx.add(VFX.spark, x + vx * age, y + 1, z + vz * age, 1.2 + sp * 0.04, 0.16, HIT, l, 0, vx, 0, vz); }
          continue;
        }
        // Blast: flash, turbulent fireballs, sparks, a shock ring, then smoke rising; a few tumbling fragments.
        if (age < 0.12) vfx.add(VFX.flash, x, y + 1, z, 11 * S, 11 * S, FLASH, age / 0.12);
        if (age < 0.6) for (let j = 0; j < 5; j++) {
          const an = h01(id * 7 + j) * 6.283, l = age / 0.6, out = (1.2 + 3 * h01(id * 13 + j)) * S * (1 - (1 - l) * (1 - l)), sz = (3.2 + 2.4 * h01(id + j * 31)) * S * (0.55 + 0.8 * Math.sqrt(l));
          vfx.add(VFX.fire, x + Math.cos(an) * out, y + (fx.ground ? 1 : 0.5) + l * 3 * S, z + Math.sin(an) * out, sz, sz, FLASH, l, h01(id + j * 3));
        }
        if (age < 0.55) for (let j = 0; j < Math.min(16, 10 * S); j++) {
          const an = h01(id * 11 + j) * 6.283, up = (h01(id * 17 + j) - 0.25) * 0.8, sp = (22 + 26 * h01(id * 19 + j)) * S, l = age / 0.55, travel = age * (1 - 0.45 * l);
          const vx = Math.cos(an) * sp, vz = Math.sin(an) * sp, vy = up * sp - 22 * age;
          vfx.add(VFX.spark, x + vx * travel, y + up * sp * travel - 10 * age * age, z + vz * travel, 1.4 + sp * 0.05 * (1 - l), 0.2, SPARK, l, 0, vx, vy, vz);
        }
        if (age < 0.35) { const l = age / 0.35, r = 9 * S * (0.3 + l * 1.6); vfx.add(VFX.ring, x, y + 0.5, z, r, r, RING, l); }
        if (age > 0.1 && age < 1.7) for (let j = 0; j < 4; j++) {
          const l = (age - 0.1) / 1.6, an = h01(id * 23 + j) * 6.283, sz = (3 + l * 7) * S * (0.8 + 0.4 * h01(id + j));
          vfx.smoke(x + Math.cos(an) * 2 * S, y + 1 + l * 7 * S + j * 0.6, z + Math.sin(an) * 2 * S, sz, fx.ground ? SMOKE_GROUND : SMOKE_AIR, l, h01(id * 29 + j));
        }
        if (age < 1.4) for (let j = 0; j < 6 * S && d < 256; j++) {
          const angle = j * Math.PI / 3 + id, speed = (5 + j % 3 * 4) * S;
          mat.position.set(x + Math.cos(angle) * age * speed, y + Math.sin(age * Math.PI / 1.4) * 5, z + Math.sin(angle) * age * speed);
          mat.rotation.set(age * 3, angle + age * 4, age * 2); const sz = Math.max(0.03, (1 - age / 1.4) * 0.6); mat.scale.set(sz, sz, sz * 2); mat.updateMatrix(); debris.setMatrixAt(d++, mat.matrix);
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
      let bl = 0, sl = 0;
      if (s.strike) {
        // Grows with the roll, then thins out over 0.6 s after it lands.
        const st = s.strike, life = s.t <= st.until ? 1 : Math.max(0, 1 - (s.t - st.until) / 0.6), w = Math.abs(st.x1 - st.x0) + 3;
        if (life > 0) for (const [h, scale] of [[1.6, 1], [0.5, 0.35]] as const) {
          mat.position.set((st.x0 + st.x1) / 2, 10.4, s.shipY - 50); mat.rotation.set(0, 0, 0); mat.scale.set(w, 0.3, h * life * (1 + scale)); mat.updateMatrix(); blade.setMatrixAt(bl++, mat.matrix);
        }
      }
      for (let q = s.fx.length - 1; q >= 0; q--) {
        const fx = s.fx[q], age = s.t - fx.at; if (fx.kind !== 'strike' || age > 0.25 || sl >= 8) continue;
        const life = 1 - age / 0.25, length = Math.max(1, s.shipY - fx.y);
        mat.position.set(fx.x, 10.8, fx.y + length / 2 - 50); mat.rotation.set(0, 0, 0);
        mat.scale.set(0.8 * life, 0.4, length); mat.updateMatrix(); slashes.setMatrixAt(sl, mat.matrix);
        mat.scale.set(0.16 * life, 0.5, length); mat.updateMatrix(); slashCores.setMatrixAt(sl++, mat.matrix);
      }
      blade.count = bl; slashes.count = sl; slashCores.count = sl;
      blade.instanceMatrix.needsUpdate = slashes.instanceMatrix.needsUpdate = slashCores.instanceMatrix.needsUpdate = true;
      debris.count = d; debris.instanceMatrix.needsUpdate = true;
      vfx.flush();
    },
    dispose() { vfx.dispose(); for (const mesh of [rings, brackets, debris, shadows, warns, warnRings, sparks, dashes, beamGlow, beamCore, blade, slashes, slashCores]) { mesh.dispose(); } },
  };
}
