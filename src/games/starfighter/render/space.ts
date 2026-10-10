import * as THREE from 'three';
import { geometries } from './models';
const noise = `float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float cloud(vec2 p){return noise(p)*0.55+noise(p*2.03)*0.28+noise(p*4.07)*0.12+noise(p*8.11)*0.05;}`;
/** Stream spatial tiles beyond the camera: carrier → neon city → canyon waterways. */
export function createSpace(scene: THREE.Scene) {
  const uniforms={time:{value:0}};
  const surface=new THREE.Mesh(new THREE.PlaneGeometry(1500,1800),new THREE.ShaderMaterial({uniforms,
    vertexShader:'varying vec3 world;void main(){world=(modelMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(world,1.0);}',
    fragmentShader:`varying vec3 world;uniform float time;${noise}
    void main(){float travel=160.0-world.z+time*9.0;float biome=mod(floor(travel/512.0),3.0);vec2 p=vec2(world.x,travel);float n=cloud(p*0.025);vec3 water=mix(vec3(0.015,0.27,0.62),vec3(0.05,0.7,0.88),n);float grid=step(0.96,fract(p.x/18.0))+step(0.97,fract(p.y/20.0));vec3 c;
    if(biome<0.5){c=mix(vec3(0.03,0.28,0.62),vec3(0.8,0.94,1.0),smoothstep(0.32,0.72,n));if(abs(p.x)<42.0){c=vec3(0.065,0.14,0.23)+grid*0.04;float lane=step(abs(p.x),0.25)*step(0.4,fract(p.y/8.0));float edge=step(40.5,abs(p.x));c+=lane*vec3(0.3,0.7,0.8)+edge*vec3(0.02,0.7,0.85);}}
    else if(biome<1.5){c=vec3(0.10,0.21,0.27)+n*0.09;if(abs(p.x)>90.0)c=water;float road=step(abs(mod(p.x+9.0,36.0)-18.0),3.0)+step(abs(mod(p.y+8.0,64.0)-32.0),4.0);c=mix(c,vec3(0.035,0.08,0.15),min(1.0,road));c+=grid*vec3(0.01,0.07,0.08);}
    else{c=mix(vec3(0.27,0.11,0.18),vec3(0.67,0.36,0.24),n);float river=abs(p.x-sin(p.y*0.016)*15.0);c=mix(water,c,smoothstep(11.0,15.0,river));c+=step(0.93,fract(n*12.0))*0.025;}
    gl_FragColor=vec4(c,1.0);}` }));
  surface.rotation.x=-Math.PI/2;surface.position.set(0,-6,-250);scene.add(surface);
  const material=(color:string,metalness=0.45)=>new THREE.MeshStandardMaterial({color,metalness,roughness:0.4});
  const make=(geo:THREE.BufferGeometry,mat:THREE.Material,count:number)=>{const m=new THREE.InstancedMesh(geo,mat,count);m.frustumCulled=false;m.count=0;scene.add(m);return m;};
  const stone=make(geometries.rock,material('#b67565',0.15),256);
  const walls=make(geometries.box,material('#28486a'),768);
  const roofs=make(geometries.box,material('#9ebed1'),768);
  const glass=make(geometries.box,new THREE.MeshBasicMaterial({color:'#28c9ff'}),1536);
  const trim=make(geometries.box,new THREE.MeshBasicMaterial({color:'#ffbb42'}),768);
  const domes=make(geometries.sphere,material('#3ba5ba'),128);
  const pools=[stone,walls,roofs,glass,trim,domes],counts=new Map<THREE.InstancedMesh,number>();
  const matrix=new THREE.Object3D();
  const add=(pool:THREE.InstancedMesh,x:number,y:number,z:number,sx:number,sy:number,sz:number,angle=0)=>{
    const i=counts.get(pool)??0;if(i>=pool.instanceMatrix.count)return;
    matrix.position.set(x,y,z);matrix.rotation.set(0,angle,0);matrix.scale.set(sx,sy,sz);matrix.updateMatrix();pool.setMatrixAt(i,matrix.matrix);counts.set(pool,i+1);
  };
  return {
    update(time:number,_intensity:number,_color:string){
      uniforms.time.value=time;counts.clear();const scroll=time*9,first=Math.floor(scroll/64),fraction=scroll%64;
      for(let i=0;i<16;i++) {
        const tile=first+i,z=160-i*64+fraction,biome=Math.floor(tile/8)%3;
        for(const side of [-1,1]) {
          if(biome===0) {
            add(walls,side*46,-8,z,12,8,62);add(roofs,side*46,-3.5,z,12,1,62);add(glass,side*40.5,-2.8,z,0.3,0.2,61);
            for(let j=0;j<3;j++) {
              const height=8+(tile+j)%3*5,zz=z-20+j*20;
              add(walls,side*49,height/2-3,zz,7,height,10);add(roofs,side*49,height-2.5,zz,9,1,12);
              add(walls,side*49,height,zz,5,4,7);add(glass,side*45.4,height/2,zz,0.15,2,7);
              add(trim,side*42,-2.8,zz,1.5,0.25,5);
              for(let k=0;k<3;k++)add(glass,side*(47+k*2),height+1,zz-3.6,0.6,0.7,0.15);
              if(j===tile%3){add(roofs,side*53,height+6,zz,0.6,12,0.6);add(glass,side*53,height+12,zz,2,0.5,2);}
            }
            if(tile%3===0) {add(walls,side*80,-9,z,28,5,22);add(glass,side*80,-6,z,28,0.15,22);}
          } else if(biome===1) {
            for(let j=0;j<4;j++) {
              const xx=side*(50+j%2*28),zz=z-22+Math.floor(j/2)*30,height=8+(tile*7+j*11)%25;
              add(walls,xx,height/2-6,zz,12,height,16);add(roofs,xx,height-5.5,zz,14,1,18);
              add(walls,xx,height-3,zz,8,5,11);add(glass,xx,height-0.4,zz,7,0.2,10);
              for(let k=0;k<5;k++){add(glass,xx-side*6.1,k*height/6-3,zz,0.15,0.7,13);add(trim,xx,height-5,zz-8.1,9,0.5,0.15);}
              add(roofs,xx+side*5,height+1,zz,0.5,12,0.5);
            }
            if(tile%2===0){add(walls,0,-7,z,64,3,12);for(const x of [-24,24])add(roofs,x,-2,z,3,9,16);add(glass,0,-4.8,z+6,64,0.3,0.2);}
            else {add(domes,side*78,0,z,12,8,12);add(glass,side*78,2,z,24,0.2,1);}
          } else {
            for(let j=0;j<6;j++){const xx=side*(52+j%3*18),zz=z-24+Math.floor(j/3)*30,height=6+(tile*3+j*7)%18;add(stone,xx,height*0.35-6,zz,9+j%3*4,height,12+(j%2)*5,tile*0.7+j);}
            if(tile%3===0){add(roofs,side*38,-1,z,18,2,24);add(domes,side*38,1,z,7,4,7);add(glass,side*38,2,z,13,0.3,1);}
          }
        }
      }
      for(const pool of pools){pool.count=counts.get(pool)??0;pool.instanceMatrix.needsUpdate=true;}
    },
    dispose(){for(const pool of pools)pool.dispose();},
  };
}
