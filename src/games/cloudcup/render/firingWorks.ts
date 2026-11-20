import * as T from 'three';
import { LAP, WIDTH, type Course } from '../sim/track';
import { fireboxLight, firingRuns, firingLine, kilnWidth, pressureCells, seamHalfWidth } from '../sim/kiln';
import { moltenSteel } from './moltenSteel';
import { buildKilns } from './kilns';

type Vertex = ReturnType<Course['world']>;
type Material = T.Material;
// The masonry, plates, kerbs and lamps all follow the same measured deck.
// Batch by finish; a whole run of bricks or rivets does not need a draw per joint.
export function buildFiringWorks(
  scene: T.Object3D,
  course: Course,
  plates: T.Texture,
  brick: T.Texture,
  anisotropy: number,
) {
  const { world } = course;
  for (const map of [plates, brick]) {
    map.colorSpace = T.SRGBColorSpace;
    map.wrapS = map.wrapT = T.MirroredRepeatWrapping;
    map.anisotropy = Math.min(8, anisotropy);
  }
  const panels = new Map<Material, { pos: number[]; uv: number[]; colors: number[] }>();
  function quad(mat: Material, pts: Vertex[], uv: number[], colors: T.Color[] = []) {
    let data = panels.get(mat);
    if (!data) {
      data = { pos: [], uv: [], colors: [] };
      panels.set(mat, data);
    }
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const p = pts[i];
      data.pos.push(p.x, p.y, p.z);
      data.uv.push(uv[i * 2], uv[i * 2 + 1]);
      if (colors.length) data.colors.push(colors[i].r, colors[i].g, colors[i].b);
    }
  }
  const solid = (color: string, map?: T.Texture) =>
    new T.MeshStandardMaterial({
      color,
      map: map ?? null,
      roughness: 0.83,
      metalness: 0.16,
      side: T.DoubleSide,
    });
  const glow = (color: string) => new T.MeshBasicMaterial({ color, side: T.DoubleSide });
  const steel = solid('#576e71', plates),
    curb = solid('#859595'),
    iron = solid('#38454d', plates);
  const hot = glow('#ffab54'),
    white = glow('#fff2b2'),
    ice = glow('#c2edea');
  const floor = new T.MeshStandardMaterial({
    map: plates,
    vertexColors: true,
    roughness: 0.68,
    metalness: 0.21,
    side: T.DoubleSide,
  });
  const lining = new T.MeshStandardMaterial({
    map: brick,
    vertexColors: true,
    roughness: 1,
    side: T.DoubleSide,
  });
  const rock = solid('#89523d', brick),
    rockLip = solid('#775246', plates);
  const melt = moltenSteel();
  const pavers = new T.MeshStandardMaterial({
    map: brick,
    vertexColors: true,
    roughness: 0.68,
    metalness: 0.07,
  });
  const clinker = solid('#793b2b', brick);
  const rimIron = solid('#653b31', plates);
  const wash = solid('#a54b27', brick);
  wash.emissive.set('#773117');
  const unitUV = [0, 0, 1, 0, 1, 1, 0, 1];
  function strip(
    mat: Material,
    a: number,
    b: number,
    x1: number,
    x2: number,
    y1: number,
    y2: number,
    bx1 = x1,
    bx2 = x2,
    by1 = y1,
    by2 = y2,
  ) {
    quad(
      mat,
      [world(a, x1, y1), world(a, x2, y2), world(b, bx2, by2), world(b, bx1, by1)],
      [0, a / 9, 1, a / 9, 1, b / 9, 0, b / 9],
    );
  }
  for (let a = 0; a < LAP; a += 3) {
    const b = a + 3,
      wa = kilnWidth(a),
      wb = kilnWidth(b);
    const runner = (a >= 72 && a < 345) || (a >= 690 && a < 924);
    const shade = (d: number) => new T.Color('#e6b092').lerp(new T.Color('#ffcca1'), fireboxLight(d));
    const pave = (l: number, r: number, bl: number, br: number) =>
      quad(
        pavers,
        [world(a, l), world(a, r), world(b, br), world(b, bl)],
        [l * 0.5, a / 6, r * 0.5, a / 6, br * 0.5, b / 6, bl * 0.5, b / 6],
        [shade(a), shade(a), shade(b), shade(b)],
      );
    if (runner) {
      const lo = a < 345 ? 0.64 : 1.25,
        hi = 1.49;
      pave(-wa, lo, -wb, lo);
      pave(hi, wa, hi, wb);
      strip(melt.material, a, b, lo, hi, -0.42, -0.42);
      strip(wash, a, b, lo, lo, 0, -0.48);
      strip(wash, a, b, hi, hi, -0.48, 0);
      strip(rimIron, a, a + 0.42, lo, hi, 0.012, 0.012);
      for (const x of [lo, hi]) strip(rimIron, a, b, x - 0.035, x + 0.035, 0.018, 0.018);
    } else pave(-wa, wa, -wb, wb);
    for (const side of [-1, 1]) {
      strip(steel, a, b, side * wa, side * wa, 0, -0.63, side * wb, side * wb);
      strip(curb, a, b, side * (wa - 0.055), side * wa, 0.026, 0.026, side * (wb - 0.055), side * wb);
      if (a % 12 === 0) strip(ice, a, a + 1.6, side * (wa - 0.11), side * (wa - 0.07), 0.03, 0.03);
    }
  }

  // Porcelain tiles on the raised outside edge describe the bank before
  // the rider enters it. Repeated insets along the kerb give a speed cue.
  for (let d = 396; d < 540; d += 4) {
    const a = kilnWidth(d),
      b = kilnWidth(d + 4);
    strip(d % 8 ? white : steel, d, d + 4, a - 0.22, a - 0.065, 0.038, 0.038, b - 0.22, b - 0.065);
  }

  // Each shell has a full return under the suspended road; riders see
  // the circular opening, the dark outer steel and the recessed brick lining.
  const angular = 32;
  function shell(d: number, i: number, r: number) {
    const angle = (i / angular) * Math.PI * 2;
    return world(d, (Math.sin(angle) * r) / WIDTH, 2.25 + Math.cos(angle) * r * 0.92);
  }
  for (const [room, run] of firingRuns.entries()) {
    const radius = room ? 10.4 : 9.1;
    const rings = Math.ceil((run.exit - run.entry) / 4);
    for (let j = 0; j < rings; j++) {
      const a = run.entry + ((run.exit - run.entry) * j) / rings,
        b = run.entry + ((run.exit - run.entry) * (j + 1)) / rings;
      for (let i = 0; i < angular; i++) {
        // Clerestory slots on the cooling gallery let bands of blue sky in.
        if (room && j % 9 < 4 && (i < 5 || i > 27)) continue;
        const verts = [
          shell(a, i, radius),
          shell(a, i + 1, radius),
          shell(b, i + 1, radius),
          shell(b, i, radius),
        ];
        const u = i / 5,
          v = a / 12;
        const grade = (k: number, d: number) => {
          const port = (1 - Math.cos(((d - run.entry) * Math.PI) / 13)) * 0.5;
          const edge = Math.abs(Math.sin((2 * Math.PI * k) / angular));
          return new T.Color(room ? '#b4bfc8' : '#b39885').lerp(new T.Color('#ffbe82'), edge * port * 0.86);
        };
        quad(
          lining,
          verts,
          [u, v, u + 0.2, v, u + 0.2, b / 12, u, b / 12],
          [grade(i, a), grade(i + 1, a), grade(i + 1, b), grade(i, b)],
        );
      }
    }
    for (let d = run.entry; d <= run.exit; d += 13) {
      for (let i = 0; i < angular; i++) {
        const rim = radius - 0.19;
        quad(
          iron,
          [shell(d, i, rim), shell(d, i + 1, rim), shell(d + 0.58, i + 1, rim), shell(d + 0.58, i, rim)],
          unitUV,
        );
        if ((i >= 4 && i <= 9) || (i >= 22 && i <= 27)) {
          quad(
            hot,
            [
              shell(d + 0.66, i, rim),
              shell(d + 0.66, i + 1, rim),
              shell(d + 1.06, i + 1, rim),
              shell(d + 1.06, i, rim),
            ],
            unitUV,
          );
        }
      }
    }
    for (const mouth of [run.entry, run.exit]) {
      for (let i = 0; i < angular; i++) {
        quad(
          steel,
          [
            shell(mouth, i, radius - 0.28),
            shell(mouth, i + 1, radius - 0.28),
            shell(mouth, i + 1, radius + 1.4),
            shell(mouth, i, radius + 1.4),
          ],
          unitUV,
        );
        quad(
          iron,
          [
            shell(mouth - 1, i, radius + 1.4),
            shell(mouth - 1, i + 1, radius + 1.4),
            shell(mouth + 1, i + 1, radius + 1.4),
            shell(mouth + 1, i, radius + 1.4),
          ],
          unitUV,
        );
        if (i % 4 !== 0)
          quad(
            ice,
            [
              shell(mouth - 0.04, i, radius + 0.74),
              shell(mouth - 0.04, i + 0.84, radius + 0.74),
              shell(mouth - 0.04, i + 0.84, radius + 0.83),
              shell(mouth - 0.04, i, radius + 0.83),
            ],
            unitUV,
          );
      }
    }
    for (let a = run.entry; a < run.exit; a += 2) {
      const b = Math.min(a + 2, run.exit),
        x = firingLine(run, a),
        bx = firingLine(run, b);
      const tint = new T.Color('#ac6e4f');
      quad(
        floor,
        [
          world(a, x - seamHalfWidth, 0.026),
          world(a, x + seamHalfWidth, 0.026),
          world(b, bx + seamHalfWidth, 0.026),
          world(b, bx - seamHalfWidth, 0.026),
        ],
        [0, a / 12, 0.38, a / 12, 0.38, b / 12, 0, b / 12],
        [tint, tint, tint, tint],
      );
      for (const side of [-1, 1])
        strip(
          hot,
          a,
          b,
          x + side * 0.39,
          x + side * 0.415,
          0.041,
          0.041,
          bx + side * 0.39,
          bx + side * 0.415,
        );
      if ((a - run.entry) % 8 === 0) {
        for (const side of [-1, 1])
          strip(
            white,
            a,
            a + 0.8,
            x + side * 0.24,
            x + side * 0.29,
            0.048,
            0.048,
            x + side * 0.03,
            x + side * 0.08,
          );
      }
    }
  }

  // Terraced retaining cuts enclose one side of the descent. The opposite
  // edge stays open to the cold sump and the silhouette of the firing works.
  for (let a = 350; a < 688; a += 4) {
    const b = a + 4,
      ledge = (d: number) => 2.6 + 0.45 * Math.sin(d * 0.045);
    for (let step = 0; step < 4; step++) {
      const ax = ledge(a) + step * 1.45,
        bx = ledge(b) + step * 1.45;
      const h = (d: number) => -6 + step * 3 + 2 * Math.sin(d * 0.023);
      strip(rock, a, b, ax, ax + 0.18, h(a), h(a) + 2.7, bx, bx + 0.18, h(b), h(b) + 2.7);
      strip(
        rockLip,
        a,
        b,
        ax + 0.18,
        ax + 1.45,
        h(a) + 2.7,
        h(a) + 3,
        bx + 0.18,
        bx + 1.45,
        h(b) + 2.7,
        h(b) + 3,
      );
    }
    // An open tapping channel follows the raised outside of the bank. Its
    // near wall is low enough to see the metal from a seated chase camera.
    strip(melt.material, a, b, 1.74, 2.82, -0.58, -0.58);
    for (const x of [1.72, 2.85]) {
      strip(clinker, a, b, x - 0.055, x + 0.055, -0.3, -0.3);
      strip(wash, a, b, x, x, -0.3, -1.3);
    }
  }
  // A line of glazed pressure vessels beneath the chimney crowns.
  const vents = buildKilns(scene, course, brick);
  for (const d of [404, 474, 552, 604]) {
    const p = world(d, -kilnWidth(d) - 0.72, -3.6);
    vents.push(new T.Vector3(p.x, p.y, p.z));
  }
  const steamCount = vents.length * 6;
  const positions = new Float32Array(steamCount * 3);
  const alpha = new Float32Array(steamCount);
  const plume = new T.BufferGeometry();
  plume.setAttribute('position', new T.BufferAttribute(positions, 3).setUsage(T.DynamicDrawUsage));
  plume.setAttribute('opacity', new T.BufferAttribute(alpha, 1).setUsage(T.DynamicDrawUsage));
  // Each point expands and dissolves. Phase offsets avoid emitting identical
  // plumes from adjacent stacks. Fragment edges are feathered at every size.
  const steam = new T.Points(
    plume,
    new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: `attribute float opacity; varying float vOpacity;
      void main(){vOpacity=opacity;vec4 p=modelViewMatrix*vec4(position,1.);
      gl_PointSize=clamp((.8+opacity*11.)*540./max(1.,-p.z),1.,90.);gl_Position=projectionMatrix*p;}`,
      fragmentShader: `varying float vOpacity;void main(){vec2 p=gl_PointCoord-.5;
      float f=clamp(1.-dot(p,p)*4.,0.,1.);gl_FragColor=vec4(.57,.69,.73,f*f*vOpacity);
      #include <colorspace_fragment>
      }`,
    }),
  );
  steam.frustumCulled = false;
  scene.add(steam);
  // The broken clinker bed fades into the distant haze below the trestles.
  const strata = new T.PlaneGeometry(620, 540, 96, 84);
  strata.rotateX(-Math.PI / 2);
  const xyz = strata.attributes.position,
    hues = [];
  for (let i = 0; i < xyz.count; i++) {
    const x = xyz.getX(i),
      z = xyz.getZ(i),
      edge = Math.max(Math.abs(x / 310), Math.abs(z / 270));
    const ridge = Math.sin(x * 0.036) * Math.cos(z * 0.047) + 0.42 * Math.sin(x * 0.089 + z * 0.096);
    const river = 34 * Math.sin(x * 0.029) + 11 * Math.sin(x * 0.075);
    const shore = T.MathUtils.smoothstep(Math.abs(z - river) / (14 + 5 * Math.sin(x * 0.055)), 0.84, 1.8);
    xyz.setY(i, -4 + shore * (7 + Math.floor(ridge * 3) * 1.55) - 46 * Math.max(0, edge - 0.67));
    const tone = new T.Color('#271b29').lerp(new T.Color('#774132'), 0.48 + 0.29 * ridge);
    hues.push(tone.r, tone.g, tone.b, Math.min(1, Math.max(0, (1 - edge) * 7)));
  }
  strata.setAttribute('color', new T.Float32BufferAttribute(hues, 4));
  strata.computeVertexNormals();
  const basin = new T.Mesh(strata, melt.bed);
  basin.position.set(120, -34, 0);
  basin.renderOrder = -1;
  scene.add(basin);
  const girder = new T.MeshStandardMaterial({ color: '#67797b', map: plates, roughness: 0.79 });
  const ochre = new T.MeshStandardMaterial({ color: '#b9794f', map: plates, roughness: 0.8 });
  const batches = new Map<T.Material, T.Matrix4[]>();
  const up = new T.Vector3(0, 1, 0),
    dummy = new T.Object3D();
  function beam(mat: T.Material, start: Vertex, end: Vertex, w: number, thick: number) {
    const a = new T.Vector3(start.x, start.y, start.z),
      b = new T.Vector3(end.x, end.y, end.z);
    dummy.position.copy(a).lerp(b, 0.5);
    const dir = b.sub(a),
      len = dir.length();
    dummy.quaternion.setFromUnitVectors(up, dir.normalize());
    dummy.scale.set(w, len, thick);
    dummy.updateMatrix();
    if (!batches.has(mat)) batches.set(mat, []);
    batches.get(mat)!.push(dummy.matrix.clone());
  }
  for (let d = 0; d < LAP; d += 18) {
    const wide = kilnWidth(d),
      ends = [-wide, wide];
    beam(girder, world(d, ends[0], -0.69), world(d, ends[1], -0.69), 0.48, 0.52);
    for (const sign of [-1, 1]) {
      const x = sign * (wide - 0.08),
        nx = sign * (kilnWidth(d + 18) - 0.08);
      const top = world(d, x, -0.65),
        foot = { ...top, y: -46 };
      beam(girder, top, foot, 0.56, 0.57);
      beam(girder, world(d, x, -2), world(d + 18, nx, -8), 0.23, 0.26);
      beam(girder, world(d, x, -8), world(d + 18, nx, -2), 0.23, 0.26);
    }
  }
  // Riveted roller races and a painted side gantry frame each drum mouth.
  // The running lights rotate around a stationary shell; the roadway stays level.
  const rotors: T.Group[] = [];
  for (const [room, run] of firingRuns.entries()) {
    const r = room ? 10.4 : 9.1,
      mouth = run.entry - 1.35;
    const mouthPos = world(mouth, 0, 2.25),
      roll = new T.Group();
    roll.position.set(mouthPos.x, mouthPos.y, mouthPos.z);
    roll.rotation.set(0, -mouthPos.yaw, mouthPos.bank, 'YXZ');
    scene.add(roll);
    const cog = new T.Group();
    roll.add(cog);
    rotors.push(cog);
    const race = new T.Mesh(new T.TorusGeometry(r + 0.4, 0.39, 6, 48), ochre);
    cog.add(race);
    const bolts = new T.InstancedMesh(new T.BoxGeometry(0.59, 1.05, 0.86), girder, 32);
    const pilotLamps = new T.InstancedMesh(new T.BoxGeometry(0.16, 0.47, 0.05), hot, 16);
    for (let i = 0; i < 32; i++) {
      const angle = (i * Math.PI) / 16;
      dummy.position.set(Math.sin(angle) * (r + 0.45), Math.cos(angle) * (r + 0.45), 0);
      dummy.rotation.set(0, 0, -angle);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      bolts.setMatrixAt(i, dummy.matrix);
      if (i % 2 === 0) {
        dummy.position.z = 0.46;
        dummy.updateMatrix();
        pilotLamps.setMatrixAt(i / 2, dummy.matrix);
      }
    }
    cog.add(bolts, pilotLamps);
    const label = document.createElement('canvas');
    label.width = 512;
    label.height = 256;
    const g = label.getContext('2d')!;
    g.fillStyle = '#becac1';
    g.fillRect(0, 0, 512, 256);
    g.fillStyle = '#22333b';
    g.fillRect(7, 7, 498, 242);
    g.fillStyle = '#e2ab71';
    g.fillRect(20, 24, 15, 205);
    g.fillStyle = '#eed7ad';
    g.font = 'bold 34px sans-serif';
    g.fillText(room ? 'ANNEALING' : 'FIRING DRUM', 52, 68);
    g.font = 'bold 158px sans-serif';
    g.fillText(room ? '02' : '01', 46, 214);
    g.fillStyle = '#b4c9c4';
    for (let k = 0; k < 6; k++) g.fillRect(340 + k * 20, 186, 6, 37);
    const paint = new T.CanvasTexture(label);
    paint.colorSpace = T.SRGBColorSpace;
    const sign = new T.Mesh(new T.PlaneGeometry(5.3, 2.65), new T.MeshBasicMaterial({ map: paint }));
    const at = world(mouth - 1, -2.38, 5.2);
    sign.position.set(at.x, at.y, at.z);
    sign.rotation.set(0, -at.yaw, at.bank, 'YXZ');
    scene.add(sign);
    for (const x of [-2.85, -1.9]) beam(ochre, world(mouth, x, -24), world(mouth, x, 6.85), 0.42, 0.52);
    for (let k = 0; k < 4; k++)
      beam(girder, world(mouth, -2.85, 5.8 - k * 3.4), world(mouth, -1.9, 2.4 - k * 3.4), 0.26, 0.24);
  }
  // A refractory-lined spout carries the melt above the outer launder.
  // The curtain tapers toward the foot, where it meets the current.
  const cupola = new T.LatheGeometry(
    [
      [2.4, -4],
      [2.8, -1],
      [2.9, 1],
      [2.9, 5.1],
      [2.6, 5.5],
      [1.55, 6.9],
      [1.53, 9.7],
      [1.8, 9.8],
      [1.8, 10.2],
      [1.35, 10.2],
    ].map(([r, y]) => new T.Vector2(r, y)),
    20,
  );
  const collar = new T.CylinderGeometry(3, 3, 0.24, 20);
  for (const d of [431, 493]) {
    const near = 2.34,
      far = 4.25,
      top = 4.5;
    const source = world(d, far + 0.48, top);
    const furnace = new T.Mesh(cupola, clinker);
    furnace.position.set(source.x, source.y, source.z);
    scene.add(furnace);
    for (const height of [-0.7, 2.8, 5.1]) {
      const ring = new T.Mesh(collar, iron);
      ring.position.copy(furnace.position);
      ring.position.y += height;
      scene.add(ring);
    }
    const sheet = (
      mat: Material,
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      w1: number,
      w2: number,
      v0: number,
      v1: number,
    ) =>
      quad(
        mat,
        [world(d - w1, x1, y1), world(d + w1, x1, y1), world(d + w2, x2, y2), world(d - w2, x2, y2)],
        [0, v0, 1, v0, 1, v1, 0, v1],
      );
    sheet(clinker, far, top - 0.32, near + 0.09, top - 0.48, 1.35, 1.22, 0, 1);
    sheet(melt.material, far, top, near, top - 0.18, 0.95, 0.91, 0, 1);
    for (const sign of [-1, 1]) {
      beam(
        ochre,
        world(d + sign * 1.12, far, top + 0.1),
        world(d + sign * 1.12, near, top - 0.09),
        0.29,
        0.35,
      );
      beam(girder, world(d + sign * 1.14, far, -9), world(d + sign * 1.14, far, top - 0.25), 0.48, 0.52);
    }
    sheet(melt.material, near, top - 0.18, near - 0.11, top - 0.77, 0.91, 0.85, 1, 1.15);
    sheet(melt.material, near - 0.11, top - 0.77, near - 0.19, -0.57, 0.85, 0.66, 1.15, 2.5);
  }
  const bounce = new T.PointLight('#ff893d', 0, 20);
  scene.add(bounce);
  const cubes = new T.BoxGeometry();
  for (const [mat, transforms] of batches) {
    const mesh = new T.InstancedMesh(cubes, mat, transforms.length);
    transforms.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  for (const [mat, data] of panels) {
    const geom = new T.BufferGeometry();
    geom.setAttribute('position', new T.Float32BufferAttribute(data.pos, 3));
    geom.setAttribute('uv', new T.Float32BufferAttribute(data.uv, 2));
    if (data.colors.length) geom.setAttribute('color', new T.Float32BufferAttribute(data.colors, 3));
    geom.computeVertexNormals();
    const mesh = new T.Mesh(geom, mat);
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  const capsule = new T.LatheGeometry(
    [
      [-0.43, 0.26],
      [-0.34, 0.4],
      [0.24, 0.4],
      [0.43, 0.22],
    ].map(([y, x]) => new T.Vector2(x, y)),
    12,
  );
  const caps = new T.CylinderGeometry(0.33, 0.33, 0.12, 12);
  const band = new T.TorusGeometry(0.41, 0.045, 5, 16);
  const cells = pressureCells.map(({ at, x }) => {
    const p = world(at, x, 0.92),
      group = new T.Group();
    group.add(new T.Mesh(capsule, steel));
    for (const y of [-0.32, 0, 0.23]) {
      const lamp = new T.Mesh(band, ice);
      lamp.position.y = y;
      lamp.rotation.x = Math.PI / 2;
      group.add(lamp);
    }
    const lid = new T.Mesh(caps, curb);
    lid.position.y = 0.42;
    group.add(lid);
    group.position.set(p.x, p.y, p.z);
    scene.add(group);
    return { group, at, y: p.y };
  });
  return (time: number, at: number) => {
    melt.clock.value = time;
    const d = at % LAP;
    const spill = T.MathUtils.smoothstep(d, 350, 378) * (1 - T.MathUtils.smoothstep(d, 654, 688));
    const heat = Math.max(fireboxLight(d), spill);
    bounce.intensity = heat * 55;
    if (heat > 0) {
      const p = world(d + 2, spill > 0 ? 2.12 : 1.36, 0.8);
      bounce.position.set(p.x, p.y, p.z);
    }
    for (let i = 0; i < steamCount; i++) {
      const v = vents[Math.floor(i / 6)],
        t = (time * 0.12 + i / 6 + 0.31 * Math.floor(i / 6)) % 1;
      const drift = t * t * 5,
        phase = i * 2.4 + t * 3;
      positions[3 * i] = v.x + drift + Math.sin(phase) * t;
      positions[3 * i + 1] = v.y + t * 9;
      positions[3 * i + 2] = v.z + 0.4 * drift + Math.cos(phase) * t;
      alpha[i] = Math.sin(t * Math.PI) * 0.23;
    }
    plume.attributes.position.needsUpdate = true;
    plume.attributes.opacity.needsUpdate = true;
    rotors.forEach((cog, i) => {
      cog.rotation.z = time * (i ? -0.23 : 0.18);
    });
    for (const cell of cells) {
      cell.group.visible = at % LAP < cell.at;
      cell.group.position.y = cell.y + 0.14 * Math.sin(time * 2.8 + cell.at);
      cell.group.rotation.z = 0.22 * Math.sin(time * 1.3);
    }
  };
}
