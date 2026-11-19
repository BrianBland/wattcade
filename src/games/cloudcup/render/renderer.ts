import { RallySound } from './sound';
import * as T from 'three';
import { NO_INSETS, type GameRenderer, type Insets } from '../../../contracts';
import { chainTip, classes, FINISH, LAP, SWING, type RaceView } from '../sim/race';
import { track, world } from '../sim/track';
import { buildBike } from './bike';
import { buildYard } from './yard';
import './rally.css';

export function playBounds(w: number, h: number, i: Insets) {
  return { x: i.left, y: i.top, w: Math.max(1, w - i.left - i.right), h: Math.max(1, h - i.top - i.bottom) };
}
const places = ['1st', '2nd', '3rd', '4th'];
function glowMap() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const ramp = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  ramp.addColorStop(0, '#ffffff');
  ramp.addColorStop(0.42, '#ffffffad');
  ramp.addColorStop(1, '#ffffff00');
  g.fillStyle = ramp;
  g.fillRect(0, 0, 64, 64);
  return new T.CanvasTexture(c);
}

export class Renderer implements GameRenderer {
  private root!: HTMLDivElement;
  private stage!: HTMLDivElement;
  private info!: HTMLDivElement;
  private scene!: T.Scene;
  private camera = new T.PerspectiveCamera(58, 1, 0.15, 360);
  private gl!: T.WebGLRenderer;
  private assets?: Promise<void>;
  private disposed = false;
  private bikes: ReturnType<typeof buildBike>[] = [];
  private shades: T.Mesh[] = [];
  private chain: T.InstancedMesh[] = [];
  private warning: T.Sprite[] = [];
  private sparks!: T.Points;
  private streak!: T.LineSegments;
  private insets = NO_INSETS;
  private width = 1;
  private height = 1;
  private animateYard?: (time: number) => void;
  private sound = new RallySound();
  private sun = new T.DirectionalLight('#fff1bd', 2.15);
  private lastHud = '';
  private label!: HTMLElement;
  private lap!: HTMLElement;
  private combat!: HTMLElement;
  private gauge!: HTMLElement;
  private cue!: HTMLElement;
  private menu!: HTMLElement;
  private map!: HTMLCanvasElement;
  private routeMap!: HTMLCanvasElement;
  mount(host: HTMLElement, ctx: Parameters<GameRenderer['mount']>[1]) {
    this.insets = ctx.insets ?? NO_INSETS;
    this.root = document.createElement('div');
    this.root.className = 'scrapjet-world';
    this.stage = document.createElement('div');
    this.stage.className = 'scrapjet-stage';
    this.root.append(this.stage);
    host.append(this.root);
    this.gl = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.gl.setPixelRatio(Math.min(1.6, window.devicePixelRatio || 1));
    this.gl.setClearColor(0, 0);
    this.gl.outputColorSpace = T.SRGBColorSpace;
    this.stage.append(this.gl.domElement);
    this.scene = new T.Scene();
    this.scene.fog = new T.FogExp2('#d28d70', 0.008);
    this.scene.add(new T.HemisphereLight('#ffead1', '#8d6575', 2.1));
    const sun = this.sun;
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -23, right: 23, top: 23, bottom: -23, near: 1, far: 95 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.035;
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = T.PCFShadowMap;
    this.scene.add(sun, sun.target);
    const rim = new T.DirectionalLight('#b4d8ed', 1.15);
    rim.position.set(15, 10, -24);
    this.scene.add(rim);
    const glow = glowMap();
    const loader = new T.TextureLoader();
    const skinLoads: Promise<void>[] = [];
    const skins = ['number-seven', 'rival-0', 'rival-1', 'rival-2'].map((name) => {
      const image = new Image(),
        texture = new T.Texture(image);
      image.src = '/scrapjet/' + name + '.webp';
      skinLoads.push(
        image.decode().then(() => {
          texture.needsUpdate = true;
        }),
      );
      return texture;
    });
    skins.forEach((skin) => (skin.colorSpace = T.SRGBColorSpace));
    for (let i = 0; i < 4; i++) {
      const bike = buildBike(i, skins[i]);
      this.bikes.push(bike);
      this.scene.add(bike.group);
      const shadow = new T.Mesh(
        new T.PlaneGeometry(2.4, 4.6),
        new T.MeshBasicMaterial({
          map: glow,
          color: '#221828',
          transparent: true,
          opacity: 0.79,
          depthWrite: false,
        }),
      );
      this.shades.push(shadow);
      this.scene.add(shadow);
      const links = new T.InstancedMesh(
        new T.TorusGeometry(0.113, 0.034, 5, 10),
        new T.MeshStandardMaterial({
          color: i ? '#ffb058' : '#caffff',
          emissive: i ? '#b73b10' : '#148d98',
          emissiveIntensity: 0.85,
          metalness: 0.65,
          roughness: 0.32,
        }),
        16,
      );
      links.frustumCulled = false;
      this.chain.push(links);
      bike.group.add(links);
      const light = new T.Sprite(
        new T.SpriteMaterial({
          map: glow,
          color: '#ff672d',
          transparent: true,
          depthWrite: false,
          blending: T.AdditiveBlending,
        }),
      );
      this.warning.push(light);
      bike.group.add(light);
    }
    const sparkGeo = new T.BufferGeometry();
    sparkGeo.setAttribute('position', new T.Float32BufferAttribute(new Float32Array(32 * 3), 3));
    this.sparks = new T.Points(
      sparkGeo,
      new T.PointsMaterial({
        color: '#ffe675',
        map: glow,
        size: 0.24,
        transparent: true,
        depthWrite: false,
        blending: T.AdditiveBlending,
      }),
    );
    this.sparks.frustumCulled = false;
    this.scene.add(this.sparks);
    const streakGeo = new T.BufferGeometry();
    streakGeo.setAttribute('position', new T.Float32BufferAttribute(new Float32Array(32 * 6), 3));
    this.streak = new T.LineSegments(
      streakGeo,
      new T.LineBasicMaterial({ color: '#fff0c3', transparent: true, opacity: 0.43 }),
    );
    this.streak.frustumCulled = false;
    this.scene.add(this.streak);
    this.info = document.createElement('div');
    this.info.className = 'scrapjet-dash';
    this.info.innerHTML =
      '<div class="sj-rank"><b></b><span></span></div><canvas class="sj-map" width="180" height="114"></canvas><div class="sj-combat"></div><div class="sj-speed"></div><div class="sj-cue"></div><div class="sj-grid"><small>MAGNET MILE &nbsp; / &nbsp; THREE LAPS</small><strong>SCRAPJET<br>RALLY</strong><span></span><small>Hold paddles to lean · A to launch</small></div>';
    this.stage.append(this.info);
    this.label = this.info.querySelector('b')!;
    this.lap = this.info.querySelector('.sj-rank span')!;
    this.combat = this.info.querySelector('.sj-combat')!;
    this.gauge = this.info.querySelector('.sj-speed')!;
    this.cue = this.info.querySelector('.sj-cue')!;
    this.menu = this.info.querySelector('.sj-grid')!;
    this.map = this.info.querySelector('canvas')!;
    this.routeMap = document.createElement('canvas');
    this.routeMap.width = 180;
    this.routeMap.height = 114;
    const g = this.routeMap.getContext('2d')!;
    g.beginPath();
    for (let i = 0; i <= 180; i++) {
      const p = track((i * LAP) / 180);
      const x = 32 + p.x * 0.34,
        y = 55 + p.z * 0.27;
      if (!i) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.strokeStyle = '#221b26';
    g.lineWidth = 7;
    g.stroke();
    g.strokeStyle = '#eee1c099';
    g.lineWidth = 2;
    g.stroke();
    this.resize(host.clientWidth, host.clientHeight);
    this.assets = Promise.all(
      ['slag-road', 'yard-0', 'yard-1', 'yard-2'].map((name) =>
        loader.loadAsync('/scrapjet/' + name + '.webp'),
      ),
    ).then(([road, ...props]) => {
      if (this.disposed) {
        [road, ...props].forEach((t) => t.dispose());
        return;
      }
      this.animateYard = buildYard(this.scene, road, props, this.gl.capabilities.getMaxAnisotropy());
    });
    this.assets = Promise.all([this.assets, ...skinLoads]).then(() => undefined);
  }
  async ready() {
    await this.assets;
  }
  resize(w: number, h: number) {
    this.width = w;
    this.height = h;
    this.layout();
  }
  setInsets(i: Insets) {
    this.insets = i;
    this.layout();
  }
  private layout() {
    if (!this.stage) return;
    const b = playBounds(this.width, this.height, this.insets);
    Object.assign(this.stage.style, {
      left: b.x + 'px',
      top: b.y + 'px',
      width: b.w + 'px',
      height: b.h + 'px',
    });
    this.gl.setSize(b.w, b.h);
    this.camera.aspect = b.w / b.h;
    this.camera.updateProjectionMatrix();
  }
  private links(i: number, side: number, phase: number, wind: number) {
    const mesh = this.chain[i];
    mesh.visible = phase > 0 || wind > 0;
    if (!mesh.visible) return;
    const tip = wind > 0 ? { x: side * (0.85 + 0.26 * (1 - wind / 1.15)), z: -0.92 } : chainTip(phase, side);
    const angle = Math.atan2(tip.z, Math.abs(tip.x));
    const dummy = new T.Object3D();
    for (let k = 0; k < 16; k++) {
      const t = k / 15;
      dummy.position.set(
        side * 0.47 * (1 - t) + tip.x * t,
        1.45 + 0.22 * Math.sin(t * 3.4) - 0.19 * t,
        0.04 * (1 - t) + tip.z * t,
      );
      dummy.rotation.set(k % 2 ? 0.95 : 0.12, -angle * side, 0.12);
      dummy.scale.set(1.4, 0.76, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(k, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  render(s: RaceView) {
    const f = track(s.at);
    const actors = [{ at: s.at, x: s.x, lean: s.lean, stun: s.slow, finish: null }, ...s.rivals];
    actors.forEach((r, i) => {
      const p = world(r.at, r.x);
      const obj = this.bikes[i].group;
      const rebound = i && r.stun ? Math.sin(r.stun * 17) * Math.min(0.16, r.stun * 0.18) : 0;
      obj.visible = r.finish === null;
      obj.position.set(p.x, p.y + 0.26 + Math.sin(s.time * 8 + i) * 0.045, p.z);
      obj.rotation.set(Math.sin(s.time * 6 + i) * 0.015, -p.yaw, p.bank + r.lean + rebound, 'YXZ');
      const thrust = i ? (r.stun ? 0.52 : 1) : 0.7 + s.speed / 35 + (s.boost ? 1 : 0);
      this.bikes[i].flame.scale.z = thrust * (1.1 + 0.15 * Math.sin(s.time * 43 + i));
      const shade = this.shades[i];
      shade.visible = obj.visible;
      shade.position.set(p.x, p.y + 0.063, p.z);
      shade.rotation.set(-Math.PI / 2, -p.yaw, p.bank, 'YXZ');
      const r2 = s.rivals[i - 1],
        wind = r2?.windup ?? 0;
      this.links(
        i,
        i ? r2.side : s.side,
        i ? (r2.strike ? 1 - r2.strike / 0.34 : 0) : s.swing ? 1 - s.swing / SWING : 0,
        wind,
      );
      const light = this.warning[i];
      light.visible = wind > 0;
      light.position.set((r2?.side ?? 1) * 0.65, 1.45, 0.1);
      light.scale.setScalar(1.2 + 0.7 * Math.sin(s.time * 26));
    });
    const back = s.menu ? 8.5 : 6.65 + s.speed * 0.033;
    const eye = world(s.at - back, s.cameraX + (s.menu ? 0.65 : 0), s.menu ? 3.1 : 2.55 + s.speed * 0.017);
    const focus = world(s.at + 8 + s.speed * 0.11, s.cameraX * 0.72, 1.1);
    const j = s.impact * Math.sin(s.time * 97) * 0.23;
    this.camera.position.set(eye.x + j, eye.y + j, eye.z);
    const roll = s.lean * 0.15 + f.turn * 0.065;
    this.camera.up.set(Math.cos(f.yaw) * Math.sin(roll), Math.cos(roll), Math.sin(f.yaw) * Math.sin(roll));
    this.camera.lookAt(focus.x, focus.y, focus.z);
    const fov = 55 + Math.min(15, s.speed * 0.38);
    if (Math.abs(fov - this.camera.fov) > 0.06) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.stage.style.backgroundPosition = 50 + Math.sin(f.yaw) * 34 + '% 48%';
    const p = world(s.at, s.x, 1.05);
    this.sparks.visible = !!s.impact;
    if (s.impact) {
      const age = Math.max(0, 0.33 - s.impact);
      const pos = this.sparks.geometry.attributes.position;
      for (let i = 0; i < 32; i++) {
        const a = i * 2.4,
          radius = age * (3 + (i % 8)),
          dx = s.impactX * 3.2 + radius * Math.cos(a);
        pos.setXYZ(
          i,
          p.x + dx * Math.cos(f.yaw) + radius * Math.sin(a) * 0.35,
          p.y + age * (2 + (i % 7)) - age * age * 9,
          p.z + dx * Math.sin(f.yaw) + radius * Math.sin(a),
        );
      }
      pos.needsUpdate = true;
    }
    const hot = s.boost > 0 || s.draft > 0.7;
    this.streak.visible = hot;
    if (hot) {
      const pos = this.streak.geometry.attributes.position;
      for (let i = 0; i < 32; i++) {
        const z = (i * 8.17 + s.time * (s.boost ? 23 : 15)) % 25;
        const a = world(s.at + 16 - z, (i % 2 ? 1 : -1) * (0.6 + (i % 9) * 0.14), 0.16 + (i % 5) * 0.35);
        pos.setXYZ(2 * i, a.x, a.y, a.z);
        pos.setXYZ(2 * i + 1, a.x - Math.sin(f.yaw) * 0.8, a.y, a.z + Math.cos(f.yaw) * 0.8);
      }
      pos.needsUpdate = true;
    }
    this.animateYard?.(s.time);
    this.sun.target.position.set(f.x, f.y, f.z);
    this.sun.position.set(f.x - 25, f.y + 37, f.z + 18);
    this.gl.render(this.scene, this.camera);
    this.drawHud(s);
    this.sound.update(s);
  }
  private drawHud(s: RaceView) {
    const g = this.map.getContext('2d')!;
    g.clearRect(0, 0, 180, 114);
    g.drawImage(this.routeMap, 0, 0);
    for (const r of [...s.rivals, s]) {
      const p = track(r.at);
      g.fillStyle = r === s ? '#a6fff1' : '#ff8757';
      g.beginPath();
      g.arc(32 + p.x * 0.34, 55 + p.z * 0.27, r === s ? 4 : 2.3, 0, Math.PI * 2);
      g.fill();
    }
    const danger = s.rivals.find((r) => r.windup > 0);
    const cue =
      s.at >= FINISH
        ? places[s.place - 1] + ' · FINISH'
        : s.slow
          ? 'OVERLOAD   /   ' + Math.round(s.purgeFtp * 100) + '% FTP   ' + Math.floor(s.purge * 100) + '%'
          : danger
            ? (danger.x < s.x ? '‹ LEFT' : 'RIGHT ›') + '   /   INCOMING'
            : s.notice > 0
              ? s.message
              : s.draft > 0.7
                ? 'IN THE SLIPSTREAM'
                : '';
    const speed = Math.round(s.speed * 3.6);
    const key = [s.menu, s.tier, s.place, s.lap, cue, speed, !!s.reload].join('|');
    if (key === this.lastHud) return;
    this.lastHud = key;
    this.info.classList.toggle('on-grid', s.menu);
    this.menu.querySelector('span')!.textContent = '‹  ' + classes[s.tier] + '  ›';
    this.label.textContent = places[s.place - 1];
    this.lap.textContent = 'LAP ' + s.lap + ' / 3';
    this.gauge.innerHTML = '<b>' + speed + '</b><small> KM/H</small>';
    this.cue.textContent = cue;
    this.cue.classList.toggle('danger', !!danger || s.slow > 0);
    this.combat.textContent = s.reload ? 'CHAIN REELING' : 'A ‹   CHAIN   › B';
  }
  unmount() {
    this.disposed = true;
    this.sound.stop();
    const geometries = new Set<T.BufferGeometry>(),
      materials = new Set<T.Material>(),
      textures = new Set<T.Texture>();
    this.scene.traverse((obj) => {
      const m = obj as T.Mesh;
      if (m.geometry) geometries.add(m.geometry);
      if (m.material)
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) materials.add(mat);
    });
    materials.forEach((m) => {
      for (const prop of Object.values(m)) if (prop instanceof T.Texture) textures.add(prop);
      m.dispose();
    });
    textures.forEach((t) => t.dispose());
    geometries.forEach((g) => g.dispose());
    this.gl.dispose();
    this.root.remove();
  }
}
