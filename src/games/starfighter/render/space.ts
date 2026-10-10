import * as THREE from 'three';
import { geometries } from './models';
const noise = `float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float cloud(vec2 p){return noise(p)*0.55+noise(p*2.03)*0.28+noise(p*4.07)*0.12+noise(p*8.11)*0.05;}`;
/** A repeating carrier runway above cloud layers. Scenery never affects collisions. */
export function createSpace(scene: THREE.Scene) {
  const uniforms = { time: { value: 0 } };
  const clouds = new THREE.Mesh(new THREE.PlaneGeometry(1500, 1500), new THREE.ShaderMaterial({ uniforms,
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `varying vec2 vUv;uniform float time;${noise}
      void main(){vec2 p=vUv*42.0-vec2(0,time*0.014);float n=cloud(p);float billow=smoothstep(0.3,0.7,n);vec3 c=mix(vec3(0.015,0.32,0.68),vec3(0.8,0.94,1.0),billow);gl_FragColor=vec4(c,1.0);}` }));
  clouds.rotation.x=-Math.PI/2; clouds.position.y=-27; scene.add(clouds);
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(82, 320), new THREE.ShaderMaterial({ uniforms,
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `varying vec2 vUv;uniform float time;
      void main(){vec2 p=vec2(vUv.x*82.0,vUv.y*320.0-time*9.0);float seam=step(0.97,fract(p.y/16.0));float lane=step(0.94,fract(p.x/20.5));float dash=step(abs(p.x-41.0),0.3)*step(0.45,fract(p.y/8.0));float edge=step(39.5,abs(p.x-41.0));float arrows=step(0.83,fract((p.y+abs(p.x-41.0)*0.8)/18.0))*step(abs(p.x-41.0),5.0);vec3 c=vec3(0.065,0.14,0.23)+seam*0.045+lane*0.035;c=mix(c,vec3(0.32,0.75,0.85),dash*0.8);c=mix(c,vec3(0.04,0.85,1.0),edge);c+=arrows*vec3(0.03,0.1,0.14);gl_FragColor=vec4(c,1.0);}` }));
  deck.rotation.x=-Math.PI/2; deck.position.set(0,-5,-40); scene.add(deck);
  const metal=new THREE.MeshStandardMaterial({color:'#abc5db',metalness:0.65,roughness:0.35});
  const dark=new THREE.MeshStandardMaterial({color:'#223c64',metalness:0.55,roughness:0.45});
  const glass=new THREE.MeshBasicMaterial({color:'#2792c9'});
  const cyan=new THREE.MeshBasicMaterial({color:'#21ddff'}), gold=new THREE.MeshBasicMaterial({color:'#ffbb36'});
  const sections: THREE.Group[]=[];
  for(let i=0;i<8;i++) {
    const g=new THREE.Group();
    for(const side of [-1,1]) {
      const add=(m:THREE.Material,x:number,y:number,z:number,sx:number,sy:number,sz:number)=>{const mesh=new THREE.Mesh(geometries.box,m);mesh.position.set(side*x,y,z);mesh.scale.set(sx,sy,sz);g.add(mesh);};
      add(dark,44,-7,0,10,10,29);add(metal,44,-1,0,9,2,27);add(cyan,40,0,0,0.3,0.25,26);
      add(dark,48,3,0,5,8+(i%3)*2,8);add(glass,45.4,4+(i%3),0,0.2,1.3,6);add(metal,48,7+(i%3),0,7,1.5,10);add(dark,48,8.5+(i%3),0,4,1.5,6);add(cyan,48,9.4+(i%3),0,2,0.1,4);
      add(gold,44,1,5,1.3,0.2,4);add(gold,44,1,-5,1.3,0.2,4);
      for(let j=0;j<3;j++) add(cyan,45+j*2,5+(i%3),-4.1,0.5,0.5,0.15);
      if(i%2===0) {add(metal,53,12,-3,1,15,1);add(cyan,53,20,-3,2,0.5,2);}
    }
    sections.push(g);scene.add(g);
  }
  // Distant floating service platforms establish a much larger world.
  for(let i=0;i<6;i++) { const g=new THREE.Group(); const body=new THREE.Mesh(geometries.box,dark);body.scale.set(20,5,12);g.add(body);const rim=new THREE.Mesh(geometries.box,cyan);rim.position.y=3;rim.scale.set(20,0.15,12);g.add(rim);g.position.set((i%2?1:-1)*(80+i*5),-14,-90+i*30);scene.add(g); }
  return { update(time:number,_intensity:number,_color:string){uniforms.time.value=time;sections.forEach((g,i)=>{g.position.z=((i*32+time*9)%256)-170;});} };
}
