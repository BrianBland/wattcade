import * as T from 'three';
import { courses, LAP, WIDTH, winchCut, type Course } from '../sim/track';
import { bowlField } from './bowlField';
import { addPassCrags } from './passCrags';
import { valley, saddle } from '../sim/pass';

import type { ArtName, VenueArt } from './venueTextures';
export function buildEndCourse(root: T.Group, bowl: boolean, art: VenueArt) {
  const roadTexture = art(bowl ? 'cinder-dirt' : 'bridge-ties');
  const course = courses[bowl ? 3 : 4],
    width = bowl ? 2.3 : 1.43;
  const mat = (c: string) => new T.MeshStandardMaterial({ color: c, roughness: 0.79 });
  const timber = mat('#49352d'),
    iron = mat('#454747'),
    green = mat('#244c43'),
    red = mat('#aa452c'),
    cream = mat('#efcf9c');
  const lamp = new T.MeshBasicMaterial({ color: '#ffdfa7' });
  const cube = new T.BoxGeometry(),
    rod = new T.CylinderGeometry(0.5, 0.5, 1, 8);
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
    instance(m, g, dummy.matrix);
  }
  function instance(m: T.Material, g: T.BufferGeometry, matrix: T.Matrix4) {
    if (!batches.has(m)) batches.set(m, new Map());
    const byGeo = batches.get(m)!;
    if (!byGeo.has(g)) byGeo.set(g, []);
    byGeo.get(g)!.push(matrix.clone());
  }
  function at(m: T.Material, d: number, x: number, y: number, w: number, h: number, l: number, roll = 0) {
    const p = course.world(d, x, y);
    piece(m, p.x, p.y, p.z, w, h, l, -p.yaw, roll);
  }
  const vertical = new T.Vector3(0, 1, 0);
  function beam(m: T.Material, a: T.Vector3, b: T.Vector3, w: number, depth = w, g: T.BufferGeometry = cube) {
    const dir = new T.Vector3().subVectors(b, a);
    dummy.position.copy(a).addScaledVector(dir, 0.5);
    dummy.scale.set(w, dir.length(), depth);
    dummy.quaternion.setFromUnitVectors(vertical, dir.normalize());
    dummy.updateMatrix();
    instance(m, g, dummy.matrix);
  }
  function point(d: number, x: number, y: number) {
    const p = course.world(d, x, y);
    return new T.Vector3(p.x, p.y, p.z);
  }
  const siding = new T.MeshStandardMaterial({
    map: art(bowl ? 'yard-siding' : 'mill-siding'),
    roughness: 0.78,
    metalness: 0.22,
  });
  const rim = mat('#aa8a65');
  roadTexture.wrapS = roadTexture.wrapT = T.RepeatWrapping;
  roadTexture.colorSpace = T.SRGBColorSpace;
  const surface = new T.MeshStandardMaterial({
    map: roadTexture,
    color: bowl ? '#d8bc9f' : '#e0d5c2',
    roughness: 0.94,
  });
  function ribbon(
    c: Course,
    a: number,
    b: number,
    lo: number,
    hi: number,
    y: number,
    m: T.Material,
    visible?: (d: number) => boolean,
  ) {
    const pos: number[] = [],
      uv: number[] = [],
      ix: number[] = [];
    const n = Math.ceil((b - a) / 1.6);
    for (let i = 0; i <= n; i++) {
      const d = a + ((b - a) * i) / n;
      for (const side of [lo, hi]) {
        const p = c.world(d, side, y);
        pos.push(p.x, p.y, p.z);
        uv.push((side * WIDTH) / (bowl ? 6 : 7), d / (bowl ? 12 : 4));
      }
      if (i < n && (!visible || visible(d + (b - a) / (2 * n)))) {
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
  const climbSamples = (route: Course) =>
    Array.from({ length: saddle - valley + 1 }, (_, i) => route.track(valley + i));
  const carriage = bowl ? [] : climbSamples(course),
    cut = bowl ? [] : climbSamples(winchCut);
  function road(c: Course, a: number, b: number, lift: number, w: number) {
    ribbon(c, a, b, -w, w, lift, surface);
    for (const sign of [-1, 1]) {
      const edge = sign * (bowl ? 1.65 : w - 0.08);
      // At the fork paint only the exposed shoulder. An interior edge stripe
      // crossing the other road reads as a barrier on approach to the merge.
      const inner = !bowl && (c === winchCut ? sign < 0 : sign > 0);
      const other = c === winchCut ? carriage : cut;
      const exposed = (d: number) => {
        if (d < valley || d > saddle) return true;
        const p = c.world(d, edge);
        return !other.some((q) => (p.x - q.x) ** 2 + (p.z - q.z) ** 2 < (w * WIDTH) ** 2);
      };
      ribbon(c, a, b, edge - 0.027, edge + 0.027, lift + 0.027, cream, inner ? exposed : undefined);
    }
  }
  road(course, 0, LAP, 0, width);
  const moving = new T.Group(),
    car = new T.Group();
  root.add(moving, car);
  const pennants: T.Mesh[] = [];
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
  function illustratedSign(d: number, side: number, height: number, w: number, h: number) {
    const p = point(d, side, height),
      yaw = course.track(d).yaw;
    // The backing and return lip are visible when the rider looks back from the far bend.
    piece(iron, p.x, p.y, p.z, w + 0.34, h + 0.34, 0.62, -yaw);
    const panel = part(
      root,
      new T.PlaneGeometry(w, h),
      new T.MeshStandardMaterial({
        map: art(bowl ? 'bowl-sign' : 'pass-sign'),
        roughness: 0.78,
        emissiveMap: art(bowl ? 'bowl-sign' : 'pass-sign'),
        emissive: 0xffffff,
        emissiveIntensity: 0.16,
      }),
      p.x - Math.sin(yaw) * 0.34,
      p.y,
      p.z + Math.cos(yaw) * 0.34,
    );
    panel.rotation.y = -yaw;
  }
  const plane = new T.PlaneGeometry();
  function frontage(name: ArtName) {
    return new T.MeshStandardMaterial({
      map: art(name),
      roughness: 0.84,
      emissiveMap: art(name),
      emissive: 0xffffff,
      emissiveIntensity: 0.2,
    });
  }
  const cableLow = new T.Vector3(14, 10, 190),
    cableHigh = new T.Vector3(-16, 29, 190 - (saddle - valley) - 8);
  if (bowl) {
    const cloth = [mat('#b64c36'), mat('#ead2a3')];
    cloth.forEach((m) => (m.side = T.DoubleSide));
    const flag = new T.BufferGeometry();
    flag.setAttribute(
      'position',
      new T.Float32BufferAttribute(
        [
          0, 1.8, 0, 1.15, 1.55, 0.26, 0, 0.77, 0, 0, 0.77, 0, 1.15, 1.55, 0.26, 1.15, 1.04, 0.3, 1.15, 1.04,
          0.3, 1.15, 1.55, 0.26, 2.72, 1.32, -0.08,
        ],
        3,
      ),
    );
    flag.computeVertexNormals();
    bowlField(root, course, width, art('grit'));
    // The old gas holder is hollow. The three rings and missing bays read from
    // the opposite stands while the open frame gives glimpses of the sky.
    const columns = 14;
    const ring = (i: number, h: number) => {
      const a = (2 * Math.PI * i) / columns;
      return new T.Vector3(107 + 26 * Math.cos(a), h, 2 + 26 * Math.sin(a));
    };
    for (let i = 0; i < columns; i++) {
      beam(iron, ring(i, -2), ring(i, 26), 0.75);
      for (const h of [3, 13, 24.5]) {
        beam(h === 13 ? red : iron, ring(i, h), ring(i + 1, h), 0.53);
        beam(rim, ring(i, h + 1.1), ring(i + 1, h + 1.1), 0.2);
      }
      if (i % 7 !== 3) {
        beam(iron, ring(i, 3), ring(i + 1, 13), 0.28);
        beam(iron, ring(i, 13), ring(i + 1, 24.5), 0.28);
        beam(rim, ring(i, 24.5), ring(i + 1, 13), 0.18);
      }
    }
    const shoulder = new T.MeshStandardMaterial({ map: roadTexture, color: '#cfc1a2', roughness: 1 });
    ribbon(course, 0, LAP, -width, -1.65, 0.012, shoulder);
    ribbon(course, 0, LAP, 1.65, width, 0.012, shoulder);
    const bleachers = frontage('bleachers'),
      garage = frontage('pit-garage');
    const tiers = [0, 1, 2].map((row) => {
      const g = new T.PlaneGeometry(),
        uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setY(i, (row + uv.getY(i)) / 3);
      return g;
    });
    // Open pit bays on the quiet side of the oval give the back straight its
    // own landmark. A deep roof, threshold and bollards frame the painted interiors.
    for (const d of [287, 747, 777]) {
      const p = point(d, -4.95, 3.1),
        yaw = -course.track(d).yaw + 0.8;
      const right = new T.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      const front = new T.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      const centre = p.clone().addScaledVector(front, -2.5);
      piece(siding, centre.x, centre.y, centre.z, 10.5, 6.2, 5, yaw);
      piece(garage, p.x + 0.05 * front.x, p.y, p.z + 0.05 * front.z, 10.25, 6.05, 1, yaw, 0, plane);
      piece(siding, centre.x, centre.y + 3.27, centre.z, 11.3, 0.45, 7.8, yaw);
      for (const n of [-1, 1]) {
        const post = p
          .clone()
          .addScaledVector(right, 5.2 * n)
          .addScaledVector(front, 1.45);
        beam(
          iron,
          post.clone().addScaledVector(vertical, -3.1),
          post.clone().addScaledVector(vertical, 3.3),
          0.22,
        );
      }
    }
    const rubber = mat('#3a3937'),
      tyre = new T.TorusGeometry(0.54, 0.21, 6, 12);
    tyre.rotateX(Math.PI / 2);
    for (let d = 6; d < LAP; d += 6) {
      if ((d > 190 && d < 377) || (d > 665 && d < 829)) continue;
      const p = course.world(d, 2.65, 0);
      for (let i = 0; i < (d % 30 ? 2 : 3); i++)
        piece(i === 2 ? cream : rubber, p.x, p.y + 0.17 + i * 0.33, p.z, 1.4, 1, 1.4, 0, 0, tyre);
    }
    // A reused finishing gantry carries a hand-painted derby fascia.
    const finish = 6;
    for (const side of [-1, 1]) {
      const x = 2.62 * side;
      for (const delta of [-2, 2])
        beam(iron, point(finish + delta, x, 0), point(finish + delta, x, 10.8), 0.36);
      for (let y = 0; y < 10; y += 2.5) {
        beam(rim, point(finish - 2, x, y), point(finish + 2, x, y + 2.5), 0.17);
        beam(iron, point(finish + 2, x, y), point(finish - 2, x, y + 2.5), 0.18);
      }
    }
    for (const y of [7.2, 9.1]) beam(iron, point(finish, -2.65, y), point(finish, 2.65, y), 0.38);
    for (let j = 0; j < 12; j++)
      beam(
        rim,
        point(finish, -2.65 + (5.3 * j) / 12, 7.2),
        point(finish, -2.65 + (5.3 * (j + 1)) / 12, 9.1),
        0.18,
      );
    illustratedSign(finish, 0, 10.2, 11.2, 6.4);
    // The press box and its illuminated windows hang above the home straight.
    for (const d of [996, 1008, 1020]) {
      at(siding, d, -4.3, 7.4, 3.6, 3.3, 6.5);
      at(cream, d, -4.3, 9.2, 4.1, 0.18, 6.8);
      at(iron, d, -3.9, 7.8, 0.2, 1.45, 5.8);
      for (const dd of [-3, 0, 3]) at(lamp, d + dd, -3.86, 7.82, 0.11, 0.81, 1.42);
    }
    // Crushed saloons stacked in the paddock. Alternating crushed roofs,
    // exposed steel ribs and faded team colours break up the infield skyline.
    const scrapyard = [mat('#b78a40'), mat('#46675e'), mat('#80463c'), mat('#789096')];
    for (const [d, side] of [
      [128, 5.6],
      [307, 4.9],
      [575, 5.1],
      [862, 4.8],
    ]) {
      for (let j = 0; j < 15; j++) {
        const level = Math.floor(j / 5),
          bay = j % 5;
        if (level === 2 && bay % 2 === 0) continue;
        const p = point(d + bay * 8, side + level * 0.22, 0.5 + level * 1.05);
        const yaw = -course.track(d).yaw + Math.sin(j * 17) * 0.16,
          skin = scrapyard[(j + Math.floor(d)) % 4];
        piece(skin, p.x, p.y, p.z, 2.6, 0.64, 4.8, yaw, 0.04 * Math.sin(j));
        piece(iron, p.x, p.y + 0.49, p.z, 2.2, 0.41, 2.9, yaw);
        piece(skin, p.x, p.y + 0.73, p.z, 2.38, 0.15, 3.1, yaw);
      }
    }
    illustratedSign(141, 4.05, 5.2, 9.4, 5.5);
    for (const x of [3.35, 4.75]) at(iron, 141, x, 2, 0.3, 4, 0.32);

    sign('LAST BEND', 903, -3.85, 6.2, 8, '#29483e');
    // Pitched bleacher rows and canvas awnings. Sections alternate with
    // access aisles, so the infield is visible through the uprights.
    for (let d = 0; d < LAP; d += 12) {
      at(cream, d, -2.48, 0.53, 0.45, 1.06, 5.95);
      const home = d < 184 || d > 850,
        back = d >= 402 && d < 658;
      if ((home || back) && d % 144 < 132) {
        for (const [row, geometry] of tiers.entries()) {
          const p = point(d, -3.34 - row * 0.32, 1.4 + row * 1.44);
          piece(bleachers, p.x, p.y, p.z, 6.8, 1.57, 1, -course.track(d).yaw + Math.PI / 2, 0, geometry);
          at(green, d, -3.51 - row * 0.32, 0.61 + 1.44 * row, 1.9, 0.14, 6.8);
        }
        at(green, d, -3.38, 0.54, 1.9, 0.64, 6.5);
        for (const y of [0.85, 1.65]) at(iron, d, -3.17, y, 0.09, 0.09, 6.48);
        at(timber, d, -4.5, 3.8, 0.2, 7.6, 0.24);
        at(siding, d, -3.95, 7.3, 6.2, 0.26, 6.75, -0.13);
        at(d % 36 ? green : cream, d, -3.3, 6.79, 0.14, 0.62, 6.72);
        beam(iron, point(d, -4.5, 4.2), point(d, -3.33, 6.96), 0.16);
        at(siding, d, -4.78, 2.4, 0.18, 4.7, 6.53);
        if (d % 36 === 0) {
          const base = point(d, -4.61, 7.65);
          piece(iron, base.x, base.y + 0.86, base.z, 0.09, 2, 0.09);
          pennants.push(part(root, flag, cloth[d % 72 === 0 ? 0 : 1], base.x, base.y, base.z));
        }
      }
      if (d % 84 === 0) {
        at(iron, d, -2.9, 6, 0.23, 12, 0.28);
        at(iron, d, -2.9, 12.2, 3.8, 1.46, 0.48);
        for (const dx of [-0.24, 0, 0.24])
          for (const y of [11.89, 12.54]) {
            const p = point(d - 1, -2.9 + dx, y);
            piece(lamp, p.x, p.y, p.z, 0.72, 0.52, 0.45, -course.track(d).yaw, 0, rod);
          }
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
    // The old haul rails distinguish the cut from the timber carriage deck.
    const rail = mat('#716258');
    for (const x of [-0.62, 0.62])
      ribbon(winchCut, valley + 22, saddle - 18, x - 0.025, x + 0.025, 0.055, rail);
    sign('‹ CARRIAGE   /   CUT ›', valley - 13, 0, 5.7, 11.6, '#354947');
    at(timber, valley - 13, -1.53, 2.85, 0.36, 5.7, 0.36);
    at(timber, valley - 13, 1.53, 2.85, 0.36, 5.7, 0.36);
    sign('CABLEHEAD', saddle + 16, -2.5, 5.9, 6, '#834c3d');
    // A suspended passenger car shares the climb's skyline with the racers.
    // Steel bents carry both the outbound cable and its return run.
    for (const side of [-1, 1]) {
      const shift = new T.Vector3(side * 1.12, 0, 0);
      beam(iron, cableLow.clone().add(shift), cableHigh.clone().add(shift), 0.13, 0.13, rod);
    }
    const pulley = new T.CylinderGeometry(0.68, 0.68, 0.28, 12);
    pulley.rotateZ(Math.PI / 2);
    for (const t of [0, 0.27, 0.57, 0.83, 1]) {
      const v = cableLow.clone().lerp(cableHigh, t);
      // A gallows from the right shoulder suspends the rollers over the cut.
      const foot = new T.Vector3(Math.max(12, v.x + 3.8), v.y - 20, v.z);
      beam(iron, foot, new T.Vector3(foot.x, v.y + 2, v.z), 0.52);
      beam(rim, new T.Vector3(foot.x, v.y + 1.8, v.z), new T.Vector3(v.x - 1.6, v.y + 1.8, v.z), 0.34);
      beam(iron, new T.Vector3(foot.x, v.y - 2.5, v.z), new T.Vector3(v.x, v.y + 1.65, v.z), 0.3);
      for (const dx of [-1.12, 1.12]) {
        piece(red, v.x + dx, v.y + 0.72, v.z, 1, 1, 1, 0, 0, pulley);
        beam(iron, new T.Vector3(v.x + dx, v.y + 0.72, v.z), new T.Vector3(v.x + dx, v.y + 1.8, v.z), 0.14);
      }
    }
    // Valley ticket office and the station name on the fork approach.
    at(siding, 50, 3.65, 2.05, 6.9, 4.1, 9);
    at(iron, 50, 3.65, 4.33, 8.2, 0.48, 10.4);
    const booth = point(50, 3.65, 2.05);
    const face = course.track(50).yaw;
    piece(
      frontage('ticket-office'),
      booth.x - 4.54 * Math.sin(face),
      booth.y,
      booth.z + 4.54 * Math.cos(face),
      6.9,
      4.1,
      1,
      -face,
      0,
      plane,
    );
    illustratedSign(45, 3.63, 6.05, 7.4, 4.25);
    part(car, new T.BoxGeometry(0.2, 1.4, 0.22), iron, 0, -0.6, 0);
    part(car, new T.BoxGeometry(2.7, 0.24, 4.6), cream, 0, -1.35, 0);
    part(car, new T.BoxGeometry(2.4, 1.1, 4.3), red, 0, -3, 0);
    for (const x of [-1.12, 1.12])
      for (const z of [-1.97, 0, 1.97]) part(car, new T.BoxGeometry(0.13, 1.15, 0.13), iron, x, -1.94, z);
    part(car, new T.BoxGeometry(2.64, 0.14, 4.52), rim, 0, -2.44, 0);
    part(car, new T.BoxGeometry(2.55, 0.18, 4.4), iron, 0, -3.58, 0);
    car.position.copy(cableHigh);
    const rock = mat('#545e65');
    const trees = [art('spruce'), art('split-spruce')].map(
      (map) =>
        new T.MeshBasicMaterial({
          map,
          alphaTest: 0.43,
          side: T.DoubleSide,
          color: '#e0e3d8',
        }),
    );
    const crown = new T.PlaneGeometry(1, 1);
    crown.translate(0, 0.5, 0);
    for (const c of [course, winchCut]) {
      const start = c === course ? 0 : valley,
        end = c === course ? LAP : saddle;
      for (let d = start; d < end; d += 7) {
        const p = c.world(d, 0, -0.79);
        piece(timber, p.x, p.y, p.z, WIDTH * width * 2 + 0.6, 0.75, 1.15, -p.yaw);
        for (const sign of [-1, 1]) {
          const e = c.world(d, sign * (width - 0.07), -0.94);
          const next = c.world(Math.min(end, d + 7), sign * (width - 0.07), -0.94);
          beam(iron, new T.Vector3(e.x, e.y, e.z), new T.Vector3(next.x, next.y, next.z), 0.4, 0.8);
          if ((d - start) % 28 === 0) {
            piece(siding, e.x, e.y - 12, e.z, 0.72, 24, 0.73);
            const q = c.world(Math.min(end, d + 28), sign * (width - 0.07), -0.94);
            beam(timber, new T.Vector3(e.x, e.y - 8, e.z), new T.Vector3(q.x, q.y - 0.7, q.z), 0.35);
            beam(timber, new T.Vector3(e.x, e.y - 0.7, e.z), new T.Vector3(q.x, q.y - 8, q.z), 0.35);
          }
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
      const yaw = i * 1.76,
        tree = trees[i % 2];
      for (const angle of [yaw, yaw + Math.PI / 2])
        piece(tree, x, y - 0.14, z, size, size, 1, angle, 0, crown);
    }
    // Mature groves frame the valley approach and the lee side of the return.
    // Check the full canopy against every road, including the other fork.
    const lanes = [...cut];
    for (let d = 0; d < LAP; d += 3) lanes.push(course.track(d));
    for (let i = 0; i < 260; i++) {
      const band = i % 3;
      const d = [24, 156, 685][band] + ((i * 7.63) % [91, 128, 242][band]);
      const side = band === 2 || i % 2 === 0 ? -1 : 1;
      const p = course.world(d, side * (3.4 + 4 * Math.sin(i * 1.67) ** 2));
      const size = 12 + 12 * Math.sin(i * 6.71) ** 2,
        clearance = width * WIDTH + size * 0.42 + 1;
      if (lanes.some((q) => (q.x - p.x) ** 2 + (q.z - p.z) ** 2 < clearance ** 2)) continue;
      const y = bed(p.x, p.z) - 0.35,
        yaw = i * 2.23;
      for (const angle of [yaw, yaw + Math.PI / 2])
        piece(trees[i % 2], p.x, y, p.z, size, size, 1, angle, 0, crown);
    }
    addPassCrags(root, art('schist'), bed);
    // Summit drive hall. The open lattice faces down the climb so riders
    // see through the powered sheave from either approach.
    const p = point(saddle + 9, -3.6, 0);
    const hall = (x: number, y: number, z: number) => new T.Vector3(p.x + x, p.y + y, p.z + z);
    for (const x of [-6.4, 6.4]) {
      for (const z of [-7, 0, 7]) {
        beam(iron, hall(x, -3, z), hall(x, 13.1, z), 0.55);
        beam(rim, hall(x, 7, z), hall(x * 0.44, 14.3, z), 0.36);
      }
      for (const z of [-7, 0]) {
        beam(iron, hall(x, 0.2, z), hall(x, 9.6, z + 7), 0.38);
        beam(iron, hall(x, 9.6, z), hall(x, 0.2, z + 7), 0.38);
      }
      const roof = hall(x * 0.53, 14.5, 0);
      piece(siding, roof.x, roof.y, roof.z, 7.7, 0.5, 17, 0, -Math.sign(x) * 0.29);
    }
    piece(siding, p.x, p.y + 2, p.z - 6.9, 12.7, 5.8, 0.42);
    const sheaveMat = mat('#b94024');
    moving.position.copy(hall(0, 7.2, 3.6));
    for (const z of [-0.6, 0.6]) part(moving, new T.TorusGeometry(5.35, 0.39, 8, 52), sheaveMat, 0, 0, z);
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      const spoke = part(
        moving,
        new T.BoxGeometry(0.28, 4.95, 0.8),
        sheaveMat,
        -2.65 * Math.sin(a),
        2.65 * Math.cos(a),
        0,
      );
      spoke.rotation.z = a + 0.09;
    }
    part(moving, new T.CylinderGeometry(0.95, 0.95, 2.8, 18), iron, 0, 0, 0).rotation.x = Math.PI / 2;
    for (const x of [-3.1, 3.1]) beam(timber, hall(x, 0.1, 5.2), hall(0, 7.2, 5.2), 0.58);
    // The illuminated fascia sits high enough to leave the turning wheel exposed.
    illustratedSign(saddle + 7, -3.6, 16, 11.2, 4.8);
    for (const x of [-3.3, 3.3]) beam(iron, hall(x, 12.5, 2), hall(x, 18, 2), 0.24);
  }
  for (const [m, byGeo] of batches)
    for (const [g, list] of byGeo) {
      const mesh = new T.InstancedMesh(g, m, list.length);
      list.forEach((v, i) => mesh.setMatrixAt(i, v));
      mesh.receiveShadow = true;
      mesh.castShadow = m === iron || m === siding || m === timber;
      root.add(mesh);
    }
  return (time: number, at: number, state: { laps: number }) => {
    if (bowl) {
      pennants.forEach((flag, i) => {
        flag.rotation.y = 0.28 * Math.sin(time * 3.6 + i);
        flag.rotation.z = 0.055 * Math.sin(time * 5.8 + i);
      });
      moving.rotation.y = 0.55 + time * 0.21;
      moving.rotation.z = 0.08;
    } else {
      moving.rotation.z = time * 0.65;
      const journey = Math.max(0, Math.min(1, (at - (state.laps - 1) * LAP - saddle) / (LAP - saddle)));
      car.position.copy(cableHigh).lerp(cableLow, journey);
    }
  };
}
