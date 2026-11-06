import * as THREE from 'three';
import type { SfSnapshot } from '../sim/types';
import { geometries } from './models';
import { groupOf, GROUND_SPEED } from '../sim/encounters';
import { createVfx, h01, MARKER, VFX } from './vfx';
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
  const jag = new THREE.Vector3(), jag2 = new THREE.Vector3(), fork = new THREE.Vector3();
  const GOLD = C('#ffd34d'), CYAN = C('#7ff4ff'), WHITE_HOT = C('#fff4e0'), flakHeat = C('#ff0000').setRGB(0.85, 0, 0);
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
  // Lock reticles, elite crowns, muzzle warnings, the shield and target brackets are flat `marker` particles.
  const LOCK = C('#ffe27a'), BRACKET = C('#fff3b0'), markColor = new THREE.Color(), spin = (t: number) => ((t % 1) + 1) % 1 * 0.999;
  const shadows=pool(geometries.sphere,'#071b34',96);
  (shadows.material as THREE.MeshBasicMaterial).opacity=0.3;
  // Tumbling hull fragments (a few per blast, glowing hot; the fire, sparks and smoke are particles).
  const debris = new THREE.InstancedMesh(geometries.rock, new THREE.MeshStandardMaterial({ color: '#3b3533', metalness: 0.55, roughness: 0.5, emissive: '#ff5a1a', emissiveIntensity: 0.45 }), 384);
  debris.count = 0; debris.frustumCulled = false; scene.add(debris);
  // Muzzle charge before an enemy fires, and cyan streak sparks where a bullet grazes the ship.
  const sparks = pool(geometries.box, '#9ffbff', 192, true);
  (sparks.material as THREE.MeshBasicMaterial).opacity = 0.8;
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
    /** `shield`: where to draw the ship's shield ring (null in the hangar), its radius, colour and strength 0..1. */
    update(s: SfSnapshot, lift = 0, snow = 0, shield: { x: number; y: number; z: number; r: number; color: THREE.Color; alpha: number } | null = null) {
      vfx.begin();
      if (shield && shield.alpha > 0.01) vfx.add(VFX.marker, shield.x, shield.y, shield.z, shield.r / 0.43, shield.r / 0.43, markColor.copy(shield.color).multiplyScalar(Math.min(1, shield.alpha * 1.6)), 0, MARKER.shield + spin(s.t * 0.2));
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
            // Forks: short, thin side branches that flicker in and out.
            const fh = h01(arc.id * 71 + k * 5 + q * 11 + flick * 7);
            if (q < steps && fh > 0.55) {
              const side = fh > 0.78 ? 1 : -1, fl = sl * (0.6 + fh * 0.5);
              fork.set(jag2.x + (dx / len * 0.5 + nx * side) * fl, jag2.y - 0.6 * fl * 0.3, jag2.z + (dz / len * 0.5 + nz * side) * fl);
              vfx.add(VFX.beam, (jag2.x + fork.x) / 2, (jag2.y + fork.y) / 2, (jag2.z + fork.z) / 2, jag2.distanceTo(fork), 0.7 * wide, ARC, Math.min(1, life * 1.4), 0, fork.x - jag2.x, fork.y - jag2.y, fork.z - jag2.z);
            }
            jag.copy(jag2);
          }
          if (age < 0.16) vfx.add(VFX.flash, x1, y1, z1, 5 * wide, 5 * wide, ARC_HOT, age / 0.16);
        }
        if (age < 0.1) vfx.add(VFX.flash, arc.pts[0], arc.pts[2], arc.pts[1] - 50, 3.5, 3.5, ARC, age / 0.1);
      }
      // Striker rails: an instant hypervelocity slug. A white-hot core inside an amber sheath, a corkscrew of ionised
      // sparks wound around the track that lingers and drifts apart, a muzzle flash, and a spray of sparks at impact.
      for (const r of s.rails) {
        const age = s.t - r.at; if (age < 0 || age > 0.45) continue;
        const x0 = r.sx, y0 = 10.6, z0 = r.sy - 50 - 1.5, x1 = r.x, y1 = r.height, z1 = r.y - 50, dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, len = Math.hypot(dx, dy, dz) || 1;
        const wide = 0.9 + r.tier * 0.08, mx = (x0 + x1) / 2, my = (y0 + y1) / 2, mz = (z0 + z1) / 2;
        if (age < 0.22) { const l = age / 0.22;
          vfx.add(VFX.beam, mx, my, mz, len, 2.4 * wide * (1 - 0.6 * l), RAIL, l, 0, dx, dy, dz);
          vfx.add(VFX.beam, mx, my, mz, len, 0.7 * wide * (1 - l), WHITE_HOT, Math.min(1, l * 1.4), 0, dx, dy, dz); }
        // Helix: perpendicular axes from the track direction (horizontal side vector, then up).
        const hx = -dz / len, hz = dx / len, turns = len / 7, l = age / 0.45, rad = 0.7 * wide * (1 + 1.6 * l);
        for (let k = 0, n = Math.min(40, Math.round(len / 2.2)); k < n; k++) {
          const u = (k + 0.5) / n, an = u * turns * 6.283 + r.id, c = Math.cos(an) * rad, sn = Math.sin(an) * rad;
          vfx.add(VFX.flash, x0 + dx * u + hx * c, y0 + dy * u + sn, z0 + dz * u + hz * c, 1.1 * wide, 1.1 * wide, RAIL, Math.min(1, l * 1.1 + u * 0.15));
        }
        if (age < 0.09) { vfx.add(VFX.flash, x0, y0, z0, 4.2 * wide, 4.2 * wide, RAIL, age / 0.09); vfx.add(VFX.flash, x1, y1, z1, 5 * wide, 5 * wide, WHITE_HOT, age / 0.09); }
        if (age < 0.3) for (let j = 0; j < 6; j++) { const an = h01(r.id * 7 + j) * 6.283, sp = 22 + 18 * h01(r.id * 11 + j), vx = Math.cos(an) * sp * 0.7 + dx / len * 14, vz = Math.sin(an) * sp * 0.7 + dz / len * 14, vy = 8 * h01(r.id * 13 + j), q = age / 0.3;
          vfx.add(VFX.spark, x1 + vx * age, y1 + vy * age - 12 * age * age, z1 + vz * age, 1.3 + sp * 0.03, 0.18, RAIL, q, 0, vx, vy - 24 * age, vz); }
      }
      // Gunship flak shells: a glowing round lobbed in an arc, oriented along its flight, trailing embers and a thread of smoke.
      for (const sh of s.shells) {
        if (sh.hit) continue;
        const span = Math.max(0.05, sh.hitAt - sh.at), u = Math.min(1, Math.max(0, (s.t - sh.at) / span)), big = 1 + sh.tier * 0.05;
        const pos = (v: number, o: THREE.Vector3) => o.set(sh.sx + (sh.x - sh.sx) * v, 10.6 + (sh.height - 10.6) * v + Math.sin(v * Math.PI) * 9, sh.sy - 50 + (sh.y - sh.sy) * v);
        pos(u, jag); pos(Math.max(0, u - 0.03), jag2);
        vfx.add(VFX.bolt, jag.x, jag.y, jag.z, 2.4 * big, 1.1 * big, FLAK, 0, 0, jag.x - jag2.x, jag.y - jag2.y, jag.z - jag2.z);
        vfx.add(VFX.flash, jag.x, jag.y, jag.z, 2.8 * big, 2.8 * big, FLAK, 0.45);
        for (let j = 1; j <= 6; j++) {
          const v = u - j * 0.035; if (v <= 0) break; pos(v, fork);
          if (j <= 3) vfx.add(VFX.spark, fork.x, fork.y, fork.z, 1.4, 0.3 * big, FLAK, 0.3 + j * 0.2, 0, jag.x - jag2.x, jag.y - jag2.y, jag.z - jag2.z);
          else vfx.smoke(fork.x, fork.y, fork.z, 0.8 + j * 0.25, MISSILE_SMOKE, 0.45 + j * 0.08, h01(sh.id * 5 + j));
        }
      }
      // Escort plasma beam (phrase): a column of violet plasma up the lane, a white core, and knots racing inside it.
      for (const f of s.fx) {
        const age = s.t - f.at; if (f.kind !== 'beam' || age < 0 || age > 0.6) continue;
        const w = (f.size ?? 9) * 0.5, life = age / 0.6, z0 = f.y - 50, swell = Math.sin(Math.min(1, age / 0.08) * Math.PI / 2);
        for (let j = 0; j < 7; j++) {
          const za = z0 - j * 20, zb = za - 20, wob = Math.sin(j * 1.3 + age * 24) * w * 0.12;
          vfx.add(VFX.beam, f.x + wob, 10.6, (za + zb) / 2, 21, w * 2.6 * swell * (1 - 0.5 * life), PLASMA, life, 0, 0, 0, -1);
          vfx.add(VFX.beam, f.x + wob * 0.5, 10.6, (za + zb) / 2, 21, w * 0.6 * (1 - life), WHITE_HOT, Math.min(1, life * 1.3), 0, 0, 0, -1);
        }
        for (let j = 0; j < 14; j++) {
          const z = z0 - ((age * 260 + j * 10) % 140), wob = Math.sin(j * 1.7 + age * 30) * w * 0.45;
          vfx.add(VFX.flash, f.x + wob, 10.6, z, w * 1.2, w * 1.2, PLASMA, life);
        }
        if (age < 0.12) vfx.add(VFX.flash, f.x, 10.6, z0, w * 4, w * 4, PLASMA, age / 0.12);
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
      let marks = 0;
      for (const e of s.enemies) {
        const count = s.locks.filter(id => id === e.id).length, inGroup = s.selectedGroup !== null && groupOf(e) === s.selectedGroup;
        if (!count && e.id !== s.selectedId && !inGroup) continue;
        const size = (e.kind === 'boss' ? 12 : 4.5) * (count || e.id === s.selectedId ? 1 : 0.6) / 0.43;
        vfx.add(VFX.marker, e.x, e.ground ? -2.2 : 12.2, e.y - 50, size, size, count || e.id === s.selectedId ? LOCK : markColor.copy(LOCK).multiplyScalar(0.55), 0, (count > 1 ? MARKER.lock2 : MARKER.lock) + spin(s.t * 0.11));
        if (++marks >= 46) break;
      }
      const selected = s.enemies.find(e => e.id === s.selectedId);
      if (selected) { const size = (selected.kind === 'boss' ? 15.5 : 7.5) / 0.43 * (1 + 0.04 * s.beat); vfx.add(VFX.marker, selected.x, selected.ground ? -2 : 12, selected.y - 50, size, size, BRACKET, 0, MARKER.bracket); }
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
        if (fx.kind === 'flak') { // a flak burst: a hard flash, a ragged orange fireball, a flat ring the size of the burst, shrapnel, black puffs that hang
          const R = 6.5 * S;
          if (age < 0.05) vfx.add(VFX.flash, x, y + 0.5, z, R * 0.9, R * 0.9, FLASH, age / 0.05);
          if (age < 0.35) for (let j = 0; j < 4; j++) { const l = age / 0.35, an = h01(id * 41 + j) * 6.283, o = R * 0.35 * (0.3 + l), sz = R * (0.9 + 0.5 * h01(id * 43 + j)) * (0.5 + 0.6 * Math.sqrt(l));
            vfx.add(VFX.fire, x + Math.cos(an) * o, y + 0.5 + l * 1.5, z + Math.sin(an) * o, sz, sz, flakHeat, l, h01(id * 47 + j)); }
          if (age < 0.3) { const l = age / 0.3, r = R * (0.4 + 0.75 * (1 - (1 - l) ** 2)); vfx.add(VFX.shock, x, y + 0.5, z, r, r, FLAK, 0.3 + 0.7 * l, h01(id * 53)); }
          if (age < 0.45) for (let j = 0; j < 12; j++) { const an = h01(id * 3 + j) * 6.283, sp = 30 + 24 * h01(id * 5 + j), up = (h01(id * 7 + j) - 0.4) * 14, vx = Math.cos(an) * sp, vz = Math.sin(an) * sp, l = age / 0.45, tr = age * (1 - 0.4 * l);
            vfx.add(VFX.spark, x + vx * tr, y + 0.5 + up * tr - 10 * age * age, z + vz * tr, 1.4 + sp * 0.03, 0.2, FLAK, l, 0, vx, up - 20 * age, vz); }
          if (age > 0.06 && age < 1.2) for (let j = 0; j < 6; j++) { const l = (age - 0.06) / 1.14, an = h01(id * 23 + j) * 6.283, rr = R * 0.5 * h01(id * 29 + j) * (0.6 + 0.6 * l);
            vfx.smoke(x + Math.cos(an) * rr, y + 1 + l * 2.5, z + Math.sin(an) * rr, (3 + l * 5) * Math.max(0.8, S), FLAK_PUFF, l, h01(id * 31 + j)); }
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
      // Celebration and arsenal rings (full lock, perfect formation, nova, upgrades): soft flat shock rings with a few
      // sparks, instead of solid hoops.
      for (const f of s.fx) {
        const age = s.t - f.at; if (age < 0) continue;
        const x = f.x, y = f.ground ? -2 + lift : 10.6, z = f.y - 50;
        if (f.kind === 'volley' && age < 0.45) { const l = age / 0.45; vfx.add(VFX.shock, x, y, z, 3 + 18 * (1 - (1 - l) ** 2), 3 + 18 * (1 - (1 - l) ** 2), GOLD, 0.2 + 0.8 * l, 0.3); }
        else if (f.kind === 'perfect' && age < 0.9) {
          const l = age / 0.9, r = 3 + 30 * (1 - (1 - l) ** 2) * (f.size ?? 2) / 2.5;
          vfx.add(VFX.shock, x, y, z, r, r, GOLD, 0.25 + 0.75 * l, h01(f.id)); if (age > 0.12) vfx.add(VFX.shock, x, y, z, r * 0.7, r * 0.7, GOLD, Math.min(1, 0.4 + l), h01(f.id + 1));
          if (age < 0.12) vfx.add(VFX.flash, x, y, z, 10, 10, GOLD, age / 0.12);
          if (age < 0.6) for (let j = 0; j < 10; j++) { const an = j * 0.628 + h01(f.id) * 6, sp = 40, q = age / 0.6; vfx.add(VFX.spark, x + Math.cos(an) * sp * age, y + 1, z + Math.sin(an) * sp * age, 2, 0.25, GOLD, q, 0, Math.cos(an), 0, Math.sin(an)); }
        } else if (f.kind === 'nova' && age < 1.4) {
          const l = age / 1.4; for (const [k, d] of [[0, 0], [1, 0.18]] as const) { const m = Math.max(0, (age - d) / 1.4); if (m > 0 && m < 1) vfx.add(VFX.shock, x, y, z, 4 + 110 * (1 - (1 - m) ** 2), 4 + 110 * (1 - (1 - m) ** 2), CYAN, 0.2 + 0.8 * m, k * 0.5); }
          if (age < 0.2) vfx.add(VFX.flash, x, y, z, 24, 24, CYAN, l * 7);
        } else if (f.kind === 'upgrade' && age < 1.2) {
          const l = age / 1.2; vfx.add(VFX.shock, x, y + l * 4, z, 5 + 8 * l, 5 + 8 * l, CYAN, 0.2 + 0.8 * l, 0.6);
          if (age < 0.8) for (let j = 0; j < 8; j++) { const an = j * 0.785, q = age / 0.8; vfx.add(VFX.spark, x + Math.cos(an) * 6, y + q * 9, z + Math.sin(an) * 6, 2.2, 0.25, CYAN, q, 0, 0, 1, 0); }
        }
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
      // Elite wings wear a gold crown that breathes with the beat, so they read apart from amber armour.
      let w = 0;
      for (const e of s.enemies) {
        if (!e.elite || w++ >= 96) continue;
        const size = (3.6 + s.beat * 0.5) / 0.43;
        vfx.add(VFX.marker, e.x, 10, e.y - 50, size, size, markColor.copy(gold).multiplyScalar(0.8 + s.beat * 0.2), 0, MARKER.elite + spin(s.t * 0.15 + h01(e.id)));
      }
      for (const e of s.enemies) {
        if (!e.warn || e.warn < 0.05 || w++ >= 96) continue;
        const pulse = 1 + Math.sin(s.t * 26) * 0.12 * e.warn, big = e.kind === 'boss' ? 2.2 : 1, x = e.x, y = e.ground ? -1.5 : e.kind === 'boss' ? 13 : 10, z = e.y - 50 + 2.5;
        warnColor.copy(e.ground || e.kind === 'turret' || e.kind === 'tank' ? amber : pink).multiplyScalar(0.3 + 0.7 * e.warn);
        // A charge glowing at the muzzle, and a reticle closing in on it, reads as "about to fire".
        vfx.add(VFX.flash, x, y, z, (2 + e.warn * 5) * pulse * big, (2 + e.warn * 5) * pulse * big, warnColor, 0.15);
        const r = (9 - e.warn * 6) * big / 0.43; vfx.add(VFX.marker, x, y, z, r, r, warnColor, 0, MARKER.warn + spin(e.warn * 0.4 + h01(e.id)));
      }
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
    dispose() { vfx.dispose(); for (const mesh of [debris, shadows, sparks, dashes, beamGlow, beamCore, blade, slashes, slashCores]) { mesh.dispose(); } },
  };
}
