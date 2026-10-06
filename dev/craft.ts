// Dev turntable: the Cadenza craft (normal / overcharged / underpowered) and a mine, through the game's bloom.
//   /dev/craft.html?color=%2344aaff&t=1.2&z=34&x=0   (t = fixed turntable angle, omit to spin; z/x = camera distance/pan)
import * as THREE from 'three';
import { Craft } from '../src/games/cadenza/render/craft';
import { mineGeometry, mineMaterial } from '../src/games/cadenza/render/blocks';
import { Post } from '../src/games/cadenza/render/post';
import { U } from '../src/games/cadenza/render/look';

const q = new URLSearchParams(location.search), color = q.get('color') ?? '#44aaff', fixed = q.get('t');
const app = document.getElementById('app')!;
const r = new THREE.WebGLRenderer({ antialias: true }); r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.1;
app.appendChild(r.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#07060f');
const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 200); const cz = Number(q.get('z') ?? 34), cx = Number(q.get('x') ?? 0); cam.position.set(cx, cz * 0.3, cz); cam.lookAt(cx, 0, 0);
const post = new Post(r, scene, cam);
const states = [{ label: 'normal', over: 0, under: 0 }, { label: 'overcharged', over: 1, under: 0 }, { label: 'underpowered', over: 0, under: 1 }];
const crafts = states.map((s, i) => { const c = new Craft(color); c.group.position.set((i - 1.5) * 9, 0, 0); scene.add(c.group); return c; });
const mines = new THREE.Group(); mines.position.set(13.5, 0.6, 0); scene.add(mines);
const grid = new THREE.GridHelper(60, 30, '#333', '#1a1a2a'); grid.position.y = -1; scene.add(grid);
document.getElementById('lbl')!.innerHTML = [...states.map((s) => s.label), 'mine'].map((l) => `<span>${l}</span>`).join('');
const resize = () => { const w = innerWidth, h = innerHeight; r.setSize(w, h); post.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); };
resize(); addEventListener('resize', resize);
const mi = new THREE.InstancedMesh(mineGeometry(), mineMaterial(), 1); mi.setMatrixAt(0, new THREE.Matrix4().makeScale(1.4, 1.4, 1.4).setPosition(0, 0, 0));
mi.geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array([0.3]), 1)); mines.add(mi);
const R = new THREE.Vector3(1, 0, 0), UP = new THREE.Vector3(0, 1, 0);
let last = performance.now();
const loop = (now: number) => {
  const dt = Math.min(0.1, (now - last) / 1000); last = now; const t = now / 1000;
  U.uTime.value = t % 1000; U.uBeat.value = Math.exp(-((t * 2) % 1) * 7);
  const ang = fixed !== null ? Number(fixed) : t * 0.5;
  crafts.forEach((c, i) => {
    c.group.rotation.y = ang;
    c.update(dt, t, { overdrive: false, ghost: false, bank: 0, beat: U.uBeat.value, over: states[i].over, under: states[i].under }, R, UP);
  });
  mines.rotation.y = ang;
  post.set({ bloom: 0.62, aberr: 0.0012, hurt: 0, time: t % 100 });
  post.render();
  (window as any).__frames = ((window as any).__frames ?? 0) + 1;
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);
