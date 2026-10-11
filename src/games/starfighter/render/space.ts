import * as THREE from 'three';
import { geometries } from './models';
import { GROUND_SPEED } from '../sim/encounters';
import { biomeParams, mulberry, riverX, cityRoads, type BiomeParams } from './terrain';
import { plated, sceneryWave, strata, windowed } from './shading';
import { cloudTexture, kit } from './kit';
/** Horizon haze per biome (carrier sky, city dusk, canyon warm dust, ocean sea mist). */
export const HAZE = ['#8ec9ef', '#2a3a5c', '#c89a86', '#6fa9cf'];
const noise = `float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float cloud(vec2 p){return noise(p)*0.55+noise(p*2.03)*0.28+noise(p*4.07)*0.12+noise(p*8.11)*0.05;}`;
/** Ground colour per biome (0 carrier/cloud sea, 1 city, 2 canyon, 3 ocean fleet), driven by seeded params P. */
const biomeColor = `
  // Water: layered directional swells + noise chop, Fresnel sky reflection, sharp sun glints, crest subsurface and foam.
  float waveH(vec2 q,float t){return sin(dot(q,vec2(0.12,0.05))+t*1.3)*0.5+sin(dot(q,vec2(-0.07,0.11))+t*1.1)*0.4+sin(dot(q,vec2(0.21,-0.17))+t*2.0)*0.22
    +(noise(q*0.35+vec2(t*0.4,t*0.2))-0.5)*0.6+(noise(q*1.1-vec2(t*0.7,0.0))-0.5)*0.12;}
  vec3 waterShade(vec3 deep,vec3 shallow,float depth,vec2 q,vec3 wpos,float rough,float foam){
    float e=0.35,t=time,h0=waveH(q,t),hx=waveH(q+vec2(e,0.0),t),hz=waveH(q+vec2(0.0,e),t);
    rough*=mix(1.0,0.35,smoothstep(150.0,650.0,length(cameraPosition-wpos))); // calmer with distance: no glitter aliasing
    vec3 nrm=normalize(vec3((h0-hx)/e*rough,1.0,(h0-hz)/e*rough)),v=normalize(cameraPosition-wpos),sun=normalize(vec3(-0.45,0.8,-0.4));
    float fres=0.04+0.96*pow(1.0-max(dot(nrm,v),0.0),5.0);vec3 r=reflect(-v,nrm);
    vec3 sky=mix(uHaze0,vec3(0.32,0.58,0.92),smoothstep(0.05,0.7,r.y));
    vec3 body=mix(shallow,deep,depth)*(0.82+0.22*dot(nrm,sun))+vec3(0.02,0.12,0.12)*smoothstep(0.4,1.0,h0);
    vec3 c=mix(body,sky,clamp(fres*1.5,0.0,0.8));float rs=max(dot(r,sun),0.0);c+=vec3(1.0,0.96,0.86)*(pow(rs,300.0)*0.9+pow(rs,30.0)*0.08);
    float f=clamp(foam+smoothstep(0.95,1.35,h0)*0.4,0.0,1.0)*smoothstep(0.3,0.7,noise(q*0.6+vec2(t*0.3,-t*0.5)));
    return mix(c,vec3(0.86,0.93,0.97),f*0.85);}
  // Cloud sea: domain-warped density, lit by its own gradient toward the sun, bright billowing tops, deep sea in the gaps.
  vec3 cloudSea(vec2 p){vec2 q=p*0.012+vec2(time*0.004,0.0),w=vec2(cloud(q*1.7+vec2(3.1,1.7)),cloud(q*1.7+vec2(8.3,2.8)));
    float d=cloud(q+w*0.8),dl=cloud(q+w*0.8+vec2(-0.012,-0.012)),cov=smoothstep(0.36,0.6,d),light=clamp(0.55+(d-dl)*9.0,0.0,1.0);
    vec3 cl=mix(vec3(0.6,0.68,0.8),vec3(1.0,0.98,0.95),light)*(0.8+0.2*smoothstep(0.5,0.85,d))*(0.93+0.07*noise(p*0.15));
    vec3 c=mix(mix(vec3(0.02,0.13,0.3),vec3(0.05,0.24,0.44),noise(p*0.01)),cl,cov);
    return c+vec3(0.12,0.12,0.1)*(smoothstep(0.36,0.44,d)-smoothstep(0.44,0.54,d));}
  // Flight deck: non-skid plating, tie-downs, edge and foul lines, angled landing lines, arresting wires, catapult tracks,
  // hazard-striped elevators, tyre scuffs. Markings repeat every 256 units of travel.
  vec3 flightDeck(vec2 p,float grid,float pulse){float x=p.x,ax=abs(x),seg=mod(p.y,256.0);
    vec2 pl=abs(fract(p/vec2(6.0,4.0))-0.5);vec3 c=vec3(0.15,0.17,0.2)*(0.92+0.12*hash(floor(p/vec2(6.0,4.0))))*(0.94+0.06*noise(p*4.0));
    c-=0.02*step(0.46,max(pl.x,pl.y));vec2 td=abs(fract(p/3.0)-0.5);c-=0.035*step(length(td),0.07);
    c-=0.05*smoothstep(0.55,0.85,noise(p*vec2(0.5,0.04)))*step(ax,9.0);
    vec3 white=vec3(0.72,0.75,0.78),yellow=vec3(0.78,0.62,0.16);
    c=mix(c,white,step(37.8,ax)*step(ax,38.4));c=mix(c,yellow,step(abs(x+22.0),0.18)*step(0.4,fract(p.y/3.0)));
    float ang=x*0.987+(seg-128.0)*0.158,landing=step(60.0,seg)*step(seg,200.0)*step(0.5,fract(p.y/5.0));
    c=mix(c,white,landing*(step(abs(ang-15.0),0.28)+step(abs(ang+9.0),0.28)));
    for(int i=0;i<4;i++){float wz=150.0+float(i)*5.0;c=mix(c,vec3(0.5),step(abs(seg-wz),0.12)*step(ax,15.0));}
    float cat=step(205.0,seg)*step(seg,250.0);c=mix(c,vec3(0.05),cat*step(abs(ax-16.0),0.2));c-=0.06*cat*step(abs(ax-16.0),2.5)*smoothstep(225.0,205.0,seg);
    float ex=step(28.0,ax)*step(ax,36.0)*step(40.0,seg)*step(seg,60.0),inner=step(28.7,ax)*step(ax,35.3)*step(40.7,seg)*step(seg,59.3);
    c=mix(c,mix(vec3(0.05),yellow,step(0.5,fract((x+p.y)*0.6))),ex*(1.0-inner));
    float lane=step(ax,0.25)*step(0.4,fract(p.y/8.0)),edge=step(40.5,ax);c+=(lane*vec3(0.3,0.7,0.8)+edge*vec3(0.02,0.7,0.85))*(1.0+pulse*0.7);
    return c+grid*0.015;}
  vec3 biomeColor(float b,vec4 P,vec2 p,float n,vec3 water,float grid,float pulse,vec3 wpos){vec3 c;
  if(b<0.5){c=abs(p.x)<42.0?flightDeck(p,grid,pulse):cloudSea(p);}
  else if(b<1.5){float grain=noise(p*1.3)*0.04;c=vec3(0.10,0.19,0.25)+n*0.07+grain;bool harbour=abs(p.x)>240.0;if(harbour)c=waterShade(vec3(0.02,0.14,0.28),vec3(0.05,0.28,0.4),0.7,p,wpos,0.55,smoothstep(122.0,118.5,abs(p.x))*0.8);
    float rx=abs(mod(p.x-P.y,P.x)-P.x*0.5),ry=abs(mod(p.y-P.w,P.z)-P.z*0.5),road=max(step(rx,2.6),step(ry,3.2));if(harbour)road=0.0;
    c=mix(c,vec3(0.035,0.07,0.12)+grain,road);if(!harbour)c=mix(c,vec3(0.2,0.25,0.3)+grain,(1.0-road)*max(step(rx,3.6),step(ry,4.2))); // sidewalks
    if(!harbour)c+=step(rx,2.6)*step(ry,5.5)*step(3.2,ry)*step(0.5,fract(p.x*0.9))*vec3(0.25); // crosswalks
    if(!harbour)c+=grid*vec3(0.01,0.05,0.06);
    float dash=step(rx,0.12)*step(0.5,fract(p.y/6.0))*step(4.0,ry);c+=dash*vec3(0.5,0.45,0.2)*(0.6+pulse*0.6);}
  else if(b<2.5){c=mix(vec3(0.27,0.11,0.18),vec3(0.67,0.36,0.24),n);c*=0.92+0.1*smoothstep(0.35,0.65,fract(n*7.0+noise(p*0.05)*0.6)); // strata contours
    float cx=15.0*sin(p.y*P.x+P.y)+7.0*sin(p.y*P.z+P.w),w=11.5+4.0*sin(p.y*0.011+P.y),d=abs(p.x-cx);
    c*=mix(0.72,1.0,smoothstep(w+0.5,w+7.0,d)); // wet banks
    // River: flows toward the camera; shallow teal at the banks, deep in the channel, foam on banks and in narrow rapids.
    float rapids=smoothstep(11.5,8.5,w)*step(0.72,noise(p*vec2(0.5,0.12)+vec2(0.0,time*1.4)));
    vec3 river=waterShade(vec3(0.02,0.16,0.3),vec3(0.12,0.42,0.42),smoothstep(w,0.0,d),p+vec2(0.0,time*5.0),wpos,0.45,smoothstep(w-1.3,w-0.1,d)*0.7+rapids*0.6);
    c=mix(river,c,smoothstep(w-0.5,w+1.5,d));c+=step(0.93,fract(n*12.0))*0.025;}
  else{float swell=noise(p*vec2(0.012,0.008)+vec2(0.0,time*0.02));float caps=step(0.86,noise(p*vec2(0.35,0.14)+vec2(time*0.1,time*0.6)))*smoothstep(0.5,0.8,swell);
    c=waterShade(vec3(0.01,0.07,0.2),vec3(0.03,0.2,0.36),0.6+0.4*swell,p,wpos,1.0,caps*0.7);}
  return c;}`;
