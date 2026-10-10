// Dev lineup for Grand Theft Pedal people / cops / weapons, lit like the game (toon ramp + warm key light).
//   /dev/gtpedal-lineup.html?view=people|cops|weapons
import * as THREE from 'three';
import { Crowd, lookFor, type PersonLook, type PoseIn } from '../src/games/gtpedal/render/chars';
import { buildWeapon, flicker } from '../src/games/gtpedal/render/weapons3d';
import { EXPR } from '../src/games/gtpedal/render/textures';

const q = new URLSearchParams(location.search), view = q.get('view') ?? 'people';
const app = document.getElementById('app')!, lbl = document.getElementById('lbl')!;
const r = new THREE.WebGLRenderer({ antialias: true }); r.outputColorSpace = THREE.SRGBColorSpace; app.appendChild(r.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xb9b2a2);
scene.add(new THREE.HemisphereLight(0xe8dcc4, 0x5a4a3a, 1.2)); const sun = new THREE.DirectionalLight(0xffe2b8, 2.2); sun.position.set(3, 6, 5); scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), new THREE.MeshLambertMaterial({ color: 0x8a7e6a })); floor.rotation.x = -Math.PI / 2; scene.add(floor);
const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
const crowd = new Crowd(16); scene.add(crowd.group);
const at = (x: number, y: number, h = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, h, 0)), new THREE.Vector3(1, 1, 1));
const HIP = 0.89;
const people: Array<[PersonLook, PoseIn, string]> = [];
if (view === 'people') {
  const want: Array<[Partial<PersonLook>, number, string]> = [
    [{ top: 'hoodie', bottom: 'cargo', hat: 'beanie', carry: 'backpack' }, EXPR.neutral, 'hoodie · cargo · beanie · backpack'],
    [{ top: 'tank', bottom: 'skirt', hat: 'none', hairStyle: 'bun', carry: 'none' }, EXPR.scared, 'tank · skirt · bun (scared)'],
    [{ top: 'jacket', bottom: 'pants', hat: 'ballcap', carry: 'bag' }, EXPR.angry, 'jacket · cap · messenger (angry)'],
    [{ top: 'vest', bottom: 'shorts', hat: 'helmet', carry: 'none' }, EXPR.neutral, 'vest · shorts · helmet'],
    [{ top: 'tee', bottom: 'cargo', hat: 'none', hairStyle: 'short', carry: 'bag' }, EXPR.dazed, 'tee · cargo (dazed)'],
    [{ top: 'hoodie', bottom: 'skirt', hat: 'ballcap', carry: 'backpack' }, EXPR.angry, 'hoodie · skirt (angry)'],
  ];
  want.forEach(([o, e, l], i) => people.push([{ ...lookFor(i * 5 + 2), ...o, face: i % 4 }, { kind: 'walk', t: 0, phase: i * 0.7, expr: e }, l]));
  people.forEach(([lk, p], i) => { void lk; void p; void i; });
  cam.position.set(0, 1.25, 7.2); cam.lookAt(0, 0.95, 0);
} else if (view === 'cops') {
  people.push([lookFor(3, 'segway'), { kind: 'stand', t: 0, phase: 0, expr: EXPR.angry }, 'Segway cop (angry)'], [lookFor(8, 'horse'), { kind: 'walk', t: 0, phase: 0.6, expr: EXPR.neutral }, 'mounted cop · helmet'], [lookFor(5, 'segway'), { kind: 'walk', t: 0, phase: 1.4, expr: EXPR.dazed }, 'cop (dazed)']);
  cam.position.set(0, 1.45, 3.6); cam.lookAt(0, 1.2, 0);
}
const xs = people.map((_, i) => (i - (people.length - 1) / 2) * (view === 'cops' ? 0.95 : 1.15));
lbl.innerHTML = people.map((p) => `<span>${p[2]}</span>`).join('');
const weapons = view === 'weapons' ? (['bazooka', 'rocket', 'bottle', 'molotov', 'grenade', 'oil'] as const).map((k, i) => {
  const w = buildWeapon(k, k === 'bottle' ? {} : {}); w.root.scale.setScalar(k === 'bazooka' ? 1.4 : k === 'rocket' ? 1.6 : 3);
  w.root.position.set((i - 2.5) * 1.05, k === 'bazooka' || k === 'rocket' ? 0.5 : 0.08, 0); w.root.rotation.y = k === 'bazooka' || k === 'rocket' ? -1.1 : 0.4; scene.add(w.root); return w;
}) : [];
if (view === 'weapons') { const b2 = buildWeapon('bottle', { glass: 0x6b4a24 }); b2.root.scale.setScalar(3); b2.root.position.set(-0.55, 0.08, 0.7); scene.add(b2.root); lbl.innerHTML = ['bazooka', 'rocket', 'bottle (green / brown)', 'molotov (lit)', 'grenade (pin + spoon)', 'oil can'].map((l) => `<span>${l}</span>`).join(''); cam.position.set(0.4, 2.4, 7.4); cam.lookAt(0.4, 0.3, 0); }
if (q.get('zoom')) { cam.position.set(xs[0], 1.6, 1.2); cam.lookAt(xs[0], 1.55, 0); }
const resize = () => { const w = innerWidth, h = innerHeight; r.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); };
resize(); addEventListener('resize', resize);
const frame = (t: number) => {
  crowd.begin(); people.forEach(([lk, p], i) => crowd.add(at(xs[i], HIP + (p.kind === 'stand' ? 0 : 0)), lk, { ...p, t: t + i })); crowd.end();
  weapons.forEach((w) => flicker(w, t));
  r.render(scene, cam);
};
(window as unknown as { __frame: (t: number) => void }).__frame = frame;
frame(0.4);
