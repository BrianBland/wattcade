import * as T from 'three';
import { courses, LAP, winchCut, WIDTH } from '../sim/track';
import { valley, saddle } from '../sim/pass';
import type { VenueArt } from './venueTextures';

type Place = (
  m: T.Material,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  l: number,
  yaw?: number,
  roll?: number,
  g?: T.BufferGeometry,
) => void;
type Beam = (
  m: T.Material,
  a: T.Vector3,
  b: T.Vector3,
  w: number,
  depth?: number,
  g?: T.BufferGeometry,
) => void;

// Follow the same surveyed stream bed as the terrain. The railway follows
// the east bank, crossing under both climbing roads on its way to the sawmill.
export function valleyWorks(
  root: T.Group,
  bed: (x: number, z: number) => number,
  riverX: (z: number) => number,
  creekX: (z: number) => number,
  place: Place,
  beam: Beam,
  art: VenueArt,
) {
  const vertices: number[] = [],
    uv: number[] = [],
    indices: number[] = [];
  for (const centre of [riverX, creekX]) {
    const offset = vertices.length / 3;
    for (let i = 0; i <= 300; i++) {
      const z = -375 + i * 2.5,
        c = centre(z),
        surface = bed(c, z) + 1.88;
      for (const u of [-1, 0, 1]) {
        const width = 8.8 + 2.7 * Math.sin(z * 0.05) + 0.85 * Math.sin(z * 0.29 + u);
        vertices.push(c + u * width, surface, z);
        uv.push(u, z);
      }
      if (i < 300) {
        const k = offset + i * 3;
        indices.push(k, k + 3, k + 1, k + 1, k + 3, k + 4, k + 1, k + 4, k + 2, k + 2, k + 4, k + 5);
      }
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setIndex(indices);
  const flow = { value: 0 };
  const water = new T.ShaderMaterial({
    uniforms: { flow },
    side: T.DoubleSide,
    vertexShader: `varying vec2 st; varying float distanceToEye;
    void main(){st=uv;vec4 p=modelViewMatrix*vec4(position,1.);distanceToEye=-p.z;gl_Position=projectionMatrix*p;}`,
    fragmentShader: `varying vec2 st; varying float distanceToEye; uniform float flow;
    void main(){
      float bend=sin(st.y*.13+st.x*3.);
      float wake=sin(st.y*2.2+7.*st.x+2.8*bend-flow*3.)+.48*sin(st.y*4.8-st.x*13.-flow*3.6);
      float foam=smoothstep(.98,1.36,wake)*(.22+.70*pow(abs(st.x),1.8));
      vec3 col=mix(vec3(.034,.15,.16),vec3(.19,.35,.34),.5+.5*sin(st.x*3.2+bend));
      col=mix(col,vec3(.72,.82,.75),foam);
      col=mix(col,vec3(.40,.46,.50),1.-exp(-.000025*distanceToEye*distanceToEye));
      gl_FragColor=vec4(col,1.);
      #include <colorspace_fragment>
    }`,
  });
  root.add(new T.Mesh(g, water));

  const mat = (color: string) => new T.MeshStandardMaterial({ color, roughness: 0.84 });
  const iron = mat('#485253'),
    wood = mat('#765c46'),
    bark = mat('#514839'),
    stone = mat('#666b67');
  const brick = new T.MeshStandardMaterial({ map: art('mill-siding'), color: '#ccb09e', roughness: 0.88 });
  const panes = mat('#a7bcaf'),
    roof = mat('#596668'),
    ore = mat('#756754');
  const cylinder = new T.CylinderGeometry(0.5, 0.5, 1, 12),
    log = cylinder.clone();
  log.rotateX(Math.PI / 2);
  const way = (z: number) => {
    const x = riverX(z) + 13.5;
    return new T.Vector3(x, bed(x, z) + 0.45, z);
  };
  for (let z = -222; z < 216; z += 3) {
    const a = way(z),
      b = way(z + 3);
    place(wood, a.x, a.y - 0.13, z, 2.55, 0.24, 0.48);
    for (const dx of [-0.77, 0.77]) {
      const shift = new T.Vector3(dx, 0, 0);
      beam(iron, a.clone().add(shift), b.clone().add(shift), 0.115, 0.15);
    }
    if (z % 18 === 0) {
      place(wood, a.x + 3, a.y + 2.4, z, 0.23, 5, 0.24);
      place(iron, a.x + 2, a.y + 4.78, z, 2.4, 0.18, 0.21);
      const c = way(z + 18);
      beam(iron, new T.Vector3(a.x + 1, a.y + 4.73, z), new T.Vector3(c.x + 1, c.y + 4.73, z + 18), 0.055);
    }
  }
  for (const z of [-161, -155, -149, 19, 25, 31, 37, 161, 167]) {
    const a = way(z),
      b = way(z + 1);
    const yaw = Math.atan2(b.x - a.x, 1);
    place(iron, a.x, a.y + 0.36, z, 2.45, 0.42, 4.85, yaw);
    place(brick, a.x, a.y + 1.24, z, 2.6, 1.46, 4.5, yaw);
    place(ore, a.x, a.y + 2, z, 2.1, 0.5, 3.95, yaw, 0.05);
  }
  const tracks = Array.from({ length: LAP / 3 }, (_, i) => courses[4].track(i * 3));
  for (let d = valley; d < saddle; d += 3) tracks.push(winchCut.track(d));
  for (const [z, count] of [
    [-127, 3],
    [13, 3],
    [120, 2],
  ]) {
    for (let i = 0; i < count; i++) {
      const zz = z + i * 16;
      let x = riverX(zz) - 14 - i * 2;
      // Pick the bank outside the deck footprint for the tall mill roofs.
      while (tracks.some((q) => Math.hypot(q.x - x, q.z - zz) < WIDTH * 1.43 + 8)) x -= 4;
      const y = bed(x, zz);
      place(stone, x, y, zz, 9.8, 2.2, 13);
      place(brick, x, y + 3, zz, 9, 4.4, 12.5);
      for (const sign of [-1, 1]) place(roof, x + sign * 2.4, y + 5.9, zz, 5.35, 0.37, 13.6, 0, -sign * 0.27);
      for (let j = -2; j <= 2; j++) place(panes, x + 4.55, y + 3.1, zz + j * 2, 0.13, 1.45, 1.18);
      if (i === 0) {
        place(iron, x - 3, y + 6.2, zz - 3, 1.1, 9.5, 1.1, 0, 0, cylinder);
        place(wood, x + 6, y + 0.75, zz, 3.2, 0.34, 13);
      }
      for (let r = 0; r < 3; r++)
        for (let j = 0; j < 4 - r; j++)
          place(
            bark,
            x - 6 - j * 0.78 - r * 0.37,
            y + 0.48 + r * 0.64,
            zz + 5,
            0.84,
            0.8,
            6.1 + Math.sin(j),
            0,
            0,
            log,
          );
    }
  }
  // Rock bars, stranded timber and pale wakes give the water a sense of scale.
  const stoneGeo = new T.IcosahedronGeometry(1, 1);
  for (let i = 0; i < 165; i++) {
    const z = -249 + i * 3.02,
      x = riverX(z) + (6 + 6 * Math.sin(i * 0.73)) * (i % 2 ? 1 : -1);
    const h = bed(riverX(z), z) + 1.1;
    place(
      stone,
      x,
      h,
      z,
      0.7 + 1.8 * Math.sin(i * 0.3) ** 2,
      0.53 + Math.sin(i) ** 2,
      1.8,
      i * 0.8,
      0.12,
      stoneGeo,
    );
    if (i % 9 === 0) place(wood, x + 1, h + 0.33, z, 0.52, 0.55, 6.4, i * 0.73, 0, log);
  }
  return (time: number) => {
    flow.value = time;
  };
}
