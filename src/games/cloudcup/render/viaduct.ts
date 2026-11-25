import * as T from 'three';
import { deck, FORK, forkWidth, JOIN, LAND, LIP, rises } from '../sim/deck';
import { LAP, courses, type Course } from '../sim/track';

// Sweep a folded box girder along the deck vertices, including its bank.
// Separate runs end flush at the lip and resume exactly on the receiving deck.
export function buildRails(scene: T.Object3D, course: Course = courses[0]) {
  const { world } = course;
  const vertices: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  const steel = new T.Color('#51434a'),
    seam = new T.Color('#382f36'),
    amber = new T.Color('#dd9343'),
    mint = new T.Color('#77c5ad'),
    road = new T.Color('#967159');
  function run(start: number, end: number, right: boolean, outer: boolean) {
    for (let at = start; at <= end; at += 2) {
      const span = deck(at, right),
        fork = forkWidth(at);
      const inward = right === outer ? -1 : 1;
      const edge = inward < 0 ? span.hi : span.lo;
      const width = outer ? 1 : fork;
      const lift = right ? rises(at) : 0;
      const top = 0.025 + (right ? 0.16 : 0) * fork;
      const paint = road.clone().lerp(right ? amber : mint, fork);
      const section = [
        [0.055, 0.018, paint],
        [0.039, top, paint],
        [0, top, paint],
        [-0.018, -0.08, steel],
        [-0.018, -0.44, seam],
        [0, -0.54, steel],
      ] as const;
      for (const [offset, height, color] of section) {
        const p = world(at, edge + inward * width * offset, lift + height * width);
        vertices.push(p.x, p.y, p.z);
        colors.push(color.r, color.g, color.b);
      }
      const row = vertices.length / 3 - section.length;
      if (at < end) {
        for (let j = 0; j < section.length - 1; j++) {
          const a = row + j,
            b = a + section.length;
          indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
      if (right && (at === LIP || at === LAND)) {
        for (let j = 1; j < section.length - 1; j++) indices.push(row, row + j, row + j + 1);
      }
    }
  }
  run(0, LAP, false, true);
  run(FORK, JOIN, false, false);
  for (const outer of [true, false]) {
    run(outer ? 0 : FORK, LIP, true, outer);
    run(LAND, outer ? LAP : JOIN, true, outer);
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  geo.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const rail = new T.Mesh(
    geo,
    new T.MeshStandardMaterial({
      vertexColors: true,
      side: T.DoubleSide,
      roughness: 0.74,
      metalness: 0.14,
    }),
  );
  rail.receiveShadow = true;
  scene.add(rail);
}

// One painted steel plate. Mipmaps keep the welds and worn paint stable on approach.
export function launchPlate(anisotropy: number) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#474747';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 4; i++) {
    const x = i * 128;
    const patina = g.createLinearGradient(x, 0, x + 128, 0);
    patina.addColorStop(0, '#514b47');
    patina.addColorStop(0.48, '#5b5751');
    patina.addColorStop(1, '#424246');
    g.fillStyle = patina;
    g.fillRect(x + 1, 2, 126, 508);
    g.fillStyle = '#292c30';
    g.fillRect(x, 0, 2, 512);
    for (const y of [13, 498])
      for (const sx of [10, 117]) {
        g.fillStyle = '#252529';
        g.fillRect(x + sx - 2, y - 2, 5, 5);
        g.fillStyle = '#928177';
        g.fillRect(x + sx - 2, y - 2, 4, 1);
      }
  }
  // A broad open chevron, with darker exposed steel between the painted arms.
  for (const y of [165, 222]) {
    g.beginPath();
    g.moveTo(98, y + 80);
    g.lineTo(256, y);
    g.lineTo(414, y + 80);
    g.lineWidth = y === 165 ? 28 : 10;
    g.lineJoin = 'miter';
    g.strokeStyle = y === 165 ? '#e4b663' : '#c98544';
    g.stroke();
  }
  let seed = 5127;
  function noise() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  for (let i = 0; i < 11500; i++) {
    g.fillStyle = i % 3 ? 'rgba(34,35,38,0.21)' : 'rgba(208,193,165,0.18)';
    g.fillRect(noise() * 512, noise() * 512, 0.7 + noise() * 1.9, 1 + noise() * 9);
  }
  const map = new T.CanvasTexture(c);
  map.colorSpace = T.SRGBColorSpace;
  map.wrapT = T.RepeatWrapping;
  map.anisotropy = Math.min(8, anisotropy);
  return new T.MeshStandardMaterial({ map, roughness: 0.75, metalness: 0.16 });
}
