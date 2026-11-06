// Scenery kit review: one kit model per cell on its biome's ground, under the game's lights and materials.
// ?only=ashCone,columns  ?cam=near|far  ?yaw=0.6
import * as THREE from 'three';
import { kit } from '../src/games/starfighter/render/kit';
import { foliage, magma, plated, strata } from '../src/games/starfighter/render/shading';
const q = new URLSearchParams(location.search), K = kit();
type Spec = { k: keyof ReturnType<typeof kit>; s: [number, number, number]; mat: () => THREE.Material; ground: string; tint?: string };
const rock = () => strata(new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0, roughness: 0.92 }));
const lava = () => magma(new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0, roughness: 0.95 }));
const plain = (rough = 0.95, metal = 0) => () => new THREE.MeshStandardMaterial({ vertexColors: true, metalness: metal, roughness: rough });
const station = () => plated(new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.15, roughness: 0.7 }));
const ice = () => new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0, roughness: 0.5 });
const ALL: Spec[] = [
  { k: 'ashCone', s: [20, 17, 20], mat: lava, ground: '#3b3330' },
  { k: 'columns', s: [4.5, 5, 4.5], mat: lava, ground: '#3b3330' },
  { k: 'basaltCrag', s: [18, 22, 18], mat: lava, ground: '#3b3330' },
  { k: 'basaltB', s: [7, 5, 7], mat: lava, ground: '#3b3330' },
  { k: 'volcano', s: [26, 20, 26], mat: plain(), ground: '#2f6f9a' },
  { k: 'islandHill', s: [22, 12, 22], mat: plain(), ground: '#2f6f9a' },
  { k: 'station', s: [1, 1, 1], mat: station, ground: '#dfe8ee' },
  { k: 'outpost', s: [0.8, 0.8, 0.8], mat: station, ground: '#b98a66' },
  { k: 'berg', s: [16, 12, 12], mat: ice, ground: '#dfe8ee' },
  { k: 'spire', s: [4, 4, 4], mat: rock, ground: '#b98a66' },
  { k: 'mesa', s: [14, 16, 14], mat: rock, ground: '#b98a66' },
  { k: 'crag', s: [18, 22, 18], mat: rock, ground: '#b98a66' },
  { k: 'palm', s: [1.5, 1.5, 1.5], mat: () => foliage(new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0, roughness: 0.9 })), ground: '#d2b98a' },
  { k: 'hut', s: [1, 1, 1], mat: plain(0.9), ground: '#d2b98a' },
  { k: 'lighthouse', s: [1, 1, 1], mat: station, ground: '#2f6f9a' },
  { k: 'oilRig', s: [1, 1, 1], mat: station, ground: '#2f6f9a' },
];
const only = q.get('only')?.split(','), specs = only ? ALL.filter(s => only.includes(s.k)) : ALL;
const cols = Math.ceil(Math.sqrt(specs.length)), rows = Math.ceil(specs.length / cols);
const gl = new THREE.WebGLRenderer({ antialias: true }); gl.setPixelRatio(1); gl.setSize(innerWidth, innerHeight); gl.setScissorTest(true); document.body.appendChild(gl.domElement);
const near = q.get('cam') === 'near', yaw = Number(q.get('yaw') ?? 0.5);
for (const [i, sp] of specs.entries()) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#0b1424');
  scene.add(new THREE.HemisphereLight('#c6e9ff', '#142035', 2.7));
  const key = new THREE.DirectionalLight('#e6f3ff', 3); key.position.set(-25, 40, -30); scene.add(key);
  const rim = new THREE.DirectionalLight('#9574ff', 2); rim.position.set(30, 15, 40); scene.add(rim);
  const g = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: sp.ground, roughness: 1 })); scene.add(g);
  const geo = K[sp.k], m = new THREE.InstancedMesh(geo, sp.mat(), 1), o = new THREE.Object3D(); o.scale.set(...sp.s); o.rotation.y = yaw; o.updateMatrix(); m.setMatrixAt(0, o.matrix); scene.add(m);
  geo.computeBoundingSphere(); const bs = geo.boundingSphere!, rad = bs.radius * Math.max(...sp.s);
  const cy = bs.center.y * sp.s[1], cam = new THREE.PerspectiveCamera(near ? 40 : 30, 1, 0.1, 4000), d = rad * (near ? 2.2 : 3.4);
  cam.position.set(0, cy + d * 0.62, d * 0.78); cam.lookAt(0, cy, 0);
  const W = innerWidth / cols, H = innerHeight / rows, x = (i % cols) * W, y = innerHeight - (Math.floor(i / cols) + 1) * H;
  cam.aspect = W / H; cam.updateProjectionMatrix(); gl.setViewport(x, y, W, H); gl.setScissor(x, y, W, H); gl.render(scene, cam);
}
(window as unknown as { __ready: boolean }).__ready = true;