export interface BiomeEnv { switchTravel: number; b0: number; b1: number; seed0: number; seed1: number }
/**
 * Seeded biomes streamed beyond the camera. Each segment (song) has a biome and seed; the next one takes over at
 * `switchTravel` (route distance, snapped to a tile edge), cross-faded in the ground shader. Tiles are generated from
 * (seed, tile index), so a place looks the same each time it scrolls past and the same song gives the same place.
 */
export function createSpace(scene: THREE.Scene) {
  const uniforms={time:{value:0},pulse:{value:0},speed:{value:GROUND_SPEED},wave:{value:-9999},waveFade:{value:0},
    uSwitch:{value:1e9},uB0:{value:0},uB1:{value:0},uP0:{value:new THREE.Vector4()},uP1:{value:new THREE.Vector4()},uHaze0:{value:new THREE.Color(HAZE[0])},uHaze1:{value:new THREE.Color(HAZE[0])}};
  // Objects share the haze through scene fog (same range as the ground).
  scene.fog=new THREE.Fog(HAZE[0],380,1150);const fogTarget=new THREE.Color(HAZE[0]);
  const surface=new THREE.Mesh(new THREE.PlaneGeometry(1500,1800),new THREE.ShaderMaterial({uniforms,
    vertexShader:'varying vec3 world;void main(){world=(modelMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(world,1.0);}',
    fragmentShader:`varying vec3 world;uniform float time;uniform float pulse;uniform float speed;uniform float wave;uniform float waveFade;
    uniform float uSwitch;uniform float uB0;uniform float uB1;uniform vec4 uP0;uniform vec4 uP1;uniform vec3 uHaze0;uniform vec3 uHaze1;${noise}${biomeColor}
    void main(){float travel=160.0-world.z+time*speed;vec2 p=vec2(world.x,travel);float n=cloud(p*0.025);vec3 water=mix(vec3(0.015,0.27,0.62),vec3(0.05,0.7,0.88),n);
    float band=exp(-abs(world.z-wave)/16.0)*waveFade;water+=vec3(0.22,0.32,0.36)*band;float grid=step(0.96,fract(p.x/18.0))+step(0.97,fract(p.y/20.0));
    float k=smoothstep(uSwitch-30.0,uSwitch+30.0,travel);vec3 c=k<0.999?biomeColor(uB0,uP0,p,n,water,grid,pulse,world):vec3(0.0);if(k>0.001)c=mix(c,biomeColor(uB1,uP1,p,n,water,grid,pulse,world),k);
    c+=vec3(0.02,0.05,0.06)*band;float haze=smoothstep(380.0,1150.0,length(cameraPosition-world));c=mix(c,mix(uHaze0,uHaze1,k),haze*0.85);gl_FragColor=vec4(c,1.0);}` }));
  surface.rotation.x=-Math.PI/2;surface.position.set(0,-6,-250);scene.add(surface);
  const material=(color:string,metalness=0.45)=>new THREE.MeshStandardMaterial({color,metalness,roughness:0.4});
  const make=(geo:THREE.BufferGeometry,mat:THREE.Material,count:number)=>{const m=new THREE.InstancedMesh(geo,mat,count);m.frustumCulled=false;m.count=0;scene.add(m);return m;};
  const stone=make(geometries.rock,strata(material('#b67565',0.15)),512);
  const rockBox=make(geometries.box,strata(material('#9c5f55',0.1)),256);
  const walls=make(geometries.box,windowed(material('#28486a')),2400);
  const roofs=make(geometries.box,plated(new THREE.MeshStandardMaterial({color:'#5f7c93',metalness:0.15,roughness:0.8})),2400);
  // Soft drop shadows cast away from the sun (key light from -x, -z).
  const shade=make(geometries.box,new THREE.MeshBasicMaterial({color:'#000814',transparent:true,opacity:0.28,depthWrite:false}),900);
  const glassMat=new THREE.MeshBasicMaterial({color:'#28c9ff'}),trimMat=new THREE.MeshBasicMaterial({color:'#ffbb42'});
  const glassBase=glassMat.color.clone(),trimBase=trimMat.color.clone(),white=new THREE.Color('#ffffff');
  const glass=make(geometries.box,glassMat,2400);
  const trim=make(geometries.box,trimMat,1024);
  const domes=make(geometries.sphere,material('#3ba5ba'),160);
  const grass=make(geometries.box,material('#2f6b4a',0.05),160);
  const trees=make(geometries.sphere,material('#3f8f5a',0.05),640);
  // Kit models (vertex-coloured, plated): ships, boats, barges, parked jets, deck tractors, island towers.
  const K=kit(),kitMat=()=>plated(new THREE.MeshStandardMaterial({vertexColors:true,metalness:0.45,roughness:0.45}));
  const carriers=make(K.carrier,kitMat(),12),battleships=make(K.battleship,kitMat(),16),destroyers=make(K.destroyer,kitMat(),24);
  const boats=make(K.riverBoat,kitMat(),24),barges=make(K.barge,kitMat(),24),tractors=make(K.tractor,kitMat(),96),islands=make(K.island,windowed(new THREE.MeshStandardMaterial({vertexColors:true,metalness:0.4,roughness:0.45})),64);
  // Wakes: additive white V fans (fade baked into vertex colours) so they read as foam on any water.
  const wakes=make(K.wake,new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,opacity:0.5}),96);
  // Cloud banks: soft textured sheets drifting below the ship at several heights (altitude and speed cues).
  const cloudTex=cloudTexture(),clouds=make(new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({map:cloudTex,color:cloudTex?'#ffffff':'#000000',transparent:true,opacity:cloudTex?0.85:0,depthWrite:false,fog:true}),40);
  // Scale anchors: familiar-sized things moving on the ground (parked jets, cars, boats, ships), regular runway lights,
  // and sparse cloud wisps between the ship and the ground, so speed and altitude read correctly.
  const jets=make(K.jet,kitMat(),240);
  const bodies=make(geometries.box,material('#2d3f5c',0.5),480);
  const lamps=make(geometries.box,new THREE.MeshBasicMaterial({color:'#fff1c2'}),1200);
  const runway=make(geometries.box,new THREE.MeshBasicMaterial({color:'#ffffff'}),256);
  const tails=make(geometries.box,new THREE.MeshBasicMaterial({color:'#ff3b55'}),480);
  const pools=[shade,stone,rockBox,walls,roofs,glass,trim,domes,grass,trees,carriers,battleships,destroyers,boats,barges,tractors,islands,jets,bodies,lamps,tails,wakes,clouds,runway],counts=new Map<THREE.InstancedMesh,number>();
  const matrix=new THREE.Object3D(),probe=new THREE.Matrix4(),lightColor=new THREE.Color(),warm=new THREE.Color('#fff1c2');
  const setColor=(pool:THREE.InstancedMesh,c:THREE.Color)=>{const i=(counts.get(pool)??1)-1;if(i>=0)pool.setColorAt(i,c);};
  const add=(pool:THREE.InstancedMesh,x:number,y:number,z:number,sx:number,sy:number,sz:number,angle=0)=>{
    const i=counts.get(pool)??0;if(i>=pool.instanceMatrix.count)return;
    matrix.position.set(x,y,z);matrix.rotation.set(0,angle,0);matrix.scale.set(sx,sy,sz);matrix.updateMatrix();pool.setMatrixAt(i,matrix.matrix);counts.set(pool,i+1);
  };
  const wrap=(v:number,m:number)=>((v%m)+m)%m;
  /** Drop shadow for a box of footprint w×d and height h standing at (x, z). */
  const shadow=(x:number,z:number,w:number,d:number,h:number)=>{if(h<0.5)return;const l=Math.min(14,h*0.45);add(shade,x+l*0.45,-5.96,z+l*0.55,w+l*0.35,0.02,d+l*0.6);};
  let params0:BiomeParams=biomeParams(0,1),params1:BiomeParams=params0,key='';

  /** One carrier tile: deck edge structures, island towers, parked-jet rows, cranes and runway edge lights. */
  const carrierTile=(tile:number,z:number,P:BiomeParams,band:(z:number)=>number)=>{
    for(const side of [-1,1]){
      const r=mulberry(P.seed^(tile*2654435761)^(side>0?0x9e37:0));
      for(let k=0;k<8;k++){const zz=z-28+k*8;add(runway,side*39.2,-5.7,zz,0.45,0.25,0.45);setColor(runway,lightColor.copy(warm).multiplyScalar(0.45+0.55*band(zz)));}
      // Parked jets angled toward the deck edge (wings folded), with a tractor beside some of them.
      if(r()<0.65){const rows=2+Math.floor(r()*3),xx=side*(31+r()*3);for(let j=0;j<rows;j++){const zz=z-24+j*11+r()*2;
        add(jets,xx,-5.95,zz,1.25,1.25,1.25,side*0.55+(r()-0.5)*0.15);if(r()<0.3)add(tractors,xx-side*4,-5.95,zz+1,1.4,1.4,1.4,r()*3);}}
      if(r()<0.25)add(tractors,side*(8+r()*20),-5.95,z+(r()-0.5)*50,1.4,1.4,1.4,r()*6);
      add(walls,side*46,-8,z,12,8,62);add(roofs,side*46,-3.5,z,12,1,62);add(trim,side*40.5,-2.8,z,0.3,0.2,61);
      // Island superstructures (bridge windows, mast, radar) on the deck-edge sponsons, and deck-edge lights.
      const towers=r()<0.5?1:2;
      for(let j=0;j<towers;j++){const sc=0.9+r()*0.6,zz=z-18+j*30+r()*8,xx=side*(48+r()*4);
        add(islands,xx,-4,zz,sc,sc,sc,side>0?Math.PI:0);shadow(xx,zz,5*sc,10*sc,12*sc);add(trim,side*42,-2.8,zz,1.5,0.25,5);}
      if(r()<0.25){const xx=side*(58+r()*8);add(roofs,xx,6,z,1,24,1);add(roofs,xx-side*5,17,z,10,0.8,0.8);} // deck crane
    }
  };
  /** One city tile: blocks between the seeded street grid, a low-rise core under the play lane, a varied skyline beyond. */
  const cityTile=(tile:number,z:number,P:BiomeParams)=>{
    // The city runs out to the haze on both sides (far blocks are single massings, no shadows).
    const {xs}=cityRoads(P,-230,230);
    for(let b=0;b<xs.length-1;b++){
      const x0=xs[b]+3.2,x1=xs[b+1]-3.2,bw=x1-x0;if(bw<5)continue;
      const r=mulberry(P.seed^(tile*2654435761)^(b*40503)),cx=(x0+x1)/2,core=Math.abs(cx)<40,roll=r();
      if(Math.abs(cx)>130){for(let zz=z-30;zz<z+28;zz+=20){const h=5+r()*(r()<0.2?40:18);add(walls,cx,h/2-6,zz+10,bw-r()*4,h,17);add(roofs,cx,h-5.5,zz+10,bw-2,0.7,17.5);}continue;}
      if(roll<0.12&&!core){add(grass,cx,-5.95,z,bw,0.1,58);for(let k=0;k<8;k++)add(trees,x0+r()*bw,-4.5,z-28+r()*56,1.6+r(),1.6+r()*1.5,1.6+r());continue;} // park
      if(roll<0.2){add(roofs,cx,-5.9,z,bw,0.2,56);add(domes,cx,-5,z,2.2,1.2,2.2);add(lamps,cx,-4.2,z,0.6,0.6,0.6);continue;} // plaza with a fountain
      let zz=z-30;
      while(zz<z+28){
        const d=Math.min(z+30-zz,8+r()*14),w=Math.max(4,Math.min(bw,6+r()*12)),x=x0+r()*(bw-w)+w/2,cz=zz+d/2;
        const h=core?1.5+r()*4:Math.abs(cx)>90?6+r()*14:8+r()*(r()<0.15?44:24);
        add(walls,x,h/2-6,cz,w,h,d-1.5);add(roofs,x,h-5.5,cz,w+0.8,0.8,d-0.7);shadow(x,cz,w,d-1.5,h);
        if(!core){if(r()<0.25){add(roofs,x,h+3,cz,0.4,8,0.4);add(lamps,x,h+7,cz,0.5,0.5,0.5);}}
        else if(r()<0.5)add(trim,x,h-5,cz,w*0.7,0.12,0.4);
        zz+=d+(r()<0.3?2:0);
      }
    }
    if(P.highway){const hx=P.highwayX;add(roofs,hx,3,z,8,0.9,64);add(trim,hx-3.6,3.6,z,0.25,0.3,64);add(trim,hx+3.6,3.6,z,0.25,0.3,64);for(const k of [-20,12])add(walls,hx,-1.5,z+k,2.2,9,2.2);}
  };
  /** One canyon tile: rock clusters along the banks, mesas, an occasional arch over the river, and outposts. */
  const canyonTile=(tile:number,z:number,P:BiomeParams,scroll:number)=>{
    const r=mulberry(P.seed^(tile*2654435761)),travel=scroll+160-z,cx=riverX(travel,P),w=riverW(travel,P);
    for(const side of [-1,1]){
      const n=4+Math.floor(r()*5);
      for(let j=0;j<n;j++){const off=w+16+r()*64,xx=cx+side*off,zz=z-30+r()*60,height=4+r()*(off>40?22:10);
        add(stone,xx,height*0.35-6,zz,6+r()*9,height,8+r()*9,r()*6);}
      if(r()<0.22){const xx=cx+side*(w+30+r()*40),zz=z-10+r()*20,h=14+r()*14,wd=14+r()*10;add(rockBox,xx,h/2-6,zz,wd,h,wd*1.2);add(rockBox,xx,h-5.6,zz,wd*0.9,0.8,wd*1.1);shadow(xx,zz,wd,wd*1.2,h);} // mesa
      if(r()<0.12){add(roofs,cx+side*(w+16),-1,z,14,2,18);add(domes,cx+side*(w+16),1,z,5,3,5);add(glass,cx+side*(w+16),2,z,10,0.3,1);} // outpost
    }
    if(r()<0.1){const span=w*2+8;for(const s of [-1,1])add(rockBox,cx+s*(w+4),2,z,5,16,6);add(rockBox,cx,10,z,span+6,3,6);} // arch
  };
  const riverW=(travel:number,P:BiomeParams)=>11.5+4*Math.sin(travel*0.011+P.a);
  return {
    /**
     * `since` = seconds since the last bar line: each bar line sends a light wave from the horizon toward the camera,
     * chasing runway lights, sweeping window strips and rippling water. `env` places the next biome along the route.
     * `ground` = ground-unit positions (they ride barges at sea).
     */
    update(time:number,_intensity:number,_color:string,beat=0,bar=0,since=9,env?:BiomeEnv,ground:Array<{x:number;z:number}>=[]){
      uniforms.time.value=time;uniforms.pulse.value=bar*0.8+beat*0.2;
      const waveZ=-620+since*1300,waveFade=Math.exp(-since*1.4);uniforms.wave.value=waveZ;uniforms.waveFade.value=waveFade;sceneryWave.value.set(waveZ,waveFade);
      const band=(z:number)=>Math.exp(-Math.abs(z-waveZ)/16)*waveFade;
      const e=env??{switchTravel:1e9,b0:0,b1:0,seed0:1,seed1:1},k=`${e.b0}:${e.seed0}:${e.b1}:${e.seed1}`;
      if(k!==key){key=k;params0=biomeParams(e.b0,e.seed0);params1=biomeParams(e.b1,e.seed1);}
      uniforms.uSwitch.value=e.switchTravel;uniforms.uB0.value=e.b0;uniforms.uB1.value=e.b1;
      uniforms.uHaze0.value.set(HAZE[e.b0]??HAZE[0]);uniforms.uHaze1.value.set(HAZE[e.b1]??HAZE[0]);
      // Object fog follows the biome under the ship, easing across the change.
      fogTarget.set(HAZE[(time*GROUND_SPEED+126)>=e.switchTravel?e.b1:e.b0]??HAZE[0]);(scene.fog as THREE.Fog).color.lerp(fogTarget,0.02);
      uniforms.uP0.value.set(params0.u[0],params0.u[1],params0.u[2],params0.u[3]);uniforms.uP1.value.set(params1.u[0],params1.u[1],params1.u[2],params1.u[3]);
      glassMat.color.copy(glassBase).lerp(white,bar*0.12+beat*0.03);trimMat.color.copy(trimBase).lerp(white,bar*0.12);counts.clear();
      const scroll=time*GROUND_SPEED,first=Math.floor(scroll/64),fraction=scroll%64;
      // World-anchored position for a mover at route offset `at`: it stays put on the ground (plus its own motion) and
      // wraps behind the camera / beyond the horizon, never in view.
      const anchored=(at:number,span:number)=>scroll-10+wrap(at-scroll+10,span);
      const zAt=(travel:number)=>160-(travel-scroll),envAt=(travel:number)=>travel>=e.switchTravel?{b:e.b1,P:params1}:{b:e.b0,P:params0};
      for(let i=0;i<16;i++){
        const tile=first+i,z=160-i*64+fraction,{b,P}=envAt(tile*64);
        if(b===0)carrierTile(tile,z,P,band);else if(b===1)cityTile(tile,z,P);else if(b===2)canyonTile(tile,z,P,scroll);
      }
      // World-placed movers: wrap far beyond the horizon or behind the camera; drawn only where their biome is.
      for(const [b,P] of [[e.b0,params0],[e.b1,params1]] as const){
        if(b===1){const {xs}=cityRoads(P,-110,110);for(const road of xs)for(const dir of [-1,1])for(let c=0;c<24;c++){
          // Traffic on the north-south streets: one lane each way, headlights forward, taillights back.
          const lane=road+dir*1.4,travel=anchored(c*43+road*3.7+P.seed%97-dir*time*9,1024);if(envAt(travel).b!==1||envAt(travel).P!==P)continue;const zz=zAt(travel);
          add(bodies,lane,-5.4,zz,1.3,0.8,2.6);add(lamps,lane,-5.2,zz+dir*1.4,1,0.25,0.15);add(tails,lane,-5.2,zz-dir*1.4,1,0.25,0.15);}
          if(P.highway)for(let c=0;c<20;c++){const dir=c%2?1:-1,travel=anchored(c*51-dir*time*16,1024);if(envAt(travel).P!==P)continue;const zz=zAt(travel),lane=P.highwayX+dir*1.8;
            add(bodies,lane,4,zz,1.3,0.8,2.6);add(lamps,lane,4.2,zz+dir*1.4,1,0.25,0.15);add(tails,lane,4.2,zz-dir*1.4,1,0.25,0.15);}}
        if(b===2)for(let c=0;c<8;c++){
          // Boats on the river, each with a white wake.
          const travel=anchored(c*128+P.seed%211-time*5,1024);if(envAt(travel).P!==P)continue;const zz=zAt(travel),xr=riverX(travel,P)+(c%2?3:-3);
          add(boats,xr,-6,zz,1.3,1.3,1.3,c%3?0:Math.PI);add(wakes,xr,-5.9,zz+(c%3?3.5:-3.5),3.2,1,c%3?7:-7);}
        if(b===3)for(let c=0;c<10;c++){
          // The fleet: carriers, battleships and destroyers under way, with wakes.
          const r=mulberry(P.seed^(c*977)),kind=c%5===0?0:c%2?1:2,len=[64,46,26][kind],beam=[13,9,5][kind];
          const travel=anchored(c*210+r()*120-time*(3+r()*3),2048);if(envAt(travel).P!==P)continue;const zz=zAt(travel),xx=(r()-0.5)*180;
          const heading=(r()-0.5)*0.25,pool=[carriers,battleships,destroyers][kind];
          add(pool,xx,-6,zz,1,1,1,heading);shadow(xx,zz,beam,len,4);
          add(wakes,xx-Math.sin(heading)*len*0.45,-5.9,zz+Math.cos(heading)*len*0.45,beam*1.1,1,len*0.45,heading);
          if(kind===0)for(let j=0;j<5;j++)add(jets,xx-2+(j%2)*3,-1.5,zz-20+j*7,1.1,1.1,1.1,heading+0.6);}
      }
      // Ground units ride barges at sea.
      for(const g of ground)if(envAt(scroll+160-g.z).b===3){add(barges,g.x,-6,g.z,1,1,1);add(wakes,g.x,-5.9,g.z+6.5,5,1,3);}
      for(let w=0;w<40;w++){
        // Cloud banks below the ship over the cloud sea, at three heights for parallax; a few drift over the deck.
        const travel=anchored(w*67+(w%3)*23,1400),{b}=envAt(travel);if(b!==0)continue;
        const zz=zAt(travel)+time*(w%3)*1.5,layer=w%3,xx=(w%2?1:-1)*(w%7===0?10+(w*13)%25:50+(w*29)%90),size=26+(w*17)%22;
        add(clouds,xx,-3.5+layer*3.2,zz,size*1.6,1,size,(w*0.37)%3.14);
      }
      // Window strips brighten as the wave passes them.
      for(let i=0;i<(counts.get(glass)??0);i++){glass.getMatrixAt(i,probe);glass.setColorAt(i,lightColor.setScalar(0.6+0.25*band(probe.elements[14]))); /* stays ≤ 1: the wave reads without blooming */}
      for(const pool of [runway,glass])if(pool.instanceColor)pool.instanceColor.needsUpdate=true;
      for(const pool of pools){pool.count=counts.get(pool)??0;pool.instanceMatrix.needsUpdate=true;}
    },
    dispose(){for(const pool of pools)pool.dispose();},
  };
}
