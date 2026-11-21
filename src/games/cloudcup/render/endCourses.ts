import * as T from 'three';
import { courses, LAP, WIDTH, winchCut, type Course } from '../sim/track';
import { valley, saddle } from '../sim/pass';

export function buildEndCourse(root: T.Group, bowl: boolean, roadTexture: T.Texture) {
  const course = courses[bowl ? 3 : 4],
    width = bowl ? 2.3 : 1.43;
  const mat = (c: string) => new T.MeshStandardMaterial({ color: c, roughness: 0.79 });
  const turf = mat('#765736'),
    timber = mat('#49352d'),
    iron = mat('#454747'),
    green = mat('#244c43'),
    red = mat('#aa452c'),
    cream = mat('#efcf9c');
  const lamp = new T.MeshBasicMaterial({ color: '#ffdfa7' });
  const cube = new T.BoxGeometry(),
    cone = new T.ConeGeometry(1, 1, 7);
  const batches = new Map<T.Material, Map<T.BufferGeometry, T.Matrix4[]>>();
  const dummy = new T.Object3D();
  function piece(
    m: T.Material,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    l: number,
    yaw = 0,
    roll = 0,
    g: T.BufferGeometry = cube,
  ) {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, yaw, roll, 'YXZ');
    dummy.scale.set(w, h, l);
    dummy.updateMatrix();
    if (!batches.has(m)) batches.set(m, new Map());
    const byGeo = batches.get(m)!;
    if (!byGeo.has(g)) byGeo.set(g, []);
    byGeo.get(g)!.push(dummy.matrix.clone());
  }
  function at(m: T.Material, d: number, x: number, y: number, w: number, h: number, l: number, roll = 0) {
    const p = course.world(d, x, y);
    piece(m, p.x, p.y, p.z, w, h, l, -p.yaw, roll);
  }
  roadTexture.wrapS = roadTexture.wrapT = T.RepeatWrapping;
  roadTexture.colorSpace = T.SRGBColorSpace;
  const surface = new T.MeshStandardMaterial({
    map: roadTexture,
    color: bowl ? '#ce825e' : '#a09987',
    roughness: 0.94,
  });
  function ribbon(c: Course, a: number, b: number, lo: number, hi: number, y: number, m: T.Material) {
    const pos: number[] = [],
      uv: number[] = [],
      ix: number[] = [];
    const n = Math.ceil((b - a) / 1.6);
    for (let i = 0; i <= n; i++) {
      const d = a + ((b - a) * i) / n;
      for (const side of [lo, hi]) {
        const p = c.world(d, side, y);
        pos.push(p.x, p.y, p.z);
        uv.push((side * WIDTH) / 6, d / 6);
      }
      if (i < n) {
        const k = i * 2;
        ix.push(k, k + 1, k + 3, k, k + 3, k + 2);
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(ix);
    g.computeVertexNormals();
    const mesh = new T.Mesh(g, m);
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  function road(c: Course, a: number, b: number, lift: number, w: number) {
    ribbon(c, a, b, -w, w, lift, surface);
    for (const sign of [-1, 1]) {
      const edge = sign * (bowl ? 1.65 : w - 0.08);
      ribbon(c, a, b, edge - 0.027, edge + 0.027, lift + 0.027, cream);
    }
  }
  road(course, 0, LAP, 0, width);
  const moving = new T.Group(),
    car = new T.Group();
  root.add(moving, car);
  function part(parent: T.Object3D, g: T.BufferGeometry, m: T.Material, x: number, y: number, z: number) {
    const mesh = new T.Mesh(g, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function sign(text: string, distance: number, side: number, height: number, width: number, color: string) {
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 128;
    const g = canvas.getContext('2d')!;
    g.fillStyle = color;
    g.fillRect(0, 0, 768, 128);
    g.strokeStyle = '#ead0a2';
    g.lineWidth = 5;
    g.strokeRect(7, 7, 754, 114);
    g.font = 'italic 850 70px system-ui';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffe8b8';
    g.fillText(text, 384, 64, 716);
    const map = new T.CanvasTexture(canvas);
    map.colorSpace = T.SRGBColorSpace;
    const p = course.world(distance, side, height);
    const board = part(
      root,
      new T.PlaneGeometry(width, width / 6),
      new T.MeshStandardMaterial({ map, side: T.DoubleSide }),
      p.x,
      p.y,
      p.z,
    );
    board.rotation.y = -p.yaw;
  }
  const crowd = ['#6e493b', '#c68e50', '#364c50', '#bc5e39', '#ded0a6'].map(mat);
  if (bowl) {
    piece(turf, 115, -0.5, 0, 350, 0.4, 210);
    const shoulder = new T.MeshStandardMaterial({ map: roadTexture, color: '#a97f61', roughness: 1 });
    ribbon(course, 0, LAP, -width, -1.65, 0.012, shoulder);
    ribbon(course, 0, LAP, 1.65, width, 0.012, shoulder);
    const helmet = new T.SphereGeometry(0.5, 7, 5),
      jacket = new T.CylinderGeometry(0.45, 0.34, 1, 6);
    const rubber = mat('#3a3937'),
      tyre = new T.TorusGeometry(0.54, 0.21, 6, 12);
    tyre.rotateX(Math.PI / 2);
    for (let d = 6; d < LAP; d += 6) {
      const p = course.world(d, 2.65, 0);
      for (let i = 0; i < (d % 30 ? 2 : 3); i++)
        piece(i === 2 ? cream : rubber, p.x, p.y + 0.17 + i * 0.33, p.z, 1.4, 1, 1.4, 0, 0, tyre);
    }
    sign('CINDER BOWL', 48, -3.85, 6.2, 9, '#564534');
    sign('LAST BEND', 903, -3.85, 6.2, 8, '#29483e');
    // Pitched bleacher rows and canvas awnings. Sections alternate with
    // access aisles, so the infield is visible through the uprights.
    for (let d = 0; d < LAP; d += 12) {
      at(cream, d, -2.48, 0.53, 0.45, 1.06, 5.95);
      if (d % 108 < 84) {
        for (let row = 0; row < 4; row++) {
          const x = -3.2 - row * 0.34,
            h = 0.9 + row * 0.75;
          at(green, d, x, h, 1.65, 0.42, 5.8);
          for (let j = 0; j < 5; j++) {
            const p = course.world(d + (j - 2) * 1.8, x, h + 0.56);
            piece(crowd[(d + row + j * 3) % 5], p.x, p.y, p.z, 0.82, 0.84, 0.64, -p.yaw, 0, jacket);
            piece(crowd[(d + row * 3 + j + 1) % 5], p.x, p.y + 0.62, p.z, 0.44, 0.52, 0.43, 0, 0, helmet);
          }
        }
        at(timber, d, -4.5, 3.8, 0.2, 7.6, 0.24);
        at(d % 24 ? green : cream, d, -3.95, 7.3, 5.9, 0.24, 6.2, -0.13);
      }
      if (d % 84 === 0) {
        at(iron, d, -2.9, 6, 0.23, 12, 0.28);
        at(iron, d, -2.9, 12, 3.1, 0.82, 0.52);
        at(lamp, d, -2.86, 12.1, 2.78, 0.52, 0.58);
      }
    }
    // A stripped taxi on the gantry, with open windows and bare hubs.
    const p = course.world(65, 5.5, 8.6);
    moving.position.set(p.x, p.y, p.z);
    const taxi = mat('#d3a22d');
    part(moving, new T.BoxGeometry(2.9, 0.95, 6.4), taxi, 0, 0, 0);
    part(moving, new T.BoxGeometry(2.7, 0.18, 2.9), taxi, 0, 1.7, -0.25);
    for (const x of [-1.22, 1.22])
      for (const z of [-1.51, 1.06]) {
        part(moving, new T.BoxGeometry(0.17, 1.5, 0.21), iron, x, 1, z);
        part(moving, new T.CylinderGeometry(0.48, 0.48, 0.28, 12), timber, x, -0.4, z * 1.5).rotation.z =
          Math.PI / 2;
      }
    part(moving, new T.CylinderGeometry(0.065, 0.065, 8), iron, 0, 5.4, 0);
    for (const x of [-9, 9]) piece(iron, p.x + x, 8.8, p.z, 0.65, 17.6, 0.65);
    piece(green, p.x, 17.25, p.z, 19, 1.25, 1.1);
  } else {
    road(winchCut, valley, saddle, 0.035, width);
    sign('‹ CARRIAGE   /   CUT ›', valley - 13, 0, 5.7, 11.6, '#354947');
    at(timber, valley - 13, -1.53, 2.85, 0.36, 5.7, 0.36);
    at(timber, valley - 13, 1.53, 2.85, 0.36, 5.7, 0.36);
    sign('CABLEHEAD', saddle + 16, -2.5, 5.9, 6, '#834c3d');
    // A suspended passenger car shares the climb's skyline with the racers.
    const low = new T.Vector3(13, 9, 190),
      high = new T.Vector3(13, 24, 190 - (saddle - valley));
    const wire = part(
      root,
      new T.CylinderGeometry(0.085, 0.085, low.distanceTo(high), 6),
      iron,
      13,
      16.5,
      (low.z + high.z) / 2,
    );
    wire.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), high.clone().sub(low).normalize());
    for (const v of [low, high]) {
      piece(timber, v.x + 2, v.y - 6, v.z, 0.55, 12, 0.55);
      piece(iron, v.x + 1, v.y, v.z, 3.5, 0.28, 0.36);
    }
    part(car, new T.BoxGeometry(0.2, 1.4, 0.22), iron, 0, -0.6, 0);
    part(car, new T.BoxGeometry(2.7, 0.24, 4.6), cream, 0, -1.35, 0);
    part(car, new T.BoxGeometry(2.4, 1.1, 4.3), red, 0, -3, 0);
    for (const x of [-1.12, 1.12])
      for (const z of [-1.97, 0, 1.97]) part(car, new T.BoxGeometry(0.13, 1.15, 0.13), iron, x, -1.94, z);
    car.position.copy(high);
    const rock = mat('#545e65'),
      pine = mat('#344e47');
    for (const c of [course, winchCut]) {
      const start = c === course ? 0 : valley,
        end = c === course ? LAP : saddle;
      for (let d = start; d < end; d += 7) {
        const p = c.world(d, 0, -0.43);
        piece(timber, p.x, p.y, p.z, WIDTH * width * 2 + 0.6, 0.75, 1.15, -p.yaw);
        for (const sign of [-1, 1]) {
          const e = c.world(d, sign * (width - 0.07), -0.68);
          piece(iron, e.x, e.y, e.z, 0.32, 1.1, 7.9, -e.yaw);
          if ((d - start) % 28 === 0) piece(timber, e.x, e.y - 13, e.z, 0.48, 26, 0.48);
        }
      }
    }
    // A glacial stream cuts a dark seam under the trestles. The valley rises
    // with the road, with fractured ledges on either bank and bare high ground.
    const riverX = (z: number) => -28 + 23 * Math.sin(z * 0.016);
    function bed(x: number, z: number) {
      const bank = Math.min(1, Math.abs(x - riverX(z)) / 30);
      const ridge =
        Math.cos(x * 0.072 + z * 0.03) * Math.sin(z * 0.082) + 0.7 * Math.sin(x * 0.14 - z * 0.066);
      return Math.max(0, Math.min(15, (190 - z) * 0.04)) - 15 + 6 * bank + 2.6 * ridge * bank;
    }
    const ground = new T.PlaneGeometry(600, 760, 90, 114);
    ground.rotateX(-Math.PI / 2);
    const pos = ground.attributes.position,
      colors: number[] = [];
    const shale = new T.Color('#665f56'),
      grass = new T.Color('#536348'),
      stream = new T.Color('#638b97'),
      shade = new T.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        z = pos.getZ(i),
        h = bed(x, z);
      pos.setY(i, h);
      shade
        .copy(shale)
        .lerp(grass, 0.5 + 0.45 * Math.sin(x * 0.088 + z * 0.057))
        .lerp(stream, Math.max(0, 1 - Math.abs(x - riverX(z)) / 9))
        .multiplyScalar(0.78 + 0.18 * Math.cos(h * 0.8 + z * 0.11));
      colors.push(shade.r, shade.g, shade.b);
    }
    ground.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    ground.computeVertexNormals();
    root.add(new T.Mesh(ground, new T.MeshStandardMaterial({ vertexColors: true, flatShading: true })));
    const slab = new T.IcosahedronGeometry(1, 0);
    for (let i = 0; i < 1190; i++) {
      const x = 225 * Math.sin(i * 17.21) * Math.cos(i * 0.37),
        z = 310 * Math.sin(i * 4.18);
      const y = bed(x, z),
        h = 5 + 7 * Math.sin(i * 39.1) ** 2;
      if (i % 4 === 0) {
        piece(rock, x, y, z, h * 0.52, 2.9, h * 0.84, i * 0.26, 0.17, slab);
        continue;
      }
      // The deck runs on tall bents. Keep tree crowns below it near a road.
      const routeDistance = valley + 190 - z;
      const nearby =
        Math.abs(x) < 17 ||
        (x > 70 && x < 115) ||
        Math.abs(x - course.track(routeDistance).x) < 14 ||
        Math.abs(z) > 188;
      const size = nearby ? h * 0.42 : h;
      piece(timber, x, y + size * 0.27, z, 0.45, size * 0.55, 0.45);
      for (let j = 0; j < 3; j++)
        piece(
          pine,
          x,
          y + size * (0.43 + j * 0.19),
          z,
          size * (0.32 - j * 0.065),
          size * (0.77 - j * 0.13),
          size * (0.32 - j * 0.065),
          0,
          0,
          cone,
        );
    }
    const p = course.world(saddle + 12, -3.1, 0);
    for (const x of [-4, 4])
      for (const z of [-5, 5]) piece(timber, p.x + x, p.y + 3.4, p.z + z, 0.65, 8, 0.65);
    piece(red, p.x, p.y + 7.8, p.z, 10, 1.25, 12);
    moving.position.set(p.x + 1.2, p.y + 3.6, p.z);
    part(moving, new T.TorusGeometry(3.7, 0.37, 8, 40), red, 0, 0, 0);
    for (let i = 0; i < 6; i++)
      part(moving, new T.BoxGeometry(0.19, 7.2, 0.38), red, 0, 0, 0).rotation.z = (i * Math.PI) / 6;
    part(moving, new T.CylinderGeometry(0.62, 0.62, 1.4, 12), iron, 0, 0, 0).rotation.x = Math.PI / 2;
  }
  for (const [m, byGeo] of batches)
    for (const [g, list] of byGeo) {
      const mesh = new T.InstancedMesh(g, m, list.length);
      list.forEach((v, i) => mesh.setMatrixAt(i, v));
      mesh.receiveShadow = true;
      root.add(mesh);
    }
  return (time: number, at: number, state: { laps: number }) => {
    if (bowl) {
      moving.rotation.y = 0.55 + time * 0.21;
      moving.rotation.z = 0.08;
    } else {
      moving.rotation.z = time * 0.65;
      const journey = Math.max(0, Math.min(1, (at - (state.laps - 1) * LAP - saddle) / (LAP - saddle)));
      car.position.set(13, 24 - 15 * journey, 190 - (saddle - valley) * (1 - journey));
    }
  };
}
