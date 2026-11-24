// Dev page: Watershed trees and rocks up close, lit like the game, for model review.
//   /dev/watershed-flora.html?far=1   (far = the overview distance)
import * as THREE from 'three';
import { broadleafGeometry2, foliageMaterial, pineGeometry2, rockGeometry, rockMaterial, trunkGeometry2 } from '../src/games/watershed/render/flora';

const far = new URLSearchParams(location.search).get('far');
const r = new THREE.WebGLRenderer({ antialias: true });
r.setPixelRatio(devicePixelRatio); r.setSize(innerWidth, innerHeight); r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
r.toneMapping = THREE.NeutralToneMapping; r.toneMappingExposure = 1.08;
document.getElementById('app')!.appendChild(r.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xa9d2ee);
const sun = new THREE.DirectionalLight(0xffe9cc, 3.1); sun.position.set(-22, 24, -18); sun.castShadow = true;
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30 }); sun.shadow.mapSize.set(2048, 2048);
scene.add(sun, new THREE.HemisphereLight(0xcfe6ff, 0x52603a, 1.05));
const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x5d8f3a, roughness: 1 }));
ground.receiveShadow = true; scene.add(ground);
const wind = { value: 1 };
const kinds = [
  [pineGeometry2(), foliageMaterial(wind, { freq: 4.2, stretch: [1, 1.7, 1], bump: 0.7 })],
  [broadleafGeometry2(), foliageMaterial(wind, { amount: 0.05, freq: 3.0, bump: 1.0 })],
  [rockGeometry(), rockMaterial()],
  [pineGeometry2(1), foliageMaterial(wind, { freq: 3.4, stretch: [1, 1.7, 1], bump: 0.8 })],
  [broadleafGeometry2(1), foliageMaterial(wind, { freq: 2.6, bump: 0.8 })],
] as const;
const trunk = trunkGeometry2(), trunkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
kinds.forEach(([g, m], k) => {
  const n = 6, mesh = new THREE.InstancedMesh(g, m, n), tm = new THREE.InstancedMesh(trunk, trunkMat, n), mm = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    mm.compose(new THREE.Vector3((k - 2) * 4.2 + (i % 2) * 1.8, k === 2 ? 0.35 : 0, -i * 3.2 + (i % 2)), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 1.7), new THREE.Vector3().setScalar(0.9 + (i % 3) * 0.25));
    mesh.setMatrixAt(i, mm); tm.setMatrixAt(i, mm);
  }
  mesh.castShadow = mesh.receiveShadow = tm.castShadow = true; scene.add(mesh); if (k !== 2) scene.add(tm);
});
const cam = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.5, 400);
if (far) { cam.position.set(0, 90, 60); cam.lookAt(0, 0, -6); } else { cam.position.set(0, 9, 13); cam.lookAt(0, 2, -4); }
r.render(scene, cam);
(window as any).__frames = 1;
