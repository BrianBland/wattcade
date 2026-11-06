import * as THREE from 'three';
import type { SfSnapshot } from '../sim/types';
import { geometries } from './models';
import { groupOf, GROUND_SPEED } from '../sim/encounters';
import { createVfx, h01, VFX } from './vfx';
import { blast, flagshipBlast, type BlastColors } from './blast';
import { FLAGSHIPS } from './flagships';

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
  const AIR: BlastColors = { flash: FLASH, spark: SPARK, ring: RING, ember: C('#ffb050'), smoke: SMOKE_AIR, dust: C('#6a5a48') }, GROUND: BlastColors = { ...AIR, smoke: SMOKE_GROUND };
  const hitHeat = C('#ff0000').setRGB(0.9, 0, 0), wreck = { x: 0, y: 0, z: 0 };
  const BOLT = { cyan: C('#5fe6ff'), white: C('#b9f4ff'), gold: C('#ffcf4a') };
  // Beat weapons: Escort arc lightning (violet-white), Striker rails (amber), Gunship flak (orange shells, dark puffs),
  // Cruiser missiles (smoke trails), Escort plasma beam.
  const ARC = C('#b9a2ff'), ARC_HOT = C('#e6f0ff'), RAIL = C('#ffb02e'), FLAK = C('#ff8a3a'), FLAK_PUFF = C('#2e2a2c'), MISSILE_SMOKE = C('#9a9aa4'), PLASMA = C('#c58cff');
  const jag = new THREE.Vector3(), jag2 = new THREE.Vector3();
  // Blizzard flakes: seeds fixed per mount, positions a pure function of the accumulated wind shift.
  const FLAKES = 1600, BOX = { x0: -190, sx: 380, y0: -4, sy: 50, z0: -320, sz: 420 }, shift = new THREE.Vector3(); let snowT = -1;
  const wrapIn = (u: number, sh: number, mn: number, sz: number) => mn + (((u * sz + sh) % sz) + sz) % sz;
  const flakeSeeds = new Float32Array(FLAKES * 4); { let q = 12345; for (let i = 0; i < flakeSeeds.length; i++) flakeSeeds[i] = (q = (q * 16807) % 2147483647) / 2147483647; }
  // Lancer beams: a dashed warning line, then a brief bright beam with a white core.
  const dashes = pool(geometries.box, '#ffffff', 384), beamGlow = pool(geometries.box, '#ff3fd0', 24, true), beamCore = pool(geometries.box, '#ffffff', 24);
  (beamGlow.material as THREE.MeshBasicMaterial).opacity = 0.6; const dashColor = new THREE.Color(), beamPink = new THREE.Color('#ff3fd0'), white = new THREE.Color('#ffffff');
  // Tempo Striker: an amber blade along the swept span, and a thin slash up to each enemy it hits (at most 8 at
  // once, a quarter second each, so a column of hits never flares).
  const blade = pool(geometries.box, '#ffcf3a', 2, true), slashes = pool(geometries.box, '#ffcf3a', 8, true), slashCores = pool(geometries.box, '#fff6d8', 8);
  const rings = pool(geometries.ring, '#ffe84c', 48), brackets = pool(geometries.box, '#fff76b', 8);
  const shadows=pool(geometries.sphere,'#071b34',96);
  (shadows.material as THREE.MeshBasicMaterial).opacity=0.3;
  // Tumbling hull fragments (a few per blast, glowing hot; the fire, sparks and smoke are particles).
  const debris = new THREE.InstancedMesh(geometries.rock, new THREE.MeshStandardMaterial({ color: '#3b3533', metalness: 0.55, roughness: 0.5, emissive: '#ff5a1a', emissiveIntensity: 0.45 }), 384);
  debris.count = 0; debris.frustumCulled = false; scene.add(debris);
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
    /** `snow` 0..1: blizzard strength (arctic), drawn as wind-driven flakes in the alpha particle layer. */
    update(s: SfSnapshot, lift = 0, snow = 0) {
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
        // A missile body and hot exhaust while it travels, leaving a thin smoke trail that thins out behind it.
        if (head < 1) {
          bezier(head, laser.sx, laser.sy, laser.x, laser.y, laser.side, laser.height, a); bezier(Math.max(0, head - 0.04), laser.sx, laser.sy, laser.x, laser.y, laser.side, laser.height, b);
          vfx.add(VFX.bolt, a.x, a.y, a.z, 2.6 * wide, 0.9 * wide, trailColor, 0, 0, a.x - b.x, a.y - b.y, a.z - b.z);
          vfx.add(VFX.flash, b.x, b.y, b.z, 1.8 * wide, 1.8 * wide, laser.full ? FLASH : trailColor, 0.35);
          for (let j = 1; j <= 5; j++) {
            const u = head - j * 0.07; if (u <= tail) break;
            bezier(u, laser.sx, laser.sy, laser.x, laser.y, laser.side, laser.height, b);
            vfx.smoke(b.x, b.y + j * 0.15, b.z, 0.9 + j * 0.35, MISSILE_SMOKE, Math.min(1, 0.35 + j * 0.12), h01(laser.id * 7 + j));
          }
        }
        n++;
      }
      // Escort tether: a faint, flickering thread to the lead target between strikes, brighter with the song's volume.
      const lead = s.weapon === 'arc' && s.phase === 'run' && s.quality >= 0.8 ? s.enemies.find(e => e.id === s.selectedId) : undefined;
      if (lead) {
        const loud = Math.min(1, 0.6 * s.amp + 0.4 * (s.bands[0] + s.bands[1] + s.bands[2]) / 3), glow = 0.25 + 0.6 * loud + 0.3 * s.beat;
        const x0 = s.shipX, y0 = 11, z0 = s.shipY - 53, x1 = lead.x, y1 = lead.ground ? -3.5 : lead.kind === 'boss' ? 13 : 12, z1 = lead.y - 50;
        const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz) || 1, nx = -dz / len, nz = dx / len, steps = Math.max(4, Math.min(12, Math.round(len / 5))), flick = Math.floor(s.t * 24);
        jag.set(x0, y0, z0);
        for (let q = 1; q <= steps; q++) {
          const u = q / steps, off = q === steps ? 0 : (h01(lead.id * 97 + q * 13 + flick * 389) - 0.5) * Math.min(3, len * 0.12);
          jag2.set(x0 + dx * u + nx * off, y0 + (y1 - y0) * u, z0 + dz * u + nz * off);
          vfx.add(VFX.beam, (jag.x + jag2.x) / 2, (jag.y + jag2.y) / 2, (jag.z + jag2.z) / 2, jag.distanceTo(jag2) * 1.1, 0.5 + 0.5 * loud, ARC, 1 - 0.55 * glow, 0, jag2.x - jag.x, jag2.y - jag.y, jag2.z - jag.z);
          jag.copy(jag2);
        }
        vfx.add(VFX.flash, x1, y1, z1, 2 + 2 * loud, 2 + 2 * loud, ARC, 1 - 0.5 * glow);
      }
      // Escort arc lightning: a jagged, flickering bolt through each struck enemy, with a flash at each strike.
      for (const arc of s.arcs) {
        const age = s.t - arc.at; if (age < 0 || age > 0.4) continue;
        const life = age / 0.4, flick = Math.floor(age * 40), wide = (0.9 + arc.tier * 0.06) * (arc.major ? 1.5 : 1);
        for (let k = 0; k + 5 < arc.pts.length; k += 3) {
          const x0 = arc.pts[k], z0 = arc.pts[k + 1] - 50, y0 = arc.pts[k + 2], x1 = arc.pts[k + 3], z1 = arc.pts[k + 4] - 50, y1 = arc.pts[k + 5];
          const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz) || 1, nx = -dz / len, nz = dx / len, steps = Math.max(3, Math.min(9, Math.round(len / 4)));
          jag.set(x0, y0, z0);
          for (let q = 1; q <= steps; q++) {
            const u = q / steps, off = q === steps ? 0 : (h01(arc.id * 131 + k * 17 + q * 7 + flick * 1013) - 0.5) * Math.min(5, len * 0.22);
            jag2.set(x0 + dx * u + nx * off, y0 + (y1 - y0) * u + (h01(arc.id + q * 3 + flick) - 0.5) * 1.2, z0 + dz * u + nz * off);
            const sl = jag.distanceTo(jag2);
            vfx.add(VFX.beam, (jag.x + jag2.x) / 2, (jag.y + jag2.y) / 2, (jag.z + jag2.z) / 2, sl * 1.15, 1.5 * wide, ARC, life, 0, jag2.x - jag.x, jag2.y - jag.y, jag2.z - jag.z);
            vfx.add(VFX.beam, (jag.x + jag2.x) / 2, (jag.y + jag2.y) / 2, (jag.z + jag2.z) / 2, sl * 1.1, 0.45 * wide, ARC_HOT, life * 0.6, 0, jag2.x - jag.x, jag2.y - jag.y, jag2.z - jag.z);
            jag.copy(jag2);
          }
          if (age < 0.16) vfx.add(VFX.flash, x1, y1, z1, 5 * wide, 5 * wide, ARC_HOT, age / 0.16);
        }
        if (age < 0.1) vfx.add(VFX.flash, arc.pts[0], arc.pts[2], arc.pts[1] - 50, 3.5, 3.5, ARC, age / 0.1);
      }
      // Striker rails: an instant straight beam from the cannon, thinning fast, with a muzzle flash.
      for (const r of s.rails) {
        const age = s.t - r.at; if (age < 0 || age > 0.3) continue;
        const life = age / 0.3, x0 = r.sx, y0 = 10.6, z0 = r.sy - 50, x1 = r.x, y1 = r.height, z1 = r.y - 50, len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
        const wide = (0.9 + r.tier * 0.08) * (1 - life * 0.7);
        vfx.add(VFX.beam, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, len, 1.6 * wide, RAIL, life, 0, x1 - x0, y1 - y0, z1 - z0);
        if (age < 0.08) { vfx.add(VFX.flash, x0, y0, z0 - 1.5, 2.6, 2.6, RAIL, age / 0.08); vfx.add(VFX.flash, x1, y1, z1, 3.2, 3.2, FLASH, age / 0.08); }
      }
      // Gunship flak shells: a glowing round lobbed in an arc, a short ember trail behind it.
      for (const sh of s.shells) {
        if (sh.hit) continue;
        const span = Math.max(0.05, sh.hitAt - sh.at);
        for (let j = 0; j < 4; j++) {
          const u = Math.min(1, Math.max(0, (s.t - sh.at) / span - j * 0.035)); if (u <= 0 && j) break;
          const x = sh.sx + (sh.x - sh.sx) * u, z = sh.sy - 50 + (sh.y - sh.sy) * u, y = 10.6 + (sh.height - 10.6) * u + Math.sin(u * Math.PI) * 9;
          vfx.add(VFX.flash, x, y, z, (2.6 - j * 0.45) * (1 + sh.tier * 0.04), (2.6 - j * 0.45) * (1 + sh.tier * 0.04), j ? FLAK : FLASH, j ? 0.35 + j * 0.15 : 0.2);
        }
      }
      // Escort plasma beam (phrase): bright plasma knots racing up the lane inside the beam column.
      for (const f of s.fx) {
        const age = s.t - f.at; if (f.kind !== 'beam' || age < 0 || age > 0.6) continue;
        const w = (f.size ?? 9) * 0.5, life = age / 0.6;
        for (let j = 0; j < 12; j++) {
          const z = f.y - 50 - ((age * 260 + j * 12) % 140), wob = Math.sin(j * 1.7 + age * 30) * w * 0.4;
          vfx.add(VFX.flash, f.x + wob, 10.6, z, w * 1.4, w * 1.4, PLASMA, life);
        }
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
      for(const e of s.enemies){if(sh>=95)break;mat.position.set(e.x,-5.8+lift,e.y-50+2);mat.rotation.set(0,0,0);mat.scale.set(e.kind==='boss'?FLAGSHIPS[e.bossStyle%FLAGSHIPS.length].shadow[0]:4,0.03,e.kind==='boss'?FLAGSHIPS[e.bossStyle%FLAGSHIPS.length].shadow[1]:3);mat.updateMatrix();shadows.setMatrixAt(sh++,mat.matrix);}
      mat.position.set(s.shipX,-5.8+lift,s.shipY-47);mat.scale.set(6,0.03,4);mat.updateMatrix();shadows.setMatrixAt(sh++,mat.matrix);shadows.count=sh;shadows.instanceMatrix.needsUpdate=true;
      let d = 0;
      const chunk = (px: number, py: number, pz: number, rx: number, ry: number, rz: number, size: number) => {
        if (d >= 384) return; mat.position.set(px, py, pz); mat.rotation.set(rx, ry, rz); mat.scale.set(size, size * 0.6, size * 1.4); mat.updateMatrix(); debris.setMatrixAt(d++, mat.matrix);
      };
      for (const fx of s.fx) {
        const age = s.t - fx.at;
        if ((fx.kind !== 'boom' && fx.kind !== 'intercept' && fx.kind !== 'flak') || age < 0) continue;
        // Ground explosions and smoke stay put on the terrain as it scrolls.
        const fy = fx.y + (fx.ground ? (fx.s !== undefined ? s.world.s - fx.s : age * GROUND_SPEED) : 0), x = fx.x, y = fx.ground ? -2 + lift : 12, z = fy - 50, S = fx.size ?? 1, id = fx.id;
        if (fx.kind === 'flak') { // a flak burst: a hard flash, a ring the size of the burst, shrapnel, and dark puffs that hang
          const R = 6.5 * S;
          if (age < 0.1) vfx.add(VFX.flash, x, y + 0.5, z, R * 1.3, R * 1.3, FLASH, age / 0.1);
          if (age < 0.3) { const l = age / 0.3, r = R * 2 * (0.35 + 0.65 * Math.sqrt(l)); vfx.add(VFX.ring, x, y + 0.5, z, r, r, FLAK, l); }
          if (age < 0.4) for (let j = 0; j < 8; j++) { const an = h01(id * 3 + j) * 6.283, sp = 30 + 20 * h01(id * 5 + j), vx = Math.cos(an) * sp, vz = Math.sin(an) * sp, l = age / 0.4;
            vfx.add(VFX.spark, x + vx * age * (1 - 0.4 * l), y + 0.5, z + vz * age * (1 - 0.4 * l), 1.4 + sp * 0.03, 0.18, FLAK, l, 0, vx, 0, vz); }
          if (age > 0.05 && age < 1.2) for (let j = 0; j < 5; j++) { const l = (age - 0.05) / 1.15, an = h01(id * 23 + j) * 6.283, rr = R * 0.55 * h01(id * 29 + j);
            vfx.smoke(x + Math.cos(an) * rr, y + 1 + l * 2, z + Math.sin(an) * rr, (2.2 + l * 3.5) * Math.max(0.8, S), FLAK_PUFF, l, h01(id * 31 + j)); }
          continue;
        }
        if (fx.kind === 'intercept') { // a hit: a small flash, a lick of flame and a few sparks
          if (age < 0.15) vfx.add(VFX.flash, x, y, z, 3.2 * S, 3.2 * S, HIT, age / 0.15);
          if (age < 0.25) { const l = age / 0.25; vfx.add(VFX.fire, x, y + 0.5, z, 2.4 * S * (0.6 + l), 2.4 * S * (0.6 + l), hitHeat, l, h01(id)); }
          if (age < 0.3) for (let j = 0; j < 4; j++) { const an = h01(id * 3 + j) * 6.283, sp = 18 + 14 * h01(id * 5 + j), vx = Math.cos(an) * sp, vz = Math.sin(an) * sp, l = age / 0.3;
            vfx.add(VFX.spark, x + vx * age, y + 1, z + vz * age, 1.2 + sp * 0.04, 0.16, HIT, l, 0, vx, 0, vz); }
          continue;
        }
        if (S >= 2.5) flagshipBlast(vfx, chunk, x, y + 1, z, S, id, age, AIR);
        else blast(vfx, chunk, x, y, z, S, id, age, !!fx.ground, fx.ground ? GROUND : AIR);
      }
      // Battle damage: a flagship that has lost its batteries or a third of its hull trails fire and smoke from fixed
      // points on its hull, more of them as it weakens; a lost battery's mount keeps burning.
      for (const e of s.enemies) {
        if (e.kind !== 'boss' || e.hp <= 0) continue;
        const spec = FLAGSHIPS[e.bossStyle % FLAGSHIPS.length], hurt = 1 - e.hp / Math.max(1, e.maxHp);
        const mounts = s.enemies.filter(m => m.parentId === e.id && m.hp > 0).map(m => m.mountX ?? 0);
        const points: Array<[number, number, number]> = [];
        for (const mx of [-15, 0, 15]) if (e.age > 8 && !mounts.includes(mx)) points.push([mx, (mx ? spec.mount.s : spec.mount.c) + 0.5, 4]);
        spec.damage.forEach((p, i) => { if (hurt > 0.3 + i * 0.12) points.push([-p[0], p[1], -p[2]]); });
        points.forEach(([px, py, pz], i) => {
          wreck.x = e.x + px; wreck.y = 13 + py; wreck.z = e.y - 50 + pz;
          for (let k = 0; k < 5; k++) {
            const u = (s.t * 0.9 + k / 5 + h01(e.id + i * 7)) % 1, seed = h01(i * 31 + k + Math.floor(s.t * 0.9 + k / 5 + h01(e.id + i * 7)) * 7);
            vfx.smoke(wreck.x + (seed - 0.5) * 2, wreck.y + 0.5 + u * 8, wreck.z + u * 10, 5 + u * 14, SMOKE_AIR, u * 0.9, seed);
          }
          const f = (s.t * 2.3 + h01(i * 13)) % 1, seed = h01(i * 17 + Math.floor(s.t * 2.3 + h01(i * 13)));
          vfx.add(VFX.fire, wreck.x, wreck.y + 1 + f * 2, wreck.z + f, 6.5 * (0.7 + 0.6 * f), 6.5 * (0.7 + 0.6 * f), hitHeat, f, seed);
        });
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
      // Blizzard: seeded flakes wrapped in a box around the view, carried by an accumulated wind shift (so gusts never
      // jump); `snow` sets how many show and how hard the wind blows. Faded at the box edges and with distance.
      const dt = Math.min(0.1, Math.max(0, s.t - snowT)); snowT = s.t;
      if (snow > 0.01) {
        const k = 0.6 + 0.9 * snow, wx = -26 * k, wy = -4 * k, wz = 62 * k, len0 = 1 + Math.hypot(wx, wy, wz) * 0.035;
        shift.x += wx * dt; shift.y += wy * dt; shift.z += wz * dt;
        for (let i = 0; i < FLAKES; i++) {
          const v = flakeSeeds[i * 4 + 3]; if (v > snow) continue;
          const sp = 0.75 + 0.5 * v, x = wrapIn(flakeSeeds[i * 4], shift.x * sp, BOX.x0, BOX.sx), y = wrapIn(flakeSeeds[i * 4 + 1], shift.y * sp, BOX.y0, BOX.sy), z = wrapIn(flakeSeeds[i * 4 + 2], shift.z * sp, BOX.z0, BOX.sz);
          const edge = Math.min(Math.min(x - BOX.x0, BOX.x0 + BOX.sx - x) / (BOX.sx * 0.08), Math.min(y - BOX.y0, BOX.y0 + BOX.sy - y) / (BOX.sy * 0.08), Math.min(z - BOX.z0, BOX.z0 + BOX.sz - z) / (BOX.sz * 0.08));
          const far = Math.min(1, Math.max(0, -z / 600)), alpha = Math.min(1, Math.max(0, edge)) * (0.75 - 0.5 * far);
          vfx.flake(x, y, z, len0 * (0.7 + 0.6 * v), 0.22 + 0.25 * v, alpha, wx, wy, wz);
        }
      }
      vfx.flush();
    },
    dispose() { vfx.dispose(); for (const mesh of [rings, brackets, debris, shadows, warns, warnRings, sparks, dashes, beamGlow, beamCore, blade, slashes, slashCores]) { mesh.dispose(); } },
  };
}
