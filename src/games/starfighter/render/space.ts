import * as THREE from 'three';
import { geometries } from './models';
import { GROUND_SPEED } from '../sim/encounters';
import { isOpenBiome } from '../sim/segments';
import { biomeParams, mulberry, riverX, cityRoads, seaIslands, type BiomeParams, type SeaIsland } from './terrain';
import { curtain, foliage, lawn, plated, sceneryMusic, sceneryPose, sceneryWave, strata, windowed } from './shading';
import { cloudTexture, kit } from './kit';
/** Horizon haze per biome (carrier sky, city dusk, canyon warm dust, ocean sea mist, polar white, volcanic smoke). */
export const HAZE = ['#8ec9ef', '#2a3a5c', '#c89a86', '#6fa9cf', '#8ea6ba', '#3a1d17'];
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
    float fres=0.04+0.96*pow(clamp(1.0-dot(nrm,v),0.0,1.0),5.0);vec3 r=reflect(-v,nrm);
    vec3 sky=mix(uHaze0,vec3(0.32,0.58,0.92),smoothstep(0.05,0.7,r.y));
    vec3 body=mix(shallow,deep,depth)*(0.82+0.22*dot(nrm,sun))+vec3(0.02,0.12,0.12)*smoothstep(0.4,1.0,h0);
    vec3 c=mix(body,sky,clamp(fres*1.5,0.0,0.8));float rs=clamp(dot(r,sun),0.0,1.0);c+=vec3(1.0,0.96,0.86)*(pow(rs,300.0)*0.55+pow(rs,30.0)*0.07);
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
  // Voronoi in cell units: x = distance to the nearest cell border, yz = that cell's id.
  vec3 voro(vec2 g){vec2 i=floor(g),f=fract(g);float d1=9.0,d2=9.0;vec2 id=vec2(0.0);
    for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 o=vec2(float(x),float(y));vec2 h=vec2(hash(i+o),hash(i+o+vec2(17.3,5.1)));vec2 r=o+0.05+h*0.9-f;float d=dot(r,r);
      if(d<d1){d2=d1;d1=d;id=i+o;}else if(d<d2)d2=d;}
    return vec3(sqrt(d2)-sqrt(d1),id);}
  // Arctic sea ice: snow-covered floes with blue-ice rims, pressure ridges and wind drifts; dark leads (some skinned with
  // grey new ice) and open pools that mirror a slow aurora, brighter with the music.
  vec3 arctic(vec2 p,vec4 P,vec3 wpos,float pulse){
    vec2 q=p+P.xy,wq=q+vec2(noise(q*0.01),noise(q*0.01+vec2(5.2,1.3)))*45.0;
    vec3 v=voro(wq/P.z);float edge=v.x*P.z,vis=smoothstep(0.52,0.7,noise(q*0.015+v.yz*0.37)),tone=hash(v.yz+vec2(6.3,2.9));
    vec3 aur=mix(vec3(0.1,0.85,0.55),vec3(0.55,0.25,0.9),noise(p*0.004+vec2(time*0.03,0.0)))*(0.14+0.12*pulse)*smoothstep(0.35,0.75,noise(p*0.006-vec2(0.0,time*0.02)));
    vec3 water=waterShade(vec3(0.01,0.04,0.09),vec3(0.03,0.12,0.18),0.8,p,wpos,0.35,0.0)+aur;
    // Snow: grey-blue shading at three scales, sastrugi streaks, blue ice where floes meet, pressure ridges on some cracks.
    float n1=noise(q*0.008),n2=noise(q*0.05),n3=noise(q*0.4);
    // Kept a cool mid blue-grey (not white) so pink and white enemy fire stays readable over the ice.
    vec3 snow=mix(vec3(0.2,0.25,0.33),vec3(0.38,0.43,0.5),0.35+0.4*n1+0.25*n2)*(0.94+0.08*n3); // linear (≈ 0.5–0.7 on screen)
    // Each floe has its own surface: mostly snow, some wind-scoured blue ice, some grey first-year ice.
    snow=tone<0.18?mix(snow,vec3(0.1,0.24,0.36),0.7):tone<0.3?mix(snow,vec3(0.17,0.2,0.24),0.6):snow*(0.92+0.1*tone);
    snow*=0.96+0.05*sin(dot(q,vec2(0.8,0.35))*1.4+n2*8.0);
    snow=mix(snow,vec3(0.18,0.34,0.46),smoothstep(5.0,1.2,edge)*vis*0.45);
    float ridge=step(0.6,hash(v.yz+vec2(1.3,2.2)))*vis;snow+=vec3(0.05)*smoothstep(0.8,0.0,abs(edge-3.4))*ridge;snow-=vec3(0.09,0.07,0.05)*smoothstep(0.7,0.0,abs(edge-4.3))*ridge;
    float crack=smoothstep(0.6,0.15,edge)*vis;
    vec3 c=mix(snow,mix(water,vec3(0.12,0.16,0.2),0.5),crack);
    // Open water: meandering leads and the odd polynya, skinned with grey new ice at the edges.
    float lead=smoothstep(0.03,0.012,abs(noise(q*0.0035+vec2(2.0,7.0))-0.5)),poly=smoothstep(0.1,0.05,hash(v.yz+vec2(3.1,0.7)))*smoothstep(0.55,0.75,noise(q*0.01+v.yz));
    float open=max(lead,poly);
    return mix(c,mix(water,vec3(0.14,0.18,0.22),0.3*smoothstep(0.6,1.0,open)*n2),open);}
  // Lava fields: cracked basalt plates whose seams glow and pulse on the beat, ash drifts, and a molten river along the
  // route with a crust that drifts downstream and banks that glow.
  vec3 lavaField(vec2 p,vec4 P,float pulse){
    vec2 wq=p+vec2(noise(p*0.02),noise(p*0.02+vec2(3.7,8.1)))*18.0;
    vec3 v=voro(wq/16.0);float edge=v.x*16.0;
    vec3 c=vec3(0.075,0.062,0.06)*(0.7+0.55*noise(p*0.3))+vec3(0.035,0.022,0.018)*hash(v.yz);
    // Hot zones drift slowly; elsewhere the seams have cooled. Ash blankets dim the cracks beneath.
    float hot=smoothstep(0.5,0.78,noise(p*0.012+vec2(0.0,time*0.02))),ashc=smoothstep(0.55,0.75,noise(p*0.03+9.0));
    float glow=smoothstep(0.75,0.0,edge)*(0.12+0.88*hot)*(0.45+0.55*hash(v.yz+vec2(2.0,4.0)))*(1.0-ashc*0.9);
    c-=vec3(0.03)*smoothstep(0.6,0.0,edge)*(1.0-hot);
    c=mix(c,vec3(0.24,0.22,0.21)*(0.85+0.2*noise(p*0.4)),ashc*0.7);
    c+=vec3(1.0,0.35,0.06)*glow*(0.85+0.4*pulse);
    float cx=15.0*sin(p.y*P.x+P.y)+7.0*sin(p.y*P.z+P.w),w=8.5+3.0*sin(p.y*0.013+P.y),d=abs(p.x-cx);
    float flow=noise(p*vec2(0.25,0.06)+vec2(0.0,time*1.2)),crust=smoothstep(0.55,0.7,noise(p*vec2(0.12,0.05)+vec2(0.0,time*0.8)));
    vec3 molten=mix(mix(vec3(1.0,0.42,0.05),vec3(1.0,0.82,0.3),flow)*(0.9+0.35*pulse),vec3(0.18,0.07,0.04),crust*0.85);
    c=mix(c,molten,smoothstep(w+0.5,w-1.5,d));
    return c+vec3(0.6,0.15,0.02)*smoothstep(w+9.0,w,d)*0.35;}
  // Ocean islands (uIsl: x, y in biome coords, radius, kind 0 jungle / 1 atoll / 2 volcano): the nearest coast wins.
  // e > 0 is land (0 at the shore); a little below 0 is shallow water. Noise only for islands near this point.
  vec3 islandShade(vec3 water,vec2 p){float best=-9.0;float kind=0.0,lagoon=0.0;
    for(int i=0;i<16;i++){vec4 I=uIsl[i];if(I.z<=0.0)continue;vec2 d=p-I.xy;float dist=length(d);if(dist>I.z*1.6)continue;
      float wob=(noise(p*0.035+I.xy*0.013)-0.5)*0.32+(noise(p*0.12)-0.5)*0.07;
      float e=I.w>0.5&&I.w<1.5?(I.z*0.22-abs(dist-I.z*0.78))/I.z+wob*0.5:1.0-dist/I.z+wob;
      if(e>best){best=e;kind=I.w;lagoon=I.w>0.5&&I.w<1.5&&dist<I.z*0.78?1.0:0.0;}}
    if(best<-0.6)return water;
    float sh=max(smoothstep(-0.55,0.0,best),lagoon*0.85);
    vec3 c=mix(water,vec3(0.08,0.58,0.62)*(0.88+0.14*noise(p*0.2)),sh*0.85);
    vec3 sand=mix(vec3(0.62,0.55,0.42),vec3(0.86,0.78,0.58),smoothstep(0.0,0.03,best));
    vec3 inland=kind>1.5?mix(vec3(0.24,0.22,0.2),vec3(0.36,0.3,0.24),noise(p*0.15)):mix(vec3(0.18,0.38,0.17),vec3(0.32,0.5,0.24),noise(p*0.1))*(0.85+0.2*noise(p*0.6));
    if(kind>0.5&&kind<1.5)inland=mix(sand,vec3(0.3,0.5,0.25),0.6*noise(p*0.2));
    c=mix(c,sand,step(0.0,best));c=mix(c,inland,smoothstep(0.05,0.14,best));
    float foam=smoothstep(0.03,0.0,abs(best+0.012))*(0.55+0.45*noise(p*0.6+vec2(time*0.4,-time*0.3)));
    return mix(c,vec3(0.92,0.96,0.98),foam*0.85);}
  vec3 biomeColor(float b,vec4 P,vec2 p,float n,vec3 water,float grid,float pulse,vec3 wpos){vec3 c;
  if(b<0.5){c=abs(p.x)<42.0?flightDeck(p,grid,pulse):cloudSea(p);}
  else if(b<1.5){float grain=noise(p*1.3)*0.04;c=vec3(0.10,0.19,0.25)+n*0.07+grain;bool harbour=false; // the city fills every direction (turns would otherwise drift it over water)if(harbour)c=waterShade(vec3(0.02,0.14,0.28),vec3(0.05,0.28,0.4),0.7,p,wpos,0.55,smoothstep(122.0,118.5,abs(p.x))*0.8);
    float rx=abs(mod(p.x-P.y,P.x)-P.x*0.5),ry=abs(mod(p.y-P.w,P.z)-P.z*0.5),road=max(step(rx,2.6),step(ry,3.2));if(harbour)road=0.0;
    c=mix(c,vec3(0.035,0.07,0.12)+grain,road);if(!harbour)c=mix(c,vec3(0.2,0.25,0.3)+grain,(1.0-road)*max(step(rx,3.6),step(ry,4.2))); // sidewalks
    if(!harbour)c+=step(rx,2.6)*step(ry,5.5)*step(3.2,ry)*step(0.5,fract(p.x*0.9))*vec3(0.25); // crosswalks
    if(!harbour)c+=grid*vec3(0.01,0.05,0.06);
    float dash=step(rx,0.12)*step(0.5,fract(p.y/6.0))*step(4.0,ry);c+=dash*vec3(0.5,0.45,0.2)*(0.6+pulse*0.6);}
  else if(b<2.5){c=mix(vec3(0.27,0.11,0.18),vec3(0.67,0.36,0.24),n);c*=0.92+0.1*smoothstep(0.35,0.65,fract(n*7.0+noise(p*0.05)*0.6)); // strata contours
    c*=0.93+0.1*noise(p*0.9)+0.03*sin(p.x*0.7+p.y*0.25+noise(p*0.08)*7.0); // grit and wind ripples
    c=mix(c,c*0.7,step(0.94,hash(floor(p*0.8)))*0.7);c=mix(c,vec3(0.78,0.55,0.4),smoothstep(0.62,0.8,noise(p*0.03+7.0))*0.25); // pebbles, pale sand drifts
    float cx=15.0*sin(p.y*P.x+P.y)+7.0*sin(p.y*P.z+P.w),w=11.5+4.0*sin(p.y*0.011+P.y),d=abs(p.x-cx);
    c*=mix(0.72,1.0,smoothstep(w+0.5,w+7.0,d)); // wet banks
    // River: flows toward the camera; shallow teal at the banks, deep in the channel, foam on banks and in narrow rapids.
    float rapids=smoothstep(11.5,8.5,w)*step(0.72,noise(p*vec2(0.5,0.12)+vec2(0.0,time*1.4)));
    vec3 river=waterShade(vec3(0.02,0.16,0.3),vec3(0.12,0.42,0.42),smoothstep(w,0.0,d),p+vec2(0.0,time*5.0),wpos,0.45,smoothstep(w-1.3,w-0.1,d)*0.7+rapids*0.6);
    c=mix(river,c,smoothstep(w-0.5,w+1.5,d));c+=step(0.93,fract(n*12.0))*0.025;}
  else if(b<3.5){float swell=noise(p*vec2(0.012,0.008)+vec2(0.0,time*0.02));float caps=step(0.86,noise(p*vec2(0.35,0.14)+vec2(time*0.1,time*0.6)))*smoothstep(0.5,0.8,swell);
    c=waterShade(vec3(0.01,0.07,0.2),vec3(0.03,0.2,0.36),0.6+0.4*swell,p,wpos,1.0,caps*0.7);c=islandShade(c,p);}
  if(b>3.5&&b<4.5)c=arctic(p,P,wpos,pulse);else if(b>4.5)c=lavaField(p,P,pulse);
  return c;}`;
export interface Frame { x: number; z: number; h: number; s: number; biome: number; seed: number }
/** Ship pose (route point), the current and next biome frames, and route samples ahead (world x,z pairs). */
export interface BiomeEnv { pose: { x: number; z: number; h: number }; f0: Frame; f1: Frame; routeAhead: number[] }
const fwdOf = (h: number) => [-Math.sin(h), -Math.cos(h)], rightOf = (h: number) => [Math.cos(h), -Math.sin(h)];
const ISO = isOpenBiome;
/**
 * Seeded biomes streamed beyond the camera. Each segment (song) has a biome and seed; the next one takes over at
 * `switchTravel` (route distance, snapped to a tile edge), cross-faded in the ground shader. Tiles are generated from
 * (seed, tile index), so a place looks the same each time it scrolls past and the same song gives the same place.
 */
export function createSpace(scene: THREE.Scene) {
  const uniforms={time:{value:0},pulse:{value:0},speed:{value:GROUND_SPEED},wave:{value:-9999},waveFade:{value:0},
    uPose:{value:new THREE.Vector4()},uF0:{value:new THREE.Vector4()},uF1:{value:new THREE.Vector4()},uB0:{value:0},uB1:{value:0},uP0:{value:new THREE.Vector4()},uP1:{value:new THREE.Vector4()},uHaze0:{value:new THREE.Color(HAZE[0])},uHaze1:{value:new THREE.Color(HAZE[0])},uIsl:{value:Array.from({length:16},()=>new THREE.Vector4())}};
  // Objects share the haze through scene fog (same range as the ground).
  scene.fog=new THREE.Fog(HAZE[0],380,1150);const fogTarget=new THREE.Color(HAZE[0]);
  // Anything past the drawn world (a lowered camera looking far ahead) shows the haze, never a black strip.
  scene.background=(scene.fog as THREE.Fog).color;
  // The ground never outputs a negative colour (the bloom would turn it into NaN and blank the frame).
  const surface=new THREE.Mesh(new THREE.PlaneGeometry(1500,1800),new THREE.ShaderMaterial({uniforms,
    vertexShader:'varying vec3 world;void main(){world=(modelMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(world,1.0);}',
    fragmentShader:`varying vec3 world;uniform float time;uniform float pulse;uniform float speed;uniform float wave;uniform float waveFade;
    uniform float uB0;uniform float uB1;uniform vec4 uP0;uniform vec4 uP1;uniform vec3 uHaze0;uniform vec3 uHaze1;uniform vec4 uIsl[16];uniform vec4 uPose;uniform vec4 uF0;uniform vec4 uF1;${noise}${biomeColor}
    vec2 fwdV(float h){return vec2(-sin(h),-cos(h));} vec2 rightV(float h){return vec2(cos(h),-sin(h));}
    // Biome coords: open biomes (city, ocean) use world axes; straight ones (carrier, canyon) their frame (lateral, route distance).
    vec2 frameP(float b,vec4 F,vec2 W){if(abs(b-1.0)<0.5||abs(b-3.0)<0.5||abs(b-4.0)<0.5)return vec2(W.x,-W.y);vec2 d=W-F.xy;return vec2(dot(d,rightV(F.z)),dot(d,fwdV(F.z))+F.w);}
    vec3 shadeAt(float b,vec4 P,vec2 p,float band){float n=cloud(p*0.025);vec3 water=mix(vec3(0.015,0.27,0.62),vec3(0.05,0.7,0.88),n)+vec3(0.22,0.32,0.36)*band;
      float grid=step(0.96,fract(p.x/18.0))+step(0.97,fract(p.y/20.0));return biomeColor(b,P,p,n,water,grid,pulse,world);}
    void main(){float ahead=34.0-world.z;vec2 W=uPose.xy+rightV(uPose.z)*world.x+fwdV(uPose.z)*ahead;
    float band=exp(-abs(world.z-wave)/16.0)*waveFade;
    float k=smoothstep(-30.0,30.0,dot(W-uF1.xy,fwdV(uF1.z)));vec3 c=k<0.999?shadeAt(uB0,uP0,frameP(uB0,uF0,W),band):vec3(0.0);if(k>0.001)c=mix(c,shadeAt(uB1,uP1,frameP(uB1,uF1,W),band),k);
    c+=vec3(0.02,0.05,0.06)*band;float haze=smoothstep(380.0,1150.0,length(cameraPosition-world));c=mix(c,mix(uHaze0,uHaze1,k),haze*0.85);gl_FragColor=vec4(max(c,vec3(0.0)),1.0);}` }));
  // Everything on the ground hangs off one root, so the terrain can rise toward the ship (lower flight in a burn).
  const root=new THREE.Group();scene.add(root);
  surface.rotation.x=-Math.PI/2;surface.position.set(0,-6,-250);root.add(surface);
  const material=(color:string,metalness=0.45)=>new THREE.MeshStandardMaterial({color,metalness,roughness:0.4});
  const make=(geo:THREE.BufferGeometry,mat:THREE.Material,count:number)=>{const m=new THREE.InstancedMesh(geo,mat,count);m.frustumCulled=false;m.count=0;root.add(m);return m;};
  // Pools tinted per instance get their colour attribute up front (white), so their shader variant exists from mount
  // (the renderer compiles everything once) instead of compiling mid-ride the first time a biome shows up.
  const tinted=(...ms:THREE.InstancedMesh[])=>{for(const m of ms)m.setColorAt(0,new THREE.Color(1,1,1));};
  // Walls are white: every instance carries its facade colour (see FACADES), so set one for each wall added.
  const walls=make(geometries.box,windowed(material('#ffffff')),4800);
  const roofs=make(geometries.box,plated(new THREE.MeshStandardMaterial({color:'#5f7c93',metalness:0.15,roughness:0.8})),4800);
  // Building roofs carry their own tint (ROOFS); `roofs` stays the untinted structural grey.
  const roofTops=make(geometries.box,plated(new THREE.MeshStandardMaterial({color:'#ffffff',metalness:0.1,roughness:0.85})),3600);
  const towers=make(geometries.box,curtain(new THREE.MeshStandardMaterial({color:'#1c3448',metalness:0.25,roughness:0.55})),500);
  // Soft drop shadows cast away from the sun (key light from -x, -z).
  const shade=make(geometries.box,new THREE.MeshBasicMaterial({color:'#000814',transparent:true,opacity:0.28,depthWrite:false}),2400);
  // Soft oval shadows for organic shapes (rocks): a flattened sphere, so no hard rectangle edges on the ground.
  const softShade=make(geometries.sphere,new THREE.MeshBasicMaterial({color:'#1c0d14',transparent:true,opacity:0.2,depthWrite:false}),1200);
  const glassMat=new THREE.MeshBasicMaterial({color:'#28c9ff'}),trimMat=new THREE.MeshBasicMaterial({color:'#ffbb42'});
  const glassBase=glassMat.color.clone(),trimBase=trimMat.color.clone(),white=new THREE.Color('#ffffff');
  const glass=make(geometries.box,glassMat,2400);
  const trim=make(geometries.box,trimMat,1400);
  const domes=make(geometries.sphere,material('#3ba5ba'),160);
  const grass=make(geometries.box,lawn(new THREE.MeshStandardMaterial({color:'#3d7a4a',metalness:0,roughness:0.95})),240);
  const paths=make(geometries.box,new THREE.MeshStandardMaterial({color:'#9aa3a8',metalness:0,roughness:0.9}),480);
  // Kit models (vertex-coloured, plated): ships, boats, barges, parked jets, deck tractors, island towers.
  const K=kit(),kitMat=()=>plated(new THREE.MeshStandardMaterial({vertexColors:true,metalness:0.45,roughness:0.45}));
  // Faceted via per-face vertex normals (non-indexed kit geometry), not flatShading: its derivative normal is NaN on
  // sub-pixel trees at the horizon, and one NaN pixel spreads through the bloom and blanks the frame.
  const trees=make(K.tree,foliage(new THREE.MeshStandardMaterial({vertexColors:true,metalness:0,roughness:0.9})),1400);
  // Canyon rock kit: strata baked into vertex colours, warped bands/streaks/dust in the shader, a seeded tint per instance.
  const rockMat=()=>strata(new THREE.MeshStandardMaterial({vertexColors:true,metalness:0,roughness:0.92}));
  const pebbles=make(K.boulderA,rockMat(),1400),boulders=make(K.boulderB,rockMat(),400),spires=make(K.spire,rockMat(),220),mesas=make(K.mesa,rockMat(),64);
  const crags=make(K.crag,rockMat(),1100),scrub=make(K.scrub,foliage(new THREE.MeshStandardMaterial({vertexColors:true,metalness:0,roughness:1})),900);
  const carriers=make(K.carrier,kitMat(),12),battleships=make(K.battleship,kitMat(),16),destroyers=make(K.destroyer,kitMat(),24);
  const boats=make(K.riverBoat,kitMat(),64),barges=make(K.barge,kitMat(),24),tractors=make(K.tractor,kitMat(),96),islands=make(K.island,windowed(new THREE.MeshStandardMaterial({vertexColors:true,metalness:0.4,roughness:0.45})),64);
  // Wakes: additive white V fans (fade baked into vertex colours) so they read as foam on any water.
  const wakes=make(K.wake,new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,opacity:0.5}),96);
  // Cloud banks: soft textured sheets drifting below the ship at several heights (altitude and speed cues).
  const cloudTex=cloudTexture(),clouds=make(new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({map:cloudTex,color:cloudTex?'#ffffff':'#000000',transparent:true,opacity:cloudTex?0.85:0,depthWrite:false,fog:true}),80);
  // Scale anchors: familiar-sized things moving on the ground (parked jets, cars, boats, ships), regular runway lights,
  // and sparse cloud wisps between the ship and the ground, so speed and altitude read correctly.
  const jets=make(K.jet,kitMat(),240);
  // Carrier flanks: deck-edge modules in seeded sequence, three island designs, deck helicopters and fuel trucks.
  const EDGE=[[K.gunSponson,10,-6],[K.radarSponson,10,-6],[K.raftRack,14,-6],[K.catwalk,16,-5],[K.edgeElevator,14,-6],[K.fuelStation,10,-6]] as const;
  const edgeMods=EDGE.map(([g])=>make(g,kitMat(),200));
  const islandsB=make(K.islandStealth,windowed(new THREE.MeshStandardMaterial({vertexColors:true,metalness:0.4,roughness:0.45})),40);
  const islandsC=make(K.islandTall,windowed(new THREE.MeshStandardMaterial({vertexColors:true,metalness:0.4,roughness:0.45})),40);
  const helis=make(K.helicopter,kitMat(),80),trucks=make(K.fuelTruck,kitMat(),80);
  // Open sea: islets with surf, lighthouses, oil platforms, buoys (fishing boats reuse the river boats).
  // Surf: the soft cloud texture on a flat plane (additive), so foam fades out instead of ending in a hard edge.
  const surfTex=cloudTexture(),surf=make(new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({map:surfTex,color:surfTex?'#ffffff':'#000000',transparent:true,opacity:surfTex?0.55:0,blending:THREE.AdditiveBlending,depthWrite:false}),160);
  // Islands (the ground shader draws coast, lagoon and beach; these stand on them) and merchant shipping.
  const hills=make(K.islandHill,new THREE.MeshStandardMaterial({vertexColors:true,metalness:0,roughness:0.95}),40),volcanos=make(K.volcano,new THREE.MeshStandardMaterial({vertexColors:true,metalness:0,roughness:0.95}),24);
  const palms=make(K.palm,foliage(new THREE.MeshStandardMaterial({vertexColors:true,metalness:0,roughness:0.9})),1100),huts=make(K.hut,new THREE.MeshStandardMaterial({vertexColors:true,metalness:0,roughness:0.9}),240);
  const sailMat=kitMat();sailMat.side=THREE.DoubleSide;
  const containers=make(K.containerShip,kitMat(),24),tankers=make(K.tanker,kitMat(),24),sails=make(K.sailboat,sailMat,90);
  // Arctic: icebergs and ice rubble, icebreakers. Lava: glowing crater embers and drifting ash/smoke banks.
  const bergs=make(K.berg,new THREE.MeshStandardMaterial({vertexColors:true,metalness:0.05,roughness:0.35}),500),icebreakers=make(K.icebreaker,kitMat(),16);
  const emberMat=new THREE.MeshBasicMaterial({color:'#ff7a1a'}),emberBase=emberMat.color.clone(),embers=make(geometries.sphere,emberMat,60);
  const ashTex=cloudTexture(),ash=make(new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({map:ashTex,color:ashTex?'#4a403c':'#000000',transparent:true,opacity:ashTex?0.6:0,depthWrite:false,fog:true}),120);
  const lights=make(K.lighthouse,kitMat(),30),rigs=make(K.oilRig,kitMat(),12),buoys=make(K.buoy,kitMat(),160);
  // Rooftops: water tanks, air-handling clusters, helipads.
  const tanks=make(K.waterTank,kitMat(),300),acs=make(K.acUnits,kitMat(),900),pads=make(K.helipad,kitMat(),60);
  const bodies=make(geometries.box,material('#2d3f5c',0.5),4000);
  const lamps=make(geometries.box,new THREE.MeshBasicMaterial({color:'#fff1c2'}),6000);
  const runway=make(geometries.box,new THREE.MeshBasicMaterial({color:'#ffffff'}),1000);
  const tails=make(geometries.box,new THREE.MeshBasicMaterial({color:'#ff3b55'}),4000);
  edgeMods.forEach((m,i)=>m.name=`edge${i}`);
  tinted(volcanos,runway,glass,jets,...edgeMods,islands,islandsB,islandsC,walls,roofTops,pebbles,boulders,spires,mesas,crags);
  for(const [k,v] of Object.entries({bergs,icebreakers,embers,ash,hills,volcanos,palms,huts,containers,tankers,sails,surf,lights,rigs,buoys,roofTops,towers,tanks,acs,pads,islandsB,islandsC,helis,trucks,shade,softShade,pebbles,boulders,spires,mesas,crags,scrub,walls,roofs,glass,trim,domes,grass,paths,trees,carriers,battleships,destroyers,boats,barges,tractors,islands,jets,bodies,lamps,tails,wakes,clouds,runway}))v.name=k;
  const pools=[bergs,icebreakers,embers,ash,hills,volcanos,palms,huts,containers,tankers,sails,surf,lights,rigs,buoys,roofTops,towers,tanks,acs,pads,...edgeMods,islandsB,islandsC,helis,trucks,shade,softShade,pebbles,boulders,spires,mesas,crags,scrub,walls,roofs,glass,trim,domes,grass,paths,trees,carriers,battleships,destroyers,boats,barges,tractors,islands,jets,bodies,lamps,tails,wakes,clouds,runway],counts=new Map<THREE.InstancedMesh,number>();
  const matrix=new THREE.Object3D(),probe=new THREE.Matrix4(),lightColor=new THREE.Color(),warm=new THREE.Color('#fff1c2');
  const setColor=(pool:THREE.InstancedMesh,c:THREE.Color)=>{const i=(counts.get(pool)??1)-1;if(i>=0)pool.setColorAt(i,c);};
  // Placement frame: tile code works in "virtual" coords (x = frame lateral, z = 34 − (frame distance − ship's frame distance)),
  // as if the frame ran straight through the ship; add() maps them through the world into the ship's local frame and
  // drops anything that belongs to the other biome.
  const F={ox:0,oz:0,h:0,s:0,T:0,dh:0,biome:0,pose:{x:0,z:0,h:0},f1:{x:0,z:0,h:0,s:0} as Frame,isNext:false};
  const vWorld=(x:number,z:number):[number,number]=>{const t=F.T+34-z-F.s,[fx,fz]=fwdOf(F.h),[rx,rz]=rightOf(F.h);return [F.ox+rx*x+fx*t,F.oz+rz*x+fz*t];};
  const wLocal=(wx:number,wz:number)=>{const dx=wx-F.pose.x,dz=wz-F.pose.z,[fx,fz]=fwdOf(F.pose.h),[rx,rz]=rightOf(F.pose.h);return [dx*rx+dz*rz,dx*fx+dz*fz];};
  const beyondNext=(wx:number,wz:number)=>{const [fx,fz]=fwdOf(F.f1.h);return (wx-F.f1.x)*fx+(wz-F.f1.z)*fz>=0;};
  const add=(pool:THREE.InstancedMesh,x:number,y:number,z:number,sx:number,sy:number,sz:number,angle=0)=>{
    const i=counts.get(pool)??0;if(i>=pool.instanceMatrix.count){dropped++;overflowed.add(pool.name);return false;}
    const [wx,wz]=vWorld(x,z);if(beyondNext(wx,wz)!==F.isNext)return false;
    const [lx,ahead]=wLocal(wx,wz);if(!inView(lx,ahead))return false;
    if(audit&&pool===walls)audit.push(Math.round(wx*10),Math.round(wz*10),Math.round(sy*10),Math.round(lx),Math.round(ahead));
    matrix.position.set(lx,y,34-ahead);matrix.rotation.set(0,angle+F.dh,0);matrix.scale.set(sx,sy,sz);matrix.updateMatrix();pool.setMatrixAt(i,matrix.matrix);counts.set(pool,i+1);return true;
  };
  /** Place at a world point (open-biome movers); `ang` is the world yaw. */
  const addW=(pool:THREE.InstancedMesh,wx:number,y:number,wz:number,sx:number,sy:number,sz:number,ang=0)=>add(pool,wx,y,F.T+34+wz,sx,sy,sz,ang);
  /** Route-aware city: blocks near the path ahead stay low so the ship never flies through a tower. */
  let routePts:number[]=[];
  const nearRoute=(wx:number,wz:number,r:number)=>{for(let i=0;i<routePts.length;i+=2){const dx=wx-routePts[i],dz=wz-routePts[i+1];if(dx*dx+dz*dz<r*r)return true;}return false;};
  const wrap=(v:number,m:number)=>((v%m)+m)%m;
  /** The camera's ground footprint: narrow under the ship, widening toward the haze (with a margin for tall objects). */
  const inView=(lx:number,ahead:number)=>ahead>-180&&ahead<1000&&Math.abs(lx)<210+Math.max(0,ahead)*0.62;
  /** Pool health for the dev page: instances dropped for lack of space (should stay 0), and the fullest pool. */
  let dropped=0,peakFill=0;const overflowed=new Set<string>(),peaks=new Map<string,number>();
  /** Dev audit (off by default): world position and height of every building drawn this frame, with its view position. */
  let audit:number[]|null=null;
  /** Drop shadow for a box of footprint w×d and height h standing at (x, z). */
  const shadow=(x:number,z:number,w:number,d:number,h:number)=>{if(h<0.5)return;const l=Math.min(14,h*0.45);add(shade,x+l*0.45,-5.96,z+l*0.55,w+l*0.35,0.02,d+l*0.6);};
  const softShadow=(x:number,z:number,w:number,d:number,h:number)=>{const l=Math.min(16,h*0.45);add(softShade,x+l*0.4,-5.97,z+l*0.5,(w+l*0.4)*0.62,0.02,(d+l*0.6)*0.62);};
  let params0:BiomeParams=biomeParams(0,1),params1:BiomeParams=params0,key='';

  /** Hull greys and jet liveries, multiplied over the kit colours. */
  const HULL_TINTS=['#ffffff','#eef2f6','#dfe6ee','#f4f0e8','#d7dee6'].map(c=>new THREE.Color(c)),JET_TINTS=['#ffffff','#c9d2dc','#9aa8b8','#e8dcc2','#b4c4d6'].map(c=>new THREE.Color(c));
  const pick=(list:THREE.Color[],u:number)=>list[Math.floor(u*list.length)];
  /** Sea rock: weathered grey-browns (multiplied over the sandstone strata). */
  const SEA_ROCK=['#6d6f74','#5f625f','#7a7568','#585c66'].map(c=>new THREE.Color(c));
  /**
   * One carrier tile: runway edge lights, parked jets and deck vehicles, and per side a seeded run of deck-edge modules
   * (gun and radar sponsons, raft racks, catwalks, elevators, fuel stations) with the odd island (three designs) and crane.
   */
  const carrierTile=(tile:number,z:number,P:BiomeParams,band:(z:number)=>number)=>{
    for(const side of [-1,1]){
      const r=mulberry(P.seed^(tile*2654435761)^(side>0?0x9e37:0)),face=side>0?0:Math.PI;
      for(let k=0;k<8;k++){const zz=z-28+k*8;if(add(runway,side*39.2,-5.7,zz,0.45,0.25,0.45))setColor(runway,lightColor.copy(warm).multiplyScalar(0.45+0.55*band(zz)));}
      // Parked jets angled toward the deck edge (wings folded), in varied liveries, with a tractor beside some.
      if(r()<0.65){const rows=2+Math.floor(r()*3),xx=side*(31+r()*3);for(let j=0;j<rows;j++){const zz=z-24+j*11+r()*2,ang=side*0.55+(r()-0.5)*0.15,tint=r();
        if(add(jets,xx,-5.95,zz,1.25,1.25,1.25,ang))setColor(jets,pick(JET_TINTS,tint));if(r()<0.3)add(tractors,xx-side*4,-5.95,zz+1,1.4,1.4,1.4,r()*3);}}
      if(r()<0.25)add(tractors,side*(8+r()*20),-5.95,z+(r()-0.5)*50,1.4,1.4,1.4,r()*6);
      if(r()<0.3)add(helis,side*(22+r()*6),-5.95,z+(r()-0.5)*44,1.3,1.3,1.3,r()*6);
      if(r()<0.2)add(trucks,side*(14+r()*14),-5.95,z+(r()-0.5)*50,1.3,1.3,1.3,(r()-0.5)*0.6+(r()<0.5?0:Math.PI));
      add(roofs,side*41.3,-5.5,z,0.9,1,64.2); // deck-edge coaming, continuous
      // Edge run: fixed draw order (the same draws whatever is in view), at most one island per tile and side.
      let zz=z-32,island=false;
      while(zz<z+30){
        const u=r(),gap=r()*3,tint=r(),cz=(len:number)=>zz+len/2;
        if(!island&&u<0.16){island=true;const kind=Math.floor(r()*3),sc=0.9+r()*0.4,c=cz(14),xx=side*(47+r()*3);
          if(add([islands,islandsB,islandsC][kind],xx,-6,c,sc,sc,sc,side>0?Math.PI:0))setColor([islands,islandsB,islandsC][kind],pick(HULL_TINTS,tint));
          softShadow(xx,c,6*sc,12*sc,14*sc);add(trim,side*42,-2.8,c,1.5,0.25,5);zz+=14+gap;continue;}
        if(u<0.2&&!island){const xx=side*(52+r()*6);add(roofs,xx,6,cz(4),1,24,1);add(roofs,xx-side*5,17,cz(4),10,0.8,0.8);zz+=4+gap;continue;} // crane
        const m=Math.floor(r()*EDGE.length),[,len,y]=EDGE[m];
        if(add(edgeMods[m],side*41.6,y,cz(len),1,1,1,face))setColor(edgeMods[m],pick(HULL_TINTS,tint));
        zz+=len+gap;
      }
    }
  };
  /** Facade colours for city walls (dusk): navy, slate, brick, sandstone, teal, charcoal, concrete cream, plum. */
  /** Roof finishes: steel blue, dark membrane, concrete, slate, gravel, green roof. */
  /** Plaza paving: pale granite, warm sandstone, cool concrete. */
  /** Park surfaces: running-track red; allotment plots (greens, tilled soil). */
  const TRACK=new THREE.Color('#9a4a3a'),PLOTS=['#4f7a3a','#6b8f45','#6a4e34','#7d6a3f','#3f6a3a'].map(c=>new THREE.Color(c));
  const PAVING=['#c9c4b6','#d2bfa0','#b5bec4'].map(c=>new THREE.Color(c));
  const ROOFS=['#5f7c93','#3a4148','#7b7f82','#47545c','#857d6c','#4c5f48'].map(c=>new THREE.Color(c));
  const FACADES=['#28486a','#3b4555','#5e3530','#7d6a52','#21515b','#25292f','#8c8576','#43344f'].map(c=>new THREE.Color(c));
  /** One city tile: blocks between the seeded street grid, a low-rise core under the play lane, a varied skyline beyond. */
  const cityTile=(tile:number,z:number,P:BiomeParams,lo:number,hi:number)=>{
    // The city fills every direction; blocks over the route stay low. Every block's content is a pure function of
    // (seed, tile, block): the same random draws in the same order whatever the distance or route, so nothing re-rolls
    // or pops as the ship approaches. Distance only drops small details (antennas, shadows far away).
    const {xs}=cityRoads(P,lo,hi);
    for(let b=0;b<xs.length-1;b++){
      const x0=xs[b]+3.2,x1=xs[b+1]-3.2,bw=x1-x0;if(bw<5)continue;
      // Seed by the street's absolute index (not its position in this frame's list), so blocks keep their buildings as
      // streets scroll in and out of range.
      const street=Math.round((xs[b]-P.u[1]-P.u[0]/2)/P.u[0]);
      const r=mulberry(P.seed^(tile*2654435761)^(street*40503)),cx=(x0+x1)/2,[bwx,bwz]=vWorld(cx,z),[blx,bah]=wLocal(bwx,bwz);
      if(!inView(blx,bah))continue;
      const core=nearRoute(bwx,bwz,42+bw/2),roll=r(),far=Math.abs(blx)>260||bah>800;
      // Parks are rare and never side by side: a block yields its park to a neighbouring block that also rolled one lower.
      const rollOf=(t:number,st:number)=>mulberry(P.seed^(t*2654435761)^(st*40503))();
      const park=roll<0.07&&!core&&![[tile-1,street],[tile+1,street],[tile,street-1],[tile,street+1]].some(([t,st])=>{const v=rollOf(t,st);return v<0.07&&v<roll;});
      if(park){
        const kind=r(),tree=(tx:number,tz:number,sc:number)=>{add(trees,tx,-5.9,tz,sc,sc*(0.9+r()*0.4),sc,r()*6);if(!far)shadow(tx,tz,sc*1.6,sc*1.6,sc*2.6);};
        const inX=(m:number)=>x0+m+r()*(bw-2*m),inZ=(m:number)=>z-29+m+r()*(58-2*m);
        add(grass,cx,-5.95,z,bw,0.1,58);
        if(kind<0.25){ // open lawn: two meandering paths and a few tree clusters
          for(let q=0;q<2;q++){const a=(r()-0.5)*1.2,off=(r()-0.5)*bw*0.4;add(paths,cx+off,-5.88,z,1.3,0.04,58/Math.cos(a)*0.95,a);}
          for(let c=0;c<3;c++){const kx=inX(5),kz=inZ(6);for(let k=0;k<4+Math.floor(r()*3);k++)tree(kx+(r()-0.5)*7,kz+(r()-0.5)*7,1.4+r()*1.2);}
        }else if(kind<0.45){ // pond park: a pond off centre, a ring path, trees around the water
          const px=cx+(r()-0.5)*bw*0.2,pz=z+(r()-0.5)*14,pr=Math.min(bw*0.3,12);
          add(paths,px,-5.9,pz,pr*2.9,0.04,pr*2.4,0);add(grass,px,-5.89,pz,pr*2.6,0.05,pr*2.1);add(domes,px,-6,pz,pr,0.15,pr*0.8);
          for(let k=0;k<10;k++){const a=k/10*Math.PI*2+r()*0.3,d=pr*(1.6+r()*0.5);tree(px+Math.cos(a)*d,pz+Math.sin(a)*d*0.8,1.3+r()*1.1);}
        }else if(kind<0.65&&bw>16){ // sports ground: running track, pitch with markings, stands
          if(add(roofTops,cx,-5.93,z,bw-4,0.06,50))setColor(roofTops,TRACK);add(grass,cx,-5.9,z,bw-9,0.06,40);
          for(const q of [-1,1]){add(paths,cx,-5.86,z+q*19.5,bw-10,0.03,0.25);add(paths,cx+q*(bw-10)/2,-5.86,z,0.25,0.03,39);add(walls,cx+q*(bw/2-1),-5,z,1.6,2,30)&&setColor(walls,FACADES[6]);}
          add(paths,cx,-5.86,z,bw-10,0.03,0.25);add(paths,cx,-5.86,z,4,0.03,4,0.785);
        }else if(kind<0.82){ // grove: dense woodland, no paths
          for(let k=0;k<26;k++)tree(inX(1.5),inZ(1.5),1.5+r()*1.6);
        }else{ // allotments: a grid of planted plots and a couple of sheds
          const cols=Math.max(2,Math.floor(bw/7)),rows=6;
          for(let i=0;i<cols;i++)for(let j=0;j<rows;j++){const v=r();if(add(roofTops,x0+(i+0.5)*bw/cols,-5.9,z-29+(j+0.5)*58/rows,bw/cols-1.4,0.12,58/rows-1.4))setColor(roofTops,PLOTS[Math.floor(v*PLOTS.length)]);}
          for(let q=0;q<2;q++)add(roofs,inX(3),-5,inZ(4),2.4,2,2);
        }
        continue;}
      if(roll>=0.07&&roll<0.1){ // plaza (its own band: blocks that yield a park become buildings, not plazas): stone paving, a fountain, a planter, corner trees and lamp posts
        const pv=r();if(add(roofTops,cx,-5.9,z,bw,0.2,56))setColor(roofTops,PAVING[Math.floor(pv*PAVING.length)]);
        add(domes,cx,-5,z,2.2,1.2,2.2);add(lamps,cx,-4.2,z,0.6,0.6,0.6);add(grass,cx,-5.7,z+14,bw*0.4,0.3,5);
        for(const qx of [-1,1])for(const qz of [-1,1]){add(trees,cx+qx*bw*0.36,-5.8,z+qz*23,1.6,1.7,1.6,qx+qz*2);add(roofs,cx+qx*bw*0.2,-3.6,z+qz*12,0.25,4.4,0.25);add(lamps,cx+qx*bw*0.2,-1.3,z+qz*12,0.6,0.35,0.6);}
        continue;}
      let zz=z-30;
      while(zz<z+28){
        // Fixed draw order per building: footprint, height (two draws), antenna, trim, gap, then shape/facade/roof draws.
        const d=Math.min(z+30-zz,8+r()*14),w=Math.max(4,Math.min(bw,6+r()*12)),x=x0+r()*(bw-w)+w/2,cz=zz+d/2;
        const hr=r(),tall=r()<0.15,lowH=1.5+r()*4,antenna=r()<0.25,trimmed=r()<0.5,gap=r()<0.3;
        const arch=r(),fc=FACADES[Math.floor(r()*FACADES.length)],roofU=r(),roofV=r(),rc=ROOFS[Math.floor(r()*ROOFS.length)];
        const h=core?lowH:8+hr*(tall?44:24),dd=d-1.5;
        // block(): walls from y0 up hh, with its roof slab; returns the roof top.
        const block=(y0:number,bw2:number,bd2:number,hh:number)=>{if(add(walls,x,y0+hh/2,cz,bw2,hh,bd2))setColor(walls,fc);if(add(roofTops,x,y0+hh+0.5,cz,bw2+0.8,0.8,bd2+0.8))setColor(roofTops,rc);return y0+hh+0.9;};
        let top=-6+h,tw=w,td=dd;
        if(core){top=block(-6,w,dd,h);if(trimmed)add(trim,x,h-5,cz,w*0.7,0.12,0.4);}
        else if(arch<0.2&&h>22){add(towers,x,-6+h/2,cz,w*0.92,h,dd*0.92);if(add(roofTops,x,-6+h+0.4,cz,w*0.92+0.4,0.8,dd*0.92+0.4))setColor(roofTops,ROOFS[1]);top=-6+h+0.8;tw=w*0.92;td=dd*0.92;}
        else if(arch<0.42&&h>18){ // setback tower: three shrinking tiers
          const h1=h*0.62,h2=h*0.26,h3=h*0.12;block(-6,w,dd,h1);block(-6+h1+0.8,w*0.72,dd*0.72,h2);top=block(-6+h1+h2+1.6,w*0.46,dd*0.46,h3);tw=w*0.46;td=dd*0.46;}
        else if(arch<0.6&&w>8&&dd>8){ // podium with a tower on it
          const ph=3+roofV*3;block(-6,w,dd,ph);top=block(-6+ph+0.8,w*0.56,dd*0.56,h);tw=w*0.56;td=dd*0.56;}
        else top=block(-6,w,dd,h);
        if(!far)shadow(x,cz,w,dd,top+6);
        // Rooftops: plant, tanks, a helipad or a garden (only near enough to see).
        if(!far&&core&&roofU<0.5){const s2=Math.min(tw,td)*0.3;add(acs,x+(roofV-0.5)*tw*0.3,top,cz,s2*0.6,1,s2*0.6,roofV*3);}
        if(!far&&!core){
          if(roofU<0.45){const s2=Math.min(tw,td)*0.32;add(acs,x+(roofV-0.5)*tw*0.3,top,cz+(roofV-0.5)*td*0.2,s2*0.6,1,s2*0.6,roofV*3);}
          else if(roofU<0.62)add(tanks,x+tw*0.22,top,cz-td*0.18,1,1,1,0);
          else if(roofU<0.7&&tw>8&&td>8)add(pads,x,top,cz,Math.min(tw,td)*0.42,1,Math.min(tw,td)*0.42,0);
          else if(roofU<0.8&&tw>7){add(grass,x,top+0.05,cz,tw*0.8,0.1,td*0.8);for(const q of [-1,1])add(trees,x+q*tw*0.22,top,cz+q*td*0.2,1.1,1.1,1.1,roofV*6);}
        }
        if(!core&&antenna&&!far){add(roofs,x,top+4,cz,0.4,8,0.4);add(lamps,x,top+8,cz,0.5,0.5,0.5);}
        zz+=d+(gap?2:0);
      }
    }
    if(P.highway&&P.highwayX>lo&&P.highwayX<hi&&!nearRoute(...vWorld(P.highwayX,z),20)){const hx=P.highwayX;add(roofs,hx,3,z,8,0.9,64);add(trim,hx-3.6,3.6,z,0.25,0.3,64);add(trim,hx+3.6,3.6,z,0.25,0.3,64);for(const k of [-20,12])if(add(walls,hx,-1.5,z+k,2.2,9,2.2))setColor(walls,FACADES[6]);}
  };
  /** Rock tints: sun-bleached, rust, ochre, mauve-grey; multiplied over the kit's strata. */
  const ROCK_TINTS=['#ffffff','#ffd7c4','#f4dcae','#e2cbd8','#ffc9b0','#ece4d6'].map(c=>new THREE.Color(c));
  /**
   * One canyon tile, from the river out: wet-bank pebbles and scrub, then boulder fields, hoodoo spires and the odd
   * mesa, then continuous craggy walls with a taller rim behind, always outside the play field. Occasional arches span
   * the river; outposts sit on the banks.
   */
  const canyonTile=(tile:number,z:number,P:BiomeParams,scroll:number)=>{
    const r=mulberry(P.seed^(tile*2654435761)),travel=scroll+160-z,cx=riverX(travel,P),w=riverW(travel,P);
    const rock=(pool:THREE.InstancedMesh,x:number,zz:number,sx:number,sy:number,sz:number,ang:number,tint:number)=>{if(add(pool,x,-6,zz,sx,sy,sz,ang))setColor(pool,ROCK_TINTS[Math.floor(tint*ROCK_TINTS.length)]);};
    for(const side of [-1,1]){
      // Fixed draw order per side (counts never depend on what is in view), so nothing re-rolls as tiles scroll in.
      for(let j=0;j<10;j++){const off=w+2.5+r()*26,s=0.7+r()*r()*3.2;rock(pebbles,cx+side*off,z-32+r()*64,s*(1+r()*0.7),s*(0.5+r()*0.7),s*(1+r()*0.7),r()*6,r());}
      for(let j=0;j<8;j++){const off=w+4+r()*48,s=1.1+r()*1.8;add(scrub,cx+side*off,-6,z-32+r()*64,s,s*(0.7+r()*0.5),s,r()*6);}
      const nb=2+Math.floor(r()*4);
      for(let j=0;j<nb;j++){const off=w+20+r()*36,wd=5+r()*11,h=3+r()*(off>40?16:8),zz=z-30+r()*60;rock(boulders,cx+side*off,zz,wd,h,wd*(0.8+r()*0.6),r()*6,r());if(wd>8)softShadow(cx+side*off,zz,wd,wd,h);}
      if(r()<0.4){const n=1+Math.floor(r()*3),off=w+18+r()*34,zz=z-24+r()*48;
        for(let k=0;k<n;k++){const sc=3+r()*2,h=0.75+r()*0.6,xx=cx+side*(off+k*4.5*(r()-0.3)),z2=zz+(r()-0.5)*10;rock(spires,xx,z2,sc,sc*h,sc,r()*6,r());softShadow(xx,z2,sc*1.2,sc*1.2,sc*h*4);}}
      if(r()<0.16){const xx=cx+side*(w+44+r()*26),zz=z-10+r()*20,sc=10+r()*8,h=10+r()*14;rock(mesas,xx,zz,sc,h,sc*(0.8+r()*0.4),r()*6,r());softShadow(xx,zz,sc*1.8,sc*1.6,h);}
      // Walls: a row of crags, never inside the play field (|x| ≥ 64), with a taller rim row behind.
      const wallX=Math.max(64,side*cx+w+48);
      for(let k=0;k<5;k++){const zz=z-32+k*13+r()*3,wd=12+r()*12,dp=15+r()*7,h=12+r()*22,xx=side*(wallX+r()*6);rock(crags,xx,zz,wd,h,dp,(r()-0.5)*0.5,r());softShadow(xx,zz,wd,dp,h);}
      for(let k=0;k<3;k++){const zz=z-30+k*22+r()*4,wd=18+r()*14,dp=22+r()*8,h=26+r()*26,xx=side*(wallX+20+r()*14);rock(crags,xx,zz,wd,h,dp,(r()-0.5)*0.4,r());}
      if(r()<0.12){const xx=cx+side*(w+16);add(roofs,xx,-1,z,14,2,18);add(domes,xx,1,z,5,3,5);add(glass,xx,2,z,10,0.3,1);} // outpost
    }
    // Arch over the river: two crag legs and a craggy span.
    if(r()<0.1){const span=w*2+10;for(const sd of [-1,1])rock(crags,cx+sd*(w+6),z,9,20,9,r()*0.3,r());const tint=r();if(add(crags,cx,8,z,span+12,7,9,0))setColor(crags,ROCK_TINTS[Math.floor(tint*ROCK_TINTS.length)]);}
  };
  /** Basalt, obsidian and scoria tints (multiplied over the kit's strata colours). */
  const LAVA_ROCK=['#2a2220','#211c1b','#30241f','#262120'].map(c=>new THREE.Color(c));
  /**
   * One lava-field tile (the molten river follows the canyon's river shape): basalt boulders by the banks, obsidian
   * spire clusters, ash cones with glowing craters under drifting smoke, and dark cliff walls outside the play field.
   */
  const lavaTile=(tile:number,z:number,P:BiomeParams,scroll:number)=>{
    const r=mulberry(P.seed^(tile*2654435761)^0x1a7a),travel=scroll+160-z,cx=riverX(travel,P),w=8.5+3*Math.sin(travel*0.013+P.u[1]);
    const rock=(pool:THREE.InstancedMesh,x:number,zz:number,sx:number,sy:number,sz:number,ang:number,t:number)=>{if(add(pool,x,-6,zz,sx,sy,sz,ang))setColor(pool,pick(LAVA_ROCK,t));};
    for(const side of [-1,1]){
      for(let j=0;j<7;j++){const off=w+3+r()*30,sc=0.8+r()*r()*3;rock(pebbles,cx+side*off,z-32+r()*64,sc*(1+r()*0.6),sc*(0.5+r()*0.6),sc*(1+r()*0.6),r()*6,r());}
      if(r()<0.45){const n=1+Math.floor(r()*3),off=w+16+r()*36,zz=z-24+r()*48;for(let k=0;k<n;k++){const sc=2.4+r()*1.6,h=0.9+r()*0.8,xx=cx+side*(off+k*4*(r()-0.3));rock(spires,xx,zz+(r()-0.5)*10,sc,sc*h,sc,r()*6,r());}}
      if(r()<0.2){ // ash cone: glowing crater, smoke drifting downwind
        const xx=cx+side*(w+42+r()*24),zz=z+(r()-0.5)*30,sc=14+r()*10,h=12+r()*10;rock(volcanos,xx,zz,sc,h,sc,r()*6,r());
        add(embers,xx,-6+h*0.92,zz,sc*0.12,0.5,sc*0.12);for(let q=0;q<3;q++)add(ash,xx+(r()-0.5)*6,-6+h+4+q*5,zz-q*4,22+q*9,1,16+q*7,r()*3);softShadow(xx,zz,sc*1.6,sc*1.6,h);}
      const wallX=Math.max(64,side*cx+w+46);
      for(let k=0;k<5;k++){const zz=z-32+k*13+r()*3,wd=12+r()*12,dp=15+r()*7,h=10+r()*18,xx=side*(wallX+r()*6);rock(crags,xx,zz,wd,h,dp,(r()-0.5)*0.5,r());softShadow(xx,zz,wd,dp,h);}
      for(let k=0;k<3;k++){const zz=z-30+k*22+r()*4,wd=18+r()*14,dp=22+r()*8,h=22+r()*22,xx=side*(wallX+20+r()*14);rock(crags,xx,zz,wd,h,dp,(r()-0.5)*0.4,r());}
    }
  };
  const riverW=(travel:number,P:BiomeParams)=>11.5+4*Math.sin(travel*0.011+P.a);
  return {
    /**
     * `since` = seconds since the last bar line: each bar line sends a light wave from the horizon toward the camera,
     * chasing runway lights, sweeping window strips and rippling water. `env` places the next biome along the route.
     * `ground` = ground-unit positions (they ride barges at sea).
     */
    update(time:number,_intensity:number,_color:string,beat=0,bar=0,since=9,env?:BiomeEnv,ground:Array<{x:number;z:number}>=[],music?:{beatIndex:number;bands:[number,number,number]}){
      // Window lights: beat count for the flicker; band levels with a quick rise and a slower fall, like a VU meter.
      if(music){const m=sceneryMusic.value;m.x=music.beatIndex;const fall=(c:number,v:number)=>v>c?c+(v-c)*0.5:c+(v-c)*0.08;m.y=fall(m.y,music.bands[0]);m.z=fall(m.z,music.bands[1]);m.w=fall(m.w,music.bands[2]);}
      uniforms.time.value=time;uniforms.pulse.value=bar*0.8+beat*0.2;
      const waveZ=-620+since*1300,waveFade=Math.exp(-since*1.4);uniforms.wave.value=waveZ;uniforms.waveFade.value=waveFade;sceneryWave.value.set(waveZ,waveFade);
      const band=(z:number)=>Math.exp(-Math.abs(z-waveZ)/16)*waveFade;
      const e:BiomeEnv=env??{pose:{x:0,z:0,h:0},f0:{x:0,z:0,h:0,s:126,biome:0,seed:1},f1:{x:0,z:-1e7,h:0,s:1e7,biome:0,seed:1},routeAhead:[]};
      const k=`${e.f0.biome}:${e.f0.seed}:${e.f1.biome}:${e.f1.seed}`;
      if(k!==key){key=k;params0=biomeParams(e.f0.biome,e.f0.seed);params1=biomeParams(e.f1.biome,e.f1.seed);}
      uniforms.uB0.value=e.f0.biome;uniforms.uB1.value=e.f1.biome;
      uniforms.uPose.value.set(e.pose.x,e.pose.z,e.pose.h,0);uniforms.uF0.value.set(e.f0.x,e.f0.z,e.f0.h,e.f0.s);uniforms.uF1.value.set(e.f1.x,e.f1.z,e.f1.h,e.f1.s);
      uniforms.uHaze0.value.set(HAZE[e.f0.biome]??HAZE[0]);uniforms.uHaze1.value.set(HAZE[e.f1.biome]??HAZE[0]);
      uniforms.uP0.value.set(params0.u[0],params0.u[1],params0.u[2],params0.u[3]);uniforms.uP1.value.set(params1.u[0],params1.u[1],params1.u[2],params1.u[3]);
      glassMat.color.copy(glassBase).lerp(white,bar*0.12+beat*0.03);emberMat.color.copy(emberBase).multiplyScalar(0.85+0.3*beat);trimMat.color.copy(trimBase).lerp(white,bar*0.12);counts.clear();
      routePts=e.routeAhead;F.pose=e.pose;F.f1=e.f1;sceneryPose.value.set(e.pose.x,e.pose.z,e.pose.h);
      // Object fog follows the biome under the ship.
      F.isNext=true;fogTarget.set(HAZE[beyondNext(e.pose.x,e.pose.z)?e.f1.biome:e.f0.biome]??HAZE[0]);(scene.fog as THREE.Fog).color.lerp(fogTarget,0.02);
      // Visible region in the ship's frame (lateral, ahead) → world corners, for tile ranges.
      const corners=[[-650,-220],[650,-220],[-650,1150],[650,1150]].map(([lx,ah])=>{const [fx,fz]=fwdOf(e.pose.h),[rx,rz]=rightOf(e.pose.h);return [e.pose.x+rx*lx+fx*ah,e.pose.z+rz*lx+fz*ah];});
      let seaSet=false;
      for(const [frame,P,isNext] of [[e.f0,params0,false],[e.f1,params1,true]] as const){
        const b=frame.biome,iso=ISO(b);
        // Open biomes are laid out on world axes; straight ones along their frame from its origin.
        if(iso){F.ox=0;F.oz=0;F.h=0;F.s=0;}else{F.ox=frame.x;F.oz=frame.z;F.h=frame.h;F.s=frame.s;}
        F.isNext=isNext;F.biome=b;F.dh=F.h-e.pose.h;
        { const [fx,fz]=fwdOf(F.h),dx=e.pose.x-F.ox,dz=e.pose.z-F.oz;F.T=dx*fx+dz*fz+F.s; }
        // Frame-coordinate bounds of the visible region.
        let lo=1e9,hi=-1e9,tlo=1e9,thi=-1e9;
        for(const [wx,wz] of corners){const [fx,fz]=fwdOf(F.h),[rx,rz]=rightOf(F.h),dx=wx-F.ox,dz=wz-F.oz,lat=dx*rx+dz*rz,tr=dx*fx+dz*fz+F.s;lo=Math.min(lo,lat);hi=Math.max(hi,lat);tlo=Math.min(tlo,tr);thi=Math.max(thi,tr);}
        if(!iso){tlo=Math.max(tlo,F.T-200);thi=Math.min(thi,F.T+1150);}
        const scroll=F.T-126,zAt=(travel:number)=>F.T+34-travel,anchored=(at:number,span:number)=>scroll-10+wrap(at-scroll+10,span);
        for(let tile=Math.floor(tlo/64);tile<=Math.ceil(thi/64);tile++){
          const z=F.T+34-tile*64;
          if(b===0)carrierTile(tile,z,P,band);else if(b===1)cityTile(tile,z,P,lo,hi);else if(b===2)canyonTile(tile,z,P,scroll);else if(b===5)lavaTile(tile,z,P,scroll);
        }
        if(b===1){
          // Traffic on both street directions: indexed cars on continuous lanes (never wrap in view).
          const {xs}=cityRoads(P,lo,hi);
          for(const road of xs)for(const dir of [-1,1]){const lane=road+dir*1.4,v=dir*9,base=(road*37+P.seed)%43;
            for(let c=Math.floor((tlo-base-v*time)/43);c<=Math.ceil((thi-base-v*time)/43);c++){if(Math.abs(c*7919+road)%3===0)continue;const tr=base+c*43+v*time,zz=zAt(tr);
              add(bodies,lane,-5.4,zz,1.3,0.8,2.6);add(lamps,lane,-5.2,zz-dir*1.4,1,0.25,0.15);add(tails,lane,-5.2,zz+dir*1.4,1,0.25,0.15);}}
          const [sy,oy]=[P.u[2],P.u[3]];
          for(let m=Math.floor((tlo-oy)/sy);m<=Math.ceil((thi-oy)/sy);m++){const tr=oy+sy/2+m*sy;for(const dir of [-1,1]){const v=dir*9,base=(m*29+P.seed)%47;
            for(let c=Math.floor((lo-base-v*time)/47);c<=Math.ceil((hi-base-v*time)/47);c++){if(Math.abs(c*104729+m)%3===0)continue;const x=base+c*47+v*time,zz=zAt(tr+dir*1.6);
              add(bodies,x,-5.4,zz,2.6,0.8,1.3);add(lamps,x+dir*1.4,-5.2,zz,0.15,0.25,1);add(tails,x-dir*1.4,-5.2,zz,0.15,0.25,1);}}}
          if(P.highway)for(const dir of [-1,1]){const v=dir*16;for(let c=Math.floor((tlo-v*time)/51);c<=Math.ceil((thi-v*time)/51);c++){const tr=c*51+v*time+(dir>0?20:0),zz=zAt(tr),lane=P.highwayX+dir*1.8;
            add(bodies,lane,4,zz,1.3,0.8,2.6);add(lamps,lane,4.2,zz-dir*1.4,1,0.25,0.15);add(tails,lane,4.2,zz+dir*1.4,1,0.25,0.15);}}
        }
        if(b===2)for(let c=0;c<8;c++){
          // Boats on the river, each with a white wake.
          const travel=anchored(c*128+P.seed%211-time*5,1024),zz=zAt(travel),xr=riverX(travel,P)+(c%2?3:-3);
          add(boats,xr,-6,zz,1.3,1.3,1.3,c%3?0:Math.PI);add(wakes,xr,-5.9,zz+(c%3?3.5:-3.5),3.2,1,c%3?7:-7);}
        if(b===4){
          // Arctic: world-anchored icebergs (ringed with surf), ice rubble, the odd research station, low fog wisps.
          let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;for(const [wx,wz] of corners){x0=Math.min(x0,wx);x1=Math.max(x1,wx);z0=Math.min(z0,wz);z1=Math.max(z1,wz);}
          const C=150;
          for(let i=Math.floor(x0/C);i<=Math.ceil(x1/C);i++)for(let j=Math.floor(z0/C);j<=Math.ceil(z1/C);j++){
            const r=mulberry(P.seed^Math.imul(i,0x2c1b3c6d)^Math.imul(j,0x297a2d39)^0xa4c7),cx=(i+0.15+r()*0.7)*C,cz=(j+0.15+r()*0.7)*C,k=r(),near=nearRoute(cx,cz,40);
            if(k<0.22){const sc=8+r()*16,h=near?3+r()*3:5+r()*14;addW(bergs,cx,-6.5,cz,sc,h,sc*(0.7+r()*0.6),r()*6);addW(surf,cx,-5.95,cz,sc*2.6,1,sc*2.4,r()*3);addW(softShade,cx+h*0.3,-5.97,cz+h*0.35,sc*0.9,0.02,sc*0.9);}
            else if(k<0.5){const n=5+Math.floor(r()*6);for(let q=0;q<n;q++){const sc=1+r()*2.5;addW(bergs,cx+(r()-0.5)*34,-6.2,cz+(r()-0.5)*34,sc,sc*(0.4+r()*0.5),sc,r()*6);}}
            else if(k<0.53&&!near){ // research station: domes, huts, a radio mast with a light
              for(let q=0;q<3;q++)addW(domes,cx+q*7,-6,cz+(q%2)*5,3,2.4,3);for(let q=0;q<2;q++)addW(roofs,cx-6,-4.8,cz+q*7,5,2.4,4);addW(roofs,cx+18,3,cz,0.4,18,0.4);addW(lamps,cx+18,12,cz,0.7,0.7,0.7);}
            if(r()<0.15)addW(clouds,cx,-2+r()*3,cz,40+r()*30,1,30+r()*20,r()*3);
          }
          // Icebreakers plough steady lanes through the pack, leaving a wake.
          const ang=(P.seed%628)/100,dx=-Math.sin(ang),dz=-Math.cos(ang),nx=-dz,nz=dx,spacing=220,gap=420,speed=3;
          let j0=1e9,j1=-1e9,u0=1e9,u1=-1e9;for(const [wx,wz] of corners){const o=wx*nx+wz*nz,u=wx*dx+wz*dz;j0=Math.min(j0,o);j1=Math.max(j1,o);u0=Math.min(u0,u);u1=Math.max(u1,u);}
          for(let j=Math.floor(j0/spacing);j<=Math.ceil(j1/spacing);j++)for(let kk=Math.floor((u0-speed*time)/gap)-1;kk<=Math.ceil((u1-speed*time)/gap);kk++){
            const r=mulberry(P.seed^(j*7919)^(kk*104729)^0x1ce);if(r()<0.5)continue;
            const u=kk*gap+r()*gap*0.5+speed*time,o=j*spacing+(r()-0.5)*60,wx=dx*u+nx*o,wz=dz*u+nz*o;if(nearRoute(wx,wz,20))continue;
            const yaw=Math.atan2(-dx,-dz);addW(icebreakers,wx,-6,wz,1,1,1,yaw);addW(shade,wx+4,-5.96,wz+5,10,0.02,40,yaw);addW(wakes,wx-dx*17,-5.9,wz-dz*17,9,1,20,yaw);
          }
        }
        // Islands in view (shared with the ground shader through uIsl, nearest 16 to the ship).
        let isl:SeaIsland[]=[];
        if(b===3){let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;for(const [wx,wz] of corners){x0=Math.min(x0,wx);x1=Math.max(x1,wx);z0=Math.min(z0,wz);z1=Math.max(z1,wz);}
          isl=seaIslands(P.seed,x0,x1,z0,z1).sort((a,c)=>Math.hypot(a.x-e.pose.x,a.z-e.pose.z)-Math.hypot(c.x-e.pose.x,c.z-e.pose.z)).slice(0,16);
          uniforms.uIsl.value.forEach((v,i)=>{const I=isl[i];if(I)v.set(I.x,-I.z,I.r,I.kind);else v.set(0,0,0,0);});seaSet=true;}
        const onIsland=(wx:number,wz:number,pad:number)=>isl.some(I=>Math.hypot(wx-I.x,wz-I.z)<I.r+pad);
        if(b===3)for(const fam of [0,1,2]){
          // The fleet sails world lanes (two warship headings and a merchant lane per seed); ships are indexed along lanes
          // so none wraps in view, and none sails through an island.
          const merchant=fam===2,ang=(P.seed%628)/100+fam*2.1,dx=-Math.sin(ang),dz=-Math.cos(ang),nx=-dz,nz=dx,spacing=merchant?150:170,gap=merchant?300:360,speed=merchant?4.8:3.5+fam;
          let j0=1e9,j1=-1e9,u0=1e9,u1=-1e9;for(const [wx,wz] of corners){const o=wx*nx+wz*nz,u=wx*dx+wz*dz;j0=Math.min(j0,o);j1=Math.max(j1,o);u0=Math.min(u0,u);u1=Math.max(u1,u);}
          for(let j=Math.floor(j0/spacing);j<=Math.ceil(j1/spacing);j++)for(let kk=Math.floor((u0-speed*time)/gap)-1;kk<=Math.ceil((u1-speed*time)/gap);kk++){
            const r=mulberry(P.seed^(j*7919)^(kk*104729)^(fam*31));if(r()<(merchant?0.3:0.35))continue;
            const u0k=r(),kind=merchant?(u0k<0.45?3:u0k<0.8?4:5):(u0k<0.18?0:r()<0.5?1:2),len=[70,48,28,62,66,9][kind],beam=[12,8.5,4.6,10.5,11,2.6][kind];
            const u=kk*gap+r()*gap*0.5+speed*time,o=j*spacing+(r()-0.5)*60,wx=dx*u+nx*o,wz=dz*u+nz*o;
            if(nearRoute(wx,wz,kind===0?28:kind===5?10:16)||onIsland(wx,wz,len*0.6))continue;
            const yaw=Math.atan2(-dx,-dz),pool=[carriers,battleships,destroyers,containers,tankers,sails][kind];
            addW(pool,wx,-6,wz,1,1,1,yaw);addW(shade,wx+4,-5.96,wz+5,beam+2,0.02,len+3,yaw); // shadow turns with the hull
            addW(wakes,wx-dx*len*0.45,-5.9,wz-dz*len*0.45,beam*1.1,1,len*0.45,yaw);
            if(kind===0)for(let q=0;q<5;q++){const a=-20+q*7;addW(jets,wx+dx*a+nx*((q%2)*3-2),-1.5,wz+dz*a+nz*((q%2)*3-2),1.1,1.1,1.1,yaw+0.6);}
          }
        }
        if(b===0)for(let w=0;w<40;w++){
          // Cloud banks below the ship over the cloud sea, at three heights for parallax; a few drift over the deck.
          const travel=anchored(w*67+(w%3)*23,1400),zz=zAt(travel)+time*(w%3)*1.5,layer=w%3,xx=(w%2?1:-1)*(w%7===0?10+(w*13)%25:50+(w*29)%90),size=26+(w*17)%22;
          add(clouds,xx,-3.5+layer*3.2,zz,size*1.6,1,size,(w*0.37)%3.14);
        }
        if(b===3)for(const I of isl){
          // Island scenery (matches the shader's coast: land reaches at least 0.8 r; atoll rings 0.66–0.9 r).
          const R=mulberry(I.seed),near=nearRoute(I.x,I.z,I.r+25),ring=I.kind===1?I.r*0.78:I.r*0.62;
          if(I.kind===0)addW(hills,I.x,-6.3,I.z,I.r*0.6,Math.min(near?4:28,I.r*(0.16+R()*0.14)),I.r*0.58,R()*6);
          if(I.kind===2){if(near)addW(hills,I.x,-6.3,I.z,I.r*0.55,4,I.r*0.55,R()*6);else addW(volcanos,I.x,-6.3,I.z,I.r*0.66,Math.min(48,I.r*(0.42+R()*0.12)),I.r*0.66,R()*6);}
          const np=Math.min(40,Math.floor(I.r/2.6));
          for(let k=0;k<np;k++){const a=R()*6.283,d=I.kind===1?ring+(R()-0.5)*I.r*0.14:ring+R()*I.r*0.14,sc=1.1+R()*0.7;addW(palms,I.x+Math.cos(a)*d,-6,I.z+Math.sin(a)*d,sc,sc*(0.9+R()*0.3),sc,R()*6);}
          if(I.kind!==2&&R()<0.65){ // a village by the shore with a jetty and moored boats
            const a=R()*6.283,nh=3+Math.floor(R()*4);
            for(let k=0;k<nh;k++){const aa=a+(k-nh/2)*0.09,d=(I.kind===1?ring:I.r*0.7)+(R()-0.5)*4;addW(huts,I.x+Math.cos(aa)*d,-6,I.z+Math.sin(aa)*d,1,1,1,-aa);}
            const jx=I.x+Math.cos(a)*I.r*0.86,jz=I.z+Math.sin(a)*I.r*0.86;addW(roofs,jx+Math.cos(a)*7,-5.6,jz+Math.sin(a)*7,1.6,0.3,16,Math.PI/2-a);
            for(let k=0;k<2;k++)addW(boats,jx+Math.cos(a)*(9+k*4)+Math.sin(a)*2.5*(k?1:-1),-6,jz+Math.sin(a)*(9+k*4)-Math.cos(a)*2.5*(k?1:-1),1.4,1.4,1.4,-a);
          }
          if(I.kind!==1&&R()<0.3){const a=R()*6.283,d=I.r*0.74;addW(lights,I.x+Math.cos(a)*d,-6,I.z+Math.sin(a)*d,0.9,0.9,0.9,R()*6);}
          // Sailboats cruise slowly around the island.
          const ns=R()<0.6?1+Math.floor(R()*3):0;
          for(let k=0;k<ns;k++){const dir=k%2?1:-1,a=R()*6.283+dir*time*0.012,d=I.r*1.3+R()*40;addW(sails,I.x+Math.cos(a)*d,-6,I.z+Math.sin(a)*d,1,1,1,-a+(dir>0?0:Math.PI));}
        }
        if(b===3){
          // World-anchored sea features on a 200-unit grid, seeded per cell, kept off the route ahead.
          let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;for(const [wx,wz] of corners){x0=Math.min(x0,wx);x1=Math.max(x1,wx);z0=Math.min(z0,wz);z1=Math.max(z1,wz);}
          const C=200;
          for(let i=Math.floor(x0/C);i<=Math.ceil(x1/C);i++)for(let j=Math.floor(z0/C);j<=Math.ceil(z1/C);j++){
            const r=mulberry(P.seed^Math.imul(i,73856093)^Math.imul(j,19349663)^0x0cea),cx=(i+0.2+r()*0.6)*C,cz=(j+0.2+r()*0.6)*C,kind=r();
            if(nearRoute(cx,cz,kind<0.08?70:50)||onIsland(cx,cz,40))continue;
            if(kind<0.08){addW(rigs,cx,-6,cz,1,1,1,r()*6);addW(softShade,cx+8,-5.97,cz+9,18,0.02,18);addW(surf,cx,-5.95,cz,40,1,40);}
            else if(kind<0.2){ // islet: a main rock and its scattered stacks, ringed with surf; sometimes a lighthouse
              const n=3+Math.floor(r()*4),big=6+r()*10;let mainH=0;
              for(let k=0;k<n;k++){const ox=k?(r()-0.5)*big*1.8:0,oz=k?(r()-0.5)*big*1.8:0,sc=big*(k?0.25+r()*0.4:0.9),h=sc*(0.5+r()*0.6),tint=r(),pool=k?pebbles:boulders;if(!k)mainH=h;
                if(addW(pool,cx+ox,-6.9,cz+oz,sc,h,sc*(0.8+r()*0.4),r()*6))setColor(pool,pick(SEA_ROCK,tint));}
              addW(surf,cx,-5.94,cz,big*3.8,1,big*3.4,r()*3);
              if(r()<0.3)addW(lights,cx,-6.9+mainH*1.2,cz,0.9,0.9,0.9,r()*6);
            }
            if(r()<0.5)for(const q of [-1,1])addW(buoys,cx+q*14,-6,cz+q*6,1.2,1.2,1.2,0);
            // Fishing boats work slowly back and forth, each with a small wake.
            const nb=r()<0.4?1+Math.floor(r()*2):0;
            for(let k=0;k<nb;k++){const hd=r()*6.28,ph=r()*6.28,along=40+k*18+22*Math.sin(time*0.03+ph),bx=cx+Math.cos(hd)*along,bz=cz+Math.sin(hd)*along,yaw=Math.atan2(-Math.cos(hd),-Math.sin(hd))+(Math.cos(time*0.03+ph)<0?Math.PI:0);
              addW(boats,bx,-6,bz,1.6,1.6,1.6,yaw);}
          }
        }
        // Ground units ride barges at sea (they are world-anchored; drawn at their local position).
        if(b===3)for(const g of ground){const [fx,fz]=fwdOf(e.pose.h),[rx,rz]=rightOf(e.pose.h),ah=34-g.z,wx=e.pose.x+rx*g.x+fx*ah,wz=e.pose.z+rz*g.x+fz*ah;
          addW(barges,wx,-6,wz,1,1,1,0);addW(wakes,wx,-5.9,wz+6.5,5,1,3,0);}
      }
      if(!seaSet)for(const v of uniforms.uIsl.value)v.set(0,0,0,0);
      // Window strips brighten as the wave passes them.
      for(let i=0;i<(counts.get(glass)??0);i++){glass.getMatrixAt(i,probe);glass.setColorAt(i,lightColor.setScalar(0.6+0.25*band(probe.elements[14]))); /* stays ≤ 1: the wave reads without blooming */}
      for(const pool of [runway,glass])if(pool.instanceColor)pool.instanceColor.needsUpdate=true;
      for(const pool of pools){pool.count=counts.get(pool)??0;pool.instanceMatrix.needsUpdate=true;peakFill=Math.max(peakFill,pool.count/pool.instanceMatrix.count);peaks.set(pool.name,Math.max(peaks.get(pool.name)??0,pool.count));}
    },
    stats(){return {dropped,peakFill:Math.round(peakFill*100)/100,overflowed:[...overflowed].join(','),peaks:[...peaks].filter(([,v])=>v>100).map(([k,v])=>k+':'+v).join(' ')};},
    auditBuildings(on:boolean){const out=audit;audit=on?[]:null;return out;},
    /** Raise the whole terrain by `y` (the ship flies lower). */
    setLift(y:number){root.position.y=y;},
    dispose(){for(const pool of pools)pool.dispose();},
  };
}
