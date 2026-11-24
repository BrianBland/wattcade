import { buildChain } from './chain';
import { drawnPhase, SWING, rivalSwing } from '../sim/chain';
import { displayRace } from './motion';
import { RallySound } from './sound';
import * as T from 'three';
import { NO_INSETS, type GameRenderer, type Insets } from '../../../contracts';
import { classes, LAP, type RaceView } from '../sim/race';
import { buildEndCourse } from './endCourses';
import { venueTextures } from './venueTextures';
import { districtRelic } from './districtRelic';
import { valley, saddle, onClimb, passRate } from '../sim/pass';
import { courses, winchCut } from '../sim/track';
import { lapAt, LIP, LAUNCH_SPEED, CATCH, DROP, RESCUE, easeBetween } from '../sim/deck';
import { buildBike } from './bike';
import { buildWake } from './wake';
import { buildCranes } from './crane';
import { timingLine } from './timingLine';
import { buildCauseway } from './causeway';
import { canCollectOnArrival, stations, stormWidth } from '../sim/stormglass';
import { buildFiringWorks } from './firingWorks';
import { firebox, fireboxLight, requiredCoverage } from '../sim/kiln';
import { buildYard } from './yard';
import './rally.css';

export function playBounds(w: number, h: number, i: Insets) {
  return {
    x: i.left,
    y: i.top,
    w: Math.max(1, w - i.left - i.right),
    h: Math.max(1, h - i.top - i.bottom),
  };
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

function courseCue(s: RaceView, d: number) {
  if (s.course === 3) return Math.abs(s.x) > 1.65 ? 'LOOSE CINDER' : d > 905 ? 'HOME STRAIGHT' : '';
  if (s.course === 4) {
    if (d < valley) return '‹ CARRIAGE     WINCH CUT ›';
    if (onClimb(d)) return (s.cut ? 'WINCH CUT' : 'CARRIAGE') + '  ·  ' + s.grade.toFixed(1) + '%';
    return '';
  }
  if (s.course === 2) {
    const station = stations.find((g) => g.at > d && g.at - d < 52);
    if (!station) return '';
    if (station.exhibit) return 'GROUNDING FORK';
    if (canCollectOnArrival(station, station.at - d, s.speed, s.time))
      return station.side > 0 ? 'CHARGE STRIP  ›' : '‹  CHARGE STRIP';
    return station.side > 0 ? '‹  KEEP LEFT' : 'KEEP RIGHT  ›';
  }
  if (s.course === 1) {
    if (d >= 30 && d < 88) return 'HOLD THE LEFT SEAM';
    if (d >= 350 && d < 420) return 'BANKED FLUME  ‹';
    if (d >= 645 && d < 704) return 'FOLLOW THE CROSSOVER';
    return '';
  }
  if (d >= 145 && d < Math.min(LIP, 208) && s.x <= 0.1) return '‹  BRIDGE    /    BOOST JUMP  ›';
  if (d >= 610 && d < 672) return 'SINGLE SPAN   /   EXPOSED EDGES';
  return '';
}

export class Renderer implements GameRenderer {
  private root!: HTMLDivElement;
  private stage!: HTMLDivElement;
  private info!: HTMLDivElement;
  private scene!: T.Scene;
  private cranes!: ReturnType<typeof buildCranes>;
  private yards = new Map<
    number,
    { root: T.Group; animate: (time: number, distance: number, state: RaceView) => void }
  >();
  private yardMaps?: [T.Texture, T.Texture, T.Texture, T.Texture, T.Texture];
  private venueArt!: ReturnType<typeof venueTextures>;
  private activeCourse = -1;
  private camera = new T.PerspectiveCamera(58, 1, 0.15, 360);
  private gl!: T.WebGLRenderer;
  private assets?: Promise<void>;
  private disposed = false;
  private bikes: ReturnType<typeof buildBike>[] = [];
  private wakes: ReturnType<typeof buildWake>[] = [];
  private touchdowns = [0, 0, 0, 0];
  private jumpCounts = [0, 0, 0, 0];
  private shades: T.Mesh[] = [];
  private chain: ReturnType<typeof buildChain>[] = [];
  private warning: T.Sprite[] = [];
  private sparks!: T.Points;
  private streak!: T.LineSegments;
  private insets = NO_INSETS;
  private width = 1;
  private height = 1;
  private animateYard?: (time: number, distance: number, state: RaceView) => void;
  private sound = new RallySound();
  private skyLight = new T.HemisphereLight('#ffead1', '#8d6575', 2.1);
  private moon = new T.Color('#adcbe6');
  private fire = new T.Color('#ffab66');
  private sun = new T.DirectionalLight('#fff1bd', 2.15);
  private lastHud = '';
  private label!: HTMLElement;
  private lap!: HTMLElement;
  private combat!: HTMLElement;
  private threat!: HTMLElement;
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
    this.gl = new T.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.gl.setPixelRatio(Math.min(1.6, window.devicePixelRatio || 1));
    this.gl.setClearColor(0, 0);
    this.gl.outputColorSpace = T.SRGBColorSpace;
    this.stage.append(this.gl.domElement);
    this.scene = new T.Scene();
    this.cranes = buildCranes(this.scene);
    this.scene.fog = new T.FogExp2('#d28d70', 0.008);
    this.scene.add(this.skyLight);
    const sun = this.sun;
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, {
      left: -23,
      right: 23,
      top: 23,
      bottom: -23,
      near: 1,
      far: 95,
    });
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
      this.wakes.push(buildWake(this.scene, [0x8af9ed, 0xff86aa, 0xd3f087, 0x82beff][i]));
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
      const chain = buildChain();
      this.chain.push(chain);
      bike.group.add(chain.mesh);
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
      new T.LineBasicMaterial({
        color: '#fff0c3',
        transparent: true,
        opacity: 0.43,
      }),
    );
    this.streak.frustumCulled = false;
    this.scene.add(this.streak);
    this.info = document.createElement('div');
    this.info.className = 'scrapjet-dash';
    this.info.innerHTML =
      '<div class="sj-rank"><b></b><span></span></div><canvas class="sj-map" width="180" height="114"></canvas><div class="sj-combat"></div><div class="sj-threat"></div><div class="sj-speed"><div><b>0</b><small>KM/H</small></div><div class="sj-dial"><i></i><em></em></div><span></span></div><div class="sj-cue"></div><div class="sj-grid"><small>SCRAPJET RALLY</small><strong></strong><p></p><span></span><small>Paddles · class &nbsp; B · course &nbsp; ↑ · distance &nbsp; A · race</small></div>';
    this.stage.append(this.info);
    this.label = this.info.querySelector('b')!;
    this.lap = this.info.querySelector('.sj-rank span')!;
    this.combat = this.info.querySelector('.sj-combat')!;
    this.gauge = this.info.querySelector('.sj-speed')!;
    this.cue = this.info.querySelector('.sj-cue')!;
    this.menu = this.info.querySelector('.sj-grid')!;
    this.threat = this.info.querySelector('.sj-threat')!;
    this.map = this.info.querySelector('canvas')!;
    this.routeMap = document.createElement('canvas');
    this.routeMap.width = 180;
    this.routeMap.height = 114;
    this.resize(host.clientWidth, host.clientHeight);
    this.venueArt = venueTextures(loader, this.gl.capabilities.getMaxAnisotropy());
    this.assets = Promise.all(
      ['slag-road', 'salvage-enamel', 'kiln-plates', 'kiln-bricks', 'stormglass'].map((name) =>
        loader.loadAsync('/scrapjet/' + name + '.webp'),
      ),
    ).then(([road, enamel, plates, brick, sky]) => {
      if (this.disposed) {
        [road, enamel, plates, brick, sky].forEach((t) => t.dispose());
        return;
      }
      sky.colorSpace = T.SRGBColorSpace;
      this.yardMaps = [road, enamel, plates, brick, sky];
    });
    this.assets = Promise.all([this.assets, ...skinLoads]).then(() => undefined);
  }
  private setCourse(id: number) {
    if (!this.yardMaps || this.activeCourse === id) return;
    const storm = id === 2;
    for (const el of [this.stage, this.root]) {
      el.classList.toggle('cinder-sky', id === 3);
      el.classList.toggle('cable-sky', id === 4);
    }
    this.stage.classList.toggle('storm-shelf', storm);
    this.root.classList.toggle('storm-night', storm);
    this.stage.classList.toggle('kiln-dusk', id === 1);
    (this.scene.fog as T.FogExp2).color.set(
      id === 4 ? '#a2adba' : id === 3 ? '#bc9275' : storm ? '#716f92' : id === 1 ? '#475b70' : '#d28d70',
    );
    this.root.classList.toggle('kiln-night', id === 1);
    this.skyLight.color.set(storm ? '#b7c7ee' : id === 1 ? '#adafc1' : '#ffead1');
    this.skyLight.groundColor.set(storm ? '#62677c' : id === 1 ? '#435360' : '#8d6575');
    this.sun.color.set(id === 4 ? '#ffd6a3' : storm ? '#ffd4b8' : id === 1 ? '#adcbe6' : '#fff1bd');
    const previous = this.yards.get(this.activeCourse);
    if (previous) previous.root.visible = false;
    let yard = this.yards.get(id);
    if (!yard) {
      const root = new T.Group();
      const [road, enamel, plates, brick, sky] = this.yardMaps;
      const aniso = this.gl.capabilities.getMaxAnisotropy();
      const animate =
        id >= 3
          ? buildEndCourse(root, id === 3, this.venueArt)
          : storm
            ? buildCauseway(root, courses[id], sky)
            : id === 1
              ? buildFiringWorks(root, courses[id], plates, brick, aniso)
              : buildYard(root, road, enamel, aniso, courses[id]);
      if (id < 3) districtRelic(root, courses[id], id, this.venueArt);
      timingLine(
        root,
        courses[id],
        id === 3 ? 2.3 : id === 4 ? 1.43 : storm ? stormWidth(0) : id === 1 ? 1.58 : 1.32,
      );
      yard = { root, animate };
      this.yards.set(id, yard);
      this.scene.add(root);
    }
    yard.root.visible = true;
    this.animateYard = yard.animate;
    this.touchdowns.fill(0);
    this.jumpCounts.fill(0);
    this.activeCourse = id;
    const g = this.routeMap.getContext('2d')!;
    g.clearRect(0, 0, 180, 114);
    g.beginPath();
    for (let i = 0; i <= 180; i++) {
      const p = courses[id].track((i * LAP) / 180);
      const x = (id === 4 ? 88 : 32) + p.x * 0.34,
        y = 55 + p.z * (id === 4 ? 0.21 : 0.27);
      if (!i) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    if (id === 4) {
      const a = winchCut.track(valley),
        b = winchCut.track(saddle);
      g.moveTo(88 + a.x * 0.34, 55 + a.z * 0.21);
      g.lineTo(88 + b.x * 0.34, 55 + b.z * 0.21);
    }
    g.strokeStyle = '#221b26';
    g.lineWidth = 7;
    g.stroke();
    g.strokeStyle = '#eee1c099';
    g.lineWidth = 2;
    g.stroke();
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
  render(snapshot: RaceView, _bike?: unknown, _input?: unknown, frameFraction = 1) {
    const s = displayRace(snapshot, frameFraction);
    this.setCourse(s.course);
    const { track, world } = s.course === 4 && s.cut ? winchCut : courses[s.course];
    const f = track(s.at);
    if (s.course === 1) this.sun.color.copy(this.moon).lerp(this.fire, fireboxLight(s.at));
    const actors = [
      {
        at: s.at,
        cut: s.cut,
        x: s.x,
        lean: s.lean,
        stun: s.slow,
        finish: null,
        lift: s.lift,
        fall: s.fall,
        craneAway: s.craneAway,
        flight: s.flight,
        grace: s.grace,
        jumps: s.jumps,
      },
      ...s.rivals,
    ];
    actors.forEach((r, i) => {
      const p = (s.course === 4 && r.cut ? winchCut : courses[s.course]).world(r.at, r.x);
      const obj = this.bikes[i].group;
      const rebound = i && r.stun ? Math.sin(r.stun * 17) * Math.min(0.16, r.stun * 0.18) : 0;
      if (r.jumps > this.jumpCounts[i]) this.touchdowns[i] = s.time;
      this.jumpCounts[i] = r.jumps;
      const age = s.time - this.touchdowns[i];
      const settle =
        this.touchdowns[i] && age >= 0 && age < 0.55 ? Math.sin(age * 17) * Math.exp(-age * 7) : 0;
      obj.visible = r.finish === null;
      obj.position.set(p.x, p.y + r.lift + 0.26 - settle * 0.34 + Math.sin(s.time * 8 + i) * 0.045, p.z);
      const ageOfFall = RESCUE - r.fall;
      const tumble = r.fall
        ? (r.x < 0 ? -1 : 1) *
          0.72 *
          easeBetween(ageOfFall, 0, CATCH) *
          (1 - easeBetween(ageOfFall, CATCH, 1.13))
        : 0;
      obj.rotation.set(
        (r.flight ? (r.flight - 0.5) * 0.44 : 0) - settle * 0.12 + Math.sin(s.time * 6 + i) * 0.015,
        -p.yaw,
        p.bank + r.lean + rebound + tumble,
        'YXZ',
      );
      this.cranes[i](obj, p.yaw, r.fall, r.craneAway);
      const thrust = i ? (r.stun ? 0.52 : 1) : 0.7 + s.speed / 35 + (s.boost ? 1 : 0);
      this.bikes[i].jetTime.value = s.time + i * 0.39;
      this.bikes[i].flame.scale.z = thrust * (1.15 + 0.06 * Math.sin(s.time * 31 + i));
      this.wakes[i](obj, s.time, thrust, obj.visible && !s.menu && !r.fall && !r.grace);
      const shade = this.shades[i];
      shade.visible = obj.visible && !r.fall && !r.flight;
      shade.position.set(p.x, p.y + r.lift + 0.063, p.z);
      shade.rotation.set(-Math.PI / 2, -p.yaw, p.bank, 'YXZ');
      const r2 = s.rivals[i - 1],
        wind = r2?.windup ?? 0;
      const side = i ? r2.side : s.side;
      const phase =
        wind > 0
          ? drawnPhase * (1 - wind / 1.15)
          : i
            ? r2.strike
              ? 1 - ((1 - drawnPhase) * r2.strike) / rivalSwing
              : 0
            : s.swing
              ? 1 - s.swing / SWING
              : 0;
      const hands = this.bikes[i].pose(r.lean, side, phase, settle);
      this.chain[i].pose(side, phase, hands);
      const light = this.warning[i];
      light.visible = wind > 0;
      light.position.set((r2?.side ?? 1) * 0.65, 1.45, 0.1);
      light.scale.setScalar(1.2 + 0.7 * Math.sin(s.time * 26));
    });
    const rescueView = s.fall ? easeBetween(RESCUE - s.fall, 0, CATCH) : easeBetween(s.craneAway, 0, 0.4);
    const back = s.menu ? 8.5 : 6.65 + s.speed * 0.033 + rescueView * 4.3;
    const stationRate = s.course === 4 ? passRate(s.at, s.cut) : 1;
    const eye = world(
      s.at - back * stationRate,
      s.cameraX + rescueView * (s.x - s.cameraX) + (s.menu ? 0.65 : 0),
      s.menu ? 3.1 : 2.55 + s.speed * 0.017 + rescueView * 1.6,
    );
    const focus = world(s.at + (8 + s.speed * 0.11) * stationRate, s.cameraX * 0.72, 1.1 + rescueView * 1.9);
    const age = s.time - this.touchdowns[0];
    const compression =
      this.touchdowns[0] && age >= 0 && age < 0.55 ? Math.sin(age * 15) * Math.exp(-age * 7) : 0;
    const j = s.impact * Math.sin(s.time * 97) * 0.23;
    this.camera.position.set(eye.x + j, eye.y + j - compression * 0.32 + Math.max(0, s.lift) * 0.67, eye.z);
    const roll = s.lean * 0.15 - f.bank * 0.36;
    this.camera.up.set(Math.cos(f.yaw) * Math.sin(roll), Math.cos(roll), Math.sin(f.yaw) * Math.sin(roll));
    if (rescueView > 0) {
      const tow = world(s.at, s.x, 1.55 + s.lift * 0.7);
      focus.x += (tow.x - focus.x) * rescueView;
      focus.y += (tow.y - focus.y) * rescueView;
      focus.z += (tow.z - focus.z) * rescueView;
    }
    this.camera.lookAt(focus.x, focus.y + Math.max(0, s.lift) * 0.36, focus.z);
    const fov =
      55 +
      rescueView * 8 +
      Math.min(15, s.speed * 0.38) +
      (s.flight ? 2.8 * Math.sin(Math.PI * s.flight) : 0) +
      (s.boost > 0 ? 2.2 * Math.min(1, s.boost) : 0);
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
    this.animateYard?.(s.menu ? performance.now() / 1000 : s.time, s.at, s);
    this.sun.target.position.set(f.x, f.y, f.z);
    this.sun.position.set(f.x - 25, f.y + 37, f.z + 18);
    this.gl.render(this.scene, this.camera);
    this.drawHud(snapshot);
    this.sound.update(snapshot);
  }
  private drawHud(s: RaceView) {
    const g = this.map.getContext('2d')!;
    g.clearRect(0, 0, 180, 114);
    g.drawImage(this.routeMap, 0, 0);
    for (const r of [...s.rivals, s]) {
      const p = (s.course === 4 && r.cut ? winchCut : courses[s.course]).track(r.at);
      g.fillStyle = r === s ? '#a6fff1' : '#ff8757';
      g.beginPath();
      g.arc(
        (s.course === 4 ? 88 : 32) + p.x * 0.34,
        55 + p.z * (s.course === 4 ? 0.21 : 0.27),
        r === s ? 4 : 2.3,
        0,
        Math.PI * 2,
      );
      g.fill();
    }
    const danger = s.rivals.find((r) => r.windup > 0);
    const d = lapAt(s.at);
    const kiln = s.course === 1;
    const run = kiln ? firebox(s.at) : undefined;
    const routeCue = courseCue(s, d);
    this.threat.hidden = !danger || !!s.fall || s.menu;
    if (danger) {
      const left = danger.x < s.x;
      this.threat.textContent = left ? '‹  CHAIN LEFT' : 'CHAIN RIGHT  ›';
      this.threat.classList.toggle('left', left);
      this.threat.style.setProperty('--wind', (100 * (1 - danger.windup / 1.15)).toFixed(0) + '%');
    }
    const cue =
      s.at >= s.finishAt
        ? places[s.place - 1] + ' · FINISH'
        : s.fall
          ? RESCUE - s.fall < CATCH
            ? 'MAGNET INBOUND'
            : RESCUE - s.fall < DROP
              ? 'ON THE WINCH'
              : 'RELEASING'
          : s.flight
            ? 'AIRBORNE'
            : s.slow
              ? 'OVERLOAD   /   ' +
                Math.round(s.purgeFtp * 100) +
                '% FTP   ' +
                Math.floor(s.purge * 100) +
                '%'
              : s.notice > 0
                ? s.message
                : routeCue
                  ? routeCue
                  : s.draft > 0.7
                    ? 'IN THE SLIPSTREAM'
                    : '';
    const speed = Math.round(s.speed * 3.6);
    const ramp = s.course === 0 && d >= 145 && d < LIP && s.x > 0.1 && !s.fall;
    const enough = s.speed >= LAUNCH_SPEED;
    const key = [
      ramp,
      enough,
      !!s.boost,
      s.menu,
      s.cupStage,
      s.course,
      s.laps,
      s.tier,
      s.place,
      s.lap,
      cue,
      speed,
      !!s.reload,
      !!s.shield,
      Math.ceil(s.tow),
      !!run,
      s.firing.onSeam,
      s.seamPowered,
      Math.floor(s.firing.coverage * 25),
    ].join('|');
    if (key === this.lastHud) return;
    this.lastHud = key;
    this.info.classList.toggle('on-grid', s.menu);
    if (s.menu) {
      this.menu.querySelector('strong')!.textContent = courses[s.course].name;
      this.menu.querySelector('small')!.textContent =
        s.cupStage < 0
          ? 'SCRAPJET RALLY'
          : 'BREAKER CUP · HEAT ' +
            (s.cupStage + 1) +
            ' / 5' +
            (s.lastPlace ? ' · LAST ' + places[s.lastPlace - 1] + ' · ' + s.cupPoints[0] + ' PTS' : '');
      this.menu.querySelector('small:last-child')!.textContent =
        s.cupStage > 0
          ? 'A · start next heat'
          : s.cupStage === 0
            ? 'Paddles · class   ↓ · single race   A · start cup'
            : 'Paddles · class   B · course   ↑ · distance   ↓ · cup   A · race';
      this.menu.querySelector('p')!.textContent =
        s.course === 3
          ? 'Hold a wheel around the bowl. Pass on the final straight to ring the tram bell.'
          : s.course === 4
            ? 'Stay left for the carriage road or take the steeper winch cut on the right.'
            : s.course === 2
              ? 'Read the grounding forks. Catch a charge on the exposed edge.'
              : kiln
                ? 'Hold the first seam. Ride the high bank, then follow the copper across the return drum.'
                : 'Bridge left. Line up the right boost pad to clear the broken viaduct.';
      this.menu.querySelector('span')!.textContent =
        classes[s.tier] +
        ' · ' +
        Math.round(100 * s.paceFtp) +
        '% FTP pace   /   ' +
        s.laps +
        ' laps   /   ' +
        (s.laps === 3 ? '2–4 min' : s.laps === 12 ? '9–14 min' : '18–28 min');
    }
    this.label.textContent = places[s.place - 1];
    this.lap.textContent = 'LAP ' + s.lap + ' / ' + s.laps;
    this.gauge.querySelector('b')!.textContent = String(speed);
    this.gauge.style.setProperty('--speed', Math.min(100, speed / 1.4) + '%');
    this.gauge.classList.toggle('pressure', !!run);
    this.gauge.classList.toggle('charging', !!run && s.firing.onSeam);
    if (run)
      this.gauge.style.setProperty(
        '--speed',
        Math.round(Math.min(1, s.firing.coverage / requiredCoverage) * 100) + '%',
      );
    this.gauge.style.setProperty('--launch', (LAUNCH_SPEED * 3.6) / 1.4 + '%');
    this.gauge.classList.toggle('approach', ramp);
    this.gauge.classList.toggle('over', (ramp && enough) || !!s.boost);
    this.gauge.querySelector('span')!.textContent = run
      ? s.firing.coverage >= requiredCoverage
        ? 'PRESSURE READY'
        : !s.seamPowered
          ? 'PEDAL · ' + Math.ceil(s.seamFtp * 100) + '% FTP'
          : s.firing.onSeam
            ? 'CHARGING · HOLD SEAM'
            : 'ALIGN WITH SEAM'
      : ramp
        ? Math.ceil(LAUNCH_SPEED * 3.6) + ' KM/H TO CLEAR'
        : s.boost
          ? 'AFTERBURNER'
          : '';
    this.cue.textContent = cue;
    this.cue.classList.toggle('danger', s.slow > 0);
    this.combat.textContent = s.shield
      ? 'SCRAP ARMOUR'
      : s.tow
        ? 'TOW CELL  ·  ' + Math.ceil(s.tow) + 's'
        : s.reload
          ? 'CHAIN RECOVERY'
          : 'A ‹   CHAIN   › B';
  }
  unmount() {
    this.disposed = true;
    this.sound.stop();
    this.bikes.forEach((b) => b.skeleton.dispose());
    const geometries = new Set<T.BufferGeometry>(),
      materials = new Set<T.Material>(),
      textures = new Set<T.Texture>(this.yardMaps);
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
