import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
const hull = new THREE.ConeGeometry(2.2, 7, 4);
hull.rotateX(-Math.PI / 2); hull.rotateZ(Math.PI / 4);
const box = new THREE.BoxGeometry(1, 1, 1);
const sphere = new THREE.SphereGeometry(1, 12, 8);
const ring = new THREE.TorusGeometry(1, 0.08, 6, 32); ring.rotateX(Math.PI / 2);
const rock=new THREE.IcosahedronGeometry(1,0);
export const geometries = { hull, box, sphere, ring, rock };
const compiled = new Map<string, THREE.BufferGeometry[]>();
export function isSharedGeometry(g: THREE.BufferGeometry) {
  return (Object.values(geometries) as THREE.BufferGeometry[]).includes(g) || [...compiled.values()].some(gs=>gs.includes(g));
}
/** Merge static enemy parts by material; retain named aiming barrels as separate meshes. */
function compactModel(group: THREE.Group, key: string): THREE.Group {
  const batches=new Map<THREE.Material,THREE.Mesh[]>();
  for(const child of [...group.children]) if(child instanceof THREE.Mesh && child.name!=='barrel') {
    const m=child.material as THREE.Material;if(!batches.has(m))batches.set(m,[]);batches.get(m)!.push(child);
  }
  let cached=compiled.get(key);const created:THREE.BufferGeometry[]=[];
  [...batches].forEach(([material,meshes],i)=>{
    let geometry=cached?.[i];
    if(!geometry){const parts=meshes.map(m=>{m.updateMatrix();return m.geometry.clone().applyMatrix4(m.matrix);});geometry=mergeGeometries(parts)!;parts.forEach(g=>g.dispose());created.push(geometry);}
    meshes.forEach(m=>group.remove(m));group.add(new THREE.Mesh(geometry,material));
  });
  if(!cached)compiled.set(key,created);return group;
}
export function shipModel(color: string, kind: string): THREE.Group {
  const g = new THREE.Group();
  if(kind==='turret' || kind==='tank') {
    const armor=new THREE.MeshStandardMaterial({color:'#e8ddec',metalness:0.6,roughness:0.3});
    const glow=new THREE.MeshBasicMaterial({color:'#ff3bbf'});
    const base=new THREE.Mesh(sphere,armor);base.scale.set(2.5,1.3,2.5);g.add(base);
    const barrel=new THREE.Mesh(box,glow);barrel.position.set(0,1.3,1);barrel.scale.set(0.8,0.8,4);barrel.name='barrel';g.add(barrel);
    if(kind==='tank') {
      const dark=new THREE.MeshStandardMaterial({color:'#162b3c',metalness:0.6,roughness:0.4});
      for(const side of [-1,1]){const tread=new THREE.Mesh(box,dark);tread.position.set(side*2.3,-0.6,0);tread.scale.set(1.4,1.6,6);g.add(tread);for(let i=0;i<5;i++){const wheel=new THREE.Mesh(sphere,armor);wheel.position.set(side*3,-0.6,-2+i);wheel.scale.set(0.2,0.6,0.6);g.add(wheel);}}
      const body=new THREE.Mesh(box,armor);body.position.y=-0.5;body.scale.set(4,1.5,5);g.add(body);
    }
    return compactModel(g,kind);
  }
  const plate = new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: '#15253d', metalness: 0.7, roughness: 0.4 });
  const light = new THREE.MeshBasicMaterial({ color: kind === 'player' || kind === 'escort' ? '#38edff' : '#ff43bd' });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, pos: number[], scale: number[]) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(pos[0], pos[1], pos[2]); m.scale.set(scale[0], scale[1], scale[2]); g.add(m); return m;
  };
  add(hull, plate, [0, 0.7, 0], [1, 0.5, 1]);
  add(sphere, dark, [0, 1.3, -0.4], [0.8, 0.45, 1.6]);
  add(box, light, [0, 1.75, -0.5], [0.35, 0.08, 1.2]);
  const wings = kind === 'escort' ? 4.3 : kind === 'armor' ? 2.8 : 3.6;
  for (const side of [-1, 1]) {
    add(box, plate, [side * wings / 2, 0.6, 0.8], [wings, 0.35, 1.7]).rotation.y = side * 0.22;
    add(box, dark, [side * wings, 0.6, 0], [0.8, 0.9, 3]);
    add(box, light, [side * wings, 0.65, -1.6], [0.3, 0.3, 0.7]);
    const engine = add(sphere, light, [side * 1.1, 0.6, 3.1], [0.5, 0.3, 1.2]); engine.name = 'engine';
  }
  if (kind === 'player' || kind === 'escort') {
    const white = new THREE.MeshStandardMaterial({ color: '#eaf6ff', metalness: 0.4, roughness: 0.25 });
    for (const side of [-1, 1]) {
      add(hull, white, [side*2.7,0.8,0.6],[0.5,0.4,0.7]);
      const sprocket = add(ring, light, [side*2.7,1.2,1.8],[0.9,0.9,0.9]); sprocket.name='sprocket';
      for (let i=0;i<8;i++) {const a=i*Math.PI/4; add(box,white,[side*2.7+Math.cos(a),1.2,1.8+Math.sin(a)],[0.35,0.3,0.35]);}
      for(let level=2;level<=5;level++) { const pod=add(box,light,[side*(3+level*0.45),0.8,1.8-level*0.6],[0.45,0.4,1.8]);pod.name=`weapon-${level}`; }
    }
  }
  if (kind !== 'player' && kind !== 'escort') g.rotation.y = Math.PI;
  return kind==='player'||kind==='escort'||kind==='boss'?g:compactModel(g,`${kind}:${color}`);
}
export function bossModel(style: number): THREE.Group {
  const g = shipModel(['#ffb93a', '#ff438e', '#43e9e2', '#b16cff', '#71ffa7'][style], 'boss');
  g.scale.setScalar(2.3);
  const armor = new THREE.MeshStandardMaterial({color:'#d6e5f3',metalness:0.7,roughness:0.3});
  for(const side of [-1,1]) {const deck=new THREE.Mesh(box,armor);deck.position.set(side*6,0,0);deck.scale.set(6,1.6,9);g.add(deck);}

  const navy = new THREE.MeshStandardMaterial({color:'#203b69',metalness:0.6,roughness:0.35});
  const neon = new THREE.MeshBasicMaterial({color:'#ff48c4'});
  for(const side of [-1,1]) {
    const roof=new THREE.Mesh(hull,navy);roof.position.set(side*6,1.4,-0.8);roof.scale.set(1.2,0.5,1.2);g.add(roof);
    for(let i=0;i<5;i++) {const stripe=new THREE.Mesh(box,neon);stripe.position.set(side*6,1,-3+i*1.4);stripe.scale.set(4,0.15,0.2);g.add(stripe);}
    const thruster=new THREE.Mesh(sphere,neon);thruster.position.set(side*6,0,5);thruster.scale.set(1,0.6,1.8);g.add(thruster);
  }
  const reactor=new THREE.Mesh(sphere,neon);reactor.position.set(0,2,0);reactor.scale.set(1.6,1,1.6);g.add(reactor);
  const material = new THREE.MeshBasicMaterial({ color: '#ffb964' });
  const hoop = new THREE.Mesh(ring, material); hoop.scale.setScalar(3.4 + style * 0.2); hoop.position.y = 1; g.add(hoop);
  for (let i = 0; i < style + 2; i++) {
    const pod = new THREE.Mesh(box, material), a = i * Math.PI * 2 / (style + 2);
    pod.position.set(Math.cos(a) * 4, 0.7, Math.sin(a) * 3); pod.scale.set(0.8, 0.8, 1.8); g.add(pod);
  }
  return compactModel(g,`boss-${style}`);
}
export function disposeModel(g: THREE.Object3D) {
  const materials = new Set<THREE.Material>();
  g.traverse(o => { if (o instanceof THREE.Mesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m); });
  for (const m of materials) m.dispose();
}
