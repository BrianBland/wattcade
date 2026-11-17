// Dev page: Watershed's wildlife and buildings side by side, posed, for model review.
//   /dev/watershed-models.html?t=1.2   (t = animation time in seconds)
import * as THREE from 'three';
import { bearModel, beaverModel, eagleModel, poseBear, poseBeaver, poseEagle } from '../src/games/watershed/render/wildlife';
import { damSticks, houseGeometry, millModel } from '../src/games/watershed/render/buildings';

const t = Number(new URLSearchParams(location.search).get('t') ?? 1);
const r = new THREE.WebGLRenderer({ antialias: true });
r.setSize(innerWidth, innerHeight); r.shadowMap.enabled = true; r.toneMapping = THREE.NeutralToneMapping;
document.getElementById('app')!.appendChild(r.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xbfe3f2);
const sun = new THREE.DirectionalLight(0xfff1dc, 2.4); sun.position.set(-20, 40, 25); sun.castShadow = true;
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30 }); sun.shadow.mapSize.set(2048, 2048);
scene.add(sun, new THREE.HemisphereLight(0xd8eeff, 0x5a6a3a, 1.2));
const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x6a9a4a })); ground.receiveShadow = true; scene.add(ground);
const put = (o: THREE.Object3D, x: number, z: number, ry = 0) => { o.position.set(x, 0, z); o.rotation.y = ry; scene.add(o); o.traverse((c) => { (c as THREE.Mesh).castShadow = true; }); return o; };
const b1 = put(bearModel(), -14, 4, 0.4); poseBear(b1, { gait: t * 5, stride: 1, rear: 0, swipe: 0, look: 0, roar: 0 });
const b2 = put(bearModel(), -8, -2, -0.3); poseBear(b2, { gait: 0, stride: 0, rear: 1, swipe: 0, look: 0.2, roar: 0.8 });
const e1 = put(eagleModel(), -2, 6, 0.6); e1.position.y = 5; e1.scale.setScalar(1.6); e1.rotation.set(0.5, 0.6, 0, 'YZX'); poseEagle(e1, { beat: t * 6, flap: 1, tuck: 0, reach: 0, carrying: false });
const e2 = put(eagleModel(), 2, 0, -0.4); e2.position.y = 4; e2.scale.setScalar(1.6); e2.rotation.set(0, -0.4, -0.7, 'YZX'); poseEagle(e2, { beat: 0, flap: 0, tuck: 0.8, reach: 1, carrying: true });
const bv = put(beaverModel(), 6, 8, 2.4); bv.scale.setScalar(1.5); poseBeaver(bv, 1, 0, 0, t);
// dam
const lay = damSticks(48, 5.6), dam = new THREE.Group();
const sticks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.1, 1, 6).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x7a5230 }), lay.length);
const m = new THREE.Matrix4(), q = new THREE.Quaternion();
lay.forEach((s, n) => { q.setFromEuler(new THREE.Euler(0, s.ry, s.rz)); m.compose(new THREE.Vector3(s.x, s.y, s.z), q, new THREE.Vector3(1, 1, s.len)); sticks.setMatrixAt(n, m); });
dam.add(sticks); dam.scale.setScalar(1.3); put(dam, 10, 0);
const { geo } = houseGeometry({ wall: 0xf4ead6, roof: 0xb5473a, shutter: 0x2e6e4a });
put(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true })), 16, -6, 0.5).scale.setScalar(1.5);
put(millModel('grist'), 0, -12, 0.3).scale.setScalar(1.5);
put(millModel('saw'), 14, -16, -0.4).scale.setScalar(1.5);
const cam = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.5, 300); cam.position.set(2, 22, 34); cam.lookAt(1, 1, -2);
r.render(scene, cam);
(window as any).__frames = 1;
