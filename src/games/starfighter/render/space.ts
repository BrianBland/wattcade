import * as THREE from 'three';
import { geometries } from './models';
import { GROUND_SPEED } from '../sim/encounters';
import { biomeParams, mulberry, riverX, cityRoads, type BiomeParams } from './terrain';
import { plated, strata, windowed } from './shading';
/** Horizon haze per biome (carrier sky, city dusk, canyon warm dust, ocean sea mist). */
export const HAZE = ['#8ec9ef', '#2a3a5c', '#c89a86', '#6fa9cf'];
const noise = `float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float cloud(vec2 p){return noise(p)*0.55+noise(p*2.03)*0.28+noise(p*4.07)*0.12+noise(p*8.11)*0.05;}`;
/** Ground colour per biome (0 carrier/cloud sea, 1 city, 2 canyon, 3 ocean fleet), driven by seeded params P. */
const biomeColor = `
  // Water and cloud tops lit from a height-field normal: sun diffuse plus specular glints.
  vec3 lit(vec3 base,vec2 p,float scale,float amp,vec3 wpos,float shine,float gloss){float e=0.6;
    float h0=noise(p*scale+vec2(0.0,time*0.35)),hx=noise((p+vec2(e,0.0))*scale+vec2(0.0,time*0.35)),hz=noise((p+vec2(0.0,e))*scale+vec2(0.0,time*0.35));
    vec3 nrm=normalize(vec3((h0-hx)*amp,1.0,(h0-hz)*amp));vec3 sun=normalize(vec3(-0.45,0.8,-0.4));vec3 v=normalize(cameraPosition-wpos);
    float dif=0.72+0.28*dot(nrm,sun);float spec=pow(max(dot(reflect(-sun,nrm),v),0.0),shine);return base*dif+vec3(1.0,0.97,0.9)*spec*gloss;}
  vec3 biomeColor(float b,vec4 P,vec2 p,float n,vec3 water,float grid,float pulse,vec3 wpos){vec3 c;
  if(b<0.5){c=lit(mix(vec3(0.03,0.28,0.62),vec3(0.74,0.86,0.94),smoothstep(0.32,0.72,n)),p,0.03,6.0,wpos,12.0,0.04);
    if(abs(p.x)<42.0){vec2 pl=abs(fract(p/vec2(6.0,4.0))-0.5);c=vec3(0.065,0.14,0.23)*(0.9+0.15*hash(floor(p/vec2(6.0,4.0))))-0.025*step(0.46,max(pl.x,pl.y))+grid*0.03;
      c-=0.03*smoothstep(0.55,0.8,noise(p*vec2(0.6,0.05)))*step(abs(p.x),12.0);
      float lane=step(abs(p.x),0.25)*step(0.4,fract(p.y/8.0));float edge=step(40.5,abs(p.x));c+=(lane*vec3(0.3,0.7,0.8)+edge*vec3(0.02,0.7,0.85))*(1.0+pulse*0.7);}}
  else if(b<1.5){float grain=noise(p*1.3)*0.04;c=vec3(0.10,0.19,0.25)+n*0.07+grain;bool harbour=abs(p.x)>118.0;if(harbour)c=lit(water*0.8,p,0.06,5.0,wpos,60.0,0.2);
    float rx=abs(mod(p.x-P.y,P.x)-P.x*0.5),ry=abs(mod(p.y-P.w,P.z)-P.z*0.5),road=max(step(rx,2.6),step(ry,3.2));
    c=mix(c,vec3(0.035,0.07,0.12)+grain,road);c=mix(c,vec3(0.2,0.25,0.3)+grain,(1.0-road)*max(step(rx,3.6),step(ry,4.2))); // sidewalks
    c+=step(rx,2.6)*step(ry,5.5)*step(3.2,ry)*step(0.5,fract(p.x*0.9))*vec3(0.25); // crosswalks
    if(!harbour)c+=grid*vec3(0.01,0.05,0.06);
    float dash=step(rx,0.12)*step(0.5,fract(p.y/6.0))*step(4.0,ry);c+=dash*vec3(0.5,0.45,0.2)*(0.6+pulse*0.6);}
  else if(b<2.5){c=mix(vec3(0.27,0.11,0.18),vec3(0.67,0.36,0.24),n);c*=0.92+0.1*smoothstep(0.35,0.65,fract(n*7.0+noise(p*0.05)*0.6)); // strata contours
    float cx=15.0*sin(p.y*P.x+P.y)+7.0*sin(p.y*P.z+P.w),w=11.5+4.0*sin(p.y*0.011+P.y),d=abs(p.x-cx);
    c*=mix(0.72,1.0,smoothstep(w+0.5,w+7.0,d)); // wet banks
    vec3 river=lit(mix(water*0.7,water*0.95,smoothstep(0.0,w,d)),p,0.12,4.0,wpos,70.0,0.3);c=mix(river,c,smoothstep(w-2.5,w+1.5,d));c+=step(0.93,fract(n*12.0))*0.025;c+=step(w-1.2,d)*step(d,w+0.4)*vec3(0.25,0.22,0.18);
    c+=step(0.75,noise(p*vec2(0.5,0.08)+time*vec2(0.0,0.6)))*step(d,w-2.0)*smoothstep(13.0,9.0,w)*vec3(0.35);}
  else{vec3 deep=mix(vec3(0.01,0.1,0.26),vec3(0.03,0.24,0.45),n);float swell=noise(p*vec2(0.04,0.025)+vec2(0.0,time*0.05));float caps=step(0.88,noise(p*vec2(0.45,0.16)+vec2(time*0.1,time*0.6)))*smoothstep(0.45,0.75,swell);
    c=lit(deep*(0.85+0.3*swell),p,0.09,2.0,wpos,220.0,0.08)+caps*vec3(0.2,0.24,0.26);}
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
  const walls=make(geometries.box,windowed(material('#28486a')),1400);
  const roofs=make(geometries.box,plated(material('#7d9cb4')),1400);
  // Soft drop shadows cast away from the sun (key light from -x, -z).
  const shade=make(geometries.box,new THREE.MeshBasicMaterial({color:'#000814',transparent:true,opacity:0.28,depthWrite:false}),900);
  const glassMat=new THREE.MeshBasicMaterial({color:'#28c9ff'}),trimMat=new THREE.MeshBasicMaterial({color:'#ffbb42'});
  const glassBase=glassMat.color.clone(),trimBase=trimMat.color.clone(),white=new THREE.Color('#ffffff');
  const glass=make(geometries.box,glassMat,2400);
  const trim=make(geometries.box,trimMat,1024);
  const domes=make(geometries.sphere,material('#3ba5ba'),160);
  const grass=make(geometries.box,material('#2f6b4a',0.05),160);
  const trees=make(geometries.sphere,material('#3f8f5a',0.05),640);
  const hulls=make(geometries.box,plated(material('#5b6b7c',0.55)),320);
  const decks=make(geometries.box,plated(material('#8c99a6',0.4)),320);
  // Scale anchors: familiar-sized things moving on the ground (parked jets, cars, boats, ships), regular runway lights,
  // and sparse cloud wisps between the ship and the ground, so speed and altitude read correctly.
  const jets=make(geometries.box,material('#d9e4ee',0.3),480);
  const bodies=make(geometries.box,material('#2d3f5c',0.5),480);
  const lamps=make(geometries.box,new THREE.MeshBasicMaterial({color:'#fff1c2'}),1200);
  const runway=make(geometries.box,new THREE.MeshBasicMaterial({color:'#ffffff'}),256);
  const tails=make(geometries.box,new THREE.MeshBasicMaterial({color:'#ff3b55'}),480);
  const wakes=make(geometries.box,new THREE.MeshBasicMaterial({color:'#e9fbff',transparent:true,opacity:0.32,depthWrite:false}),200);
  const wisps=make(geometries.sphere,new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:0.3,depthWrite:false}),48);
  const pools=[shade,stone,rockBox,walls,roofs,glass,trim,domes,grass,trees,hulls,decks,jets,bodies,lamps,tails,wakes,wisps,runway],counts=new Map<THREE.InstancedMesh,number>();
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
      if(r()<0.6){const rows=1+Math.floor(r()*3),xx=side*(30+r()*5);for(let j=0;j<rows;j++){const zz=z-22+j*16+r()*4;
        add(jets,xx,-5.5,zz,1.1,0.55,4.6);add(jets,xx,-5.6,zz+0.7,5,0.18,1.6);add(jets,xx,-5.1,zz+2,0.2,1.2,0.9);}}
      add(walls,side*46,-8,z,12,8,62);add(roofs,side*46,-3.5,z,12,1,62);add(glass,side*40.5,-2.8,z,0.3,0.2,61);
      const towers=1+Math.floor(r()*3);
      for(let j=0;j<towers;j++){
        const height=6+r()*16,zz=z-24+j*(48/towers)+r()*6,xx=side*(47+r()*5);
        add(walls,xx,height/2-3,zz,6+r()*3,height,8+r()*5);add(roofs,xx,height-2.5,zz,8,1,10);shadow(xx,zz,7,9,height+3);
        add(glass,xx-side*3.6,height/2,zz,0.15,height*0.25,6);add(trim,side*42,-2.8,zz,1.5,0.25,5);
        for(let k=0;k<3;k++)add(glass,xx+side*(k*2-2),height+0.6,zz-3.6,0.6,0.7,0.15);
        if(r()<0.4){add(roofs,xx+side*3,height+6,zz,0.6,12,0.6);add(glass,xx+side*3,height+12,zz,2,0.5,2);}
      }
      if(r()<0.25){const xx=side*(58+r()*8);add(roofs,xx,6,z,1,24,1);add(roofs,xx-side*5,17,z,10,0.8,0.8);} // deck crane
    }
  };
  /** One city tile: blocks between the seeded street grid, a low-rise core under the play lane, a varied skyline beyond. */
  const cityTile=(tile:number,z:number,P:BiomeParams)=>{
    const {xs}=cityRoads(P,-130,130);
    for(let b=0;b<xs.length-1;b++){
      const x0=xs[b]+3.2,x1=xs[b+1]-3.2,bw=x1-x0;if(bw<5)continue;
      const r=mulberry(P.seed^(tile*2654435761)^(b*40503)),cx=(x0+x1)/2,core=Math.abs(cx)<40,roll=r();
      if(roll<0.12&&!core){add(grass,cx,-5.95,z,bw,0.1,58);for(let k=0;k<8;k++)add(trees,x0+r()*bw,-4.5,z-28+r()*56,1.6+r(),1.6+r()*1.5,1.6+r());continue;} // park
      if(roll<0.2){add(roofs,cx,-5.9,z,bw,0.2,56);add(domes,cx,-5,z,2.2,1.2,2.2);add(lamps,cx,-4.2,z,0.6,0.6,0.6);continue;} // plaza with a fountain
      let zz=z-30;
      while(zz<z+28){
        const d=Math.min(z+30-zz,8+r()*14),w=Math.max(4,Math.min(bw,6+r()*12)),x=x0+r()*(bw-w)+w/2,cz=zz+d/2;
        const h=core?1.5+r()*4:Math.abs(cx)>90?6+r()*14:8+r()*(r()<0.15?44:24);
        add(walls,x,h/2-6,cz,w,h,d-1.5);add(roofs,x,h-5.5,cz,w+0.8,0.8,d-0.7);shadow(x,cz,w,d-1.5,h);
        if(!core){const face=x>0?x-w/2-0.05:x+w/2+0.05,rows=Math.max(1,Math.floor(h/5));for(let k=0;k<rows;k++)add(glass,face,k*(h/rows)-4,cz,0.15,0.6,d-3);
          if(r()<0.25){add(roofs,x,h+3,cz,0.4,8,0.4);add(lamps,x,h+7,cz,0.5,0.5,0.5);}}
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
      const waveZ=-620+since*1300,waveFade=Math.exp(-since*1.4);uniforms.wave.value=waveZ;uniforms.waveFade.value=waveFade;
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
          add(jets,xr,-5.6,zz,1.8,0.7,4.2);add(roofs,xr,-5,zz+0.5,1.1,0.6,1.6);add(wakes,xr,-5.95,zz+6,2.6,0.05,8);}
        if(b===3)for(let c=0;c<10;c++){
          // The fleet: carriers, battleships and destroyers under way, with wakes.
          const r=mulberry(P.seed^(c*977)),kind=c%5===0?0:c%2?1:2,len=[64,46,26][kind],beam=[13,9,5][kind];
          const travel=anchored(c*210+r()*120-time*(3+r()*3),2048);if(envAt(travel).P!==P)continue;const zz=zAt(travel),xx=(r()-0.5)*180;
          add(hulls,xx,-5.2,zz,beam,2.2,len);shadow(xx,zz,beam,len,4);add(wakes,xx,-5.95,zz+len*0.5+12,beam*0.9,0.05,26);
          if(kind===0){add(decks,xx,-4,zz,beam*1.25,0.4,len*1.02);add(walls,xx+beam*0.45,-1,zz+6,2.4,6,9);add(glass,xx+beam*0.45,1.6,zz+6,2.5,0.4,8);for(let j=0;j<5;j++)add(lamps,xx-beam*0.3,-3.7,zz-len*0.4+j*len*0.2,0.4,0.2,0.4);}
          else{add(decks,xx,-3.9,zz,beam*0.9,0.4,len*0.9);add(walls,xx,-1.4,zz+len*0.05,beam*0.55,5,len*0.22);add(roofs,xx,1.4,zz+len*0.05,beam*0.4,1.2,len*0.12);
            const guns=kind===1?4:2;for(let j=0;j<guns;j++){const gz=zz+(j<guns/2?-1:1)*len*(0.22+0.12*(j%2));add(decks,xx,-3.2,gz,beam*0.45,1,beam*0.45);add(walls,xx,-2.9,gz-beam*0.45,0.35,0.35,beam*0.7);}}}
      }
      // Ground units ride barges at sea.
      for(const g of ground)if(envAt(scroll+160-g.z).b===3){add(hulls,g.x,-5.3,g.z,8,1.8,12);add(decks,g.x,-4.3,g.z,7,0.3,11);add(wakes,g.x,-5.95,g.z+11,5,0.05,10);}
      for(let w=0;w<48;w++){
        // Wisps over open sky and sea: passing cloud below the ship reads as altitude and speed.
        const travel=anchored(w*61,860),{b}=envAt(travel),zz=zAt(travel),xx=(w%2?1:-1)*(b===3?20+(w*29)%90:54+(w*29)%60),size=7+(w*13)%9;
        if(b!==0)continue; // over water, wisps read as ice floes
        add(wisps,xx,(w%4)-1,zz,size*1.3,0.3,size*1.8);
      }
      // Window strips brighten as the wave passes them.
      for(let i=0;i<(counts.get(glass)??0);i++){glass.getMatrixAt(i,probe);glass.setColorAt(i,lightColor.setScalar(0.62+0.38*band(probe.elements[14]))); /* stays ≤ 1: the wave reads without blooming */}
      for(const pool of [runway,glass])if(pool.instanceColor)pool.instanceColor.needsUpdate=true;
      for(const pool of pools){pool.count=counts.get(pool)??0;pool.instanceMatrix.needsUpdate=true;}
    },
    dispose(){for(const pool of pools)pool.dispose();},
  };
}
