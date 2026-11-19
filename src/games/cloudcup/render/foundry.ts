import * as T from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LAND, LIP, lapAt } from '../sim/deck';
import { world } from '../sim/track';

// All distances here are local to the hanging ladle. Keep the supports on
// its outboard side so the silhouette never cuts across the riding surface.
export function buildFoundry(scene: T.Scene) {
  const root = new T.Group(),
    at = (LIP + LAND) / 2;
  const frame = world(at, 2.72);
  root.position.set(frame.x, frame.y, frame.z);
  root.rotation.y = -frame.yaw;
  scene.add(root);
  const iron = '#39343b',
    rust = '#844c37',
    gold = '#c58a47',
    alloy = '#968577';
  const parts: T.BufferGeometry[] = [];
  const transform = new T.Object3D();
  function part(geo: T.BufferGeometry, color: string, x: number, y: number, z: number, rotation = 0) {
    transform.position.set(x, y, z);
    transform.rotation.set(0, 0, rotation);
    transform.updateMatrix();
    geo.applyMatrix4(transform.matrix);
    const flat = geo.index ? geo.toNonIndexed() : geo;
    if (flat !== geo) geo.dispose();
    flat.deleteAttribute('uv');
    const count = flat.getAttribute('position').count,
      rgb = new T.Color(color),
      colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) rgb.toArray(colors, i * 3);
    flat.setAttribute('color', new T.BufferAttribute(colors, 3));
    parts.push(flat);
  }
  function beam(a: number[], b: number[], width: number, depth: number, color: string) {
    const start = new T.Vector3(...a),
      end = new T.Vector3(...b),
      delta = end.clone().sub(start);
    const geo = new T.BoxGeometry(width, delta.length(), depth);
    geo.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), delta.normalize()));
    const p = start.lerp(end, 0.5);
    part(geo, color, p.x, p.y, p.z);
  }
  // Tall riveted crane on two splayed legs with an open lattice jib.
  for (const z of [-2.75, 2.75]) {
    beam([6, -10, z * 1.45], [5, 10, z], 0.77, 0.67, iron);
    beam([5, 9.5, z], [-1, 9.5, z], 0.38, 0.34, gold);
    beam([5, 11.25, z], [-1, 10.1, z], 0.28, 0.28, rust);
    for (let i = 0; i < 4; i++) {
      const x = 5 - i * 1.5;
      beam([x, 9.52, z], [x - 1.5, 10.94 - i * 0.27, z], 0.16, 0.18, alloy);
    }
    beam([5, 5.2, z], [1, 9.5, z], 0.3, 0.33, rust);
    beam([-0.8, 9.65, z], [0, 5.24, z * 0.79], 0.09, 0.09, iron);
    beam([1.1, 9.65, z], [0, 5.24, z * 0.79], 0.09, 0.09, iron);
  }
  for (const x of [-0.85, 2.1, 5]) beam([x, 9.65, -2.85], [x, 9.65, 2.85], 0.28, 0.28, iron);
  for (let i = 0; i < 3; i++) beam([5, -8 + i * 5, -2.9], [5, -3 + i * 5, 2.9], 0.21, 0.23, rust);

  const angle = 0.57,
    pivotY = 5.15;
  function cup(geo: T.BufferGeometry, color: string, y = 0) {
    geo.translate(0, y, 0);
    part(geo, color, 0, pivotY, 0, angle);
  }
  const profile = [
    [0.88, -2.05],
    [1.44, -1.65],
    [2.06, 0.85],
    [2.17, 1.02],
    [2.17, 1.29],
    [1.94, 1.29],
    [1.77, 0.82],
    [1.23, -1.42],
    [0.88, -1.75],
  ];
  cup(
    new T.LatheGeometry(
      profile.map(([x, y]) => new T.Vector2(x, y)),
      32,
    ),
    rust,
  );
  for (const [y, r, c] of [
    [-0.99, 1.65, iron],
    [0.35, 1.98, iron],
    [1.16, 2.2, gold],
  ] as const) {
    cup(new T.CylinderGeometry(r, r - 0.02, 0.18, 32, 1, true), c, y);
  }
  for (let j = 0; j < 12; j++) {
    const a = (j * Math.PI) / 6,
      g = new T.BoxGeometry(0.16, 2.38, 0.13);
    g.rotateX(0.24);
    g.translate(0, -0.28, 1.79);
    g.rotateY(a);
    cup(g, j % 2 ? rust : gold);
  }
  for (const z of [-2.05, 2.05]) {
    const hub = new T.CylinderGeometry(0.62, 0.62, 0.52, 16);
    hub.rotateX(Math.PI / 2);
    part(hub, iron, 0, pivotY, z);
    const cap = new T.CylinderGeometry(0.33, 0.33, 0.55, 12);
    cap.rotateX(Math.PI / 2);
    part(cap, gold, 0, pivotY, z * 1.06);
  }
  const basinY = -7.1;
  part(new T.BoxGeometry(12.4, 0.9, 22.5), iron, -5, basinY - 0.43, 0);
  for (const x of [-11.15, 1.15]) part(new T.BoxGeometry(0.43, 0.85, 22.6), rust, x, basinY + 0.1, 0);
  for (const z of [-11.15, 11.15]) part(new T.BoxGeometry(12.6, 0.85, 0.43), alloy, -5, basinY + 0.1, z);
  // Fine pitting and soot unify the crane and pot with the painted salvage.
  const steel = new T.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.84,
    metalness: 0.19,
  });
  steel.onBeforeCompile = (shader) => {
    shader.vertexShader =
      'varying vec3 vIron;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvIron=position;');
    shader.fragmentShader =
      'varying vec3 vIron;\n' +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        `
      #include <color_fragment>
      vec3 p = vIron;
      float patina = sin(p.y*3. + sin(p.z*3.2+p.x*4.5))*.5 + sin(p.x*18.+p.z*13.+sin(p.y*3.))*.34;
      diffuseColor.rgb *= .88+.16*patina;
    `,
      );
  };
  const metal = new T.Mesh(mergeGeometries(parts)!, steel);
  parts.forEach((p) => p.dispose());
  metal.castShadow = true;
  metal.receiveShadow = true;
  root.add(metal);

  const clock = { value: 0 };
  const metalHeat = new T.MeshBasicMaterial({
    color: 0xffffff,
    side: T.DoubleSide,
  });
  metalHeat.onBeforeCompile = (shader) => {
    shader.uniforms.foundryTime = clock;
    shader.vertexShader =
      'varying vec3 vSlag;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSlag=position;');
    shader.fragmentShader =
      `
      uniform float foundryTime; varying vec3 vSlag;
      float hashSlag(vec2 p) {
        vec3 q=fract(vec3(p.xyx)*.1031);
        q+=dot(q,q.yzx+33.33);
        return fract((q.x+q.y)*q.z);
      }
      float slagNoise(vec2 p) {
        vec2 i=floor(p), u=fract(p); u=u*u*(3.-2.*u);
        return mix(mix(hashSlag(i),hashSlag(i+vec2(1.,0.)),u.x),
                   mix(hashSlag(i+vec2(0.,1.)),hashSlag(i+1.),u.x),u.y);
      }
    ` +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        `
      #include <color_fragment>
      float t=foundryTime;
      vec2 p=vSlag.xz * vec2(.63,.44);
      p += vec2(.17*t,.035*t);
      vec2 drift=vec2(slagNoise(p*.7),slagNoise(p*.62+11.));
      vec2 q=p+drift*2.4;
      float rock=.71*slagNoise(q)+.22*slagNoise(q*2.9)+.07*slagNoise(q*8.7);
      float channel=1.-smoothstep(.014,.10,abs(rock-.5));
      vec3 crust=mix(vec3(.063,.018,.023),vec3(.39,.060,.013),rock);
      vec3 liquid=mix(vec3(.88,.14,.012),vec3(1.,.69,.18),channel*channel);
      vec3 pool=mix(crust,liquid,channel);
      float current=slagNoise(vec2(vSlag.y*1.4+t*3.2,vSlag.z*9.+vSlag.x*6.));
      vec3 stream=mix(vec3(.92,.22,.022),vec3(1.,.86,.34),smoothstep(.2,.8,current));
      diffuseColor.rgb=mix(pool,stream,smoothstep(-6.95,-6.6,vSlag.y));
    `,
      );
  };
  const melt = new T.CircleGeometry(1.94, 32);
  melt.rotateX(-Math.PI / 2);
  melt.translate(0, 1.19, 0);
  melt.rotateZ(angle);
  melt.translate(0, pivotY, 0);
  const pool = new T.PlaneGeometry(12, 22);
  pool.rotateX(-Math.PI / 2);
  pool.translate(-5, basinY + 0.08, 0);
  // The lip and the stream meet in the same local frame as the suspended pot.
  const lip = new T.Vector3(-2.12, 1.23, 0).applyAxisAngle(new T.Vector3(0, 0, 1), angle);
  lip.y += pivotY;
  const stream = new T.CatmullRomCurve3([
    lip,
    lip.clone().add(new T.Vector3(-0.48, -0.35, 0)),
    new T.Vector3(lip.x - 0.86, lip.y - 2.4, 0),
    new T.Vector3(lip.x - 1.3, basinY, 0),
  ]);
  const flow = new T.TubeGeometry(stream, 20, 0.2, 8, false);
  const hot = mergeGeometries([melt, pool, flow])!;
  for (const p of [melt, pool, flow]) p.dispose();
  root.add(new T.Mesh(hot, metalHeat));
  const sparks = new T.BufferGeometry(),
    n = 48;
  const positions = new T.Float32BufferAttribute(new Float32Array(3 * n), 3);
  sparks.setAttribute('position', positions);
  const motes = new T.Points(
    sparks,
    new T.PointsMaterial({
      size: 0.095,
      color: '#ffce7a',
      sizeAttenuation: true,
    }),
  );
  motes.frustumCulled = false;
  root.add(motes);
  return (time: number, distance: number) => {
    const local = lapAt(distance);
    clock.value = time;
    motes.visible = local > LIP - 135 && local < LAND + 84;
    if (!motes.visible) return;
    for (let i = 0; i < n; i++) {
      const t = (time * (0.33 + 0.08 * (i % 5)) + i * 0.618) % 1,
        a = i * 2.4;
      const r = t * (0.6 + (i % 6));
      positions.setXYZ(
        i,
        lip.x - 1.3 + Math.cos(a) * r + t * t * 2,
        basinY + 0.2 + t * (4 + (i % 8)) - 2 * t * t,
        Math.sin(a) * r,
      );
    }
    positions.needsUpdate = true;
  };
}
