import * as T from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const ink = '#28252b',
  iron = '#52464a',
  leather = '#403334',
  alloy = '#ad9a87',
  bone = '#eddfb8';
const paint = ['#e75a32', '#bf456a', '#a7b64b', '#399e9c'];
// Sculpt each bike in its own local frame (-Z forward). Bake rigid components
// into one vertex-coloured mesh per bike; exhaust and the chain animate separately.
export function buildBike(id: number, skin: T.Texture) {
  const group = new T.Group(),
    parts: T.BufferGeometry[] = [];
  const color = paint[id],
    orange = '#fbab53';
  function add(
    geo: T.BufferGeometry,
    c: string,
    x: number,
    y: number,
    z: number,
    sx = 1,
    sy = 1,
    sz = 1,
    rx = 0,
    ry = 0,
    rz = 0,
  ) {
    const mat = new T.Matrix4().compose(
      new T.Vector3(x, y, z),
      new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)),
      new T.Vector3(sx, sy, sz),
    );
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    g.applyMatrix4(mat);
    const vertices = g.getAttribute('position'),
      uvs = new Float32Array(vertices.count * 2);
    for (let v = 0; v < vertices.count; v++) {
      const px = vertices.getX(v),
        py = vertices.getY(v);
      // Rear-projected paint follows each solid panel and each part of the suit.
      // The exhaust nozzle has its own region so its blades stay centred.
      let u = 0.5 + px * 0.6,
        row = 0.85 - py * 0.38;
      if (y > 1.82) {
        u = 0.5 + px * 0.47;
        row = 0.175 - (py - 1.77) * 0.34;
      } else if (y > 1.0) {
        u = 0.5 + px * 0.61;
        row = 0.411 - (py - 1.05) * 0.38;
      } else if (Math.abs(x) > 0.3 && y < 0.85) {
        u = 0.5 + px * 0.61;
        row = 0.82 - (py - 0.25) * 0.52;
      } else if (z > 1.46 && Math.abs(x) < 0.1) {
        u = 0.5 + px * 0.35;
        row = (id === 1 ? 0.86 : id === 2 ? 0.82 : id === 3 ? 0.85 : 0.89) - (py - 0.49) * 0.36;
        if (id === 1) u += 0.14;
      }
      uvs[2 * v] = u;
      uvs[2 * v + 1] = 1 - row;
    }
    g.setAttribute('uv', new T.BufferAttribute(uvs, 2));
    const rgb = new T.Color(c),
      arr = new Float32Array(g.getAttribute('position').count * 3);
    for (let i = 0; i < arr.length; i += 3) rgb.toArray(arr, i);
    g.setAttribute('color', new T.BufferAttribute(arr, 3));
    parts.push(g);
  }
  const box = (
    c: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    l: number,
    rx = 0,
    ry = 0,
    rz = 0,
  ) => add(new T.BoxGeometry(), c, x, y, z, w, h, l, rx, ry, rz);
  const pod = (
    c: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    l: number,
    rx = 0,
    ry = 0,
    rz = 0,
  ) => add(new T.SphereGeometry(1, 12, 8), c, x, y, z, w, h, l, rx, ry, rz);
  const tube = (c: string, x: number, y: number, z: number, r1: number, r2: number, length: number) =>
    add(new T.CylinderGeometry(r1, r2, length, 12), c, x, y, z, 1, 1, 1, Math.PI / 2);
  function bar(c: string, a: number[], b: number[], radius: number) {
    const start = new T.Vector3(...a),
      end = new T.Vector3(...b),
      delta = end.clone().sub(start);
    const e = new T.Euler().setFromQuaternion(
      new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), delta.clone().normalize()),
    );
    const center = start.add(end).multiplyScalar(0.5);
    add(
      new T.CylinderGeometry(radius, radius, delta.length(), 8),
      c,
      center.x,
      center.y,
      center.z,
      1,
      1,
      1,
      e.x,
      e.y,
      e.z,
    );
  }
  // Tapered belly and seat, with a protruding nozzle and exposed cooling rings.
  pod(ink, 0, 0.56, 0, 0.49, 0.46, 1.59);
  pod(color, 0, 0.78, -0.59, 0.47, 0.42, 1.22, -0.06);
  pod(bone, 0, 0.92, -1.03, 0.13, 0.27, 0.77);
  pod(leather, 0, 1.03, 0.3, 0.32, 0.13, 0.68);
  tube(iron, 0, 0.49, 0.91, 0.38, 0.33, 1.0);
  for (let k = 0; k < 5; k++) tube(k % 2 ? alloy : ink, 0, 0.49, 0.52 + k * 0.18, 0.39, 0.41, 0.085);
  tube(ink, 0, 0.49, 1.47, 0.35, 0.43, 0.22);
  tube('#45bdb6', 0, 0.49, 1.596, 0.265, 0.265, 0.04);
  tube('#dafff2', 0, 0.49, 1.625, 0.14, 0.14, 0.04);
  for (const side of [-1, 1]) {
    const width = id === 1 ? 0.65 : id === 2 ? 0.4 : 0.52;
    pod(color, side * width, 0.66, 0.49, 0.22, 0.31, 0.82, -0.12, side * 0.09);
    box(bone, side * width, 0.92, 0.35, 0.07, 0.04, 0.93, -0.12);
    tube(iron, side * width, 0.55, 1.05, 0.18, 0.22, 0.36);
    tube('#70e7dd', side * width, 0.55, 1.24, 0.13, 0.14, 0.035);
    for (let k = 0; k < 3; k++)
      box(ink, side * (width + 0.19), 0.7, 0.16 + k * 0.17, 0.035, 0.2, 0.07, -0.38);
    bar(alloy, [side * 0.2, 0.49, -0.85], [side * 0.4, 1.17, -0.64], 0.07);
    bar(ink, [side * 0.32, 1.2, -0.67], [side * 0.59, 1.18, -0.48], 0.049);
    // Bent legs, boot toe, knee plate, forearms and armoured shoulders.
    bar(leather, [side * 0.24, 1.03, 0.3], [side * 0.42, 0.79, -0.18], 0.17);
    pod(color, side * 0.43, 0.79, -0.18, 0.15, 0.16, 0.18);
    bar(ink, [side * 0.42, 0.75, -0.14], [side * 0.45, 0.48, 0.38], 0.125);
    pod(leather, side * 0.46, 0.47, 0.24, 0.15, 0.12, 0.29);
    bar(color, [side * 0.3, 1.66, -0.04], [side * 0.52, 1.38, 0.13], 0.137);
    pod(bone, side * 0.33, 1.64, -0.035, 0.175, 0.145, 0.2);
    bar(leather, [side * 0.52, 1.37, 0.12], [side * 0.54, 1.22, -0.46], 0.1);
    pod(ink, side * 0.54, 1.21, -0.48, 0.115, 0.099, 0.14);
    if (id === 1)
      add(new T.ConeGeometry(0.105, 0.34, 5), alloy, side * 0.43, 1.79, 0.015, 1, 1, 1, 0, 0, -side * 0.48);
    if (id === 3) box(color, side * 0.61, 0.95, 1, 0.075, 0.65, 0.46, -0.37, 0, -side * 0.14);
  }
  pod(leather, 0, 1.31, 0.19, 0.32, 0.45, 0.24, -0.35);
  pod(color, 0, 1.51, 0.045, 0.38, 0.38, 0.27, -0.4);
  pod(iron, 0, 1.84, -0.16, 0.145, 0.14, 0.13);
  pod(id === 2 ? color : bone, 0, 1.99, -0.23, 0.245, 0.26, 0.285, -0.14);
  pod('#243438', 0, 2, -0.323, 0.251, 0.132, 0.235);
  pod(color, 0, 2.16, -0.22, 0.097, 0.117, 0.267, -0.12);
  box(ink, 0, 1.92, -0.009, 0.24, 0.07, 0.033, -0.1);
  if (id === 2) for (const d of [-1, 1]) bar(bone, [d * 0.16, 2.16, -0.22], [d * 0.27, 2.43, -0.12], 0.038);
  const geo = mergeGeometries(parts)!;
  parts.forEach((g) => g.dispose());
  // Let the painted enamel and stitched leathers supply the albedo while
  // the mesh supplies silhouette, banking, depth, dynamic light and occlusion.
  const finish = new T.MeshStandardMaterial({
    map: skin,
    vertexColors: true,
    roughness: 0.59,
    metalness: 0.12,
  });
  finish.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', '').replace(
      '#include <color_fragment>',
      `#include <color_fragment>
        vec4 painted=texture2D(map,vMapUv);
        diffuseColor.rgb=mix(diffuseColor.rgb,painted.rgb,painted.a*.90);
      `,
    );
  };
  const shell = new T.Mesh(geo, finish);
  shell.castShadow = true;
  shell.receiveShadow = true;
  group.add(shell);
  // A short shock-diamond plume rooted inside the turbine. UV.y runs from
  // nozzle to tip. The falloff blends into the yard without a hard cone edge.
  const jet = new T.LatheGeometry(
    [
      [0.19, 0],
      [0.24, 0.08],
      [0.198, 0.29],
      [0.15, 0.45],
      [0.154, 0.52],
      [0.085, 0.74],
      [0.01, 1],
    ].map(([radius, length]) => new T.Vector2(radius, length)),
    16,
  );
  jet.rotateX(Math.PI / 2);
  const jetTime = { value: id * 0.39 };
  const flameMaterial = new T.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
  });
  flameMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.jetTime = jetTime;
    shader.vertexShader =
      'varying vec2 vJetUv;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvJetUv=uv;');
    shader.fragmentShader =
      'uniform float jetTime; varying vec2 vJetUv;\n' +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        `
      #include <color_fragment>
      float z=vJetUv.y;
      float cell=.5+.5*cos(z*30.-sin(jetTime*13.)*.45);
      float flicker=.87+.13*sin(vJetUv.x*37.7-z*29.+jetTime*19.);
      diffuseColor.rgb=mix(vec3(.11,.72,.86),vec3(.89,1.,.91),cell*(1.-z));
      diffuseColor.a*=flicker*(1.-smoothstep(.22,1.,z))*(.40+.45*cell);
    `,
      );
  };
  const flame = new T.Mesh(jet, flameMaterial);
  flame.position.set(0, 0.49, 1.61);
  group.add(flame);
  return { group, flame, jetTime };
}
