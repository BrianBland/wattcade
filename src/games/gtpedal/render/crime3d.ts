// Underworld set dressing: the chop shop garage canopy, the dealer's van, the Gearheads' turf hangout.
// Each site is one vertex-coloured merged mesh + ink (+ a flicker-flame for the barrel fires): ~8 draw calls total.
import * as THREE from 'three';
import { heightAt } from '../sim/world';
import { DEALER, DEALER_VAN, FENCE, GANG, TURF } from '../sim/crime';
import { mesh, Mt, piece } from './weapons3d';

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (r0: number, r1: number, h: number, s = 10) => new THREE.CylinderGeometry(r0, r1, h, s);
const RUST = 0x7a4a2e, SLAB = 0x6b6458, TIN = 0x8a8a7e, DARK = 0x2b2a24, CREAM = 0xd8cbb0, OIL = 0x1e1c1a;
/** sign face texture (text drawn in code into a DataTexture) */
function signTex(text: string, fg: number[], bg: number[]): THREE.DataTexture {
  // tiny 5×7 pixel font, uppercase + a few symbols
  const F: Record<string, string> = { A: '01110100011000111111100011000110001', B: '11110100011000111110100011000111110', C: '01110100011000010000100001000101110', D: '11110100011000110001100011000111110', E: '11111100001000011110100001000011111', H: '10001100011000111111100011000110001', I: '01110001000010000100001000010001110', J: '00111000100001000010100101001001100', K: '10001100101010011000101001001010001', L: '10000100001000010000100001000011111', N: '10001110011010110011100011000110001', O: '01110100011000110001100011000101110', P: '11110100011000111110100001000010000', R: '11110100011000111110101001001010001', S: '01111100001000001110000010000111110', T: '11111001000010000100001000010000100', U: '10001100011000110001100011000101110', Y: '10001100010101000100001000010000100', G: '01110100011000010111100011000101111', W: '10001100011000110101101011010101010', '’': '00100001000100000000000000000000000', '$': '00100011111010001110001011111000100', ' ': '00000000000000000000000000000000000', '!': '00100001000010000100001000000000100' };
  const W = text.length * 6 + 2, H = 9, d = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) d.set([...bg, 255], i * 4);
  [...text].forEach((ch, k) => { const g = F[ch] ?? F[' ']; for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) if (g[y * 5 + x] === '1') d.set([...fg, 255], ((H - 2 - y) * W + 1 + k * 6 + x) * 4); });
  const t = new THREE.DataTexture(d, W, H); t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t;
}
function sign(text: string, w: number, fg: number[], bg: number[]) {
  const tex = signTex(text, fg, bg), h = w * (tex.image.height / tex.image.width);
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
}
export interface CrimeSites { group: THREE.Group; flames: THREE.Object3D[] }
export function buildCrimeSites(): CrimeSites {
  const group = new THREE.Group(), flames: THREE.Object3D[] = [];
  // --- chop shop: corrugated canopy on posts over the forecourt, back wall with roll-up door, tyre stacks, drums, a workbench, a bike stand
  {
    const y = heightAt(FENCE.x, FENCE.z), P: THREE.BufferGeometry[] = [];
    for (const [px, pz] of [[-5, -4], [5, -4], [-5, 4], [5, 4]]) P.push(piece(box(0.18, 3.6, 0.18), DARK, Mt(px, 1.8, pz)));
    for (let i = 0; i < 9; i++) P.push(piece(box(1.24, 0.08, 9), i % 2 ? TIN : 0x7d7d72, Mt(-5 + i * 1.25, 3.7 + (i % 2) * 0.06, 0, 0, 0, 0.04)));
    P.push(piece(box(11, 3.7, 0.25), 0x8a6a54, Mt(0, 1.85, 4.6)), piece(box(4.2, 3, 0.1), 0x6b7270, Mt(-1.5, 1.5, 4.45)));
    for (let i = 0; i < 10; i++) P.push(piece(box(4.1, 0.05, 0.12), 0x55605e, Mt(-1.5, 0.2 + i * 0.3, 4.38)));      // roll-up door ribs
    for (const [tx, tz, n] of [[4, 3, 5], [4.6, 2, 3], [-4.4, -3, 4]] as const) for (let k = 0; k < n; k++) P.push(piece(new THREE.TorusGeometry(0.34, 0.12, 6, 12), OIL, Mt(tx, 0.12 + k * 0.24, tz, Math.PI / 2)));
    for (const [dx, dz, c] of [[3.2, 3.6, 0x3f5a6b], [2.4, 3.8, RUST], [-4.3, 1.2, 0x5a6b3f]] as const) P.push(piece(cyl(0.3, 0.3, 0.9, 10), c, Mt(dx, 0.45, dz)), piece(cyl(0.31, 0.31, 0.05, 10), DARK, Mt(dx, 0.7, dz)));
    P.push(piece(box(2.2, 0.08, 0.8), 0x6b4a32, Mt(2.5, 0.95, 4.0)), piece(box(0.08, 0.9, 0.7), DARK, Mt(1.5, 0.48, 4.0)), piece(box(0.08, 0.9, 0.7), DARK, Mt(3.5, 0.48, 4.0)));
    P.push(piece(box(0.06, 1.2, 0.06), DARK, Mt(-3, 0.6, 2.5)), piece(box(0.6, 0.06, 0.06), DARK, Mt(-3, 1.2, 2.5)));         // bike stand
    for (let i = 0; i < 5; i++) P.push(piece(new THREE.CircleGeometry(0.6 + (i % 3) * 0.4, 10), OIL, Mt(-2 + i * 1.3, 0.02, -1 + (i % 2) * 2, -Math.PI / 2)));
    const m = mesh(P, 0.02); m.position.set(FENCE.x, y, FENCE.z); group.add(m);
    const sg = sign("SPOKEY JOE’S CHOP SHOP", 7, [233, 196, 92], [52, 30, 22]); sg.position.set(FENCE.x, y + 4.25, FENCE.z - 4.3); sg.rotation.y = Math.PI; group.add(sg);
    const sg2 = sign('WE BUY BIKES  $$$', 3.4, [40, 30, 22], [218, 203, 176]); sg2.position.set(FENCE.x - 3.2, y + 2.6, FENCE.z - 4.15); sg2.rotation.y = Math.PI; group.add(sg2);
  }
  // --- dealer van: boxy, rusted, back doors open, crates of 'merchandise'
  {
    const cx = (DEALER_VAN.x0 + DEALER_VAN.x1) / 2, cz = (DEALER_VAN.z0 + DEALER_VAN.z1) / 2, y = heightAt(cx, cz), P: THREE.BufferGeometry[] = [];
    const L = DEALER_VAN.z1 - DEALER_VAN.z0, W = DEALER_VAN.x1 - DEALER_VAN.x0;
    P.push(piece(box(W, 1.7, L - 1.2), 0x6b6450, Mt(0, 1.25, -0.6)), piece(box(W, 1.2, 1.3), 0x5f584a, Mt(0, 1.0, L / 2 - 0.65)), piece(box(W - 0.2, 0.55, 0.05), 0x2e3a40, Mt(0, 1.4, L / 2 + 0.02)));
    for (const z of [-L / 2 + 0.9, L / 2 - 0.9]) for (const s of [-1, 1]) P.push(piece(cyl(0.36, 0.36, 0.25, 12), OIL, Mt(s * (W / 2), 0.36, z, 0, 0, Math.PI / 2)));
    for (let i = 0; i < 6; i++) P.push(piece(box(0.9 + (i % 3) * 0.3, 0.12, 0.7), RUST, Mt(0, 0.9 + i * 0.25, -0.3 - i * 0.4, 0, 0, 0.02 * i))); // rust streaks
    P.push(piece(box(0.05, 1.5, 1.2), 0x6b6450, Mt(W / 2 + 0.55, 1.2, -L / 2 + 0.05, 0, 1.2, 0)), piece(box(0.05, 1.5, 1.2), 0x6b6450, Mt(-W / 2 - 0.55, 1.2, -L / 2 + 0.05, 0, -1.2, 0))); // open back doors
    for (const [x, z, c] of [[2.4, 1.5, 0x5a6b3f], [2.7, 0.6, 0x6b4a32], [2.3, 0.6, 0x5a6b3f]] as const) P.push(piece(box(0.7, 0.5, 0.5), c, Mt(x, 0.25, z)));
    P.push(piece(box(0.75, 0.04, 0.55), CREAM, Mt(2.4, 0.52, 1.5)));
    const m = mesh(P, 0.02); m.position.set(cx, y, cz); group.add(m);
    const sg = sign('GUNS N BUNS', 2.2, [200, 70, 50], [228, 216, 190]); sg.position.set(cx + W / 2 + 0.02, y + 1.6, cz - 0.6); sg.rotation.y = Math.PI / 2; group.add(sg);
  }
  // --- gang turf: oil-drum fires, ratty couches, chain-link panels, mustard banners on poles at the edge
  {
    const y = heightAt(TURF.x, TURF.z), P: THREE.BufferGeometry[] = [];
    const drums = [[-3, -2], [4, 3], [-1, 6]];
    for (const [x, z] of drums) P.push(piece(cyl(0.32, 0.3, 0.95, 10), RUST, Mt(x, 0.47 + heightAt(TURF.x + x, TURF.z + z) - y, z)));
    for (const [x, z, r] of [[-5, 1, 0.4], [2, -4, -0.9]] as const) { const Q = new THREE.Matrix4().multiplyMatrices(Mt(x, 0, z, 0, r, 0), new THREE.Matrix4()); P.push(piece(box(2, 0.45, 0.9), 0x6b3a2e, Q.clone().multiply(Mt(0, 0.3, 0))), piece(box(2, 0.6, 0.25), 0x6b3a2e, Q.clone().multiply(Mt(0, 0.7, -0.35))), piece(box(0.25, 0.6, 0.9), 0x5a2f25, Q.clone().multiply(Mt(-0.9, 0.55, 0))), piece(box(0.25, 0.6, 0.9), 0x5a2f25, Q.clone().multiply(Mt(0.9, 0.55, 0)))); }
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2, x = Math.cos(a) * TURF.r, z = Math.sin(a) * TURF.r, gy = heightAt(TURF.x + x, TURF.z + z) - y;
      P.push(piece(box(0.1, 3.2, 0.1), DARK, Mt(x, gy + 1.6, z)), piece(box(0.9, 0.6, 0.03), i % 2 ? GANG.colour : GANG.accent, Mt(x + 0.45 * Math.cos(a + Math.PI / 2), gy + 2.8, z + 0.45 * Math.sin(a + Math.PI / 2), 0, -a - Math.PI / 2, 0))); }
    for (let i = 0; i < 4; i++) P.push(piece(box(2.4, 1.6, 0.04), 0x8a8a7e, Mt(-7 + i * 2.45, 0.8, 8, 0, 0, 0)));
    const m = mesh(P, 0.02); m.position.set(TURF.x, y, TURF.z); group.add(m);
    const fm = new THREE.MeshBasicMaterial({ color: 0xffa23a, transparent: true, opacity: 0.9, depthWrite: false });
    for (const [x, z] of drums) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.8, 7), fm); f.position.set(TURF.x + x, heightAt(TURF.x + x, TURF.z + z) + 1.3, TURF.z + z); group.add(f); flames.push(f); }
    const sg = sign('GEARHEADS ONLY', 3, [43, 42, 36], [201, 162, 39]); sg.position.set(TURF.x - TURF.r + 0.2, heightAt(TURF.x - TURF.r, TURF.z) + 2.2, TURF.z); sg.rotation.y = Math.PI / 2; group.add(sg);
  }
  void DEALER;
  return { group, flames };
}
export function animateSites(c: CrimeSites, t: number) {
  c.flames.forEach((f, i) => { f.scale.set(1 + Math.sin(t * 17 + i) * 0.12, 1 + Math.sin(t * 23 + i * 2) * 0.22, 1); f.rotation.y = t * 3 + i; });
}
