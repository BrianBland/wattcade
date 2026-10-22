// Shared still-frame stage: renderer, gradient sky, fog, sun + hemisphere light, first-person camera rig.
import * as THREE from 'three';
import type { VoxelGrid } from '../voxel/grid';
import { buildClusteredMeshes, voxelMaterial } from '../voxel/three';
import type { MeshOpts } from '../voxel/mesh';

export interface Stage { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; sun: THREE.DirectionalLight; stats: string[]; /** animated scenes: pose everything for time t (s); pure in t */ tick?: (t: number) => void; /** suggested clip length (s) */ duration?: number }

export function makeStage(canvas: HTMLCanvasElement, w: number, h: number, sky: { zenith: number; horizon: number; fog: number; fogDensity: number; sunDir: THREE.Vector3; sunColor: number; sunI: number; hemiSky: number; hemiGround: number; hemiI: number }): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(sky.fog, sky.fogDensity);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { zen: { value: new THREE.Color(sky.zenith) }, hor: { value: new THREE.Color(sky.horizon) }, sun: { value: sky.sunDir.clone().normalize() }, sunC: { value: new THREE.Color(sky.sunColor) } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 zen; uniform vec3 hor; uniform vec3 sun; uniform vec3 sunC; varying vec3 vD;
      void main(){ float t = clamp(vD.y, 0.0, 1.0); vec3 c = mix(hor, zen, pow(t, 0.55));
        float s = max(dot(normalize(vD), sun), 0.0); c += sunC * (pow(s, 600.0) * 2.0 + pow(s, 12.0) * 0.18);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(9000, 32, 16), skyMat);
  skyMesh.frustumCulled = false; skyMesh.renderOrder = -1;
  scene.add(skyMesh);
  const camera = new THREE.PerspectiveCamera(70, w / h, 0.03, 12000);
  scene.add(camera);
  const fpFill = new THREE.PointLight(0xfff4e6, 1.6, 2.5, 1);
  camera.add(fpFill);
  const sun = new THREE.DirectionalLight(sky.sunColor, sky.sunI);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(sky.hemiSky, sky.hemiGround, sky.hemiI));
  skyMesh.onBeforeRender = () => skyMesh.position.copy(camera.position);
  return { renderer, scene, camera, sun, stats: [] };
}

/** Aim the sun's shadow frustum at a box around `centre`. */
export function aimSun(st: Stage, centre: THREE.Vector3, dir: THREE.Vector3, half: number) {
  const d = dir.clone().normalize();
  st.sun.position.copy(centre).addScaledVector(d, 400);
  st.sun.target.position.copy(centre);
  const cam = st.sun.shadow.camera;
  cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half; cam.near = 1; cam.far = 900;
  cam.updateProjectionMatrix();
}

export function addGrid(st: Stage, name: string, grid: VoxelGrid, opts: MeshOpts, parent: THREE.Object3D = st.scene, shadows = { cast: true, receive: true }, mat?: THREE.Material) {
  const t0 = performance.now();
  const material = mat ?? voxelMaterial({ size: grid.size, jitter: 0, origin: grid.origin }); // CPU jitter already baked; shader adds the LOOK bevel
  const built = buildClusteredMeshes(grid, opts, material);
  const group = new THREE.Group();
  for (const m of built.meshes) { m.castShadow = shadows.cast; m.receiveShadow = shadows.receive; group.add(m); }
  parent.add(group);
  st.stats.push(`${name}: ${built.faces.toLocaleString()} faces, ${built.meshes.length} meshes, ${Math.round(performance.now() - t0)} ms`);
  return group;
}
