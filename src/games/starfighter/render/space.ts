import * as THREE from 'three';
const vertex = `varying vec2 vUv; varying vec3 vNormal; varying vec3 vEye;
void main(){vUv=uv;vec4 p=modelViewMatrix*vec4(position,1.0);vEye=normalize(-p.xyz);vNormal=normalize(normalMatrix*normal);gl_Position=projectionMatrix*p;}`;
const noise = `float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float cloud(vec2 p){return noise(p)*0.55+noise(p*2.03)*0.28+noise(p*4.07)*0.12+noise(p*8.11)*0.05;}`;
export function createSpace(scene: THREE.Scene) {
  const uniforms = { time: { value: 0 }, intensity: { value: 0.5 }, tint: { value: new THREE.Color('#335e8f') } };
  const nebula = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.ShaderMaterial({
    uniforms, vertexShader: vertex, depthWrite: false,
    fragmentShader: `varying vec2 vUv; uniform float time,intensity; uniform vec3 tint; ${noise}
    void main(){vec2 p=vUv*7.0+vec2(time*0.002,0);float n=cloud(p+cloud(p*0.6)*2.0);float filaments=pow(max(0.0,1.0-abs(n-0.57)*5.0),3.0);vec3 base=mix(vec3(0.008,0.014,0.035),tint*0.24,n*n);vec3 c=base+mix(tint,vec3(0.23,0.07,0.25),vUv.x)*filaments*0.13*(0.7+intensity*0.3);gl_FragColor=vec4(c,1.0);}`,
  }));
  nebula.rotation.x = -Math.PI / 2; nebula.position.set(0, -50, -30); nebula.renderOrder = -10; scene.add(nebula);
  const planet = new THREE.Mesh(new THREE.SphereGeometry(15, 40, 28), new THREE.ShaderMaterial({
    uniforms, vertexShader: vertex,
    fragmentShader: `varying vec2 vUv;varying vec3 vNormal,vEye;uniform float time;${noise}
    void main(){vec3 n=normalize(vNormal);float light=max(0.0,dot(n,normalize(vec3(-0.5,0.55,1.0))));float terrain=cloud(vUv*vec2(18.0,10.0));vec3 sea=vec3(0.035,0.11,0.19),land=vec3(0.11,0.22,0.23);vec3 surface=mix(sea,land,smoothstep(0.52,0.62,terrain));float clouds=smoothstep(0.58,0.73,cloud(vUv*vec2(12.0,8.0)+vec2(time*0.0003,0)));surface=mix(surface,vec3(0.5,0.6,0.67),clouds*0.65);float rim=pow(1.0-max(0.0,dot(n,normalize(vEye))),3.0);gl_FragColor=vec4(surface*(0.12+light*1.4)+vec3(0.07,0.18,0.3)*rim,1.0);}`,
  }));
  planet.position.set(42, -29, -28); scene.add(planet);
  return { update(time: number, intensity: number, color: string) { uniforms.time.value = time; uniforms.intensity.value = intensity; uniforms.tint.value.set(color); planet.rotation.y = time * 0.005; } };
}
